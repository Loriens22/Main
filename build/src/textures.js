// ---------------------------------------------------------------------------
// Procedural PBR textures — all generated on <canvas> so the final HTML file is
// fully self-contained (no external image assets). Each helper returns a
// THREE.CanvasTexture (or a small set of maps) tuned for a specific material.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

// Deterministic value-noise so textures look consistent between reloads.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fbmFill(ctx, size, rnd, baseTint, contrast) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  // multi-octave value noise
  const octaves = 4;
  const grids = [];
  for (let o = 0; o < octaves; o++) {
    const cells = 4 * Math.pow(2, o);
    const g = new Float32Array((cells + 1) * (cells + 1));
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    grids.push({ cells, g });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (grid, x, y) => {
    const { cells, g } = grid;
    const gx = x * cells, gy = y * cells;
    const x0 = Math.floor(gx) % cells, y0 = Math.floor(gy) % cells;
    const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
    const fx = smooth(gx - Math.floor(gx)), fy = smooth(gy - Math.floor(gy));
    const v00 = g[y0 * (cells + 1) + x0], v10 = g[y0 * (cells + 1) + x1];
    const v01 = g[y1 * (cells + 1) + x0], v11 = g[y1 * (cells + 1) + x1];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 0.6, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += sample(grids[o], x / size, y / size) * amp;
        norm += amp; amp *= 0.5;
      }
      let v = sum / norm;
      v = 0.5 + (v - 0.5) * contrast;
      // modulate AROUND the base tint (subtle) instead of scaling it toward black
      const b = 0.82 + 0.20 * v;
      const i = (y * size + x) * 4;
      d[i] = Math.max(0, Math.min(255, baseTint[0] * b));
      d[i + 1] = Math.max(0, Math.min(255, baseTint[1] * b));
      d[i + 2] = Math.max(0, Math.min(255, baseTint[2] * b));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Convert a grayscale height/detail canvas into a tangent-space normal map.
function heightToNormal(srcCanvas, strength) {
  const size = srcCanvas.width;
  const sctx = srcCanvas.getContext('2d');
  const src = sctx.getImageData(0, 0, size, size).data;
  const out = makeCanvas(size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const d = img.data;
  const at = (x, y) => {
    x = (x + size) % size; y = (y + size) % size;
    const i = (y * size + x) * 4;
    return (src[i] + src[i + 1] + src[i + 2]) / (3 * 255);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const nz = 1.0;
      const len = Math.hypot(dx, dy, nz);
      const i = (y * size + x) * 4;
      d[i] = ((dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function finalize(canvas, repeat, aniso) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso || 8;
  t.needsUpdate = true;
  return t;
}

// ---- White large-format facade panels (matte stucco, fine seams) -----------
export function whitePanelMaps() {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(101);
  // base off-white with faint micro imperfection
  fbmFill(ctx, size, rnd, [244, 245, 243], 0.10);
  // large-format panel seams (2x2 panels per tile)
  const h = makeCanvas(size);
  const hctx = h.getContext('2d');
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, size, size);
  // dust/streak imperfections onto colour
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = rnd() > 0.5 ? '#c9cbc7' : '#ffffff';
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath();
    const x = rnd() * size;
    ctx.moveTo(x, 0); ctx.lineTo(x + (rnd() - 0.5) * 30, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // seams on both colour (as thin darker lines) and height (as grooves)
  const drawSeams = (g, colorLine, lw) => {
    g.strokeStyle = colorLine; g.lineWidth = lw;
    for (const p of [0, size / 2, size]) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
    }
  };
  drawSeams(ctx, 'rgba(120,124,120,0.55)', 2);
  drawSeams(hctx, '#3a3a3a', 4);
  const normal = heightToNormal(h, 1.4);
  // roughness map: mostly matte with faint variation
  const r = makeCanvas(size);
  const rctx = r.getContext('2d');
  const rr = mulberry32(202);
  fbmFill(rctx, size, rr, [150, 150, 150], 0.4);
  return {
    map: finalize(c),
    normalMap: finalize(normal),
    roughnessMap: finalize(r)
  };
}

// ---- Warm wood cladding with horizontal louver slats -----------------------
export function woodMaps(vertical) {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  // base warm teak gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#8a5230');
  grad.addColorStop(0.5, '#a5663a');
  grad.addColorStop(1, '#7c4a2b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(303);
  const h = makeCanvas(size);
  const hctx = h.getContext('2d');
  hctx.fillStyle = '#888'; hctx.fillRect(0, 0, size, size);
  // wood grain streaks
  const planks = 12;
  const pw = size / planks;
  for (let p = 0; p < planks; p++) {
    const x = p * pw;
    // plank tone variation
    ctx.fillStyle = `rgba(${90 + rnd() * 60},${55 + rnd() * 35},${28 + rnd() * 22},${0.18})`;
    if (vertical) ctx.fillRect(x, 0, pw, size); else ctx.fillRect(0, x, size, pw);
    // grain lines
    for (let i = 0; i < 22; i++) {
      ctx.strokeStyle = `rgba(60,35,18,${0.05 + rnd() * 0.12})`;
      ctx.lineWidth = 0.6 + rnd() * 1.4;
      ctx.beginPath();
      if (vertical) {
        const gx = x + rnd() * pw;
        ctx.moveTo(gx, 0);
        for (let y = 0; y <= size; y += 32) ctx.lineTo(gx + Math.sin(y * 0.05 + p) * 2, y);
      } else {
        const gy = x + rnd() * pw;
        ctx.moveTo(0, gy);
        for (let xx = 0; xx <= size; xx += 32) ctx.lineTo(xx, gy + Math.sin(xx * 0.05 + p) * 2);
      }
      ctx.stroke();
    }
    // slat grooves in height map (louver look)
    hctx.strokeStyle = '#2c2c2c'; hctx.lineWidth = 3;
    hctx.beginPath();
    if (vertical) { hctx.moveTo(x, 0); hctx.lineTo(x, size); }
    else { hctx.moveTo(0, x); hctx.lineTo(size, x); }
    hctx.stroke();
    hctx.strokeStyle = '#dddddd'; hctx.lineWidth = 1.5;
    hctx.beginPath();
    if (vertical) { hctx.moveTo(x + 2, 0); hctx.lineTo(x + 2, size); }
    else { hctx.moveTo(0, x + 2); hctx.lineTo(size, x + 2); }
    hctx.stroke();
  }
  const normal = heightToNormal(h, 2.2);
  return { map: finalize(c), normalMap: finalize(normal) };
}

// ---- Ivy / green living wall (dense climbing foliage) ----------------------
export function ivyMaps() {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#24401c';
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(404);
  const h = makeCanvas(size);
  const hctx = h.getContext('2d');
  hctx.fillStyle = '#666'; hctx.fillRect(0, 0, size, size);
  // leaf clusters
  const greens = ['#2f5a22', '#3c7029', '#4a8a34', '#5aa03f', '#356326', '#264f1c', '#6fb04a'];
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size, y = rnd() * size;
    const r = 3 + rnd() * 8;
    ctx.fillStyle = greens[(rnd() * greens.length) | 0];
    ctx.globalAlpha = 0.55 + rnd() * 0.45;
    ctx.beginPath();
    // small leaf: a couple of overlapping ellipses
    ctx.ellipse(x, y, r, r * 0.6, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    const hv = 120 + rnd() * 120;
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.beginPath();
    hctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    hctx.fill();
  }
  ctx.globalAlpha = 1;
  const normal = heightToNormal(h, 3.0);
  return { map: finalize(c), normalMap: finalize(normal) };
}

// ---- Mowed lawn ------------------------------------------------------------
export function lawnMaps() {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(505);
  fbmFill(ctx, size, rnd, [70, 120, 45], 0.55);
  // blades speckle
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * size, y = rnd() * size;
    ctx.strokeStyle = `rgba(${40 + rnd() * 60},${90 + rnd() * 80},${25 + rnd() * 40},0.5)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 3); ctx.stroke();
  }
  // mowing stripes
  ctx.globalAlpha = 0.10;
  for (let i = 0; i < size; i += 32) {
    ctx.fillStyle = (i / 32) % 2 ? '#123' : '#dfe';
    ctx.fillRect(0, i, size, 16);
  }
  ctx.globalAlpha = 1;
  const t = finalize(c, [1, 1]);
  return { map: t };
}

// ---- Concrete / stone paving -----------------------------------------------
export function concreteMaps(tint) {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(606);
  fbmFill(ctx, size, rnd, tint || [175, 176, 172], 0.3);
  const h = makeCanvas(size);
  const hctx = h.getContext('2d');
  hctx.fillStyle = '#888'; hctx.fillRect(0, 0, size, size);
  // faint slab joints
  hctx.strokeStyle = '#444'; hctx.lineWidth = 3;
  for (const p of [0, size / 2, size]) {
    hctx.beginPath(); hctx.moveTo(p, 0); hctx.lineTo(p, size); hctx.stroke();
    hctx.beginPath(); hctx.moveTo(0, p); hctx.lineTo(size, p); hctx.stroke();
  }
  const normal = heightToNormal(h, 0.8);
  return { map: finalize(c), normalMap: finalize(normal) };
}

// ---- Gabion (stone cage) planter -------------------------------------------
export function gabionMaps() {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6d6a64';
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(707);
  const h = makeCanvas(size);
  const hctx = h.getContext('2d');
  hctx.fillStyle = '#555'; hctx.fillRect(0, 0, size, size);
  // packed stones
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size;
    const r = 8 + rnd() * 18;
    const g = 120 + rnd() * 90;
    ctx.fillStyle = `rgb(${g - 10},${g - 6},${g - 14})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.7 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    const hv = 150 + rnd() * 90;
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.beginPath(); hctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); hctx.fill();
  }
  // wire mesh grid
  ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 1.5;
  for (let i = 0; i <= size; i += size / 8) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  const normal = heightToNormal(h, 2.5);
  return { map: finalize(c), normalMap: finalize(normal) };
}

// ---- Perforated dark-metal balcony railing panel (with alpha holes) --------
export function perforatedRailingTexture() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#26282c';
  const step = 16, r = 5;
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      ctx.beginPath();
      // draw metal with a hole punched -> use even-odd by filling square then clearing circle
      ctx.fillRect(x - step / 2, y - step / 2, step, step);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ---- Interior "hint" behind glass (blurred warm room) ----------------------
export function interiorTexture() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  // floor
  ctx.fillStyle = '#b79a74'; ctx.fillRect(0, size * 0.62, size, size * 0.38);
  // back wall
  ctx.fillStyle = '#e8e4dc'; ctx.fillRect(0, 0, size, size * 0.62);
  // warm lamp glow
  const g = ctx.createRadialGradient(size * 0.72, size * 0.4, 5, size * 0.72, size * 0.4, 90);
  g.addColorStop(0, 'rgba(255,214,150,0.95)');
  g.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  // furniture silhouettes
  ctx.fillStyle = '#8a8580'; ctx.fillRect(size * 0.08, size * 0.5, size * 0.34, size * 0.2);
  ctx.fillStyle = '#5f5b56'; ctx.fillRect(size * 0.55, size * 0.46, size * 0.16, size * 0.24);
  ctx.fillStyle = 'rgba(60,80,60,0.7)'; ctx.fillRect(size * 0.8, size * 0.34, size * 0.1, size * 0.34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- Tree canopy billboard (soft round foliage with alpha) -----------------
export function foliageBillboard(tone) {
  const size = 128;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(808 + (tone || 0) * 13);
  const base = tone === 1 ? [70, 110, 50] : tone === 2 ? [110, 130, 60] : [60, 100, 45];
  for (let i = 0; i < 500; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.5) * size * 0.46;
    const x = size / 2 + Math.cos(a) * rr, y = size / 2 + Math.sin(a) * rr;
    const edge = rr / (size * 0.46);
    ctx.globalAlpha = (1 - edge) * 0.9;
    const v = 0.7 + rnd() * 0.5;
    ctx.fillStyle = `rgb(${base[0] * v | 0},${base[1] * v | 0},${base[2] * v | 0})`;
    ctx.beginPath(); ctx.arc(x, y, 3 + rnd() * 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
