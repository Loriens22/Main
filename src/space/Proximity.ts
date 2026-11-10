import * as THREE from 'three';
import type { AutopilotProgram, AutopilotResult } from '../vehicles/FlightControl';
import type { Spacecraft, FlightEnv } from '../vehicles/Spacecraft';
import { lambert, propagate, type V3 } from './kepler';
import { MU_EARTH, R_EARTH, orbitSummary } from './earthFrame';

/** What the orbital programs need from the zone (all vectors in the zone's inertial frame, metres). */
export interface ProxHost {
  now(): number;
  /** Endurance centre-of-mass state at Earth time t */
  targetState(t: number): { r: V3; v: V3 };
  /** rendezvous aim point offset from the Endurance centre at time t (e.g. a hold point behind the dock port) */
  aimOffset(t: number): V3;
  /**
   * Goal pose of the craft root when its dock port is `d` metres out along the target port axis.
   * spin = follow the target's spin (roll), rollPhase = latch phase offset (rad).
   */
  dockGoal(craft: Spacecraft, d: number, spin: boolean, rollPhase: number): DockGoal;
  /** Current port-to-port geometry. */
  portRelation(craft: Spacecraft): PortRelation;
  /** Hard capture: latch the craft. */
  capture(craft: Spacecraft): void;
  say(who: string, text: string): void;
}

export interface DockGoal {
  pos: V3; // craft root position for this goal
  vel: V3; // velocity of the goal point
  quat: THREE.Quaternion; // craft attitude for this goal
  w: THREE.Vector3; // angular velocity of the goal attitude (world)
  axis: THREE.Vector3; // target port axis (outward, world)
}

export interface PortRelation {
  dist: number; // port-to-port distance
  axial: number; // distance along the target axis (positive = outside)
  lateral: number;
  closing: number; // m/s, positive = approaching
  relVel: THREE.Vector3; // craft port velocity relative to target port
  alignErr: number; // deg between port axes (0 = opposed perfectly)
  rollErr: number; // deg (mod latch symmetry)
  rateErr: number; // rad/s difference in spin about the axis
}

// conversions between the three ECI frame (+Y north) and the classic one (+Z north) used by the Lambert solver
const toStd = (v: V3): V3 => [v[0], -v[2], v[1]];
const fromStd = (v: V3): V3 => [v[0], v[2], -v[1]];
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vlen = (a: V3) => Math.hypot(a[0], a[1], a[2]);

function lambertECI(r1: V3, r2: V3, tof: number) {
  const s = lambert(toStd(r1), toStd(r2), tof, MU_EARTH, true);
  return s ? { v1: fromStd(s.v1), v2: fromStd(s.v2) } : null;
}

/** −Z along dir, +Y as close as possible to up. */
function lookQuat(dir: THREE.Vector3, up: THREE.Vector3) {
  let u = up.clone();
  if (Math.abs(u.clone().normalize().dot(dir.clone().normalize())) > 0.98) u = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.clone().normalize(), u)).normalize();
}

const fmtT = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 90 ? `${Math.floor(s / 60)} min ${Math.floor(s % 60)} s` : `${Math.max(0, s).toFixed(0)} s`);

