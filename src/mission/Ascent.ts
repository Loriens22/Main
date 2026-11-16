import { airDensity, D2R, G0, LAUNCH_SITE, MU_EARTH, OMEGA_EARTH, PARKING_ALT, pressureRatio, R_EARTH } from '../space/Earth';
import { LAUNCHER } from './Mission';

export interface Stage { name: string; dry: number; prop: number; thrustVac: number; thrustSL: number; ispVac: number; ispSL: number }

export type AscentEvent = 'liftoff' | 'tower' | 'pitch' | 'maxq' | 'meco' | 'separation' | 'ignition2' | 'seco' | 'rangerBurn' | 'rangerCutoff' | 'orbit' | 'recovery';

/**
 * Planar ascent of the launch stack in the inertial orbit plane: polar state (r, phi, vr, vt), inverse-square
 * gravity, thrust and specific impulse that vary with ambient pressure, drag against the rotating atmosphere,
 * propellant mass flow and staging. Guidance: vertical rise out of the silo, pitch kick, gravity turn on the first
 * stage, then a closed-loop climb-rate law on the second stage that cuts off at circular velocity.
 */
export class AscentSim {
  t = 0;
  r = R_EARTH;
  phi = 0;
  vr = 0;
  vt: number;
  m: number;
  stage = 0;
  stages: Stage[];
  payload: number;
  pitch = Math.PI / 2;
  throttle = 1;
  q = 0;
  maxQ = 0;
  accel = 0;
  burning = true;
  done = false;
  targetR = R_EARTH + PARKING_ALT;
  private sepTimer = -1;
  private seen = new Set<AscentEvent>();
  onEvent: ((e: AscentEvent) => void) | null = null;
  /** drag area (Cd*A, m^2) of the stack */
  cdA = 0.3 * Math.PI * 3.4 * 3.4;
  /** altitude at which the stack leaves the silo mouth (m above the pad datum) */
  siloClear = 130;
  /** pilot steering: the commanded pitch is flown instead of the guidance solution */
  manual = false;
  pitchCmd = Math.PI / 2;
  /** pitch the guidance would fly now (the flight director cue shown to a manual pilot) */
  guidePitch = Math.PI / 2;

  constructor() {
    const L = LAUNCHER;
    this.stages = [
      { name: 'First stage', dry: L.stage1.dry, prop: L.stage1.prop, thrustVac: L.stage1.thrust * 1.1, thrustSL: L.stage1.thrust, ispVac: 311, ispSL: L.stage1.isp },
      { name: 'Second stage', dry: L.stage2.dry, prop: L.stage2.prop, thrustVac: L.stage2.thrust, thrustSL: L.stage2.thrust * 0.6, ispVac: L.stage2.isp, ispSL: 300 },
      { name: 'Ranger 1', dry: L.ranger - 6000, prop: 6000, thrustVac: 240000, thrustSL: 200000, ispVac: 360, ispSL: 300 },
    ];
    this.payload = L.adapter;
    this.m = this.stages.reduce((a, s) => a + s.dry + s.prop, 0) + this.payload;
    /** Ranger propellant used to finish the insertion (kg) */
    // inertial start: the pad moves east with the Earth's rotation; a due-east launch keeps all of it
    this.vt = OMEGA_EARTH * R_EARTH * Math.cos(LAUNCH_SITE.lat * D2R);
  }

  get h() { return this.r - R_EARTH; }
  get propLeft() { return this.stages[this.stage]?.prop ?? 0; }
  /** speed relative to the ground (rotating atmosphere) */
  get airSpeed() { const vAir = this.vt - OMEGA_EARTH * this.r * Math.cos(LAUNCH_SITE.lat * D2R); return Math.hypot(this.vr, vAir); }
  get speed() { return Math.hypot(this.vr, this.vt); }
  get downrange() { return this.phi * R_EARTH; }
  get vCirc() { return Math.sqrt(MU_EARTH / this.r); }

  private fire(e: AscentEvent) {
    if (this.seen.has(e)) return;
    this.seen.add(e);
    this.onEvent?.(e);
  }

