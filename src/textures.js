// Procedural canvas textures. Everything is generated at load time — no external images.
import * as THREE from 'three';
import { clamp, lerp, makeRng, tfbm, tnoise, smoothstep } from './util.js';

export let MAX_ANISO = 8;
export function setMaxAniso(a) { MAX_ANISO = a; }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function toTex(canvas, { srgb = true, repeat = true, aniso = MAX_ANISO, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.flipY = flipY;
  t.needsUpdate = true;
  return t;
}
const FONT = '"DejaVu Sans", Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_COND = '"DejaVu Sans Condensed", "Roboto Condensed", "Arial Narrow", Roboto, Arial, sans-serif';
const FONT_MONO = '"DejaVu Sans Mono", "Roboto Mono", Menlo, Consolas, monospace';
export { FONT, FONT_COND, FONT_MONO };

/** Height field (Float32Array w*h, 0..1) -> tangent-space normal map canvas (tileable). */
function heightToNormal(hf, w, h, strength = 2) {
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = hf[y * w + ((x - 1 + w) % w)], r = hf[y * w + ((x + 1) % w)];
      const u = hf[((y - 1 + h) % h) * w + x], dn = hf[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* =====================================================================
   GROUND / ROAD
   ===================================================================== */
export function asphalt(size = 1024) {
  const rnd = makeRng(11);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  const hf = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = tfbm(u, v, 6, 4, 3);
      const m = tfbm(u, v, 2, 3, 9);
      const g = tnoise(u * 180, v * 180, 180, 5);
      let base = 92 + (n - 0.5) * 26 + (m - 0.5) * 18 + (g - 0.5) * 20;
      const i = (y * size + x) * 4;
      d[i] = base * 0.985; d[i + 1] = base * 0.99; d[i + 2] = base * 1.01; d[i + 3] = 255;
      hf[y * size + x] = g * 0.5 + n * 0.3;
    }
  }
  // aggregate stones
  for (let k = 0; k < size * size * 0.05; k++) {
    const x = (rnd() * size) | 0, y = (rnd() * size) | 0;
    const light = rnd() < 0.5;
    const val = light ? 118 + rnd() * 38 : 52 + rnd() * 24;
    const r = rnd() < 0.08 ? 1 : 0;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const xx = (x + ox + size) % size, yy = (y + oy + size) % size;
      const i = (yy * size + xx) * 4;
      d[i] = d[i + 1] = val; d[i + 2] = val * 1.02;
      hf[yy * size + xx] = light ? 1 : 0.1;
    }
  }
  ctx.putImageData(img, 0, 0);
  // cracks and patches
  ctx.globalAlpha = 0.5;
  for (let k = 0; k < 7; k++) {
    ctx.strokeStyle = 'rgba(35,35,37,0.8)'; ctx.lineWidth = 1 + rnd() * 1.4;
    let x = rnd() * size, y = rnd() * size; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 14; s++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 0.18;
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = rnd() < 0.5 ? '#2e2f31' : '#8a8b8c';
    const w = 80 + rnd() * 200, h = 60 + rnd() * 160;
    ctx.fillRect(rnd() * (size - w), rnd() * (size - h), w, h);
  }
  ctx.globalAlpha = 1;
  return { map: toTex(c), normal: toTex(heightToNormal(hf, size, size, 3.2), { srgb: false }) };
}

export function pavers(size = 512) {
  // concrete sidewalk tiles 40 cm (5 per 2 m repeat)
  const rnd = makeRng(22);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  const hf = new Float32Array(size * size);
  const n = 5, cell = size / n;
  const tone = []; for (let i = 0; i < n * n; i++) tone.push((rnd() - 0.5) * 22);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    const fx = x - cx * cell, fy = y - cy * cell;
    const gap = Math.min(fx, fy, cell - fx, cell - fy) < 2.2;
    const u = x / size, v = y / size;
    const noise = tfbm(u, v, 8, 4, 4) - 0.5;
    const speck = tnoise(u * 256, v * 256, 256, 7) - 0.5;
    let val = 150 + tone[cy * n + cx] + noise * 40 + speck * 22;
    if (gap) val = 88 + noise * 20;
    const i = (y * size + x) * 4;
    d[i] = val * 1.0; d[i + 1] = val * 0.985; d[i + 2] = val * 0.96; d[i + 3] = 255;
    hf[y * size + x] = gap ? 0 : 0.6 + speck * 0.3;
  }
  ctx.putImageData(img, 0, 0);
  // dirt stains
  for (let k = 0; k < 18; k++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(60,55,45,0.18)'); g.addColorStop(1, 'rgba(60,55,45,0)');
    ctx.save(); ctx.translate(rnd() * size, rnd() * size); const s = 10 + rnd() * 50; ctx.scale(s, s * (0.5 + rnd()));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
  }
  return { map: toTex(c), normal: toTex(heightToNormal(hf, size, size, 2.5), { srgb: false }) };
}

export function concrete(size = 256, base = 170, seed = 5) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n = tfbm(u, v, 4, 5, seed) - 0.5, s = tnoise(u * 128, v * 128, 128, seed + 3) - 0.5;
    const val = base + n * 46 + s * 18;
    const i = (y * size + x) * 4; d[i] = val; d[i + 1] = val * 0.99; d[i + 2] = val * 0.965; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c);
}

