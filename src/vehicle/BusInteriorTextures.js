// Procedural textures of the bus interior: floor covering, vent grilles,
// seat moquette, stickers and the interior sign sheet.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { canvas, tex, drawWheelchair } from './BusTextures.js';

export function makeFloor() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#58616b';
  g.fillRect(0, 0, 512, 512);
  const r = mulberry32(17);
  for (let i = 0; i < 9000; i++) {
    const v = 70 + r() * 70;
    g.fillStyle = `rgba(${v},${v + 6},${v + 14},0.5)`;
    g.fillRect(r() * 512, r() * 512, 1.4, 1.4);
  }
  // anti-slip dot pattern
  g.fillStyle = 'rgba(30,34,40,0.35)';
  for (let y = 8; y < 512; y += 16)
    for (let x = 8 + ((y / 16) % 2) * 8; x < 512; x += 16) {
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  return tex(c, { repeat: true });
}

export function makeVentGrille() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#d9dbdb';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#33383c';
  for (let y = 6; y < 256; y += 9)
    for (let x = 6 + ((y / 9) % 2) * 4.5; x < 256; x += 9) {
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  return tex(c, { repeat: true });
}

export function makeMoquette() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#1b1d1f';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#3c8a3f';
  g.lineWidth = 4;
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 20 + k * 44 + Math.sin(x * 0.045 + k) * 10;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.strokeStyle = '#8fbf4a';
  g.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 32 + k * 44 + Math.sin(x * 0.06 + k * 2) * 7;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  return tex(c, { repeat: true });
}

/** Red priority-seat sticker ("Внимание! Седалка за майки с деца, възрастни и хора с увреждания!"). */
export function makePrioritySticker() {
  const [c, g] = canvas(256, 384);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 384);
  g.fillStyle = '#d4231c';
  g.fillRect(8, 8, 240, 368);
  g.fillStyle = '#fff';
  g.font = 'bold 34px Arial';
  g.textAlign = 'center';
  g.fillText('Внимание!', 128, 52);
  g.beginPath();
  g.arc(128, 160, 70, 0, Math.PI * 2);
  g.fill();
  drawWheelchair(g, 128, 160, 1.6, '#d4231c');
  g.fillStyle = '#fff';
  g.font = 'bold 20px Arial';
  ['Седалка за', 'майки с деца,', 'възрастни и', 'хора с увреждания!'].forEach((t, i) => g.fillText(t, 128, 268 + i * 26));
  return tex(c);
}

/** Simple sticker/sign textures used inside (stop request, no smoking, emergency exit). */
export function makeSignSheet() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 512, 256);
  // stop request label
  g.fillStyle = '#c8102e';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#fff';
  g.font = 'bold 56px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('СТОП', 128, 64);
  // emergency exit (green)
  g.fillStyle = '#138a36';
  g.fillRect(256, 0, 256, 128);
  g.fillStyle = '#fff';
  g.font = 'bold 30px Arial';
  g.fillText('АВАРИЕН', 384, 46);
  g.fillText('ИЗХОД', 384, 84);
  // blue info: priority places
  g.fillStyle = '#1a5fb4';
  g.fillRect(0, 128, 256, 128);
  drawWheelchair(g, 128, 192, 1.1, '#fff');
  // no smoking
  g.fillStyle = '#fff';
  g.fillRect(256, 128, 256, 128);
  g.strokeStyle = '#c8102e';
  g.lineWidth = 12;
  g.beginPath();
  g.arc(384, 192, 50, 0, Math.PI * 2);
  g.moveTo(349, 157);
  g.lineTo(419, 227);
  g.stroke();
  return tex(c);
}
