// Tiling surfaces for the landmark facades (LandmarkFacade.js), drawn on canvases at load: ashlar stone,
// rusticated stone, plaster, precast concrete and smooth trim stone, each with a normal map derived from
// its height field; and the glass atlas of 16 room interiors (blinds, curtains, offices, reading rooms)
// with a night map in which some of them are lit.
import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexRgb(h) {
  const c = new THREE.Color(h);
  return [c.r * 255, c.g * 255, c.b * 255];
}

/** Value noise field (size x size), wrapping, sum of octaves. */
function noiseField(size, seed, octaves = 4, base = 4) {
  const r = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const g = base << o;
    const grid = new Float32Array(g * g).map(() => r());
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * g, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * g, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = grid[(y0 % g) * g + (x0 % g)], b = grid[(y0 % g) * g + ((x0 + 1) % g)];
        const c = grid[((y0 + 1) % g) * g + (x0 % g)], d = grid[((y0 + 1) % g) * g + ((x0 + 1) % g)];
        out[y * size + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
      }
    }
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/** Tangent-space normal map canvas from a height field (wrapping). */
function normalFromHeight(hf, size, strength) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = hf[y * size + ((x + size - 1) % size)], r = hf[y * size + ((x + 1) % size)];
      const u = hf[((y + size - 1) % size) * size + x], d = hf[((y + 1) % size) * size + x];
      // canvas y runs down, texture v up: a height rising downwards in the canvas tilts the normal to -v
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function tex(canvas, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
}

/**
 * A tiling stone / plaster surface. kind: ashlar | rustic | plaster | concrete | trim | travertine.
 * Returns {map, normalMap, roughnessMap, tile: [w, h] metres}.
 */
