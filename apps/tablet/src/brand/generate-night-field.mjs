/**
 * Generates the Ornight night-field hero asset.
 *
 *   node apps/tablet/src/brand/generate-night-field.mjs
 *
 * Writes `night-field.png` (the splash background) and `night-field-thumb.png`
 * (the crop that lives inside the corner badge). Dependency-free: the only
 * import is node:zlib, used to deflate the PNG data stream.
 *
 * Everything is rendered into a linear float buffer and tone-mapped once at the
 * end. That ordering is what keeps it from looking like clip art: stars
 * accumulate additively and overlap correctly, the moon's halo lifts the sky
 * around it rather than pasting a disc on top, and the final curve pulls the
 * whole frame down into a believable night exposure.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const W = 2048;
const H = 1280;

/** Where the field meets the sky, as a fraction of frame height. */
const HORIZON = 0.605;

/** The moon is the only light source; everything else is consistent with it. */
const MOON = { x: 0.735 * W, y: 0.265 * H, r: 11 };

/* -------------------------------------------------------------------------- */
/* Deterministic noise                                                        */
/* -------------------------------------------------------------------------- */

/** Mulberry32 — small, fast, and seeded, so the asset is reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(0x04e19417);

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x, y, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/* -------------------------------------------------------------------------- */
/* Buffer                                                                     */
/* -------------------------------------------------------------------------- */

const buf = new Float32Array(W * H * 3);

const idx = (x, y) => (y * W + x) * 3;

function addPixel(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = idx(x | 0, y | 0);
  buf[i] += r;
  buf[i + 1] += g;
  buf[i + 2] += b;
}

/** Alpha-composite a colour over the buffer — used for opaque silhouettes. */
function overPixel(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = idx(x | 0, y | 0);
  const k = a > 1 ? 1 : a;
  buf[i] += (r - buf[i]) * k;
  buf[i + 1] += (g - buf[i + 1]) * k;
  buf[i + 2] += (b - buf[i + 2]) * k;
}

/* -------------------------------------------------------------------------- */
/* 1. Sky                                                                     */
/* -------------------------------------------------------------------------- */

