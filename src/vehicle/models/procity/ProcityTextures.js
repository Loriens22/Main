// Procedural canvas textures of the BMC Procity 12 CNG (Sofia livery). Nothing here is traced or projected
// from the reference photos: every graphic is drawn from primitives. Shared helpers: ../../BusTextures.js.
import * as THREE from 'three';
import { mulberry32 } from '../../../core/rng.js';
import { canvas, tex, drawWheelchair } from '../../BusTextures.js';

/** Atlas rectangle in canvas pixels -> [u0, v0, u1, v1] (v up, matching flipY canvas textures). */
export const rectUV = (W, H, x, y, w, h) => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

const rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };

/* ------------------------------------------------------------------ registration plate */
export function makePlate(text = 'CB 5156 HA') {
  const [c, g] = canvas(1040, 224);
  g.fillStyle = '#0d0e10';
  g.fillRect(0, 0, 1040, 224);
  rr(g, 8, 8, 1024, 208, 14);
  g.fillStyle = '#f6f6f1';
  g.fill();
  g.strokeStyle = '#18191b';
  g.lineWidth = 5;
  g.stroke();
  g.save();
  rr(g, 8, 8, 112, 208, 14);
  g.clip();
  g.fillStyle = '#1b3f9c';
  g.fillRect(8, 8, 112, 208);
  g.restore();
  g.fillStyle = '#ffd400';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath(); g.arc(64 + Math.cos(a) * 32, 66 + Math.sin(a) * 32, 5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 54px Arial';
  g.textAlign = 'center';
  g.fillText('BG', 64, 196);
  g.save();
  g.fillStyle = '#0c0c0c';
  g.font = 'bold 178px "DIN Alternate", "Arial Narrow", "Liberation Sans Narrow", Arial';
  g.textBaseline = 'alphabetic';
  const w = g.measureText(text).width;
  const k = Math.min(0.9, 860 / w);
  g.translate(580, 178);
  g.scale(k, 1);
  g.textAlign = 'center';
  g.fillText(text, 0, 0);
  g.restore();
  return tex(c, { aniso: 8 });
}

/* ------------------------------------------------------------------ small drawing helpers */
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
function drawArms(g, x, y, w, h) {
  g.save();
  g.translate(x, y);
  g.scale(w / 100, h / 170);
  g.lineJoin = 'round';
  // crown
  g.fillStyle = '#d4a017';
  g.beginPath(); g.moveTo(22, 40); g.lineTo(18, 8); g.lineTo(36, 24); g.lineTo(50, 2); g.lineTo(64, 24); g.lineTo(82, 8); g.lineTo(78, 40); g.closePath(); g.fill();
  g.strokeStyle = '#7a5a0a'; g.lineWidth = 2; g.stroke();
  // shield
  g.beginPath(); g.moveTo(14, 48); g.lineTo(86, 48); g.lineTo(86, 100); g.quadraticCurveTo(86, 140, 50, 162); g.quadraticCurveTo(14, 140, 14, 100); g.closePath();
  g.fillStyle = '#f4f1e6'; g.fill(); g.strokeStyle = '#3a3a3a'; g.lineWidth = 3; g.stroke();
  g.save(); g.clip();
  g.fillStyle = '#d9402e'; g.fillRect(14, 48, 72, 38); // red field
  g.fillStyle = '#e8b023'; g.beginPath(); g.arc(50, 76, 13, 0, Math.PI * 2); g.fill(); // sun
  g.fillStyle = '#2f86c8'; g.fillRect(14, 86, 72, 26); // blue
  g.fillStyle = '#3d9a4a'; g.beginPath(); g.moveTo(14, 118); g.quadraticCurveTo(40, 96, 50, 112); g.quadraticCurveTo(64, 98, 86, 118); g.lineTo(86, 170); g.lineTo(14, 170); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = '#3a3a3a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(14, 48); g.lineTo(86, 48); g.lineTo(86, 100); g.quadraticCurveTo(86, 140, 50, 162); g.quadraticCurveTo(14, 140, 14, 100); g.closePath(); g.stroke();
  g.restore();
}

/** One slender pointed blade hanging from (x, y): tip down, base up (the top base is hidden under the green strip). */
function blade(g, x, y, len, wid, ang, fill, rib) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(-wid / 2, -len * 0.15);
  g.bezierCurveTo(-wid * 0.62, len * 0.35, -wid * 0.3, len * 0.8, wid * 0.05, len);
  g.bezierCurveTo(wid * 0.34, len * 0.78, wid * 0.62, len * 0.3, wid / 2, -len * 0.15);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = rib;
  g.lineWidth = Math.max(1, wid * 0.08);
  g.beginPath(); g.moveTo(0, -len * 0.05); g.quadraticCurveTo(wid * 0.05, len * 0.5, wid * 0.05, len * 0.92); g.stroke();
  g.restore();
}

