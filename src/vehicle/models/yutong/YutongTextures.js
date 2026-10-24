// Procedural canvas textures of the Yutong ZK6126HGA (nothing is traced from the photographs):
// white leaf ornaments of the Sofia livery, decal sheet (coat of arms, pictograms, rear lettering, slot grids),
// registration plate, lamp lenses, louvre panels. All textures are 1024 px or smaller.
import * as THREE from 'three';
import { mulberry32 } from '../../../core/rng.js';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function tex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Atlas rectangle in canvas pixels -> [u0, v0, u1, v1] (v up, matching flipY canvas textures). */
export const rectUV = (W, H, x, y, w, h) => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

const rr = (g, x, y, w, h, r) => {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
};

/* ------------------------------------------------------------------ leaf ornaments */
/** Pointed lens-shaped leaf outline from (0, 0) to (0, len), width `wid`, drawn in the current stroke style. */
function leaf(g, len, wid, rib = false) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid * 0.95, len * 0.18, wid * 0.7, len * 0.72, 0, len);
  g.bezierCurveTo(-wid * 0.7, len * 0.72, -wid * 0.95, len * 0.18, 0, 0);
  g.closePath();
  g.stroke();
  if (rib) {
    g.save();
    g.lineWidth *= 0.55;
    g.beginPath(); g.moveTo(0, len * 0.08); g.quadraticCurveTo(wid * 0.05, len * 0.5, 0, len * 0.86); g.stroke();
    g.restore();
  }
}

/** A curved stem (quadratic) with leaves hanging on alternate sides. */
function branch(g, rnd, x0, y0, x1, y1, bend, n, size, w) {
  const cx = (x0 + x1) / 2 + bend, cy = (y0 + y1) / 2 - Math.abs(bend) * 0.3;
  g.lineWidth = w;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.7) / (n + 0.4);
    const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    const tx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx), ty = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
    const ang = Math.atan2(ty, tx); // along the stem
    const side = i % 2 ? 1 : -1;
    g.save();
    g.translate(px, py);
    g.rotate(ang + side * (0.75 + rnd() * 0.5) - Math.PI / 2);
    g.lineWidth = w * 0.85;
    leaf(g, size * (0.75 + rnd() * 0.5), size * (0.26 + rnd() * 0.08));
    g.restore();
  }
}

/**
 * White ornament atlas (alpha): 4 rows of 1024 x 256 px; each row is a band 1.9 m x 0.475 m (540 px per metre)
 * that hangs from the belt line. Row 0: a row of big leaves; row 1: vine with paired leaves; row 2: curling branches;
 * row 3: sparse falling leaves.
 */
