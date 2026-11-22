import { clamp, fbm2, hash2, smoothstep, vnoise } from '../../core/math';
import { earthMap, registerTerrainSource, TerrainSource } from './sources';
import { LANDING_FIELD } from '../earth/EarthMap';
import { BODY } from '../../space/Bodies';
import { LAZARUS_SITE, MARS_CAVE, MILLER_BASIN, MILLER_ROCKS, MILLER_SANDS, riftQuery } from './sites';

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
/** the rift, the basin, the outcrops and the sandy hollow, added to the flats (see sites.ts) */
function millerRelief(x: number, z: number) {
  let dh = 0;
  // the canyon: stepped walls (two ledges) from the rim down to a floor broken by a maze of rock spines
  const q = riftQuery(x, z);
  const w = q.w * (0.85 + 0.3 * fbm2(x / 90, z / 90, 3));
  const rim = w * 2.4;
  if (q.d < rim + 120) {
    // the approach: the flats shelve to a few metres near the canyon
    dh -= 2.5 * (1 - smoothstep(rim, rim + 120, q.d)) * smoothstep(0, 0.08, q.t + 0.04);
    const s = clamp((q.d - w * 0.7) / (rim - w * 0.7), 0, 1);
    const steps = (Math.floor(s * 3) + smoothstep(0.7, 1.0, (s * 3) % 1)) / 3;
    const wall = 1 - steps;
    // the canyon opens gradually from its western end
    const open = smoothstep(0.0, 0.06, q.t);
    let floor = q.depth * wall * open;
    // rock spines and blocks on the floor: shelter for the bottom dwellers, a maze for the swimmers
    const spines = ridged(x / 38 + 4, z / 38 - 2, 3);
    floor -= smoothstep(0.55, 0.9, spines) * Math.min(18, q.depth * 0.22) * (1 - s) * open;
    dh -= floor;
  }
  // the basin
  const bd = Math.hypot(x - MILLER_BASIN.x, z - MILLER_BASIN.z);
  if (bd < MILLER_BASIN.r * 1.4) {
    const s = clamp((bd - MILLER_BASIN.r * 0.55) / (MILLER_BASIN.r * 0.85), 0, 1);
    const steps = (Math.floor(s * 4) + smoothstep(0.65, 1.0, (s * 4) % 1)) / 4;
    const basin = MILLER_BASIN.depth * (1 - steps) + (fbm2(x / 120, z / 120, 3) - 0.5) * 20 * (1 - s);
    dh = Math.min(dh, -basin);
  }
  // black basalt outcrops breaking the surface on the flats
  for (const r of MILLER_ROCKS) {
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < r.r * 1.6) dh += Math.max(0, 1 - d / r.r) ** 0.6 * (0.9 + 0.8 * ridged(x / 7, z / 7, 2)) * 1.2;
  }
  // the sandy hollow
  const sd = Math.hypot(x - MILLER_SANDS.x, z - MILLER_SANDS.z);
  if (sd < MILLER_SANDS.r) dh -= 0.35 * (1 - smoothstep(MILLER_SANDS.r * 0.5, MILLER_SANDS.r, sd));
  return dh;
}

