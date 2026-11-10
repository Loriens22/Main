import * as THREE from 'three';
import type { AutopilotProgram, AutopilotResult } from '../vehicles/FlightControl';
import type { Spacecraft, FlightEnv } from '../vehicles/Spacecraft';
import { propagate, type V3 } from './kepler';
import { PRIMARY, orbitSummary } from './earthFrame';
import { BurnExec, lambertECI, hOf, lookQuat, fmtT, type ProxHost } from './Proximity';
import { bodyRot, bodyOmega, type SurfaceSite } from './surfaceFrame';

/**
 * Landing guidance.
 *   DeorbitLanding  (orbital zone) — Lambert-targeted deorbit to an approach gate up-range of the site, timed so the
 *                    gate lies on the descent path; hands over to the surface zone at the handover altitude.
 *   PoweredDescent  (surface zone) — explicit (E-) guidance: braking on the main engine to a high gate, VTOL
 *                    approach to a point above the site, terminal vertical descent to touchdown.
 *   LandHere        — terminal descent at the current position (manual landings).
 *   AscentToOrbit   — VTOL lift-off, pitch-over, main-engine ascent to the target apoapsis; the orbital zone's
 *                    OrbitInsertion circularises after the handover.
 */
const V = (a: V3 | number[]) => new THREE.Vector3(a[0], a[1], a[2]);

/** Site position in the inertial frame of its body at time t, `alt` metres above the datum. */
export function siteInertial(site: SurfaceSite, t: number, alt = 0) {
  return site.up.clone().multiplyScalar(site.R + alt).applyMatrix3(bodyRot(site.body, t).transpose());
}

/** Powered-braking distance from circular orbital speed at deceleration aBrake, plus margin (m). */
export function brakingDistance(mu: number, R: number, aBrake: number) {
  const v = Math.sqrt(mu / R);
  return (v * v) / (2 * Math.max(0.5, aBrake)) + Math.min(15e3, 0.3 * R);
}

// =================================================================================================== deorbit
export class DeorbitLanding implements AutopilotProgram {
  name: string;
  allowManual = false;
  phase: 'plan' | 'wait' | 'burn' | 'coast' | 'trim' | 'final' = 'plan';
  tBurn = 0;
  tArr = 0;
  tTrim = 0;
  dv = 0;
  dvBrake = 0;
  gateAlt = 0;
  upAngle = 0;
  private hRef = new THREE.Vector3();
  private burn = new BurnExec();

  constructor(readonly host: ProxHost, readonly site: SurfaceSite, readonly siteName: string, readonly hHand: number) {
    this.name = `LANDING — ${siteName.toUpperCase()}`;
  }

  private gate(t: number) {
    const s = siteInertial(this.site, t).normalize();
    const along = this.hRef.clone().cross(s).normalize(); // direction of motion over the site
    return s.multiplyScalar(Math.cos(this.upAngle)).addScaledVector(along, -Math.sin(this.upAngle)).multiplyScalar(PRIMARY.R + this.gateAlt);
  }

  /** Search departure delay × time of flight for the cheapest deorbit + braking. Returns false when unreachable. */
  plan(c: Spacecraft) {
    const t0 = this.host.now();
    const s = orbitSummary(c.pos, c.vel);
    if (!Number.isFinite(s.period)) return false;
    const P = s.period;
    this.hRef.copy(hOf(c.pos, c.vel)).normalize();
    this.gateAlt = this.hHand - Math.min(1500, 0.08 * this.hHand);
    this.upAngle = Math.min(0.6, brakingDistance(PRIMARY.mu, PRIMARY.R, 0.42 * c.maxAccel()) / PRIMARY.R);
    const w = bodyOmega(this.site.body, t0);
    let best = { cost: Infinity, w: 0, tof: 0, dv: 0, dvB: 0 };
    for (let k = 0; k <= 40; k++) {
      const wait = 60 + (P * 1.05 * k) / 40;
      const st = propagate(c.pos as V3, c.vel as V3, PRIMARY.mu, wait);
      for (let f = 0.1; f <= 0.8; f += 0.035) {
        const tof = P * f;
        const g = this.gate(t0 + wait + tof);
        const sol = lambertECI(st.r, g.toArray() as V3, tof, this.hRef);
        if (!sol) continue;
        const v2 = V(sol.v2);
        const vr = v2.dot(g.clone().normalize());
        if (vr > -3) continue; // must arrive descending
        const dv1 = V(sol.v1).sub(V(st.v)).length();
        const dvB = v2.clone().sub(new THREE.Vector3().crossVectors(w, g)).length();
        const cost = dv1 + dvB + 3 * Math.max(0, -vr - 150) + 0.004 * wait;
        if (cost < best.cost) best = { cost, w: wait, tof, dv: dv1, dvB };
      }
    }
    if (!Number.isFinite(best.cost)) return false;
    this.tBurn = t0 + best.w;
    this.tArr = this.tBurn + best.tof;
    this.tTrim = this.tBurn + best.tof * 0.6;
    this.dv = best.dv;
    this.dvBrake = best.dvB;
    return true;
  }

