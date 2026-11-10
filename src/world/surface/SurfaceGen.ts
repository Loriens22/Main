import * as THREE from 'three';
import { Heightmap, HeightField } from '../terrain/Heightmap';
import { SURFACES, type SurfaceDef } from '../../data/landing';
import { type SurfaceSite, localToBF } from '../../space/surfaceFrame';

/**
 * Surface terrain for any landable body, in a landing site's local frame (X east, Y up, Z south, metres):
 *   height(x, z) = sphere curvature  +  orbital height map × relief  +  procedural detail by surface style.
 * Procedural craters use an integer hash shared with the GPU shading (surfaceShading.ts), so the shader can add
 * the octaves too small for the height maps and they line up with the geometry.
 */

// ------------------------------------------------------------------------------------------- shared hash
export function h32(x: number) {
  x >>>= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
export function hashCell(i: number, j: number, k: number) {
  return h32((Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k + 0x9e37, 0x61c88647)) >>> 0);
}
const U24 = 1 / 16777216;

/** Smallest crater diameter of the octave ladder (m); octave k has diameters in [D0·2^k, D0·2^(k+1)). */
export const CRATER_D0 = 0.75;
export const CRATER_OCTAVES = 16; // 0.75 m … ~25 km

export interface CraterParams {
  seed: number;
  /** probability that a cell hosts a crater, per octave scale (fresh highlands ≈ 0.7, maria ≈ 0.3) */
  density: number;
  depth: number; // depth / radius for a fresh simple crater (≈ 0.4)
}

/**
 * Sum of craters of octaves [k0, k1] at (x, z): returns [height, d/dx, d/dz].
 * Cells are 2.2 D wide; each holds at most one crater whose centre is jittered inside the middle 40 %, so the
 * 2×2 cells nearest the point see every crater that can reach it.
 */
export function craterSum(x: number, z: number, k0: number, k1: number, p: CraterParams, out: number[] = [0, 0, 0]) {
  let h = 0, gx = 0, gz = 0;
  for (let k = k1; k >= k0; k--) {
    const D = CRATER_D0 * Math.pow(2, k);
    const cell = D * 2.2;
    // production function: big craters are rarer than small ones (relative to the cell area)
    const dens = p.density * octaveDensity(k);
    const u = x / cell, v = z / cell;
    const ci = Math.floor(u), cj = Math.floor(v);
    const oi = u - ci < 0.5 ? -1 : 0, oj = v - cj < 0.5 ? -1 : 0;
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        const i = ci + oi + a, j = cj + oj + b;
        const hs = hashCell(i, j, k + p.seed * 31);
        if ((hs & 0xffff) / 65536 > dens) continue;
        const h2 = h32(hs ^ 0x5bd1e995);
        const r = D * (0.5 + 0.5 * ((h2 & 0xffffff) * U24)); // radius in [D/2, D)
        const cx = (i + 0.3 + 0.4 * (((hs >>> 16) & 0xff) / 255)) * cell;
        const cz = (j + 0.3 + 0.4 * ((hs >>> 24) / 255)) * cell;
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        const rr = r * 1.8;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) + 1e-9;
        const q = d / r;
        craterProfile(q, r, D, ((h2 >>> 24) & 0xff) / 255, p.depth, PROF);
        h += PROF[0];
        const g = PROF[1] / (r * d);
        gx += g * dx;
        gz += g * dz;
      }
    }
  }
  out[0] = h;
  out[1] = gx;
  out[2] = gz;
  return out;
}

/** relative crater frequency per octave (cells scale with D², so a flat value would over-populate big craters) */
export function octaveDensity(k: number) {
  return k < 7 ? 0.75 : k < 10 ? 0.45 : k < 13 ? 0.3 : 0.2;
}

/**
 * Radial crater profile h(q) and dh/dq for q = distance / radius. `ageU` ∈ [0,1) picks the state of degradation:
 * most craters are old and soft (shallow bowl, low rounded rim); a few are fresh (deep parabolic bowl, sharp rim,
 * ejecta). Large craters get flat floors.
 */
