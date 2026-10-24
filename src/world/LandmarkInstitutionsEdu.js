// Universities, the technical library and the National Sports Academy along line 280:
//  - the Technical Library / National Centre for Information and Documentation slab (stops 2352 / 2351),
//  - the University of Chemical Technology and Metallurgy (ХТМУ) buildings A and B on the boulevard,
//    the Technical University entrance sign and the Block 1 front closing the vista of ul. Prof. Bradistilov
//    (stops 1740 / 1743 / 0617 / 0614),
//  - the National Sports Academy: the arch gate on ul. Ak. Stefan Mladenov and the main complex (1606 / 1609 / 1693).
// Footprints are the pack's OSM footprints; facade rhythm, colours and signage are inferred typology
// (see data/research/world/institutions280/NOTES.md for sources and unverified details).
import { MeshBuilder } from './LandmarkGeometry.js';
import { done, facadeMat, plasterMat, signMat, canopy, steps, ward, nearestEdge, flagpoles } from './LandmarkInstitutionsKit.js';

const parts = (replaced, re) => replaced.filter((r) => re.test(r.entry.note));
const avg = (list) => [list.reduce((s, p) => s + p.cx, 0) / list.length, list.reduce((s, p) => s + p.cz, 0) / list.length];

// ------------------------------------------------------------------ Technical library (НЦИОД) slab
function libMaterials(M) {
  facadeMat(M, 'libWall', { bayW: 3.2, floorH: 3.14, bays: 8, floors: 2, ppm: 30, style: 'ribbon', wall: '#d9d5c9', pier: '#cbc6b8', spandrel: '#8e9ca4', win: [2.7, 1.45], sillY: 1.0, mull: 3, lit: 0.22, blind: 0.4, seed: 41, glass: '#4f6070', glass2: '#a5b6c3', frame: '#e4e0d4', slabCol: 'rgba(255,255,255,0.28)' });
  plasterMat(M, 'libEnd', '#cfcabb', 0.1);
  signMat(M, 'libCanopySign', { w: 1024, h: 72, bg: '#1d4f91', lines: [{ text: 'НАЦИОНАЛЕН ЦЕНТЪР ЗА ИНФОРМАЦИЯ И ДОКУМЕНТАЦИЯ', size: 44, color: '#ffffff', y: 38 }] });
  signMat(M, 'libPlaque', { w: 384, h: 192, bg: '#2a2a2a', glow: false, lines: [{ text: 'ТЕХНИЧЕСКА', size: 40, color: '#e8e0c8', y: 46 }, { text: 'БИБЛИОТЕКА', size: 40, color: '#e8e0c8', y: 90 }, { text: 'бул. „Д-р Г. М. Димитров“ 52А', size: 22, color: '#bdb6a0', y: 136 }, { text: 'ДАМТН · НЦИОД', size: 24, color: '#bdb6a0', y: 166 }] });
}

