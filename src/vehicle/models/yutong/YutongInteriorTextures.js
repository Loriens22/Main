// Interior textures of the Yutong saloon (floor, ceiling, coves, seat cloth, signs, blind): procedural canvases
// (same construction as the BMC's, recoloured for the Yutong in YutongInterior.js).
import * as THREE from 'three';
import { mulberry32 } from '../../../core/rng.js';
import { canvas, tex, drawWheelchair } from '../../BusTextures.js';

/** Atlas rectangle in canvas pixels -> [u0, v0, u1, v1] (v up, matching flipY canvas textures). */
export const rectUV = (W, H, x, y, w, h) => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

const rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };

function pictogram(g, kind, cx, cy, r) {
  g.fillStyle = '#1862b8';
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = r * 0.07;
  g.beginPath(); g.arc(cx, cy, r * 0.9, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.save();
  g.translate(cx, cy);
  g.scale(r / 50, r / 50);
  g.lineWidth = 5;
  if (kind === 'wheel') {
    g.beginPath(); g.arc(-4, 14, 17, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(-2, -30, 6, 0, Math.PI * 2); g.fill();
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

/** Sofia municipal emblem (stylised: crowned shield, hills, sun). Drawn into (x, y, w, h). */

/* ------------------------------------------------------------------ registration plate */
export function makeFloorTex() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#404447';
  g.fillRect(0, 0, 512, 512);
  const r = mulberry32(21);
  const fleck = (n, col, s0, s1) => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = r() * 512, y = r() * 512, s = s0 + r() * (s1 - s0);
      for (const ox of [0, x > 480 ? -512 : 0]) for (const oy of [0, y > 480 ? -512 : 0]) g.fillRect(x + ox, y + oy, s, s * (0.6 + r() * 0.8));
    }
  };
  fleck(2400, 'rgba(120,124,126,0.6)', 1, 3);
  fleck(2200, '#8a8f92', 1, 3);
  fleck(1400, '#2f3336', 1, 3);
  return tex(c, { repeat: true });
}

/** Ceiling tile, off-white with hairline seams: 256 px = 1.2 m along z. */
export function makeCeilTex() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#dedcd4';
  g.fillRect(0, 0, 256, 256);
  const r = mulberry32(9);
  for (let i = 0; i < 700; i++) {
    const v = 205 + r() * 30;
    g.fillStyle = `rgba(${v},${v - 2},${v - 8},0.13)`;
    g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  g.strokeStyle = '#bdbbb2';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 1); g.lineTo(256, 1); g.moveTo(1, 0); g.lineTo(1, 256); g.stroke();
  return tex(c, { repeat: true });
}

/** Side coving tile: slotted vent panel + plain panel (1024 x 256 px = 2.0 m x 0.5 m). */
export function makeCoveTex() {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#d3d1c9';
  g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = '#b3b1a8'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(2, 0); g.lineTo(2, 256); g.moveTo(512, 0); g.lineTo(512, 256); g.stroke();
  g.fillStyle = '#505355';
  for (let row = 0; row < 12; row++) for (let col = 0; col < 28; col++) g.fillRect(560 + col * 15 + (row % 2) * 7, 50 + row * 13, 9, 3.5);
  return tex(c, { repeat: true });
}

/** Seat fabric: dark charcoal with a very fine weave: 128 px = 0.25 m. */
export function makeSeatFabric() {
  const [c, g] = canvas(128, 128);
  // ref15: the seats are light-grey plastic throughout: a barely textured insert of the same grey
  g.fillStyle = '#8f959a';
  g.fillRect(0, 0, 128, 128);
  const r = mulberry32(3);
  for (let y = 0; y < 128; y += 2) for (let x = (y / 2) % 2 ? 1 : 0; x < 128; x += 2) {
    g.fillStyle = r() > 0.5 ? '#949a9f' : '#8a9095';
    g.fillRect(x, y, 1.2, 1.2);
  }
  return tex(c, { repeat: true });
}

