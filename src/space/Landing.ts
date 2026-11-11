import * as THREE from 'three';
import type { AutopilotProgram, AutopilotResult } from '../vehicles/FlightControl';
import type { Spacecraft, FlightEnv } from '../vehicles/Spacecraft';
import { propagate, type V3 } from './kepler';
import { PRIMARY, orbitSummary, gravityAt, densityAt } from './earthFrame';
import { BurnExec, lambertECI, hOf, lookQuat, fmtT, aoaLimit, maxClimbQ, type ProxHost } from './Proximity';
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

// =================================================================================================== entry prediction
/** Ranger aerodynamics while flying the entry attitude (nose 50° above the airflow, lift vector up). */
export interface EntryAero { mass: number; cdA: number; clA: number }
export const ENTRY_AOA = (50 * Math.PI) / 180;
export function entryAero(c: Spacecraft): EntryAero {
  // matches Spacecraft's aerodynamics at that attitude: drag area × (1 + 2.5 sin α), lift ½·CL·sin 2α
  return { mass: c.mass, cdA: c.spec.dragArea * (1 + 2.5 * Math.sin(ENTRY_AOA)), clA: c.spec.dragArea * c.spec.liftCoef * 0.5 * Math.sin(2 * ENTRY_AOA) };
}

/** Entry attitude: nose ENTRY_AOA above the velocity, wings level (lift up). */
export function entryAttitude(vel: V3, up: THREE.Vector3) {
  const vh = V(vel).normalize();
  const n = up.clone().addScaledVector(vh, -up.dot(vh));
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
  n.normalize();
  const fwd = vh.multiplyScalar(Math.cos(ENTRY_AOA)).addScaledVector(n, Math.sin(ENTRY_AOA));
  return lookQuat(fwd, up);
}

/**
 * Numerical coast through the current primary's atmosphere with drag and lift (entry attitude) until the altitude
 * drops to hStop: Kepler steps in vacuum, RK2 in the air. Returns the state, the elapsed time and the peak g-load.
 */