export function buildTechLibrary({ world, M, y, replaced }) {
  const pp = parts(replaced, /^Technical library/);
  if (!pp.length) return null;
  libMaterials(M);
  const b = new MeshBuilder();
  const poly = Array.from(pp[0].b.pts);
  const r = ward(b, M, world, poly, { facade: 'libWall', floors: 7, minBay: 9, endKey: 'libEnd', plant: 9, seed: 17, antenna: true });
  // the entrance on the south-east end of the slab, where the pack has the steps (600, 493)
  const near = nearestEdge(poly, 596.5, 494);
  const e = near.e, gy = y(near.px, near.pz), FL = Math.max(0.6, r.base - gy);
  b.push(near.px, gy, near.pz, e.yaw);
  b.box('lobbyGlass', 0, 0, 1.6, 8.0, 3.9 + FL, 3.2, 0, { top: false });
  for (let i = -4; i <= 4; i++) b.box('steelDark', i, 0, 3.23, 0.07, 3.9 + FL, 0.07, 0, {});
  b.box('concrete', 0, 3.9 + FL, 1.6, 8.6, 0.3, 3.8, 0, { tw: 4, th: 4 });
  b.push(0, 0, 3.2, 0);
  canopy(b, { w: 11, d: 5.2, y: 3.7 + FL, th: 0.45, cols: 4, colR: 0.2, slab: 'concrete', colKey: 'steelDark' });
  b.quad('libCanopySign', [-5.5, 3.72 + FL + 0.48, 5.22], [5.5, 3.72 + FL + 0.48, 5.22], [5.5, 3.72 + FL + 1.05, 5.22], [-5.5, 3.72 + FL + 1.05, 5.22]);
  b.pop();
  // wide flight of steps up to the terrace
  const n = Math.max(3, Math.round(FL / 0.16));
  steps(b, 'graniteLight', { w: 9, n, rise: FL / n, tread: 0.38, z0: 3.2 });
  // stone plaque pylon with the old name of the stop
  b.box('granite', 6.4, 0, 6.0, 1.6, 1.9, 0.5, 0, { tw: 2, th: 2 });
  b.quad('libPlaque', [5.65, 0.7, 6.27], [7.15, 0.7, 6.27], [7.15, 1.75, 6.27], [5.65, 1.75, 6.27]);
  b.pop();
  // flagpoles beside the entrance
  b.push(near.px, gy, near.pz, e.yaw);
  flagpoles(b, M, ['bg', 'eu', { text: 'НЦИОД', bg: '#1d4f91', fg: '#ffffff' }], { x: -12.5, z: 5.5, gap: 2.8, h: 8 });
  b.pop();
  return done(b, M, pp[0].cx, pp[0].cz);
}

// ------------------------------------------------------------------ ХТМУ + Technical University
function htmuMaterials(M) {
  facadeMat(M, 'htmuWall', { bayW: 3.4, floorH: 3.4, bays: 8, floors: 2, ppm: 30, style: 'ribbon', wall: '#d6cfbd', pier: '#c3bba6', spandrel: '#b7ae98', win: [2.9, 1.7], sillY: 0.85, mull: 4, lit: 0.18, blind: 0.4, seed: 51, glass: '#4d5b66', glass2: '#9fb0bb', frame: '#e7e3d6', slabCol: 'rgba(255,255,255,0.22)' });
  facadeMat(M, 'tuWall', { bayW: 3.1, floorH: 3.12, bays: 8, floors: 2, ppm: 30, style: 'ribbon', wall: '#d9d6cc', pier: '#bdbab0', spandrel: '#a5a99f', win: [2.5, 1.65], sillY: 0.9, mull: 3, lit: 0.2, blind: 0.35, seed: 53, glass: '#4a5864', glass2: '#9bacb8', frame: '#e6e3d8' });
  plasterMat(M, 'htmuEnd', '#c9c0aa', 0.12);
  plasterMat(M, 'tuEnd', '#c9c7bd', 0.12);
  signMat(M, 'htmuSign', { w: 1024, h: 128, bg: '#f1ede0', lines: [{ text: 'ХИМИКОТЕХНОЛОГИЧЕН И МЕТАЛУРГИЧЕН', size: 50, color: '#7a1f1f', y: 40 }, { text: 'УНИВЕРСИТЕТ – СОФИЯ', size: 50, color: '#7a1f1f', y: 92 }] });
  signMat(M, 'htmuLetters', { w: 256, h: 128, bg: '#7a1f1f', lines: [{ text: 'ХТМУ', size: 78, color: '#f1ede0', y: 66 }] });
  signMat(M, 'tuStele', { w: 1024, h: 256, bg: '#103a6b', lines: [{ text: 'ТЕХНИЧЕСКИ УНИВЕРСИТЕТ', size: 88, color: '#ffffff', y: 84 }, { text: 'СОФИЯ', size: 74, color: '#e3b73c', y: 172 }, { text: 'бул. „Св. Климент Охридски“ 8', size: 30, color: '#b9cce2', y: 232 }] });
  signMat(M, 'tuFront', { w: 1024, h: 96, bg: null, alpha: true, glow: true, lines: [{ text: 'ТЕХНИЧЕСКИ УНИВЕРСИТЕТ – СОФИЯ', size: 76, color: '#ffffff', y: 50 }] });
  signMat(M, 'tuBlockPlate', { w: 512, h: 96, bg: '#103a6b', lines: [{ text: 'Блок 1 – Ректорат', size: 52, color: '#ffffff', y: 50 }] });
}

