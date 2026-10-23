// Canvas-generated textures for the MAN bus exterior: Sofia green-leaf fringe,
// registration plate, front decals (fleet number, pictograms, CNG diamond),
// grille, lion emblem, lamp units, louvres and side stickers. The interior
// textures (BusInteriorTextures.js) share `canvas`, `tex` and `drawWheelchair`.
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

/** Atlas rectangle in canvas pixels -> [u0, v0, u1, v1] (v up, matching flipY canvas textures). */
const rectUV = (W, H, x, y, w, h) => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

/* ------------------------------------------------------------------ leaf fringe */
const LEAF = { darker: '#0b3822', dark: '#1f5e44', mid: '#3d8f55', light: '#6fb35a', pale: '#9ccc6a', outline: '#eef3e8' };

/** One teardrop leaf hanging from (x, y): rounded broad top, sharp tip pointing down. */
function leaf(g, x, y, len, wid, ang, fill, rib) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, -len * 0.25);
  g.bezierCurveTo(wid * 0.62, -len * 0.22, wid * 0.55, len * 0.62, 0, len);
  g.bezierCurveTo(-wid * 0.55, len * 0.62, -wid * 0.62, -len * 0.22, 0, -len * 0.25);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.strokeStyle = LEAF.outline;
  g.stroke();
  g.strokeStyle = rib;
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(0, -len * 0.1);
  g.quadraticCurveTo(wid * 0.06, len * 0.45, 0, len * 0.88);
  g.stroke();
  g.restore();
}

/** A cluster of hanging leaves across [x0, x0 + w] with the sill at y0 (pixels). */
function cluster(g, rnd, x0, y0, w, ppm, density = 9) {
  const n = Math.max(3, Math.round((w / ppm) * density));
  const pitch = w / n;
  const layers = [[LEAF.darker, LEAF.dark, 0.2], [LEAF.dark, LEAF.mid, 0.34], [LEAF.mid, LEAF.light, 0.3], [LEAF.light, LEAF.pale, 0.16]];
  const items = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const edge = Math.min(t, 1 - t) < 0.12; // leaves at the cluster ends are shorter and lean outwards
    const x = x0 + (i + 0.5) * pitch + (rnd() - 0.5) * pitch * 0.9;
    const len = (0.25 + rnd() * 0.13) * ppm * (edge ? 0.8 : 1);
    const wid = len * (0.56 + rnd() * 0.16);
    const lean = (t < 0.5 ? 1 : -1) * (edge ? 0.28 : 0.04);
    items.push({ x, len, wid, ang: (rnd() - 0.5) * 0.52 + lean, layer: pick(rnd, layers) });
  }
  items.sort((a, b) => a.layer.order - b.layer.order);
  for (const it of items) leaf(g, it.x, y0, it.len, it.wid, it.ang, it.layer.fill, it.layer.rib);
}

function pick(rnd, layers) {
  let r = rnd(), acc = 0;
  for (let i = 0; i < layers.length; i++) {
    acc += layers[i][2];
    if (r <= acc || i === layers.length - 1) return { fill: layers[i][0], rib: layers[i][1], order: i };
  }
}

