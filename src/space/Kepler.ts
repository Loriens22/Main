/*
 * Two-body mechanics in double precision on plain arrays: Kepler's equation, conic state <-> elements,
 * universal-variable propagation of any conic (ellipse, parabola, hyperbola) and Lambert's problem.
 * Units are whatever the caller uses consistently (SI here: m, s, m^3/s^2).
 */
export type V3 = [number, number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

/** Stumpff functions C(z), S(z). */
export function stumpffC(z: number) {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - z / 24 + (z * z) / 720;
}
export function stumpffS(z: number) {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

/** Eccentric anomaly from mean anomaly (elliptic), Newton with a safe start. */
export function solveKepler(M: number, e: number) {
  M = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 50; i++) {
    const f = E - e * Math.sin(E) - M;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

export interface Elements { a: number; e: number; i: number; node: number; peri: number; M: number }

/** Position and velocity from classical elements (angles in radians, M mean anomaly at the epoch). */
export function elementsToState(el: Elements, mu: number): { r: V3; v: V3 } {
  const { a, e, i, node, peri, M } = el;
  const E = solveKepler(M, e);
  const cE = Math.cos(E), sE = Math.sin(E);
  const b = a * Math.sqrt(1 - e * e);
  const xp = a * (cE - e), yp = b * sE;
  const n = Math.sqrt(mu / (a * a * a));
  const rr = a * (1 - e * cE);
  const vxp = (-a * n * sE * a) / rr, vyp = (b * n * cE * a) / rr;
  const cO = Math.cos(node), sO = Math.sin(node), cw = Math.cos(peri), sw = Math.sin(peri), ci = Math.cos(i), si = Math.sin(i);
  const P: V3 = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si];
  const Q: V3 = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];
  return { r: add(scale(P, xp), scale(Q, yp)), v: add(scale(P, vxp), scale(Q, vyp)) };
}

/** Classical elements of a state (elliptic or hyperbolic; a < 0 for hyperbolas, M then the hyperbolic mean anomaly). */
export function stateToElements(r: V3, v: V3, mu: number): Elements & { energy: number; h: V3; period: number } {
  const rn = norm(r), vn = norm(v);
  const h = cross(r, v), hn = norm(h);
  const evec = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rn));
  const e = norm(evec);
  const energy = (vn * vn) / 2 - mu / rn;
  const a = -mu / (2 * energy);
  const i = Math.acos(Math.max(-1, Math.min(1, h[2] / hn)));
  const nvec: V3 = [-h[1], h[0], 0];
  const nn = norm(nvec);
  let node = nn > 1e-12 ? Math.acos(Math.max(-1, Math.min(1, nvec[0] / nn))) : 0;
  if (nvec[1] < 0) node = 2 * Math.PI - node;
  let peri = 0;
  if (e > 1e-10) {
    const ref = nn > 1e-12 ? nvec : ([1, 0, 0] as V3);
    peri = Math.acos(Math.max(-1, Math.min(1, dot(ref, evec) / ((nn > 1e-12 ? nn : 1) * e))));
    if (evec[2] < 0 || (nn <= 1e-12 && cross(ref, evec)[2] < 0)) peri = 2 * Math.PI - peri;
  }
  let nu = 0;
  if (e > 1e-10) {
    nu = Math.acos(Math.max(-1, Math.min(1, dot(evec, r) / (e * rn))));
    if (dot(r, v) < 0) nu = 2 * Math.PI - nu;
  }
  let M: number;
  if (e < 1) {
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    M = E - e * Math.sin(E);
  } else {
    const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    M = e * Math.sinh(F) - F;
  }
  const period = e < 1 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;
  return { a, e, i, node, peri, M, energy, h, period };
}

/**
 * Propagate a two-body state by dt with universal variables (works for every conic and for negative dt).
 * Curtis, Orbital Mechanics for Engineering Students, algorithms 3.3 and 3.4.
 */
