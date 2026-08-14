#!/usr/bin/env node
/**
 * Ornight Plus — night field generator.
 *
 * Renders the hero background behind the splash screen and, cropped, inside
 * the sidebar badge: an open field at night under a deep starry sky, lit by a
 * low moon. Everything here is procedural. There is no source photograph, no
 * dependency and no network access — just arithmetic and `node:zlib`.
 *
 *   Run:  node apps/tablet/src/brand/generate-night-field.mjs
 *
 *   Writes: apps/tablet/src/brand/night-field.png        2560 x 1600
 *           apps/tablet/src/brand/night-field-thumb.png   320 x  200
 *
 * The outputs are committed, so this only needs re-running when the art
 * direction changes. `SEED` makes it deterministic: the same seed always
 * produces the same sky, so a re-run is a no-op in git unless something above
 * it actually changed.
 *
 * Pipeline
 * --------
 * The whole frame accumulates in *linear* light as float RGB. Star cores and
 * the moon are allowed to blow past 1.0 and are pulled back by a filmic
 * shoulder at the very end, which is what gives bright stars a natural core
 * rather than a clipped white dot. Only the final encode step converts to
 * sRGB, dithers, and quantises to 8 bits.
 *
 *   sky gradient -> milky way -> stars -> moon + halo -> horizon haze
 *   -> mist -> field layers (far to near, each with aerial perspective)
 *   -> vignette -> grade -> grain -> tonemap -> sRGB -> PNG
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const W = 2560;
const H = 1600;
const THUMB_W = 320;
const THUMB_H = 200;
const SEED = 20260811;

/** Where the land meets the sky, as a fraction of image height. */
const HORIZON = 0.615;
const HORIZON_Y = Math.round(H * HORIZON);

/** The moon is the only light source; everything below agrees with it. */
const MOON_X = W * 0.715;
const MOON_Y = HORIZON_Y - H * 0.185;
const MOON_R = H * 0.026;

/* -------------------------------------------------------------------------- */
/* Small maths                                                                */
/* -------------------------------------------------------------------------- */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer lattice hash in [0,1). Stable across runs and platforms. */
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise with a smoothstep interpolant. Cheap, and smooth enough here. */
function vnoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, seed, octaves = 5, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * vnoise(fx, fy, seed + i * 1013);
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / norm;
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                     */
/* -------------------------------------------------------------------------- */

/** sRGB hex -> linear float triple. All art-direction colours are authored in
 *  sRGB because that is how eyes and colour pickers work; the renderer needs
 *  linear because that is how light works. */
function srgbHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(toLinear);
}

function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Blackbody-ish star tint, from cool blue-white through pale gold. */
function starTint(t) {
  // t: 0 = blue-white, 1 = warm gold.
  const r = lerp(0.78, 1.0, t);
  const g = lerp(0.86, 0.92, t);
  const b = lerp(1.0, 0.76, t);
  return [r, g, b];
}

/* -------------------------------------------------------------------------- */
/* Framebuffer                                                                */
/* -------------------------------------------------------------------------- */

const img = new Float32Array(W * H * 3);

function addPixel(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] += r;
  img[i + 1] += g;
  img[i + 2] += b;
}

/** Composite an opaque colour over the buffer with coverage `a`. */
function overPixel(x, y, r, g, b, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  const k = 1 - a;
  img[i] = img[i] * k + r * a;
  img[i + 1] = img[i + 1] * k + g * a;
  img[i + 2] = img[i + 2] * k + b * a;
}

/* -------------------------------------------------------------------------- */
/* 1. Sky gradient                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Vertical ramp from near-black indigo at the zenith through deep blue, to a
 * faint horizon glow that is cool on the left and just barely warm under the
 * moon. Stops are in sRGB, positions are fractions of the sky's height.
 */
const SKY_STOPS = [
  { t: 0.0, c: srgbHex('#02030a') },
  { t: 0.26, c: srgbHex('#050813') },
  { t: 0.52, c: srgbHex('#080e22') },
  { t: 0.74, c: srgbHex('#0d1733' ) },
  { t: 0.9, c: srgbHex('#121e42') },
  { t: 1.0, c: srgbHex('#182a56') },
];

