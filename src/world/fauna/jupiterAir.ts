import * as THREE from 'three';

/**
 * Jupiter's air for the cloud-layer animals (world/fauna/jupiterSheet.ts) — an approximate flight model, not CFD:
 *   density   ρ(h) from the zone's own atmosphere (the same one Ranger 1 flies in: ρ₀ 0.17 kg/m³ at the 1-bar
 *             level, scale height 27 km)
 *   gravity   24.8 m/s² (≈2.5 g near 1 bar — not low gravity)
 *   wind      the local departure from the mean zonal jet the frame already moves with: a cross-band component
 *             that changes with height (vertical shear), slow meanders, gusts
 *   updrafts  convective cells ~1.6 km apart: a rising core with a ring of compensating downdraft, each cell
 *             waxing and waning over minutes
 * Each flyer integrates real forces against the RELATIVE wind at its body — weight, buoyancy (a gas inclusion that
 * offsets part of it; no free levitation), lift ½ρV²S·C_L at a bank angle, drag ½ρV²S·(C_D0 + k·C_L²), and a limited
 * thrust where the species has one. A glider that leaves rising air sinks; one in a core can climb (and does: the
 * Stormskimmer circles in cores to regain height, then glides on along its lane).
 */
export const G_JUP = 24.8;

export interface AeroBody {
  /** mass (kg) */
  m: number;
  /** lifting / reference area (m²) */
  S: number;
  CLmax: number;
  CD0: number;
  /** induced-drag factor */
  k: number;
  /** fraction of the weight carried by buoyancy (gas inclusions, thin warm envelopes) */
  buoy: number;
  /** maximum thrust (N): 0 for a pure glider */
  T: number;
  /** maximum bank (rad) */
  bank: number;
  /** steering gain: bank per radian of heading error (default 1.4; a pursuer closing on a target steers harder) */
  steer?: number;
}

export interface AeroState {
  bank: number;
  CL: number;
  /** airspeed (m/s) */
  V: number;
  rho: number;
  /** vertical air speed at the body (m/s) */
  w: number;
  /** thrust used (N) */
  T: number;
}

const _r = new THREE.Vector3();
const _l = new THREE.Vector3();
const _d = new THREE.Vector3();
const _h = new THREE.Vector3();
const _f = new THREE.Vector3();
const _wv = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function hash(i: number, j: number, s: number) {
  const x = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

const CELL = 1600;

export class JupiterAir {
  /** the air's own clock (s) — advanced once per frame by the fauna manager */
  t = 0;

  constructor(
    /** gas density at a world point (the zone's atmosphere) */
    readonly density: (p: THREE.Vector3) => number,
    /** the reference flight level (world y; the cloud-cruise level) that the corridors and the shear are measured from */
    readonly refY: number,
    readonly seed = 1,
  ) {}

  private cell(i: number, j: number) {
    const s = this.seed;
    const cx = (i + 0.2 + 0.6 * hash(i, j, s)) * CELL, cz = (j + 0.2 + 0.6 * hash(j, i, s + 3)) * CELL;
    const r = 260 + 220 * hash(i, j, s + 7);
    const W = 2.5 + 5 * hash(i, j, s + 11);
    // each cell breathes over several minutes (the life cycle of a convective plume)
    const life = 0.55 + 0.45 * Math.sin(this.t / (180 + 120 * hash(i, j, s + 13)) + 6.28 * hash(i, j, s + 17));
    return { cx, cz, r, W: W * life };
  }

  /** vertical air speed (m/s) at (x, z) from the convective cells */
  updraft(x: number, z: number) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    let w = 0;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const c = this.cell(ci + di, cj + dj);
        const d = Math.hypot(x - c.cx, z - c.cz);
        w += c.W * (Math.exp(-((d / c.r) ** 2)) * 1.6 - 0.45 * Math.exp(-(((d - 1.8 * c.r) / c.r) ** 2)));
      }
    }
    return w;
  }

  /** the strongest rising core within reach of (x, z): where a glider goes to regain height */
  core(x: number, z: number, out = new THREE.Vector3()) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    let best = -Infinity;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const c = this.cell(ci + di, cj + dj);
        // strength now, less a cost for the glide to reach it
        const score = c.W * 1.6 - Math.hypot(x - c.cx, z - c.cz) / 600;
        if (score > best) {
          best = score;
          out.set(c.cx, 0, c.cz);
        }
      }
    }
    return out;
  }

  /** the air's velocity (m/s) at p */
  wind(p: THREE.Vector3, out = new THREE.Vector3()) {
    const t = this.t;
    const dy = (p.y - this.refY) / 1000;
    // vertical shear: the cross-band component grows with height difference; slow meanders; gusts
    out.x = 6 * dy + 3 * Math.sin(p.z / 3800 + t / 400 + this.seed) + 1.2 * Math.sin(t * 0.9 + p.x / 90);
    out.z = -3 * dy + 2.5 * Math.cos(p.x / 4200 + t / 520) + 1.2 * Math.cos(t * 0.7 + p.z / 110);
    out.y = this.updraft(p.x, p.z) + 0.6 * Math.sin(t * 0.5 + p.x / 70 + p.z / 90);
    return out;
  }
}

