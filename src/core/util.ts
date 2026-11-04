import * as THREE from 'three';
import TL from '../timeline.json';

export const T = TL as any;

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lin = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const sstep = (t: number, a: number, b: number) => { const x = lin(t, a, b); return x * x * (3 - 2 * x); };
export const sstep2 = (t: number, a: number, b: number) => { const x = lin(t, a, b); return x * x * x * (x * (x * 6 - 15) + 10); };
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
export const pulse = (t: number, a: number, b: number, fade = 0.3) => sstep(t, a, a + fade) * (1 - sstep(t, b - fade, b));
export const easeInOut = (x: number) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;
export const easeOutBack = (x: number, s = 1.4) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
export const fract = (x: number) => x - Math.floor(x);

/** mulberry32 seeded PRNG — every random choice in the film is seeded. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(f, {
    range: (lo: number, hi: number) => lo + (hi - lo) * f(),
    pick: <X>(arr: X[]) => arr[Math.floor(f() * arr.length) % arr.length],
    sign: () => (f() < 0.5 ? -1 : 1),
  });
}
export type Rng = ReturnType<typeof rng>;

/** smooth pseudo-noise from sums of sines (deterministic, same in GLSL) */
export function snoise1(x: number, seed = 0) {
  return (Math.sin(x * 1.13 + seed * 3.1) * 0.5 + Math.sin(x * 2.71 + seed * 1.7) * 0.3 + Math.sin(x * 5.37 + seed * 0.37) * 0.2);
}

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export interface CamKey { t: number; p: number[]; l: number[]; f?: number; roll?: number; }

/** Camera track: Catmull-Rom through keyed positions/targets, eased over a
 *  whole move so starts/stops are smooth. focal length in mm (36mm gauge). */
export class Track {
  keys: CamKey[];
  ease: (x: number) => number;
  constructor(keys: CamKey[], ease: (x: number) => number = easeInOut) {
    this.keys = keys; this.ease = ease;
  }
  get t0() { return this.keys[0].t; }
  get t1() { return this.keys[this.keys.length - 1].t; }
  private cr(p0: number, p1: number, p2: number, p3: number, u: number) {
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
  eval(t: number, cam: THREE.PerspectiveCamera) {
    const K = this.keys;
    let tv: number;
    if (K.length === 1) tv = K[0].t;
    else tv = this.t0 + this.ease(lin(t, this.t0, this.t1)) * (this.t1 - this.t0);
    let i = 0;
    while (i < K.length - 2 && tv > K[i + 1].t) i++;
    const a = K[Math.max(0, i - 1)], b = K[i], c = K[Math.min(K.length - 1, i + 1)], d = K[Math.min(K.length - 1, i + 2)];
    const u = K.length === 1 ? 0 : clamp((tv - b.t) / Math.max(1e-6, c.t - b.t));
    const p = [0, 1, 2].map((k) => this.cr(a.p[k], b.p[k], c.p[k], d.p[k], u));
    const l = [0, 1, 2].map((k) => this.cr(a.l[k], b.l[k], c.l[k], d.l[k], u));
    const f = mix(b.f ?? 35, c.f ?? 35, sstep(u, 0, 1));
    const roll = mix(b.roll ?? 0, c.roll ?? 0, sstep(u, 0, 1));
    cam.position.set(p[0], p[1], p[2]);
    cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    cam.lookAt(l[0], l[1], l[2]);
    cam.filmGauge = 36;
    cam.setFocalLength(f);
    return { p, l, f };
  }
}

/** pick the active track for time t from a list of [track] (non-overlapping) */
export function evalTracks(tracks: Track[], t: number, cam: THREE.PerspectiveCamera) {
  let tr = tracks[0];
  for (const k of tracks) if (t >= k.t0) tr = k;
  return tr.eval(t, cam);
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const tx = new THREE.CanvasTexture(c);
  if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  return tx;
}

export function disposeTree(o: THREE.Object3D) {
  o.traverse((c: any) => {
    c.geometry?.dispose?.();
    const m = c.material;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((mm: any) => mm.dispose?.());
  });
}