const miller: TerrainSource = {
  height(x, z) {
    const ripple = 0.5 + 0.5 * Math.sin((x * 0.6 + z * 0.8) / 0.9 + fbm2(x / 6, z / 6, 2) * 3);
    let h = MILLER_SEA_FLOOR + (fbm2(x / 800, z / 800, 4) - 0.5) * 0.5 + ripple * 0.06 + (fbm2(x / 40, z / 40, 3) - 0.5) * 0.18;
    // the odd shoal breaks the surface
    h += smoothstep(0.78, 0.92, fbm2(x / 1500 + 3, z / 1500 - 7, 4)) * 0.9;
    return h + millerRelief(x, z);
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
    h += ridged(u / 650, v / 650, 5) * 85 * smoothstep(250, 900, Math.hypot(x, z)) + ridged(u / 900, v / 900, 5) * 20;
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
    const rg = ridged(x / 650, z / 0.35 / 650, 5);
    out[0] = clamp(0.95 - n * 0.3, 0, 1);              // wind-packed snow crust
    out[1] = clamp(smoothstep(0.8, 0.95, c) * 0.9 + smoothstep(0.75, 0.95, rg) * 0.6, 0, 1); // blue ice in crevasses and on ridge crests
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

// ------------------------------------------------------------------------------------------- helpers for the rest
/** cells of a jittered grid: distance to the nearest and second-nearest centre (Worley), and the nearest's id */
function worley(x: number, z: number, cell: number, seed: number) {
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  let d1 = 1e9, d2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const ix = cx + i, iz = cz + j;
    const px = (ix + hash2(ix + seed, iz)) * cell, pz = (iz + hash2(ix, iz + seed)) * cell;
    const d = Math.hypot(x - px, z - pz) / cell;
    if (d < d1) { d2 = d1; d1 = d; id = hash2(ix * 7 - seed, iz * 3 + seed); } else if (d < d2) d2 = d;
  }
  return { d1, d2, id };
}

/** parallel grooves or ridges along a direction: profile 0..1 peaking at the line centres */
function lineations(x: number, z: number, spacing: number, angle: number, width: number, warp: number, seed: number) {
  const u = x * Math.cos(angle) + z * Math.sin(angle) + (fbm2(x / (spacing * 6) + seed, z / (spacing * 6), 3) - 0.5) * warp;
  const f = u / spacing - Math.floor(u / spacing);
  return Math.exp(-((f - 0.5) ** 2) / (2 * width * width));
}

/** a single big crater (bowl, rim, ejecta) at (cx, cz) */
function bigCrater(x: number, z: number, cx: number, cz: number, R: number, depth: number, rim: number) {
  const d = Math.hypot(x - cx, z - cz) / R;
  if (d < 1) return -depth * (1 - d * d) + rim * Math.pow(d, 8);
  return rim * Math.exp(-(d - 1) * 3);
}

// ------------------------------------------------------------------------------------------- Mercury
/** Beethoven basin rim: battered highland, craters at every scale, crossed by a lobate thrust scarp. */
const mercury: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 4000, z / 4000, 4) - 0.5) * 140 + (fbm2(x / 700, z / 700, 3) - 0.5) * 16;
    h += craters(x, z, 3000, 0.45, 101, 0.55) + craters(x, z, 800, 0.5, 103, 0.3) + craters(x, z, 200, 0.55, 107, 0.15) + craters(x, z, 50, 0.5, 109) + craters(x, z, 13, 0.4, 113);
    // lobate scarp ~1.5 km east: the ground steps up 250 m across a sinuous front
    const front = x - 1500 - (fbm2(z / 2500, 7, 3) - 0.5) * 1600;
    h += 250 * smoothstep(-60, 260, front) * (1 - 0.3 * smoothstep(300, 3000, front));
    h += boulders(x, z, 8, 0.07, 117, 0.6);
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const n = fbm2(x / 500, z / 500, 3), fresh = smoothstep(0.64, 0.8, fbm2(x / 110 + 9, z / 110, 3));
    out[0] = clamp(1 - fresh - 0.4 * n, 0, 1); out[1] = clamp(0.4 * n, 0, 1); out[2] = fresh * 0.8; out[3] = 0;
  },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Venus
/** Phoebe Regio, as Venera 13 saw it: flat plates of layered basalt with dark fine soil in the low spots. */
const venus: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 3500, z / 3500, 4) - 0.5) * 60 + (fbm2(x / 400, z / 400, 3) - 0.5) * 4;
    // slabs: terraces of 5-15 cm steps with soil filling the low cells
    const q = fbm2(x / 9, z / 9, 3) * 5 + fbm2(x / 60, z / 60, 2) * 3;
    const step = Math.floor(q), fr = q - step;
    h += step * 0.09 + smoothstep(0.0, 0.08, fr) * 0.09 - 0.045;
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const soil = smoothstep(0.55, 0.75, fbm2(x / 7, z / 7, 2)) * 0.8;
    out[0] = soil; out[1] = 1 - soil; out[2] = smoothstep(0.7, 0.85, fbm2(x / 30 + 3, z / 30, 2)) * 0.5; out[3] = 0;
  },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Phobos
