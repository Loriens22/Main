// Procedural canvas textures of the Conecto G model. Nothing here is traced from a photograph:
// every texture is drawn from scratch (the photos only guided colours and layout).
import * as THREE from 'three';
import { canvas, tex } from '../../BusTextures.js';
import { mulberry32 } from '../../../core/rng.js';

const rectUV = (W, H, x, y, w, h) => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

/** Bulgarian registration plate 520 x 110 mm: EU band with BG, black Cyrillic letters. */
export function makePlate(text = 'С 8385 НС') {
  const [c, g] = canvas(1040, 220);
  g.fillStyle = '#16171a';
  g.fillRect(0, 0, 1040, 220);
  g.fillStyle = '#f4f4ef';
  g.beginPath();
  if (g.roundRect) g.roundRect(6, 6, 1028, 208, 18); else g.rect(6, 6, 1028, 208);
  g.fill();
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 5;
  g.stroke();
  g.save();
  g.beginPath();
  if (g.roundRect) g.roundRect(6, 6, 100, 208, [18, 0, 0, 18]); else g.rect(6, 6, 100, 208);
  g.clip();
  g.fillStyle = '#1b3f9c';
  g.fillRect(6, 6, 100, 208);
  g.restore();
  g.fillStyle = '#ffd400';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath(); g.arc(56 + Math.cos(a) * 30, 62 + Math.sin(a) * 30, 4.5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 50px Arial';
  g.textAlign = 'center';
  g.fillText('BG', 56, 190);
  g.fillStyle = '#0c0c0c';
  g.font = 'bold 168px "DIN Alternate", "Arial Narrow", "Liberation Sans Narrow", Arial';
  g.textBaseline = 'alphabetic';
  const w = g.measureText(text).width;
  const k = Math.min(0.9, 880 / w);
  g.save();
  g.translate(580, 178);
  g.scale(k, 1);
  g.textAlign = 'center';
  g.fillText(text, 0, 0);
  g.restore();
  return tex(c, { aniso: 8 });
}

/** Three-lens headlamp unit (0.40 x 0.15 m): grey housing, outer main lamp, amber indicator, inner main lamp. [colour, emissive] */
export function makeHeadCluster(mirror = false) {
  const W = 640, H = 240;
  const mk = (em) => {
    const [c, g] = canvas(W, H);
    g.fillStyle = em ? '#000' : '#4c4f53';
    g.fillRect(0, 0, W, H);
    if (!em) {
      const lg = g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, '#6a6e72'); lg.addColorStop(0.5, '#4a4d51'); lg.addColorStop(1, '#2f3134');
      g.fillStyle = lg;
      g.beginPath();
      if (g.roundRect) g.roundRect(0, 0, W, H, 40); else g.rect(0, 0, W, H);
      g.fill();
    }
    // lens centres: big, small amber, big (mirror flips the order for the other side)
    const L = [[110, 120, 88, 'main'], [320, 120, 54, 'amber'], [520, 120, 82, 'main']];
    if (mirror) L.reverse().forEach((q, i) => { q[0] = [110, 320, 520][i]; });
    for (const [cx, cy, r, kind] of L) {
      const rg = g.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 4, cx, cy, r);
      if (em) {
        if (kind === 'amber') { rg.addColorStop(0, '#000'); rg.addColorStop(1, '#000'); } else { rg.addColorStop(0, '#fff'); rg.addColorStop(0.45, '#cfc8b8'); rg.addColorStop(1, '#2a2620'); }
      } else if (kind === 'amber') { rg.addColorStop(0, '#ffd48a'); rg.addColorStop(0.55, '#e69a2e'); rg.addColorStop(1, '#8a5410'); } else { rg.addColorStop(0, '#fbfbf8'); rg.addColorStop(0.3, '#b9bfc3'); rg.addColorStop(0.75, '#6f757a'); rg.addColorStop(1, '#2b2e31'); }
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      if (!em) {
        g.strokeStyle = '#1c1d1f'; g.lineWidth = 7; g.stroke();
        if (kind === 'main') { g.fillStyle = '#fff7da'; g.beginPath(); g.ellipse(cx + 4, cy - 6, r * 0.2, r * 0.26, 0, 0, Math.PI * 2); g.fill(); }
      }
    }
    return tex(c, { aniso: 8 });
  };
  return [mk(false), mk(true)];
}

