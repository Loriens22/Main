// Additional procedural textures: more building facades (brick-striped towers, red-brick blocks,
// 1980s colour-panel blocks, industrial cladding, curtain walls, ceramic offices), graffiti,
// billboard posters, tram track bed. Fast canvas composition (shared grain layers, no per-pixel fbm).
import { makeCanvas, toTex, drawWindow, FONT, FONT_COND } from './textures.js';
import { makeRng, tnoise, tfbm } from './util.js';

let GRAIN = null, BLOTCH = null;
/** Shared tileable grain (fine) and blotch (coarse) layers, grey around 128. */
function layers() {
  if (GRAIN) return;
  const mk = (n, fn) => {
    const c = makeCanvas(n, n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = fn(x / n, y / n) * 255; const i = (y * n + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0); return c;
  };
  GRAIN = mk(256, (u, v) => 0.5 + (tnoise(u * 128, v * 128, 128, 7) - 0.5) * 0.7 + (tnoise(u * 256, v * 256, 256, 3) - 0.5) * 0.4);
  BLOTCH = mk(256, (u, v) => 0.5 + (tfbm(u, v, 4, 4, 21) - 0.5) * 0.9);
}
/** Multiplies grain/blotch over a region to break up flat colour. */
function weather(ctx, W, H, grain = 0.35, blotch = 0.25, streaks = 0) {
  layers();
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = grain; for (let y = 0; y < H; y += 256) for (let x = 0; x < W; x += 256) ctx.drawImage(GRAIN, x, y);
  ctx.globalAlpha = blotch; ctx.drawImage(BLOTCH, 0, 0, W, H);
  ctx.restore();
  if (streaks) {
    const rnd = makeRng(W + H);
    ctx.save();
    for (let k = 0; k < streaks; k++) {
      const x = rnd() * W, y = rnd() * H * 0.9, w = 2 + rnd() * 8, h = 30 + rnd() * 160;
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(40,34,28,0.22)'); g.addColorStop(1, 'rgba(40,34,28,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }
}
const pack = (c, rc) => ({ map: toTex(c), rough: toTex(rc, { srgb: false }) });
const roughBase = (W, H, v = 235) => { const rc = makeCanvas(W, H), rx = rc.getContext('2d'); rx.fillStyle = `rgb(0,${v},0)`; rx.fillRect(0, 0, W, H); return [rc, rx]; };
const glassMark = (rx, x, y, w, h) => { rx.fillStyle = 'rgb(0,18,0)'; rx.fillRect(x, y, w, h); };

function bricks(ctx, x0, y0, w, h, rnd, base = [150, 64, 44], bh = 7, bw = 22) {
  ctx.fillStyle = '#b9aea0'; ctx.fillRect(x0, y0, w, h);
  for (let y = 0, r = 0; y < h; y += bh, r++) for (let x = -(r % 2) * bw / 2; x < w; x += bw) {
    const k = 0.82 + rnd() * 0.3;
    ctx.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
    ctx.fillRect(x0 + Math.max(0, x) + 1, y0 + y + 1, Math.min(bw - 2, w - Math.max(0, x) - 1), bh - 2);
  }
}

/** Sofia 1980s block with red-brick pilasters between concrete window bays (Гоце Делчев, UniCredit block). 4 bays x 4 floors. */
export function brickStripeFacade({ seed = 3, px = 192 } = {}) {
  const rnd = makeRng(seed);
  const bays = 4, floors = 4, W = bays * px, H = floors * px;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const [rc, rx] = roughBase(W, H);
  ctx.fillStyle = '#8f8676'; ctx.fillRect(0, 0, W, H);
  for (let b = 0; b < bays; b++) {
    const x0 = b * px;
    // brick pilaster on the left third of every second bay
    if (b % 2 === 0) bricks(ctx, x0, 0, px * 0.34, H, rnd, [146, 70, 52]);
    for (let f = 0; f < floors; f++) {
      const y0 = f * px;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x0, y0 + px - 4, px, 4); // slab joint
      const ww = px * (b % 2 === 0 ? 0.5 : 0.62), wh = px * 0.5;
      const wx = x0 + (b % 2 === 0 ? px * 0.42 : px * 0.19), wy = y0 + px * 0.22;
      drawWindow(ctx, rnd, wx, wy, ww, wh, { frame: rnd() < 0.7 ? '#eeeeea' : '#6b4a2e', fw: 5, panes: 2 });
      glassMark(rx, wx, wy, ww, wh);
      if (rnd() < 0.25) { ctx.fillStyle = '#e9ebea'; ctx.fillRect(wx + ww + 4, wy + wh * 0.4, px * 0.12, px * 0.09); }
    }
  }
  weather(ctx, W, H, 0.45, 0.35, 70);
  return pack(c, rc);
}

/** Red-brick 1970s block with white concrete floor bands. 4 bays x 4 floors. */
export function redBrickFacade({ seed = 5, px = 192 } = {}) {
  const rnd = makeRng(seed);
  const bays = 4, floors = 4, W = bays * px, H = floors * px;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const [rc, rx] = roughBase(W, H);
  bricks(ctx, 0, 0, W, H, rnd, [168, 72, 50], 8, 24);
  for (let f = 0; f < floors; f++) {
    const y0 = f * px;
    ctx.fillStyle = '#e7e3dc'; ctx.fillRect(0, y0 + px * 0.84, W, px * 0.16);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, y0 + px * 0.84, W, 3);
    for (let b = 0; b < bays; b++) {
      const x0 = b * px, ww = px * 0.46, wh = px * 0.5, wx = x0 + (px - ww) / 2, wy = y0 + px * 0.24;
      drawWindow(ctx, rnd, wx, wy, ww, wh, { frame: '#f2f2ef', fw: 5, panes: 2 });
      glassMark(rx, wx, wy, ww, wh);
    }
  }
  weather(ctx, W, H, 0.3, 0.25, 40);
  return pack(c, rc);
}

/** Pale 1980s panel facade used by the colour-loggia blocks (bul. Bulgaria). 4 bays x 4 floors. */
export function paleBlockFacade({ seed = 9, px = 192, base = '#e2ddd3' } = {}) {
  const rnd = makeRng(seed);
  const bays = 4, floors = 4, W = bays * px, H = floors * px;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const [rc, rx] = roughBase(W, H);
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const x0 = b * px, y0 = f * px;
    ctx.fillStyle = 'rgba(60,55,50,0.28)'; ctx.fillRect(x0, y0 + px - 3, px, 3); ctx.fillRect(x0 + px - 3, y0, 3, px);
    const ww = px * (b === 1 ? 0.64 : 0.44), wh = px * 0.52, wx = x0 + (px - ww) / 2, wy = y0 + px * 0.22;
    drawWindow(ctx, rnd, wx, wy, ww, wh, { frame: rnd() < 0.8 ? '#f4f4f2' : '#71543a', fw: 5, panes: 2 });
    glassMark(rx, wx, wy, ww, wh);
    if (rnd() < 0.3) { ctx.fillStyle = '#f0f0ee'; ctx.fillRect(wx - px * 0.16, wy + wh * 0.45, px * 0.12, px * 0.09); ctx.fillStyle = '#b8bcbe'; ctx.fillRect(wx - px * 0.16, wy + wh * 0.45 + px * 0.09, px * 0.12, 2); }
  }
  weather(ctx, W, H, 0.35, 0.3, 60);
  return pack(c, rc);
}