/** On the rim of Stickney: the great crater's wall falls away to the east; grooves run across dark regolith. */
const phobos: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 1500, z / 1500, 4) - 0.5) * 60;
    h += bigCrater(x, z, 4600, 300, 4300, 900, 120);
    h -= lineations(x, z, 380, 0.35, 0.07, 160, 3) * 18 * smoothstep(0.3, 0.6, fbm2(x / 900, z / 900 + 4, 3));
    h += craters(x, z, 260, 0.45, 141, 0.4) + craters(x, z, 60, 0.4, 143, 0.2) + craters(x, z, 14, 0.35, 147);
    h += boulders(x, z, 10, 0.05, 149, 1.2);
    return padBlend(x, z, h);
  },
  splat(x, z, out) { const n = fbm2(x / 200, z / 200, 3); out[0] = 1 - 0.4 * n; out[1] = 0.4 * n; out[2] = 0; out[3] = 0; },
  aux: () => 0,
};

/** Deimos: smooth, mantled by a thick regolith that softens every crater. */
const deimos: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 1200, z / 1200, 4) - 0.5) * 50;
    h += craters(x, z, 700, 0.35, 151, 0.9) + craters(x, z, 120, 0.3, 153, 0.7) + craters(x, z, 25, 0.25, 157, 0.4);
    h += boulders(x, z, 14, 0.04, 159, 1.5);
    return padBlend(x, z, h);
  },
  splat(x, z, out) { const n = fbm2(x / 200, z / 200, 3); out[0] = 1 - 0.3 * n; out[1] = 0.3 * n; out[2] = 0; out[3] = 0; },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Io
/** By Loki Patera: sulphur plains, a caldera floor of dark lava, flat-topped mesas, and no impact craters at all. */
const io: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 5000, z / 5000, 4) - 0.5) * 120 + (fbm2(x / 500, z / 500, 3) - 0.5) * 6;
    // the patera: a steep-walled depression 200 m deep, its rim 6 km to the north-west
    const pd = Math.hypot(x + 9000, z + 8000) - 7500 - (fbm2(x / 2000, z / 2000, 3) - 0.5) * 1500;
    h -= 200 * smoothstep(300, -300, pd);
    // mesas with cliff edges
    const m = fbm2(x / 1800 + 21, z / 1800, 4);
    h += smoothstep(0.64, 0.67, m) * 160 * smoothstep(1500, 3500, Math.hypot(x, z));
    h += (fbm2(x / 30, z / 30, 2) - 0.5) * 0.6;
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const pd = Math.hypot(x + 9000, z + 8000) - 7500;
    const lava = smoothstep(200, -400, pd) + smoothstep(0.72, 0.8, fbm2(x / 700 + 5, z / 700, 4)) * 0.9;
    const red = smoothstep(0.62, 0.8, fbm2(x / 1500 - 3, z / 1500, 3)) * 0.6;
    const frost = smoothstep(0.62, 0.75, fbm2(x / 300 + 11, z / 300, 3));
    out[0] = clamp(1 - red - frost, 0, 1) * (1 - lava); out[1] = red * (1 - lava); out[2] = frost * (1 - lava); out[3] = clamp(lava, 0, 1);
  },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Europa
/** Conamara Chaos: rafts of the older ridged crust, broken and rotated, set in a hummocky refrozen matrix. */
const europa: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 3000, z / 3000, 4) - 0.5) * 60;
    const raft = worley(x, z, 900, 161);
    const isRaft = raft.id > 0.45 ? 1 : 0;
    const inner = smoothstep(0.06, 0.16, raft.d2 - raft.d1);
    // rafts stand up to ~100 m, cut by the ridges of the crust they came from (rotated per raft)
    const ang = raft.id * Math.PI * 2;
    const ridge = lineations(x, z, 110, ang, 0.09, 30, 5) * 14;
    h += isRaft * inner * (60 + raft.id * 60 + ridge);
    // the matrix between: lumpy refrozen ice
    h += (1 - isRaft * inner) * (fbm2(x / 70, z / 70, 4) - 0.5) * 22;
    // a double ridge crossing the field
    const u = x * 0.5 + z * 0.866 + (fbm2(x / 3000, z / 3000, 2) - 0.5) * 900;
    const v = Math.abs(u - 2500);
    h += (Math.exp(-((v - 120) ** 2) / 4000) + Math.exp(-((v + 120) ** 2) / 4000)) * 150 * (v < 600 ? 1 : 0);
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const raft = worley(x, z, 900, 161);
    const brown = raft.id > 0.45 ? 0.2 : 0.7;
    out[0] = 1 - brown; out[1] = brown * 0.6; out[2] = brown * 0.4; out[3] = 0;
  },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Ganymede