export const ORN = { w: 1.9, h: 0.475, rows: 4 };
let ornAtlas = null;
export function makeOrnamentAtlas() {
  if (ornAtlas) return ornAtlas;
  const W = 1024, H = 1024, RH = 256;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const rnd = mulberry32(64);
  const row = (i, fn) => {
    g.save();
    g.translate(0, i * RH);
    g.beginPath(); g.rect(0, 0, W, RH); g.clip();
    fn();
    g.restore();
  };
  // row 0: large leaves hanging from the belt line (lean alternately), a few small ones between them
  row(0, () => {
    for (let x = 30; x < W - 10; x += 95 + rnd() * 20) {
      g.save();
      g.translate(x, -8);
      g.rotate((rnd() - 0.5) * 0.9);
      g.lineWidth = 16;
      leaf(g, 150 + rnd() * 70, 52 + rnd() * 16);
      g.restore();
      if (rnd() < 0.45) {
        g.save();
        g.translate(x + 48, 4);
        g.rotate(0.4 + rnd() * 0.5);
        g.lineWidth = 14;
        leaf(g, 70 + rnd() * 30, 26);
        g.restore();
      }
    }
  });
  // row 1: sinuous vine along the top with paired leaves, ends with a small leaf cluster
  row(1, () => {
    branch(g, rnd, -20, 14, W + 20, 26, 40, 11, 92, 16);
    branch(g, rnd, 380, 20, 760, 150, -30, 4, 78, 14);
    branch(g, rnd, 80, 18, 250, 130, 25, 3, 70, 14);
  });
  // row 2: curling branches reaching down in three groups
  row(2, () => {
    branch(g, rnd, 20, 6, 120, 210, 30, 5, 80, 16);
    branch(g, rnd, 330, 6, 440, 190, -25, 4, 78, 16);
    branch(g, rnd, 440, 8, 700, 40, 30, 6, 85, 16);
    branch(g, rnd, 700, 30, 820, 200, 20, 4, 80, 16);
    branch(g, rnd, 820, 6, 1000, 90, -30, 4, 80, 16);
  });
  // row 3: sparse falling leaves of different size
  row(3, () => {
    for (let x = 50; x < W - 40; x += 150 + rnd() * 90) {
      g.save();
      g.translate(x, 10 + rnd() * 70);
      g.rotate((rnd() - 0.5) * 1.3);
      g.lineWidth = 16;
      leaf(g, 90 + rnd() * 90, 34 + rnd() * 22, rnd() < 0.5);
      g.restore();
    }
    branch(g, rnd, 420, -6, 620, 70, 20, 3, 70, 14);
  });
  const t = tex(c, { aniso: 8 });
  t.userData.shared = false;
  ornAtlas = {
    texture: t,
    /** uv rectangle of ornament row i, with the horizontal range u0..u1 in 0..1 (u0 > u1 mirrors the sprite) */
    uv: (i, u0 = 0, u1 = 1) => [u0, 1 - ((i + 1) * RH) / H, u1, 1 - (i * RH) / H],
  };
  return ornAtlas;
}
export function resetOrnamentAtlas() { ornAtlas = null; }

/* ------------------------------------------------------------------ decal sheet */
/** Rectangles (px from the top left) on the decal sheet. Metres in comments = printed size on the bus. */
export const DEC = {
  arms: [0, 0, 280, 360], // Sofia coat of arms, 0.42 x 0.54 m
  wheel: [290, 0, 120, 120], // blue wheelchair disc 0.12 m
  pram: [420, 0, 120, 120],
  walk: [550, 0, 120, 120],
  badge: [680, 0, 160, 160], // Yutong roundel 0.15 m
  euro6: [290, 130, 260, 60], // 'EURO 6' silver lettering 0.20 x 0.045 m
  model: [290, 200, 420, 60], // 'ZK6126HGA' 0.33 x 0.047 m
  brand: [290, 270, 330, 60], // 'YUTONG' 0.26 x 0.047 m
  slots: [0, 380, 600, 300], // rear lower slot grid, 1.05 x 0.5 m
  dots: [620, 270, 100, 20], // small dotted row under the pictograms
  doorNote: [0, 700, 300, 150], // red notice on the front door glass 0.12 x 0.06 m
  fleet: [320, 700, 380, 150], // fleet number, black heavy digits
  emergency: [0, 870, 400, 110], // small white 'emergency exit' label
  sticker: [720, 700, 120, 250], // pram + wheelchair stickers stacked, 0.08 x 0.17 m
};
const DW = 1024, DH = 1024;
export const decUV = (name) => rectUV(DW, DH, ...DEC[name]);

function disc(g, cx, cy, r, col) {
  g.fillStyle = col;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = r * 0.07;
  g.beginPath(); g.arc(cx, cy, r * 0.88, 0, Math.PI * 2); g.stroke();
}

