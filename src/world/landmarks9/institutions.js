// Institutions along trolleybus line 9 drawn on their OSM footprints with the institution kit: the ВМА hospital
// tower, the Aleksandrovska internal-medicine block, the Satirical Theatre and 36 СУ „Максим Горки“. Footprints
// and heights are the OSM ones (data.js); the facade styles (window rhythm, materials, cornices) are inferred
// from the building types and periods and are estimates (data/research/line9/README.md). Names on signs are the
// institutions' own names, placed only where the Overture place falls inside the building.
import { MeshBuilder } from '../LandmarkGeometry.js';
import { ground, done, facadeMat, plasterMat, ledge, plinth, bayRing, roofTop, signMat, signQuad, canopy, steps, doors, nearestEdge, flagpoles, ward } from '../LandmarkInstitutionsKit.js';

function mats(M) {
  if (M.l9inst) return;
  M.l9inst = true;
  facadeMat(M, 'vmaTower', {
    bayW: 3.3, floorH: 3.3, bays: 8, floors: 16, ppm: 26, style: 'ribbon',
    wall: '#e8e4da', pier: '#ddd8cb', spandrel: '#d7d1c2', win: [2.6, 1.5], sillY: 0.9, mull: 3,
    lit: 0.45, blind: 0.35, seed: 91, glass: '#4a5b6a', glass2: '#9fb2c0', frame: '#f2f2ee', grime: 0.07,
  });
  facadeMat(M, 'vmaWing', {
    bayW: 3.4, floorH: 3.3, bays: 8, floors: 5, ppm: 28, style: 'punched',
    wall: '#e4dcc8', pier: '#d9cfb8', win: [1.7, 1.7], sillY: 0.85, mull: 2, lit: 0.4, blind: 0.4,
    seed: 92, glass: '#435468', glass2: '#a8b8c4', frame: '#f3f0e6', surround: '#ece4cf', surroundW: 0.1, sill: '#d4c9b1', grime: 0.08,
  });
  facadeMat(M, 'aleksWall', {
    bayW: 3.6, floorH: 3.2, bays: 8, floors: 3, ppm: 30, style: 'punched',
    wall: '#e9d9b4', pier: '#e1cfa6', win: [1.6, 2.0], sillY: 0.75, mull: 2, lit: 0.35, blind: 0.4,
    seed: 93, glass: '#3f5163', glass2: '#a3b4c2', frame: '#f6f1e3', surround: '#f1e7cd', surroundW: 0.14, sill: '#d9caa8', lintel: true,
    rustic: { floors: 1, h: 0.4 }, grime: 0.08,
  });
  facadeMat(M, 'satWall', {
    bayW: 3.8, floorH: 4.2, bays: 6, floors: 4, ppm: 28, style: 'punched',
    wall: '#d8cdb8', pier: '#cfc2a9', win: [1.7, 2.4], sillY: 0.7, mull: 2, lit: 0.5, blind: 0.3,
    seed: 94, glass: '#3e4c58', glass2: '#9eafbc', frame: '#2b2a28', surround: '#e5dcc8', surroundW: 0.16, sill: '#c9bda4', lintel: true, grime: 0.09,
  });
  facadeMat(M, 'schoolWall', {
    bayW: 3.4, floorH: 3.5, bays: 8, floors: 3, ppm: 28, style: 'ribbon',
    wall: '#efe2c4', pier: '#e5d6b4', spandrel: '#e7dbbd', win: [2.6, 1.8], sillY: 0.85, mull: 3, lit: 0.3, blind: 0.25,
    seed: 95, glass: '#46596a', glass2: '#a5b7c5', frame: '#f4f2ea', grime: 0.08,
  });
  plasterMat(M, 'l9Plaster', '#e2d6bc', 0.1);
  plasterMat(M, 'l9PlasterPale', '#ece6d8', 0.08);
  signMat(M, 'vmaSign', { w: 1024, h: 176, bg: '#ffffff', lines: [{ text: 'ВОЕННОМЕДИЦИНСКА', size: 70, color: '#163f73', y: 56 }, { text: 'АКАДЕМИЯ', size: 70, color: '#163f73', y: 128 }] });
  signMat(M, 'aleksSign', { w: 1024, h: 144, bg: '#f4efe2', lines: [{ text: 'УМБАЛ „АЛЕКСАНДРОВСКА“', size: 72, color: '#16457a', y: 74 }] });
  signMat(M, 'satSign', {
    w: 1024, h: 192, bg: '#1d1b19',
    lines: [{ text: 'САТИРИЧЕН ТЕАТЪР', size: 86, color: '#f2d27a', y: 74 }, { text: '„АЛЕКО КОНСТАНТИНОВ“', size: 56, color: '#efe6cf', y: 148 }],
  });
  signMat(M, 'schoolSign', { w: 1024, h: 160, bg: '#f6f1e4', lines: [{ text: '36 СУ „МАКСИМ ГОРКИ“', size: 78, color: '#1c3f74', y: 82 }] });
}