/** Uruk Sulcus: bright grooved terrain, sets of parallel ridges and troughs, beside darker cratered terrain. */
const ganymede: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 5000, z / 5000, 4) - 0.5) * 120;
    h += lineations(x, z, 6500, 0.4, 0.18, 2500, 7) * 320 + lineations(x, z, 900, 0.43, 0.12, 400, 9) * 45 + lineations(x, z, 160, 0.4, 0.1, 80, 11) * 6;
    // dark terrain beyond a boundary 7 km south: cratered
    const dark = smoothstep(6500, 7500, z + (fbm2(x / 3000, 3, 3) - 0.5) * 2000);
    h += dark * (craters(x, z, 1200, 0.5, 171, 0.6) + craters(x, z, 200, 0.5, 173, 0.3));
    h += craters(x, z, 2600, 0.15, 175, 0.4) + craters(x, z, 40, 0.3, 177, 0.1);
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const dark = smoothstep(6500, 7500, z + (fbm2(x / 3000, 3, 3) - 0.5) * 2000);
    const n = fbm2(x / 400, z / 400, 3);
    out[0] = (1 - dark) * (1 - 0.4 * n); out[1] = (1 - dark) * 0.4 * n; out[2] = dark; out[3] = 0;
  },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Callisto
/** Valhalla basin: the most cratered surface in the Solar System, dark lag, bright frost-capped knobs, ring scarps. */
const callisto: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 4000, z / 4000, 4) - 0.5) * 80;
    h += craters(x, z, 2500, 0.55, 181, 0.6) + craters(x, z, 600, 0.6, 183, 0.4) + craters(x, z, 150, 0.6, 187, 0.25) + craters(x, z, 35, 0.5, 189);
    // knobs: sublimation-eroded pinnacles tens of metres high
    const k = worley(x, z, 140, 191);
    h += smoothstep(0.35, 0.0, k.d1) * (k.id > 0.6 ? 45 * k.id : 0);
    // the outer ring scarps of the basin (centre far to the north)
    const ring = Math.hypot(x, z - 600000);
    h += smoothstep(-200, 200, Math.sin(ring / 3000) * 1000) * 90;
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const k = worley(x, z, 140, 191);
    const frost = k.id > 0.6 ? smoothstep(0.3, 0.05, k.d1) : 0;
    out[0] = clamp(0.8 - frost, 0, 1); out[1] = frost; out[2] = 0.2; out[3] = 0;
  },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Enceladus
/** Sarandib Planitia: smooth bright plains cut by fractures and pit chains; very few craters. */
const enceladus: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 3000, z / 3000, 4) - 0.5) * 50 + (fbm2(x / 300, z / 300, 3) - 0.5) * 5;
    const fr = ridged(x / 1800 + 4, z / 1800, 4);
    h -= smoothstep(0.88, 0.98, fr) * 40;
    const pits = worley(x, z, 300, 201);
    h -= smoothstep(0.3, 0.0, pits.d1) * (pits.id > 0.7 && smoothstep(0.75, 0.9, fr) > 0 ? 25 : 0);
    h += craters(x, z, 900, 0.12, 203, 0.7);
    return padBlend(x, z, h);
  },
  splat(x, z, out) { const n = fbm2(x / 300, z / 300, 3); out[0] = 1 - 0.3 * n; out[1] = 0.3 * n; out[2] = 0; out[3] = 0; },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Rhea, Titania, Iapetus
