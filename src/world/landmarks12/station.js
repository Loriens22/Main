// Sofia Central Station (Централна гара, 1974; renovated 2014-2016), at the line 12 stops 1330 / 1331.
// Massing from the OSM footprint (pack building, 258 x 59 m; data/research/line12/README.md). The facade
// composition is estimated from the building's general description (no reachable drawings): a long, low
// brutalist hall under a heavy flat roof whose deep white fascia overhangs the front, a full-height glazed
// front behind a colonnade of square concrete piers, white stone at the ends, the station name on the
// fascia, a clock, and the entrance canopy over the forecourt.
import { MeshBuilder } from '../LandmarkGeometry.js';
import { ground, done, plinth, plasterMat, signMat, canopy, doors, roofPlant, mat, std } from '../LandmarkInstitutionsKit.js';

const H = 14.5; // top of the glazed walls above the forecourt (estimated)
const FASCIA = 3.4; // depth of the roof fascia band

/** Oriented box of a footprint (principal axis), local x along the length, local z towards the front (south). */
function frame(pts) {
  const n = pts.length / 2;
  let mx = 0, mz = 0;
  for (let i = 0; i < n; i++) { mx += pts[2 * i]; mz += pts[2 * i + 1]; }
  mx /= n; mz /= n;
  let cxx = 0, czz = 0, cxz = 0;
  for (let i = 0; i < n; i++) {
    const dx = pts[2 * i] - mx, dz = pts[2 * i + 1] - mz;
    cxx += dx * dx; czz += dz * dz; cxz += dx * dz;
  }
  const a = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  let ux = Math.cos(a), uz = Math.sin(a);
  if (ux < 0) { ux = -ux; uz = -uz; } // then local +z = (-uz, ux) points south (the forecourt)
  const vx = -uz, vz = ux;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const dx = pts[2 * i] - mx, dz = pts[2 * i + 1] - mz;
    const u = dx * ux + dz * uz, v = dx * vx + dz * vz;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { x: mx + ux * cu + vx * cv, z: mz + uz * cu + vz * cv, L: u1 - u0, W: v1 - v0, yaw: Math.atan2(-uz, ux), ux, uz };
}

function stationMats(M) {
  if (M.m.l12stGlass) return;
  // tall glazing of the hall: 1.5 m panels, 3.6 m transoms, dark aluminium mullions (estimated)
  M.curtain('l12stGlass', { bayW: 1.5, floorH: 3.6, bays: 8, floors: 4, glass: '#6d808b', glass2: '#9fb3bd', mullion: '#2f3539', spandrel: '#3c4448', sp: 0.0, lit: 0.55, seed: 74 });
  plasterMat(M, 'l12stMarble', '#ebeae4', 0.05, 0.55);
  plasterMat(M, 'l12stConcrete', '#c9c6be', 0.12, 0.9);
  mat(M, 'l12stFascia', () => std({ color: 0xefeee9, roughness: 0.6 }));
  signMat(M, 'l12stName', {
    w: 2048, h: 160, bg: '#efeee9',
    lines: [{ text: 'ЦЕНТРАЛНА ГАРА СОФИЯ', size: 118, color: '#20344f', y: 86, weight: 800 }],
  });
  signMat(M, 'l12stClock', {
    w: 256, h: 256, bg: null, alpha: true, lines: [],
    draw: (g, w, h) => {
      const c = w / 2, r = w / 2 - 6;
      g.fillStyle = '#f7f7f2'; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = 10; g.strokeStyle = '#20344f'; g.stroke();
      g.fillStyle = '#20344f';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.save(); g.translate(c, c); g.rotate(a); g.fillRect(-4, -r + 12, 8, i % 3 ? 18 : 30); g.restore();
      }
      // ten past ten, as on a still photograph
      const hand = (a, len, wd) => { g.save(); g.translate(c, c); g.rotate(a); g.fillRect(-wd / 2, -len, wd, len + 10); g.restore(); };
      hand((10 / 12) * Math.PI * 2 + (10 / 60) * (Math.PI / 6), r * 0.55, 12);
      hand((10 / 60) * Math.PI * 2, r * 0.8, 8);
    },
  });
}

