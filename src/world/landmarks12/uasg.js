// УАСГ (University of Architecture, Civil Engineering and Geodesy, bul. Hristo Smirnenski 1) at the stop of the
// same name: the twelve-storey teaching block (OSM "Нова сграда", 36.6 m, pack building 2950) and the
// four-storey rectorate wing (OSM "Ректорат", 12.6 m, pack building 3017). Footprints and heights from OSM;
// the facades follow the type of the buildings (a late-modernist concrete slab with ribbon windows and a stone
// plinth, the older wing with punched windows), estimated (no reachable drawings).
import { MeshBuilder } from '../LandmarkGeometry.js';
import { done, facadeMat, plasterMat, signMat, ward, nearestEdge, doors, canopy } from '../LandmarkInstitutionsKit.js';

function uasgMats(M) {
  facadeMat(M, 'l12uasgSlab', {
    bayW: 3.0, floorH: 3.05, bays: 8, floors: 2, ppm: 30, style: 'ribbon', wall: '#d8d4c8', pier: '#cfcab9', spandrel: '#c4bfae',
    win: [2.6, 1.55], sillY: 0.9, mull: 3, lit: 0.25, blind: 0.45, seed: 121, glass: '#46545f', glass2: '#9fb0bc', frame: '#e5e2d8',
    slabCol: 'rgba(255,255,255,0.22)',
  });
  facadeMat(M, 'l12uasgRect', {
    bayW: 3.3, floorH: 3.15, bays: 8, floors: 2, ppm: 30, style: 'punched', wall: '#e3dccb', pier: '#d9d1be',
    win: [1.7, 1.9], sillY: 0.8, mull: 2, fr: 0.06, lit: 0.3, blind: 0.4, seed: 123, glass: '#435468', glass2: '#a8b8c4',
    frame: '#f2efe6', surround: '#ece4d0', surroundW: 0.1, sill: '#d4cab4', lintel: true, rustic: { floors: 1, h: 0.4 },
  });
  plasterMat(M, 'l12uasgEnd', '#d2cdbf', 0.12);
  plasterMat(M, 'l12uasgEnd2', '#e1d9c7', 0.1);
  signMat(M, 'l12uasgPlaque', {
    w: 512, h: 160, bg: '#26313b', glow: false,
    lines: [
      { text: 'УНИВЕРСИТЕТ ПО АРХИТЕКТУРА,', size: 34, color: '#e9e4d6', y: 52 },
      { text: 'СТРОИТЕЛСТВО И ГЕОДЕЗИЯ', size: 34, color: '#e9e4d6', y: 100 },
    ],
  });
}

export function buildUasg({ world, M, y, replaced }) {
  const parts = replaced.filter((r) => /^UASG/.test(r.entry.note));
  if (!parts.length) return null;
  uasgMats(M);
  const b = new MeshBuilder();
  let sx = 0, sz = 0;
  for (const { b: bd, entry, cx, cz } of parts) {
    sx += cx; sz += cz;
    const poly = Array.from(bd.pts);
    if (/podium/.test(entry.note)) {
      ward(b, M, world, poly, { facade: 'l12uasgSlab', floors: 2, minBay: 6, endKey: 'l12uasgEnd', plant: 2, seed: 35 });
    } else if (/tower/.test(entry.note)) {
      const r = ward(b, M, world, poly, { facade: 'l12uasgSlab', floors: 12, minBay: 6, endKey: 'l12uasgEnd', plant: 4, seed: 31 + bd.id % 7, antenna: /main/.test(entry.note) });
      if (!/main/.test(entry.note)) continue;
      // the entrance on the long side facing the boulevard, with a canopy and the name plaque
      const near = nearestEdge(poly, -1700, -1560);
      const e = near.e;
      const mx = e.ax + e.tx * e.L * 0.5, mz = e.az + e.tz * e.L * 0.5;
      const gy = y(mx + e.nx * 4, mz + e.nz * 4);
      b.push(mx, gy, mz, e.yaw);
      const fl = Math.max(0, r.base - gy);
      canopy(b, { w: 12, d: 4, y: fl + 3.6, th: 0.4, cols: 4, colR: 0.18, slab: 'concrete', colKey: 'steelDark', lights: true });
      for (const x of [-3, 0, 3]) doors(b, { x, y: fl, z: 0.12, w: 2.2, h: 2.7 });
      b.quad('l12uasgPlaque', [-3.2, fl + 3.0, 0.14], [3.2, fl + 3.0, 0.14], [3.2, fl + 5.0, 0.14], [-3.2, fl + 5.0, 0.14]);
      b.pop();
    } else {
      ward(b, M, world, poly, { facade: 'l12uasgRect', floors: 4, minBay: 7, endKey: 'l12uasgEnd2', plant: 3, seed: 33 });
    }
  }
  return done(b, M, sx / parts.length, sz / parts.length);
}