function renderSky() {
  const horizonY = HORIZON * H;

  for (let y = 0; y < H; y++) {
    // Zenith is nearly black; the sky only opens up as it approaches the field.
    const t = Math.min(1, Math.max(0, y / horizonY));
    const lift = Math.pow(t, 2.4);

    let r = 0.006 + 0.052 * lift;
    let g = 0.010 + 0.070 * lift;
    let b = 0.030 + 0.121 * lift;

    for (let x = 0; x < W; x++) {
      // Moonglow: a broad, soft lift centred on the moon. This is what makes
      // the moon feel like it is *in* the sky rather than stuck on it.
      const dx = x - MOON.x;
      const dy = y - MOON.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const glow = 0.30 / (1 + Math.pow(d / 150, 1.9)) + 0.10 / (1 + Math.pow(d / 520, 2.1));

      const i = idx(x, y);
      buf[i] = r + glow * 0.62;
      buf[i + 1] = g + glow * 0.70;
      buf[i + 2] = b + glow * 0.86;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Milky Way                                                               */
/* -------------------------------------------------------------------------- */

/** Distance from a point to the galactic band's axis, in band-widths. */
function bandDistance(x, y) {
  // A shallow diagonal across the upper third.
  const angle = -0.20;
  const cx = 0.42 * W;
  const cy = 0.20 * H;
  const dx = x - cx;
  const dy = y - cy;
  const perp = -Math.sin(angle) * dx + Math.cos(angle) * dy;
  return perp / (0.19 * H);
}

function renderMilkyWay() {
  for (let y = 0; y < H * 0.62; y++) {
    for (let x = 0; x < W; x++) {
      const u = bandDistance(x, y);
      const falloff = Math.exp(-u * u * 1.5);
      if (falloff < 0.004) continue;

      // Two noise scales: broad structure, then a finer mottling.
      const n = fbm(x / 260, y / 260, 5) * 0.72 + fbm(x / 70, y / 70, 3) * 0.28;

      // A dust lane cutting through the middle of the band, slightly offset.
      const lane = Math.exp(-Math.pow((u + 0.16) * 3.4, 2));
      const dust = 1 - lane * (0.42 + 0.34 * fbm(x / 180, y / 180, 3));

      const v = falloff * Math.pow(n, 1.9) * dust * 0.115;
      addPixel(x, y, v * 0.94, v * 0.95, v);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Stars                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Stars are drawn as a continuous Gaussian rather than a filled circle. A disc
 * of uniform alpha at this size reads as a square blob; a falloff reads as a
 * point of light.
 */
function drawStar(cx, cy, brightness, temp, sigma) {
  const reach = Math.ceil(sigma * 3.2);
  const inv = 1 / (2 * sigma * sigma);

  // Colour temperature: cool blue-white through pale gold.
  const r = brightness * (0.74 + 0.30 * temp);
  const g = brightness * (0.82 + 0.15 * temp);
  const b = brightness * (1.0 - 0.16 * temp);

  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const px = Math.round(cx) + dx;
      const py = Math.round(cy) + dy;
      // Sub-pixel offset keeps a field of stars from snapping to a grid.
      const ox = px - cx;
      const oy = py - cy;
      const f = Math.exp(-(ox * ox + oy * oy) * inv);
      if (f < 0.004) continue;
      addPixel(px, py, r * f, g * f, b * f);
    }
  }
}

/** Only the handful of brightest stars earn spikes. */
function drawSpikes(cx, cy, brightness, length) {
  for (let d = 1; d <= length; d++) {
    const f = brightness * 0.30 * Math.pow(1 - d / length, 2.6);
    if (f <= 0) continue;
    addPixel(Math.round(cx) + d, Math.round(cy), f, f * 0.98, f);
    addPixel(Math.round(cx) - d, Math.round(cy), f, f * 0.98, f);
    addPixel(Math.round(cx), Math.round(cy) + d, f, f * 0.98, f);
    addPixel(Math.round(cx), Math.round(cy) - d, f, f * 0.98, f);
  }
}

function renderStars() {
  const COUNT = 5200;
  const skyBottom = HORIZON * H;
  const bright = [];

  for (let i = 0; i < COUNT; i++) {
    const x = rand() * W;
    // Push density towards the top: the horizon haze would swallow them anyway.
    const y = Math.pow(rand(), 1.28) * skyBottom;

    // Clustering along the galactic band, on top of the uniform field.
    const u = Math.abs(bandDistance(x, y));
    if (u > 1.15 && rand() < 0.34) continue;

    // Power law: a great many faint stars, a few bright ones.
    const m = Math.pow(rand(), 3.5);
    let brightness = 0.05 + m * 1.5;

    // Atmospheric extinction — stars dim as they approach the horizon.
    const alt = 1 - y / skyBottom;
    brightness *= 0.28 + 0.72 * Math.pow(alt, 0.6);

    // The moon washes out its own neighbourhood.
    const dx = x - MOON.x;
    const dy = y - MOON.y;
    const dm = Math.sqrt(dx * dx + dy * dy);
    brightness *= Math.min(1, Math.pow(dm / 260, 1.5));

    if (brightness < 0.02) continue;

    const temp = rand();
    const sigma = 0.52 + m * 0.85;
    drawStar(x, y, brightness, temp, sigma);

    if (brightness > 1.05) bright.push({ x, y, brightness });
  }

  bright
    .sort((a, b) => b.brightness - a.brightness)
    .slice(0, 14)
    .forEach((s) => drawSpikes(s.x, s.y, s.brightness, 16 + Math.round(s.brightness * 9)));
}

/* -------------------------------------------------------------------------- */
/* 4. Moon                                                                    */
/* -------------------------------------------------------------------------- */

function renderMoon() {
  const reach = MOON.r * 6;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      const x = Math.round(MOON.x + dx);
      const y = Math.round(MOON.y + dy);

      // Soft-edged disc: a hard circle at this scale looks like a sticker.
      const disc = 1 - smoothstep(MOON.r - 1.6, MOON.r + 1.4, d);
      // A tight bloom hugging the limb, separate from the broad sky glow.
      const bloom = 0.55 * Math.exp(-Math.pow(d / (MOON.r * 1.9), 1.7));

      const v = disc * 1.35 + bloom;
      if (v < 0.002) continue;
      addPixel(x, y, v * 0.98, v * 0.99, v);
    }
  }
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* -------------------------------------------------------------------------- */
/* 5. Horizon haze                                                            */
/* -------------------------------------------------------------------------- */

function renderHaze() {
  const horizonY = HORIZON * H;
  for (let y = Math.floor(horizonY - 240); y < Math.min(H, horizonY + 90); y++) {
    const t = 1 - Math.abs(y - horizonY) / 240;
    if (t <= 0) continue;
    const band = Math.pow(Math.max(0, t), 2.3);
    for (let x = 0; x < W; x++) {
      // The haze is lit from the moon's side, so it is not a flat band.
      const lateral = 0.42 + 0.58 * Math.exp(-Math.pow((x - MOON.x) / (W * 0.55), 2));
      const mist = band * lateral * (0.030 + 0.022 * fbm(x / 340, y / 90, 3));
      addPixel(x, y, mist * 0.70, mist * 0.82, mist * 1.0);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 6. The field                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Five depth layers. Aerial perspective does the heavy lifting: distant grass
 * is lighter, bluer, softer and shorter; near grass is darker, sharper and
 * taller. Without that gradient the field reads as one flat black mass.
 */
const LAYERS = [
  { depth: 0.00, blades: 5200, height: 0.045, width: 0.7, value: 0.105, alpha: 0.42, lean: 0.30 },
  { depth: 0.20, blades: 4200, height: 0.080, width: 1.0, value: 0.062, alpha: 0.62, lean: 0.38 },
  { depth: 0.44, blades: 3200, height: 0.135, width: 1.5, value: 0.032, alpha: 0.80, lean: 0.46 },
  { depth: 0.72, blades: 2400, height: 0.215, width: 2.2, value: 0.014, alpha: 0.93, lean: 0.54 },
  { depth: 1.05, blades: 1500, height: 0.330, width: 3.2, value: 0.005, alpha: 1.0, lean: 0.62 },
];

/**
 * Blades are rasterised row by row rather than by walking the curve in fixed
 * steps. Stepping along the parameter leaves gaps wherever the step lands twice
 * on one scanline, which is what turns a field into a barcode; iterating over
 * integer y and solving for x guarantees an unbroken stroke.
 */
function renderBlade(x0, base, height, lean, width, value, alpha, curve) {
  const towardsMoon = x0 > MOON.x ? -1 : 1;
  const rim = 0.13 * alpha * Math.exp(-Math.pow((x0 - MOON.x) / (W * 0.62), 2));

  const top = Math.max(-2, Math.floor(base - height));
  const bottom = Math.min(H - 1, Math.ceil(base));

  for (let y = bottom; y >= top; y--) {
    const t = (base - y) / height;
    if (t < 0 || t > 1) continue;

    // Blend of a quadratic and a cubic so the tip whips over rather than
    // tracing a perfect parabola — reads as wind rather than geometry.
    const bend = curve * t * t + (1 - curve) * t * t * t;
    const x = x0 + lean * bend;
    const w = width * (1 - t * 0.9);

    const shade = value * (0.82 + 0.36 * t);
    const a = alpha * (1 - 0.3 * t * t);

    const reach = Math.ceil(w + 1.3);
    for (let dx = -reach; dx <= reach; dx++) {
      const cover = Math.max(0, 1 - Math.abs(dx) / (w + 0.85));
      if (cover <= 0) continue;
      overPixel(x + dx, y, shade, shade * 1.04, shade * 1.26, a * cover * cover);
    }

    if (t > 0.4 && rim > 0.004) {
      const f = rim * (t - 0.4) * 1.7;
      addPixel(x + towardsMoon * (w + 0.6), y, f * 0.6, f * 0.7, f * 0.92);
    }
  }
}

function renderField() {
  const horizonY = HORIZON * H;

  for (const layer of LAYERS) {
    // Roots run from the horizon down past the bottom edge, so the nearest
    // layer fills the frame instead of stopping short and showing sky beneath.
    const baseY = horizonY + layer.depth * (H - horizonY) * 1.02;

    // Grass grows in tufts. Scattering blades uniformly gives an even comb;
    // clustering most of them around a handful of centres gives the clumping
    // and the gaps between clumps that make a field look real.
    const tufts = Math.max(8, Math.round(layer.blades / 26));
    const centres = Array.from({ length: tufts }, () => ({
      x: rand() * (W + 200) - 100,
      spread: 18 + rand() * 70,
      lift: 0.7 + rand() * 0.8,
    }));

    for (let i = 0; i < layer.blades; i++) {
      let x0;
      let lift = 1;
      if (rand() < 0.72) {
        const c = centres[(rand() * tufts) | 0];
        // Box-Muller would be tidier, but two uniforms averaged is enough of a
        // bell for this and costs half as much.
        x0 = c.x + (rand() + rand() - 1) * c.spread;
        lift = c.lift;
      } else {
        x0 = rand() * (W + 200) - 100;
      }

      const base = baseY + (rand() - 0.5) * 34 * (0.35 + layer.depth);
      // Capped: an uncapped tail on the height distribution throws the odd
      // blade halfway up the sky, which reads as a scratch on the frame.
      const height = Math.min(
        H * layer.height * 1.9,
        H * layer.height * lift * (0.45 + rand() * 1.15),
      );
      const lean = (rand() - 0.5) * 2 * layer.lean * height;
      const width = layer.width * (0.55 + rand() * 0.9);
      const curve = 0.35 + rand() * 0.6;

      renderBlade(x0, base, height, lean, width, layer.value, layer.alpha, curve);
    }
  }

  // Ground shadow. However dense the near layer is, single blades never fully
  // cover the bottom of the frame, and the sky showing through between them
  // reads as a hole rather than as ground. Sink the last stretch into black.
  const shadowTop = H * 0.86;
  for (let y = Math.floor(shadowTop); y < H; y++) {
    const t = Math.pow((y - shadowTop) / (H - shadowTop), 1.4);
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const k = t * 0.92;
      buf[i] *= 1 - k;
      buf[i + 1] *= 1 - k;
      buf[i + 2] *= 1 - k;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 7. Grade                                                                   */
/* -------------------------------------------------------------------------- */

function grade() {
  const cx = W / 2;
  const cy = H / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  const grain = rng(0x51a7);

  const out = Buffer.alloc(W * H * 3);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      let r = buf[i];
      let g = buf[i + 1];
      let b = buf[i + 2];

      // Vignette.
      const dx = (x - cx) / maxD;
      const dy = (y - cy) / maxD;
      const vig = 1 - 0.46 * Math.pow(Math.sqrt(dx * dx + dy * dy) * 1.32, 2.1);
      r *= vig;
      g *= vig;
      b *= vig;

      // Blue-hour grade: lift the blues slightly, hold the reds back.
      r *= 0.94;
      b *= 1.06;

      // Filmic shoulder — keeps the moon and bright stars from clipping flat.
      r = r / (1 + r);
      g = g / (1 + g);
      b = b / (1 + b);

      // Gentle contrast in the low end, where this whole image lives.
      r = Math.pow(r, 0.92);
      g = Math.pow(g, 0.92);
      b = Math.pow(b, 0.92);

      // Grain, scaled with luminance so the shadows stay clean and the PNG
      // still compresses.
      const n = (grain() - 0.5) * 0.010;
      const o = (y * W + x) * 3;
      out[o] = clamp255((r + n) * 255);
      out[o + 1] = clamp255((g + n) * 255);
      out[o + 2] = clamp255((b + n) * 255);
    }
  }

  return out;
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/* -------------------------------------------------------------------------- */
/* PNG encoding                                                               */
/* -------------------------------------------------------------------------- */

function crc32(buffer) {
  let c;
  const table = crc32.table ?? (crc32.table = buildCrcTable());
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = (crc ^ buffer[i]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Paeth predictor — the best general-purpose filter for smooth gradients. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function encodePng(rgb, width, height) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 4; // Paeth
    for (let x = 0; x < stride; x++) {
      const cur = rgb[y * stride + x];
      const left = x >= 3 ? rgb[y * stride + x - 3] : 0;
      const up = y > 0 ? rgb[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 3 ? rgb[(y - 1) * stride + x - 3] : 0;
      raw[rowStart + 1 + x] = (cur - paeth(left, up, upLeft)) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Box-downsample, for the badge crop. */
function resize(rgb, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 3);
  const fx = sw / dw;
  const fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.min(sh, Math.ceil((y + 1) * fy));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.min(sw, Math.ceil((x + 1) * fx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sw + sx) * 3;
          r += rgb[i];
          g += rgb[i + 1];
          b += rgb[i + 2];
          n++;
        }
      }
      const o = (y * dw + x) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */

console.log(`rendering ${W}x${H}…`);
renderSky();
renderMilkyWay();
renderStars();
renderMoon();
renderHaze();
renderField();
const rgb = grade();

writeFileSync(join(HERE, 'night-field.png'), encodePng(rgb, W, H));

// The badge shows a small crop around the moon, where the frame is most
// legible at 200px wide.
const CW = Math.round(W * 0.42);
const CH = Math.round(H * 0.44);
const cx0 = Math.round(W * 0.52);
const cy0 = Math.round(H * 0.10);
const crop = Buffer.alloc(CW * CH * 3);
for (let y = 0; y < CH; y++) {
  rgb.copy(crop, y * CW * 3, ((cy0 + y) * W + cx0) * 3, ((cy0 + y) * W + cx0 + CW) * 3);
}
writeFileSync(join(HERE, 'night-field-thumb.png'), encodePng(resize(crop, CW, CH, 400, 250), 400, 250));

console.log('wrote night-field.png and night-field-thumb.png');
