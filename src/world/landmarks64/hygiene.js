// The terminus of line 64 on bul. "Akad. Ivan Evstratiev Geshov": the National Centre of Public
// Health and Analyses (НЦОЗА, Geshov 15, under the Ministry of Health) - the old Hygiene Institute
// that names the stops "Център по хигиена" (2342 arrival, 2343 departure) - and the "Sv. Sofia"
// lung hospital next door (OSM name). Footprints and heights are the OSM ones (pack 13476-13482,
// 13515). The institute is drawn as a three-storey plastered complex with punched windows, a stone
// plinth, a string course, a cornice and an entrance portico on the boulevard wing; that styling is
// inferred from the period and type of the buildings, not verified (data/research/line64/landmarks/NOTES.md).
import { MeshBuilder } from '../LandmarkGeometry.js';
import { ground, done, facadeMat, plasterMat, ledge, plinth, bayRing, roofTop, signMat, canopy, steps, doors, nearestEdge, flagpoles, ward } from '../LandmarkInstitutionsKit.js';
import { baseMats } from './mats.js';
import { tree, treeMats, bench } from './props.js';

const FLOOR = 3.3, FLOORS = 3;

function hygMats(M) {
  baseMats(M);
  treeMats(M);
  facadeMat(M, 'hygWall', {
    bayW: 3.4, floorH: FLOOR, bays: 8, floors: FLOORS, ppm: 30, style: 'punched',
    wall: '#e3d4ae', pier: '#dccba2', win: [1.7, 1.85], sillY: 0.78, mull: 2, fr: 0.06,
    lit: 0.35, blind: 0.45, seed: 64, glass: '#435468', glass2: '#a8b8c4', frame: '#f3f0e6',
    surround: '#eee3c8', surroundW: 0.12, sill: '#d6cab0', lintel: true, rustic: { floors: 1, h: 0.4 }, grime: 0.07,
  });
  facadeMat(M, 'hygLab', {
    bayW: 3.2, floorH: FLOOR, bays: 8, floors: 2, ppm: 30, style: 'ribbon',
    wall: '#e7e2d3', pier: '#dcd6c6', spandrel: '#d8d1bd', win: [2.5, 1.5], sillY: 0.9, mull: 3,
    lit: 0.4, blind: 0.3, seed: 66, glass: '#4a5b6c', glass2: '#a2b4c2', frame: '#f4f3ee', grime: 0.05,
  });
  facadeMat(M, 'lungWall', {
    bayW: 3.0, floorH: 3.2, bays: 8, floors: 3, ppm: 30, style: 'punched',
    wall: '#ecebe4', pier: '#e2e1d8', win: [1.55, 1.65], sillY: 0.85, mull: 2, lit: 0.45, blind: 0.35,
    seed: 68, glass: '#4b5d6d', glass2: '#a9bac6', frame: '#f6f6f2', surround: '#dfe3d8', sill: '#d2d5cb', grime: 0.06,
  });
  plasterMat(M, 'hygPlaster', '#dfcfa6', 0.1);
  plasterMat(M, 'lungPlaster', '#e6e6de', 0.08);
  signMat(M, 'hygSign', {
    w: 1024, h: 160, bg: '#f3eee0',
    lines: [{ text: 'НАЦИОНАЛЕН ЦЕНТЪР', size: 60, color: '#1d3e72', y: 50 }, { text: 'ПО ОБЩЕСТВЕНО ЗДРАВЕ И АНАЛИЗИ', size: 60, color: '#1d3e72', y: 116 }],
  });
  signMat(M, 'hygPlaque', {
    w: 384, h: 256, bg: '#2c2c2a', glow: false,
    lines: [
      { text: 'МИНИСТЕРСТВО НА ЗДРАВЕОПАЗВАНЕТО', size: 19, color: '#d6cfb6', y: 34 },
      { text: 'НАЦИОНАЛЕН ЦЕНТЪР ПО', size: 28, color: '#f1e9cf', y: 92 },
      { text: 'ОБЩЕСТВЕНО ЗДРАВЕ', size: 28, color: '#f1e9cf', y: 128 },
      { text: 'И АНАЛИЗИ', size: 28, color: '#f1e9cf', y: 164 },
      { text: 'бул. „Акад. Иван Ев. Гешов“ 15', size: 21, color: '#d6cfb6', y: 222 },
    ],
    draw: (g, w) => { g.fillStyle = '#b9a76a'; g.fillRect(24, 56, w - 48, 3); g.fillRect(24, 190, w - 48, 3); },
  });
  signMat(M, 'lungSign', {
    w: 1024, h: 192, bg: '#ffffff',
    lines: [{ text: 'СБАЛ ПО БЕЛОДРОБНИ БОЛЕСТИ', size: 64, color: '#16733f', y: 70, x: 590, max: 820 }, { text: '„СВ. СОФИЯ“', size: 64, color: '#16733f', y: 140, x: 590, max: 820 }],
    draw: (g) => { // green cross on the left
      g.fillStyle = '#1f8f4c'; g.fillRect(60, 46, 36, 100); g.fillRect(28, 78, 100, 36);
    },
  });
  signMat(M, 'lungEntry', { w: 512, h: 72, bg: '#1f8f4c', lines: [{ text: 'ВХОД · ПРИЕМНО ОТДЕЛЕНИЕ', size: 34, color: '#ffffff', y: 38 }] });
}