/** Small multicolour vertical logo (Sofia mobility mark): head, body, a leaf. */
function drawLogo(g, x, y, w, h) {
  g.save();
  g.translate(x, y);
  const cx = w / 2;
  g.fillStyle = '#f0a030';
  g.beginPath(); g.arc(cx, h * 0.17, w * 0.34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2d7fc1';
  g.beginPath(); g.moveTo(w * 0.08, h * 0.95); g.quadraticCurveTo(w * 0.04, h * 0.5, cx, h * 0.46); g.quadraticCurveTo(w * 0.96, h * 0.5, w * 0.92, h * 0.95); g.closePath(); g.fill();
  g.fillStyle = '#47a65a';
  g.beginPath(); g.moveTo(cx, h * 0.56); g.quadraticCurveTo(w * 0.85, h * 0.62, cx, h * 0.9); g.quadraticCurveTo(w * 0.15, h * 0.62, cx, h * 0.56); g.fill();
  g.fillStyle = '#d9402e';
  g.beginPath(); g.arc(cx, h * 0.17, w * 0.1, 0, Math.PI * 2); g.fill();
  g.restore();
}

/**
 * Leaf fringe sprites (alpha-tested quads that hang from the belt line) and the
 * small logo. Shared by every bus: returns { texture, uv: {name: [u0, v0, u1, v1]}, size: {name: [w, h] in metres} }.
 */
let leafAtlas = null;
export function makeLeafAtlas() {
  if (leafAtlas) return leafAtlas;
  const W = 4096, H = 512, ppm = 400;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const rnd = mulberry32(2319);
  const sprites = [['big', 2.0], ['wide', 2.45], ['mid', 1.45], ['small', 0.65]];
  const hM = 0.42; // sprite height (m)
  let x = 0;
  const uv = {}, size = {};
  for (const [name, wM] of sprites) {
    const w = Math.round(wM * ppm), h = Math.round(hM * ppm);
    g.save();
    g.beginPath(); g.rect(x, 0, w, h); g.clip();
    cluster(g, rnd, x + 6, 0, w - 12, ppm);
    g.restore();
    uv[name] = rectUV(W, H, x, 0, w, h);
    size[name] = [wM, hM];
    x += w + 8;
  }
  // logo (drawn at 2x the leaf resolution)
  const lw = 140, lh = 250;
  drawLogo(g, 8, 220, lw, lh);
  uv.logo = rectUV(W, H, 8, 220, lw, lh);
  size.logo = [0.17, 0.30];
  const t = tex(c, { aniso: 8 });
  t.userData.shared = true;
  leafAtlas = { texture: t, uv, size };
  return leafAtlas;
}

/** Back-compat alias: the livery is now leaf sprites on a plain white body. */
export function makeLivery() {
  return makeLeafAtlas().texture;
}

/* ------------------------------------------------------------------ plate */
export function makePlate(text = 'CB 5696 HM') {
  // 0.54 x 0.15 m holder: black frame, 0.52 x 0.112 plate, strip of small text below
  const [c, g] = canvas(1080, 300);
  g.fillStyle = '#0e0f10';
  g.fillRect(0, 0, 1080, 300);
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  rr(20, 14, 1040, 224, 10);
  g.fillStyle = '#f7f7f2';
  g.fill();
  g.strokeStyle = '#111';
  g.lineWidth = 5;
  g.stroke();
  // EU band with the BG code
  g.save();
  rr(20, 14, 112, 224, 10);
  g.clip();
  g.fillStyle = '#1b3f9c';
  g.fillRect(20, 14, 112, 224);
  g.restore();
  g.fillStyle = '#ffd400';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath(); g.arc(76 + Math.cos(a) * 34, 76 + Math.sin(a) * 34, 5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 56px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('BG', 76, 212);
  // registration (condensed heavy grotesque)
  g.save();
  g.fillStyle = '#0c0c0c';
  g.font = 'bold 190px "DIN Alternate", "Arial Narrow", "Liberation Sans Narrow", Arial';
  g.textBaseline = 'alphabetic';
  const w = g.measureText(text).width;
  const k = Math.min(0.82, 880 / w);
  g.translate(590, 202);
  g.scale(k, 1);
  g.textAlign = 'center';
  g.fillText(text, 0, 0);
  g.restore();
  // text strip below the plate
  g.fillStyle = '#9a9ea2';
  g.font = '28px Arial';
  g.textAlign = 'center';
  g.fillText('MAN Truck & Bus · Sofia', 540, 278);
  return tex(c, { aniso: 8 });
}

/* ------------------------------------------------------------------ front decals */
function drawPictogram(g, kind, cx, cy, r) {
  g.fillStyle = '#1560b5';
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = r * 0.06;
  g.beginPath(); g.arc(cx, cy, r * 0.9, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = r * 0.09;
  const k = r / 50;
  g.save();
  g.translate(cx, cy);
  g.scale(k, k);
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
    // pram: hood, body, two wheels, handle
    g.beginPath(); g.moveTo(-24, -4); g.quadraticCurveTo(-22, 16, 0, 16); g.lineTo(20, 16); g.lineTo(22, -6); g.closePath(); g.fill();
    g.beginPath(); g.arc(-10, 28, 6, 0, Math.PI * 2); g.arc(14, 28, 6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(22, -6); g.lineTo(28, -26); g.stroke();
    g.beginPath(); g.arc(-8, -10, 14, Math.PI, Math.PI * 1.5); g.stroke();
  }
  g.restore();
}

/** Front decals sheet. 1333 px per metre. Returns { texture, rects }. */
export function makeFrontDecals(fleet = '3145') {
  const W = 2048, H = 512, ppm = 1333;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  // fleet number: heavy upright condensed grotesque, digits 0.135 m tall in a 0.36 m block
  g.save();
  g.fillStyle = '#0b0b0b';
  g.strokeStyle = '#0b0b0b';
  g.lineWidth = 4;
  g.font = 'bold 250px "DIN Alternate", "Arial Narrow", "Liberation Sans Narrow", Arial';
  g.textBaseline = 'alphabetic';
  const tw = g.measureText(fleet).width;
  g.translate(20, 216);
  g.scale((0.36 * ppm) / tw, 1);
  g.fillText(fleet, 0, 0);
  g.strokeText(fleet, 0, 0);
  g.restore();
  // pictograms (pram, wheelchair, walking person)
  ['pram', 'wheel', 'walk'].forEach((k, i) => drawPictogram(g, k, 660 + i * 200, 128, 94));
  // CNG diamond: green square turned 45 degrees, white border and lettering
  g.save();
  g.translate(1360, 128);
  g.rotate(Math.PI / 4);
  g.fillStyle = '#1d8a5a';
  g.fillRect(-60, -60, 120, 120);
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  g.strokeRect(-52, -52, 104, 104);
  g.restore();
  g.fillStyle = '#fff';
  g.font = 'bold 40px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('CNG', 1360, 130);
  // blue priority sticker for the side windows (pram + wheelchair), 0.40 x 0.18 m at 800 px/m
  const sx = 1500, sy = 20, sw = 320, sh = 144;
  g.fillStyle = '#1560b5';
  g.fillRect(sx, sy, sw, sh);
  g.strokeStyle = '#fff';
  g.lineWidth = 4;
  g.strokeRect(sx + 6, sy + 6, sw - 12, sh - 12);
  drawPictogram(g, 'pram', sx + 80, sy + 72, 46);
  drawPictogram(g, 'wheel', sx + 160, sy + 72, 46);
  drawPictogram(g, 'walk', sx + 240, sy + 72, 46);
  // small black fleet number for the side window (0.12 m digits)
  g.fillStyle = '#0b0b0b';
  g.font = 'bold 70px "Arial Narrow", Arial';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const fw = g.measureText(fleet).width;
  g.save();
  g.translate(1500, 290);
  g.scale(150 / fw, 1);
  g.fillText(fleet, 0, 0);
  g.restore();
  const rects = {
    fleet: rectUV(W, H, 0, 0, 520, 256),
    pram: rectUV(W, H, 660 - 100, 28, 200, 200),
    wheel: rectUV(W, H, 860 - 100, 28, 200, 200),
    walk: rectUV(W, H, 1060 - 100, 28, 200, 200),
    cng: rectUV(W, H, 1260, 28, 200, 200),
    sticker: rectUV(W, H, sx, sy, sw, sh),
    fleetSmall: rectUV(W, H, 1496, 226, 160, 80),
  };
  return { texture: tex(c, { aniso: 8 }), rects };
}

/* ------------------------------------------------------------------ grille, emblem */
/** Gloss black grille with a very fine horizontal texture and a grey bar at each lower outer edge. */
export function makeManGrille() {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#0a0b0c';
  g.fillRect(0, 0, 512, 128);
  for (let y = 0; y < 128; y += 4) {
    g.fillStyle = y % 8 === 0 ? '#131518' : '#08090a';
    g.fillRect(0, y, 512, 2);
  }
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0.07)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#5b6065';
  g.fillRect(6, 96, 46, 8);
  g.fillRect(460, 96, 46, 8);
  return tex(c, { aniso: 8 });
}

/** Lion emblem on a dark recess (0.22 x 0.09 m). */
export function makeLionBadge() {
  const [c, g] = canvas(440, 180);
  g.clearRect(0, 0, 440, 180);
  g.fillStyle = '#2a2c30';
  g.beginPath();
  g.roundRect ? g.roundRect(4, 6, 432, 168, 26) : g.rect(4, 6, 432, 168);
  g.fill();
  const grd = g.createLinearGradient(0, 30, 0, 160);
  grd.addColorStop(0, '#f2f4f5');
  grd.addColorStop(0.5, '#9aa0a5');
  grd.addColorStop(0.6, '#6c7177');
  grd.addColorStop(1, '#d9dde0');
  g.fillStyle = grd;
  // stylised lion in profile, facing left: body, mane, head, legs, tail
  g.beginPath();
  g.moveTo(120, 70); g.quadraticCurveTo(150, 40, 190, 60); // head / mane top
  g.quadraticCurveTo(230, 40, 290, 56); g.quadraticCurveTo(340, 60, 352, 92); // back
  g.quadraticCurveTo(372, 80, 392, 52); g.quadraticCurveTo(388, 96, 356, 112); // tail
  g.lineTo(346, 142); g.lineTo(322, 142); g.lineTo(318, 116); g.lineTo(250, 118);
  g.lineTo(240, 142); g.lineTo(214, 142); g.lineTo(212, 112); g.quadraticCurveTo(170, 128, 150, 112);
  g.quadraticCurveTo(110, 108, 100, 92); g.quadraticCurveTo(96, 78, 120, 70);
  g.closePath();
  g.fill();
  g.fillStyle = '#2a2c30';
  g.beginPath(); g.arc(122, 78, 5, 0, Math.PI * 2); g.fill();
  return tex(c, { aniso: 8 });
}

/* ------------------------------------------------------------------ lamps */
/** Headlamp unit 0.27 x 0.14 m for the bus RIGHT side (outer cell on the left): [colour map, emissive map]. */
export function makeHeadlampTex() {
  const W = 540, H = 280, outerW = 220;
  const mk = (emissive) => {
    const [c, g] = canvas(W, H);
    g.fillStyle = emissive ? '#000' : '#d9dee2';
    g.fillRect(0, 0, W, H);
    if (!emissive) {
      // clear lens with a faint blue tint, dark frame divider between the two cells
      const lg = g.createLinearGradient(0, 0, W, H);
      lg.addColorStop(0, '#e8eef2'); lg.addColorStop(1, '#b9c4cb');
      g.fillStyle = lg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#34373b';
      g.fillRect(outerW - 6, 0, 12, H);
    }
    // outer cell: round chrome reflector with visible bulb
    const cx = outerW / 2, cy = H / 2;
    const rg = g.createRadialGradient(cx - 14, cy - 18, 6, cx, cy, 98);
    if (emissive) { rg.addColorStop(0, '#fff'); rg.addColorStop(0.5, '#b8b0a0'); rg.addColorStop(1, '#201c18'); }
    else { rg.addColorStop(0, '#f5f7f8'); rg.addColorStop(0.35, '#a8aeb3'); rg.addColorStop(0.7, '#6a7076'); rg.addColorStop(1, '#2c2f33'); }
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, 98, 0, Math.PI * 2); g.fill();
    g.fillStyle = emissive ? '#fff' : '#fff6d8';
    g.beginPath(); g.ellipse(cx + 6, cy - 4, 20, 26, 0, 0, Math.PI * 2); g.fill();
    if (!emissive) { g.fillStyle = '#1a1a1c'; g.beginPath(); g.arc(cx + 4, cy + 2, 8, 0, Math.PI * 2); g.fill(); }
    // inner cell: larger rectangular faceted reflector
    const ix = outerW + 14, iw = W - ix - 12;
    const fg = g.createLinearGradient(ix, 0, ix + iw, H);
    if (emissive) { fg.addColorStop(0, '#9a9488'); fg.addColorStop(0.5, '#fff'); fg.addColorStop(1, '#8a857a'); }
    else { fg.addColorStop(0, '#80868b'); fg.addColorStop(0.4, '#e6e9eb'); fg.addColorStop(0.55, '#9ca3a8'); fg.addColorStop(1, '#565b60'); }
    g.fillStyle = fg;
    g.beginPath(); g.roundRect ? g.roundRect(ix, 24, iw, H - 48, 22) : g.rect(ix, 24, iw, H - 48); g.fill();
    g.strokeStyle = emissive ? 'rgba(0,0,0,0.5)' : 'rgba(40,44,48,0.45)';
    g.lineWidth = 3;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(ix + (iw * i) / 4, 28); g.lineTo(ix + (iw * i) / 4, H - 28); g.stroke(); }
    g.beginPath(); g.moveTo(ix + 8, H / 2); g.lineTo(ix + iw - 8, H / 2); g.stroke();
    return tex(c, { aniso: 8 });
  };
  return [mk(false), mk(true)];
}

