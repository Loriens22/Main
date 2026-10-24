// Paradise Center (bul. Cherni vrah 100, opened 28 March 2013; concept RTKL, local design ProArch):
// the shopping centre beside metro station Vitosha, rebuilt on the OSM footprint (pack building 11848,
// 24 m, 38 vertices). Massing, facade bands, entrance atria and the roof sign are modelled from
// published facts (two storeys above ground, glazed entrances, aluminium-panel body); the exact
// cladding colours and entrance positions are NOT verified (see NOTES.md).
import * as THREE from 'three';
import { MeshBuilder, orient, centroid, pointInPoly } from '../LandmarkGeometry.js';
import { done, ground, signMat, tileMat, fitText } from './common.js';
import { baseMats } from './mats.js';

/** Facade materials of a modern shopping centre (tile sizes in metres via userData.tile). */
export function mallMats(M) {
  baseMats(M);
  if (M.m.l64mallStore) return;
  // ground floor shopfronts: tinted glass in white mullions, a plinth, warm lit shops at night
  const tS = M.curtain('l64mallStore', { bayW: 2.4, floorH: 6.4, bays: 5, floors: 1, ppm: 40, glass: '#5d7a8a', glass2: '#9ab4c0', mullion: '#e9ebeb', spandrel: '#cfd3d3', sp: 0.7, lit: 0.62, seed: 21 }, 'mallStore');
  // glazed atrium wall: taller bays, light frame
  const tA = M.curtain('l64mallAtrium', { bayW: 1.8, floorH: 13.0, bays: 6, floors: 1, ppm: 30, glass: '#6f8fa0', glass2: '#b8d0da', mullion: '#dfe3e4', spandrel: '#dfe3e4', sp: 0.01, lit: 0.9, seed: 5 }, 'mallAtrium');
  // upper body: light metal panels with a ribbon of tinted windows (food court / cinema levels)
  const W = 12, H = 10, ppm = 56;
  tileMat(M, 'l64mallUpper', W * ppm, H * ppm, (g, w, h) => {
    const y = (m) => h - m * ppm;
    g.fillStyle = '#d7dadb'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < W * 2; i++) if (i % 2 === 0) g.fillRect((i / 2) * ppm, 0, ppm * 0.5 * 2, h);
    g.strokeStyle = 'rgba(70,80,86,0.35)'; g.lineWidth = 1.5;
    for (let m = 0; m <= W; m += 1.5) { g.beginPath(); g.moveTo(m * ppm, 0); g.lineTo(m * ppm, h); g.stroke(); }
    for (let m = 0; m <= H; m += 1.25) { g.beginPath(); g.moveTo(0, y(m)); g.lineTo(w, y(m)); g.stroke(); }
    // ribbon window 2.2 m high at 3.6 m above the tile base
    const gr = g.createLinearGradient(0, y(5.8), 0, y(3.6));
    gr.addColorStop(0, '#9db6c1'); gr.addColorStop(1, '#4d6573');
    g.fillStyle = gr; g.fillRect(0, y(5.8), w, 2.2 * ppm);
    g.fillStyle = '#e8eaea';
    for (let m = 0; m <= W; m += 3) g.fillRect(m * ppm - 2, y(5.8), 4, 2.2 * ppm);
    g.fillRect(0, y(5.8) - 2, w, 4); g.fillRect(0, y(3.6) - 2, w, 4);
    // dark shadow gap under the ribbon
    g.fillStyle = 'rgba(40,50,56,0.5)'; g.fillRect(0, y(3.6), w, 5);
  }, { rough: 0.55, metal: 0.2, night: (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const y = (m) => h - m * ppm;
    for (let m = 0; m < W; m += 3) if (((m / 3) * 7 + 3) % 5 < 3.4) { g.fillStyle = '#ffe3b0'; g.fillRect(m * ppm + 3, y(5.7), 3 * ppm - 6, 2.0 * ppm); }
  } });
  M.m.l64mallUpper.userData.tile = [W, H];
  // back / service walls: darker panels
  const W2 = 8, H2 = 8;
  tileMat(M, 'l64mallBack', W2 * 48, H2 * 48, (g, w, h) => {
    g.fillStyle = '#b9bdbd'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,50,56,0.4)'; g.lineWidth = 1.5;
    for (let m = 0; m <= W2; m += 1) { g.beginPath(); g.moveTo(m * 48, 0); g.lineTo(m * 48, h); g.stroke(); }
    for (let m = 0; m <= H2; m += 1.6) { g.beginPath(); g.moveTo(0, m * 48); g.lineTo(w, m * 48); g.stroke(); }
    g.fillStyle = 'rgba(50,55,50,0.25)'; g.fillRect(0, h - 3 * 48, w, 3 * 48); // dirty plinth
  }, { rough: 0.8 });
  M.m.l64mallBack.userData.tile = [W2, H2];
  // roof sign: PARADISE CENTER, white letters on a charcoal board with a green underline
  signMat(M, 'l64mallSign', 1024, 128, (g, w, h) => {
    g.fillStyle = '#23292c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    fitText(g, 'PARADISE CENTER', w / 2, h * 0.47, w * 0.9, 84, 700);
    g.fillStyle = '#6cc04a'; g.fillRect(w * 0.05, h * 0.86, w * 0.9, 7);
  }, { rough: 0.5 });
  // small entrance name board
  signMat(M, 'l64mallSign2', 512, 96, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#23292c';
    fitText(g, 'ПАРАДАЙС ЦЕНТЪР', w / 2, h * 0.4, w * 0.88, 52, 700);
    g.fillStyle = '#6cc04a'; g.fillRect(w * 0.06, h * 0.78, w * 0.88, 6);
  }, { rough: 0.5 });
  return [tS, tA];
}