  private target(c: Spacecraft): V3 | null {
    const t = this.host.now();
    const sol = lambertECI(c.pos as V3, this.gate(this.tArr).toArray() as V3, Math.max(20, this.tArr - t), this.hRef);
    return sol ? sol.v1 : null;
  }

  update(c: Spacecraft, dt: number, env: FlightEnv): AutopilotResult {
    const t = this.host.now();
    const up = V(env.up(c.pos));
    switch (this.phase) {
      case 'plan': {
        if (!this.plan(c)) return { done: true, msg: 'No deorbit solution from this orbit' };
        this.phase = 'wait';
        const need = this.dv + this.dvBrake * 1.15;
        this.host.say('computer', `Landing plan for ${this.siteName}: deorbit burn in ${fmtT(this.tBurn - t)} (${this.dv.toFixed(0)} m/s), powered descent about ${this.dvBrake.toFixed(0)} m/s.${c.deltaV() < need ? ' Warning: propellant is short for the descent.' : ''}`);
        return { msg: 'Deorbit computed' };
      }
      case 'wait': {
        const rem = this.tBurn - t;
        c.throttle = 0;
        c.sas = rem < 90 ? 'target' : 'retrograde';
        if (rem < 90) {
          const v1 = this.target(c);
          if (v1) c.attTarget.copy(lookQuat(V(v1).sub(V(c.vel)), up));
        }
        if (rem <= 0) {
          if (!this.target(c)) return { done: true, msg: 'Deorbit solution lost — replan' };
          this.burn.start(() => this.target(c));
          this.phase = 'burn';
          this.host.say('computer', 'Deorbit burn.');
        }
        return { msg: `Coasting to deorbit burn — ${fmtT(rem)}`, timeScale: THREE.MathUtils.clamp(rem / 4, 1, 400), maxStep: Math.max(0.05, Math.min(30, rem > 70 ? rem - 60 : rem)) };
      }
      case 'burn':
      case 'trim': {
        const left = this.burn.step(c, dt, env);
        if (left <= 0) {
          this.phase = this.phase === 'burn' ? 'coast' : 'final';
          if (this.phase === 'coast') this.host.say('computer', `Deorbit complete. Descent to ${(this.gateAlt / 1000).toFixed(0)} km in ${fmtT(this.tArr - t)}.`);
        }
        return { msg: `${this.phase === 'trim' ? 'Trajectory trim' : 'Deorbit burn'} — Δv left ${left.toFixed(1)} m/s` };
      }
      case 'coast':
      case 'final': {
        c.throttle = 0;
        c.rcsT.set(0, 0, 0);
        const rem = (this.phase === 'coast' ? this.tTrim : this.tArr) - t;
        // face retrograde, ready for the braking burn
        c.sas = 'retrograde';
        if (this.phase === 'coast' && rem <= 0) {
          const v1 = this.target(c);
          if (v1 && V(v1).sub(V(c.vel)).length() > 0.4) {
            this.burn.start(() => this.target(c));
            this.phase = 'trim';
          } else this.phase = 'final';
        }
        const alt = env.altitude(c.pos);
        return { msg: `Descent coast — ${fmtT(this.tArr - t)} to the approach gate · altitude ${(alt / 1000).toFixed(1)} km`, timeScale: THREE.MathUtils.clamp((this.tArr - t - 40) / 5, 1, 300), maxStep: Math.max(0.05, Math.min(10, (alt - this.hHand) / 400)) };
      }
    }
    return { done: true };
  }
}

// =================================================================================================== surface guidance
export interface SurfaceAPHost {
  now(): number;
  say(who: string, text: string): void;
  /** terrain height under (x, z), local frame */
  groundHeight(x: number, z: number): number;
  /** landing target (local, on the ground) */
  target: V3;
  /** orbital elements around the body from a local state */
  orbit(c: Spacecraft): ReturnType<typeof orbitSummary>;
}

