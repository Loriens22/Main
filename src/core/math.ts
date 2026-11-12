import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. `rate` is 1/time-constant. */
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const sign = (x: number) => (x < 0 ? -1 : x > 0 ? 1 : 0);
export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const moveToward = (a: number, b: number, maxDelta: number) =>
  Math.abs(b - a) <= maxDelta ? b : a + Math.sign(b - a) * maxDelta;

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 2D value noise in [0,1], smooth. */
export function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x: number, y: number, oct = 5, lac = 2.03, gain = 0.5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f + i * 17.13, y * f - i * 9.7);
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n;
}

export const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  const s = Math.abs(sec);
  const Y = 365.25 * 86400;
  if (s >= Y) {
    const y = Math.floor(s / Y);
    const d = Math.floor((s - y * Y) / 86400);
    return `${y}y ${d}d`;
  }
  if (s >= 86400) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return `${d}d ${String(h).padStart(2, '0')}h`;
  }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function formatDistance(m: number): string {
  const a = Math.abs(m);
  if (a >= 1.495978707e11 * 0.05) return `${(m / 1.495978707e11).toFixed(3)} AU`;
  if (a >= 1e9) return `${(m / 1e9).toFixed(2)} Gm`;
  if (a >= 1e6) return `${(m / 1e6).toFixed(1)} Mm`;
  if (a >= 1e4) return `${(m / 1e3).toFixed(1)} km`;
  if (a >= 1e3) return `${(m / 1e3).toFixed(2)} km`;
  return `${m.toFixed(a < 10 ? 2 : 0)} m`;
}

export const V3 = THREE.Vector3;
export const tmpV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
export const tmpQ = [new THREE.Quaternion(), new THREE.Quaternion()];
export const UP = new THREE.Vector3(0, 1, 0);
export const FWD = new THREE.Vector3(0, 0, -1);
export const RIGHT = new THREE.Vector3(1, 0, 0);