export function grass(size = 1024) {
  const rnd = makeRng(33);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const dry = smoothstep(0.42, 0.68, tfbm(u, v, 3, 4, 41));
    const dirt = smoothstep(0.62, 0.72, tfbm(u + 0.3, v, 5, 4, 77));
    const n = tnoise(u * 300, v * 300, 300, 3) - 0.5;
    let r = lerp(78, 142, dry), g = lerp(104, 128, dry), b = lerp(44, 72, dry);
    r = lerp(r, 118, dirt); g = lerp(g, 100, dirt); b = lerp(b, 78, dirt);
    const i = (y * size + x) * 4; d[i] = r + n * 30; d[i + 1] = g + n * 30; d[i + 2] = b + n * 18; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // blades
  for (let k = 0; k < 60000; k++) {
    const x = rnd() * size, y = rnd() * size;
    const dryish = rnd();
    const col = dryish < 0.55 ? `rgba(${60 + rnd() * 40},${95 + rnd() * 50},${30 + rnd() * 25},0.55)` : `rgba(${140 + rnd() * 50},${128 + rnd() * 40},${70 + rnd() * 30},0.5)`;
    ctx.strokeStyle = col; ctx.lineWidth = 0.8 + rnd();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 5, y - 3 - rnd() * 6); ctx.stroke();
  }
  return toTex(c);
}

export function dirt(size = 512) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n = tfbm(u, v, 6, 5, 91) - 0.5, s = tnoise(u * 200, v * 200, 200, 4) - 0.5;
    const i = (y * size + x) * 4;
    d[i] = 128 + n * 50 + s * 30; d[i + 1] = 112 + n * 45 + s * 28; d[i + 2] = 88 + n * 35 + s * 22; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c);
}

export function rubberPlay(size = 256) {
  // EPDM safety surface of the playground
  const rnd = makeRng(8);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#b8402f'; ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 9000; k++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,20,15,0.6)' : 'rgba(220,110,80,0.5)'; ctx.fillRect(rnd() * size, rnd() * size, 1.5, 1.5); }
  return toTex(c);
}

/* =====================================================================
   VEGETATION
   ===================================================================== */
export function bark(size = 256) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n = tfbm(u * 6, v * 0.8, 4, 4, 13), s = tnoise(u * 64, v * 16, 16, 2);
    const ridge = Math.abs(Math.sin((u * 18 + n * 3) * Math.PI));
    const val = 70 + ridge * 45 + (s - 0.5) * 30;
    const i = (y * size + x) * 4; d[i] = val * 0.95; d[i + 1] = val * 0.88; d[i + 2] = val * 0.78; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c);
}

export function leafCluster(size = 512, kind = 'broad') {
  const rnd = makeRng(kind === 'birch' ? 71 : 55);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  // several overlapping leaf clumps → mostly opaque card with a leafy silhouette
  const clumps = kind === 'birch' ? 5 : 4;
  for (let q = 0; q < clumps; q++) {
    const qx = cx + (rnd() - 0.5) * size * 0.35, qy = cy + (rnd() - 0.5) * size * 0.35, qr = size * (0.2 + rnd() * 0.08);
    const n = kind === 'birch' ? 240 : 170;
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * qr;
      const x = qx + Math.cos(a) * rad, y = qy + Math.sin(a) * rad;
      const edge = rad / qr;
      const L = (kind === 'birch' ? 13 : 20) + rnd() * 12, W = L * (kind === 'birch' ? 0.62 : 0.7);
      const hue = kind === 'birch' ? 80 + rnd() * 18 : 74 + rnd() * 30;
      // darker inside the clump, lighter at the rim facing up
      const light = 16 + rnd() * 14 + edge * 12 + (y < qy ? 5 : -3);
      const sat = 35 + rnd() * 25;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI * 2);
      ctx.fillStyle = `hsl(${hue},${sat}%,${light}%)`;
      ctx.beginPath(); ctx.moveTo(0, -L / 2);
      ctx.quadraticCurveTo(W / 2, -L / 6, 0, L / 2); ctx.quadraticCurveTo(-W / 2, -L / 6, 0, -L / 2); ctx.fill();
      ctx.restore();
    }
  }
  // twigs peeking out
  ctx.strokeStyle = 'rgba(70,55,40,0.9)'; ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) { ctx.lineWidth = 2 + rnd() * 2; ctx.beginPath(); ctx.moveTo(cx + (rnd() - 0.5) * 40, size * 0.92); ctx.quadraticCurveTo(rnd() * size, size * 0.6, cx + (rnd() - 0.5) * size * 0.5, cy + (rnd() - 0.5) * 60); ctx.stroke(); }
  const t = toTex(c, { repeat: false });
  return t;
}

export function needles(size = 512) {
  const rnd = makeRng(99);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let b = 0; b < 9; b++) {
    const bx = size * (0.1 + rnd() * 0.8), by = size * (0.15 + rnd() * 0.75);
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.4, len = size * (0.25 + rnd() * 0.25);
    ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 3;
    const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    for (let t = 0; t < 1; t += 0.012) {
      const px = lerp(bx, ex, t), py = lerp(by, ey, t);
      for (const s of [-1, 1]) {
        const na = ang + s * (0.9 + rnd() * 0.5), nl = 10 + rnd() * 14 * (1 - t * 0.5);
        ctx.strokeStyle = `hsl(${140 + rnd() * 25},${30 + rnd() * 20}%,${14 + rnd() * 14}%)`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); ctx.stroke();
      }
    }
  }
  return toTex(c, { repeat: false });
}

/* =====================================================================
   BUILDING FACADES — each returns {map, rough} tile textures
   ===================================================================== */