export function predictEntry(r0: V3, v0: V3, aero: EntryAero, hStop: number, tMax: number) {
  let r: V3 = [...r0], v: V3 = [...v0];
  let t = 0, gMax = 0;
  const acc = (rr: V3, vv: V3): V3 => {
    const g = gravityAt(rr);
    const rho = densityAt(rr);
    if (rho <= 0) return g;
    const sp = Math.hypot(vv[0], vv[1], vv[2]);
    if (sp < 1e-3) return g;
    const q = 0.5 * rho * sp * sp;
    const vh: V3 = [vv[0] / sp, vv[1] / sp, vv[2] / sp];
    const rn = Math.hypot(rr[0], rr[1], rr[2]);
    const up: V3 = [rr[0] / rn, rr[1] / rn, rr[2] / rn];
    const d = up[0] * vh[0] + up[1] * vh[1] + up[2] * vh[2];
    let lf: V3 = [up[0] - vh[0] * d, up[1] - vh[1] * d, up[2] - vh[2] * d];
    const ll = Math.hypot(lf[0], lf[1], lf[2]) || 1;
    lf = [lf[0] / ll, lf[1] / ll, lf[2] / ll];
    const kd = (q * aero.cdA) / aero.mass, kl = (q * aero.clA) / aero.mass;
    gMax = Math.max(gMax, Math.hypot(kd, kl) / 9.81);
    return [g[0] - vh[0] * kd + lf[0] * kl, g[1] - vh[1] * kd + lf[1] * kl, g[2] - vh[2] * kd + lf[2] * kl];
  };
  let guard = 0;
  while (t < tMax && guard++ < 200000) {
    const rn = Math.hypot(r[0], r[1], r[2]);
    const alt = rn - PRIMARY.R;
    if (alt <= hStop) return { r, v, t, hit: true, gMax };
    const vr = (r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) / rn;
    const top = PRIMARY.rho0 > 0 ? PRIMARY.top : -1e9;
    if (alt > top + 2000 + Math.max(0, -vr) * 40) {
      const h = Math.min(30, tMax - t);
      const p = propagate(r, v, PRIMARY.mu, h);
      r = p.r;
      v = p.v;
      t += h;
      continue;
    }
    const h = alt - hStop < 3000 ? 0.25 : 1;
    const a1 = acc(r, v);
    const rm: V3 = [r[0] + v[0] * h * 0.5, r[1] + v[1] * h * 0.5, r[2] + v[2] * h * 0.5];
    const vm: V3 = [v[0] + a1[0] * h * 0.5, v[1] + a1[1] * h * 0.5, v[2] + a1[2] * h * 0.5];
    const a2 = acc(rm, vm);
    r = [r[0] + vm[0] * h, r[1] + vm[1] * h, r[2] + vm[2] * h];
    v = [v[0] + a2[0] * h, v[1] + a2[1] * h, v[2] + a2[2] * h];
    t += h;
  }
  return { r, v, t, hit: false, gMax };
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
  /** aim corrections from the entry predictor (rad along / across the ground track) */
  aimAlong = 0;
  aimCross = 0;
  gMax = 0;
  entryMiss = 0;
  private hRef = new THREE.Vector3();
  private burn = new BurnExec();
  /** caller's tag for the landing target (e.g. the Earth zone's 'nasa' / 'farm') */
  tag = '';

  constructor(readonly host: ProxHost, readonly site: SurfaceSite, readonly siteName: string, readonly hHand: number) {
    this.name = `LANDING — ${siteName.toUpperCase()}`;
  }

  /** where the gate is meant to be (for comparisons), and where the vacuum arc is aimed (gate + entry corrections) */
  private gate(t: number, aimed = true) {
    const s = siteInertial(this.site, t).normalize();
    const along = this.hRef.clone().cross(s).normalize(); // direction of motion over the site
    const side = new THREE.Vector3().crossVectors(s, along);
    const g = s.multiplyScalar(Math.cos(this.upAngle)).addScaledVector(along, -Math.sin(this.upAngle));
    if (aimed) {
      // along-track aim offset: a rotation about the orbit normal, the same motion as moving the burn along the orbit
      g.applyAxisAngle(this.hRef, -this.aimAlong);
      g.addScaledVector(side, this.aimCross).normalize();
    }
    return g.multiplyScalar(PRIMARY.R + this.gateAlt);
  }

  /** Search departure delay × time of flight for the cheapest deorbit + braking. Returns false when unreachable. */
  plan(c: Spacecraft) {
    const t0 = this.host.now();
    const s = orbitSummary(c.pos, c.vel);
    if (!Number.isFinite(s.period)) return false;
    const P = s.period;
    this.hRef.copy(hOf(c.pos, c.vel)).normalize();
    this.gateAlt = this.hHand - Math.min(1500, 0.08 * this.hHand);
    this.upAngle = Math.min(0.6, brakingDistance(PRIMARY.mu, PRIMARY.R, 0.55 * c.maxAccel()) / PRIMARY.R);
    const w = bodyOmega(this.site.body, t0);
    let best = { cost: Infinity, w: 0, tof: 0, dv: 0, dvB: 0 };
    // in an atmosphere leave room to move the burn earlier (the entry corrector shifts it along the orbit)
    const w0 = 60 + (PRIMARY.rho0 > 0 ? 0.15 * P : 0);
    for (let k = 0; k <= 40; k++) {
      const wait = w0 + (P * 1.05 * k) / 40;
      const st = propagate(c.pos as V3, c.vel as V3, PRIMARY.mu, wait);
      for (let f = 0.1; f <= 0.8; f += 0.035) {
        const tof = P * f;
        const g = this.gate(t0 + wait + tof);
        // near 180° the transfer plane is ill-defined: tiny aim corrections tilt the whole arc (fatal for the entry
        // corrector, which needs the aim to steer the hit smoothly)
        if (PRIMARY.rho0 > 0 && Math.abs(V(st.r).angleTo(g) - Math.PI) < 0.3) continue;
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
    // atmosphere: predictor–corrector on the aim point so the drag/lift-bent path still meets the gate
    if (PRIMARY.rho0 > 0) {
      // Atmosphere: predictor–corrector. Drag (and on Titan an hour of sinking through the haze) bends the path away
      // from the vacuum arc. Moving the burn AND the aim point along track by the same angle flies a rotated copy
      // of the same transfer, so the predicted hit moves one-for-one with the shift — a well-conditioned update
      // even where re-aiming alone would steepen or flatten the entry and barely move the hit.
      const aero = entryAero(c);
      const n = (2 * Math.PI) / P;
      let prevC: { a: number; d: number } | null = null, prevA: { s: number; d: number } | null = null;
      let shift = 0; // along-track rotation applied to burn and aim together (rad)
      for (let it = 0; it < 16; it++) {
        const st = propagate(c.pos as V3, c.vel as V3, PRIMARY.mu, best.w);
        const tA = t0 + best.w + best.tof;
        const sol = lambertECI(st.r, this.gate(tA).toArray() as V3, best.tof, this.hRef);
        if (!sol) break;
        const pr = predictEntry(st.r, sol.v1, aero, this.gateAlt, best.tof * 3 + 20000);
        this.gMax = pr.gMax;
        if (!pr.hit) break;
        // the air has already taken off part of the speed: put the gate where the remaining braking needs it
        const vGate = Math.hypot(pr.v[0], pr.v[1], pr.v[2]);
        // the air has already done most of the braking: a short margin (the powered descent is costly in dense air)
        const upNew = Math.min(0.6, ((vGate * vGate) / (2 * 0.55 * c.maxAccel()) + Math.min(6e3, 0.3 * PRIMARY.R)) / PRIMARY.R);
        const Rp = bodyRot(this.site.body, t0 + best.w + pr.t), Rg = bodyRot(this.site.body, tA);
        const pB = V(pr.r).applyMatrix3(Rp).normalize();
        const gI = this.gate(tA, false);
        const gB = gI.clone().applyMatrix3(Rg).normalize();
        const along = this.hRef.clone().cross(gI).normalize().applyMatrix3(Rg).normalize();
        const side = new THREE.Vector3().crossVectors(gB, along);
        const dA = pB.clone().sub(gB).dot(along), dC = pB.clone().sub(gB).dot(side);
        this.entryMiss = Math.hypot(dA, dC) * PRIMARY.R;
        if (this.entryMiss < 800 && Math.abs(upNew - this.upAngle) * PRIMARY.R < 3000) break;
        // move the gate where the remaining braking needs it, keeping the aim point (and so the transfer) where it is
        const du = (upNew - this.upAngle) * 0.8;
        this.upAngle += du;
        this.aimAlong -= du;
        const dEff = dA + du; // the miss relative to the moved gate
        // along track the shift should move the hit one-for-one; measure it anyway (secant) for robustness
        let kA = 1;
        if (prevA && Math.abs(shift - prevA.s) > 1e-4) kA = 1 / THREE.MathUtils.clamp((dEff - prevA.d) / (shift - prevA.s), 0.3, 3);
        prevA = { s: shift, d: dEff };
        const d = THREE.MathUtils.clamp(-dEff * kA, -0.6, 0.6); // > 0: the hit is short — burn later, aim further on
        if (best.w + d / n >= 60) {
          best.w += d / n;
          this.aimAlong -= d;
          shift += d;
        } else {
          this.aimAlong -= d; // cannot burn any earlier: re-aim only (no longer a pure rotation — drop the secant)
          prevA = null;
        }
        // cross range: secant on the measured sensitivity (shallow, long entries respond weakly to the aim)
        let kC = 1;
        if (prevC && Math.abs(this.aimCross - prevC.a) > 1e-4) kC = 1 / THREE.MathUtils.clamp((dC - prevC.d) / (this.aimCross - prevC.a), 0.3, 3);
        prevC = { a: this.aimCross, d: dC };
        this.aimCross -= THREE.MathUtils.clamp(dC * kC, -0.2, 0.2);
      }
      const st = propagate(c.pos as V3, c.vel as V3, PRIMARY.mu, best.w);
      const tA = t0 + best.w + best.tof;
      const sol = lambertECI(st.r, this.gate(tA).toArray() as V3, best.tof, this.hRef);
      if (sol) best.dv = V(sol.v1).sub(V(st.v)).length();
    }
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
        const aero = PRIMARY.rho0 > 0 ? ` Atmospheric entry: peak ${this.gMax.toFixed(1)} g${this.entryMiss > 5000 ? `, predicted miss ${(this.entryMiss / 1000).toFixed(0)} km` : ''}.` : '';
        this.host.say('computer', `Landing plan for ${this.siteName}: deorbit burn in ${fmtT(this.tBurn - t)} (${this.dv.toFixed(0)} m/s), powered descent about ${this.dvBrake.toFixed(0)} m/s.${aero}${c.deltaV() < need ? ' Warning: propellant is short for the descent.' : ''}`);
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
        const inAir = env.density(c.pos) > 1e-9;
        if (inAir) {
          // entry: belly into the airflow, nose 50° up, lift vector up (the attitude the predictor assumed)
          c.sas = 'target';
          c.attRate = null;
          c.attTarget.copy(entryAttitude(c.vel as V3, up));
          if (this.phase === 'coast') this.phase = 'final';
        } else c.sas = 'retrograde'; // face retrograde, ready for the braking burn
        if (this.phase === 'coast' && rem <= 0) {
          const v1 = this.target(c);
          if (v1 && V(v1).sub(V(c.vel)).length() > 0.4) {
            this.burn.start(() => this.target(c));
            this.phase = 'trim';
          } else this.phase = 'final';
        }
        const alt = env.altitude(c.pos);
        if (inAir) {
          const g = c.accel.length() / 9.81;
          return { msg: `Atmospheric entry — ${(alt / 1000).toFixed(1)} km, ${(c.speed() / 1000).toFixed(2)} km/s, ${g.toFixed(1)} g`, timeScale: THREE.MathUtils.clamp((alt - this.hHand) / 1500, 1, 12) };
        }
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
function vtolAllocate(c: Spacecraft, a: THREE.Vector3, up: THREE.Vector3, heading: THREE.Vector3 | null, maxTilt = 0.6, lowG = false) {
  let u = a.clone().normalize();
  if (lowG) maxTilt = 1.35; // milli-g: nothing to hold up, the hover thrusters can push in any direction
  if (a.dot(up) <= 0.05) u = lowG && a.clone().addScaledVector(up, -a.dot(up)).lengthSq() > 1e-4 ? a.clone().addScaledVector(up, -a.dot(up)).normalize().addScaledVector(up, 0.2).normalize() : up.clone(); // never point the thrusters down
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
  c.vtol = lowG ? THREE.MathUtils.clamp(Math.max(0, a.dot(cu)) / aV, 0, 1) : THREE.MathUtils.clamp(Math.max(0, a.dot(up)) / (aV * Math.max(0.3, cu.dot(up))), 0, 1);
  c.throttle = 0;
  // horizontal residual through the RCS jets (body frame)
  const got = cu.clone().multiplyScalar(c.vtol * aV);
  const res = a.clone().sub(got);
  if (!lowG) res.addScaledVector(up, -res.dot(up)); // milli-g: the jets also push down toward the surface
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
  /** mean speed expected while braking (half the speed at the start of the brake, at least the floor) */
  private vMean = 0;
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
          this.vMean = 0.5 * v.length();
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
          // shortest feasible time-to-go, but never faster than the craft already flies (small worlds: ≥ 25 m/s cap)
          // dense air (Titan: ~30 m/s terminal speed at the handover) — fly the remaining kilometres faster than
          // the drift, rather than hovering down for half an hour
          const dist = rT.clone().sub(p).length();
          const vFloor = 25 + 50 * THREE.MathUtils.clamp(env.density(c.pos) / 0.5, 0, 1);
          // (from the speed at the start of the brake: re-deriving it from the current speed lets the countdown stall
          // as the craft slows — it then hovers along at walking pace, paying gravity loss all the way)
          const Ts = Math.max(solveTgo(p, v, rT, vT, g, aMax, 0.62), dist / Math.max(vFloor, this.vMean));
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
        // (slow and close is not enough in dense air, where the craft drifts in slowly far above the gate)
        if (this.T < 7 || (hs < 55 && rangeH < this.hiDist * 2.5 && agl < this.hiGate * 2.5)) {
          this.phase = 'approach';
          this.T = 0;
          this.host.say('computer', 'High gate. Pitch-over to hover thrusters.');
        }
        return { msg: `Braking — ${hs.toFixed(0)} m/s, range ${(rangeH / 1000).toFixed(1)} km, ${(agl / 1000).toFixed(1)} km AGL`, timeScale: this.T > 120 && agl > 4000 ? THREE.MathUtils.clamp(this.T / 60, 1, 4) : 1 };
      }
      case 'approach': {
        // velocity-profile guidance on the hover thrusters: fly toward the site on a braking speed schedule while
        // descending along a ~15° glide slope, then hand over to the vertical descent above the site
        const e = hor(tgt.clone().sub(p));
        const dist = e.length();
        const vh = hor(v);
        const gm = g.length();
        const tl = tiltLimit(gm);
        const lowG = gm < 0.8;
        const aV0 = (c.spec.vtolThrust * c.efficiency) / c.mass;
        const aBrake = THREE.MathUtils.clamp(lowG ? 0.08 * aV0 : 0.45 * gm * Math.tan(tl), 0.4, 2.5);
        const vhDes = dist > 0.5 ? e.clone().normalize().multiplyScalar(Math.min(70, Math.sqrt(2 * aBrake * dist), dist * 0.2)) : new THREE.Vector3();
        const ah = vhDes.sub(vh).multiplyScalar(0.6);
        if (ah.length() > aBrake * 2) ah.setLength(aBrake * 2);
        const hDes = 60 + dist * 0.27;
        const vy = v.dot(up);
        const vyDes = THREE.MathUtils.clamp((hDes - agl) * 0.12, -THREE.MathUtils.clamp(agl / 25, 18, 60), 10);
        const a = ah.addScaledVector(up, (vyDes - vy) * 0.9).sub(g);
        vtolAllocate(c, a, up, dist > 30 ? e.clone().normalize() : null, tl, lowG);
        if (agl < 500) c.gearDown = true;
        if (dist < 15 && vh.length() < 2.5 && agl < 250) {
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
        vtolAllocate(c, a, up, null, Math.min(0.5, tiltLimit(g.length())), g.length() < 0.8);
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

/**
 * Ascent from the surface. Ordinary worlds: VTOL lift-off, pitch-over, main-engine burn to the target apoapsis, coast
 * to the handover (the orbital zone circularises). Milli-g rubble moons (Phobos, Deimos): the main engine is far too
 * strong and a ballistic coast takes most of an hour, so the hover thrusters fly the whole climb — a vertical-speed
 * profile up to the target altitude while the horizontal speed builds to circular — and the handover waits for orbit.
 */
export class AscentToOrbit implements AutopilotProgram {
  name = 'ASCENT TO ORBIT';
  allowManual = false;
  phase: 'lift' | 'pitch' | 'burn' | 'coast' | 'hop' | 'orbit' = 'lift';
  private t = 0;
  private tiny: boolean | null = null;
  private qk = 1;
  /** Max-q: throttle back while the dynamic pressure exceeds the cheapest climb pressure (drag = weight). */
  private qLimit(c: Spacecraft, env: FlightEnv, dt: number) {
    const gN = V(env.gravity(c.pos)).length();
    const qMax = maxClimbQ(c, gN);
    const q = 0.5 * env.density(c.pos) * c.speed() * c.speed();
    // never below the thrust that still climbs (high-g worlds such as Miller have little margin)
    const floor = THREE.MathUtils.clamp((1.25 * gN) / Math.max(1e-3, c.maxAccel()), 0.12, 1);
    // only while climbing briskly: a craft that is not rising needs the thrust more than it fears the drag
    const vr = V(c.vel).dot(V(env.up(c.pos)));
    this.qk = THREE.MathUtils.clamp(this.qk + (q > qMax && vr > 50 ? -1.5 : 0.6) * dt, floor, 1);
    return this.qk;
  }
  constructor(readonly host: SurfaceAPHost, readonly apTarget: number, readonly climbAlt: number, readonly maxVr = 160) {}

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
        if (agl > 18) c.gearDown = false;
        if (this.tiny === null) this.tiny = g.length() < 0.02;
        if (agl > 35) {
          this.phase = this.tiny ? 'hop' : 'pitch';
          this.host.say('computer', this.tiny ? 'Clear of the surface. Climbing to orbit on the hover thrusters.' : 'Clear of the surface. Pitching over.');
        }
        return { msg: `Lift-off — ${agl.toFixed(0)} m` };
      }
      case 'hop':
      case 'orbit': {
        const hGoal = this.apTarget;
        const vc = Math.sqrt(s.mu / (s.r - s.alt + hGoal));
        const dh = hGoal - s.alt;
        const aDec = 0.2 + g.length();
        const vrCap = THREE.MathUtils.clamp(0.7 * Math.sqrt(2 * aDec * hGoal), 5, 120);
        const vrDes = Math.sign(dh) * Math.min(vrCap, Math.sqrt(2 * aDec * Math.abs(dh)) * 0.8);
        const vhDes = vc * THREE.MathUtils.clamp((s.alt - 0.1 * hGoal) / (0.6 * hGoal), 0, 1);
        const hv = v.clone().addScaledVector(up, -v.dot(up));
        const hdir = hv.lengthSq() > 0.25 ? hv.normalize() : east;
        const a = up.clone().multiplyScalar((vrDes - s.vr) * 0.4).addScaledVector(hdir, (vhDes - s.vh) * 0.25).sub(g);
        vtolAllocate(c, a, up, hdir, 1.35, true);
        const tol = 0.03 * vc + 0.05;
        if (this.phase === 'hop' && Math.abs(dh) < 0.03 * hGoal && Math.abs(s.vr) < tol && Math.abs(s.vh - vc) < tol) {
          this.phase = 'orbit';
          this.host.say('computer', `Orbit achieved — ${(s.pe / 1000).toFixed(1)} by ${(s.ap / 1000).toFixed(1)} kilometres.`);
        }
        if (this.phase === 'orbit') return { msg: `Orbit achieved — ${(s.pe / 1000).toFixed(1)} × ${(s.ap / 1000).toFixed(1)} km` };
        return { msg: `Climbing to orbit — ${(s.alt / 1000).toFixed(2)} km, V/S ${s.vr.toFixed(1)}, H ${s.vh.toFixed(1)} / ${vc.toFixed(1)} m/s`, timeScale: 4 };
      }
      case 'pitch': {
        const dir = east.clone().multiplyScalar(Math.cos(1.05)).addScaledVector(up, Math.sin(1.05)).normalize();
        c.sas = 'target';
        c.attTarget.copy(lookQuat(dir, up));
        // hover on the VTOL thrusters while the nose comes up
        const aV = (c.spec.vtolThrust * c.efficiency) / c.mass;
        c.vtol = THREE.MathUtils.clamp((g.length() * 1.05) / Math.max(0.3, c.upVec().dot(up)) / aV, 0, 1);
        if (c.forward().angleTo(dir) < 0.3) {
          this.phase = 'burn';
          this.host.say('computer', 'Main engine ignition.');
        }
        return { msg: 'Pitch-over' };
      }
      case 'burn': {
        if (s.ap >= this.apTarget) {
          c.vtol = 0;
          this.phase = 'coast';
          c.throttle = 0;
          this.host.say('computer', `Main engine cutoff. Apoapsis ${(this.apTarget / 1000).toFixed(0)} kilometres.`);
          break;
        }
        c.vtol = THREE.MathUtils.damp(c.vtol, 0, 2, dt);
        const hv = v.clone().addScaledVector(up, -v.dot(up));
        // below 40 m/s the ground track is not yet a direction worth following (and must not flip the heading)
        const hdir = hv.lengthSq() > 1600 ? hv.normalize() : east;
        const vrDes = THREE.MathUtils.clamp((this.climbAlt - s.alt) / 45, -15, this.maxVr);
        // pitch from the vertical balance: weight less centrifugal relief, plus the climb-rate error, over the thrust
        // available — steep on heavy worlds (Miller), shallow on the Moon
        const gEff = g.length() - (s.vh * s.vh) / s.r;
        const aMain = Math.max(1e-3, c.maxAccel() * this.qk);
        // climbing too slowly for the profile: allow more angle of attack so the gravity turn cannot sag into a dive
        const short = s.alt < this.climbAlt && s.vr < Math.min(vrDes, 80) - 25;
        const theta = aoaLimit(Math.asin(THREE.MathUtils.clamp((gEff + 0.08 * (vrDes - s.vr)) / aMain, -0.15, 0.97)), v, up, env.density(c.pos), short ? 0.35 : 0);
        const dir = hdir.multiplyScalar(Math.cos(theta)).addScaledVector(up, Math.sin(theta)).normalize();
        c.sas = 'target';
        c.attTarget.copy(lookQuat(dir, up));
        const margin = (this.apTarget - s.ap) / 8e3;
        c.throttle = (c.forward().angleTo(dir) < 0.35 ? THREE.MathUtils.clamp(margin, 0.1, 1) : 0.15) * this.qLimit(c, env, dt);
        return { msg: `Ascent — ${(s.alt / 1000).toFixed(1)} km, apoapsis ${(Math.max(0, s.ap) / 1000).toFixed(1)} km`, timeScale: s.alt > 3000 ? 4 : 1 };
      }
    }
    // coast toward the handover altitude
    c.throttle = 0;
    c.vtol = 0;
    c.sas = 'prograde';
    return { msg: `Coasting up — ${(s.alt / 1000).toFixed(1)} km`, timeScale: 4 };
  }
}