const GREENS = [['#14522a', '#0b3a1b'], ['#1f6e34', '#134f23'], ['#2f8a3a', '#1f6b2c'], ['#4aa341', '#2f8a3a'], ['#74b83c', '#4f9a35'], ['#9bcb4a', '#6fb23c']];

/** Fringe of hanging blades across [x0, x0 + w], top edge at y0 (canvas px). */
function bladeCluster(g, rnd, x0, y0, w, ppm, maxLen) {
  const n = Math.round((w / ppm) * 38);
  const items = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const edge = Math.min(t, 1 - t) < 0.05;
    const x = x0 + t * w + (rnd() - 0.5) * (w / n) * 1.6;
    const layer = Math.floor(rnd() * GREENS.length);
    const len = (0.12 + rnd() * 0.17) * ppm * (edge ? 0.7 : 1) * (maxLen / 0.3);
    items.push({ x, len, wid: (0.05 + rnd() * 0.035) * ppm, ang: (rnd() - 0.5) * 0.5 + (t - 0.5) * 0.18, layer });
  }
  items.sort((a, b) => a.layer - b.layer);
  for (const it of items) blade(g, it.x, y0 - 0.02 * ppm, it.len, it.wid, it.ang, GREENS[it.layer][0], GREENS[it.layer][1]);
  // dense strip along the top so no white shows between the blade bases
  const grd = g.createLinearGradient(0, y0, 0, y0 + 0.06 * ppm);
  grd.addColorStop(0, '#1b5f2e');
  grd.addColorStop(1, 'rgba(27,95,46,0)');
  g.fillStyle = grd;
  g.fillRect(x0, y0, w, 0.06 * ppm);
}

/** CNG leaf mark: a green drop with a leaf. */
function drawCngMark(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = '#1d8a3f';
  g.beginPath(); g.moveTo(0, -10); g.bezierCurveTo(10, -2, 10, 10, 0, 12); g.bezierCurveTo(-10, 10, -10, -2, 0, -10); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, 10); g.quadraticCurveTo(1, 0, 0, -6); g.stroke();
  g.restore();
}

/** Big rear leaf logo: three fanned green leaves. */
function drawLeaves(g, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  const leaf = (ang, len, col, rib) => {
    g.save();
    g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-0.55 * len, -0.25 * len, -0.4 * len, -0.85 * len, 0, -len); g.bezierCurveTo(0.4 * len, -0.85 * len, 0.55 * len, -0.25 * len, 0, 0); g.closePath();
    g.fillStyle = col; g.fill();
    g.strokeStyle = rib; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -len * 0.88); g.stroke();
    g.restore();
  };
  leaf(-0.9, 70, '#2f8f3e', '#1d6a2b');
  leaf(0.9, 70, '#3aa04a', '#1d6a2b');
  leaf(0, 86, '#58b84a', '#2f8f3e');
  g.restore();
}

/* ------------------------------------------------------------------ livery atlas (shared by every bus) */
let livery = null;
/**
 * Leaf-blade fringes (alpha-tested sprites hanging from the belt line), Sofia emblem, "CNG bus by BMC" text,
 * "PROCITY CNG" label and small stickers. Returns { texture, uv:{name:[u0,v0,u1,v1]}, size:{name:[w,h]} (metres) }.
 */
