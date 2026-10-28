// Procedural textures of the bus interior: speckled rubber floor, side-duct panels (pictograms + slot
// grilles), ceiling panels, seat moquette, priority-seat sticker, decal sheet (cab notices, pictograms,
// MAN lettering), ribbed turntable plate. Evidence and colours: data/research/bus/interior/interior_spec.md.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Speckled grey rubber floor: base, ~12 % light flecks, ~5 % black flecks. 512 px = 0.5 m (repeat 2 per metre). */
export function makeFloor() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#6c6d6e'; // neutral mid grey (photos 4, 5); was blue-grey
  g.fillRect(0, 0, 512, 512);
  const r = mulberry32(17);
  const fleck = (n, col, smin, smax) => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = r() * 512, y = r() * 512, s = smin + r() * (smax - smin);
      for (const ox of [0, x > 480 ? -512 : 0]) for (const oy of [0, y > 480 ? -512 : 0]) g.fillRect(x + ox, y + oy, s, s * (0.6 + r() * 0.8));
    }
  };
  fleck(2600, 'rgba(126,127,128,0.55)', 1, 3);
  fleck(5200, '#c6c7c8', 1, 3);
  fleck(2300, '#2c2f33', 1, 3);
  return tex(c, { repeat: true });
}

/** Strip of seat-rail: not used for yellow (plain colour material), kept for the rubber podium sides. */

/** Standing passenger pictogram (white figure, slightly leaning, arms down and out) in a blue disc. */
function passengerDisc(g, cx, cy, R, flip = 1) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = '#123a8a';
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  g.scale(flip, 1);
  g.rotate(0.22);
  g.strokeStyle = '#f4f6f8';
  g.fillStyle = '#f4f6f8';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath(); g.arc(0, -R * 0.56, R * 0.15, 0, Math.PI * 2); g.fill();
  g.lineWidth = R * 0.2;
  g.beginPath(); g.moveTo(0, -R * 0.36); g.lineTo(0, R * 0.12); g.stroke(); // torso
  g.lineWidth = R * 0.13;
  g.beginPath(); g.moveTo(-R * 0.34, R * 0.2); g.lineTo(-R * 0.14, -R * 0.3); g.lineTo(R * 0.14, -R * 0.3); g.lineTo(R * 0.34, R * 0.2); g.stroke(); // shoulders + arms
  g.beginPath(); g.moveTo(-R * 0.02, R * 0.1); g.lineTo(-R * 0.16, R * 0.66); g.moveTo(R * 0.02, R * 0.1); g.lineTo(R * 0.16, R * 0.66); g.stroke(); // legs
  g.restore();
}

/**
 * Side duct tile: 1024 x 288 px = 2.0 m along the bus (u) x 0.56 m across the slope (v).
 * First metre: pictogram panel (two pairs of blue discs); second metre: slot grille panel.
 * v = 1 is the wall (window) edge, v = 0 the ceiling edge.
 */