const PROF: [number, number] = [0, 0];
export function craterProfile(q: number, r: number, D: number, ageU: number, depthK: number, out: [number, number] = [0, 0]): [number, number] {
  const age = 0.12 + 0.88 * ageU * ageU * ageU; // 1 = fresh
  const depth = depthK * r * (0.25 + 0.75 * age), rim = 0.1 * r * age;
  const w = 0.12 + 0.28 * (1 - age); // rim crest width (degraded craters are rounder)
  if (q < 1) {
    const fl = Math.min(0.4, D / 5000);
    const t = Math.max(0, (q - fl) / (1 - fl));
    // bowl rising into the rim; soften the crest of degraded rims
    const s = smooth01((q - (1 - w)) / w);
    const bowl = -depth * (1 - t * t);
    const crest = rim * (1 - (1 - q) / w) * s;
    const hv = bowl * (1 - 0.35 * s * (1 - age)) + crest;
    const dB = q > fl ? (2 * depth * t) / (1 - fl) : 0;
    const dS = q > 1 - w ? (6 * ((q - (1 - w)) / w) * (1 - (q - (1 - w)) / w)) / w : 0;
    const dh = dB * (1 - 0.35 * s * (1 - age)) + bowl * (-0.35 * dS * (1 - age)) + rim * ((1 / w) * s + (1 - (1 - q) / w) * dS);
    out[0] = hv;
    out[1] = dh;
    return out;
  }
  // outside: rim crest falling off to an ejecta blanket that fades out by 1.8 r
  const s = (q - 1) / 0.8;
  const f = (1 - s) * (1 - s);
  const e = Math.exp(-((q - 1) * (q - 1)) / (w * w));
  const hv = rim * (0.75 * e + 0.25 * Math.pow(q, -3)) * f;
  const de = (-2 * (q - 1)) / (w * w) * e;
  const dh = rim * ((0.75 * de - 0.75 * Math.pow(q, -4)) * f + (0.75 * e + 0.25 * Math.pow(q, -3)) * ((-2 * (1 - s)) / 0.8));
  out[0] = hv;
  out[1] = dh;
  return out;
}

function smooth01(x: number) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------------------------------------- value noise
function vn2(x: number, z: number, seed: number) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hashCell(i, j, seed) * 2.3283064365386963e-10, b = hashCell(i + 1, j, seed) * 2.3283064365386963e-10;
  const c = hashCell(i, j + 1, seed) * 2.3283064365386963e-10, d = hashCell(i + 1, j + 1, seed) * 2.3283064365386963e-10;
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm2(x: number, z: number, oct: number, seed: number) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) {
    s += a * (vn2(x * f, z * f, seed + o * 7) - 0.5);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
function ridged2(x: number, z: number, oct: number, seed: number) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) {
    const n = 1 - Math.abs(vn2(x * f, z * f, seed + o * 13) * 2 - 1);
    s += a * n * n;
    f *= 2.1;
    a *= 0.5;
  }
  return s;
}

// ------------------------------------------------------------------------------------------- body maps (CPU)
export class BodyMap {
  constructor(readonly w: number, readonly h: number, readonly height: Float32Array | null, readonly lum: Float32Array | null) {}

