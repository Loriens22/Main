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

/**
 * The body the local inertial frame is centred on (patched conics): Earth at launch, any planet/moon after an
 * interplanetary transfer, or the Sun during cruise. Orbital helpers below read it.
 */
export interface PrimaryBody { id: string; mu: number; R: number; rho0: number; H: number; top: number }
const ATMOS: Record<string, [number, number, number]> = {
  earth: [1.225, 8500, 160e3], mars: [0.02, 11100, 150e3], venus: [65, 15900, 250e3], titan: [5.4, 21000, 600e3],
  jupiter: [0.16, 27000, 1000e3], saturn: [0.19, 59500, 1000e3], uranus: [0.42, 27700, 800e3], neptune: [0.45, 19700, 800e3],
  miller: [1.4, 8500, 110e3], mann: [1.0, 9000, 80e3], edmunds: [1.1, 8500, 100e3],
};
export const PRIMARY: PrimaryBody = { id: 'earth', mu: MU_EARTH, R: R_EARTH, rho0: 1.225, H: 8500, top: 160e3 };
export function setPrimary(id: string, mu: number, R: number) {
  const a = ATMOS[id];
  PRIMARY.id = id;
  PRIMARY.mu = mu;
  PRIMARY.R = R;
  PRIMARY.rho0 = a ? a[0] : 0;
  PRIMARY.H = a ? a[1] : 1;
  PRIMARY.top = a ? a[2] : 0;
}

export function gravityAt(p: V3): V3 {
  const r2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
  const r = Math.sqrt(r2);
  const k = -PRIMARY.mu / (r2 * r);
  return [p[0] * k, p[1] * k, p[2] * k];
}

export function densityAt(p: V3) {
  const h = Math.hypot(p[0], p[1], p[2]) - PRIMARY.R;
  return h > PRIMARY.top || PRIMARY.rho0 === 0 ? 0 : PRIMARY.rho0 * Math.exp(-Math.max(0, h) / PRIMARY.H);
}

/** Orbital summary in the three ECI frame (inclination measured from the +Y pole). */
export function orbitSummary(r: V3, v: V3, mu = PRIMARY.mu, Rb = PRIMARY.R) {
  const R = new THREE.Vector3(...r), Vv = new THREE.Vector3(...v);
  const rn = R.length(), v2 = Vv.lengthSq();
  const h = new THREE.Vector3().crossVectors(R, Vv);
  const energy = v2 / 2 - mu / rn;
  const a = -mu / (2 * energy);
  const ev = R.clone().multiplyScalar(v2 - mu / rn).sub(Vv.clone().multiplyScalar(R.dot(Vv))).divideScalar(mu);
  const e = ev.length();
  const p = h.lengthSq() / mu;
  return {
    a, e,
    pe: p / (1 + e) - Rb,
    ap: e < 1 ? p / (1 - e) - Rb : Infinity,
    period: e < 1 && a > 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity,
    inc: Math.acos(THREE.MathUtils.clamp(h.y / h.length(), -1, 1)),
    alt: rn - Rb,
    vr: R.dot(Vv) / rn,
    /** horizontal (tangential) speed */
    vh: h.length() / rn,
    r: rn,
    mu,
  };
}

/** Lowest altitude a coasting orbit or transfer may reach around the current primary (atmosphere or terrain). */
export function safeOrbitAlt() {
  if (PRIMARY.id === 'sun') return 1e9;
  if (PRIMARY.rho0 > 0) return Math.min(150e3, PRIMARY.top * 0.8);
  return Math.min(20e3, 0.25 * PRIMARY.R);
}