/** Industrial / commercial sandwich-panel cladding with a strip window (2006 style). 2 bays x 2 "floors" (4.5 m). */
export function industrialFacade({ seed = 13, px = 256, panel = '#c9cdd0', stripe = '#2f5f9e' } = {}) {
  const rnd = makeRng(seed);
  const W = px * 2, H = px * 2;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const [rc, rx] = roughBase(W, H, 150);
  ctx.fillStyle = panel; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 22) { ctx.fillStyle = 'rgba(0,0,0,0.09)'; ctx.fillRect(0, y, W, 2); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, y + 2, W, 1); }
  for (let f = 0; f < 2; f++) {
    const y0 = f * px;
    ctx.fillStyle = stripe; ctx.fillRect(0, y0 + px * 0.08, W, px * 0.05);
    const wy = y0 + px * 0.3, wh = px * 0.34;
    for (let k = 0; k < 4; k++) {
      const wx = k * (W / 4) + 6, ww = W / 4 - 12;
      ctx.fillStyle = '#3d4247'; ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      const g = ctx.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh); g.addColorStop(0, '#9fb3c2'); g.addColorStop(0.6, '#35434f'); g.addColorStop(1, '#222a31');
      ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
      if (rnd() < 0.5) { ctx.fillStyle = 'rgba(230,230,220,0.6)'; ctx.fillRect(wx, wy, ww, wh * 0.35); }
      glassMark(rx, wx, wy, ww, wh);
    }
  }
  weather(ctx, W, H, 0.25, 0.2, 30);
  return pack(c, rc);
}