export function buildHygiene({ world, M, y, replaced }) {
  const parts = replaced.filter((r) => /^(NCPHA|Lung hospital)/.test(r.entry.note));
  if (!parts.length) return null;
  hygMats(M);
  const b = new MeshBuilder();
  // one floor level for the joined wings, so their string courses and cornices meet
  const wings = parts.filter((p) => /^NCPHA/.test(p.entry.note) && !/laboratory/.test(p.entry.note));
  const base = wings.reduce((a, p) => a + ground(world, p.b.pts).avg, 0) / Math.max(1, wings.length);
  let sx = 0, sz = 0;
  for (const { b: bd, entry, cx, cz } of parts) {
    const poly = Array.from(bd.pts);
    sx += cx; sz += cz;
    if (/laboratory/.test(entry.note)) ward(b, M, world, poly, { facade: 'hygLab', floors: 4, minBay: 6, endKey: 'hygPlaster', plant: 4, seed: 15, antenna: true });
    else if (/^NCPHA/.test(entry.note)) {
      wing(b, M, world, poly, base, bd.id);
      if (/main/.test(entry.note)) portico(b, M, world, poly, base, y);
    } else lungHospital(b, M, world, poly, y);
  }
  forecourt(b, M, world, y);
  return done(b, M, sx / parts.length, sz / parts.length);
}

/** One wing of the institute: granite plinth, three plastered storeys of punched windows, string course, cornice. */
function wing(b, M, world, poly, base, seed) {
  const g = ground(world, poly);
  const top = base + FLOORS * FLOOR;
  plinth(b, 'granite', poly, g.min - 0.6, base + 0.7, 0.1);
  bayRing(b, M, (e) => (e.L >= 4.2 ? 'hygWall' : null), poly, base, FLOORS);
  b.ring((e) => (e.len < 4.2 ? 'hygPlaster' : null), poly, g.min - 0.6, top, { tw: 4, th: 4, v0: base });
  ledge(b, 'stoneTrim', poly, base + FLOOR - 0.1, 0.2, 0.07);
  ledge(b, 'stoneTrim', poly, top - 0.55, 0.55, 0.38);
  roofTop(b, poly, top, { parapet: 0.3, plant: { n: 3, seed, inset: 4, maxH: 2.4 } });
}

/** Entrance portico in the middle of the boulevard face of the main wing, opposite stop 2342. */
function portico(b, M, world, poly, base, y) {
  const near = nearestEdge(poly, -4110, -1486);
  const e = near.e;
  const t = Math.max(0.3, Math.min(0.7, near.t));
  const px = e.ax + e.tx * e.L * t, pz = e.az + e.tz * e.L * t;
  const gy = y(px + e.nx * 5, pz + e.nz * 5);
  const FL = Math.max(0, base - gy);
  b.push(px, gy, pz, e.yaw);
  const W = 12.4, D = 3.4, H = FL + 2 * FLOOR;
  // four square piers in pale stone and the slab, with an attic carrying the name
  for (const x of [-5.4, -1.8, 1.8, 5.4]) {
    b.box('stonePale', x, 0, D - 0.35, 0.6, H, 0.6, 0, { tw: 2, th: 2 });
    b.box('stoneTrim', x, H - 0.25, D - 0.35, 0.78, 0.25, 0.78, 0, {});
    b.box('granite', x, -0.1, D - 0.35, 0.74, FL + 0.45, 0.74, 0, { tw: 2, th: 2 });
  }
  b.box('stoneLight', 0, H, D / 2, W, 0.5, D + 0.25, 0, { tw: 4, th: 4, bottom: true });
  b.box('stoneLight', 0, H + 0.5, D - 0.05, W, 1.25, 0.3, 0, { tw: 4, th: 4 });
  b.quad('hygSign', [-5.6, H + 0.6, D + 0.11], [5.6, H + 0.6, D + 0.11], [5.6, H + 1.62, D + 0.11], [-5.6, H + 1.62, D + 0.11]);
  // landing and steps up from the pavement
  b.box('granite', 0, -0.2, D / 2, W - 0.6, FL + 0.2, D, 0, { tw: 2, th: 2 });
  const n = Math.max(1, Math.round(FL / 0.16));
  if (FL > 0.08) steps(b, 'graniteLight', { w: 8, n, rise: FL / n, tread: 0.33, z0: D });
  for (const s of [-1, 1]) b.box('steel', s * 4.1, FL + 0.9, D + n * 0.33 / 2, 0.05, 0.05, n * 0.33 + 0.4, 0, {});
  // three double doors under the portico, lamps under the slab
  for (const x of [-3.6, 0, 3.6]) doors(b, { x, y: FL, z: 0.14, w: 2.0, h: 2.75, frame: 'doorDark', glass: 'glassDark' });
  for (const x of [-3.6, 0, 3.6]) b.box('lamp', x, H - 0.04, D / 2, 0.6, 0.04, 0.6, 0, {});
  // the name plaque beside the main door
  b.quad('hygPlaque', [-6.85, FL + 1.25, 0.12], [-5.95, FL + 1.25, 0.12], [-5.95, FL + 1.85, 0.12], [-6.85, FL + 1.85, 0.12]);
  // Bulgarian and EU flags on two masts beside the steps, as at every state institution
  flagpoles(b, M, ['bg', 'eu'], { x: -13.6, z: D + 1.6, gap: 2.7, h: 8.5, y: -0.2 });
  b.pop();
}