export function makeLiveryAtlas() {
  if (livery) return livery;
  const W = 4096, H = 1024, ppm = 400;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const rnd = mulberry32(1411);
  const uv = {}, size = {};
  let x = 0;
  const hM = 0.44;
  for (const [name, wM] of [['f35', 3.5], ['f24', 2.4], ['f16', 1.6], ['f10', 1.0], ['f05', 0.55], ['f03', 0.3]]) {
    const w = Math.round(wM * ppm), h = Math.round(hM * ppm);
    g.save();
    g.beginPath(); g.rect(x, 0, w, h); g.clip();
    bladeCluster(g, rnd, x + 4, 0, w - 8, ppm, 0.3);
    g.restore();
    uv[name] = rectUV(W, H, x, 0, w, h);
    size[name] = [wM, hM];
    x += w + 6;
  }
  // Sofia emblem (0.11 x 0.19 m)
  const ey = 230;
  drawArms(g, 8, ey, 110, 190);
  uv.arms = rectUV(W, H, 8, ey, 110, 190);
  size.arms = [0.12, 0.2];
  // "CNG bus by BMC" (green leaf-type, blue BMC), pod side: 1.0 x 0.2 m
  {
    const tx = 140, ty = 240, tw = 520, th = 110;
    g.fillStyle = '#1d8a3f';
    g.font = 'italic bold 78px "Trebuchet MS", Arial';
    g.textBaseline = 'alphabetic';
    g.fillText('CNG', tx + 36, ty + 84);
    drawCngMark(g, tx + 16, ty + 28, 1.9);
    g.font = 'italic bold 52px "Trebuchet MS", Arial';
    g.fillText('bus by', tx + 196, ty + 84);
    g.fillStyle = '#1b4aa0';
    g.font = 'bold 64px Arial';
    g.fillText('BMC', tx + 370, ty + 84);
    uv.cngBus = rectUV(W, H, tx, ty, tw, th);
    size.cngBus = [tw / 520, th / 520];
  }
  // "PROCITY·CNG" side label, 0.34 x 0.07 m (dark grey with a small blue mark)
  {
    const tx = 700, ty = 240, tw = 340, th = 70;
    g.fillStyle = '#4b5056';
    g.font = 'italic bold 48px Arial';
    g.fillText('PROCITY·CNG', tx + 14, ty + 54);
    g.fillStyle = '#2f6fb8';
    g.fillRect(tx + tw - 30, ty + 14, 22, 8);
    uv.label = rectUV(W, H, tx, ty, tw, th);
    size.label = [0.34, 0.07];
  }
  // small square stickers: CNG diamond, blue priority, green exit, plus pictogram pairs
  {
    const sx = 1100, sy = 240, s = 100;
    g.save(); g.translate(sx + s / 2, sy + s / 2); g.rotate(Math.PI / 4); g.fillStyle = '#1d8a5a'; g.fillRect(-32, -32, 64, 64); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(-27, -27, 54, 54); g.restore();
    g.fillStyle = '#fff'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('CNG', sx + s / 2, sy + s / 2 + 9);
    uv.diamond = rectUV(W, H, sx, sy, s, s);
    size.diamond = [0.1, 0.1];
    const px = 1220;
    g.fillStyle = '#f4f4f0'; g.fillRect(px, sy, s, s);
    pictogram(g, 'wheel', px + 50, sy + 26, 22); pictogram(g, 'pram', px + 50, sy + 74, 22);
    uv.sticker = rectUV(W, H, px, sy, s, s);
    size.sticker = [0.1, 0.1];
    const qx = 1340;
    g.fillStyle = '#1862b8'; g.fillRect(qx, sy, 200, 70);
    pictogram(g, 'pram', qx + 36, sy + 35, 28); pictogram(g, 'wheel', qx + 100, sy + 35, 28); pictogram(g, 'walk', qx + 164, sy + 35, 28);
    uv.stickerBar = rectUV(W, H, qx, sy, 200, 70);
    size.stickerBar = [0.25, 0.0875];
    g.textAlign = 'left';
  }
  const t = tex(c, { aniso: 8 });
  t.userData.shared = true;
  livery = { texture: t, uv, size };
  return livery;
}

