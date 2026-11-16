import { clamp, fbm2, hash2, smoothstep, vnoise } from '../../core/math';
import { registerTerrainSource, TerrainSource } from './sources';
import { BODY } from '../../space/Bodies';

/*
 * Procedural ground for the landing sites, in a local frame centred on the landing pad (y up, metres). Each is a
 * pure function of (x, z) so the mesh worker and the main thread (physics, gameplay) agree exactly. The pad itself
 * is levelled to height 0 within PAD metres and blended out over the next PAD_BLEND.
 */

const PAD = 45, PAD_BLEND = 90;

/** level the ground around the pad (and a base, if any) */
function padBlend(x: number, z: number, h: number) {
  const r = Math.hypot(x, z);
  const k = smoothstep(PAD, PAD + PAD_BLEND, r);
  return h * k;
}

/** ridged multifractal: sharp crests, for ice ridges and mountains */
function ridged(x: number, y: number, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(vnoise(x * f + i * 31.7, y * f - i * 17.3) * 2 - 1);
    v *= v * w;
    w = clamp(v * 2, 0, 1);
    s += a * v; n += a; a *= 0.5; f *= 2.07;
  }
  return s / n;
}

/**
 * A population of simple-crater bowls on a grid of cells (one candidate per cell): bowl depth ~0.2 D, raised rim,
 * ejecta falling off outside. Fresh craters at small sizes, softened ones (degraded rims) at large.
 */
function craters(x: number, z: number, cell: number, density: number, seed: number, degrade = 0) {
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  let h = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ix = cx + i, iz = cz + j;
      if (hash2(ix * 7 + seed, iz * 13 - seed) > density) continue;
      const px = (ix + 0.15 + 0.7 * hash2(ix + seed * 3, iz)) * cell;
      const pz = (iz + 0.15 + 0.7 * hash2(ix, iz + seed * 5)) * cell;
      const R = cell * (0.12 + 0.3 * Math.pow(hash2(ix - seed, iz + seed), 2));
      const d = Math.hypot(x - px, z - pz) / R;
      if (d > 2.6) continue;
      const depth = R * 0.4 * (1 - 0.6 * degrade), rim = R * 0.08 * (1 - 0.7 * degrade);
      if (d < 1) h += -depth * (1 - d * d) * (1 - 0.35 * degrade * (1 - d)) + rim * Math.pow(d, 6);
      else h += rim * Math.exp(-(d - 1) * 3.2);
    }
  }
  return h;
}

/** small boulders: hemispherical bumps (most of the rock detail is in the textures and props) */
function boulders(x: number, z: number, cell: number, density: number, seed: number, size: number) {
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  let h = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const ix = cx + i, iz = cz + j;
    if (hash2(ix * 3 + seed, iz * 5 - seed) > density) continue;
    const px = (ix + hash2(ix + seed, iz)) * cell, pz = (iz + hash2(ix, iz + seed)) * cell;
    const r = size * (0.4 + hash2(ix - seed, iz + 7));
    const d = Math.hypot(x - px, z - pz) / r;
    if (d < 1) h = Math.max(h, r * 0.6 * Math.sqrt(1 - d * d));
  }
  return h;
}

// ------------------------------------------------------------------------------------------- Moon
/** Mare Tranquillitatis: a smooth basalt plain, gently rolling, saturated with craters at every scale. */
const moon: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 3000, z / 3000, 4) - 0.5) * 18 + (fbm2(x / 600, z / 600, 3) - 0.5) * 4;
    h += craters(x, z, 2400, 0.35, 11, 0.7) + craters(x, z, 700, 0.5, 23, 0.4) + craters(x, z, 180, 0.55, 37, 0.2) + craters(x, z, 45, 0.5, 41) + craters(x, z, 12, 0.45, 53);
    h += boulders(x, z, 9, 0.06, 61, 0.7);
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const n = fbm2(x / 400, z / 400, 3);
    const fresh = smoothstep(0.62, 0.8, fbm2(x / 90 + 40, z / 90, 3));
    out[0] = clamp(1 - fresh - 0.3 * n, 0, 1);     // regolith
    out[1] = clamp(0.3 * n, 0, 1);                  // darker regolith (tint)
    out[2] = fresh * 0.8;                           // ejecta: gravel
    out[3] = 0;
  },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Mars
/** Gale crater floor: dusty plains, low dunes, eroded craters, the foot of Aeolis Mons rising to the south. */
const mars: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 4000, z / 4000, 4) - 0.5) * 60 + (fbm2(x / 500, z / 500, 3) - 0.5) * 6;
    // dunes: asymmetric ridges across the prevailing wind
    const w = x * 0.8 + z * 0.6 + (fbm2(x / 300, z / 300, 2) - 0.5) * 120;
    const dune = Math.pow(0.5 + 0.5 * Math.sin(w / 38), 3) * smoothstep(0.45, 0.7, fbm2(x / 1800 + 9, z / 1800, 3));
    h += dune * 4.5;
    h += craters(x, z, 1500, 0.3, 17, 0.85) + craters(x, z, 260, 0.35, 29, 0.5) + craters(x, z, 40, 0.3, 31, 0.2);
    h += boulders(x, z, 6, 0.1, 71, 0.6);
    // the mountain: Aeolis Mons begins ~9 km to the south (+z) and climbs in layered benches
    const s = Math.max(0, z - 9000);
    if (s > 0) h += s * 0.12 * (1 + 0.15 * Math.sin(s / 220 + fbm2(x / 900, z / 900, 2) * 6)) + ridged(x / 2500, z / 2500, 4) * s * 0.05;
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const n = fbm2(x / 300, z / 300, 3), m = fbm2(x / 1200 + 5, z / 1200, 3);
    out[0] = clamp(0.7 - 0.4 * m, 0, 1);            // dust / soil
    out[1] = clamp(m - 0.35, 0, 1);                  // darker basaltic sand
    out[2] = clamp(n - 0.55, 0, 1) * 1.6;            // pebbles / gravel
    out[3] = smoothstep(9000, 10500, z) * 0.7;       // bedrock on the mountain
  },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Miller
