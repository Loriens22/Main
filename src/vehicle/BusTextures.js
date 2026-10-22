// Canvas-generated textures for the MAN bus: Sofia green-leaf livery,
// decals (fleet number, registration plate, pictograms, badges), interior
// floor, vent grilles, seat moquette, warning stickers.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

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

export function drawWheelchair(g, cx, cy, k, col) {
  g.save();
  g.translate(cx, cy);
  g.scale(k, k);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath(); g.arc(-4, 14, 18, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(-2, -30, 7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-4, -20); g.lineTo(-4, 2); g.lineTo(16, 2); g.lineTo(24, 22); g.stroke();
  g.restore();
}

function leaf(g, x, y, len, wid, ang, col, vein) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid, -len * 0.25, wid * 0.9, -len * 0.7, 0, -len);
  g.bezierCurveTo(-wid * 0.9, -len * 0.7, -wid, -len * 0.25, 0, 0);
  g.fillStyle = col;
  g.fill();
  if (vein) {
    g.strokeStyle = vein;
    g.lineWidth = Math.max(1, wid * 0.08);
    g.beginPath();
    g.moveTo(0, -len * 0.05);
    g.quadraticCurveTo(wid * 0.1, -len * 0.5, 0, -len * 0.95);
    g.stroke();
  }
  g.restore();
}

/**
 * Side livery: white with Sofia's green botanical graphics along the lower
 * side. Texture spans the full 18 m length (u) and the skirt height (v).
 */
export function makeLivery(seed = 5) {
  const W = 4096, H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#f3f3ef';
  g.fillRect(0, 0, W, H);
  const r = mulberry32(seed);
  const greens = ['#2f8f3f', '#3fa64a', '#62b947', '#8cc63f', '#1f6e33', '#a6d15a'];
  // leaf clusters grow from the lower edge; denser around the wheel arches
  const clusters = [0.06, 0.13, 0.2, 0.3, 0.38, 0.47, 0.55, 0.62, 0.71, 0.79, 0.87, 0.95];
  for (const cx of clusters) {
    const n = 7 + Math.floor(r() * 7);
    for (let i = 0; i < n; i++) {
      const x = (cx + (r() - 0.5) * 0.07) * W;
      const len = H * (0.45 + r() * 0.6);
      const wid = len * (0.12 + r() * 0.1);
      const ang = (r() - 0.5) * 1.3;
      leaf(g, x, H + 4, len, wid, ang, greens[Math.floor(r() * greens.length)], 'rgba(255,255,255,0.35)');
    }
  }
  // small sprigs between clusters
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const len = H * (0.15 + r() * 0.25);
    leaf(g, x, H + 2, len, len * 0.18, (r() - 0.5) * 1.6, greens[Math.floor(r() * greens.length)], null);
  }
  // thin dark green base line
  g.fillStyle = '#1e5a2c';
  g.fillRect(0, H - 6, W, 6);
  return tex(c);
}

export function makePlate(text = 'CB 5696 HM') {
  const [c, g] = canvas(520, 112);
  g.fillStyle = '#fbfbf7';
  g.fillRect(0, 0, 520, 112);
  g.strokeStyle = '#111';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 514, 106);
  g.fillStyle = '#1d3f9a';
  g.fillRect(6, 6, 56, 100);
  g.fillStyle = '#ffd400';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.arc(34 + Math.cos(a) * 16, 38 + Math.sin(a) * 16, 2.6, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 30px Arial';
  g.textAlign = 'center';
  g.fillText('BG', 34, 94);
  g.fillStyle = '#111';
  g.font = 'bold 74px "DIN Alternate", "Arial Narrow", Arial';
  g.textBaseline = 'middle';
  g.fillText(text, 290, 60, 440);
  return tex(c);
}