/* ------------------------------------------------------------------ per-bus decal sheet (front, rear, side numbers) */
export function makeDecalSheet(fleet = '1411') {
  const W = 2048, H = 1024, ppm = 1000;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const rects = {};
  const fnum = (x, y, w, h, col) => {
    g.save();
    g.fillStyle = col;
    g.font = 'bold 200px "DIN Alternate", "Arial Narrow", "Liberation Sans Narrow", Arial';
    g.textBaseline = 'alphabetic';
    const tw = g.measureText(fleet).width;
    g.translate(x, y + h * 0.9);
    g.scale(w / tw, h / 150);
    g.fillText(fleet, 0, 0);
    g.restore();
  };
  // front fleet number: white digits 0.12 m tall, 0.34 m wide
  fnum(10, 10, 340, 130, '#f6f6f2');
  rects.fleetFront = rectUV(W, H, 4, 4, 352, 150);
  // rear fleet number: white 0.12 m tall
  fnum(390, 10, 300, 130, '#f2f4f6');
  rects.fleetRear = rectUV(W, H, 384, 4, 312, 150);
  // small black number on the side glass (0.1 m)
  fnum(720, 14, 150, 100, '#0c0c0c');
  rects.fleetSide = rectUV(W, H, 714, 4, 164, 120);
  // blue pictograms on the black band (wheelchair, walker, pram): 0.1 m discs
  ['wheel', 'walk', 'pram'].forEach((k, i) => pictogram(g, k, 960 + i * 110, 60, 50));
  rects.picto = rectUV(W, H, 905, 5, 340, 110);
  // CNG diamond on the bumper (0.1 m) + small round 'CNG' leaf
  g.save(); g.translate(1330, 60); g.rotate(Math.PI / 4); g.fillStyle = '#1d8a5a'; g.fillRect(-36, -36, 72, 72); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(-30, -30, 60, 60); g.restore();
  g.fillStyle = '#fff'; g.font = 'bold 28px Arial'; g.textAlign = 'center'; g.fillText('CNG', 1330, 70);
  rects.diamond = rectUV(W, H, 1270, 0, 120, 120);
  // BMC front badge (silver letters on transparent), 0.16 x 0.05 m
  g.fillStyle = '#9ea3a8';
  g.font = 'bold 86px "Arial Black", "Arial Narrow", Arial';
  g.textAlign = 'left';
  g.save(); g.translate(1420, 98); g.scale(1.1, 1); g.fillText('BMC', 0, 0); g.restore();
  rects.bmcFront = rectUV(W, H, 1410, 20, 280, 100);
  // rear: BMC (light grey), euro6 (white italic), CNG (green)
  g.fillStyle = '#c9ccd0';
  g.font = 'bold 100px "Arial Black", Arial';
  g.save(); g.translate(20, 290); g.scale(1.1, 1); g.fillText('BMC', 0, 0); g.restore();
  rects.bmcRear = rectUV(W, H, 10, 190, 340, 130);
  g.fillStyle = '#eef0f2';
  g.font = 'italic bold 70px Arial';
  g.fillText('euro6', 380, 285);
  rects.euro6 = rectUV(W, H, 370, 210, 240, 100);
  g.fillStyle = '#26a64b';
  g.font = 'bold 92px "Arial Black", Arial';
  g.fillText('CNG', 660, 290);
  drawCngMark(g, 790, 215, 2.4);
  rects.cngRear = rectUV(W, H, 650, 190, 270, 130);
  // rear leaf logo (0.34 x 0.26 m) and Sofia emblem (rear)
  drawLeaves(g, 1070, 460, 1.9);
  rects.leaves = rectUV(W, H, 940, 300, 270, 190);
  drawArms(g, 1250, 190, 80, 140);
  rects.armsRear = rectUV(W, H, 1245, 185, 90, 150);
  // priority sticker for the glass, 0.12 x 0.17
  g.fillStyle = '#f4f4f0'; g.fillRect(1400, 190, 120, 170);
  g.strokeStyle = '#1862b8'; g.lineWidth = 6; g.strokeRect(1404, 194, 112, 162);
  pictogram(g, 'wheel', 1460, 245, 36); pictogram(g, 'pram', 1460, 315, 36);
  rects.glassSticker = rectUV(W, H, 1400, 190, 120, 170);
  void ppm;
  return { texture: tex(c, { aniso: 8 }), rects };
}

