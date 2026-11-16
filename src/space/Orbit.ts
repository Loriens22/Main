import * as THREE from 'three';
import { D2R, ecefToEci, latLonToEcef, LocalFrame, MU_EARTH } from './Earth';

/*
 * Relative motion near a circular orbit (Clohessy-Wiltshire / Hill equations).
 *
 * Game convention for the local-vertical / local-horizontal frame (LVLH) centred on the target:
 *   X  along-track (direction of orbital motion)
 *   Y  radial, away from the Earth
 *   Z  X x Y (opposite the orbit normal)
 * In these axes the linearised equations read
 *   aX = -2 n vY
 *   aY =  3 n^2 Y + 2 n vX
 *   aZ = -n^2 Z
 * (the classic Hill frame with x radial, y along-track maps as x -> Y, y -> X; the out-of-plane equation is
 * symmetric, so the sign of Z does not matter).
 */

/** Apparent acceleration in the rotating LVLH frame: tidal gradient plus Coriolis. */
export function cwAccel(p: THREE.Vector3Like, v: THREE.Vector3Like, n: number, out = new THREE.Vector3()) {
  return out.set(-2 * n * v.y, 3 * n * n * p.y + 2 * n * v.x, -n * n * p.z);
}

/** Closed-form propagation of a relative state over time t (s). */
export function cwPropagate(p: THREE.Vector3Like, v: THREE.Vector3Like, n: number, t: number, outP = new THREE.Vector3(), outV = new THREE.Vector3()) {
  const c = Math.cos(n * t), s = Math.sin(n * t), nt = n * t;
  // Hill names: x radial, y along-track, z out of plane
  const x0 = p.y, y0 = p.x, z0 = p.z, vx = v.y, vy = v.x, vz = v.z;
  const x = (4 - 3 * c) * x0 + (s / n) * vx + (2 / n) * (1 - c) * vy;
  const y = 6 * (s - nt) * x0 + y0 - (2 / n) * (1 - c) * vx + ((4 * s - 3 * nt) / n) * vy;
  const z = c * z0 + (s / n) * vz;
  const dx = 3 * n * s * x0 + c * vx + 2 * s * vy;
  const dy = -6 * n * (1 - c) * x0 - 2 * s * vx + (4 * c - 3) * vy;
  const dz = -n * s * z0 + c * vz;
  outP.set(y, x, z);
  outV.set(dy, dx, dz);
  return outP;
}

/**
 * Two-impulse transfer between relative positions in time T: the velocity needed at the start and the velocity
 * on arrival (before the braking impulse). Returns null for degenerate transfer times (full orbits).
 */
export function cwTarget(p0: THREE.Vector3Like, pf: THREE.Vector3Like, n: number, T: number) {
  const c = Math.cos(n * T), s = Math.sin(n * T), nt = n * T;
  const x0 = p0.y, y0 = p0.x, z0 = p0.z;
  const xf = pf.y, yf = pf.x, zf = pf.z;
  // [xf, yf] = A [x0, y0] + B [vx, vy]
  const a11 = 4 - 3 * c, a21 = 6 * (s - nt);
  const b11 = s / n, b12 = (2 / n) * (1 - c), b21 = -(2 / n) * (1 - c), b22 = (4 * s - 3 * nt) / n;
  const rx = xf - a11 * x0, ry = yf - (a21 * x0 + y0);
  const det = b11 * b22 - b12 * b21;
  if (Math.abs(det) < 1e-9 || Math.abs(s) < 1e-6) return null;
  const vx = (b22 * rx - b12 * ry) / det;
  const vy = (-b21 * rx + b11 * ry) / det;
  const vz = ((zf - c * z0) * n) / s;
  const v0 = new THREE.Vector3(vy, vx, vz);
  const pfOut = new THREE.Vector3(), vf = new THREE.Vector3();
  cwPropagate(p0, v0, n, T, pfOut, vf);
  return { v0, vf };
}