/** Rhea, near the rays of Inktomi: an old cratered ice crust under bright fresh ejecta. */
const rhea: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 4000, z / 4000, 4) - 0.5) * 120;
    h += craters(x, z, 2200, 0.5, 211, 0.6) + craters(x, z, 500, 0.55, 213, 0.35) + craters(x, z, 110, 0.55, 217, 0.2) + craters(x, z, 25, 0.45, 219);
    return padBlend(x, z, h);
  },
  splat(x, z, out) {
    const ray = Math.pow(Math.abs(Math.sin(Math.atan2(z + 40000, x - 25000) * 23 + fbm2(x / 3000, z / 3000, 2) * 3)), 30);
    out[0] = 0.6; out[1] = 0.4 * (1 - ray); out[2] = ray; out[3] = 0;
  },
  aux: () => 0,
};

/** Titania, on the floor near Messina Chasmata: fault-bounded canyon walls rise to the north. */
const titania: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 4000, z / 4000, 4) - 0.5) * 100;
    h += craters(x, z, 1800, 0.45, 221, 0.6) + craters(x, z, 400, 0.5, 223, 0.35) + craters(x, z, 90, 0.5, 227, 0.2) + craters(x, z, 22, 0.4, 229);
    // the graben: we are on its floor; its walls step up ~1.5 km at 4 and 7 km to the north
    const u = -z + (fbm2(x / 3000, 1, 3) - 0.5) * 1200;
    h += smoothstep(3500, 4300, u) * 900 + smoothstep(6500, 7300, u) * 700;
    h -= smoothstep(-4000, -4800, u) * -800;
    return padBlend(x, z, h);
  },
  splat(x, z, out) { const n = fbm2(x / 300, z / 300, 3); out[0] = 0.7 - 0.3 * n; out[1] = 0.3 * n + 0.1; out[2] = 0.2; out[3] = 0; },
  aux: () => 0,
};

/** Iapetus, Cassini Regio: a dark lag of organic dust over cratered ice; the odd bright crater wall. */
const iapetus: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 5000, z / 5000, 4) - 0.5) * 200;
    h += craters(x, z, 2500, 0.5, 231, 0.6) + craters(x, z, 600, 0.55, 233, 0.35) + craters(x, z, 120, 0.55, 237, 0.2) + craters(x, z, 30, 0.45, 239);
    return padBlend(x, z, h);
  },
  splat(x, z, out) { const n = fbm2(x / 400, z / 400, 3); out[0] = 0.8 - 0.3 * n; out[1] = 0.3 * n; out[2] = 0.15; out[3] = 0; },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Titan
/** The Huygens site: a dark, damp plain strewn with rounded ice cobbles, an old river outwash; dunes far off. */
const titan: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 3000, z / 3000, 4) - 0.5) * 30 + (fbm2(x / 200, z / 200, 3) - 0.5) * 1.5;
    // channels cut into the highland a few km north
    h += smoothstep(3000, 6000, -z) * (ridged(x / 2500, z / 2500, 4) * 120);
    // longitudinal dunes to the south, 100 m tall, 2 km apart
    h += smoothstep(4000, 8000, z) * Math.pow(lineations(x, z, 2000, 0.1, 0.18, 300, 13), 1.5) * 100;
    // cobbles: 5-15 cm rounded ice pebbles everywhere near the landing site
    h += boulders(x, z, 0.5, 0.35, 241, 0.08) + boulders(x, z, 2.2, 0.08, 243, 0.25);
    return padBlend(x, z, h);
  },
  splat(x, z, out) { const n = fbm2(x / 150, z / 150, 3); out[0] = 0.6 - 0.2 * n; out[1] = 0.4 + 0.2 * n; out[2] = smoothstep(4000, 8000, z) * 0.8; out[3] = 0; },
  aux: () => 0,
};