const FACADE_Y = { store: 6.4, fascia: 7.2, top: 18.2, parapet: 19.4 };

export function buildParadise(ctx) {
  const { world, M, replaced } = ctx;
  const part = replaced.find((r) => /Paradise Center/.test(r.entry.note));
  if (!part) return null;
  mallMats(M);
  const b = new MeshBuilder();
  const poly = orient(part.b.pts);
  const g = ground(world, poly);
  const base = g.avg, bot = g.min - 0.6;
  const tS = M.m.l64mallStore.userData.tile, tU = M.m.l64mallUpper.userData.tile, tB = M.m.l64mallBack.userData.tile;
  const n = poly.length / 2;
  const { store, fascia, top, parapet } = FACADE_Y;
  const cls = (e) => (e.len < 3 ? null : e.nx > 0.45 ? 'east' : e.nz > 0.55 ? 'south' : e.nz < -0.4 && e.len > 20 ? 'north' : 'back');
  // lower storey: shopfront glazing on public sides, service panels at the back
  b.ring((e) => (['east', 'south', 'north'].includes(cls(e)) ? 'l64mallStore' : null), poly, bot, base + store, { tw: tS[0], th: tS[1], v0: base });
  b.ring((e) => (cls(e) === 'back' ? 'l64mallBack' : null), poly, bot, base + store, { tw: tB[0], th: tB[1], v0: base });
  // fascia band, upper body, parapet
  b.ring('podiumAl', poly, base + store, base + fascia, { tw: 4, th: 4 });
  b.ring((e) => (cls(e) && cls(e) !== 'back' ? 'l64mallUpper' : null), poly, base + fascia, base + top, { tw: tU[0], th: tU[1], v0: base + fascia });
  b.ring((e) => (cls(e) === 'back' ? 'l64mallBack' : null), poly, base + fascia, base + top, { tw: tB[0], th: tB[1], v0: base + fascia });
  b.ring('l64white', poly, base + top, base + parapet, { tw: 4, th: 4 });
  b.cap('roofBitumen', poly, base + parapet, { s: 4 });
  // rooftop plant screens (kept inside the footprint)
  for (const [px, pz, w, d, h] of [[-3070, 1250, 34, 22, 3.4], [-3110, 1280, 26, 18, 2.8], [-3040, 1215, 20, 14, 2.6], [-3135, 1295, 22, 14, 2.4], [-3030, 1245, 16, 12, 2.2]]) {
    const ok = [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, c]) => pointInPoly(poly, px + a * w / 2, pz + c * d / 2));
    if (!ok) continue;
    b.box('l64mallBack', px, base + parapet, pz, w, h, d, 0, { tw: tB[0], th: tB[1], top: false });
    b.box('roofSteel', px, base + parapet + h, pz, w + 0.2, 0.2, d + 0.2, 0, { tw: 4, th: 4 });
  }
  const [cx, cz] = centroid(poly);
  // the main east entrance: a glazed atrium bay across from the bus stop, with a canopy and the roof sign
  const A = [poly[0], poly[1]];
  void A;
  atrium(b, M, world, { cx: -2985.4, cz: 1231.0, nx: 0.974, nz: 0.227, w: 34, d: 7.5, h: 13.0, base, sign: true });
  atrium(b, M, world, { cx: -2994.6, cz: 1160.5, nx: 1.0, nz: 0.0, w: 18, d: 5.0, h: 9.5, base, sign: false });
  atrium(b, M, world, { cx: -3128.0, cz: 1325.0, nx: 0.0, nz: 1.0, w: 26, d: 6.0, h: 10.0, base, sign: false });
  return done(b, M, cx, cz);
}