/** Miller's planet: a planet-wide sea about knee-deep over a flat, rippled floor (the water surface is y = 0). */
export const MILLER_SEA_FLOOR = -0.55;
const miller: TerrainSource = {
  height(x, z) {
    const ripple = 0.5 + 0.5 * Math.sin((x * 0.6 + z * 0.8) / 0.9 + fbm2(x / 6, z / 6, 2) * 3);
    let h = MILLER_SEA_FLOOR + (fbm2(x / 800, z / 800, 4) - 0.5) * 0.5 + ripple * 0.06 + (fbm2(x / 40, z / 40, 3) - 0.5) * 0.18;
    // the odd shoal breaks the surface
    h += smoothstep(0.78, 0.92, fbm2(x / 1500 + 3, z / 1500 - 7, 4)) * 0.9;
    return h;
  },
  splat(x, z, out) {
    const n = fbm2(x / 200, z / 200, 3);
    out[0] = 1 - 0.4 * n; out[1] = 0.4 * n; out[2] = 0; out[3] = 0;
  },
  aux: () => 1,
};

// ------------------------------------------------------------------------------------------- Mann
/** Mann's planet: a glacier surface of flow ridges and pressure ridges cut by crevasses, under frozen cloud. */
const mann: TerrainSource = {
  height(x, z) {
    // flow along x: ridges stretched across it
    const u = x / 1.0, v = z / 0.35;
    let h = (fbm2(x / 3500, z / 3500, 4) - 0.5) * 90;
    h += ridged(u / 900, v / 900, 5) * 38;
    h += (fbm2(x / 120, z / 120, 3) - 0.5) * 5;
    // crevasses: narrow deep cuts along ridged-noise valleys, in bands
    const c = ridged(x / 260 + 11, z / 700 - 4, 3);
    const band = smoothstep(0.55, 0.75, fbm2(x / 2500 - 9, z / 2500 + 2, 3));
    h -= smoothstep(0.86, 0.97, c) * 22 * band;
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const n = fbm2(x / 250, z / 250, 3);
    const c = ridged(x / 260 + 11, z / 700 - 4, 3);
    out[0] = clamp(0.8 - n * 0.5, 0, 1);              // snow crust
    out[1] = clamp(n * 0.8 + smoothstep(0.8, 0.95, c) * 0.8, 0, 1); // blue ice
    out[2] = smoothstep(0.7, 0.9, fbm2(x / 600 + 2, z / 600, 3)) * 0.6; // dirty ice bands
    out[3] = 0;
  },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Edmunds
/** Edmunds' planet: a stony desert floor between mesas and mountain ranges, boulder fields and dry washes. */
const edmunds: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 5000, z / 5000, 4) - 0.5) * 80 + (fbm2(x / 700, z / 700, 3) - 0.5) * 10;
    // mountains: ridged ranges that rise beyond ~4 km from the base
    const r = Math.hypot(x, z);
    const rise = smoothstep(3500, 9000, r);
    h += Math.pow(ridged(x / 6000 + 3, z / 6000 - 2, 6), 2) * 1400 * rise;
    // mesas: flat-topped buttes with cliff sides
    const m = fbm2(x / 2200 - 13, z / 2200 + 5, 4);
    h += smoothstep(0.66, 0.69, m) * 140 * smoothstep(1500, 3000, r);
    // dry washes
    h -= smoothstep(0.93, 0.99, ridged(x / 1400, z / 1400 + 9, 3)) * 4;
    h += boulders(x, z, 7, 0.12, 83, 0.9) + boulders(x, z, 31, 0.08, 89, 2.2);
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const n = fbm2(x / 260, z / 260, 3), m = fbm2(x / 1500 + 7, z / 1500, 3);
    out[0] = clamp(0.8 - m * 0.6, 0, 1);            // sand
    out[1] = clamp(n - 0.3, 0, 1);                   // desert gravel
    out[2] = clamp(m - 0.5, 0, 1) * 1.4;             // dirt / hardpan
    out[3] = smoothstep(0.6, 0.8, fbm2(x / 90, z / 90, 2)) * 0.4;
  },
  aux: () => 0,
};

/**
 * The ground falls away with the curve of the world: d^2 / 2R below the pad's tangent plane (1.2 km at 32 km on the
 * Moon). Applied to the height field itself, so what is drawn, what is walked on and the globe drawn beyond the
 * terrain's edge all agree.
 */
export function curvatureDrop(id: string, x: number, z: number) { return (x * x + z * z) / (2 * BODY[id].R); }

const curved = (id: string, src: TerrainSource): TerrainSource => ({ ...src, height: (x, z) => src.height(x, z) - curvatureDrop(id, x, z) });

registerTerrainSource('surface:moon', () => curved('moon', moon));
registerTerrainSource('surface:mars', () => curved('mars', mars));
registerTerrainSource('surface:miller', () => curved('miller', miller));
registerTerrainSource('surface:mann', () => curved('mann', mann));
registerTerrainSource('surface:edmunds', () => curved('edmunds', edmunds));