/** A sign on the polygon edge nearest to (x, z), at height above the edge's ground. */
function edgeSign(b, world, y, poly, key, x, z, h, w, ratio, out = 0.32) {
  const near = nearestEdge(poly, x, z);
  const e = near.e;
  const t = Math.max(0.2, Math.min(0.8, near.t));
  const px = e.ax + e.tx * e.L * t, pz = e.az + e.tz * e.L * t;
  const gy = y(px + e.nx * 3, pz + e.nz * 3);
  b.push(px, gy, pz, e.yaw);
  const sw = Math.min(e.L - 1.2, w);
  signQuad(b, key, 0, h, out, sw, sw * ratio);
  b.pop();
  return { e, px, pz, gy };
}

export function buildVma({ world, M, y, partsOf }) {
  const parts = partsOf(/^VMA /);
  if (!parts.length) return null;
  mats(M);
  const b = new MeshBuilder();
  let sx = 0, sz = 0;
  for (const { b: bd, entry, cx, cz } of parts) {
    const poly = Array.from(bd.pts);
    sx += cx; sz += cz;
    if (/tower/.test(entry.note)) {
      const r = ward(b, M, world, poly, { facade: 'vmaTower', floors: Math.round((entry.h - 2) / 3.3), minBay: 6, endKey: 'l9PlasterPale', plant: 6, seed: 31, antenna: true });
      // the name high on the tower, facing the boulevard (west)
      edgeSign(b, world, y, poly, 'vmaSign', -4000, -1680, r.top - r.g.avg - 4.2, 14, 0.172);
    } else {
      ward(b, M, world, poly, { facade: 'vmaWing', floors: 5, minBay: 6, endKey: 'l9Plaster', plant: 3, seed: 32 });
    }
  }
  return done(b, M, sx / parts.length, sz / parts.length);
}

export function buildAleksandrovska({ world, M, y, partsOf }) {
  const parts = partsOf(/^Aleksandrovska/);
  if (!parts.length) return null;
  mats(M);
  const b = new MeshBuilder();
  const { b: bd, cx, cz } = parts[0];
  const poly = Array.from(bd.pts);
  const g = ground(world, poly);
  const top = g.avg + 3 * 3.2;
  plinth(b, 'granite', poly, g.min - 0.6, g.avg + 0.8, 0.1);
  bayRing(b, M, (e) => (e.L >= 4.5 ? 'aleksWall' : null), poly, g.avg, 3);
  b.ring((e) => (e.len < 4.5 ? 'l9Plaster' : null), poly, g.min - 0.6, top, { tw: 4, th: 4, v0: g.avg });
  ledge(b, 'stoneTrim', poly, g.avg + 3.1, 0.2, 0.08);
  ledge(b, 'stoneTrim', poly, top - 0.6, 0.6, 0.42);
  roofTop(b, poly, top, { parapet: 0.35, plant: { n: 3, seed: 41, inset: 4, maxH: 2.2 } });
  const s = edgeSign(b, world, y, poly, 'aleksSign', -3594, -1880, top - g.avg - 1.6, 12, 0.14);
  // entrance canopy under the sign
  b.push(s.px, s.gy, s.pz, s.e.yaw);
  canopy(b, { w: 6.0, d: 2.8, y: 3.2, th: 0.32, cols: 2, colR: 0.13, slab: 'white', colKey: 'steel', lights: true });
  doors(b, { x: 0, y: 0, z: 0.12, w: 2.2, h: 2.6 });
  b.pop();
  return done(b, M, cx, cz);
}