/** Shared impulsive-burn executor: orient along Δv, then burn to a target inertial velocity. */
class BurnExec {
  /** required velocity from the craft's current position (re-solved every step: gravity bends the path mid-burn) */
  targetFn: () => V3 | null = () => null;
  aligned = false;
  start(fn: () => V3 | null) {
    this.targetFn = fn;
    this.aligned = false;
  }
  /** returns remaining |Δv| (m/s) */
  step(c: Spacecraft, dt: number, env: FlightEnv): number {
    const vt = this.targetFn();
    if (!vt) {
      c.throttle = 0;
      return 0;
    }
    const dv = new THREE.Vector3(...vsub(vt, c.vel));
    const left = dv.length();
    c.sas = 'target';
    c.attRate = null;
    if (left < 0.04) {
      c.throttle = 0;
      c.rcsT.set(0, 0, 0);
      return 0;
    }
    const up = new THREE.Vector3(...env.up(c.pos));
    if (left > 1.5) {
      c.attTarget.copy(lookQuat(dv, up));
      const fwd = c.forward();
      const err = fwd.angleTo(dv);
      if (err < THREE.MathUtils.degToRad(this.aligned ? 6 : 1.5) && c.angVel.length() < 0.05) this.aligned = true;
      if (this.aligned) {
        const a = c.maxAccel();
        c.throttle = THREE.MathUtils.clamp((dv.dot(fwd) / Math.max(1e-3, a * dt)) * 0.9, 0, 1);
      } else c.throttle = 0;
      c.rcsT.set(0, 0, 0);
    } else {
      // trim the last metre per second with RCS translation (no re-pointing)
      c.throttle = 0;
      const local = dv.clone().applyQuaternion(c.quat.clone().invert());
      const aR = c.spec.rcsThrust / c.mass;
      c.rcsT.copy(local).divideScalar(Math.max(1e-3, aR * dt)).clampScalar(-1, 1);
    }
    return left;
  }
}

/** Ascent continuation from the atmospheric handover to a stable parking orbit (periapsis above 180 km). */
export class OrbitInsertion implements AutopilotProgram {
  name = 'ORBIT INSERTION';
  allowManual = false;
  done = false;
  constructor(readonly host: ProxHost, readonly targetAlt = 280e3, readonly onDone?: () => void) {}

  update(c: Spacecraft, _dt: number, env: FlightEnv): AutopilotResult {
    const s = orbitSummary(c.pos, c.vel);
    const up = new THREE.Vector3(...env.up(c.pos));
    const v = new THREE.Vector3(...c.vel);
    const hdir = v.clone().sub(up.clone().multiplyScalar(v.dot(up)));
    if (hdir.lengthSq() < 1) hdir.set(1, 0, 0).sub(up.clone().multiplyScalar(up.x)).normalize();
    hdir.normalize();
    c.sas = 'target';
    c.attRate = null;
    if (s.pe > 185e3 && s.ap > s.pe) {
      c.throttle = 0;
      if (!this.done) {
        this.done = true;
        this.onDone?.();
      }
      return { done: true, msg: `Orbit achieved — ${(s.pe / 1000).toFixed(0)} × ${(s.ap / 1000).toFixed(0)} km` };
    }
    // vertical-speed profile toward the target altitude, pitch from the error, thrust along the horizon otherwise
    const vrDes = THREE.MathUtils.clamp((this.targetAlt - s.alt) / 110, -40, 260);
    const theta = THREE.MathUtils.clamp(0.0035 * (vrDes - s.vr) + 0.05, -0.3, 0.75);
    const dir = hdir.clone().multiplyScalar(Math.cos(theta)).addScaledVector(up, Math.sin(theta)).normalize();
    c.attTarget.copy(lookQuat(dir, up));
    const err = c.forward().angleTo(dir);
    c.throttle = err < 0.35 ? 1 : 0.2;
    const msg = s.alt < 120e3 ? 'Climbing — pitch program' : s.ap < this.targetAlt ? 'Raising apoapsis' : 'Building horizontal speed';
    return { msg, timeScale: 4 };
  }
}

/**
 * Rendezvous with the Endurance: Lambert-planned transfer (search over coast time and time of flight),
 * departure burn, mid-course correction, arrival braking to the hold point behind the dock port.
 */
export class Rendezvous implements AutopilotProgram {
  name = 'RENDEZVOUS — ENDURANCE';
  allowManual = false;
  phase: 'plan' | 'wait' | 'burn1' | 'coast' | 'burn2' | 'coast2' | 'brake' | 'done' = 'plan';
  tBurn = 0;
  tArr = 0;
  tMid = 0;
  dvPlan = 0;
  private burn = new BurnExec();
  constructor(readonly host: ProxHost, readonly onDone?: () => void) {}