/** Portal in the local frame (+z out): steps, four piers with a plain entablature, glazed doors. */
function portal(b, { w = 11, floors = 2, fh = 3.4, rise = 0.6, sign = null, signW = 9, pier = 'stonePale', fascia = 'stoneTrim' }) {
  const H = floors * fh;
  const n = Math.max(2, Math.round(rise / 0.16));
  steps(b, 'graniteLight', { w: w - 1.2, n, rise: rise / n, tread: 0.38, z0: 3.0 });
  b.box(pier, 0, rise - 0.1, 1.8, w, 0.3, 3.6, 0, { tw: 4, th: 4 });
  const xs = [-w / 2 + 0.7, -w / 6, w / 6, w / 2 - 0.7];
  for (const x of xs) b.box(pier, x, rise, 2.8, 0.85, H - 0.4, 0.85, 0, { tw: 2, th: 2 });
  b.box(fascia, 0, rise + H - 0.4, 1.9, w + 0.6, 0.9, 3.9, 0, { tw: 4, th: 4 });
  b.box('stoneLight', 0, rise + H + 0.5, 1.9, w + 1.0, 0.25, 4.2, 0, { tw: 4, th: 4 });
  b.box('glassDark', 0, rise, 0.25, w - 2.4, H - 0.9, 0.12, 0, {});
  for (const x of [-w / 4, 0, w / 4]) b.box('steelDark', x, rise, 0.33, 0.07, H - 0.9, 0.07, 0, {});
  b.box('lamp', 0, rise + H - 0.55, 2.4, 1.4, 0.05, 0.6, 0, {});
  if (sign) b.quad(sign, [-signW / 2, rise + H - 0.3, 3.88], [signW / 2, rise + H - 0.3, 3.88], [signW / 2, rise + H + 0.45, 3.88], [-signW / 2, rise + H + 0.45, 3.88]);
}

export function buildHtmu({ world, M, y, replaced }) {
  const pp = parts(replaced, /^HTMU/);
  if (!pp.length) return null;
  htmuMaterials(M);
  const b = new MeshBuilder();
  for (const { b: bd, entry } of pp) {
    const poly = Array.from(bd.pts);
    const A = /building A/.test(entry.note);
    const r = ward(b, M, world, poly, { facade: 'htmuWall', floors: A ? 5 : 4, minBay: 9, endKey: 'htmuEnd', plant: A ? 10 : 8, seed: A ? 6 : 8, antenna: A });
    // boulevard-side entrance portal on the face nearest the road (the long east face)
    const near = nearestEdge(poly, A ? 540 : 520, A ? 1520 : 1120);
    const e = near.e, gy = y(near.px, near.pz);
    b.push(near.px, gy, near.pz, e.yaw);
    portal(b, { w: 11, floors: 2, fh: 3.4, rise: Math.max(0.3, r.base - gy + 0.3), sign: A ? 'htmuSign' : null, signW: 9.4 });
    b.pop();
    if (A) {
      // red name plate with the abbreviation high on the east wing
      const top = r.top;
      b.push(near.px, gy, near.pz, e.yaw);
      b.quad('htmuLetters', [-5.4, top - gy - 3.6, 0.32], [5.4, top - gy - 3.6, 0.32], [5.4, top - gy - 1.1, 0.32], [-5.4, top - gy - 1.1, 0.32]);
      flagpoles(b, M, ['bg', 'eu'], { x: 8, z: 5, gap: 2.6, h: 7.5 });
      b.pop();
    }
  }
  const c = avg(pp);
  return done(b, M, c[0], c[1]);
}

