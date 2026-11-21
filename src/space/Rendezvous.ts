import * as THREE from 'three';
import { bus } from '../core/events';
import { clamp } from '../core/math';
import type { Autopilot } from '../vehicles/Flight';
import type { FlightEnv, SasMode, Spacecraft } from '../vehicles/Spacecraft';
import { DockAutopilot, DockingSystem, DockPort } from '../vehicles/Docking';
import { rcsAccel, steerAttitude, steerTranslation } from '../vehicles/Guidance';
import { cwPropagate, cwTarget } from './Orbit';

/** What the rendezvous program needs from the orbital zone it flies in. */
export interface OrbitContext {
  /** mean motion of the target's circular orbit (rad/s) */
  n: number;
  docking: DockingSystem;
  /** time compression (sim seconds per real second) while the craft coasts on an analytic trajectory */
  setWarp(w: number): void;
}

export const GATE_DIST = 50;

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * Rendezvous to the docking approach gate of a free port: plans a two-impulse Clohessy-Wiltshire transfer
 * (transfer time chosen for the lowest delta-v with a safe miss distance from the ship), executes the first
 * burn closed-loop with the translation thrusters, coasts on the exact relative-motion solution under time
 * compression while turning to the docking attitude, then brakes and holds station at the gate. With
 * `thenDock` it hands over to the automatic docking program.
 */
export class RendezvousAutopilot implements Autopilot {
  name = 'Rendezvous';
  phase: 'plan' | 'burn1' | 'coast' | 'brake' | 'hold' | 'done' | 'abort' = 'plan';
  carriedOk = true;
  port: DockPort | null = null;
  T = 0;
  /** elapsed sim time on the transfer */
  tc = 0;
  dv1 = 0;
  dv2 = 0;
  private p0 = new THREE.Vector3();
  private v0 = new THREE.Vector3();
  private q0 = new THREE.Quaternion();
  private gate = new THREE.Vector3();
  private gateQ = new THREE.Quaternion();
  private prevSas: SasMode = 'rate';
  private holdT = 0;
  private craft: Spacecraft | null = null;
  private realCoast = 0;

  constructor(private ctx: OrbitContext, private thenDock = true) {}

  status() {
    const s = { plan: 'planning', burn1: 'transfer burn', coast: 'coasting', brake: 'braking', hold: 'gate hold', done: 'at gate', abort: 'aborted' }[this.phase];
    if (this.phase === 'coast') return `${s} T-${Math.max(0, this.T - this.tc).toFixed(0)} s`;
    return s;
  }

  stop() {
    this.ctx.setWarp(1);
    const c = this.craft;
    if (c && c.carried && this.phase === 'coast') this.leaveCoast(c);
    if (c) { c.sas = this.prevSas; c.rot.set(0, 0, 0); c.trans.set(0, 0, 0); }
    if (this.port?.reservedFor === c && this.phase !== 'done') this.port.reservedFor = null;
  }

  next(): Autopilot | null {
    return this.thenDock && this.phase === 'done' ? new DockAutopilot(this.ctx.docking) : null;
  }

  /** CoM position and attitude for the craft at the approach gate of the port */
  private gatePose(c: Spacecraft, port: DockPort, outP: THREE.Vector3, outQ: THREE.Quaternion) {
    this.ctx.docking.dockedPose(c, port, outP, outQ);
    outP.add(_a.copy(c.comModel).applyQuaternion(outQ));
    const pp = new THREE.Vector3(), pd = new THREE.Vector3(), pu = new THREE.Vector3();
    port.pose(pp, pd, pu);
    // the docked attitude rotates with a spinning host; at the gate hold the spin-free attitude
    return outP.addScaledVector(pd, GATE_DIST);
  }

  private plan(c: Spacecraft) {
    const n = this.ctx.n;
    const p = c.position(new THREE.Vector3()), v = c.velocity(new THREE.Vector3());
    const P = (2 * Math.PI) / n;
    let best: { T: number; v0: THREE.Vector3; vf: THREE.Vector3; cost: number } | null = null;
    for (let k = 1; k <= 22; k++) {
      const T = (k / 50) * P;
      const sol = cwTarget(p, this.gate, n, T);
      if (!sol) continue;
      // keep clear of the ship: sample the arc, ignoring its last stretch toward the gate
      let clear = true;
      for (let i = 1; i < 24; i++) {
        cwPropagate(p, sol.v0, n, (T * i) / 24, _p, _v);
        if (_p.length() < 110 && i < 22) { clear = false; break; }
      }
      if (!clear) continue;
      // a little extra delta-v for a quicker transfer is worth it (the RCS has plenty for these distances)
      const cost = sol.v0.distanceTo(v) + sol.vf.length() + T * 0.02;
      if (!best || cost < best.cost) best = { T, v0: sol.v0, vf: sol.vf, cost };
    }
    if (!best) return false;
    this.T = best.T;
    this.dv1 = best.v0.distanceTo(v);
    this.dv2 = best.vf.length();
    this.tc = 0;
    return true;
  }