/** Lung hospital "Sv. Sofia": white three-storey ward block, the name on the boulevard end, an entrance canopy. */
function lungHospital(b, M, world, poly, y) {
  const r = ward(b, M, world, poly, { facade: 'lungWall', floors: 3, minBay: 6, endKey: 'lungPlaster', plant: 4, seed: 21 });
  // the short end facing the boulevard (west)
  const near = nearestEdge(poly, -4095, -1440);
  const e = near.e;
  const mx = e.ax + e.tx * e.L * 0.5, mz = e.az + e.tz * e.L * 0.5;
  const gy = y(mx + e.nx * 3, mz + e.nz * 3);
  b.push(mx, gy, mz, e.yaw);
  const top = r.top - gy;
  const sw = Math.min(e.L - 1.2, 9.6);
  b.quad('lungSign', [-sw / 2, top - 2.7, 0.33], [sw / 2, top - 2.7, 0.33], [sw / 2, top - 2.7 + sw * 0.1875, 0.33], [-sw / 2, top - 2.7 + sw * 0.1875, 0.33]);
  // entrance canopy with the green entry band
  canopy(b, { w: 6.4, d: 3.2, y: 3.1 + Math.max(0, r.base - gy), th: 0.35, cols: 2, colR: 0.14, slab: 'white', colKey: 'steel', lights: true });
  b.quad('lungEntry', [-3.0, 3.15 + Math.max(0, r.base - gy), 3.22], [3.0, 3.15 + Math.max(0, r.base - gy), 3.22], [3.0, 3.42 + Math.max(0, r.base - gy), 3.22], [-3.0, 3.42 + Math.max(0, r.base - gy), 3.22]);
  doors(b, { x: 0, y: Math.max(0, r.base - gy), z: 0.12, w: 2.2, h: 2.5 });
  b.pop();
}

/** Forecourt along the boulevard: stone gate piers at the ends of the fence, trees and benches. */
function forecourt(b, M, world, y) {
  // the OSM fence stops at these two points, leaving the forecourt open to the pavement
  for (const [x, z] of [[-4103.0, -1516.3], [-4106.8, -1475.9]]) {
    const gy = y(x, z);
    b.box('stonePale', x, gy - 0.2, z, 0.9, 2.4, 0.9, 0, { tw: 2, th: 2 });
    b.box('stoneTrim', x, gy + 2.2, z, 1.1, 0.2, 1.1, 0, {});
    b.box('stoneTrim', x, gy + 2.4, z, 0.7, 0.25, 0.7, 0, {});
  }
  // a row of lime trees in front of the main wing and two benches facing the door
  for (const [x, z, s] of [[-4101.5, -1462.5, 1.05], [-4104.5, -1504.0, 1.0], [-4106.0, -1512.0, 0.95], [-4102.0, -1470.5, 1.1]]) tree(b, x, y(x, z), z, s, 'l64leaf');
  const edgeYaw = Math.atan2(-4085.3 + 4102.3, -1458.8 + 1509.7); // along the wing face (north-east)
  for (const [x, z] of [[-4103.6, -1496.5], [-4105.4, -1478.5]]) bench(b, x, y(x, z), z, edgeYaw + Math.PI / 2);
}