export function makeDuct() {
  const W = 1024, H = 288;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#d4d3cb';
  g.fillRect(0, 0, W, H);
  // panel seams
  g.strokeStyle = '#b4b2aa';
  g.lineWidth = 1.5;
  for (const x of [2, 512]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  g.beginPath(); g.moveTo(0, 3); g.lineTo(W, 3); g.stroke();
  // pictogram pairs (blue discs 0.11 m ~ 56 px, overlapping)
  passengerDisc(g, 130, 112, 30, 1);
  passengerDisc(g, 172, 142, 30, -1);
  passengerDisc(g, 330, 112, 30, -1);
  passengerDisc(g, 372, 142, 30, 1);
  // grille field: 14 rows x 30 staggered slots
  const gx = 512 + 110, gy = 60;
  g.fillStyle = '#4a4c4d';
  for (let row = 0; row < 14; row++) for (let col = 0; col < 30; col++) {
    const x = gx + col * 8.7 + (row % 2) * 4.3, y = gy + row * 11.3;
    g.fillRect(x, y, 5.5, 2.8);
  }
  // small dot grille next to the seam, and fixing screws
  g.fillStyle = '#6a6c6d';
  for (const [x, y] of [[40, 60], [480, 60], [560, 250], [980, 250]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  return tex(c, { repeat: true });
}

/** Flat ceiling panel tile: 512 px = 1.2 m along the bus (u), 1.46 m across (v). Hairline seams on two edges. */
export function makeCeilingPanel() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#d6d4cc';
  g.fillRect(0, 0, 256, 256);
  const r = mulberry32(5);
  for (let i = 0; i < 900; i++) {
    const v = 200 + r() * 40;
    g.fillStyle = `rgba(${v},${v - 2},${v - 8},0.12)`;
    g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  g.strokeStyle = '#b8b6ae';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 1); g.lineTo(256, 1); g.moveTo(1, 0); g.lineTo(1, 256); g.stroke();
  return tex(c, { repeat: true });
}

/** Moquette of the fold-up seat: dark base, staggered dot grid, wavy green lines. 256 px = 0.5 m. */
export function makeMoquette() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#08090b';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#26292d';
  for (let y = 0; y < 256; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 256; x += 4) g.fillRect(x, y, 1.3, 1.3);
  const r = mulberry32(31);
  const lines = 9;
  for (let k = 0; k < lines; k++) {
    const y0 = 14 + (k * 256) / lines;
    const wl = 256 / (1 + Math.floor(r() * 3)), amp = 3 + r() * 3, ph = r() * 6.28, tilt = (r() - 0.5) * 0.1;
    g.lineWidth = 1.5 + r() * 1.2;
    let prev = null;
    for (let x = 0; x <= 256; x += 3) {
      const y = y0 + Math.sin((x / wl) * Math.PI * 2 + ph) * amp + (x - 128) * tilt;
      const peak = 0.5 + 0.5 * Math.sin((x / wl) * Math.PI * 2 + ph);
      g.strokeStyle = peak > 0.55 ? '#92b04c' : '#4f6330';
      if (prev) { g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(x, y); g.stroke(); }
      prev = [x, y];
    }
  }
  return tex(c, { repeat: true });
}

/** Red priority-seat sticker "Внимание! Седалка за майки с деца, възрастни и хора с увреждания!" (0.17 x 0.25 m). */
export function makePrioritySticker() {
  const [c, g] = canvas(256, 376);
  g.fillStyle = '#c8202c';
  g.beginPath(); g.roundRect(0, 0, 256, 376, 14); g.fill();
  g.fillStyle = '#fff';
  g.font = 'italic bold 36px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Внимание!', 128, 30);
  g.fillStyle = '#fff';
  g.beginPath(); g.roundRect(10, 56, 236, 310, 8); g.fill();
  // red disc with elderly person (bent, with a cane) and an adult holding a child by the hand
  g.fillStyle = '#c8202c';
  g.beginPath(); g.arc(128, 150, 90, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 14;
  g.beginPath(); g.arc(88, 102, 13, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(94, 120); g.lineTo(84, 162); g.lineTo(70, 206); g.moveTo(84, 162); g.lineTo(102, 206); g.stroke();
  g.lineWidth = 9; g.beginPath(); g.moveTo(94, 128); g.lineTo(110, 156); g.lineTo(114, 206); g.stroke();
  g.lineWidth = 14;
  g.beginPath(); g.arc(154, 96, 13, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(154, 114); g.lineTo(152, 162); g.lineTo(140, 206); g.moveTo(152, 162); g.lineTo(166, 206); g.stroke();
  g.lineWidth = 9; g.beginPath(); g.moveTo(154, 128); g.lineTo(178, 152); g.stroke();
  g.lineWidth = 11;
  g.beginPath(); g.arc(184, 132, 9, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(184, 144); g.lineTo(182, 174); g.lineTo(176, 206); g.moveTo(182, 174); g.lineTo(192, 206); g.stroke();
  g.fillStyle = '#9b1c26';
  g.font = 'italic 21px Arial';
  ['Седалка за', 'майки с деца,', 'възрастни и', 'хора с увреждания!'].forEach((t, i) => g.fillText(t, 128, 276 + i * 26, 214));
  return tex(c);
}

// ---- decal sheet -------------------------------------------------------------------------------------------
const SHEET = { w: 1024, h: 1024 };
/** Rectangles (px, from the top left) of the decals on the sheet. */
export const SIGN_RECT = {
  banner: [0, 0, 600, 100], // no-smoking header of the cab partition (0.30 x 0.05)
  a4: [0, 112, 256, 366], // white notice sheet 0.21 x 0.30
  wifi: [270, 112, 300, 125], // violet free-internet sticker 0.12 x 0.05
  noPhone: [270, 250, 128, 128],
  noSmoking: [410, 250, 128, 128],
  wheel: [600, 0, 128, 128], // blue wheelchair disc
  pram: [740, 0, 128, 128], // pram on white
  rule1: [600, 140, 128, 128],
  rule2: [740, 140, 128, 128],
  exit: [880, 0, 128, 256], // green exit pictogram 0.06 x 0.12
  hand: [600, 280, 128, 154], // hand pictogram sticker 0.10 x 0.12
  label: [740, 280, 128, 192], // white info label 0.12 x 0.18
  man: [0, 500, 400, 100], // silver MAN lettering on black 0.20 x 0.05
  valScreen: [420, 500, 128, 128],
  stop: [560, 500, 128, 128], // yellow symbol on red (request-to-open button)
  tape: [700, 500, 256, 64], // yellow/black hazard tape
  extinguisher: [0, 620, 128, 128],
  doorPic: [140, 620, 128, 256], // door-area pictogram strip
};

export function signUV(name) {
  const [x, y, w, h] = SIGN_RECT[name];
  return [x / SHEET.w, 1 - (y + h) / SHEET.h, (x + w) / SHEET.w, 1 - y / SHEET.h];
}

function noSign(g, cx, cy, R, kind) {
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d4231c';
  g.lineWidth = R * 0.14;
  g.beginPath(); g.arc(cx, cy, R * 0.86, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#222'; g.fillStyle = '#222';
  g.lineWidth = R * 0.1; g.lineCap = 'round';
  if (kind === 'smoke') {
    g.beginPath(); g.moveTo(cx - R * 0.5, cy + R * 0.1); g.lineTo(cx + R * 0.35, cy + R * 0.1); g.stroke();
    g.fillStyle = '#d4731c'; g.fillRect(cx + R * 0.38, cy + R * 0.02, R * 0.15, R * 0.16);
  } else {
    g.beginPath(); g.roundRect(cx - R * 0.2, cy - R * 0.45, R * 0.4, R * 0.9, R * 0.06); g.stroke();
  }
  g.strokeStyle = '#d4231c';
  g.lineWidth = R * 0.14;
  g.beginPath(); g.moveTo(cx - R * 0.62, cy - R * 0.62); g.lineTo(cx + R * 0.62, cy + R * 0.62); g.stroke();
}

function wheelchair(g, cx, cy, k, col) {
  g.save();
  g.translate(cx, cy);
  g.scale(k, k);
  g.strokeStyle = col; g.fillStyle = col;
  g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.arc(-4, 14, 18, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(-2, -30, 7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-4, -20); g.lineTo(-4, 2); g.lineTo(16, 2); g.lineTo(24, 22); g.stroke();
  g.restore();
}

/** One sheet with all small interior decals; see SIGN_RECT. */
export function makeSignSheet() {
  const [c, g] = canvas(SHEET.w, SHEET.h);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, SHEET.w, SHEET.h);
  const R = (n) => SIGN_RECT[n];
  // no-smoking banner
  {
    const [x, y, w, h] = R('banner');
    g.fillStyle = '#f4f3ef'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#999'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    noSign(g, x + 46, y + h / 2, 34, 'smoke');
    g.fillStyle = '#c0392b'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = 'italic bold 25px Arial';
    g.fillText('Пушенето забранено!', x + 96, y + 30, 480);
    g.font = 'italic 21px Arial';
    g.fillText('При нарушения звънете на телефон 02 832 71 11', x + 96, y + 68, 490);
  }
  // A4 notice sheet
  {
    const [x, y, w, h] = R('a4');
    g.fillStyle = '#f7f8fa'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#a9b4c2'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = '#4b79b8'; g.fillRect(x + 8, y + 28, w - 16, 3);
    g.fillStyle = '#5a6068'; g.font = 'bold 13px Arial'; g.textAlign = 'center';
    g.fillText('ПРАВИЛА ЗА ПЪТУВАНЕ', x + w / 2, y + 18);
    const r = mulberry32(9);
    g.fillStyle = '#8b9097';
    for (let i = 0; i < 38; i++) g.fillRect(x + 10, y + 40 + i * 7.3, (w - 20) * (0.55 + r() * 0.45), 2.2);
    for (let i = 0; i < 6; i++) { g.fillStyle = ['#2f6fb5', '#2f6fb5', '#2f6fb5', '#555', '#2f6fb5', '#2f6fb5'][i]; g.beginPath(); g.arc(x + 22 + i * 40, y + h - 18, 11, 0, Math.PI * 2); g.fill(); }
  }
  // free internet sticker
  {
    const [x, y, w, h] = R('wifi');
    const grd = g.createLinearGradient(x, y, x + w, y);
    grd.addColorStop(0, '#6a3fa0'); grd.addColorStop(1, '#8a6fc0');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w * 0.38, h * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a2d80'; g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('БЕЗПЛАТЕН ИНТЕРНЕТ', x + w / 2, y + h / 2, w * 0.7);
  }
  { const [x, y, w, h] = R('noPhone'); g.fillStyle = '#fff'; g.fillRect(x, y, w, h); noSign(g, x + w / 2, y + h / 2, w / 2 - 4, 'phone'); }
  { const [x, y, w, h] = R('noSmoking'); g.fillStyle = '#fff'; g.fillRect(x, y, w, h); noSign(g, x + w / 2, y + h / 2, w / 2 - 4, 'smoke'); }
  // wheelchair disc, pram, rule discs
  {
    const [x, y, w, h] = R('wheel');
    g.fillStyle = '#fff'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1a5fb4'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2 - 3, 0, Math.PI * 2); g.fill();
    wheelchair(g, x + w / 2, y + h / 2, 1.05, '#fff');
  }
  {
    const [x, y, w, h] = R('pram');
    g.fillStyle = '#f4f4f2'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#1a5fb4'; g.lineWidth = 5; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle = '#1a5fb4'; g.strokeStyle = '#1a5fb4';
    g.beginPath(); g.arc(x + 44, y + 92, 9, 0, Math.PI * 2); g.arc(x + 86, y + 92, 9, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x + 30, y + 52); g.quadraticCurveTo(x + 34, y + 80, x + 64, y + 80); g.lineTo(x + 94, y + 80); g.lineTo(x + 96, y + 52); g.closePath(); g.fill();
    g.lineWidth = 6; g.beginPath(); g.moveTo(x + 96, y + 52); g.lineTo(x + 102, y + 28); g.stroke();
  }
  for (const n of ['rule1', 'rule2']) {
    const [x, y, w, h] = R(n);
    g.fillStyle = '#fff'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1a5fb4'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2 - 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 14px Arial'; g.textAlign = 'center';
    ['Само един', 'колички', 'или инвалиден', 'стол'].forEach((t, i) => g.fillText(t, x + w / 2, y + 40 + i * 17, 90));
  }
  // green exit pictogram
  {
    const [x, y, w, h] = R('exit');
    g.fillStyle = '#138a36'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.arc(x + 62, y + 52, 10, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x + 56, y + 70); g.lineTo(x + 44, y + 100); g.lineTo(x + 24, y + 112); g.moveTo(x + 50, y + 84); g.lineTo(x + 70, y + 98); g.lineTo(x + 78, y + 122); g.moveTo(x + 44, y + 100); g.lineTo(x + 52, y + 130); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(x + 86, y + 60); g.lineTo(x + 104, y + 60); g.moveTo(x + 98, y + 52); g.lineTo(x + 106, y + 60); g.lineTo(x + 98, y + 68); g.stroke();
    g.fillRect(x + 12, y + 160, 100, 6);
    g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('ИЗХОД', x + 64, y + 200);
    g.font = '17px Arial'; g.fillText('EXIT', x + 64, y + 228);
  }
  // hand pictogram sticker
  {
    const [x, y, w, h] = R('hand');
    g.fillStyle = '#e9ebee'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#555'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + 26, y + 100); g.lineTo(x + 62, y + 74); g.lineTo(x + 90, y + 86); g.lineTo(x + 96, y + 50); g.stroke();
    g.beginPath(); g.moveTo(x + 14, y + 44); g.lineTo(x + 112, y + 120); g.strokeStyle = '#d4231c'; g.stroke();
  }
  // info label
  {
    const [x, y, w, h] = R('label');
    g.fillStyle = '#f3f4f6'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1a5fb4'; g.fillRect(x, y, w, 22);
    g.fillStyle = '#8b9097';
    for (let i = 0; i < 14; i++) g.fillRect(x + 8, y + 34 + i * 11, w - 16 - (i % 3) * 14, 3);
  }
  // MAN lettering
  {
    const [x, y, w, h] = R('man');
    g.fillStyle = '#17181a'; g.fillRect(x, y, w, h);
    const tg = g.createLinearGradient(0, y + 20, 0, y + 90);
    tg.addColorStop(0, '#f4f5f6'); tg.addColorStop(0.5, '#8b9095'); tg.addColorStop(1, '#d9dcdf');
    g.fillStyle = tg; g.font = 'bold 84px "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MAN', x + w / 2, y + h / 2 + 4, w * 0.8);
  }
  // validator screen
  {
    const [x, y, w, h] = R('valScreen');
    g.fillStyle = '#0c1018'; g.fillRect(x, y, w, h);
    g.fillStyle = '#2d8cff'; g.fillRect(x + 8, y + 8, w - 16, 34);
    g.fillStyle = '#1fbf5a'; g.beginPath(); g.arc(x + w / 2, y + 86, 22, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(x + w / 2 - 11, y + 86); g.lineTo(x + w / 2 - 3, y + 95); g.lineTo(x + w / 2 + 12, y + 76); g.stroke();
  }
  // request-to-open symbol (yellow on red)
  {
    const [x, y, w, h] = R('stop');
    g.fillStyle = '#d23a2c'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f4c20d';
    g.beginPath(); g.arc(x + w / 2, y + 50, 26, Math.PI, 0); g.lineTo(x + w / 2 + 40, y + 86); g.lineTo(x + w / 2 - 40, y + 86); g.closePath(); g.fill();
    g.beginPath(); g.arc(x + w / 2, y + 98, 8, 0, Math.PI * 2); g.fill();
  }
  // hazard tape
  {
    const [x, y, w, h] = R('tape');
    g.fillStyle = '#f2c812'; g.fillRect(x, y, w, h);
    g.fillStyle = '#222';
    for (let i = -2; i < 12; i++) { g.beginPath(); g.moveTo(x + i * 32, y + h); g.lineTo(x + i * 32 + 16, y + h); g.lineTo(x + i * 32 + 48, y); g.lineTo(x + i * 32 + 32, y); g.closePath(); g.fill(); }
  }
  // extinguisher label
  {
    const [x, y, w, h] = R('extinguisher');
    g.fillStyle = '#c8202c'; g.fillRect(x, y, w, h);
    g.fillStyle = '#fff'; g.fillRect(x + 20, y + 20, 88, 88);
    g.fillStyle = '#c8202c'; g.fillRect(x + 36, y + 36, 56, 56);
  }
  return tex(c);
}

/** Ribbed aluminium turntable plate (ribs run across the bus; cylinder cap UV: u along z). */
export function makeTurntable() {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#2a2a2a';
  g.fillRect(0, 0, 1024, 1024);
  const n = 76, p = 1024 / n;
  for (let i = 0; i < n; i++) {
    const grd = g.createLinearGradient(i * p, 0, i * p + p, 0);
    grd.addColorStop(0, '#6f6c66'); grd.addColorStop(0.3, '#9c998f'); grd.addColorStop(0.55, '#85827a'); grd.addColorStop(1, '#3a3a38');
    g.fillStyle = grd;
    g.fillRect(i * p + 1, 0, p * 0.62, 1024);
  }
  // thin black gap ring at the edge
  g.strokeStyle = '#101010';
  g.lineWidth = 16;
  g.beginPath(); g.arc(512, 512, 504, 0, Math.PI * 2); g.stroke();
  return tex(c, { aniso: 8 });
}

/** Marker for compatibility: generic vent grille (small dot field), used for the cab ceiling vent. */
export function makeVentGrille() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#d6d4cc';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#4a4c4d';
  for (let y = 10; y < 256; y += 16) for (let x = 10 + ((y / 16) % 2) * 8; x < 256; x += 16) g.fillRect(x, y, 9, 4);
  return tex(c, { repeat: true });
}