/**
 * The orbit plane of a due-east launch: spanned by the launch site's position at lift-off and the local east
 * direction, so the inclination equals the site latitude and the site sits under the northernmost point.
 * Angles (phi) are measured in the plane from the launch site at lift-off, in the direction of motion.
 */
export class OrbitPlane {
  /** ECI unit vector to the launch site at lift-off */
  P = new THREE.Vector3();
  /** ECI unit vector due east at the site at lift-off */
  E = new THREE.Vector3();
  /** orbit normal (P x E) */
  N = new THREE.Vector3();

  /** A plane through an arbitrary inertial direction P with in-plane direction of motion E (any body). */
  static fromVectors(P: THREE.Vector3, E: THREE.Vector3) {
    const o = new OrbitPlane(0, 0, 0);
    o.P.copy(P).normalize();
    o.E.copy(E).addScaledVector(o.P, -E.dot(o.P)).normalize();
    o.N.crossVectors(o.P, o.E).normalize();
    return o;
  }

  constructor(lat: number, lon: number, theta0: number) {
    const site = ecefToEci(latLonToEcef(lat, lon), theta0, this.P).normalize();
    const lo = lon * D2R;
    const eastEcef = new THREE.Vector3(-Math.sin(lo), Math.cos(lo), 0);
    ecefToEci(eastEcef, theta0, this.E).normalize();
    this.N.crossVectors(site, this.E).normalize();
  }

  /** ECI position at radius r and in-plane angle phi */
  eci(r: number, phi: number, out = new THREE.Vector3()) {
    return out.copy(this.P).multiplyScalar(Math.cos(phi) * r).addScaledVector(this.E, Math.sin(phi) * r);
  }

  /** local frame at angle phi: X along the motion, Y up */
  frame(phi: number, f: LocalFrame) {
    const up = this.eci(1, phi, _u);
    const fwd = _w.copy(this.P).multiplyScalar(-Math.sin(phi)).addScaledVector(this.E, Math.cos(phi));
    return f.set(up, fwd);
  }
}

const _u = new THREE.Vector3(), _w = new THREE.Vector3();

/**
 * LVLH state of a craft given in polar orbit-plane coordinates (r, phi, radial and tangential speed) relative to
 * a target on a circular orbit of radius rT at angle phiT with mean motion n. Exact for in-plane motion.
 */
export function polarToLvlh(r: number, phi: number, vr: number, vt: number, rT: number, phiT: number, n: number, outP = new THREE.Vector3(), outV = new THREE.Vector3()) {
  const d = phi - phiT;
  const sd = Math.sin(d), cd = Math.cos(d);
  const dd = vt / r - n;
  outP.set(r * sd, r * cd - rT, 0);
  outV.set(vr * sd + r * cd * dd, vr * cd - r * sd * dd, 0);
  return outP;
}

/** Inverse of polarToLvlh for a point in the orbit plane. */
export function lvlhToPolar(p: THREE.Vector3Like, v: THREE.Vector3Like, rT: number, phiT: number, n: number) {
  const X = p.x, Y = p.y + rT;
  const r = Math.hypot(X, Y);
  const d = Math.atan2(X, Y);
  const sd = Math.sin(d), cd = Math.cos(d);
  // invert [vX, vY] = [[sd, r cd], [cd, -r sd]] [vr, dd]
  const vr = v.x * sd + v.y * cd;
  const dd = (v.x * cd - v.y * sd) / r;
  return { r, phi: phiT + d, vr, vt: (dd + n) * r };
}

/** Orbital elements of a planar state: semi-major axis, eccentricity, apoapsis and periapsis radii. */
export function planarElements(r: number, vr: number, vt: number, mu = MU_EARTH) {
  const v2 = vr * vr + vt * vt;
  const a = 1 / (2 / r - v2 / mu);
  const h = r * vt;
  const e = Math.sqrt(Math.max(0, 1 - (h * h) / (mu * a)));
  return { a, e, apo: a * (1 + e), peri: a * (1 - e), period: 2 * Math.PI * Math.sqrt(Math.abs(a * a * a) / mu) };
}