function drawWindow(ctx, rnd, x, y, w, h, opt = {}) {
  const frame = opt.frame || (rnd() < 0.8 ? '#e9eaea' : rnd() < 0.5 ? '#6b4a2e' : '#c9c9c9');
  const fw = opt.fw || Math.max(3, w * 0.05);
  // reveal shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = frame; ctx.fillRect(x, y, w, h);
  // glass with sky reflection gradient
  const panes = opt.panes || (w > h * 1.1 ? 3 : 2);
  const rows = opt.rows || 1;
  const pw = (w - fw * (panes + 1)) / panes, ph = (h - fw * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) for (let p = 0; p < panes; p++) {
    const gx = x + fw + p * (pw + fw), gy = y + fw + r * (ph + fw);
    const g = ctx.createLinearGradient(gx, gy, gx + pw * 0.4, gy + ph);
    const sky = opt.dark ? ['#27313b', '#10161d'] : ['#8fa7ba', '#2c3a47'];
    g.addColorStop(0, sky[0]); g.addColorStop(0.55, sky[1]); g.addColorStop(1, '#1a2129');
    ctx.fillStyle = g; ctx.fillRect(gx, gy, pw, ph);
    // interior: curtains / blinds
    const cur = rnd();
    if (cur < 0.35) {
      ctx.fillStyle = `hsla(${rnd() * 360},${10 + rnd() * 30}%,${65 + rnd() * 25}%,0.75)`;
      const cw = pw * (0.2 + rnd() * 0.35);
      ctx.fillRect(rnd() < 0.5 ? gx : gx + pw - cw, gy, cw, ph);
    } else if (cur < 0.5) {
      ctx.fillStyle = 'rgba(225,222,210,0.8)'; ctx.fillRect(gx, gy, pw, ph * (0.2 + rnd() * 0.6));
      ctx.strokeStyle = 'rgba(150,150,140,0.5)'; ctx.lineWidth = 1;
      for (let yy = gy + 3; yy < gy + ph * 0.8; yy += 4) { ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + pw, yy); ctx.stroke(); }
    } else if (cur < 0.58) {
      ctx.fillStyle = 'rgba(240,235,220,0.55)'; ctx.fillRect(gx, gy, pw, ph);
    }
    // reflection streak
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.moveTo(gx + pw * 0.15, gy); ctx.lineTo(gx + pw * 0.35, gy); ctx.lineTo(gx + pw * 0.05, gy + ph); ctx.lineTo(gx - pw * 0.15 < gx ? gx : gx, gy + ph); ctx.fill();
  }
  if (opt.sill !== false) { ctx.fillStyle = '#d8d6d0'; ctx.fillRect(x - 4, y + h, w + 8, 4); }
}

/**
 * Prefab panel-block facade (Bulgarian "панелка"): tile = bays x floors.
 * rough map: glass smooth, walls rough.
 */
export function panelFacade({ seed = 1, bays = 4, floors = 4, px = 256, base = [196, 192, 182], joint = '#6d6a64', winW = 0.52, winH = 0.5, winY = 0.3, frames } = {}) {
  const rnd = makeRng(seed);
  const W = bays * px, H = floors * px;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const n = tfbm(u, v, 5, 4, seed * 7) - 0.5, s = tnoise(u * 180, v * 180, 180, seed) - 0.5;
    const streak = tnoise(u * 60, v * 3, 3, seed + 4) - 0.5;
    const k = 1 + n * 0.12 + s * 0.06 + streak * 0.07;
    const i = (y * W + x) * 4; d[i] = base[0] * k; d[i + 1] = base[1] * k; d[i + 2] = base[2] * k; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const rc = makeCanvas(W, H), rx = rc.getContext('2d');
  rx.fillStyle = 'rgb(0,235,0)'; rx.fillRect(0, 0, W, H);
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const x0 = b * px, y0 = f * px;
    // panel joints
    ctx.fillStyle = joint; ctx.fillRect(x0, y0 + px - 3, px, 3); ctx.fillRect(x0 + px - 3, y0, 3, px);
    const ww = px * winW, wh = px * winH, wx = x0 + (px - ww) / 2, wy = y0 + px * (1 - winY) - wh;
    // dirt streak under window
    const g = ctx.createLinearGradient(0, wy + wh, 0, wy + wh + px * 0.3);
    g.addColorStop(0, 'rgba(70,60,50,0.25)'); g.addColorStop(1, 'rgba(70,60,50,0)');
    ctx.fillStyle = g; ctx.fillRect(wx + ww * 0.2, wy + wh, ww * 0.6, px * 0.3);
    drawWindow(ctx, rnd, wx, wy, ww, wh, { frame: frames ? frames[(rnd() * frames.length) | 0] : undefined });
    rx.fillStyle = 'rgb(0,20,0)'; rx.fillRect(wx, wy, ww, wh);
    if (rnd() < 0.18) { // AC unit
      ctx.fillStyle = '#eceeee'; const aw = px * 0.2, ah = px * 0.13;
      const ax = rnd() < 0.5 ? wx - aw - 6 : wx + ww + 6; ctx.fillRect(ax, wy + wh * 0.5, aw, ah);
      ctx.fillStyle = '#9aa0a3'; for (let t = 0; t < 4; t++) ctx.fillRect(ax + 3, wy + wh * 0.5 + 3 + t * 5, aw - 6, 2);
    }
  }
  return { map: toTex(c), rough: toTex(rc, { srgb: false }) };
}