  /** bilinear sample (u wraps) of a channel at lat/lon (deg) */
  private samp(ch: Float32Array, lat: number, lon: number) {
    const u = ((lon + 180) / 360) * this.w - 0.5;
    const v = ((90 - lat) / 180) * this.h - 0.5;
    const i = Math.floor(u), j = Math.max(0, Math.min(this.h - 2, Math.floor(v)));
    const fx = u - i, fy = Math.max(0, Math.min(1, v - j));
    const W = this.w;
    const i0 = ((i % W) + W) % W, i1 = (i0 + 1) % W;
    const a = ch[j * W + i0], b = ch[j * W + i1], c = ch[(j + 1) * W + i0], d = ch[(j + 1) * W + i1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  heightAt(lat: number, lon: number) {
    return this.height ? this.samp(this.height, lat, lon) - 0.5 : 0;
  }

  lumAt(lat: number, lon: number) {
    return this.lum ? this.samp(this.lum, lat, lon) : 0.5;
  }

  static async load(id: string): Promise<BodyMap> {
    const img = async (name: string) => {
      try {
        const im = new Image();
        im.src = `assets/textures/${name}.jpg`;
        await im.decode();
        const c = document.createElement('canvas');
        c.width = im.width;
        c.height = im.height;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(im, 0, 0);
        return g.getImageData(0, 0, im.width, im.height);
      } catch {
        return null;
      }
    };
    const [aux, day] = await Promise.all([img(`planet_${id}_aux`), img(`planet_${id}`)]);
    const ref = aux ?? day;
    if (!ref) return new BodyMap(1, 1, null, null);
    const n = ref.width * ref.height;
    let height: Float32Array | null = null, lum: Float32Array | null = null;
    if (aux) {
      height = new Float32Array(n);
      for (let k = 0; k < n; k++) height[k] = aux.data[k * 4] / 255;
      // 8-bit terraces → smooth: two box-blur passes
      height = blurWrap(blurWrap(height, aux.width, aux.height), aux.width, aux.height);
    }
    if (day && day.width === ref.width && day.height === ref.height) {
      lum = new Float32Array(n);
      for (let k = 0; k < n; k++) lum[k] = (0.3 * day.data[k * 4] + 0.55 * day.data[k * 4 + 1] + 0.15 * day.data[k * 4 + 2]) / 255;
    }
    return new BodyMap(ref.width, ref.height, height, lum);
  }
}

function blurWrap(a: Float32Array, w: number, h: number) {
  const o = new Float32Array(a.length);
  for (let j = 0; j < h; j++) {
    const j0 = Math.max(0, j - 1), j1 = Math.min(h - 1, j + 1);
    for (let i = 0; i < w; i++) {
      const i0 = (i - 1 + w) % w, i1 = (i + 1) % w;
      o[j * w + i] = (a[j0 * w + i0] + a[j0 * w + i] + a[j0 * w + i1] + a[j * w + i0] + a[j * w + i] * 2 + a[j * w + i1] + a[j1 * w + i0] + a[j1 * w + i] + a[j1 * w + i1]) / 10;
    }
  }
  return o;
}

// ------------------------------------------------------------------------------------------- generator
export interface SurfaceGenOptions {
  site: SurfaceSite;
  map: BodyMap;
  /** half-size of the far map (m) */
  farHalf: number;
}

export class SurfaceGen {
  readonly def: SurfaceDef;
  readonly site: SurfaceSite;
  readonly R: number;
  readonly crater: CraterParams;
  readonly seed: number;
  field!: HeightField;
  near!: Heightmap;
  mid!: Heightmap;
  far!: Heightmap;
  /** map-scale highland fraction at the site (0 = dark mare, 1 = bright highland) */
  readonly highland: number;
  private tmp = [0, 0, 0];
  private latLonCache = new THREE.Vector3();

  constructor(readonly opts: SurfaceGenOptions) {
    this.site = opts.site;
    this.R = opts.site.R;
    this.def = SURFACES[opts.site.body];
    this.seed = (Math.round(opts.site.lat * 1000) * 7919 + Math.round(opts.site.lon * 1000) * 104729) & 0xffff;
    const lum = opts.map.lumAt(opts.site.lat, opts.site.lon);
    this.highland = THREE.MathUtils.smoothstep(lum, 0.32, 0.58);
    const st = this.def.style;
    const base = st === 'lunar' || st === 'mercury' || st === 'rubble' ? 0.42 + 0.45 * this.highland : 0.4;
    this.crater = { seed: this.seed, density: Math.min(0.92, base * this.def.craters), depth: st === 'icy' ? 0.3 : 0.42 };
  }

  /** sphere drop at horizontal distance (exact for the vertical line through (x, z)) */
  curvature(x: number, z: number) {
    const r2 = x * x + z * z, R = this.R;
    const lim = R * R * 0.995;
    return Math.sqrt(R * R - Math.min(r2, lim)) - R;
  }

  /** map-scale elevation (m) at a local position (from the blurred orbital height channel) */
  private xz: [number, number, number] = [0, 0, 0];
  mapElevation(x: number, z: number) {
    const s = this.site;
    this.xz[0] = x;
    this.xz[2] = z;
    const b = localToBF(s, this.xz, this.latLonCache).normalize();
    const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(b.y, -1, 1)));
    const lon = THREE.MathUtils.radToDeg(Math.atan2(-b.z, b.x));
    return this.opts.map.heightAt(lat, lon) * 2 * this.def.relief;
  }