/** Glass curtain wall: mullion grid, spandrels, sky reflection, office interiors. */
export function curtainWall({ seed = 17, px = 128, cols = 8, rows = 8, glass = ['#9cb8d4', '#2d4a66'], mullion = '#c7ccd1', spandrel = null, lit = 0.25 } = {}) {
  const rnd = makeRng(seed);
  const W = cols * px, H = rows * px;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const [rc, rx] = roughBase(W, H, 40);
  // big-scale sky reflection
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, glass[0]); g.addColorStop(0.55, glass[1]); g.addColorStop(1, glass[0]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = k * px, y = r * px;
    const sh = rnd();
    ctx.fillStyle = `rgba(${sh < 0.5 ? '255,255,255' : '0,10,25'},${0.04 + rnd() * 0.12})`; ctx.fillRect(x, y, px, px);
    if (rnd() < lit) { ctx.fillStyle = 'rgba(235,238,225,0.22)'; ctx.fillRect(x + 6, y + px * 0.1, px - 12, px * 0.08); ctx.fillStyle = 'rgba(40,40,40,0.3)'; ctx.fillRect(x + 8, y + px * 0.55, px - 16, px * 0.25); }
    if (spandrel) { ctx.fillStyle = spandrel; ctx.fillRect(x, y + px * 0.78, px, px * 0.22); }
  }
  ctx.fillStyle = mullion;
  for (let k = 0; k <= cols; k++) ctx.fillRect(k * px - 3, 0, 6, H);
  for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * px - 4, W, 8);
  rx.fillStyle = 'rgb(0,160,0)';
  for (let k = 0; k <= cols; k++) rx.fillRect(k * px - 3, 0, 6, H);
  for (let r = 0; r <= rows; r++) rx.fillRect(0, r * px - 4, W, 8);
  return pack(c, rc);
}

/** Brown ceramic-panel office facade with deep window bands (2023 bul. Bulgaria offices). 3 bays x 4 floors. */
export function ceramicFacade({ seed = 23, px = 192, panel = '#9a6a4a' } = {}) {
  const rnd = makeRng(seed);
  const bays = 3, floors = 4, W = bays * px, H = floors * px;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const [rc, rx] = roughBase(W, H, 120);
  ctx.fillStyle = panel; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += px / 4) { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, y, W, 2); }
  for (let x = 0; x < W; x += px / 2) { ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(x, 0, 2, H); }
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const x0 = b * px, y0 = f * px;
    const ww = px * 0.7, wh = px * 0.6, wx = x0 + (px - ww) / 2, wy = y0 + px * 0.2;
    ctx.fillStyle = '#2a2a2c'; ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
    const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh); g.addColorStop(0, '#a8bccb'); g.addColorStop(0.5, '#3d4d5a'); g.addColorStop(1, '#6f8698');
    ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = '#2a2a2c'; ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    if (rnd() < 0.3) { ctx.fillStyle = 'rgba(240,240,230,0.25)'; ctx.fillRect(wx, wy, ww, wh * 0.2); }
    glassMark(rx, wx, wy, ww, wh);
  }
  weather(ctx, W, H, 0.3, 0.15, 0);
  return pack(c, rc);
}

/** White render + dark frames, modern residential (Манастирски ливади, 2023 blocks). 3 bays x 4 floors. */
export function whiteModernFacade({ seed = 29, px = 192, base = '#eeebe4', frame = '#3a3c40', wood = false } = {}) {
  const rnd = makeRng(seed);
  const bays = 3, floors = 4, W = bays * px, H = floors * px;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const [rc, rx] = roughBase(W, H, 210);
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const x0 = b * px, y0 = f * px;
    if (wood && b === 2) { ctx.fillStyle = '#8a5a36'; ctx.fillRect(x0 + px * 0.05, y0, px * 0.9, px); for (let x = x0 + 8; x < x0 + px; x += 10) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x, y0, 2, px); } }
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(x0, y0 + px - 4, px, 4);
    const tall = b !== 1;
    const ww = px * (tall ? 0.42 : 0.6), wh = px * (tall ? 0.72 : 0.5), wx = x0 + (px - ww) / 2, wy = y0 + px * (tall ? 0.18 : 0.26);
    drawWindow(ctx, rnd, wx, wy, ww, wh, { frame, fw: 5, panes: tall ? 1 : 2, sill: false });
    glassMark(rx, wx, wy, ww, wh);
  }
  weather(ctx, W, H, 0.2, 0.15, 20);
  return pack(c, rc);
}