/** Glazed entrance bay projecting from a facade: glass box, aluminium roof/canopy, posts, doors, signs. */
function atrium(b, M, world, o) {
  const yaw = Math.atan2(o.nx, o.nz);
  const gy = Math.max(world.hf.heightAt(o.cx, o.cz), world.hf.heightAt(o.cx + o.nx * o.d, o.cz + o.nz * o.d));
  const tA = M.m.l64mallAtrium.userData.tile;
  b.push(o.cx, gy, o.cz, yaw);
  const w = o.w, d = o.d, h = o.h;
  // glass walls: front and two sides (frame tile 10.8 x 13 m)
  b.quad('l64mallAtrium', [-w / 2, 0, d], [w / 2, 0, d], [w / 2, h, d], [-w / 2, h, d], [[0, 0], [w / tA[0], 0], [w / tA[0], h / tA[1]], [0, h / tA[1]]]);
  for (const s of [-1, 1]) {
    const x = s * w / 2;
    b.quad('l64mallAtrium', s > 0 ? [x, 0, d] : [x, 0, 0], s > 0 ? [x, 0, 0] : [x, 0, d], s > 0 ? [x, h, 0] : [x, h, d], s > 0 ? [x, h, d] : [x, h, 0], [[0, 0], [d / tA[0], 0], [d / tA[0], h / tA[1]], [0, h / tA[1]]]);
  }
  // roof slab with a 1.4 m aluminium fascia and a wide canopy over the doors
  b.box('podiumAl', 0, h, d / 2, w + 0.6, 0.5, d + 0.6, 0, { tw: 4, th: 4 });
  b.box('l64white', 0, h + 0.5, d / 2, w + 0.6, 0.7, d + 0.6, 0, { tw: 4, th: 4, bottom: false });
  const cw = Math.min(w, 22);
  b.box('l64alu', 0, 4.3, d + 2.6, cw, 0.3, 5.2, 0, { tw: 4, th: 4 });
  for (const s of [-1, 1]) for (const z of [d + 0.4, d + 4.6]) b.box('l64steelDark', s * (cw / 2 - 0.3), 0, z, 0.22, 4.3, 0.22, 0, {});
  for (let i = 0; i < 4; i++) b.box('l64glow', -cw * 0.38 + (i * cw * 0.76) / 3, 4.22, d + 2.6, 1.4, 0.05, 0.5, 0, {});
  // doors: dark recess with a row of door leaves
  b.quad('glassTintL64', [cw * 0.3, 0.1, d + 0.04], [-cw * 0.3, 0.1, d + 0.04], [-cw * 0.3, 3.0, d + 0.04], [cw * 0.3, 3.0, d + 0.04]);
  for (let i = 0; i <= 6; i++) b.box('l64steel', -cw * 0.3 + (i * cw * 0.6) / 6, 0.1, d + 0.06, 0.08, 2.9, 0.08, 0, {});
  b.box('l64offwhite', 0, 0, d + 4.0, cw * 0.8, 0.12, 0.2, 0, { tw: 2, th: 2 });
  if (o.sign) {
    // roof sign on a board above the fascia, facing the street
    const sw = 26, sh = 3.25;
    b.box('l64black', 0, h + 1.2, d - 0.3, sw + 0.5, sh + 0.4, 0.4, 0, { top: true });
    b.quad('l64mallSign', [-sw / 2, h + 1.4, d - 0.09], [sw / 2, h + 1.4, d - 0.09], [sw / 2, h + 1.4 + sh, d - 0.09], [-sw / 2, h + 1.4 + sh, d - 0.09]);
    // small Cyrillic board over the doors
    b.quad('l64mallSign2', [-3.6, 3.35, d + 0.1], [3.6, 3.35, d + 0.1], [3.6, 4.1, d + 0.1], [-3.6, 4.1, d + 0.1]);
  }
  b.pop();
}