/**
 * One integration step for a flying body. Control, like a pilot's: bank toward the goal's bearing; a lift
 * coefficient that holds or changes height and trades it for speed (limited by C_Lmax — near the stall it cannot
 * climb: it sinks and gains speed); thrust (if any) to the wanted airspeed. Writes `vel` and `pos`.
 */
export function aeroStep(b: AeroBody, air: JupiterAir, pos: THREE.Vector3, vel: THREE.Vector3, goal: THREE.Vector3, wantV: number, dt: number, thrustK = 1, out?: AeroState): AeroState {
  const rho = Math.max(1e-4, air.density(pos));
  const w = air.wind(pos, _wv);
  _r.subVectors(vel, w);                                    // velocity through the air; the relative wind is −_r
  let V = _r.length();
  if (V < 0.5) {
    _r.set(goal.x - pos.x, 0, goal.z - pos.z);
    if (_r.lengthSq() < 1e-6) _r.set(0, 0, -1);
    _r.setLength(0.5);
    V = 0.5;
  }
  const dir = _d.copy(_r).divideScalar(V);
  const q = 0.5 * rho * V * V;
  // bank toward the goal's bearing (a positive bank tilts the lift toward +dir × up … i.e. turns left of the flow
  // seen from above when the goal is left: the sign follows the heading error directly)
  _h.set(goal.x - pos.x, 0, goal.z - pos.z);
  const headErr = Math.atan2(dir.x * _h.z - dir.z * _h.x, dir.x * _h.x + dir.z * _h.z);
  const bank = THREE.MathUtils.clamp(headErr * (b.steer ?? 1.4), -b.bank, b.bank);
  // lift direction: up projected ⊥ to the airflow, rotated about the airflow by the bank
  _l.copy(_up).addScaledVector(dir, -dir.y);
  if (_l.lengthSq() < 1e-6) _l.set(1, 0, 0);
  _l.normalize().applyAxisAngle(dir, bank);
  const weight = b.m * G_JUP * (1 - b.buoy);
  let CL = 0;
  if (b.CLmax > 0) {
    // height control: proportional to the height error, damped by the climb rate through the air (no porpoising)
    const climb = THREE.MathUtils.clamp((goal.y - pos.y) / 160 - (vel.y - w.y) / 25, -1, 1.2);
    const CLlevel = weight / Math.max(1e-3, q * b.S * Math.cos(bank));
    // below the wanted airspeed, pitch down (less lift) to gain speed; above it, pitch up
    const speedK = THREE.MathUtils.clamp((V - wantV) / Math.max(1, wantV), -0.5, 0.5);
    CL = THREE.MathUtils.clamp(CLlevel * (1 + climb) * (1 + speedK), 0, b.CLmax);
  }
  const L = q * b.S * CL;
  const D = q * b.S * (b.CD0 + b.k * CL * CL);
  _f.copy(_l).multiplyScalar(L).addScaledVector(dir, -D);
  _f.y -= weight;
  let T = 0;
  if (b.T > 0) {
    T = THREE.MathUtils.clamp((wantV - V) * b.m * 0.6 + D * 0.9, 0, b.T * thrustK);
    // a swimmer pushes along its body (the flow); only a slow hoverer (a jetting squid, a bell) vectors its thrust
    // toward where it wants to go
    const hover = b.CLmax === 0 || V < 0.5 * wantV;
    _h.set(goal.x - pos.x, goal.y - pos.y, goal.z - pos.z);
    if (hover && _h.lengthSq() > 1e-6) _h.normalize().lerp(dir, 0.3).normalize();
    else _h.copy(dir);
    _f.addScaledVector(_h, T);
    // a powered swimmer can also hold its height by thrust where its lift is not enough (it pays in drag/energy)
    if (b.CLmax === 0 || CL >= b.CLmax * 0.98) {
      const want = THREE.MathUtils.clamp((goal.y - pos.y) * 0.02 - (vel.y - w.y) * 0.4, -1, 1);
      _f.y += Math.max(0, Math.min(b.T * thrustK - T, weight * (1 + want)));
    }
  }
  // drag-limited step: never overshoot the relative-wind equilibrium in one step (light bodies in strong drag)
  const kd = (0.5 * rho * V * b.S * (b.CD0 + b.k * CL * CL)) / b.m;
  if (kd * dt > 0.5) _f.addScaledVector(dir, D - (D * 0.5) / (kd * dt));
  vel.addScaledVector(_f, dt / b.m);
  pos.addScaledVector(vel, dt);
  const s = out ?? { bank: 0, CL: 0, V: 0, rho: 0, w: 0, T: 0 };
  s.bank = bank;
  s.CL = CL;
  s.V = V;
  s.rho = rho;
  s.w = w.y;
  s.T = T;
  return s;
}