export function modernFacade({ seed = 2, bays = 3, floors = 4, px = 256, base = [236, 232, 222], accent = '#b35a3c' } = {}) {
  const rnd = makeRng(seed);
  const W = bays * px, H = floors * px;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const n = tfbm(u, v, 4, 4, seed * 5) - 0.5, s = tnoise(u * 256, v * 256, 256, seed) - 0.5;
    const k = 1 + n * 0.05 + s * 0.035;
    const i = (y * W + x) * 4; d[i] = base[0] * k; d[i + 1] = base[1] * k; d[i + 2] = base[2] * k; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const rc = makeCanvas(W, H), rx = rc.getContext('2d');
  rx.fillStyle = 'rgb(0,200,0)'; rx.fillRect(0, 0, W, H);
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const x0 = b * px, y0 = f * px;
    if (b === 1) { ctx.fillStyle = accent; ctx.fillRect(x0 + px * 0.04, y0, px * 0.92, px); }
    // slab edge line
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x0, y0 + px - 5, px, 5);
    const french = b === 1;
    const ww = px * (french ? 0.62 : 0.56), wh = px * (french ? 0.78 : 0.52);
    const wx = x0 + (px - ww) / 2, wy = y0 + px * 0.9 - wh - (french ? 0 : px * 0.18);
    drawWindow(ctx, rnd, wx, wy, ww, wh, { frame: '#3b3f44', fw: 5, panes: 2, dark: false, sill: !french });
    rx.fillStyle = 'rgb(0,15,0)'; rx.fillRect(wx, wy, ww, wh);
  }
  return { map: toTex(c), rough: toTex(rc, { srgb: false }) };
}

/** School: 2 bays repeating, 3 floors fixed (ground floor barred), roughcast plaster. */
export function schoolFacade({ px = 256 } = {}) {
  const rnd = makeRng(36);
  const bays = 2, floors = 3;
  const W = bays * px, H = floors * px;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const n = tfbm(u, v, 4, 4, 17) - 0.5, s = tnoise(u * 400, v * 600, 400, 3) - 0.5, s2 = tnoise(u * 900, v * 1300, 900, 5) - 0.5;
    const plinth = y > H - px * 0.16;
    const base = plinth ? [128, 130, 134] : [158, 150, 136];
    const k = 1 + n * 0.1 + s * 0.16 + s2 * 0.12;
    const i = (y * W + x) * 4; d[i] = base[0] * k; d[i + 1] = base[1] * k; d[i + 2] = base[2] * k; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const rc = makeCanvas(W, H), rx = rc.getContext('2d');
  rx.fillStyle = 'rgb(0,250,0)'; rx.fillRect(0, 0, W, H);
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const x0 = b * px, y0 = f * px;
    const ww = px * 0.5, wh = px * 0.55, wx = x0 + (px - ww) / 2, wy = y0 + px * 0.2;
    drawWindow(ctx, rnd, wx, wy, ww, wh, { frame: '#f1f1ee', fw: 6, panes: 2, rows: 2 });
    rx.fillStyle = 'rgb(0,20,0)'; rx.fillRect(wx, wy, ww, wh);
    if (f === floors - 1) { // barred ground floor
      ctx.strokeStyle = '#e6e6e2'; ctx.lineWidth = 3;
      for (let t = 1; t < 8; t++) { ctx.beginPath(); ctx.moveTo(wx + (ww * t) / 8, wy - 4); ctx.lineTo(wx + (ww * t) / 8, wy + wh + 4); ctx.stroke(); }
      for (const t of [0.15, 0.85]) { ctx.beginPath(); ctx.moveTo(wx - 4, wy + wh * t); ctx.lineTo(wx + ww + 4, wy + wh * t); ctx.stroke(); }
    }
  }
  return { map: toTex(c), rough: toTex(rc, { srgb: false }) };
}

/** Polyclinic with ribbon windows (DCC 20). 1 bay x 3 floors. */
export function ribbonFacade({ px = 256 } = {}) {
  const rnd = makeRng(20);
  const W = px * 2, H = px * 3;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rc = makeCanvas(W, H), rx = rc.getContext('2d');
  ctx.fillStyle = '#d9d8d2'; ctx.fillRect(0, 0, W, H);
  rx.fillStyle = 'rgb(0,220,0)'; rx.fillRect(0, 0, W, H);
  for (let f = 0; f < 3; f++) {
    const y0 = f * px;
    // spandrel panels with vertical ribs
    ctx.fillStyle = '#c9c7bf'; ctx.fillRect(0, y0 + px * 0.62, W, px * 0.38);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; for (let x = 0; x < W; x += 16) ctx.fillRect(x, y0 + px * 0.62, 3, px * 0.38);
    const wy = y0 + px * 0.12, wh = px * 0.46;
    for (let k = 0; k < 4; k++) drawWindow(ctx, rnd, k * (W / 4) + 3, wy, W / 4 - 6, wh, { frame: '#9ea3a8', fw: 4, panes: 2, sill: false });
    rx.fillStyle = 'rgb(0,20,0)'; rx.fillRect(0, wy, W, wh);
  }
  return { map: toTex(c), rough: toTex(rc, { srgb: false }) };
}