/** Interior sign sheet (decals): name -> uv rect. */
const SIGN = {};
export function signUV(name) { return SIGN[name]; }
export function makeSignSheet() {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const put = (name, x, y, w, h) => { SIGN[name] = rectUV(W, H, x, y, w, h); };
  // exit pictogram (green square, white running man + door)
  g.fillStyle = '#1f9a4d'; g.fillRect(0, 0, 100, 100);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(40, 28, 9, 0, 6.3); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(40, 40); g.lineTo(32, 66); g.lineTo(18, 84); g.moveTo(40, 44); g.lineTo(58, 56); g.moveTo(32, 66); g.lineTo(50, 82); g.stroke();
  g.lineWidth = 5; g.strokeRect(62, 20, 26, 60);
  put('exit', 0, 0, 100, 100);
  // wheelchair + pram (blue discs)
  pictogram(g, 'wheel', 150, 50, 46); put('wheel', 104, 4, 92, 92);
  pictogram(g, 'pram', 250, 50, 46); put('pram', 204, 4, 92, 92);
  pictogram(g, 'walk', 350, 50, 46); put('walk', 304, 4, 92, 92);
  // no smoking / no phone style red circle
  g.strokeStyle = '#c4271c'; g.lineWidth = 8;
  g.beginPath(); g.arc(450, 50, 40, 0, 6.3); g.moveTo(422, 22); g.lineTo(478, 78); g.stroke();
  g.fillStyle = '#222'; g.fillRect(436, 30, 28, 40);
  put('forbid', 404, 4, 92, 92);
  // validator touch screen
  const vg = g.createLinearGradient(0, 110, 0, 210);
  vg.addColorStop(0, '#16a0d8'); vg.addColorStop(1, '#0b4a8a');
  g.fillStyle = vg; g.fillRect(0, 110, 100, 100);
  g.fillStyle = '#fff'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.fillText('БИЛЕТ', 50, 154); g.fillText('ОК', 50, 184);
  put('valScreen', 0, 110, 100, 100);
  // cab notice sheets
  g.fillStyle = '#f2f2ee'; g.fillRect(110, 110, 210, 300);
  g.fillStyle = '#6a6e72';
  for (let i = 0; i < 22; i++) g.fillRect(122, 124 + i * 12.5, 186 - (i % 5) * 18, 5);
  g.fillStyle = '#c4271c'; g.fillRect(122, 118, 186, 8);
  put('notice', 110, 110, 210, 300);
  // yellow info card
  g.fillStyle = '#f3d23a'; g.fillRect(330, 110, 90, 130);
  g.fillStyle = '#222'; g.fillRect(340, 124, 70, 6); g.fillRect(340, 140, 54, 5);
  put('yellow', 330, 110, 90, 130);
  // stop LED module (white with two red LEDs)
  g.fillStyle = '#eeeeea'; g.fillRect(430, 110, 50, 130);
  g.fillStyle = '#d4281e'; g.beginPath(); g.arc(455, 150, 9, 0, 6.3); g.arc(455, 190, 9, 0, 6.3); g.fill();
  put('stopLed', 430, 110, 50, 130);
  // tariff sticker
  g.fillStyle = '#e8e8e2'; g.fillRect(500, 110, 120, 80);
  g.fillStyle = '#2a6fb0'; g.fillRect(500, 110, 120, 14);
  g.fillStyle = '#555'; for (let i = 0; i < 4; i++) g.fillRect(508, 134 + i * 12, 100 - i * 8, 5);
  put('tariff', 500, 110, 120, 80);
  // red emergency handle icon + hammer
  g.fillStyle = '#c4271c'; g.fillRect(640, 110, 60, 40); put('red', 640, 110, 60, 40);
  void drawWheelchair;
  return tex(c, { aniso: 4 });
}

/** Sun blind fabric (translucent grey with horizontal seams), 128 x 128. */
export function makeBlind() {
  const [c, g] = canvas(64, 128);
  g.fillStyle = '#9aa6ac';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 64, 2);
  return tex(c, { aniso: 2 });
}