/**
 * A heavy flyer's pursuit of a slow target (a racetrack, not a dogfight): run in on a lead point; if the pass misses
 * or the target lies too far off the nose to turn onto, extend straight out to about two turning circles, turn
 * and run in again. Writes the goal; returns the mode.
 */
export function pursue(st: { mode: 'in' | 'out' }, pos: THREE.Vector3, vel: THREE.Vector3, prey: THREE.Vector3, preyVel: THREE.Vector3, speed: number, turnR: number, goal: THREE.Vector3) {
  const dx = prey.x - pos.x, dz = prey.z - pos.z;
  const dh = Math.hypot(dx, dz);
  const hv = Math.hypot(vel.x, vel.z) || 1;
  const off = Math.acos(THREE.MathUtils.clamp((vel.x * dx + vel.z * dz) / (hv * Math.max(dh, 1e-3)), -1, 1));
  if (st.mode === 'in' && ((dh < 2.2 * turnR && off > 1.0) || (dh < 60 && off > 0.6))) st.mode = 'out';
  else if (st.mode === 'out' && dh > 2.2 * turnR) st.mode = 'in';
  if (st.mode === 'in') {
    const d = pos.distanceTo(prey);
    goal.copy(prey).addScaledVector(preyVel, d / Math.max(10, speed));
  } else {
    // straight out, away from the target (and at its height, ready for the next run)
    goal.set(pos.x - (dx / Math.max(dh, 1e-3)) * 2.5 * turnR, prey.y, pos.z - (dz / Math.max(dh, 1e-3)) * 2.5 * turnR);
    goal.addScaledVector(vel, 2);
  }
  return st.mode;
}
