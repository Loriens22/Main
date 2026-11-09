/**
 * Orbital mechanics in float64 (plain arrays, SI units).
 * - Universal-variable Kepler propagation (elliptic/parabolic/hyperbolic, any Δt)
 * - State vector ↔ classical elements
 * - Lambert solver (universal variables, Bate–Mueller–White formulation)
 */
export type V3 = [number, number, number];

export const G = 6.6743e-11;
export const AU = 1.495978707e11;
export const MU_SUN = 1.32712440018e20;

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** Stumpff functions */
export function stumpC(z: number) {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - z / 24 + (z * z) / 720;
}
export function stumpS(z: number) {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

/** Propagate a two-body state by dt seconds (universal anomaly). */
export function propagate(r0: V3, v0: V3, mu: number, dt: number): { r: V3; v: V3 } {
  if (dt === 0) return { r: [...r0] as V3, v: [...v0] as V3 };
  const r0n = norm(r0);
  const vr0 = dot(r0, v0) / r0n;
  const alpha = 2 / r0n - dot(v0, v0) / mu; // 1/a
  const sqmu = Math.sqrt(mu);
  // initial guess
  let x = Math.abs(alpha) > 1e-12 ? sqmu * Math.abs(alpha) * dt : (sqmu * dt) / r0n;
  if (alpha < 0) {
    const a = 1 / alpha;
    x = Math.sign(dt) * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (dot(r0, v0) + Math.sign(dt) * Math.sqrt(-mu * a) * (1 - r0n * alpha)) || 1);
    if (!isFinite(x)) x = sqmu * Math.abs(alpha) * dt;
  }
  for (let i = 0; i < 60; i++) {
    const z = alpha * x * x;
    const C = stumpC(z), S = stumpS(z);
    const F = ((r0n * vr0) / sqmu) * x * x * C + (1 - alpha * r0n) * x * x * x * S + r0n * x - sqmu * dt;
    const dF = ((r0n * vr0) / sqmu) * x * (1 - alpha * x * x * S) + (1 - alpha * r0n) * x * x * C + r0n;
    const dx = F / dF;
    x -= dx;
    if (Math.abs(dx) < 1e-9 * Math.max(1, Math.abs(x))) break;
  }
  const z = alpha * x * x;
  const C = stumpC(z), S = stumpS(z);
  const f = 1 - ((x * x) / r0n) * C;
  const g = dt - (x * x * x * S) / sqmu;
  const r = add(scale(r0, f), scale(v0, g));
  const rn = norm(r);
  const fdot = (sqmu / (rn * r0n)) * (alpha * x * x * x * S - x);
  const gdot = 1 - ((x * x) / rn) * C;
  const v = add(scale(r0, fdot), scale(v0, gdot));
  return { r, v };
}

export interface Elements {
  a: number; // semi-major axis (negative for hyperbolic)
  e: number;
  i: number; // rad
  raan: number;
  argp: number;
  nu: number; // true anomaly
  h: number; // specific angular momentum
  period: number; // s (Infinity if unbound)
  periapsis: number;
  apoapsis: number; // Infinity if unbound
}

export function elements(r: V3, v: V3, mu: number): Elements {
  const rn = norm(r), vn2 = dot(v, v);
  const hv = cross(r, v);
  const hn = norm(hv);
  const nv: V3 = [-hv[1], hv[0], 0];
  const nn = norm(nv);
  const ev = scale(sub(scale(r, vn2 - mu / rn), scale(v, dot(r, v))), 1 / mu);
  const e = norm(ev);
  const energy = vn2 / 2 - mu / rn;
  const a = Math.abs(energy) > 1e-12 ? -mu / (2 * energy) : Infinity;
  const i = Math.acos(Math.max(-1, Math.min(1, hv[2] / (hn || 1))));
  let raan = nn > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, nv[0] / nn))) : 0;
  if (nv[1] < 0) raan = 2 * Math.PI - raan;
  let argp = nn > 1e-9 && e > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, dot(nv, ev) / (nn * e)))) : 0;
  if (ev[2] < 0) argp = 2 * Math.PI - argp;
  let nu = e > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, dot(ev, r) / (e * rn)))) : Math.atan2(r[1], r[0]);
  if (dot(r, v) < 0 && e > 1e-9) nu = 2 * Math.PI - nu;
  const p = (hn * hn) / mu;
  return {
    a, e, i, raan, argp, nu, h: hn,
    period: a > 0 && e < 1 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity,
    periapsis: p / (1 + e),
    apoapsis: e < 1 ? p / (1 - e) : Infinity,
  };
}