  step(dt: number) {
    if (this.done) return;
    this.t += dt;
    const st = this.stages[this.stage];
    const pr = pressureRatio(this.h);
    let T = 0, mdot = 0;
    if (this.burning && st && st.prop > 0) {
      T = (st.thrustSL + (st.thrustVac - st.thrustSL) * (1 - pr)) * this.throttle;
      const isp = st.ispSL + (st.ispVac - st.ispSL) * (1 - pr);
      mdot = T / (isp * G0);
    }
    // ---- guidance
    const g = MU_EARTH / (this.r * this.r);
    const vAir = this.vt - OMEGA_EARTH * this.r * Math.cos(LAUNCH_SITE.lat * D2R);
    if (this.stage === 0) {
      if (this.h < this.siloClear + 60 || this.t < 12) this.pitch = Math.PI / 2;
      else {
        if (this.t > 12) this.fire('pitch');
        // altitude-scheduled pitch program, limited to a few degrees of angle of attack while the air is dense
        const prog = (90 - 78 * Math.pow(Math.min(1, this.h / 85e3), 0.5)) * D2R;
        const fpa = Math.atan2(this.vr, Math.max(vAir, 1));
        const aoa = this.q > 8000 ? 3 * D2R : 12 * D2R;
        const target = Math.max(Math.min(prog, fpa + aoa), fpa - aoa);
        this.guidePitch = target;
        // a manual pilot is limited to the same structural angle of attack while the air is dense
        const want = this.manual ? Math.max(Math.min(this.pitchCmd, fpa + aoa * 1.5), fpa - aoa * 1.5) : target;
        this.pitch += Math.max(-0.6 * D2R * dt * 60, Math.min(0.6 * D2R * dt * 60, want - this.pitch)) * 0.1;
      }
    } else if (T > 0) {
      // linear vertical-acceleration law: reach the target radius with zero vertical speed when the horizontal
      // speed becomes circular. Time to go from the rocket equation for the remaining horizontal delta-v.
      const isp = st.ispSL + (st.ispVac - st.ispSL) * (1 - pr);
      const ve = isp * G0;
      const dv = Math.max(1, Math.sqrt(MU_EARTH / this.targetR) - this.vt);
      const tgo = Math.max(8, (this.m / Math.max(mdot, 1e-3)) * (1 - Math.exp(-dv / ve)));
      const dh = this.targetR - this.r;
      const a0 = (6 * dh - 4 * this.vr * tgo) / (tgo * tgo);
      const need = a0 + g - (this.vt * this.vt) / this.r;
      const s = Math.max(-0.5, Math.min(0.85, need / (T / this.m)));
      this.guidePitch = Math.asin(s);
      if (this.manual) {
        this.pitch += Math.max(-2 * D2R * dt, Math.min(2 * D2R * dt, this.pitchCmd - this.pitch));
        // Creative Mode safety net: a trajectory heading back into the atmosphere hands control to guidance
        if (this.vr < -40 && this.h < 90e3) { this.manual = false; this.fire('recovery'); }
      } else this.pitch = this.guidePitch;
    }
    // ---- forces in polar form
    const aT = T / this.m;
    let ar = aT * Math.sin(this.pitch), at = aT * Math.cos(this.pitch);
    const rho = airDensity(this.h);
    const vRel = Math.hypot(this.vr, vAir);
    this.q = 0.5 * rho * vRel * vRel;
    if (vRel > 0.1 && rho > 0) {
      const D = (this.q * this.cdA) / this.m;
      ar -= (D * this.vr) / vRel;
      at -= (D * vAir) / vRel;
    }
    if (this.q > this.maxQ) this.maxQ = this.q;
    else if (this.maxQ > 5000 && this.q < this.maxQ * 0.97) this.fire('maxq');
    this.accel = aT;
    const dvr = (this.vt * this.vt) / this.r - g + ar;
    const dvt = (-this.vr * this.vt) / this.r + at;
    this.vr += dvr * dt;
    this.vt += dvt * dt;
    // on the pad: nothing moves until thrust beats weight
    if (this.r <= R_EARTH && this.vr < 0) { this.vr = 0; this.vt = OMEGA_EARTH * R_EARTH * Math.cos(LAUNCH_SITE.lat * D2R); }
    this.r += this.vr * dt;
    this.phi += (this.vt / this.r) * dt;
    if (this.r < R_EARTH) this.r = R_EARTH;
    if (this.h > 2) this.fire('liftoff');
    if (this.h > this.siloClear) this.fire('tower');
    // ---- propellant and staging
    if (st && mdot > 0) {
      const dm = Math.min(st.prop, mdot * dt);
      st.prop -= dm;
      this.m -= dm;
      if (st.prop <= 0) {
        this.burning = false;
        if (this.stage === 0) { this.fire('meco'); this.sepTimer = 3; }
        if (this.stage === 2) { this.done = true; this.fire('rangerCutoff'); }
      }
    }
    if (this.sepTimer > 0) {
      this.sepTimer -= dt;
      if (this.sepTimer <= 1.5 && this.stage === 0) { this.fire('separation'); this.m -= st.dry; this.stage = 1; }
      if (this.sepTimer <= 0) { this.burning = true; this.fire('ignition2'); this.sepTimer = -1; }
    }
    // ---- cutoff at circular velocity near the target radius (or when the second stage runs dry)
    if (this.stage >= 1 && this.burning && this.vt >= this.vCirc - 0.5) {
      this.burning = false;
      this.fire(this.stage === 1 ? 'seco' : 'rangerCutoff');
      this.done = true;
      this.fire('orbit');
    } else if (this.stage === 1 && !this.burning && this.stages[1].prop <= 0 && !this.done) {
      // second stage depleted short of orbit: separate and let the Ranger's own engines finish the insertion
      this.fire('seco');
      this.m -= this.stages[1].dry + LAUNCHER.adapter;
      this.stage = 2;
      this.burning = true;
      this.fire('rangerBurn');
    }
  }
}