/** TU: the entrance sign stele at the boulevard end of ul. Prof. Bradistilov and the Block 1 slab closing the street. */
export function buildTu({ world, M, y, replaced }) {
  const pp = parts(replaced, /^TU Block 1/);
  htmuMaterials(M);
  const b = new MeshBuilder();
  // stele on the north verge at the entrance of ul. Prof. Georgi Bradistilov, facing the boulevard / the approaching bus
  const sx = 566, sz = 1306.5, gy = y(sx, sz);
  b.push(sx, gy, sz, Math.atan2(0.62, 0.78));
  b.box('stoneLight', 0, -0.2, 0, 7.4, 0.6, 0.9, 0, { tw: 2, th: 2 });
  b.box('concrete', -3.2, 0.3, 0, 0.5, 2.9, 0.5, 0, { tw: 2, th: 2 });
  b.box('concrete', 3.2, 0.3, 0, 0.5, 2.9, 0.5, 0, { tw: 2, th: 2 });
  for (const f of [1, -1]) b.quad('tuStele', [-3.6 * f, 0.6, 0.3 * f], [3.6 * f, 0.6, 0.3 * f], [3.6 * f, 3.0, 0.3 * f], [-3.6 * f, 3.0, 0.3 * f]);
  b.box('steelDark', 0, 0.55, 0, 7.2, 2.5, 0.58, 0, {});
  b.pop();
  if (!pp.length) return done(b, M, sx, sz);
  const poly = Array.from(pp[0].b.pts);
  const r = ward(b, M, world, poly, { facade: 'tuWall', floors: 5, minBay: 9, endKey: 'tuEnd', plant: 4, seed: 4, antenna: false });
  // the long east face looks down ul. Prof. Bradistilov: entrance with the university lettering and flagpoles
  const near = nearestEdge(poly, 400, 1330);
  const e = near.e, gy2 = y(near.px, near.pz);
  b.push(near.px, gy2, near.pz, e.yaw);
  portal(b, { w: 9, floors: 2, fh: 3.12, rise: Math.max(0.3, r.base - gy2 + 0.3), sign: 'tuBlockPlate', signW: 5.2, pier: 'concrete', fascia: 'concreteDark' });
  b.quad('tuFront', [-8.2, r.top - gy2 - 2.9, 0.34], [8.2, r.top - gy2 - 2.9, 0.34], [8.2, r.top - gy2 - 1.2, 0.34], [-8.2, r.top - gy2 - 1.2, 0.34]);
  flagpoles(b, M, ['bg', 'eu', { text: 'ТУ', bg: '#103a6b', fg: '#ffffff' }], { x: -12, z: 6, gap: 2.8, h: 8 });
  b.pop();
  return done(b, M, pp[0].cx, pp[0].cz);
}

// ------------------------------------------------------------------ National Sports Academy
function nsaMaterials(M) {
  facadeMat(M, 'nsaWall', { bayW: 3.4, floorH: 4.0, bays: 8, floors: 2, ppm: 30, style: 'ribbon', wall: '#e4e1d6', pier: '#d3d0c4', spandrel: '#aab7c0', win: [3.0, 2.0], sillY: 0.9, mull: 3, lit: 0.18, blind: 0.3, seed: 61, glass: '#4a5c6b', glass2: '#a8bac6', frame: '#f0eee6' });
  plasterMat(M, 'nsaEnd', '#d6d3c7', 0.12);
  plasterMat(M, 'nsaBlue', '#12408a', 0.04, 0.5);
  signMat(M, 'nsaArchSign', { w: 1024, h: 160, bg: '#12408a', lines: [{ text: 'НАЦИОНАЛНА СПОРТНА АКАДЕМИЯ', size: 76, color: '#ffffff', y: 56 }, { text: '„ВАСИЛ ЛЕВСКИ“', size: 56, color: '#f2c33c', y: 120 }] });
  signMat(M, 'nsaFront', { w: 1024, h: 96, bg: null, alpha: true, glow: true, lines: [{ text: 'НАЦИОНАЛНА СПОРТНА АКАДЕМИЯ „ВАСИЛ ЛЕВСКИ“', size: 56, color: '#ffffff', y: 50 }] });
}

