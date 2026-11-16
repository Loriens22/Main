import * as THREE from 'three';
import { clamp } from '../core/math';
import type { Spacecraft } from './Spacecraft';

const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Quaternion();
const _err = new THREE.Vector3(), _w = new THREE.Vector3(), _wt = new THREE.Vector3(), _a = new THREE.Vector3();

/**
 * Attitude autopilot: drives the reaction control to a target orientation while matching a target angular
 * velocity (a spinning docking port). Per body axis a square-root profile commands the rate that can still be
 * stopped with the available torque, then a rate loop turns that into a torque command.
 * Returns the remaining attitude error in radians.
 */
export function steerAttitude(c: Spacecraft, target: THREE.Quaternion, omegaWorld: THREE.Vector3 | null, opts: { maxRate?: number | [number, number, number]; gain?: number; errOut?: THREE.Vector3 } = {}) {
  const q = c.quaternion(_q);
  _qi.copy(q).invert();
  _e.copy(_qi).multiply(target);
  if (_e.w < 0) { _e.x = -_e.x; _e.y = -_e.y; _e.z = -_e.z; _e.w = -_e.w; }
  const ang = 2 * Math.acos(clamp(_e.w, -1, 1));
  _err.set(_e.x, _e.y, _e.z);
  if (_err.lengthSq() > 1e-12) _err.normalize().multiplyScalar(ang); else _err.set(0, 0, 0);
  c.angVel(_w).applyQuaternion(_qi);
  if (omegaWorld) _wt.copy(omegaWorld).applyQuaternion(_qi); else _wt.set(0, 0, 0);
  const m = c.mass, s = c.spec, gain = opts.gain ?? 4;
  const mr = opts.maxRate ?? 0.12;
  opts.errOut?.copy(_err);
  for (let i = 0; i < 3; i++) {
    const maxRate = typeof mr === 'number' ? mr : mr[i];
    const I = s.inertia[i] * m, T = s.rcs.torque[i];
    const amax = (T / I) * 0.6;
    const e = _err.getComponent(i);
    const toward = Math.sign(e) * Math.min(Math.sqrt(2 * amax * Math.abs(e)), maxRate, 1.6 * Math.abs(e));
    const want = _wt.getComponent(i) + toward;
    const torque = clamp(I * (want - _w.getComponent(i)) * gain, -T, T);
    // a dead zone so the thrusters do not chatter once settled
    const cmd = torque / T;
    c.rot.setComponent(i, Math.abs(cmd) < 0.012 ? 0 : cmd);
  }
  return ang;
}

/** Command the translation thrusters to produce a world-frame acceleration (clamped to the available thrust). */
export function steerTranslation(c: Spacecraft, accelWorld: THREE.Vector3) {
  _qi.copy(c.quaternion(_q)).invert();
  _a.copy(accelWorld).applyQuaternion(_qi);
  const k = c.mass / c.spec.rcs.thrust;
  const x = clamp(_a.x * k, -1, 1), y = clamp(_a.y * k, -1, 1), z = clamp(-_a.z * k, -1, 1);
  c.trans.set(Math.abs(x) < 0.01 ? 0 : x, Math.abs(y) < 0.01 ? 0 : y, Math.abs(z) < 0.01 ? 0 : z);
}

/** Maximum acceleration (m/s^2) the translation thrusters give along any one axis. */
export const rcsAccel = (c: Spacecraft) => c.spec.rcs.thrust / c.mass;