/* ------------------------------------------------------------------ front silver band, lamp clusters */
/** Brushed silver / grey band: lighter on top, darker below, soft highlight line. Used with v = 0..1 over the band height. */
export function makeSilverBand() {
  const [c, g] = canvas(64, 128);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#e2e4e5');
  grd.addColorStop(0.18, '#cfd2d4');
  grd.addColorStop(0.5, '#a5a9ad');
  grd.addColorStop(0.85, '#85898d');
  grd.addColorStop(1, '#6f7377');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, 6, 64, 3);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 122, 64, 3);
  return tex(c, { aniso: 4 });
}

/**
 * Front lamp cluster for the bus RIGHT side (0.34 x 0.46 m): black housing with two round lenses and a column of
 * LED dots on the inner edge. Returns [colour map, emissive map]. Mirror the uv for the left side.
 */
export function makeHeadCluster() {
  const W = 340, H = 460;
  const mk = (em, rm = false) => {
    const [c, g] = canvas(W, H);
    if (rm) {
      // roughness (G) / metalness (B): matte black housing, polished reflector bowls and LED bezels
      g.fillStyle = 'rgb(0,150,0)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgb(0,25,255)';
      for (const cy of [130, 250]) { g.beginPath(); g.arc(130, cy, 62, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(270 - i * 4, 150 + i * 36, 13, 0, Math.PI * 2); g.fill(); }
      return tex(c, { aniso: 8, srgb: false });
    }
    g.fillStyle = em ? '#000' : '#0c0d0f';
    g.fillRect(0, 0, W, H);
    // outer end is on the left (towards the corner), LED column on the right (towards the centre)
    for (const [cy] of [[130], [250]]) {
      const cx = 130;
      const rg = g.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, 58);
      if (em) { rg.addColorStop(0, '#fff'); rg.addColorStop(0.6, '#cfc9b8'); rg.addColorStop(1, '#201c18'); } else { rg.addColorStop(0, '#f4f6f7'); rg.addColorStop(0.3, '#b0b6bb'); rg.addColorStop(0.7, '#5f656b'); rg.addColorStop(1, '#22252a'); }
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, cy, 58, 0, Math.PI * 2); g.fill();
      g.strokeStyle = em ? '#000' : '#2b2e33'; g.lineWidth = 8;
      g.beginPath(); g.arc(cx, cy, 62, 0, Math.PI * 2); g.stroke();
    }
    // LED column
    for (let i = 0; i < 5; i++) {
      g.fillStyle = em ? '#ffffff' : '#e8edf0';
      g.beginPath(); g.arc(270 - i * 4, 150 + i * 36, 11, 0, Math.PI * 2); g.fill();
    }
    return tex(c, { aniso: 8 });
  };
  return [mk(false), mk(true), mk(false, true)];
}

/** Rear lamp cluster (0.13 x 0.34 m, light-grey housing): red lens above, reverse lens below. */
export function makeTailCluster() {
  const [c, g] = canvas(130, 340);
  g.fillStyle = '#8c9094';
  g.fillRect(0, 0, 130, 340);
  g.fillStyle = '#6c7075';
  g.fillRect(0, 0, 130, 14);
  return tex(c, { aniso: 4 });
}

/* ------------------------------------------------------------------ interior */
/** Light grey rubber floor with fine flecks: 512 px = 0.5 m. */
export function makeFloorTex() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#8e8f8c';
  g.fillRect(0, 0, 512, 512);
  const r = mulberry32(21);
  const fleck = (n, col, s0, s1) => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = r() * 512, y = r() * 512, s = s0 + r() * (s1 - s0);
      for (const ox of [0, x > 480 ? -512 : 0]) for (const oy of [0, y > 480 ? -512 : 0]) g.fillRect(x + ox, y + oy, s, s * (0.6 + r() * 0.8));
    }
  };
  fleck(2400, 'rgba(170,171,168,0.6)', 1, 3);
  fleck(2800, '#b6b7b3', 1, 3);
  fleck(1800, '#5f6260', 1, 3);
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
  g.fillStyle = '#353b42';
  g.fillRect(0, 0, 128, 128);
  const r = mulberry32(3);
  for (let y = 0; y < 128; y += 2) for (let x = (y / 2) % 2 ? 1 : 0; x < 128; x += 2) {
    g.fillStyle = r() > 0.5 ? '#3c424a' : '#2e343a';
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

export { THREE };