/** State vector from classical elements (nu = true anomaly). */
export function stateFromElements(a: number, e: number, i: number, raan: number, argp: number, nu: number, mu: number): { r: V3; v: V3 } {
  const p = a * (1 - e * e);
  const rn = p / (1 + e * Math.cos(nu));
  const rp: V3 = [rn * Math.cos(nu), rn * Math.sin(nu), 0];
  const vp: V3 = [-Math.sqrt(mu / p) * Math.sin(nu), Math.sqrt(mu / p) * (e + Math.cos(nu)), 0];
  return { r: rotPQW(rp, i, raan, argp), v: rotPQW(vp, i, raan, argp) };
}

function rotPQW(x: V3, i: number, raan: number, argp: number): V3 {
  const cO = Math.cos(raan), sO = Math.sin(raan), cw = Math.cos(argp), sw = Math.sin(argp), ci = Math.cos(i), si = Math.sin(i);
  const m11 = cO * cw - sO * sw * ci, m12 = -cO * sw - sO * cw * ci;
  const m21 = sO * cw + cO * sw * ci, m22 = -sO * sw + cO * cw * ci;
  const m31 = sw * si, m32 = cw * si;
  return [m11 * x[0] + m12 * x[1], m21 * x[0] + m22 * x[1], m31 * x[0] + m32 * x[1]];
}

/** Solve Kepler's equation for eccentric anomaly. */
export function eccentricAnomaly(M: number, e: number) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/**
 * Lambert's problem: velocities at r1 and r2 for a transfer of time-of-flight tof (s).
 * Universal-variable formulation with bisection/Newton on z. Returns null if no solution.
 */
export function lambert(r1: V3, r2: V3, tof: number, mu: number, prograde = true): { v1: V3; v2: V3 } | null {
  const r1n = norm(r1), r2n = norm(r2);
  const c12 = cross(r1, r2);
  let dTheta = Math.acos(Math.max(-1, Math.min(1, dot(r1, r2) / (r1n * r2n))));
  if (prograde ? c12[2] < 0 : c12[2] >= 0) dTheta = 2 * Math.PI - dTheta;
  const A = Math.sin(dTheta) * Math.sqrt((r1n * r2n) / (1 - Math.cos(dTheta)));
  if (Math.abs(A) < 1e-12) return null;
  const y = (z: number) => r1n + r2n + (A * (z * stumpS(z) - 1)) / Math.sqrt(stumpC(z));
  const F = (z: number) => {
    const yz = y(z);
    if (yz < 0) return NaN;
    return Math.pow(yz / stumpC(z), 1.5) * stumpS(z) + A * Math.sqrt(yz) - Math.sqrt(mu) * tof;
  };
  // bracket z: find lower bound where y(z) > 0, upper bound where F > 0
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI;
  while (y(lo) < 0 && lo < hi) lo += 0.1;
  let flo = F(lo), fhi = F(hi);
  let guard = 0;
  while (!(fhi > 0) && guard++ < 100) {
    hi = hi * 1.5 + 1;
    if (hi > 4 * Math.PI * Math.PI * 0.999) hi = 4 * Math.PI * Math.PI * 0.999;
    fhi = F(hi);
    if (hi >= 4 * Math.PI * Math.PI * 0.999) break;
  }
  if (!(flo < 0) || !(fhi > 0)) {
    // scan for a sign change
    let found = false;
    let prevZ = lo, prevF = flo;
    for (let z = lo; z < 4 * Math.PI * Math.PI * 0.999; z += 0.05) {
      const f = F(z);
      if (isFinite(prevF) && isFinite(f) && prevF < 0 && f > 0) {
        lo = prevZ; hi = z; found = true;
        break;
      }
      prevZ = z; prevF = f;
    }
    if (!found) return null;
  }
  let z = 0;
  for (let k = 0; k < 200; k++) {
    z = (lo + hi) / 2;
    const f = F(z);
    if (!isFinite(f)) { lo = z; continue; }
    if (Math.abs(f) < 1e-8 * Math.sqrt(mu) * tof) break;
    if (f > 0) hi = z;
    else lo = z;
  }
  const yz = y(z);
  const f = 1 - yz / r1n;
  const g = A * Math.sqrt(yz / mu);
  const gdot = 1 - yz / r2n;
  const v1 = scale(sub(r2, scale(r1, f)), 1 / g);
  const v2 = scale(sub(scale(r2, gdot), r1), 1 / g);
  return { v1, v2 };
}

/** Sphere of influence radius (Laplace). */
export function soi(a: number, mBody: number, mParent: number) {
  return a * Math.pow(mBody / mParent, 0.4);
}

/** Circular orbital speed. */
export function vCirc(mu: number, r: number) {
  return Math.sqrt(mu / r);
}