/** Shopfront glazing with shelves/products behind. */
export function shopfront({ seed = 3, px = 512, tint = '#dfe7ee' } = {}) {
  const rnd = makeRng(seed);
  const W = px, H = px / 2;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rc = makeCanvas(W, H), rx = rc.getContext('2d');
  ctx.fillStyle = '#2b2f33'; ctx.fillRect(0, 0, W, H);
  // interior
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f2f2ea'); g.addColorStop(1, '#b9b8b0');
  ctx.fillStyle = g; ctx.fillRect(4, 4, W - 8, H - 8);
  for (let s = 0; s < 5; s++) {
    const sx = 10 + s * (W / 5), sy = H * 0.3;
    ctx.fillStyle = '#8b8d90'; ctx.fillRect(sx, sy, W / 5 - 20, H * 0.62);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) {
      ctx.fillStyle = `hsl(${rnd() * 360},${40 + rnd() * 40}%,${40 + rnd() * 30}%)`;
      ctx.fillRect(sx + 3 + k * ((W / 5 - 26) / 9), sy + 4 + r * (H * 0.15), (W / 5 - 30) / 9, H * 0.1);
    }
  }
  // glass reflection
  const rg = ctx.createLinearGradient(0, 0, W, H); rg.addColorStop(0, 'rgba(200,220,235,0.45)'); rg.addColorStop(0.5, 'rgba(120,140,160,0.15)'); rg.addColorStop(1, 'rgba(200,220,235,0.35)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = tint === '#dfe7ee' ? '#3a3f45' : tint; for (let x = 0; x <= W; x += W / 4) ctx.fillRect(x - 3, 0, 6, H);
  ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 6, W, 6);
  rx.fillStyle = 'rgb(0,18,0)'; rx.fillRect(0, 0, W, H);
  return { map: toTex(c), rough: toTex(rc, { srgb: false }) };
}