/** Decal atlas: fleet number, star, CONECTO badge, hazard film, priority sticker, small fleet numbers. */
export function makeDecals(fleet = '3314') {
  const W = 2048, H = 1024;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const rects = {};
  // fleet number 0.37 x 0.135 m at 1000 px/m
  g.save();
  g.fillStyle = '#0b0b0b';
  g.strokeStyle = '#0b0b0b';
  g.lineWidth = 4;
  g.font = 'bold 200px "DIN Alternate", "Arial Narrow", "Liberation Sans Narrow", Arial';
  g.textBaseline = 'alphabetic';
  const tw = g.measureText(fleet).width;
  g.translate(6, 160);
  g.scale(370 / tw, 1);
  g.fillText(fleet, 0, 0);
  g.strokeText(fleet, 0, 0);
  g.restore();
  rects.fleet = rectUV(W, H, 0, 0, 384, 190);
  // Mercedes star: chrome ring, black field, three-pointed star (256 px = 0.2 m)
  {
    const cx = 128, cy = 128 + 220, R = 124;
    g.save();
    g.translate(0, 0);
    const rg = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    rg.addColorStop(0, '#f6f8f9'); rg.addColorStop(0.45, '#8f969b'); rg.addColorStop(0.55, '#d9dde0'); rg.addColorStop(1, '#6c7378');
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0d0e10';
    g.beginPath(); g.arc(cx, cy, R * 0.86, 0, Math.PI * 2); g.fill();
    // star
    g.strokeStyle = '#d6dadd';
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, R * 0.74, 0, Math.PI * 2); g.stroke();
    const pts = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI) / 3, -Math.PI / 2 + (4 * Math.PI) / 3];
    for (const a of pts) {
      g.fillStyle = '#eef0f1';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.74, cy + Math.sin(a) * R * 0.74);
      g.lineTo(cx + Math.cos(a + 0.2) * R * 0.1, cy + Math.sin(a + 0.2) * R * 0.1);
      g.lineTo(cx, cy);
      g.lineTo(cx + Math.cos(a - 0.2) * R * 0.1, cy + Math.sin(a - 0.2) * R * 0.1);
      g.closePath();
      g.fill();
      g.fillStyle = '#9aa1a6';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.74, cy + Math.sin(a) * R * 0.74);
      g.lineTo(cx + Math.cos(a - 0.2) * R * 0.1, cy + Math.sin(a - 0.2) * R * 0.1);
      g.lineTo(cx, cy);
      g.closePath();
      g.fill();
    }
    g.restore();
    rects.star = rectUV(W, H, 0, 220, 256, 256);
  }
  // CONECTO badge: black slanted plate, white italic caps, black underline (0.42 x 0.085 m at 2000 px/m)
  {
    const x = 400, y = 20, w = 840, h = 170;
    g.fillStyle = '#16171a';
    g.beginPath(); g.moveTo(x + 20, y); g.lineTo(x + w, y); g.lineTo(x + w - 20, y + 110); g.lineTo(x, y + 110); g.closePath(); g.fill();
    g.fillStyle = '#f0f0ee';
    g.font = 'italic 900 90px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('CONECTO', x + w / 2, y + 58, 760);
    g.fillStyle = '#16171a';
    g.fillRect(x + 6, y + 126, w - 30, 30);
    rects.badge = rectUV(W, H, x, y, w, h);
  }
  // hazard film: white with diagonal black bands (a 0.9 x 0.9 m patch, 512 px)
  {
    const x = 1300, y = 20, s = 512;
    g.save();
    g.beginPath(); g.rect(x, y, s, s); g.clip();
    g.fillStyle = '#f0f1ee';
    g.fillRect(x, y, s, s);
    g.fillStyle = '#17181a';
    for (let k = -2; k < 8; k++) {
      g.beginPath();
      g.moveTo(x + k * 100, y + s);
      g.lineTo(x + k * 100 + 55, y + s);
      g.lineTo(x + k * 100 + 55 + s, y);
      g.lineTo(x + k * 100 + s, y);
      g.closePath();
      g.fill();
    }
    g.restore();
    rects.hazard = rectUV(W, H, x, y, s, s);
  }
  // blue priority sticker (0.2 x 0.09 m) with pram + wheelchair + walking stick
  {
    const x = 1300, y = 560, w = 300, h = 135;
    g.fillStyle = '#1560b5';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.lineCap = 'round';
    // wheelchair
    g.beginPath(); g.arc(x + 75, y + 78, 24, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x + 78, y + 30, 8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x + 78, y + 42); g.lineTo(x + 78, y + 66); g.lineTo(x + 100, y + 66); g.lineTo(x + 112, y + 96); g.stroke();
    // pram
    g.beginPath(); g.arc(x + 200, y + 66, 22, Math.PI, 0); g.lineTo(x + 222, y + 80); g.lineTo(x + 182, y + 80); g.closePath(); g.fill();
    g.beginPath(); g.arc(x + 188, y + 100, 7, 0, Math.PI * 2); g.arc(x + 216, y + 100, 7, 0, Math.PI * 2); g.fill();
    // person
    g.beginPath(); g.arc(x + 264, y + 30, 8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x + 264, y + 42); g.lineTo(x + 262, y + 76); g.lineTo(x + 248, y + 106); g.moveTo(x + 262, y + 76); g.lineTo(x + 276, y + 106); g.stroke();
    rects.sticker = rectUV(W, H, x, y, w, h);
  }
  // small black fleet number for the white roof band (0.14 m digits tall)
  {
    g.save();
    g.fillStyle = '#16161a';
    g.font = 'bold 120px "Arial Narrow", "Liberation Sans Narrow", Arial';
    g.textBaseline = 'alphabetic';
    const fw = g.measureText(fleet).width;
    g.translate(0, 860);
    g.scale(300 / fw, 1);
    g.fillText(fleet, 0, 0);
    g.restore();
    rects.small = rectUV(W, H, 0, 730, 320, 150);
  }
  // exit pictogram (green) for the door pillars
  {
    const x = 700, y = 560, w = 130, h = 240;
    g.fillStyle = '#16885a';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x + 45, y + 60, 14, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + 45, y + 80); g.lineTo(x + 45, y + 130); g.lineTo(x + 25, y + 180); g.moveTo(x + 45, y + 130); g.lineTo(x + 70, y + 175); g.moveTo(x + 22, y + 100); g.lineTo(x + 70, y + 100); g.stroke();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(x + 85, y + 100); g.lineTo(x + 120, y + 80); g.lineTo(x + 120, y + 120); g.closePath(); g.fill();
    rects.exit = rectUV(W, H, x, y, w, h);
  }
  // notice sheet for the cab partition (white sheet with a line of text) and a wheelchair sign
  {
    const x = 1000, y = 560, w = 240, h = 330;
    g.fillStyle = '#f3f3ee';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#9a2a2a';
    g.fillRect(x, y, w, 46);
    g.fillStyle = '#222';
    for (let i = 0; i < 12; i++) g.fillRect(x + 18, y + 70 + i * 21, 150 + ((i * 53) % 60), 7);
    rects.notice = rectUV(W, H, x, y, w, h);
  }
  {
    const x = 1300, y = 760, w = 150, h = 150;
    g.fillStyle = '#1560b5';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.arc(x + 70, y + 98, 30, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x + 74, y + 34, 11, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x + 74, y + 50); g.lineTo(x + 74, y + 88); g.lineTo(x + 108, y + 88); g.lineTo(x + 124, y + 130); g.stroke();
    rects.wheel = rectUV(W, H, x, y, w, h);
  }
  return { texture: tex(c, { aniso: 8 }), rects };
}