export function buildNsa({ world, M, y, replaced }) {
  nsaMaterials(M);
  const b = new MeshBuilder();
  // arch gate across the entrance road (ul. Ak. Stefan Mladenov -> the sports grounds), two piers and a lettered lintel
  const ax = -544, az = 2756.8, gy = y(ax, az);
  b.push(ax, gy, az, Math.PI / 2);
  for (const sx of [-1, 1]) {
    b.box('concrete', sx * 4.1, -0.3, 0, 1.4, 7.6, 1.4, 0, { tw: 4, th: 4 });
    b.box('nsaBlue', sx * 4.1, 6.8, 0, 1.5, 0.35, 1.5, 0, {});
    b.box('concrete', sx * 6.2, -0.3, 0, 0.5, 3.6, 0.5, 0, { tw: 4, th: 4 });
  }
  b.box('concrete', 0, 5.2, 0, 10.6, 2.2, 1.1, 0, { tw: 4, th: 4 });
  b.box('stoneTrim', 0, 7.4, 0, 11.0, 0.25, 1.4, 0, { tw: 4, th: 4 });
  for (const f of [1, -1]) b.quad('nsaArchSign', [-4.9 * f, 5.4, 0.56 * f], [4.9 * f, 5.4, 0.56 * f], [4.9 * f, 7.1, 0.56 * f], [-4.9 * f, 7.1, 0.56 * f]);
  // side pedestrian gates and the barrier arm
  for (const sx of [-1, 1]) { b.box('steelDark', sx * 5.7, 0, 0, 0.9, 1.4, 0.06, 0, {}); b.box('steelDark', sx * 6.7, 0, 0, 0.8, 1.4, 0.06, 0, {}); }
  b.box('white', -2.0, 1.0, 1.6, 3.6, 0.1, 0.1, 0, {});
  b.box('steelDark', -3.9, 0, 1.6, 0.3, 1.1, 0.3, 0, {});
  b.pop();
  // main complex
  const pp = parts(replaced, /^NSA/);
  if (pp.length) {
    const poly = Array.from(pp[0].b.pts);
    const r = ward(b, M, world, poly, { facade: 'nsaWall', floors: 4, minBay: 9, endKey: 'nsaEnd', plant: 14, seed: 11, antenna: true });
    const near = nearestEdge(poly, -345, 2520);
    const e = near.e, gy2 = y(near.px, near.pz);
    b.push(near.px, gy2, near.pz, e.yaw);
    portal(b, { w: 13, floors: 2, fh: 4.0, rise: Math.max(0.3, r.base - gy2 + 0.3), sign: null, pier: 'concrete', fascia: 'nsaBlue' });
    b.quad('nsaFront', [-12, r.top - gy2 - 3.2, 0.34], [12, r.top - gy2 - 3.2, 0.34], [12, r.top - gy2 - 1.3, 0.34], [-12, r.top - gy2 - 1.3, 0.34]);
    flagpoles(b, M, ['bg', 'eu', { text: 'НСА', bg: '#12408a', fg: '#ffffff' }], { x: 9, z: 7, gap: 2.8, h: 9 });
    b.pop();
    return done(b, M, pp[0].cx, pp[0].cz);
  }
  return done(b, M, ax, az);
}
