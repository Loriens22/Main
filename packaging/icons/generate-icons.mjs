#!/usr/bin/env node
/**
 * Ornight icon foundry — dependency-free.
 *
 * Draws the Ornight mark (squircle, deep-sapphire → royal-blue gradient, a
 * centred geometric eight-pointed asterisk with tapered spokes, glass depth)
 * into a float raster, then encodes PNGs with a hand-written encoder on top of
 * `node:zlib`. No native image dependencies, no canvas, no sharp.
 *
 *   node packaging/icons/generate-icons.mjs
 *
 * Outputs into this directory:
 *   ornight-{48,72,96,128,144,152,167,180,192,256,384,512}.png   the app icon
 *   ornight-maskable-512.png                                     Android maskable
 *   apple-touch-icon.png                                         180, full bleed
 *   favicon.ico                                                  16/32/48 PNG-in-ICO
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));

/* -------------------------------------------------------------------------- */
/* PNG encoder                                                                */
/* -------------------------------------------------------------------------- */

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
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** @param {Uint8Array} rgba RGBA8 pixels, row-major. */
function encodePNG(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

const TAU = Math.PI * 2;

/** Superellipse (squircle) coverage test, in normalised −1..1 space. */
function insideSquircle(nx, ny, exponent) {
  return Math.abs(nx) ** exponent + Math.abs(ny) ** exponent <= 1;
}

/**
 * Eight-pointed asterisk. Four cardinal spokes run full length and slightly
 * wide; four diagonals are shorter and finer, which is what stops the mark
 * reading as a plus sign at 48 px.
 */
const SPOKES = Array.from({ length: 8 }, (_, k) => {
  const cardinal = k % 2 === 0;
  return {
    angle: (k * TAU) / 8,
    length: cardinal ? 1 : 0.78,
    halfWidth: cardinal ? 0.135 : 0.1,
  };
});

function insideAsterisk(x, y, radius) {
  if (x * x + y * y <= (radius * 0.085) ** 2) return true;
  for (const spoke of SPOKES) {
    const cos = Math.cos(spoke.angle);
    const sin = Math.sin(spoke.angle);
    const along = x * cos + y * sin;
    if (along < 0) continue;
    const length = radius * spoke.length;
    const t = along / length;
    if (t > 1) continue;
    const across = -x * sin + y * cos;
    // Convex taper: full width at the hub, a true point at the tip.
    const allowed = radius * spoke.halfWidth * (1 - t ** 1.4);
    if (Math.abs(across) <= allowed) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Palette — the Ornight night palette                                        */
/* -------------------------------------------------------------------------- */

const GRADIENT = [
  { at: 0, rgb: [0.024, 0.055, 0.196] }, // #061032 abyssal sapphire
  { at: 0.42, rgb: [0.063, 0.184, 0.58] }, // #102f94
  { at: 0.76, rgb: [0.145, 0.361, 0.902] }, // #255ce6
  { at: 1, rgb: [0.29, 0.51, 1] }, // #4a82ff royal blue
];

function gradientAt(t) {
  const u = Math.min(1, Math.max(0, t));
  for (let i = 1; i < GRADIENT.length; i += 1) {
    const a = GRADIENT[i - 1];
    const b = GRADIENT[i];
    if (u <= b.at) {
      const k = (u - a.at) / (b.at - a.at);
      return [
        a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k,
        a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k,
        a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k,
      ];
    }
  }
  return GRADIENT[GRADIENT.length - 1].rgb;
}

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/* -------------------------------------------------------------------------- */
/* Master render                                                              */
/* -------------------------------------------------------------------------- */

const MASTER = 1024;
const SS = 3; // supersample factor per axis

/**
 * @param {'rounded' | 'bleed' | 'maskable'} variant
 * @returns {Float32Array} premultiplied-free RGBA float master, MASTER².
 */
function renderMaster(variant) {
  const n = MASTER;
  const grid = n * SS;
  const samples = 1 / (SS * SS);
  const markRadius = variant === 'maskable' ? 0.235 : variant === 'bleed' ? 0.3 : 0.315;
  const squircleExponent = 4.6;

  // Pass 1 — shape coverage (background alpha) and mark coverage.
  const bg = new Float32Array(n * n);
  const mark = new Float32Array(n * n);
  for (let gy = 0; gy < grid; gy += 1) {
    const py = Math.floor(gy / SS);
    const v = (gy + 0.5) / grid; // 0..1
    const ny = v * 2 - 1;
    for (let gx = 0; gx < grid; gx += 1) {
      const px = Math.floor(gx / SS);
      const u = (gx + 0.5) / grid;
      const nx = u * 2 - 1;
      const index = py * n + px;
      if (variant === 'rounded') {
        if (insideSquircle(nx, ny, squircleExponent)) bg[index] += samples;
      } else {
        bg[index] += samples;
      }
      if (insideAsterisk(u - 0.5, v - 0.5, markRadius)) mark[index] += samples;
    }
  }

  // Pass 2 — soft bloom under the mark, three box blurs ≈ a gaussian.
  const glow = blur(blur(blur(mark, n, 9), n, 9), n, 13);

  // Pass 3 — composite.
  const out = new Float32Array(n * n * 4);
  for (let y = 0; y < n; y += 1) {
    const v = (y + 0.5) / n;
    for (let x = 0; x < n; x += 1) {
      const u = (x + 0.5) / n;
      const i = y * n + x;
      const alpha = bg[i];
      if (alpha <= 0) continue;

      // Diagonal gradient, top-left dark → bottom-right bright.
      let [r, g, b] = gradientAt((u * 0.55 + v * 0.45) ** 0.92);

      // Glass depth: a broad specular bloom off the upper-left shoulder…
      const dxs = u - 0.3;
      const dys = v - 0.2;
      const spec = Math.exp(-(dxs * dxs + dys * dys) / 0.18) * 0.2;
      // …a bright rim just inside the top edge…
      const rim = smoothstep(0.14, 0.0, v) * smoothstep(0.02, 0.2, u) * smoothstep(0.98, 0.8, u) * 0.3;
      // …and a settling shadow at the bottom so it reads as a solid object.
      const floorShadow = smoothstep(0.72, 1, v) * 0.22;

      r = r + (1 - r) * (spec + rim) - r * floorShadow;
      g = g + (1 - g) * (spec + rim) - g * floorShadow;
      b = b + (1 - b) * (spec + rim) - b * floorShadow;

      // Mark: white bloom then the crisp asterisk on top.
      const bloom = Math.min(1, glow[i] * 1.5) * 0.36;
      r += (1 - r) * bloom;
      g += (1 - g) * bloom;
      b += (1 - b) * bloom;

      const m = mark[i];
      r = r * (1 - m) + 1 * m;
      g = g * (1 - m) + 1 * m;
      b = b * (1 - m) + 1 * m;

      out[i * 4 + 0] = Math.min(1, Math.max(0, r));
      out[i * 4 + 1] = Math.min(1, Math.max(0, g));
      out[i * 4 + 2] = Math.min(1, Math.max(0, b));
      out[i * 4 + 3] = alpha;
    }
  }
  return out;
}

/** Separable box blur over a single-channel float image. */
function blur(src, n, radius) {
  const tmp = new Float32Array(n * n);
  const dst = new Float32Array(n * n);
  const span = radius * 2 + 1;
  for (let y = 0; y < n; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) sum += src[y * n + Math.min(n - 1, Math.max(0, x))];
    for (let x = 0; x < n; x += 1) {
      tmp[y * n + x] = sum / span;
      sum -= src[y * n + Math.min(n - 1, Math.max(0, x - radius))];
      sum += src[y * n + Math.min(n - 1, Math.max(0, x + radius + 1))];
    }
  }
  for (let x = 0; x < n; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += tmp[Math.min(n - 1, Math.max(0, y)) * n + x];
    for (let y = 0; y < n; y += 1) {
      dst[y * n + x] = sum / span;
      sum -= tmp[Math.min(n - 1, Math.max(0, y - radius)) * n + x];
      sum += tmp[Math.min(n - 1, Math.max(0, y + radius + 1)) * n + x];
    }
  }
  return dst;
}

/* -------------------------------------------------------------------------- */
/* Resample                                                                   */
/* -------------------------------------------------------------------------- */

/** Exact box (area-average) downsample of an RGBA float image. */
function resample(src, srcSize, dstSize) {
  const out = new Uint8Array(dstSize * dstSize * 4);
  const scale = srcSize / dstSize;
  for (let y = 0; y < dstSize; y += 1) {
    const y0 = y * scale;
    const y1 = y0 + scale;
    for (let x = 0; x < dstSize; x += 1) {
      const x0 = x * scale;
      const x1 = x0 + scale;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy += 1) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx += 1) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          const w = wy * wx;
          const i = (sy * srcSize + sx) * 4;
          const sa = src[i + 3];
          // Average colour weighted by alpha so transparent edges don't bleed black.
          r += src[i] * sa * w;
          g += src[i + 1] * sa * w;
          b += src[i + 2] * sa * w;
          a += sa * w;
          weight += w;
        }
      }
      const i = (y * dstSize + x) * 4;
      const alpha = a / weight;
      const norm = a > 0 ? 1 / a : 0;
      out[i + 0] = Math.round(Math.min(1, r * norm) * 255);
      out[i + 1] = Math.round(Math.min(1, g * norm) * 255);
      out[i + 2] = Math.round(Math.min(1, b * norm) * 255);
      out[i + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* ICO container                                                              */
/* -------------------------------------------------------------------------- */

function encodeICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach((entry, index) => {
    const at = index * 16;
    directory[at] = entry.size >= 256 ? 0 : entry.size;
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[at + 2] = 0; // palette
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32BE(0, at + 8);
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });
  return Buffer.concat([header, directory, ...entries.map((e) => e.png)]);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

const SIZES = [48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512];

function write(name, buffer) {
  writeFileSync(join(OUT_DIR, name), buffer);
  console.log(`  ${name.padEnd(28)} ${(buffer.length / 1024).toFixed(1)} KB`);
}

console.log('Ornight icon foundry');
console.log('rendering masters…');
const rounded = renderMaster('rounded');
const bleed = renderMaster('bleed');
const maskable = renderMaster('maskable');

console.log('writing app icons…');
for (const size of SIZES) {
  write(`ornight-${size}.png`, encodePNG(resample(rounded, MASTER, size), size, size));
}

console.log('writing platform variants…');
write('ornight-maskable-512.png', encodePNG(resample(maskable, MASTER, 512), 512, 512));
write('apple-touch-icon.png', encodePNG(resample(bleed, MASTER, 180), 180, 180));

const ico = encodeICO(
  [16, 32, 48].map((size) => ({
    size,
    png: encodePNG(resample(rounded, MASTER, size), size, size),
  })),
);
write('favicon.ico', ico);

console.log('done.');