  private leaveCoast(c: Spacecraft) {
    // hand the craft back to the integrator on the propagated state
    const q = c.quaternion(_q);
    cwPropagate(this.p0, this.v0, this.ctx.n, this.tc, _p, _v);
    c.setCarried(false);
    c.place(_p.clone().sub(_a.copy(c.comModel).applyQuaternion(q)), q.clone(), _v);
  }

  step(c: Spacecraft, dt: number, env: FlightEnv) {
    this.craft = c;
    const n = this.ctx.n;
    if (this.phase === 'plan') {
      this.port = this.ctx.docking.nearestPort(c, 'ranger');
      if (!this.port) { this.phase = 'abort'; bus.emit('rdv:abort', 'No free docking port'); return true; }
      this.port.reservedFor = c;
      this.gatePose(c, this.port, this.gate, this.gateQ);
      this.prevSas = c.sas;
      c.sas = 'off';
      if (c.position(_p).distanceTo(this.gate) < 25) { this.phase = 'brake'; return false; }
      if (!this.plan(c)) { this.phase = 'abort'; bus.emit('rdv:abort', 'No safe transfer'); c.sas = this.prevSas; return true; }
      this.phase = 'burn1';
      bus.emit('rdv:plan', { T: this.T, dv1: this.dv1, dv2: this.dv2 });
    }
    const amax = rcsAccel(c) * 0.9;
    const p = c.position(new THREE.Vector3()), v = c.velocity(new THREE.Vector3());
    if (this.phase === 'burn1') {
      this.tc += dt;
      const Trem = this.T - this.tc;
      const sol = cwTarget(p, this.gate, n, Math.max(Trem, 30));
      if (!sol) { this.phase = 'brake'; return false; }
      const dv = sol.v0.sub(v);
      steerAttitude(c, c.quaternion(_q), null);
      // thrust toward the required velocity, cancelling the frame's apparent acceleration
      _a.copy(dv).multiplyScalar(1.5).clampLength(0, amax);
      if (env.accel) _a.sub(env.accel(p, v, new THREE.Vector3()));
      steerTranslation(c, _a);
      if (dv.length() < 0.03) {
        c.trans.set(0, 0, 0); c.rot.set(0, 0, 0);
        this.p0.copy(p); this.v0.copy(v); this.q0.copy(c.quaternion(_q));
        this.T = Trem; this.tc = 0; this.realCoast = 0;
        c.setCarried(true);
        this.phase = 'coast';
        bus.emit('rdv:coast', { T: this.T });
      }
      return false;
    }
    if (this.phase === 'coast') {
      // exact relative-motion coast under time compression; the craft turns to the docking attitude meanwhile
      const rem = this.T - this.tc;
      const warp = rem > 600 ? 150 : rem > 200 ? 60 : rem > 60 ? 20 : rem > 15 ? 6 : 2;
      this.ctx.setWarp(warp);
      this.tc = Math.min(this.T - 2, this.tc + dt * warp);
      this.realCoast += dt;
      cwPropagate(this.p0, this.v0, n, this.tc, _p, _v);
      const k = clamp(this.realCoast / 9, 0, 1), e = k * k * (3 - 2 * k);
      const q = new THREE.Quaternion().slerpQuaternions(this.q0, this.gateQ, e);
      c.carry(_p.clone().sub(_a.copy(c.comModel).applyQuaternion(q)), q);
      if (this.tc >= this.T - 2 && k >= 1) {
        this.ctx.setWarp(1);
        this.leaveCoast(c);
        this.phase = 'brake';
        this.holdT = 0;
        bus.emit('rdv:brake', {});
      }
      return false;
    }
    // ---- braking and station keeping at the gate (position and velocity loop)
    steerAttitude(c, this.gateQ, null);
    const e = this.gate.clone().sub(p);
    const vWant = e.clone().multiplyScalar(0.25).clampLength(0, 2.5);
    _a.copy(vWant).sub(v).multiplyScalar(1.2).clampLength(0, amax);
    if (env.accel) _a.sub(env.accel(p, v, new THREE.Vector3()));
    steerTranslation(c, _a);
    if (e.length() < 2.0 && v.length() < 0.08) {
      this.holdT += dt;
      if (this.holdT > 0.6) {
        this.phase = 'done';
        c.trans.set(0, 0, 0); c.rot.set(0, 0, 0);
        c.sas = this.prevSas;
        if (this.port?.reservedFor === c && !this.thenDock) this.port.reservedFor = null;
        bus.emit('rdv:gate', {});
        return true;
      }
    } else this.holdT = 0;
    return false;
  }
}