/** Round hub caps / fog lamp lens (small) */
export function makeFogLens() {
  const [c, g] = canvas(128, 128);
  const rg = g.createRadialGradient(54, 50, 4, 64, 64, 60);
  rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.4, '#c8cdd0'); rg.addColorStop(0.8, '#6c7276'); rg.addColorStop(1, '#2a2d30');
  g.fillStyle = rg;
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#25272a'; g.lineWidth = 8; g.stroke();
  return tex(c, { aniso: 4 });
}

/** Louvre field for the engine / side vents (repeats). */
export function makeVent() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#2a2d30';
  g.fillRect(0, 0, 128, 128);
  for (let y = 4; y < 128; y += 12) {
    g.fillStyle = '#0a0b0c'; g.fillRect(0, y, 128, 6);
    g.fillStyle = '#3d4044'; g.fillRect(0, y + 6, 128, 2);
  }
  return tex(c, { repeat: true, aniso: 4 });
}

/** Blue-grey seat moquette: mottled fabric with dark brush strokes. kind 'pad' | 'cushion' */
export function makeMoquette(kind = 'pad') {
  const [c, g] = canvas(256, 256);
  const r = mulberry32(kind === 'pad' ? 31 : 77);
  const base = kind === 'pad' ? '#6d7f9c' : '#233f8f';
  const dark = kind === 'pad' ? '#2f4676' : '#12276a';
  const light = kind === 'pad' ? '#9db0c9' : '#3c5cb0';
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 18 + r() * 40;
    g.strokeStyle = r() < 0.55 ? dark : light;
    g.globalAlpha = 0.35 + r() * 0.4;
    g.lineWidth = 2 + r() * 3;
    g.lineCap = 'round';
    for (const ox of [0, -256, 256]) for (const oy of [0, -256, 256]) {
      g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + 6, y + oy + Math.sin(a) * l * 0.5 - 6, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
    }
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  return tex(c, { repeat: true, aniso: 4 });
}