export function roofTiles(size = 512) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const rnd = makeRng(4);
  ctx.fillStyle = '#8a3f2a'; ctx.fillRect(0, 0, size, size);
  const rows = 16, cols = 10, rh = size / rows, cw = size / cols;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols + 1; k++) {
    const x = k * cw + (r % 2) * cw * 0.5, y = r * rh;
    const l = 30 + rnd() * 14;
    const g = ctx.createLinearGradient(x, 0, x + cw, 0);
    g.addColorStop(0, `hsl(14,52%,${l - 8}%)`); g.addColorStop(0.5, `hsl(15,55%,${l + 4}%)`); g.addColorStop(1, `hsl(14,52%,${l - 10}%)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x + cw / 2, y + rh * 0.55, cw / 2 - 1, rh * 0.62, 0, 0, Math.PI); ctx.fill();
    ctx.fillRect(x + 1, y, cw - 2, rh * 0.55);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + rh - 2, cw, 2);
  }
  // moss / dirt
  for (let k = 0; k < 40; k++) { ctx.fillStyle = `rgba(${40 + rnd() * 30},${40 + rnd() * 20},20,0.12)`; ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, 5 + rnd() * 30, 0, 7); ctx.fill(); }
  return toTex(c);
}

export function flatRoof(size = 256) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n = tfbm(u, v, 4, 4, 61) - 0.5, s = tnoise(u * 128, v * 128, 128, 2) - 0.5;
    const val = 88 + n * 40 + s * 40;
    const i = (y * size + x) * 4; d[i] = val; d[i + 1] = val * 0.98; d[i + 2] = val * 0.95; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c);
}

export function woodPlanks(size = 256) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const rnd = makeRng(6);
  for (let p = 0; p < 8; p++) {
    const y = (p * size) / 8, l = 26 + rnd() * 12;
    ctx.fillStyle = `hsl(25,45%,${l}%)`; ctx.fillRect(0, y, size, size / 8);
    ctx.strokeStyle = `hsla(20,40%,${l - 10}%,0.5)`;
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(0, y + rnd() * size / 8); ctx.bezierCurveTo(size / 3, y + rnd() * size / 8, size * 2 / 3, y + rnd() * size / 8, size, y + rnd() * size / 8); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, y, size, 2);
  }
  return toTex(c);
}

export function stoneWall(size = 256) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const rnd = makeRng(12);
  ctx.fillStyle = '#6d6259'; ctx.fillRect(0, 0, size, size);
  let y = 0;
  while (y < size) {
    const h = 14 + rnd() * 16; let x = -rnd() * 30;
    while (x < size) {
      const w = 26 + rnd() * 40, l = 45 + rnd() * 22;
      ctx.fillStyle = `hsl(${25 + rnd() * 15},${12 + rnd() * 14}%,${l}%)`;
      ctx.fillRect(x + 2, y + 2, w - 3, h - 3); x += w;
    }
    y += h;
  }
  return toTex(c);
}

/* =====================================================================
   TROLLEYBUS
   ===================================================================== */
export const LIVERY = { blue: '#1f93d6', yellow: '#f8bb10', stripe: '#1757a6', black: '#0c0d0f' };
/** Vertical livery band: v = y / 3.3 m. */
export function liveryBand() {
  const H = 1024;
  const c = makeCanvas(4, H), ctx = c.getContext('2d');
  const y2p = (y) => H - (y / 3.3) * H;
  const band = (y0, y1, col) => { ctx.fillStyle = col; ctx.fillRect(0, y2p(y1), 4, y2p(y0) - y2p(y1)); };
  band(0, 0.62, LIVERY.blue);
  band(0.62, 1.085, LIVERY.yellow);
  band(1.085, 1.14, LIVERY.stripe);
  band(1.14, 2.73, LIVERY.black);
  band(2.73, 3.3, LIVERY.blue);
  // subtle road grime near the bottom
  const g = ctx.createLinearGradient(0, y2p(0.25), 0, y2p(0.95));
  g.addColorStop(0, 'rgba(60,55,45,0.45)'); g.addColorStop(1, 'rgba(60,55,45,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y2p(0.95), 4, y2p(0.25) - y2p(0.95));
  const t = toTex(c, { repeat: false });
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
export function orangePeel(size = 256) {
  const hf = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hf[y * size + x] = tfbm(x / size, y / size, 24, 3, 5);
  return toTex(heightToNormal(hf, size, size, 0.9), { srgb: false });
}

function decal(w, h, draw) {
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  const t = toTex(c, { repeat: false });
  return t;
}
export function textDecal(text, { w = 512, h = 128, color = '#111', font = `800 100px ${FONT}`, align = 'center', bg = null, stroke = null, pad = 0 } = {}) {
  return decal(w, h, (ctx) => {
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    const x = align === 'center' ? w / 2 : align === 'left' ? pad : w - pad;
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 6; ctx.strokeText(text, x, h / 2 + 4); }
    ctx.fillText(text, x, h / 2 + 4);
  });
}
export function solarisBar() {
  return decal(1024, 96, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.35, '#9aa2aa'); g.addColorStop(0.55, '#e9edf0'); g.addColorStop(1, '#6d747b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.font = `600 64px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(40,44,50,0.9)';
    const s = 'S O L A R I S'; ctx.fillText(s, w / 2, h / 2 + 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText(s, w / 2, h / 2 + 1);
  });
}
export function skodaBadge() {
  return decal(256, 320, (ctx, w) => {
    ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.arc(w / 2, 110, 100, 0, 7); ctx.fill();
    ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(w / 2, 110, 96, 0, 7); ctx.stroke();
    // stylised winged arrow
    ctx.fillStyle = '#f2f2f2'; ctx.save(); ctx.translate(w / 2, 110);
    ctx.beginPath();
    ctx.moveTo(-70, -10); ctx.quadraticCurveTo(-30, -60, 20, -40); ctx.lineTo(70, -40); ctx.lineTo(40, -10);
    ctx.lineTo(62, 0); ctx.lineTo(10, 10); ctx.quadraticCurveTo(-20, 50, -55, 40); ctx.quadraticCurveTo(-30, 20, -40, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.arc(-12, -18, 11, 0, 7); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#111'; ctx.font = `800 58px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ŠKODA', w / 2, 272);
  });
}
export function geckoSticker() {
  return decal(256, 256, (ctx) => {
    ctx.fillStyle = '#6cc04a'; ctx.strokeStyle = '#2f6e22'; ctx.lineWidth = 4;
    ctx.save(); ctx.translate(128, 128); ctx.rotate(-0.5);
    ctx.beginPath(); ctx.ellipse(0, 0, 70, 28, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(78, -6, 30, 22, 0.2, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-60, 5); ctx.quadraticCurveTo(-120, 30, -100, 80); ctx.lineWidth = 16; ctx.strokeStyle = '#6cc04a'; ctx.stroke();
    ctx.lineWidth = 12;
    for (const [x, s] of [[40, 1], [40, -1], [-40, 1], [-40, -1]]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 18, s * 50); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(90, -16, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(92, -16, 4, 0, 7); ctx.fill();
    ctx.restore();
  });
}
export function accessPictos() {
  return decal(512, 256, (ctx) => {
    const box = (x, draw) => { ctx.fillStyle = '#1f5fb0'; ctx.fillRect(x, 16, 224, 224); ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.strokeRect(x + 10, 26, 204, 204); ctx.save(); ctx.translate(x + 112, 128); draw(); ctx.restore(); };
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    box(8, () => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(-6, -70, 16, 0, 7); ctx.fill(); ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(-10, -45); ctx.lineTo(-10, 10); ctx.lineTo(40, 10); ctx.lineTo(55, 60); ctx.stroke(); ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(-10, 30, 48, 0.3, 5.5); ctx.stroke(); });
    box(272, () => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -72, 18, 0, 7); ctx.fill(); ctx.fillRect(-26, -48, 52, 70); ctx.fillRect(-24, 20, 18, 70); ctx.fillRect(6, 20, 18, 70); ctx.fillRect(-40, -46, 12, 60); ctx.fillRect(28, -46, 12, 60); });
  });
}
export function euSticker() {
  return decal(256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#f4f4f0'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#003399'; ctx.fillRect(20, 20, 90, 60);
    ctx.fillStyle = '#ffcc00'; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ctx.beginPath(); ctx.arc(65 + Math.cos(a) * 20, 50 + Math.sin(a) * 20, 3, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#555'; for (let k = 0; k < 11; k++) ctx.fillRect(20, 100 + k * 18, 120 + ((k * 37) % 90), 7);
    ctx.fillStyle = '#b1003a'; ctx.fillRect(150, 22, 80, 56);
  });
}
export function blueDriveSticker() {
  return decal(512, 160, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(230,236,242,0.95)'; ctx.font = `italic 400 26px ${FONT}`; ctx.fillText('powered by', 22, 36);
    ctx.font = `800 44px ${FONT}`; ctx.fillText('ŠKODA', 22, 86);
    ctx.font = `300 44px ${FONT}`; ctx.fillText('BlueDrive', 186, 86);
    ctx.strokeStyle = 'rgba(230,236,242,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, 130); ctx.bezierCurveTo(150, 90, 330, 160, 500, 100); ctx.stroke();
  });
}
export function flagBG() {
  return decal(96, 64, (ctx) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 96, 22); ctx.fillStyle = '#00966e'; ctx.fillRect(0, 21, 96, 22); ctx.fillStyle = '#d62612'; ctx.fillRect(0, 42, 96, 22); });
}
export function smiley() {
  return decal(128, 128, (ctx) => {
    ctx.fillStyle = '#ffe21a'; ctx.beginPath(); ctx.arc(64, 64, 58, 0, 7); ctx.fill(); ctx.strokeStyle = '#6b5a00'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(44, 50, 6, 11, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(84, 50, 6, 11, 0, 0, 7); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.arc(64, 70, 30, 0.35, Math.PI - 0.35); ctx.stroke();
  });
}
export function routeCard(num) {
  return decal(256, 200, (ctx, w, h) => {
    ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#999'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#111'; ctx.font = `800 180px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(num, w / 2, h / 2 + 10);
  });
}
export function stopButton(blue = false) {
  return decal(128, 128, (ctx) => {
    ctx.fillStyle = blue ? '#1f5fb0' : '#d0201a'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff'; ctx.font = `800 34px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(blue ? '♿' : 'STOP', 64, 70);
  });
}
export function hazardStripes() {
  const c = makeCanvas(256, 32), ctx = c.getContext('2d');
  ctx.fillStyle = '#f5c400'; ctx.fillRect(0, 0, 256, 32); ctx.fillStyle = '#111';
  for (let x = -32; x < 288; x += 32) { ctx.beginPath(); ctx.moveTo(x, 32); ctx.lineTo(x + 16, 32); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 0); ctx.fill(); }
  const t = toTex(c); return t;
}
export function seatFabric(size = 256) {
  const rnd = makeRng(77);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#1c2a74'; ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4; const weave = ((x + y) % 2) * 10 + ((x >> 1) % 2) * 6;
    d[i] += weave - 8; d[i + 1] += weave - 8; d[i + 2] += weave;
  }
  ctx.putImageData(img, 0, 0);
  const cell = 16;
  for (let y = 0; y < size; y += cell) for (let x = 0; x < size; x += cell) {
    const r = rnd();
    const ox = x + (rnd() * 6) | 0, oy = y + (rnd() * 6) | 0;
    if (r < 0.28) { ctx.fillStyle = '#4a66d6'; ctx.fillRect(ox, oy, 5, 5); }
    else if (r < 0.46) { ctx.fillStyle = '#8b3fa6'; ctx.fillRect(ox + 2, oy, 3, 7); }
    else if (r < 0.6) { ctx.fillStyle = '#2fa6d9'; ctx.fillRect(ox, oy + 3, 7, 3); }
    else if (r < 0.7) { ctx.fillStyle = '#0d1440'; ctx.fillRect(ox, oy, 8, 8); }
  }
  return toTex(c);
}
export function busFloor(size = 512) {
  const rnd = makeRng(88);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n = tfbm(u, v, 3, 4, 3) - 0.5;
    const val = 142 + n * 26;
    const i = (y * size + x) * 4; d[i] = val * 0.98; d[i + 1] = val; d[i + 2] = val * 1.02; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let k = 0; k < 14000; k++) {
    const r = rnd(); ctx.fillStyle = r < 0.4 ? '#3a3d40' : r < 0.75 ? '#e8e8e4' : '#6f7a88';
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  return toTex(c);
}
export function tread() {
  const W = 512, H = 128;
  const hf = new Float32Array(W * H);
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#191919'; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const bx = x % 32, by = y;
    const groove = by < 6 || by > H - 6 || Math.abs(by - H / 2) < 3 || Math.abs(by - H / 4) < 2.5 || Math.abs(by - (3 * H) / 4) < 2.5
      || (bx < 3 && (by < H / 4 || by > (3 * H) / 4));
    hf[y * W + x] = groove ? 0 : 1;
  }
  const n = heightToNormal(hf, W, H, 4);
  return { map: toTex(c), normal: toTex(n, { srgb: false }) };
}
export function speedoDial() {
  return decal(512, 512, (ctx, w) => {
    const cx = w / 2, cy = w / 2;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 250); g.addColorStop(0, '#1d2126'); g.addColorStop(1, '#07080a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 250, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8c949c'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, 246, 0, 7); ctx.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#eef'; ctx.font = `700 34px ${FONT}`;
    for (let v = 0; v <= 100; v += 5) {
      const a = a0 + (a1 - a0) * (v / 100), big = v % 10 === 0;
      ctx.strokeStyle = v >= 70 ? '#ff5a4a' : '#e8eef4'; ctx.lineWidth = big ? 6 : 3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 225, cy + Math.sin(a) * 225); ctx.lineTo(cx + Math.cos(a) * (big ? 190 : 205), cy + Math.sin(a) * (big ? 190 : 205)); ctx.stroke();
      if (big && v % 20 === 0) ctx.fillText(String(v), cx + Math.cos(a) * 155, cy + Math.sin(a) * 155);
    }
    ctx.fillStyle = '#aab'; ctx.font = `600 26px ${FONT}`; ctx.fillText('km/h', cx, cy + 90);
  });
}
export function humanFace() {
  return decal(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    // the face occupies u in [0.375,0.625] of the sphere's longitude (front)
    const fx = w * 0.5;
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath(); ctx.ellipse(fx - 12, h * 0.46, 3.2, 3.6, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(fx + 12, h * 0.46, 3.2, 3.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(80,50,40,0.55)'; ctx.fillRect(fx - 18, h * 0.39, 11, 2.5); ctx.fillRect(fx + 7, h * 0.39, 11, 2.5);
    ctx.fillStyle = 'rgba(150,70,70,0.55)'; ctx.fillRect(fx - 7, h * 0.66, 14, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(fx - 2, h * 0.5, 4, 10);
  });
}
export function plate(text) {
  return decal(256, 56, (ctx, w, h) => {
    ctx.fillStyle = '#f7f7f5'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.fillStyle = '#1b3fa0'; ctx.fillRect(3, 3, 26, h - 6);
    ctx.fillStyle = '#ffd200'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('BG', 16, h - 12);
    ctx.fillStyle = '#111'; ctx.font = `700 34px ${FONT_MONO}`; ctx.textBaseline = 'middle'; ctx.fillText(text, 140, h / 2 + 2);
  });
}

/* =====================================================================
   SIGNS
   ===================================================================== */
export function signText(lines, { w = 1024, h = 192, bg = '#1d4e9e', fg = '#fff', font = FONT, weight = 800, border = null, size = null } = {}) {
  return decal(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = h * 0.06; ctx.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const L = Array.isArray(lines) ? lines : [lines];
    const fs = size || (h / L.length) * 0.62;
    L.forEach((t, i) => {
      ctx.font = `${weight} ${fs}px ${font}`;
      let s = fs; while (ctx.measureText(t).width > w * 0.92 && s > 8) { s -= 2; ctx.font = `${weight} ${s}px ${font}`; }
      ctx.fillText(t, w / 2, (h / L.length) * (i + 0.5) + 2);
    });
  });
}
export function roadSign(kind) {
  return decal(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (kind === '40' || kind === '50') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(128, 128, 120, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d4121b'; ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(128, 128, 106, 0, 7); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = `800 110px ${FONT}`; ctx.fillText(kind, 128, 134);
    } else if (kind === 'stop') {
      ctx.fillStyle = '#d4121b'; ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k * Math.PI) / 4; ctx.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); }
      ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `800 70px ${FONT}`; ctx.fillText('STOP', 128, 132);
    } else if (kind === 'ped') {
      ctx.fillStyle = '#1d5fb8'; ctx.fillRect(8, 8, 240, 240); ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(128, 30); ctx.lineTo(228, 220); ctx.lineTo(28, 220); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(128, 95, 12, 0, 7); ctx.fill(); ctx.fillRect(120, 108, 16, 50);
      ctx.fillRect(100, 158, 20, 8); ctx.fillRect(136, 158, 20, 8);
      for (let x = 50; x < 210; x += 22) ctx.fillRect(x, 190, 12, 16);
    } else if (kind === 'priority') {
      ctx.save(); ctx.translate(128, 128); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#fff'; ctx.fillRect(-84, -84, 168, 168); ctx.fillStyle = '#f4c20d'; ctx.fillRect(-64, -64, 128, 128); ctx.restore();
    } else if (kind === 'yield') {
      ctx.fillStyle = '#d4121b'; ctx.beginPath(); ctx.moveTo(10, 30); ctx.lineTo(246, 30); ctx.lineTo(128, 236); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(48, 52); ctx.lineTo(208, 52); ctx.lineTo(128, 192); ctx.fill();
    } else if (kind === 'busstop') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(128, 128, 122, 0, 7); ctx.fill();
      ctx.strokeStyle = '#1b4ea3'; ctx.lineWidth = 12; ctx.stroke();
      ctx.fillStyle = '#1b4ea3'; ctx.font = `800 130px ${FONT}`; ctx.fillText('T', 128, 138);
    }
  });
}