// ------------------------------------------------------------------------------------------- Triton
/** Bubembe Regio: the cantaloupe terrain, dimpled cells a few kilometres across with raised rims, crossed by ridges. */
const triton: TerrainSource = {
  height(x, z) {
    let h = (fbm2(x / 4000, z / 4000, 4) - 0.5) * 60;
    const c = worley(x, z, 1800, 251);
    h += -30 * smoothstep(0.7, 0.0, c.d1) + 25 * smoothstep(0.12, 0.0, c.d2 - c.d1);
    const u = x * 0.8 - z * 0.6 + (fbm2(x / 4000, z / 4000, 2) - 0.5) * 1500;
    const v = Math.abs(u - 3000);
    h += (Math.exp(-((v - 150) ** 2) / 8000) + Math.exp(-((v + 150) ** 2) / 8000)) * 120;
    h += craters(x, z, 600, 0.08, 253, 0.4);
    return padBlend(x, z, h);
  },
  splat(x, z, out) { const c = worley(x, z, 1800, 251); out[0] = 0.6 + 0.3 * c.id; out[1] = 0.4 - 0.3 * c.id; out[2] = 0; out[3] = 0; },
  aux: () => 0,
};

/**
 * The ground falls away with the curve of the world: d^2 / 2R below the pad's tangent plane (1.2 km at 32 km on the
 * Moon). Applied to the height field itself, so what is drawn, what is walked on and the globe drawn beyond the
 * terrain's edge all agree.
 */
export function curvatureDrop(id: string, x: number, z: number) { return (x * x + z * z) / (2 * BODY[id].R); }

const curved = (id: string, src: TerrainSource): TerrainSource => ({ ...src, height: (x, z) => src.height(x, z) - curvatureDrop(id, x, z) });

/** level the ground under a Lazarus camp to the natural height at its centre (see sites.ts) */
/** Mars: level ground round the cave opening, the ground kept above the chambers, the opening itself cut out */
function marsCave(src: TerrainSource): TerrainSource {
  const c = MARS_CAVE;
  let h0: number | null = null;
  return {
    ...src,
    height(x, z) {
      let h = src.height(x, z);
      if (h0 === null) h0 = src.height(c.x, c.z);
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.keep + 60) h = Math.max(h, h0 - 5 - 30 * smoothstep(c.keep, c.keep + 60, d));
      return h0 + (h - h0) * smoothstep(c.flat, c.flat + c.blend, d);
    },
    // a cell goes only when it lies wholly inside the opening (the ground's shader trims the rest exactly)
    hole: (x, z, cell = 1) => Math.hypot(x - c.x, z - c.z) + cell * 0.72 < c.r,
  };
}

function leveled(id: string, src: TerrainSource): TerrainSource {
  const s = LAZARUS_SITE[id];
  if (!s || !s.flat) return src;
  let h0: number | null = null;
  return {
    ...src,
    height(x, z) {
      const h = src.height(x, z);
      if (h0 === null) h0 = src.height(s.x, s.z);
      const k = smoothstep(s.flat, s.flat + s.blend, Math.hypot(x - s.x, z - s.z));
      return h0 + (h - h0) * k;
    },
  };
}

registerTerrainSource('surface:moon', () => curved('moon', moon));
registerTerrainSource('surface:mars', () => curved('mars', marsCave(mars)));
registerTerrainSource('surface:miller', () => curved('miller', miller));
registerTerrainSource('surface:mann', () => curved('mann', leveled('mann', mann)));
registerTerrainSource('surface:edmunds', () => curved('edmunds', leveled('edmunds', edmunds)));
for (const [id, src] of Object.entries({ mercury, venus, phobos, deimos, io, europa, ganymede, callisto, enceladus, rhea, titania, iapetus, titan, triton })) {
  registerTerrainSource(`surface:${id}`, () => curved(id, src));
}

/** Earth: the farmland round NASA's landing field, from the same map as the Earth zone (pad at the origin) */
registerTerrainSource('surface:earth', () => {
  const m = earthMap(), L = LANDING_FIELD;
  return curved('earth', {
    height: (x, z) => m.height(x + L.x, z + L.z) - m.landingY,
    splat: (x, z, out) => m.splat(x + L.x, z + L.z, out),
    aux: (x, z) => m.cornDensity(x + L.x, z + L.z),
  });
});