export function buildSatirical({ world, M, y, partsOf }) {
  const parts = partsOf(/^Satirical Theatre/);
  if (!parts.length) return null;
  mats(M);
  const b = new MeshBuilder();
  let sx = 0, sz = 0;
  // both OSM parts (the outline and the taller stage-house part inside it) get the theatre's stone facade; the
  // name, the canopy and the doors go on the part whose edge is nearest the entrance on the street
  const ENT = [-2095, -2492];
  let signPart = null, best = Infinity;
  for (const pp of parts) {
    const d = nearestEdge(Array.from(pp.b.pts), ENT[0], ENT[1]).d;
    if (d < best) { best = d; signPart = pp; }
  }
  for (const pp of parts) {
    const { b: bd, entry, cx, cz } = pp;
    const poly = Array.from(bd.pts);
    sx += cx; sz += cz;
    const g = ground(world, poly);
    const floors = Math.max(3, Math.round((entry.h - 1.2) / 4.2));
    const top = g.avg + floors * 4.2 + 0.6;
    plinth(b, 'granite', poly, g.min - 0.5, g.avg + 1.0, 0.12);
    bayRing(b, M, (e) => (e.L >= 5 ? 'satWall' : null), poly, g.avg, floors);
    b.ring((e) => (e.len < 5 ? 'l9Plaster' : null), poly, g.min - 0.5, top, { tw: 4, th: 4, v0: g.avg });
    ledge(b, 'stoneTrim', poly, g.avg + 4.2, 0.25, 0.12);
    ledge(b, 'stoneTrim', poly, top - 0.7, 0.7, 0.5);
    roofTop(b, poly, top, { parapet: 0.5 });
    if (pp === signPart) {
      const s = edgeSign(b, world, y, poly, 'satSign', ENT[0], ENT[1], 5.6, 9, 0.1875, 0.36);
      b.push(s.px, s.gy, s.pz, s.e.yaw);
      canopy(b, { w: 8.0, d: 2.6, y: 3.6, th: 0.4, cols: 0, slab: 'white', lights: true });
      for (const x of [-2.6, 0, 2.6]) doors(b, { x, y: 0, z: 0.12, w: 1.9, h: 2.8, frame: 'doorDark', glass: 'glassDark' });
      b.pop();
    }
  }
  return done(b, M, sx / parts.length, sz / parts.length);
}

export function buildSchool36({ world, M, y, partsOf }) {
  const parts = partsOf(/^36 SU/);
  if (!parts.length) return null;
  mats(M);
  const b = new MeshBuilder();
  const { b: bd, cx, cz } = parts[0];
  const poly = Array.from(bd.pts);
  const r = ward(b, M, world, poly, { facade: 'schoolWall', floors: 3, minBay: 5, endKey: 'l9Plaster', plant: 2, seed: 51 });
  const s = edgeSign(b, world, y, poly, 'schoolSign', -5330, -540, r.top - r.g.avg - 1.5, 11, 0.156);
  b.push(s.px, s.gy, s.pz, s.e.yaw);
  canopy(b, { w: 5.2, d: 2.4, y: 3.0, th: 0.3, cols: 2, colR: 0.12, slab: 'white', colKey: 'steel', lights: true });
  doors(b, { x: 0, y: 0, z: 0.12, w: 2.2, h: 2.5 });
  flagpoles(b, M, ['bg', 'eu'], { x: -4.4, z: 2.6, gap: 1.8, h: 7.5, y: -0.2 });
  b.pop();
  void steps;
  return done(b, M, cx, cz);
}
