// Procedural PBR textures generated at start-up (no external image files).
// All tiles are seamless (periodic noise), so they can be mapped in world space.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

/** Periodic value noise on an integer lattice of size `period`. */
function makeLattice(period, seed) {
  const r = mulberry32(seed);
  const a = new Float32Array(period * period);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}

function vnoise(lat, period, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = lat[y0 * period + x0], b = lat[y0 * period + x1], c = lat[y1 * period + x0], d = lat[y1 * period + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable fBm field (size x size) with base frequency `freq` cells across the tile. */
export function fbmField(size, freq, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const period = freq << o;
    const lat = makeLattice(period, seed + o * 1013);
    const s = period / size;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) out[y * size + x] += vnoise(lat, period, x * s, y * s) * amp;
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function dataTex(data, size, { srgb = false, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Normal map (tangent space, OpenGL convention) from a height field. */
function normalFromHeight(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const xl = h[y * size + ((x - 1 + size) % size)], xr = h[y * size + ((x + 1) % size)];
      const yu = h[((y - 1 + size) % size) * size + x], yd = h[((y + 1) % size) * size + x];
      let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  return out;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Build {map, normalMap, roughnessMap} from per-pixel callback returning [r,g,b,rough,height]. */
function buildSet(size, fn, normalStrength, opts = {}) {
  const albedo = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const px = [0, 0, 0, 0, 0];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      fn(x, y, px);
      const i = (y * size + x) * 4;
      albedo[i] = clamp255(px[0]);
      albedo[i + 1] = clamp255(px[1]);
      albedo[i + 2] = clamp255(px[2]);
      albedo[i + 3] = 255;
      // roughness in G channel (three.js convention), AO in R
      rough[i] = 255;
      rough[i + 1] = clamp255(px[3] * 255);
      rough[i + 2] = 0;
      rough[i + 3] = 255;
      height[y * size + x] = px[4];
    }
  return {
    map: dataTex(albedo, size, { srgb: true, ...opts }),
    roughnessMap: dataTex(rough, size, opts),
    normalMap: dataTex(normalFromHeight(height, size, normalStrength), size, opts),
  };
}

export function makeAsphalt(size = 512, seed = 11) {
  const n1 = fbmField(size, 8, 5, seed);
  const n2 = fbmField(size, 64, 3, seed + 7, 0.6);
  const n3 = fbmField(size, 4, 3, seed + 19);
  const r = mulberry32(seed);
  const grain = new Float32Array(size * size);
  for (let i = 0; i < grain.length; i++) grain[i] = r();
  // crack network: thresholded ridged noise
  const ridge = fbmField(size, 6, 4, seed + 31);
  return buildSet(size, (x, y, o) => {
    const i = y * size + x;
    const g = grain[i];
    const stone = g > 0.93 ? (g - 0.93) * 6 : 0;
    const crack = Math.abs(ridge[i] - 0.5) < 0.004 && n3[i] > 0.58 ? 1 : 0;
    const patch = n3[i] > 0.7 ? 0.12 : 0;
    let base = 50 + n1[i] * 22 + n2[i] * 16 + stone * 60 - crack * 16 - patch * 40;
    o[0] = base * 1.0; o[1] = base * 0.99; o[2] = base * 0.97;
    o[3] = 0.82 + n2[i] * 0.15 - stone * 0.3 + crack * 0.1 - patch * 0.15;
    o[4] = g * 0.6 + n2[i] * 0.8 - crack * 1.5;
  }, 2.2);
}

/** Sofia's yellow paving blocks (бул. Цар Освободител), 8 m tile. */
export function makeYellowBricks(size = 512, seed = 23, tintRGB = [196, 160, 62]) {
  const r = mulberry32(seed);
  const n1 = fbmField(size, 16, 4, seed);
  const rowsPerTile = 40; // 20 cm rows over 8 m
  const colsPerTile = 20; // 40 cm? real blocks ~ 20x10cm; scaled for readability
  const tint = new Float32Array(rowsPerTile * colsPerTile * 2);
  for (let i = 0; i < tint.length; i++) tint[i] = r();
  return buildSet(size, (x, y, o) => {
    const i = y * size + x;
    const fy = (y / size) * rowsPerTile;
    const row = Math.floor(fy);
    const fx = (x / size) * colsPerTile + (row % 2) * 0.5;
    const col = Math.floor(fx) % colsPerTile;
    const lx = fx - Math.floor(fx), ly = fy - row;
    const edge = Math.min(lx, 1 - lx) * 2.2, edgeY = Math.min(ly, 1 - ly);
    const gap = Math.min(edge * 0.6, edgeY);
    const t = tint[(row * colsPerTile + col) % tint.length];
    const mortar = gap < 0.06;
    const bevel = Math.min(1, gap / 0.16);
    const k = 0.85 + t * 0.25 + n1[i] * 0.15;
    if (mortar) {
      o[0] = 70; o[1] = 64; o[2] = 52; o[3] = 0.95; o[4] = 0;
    } else {
      o[0] = tintRGB[0] * k; o[1] = tintRGB[1] * k; o[2] = tintRGB[2] * k; o[3] = 0.55 + n1[i] * 0.25 - t * 0.1; o[4] = bevel;
    }
  }, 3.0);
}

/** Concrete sidewalk slabs (40 cm) with joints; 4 m tile. */
export function makePavers(size = 512, seed = 37) {
  const r = mulberry32(seed);
  const n1 = fbmField(size, 8, 5, seed);
  const n2 = fbmField(size, 48, 2, seed + 3);
  const cells = 10;
  const tint = new Float32Array(cells * cells);
  for (let i = 0; i < tint.length; i++) tint[i] = r();
  return buildSet(size, (x, y, o) => {
    const i = y * size + x;
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    const lx = fx - cx, ly = fy - cy;
    const e = Math.min(lx, 1 - lx, ly, 1 - ly);
    const t = tint[cy * cells + cx];
    const joint = e < 0.025;
    const k = 0.9 + t * 0.12 + n1[i] * 0.18 - n2[i] * 0.08;
    const v = joint ? 92 : 150 * k;
    o[0] = v * 1.0; o[1] = v * 0.99; o[2] = v * 0.96;
    o[3] = joint ? 0.95 : 0.78 + n2[i] * 0.15;
    o[4] = joint ? 0 : Math.min(1, e / 0.06) * 0.5 + n2[i] * 0.2;
  }, 2.0);
}

export function makeCurb(size = 256, seed = 41) {
  const n1 = fbmField(size, 8, 4, seed);
  return buildSet(size, (x, y, o) => {
    const i = y * size + x;
    const block = (x % (size / 4)) < 2;
    const v = block ? 110 : 168 + n1[i] * 30;
    o[0] = v; o[1] = v; o[2] = v * 0.97; o[3] = 0.75; o[4] = block ? 0 : n1[i];
  }, 1.5);
}

/** Terrain detail layers: grass, dirt, forest litter, urban gravel. 8 m tiles. */
export function makeGrass(size = 512, seed = 53) {
  const n1 = fbmField(size, 8, 5, seed);
  const n2 = fbmField(size, 64, 3, seed + 1, 0.7);
  const r = mulberry32(seed);
  const blades = new Float32Array(size * size);
  for (let i = 0; i < blades.length; i++) blades[i] = r();
  return buildSet(size, (x, y, o) => {
    const i = y * size + x;
    const b = blades[i] * 0.35 + n2[i] * 0.65;
    const dry = n1[i];
    o[0] = 58 + dry * 52 + b * 20;
    o[1] = 92 + dry * 30 + b * 40;
    o[2] = 34 + dry * 16 + b * 10;
    o[3] = 0.92;
    o[4] = b;
  }, 2.5);
}

export function makeDirt(size = 512, seed = 59) {
  const n1 = fbmField(size, 8, 5, seed);
  const n2 = fbmField(size, 64, 3, seed + 2, 0.6);
  const r = mulberry32(seed);
  const peb = new Float32Array(size * size);
  for (let i = 0; i < peb.length; i++) peb[i] = r();
  return buildSet(size, (x, y, o) => {
    const i = y * size + x;
    const p = peb[i] > 0.97 ? 1 : 0;
    const v = 0.75 + n1[i] * 0.35 + n2[i] * 0.2;
    o[0] = (118 + p * 40) * v; o[1] = (100 + p * 36) * v; o[2] = (78 + p * 30) * v;
    o[3] = 0.9;
    o[4] = n2[i] + p * 0.8;
  }, 2.0);
}

export function makeLitter(size = 512, seed = 61) {
  const n1 = fbmField(size, 16, 5, seed);
  const n2 = fbmField(size, 96, 2, seed + 5);
  return buildSet(size, (x, y, o) => {
    const i = y * size + x;
    const leaf = n2[i] > 0.55;
    o[0] = leaf ? 96 + n1[i] * 50 : 62 + n1[i] * 30;
    o[1] = leaf ? 72 + n1[i] * 30 : 66 + n1[i] * 30;
    o[2] = leaf ? 38 : 40;
    o[3] = 0.95;
    o[4] = n2[i];
  }, 2.0);
}

/** Generic tileable RGBA noise used by shaders (R,G,B,A = independent fBm fields). */
export function makeNoiseTexture(size = 256, seed = 71) {
  const a = fbmField(size, 4, 5, seed), b = fbmField(size, 8, 4, seed + 1), c = fbmField(size, 16, 3, seed + 2), d = fbmField(size, 32, 2, seed + 3);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = a[i] * 255; data[i * 4 + 1] = b[i] * 255; data[i * 4 + 2] = c[i] * 255; data[i * 4 + 3] = d[i] * 255;
  }
  return dataTex(data, size, { aniso: 4 });
}

/** Leaf-cluster sprite with alpha, for tree crowns. */
export function makeLeafCard(size = 256, seed = 83, hue = [70, 110, 45]) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const r = mulberry32(seed);
  g.clearRect(0, 0, size, size);
  for (let i = 0; i < 520; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.pow(r(), 0.6) * size * 0.46;
    const x = size / 2 + Math.cos(a) * rad, y = size / 2 + Math.sin(a) * rad;
    const l = size * (0.035 + r() * 0.035);
    const shade = 0.65 + r() * 0.5;
    g.fillStyle = `rgb(${hue[0] * shade | 0},${hue[1] * shade | 0},${hue[2] * shade | 0})`;
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI * 2);
    g.beginPath();
    g.ellipse(0, 0, l, l * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // a few twigs
  g.strokeStyle = 'rgba(70,52,36,0.8)';
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.moveTo(size / 2, size / 2);
    const a = r() * Math.PI * 2;
    g.lineTo(size / 2 + Math.cos(a) * size * 0.35, size / 2 + Math.sin(a) * size * 0.35);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeBark(size = 256, seed = 97) {
  const n1 = fbmField(size, 4, 4, seed);
  const n2 = fbmField(size, 32, 3, seed + 1);
  return buildSet(size, (x, y, o) => {
    const i = y * size + x;
    const furrow = Math.abs(Math.sin((x / size) * Math.PI * 18 + n1[i] * 6));
    const v = 60 + furrow * 40 + n2[i] * 30;
    o[0] = v; o[1] = v * 0.85; o[2] = v * 0.7; o[3] = 0.95; o[4] = furrow;
  }, 3.0);
}

/** Simple label texture (stop signs, shop signs). */
export function makeLabelTexture(lines, { w = 512, h = 128, bg = '#123', fg = '#fff', font = 'bold 48px Roboto, Arial, sans-serif', align = 'center' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.textAlign = align;
  const ls = Array.isArray(lines) ? lines : [lines];
  ls.forEach((ln, i) => {
    const f = typeof ln === 'object' ? ln.font || font : font;
    const txt = typeof ln === 'object' ? ln.text : ln;
    g.font = f;
    if (typeof ln === 'object' && ln.color) g.fillStyle = ln.color; else g.fillStyle = fg;
    let size = parseInt(/(\d+)px/.exec(f)[1], 10);
    while (g.measureText(txt).width > w * 0.94 && size > 10) {
      size -= 2;
      g.font = f.replace(/\d+px/, `${size}px`);
    }
    g.fillText(txt, align === 'center' ? w / 2 : 12, ((i + 0.5) * h) / ls.length);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