export function propagate(r0: V3, v0: V3, mu: number, dt: number): { r: V3; v: V3 } {
  if (dt === 0) return { r: [...r0] as V3, v: [...v0] as V3 };
  const rn0 = norm(r0), vr0 = dot(r0, v0) / rn0;
  const alpha = 2 / rn0 - dot(v0, v0) / mu;
  const smu = Math.sqrt(mu);
  // initial guess
  let x = Math.abs(alpha) > 1e-12 ? smu * Math.abs(alpha) * dt : smu * dt / rn0;
  if (alpha < -1e-12) {
    const a = 1 / alpha;
    x = Math.sign(dt) * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (dot(r0, v0) + Math.sign(dt) * Math.sqrt(-mu * a) * (1 - rn0 * alpha)));
    if (!isFinite(x)) x = smu * Math.abs(alpha) * dt;
  }
  for (let it = 0; it < 80; it++) {
    const z = alpha * x * x, C = stumpffC(z), S = stumpffS(z);
    const F = ((rn0 * vr0) / smu) * x * x * C + (1 - alpha * rn0) * x * x * x * S + rn0 * x - smu * dt;
    const dF = ((rn0 * vr0) / smu) * x * (1 - alpha * x * x * S) + (1 - alpha * rn0) * x * x * C + rn0;
    let d = F / dF;
    if (!isFinite(d)) break;
    // keep wild steps of an early iteration in check
    if (Math.abs(d) > Math.abs(x) * 2 + 1e3) d = Math.sign(d) * (Math.abs(x) * 2 + 1e3);
    x -= d;
    if (Math.abs(d) < 1e-10 * Math.max(1, Math.abs(x))) break;
  }
  const z = alpha * x * x, C = stumpffC(z), S = stumpffS(z);
  const f = 1 - (x * x / rn0) * C;
  const g = dt - (1 / smu) * x * x * x * S;
  const r = add(scale(r0, f), scale(v0, g));
  const rn = norm(r);
  const fd = (smu / (rn * rn0)) * (alpha * x * x * x * S - x);
  const gd = 1 - (x * x / rn) * C;
  return { r, v: add(scale(r0, fd), scale(v0, gd)) };
}

/**
 * Lambert's problem: velocities at r1 and r2 for a transfer of duration tof (single revolution).
 * prograde: the transfer goes the same way round as positive z angular momentum. Universal variables with a
 * bracketed Newton/bisection on z (Curtis algorithm 5.2, made robust). Returns null when no solution is found.
 */
export function lambert(r1: V3, r2: V3, tof: number, mu: number, prograde = true): { v1: V3; v2: V3 } | null {
  const R1 = norm(r1), R2 = norm(r2);
  const c12 = cross(r1, r2);
  let dth = Math.acos(Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2))));
  if (prograde ? c12[2] < 0 : c12[2] >= 0) dth = 2 * Math.PI - dth;
  const A = Math.sin(dth) * Math.sqrt((R1 * R2) / (1 - Math.cos(dth)));
  if (!isFinite(A) || Math.abs(A) < 1e-12) return null;
  const y = (z: number) => R1 + R2 + (A * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));
  const T = (z: number) => {
    const yz = y(z);
    if (yz < 0) return NaN;
    return (Math.pow(yz / stumpffC(z), 1.5) * stumpffS(z) + A * Math.sqrt(yz)) / Math.sqrt(mu);
  };
  // bracket: z from where y(z) >= 0 up to just below (2 pi)^2 (single revolution)
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI - 1e-6;
  // raise lo until y(lo) > 0 (needed when A > 0)
  for (let k = 0; k < 200 && !(y(lo) > 0); k++) lo = (lo + hi) / 2 > lo ? lo + (hi - lo) * 0.02 : lo;
  if (!(y(lo) > 0)) return null;
  // T(z) increases with z on this range: bisection to tof
  const tLo = T(lo), tHi = T(hi);
  if (!isFinite(tLo) || tof < tLo) {
    // hyperbolic transfers below lo: extend the bracket downward
    let z = lo;
    for (let k = 0; k < 200; k++) { z -= 10 * (k + 1); if (y(z) > 0 && T(z) < tof) { lo = z; break; } }
  }
  if (isFinite(tHi) && tof > tHi) return null;
  let z = 0;
  for (let it = 0; it < 200; it++) {
    z = (lo + hi) / 2;
    const t = T(z);
    if (!isFinite(t) || t < tof) lo = z; else hi = z;
    if (hi - lo < 1e-12 * Math.max(1, Math.abs(z))) break;
  }
  const yz = y(z);
  const f = 1 - yz / R1, g = A * Math.sqrt(yz / mu), gd = 1 - yz / R2;
  const v1 = scale(sub(r2, scale(r1, f)), 1 / g);
  const v2 = scale(sub(scale(r2, gd), r1), 1 / g);
  return { v1, v2 };
}