/** Concrete wall with graffiti (underpasses, retaining walls, kiosks). */
export function graffitiWall({ seed = 31, w = 1024, h = 256, base = '#b7b2a8' } = {}) {
  const rnd = makeRng(seed);
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  // panel joints
  for (let x = 0; x < w; x += 128) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, 0, 3, h); }
  weather(ctx, w, h, 0.5, 0.4, 25);
  const cols = ['#e84a8a', '#4ab0e8', '#f2d13a', '#7ad04a', '#b05ad8', '#f07a2a', '#ffffff', '#222222', '#e8e8e8', '#35c0b0'];
  const words = ['FLVO', 'SRK', 'KISS', 'GBR', 'ELVE', 'SOFIA', 'ZEBRA', 'OKS', 'DUB', 'MAKE', 'NUK', 'BOYS', 'FUNK', 'ЛЕВСКИ', 'CSKA', 'SEIN', 'RAW', 'TRAM'];
  const n = Math.round(w / 170);
  for (let k = 0; k < n; k++) {
    const x = (k + rnd() * 0.3) * (w / n), y = h * (0.35 + rnd() * 0.45);
    const t = words[Math.floor(rnd() * words.length)];
    const size = h * (0.28 + rnd() * 0.28);
    ctx.save(); ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.25); ctx.scale(1 + rnd() * 0.4, 1);
    ctx.font = `900 ${size}px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const fill = cols[Math.floor(rnd() * cols.length)], out = cols[Math.floor(rnd() * cols.length)];
    ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#111'; ctx.strokeText(t, 0, 0);
    ctx.lineWidth = size * 0.08; ctx.strokeStyle = out; ctx.strokeText(t, 0, 0);
    ctx.fillStyle = fill; ctx.fillText(t, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(size * 0.1, -size * 0.25, size * 0.12, size * 0.06);
    ctx.restore();
    // quick black tags
    if (rnd() < 0.6) { ctx.save(); ctx.translate(x + rnd() * 120, h * (0.15 + rnd() * 0.2)); ctx.rotate(-0.1); ctx.font = `italic 700 ${h * 0.12}px ${FONT_COND}`; ctx.fillStyle = '#1b1b1b'; ctx.fillText(words[Math.floor(rnd() * words.length)].toLowerCase(), 0, 0); ctx.restore(); }
  }
  // grime at the bottom
  const g = ctx.createLinearGradient(0, h * 0.75, 0, h); g.addColorStop(0, 'rgba(50,45,38,0)'); g.addColorStop(1, 'rgba(50,45,38,0.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  return toTex(c);
}

/** Billboard posters (6 x 3 m) — invented ads in the style of the reference photos. */
export function billboardPoster(kind = 0) {
  const w = 1024, h = 512;
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const txt = (s, x, y, size, col, weight = 900, align = 'left', font = FONT) => { ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(s, x, y); };
  const grad = (a, b) => { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
  switch (kind % 6) {
    case 0: // summer ice cream
      grad('#3aa7e6', '#1b5fae');
      ctx.fillStyle = '#f7e2b4'; ctx.fillRect(0, h * 0.72, w, h * 0.28);
      for (const [x, col] of [[560, '#f3eadf'], [720, '#6b3b22'], [880, '#e9435a']]) { ctx.fillStyle = '#d9a35c'; ctx.beginPath(); ctx.moveTo(x - 50, 250); ctx.lineTo(x + 50, 250); ctx.lineTo(x, 470); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, 230, 62, 0, 7); ctx.fill(); }
      txt('ЗАЕДНО Е', 60, 110, 84, '#fff'); txt('ПО-ЛЯТНО', 60, 200, 84, '#ffd23a');
      ctx.fillStyle = '#da291c'; ctx.fillRect(60, 300, 90, 90); txt('M', 105, 347, 80, '#ffc72c', 900, 'center');
      break;
    case 1: // chocolate ice cream bar
      grad('#2a1a12', '#6a4228');
      ctx.fillStyle = '#5b3420'; ctx.beginPath(); ctx.ellipse(700, 280, 230, 80, -0.35, 0, 7); ctx.fill();
      ctx.fillStyle = '#c99656'; ctx.fillRect(470, 330, 90, 20);
      txt('ИЗБЕРИ СВОЕТО', 50, 120, 50, '#f4e3c3', 700); txt('ПРИКЛЮЧЕНИЕ', 50, 180, 50, '#f4e3c3', 700);
      txt('Nuii', 60, 400, 120, '#f0c86a', 900, 'left', 'Georgia, serif');
      break;
    case 2: // cosmetics
      grad('#f3d9cf', '#e7b7a6');
      ctx.fillStyle = '#c98d74'; ctx.beginPath(); ctx.ellipse(760, 260, 160, 210, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6b3b2a'; ctx.beginPath(); ctx.ellipse(760, 170, 175, 130, 0, Math.PI, 0); ctx.fill();
      txt('НОВАТА', 60, 150, 70, '#222', 300); txt('КОЛЕКЦИЯ', 60, 240, 70, '#222', 800);
      ctx.fillStyle = '#111'; ctx.fillRect(60, 380, 360, 60); txt('BEAUTY', 240, 411, 46, '#fff', 700, 'center');
      break;
    case 3: // telecom
      grad('#0a2a6b', '#0e7fd1');
      for (let k = 0; k < 6; k++) { ctx.strokeStyle = `rgba(255,255,255,${0.1 + k * 0.05})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(800, 260, 60 + k * 45, -1, 1); ctx.stroke(); }
      txt('5G ВЪВ ВСЕКИ', 60, 150, 72, '#fff'); txt('КВАРТАЛ', 60, 240, 72, '#7fd7ff');
      txt('от 19,99 лв.', 60, 380, 56, '#ffd23a', 800);
      break;
    case 4: // real estate
      grad('#e9e4da', '#c9c2b5');
      ctx.fillStyle = '#7a8a96'; ctx.fillRect(560, 60, 180, 380); ctx.fillStyle = '#9fb3c2'; for (let y = 80; y < 430; y += 34) for (let x = 575; x < 730; x += 38) ctx.fillRect(x, y, 26, 22);
      ctx.fillStyle = '#5c6770'; ctx.fillRect(760, 140, 160, 300);
      txt('НОВО', 50, 120, 90, '#1d3f5e'); txt('СТРОИТЕЛСТВО', 50, 210, 58, '#1d3f5e', 800);
      txt('Акт 16 · 2025', 50, 330, 44, '#b3452a', 700);
      break;
    default: // news portal
      grad('#ffffff', '#e6e6e6');
      ctx.fillStyle = '#c4161c'; ctx.fillRect(0, 0, w, 90); txt('НОВИНИТЕ', 40, 45, 56, '#fff');
      txt('tribune.bg', w / 2, 280, 120, '#222', 400, 'center', 'Georgia, serif');
      txt('Всеки ден. Навсякъде.', w / 2, 400, 44, '#555', 600, 'center');
  }
  return toTex(c, { repeat: false });
}

/** Ballast (crushed stone) for tram track beds. */
export function ballast(size = 512) {
  const rnd = makeRng(41);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#8d8a84'; ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 5200; k++) {
    const x = rnd() * size, y = rnd() * size, r = 2 + rnd() * 5;
    const l = 45 + rnd() * 40;
    ctx.fillStyle = `hsl(${30 + rnd() * 20},${4 + rnd() * 8}%,${l}%)`;
    ctx.beginPath();
    for (let a = 0; a < 6; a++) { const rr = r * (0.7 + rnd() * 0.5), an = (a / 6) * Math.PI * 2; if (a === 0) ctx.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); else ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - r * 0.6, y + r * 0.5, r * 1.2, 1.2);
  }
  // rust staining
  ctx.globalCompositeOperation = 'multiply';
  for (let k = 0; k < 30; k++) { ctx.fillStyle = `rgba(150,${90 + rnd() * 30},60,0.15)`; ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, 20 + rnd() * 60, 0, 7); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
  return toTex(c);
}