function pictogram(g, kind, cx, cy, r) {
  disc(g, cx, cy, r, '#1a5fb4');
  g.save();
  g.translate(cx, cy);
  g.scale(r / 50, r / 50);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 6;
  if (kind === 'wheel') {
    g.beginPath(); g.arc(-3, 14, 17, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(-2, -30, 6.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-4, -20); g.lineTo(-4, 2); g.lineTo(16, 2); g.lineTo(24, 24); g.stroke();
  } else if (kind === 'walk') {
    g.beginPath(); g.arc(0, -31, 6.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(0, -22); g.lineTo(-1, 6); g.lineTo(-11, 32); g.moveTo(-1, 6); g.lineTo(10, 32);
    g.moveTo(-13, -4); g.lineTo(0, -17); g.lineTo(13, -4); g.stroke();
  } else {
    g.beginPath(); g.moveTo(-24, -4); g.quadraticCurveTo(-22, 16, 0, 16); g.lineTo(20, 16); g.lineTo(22, -6); g.closePath(); g.fill();
    g.beginPath(); g.arc(-10, 28, 6, 0, Math.PI * 2); g.arc(14, 28, 6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(22, -6); g.lineTo(28, -26); g.stroke();
    g.beginPath(); g.arc(-8, -10, 14, Math.PI, Math.PI * 1.5); g.stroke();
  }
  g.restore();
}

/** Sofia coat of arms (simplified heraldry: mural crown, quartered shield, laurel branches, ribbon). */
function drawArms(g, x, y, w, h) {
  g.save();
  g.translate(x, y);
  g.scale(w / 280, h / 360);
  // laurel branches
  g.fillStyle = '#3b8a3a';
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      g.save();
      g.translate(140 + s * (86 - i * 3), 105 + i * 24);
      g.rotate(s * (0.5 + i * 0.12));
      g.beginPath(); g.ellipse(0, 0, 9, 24, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  // mural crown
  g.fillStyle = '#d8dadd';
  g.strokeStyle = '#6e7378';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(70, 90); g.lineTo(70, 48); g.lineTo(92, 48); g.lineTo(92, 36); g.lineTo(112, 36); g.lineTo(112, 20); g.lineTo(168, 20); g.lineTo(168, 36); g.lineTo(188, 36); g.lineTo(188, 48); g.lineTo(210, 48); g.lineTo(210, 90); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#9ea3a8';
  for (let i = 0; i < 5; i++) g.fillRect(84 + i * 28, 56, 12, 24);
  // shield
  g.beginPath();
  g.moveTo(66, 100); g.lineTo(214, 100); g.lineTo(214, 190); g.quadraticCurveTo(214, 262, 140, 290); g.quadraticCurveTo(66, 262, 66, 190); g.closePath();
  g.save();
  g.clip();
  g.fillStyle = '#d3302b'; g.fillRect(60, 95, 80, 90);
  g.fillStyle = '#f2c230'; g.fillRect(140, 95, 80, 90);
  g.fillStyle = '#2f9a4a'; g.fillRect(60, 185, 80, 120);
  g.fillStyle = '#2b6cc4'; g.fillRect(140, 185, 80, 120);
  g.fillStyle = '#6a3d8f'; g.beginPath(); g.arc(140, 185, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f5f0e6'; g.fillRect(104, 128, 30, 40); g.fillRect(148, 126, 32, 36);
  g.fillStyle = '#8a5a2b'; g.fillRect(156, 132, 18, 24);
  g.fillStyle = '#e8e8e8'; g.beginPath(); g.moveTo(160, 255); g.lineTo(190, 205); g.lineTo(206, 255); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = '#b9bdc2'; g.lineWidth = 7; g.stroke();
  // ribbon
  g.fillStyle = '#e9ecef';
  g.beginPath(); g.moveTo(40, 292); g.quadraticCurveTo(140, 336, 240, 292); g.lineTo(240, 312); g.quadraticCurveTo(140, 358, 40, 312); g.closePath(); g.fill();
  g.strokeStyle = '#6e7378'; g.lineWidth = 2; g.stroke();
  g.restore();
}

function silverText(g, text, x, y, w, h, font) {
  g.save();
  g.font = font;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const tw = g.measureText(text).width;
  g.translate(x, y + h / 2);
  g.scale(Math.min(1.3, (w - 8) / tw), 1);
  g.lineJoin = 'round';
  g.strokeStyle = '#4b4f54';
  g.lineWidth = 6;
  g.strokeText(text, 4, 0);
  const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
  gr.addColorStop(0, '#f4f6f8'); gr.addColorStop(0.5, '#b9bec3'); gr.addColorStop(1, '#e8ebee');
  g.fillStyle = gr;
  g.fillText(text, 4, 0);
  g.restore();
}

export function makeDecalSheet(fleet = '1501') {
  const [c, g] = canvas(DW, DH);
  g.clearRect(0, 0, DW, DH);
  const R = (n) => DEC[n];
  { const [x, y, w, h] = R('arms'); drawArms(g, x, y, w, h); }
  for (const k of ['wheel', 'pram', 'walk']) { const [x, y, w, h] = R(k); pictogram(g, k, x + w / 2, y + h / 2, w / 2 - 4); }
  { // Yutong roundel: dark disc with three silver arcs
    const [x, y, w, h] = R('badge');
    const cx = x + w / 2, cy = y + h / 2;
    const gr = g.createRadialGradient(cx - 20, cy - 20, 6, cx, cy, w / 2);
    gr.addColorStop(0, '#5a5f66'); gr.addColorStop(1, '#14161a');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, w / 2 - 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c7ccd1'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, w / 2 - 6, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 8; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx, cy + 22, 22 + i * 17, Math.PI * 1.17, Math.PI * 1.83); g.stroke(); }
  }
  { const [x, y, w, h] = R('euro6'); silverText(g, 'EURO 6', x, y, w, h, 'bold 52px "Arial Narrow", Arial'); }
  { const [x, y, w, h] = R('model'); silverText(g, 'ZK6126HGA', x, y, w, h, 'bold 52px "Arial Narrow", Arial'); }
  { const [x, y, w, h] = R('brand'); silverText(g, 'YUTONG', x, y, w, h, 'bold 54px Arial'); }
  { // rear slot grid: rows of dark slots
    const [x, y, w, h] = R('slots');
    g.fillStyle = '#0b0c0d';
    const cols = 11, rows = 6, cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) g.fillRect(x + q * cw + cw * 0.1, y + r * rh + rh * 0.3, cw * 0.8, rh * 0.38);
  }
  { // dots
    const [x, y, w, h] = R('dots');
    g.fillStyle = '#1a5fb4';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + 10 + i * 20, y + h / 2, 5, 0, Math.PI * 2); g.fill(); }
  }
  { // red notice on the door glass (Bulgarian / English)
    const [x, y, w, h] = R('doorNote');
    g.fillStyle = '#e8321e';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 40px "Arial Narrow", Arial';
    g.fillText('ВНИМАНИЕ', x + w / 2, y + 26, w - 10);
    g.font = '30px "Arial Narrow", Arial';
    g.fillText('ЗАТВАРЯНЕ НА ВРАТИТЕ', x + w / 2, y + 68, w - 10);
    g.fillText('DOORS CLOSING', x + w / 2, y + 108, w - 10);
  }
  { // fleet number
    const [x, y, w, h] = R('fleet');
    g.fillStyle = '#0b0b0b';
    g.font = 'bold 150px "DIN Alternate", "Arial Narrow", "Liberation Sans Narrow", Arial';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const tw = g.measureText(fleet).width;
    g.save();
    g.translate(x, y + h / 2);
    g.scale((w - 6) / tw, 1);
    g.fillText(fleet, 0, 0);
    g.restore();
  }
  { // 'emergency exit' label
    const [x, y, w, h] = R('emergency');
    g.fillStyle = '#f4f4f0'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#c0392b'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle = '#c0392b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 36px "Arial Narrow", Arial';
    g.fillText('АВАРИЕН ИЗХОД', x + w / 2, y + 36, w - 20);
    g.fillText('EMERGENCY EXIT', x + w / 2, y + 76, w - 20);
  }
  { // blue stickers: pram over wheelchair
    const [x, y, w, h] = R('sticker');
    pictogram(g, 'pram', x + w / 2, y + 60, 54);
    pictogram(g, 'wheel', x + w / 2, y + 185, 54);
  }
  return tex(c, { aniso: 8 });
}

/* ------------------------------------------------------------------ plate */
/** Bulgarian plate 0.52 x 0.112 m with the EU band, on a 0.54 x 0.15 m holder. */
export function makePlate(text = 'СВ 1234 НВ') {
  const [c, g] = canvas(1024, 284);
  g.fillStyle = '#101112';
  g.fillRect(0, 0, 1024, 284);
  rr(g, 14, 20, 996, 214, 12); g.fillStyle = '#f7f7f2'; g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 5; g.stroke();
  g.save();
  rr(g, 14, 20, 108, 214, 12); g.clip();
  g.fillStyle = '#1b3f9c'; g.fillRect(14, 20, 108, 214);
  g.restore();
  g.fillStyle = '#ffd400';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(68 + Math.cos(a) * 33, 78 + Math.sin(a) * 33, 5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#fff'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText('BG', 68, 214);
  g.save();
  g.fillStyle = '#0c0c0c';
  g.font = 'bold 180px "DIN Alternate", "Arial Narrow", "Liberation Sans Narrow", Arial';
  const w = g.measureText(text).width;
  g.translate(570, 195);
  g.scale(Math.min(0.9, 840 / w), 1);
  g.textAlign = 'center';
  g.fillText(text, 0, 0);
  g.restore();
  g.fillStyle = '#9a9ea2'; g.font = '26px Arial'; g.textAlign = 'center';
  g.fillText('YUTONG · СОФИЯ', 512, 268);
  return tex(c, { aniso: 8 });
}

/* ------------------------------------------------------------------ lamps */
/** Front lamp unit 0.40 x 0.13 m for the bus RIGHT side (outer cell at the left of the picture): [colour, emissive]. */
export function makeHeadlampTex() {
  const W = 512, H = 168;
  const mk = (emi) => {
    const [c, g] = canvas(W, H);
    g.fillStyle = emi ? '#000' : '#cfd5da';
    g.fillRect(0, 0, W, H);
    if (!emi) {
      const lg = g.createLinearGradient(0, 0, W, H);
      lg.addColorStop(0, '#eef2f5'); lg.addColorStop(1, '#a9b3ba');
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
      g.fillStyle = '#2f3236'; g.fillRect(0, H - 22, W, 22); // lower indicator strip housing
    }
    // two round reflectors (low / high beam) in the outer part
    for (const cx of [86, 206]) {
      const cy = 68;
      const rg = g.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, 52);
      if (emi) { rg.addColorStop(0, '#fff'); rg.addColorStop(0.6, '#b8b0a0'); rg.addColorStop(1, '#1a1612'); }
      else { rg.addColorStop(0, '#f6f8f9'); rg.addColorStop(0.4, '#a7adb2'); rg.addColorStop(0.8, '#5f656b'); rg.addColorStop(1, '#2a2d31'); }
      g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 52, 0, Math.PI * 2); g.fill();
      g.fillStyle = emi ? '#fff' : '#fff7dc'; g.beginPath(); g.arc(cx + 4, cy - 2, 17, 0, Math.PI * 2); g.fill();
    }
    // LED daytime strip in the inner part
    g.fillStyle = emi ? '#fff' : '#dfe6ea';
    rr(g, 290, 40, 200, 26, 8); g.fill();
    g.fillStyle = emi ? 'rgba(255,255,255,0.6)' : '#9aa3a9';
    for (let i = 0; i < 6; i++) g.fillRect(300 + i * 31, 46, 22, 14);
    // chrome bezel line
    g.strokeStyle = emi ? 'rgba(0,0,0,0)' : '#7c838a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(272, 8); g.lineTo(272, H - 24); g.stroke();
    return tex(c, { aniso: 8 });
  };
  return [mk(false), mk(true)];
}

/** Dark louvre panel (rear engine hatch / radiator intake): charcoal base with columns of black slots. 1024 x 512 = 1.2 x 0.6 m. */
export function makeLouvrePanel() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#202326';
  g.fillRect(0, 0, 512, 512);
  const grd = g.createLinearGradient(0, 0, 512, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0.05)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#040505';
  const cols = [64, 104, 224, 264]; // two groups of two slot columns
  for (const x of cols) for (let y = 40; y < 440; y += 26) g.fillRect(x * 1.3 + 12, y, 62, 11);
  return tex(c, { aniso: 4 });
}

/** Dark mesh: black perforated panel used for the roof pod vents (repeat texture). */
export function makeVent() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#2a2d30';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#0a0b0c';
  for (let y = 6; y < 128; y += 16) g.fillRect(8, y, 112, 7);
  return tex(c, { repeat: true, aniso: 4 });
}