  /** procedural relief for octaves [k0, k1] plus style-specific landforms; `cell` = map cell size (m) */
  detail(x: number, z: number, cell: number) {
    const st = this.def.style;
    // crater octaves resolvable at this cell size
    let k0 = 0;
    while (k0 < CRATER_OCTAVES - 1 && CRATER_D0 * Math.pow(2, k0) < cell * 2.5) k0++;
    let h = 0;
    if (this.crater.density > 0.01) h += craterSum(x, z, k0, CRATER_OCTAVES - 1, this.crater, this.tmp)[0];
    const sd = this.seed;
    switch (st) {
      case 'lunar':
      case 'mercury':
        // gentle undulation and old degraded hills
        h += 180 * fbm2(x / 9000, z / 9000, 4, sd + 3) + 25 * fbm2(x / 900, z / 900, cell < 20 ? 5 : 3, sd + 5);
        break;
      case 'rubble':
        h += 60 * fbm2(x / 2500, z / 2500, 4, sd + 3) + 6 * fbm2(x / 120, z / 120, 4, sd + 9);
        // grooves (Phobos): parallel troughs
        h -= 8 * Math.pow(Math.abs(Math.sin((x * 0.8 + z * 0.6) / 260 + 2 * fbm2(x / 3000, z / 3000, 2, sd))), 18);
        break;
      case 'mars': {
        // eroded hills, mesas in the highlands, dune fields in low ground
        const hills = 420 * fbm2(x / 14000, z / 14000, 5, sd + 3) + 60 * ridged2(x / 2600, z / 2600, 4, sd + 4);
        const low = THREE.MathUtils.smoothstep(-hills, -40, 120);
        const warp = 900 * fbm2(x / 5000, z / 5000, 2, sd + 6);
        const dunes = 9 * Math.pow(0.5 + 0.5 * Math.sin((x * 0.94 + z * 0.34 + warp) / 70), 2.2) * low;
        h += hills + dunes + 3 * fbm2(x / 60, z / 60, cell < 10 ? 4 : 2, sd + 8);
        break;
      }
      case 'icy':
        h += 260 * fbm2(x / 12000, z / 12000, 4, sd + 3);
        // fractures and grooves: sharp parallel ridges in bands
        h += 35 * Math.pow(ridged2(x / 1800 + 0.3 * z / 1800, z / 3400, 3, sd + 4), 3);
        h += 4 * fbm2(x / 90, z / 90, 3, sd + 7);
        break;
      case 'europa': {
        // double ridges criss-crossing the ice, chaos blocks
        const r1 = 1 - Math.abs(Math.sin((x * 0.8 + z * 0.6) / 950 + fbm2(x / 8000, z / 8000, 2, sd)));
        const r2 = 1 - Math.abs(Math.sin((x * -0.3 + z * 0.95) / 1300 + fbm2(x / 6000, z / 6000, 2, sd + 1)));
        h += 90 * Math.pow(r1, 40) + 70 * Math.pow(r2, 40) + 60 * fbm2(x / 7000, z / 7000, 4, sd + 2) + 5 * ridged2(x / 220, z / 220, 3, sd + 5);
        break;
      }
      case 'io': {
        const plain = 120 * fbm2(x / 16000, z / 16000, 4, sd + 3);
        // a caldera (patera) not far from the site with a raised rim
        const pd = Math.hypot(x - 6500, z + 4200) / 3200;
        const pat = pd < 1 ? -220 * (1 - Math.pow(pd, 8)) : 30 * Math.exp(-(pd - 1) * 6);
        h += plain + pat + 4 * fbm2(x / 120, z / 120, 3, sd + 6);
        break;
      }
      case 'titan': {
        const hills = 160 * fbm2(x / 10000, z / 10000, 4, sd + 3);
        const low = THREE.MathUtils.smoothstep(-hills, -10, 60);
        const warp = 600 * fbm2(x / 4000, z / 4000, 2, sd + 6);
        // longitudinal (linear) dunes ~2 km apart, 100 m tall, aligned west–east
        const dunes = 70 * Math.pow(0.5 + 0.5 * Math.sin((z + warp) / 320), 3) * low;
        h += hills + dunes + 2 * fbm2(x / 40, z / 40, 3, sd + 8);
        break;
      }
    }
    return h;
  }