  private aim(t: number): { r: V3; v: V3 } {
    const e = this.host.targetState(t);
    return { r: vadd(e.r, this.host.aimOffset(t)), v: e.v };
  }

  plan(c: Spacecraft) {
    const t0 = this.host.now();
    const s = orbitSummary(c.pos, c.vel);
    const P = Number.isFinite(s.period) ? s.period : 5400;
    let best = { cost: Infinity, w: 0, tof: 0, dv: 0 };
    for (let w = 30; w <= P * 1.2; w += 90) {
      const st = propagate(c.pos as V3, c.vel as V3, MU_EARTH, w);
      for (let tof = P * 0.3; tof <= P * 0.8; tof += 150) {
        const a = this.aim(t0 + w + tof);
        const sol = lambertECI(st.r, a.r, tof);
        if (!sol) continue;
        // reject transfers that dip into the atmosphere
        const mid = propagate(st.r, sol.v1, MU_EARTH, tof / 2);
        if (vlen(mid.r) - R_EARTH < 150e3) continue;
        const dv = vlen(vsub(sol.v1, st.v)) + vlen(vsub(a.v, sol.v2));
        const cost = dv + 0.025 * w;
        if (cost < best.cost) best = { cost, w, tof, dv };
      }
    }
    if (!Number.isFinite(best.cost)) return false;
    this.tBurn = t0 + best.w;
    this.tArr = this.tBurn + best.tof;
    this.tMid = this.tBurn + best.tof * 0.55;
    this.dvPlan = best.dv;
    return true;
  }

  private target(c: Spacecraft): V3 | null {
    const t = this.host.now();
    const a = this.aim(this.tArr);
    const sol = lambertECI(c.pos as V3, a.r, Math.max(30, this.tArr - t));
    return sol ? sol.v1 : null;
  }

  update(c: Spacecraft, dt: number, env: FlightEnv): AutopilotResult {
    const t = this.host.now();
    switch (this.phase) {
      case 'plan': {
        if (!this.plan(c)) return { done: true, msg: 'No transfer solution — check your orbit' };
        this.phase = 'wait';
        this.host.say('computer', `Rendezvous plan: transfer burn in ${fmtT(this.tBurn - t)}, ${this.dvPlan.toFixed(0)} m/s total, arrival in ${fmtT(this.tArr - t)}.`);
        return { msg: 'Transfer computed' };
      }
      case 'wait': {
        const rem = this.tBurn - t;
        c.throttle = 0;
        c.sas = rem < 90 ? 'target' : 'prograde';
        if (rem < 90) {
          const v1 = this.target(c);
          if (v1) c.attTarget.copy(lookQuat(new THREE.Vector3(...vsub(v1, c.vel)), new THREE.Vector3(...env.up(c.pos))));
        }
        if (rem <= 0) {
          if (!this.target(c)) return { done: true, msg: 'Transfer lost — replan' };
          this.burn.start(() => this.target(c));
          this.phase = 'burn1';
          this.host.say('computer', 'Transfer burn.');
        }
        return { msg: `Coasting to transfer burn — ${fmtT(rem)}`, timeScale: THREE.MathUtils.clamp(rem / 4, 1, 400), maxStep: Math.max(0.05, Math.min(30, rem - 60 > 0 ? rem - 60 : rem)) };
      }
      case 'burn1':
      case 'burn2':
      case 'brake': {
        const left = this.burn.step(c, dt, env);
        if (left <= 0) {
          this.phase = this.phase === 'burn1' ? 'coast' : this.phase === 'burn2' ? 'coast2' : 'done';
          if (this.phase === 'done') {
            this.host.say('computer', 'Rendezvous complete. Holding behind the Endurance.');
            this.onDone?.();
            return { done: true, msg: 'Rendezvous complete' };
          }
        }
        return { msg: `${this.phase === 'brake' ? 'Braking' : 'Burn'} — Δv left ${left.toFixed(1)} m/s` };
      }
      case 'coast':
      case 'coast2': {
        c.throttle = 0;
        c.rcsT.set(0, 0, 0);
        // brake centred on the arrival time: Δv at arrival / (2 · max acceleration) before it
        let evt = this.tMid;
        if (this.phase === 'coast2') {
          const ar = this.aim(this.tArr);
          const st = propagate(c.pos as V3, c.vel as V3, MU_EARTH, Math.max(0, this.tArr - t));
          const dvA = vlen(vsub(ar.v, st.v));
          evt = this.tArr - dvA / (2 * Math.max(0.5, c.maxAccel())) - 0.5;
        }
        const rem = evt - t;
        c.sas = rem < 60 ? 'target' : 'prograde';
        if (rem < 60) {
          const v1 = this.phase === 'coast' ? this.target(c) : this.aim(this.tArr).v;
          if (v1) c.attTarget.copy(lookQuat(new THREE.Vector3(...vsub(v1, c.vel)), new THREE.Vector3(...env.up(c.pos))));
        }
        if (rem <= 0) {
          if (this.phase === 'coast') {
            const v1 = this.target(c);
            if (v1 && vlen(vsub(v1, c.vel)) > 0.15) {
              this.burn.start(() => this.target(c));
              this.phase = 'burn2';
              this.host.say('computer', 'Mid-course correction.');
            } else this.phase = 'coast2';
          } else {
            // match the aim point's velocity (it moves with the Endurance)
            this.burn.start(() => this.aim(this.host.now()).v);
            this.phase = 'brake';
            this.host.say('computer', 'Braking for rendezvous.');
          }
        }
        const rng = vlen(vsub(this.aim(t).r, c.pos as V3));
        return { msg: `Coasting — ${fmtT(rem)} to ${this.phase === 'coast' ? 'correction' : 'arrival'} · range ${(rng / 1000).toFixed(1)} km`, timeScale: THREE.MathUtils.clamp(rem / 4, 1, 400), maxStep: Math.max(0.05, Math.min(30, rem > 70 ? rem - 60 : rem)) };
      }
      default:
        return { done: true };
    }
  }
}