/** E-guidance: thrust acceleration now, to reach (rT, vT) in T seconds under constant gravity g. */
function eguide(p: THREE.Vector3, v: THREE.Vector3, rT: THREE.Vector3, vT: THREE.Vector3, g: THREE.Vector3, T: number) {
  const dr = rT.clone().sub(p).addScaledVector(v, -T).addScaledVector(g, -0.5 * T * T);
  const dv = vT.clone().sub(v).addScaledVector(g, -T);
  return dr.multiplyScalar(6 / (T * T)).addScaledVector(dv, -2 / T);
}

/** smallest time-to-go for which the commanded acceleration stays within k·aMax */
function solveTgo(p: THREE.Vector3, v: THREE.Vector3, rT: THREE.Vector3, vT: THREE.Vector3, g: THREE.Vector3, aMax: number, k: number) {
  for (let T = 6; T < 2500; T *= 1.03) if (eguide(p, v, rT, vT, g, T).length() <= k * aMax) return T;
  return 2500;
}

/**
 * Point the VTOL axis (craft +Y) along the commanded acceleration (tilt-limited) and set the hover thrust with
 * altitude priority (the vertical component is met first); RCS translation trims what the tilt cannot deliver.
 */
function vtolAllocate(c: Spacecraft, a: THREE.Vector3, up: THREE.Vector3, heading: THREE.Vector3 | null, maxTilt = 0.6) {
  let u = a.clone().normalize();
  if (a.dot(up) <= 0.05) u = up.clone(); // never point the thrusters down
  const tilt = u.angleTo(up);
  if (tilt > maxTilt) u = up.clone().multiplyScalar(Math.cos(maxTilt)).addScaledVector(u.clone().addScaledVector(up, -u.dot(up)).normalize(), Math.sin(maxTilt)).normalize();
  let f = heading ? heading.clone() : c.forward();
  f.addScaledVector(u, -f.dot(u));
  if (f.lengthSq() < 1e-4) f = new THREE.Vector3(1, 0, 0).addScaledVector(u, -u.x);
  c.sas = 'target';
  c.attRate = null;
  c.attTarget.copy(lookQuat(f.normalize(), u));
  const aV = (c.spec.vtolThrust * c.efficiency) / c.mass;
  const cu = c.upVec();
  c.vtol = THREE.MathUtils.clamp(Math.max(0, a.dot(up)) / (aV * Math.max(0.3, cu.dot(up))), 0, 1);
  c.throttle = 0;
  // horizontal residual through the RCS jets (body frame)
  const got = cu.clone().multiplyScalar(c.vtol * aV);
  const res = a.clone().sub(got);
  res.addScaledVector(up, -res.dot(up));
  const aR = (c.spec.rcsThrust * c.rcsEfficiency) / c.mass;
  c.rcsT.copy(res.applyQuaternion(c.quat.clone().invert()).divideScalar(Math.max(1e-3, aR))).clampScalar(-1, 1);
}

/** Largest useful hover tilt: steeper on low-gravity worlds, where tilting buys little sideways acceleration. */
function tiltLimit(g: number) {
  return THREE.MathUtils.clamp(0.4 + (9.81 - g) * 0.07, 0.4, 1.0);
}

export class PoweredDescent implements AutopilotProgram {
  name = 'POWERED DESCENT';
  allowManual = false;
  phase: 'brake' | 'approach' | 'terminal' | 'done' = 'brake';
  private T = 0;
  private reT = 0;
  private uprange = new THREE.Vector3(1, 0, 0);
  private hiGate = 1800;
  private hiDist = 1400;

  constructor(readonly host: SurfaceAPHost, readonly label = 'the landing site', startPhase: 'brake' | 'approach' | 'terminal' = 'brake') {
    this.phase = startPhase;
    this.name = `POWERED DESCENT — ${label.toUpperCase()}`;
  }