/* =====================================================================
   DYNAMIC DISPLAYS
   ===================================================================== */
/** LED dot-matrix display. Returns {texture, draw(lines)}. */
export class LedDisplay {
  constructor(cols, rows, { color = [255, 170, 30], dot = 6, off = [38, 26, 8] } = {}) {
    this.cols = cols; this.rows = rows; this.dot = dot; this.color = color; this.offc = off;
    this.src = makeCanvas(cols, rows); this.sctx = this.src.getContext('2d', { willReadFrequently: true });
    this.canvas = makeCanvas(cols * dot, rows * dot); this.ctx = this.canvas.getContext('2d');
    this.texture = toTex(this.canvas, { repeat: false });
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
  }
  /** items: [{text, x, size, align:'left'|'center'|'right', bold, w}] */
  draw(items) {
    const { cols, rows, sctx } = this;
    sctx.fillStyle = '#000'; sctx.fillRect(0, 0, cols, rows);
    sctx.fillStyle = '#fff'; sctx.textBaseline = 'middle';
    for (const it of items) {
      const size = it.size || rows;
      sctx.font = `${it.bold === false ? 400 : 700} ${size}px ${it.font || FONT_COND}`;
      sctx.textAlign = it.align || 'left';
      const maxW = it.w || cols;
      let s = size; while (sctx.measureText(it.text).width > maxW && s > 5) { s -= 1; sctx.font = `${it.bold === false ? 400 : 700} ${s}px ${it.font || FONT_COND}`; }
      sctx.fillText(it.text, it.x || 0, it.y !== undefined ? it.y : rows / 2 + 1);
    }
    const data = sctx.getImageData(0, 0, cols, rows).data;
    const { ctx, dot, color, offc } = this;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const on = `rgb(${color[0]},${color[1]},${color[2]})`, offs = `rgb(${offc[0]},${offc[1]},${offc[2]})`;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = data[(y * cols + x) * 4] > 110;
      ctx.fillStyle = lit ? on : offs;
      ctx.beginPath(); ctx.arc(x * dot + dot / 2, y * dot + dot / 2, dot * 0.38, 0, 7); ctx.fill();
    }
    this.texture.needsUpdate = true;
  }
}

/** Generic canvas-backed dynamic texture. */
export class CanvasTex {
  constructor(w, h, opts) { this.canvas = makeCanvas(w, h); this.ctx = this.canvas.getContext('2d'); this.texture = toTex(this.canvas, { repeat: false, ...opts }); }
  update() { this.texture.needsUpdate = true; }
}

export function clamp01(v) { return clamp(v, 0, 1); }