/** Ribbed clear lens of the fog / cornering lamp (0.15 x 0.075 m). */
export function makeRibLens() {
  const [c, g] = canvas(300, 150);
  g.fillStyle = '#d4d8da';
  g.fillRect(0, 0, 300, 150);
  for (let x = 0; x < 300; x += 7) {
    g.fillStyle = x % 14 === 0 ? '#eef1f2' : '#aeb4b8';
    g.fillRect(x, 0, 4, 150);
  }
  g.strokeStyle = '#5b6065';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 294, 144);
  return tex(c, { aniso: 8 });
}

/** Louvre field: dark slats (engine hatch) or white slotted panel; repeats vertically. */
export function makeLouvre(kind = 'dark') {
  const [c, g] = canvas(256, 256);
  if (kind === 'dark') {
    g.fillStyle = '#08090a';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) {
      g.fillStyle = '#1b1d20';
      g.fillRect(0, y, 256, 6);
      g.fillStyle = '#2d3034';
      g.fillRect(0, y, 256, 2);
    }
  } else {
    g.fillStyle = '#ecece7';
    g.fillRect(0, 0, 256, 256);
    for (let y = 8; y < 256; y += 32) {
      g.fillStyle = '#2b2d30';
      g.fillRect(14, y, 228, 10);
    }
  }
  return tex(c, { repeat: true, aniso: 4 });
}