/** Front decals sheet: fleet number, pictograms (pram, wheelchair, walking person), CNG diamond. */
export function makeFrontDecals(fleet = '3145') {
  const [c, g] = canvas(1024, 256);
  g.clearRect(0, 0, 1024, 256);
  // fleet number
  g.fillStyle = '#121212';
  g.font = 'bold 150px "Arial Narrow", Arial';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(fleet, 380, 130, 360);
  // pictograms
  const pics = ['pram', 'wheel', 'walk'];
  pics.forEach((p, i) => {
    const cx = 60 + i * 105, cy = 130;
    g.fillStyle = '#1a5fb4';
    g.beginPath();
    g.arc(cx, cy, 48, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineWidth = 7;
    g.lineCap = 'round';
    if (p === 'wheel') {
      g.beginPath(); g.arc(cx - 4, cy + 14, 18, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx - 2, cy - 30, 7, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx - 4, cy - 20); g.lineTo(cx - 4, cy + 2); g.lineTo(cx + 16, cy + 2); g.lineTo(cx + 24, cy + 22); g.stroke();
    } else if (p === 'walk') {
      g.beginPath(); g.arc(cx, cy - 30, 8, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx, cy - 20); g.lineTo(cx - 2, cy + 8); g.lineTo(cx - 14, cy + 32); g.moveTo(cx - 2, cy + 8); g.lineTo(cx + 12, cy + 32);
      g.moveTo(cx - 14, cy - 2); g.lineTo(cx, cy - 14); g.lineTo(cx + 14, cy - 2); g.stroke();
    } else {
      g.beginPath(); g.arc(cx - 8, cy + 28, 7, 0, Math.PI * 2); g.arc(cx + 14, cy + 28, 7, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx - 22, cy - 6); g.quadraticCurveTo(cx - 20, cy + 16, cx + 2, cy + 16); g.lineTo(cx + 20, cy + 16); g.lineTo(cx + 22, cy - 6); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(cx + 22, cy - 6); g.lineTo(cx + 26, cy - 26); g.stroke();
    }
  });
  // CNG diamond
  g.save();
  g.translate(900, 128);
  g.rotate(Math.PI / 4);
  g.fillStyle = '#1f8a3c';
  g.fillRect(-58, -58, 116, 116);
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  g.strokeRect(-50, -50, 100, 100);
  g.restore();
  g.fillStyle = '#fff';
  g.font = 'bold 44px Arial';
  g.textAlign = 'center';
  g.fillText('CNG', 900, 132);
  return tex(c);
}

export function makeManGrille() {
  const [c, g] = canvas(512, 160);
  const grd = g.createLinearGradient(0, 0, 0, 160);
  grd.addColorStop(0, '#0a0b0c');
  grd.addColorStop(1, '#16181a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 160);
  // chrome lettering
  const tg = g.createLinearGradient(0, 40, 0, 120);
  tg.addColorStop(0, '#f4f5f6');
  tg.addColorStop(0.5, '#8b9095');
  tg.addColorStop(0.55, '#5c6166');
  tg.addColorStop(1, '#d9dcdf');
  g.fillStyle = tg;
  g.font = 'bold 100px "Arial Black", Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.scale(1.25, 1);
  g.fillText('MAN', 256 / 1.25, 84);
  g.restore();
  return tex(c);
}

export function makeLionBadge() {
  const [c, g] = canvas(256, 128);
  g.clearRect(0, 0, 256, 128);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#f8f9fa');
  grd.addColorStop(0.5, '#7c8186');
  grd.addColorStop(1, '#e0e3e6');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(10, 64);
  g.quadraticCurveTo(128, 20, 246, 64);
  g.quadraticCurveTo(128, 108, 10, 64);
  g.fill();
  // stylised lion head in relief
  g.fillStyle = '#2b2e31';
  g.beginPath();
  g.ellipse(128, 64, 22, 18, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c9cdd1';
  g.beginPath();
  g.ellipse(132, 66, 12, 10, 0, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}
