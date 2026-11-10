import * as THREE from 'three';
import type { V3 } from './kepler';

/**
 * Earth-centred inertial frame in three.js axis convention (metres):
 *   +Y = north pole (rotation axis), +X = vernal equinox direction, −Z = 90° east of it (right-handed).
 * Standard ECI/ECEF (x, y, z) maps to three (x, z, −y).
 */
export const MU_EARTH = 3.986004418e14;
export const R_EARTH = 6.371e6;
export const EARTH_ATMO = { rho0: 1.225, H: 8500 };
const DAY = 86400;

/** Greenwich mean sidereal angle (rad) at Earth time t (s since J2000). */
export function gmst(t: number) {
  const d = t / DAY;
  return (4.894961212823059 + 6.300388098984891 * d) % (2 * Math.PI);
}

/** Unit sun direction in the ECI (three) frame. Low-precision solar ephemeris (≈0.01°). */
export function sunDirECI(t: number, out = new THREE.Vector3()) {
  const d = t / DAY;
  const L = THREE.MathUtils.degToRad(280.46 + 0.9856474 * d);
  const g = THREE.MathUtils.degToRad(357.528 + 0.9856003 * d);
  const lam = L + THREE.MathUtils.degToRad(1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const eps = THREE.MathUtils.degToRad(23.439);
  // equatorial (x, y, z) = (cos λ, cos ε sin λ, sin ε sin λ) → three (x, z, −y)
  return out.set(Math.cos(lam), Math.sin(eps) * Math.sin(lam), -Math.cos(eps) * Math.sin(lam)).normalize();
}

/** Local site basis (three ECEF): up, east, north for latitude/longitude in degrees. */
export function siteBasisECEF(latDeg: number, lonDeg: number) {
  const la = THREE.MathUtils.degToRad(latDeg), lo = THREE.MathUtils.degToRad(lonDeg);
  const s = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y); // std → three
  return {
    up: s(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)),
    east: s(-Math.sin(lo), Math.cos(lo), 0),
    north: s(-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)),
  };
}

/** Rotate an Earth-fixed (three) vector into the inertial frame at time t. */
export function ecefToEci(v: THREE.Vector3, t: number, out = new THREE.Vector3()) {
  return out.copy(v).applyAxisAngle(new THREE.Vector3(0, 1, 0), gmst(t));
}

export function gravityAt(p: V3): V3 {
  const r2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
  const r = Math.sqrt(r2);
  const k = -MU_EARTH / (r2 * r);
  return [p[0] * k, p[1] * k, p[2] * k];
}

export function densityAt(p: V3) {
  const h = Math.hypot(p[0], p[1], p[2]) - R_EARTH;
  return h > 160000 ? 0 : EARTH_ATMO.rho0 * Math.exp(-Math.max(0, h) / EARTH_ATMO.H);
}

/** Orbital summary in the three ECI frame (inclination measured from the +Y pole). */
export function orbitSummary(r: V3, v: V3) {
  const R = new THREE.Vector3(...r), Vv = new THREE.Vector3(...v);
  const rn = R.length(), v2 = Vv.lengthSq();
  const h = new THREE.Vector3().crossVectors(R, Vv);
  const energy = v2 / 2 - MU_EARTH / rn;
  const a = -MU_EARTH / (2 * energy);
  const ev = R.clone().multiplyScalar(v2 - MU_EARTH / rn).sub(Vv.clone().multiplyScalar(R.dot(Vv))).divideScalar(MU_EARTH);
  const e = ev.length();
  const p = h.lengthSq() / MU_EARTH;
  return {
    a, e,
    pe: p / (1 + e) - R_EARTH,
    ap: e < 1 ? p / (1 - e) - R_EARTH : Infinity,
    period: e < 1 && a > 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / MU_EARTH) : Infinity,
    inc: Math.acos(THREE.MathUtils.clamp(h.y / h.length(), -1, 1)),
    alt: rn - R_EARTH,
    vr: R.dot(Vv) / rn,
  };
}
