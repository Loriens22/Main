import * as THREE from 'three';

/** Earth constants (SI). */
export const MU_EARTH = 3.986004418e14;
export const R_EARTH = 6371e3;
export const OMEGA_EARTH = 7.2921159e-5;
export const OBLIQUITY = (23.439 * Math.PI) / 180;
export const G0 = 9.80665;

/** The concealed facility: Colorado front range, the old air-defence mountain. */
export const LAUNCH_SITE = { lat: 38.744, lon: -104.846 };

/** Endurance parking orbit: circular, inclination equal to the site latitude so a due-east launch reaches it. */
export const PARKING_ALT = 400e3;

export const D2R = Math.PI / 180;

/** ECEF unit vector of a geocentric latitude / longitude (degrees). ECEF: x lon 0, y lon 90E, z north. */
export function latLonToEcef(lat: number, lon: number, out = new THREE.Vector3()) {
  const la = lat * D2R, lo = lon * D2R;
  return out.set(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
}

/** Rotate an ECEF vector into ECI for Earth rotation angle theta (rad). */
export function ecefToEci(v: THREE.Vector3, theta: number, out = new THREE.Vector3()) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return out.set(c * v.x - s * v.y, s * v.x + c * v.y, v.z);
}

export function eciToEcef(v: THREE.Vector3, theta: number, out = new THREE.Vector3()) {
  return ecefToEci(v, -theta, out);
}

/** Sun direction in ECI for a day of the year (low-precision solar ephemeris). */
export function sunEci(dayOfYear: number, out = new THREE.Vector3()) {
  const L = (280.46 + 0.9856474 * dayOfYear) * D2R;
  const g = (357.528 + 0.9856003 * dayOfYear) * D2R;
  const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  return out.set(Math.cos(lam), Math.sin(lam) * Math.cos(OBLIQUITY), Math.sin(lam) * Math.sin(OBLIQUITY));
}

/**
 * Earth rotation angle that puts the sun at a given local solar time (hours) over a longitude.
 * Local hour angle of the sun = (hours - 12) * 15 deg = LST - RA_sun, and LST = theta + lon.
 */
export function thetaForLocalTime(dayOfYear: number, hours: number, lonDeg: number) {
  const s = sunEci(dayOfYear);
  const ra = Math.atan2(s.y, s.x);
  return ra + (hours - 12) * 15 * D2R - lonDeg * D2R;
}

/**
 * A local orthonormal frame given in ECI: X forward (downrange / along-track), Y up (radial), Z = X x Y.
 * Converts ECI vectors to frame coordinates and orients the globe mesh.
 */
export class LocalFrame {
  X = new THREE.Vector3(1, 0, 0);
  Y = new THREE.Vector3(0, 1, 0);
  Z = new THREE.Vector3(0, 0, 1);

  set(up: THREE.Vector3, forward: THREE.Vector3) {
    this.Y.copy(up).normalize();
    this.X.copy(forward).addScaledVector(this.Y, -forward.dot(this.Y)).normalize();
    this.Z.crossVectors(this.X, this.Y);
    return this;
  }

  /** ECI vector -> frame coordinates */
  toLocal(v: THREE.Vector3, out = new THREE.Vector3()) {
    return out.set(v.dot(this.X), v.dot(this.Y), v.dot(this.Z));
  }

  /** frame coordinates -> ECI vector */
  toEci(v: THREE.Vector3, out = new THREE.Vector3()) {
    return out.set(0, 0, 0).addScaledVector(this.X, v.x).addScaledVector(this.Y, v.y).addScaledVector(this.Z, v.z);
  }

  /**
   * Orientation of the globe mesh (mesh frame: +Y north pole, lon 0 at +X, 90E at -Z) in this frame
   * for Earth rotation angle theta.
   */
  globeQuaternion(theta: number, out = new THREE.Quaternion()) {
    // mesh axes expressed in ECEF, then ECI, then in this frame
    const ax = ecefToEci(_e.set(1, 0, 0), theta, _a), ay = ecefToEci(_e.set(0, 0, 1), theta, _b), az = ecefToEci(_e.set(0, -1, 0), theta, _c);
    const cx = this.toLocal(ax, _d), cy = this.toLocal(ay, _f), cz = this.toLocal(az, _g);
    _m.makeBasis(cx, cy, cz);
    return out.setFromRotationMatrix(_m);
  }
}

const _e = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _d = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _m = new THREE.Matrix4();

/** Circular-orbit mean motion (rad/s) at radius r. */
export const meanMotion = (r: number) => Math.sqrt(MU_EARTH / (r * r * r));

/** Exponential standard atmosphere: density (kg/m^3) and pressure ratio at altitude h (m). */
export function airDensity(h: number) {
  if (h > 120e3) return 0;
  return 1.225 * Math.exp(-Math.max(0, h) / 8500);
}
export function pressureRatio(h: number) { return h > 120e3 ? 0 : Math.exp(-Math.max(0, h) / 7400); }
