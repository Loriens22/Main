import * as THREE from 'three';

/**
 * Miller's tidal waves. Gargantua's tide raises single, kilometre-high crests that sweep the shallow ocean every
 * ten-odd minutes of local time. Each wave is a long straight crest moving at speed C along `dir`; its height
 * across the crest is an asymmetric sech² profile (steep front face, long back):
 *     h(s) = H · sech²(s / W),  W = W_FRONT ahead of the crest (s > 0), W_BACK behind it,
 * with s = dir·p − C·(t − t0) the signed distance ahead of the crest (t0: when it passes the site origin).
 * The same function drives the water mesh (GLSL below), the craft/player interaction and the warnings.
 */
export const WAVE_C = 105; // m/s
export const W_FRONT = 650;
export const W_BACK = 2600;
const MAX_REACH = 70e3; // waves are tracked from 70 km before to 70 km after the origin

export interface TidalWave {
  n: number;
  t0: number;
  dir: THREE.Vector2; // unit, direction of travel (local x, z)
  H: number;
}

function rnd(n: number, k: number) {
  const x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class MillerWaves {
  /** arrival time of wave 0 at the origin (zone seconds); null until scheduled (on touchdown or load landed) */
  first: number | null = null;
  readonly period = 690;

  schedule(tFirst: number) {
    if (this.first === null) this.first = tFirst;
  }

  wave(n: number): TidalWave {
    const t0 = (this.first ?? 0) + n * this.period + (rnd(n, 1) - 0.5) * 150;
    // from the tidal bulge: out of the east, ±25°
    const a = Math.PI + (rnd(n, 2) - 0.5) * 0.9;
    return { n, t0, dir: new THREE.Vector2(Math.cos(a), Math.sin(a)), H: 820 + 480 * rnd(n, 3) };
  }

  /** waves whose crest is within reach of the origin at time t (at most two at once) */
  active(t: number): TidalWave[] {
    if (this.first === null) return [];
    const out: TidalWave[] = [];
    const k = Math.floor((t - this.first) / this.period);
    for (let n = Math.max(0, k - 1); n <= k + 2; n++) {
      const w = this.wave(n);
      if (Math.abs(WAVE_C * (t - w.t0)) < MAX_REACH) out.push(w);
    }
    return out.slice(0, 2);
  }

  /** signed distance of p ahead of the crest of w at time t */
  static ahead(w: TidalWave, x: number, z: number, t: number) {
    return w.dir.x * x + w.dir.y * z - WAVE_C * (t - w.t0);
  }

  static profile(s: number) {
    const u = s / (s >= 0 ? W_FRONT : W_BACK);
    if (Math.abs(u) > 18) return 0;
    const c = Math.cosh(u);
    return 1 / (c * c);
  }

  /** wave height above the still water at (x, z) */
  height(x: number, z: number, t: number) {
    let h = 0;
    for (const w of this.active(t)) h += w.H * MillerWaves.profile(MillerWaves.ahead(w, x, z, t));
    return h;
  }

  /** horizontal gradient (dh/dx, dh/dz) */
  gradient(x: number, z: number, t: number, out = new THREE.Vector2()) {
    out.set(0, 0);
    for (const w of this.active(t)) {
      const s = MillerWaves.ahead(w, x, z, t);
      const W = s >= 0 ? W_FRONT : W_BACK;
      const u = s / W;
      if (Math.abs(u) > 18) continue;
      const c = Math.cosh(u);
      const d = (-2 * w.H * Math.tanh(u)) / (c * c) / W; // d/ds of H sech²(s/W)
      out.x += d * w.dir.x;
      out.y += d * w.dir.y;
    }
    return out;
  }

  /** the next crest still to reach (x, z): seconds until it arrives, its height and travel direction */
  next(x: number, z: number, t: number) {
    if (this.first === null) return null;
    const k = Math.max(0, Math.floor((t - this.first) / this.period) - 1);
    for (let n = k; n < k + 4; n++) {
      const w = this.wave(n);
      const s = MillerWaves.ahead(w, x, z, t);
      if (s > -W_FRONT * 0.3) return { wave: w, tta: s / WAVE_C, dist: s };
    }
    return null;
  }

  /** shader uniforms: two waves as (dir.x, dir.y, crest offset C·(t − t0), H); H = 0 when unused */
  readonly uniforms = { uWave0: { value: new THREE.Vector4(1, 0, 0, 0) }, uWave1: { value: new THREE.Vector4(1, 0, 0, 0) } };
  updateUniforms(t: number) {
    const a = this.active(t);
    const set = (v: THREE.Vector4, w?: TidalWave) => (w ? v.set(w.dir.x, w.dir.y, WAVE_C * (t - w.t0), w.H) : v.set(1, 0, 0, 0));
    set(this.uniforms.uWave0.value, a[0]);
    set(this.uniforms.uWave1.value, a[1]);
  }
}

/** GLSL: the same height field as MillerWaves.height, with its gradient (for the vertex normal) and a foam term. */
export const WAVE_GLSL = /* glsl */ `
  uniform vec4 uWave0, uWave1;
  vec4 tideOne(vec2 p, vec4 w){
    if (w.w <= 0.0) return vec4(0.0);
    float s = dot(w.xy, p) - w.z;
    float W = s >= 0.0 ? ${W_FRONT.toFixed(1)} : ${W_BACK.toFixed(1)};
    float u = s / W;
    if (abs(u) > 18.0) return vec4(0.0);
    float c = cosh(u);
    float h = w.w / (c * c);
    float d = -2.0 * w.w * tanh(u) / (c * c) / W;
    // white water: the curling lip just ahead of the crest, and the churning toe where the face meets the sea
    float foam = exp(-pow((u - 0.1) / 0.16, 2.0)) + 0.75 * exp(-pow((u - 2.3) / 0.45, 2.0));
    return vec4(h, d * w.xy, foam * smoothstep(60.0, 500.0, w.w));
  }
  // (height, dh/dx, dh/dz, foam)
  vec4 tide(vec2 p){ vec4 a = tideOne(p, uWave0), b = tideOne(p, uWave1); return vec4(a.xyz + b.xyz, max(a.w, b.w)); }
`;