  update(c: Spacecraft, dt: number, env: FlightEnv): AutopilotResult {
    const p = V(c.pos), v = V(c.vel), tgt = V(this.host.target);
    const g = V(env.gravity(c.pos));
    const up = V(env.up(c.pos));
    const hor = (x: THREE.Vector3) => x.clone().addScaledVector(up, -x.dot(up));
    const agl = c.pos[1] - this.host.groundHeight(c.pos[0], c.pos[2]);
    const rangeH = hor(p.clone().sub(tgt)).length();
    const hs = hor(v).length();
    c.rcsT.set(0, 0, 0);
    if (c.contact && this.phase !== 'brake') {
      c.vtol = 0;
      c.throttle = 0;
      this.phase = 'done';
      this.host.say('computer', 'Contact light. Engines off.');
      return { done: true, msg: 'Touchdown' };
    }
    switch (this.phase) {
      case 'brake': {
        if (this.T <= 0) {
          const d = hor(p.clone().sub(tgt));
          if (d.lengthSq() > 1) this.uprange.copy(d.normalize());
          this.hiGate = THREE.MathUtils.clamp(agl * 0.08, 900, 2200);
          this.hiDist = this.hiGate * 0.8;
        }
        const rT = tgt.clone().addScaledVector(up, this.hiGate).addScaledVector(this.uprange, this.hiDist);
        const vT = this.uprange.clone().multiplyScalar(-35).addScaledVector(up, -16);
        const aMax = c.maxAccel();
        this.reT -= dt;
        if (this.T <= 0 || this.reT <= 0) {
          const Ts = solveTgo(p, v, rT, vT, g, aMax, 0.62);
          this.T = this.T <= 0 ? Ts : Math.max(this.T, Math.min(Ts, this.T + 3));
          this.reT = 1;
        }
        this.T -= dt;
        const a = eguide(p, v, rT, vT, g, Math.max(this.T, 1));
        // terrain clearance: never let the commanded path sag below 600 m above the ground
        if (agl < 600 && v.dot(up) < 0) a.addScaledVector(up, (600 - agl) * 0.02 - v.dot(up) * 0.05);
        const dir = a.clone().normalize();
        c.sas = 'target';
        c.attRate = null;
        c.attTarget.copy(lookQuat(dir, up));
        c.vtol = 0;
        const err = c.forward().angleTo(dir);
        c.throttle = err < 0.2 ? THREE.MathUtils.clamp(a.length() / aMax, 0, 1) : err < 0.5 ? 0.15 : 0;
        if (this.T < 7 || (hs < 55 && rangeH < this.hiDist * 2.5)) {
          this.phase = 'approach';
          this.T = 0;
          this.host.say('computer', 'High gate. Pitch-over to hover thrusters.');
        }
        return { msg: `Braking — ${hs.toFixed(0)} m/s, range ${(rangeH / 1000).toFixed(1)} km, ${(agl / 1000).toFixed(1)} km AGL`, timeScale: 1 };
      }
      case 'approach': {
        // velocity-profile guidance on the hover thrusters: fly toward the site on a braking speed schedule while
        // descending along a ~15° glide slope, then hand over to the vertical descent above the site
        const e = hor(tgt.clone().sub(p));
        const dist = e.length();
        const vh = hor(v);
        const gm = g.length();
        const tl = tiltLimit(gm);
        const aBrake = THREE.MathUtils.clamp(0.45 * gm * Math.tan(tl), 0.4, 2.5);
        const vhDes = dist > 0.5 ? e.clone().normalize().multiplyScalar(Math.min(70, Math.sqrt(2 * aBrake * dist), dist * 0.2)) : new THREE.Vector3();
        const ah = vhDes.sub(vh).multiplyScalar(0.6);
        if (ah.length() > aBrake * 2) ah.setLength(aBrake * 2);
        const hDes = 60 + dist * 0.27;
        const vy = v.dot(up);
        const vyDes = THREE.MathUtils.clamp((hDes - agl) * 0.12, -18, 10);
        const a = ah.addScaledVector(up, (vyDes - vy) * 0.9).sub(g);
        vtolAllocate(c, a, up, dist > 30 ? e.clone().normalize() : null, tl);
        if (agl < 500) c.gearDown = true;
        if (dist < 15 && vh.length() < 2.5) {
          this.phase = 'terminal';
          this.host.say('computer', 'Over the site. Vertical descent.');
        }
        return { msg: `Approach — range ${dist.toFixed(0)} m, ${agl.toFixed(0)} m AGL, ${vh.length().toFixed(1)} m/s` };
      }
      case 'terminal': {
        c.gearDown = true;
        const e = hor(p.clone().sub(tgt));
        const ah = e.multiplyScalar(-0.06).addScaledVector(hor(v), -0.8);
        if (ah.length() > 1.5) ah.setLength(1.5);
        const vDes = agl > 3 ? -THREE.MathUtils.clamp(agl / 8, 1.0, 10) : -0.6;
        const av = (vDes - v.dot(up)) * 1.6;
        const a = ah.addScaledVector(up, av).sub(g);
        vtolAllocate(c, a, up, null, Math.min(0.5, tiltLimit(g.length())));
        return { msg: `Descent — ${agl.toFixed(1)} m, V/S ${v.dot(up).toFixed(1)} m/s` };
      }
    }
    return { done: true };
  }
}