function sampleStops(stops, t) {
  const x = clamp01(t);
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (x >= a.t && x <= b.t) {
      const k = smoothstep(a.t, b.t, x);
      return [lerp(a.c[0], b.c[0], k), lerp(a.c[1], b.c[1], k), lerp(a.c[2], b.c[2], k)];
    }
  }
  return stops[stops.length - 1].c;
}

function renderSky() {
  for (let y = 0; y < HORIZON_Y + 4; y += 1) {
    const t = y / HORIZON_Y;
    const [r, g, b] = sampleStops(SKY_STOPS, t);
    for (let x = 0; x < W; x += 1) {
      // A very slight horizontal lean so the sky is not a flat vertical ramp.
      const lean = 1 + (x / W - 0.5) * 0.06 * t;
      const i = (y * W + x) * 3;
      img[i] = r * lean;
      img[i + 1] = g * lean;
      img[i + 2] = b * lean;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Milky Way                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A soft band across the upper third, rotated a few degrees. The band is
 * fbm-modulated so it breaks into clumps rather than reading as an airbrushed
 * stripe, and a second, narrower negative band cuts the dust lane through it.
 *
 * Returns a density function reused by the star pass, so star counts rise
 * inside the band exactly where the glow is.
 */
const MW_ANGLE = (-14 * Math.PI) / 180;
const MW_COS = Math.cos(MW_ANGLE);
const MW_SIN = Math.sin(MW_ANGLE);
const MW_CX = W * 0.42;
const MW_CY = H * 0.19;
const MW_HALF = H * 0.155;

function milkyWayDensity(x, y) {
  const dx = x - MW_CX;
  const dy = y - MW_CY;
  // Distance from the band's spine, in rotated space.
  const across = -dx * MW_SIN + dy * MW_COS;
  const along = dx * MW_COS + dy * MW_SIN;

  // Wobble the spine so it is not a ruler-straight line.
  const wobble = (fbm(along / 620, 3.1, SEED + 91, 3) - 0.5) * MW_HALF * 0.7;
  const d = Math.abs(across - wobble) / MW_HALF;
  if (d > 1.6) return 0;

  let band = Math.exp(-d * d * 2.1);

  // Clumping.
  const clump = fbm(x / 260, y / 190, SEED + 17, 5);
  band *= 0.42 + clump * 1.05;

  // The dust lane: a narrower dark ribbon offset from the spine.
  const lane = Math.exp(-Math.pow((across - wobble - MW_HALF * 0.22) / (MW_HALF * 0.3), 2) * 1.4);
  band *= 1 - lane * (0.4 + 0.34 * fbm(x / 150, y / 120, SEED + 55, 3));

  // Fade out where the band runs off the top and toward the horizon.
  band *= smoothstep(0, H * 0.05, y) * (1 - smoothstep(H * 0.34, H * 0.52, y));
  return clamp01(band);
}

function renderMilkyWay() {
  const cool = srgbHex('#8fa6d8');
  const warm = srgbHex('#cbb9c9');
  for (let y = 0; y < Math.round(H * 0.55); y += 1) {
    for (let x = 0; x < W; x += 1) {
      const d = milkyWayDensity(x, y);
      if (d <= 0.002) continue;
      const mix = fbm(x / 420, y / 380, SEED + 300, 3);
      const amt = d * 0.05;
      addPixel(
        x,
        y,
        lerp(cool[0], warm[0], mix) * amt,
        lerp(cool[1], warm[1], mix) * amt,
        lerp(cool[2], warm[2], mix) * amt,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Stars                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * ~4200 stars on a power-law magnitude distribution: thousands of faint ones,
 * a few dozen obvious ones, a dozen genuinely bright. Each is a radial falloff
 * rather than a hard pixel, so they survive downscaling and never alias. The
 * brightest get a subtle four-point diffraction cross.
 */
function renderStars() {
  const rand = mulberry32(SEED + 7);
  const COUNT = 4200;
  const bright = [];

  for (let n = 0; n < COUNT; n += 1) {
    const x = rand() * W;
    // Stars thin out toward the horizon, where haze eats them.
    const y = Math.pow(rand(), 0.86) * (HORIZON_Y - 6);

    // Rejection sampling: the Milky Way carries a much higher star density.
    const mw = milkyWayDensity(x, y);
    if (rand() > 0.34 + mw * 1.5) continue;

    // Power law: u^-p gives many faint, few bright.
    const u = rand();
    const mag = Math.pow(u, 3.3);
    let intensity = 0.05 + mag * 3.6;

    // Atmospheric extinction near the horizon.
    intensity *= lerp(0.25, 1, smoothstep(HORIZON_Y, HORIZON_Y - H * 0.42, y));
    // The moon's glare washes out its neighbourhood.
    const md = Math.hypot(x - MOON_X, y - MOON_Y);
    intensity *= lerp(0.18, 1, smoothstep(MOON_R * 2, MOON_R * 22, md));
    if (intensity < 0.012) continue;

    const tint = starTint(Math.pow(rand(), 1.6));
    const radius = 0.75 + Math.pow(intensity, 0.42) * 1.9;

    stampStar(x, y, radius, intensity, tint);
    if (intensity > 1.5) bright.push({ x, y, intensity, tint });
  }

  // The brightest dozen or so get diffraction spikes.
  bright.sort((a, b) => b.intensity - a.intensity);
  for (const star of bright.slice(0, 14)) {
    diffraction(star.x, star.y, star.intensity, star.tint);
  }
}

function stampStar(cx, cy, radius, intensity, tint) {
  const r = Math.ceil(radius * 3);
  const inv = 1 / (radius * radius);
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const d2 = dx * dx + dy * dy;
      // Gaussian core plus a wide, very faint aureole.
      const core = Math.exp(-d2 * inv * 1.6);
      const halo = Math.exp(-d2 * inv * 0.12) * 0.09;
      const a = (core + halo) * intensity;
      if (a < 0.0016) continue;
      addPixel(Math.round(cx) + dx, Math.round(cy) + dy, tint[0] * a, tint[1] * a, tint[2] * a);
    }
  }
}

function diffraction(cx, cy, intensity, tint) {
  const len = 6 + intensity * 11;
  const amp = intensity * 0.1;
  for (let d = 1; d <= len; d += 1) {
    const f = Math.pow(1 - d / len, 2.4) * amp;
    if (f < 0.001) continue;
    for (const [ox, oy] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ]) {
      addPixel(Math.round(cx + ox), Math.round(cy + oy), tint[0] * f, tint[1] * f, tint[2] * f);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 4. Moon and halo                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A small, soft, slightly gibbous moon low in the sky with a large diffuse
 * halo bleeding into the surrounding air. The halo is three stacked
 * exponentials at very different radii — that is what makes it read as
 * atmosphere rather than as a lens flare.
 */
function renderMoon() {
  const disc = srgbHex('#f4f1e6');
  const glow = srgbHex('#9fb6e8');
  const reach = MOON_R * 34;

  const x0 = Math.max(0, Math.floor(MOON_X - reach));
  const x1 = Math.min(W - 1, Math.ceil(MOON_X + reach));
  const y0 = Math.max(0, Math.floor(MOON_Y - reach));
  const y1 = Math.min(HORIZON_Y + 8, Math.ceil(MOON_Y + reach));

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d = Math.hypot(x - MOON_X, y - MOON_Y);
      if (d > reach) continue;

      // Halo: tight bloom, mid glow, and a very wide skyglow.
      const h1 = Math.exp(-Math.pow(d / (MOON_R * 2.1), 1.7)) * 0.5;
      const h2 = Math.exp(-Math.pow(d / (MOON_R * 6.5), 1.5)) * 0.13;
      const h3 = Math.exp(-Math.pow(d / (MOON_R * 19), 1.25)) * 0.045;
      const halo = h1 + h2 + h3;
      if (halo > 0.0009) {
        addPixel(x, y, glow[0] * halo, glow[1] * halo, glow[2] * halo);
      }

      // The disc itself, with a soft limb and a faint terminator on the left.
      if (d < MOON_R * 1.4) {
        const cov = 1 - smoothstep(MOON_R * 0.92, MOON_R * 1.06, d);
        if (cov > 0.001) {
          const nx = (x - MOON_X) / MOON_R;
          const ny = (y - MOON_Y) / MOON_R;
          const shade = 0.82 + 0.18 * clamp01(1 - Math.hypot(nx + 0.28, ny + 0.2) * 0.75);
          // Maria: faint low-contrast mottling so the disc is not a flat coin.
          const maria = 1 - 0.1 * fbm(x / 9 + 40, y / 9 + 40, SEED + 601, 3);
          const k = cov * shade * maria * 2.6;
          addPixel(x, y, disc[0] * k, disc[1] * k, disc[2] * k);
        }
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 5. Horizon haze and mist                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Air has depth. A band of lifted, desaturated value hugs the horizon, warmed
 * slightly on the moon's side, and a separate low mist layer sits just above
 * the far grass so the field dissolves into the sky instead of butting into it.
 */
function renderHaze() {
  const hazeCool = srgbHex('#2b3f6b');
  const hazeWarm = srgbHex('#4a5578');

  for (let y = Math.round(HORIZON_Y - H * 0.3); y < Math.min(H, HORIZON_Y + H * 0.06); y += 1) {
    const band = Math.exp(-Math.pow((y - HORIZON_Y) / (H * 0.115), 2) * 1.1);
    if (band < 0.002) continue;
    for (let x = 0; x < W; x += 1) {
      // Warmer and brighter under the moon, cooling away from it.
      const near = clamp01(1 - Math.abs(x - MOON_X) / (W * 0.62));
      const amt = band * (0.055 + near * 0.075);
      const t = near * 0.8;
      addPixel(
        x,
        y,
        lerp(hazeCool[0], hazeWarm[0], t) * amt,
        lerp(hazeCool[1], hazeWarm[1], t) * amt,
        lerp(hazeCool[2], hazeWarm[2], t) * amt,
      );
    }
  }
}

function renderMist(topY) {
  const mist = srgbHex('#3d4a6e');
  const y0 = Math.round(topY - H * 0.045);
  const y1 = Math.round(topY + H * 0.11);
  for (let y = y0; y < Math.min(H, y1); y += 1) {
    const band = Math.exp(-Math.pow((y - (topY + H * 0.02)) / (H * 0.05), 2) * 1.3);
    if (band < 0.003) continue;
    for (let x = 0; x < W; x += 1) {
      const drift = fbm(x / 430, y / 90, SEED + 777, 4);
      const near = clamp01(1 - Math.abs(x - MOON_X) / (W * 0.8));
      const amt = band * (0.2 + drift * 0.85) * (0.05 + near * 0.05);
      addPixel(x, y, mist[0] * amt, mist[1] * amt, mist[2] * amt);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 6. The field                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Six depth layers of grass and wheat receding to the horizon.
 *
 * Aerial perspective does the heavy lifting: far layers are lifted in value,
 * pushed toward the haze colour, and blurred; near layers are near-black,
 * sharp, and drawn stalk by stalk with real curvature and a consistent wind
 * lean. Every layer catches a rim of moonlight on the side of the stalk that
 * faces the moon.
 *
 * Each layer is rendered into a coverage mask, blurred by the layer's own
 * radius, and only then composited — blurring the mask rather than the pixels
 * is what keeps the far layers soft without smearing the sky behind them.
 */
const LAYERS = [
  // topY: mean height of the silhouette edge. hue: silhouette colour.
  { topY: 0.618, amp: 0.006, colour: '#151f3c', blur: 7, stalks: 0, height: 0.012, width: 0.9 },
  { topY: 0.632, amp: 0.011, colour: '#111936', blur: 5, stalks: 2600, height: 0.026, width: 1.0 },
  { topY: 0.664, amp: 0.02, colour: '#0c122a', blur: 3, stalks: 2400, height: 0.05, width: 1.25 },
  { topY: 0.716, amp: 0.033, colour: '#080d20', blur: 1.6, stalks: 2000, height: 0.086, width: 1.7 },
  { topY: 0.796, amp: 0.05, colour: '#050818', blur: 0.7, stalks: 1500, height: 0.14, width: 2.4 },
  { topY: 0.906, amp: 0.07, colour: '#03050f', blur: 0, stalks: 900, height: 0.23, width: 3.6 },
];

const mask = new Float32Array(W * H);
const rim = new Float32Array(W * H);

function renderField() {
  for (let index = 0; index < LAYERS.length; index += 1) {
    const layer = LAYERS[index];
    mask.fill(0);
    rim.fill(0);

    const topY = layer.topY * H;
    const amp = layer.amp * H;
    const depth = index / (LAYERS.length - 1); // 0 = farthest, 1 = nearest

    buildGround(layer, topY, amp, index);
    if (layer.stalks > 0) drawStalks(layer, topY, amp, index, depth);

    if (layer.blur > 0) blurBuffer(mask, layer.blur);
    if (layer.blur > 0) blurBuffer(rim, layer.blur * 0.8);

    compositeLayer(layer, depth);

    // The mist sits between the two farthest layers, so the field dissolves
    // into the sky rather than stopping at a line.
    if (index === 0) renderMist(topY);
  }
}

/** Fill everything below a noisy height field. */
function buildGround(layer, topY, amp, index) {
  for (let x = 0; x < W; x += 1) {
    const n =
      fbm(x / 520, index * 7.3, SEED + 200 + index * 31, 4) * 0.65 +
      fbm(x / 90, index * 3.1, SEED + 400 + index * 17, 3) * 0.35;
    const edge = topY + (n - 0.5) * 2 * amp;
    const start = Math.max(0, Math.floor(edge));
    // Antialias the top edge, then fill solid to the bottom.
    for (let y = start; y < H; y += 1) {
      const cov = clamp01(y + 1 - edge);
      const i = y * W + x;
      if (cov > mask[i]) mask[i] = cov;
      if (cov >= 1) {
        // Solid from here down; jump straight to the bottom.
        for (let yy = y + 1; yy < H; yy += 1) mask[yy * W + x] = 1;
        break;
      }
    }
  }
}

/**
 * Individual stalks. Each is a quadratic curve leaning with the wind, tapering
 * to a point, with a slightly heavier seed head near the tip on the front
 * layers so the crop reads as wheat rather than lawn.
 */
function drawStalks(layer, topY, amp, index, depth) {
  const rand = mulberry32(SEED + 900 + index * 131);
  const meanHeight = layer.height * H;
  const halfWidth = layer.width;

  for (let n = 0; n < layer.stalks; n += 1) {
    const x0 = rand() * (W + 120) - 60;

    // Density varies along x, so the crop clumps instead of being uniform.
    if (rand() > 0.35 + fbm(x0 / 340, index * 11.7, SEED + 640 + index, 3) * 0.9) continue;

    const baseY = topY + (rand() - 0.5) * 2 * amp + meanHeight * 0.18;
    const h = meanHeight * (0.45 + Math.pow(rand(), 0.7) * 1.15);
    // Consistent wind direction with per-stalk variation.
    const lean = (0.16 + rand() * 0.42) * h * (rand() < 0.82 ? 1 : -0.5);
    const bend = 0.35 + rand() * 0.5;
    const w0 = halfWidth * (0.55 + rand() * 0.8);
    const head = depth > 0.35 && rand() < 0.62;

    const steps = Math.max(6, Math.ceil(h * 2));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const y = baseY - h * t;
      const x = x0 + lean * Math.pow(t, 1 + bend);
      // Taper to a point.
      let w = w0 * Math.pow(1 - t, 0.62);
      // Seed head: a spindle swelling just below the tip.
      if (head) w += w0 * 1.5 * Math.exp(-Math.pow((t - 0.8) / 0.13, 2));
      if (w < 0.12) w = 0.12;

      stampStalk(x, y, w, t, lean, depth);
    }
  }
}

/**
 * One horizontal slice of a stalk, with antialiased coverage, plus the
 * moonlight rim on whichever side faces the moon.
 */
function stampStalk(cx, cy, w, t, lean, depth) {
  const y = Math.round(cy);
  if (y < 0 || y >= H) return;
  const row = y * W;
  const x0 = Math.floor(cx - w - 1);
  const x1 = Math.ceil(cx + w + 1);

  // The moon is to the right of most of the frame, so lit edges face it.
  const lightDir = cx < MOON_X ? 1 : -1;
  // Tips catch more light than bases, and near layers catch more than far.
  const rimAmount = Math.pow(t, 1.5) * (0.32 + depth * 0.75);

  for (let x = x0; x <= x1; x += 1) {
    if (x < 0 || x >= W) continue;
    const d = Math.abs(x - cx);
    const cov = clamp01(w + 0.5 - d);
    if (cov <= 0) continue;
    const i = row + x;
    if (cov > mask[i]) mask[i] = cov;

    // Rim: a bright sliver on the lit flank only.
    const side = (x - cx) * lightDir;
    if (side > w * 0.1) {
      const edge = clamp01((side - w * 0.1) / Math.max(0.4, w * 0.9));
      const r = edge * cov * rimAmount;
      if (r > rim[i]) rim[i] = r;
    }
  }
  // Nudge the rim by the lean so it tracks the curve rather than sitting flat.
  void lean;
}

/**
 * Separable box blur, run three times to approximate a Gaussian. Operates on
 * the coverage buffers only — never on the composited image.
 */
const blurTmp = new Float32Array(W * H);
function blurBuffer(buf, radius) {
  const r = Math.max(1, Math.round(radius));
  for (let pass = 0; pass < 3; pass += 1) {
    // Horizontal
    for (let y = 0; y < H; y += 1) {
      const row = y * W;
      let sum = 0;
      for (let x = -r; x <= r; x += 1) sum += buf[row + clamp(x, 0, W - 1)];
      const norm = 1 / (2 * r + 1);
      for (let x = 0; x < W; x += 1) {
        blurTmp[row + x] = sum * norm;
        sum += buf[row + clamp(x + r + 1, 0, W - 1)] - buf[row + clamp(x - r, 0, W - 1)];
      }
    }
    // Vertical
    for (let x = 0; x < W; x += 1) {
      let sum = 0;
      for (let y = -r; y <= r; y += 1) sum += blurTmp[clamp(y, 0, H - 1) * W + x];
      const norm = 1 / (2 * r + 1);
      for (let y = 0; y < H; y += 1) {
        buf[y * W + x] = sum * norm;
        sum +=
          blurTmp[clamp(y + r + 1, 0, H - 1) * W + x] - blurTmp[clamp(y - r, 0, H - 1) * W + x];
      }
    }
  }
}

/**
 * Composite the layer. Aerial perspective: distant silhouettes are lifted
 * toward the haze colour and lose contrast, near ones go almost black.
 */
function compositeLayer(layer, depth) {
  const base = srgbHex(layer.colour);
  const haze = srgbHex('#38486f');
  const rimColour = srgbHex('#b9c9ee');

  // Far layers sit in more air, so more haze mixes into their silhouette.
  const hazeMix = Math.pow(1 - depth, 1.7) * 0.42;
  const cr = lerp(base[0], haze[0], hazeMix);
  const cg = lerp(base[1], haze[1], hazeMix);
  const cb = lerp(base[2], haze[2], hazeMix);

  for (let y = 0; y < H; y += 1) {
    const row = y * W;
    for (let x = 0; x < W; x += 1) {
      const i = row + x;
      const a = mask[i];
      if (a > 0.001) overPixel(x, y, cr, cg, cb, clamp01(a));
      const rl = rim[i];
      if (rl > 0.001) {
        // Moonlight falls off with distance from the moon.
        const fall = lerp(0.35, 1.15, clamp01(1 - Math.hypot(x - MOON_X, y - MOON_Y) / (W * 0.85)));
        const k = rl * fall * 0.5;
        addPixel(x, y, rimColour[0] * k, rimColour[1] * k, rimColour[2] * k);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 7. Finish: vignette, grade, grain, tonemap                                 */
/* -------------------------------------------------------------------------- */

function finish() {
  const rand = mulberry32(SEED + 4242);
  const cx = W * 0.5;
  const cy = H * 0.46;
  const maxD = Math.hypot(cx, cy);

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 3;
      let r = img[i];
      let g = img[i + 1];
      let b = img[i + 2];

      // Gentle vignette.
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const vig = 1 - Math.pow(clamp01(d), 2.3) * 0.44;
      r *= vig;
      g *= vig;
      b *= vig;

      // Blue-hour grade: cool the shadows, hold the highlights neutral.
      const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const shadow = 1 - smoothstep(0.0, 0.16, lum);
      r = lerp(r, r * 0.86, shadow);
      g = lerp(g, g * 0.95, shadow);
      b = lerp(b, b * 1.16, shadow);

      // Filmic shoulder. Keeps star cores from clipping to flat white.
      r = tonemap(r);
      g = tonemap(g);
      b = tonemap(b);

      // Film grain, strongest in the mid-tones and suppressed in deep shadow
      // so it does not turn the sky into noise (and so the PNG still packs).
      const grain = (rand() - 0.5) * 0.0075 * smoothstep(0.01, 0.22, lum);
      img[i] = r + grain;
      img[i + 1] = g + grain;
      img[i + 2] = b + grain;
    }
  }
}

/** ACES-ish filmic curve, cheap form. */
function tonemap(v) {
  const x = Math.max(0, v);
  return clamp01((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
}

/* -------------------------------------------------------------------------- */
/* 8. Encode                                                                  */
/* -------------------------------------------------------------------------- */

/** Ordered 4x4 Bayer, so 8-bit quantisation of a smooth sky does not band. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Linear float RGB -> 8-bit sRGB bytes, dithered. */
function encodeToBytes(source, w, h) {
  const out = Buffer.allocUnsafe(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      const dither = (BAYER[y & 3][x & 3] / 16 - 0.5) * (1 / 255);
      for (let c = 0; c < 3; c += 1) {
        const v = toSrgb(clamp01(source[i + c])) + dither;
        out[i + c] = clamp(Math.round(v * 255), 0, 255);
      }
    }
  }
  return out;
}

/* PNG ---------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode 8-bit RGB (colour type 2) with per-scanline adaptive filtering.
 * The filter is chosen by the standard minimum-sum-of-absolute-differences
 * heuristic, which on an image like this cuts the file roughly in half versus
 * filter type 0 everywhere.
 */
function encodePng(bytes, w, h) {
  const stride = w * 3;
  const raw = Buffer.allocUnsafe((stride + 1) * h);
  const prev = Buffer.alloc(stride);
  const candidates = [
    Buffer.allocUnsafe(stride),
    Buffer.allocUnsafe(stride),
    Buffer.allocUnsafe(stride),
    Buffer.allocUnsafe(stride),
    Buffer.allocUnsafe(stride),
  ];

  for (let y = 0; y < h; y += 1) {
    const line = bytes.subarray(y * stride, (y + 1) * stride);
    let best = 0;
    let bestScore = Infinity;

    for (let f = 0; f < 5; f += 1) {
      const dst = candidates[f];
      let score = 0;
      for (let i = 0; i < stride; i += 1) {
        const a = i >= 3 ? line[i - 3] : 0;
        const b = prev[i];
        const c = i >= 3 ? prev[i - 3] : 0;
        let v;
        if (f === 0) v = line[i];
        else if (f === 1) v = line[i] - a;
        else if (f === 2) v = line[i] - b;
        else if (f === 3) v = line[i] - ((a + b) >> 1);
        else v = line[i] - paeth(a, b, c);
        v &= 0xff;
        dst[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }

    raw[y * (stride + 1)] = best;
    candidates[best].copy(raw, y * (stride + 1) + 1);
    line.copy(prev, 0);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9, memLevel: 9, windowBits: 15 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Box-average downsample in linear light, which is the only correct way. */
function downsample(source, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh * 3);
  const fx = sw / dw;
  const fy = sh / dh;
  for (let y = 0; y < dh; y += 1) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.min(sh, Math.ceil((y + 1) * fy));
    for (let x = 0; x < dw; x += 1) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.min(sw, Math.ceil((x + 1) * fx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * sw + sx) * 3;
          r += source[i];
          g += source[i + 1];
          b += source[i + 2];
          n += 1;
        }
      }
      const o = (y * dw + x) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

function step(label, fn) {
  const t = Date.now();
  fn();
  process.stdout.write(`  ${label.padEnd(16)} ${String(Date.now() - t).padStart(6)} ms\n`);
}

console.log(`night field ${W}x${H}, seed ${SEED}`);
step('sky', renderSky);
step('milky way', renderMilkyWay);
step('stars', renderStars);
step('moon', renderMoon);
step('haze', renderHaze);
step('field', renderField);
step('finish', finish);

let full;
let thumb;
step('encode', () => {
  full = encodePng(encodeToBytes(img, W, H), W, H);
  // The badge crop wants the interesting part of the frame, not the whole
  // width: take the region around the moon and the near grass.
  const small = downsample(img, W, H, THUMB_W, THUMB_H);
  thumb = encodePng(encodeToBytes(small, THUMB_W, THUMB_H), THUMB_W, THUMB_H);
});

writeFileSync(join(HERE, 'night-field.png'), full);
writeFileSync(join(HERE, 'night-field-thumb.png'), thumb);

console.log(`  night-field.png       ${(full.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`  night-field-thumb.png ${(thumb.length / 1024).toFixed(1)} kB`);