export function surface(kind, color, seed = 1) {
  const key = `${kind}:${color}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const S = 512;
  const [cr, cg, cb] = hexRgb(color);
  const r = rng(seed * 7 + kind.length);
  const nz = noiseField(S, seed * 13 + 1, 5, 4);
  const fine = noiseField(S, seed * 17 + 2, 3, 32);
  const hf = new Float32Array(S * S);
  const tone = new Float32Array(S * S).fill(1);
  // tile size in metres and the joint pattern
  let tile = [2, 2];
  const joint = (x, y, w, h, jw) => {
    const dx = Math.min(x % w, w - (x % w)), dy = Math.min(y % h, h - (y % h));
    return Math.min(dx, dy) < jw;
  };
  if (kind === 'ashlar' || kind === 'travertine' || kind === 'rustic') {
    // courses of blocks with offset vertical joints; rustic: deep V channels on the bed joints
    tile = kind === 'rustic' ? [2.4, 2.4] : [2.4, 2.4];
    const rows = kind === 'rustic' ? 4 : 4, cols = 2;
    const rh = S / rows, cw = S / cols;
    const blockTone = [];
    for (let i = 0; i < rows * cols * 2; i++) blockTone.push(0.96 + r() * 0.07);
    for (let y = 0; y < S; y++) {
      const row = Math.floor(y / rh), off = row % 2 ? cw / 2 : 0;
      const yy = y - row * rh;
      for (let x = 0; x < S; x++) {
        const xx = (x + off) % S, col = Math.floor(xx / cw), xin = xx - col * cw;
        const i = y * S + x;
        let h = 1;
        const dy = Math.min(yy, rh - yy), dx = Math.min(xin, cw - xin);
        if (kind === 'rustic') {
          const v = Math.min(1, dy / 9);
          h = Math.min(v, Math.min(1, dx / 3));
        } else {
          h = dy < 2.2 || dx < 2.2 ? 0.2 : 1; // thin mortar joints
          h *= 0.97 + 0.03 * Math.min(1, Math.min(dx, dy) / 10); // slightly pillowed faces
        }
        hf[i] = h + (fine[i] - 0.5) * (kind === 'travertine' ? 0.12 : 0.05);
        tone[i] = blockTone[(row * cols + col) % blockTone.length] * (0.95 + nz[i] * 0.09) * (h < 0.5 ? 0.88 : 1);
        if (kind === 'travertine' && fine[i] > 0.78) tone[i] *= 0.88; // pores
      }
    }
  } else if (kind === 'concrete') {
    tile = [3, 3];
    for (let i = 0; i < S * S; i++) {
      const x = i % S, y = Math.floor(i / S);
      const j = joint(x, y, S, S / 2, 2) ? 0.3 : 1;
      hf[i] = j + (fine[i] - 0.5) * 0.08;
      tone[i] = (0.9 + nz[i] * 0.18) * (j < 0.5 ? 0.85 : 1) * (1 - 0.06 * Math.max(0, fine[i] - 0.7) * 3);
    }
  } else {
    // plaster / trim: smooth with a fine trowel texture
    tile = kind === 'trim' ? [1.5, 1.5] : [3, 3];
    const a = kind === 'trim' ? 0.05 : 0.1;
    for (let i = 0; i < S * S; i++) {
      hf[i] = 1 + (fine[i] - 0.5) * a + (nz[i] - 0.5) * a * 0.5;
      tone[i] = 0.93 + nz[i] * 0.1 + (fine[i] - 0.5) * 0.04;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const rc = document.createElement('canvas');
  rc.width = rc.height = S;
  const rg = rc.getContext('2d');
  const rimg = rg.createImageData(S, S);
  const baseRough = kind === 'trim' ? 0.62 : kind === 'concrete' ? 0.9 : 0.82;
  for (let i = 0; i < S * S; i++) {
    const t = tone[i];
    img.data[i * 4] = Math.min(255, cr * t);
    img.data[i * 4 + 1] = Math.min(255, cg * t);
    img.data[i * 4 + 2] = Math.min(255, cb * t);
    img.data[i * 4 + 3] = 255;
    const ro = Math.min(1, baseRough + (hf[i] < 0.5 ? 0.12 : 0) + (fine[i] - 0.5) * 0.1) * 255;
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = ro;
    rimg.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  rg.putImageData(rimg, 0, 0);
  const strength = kind === 'rustic' ? 5 : kind === 'ashlar' || kind === 'travertine' ? 3.5 : kind === 'concrete' ? 3 : 2;
  const out = { map: tex(c, true), normalMap: tex(normalFromHeight(hf, S, strength), false), roughnessMap: tex(rc, false), tile };
  cache.set(key, out);
  return out;
}

/**
 * The window glass atlas: 4 x 4 interiors seen through a window (UV cell = variant), and the matching night
 * map (lit rooms warm, the rest dark). kind: 'public' (offices, reading rooms, corridors) | 'home'.
 */
export function glassAtlas(kind = 'public', seed = 3) {
  const key = `glass:${kind}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const S = 1024, C = S / 4;
  const day = document.createElement('canvas');
  day.width = day.height = S;
  const night = document.createElement('canvas');
  night.width = night.height = S;
  const g = day.getContext('2d'), n = night.getContext('2d');
  n.fillStyle = '#000';
  n.fillRect(0, 0, S, S);
  const r = rng(seed);
  for (let k = 0; k < 16; k++) {
    // canvas y runs down; atlas cell k has its v = 0 at the bottom of the texture -> draw flipped rows
    const cx = (k % 4) * C, cy = S - (Math.floor(k / 4) + 1) * C;
    const wallC = ['#c9c1b2', '#d7d0c0', '#b8b6ae', '#cfc6b4', '#a9a49a', '#e0dccf'][Math.floor(r() * 6)];
    // the room in one-point perspective: back wall, ceiling, floor, side walls
    const bw = C * 0.5, bh = C * 0.46, bx = cx + C * (0.25 + (r() - 0.5) * 0.12), by = cy + C * 0.22;
    g.fillStyle = '#4d4a45';
    g.fillRect(cx, cy, C, C);
    const shade = (hex, f) => { const c = hexRgb(hex); return `rgb(${c[0] * f | 0},${c[1] * f | 0},${c[2] * f | 0})`; };
    g.fillStyle = shade(wallC, 0.72);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + C, cy); g.lineTo(bx + bw, by); g.lineTo(bx, by); g.closePath(); g.fill(); // ceiling
    g.fillStyle = shade('#8a7a66', 0.75);
    g.beginPath(); g.moveTo(cx, cy + C); g.lineTo(cx + C, cy + C); g.lineTo(bx + bw, by + bh); g.lineTo(bx, by + bh); g.closePath(); g.fill(); // floor
    g.fillStyle = shade(wallC, 0.8);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(bx, by); g.lineTo(bx, by + bh); g.lineTo(cx, cy + C); g.closePath(); g.fill(); // left wall
    g.fillStyle = shade(wallC, 0.68);
    g.beginPath(); g.moveTo(cx + C, cy); g.lineTo(bx + bw, by); g.lineTo(bx + bw, by + bh); g.lineTo(cx + C, cy + C); g.closePath(); g.fill(); // right wall
    g.fillStyle = shade(wallC, 0.9);
    g.fillRect(bx, by, bw, bh); // back wall
    const type = r();
    if (kind === 'public' && type < 0.3) {
      // shelves of books / files
      for (let s = 0; s < 4; s++) {
        g.fillStyle = shade('#6b4f36', 0.6);
        g.fillRect(bx + 4, by + 6 + s * bh * 0.22, bw - 8, 3);
        for (let q = 0; q < 14; q++) {
          g.fillStyle = ['#7b2b23', '#2f4a6b', '#6b6b39', '#4b3a2a', '#8c7a5c'][Math.floor(r() * 5)];
          g.fillRect(bx + 6 + q * (bw - 12) / 14, by + 6 + s * bh * 0.22 - bh * 0.15, (bw - 12) / 16, bh * 0.15);
        }
      }
    } else if (type < 0.55) {
      // ceiling lights and a desk
      g.fillStyle = 'rgba(255,250,235,0.85)';
      for (let q = 0; q < 3; q++) g.fillRect(cx + C * (0.2 + q * 0.25), cy + C * 0.07, C * 0.12, 3);
      g.fillStyle = shade('#6e5c48', 0.7);
      g.fillRect(bx - C * 0.05, by + bh * 0.62, bw * 0.7, bh * 0.1);
      g.fillStyle = '#1e2022';
      g.fillRect(bx + bw * 0.2, by + bh * 0.42, bw * 0.18, bh * 0.2); // monitor
    } else {
      g.fillStyle = shade('#5a5148', 0.7);
      g.fillRect(bx + bw * 0.1, by + bh * 0.55, bw * 0.5, bh * 0.45);
    }
    // blinds or curtains on most windows
    const cover = r();
    if (cover < 0.45) {
      const down = C * (0.2 + r() * 0.55);
      for (let y = 0; y < down; y += 6) {
        g.fillStyle = y % 12 ? '#d9d6cc' : '#bdb9ae';
        g.fillRect(cx, cy + y, C, 5);
      }
    } else if (cover < 0.75) {
      const cc = ['#e7e2d4', '#c9b79a', '#9a3d32', '#6f7d61', '#d8d2c2'][Math.floor(r() * 5)];
      g.fillStyle = cc;
      g.globalAlpha = 0.9;
      g.fillRect(cx, cy, C * 0.22, C);
      g.fillRect(cx + C * 0.78, cy, C * 0.22, C);
      g.globalAlpha = 0.35;
      g.fillStyle = '#f2efe6';
      g.fillRect(cx + C * 0.22, cy, C * 0.56, C); // net curtain
      g.globalAlpha = 1;
    }
    // night: about a third lit
    if (r() < 0.38) {
      const warm = r() < 0.7;
      const grad = n.createLinearGradient(cx, cy, cx, cy + C);
      grad.addColorStop(0, warm ? '#ffe2b0' : '#e6f0ff');
      grad.addColorStop(1, warm ? '#b88a52' : '#9aa6b8');
      n.fillStyle = grad;
      n.fillRect(cx, cy, C, C);
      if (cover < 0.45) { n.fillStyle = 'rgba(0,0,0,0.35)'; n.fillRect(cx, cy, C, C * 0.4); }
    }
    // a frame line between cells so mipmaps do not bleed one room into the next
    g.fillStyle = '#2b2b2b';
    g.fillRect(cx, cy, C, 2); g.fillRect(cx, cy, 2, C);
  }
  const out = { map: tex(day, true, false), emissiveMap: tex(night, true, false) };
  cache.set(key, out);
  return out;
}