export function buildCentralStation({ world, M, replaced }) {
  const part = replaced.find((r) => /^Central Station main/.test(r.entry.note));
  if (!part) return null;
  stationMats(M);
  const pts = Array.from(part.b.pts);
  const g = ground(world, pts);
  const base = g.avg;
  const F = frame(pts);
  const b = new MeshBuilder();
  // granite podium and the glazed walls of the footprint (stone at the short ends)
  plinth(b, 'granite', pts, g.min - 0.6, base + 0.45, 0.12);
  const [tw, th] = M.m.l12stGlass.userData.tile;
  b.ring((e) => (e.len >= 18 ? 'l12stGlass' : 'l12stMarble'), pts, base + 0.45, base + H, { tw, th, v0: base + 0.45 });
  // ---- in the frame of the building: x along the length, z towards the forecourt
  b.push(F.x, base, F.z, F.yaw);
  const L = F.L, W = F.W, front = W / 2, back = -W / 2;
  const over = { front: 5.0, back: 1.5, end: 2.0 };
  // the roof slab and its deep white fascia all round (the hall's defining horizontal)
  b.box('roofBitumen', 0, H, (over.front - over.back) / 2, L + 2 * over.end, 0.5, W + over.front + over.back, 0, { tw: 6, th: 6, bottom: true, topKey: 'roofBitumen' });
  const fz = front + over.front, bz = back - over.back, ex = L / 2 + over.end;
  b.box('l12stFascia', 0, H - FASCIA + 0.9, fz - 0.25, 2 * ex, FASCIA, 0.5, 0, { tw: 4, th: 4, bottom: true });
  b.box('l12stFascia', 0, H - FASCIA + 0.9, bz + 0.25, 2 * ex, FASCIA, 0.5, 0, { tw: 4, th: 4, bottom: true });
  for (const s of [-1, 1]) b.box('l12stFascia', s * (ex - 0.25), H - FASCIA + 0.9, (fz + bz) / 2, 0.5, FASCIA, fz - bz, 0, { tw: 4, th: 4, bottom: true });
  // shadow gap and coping above the fascia
  b.box('concreteDark', 0, H + 0.9, (fz + bz) / 2, 2 * ex - 0.6, 0.25, fz - bz - 0.6, 0, { tw: 4, th: 4 });
  // the soffit under the front overhang
  b.box('l12stConcrete', 0, H - 0.05, front + over.front / 2, L + 2 * over.end - 1, 0.05, over.front - 0.5, 0, { tw: 4, th: 4, bottom: true, top: false });
  // colonnade of square concrete piers carrying the front overhang
  const nP = Math.max(4, Math.round(L / 8));
  for (let i = 0; i <= nP; i++) {
    const x = -L / 2 + 2 + (i * (L - 4)) / nP;
    b.box('l12stConcrete', x, 0, front + over.front - 1.2, 1.1, H, 1.1, 0, { tw: 2, th: 2 });
  }
  // the station name on the front fascia, a clock to its right
  const sw = Math.min(46, L * 0.22), sh = sw * (160 / 2048);
  const sy = H - FASCIA / 2 + 0.9 - sh / 2, sz = fz + 0.02;
  b.quad('l12stName', [-sw / 2, sy, sz], [sw / 2, sy, sz], [sw / 2, sy + sh, sz], [-sw / 2, sy + sh, sz]);
  const cx = sw / 2 + 9, cr = 1.35, cy = H - FASCIA / 2 + 0.9;
  b.quad('l12stClock', [cx - cr, cy - cr, sz], [cx + cr, cy - cr, sz], [cx + cr, cy + cr, sz], [cx - cr, cy + cr, sz]);
  // main entrance: canopy over the forecourt and the row of doors in the glazing
  b.push(0, 0, front + over.front);
  canopy(b, { w: 34, d: 9, y: 4.6, th: 0.5, cols: 6, colR: 0.22, slab: 'l12stConcrete', fascia: 'l12stFascia', colKey: 'steelDark', lights: true });
  b.pop();
  for (let i = -3; i <= 3; i++) doors(b, { x: i * 4.2, y: 0.45, z: front + 0.06, w: 2.6, h: 3.0, frame: 'steelDark', glass: 'glassDark' });
  // steps up to the podium along the front
  b.box('graniteLight', 0, -0.4, front + 0.9, L - 6, 0.85, 1.8, 0, { tw: 2, th: 2 });
  b.pop();
  // roof lanterns over the hall and plant (seen from the overpasses round the station)
  roofPlant(b, pts, base + H + 0.5, { n: 9, seed: 12, inset: 6, maxH: 2.6 });
  return done(b, M, part.cx, part.cz);
}