/** Terminal descent at the current position: kill horizontal speed, descend vertically, touch down. */
export class LandHere extends PoweredDescent {
  constructor(host: SurfaceAPHost) {
    super(host, 'here', 'approach');
    this.name = 'AUTO-LAND';
  }
}

export class AscentToOrbit implements AutopilotProgram {
  name = 'ASCENT TO ORBIT';
  allowManual = false;
  phase: 'lift' | 'pitch' | 'burn' | 'coast' = 'lift';
  private t = 0;
  constructor(readonly host: SurfaceAPHost, readonly apTarget: number, readonly climbAlt: number) {}

  update(c: Spacecraft, dt: number, env: FlightEnv): AutopilotResult {
    const p = V(c.pos), v = V(c.vel);
    const g = V(env.gravity(c.pos));
    const up = V(env.up(c.pos));
    const agl = c.pos[1] - this.host.groundHeight(c.pos[0], c.pos[2]);
    const east = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize();
    const s = this.host.orbit(c);
    this.t += dt;
    c.rcsT.set(0, 0, 0);
    switch (this.phase) {
      case 'lift': {
        const vy = v.dot(up);
        const a = up.clone().multiplyScalar((Math.min(12, 4 + agl * 0.1) - vy) * 0.8).sub(g);
        vtolAllocate(c, a, up, east, 0.1);
        if (agl > 25) c.gearDown = false;
        if (agl > 70) {
          this.phase = 'pitch';
          this.host.say('computer', 'Clear of the surface. Pitching over.');
        }
        return { msg: `Lift-off — ${agl.toFixed(0)} m` };
      }
      case 'pitch': {
        const dir = east.clone().multiplyScalar(Math.cos(1.0)).addScaledVector(up, Math.sin(1.0)).normalize();
        c.sas = 'target';
        c.attTarget.copy(lookQuat(dir, up));
        // hover on the VTOL thrusters while the nose comes up
        const aV = (c.spec.vtolThrust * c.efficiency) / c.mass;
        c.vtol = THREE.MathUtils.clamp((g.length() * 1.05) / Math.max(0.3, c.upVec().dot(up)) / aV, 0, 1);
        if (c.forward().angleTo(dir) < 0.15) {
          this.phase = 'burn';
          this.host.say('computer', 'Main engine ignition.');
        }
        return { msg: 'Pitch-over' };
      }
      case 'burn': {
        c.vtol = THREE.MathUtils.damp(c.vtol, 0, 2, dt);
        if (s.ap >= this.apTarget) {
          this.phase = 'coast';
          c.throttle = 0;
          this.host.say('computer', `Main engine cutoff. Apoapsis ${(this.apTarget / 1000).toFixed(0)} kilometres.`);
          break;
        }
        const hv = v.clone().addScaledVector(up, -v.dot(up));
        const hdir = hv.lengthSq() > 25 ? hv.normalize() : east;
        const vrDes = THREE.MathUtils.clamp((this.climbAlt - s.alt) / 45, -15, 160);
        const theta = THREE.MathUtils.clamp(0.004 * (vrDes - s.vr) + 0.05, -0.15, 1.1);
        const dir = hdir.multiplyScalar(Math.cos(theta)).addScaledVector(up, Math.sin(theta)).normalize();
        c.sas = 'target';
        c.attTarget.copy(lookQuat(dir, up));
        const margin = (this.apTarget - s.ap) / 8e3;
        c.throttle = c.forward().angleTo(dir) < 0.35 ? THREE.MathUtils.clamp(margin, 0.1, 1) : 0.15;
        return { msg: `Ascent — ${(s.alt / 1000).toFixed(1)} km, apoapsis ${(Math.max(0, s.ap) / 1000).toFixed(1)} km` };
      }
    }
    // coast toward the handover altitude
    c.throttle = 0;
    c.vtol = 0;
    c.sas = 'prograde';
    return { msg: `Coasting up — ${(s.alt / 1000).toFixed(1)} km`, timeScale: 4 };
  }
}