/** Grey rubber floor with a regular stud pattern (512 px = 0.5 m). */
export function makeFloor() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#5c5f62';
  g.fillRect(0, 0, 256, 256);
  const r = mulberry32(9);
  for (let i = 0; i < 2500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; g.fillRect(r() * 256, r() * 256, 2, 2); }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const cx = x * 32 + 16 + (y % 2) * 16, cy = y * 32 + 16;
    const rg = g.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 8);
    rg.addColorStop(0, '#8d9094'); rg.addColorStop(1, '#4a4c4f');
    g.fillStyle = rg;
    for (const ox of [0, -256]) { g.beginPath(); g.arc(cx + ox, cy, 7, 0, Math.PI * 2); g.fill(); }
  }
  return tex(c, { repeat: true, aniso: 8 });
}

/** Ceiling panel: light warm grey, faint seams (repeat). */
export function makeCeiling() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c9c6bb';
  g.fillRect(0, 0, 256, 256);
  const r = mulberry32(5);
  for (let i = 0; i < 700; i++) { const v = 190 + r() * 40; g.fillStyle = `rgba(${v},${v - 3},${v - 10},0.14)`; g.fillRect(r() * 256, r() * 256, 1.5, 1.5); }
  g.strokeStyle = '#a9a69b';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 1); g.lineTo(256, 1); g.moveTo(1, 0); g.lineTo(1, 256); g.stroke();
  return tex(c, { repeat: true });
}

/** Ribbed alloy turntable plate. */
export function makeTurntable() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#6a6e72';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 16) { g.fillStyle = '#85898d'; g.fillRect(i, 0, 8, 256); g.fillStyle = '#4c5054'; g.fillRect(i + 8, 0, 3, 256); }
  return tex(c, { repeat: true, aniso: 4 });
}

/** Blue validator terminal face (0.11 x 0.20 m): dark screen, buttons. */
export function makeValidator() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#1b6fb8';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#0b1a24';
  g.fillRect(14, 20, 100, 110);
  const rg = g.createLinearGradient(14, 20, 114, 130);
  rg.addColorStop(0, '#2f7f66'); rg.addColorStop(1, '#173b52');
  g.fillStyle = rg;
  g.fillRect(20, 26, 88, 98);
  g.fillStyle = '#d8e9ee';
  g.fillRect(28, 38, 50, 6); g.fillRect(28, 52, 64, 5);
  g.fillStyle = '#0b2438';
  g.fillRect(22, 150, 84, 22);
  g.fillStyle = '#e8eef2';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(34 + i * 30, 205, 10, 0, Math.PI * 2); g.fill(); }
  return tex(c, { aniso: 4 });
}

/** Wide light panel texture for the cab dash top (leather-grain dark grey). */
export function makeDashGrain() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#2b2d30';
  g.fillRect(0, 0, 128, 128);
  const r = mulberry32(3);
  for (let i = 0; i < 1500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.18)'; g.fillRect(r() * 128, r() * 128, 1.5, 1.5); }
  return tex(c, { repeat: true });
}

export { canvas, tex };
void THREE;