/**
 * Proximity operations and docking at the Endurance's spinning axial port.
 * One continuous approach down the port axis: axial speed 0.12 · d + 0.12 m/s (≤ 6 m/s), lateral error nulled
 * independently, attitude locked to the port axis. Inside 70 m the Ranger spins up to the ring's rotation with
 * the latch petals phased; inside 12 m it holds if roll, rate or lateral tolerances are not met.
 * From 160 m out the sequence takes ≈ 45 s to capture.
 */
export class DockingApproach implements AutopilotProgram {
  name = 'DOCKING — ENDURANCE FWD PORT';
  allowManual = false;
  phase: 'approach' | 'around' | 'spin' | 'final' | 'hold' | 'captured' = 'approach';
  rollPhase = 0;
  spinOn = false;
  t = 0;
  constructor(readonly host: ProxHost, readonly onCapture?: () => void) {}

  update(c: Spacecraft, dt: number, _env: FlightEnv): AutopilotResult {
    this.t += dt;
    const rel = this.host.portRelation(c);
    if (!this.spinOn && rel.axial > 0 && rel.axial < 70 && rel.lateral < 6) {
      this.spinOn = true;
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const g = this.host.dockGoal(c, 0, true, (k * 2 * Math.PI) / 3);
        const a = c.quat.angleTo(g.quat);
        if (a < best) {
          best = a;
          this.rollPhase = (k * 2 * Math.PI) / 3;
        }
      }
      this.host.say('computer', 'Inside seventy metres. Matching the Endurance rotation.');
    }
    const goal = this.host.dockGoal(c, 0, this.spinOn, this.rollPhase);
    const axis = goal.axis;
    const e = new THREE.Vector3(c.pos[0] - goal.pos[0], c.pos[1] - goal.pos[1], c.pos[2] - goal.pos[2]);
    const a = e.dot(axis);
    const lat = e.clone().addScaledVector(axis, -a);
    const matched = rel.rateErr < 0.04 && rel.rollErr < 5 && rel.alignErr < 2.5;
    const latOk = lat.length() < 0.25 + 0.05 * Math.max(0, a);
    // behind the port plane (e.g. arrived on the aft side): fly around the ring to a point in front first
    if (!this.spinOn && (a < 25 || this.phase === 'around') && !(this.phase === 'around' && a > 55 && lat.length() < 100)) {
      this.phase = 'around';
      let perp = lat.clone();
      if (perp.lengthSq() < 1) perp = new THREE.Vector3(0, 1, 0).cross(axis);
      perp.normalize();
      const tgt = new THREE.Vector3(...goal.pos).addScaledVector(axis, 60).addScaledVector(perp, 90);
      const vD = tgt.sub(new THREE.Vector3(...c.pos)).multiplyScalar(0.12);
      if (vD.length() > 5) vD.setLength(5);
      const vR = new THREE.Vector3(c.vel[0] - goal.vel[0], c.vel[1] - goal.vel[1], c.vel[2] - goal.vel[2]);
      const aR0 = c.spec.rcsThrust / c.mass;
      c.rcsT.copy(vD.sub(vR).multiplyScalar(1.4).applyQuaternion(c.quat.clone().invert()).divideScalar(aR0)).clampScalar(-1, 1);
      c.throttle = 0;
      c.sas = 'target';
      c.attTarget.copy(goal.quat);
      c.attRate = null;
      return { msg: `Repositioning to the forward side — ${rel.dist.toFixed(0)} m`, timeScale: rel.dist > 300 ? 4 : 1 };
    }
    this.phase = !this.spinOn ? 'approach' : a > 12 ? 'spin' : matched && latOk ? 'final' : 'hold';
    if (rel.dist < 0.3 && rel.closing < 0.5 && rel.alignErr < 4 && rel.rollErr < 6) {
      this.phase = 'captured';
      c.rcsT.set(0, 0, 0);
      c.throttle = 0;
      c.attRate = null;
      this.host.capture(c);
      this.onCapture?.();
      return { done: true, msg: `Capture after ${this.t.toFixed(0)} s — docking latches closed` };
    }
    // axial speed profile (towards the port), held while tolerances are not met close in
    let vAx = THREE.MathUtils.clamp(0.12 * Math.max(0, a) + 0.12, 0.12, 6);
    if (this.phase === 'hold') vAx = a > 3 ? 0 : -0.05;
    if (a < -0.05) vAx = -0.1; // overshoot: back out
    const latSpeed = Math.min(4, lat.length() * 0.45);
    const vDes = axis.clone().multiplyScalar(-vAx).add(lat.clone().setLength(-latSpeed));
    const vRel = new THREE.Vector3(c.vel[0] - goal.vel[0], c.vel[1] - goal.vel[1], c.vel[2] - goal.vel[2]);
    const aCmd = vDes.sub(vRel).multiplyScalar(1.6);
    const aR = c.spec.rcsThrust / c.mass;
    c.rcsT.copy(aCmd.applyQuaternion(c.quat.clone().invert()).divideScalar(aR)).clampScalar(-1, 1);
    c.throttle = 0;
    c.sas = 'target';
    c.attTarget.copy(goal.quat);
    c.attRate = this.spinOn ? goal.w.clone() : null;
    const label = this.phase === 'approach' ? `Approach — ${rel.dist.toFixed(0)} m · ${rel.closing.toFixed(2)} m/s`
      : this.phase === 'spin' ? `Spin matched approach — ${rel.dist.toFixed(1)} m · roll ${rel.rollErr.toFixed(1)}°`
      : this.phase === 'hold' ? `Holding — aligning (roll ${rel.rollErr.toFixed(1)}°, lateral ${lat.length().toFixed(2)} m)`
      : `Final approach — ${rel.dist.toFixed(2)} m · ${rel.closing.toFixed(2)} m/s`;
    return { msg: label, timeScale: 1 };
  }
}