  height(x: number, z: number, cell: number) {
    return this.curvature(x, z) + this.mapElevation(x, z) + this.detail(x, z, cell);
  }

  /** Build the near (high-resolution, around (cx, cz)) and far maps. */
  build(center: [number, number], nearSize: number, midSize: number, res: number, progress?: (p: number) => void) {
    this.near = this.buildMap(center[0], center[1], nearSize, res);
    progress?.(0.4);
    const fh = this.opts.farHalf;
    this.mid = this.buildMap(center[0], center[1], Math.min(midSize, fh * 1.6), res);
    progress?.(0.7);
    this.far = this.buildMap(0, 0, fh * 2, res);
    progress?.(1);
    this.field = new HeightField(this.near, this.far, Math.min(400, nearSize * 0.12));
    this.field.mid = this.mid;
    this.field.midBlend = Math.min(3000, this.mid.size * 0.12);
    return this.field;
  }

  buildMap(cx: number, cz: number, size: number, res: number) {
    const cell = size / (res - 1);
    return Heightmap.generate(cx, cz, size, res, (x, z) => this.height(x, z, cell));
  }

  /**
   * Incremental map rebuild for terrain streaming: refills `hm` (re-centred on cx, cz) a few rows per step,
   * reusing its buffer and texture.
   */
  *fillMap(hm: Heightmap, cx: number, cz: number, rowsPerStep = 48): Generator<number, Heightmap> {
    hm.recenter(cx, cz);
    const c = hm.cell, res = hm.res;
    for (let j = 0; j < res; j++) {
      const z = hm.minZ + j * c;
      for (let i = 0; i < res; i++) {
        const v = this.height(hm.minX + i * c, z, c);
        hm.data[j * res + i] = v;
        if (v < hm.min) hm.min = v;
        if (v > hm.max) hm.max = v;
      }
      if (j % rowsPerStep === rowsPerStep - 1) yield j / res;
    }
    return hm;
  }

  /** Surface normal from the height field. */
  normal(x: number, z: number, out = new THREE.Vector3()) {
    return this.field.normal(x, z, 1.5, out);
  }

  /** Rock (boulder) field probability at a point: near fresh craters' rims and on steep ground. */
  rockiness(x: number, z: number) {
    const base = this.def.rocks;
    const n = 0.5 + fbm2(x / 400, z / 400, 3, this.seed + 21);
    return base * THREE.MathUtils.smoothstep(n, 0.35, 0.75);
  }
}
