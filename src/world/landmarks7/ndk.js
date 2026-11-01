// Национален дворец на културата (НДК), 1978-1981, architects Alexander Barov and team, engineer Bogdan Atanasov
// (data/research/line7/README.md). 123 000 m² on 8 floors above ground and 3 below, clad in Vratsa limestone;
// the bronze "Sun" of Georgi Chapkanov on the facade. Placed on the OSM building parts (pack): the main body
// (40 m, the irregular octagon with the long diagonal faces), the 12 m south block, the 10 m wings either side
// and the two 4 m terraces flanking the north entrance, the fountain basins of the plaza in front of it.
// The facade composition is estimated (no reachable drawings or photographs used): a recessed, glazed ground
// floor behind stone piers; pale limestone walls with dark window ribbons; the upper floors of dark bronze glass
// leaning out over them; a stone band, and the battered stone crown of the great hall above a roof terrace.
import { MeshBuilder, orient, pointInPoly } from '../LandmarkGeometry.js';
import { ground, done, edgesOf, mat, std, roofPlant, flagpoles, steps } from '../LandmarkInstitutionsKit.js';
import { off, loftRing, capRing, disc, rays, fountain } from './kit7.js';

function ndkMats(M) {
  if (M.m.l7ndkStone) return;
  M.panel('l7ndkStone', 'ndkStone', { w: 3.0, h: 1.5, base: '#e3ded3', joint: 'rgba(84,78,68,0.32)', cols: 2, rows: 1, noise: 0.07, seed: 51, stain: 0.05 });
  M.panel('l7ndkCrown', 'ndkCrown', { w: 4.0, h: 2.0, base: '#d8d2c5', joint: 'rgba(84,78,68,0.30)', cols: 2, rows: 1, noise: 0.08, seed: 52, stain: 0.06 });
  M.curtain('l7ndkCurtain', { bayW: 1.8, floorH: 4.6, bays: 6, floors: 3, glass: '#34322e', glass2: '#625c52', mullion: '#1f1d1b', spandrel: '#2a2825', sp: 0.0, lit: 0.5, seed: 33 }, 'ndkCurtain');
  M.curtain('l7ndkRibbon', { bayW: 1.5, floorH: 2.0, bays: 8, floors: 1, glass: '#2f2d2a', glass2: '#58524a', mullion: '#1c1b19', spandrel: '#1c1b19', sp: 0, lit: 0.45, seed: 34 }, 'ndkRibbon');
  M.curtain('l7ndkLobby', { bayW: 2.4, floorH: 4.5, bays: 5, floors: 1, glass: '#3a4246', glass2: '#7f898d', mullion: '#25282b', spandrel: '#25282b', sp: 0, lit: 0.95, seed: 35 }, 'ndkLobby');
  M.curtain('l7ndkPortal', { bayW: 1.6, floorH: 3.2, bays: 8, floors: 4, glass: '#3d4549', glass2: '#8a959a', mullion: '#2b2e31', spandrel: '#2b2e31', sp: 0, lit: 0.9, seed: 36 }, 'ndkPortal');
  mat(M, 'l7ndkSun', () => std({ color: 0xc08a3c, roughness: 0.3, metalness: 1.0 }));
  mat(M, 'l7ndkSoffit', () => std({ color: 0x9a958b, roughness: 0.9 }));
  mat(M, 'l7jet', () => std({ color: 0xf2f8ff, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false }));
  mat(M, 'l7rail', () => std({ color: 0xb9c3c8, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }));
}

const tile = (M, k) => M.m[k].userData.tile || [4, 4];

export function buildNdk({ world, M, replaced }) {
  const get = (re) => replaced.find((r) => re.test(r.entry.note));
  const main = get(/^NDK main/);
  if (!main) return null;
  ndkMats(M);
  const b = new MeshBuilder();
  const P = orient(Array.from(main.b.pts));
  const g = ground(world, P);
  const base = g.avg;
  const Y = (h) => base + h;
  const [ct, ch] = tile(M, 'l7ndkCurtain');
  // ---- ground floor: lobby glazing recessed behind stone piers, the soffit above it
  b.ring('graniteDark', P, g.min - 0.8, Y(0.3), { tw: 3, th: 3 });
  b.ring('l7ndkLobby', off(P, 2.2), Y(0.3), Y(4.5), { tw: tile(M, 'l7ndkLobby')[0], th: tile(M, 'l7ndkLobby')[1], v0: Y(0.3) });
  capRing(b, 'l7ndkSoffit', P, off(P, 2.2), Y(4.5), false);
  capRing(b, 'graniteLight', P, off(P, 2.2), Y(0.3), true, 2);
  for (const e of edgesOf(P)) {
    const n = Math.max(2, Math.round(e.L / 7.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = e.ax + e.tx * e.L * t - e.nx * 0.6, z = e.az + e.tz * e.L * t - e.nz * 0.6;
      b.box('l7ndkStone', x, Y(0.3), z, 1.2, 4.2, 1.2, Math.atan2(e.nx, e.nz), { tw: 3, th: 1.5 });
      // uplights at the piers (the facade is floodlit at night)
      b.box('lamp', x + e.nx * 0.9, Y(0.3), z + e.nz * 0.9, 0.3, 0.12, 0.3, 0, {});
    }
  }
  // ---- 4.5-15 m: limestone with two dark window ribbons
  b.ring('l7ndkStone', P, Y(4.5), Y(15), { tw: 3, th: 1.5, v0: Y(4.5) });
  for (const yb of [7.4, 11.4]) b.ring('l7ndkRibbon', off(P, -0.04), Y(yb), Y(yb + 2.0), { tw: tile(M, 'l7ndkRibbon')[0], th: 2.0, v0: Y(yb) });
  // ---- 15-29 m: dark bronze glass leaning out over the stone, its soffit
  const O1 = off(P, -2.0), O2 = off(P, -3.2);
  capRing(b, 'l7ndkSoffit', O1, P, Y(15), false);
  loftRing(b, 'l7ndkCurtain', O1, Y(15), O2, Y(29), { tw: ct, th: ch });
  // ---- 29-31.5 m: the stone band, the roof terrace, the battered crown of the great hall to 40 m
  const O3 = off(P, -3.3);
  b.ring('l7ndkStone', O3, Y(29), Y(31.5), { tw: 3, th: 1.5 });
  capRing(b, 'l7ndkSoffit', O3, O2, Y(29), false);
  const C0 = off(P, 4.0), C1 = off(P, 7.0);
  capRing(b, 'graniteLight', O3, C0, Y(31.5), true, 3);
  b.ring('steel', off(P, -3.1), Y(31.5), Y(32.6), { tw: 2, th: 2 });
  loftRing(b, 'l7ndkCrown', C0, Y(31.5), C1, Y(40), { tw: 4, th: 2 });
  b.cap('roofBitumen', C1, Y(40), { s: 6 });
  b.ring('l7ndkStone', C1, Y(40), Y(40.9), { tw: 3, th: 1.5 });
  roofPlant(b, off(P, 14), Y(40), { n: 7, seed: 41, inset: 4, maxH: 3.2, antenna: true });
  // ---- the north entrance: the glazed portal, the bronze Sun above it, the grand staircase to the terrace
  const north = edgesOf(P).filter((e) => e.L > 20).sort((a, c) => a.nz - c.nz)[0];
  if (north) {
    const mx = (north.ax + north.bx) / 2, mz = (north.az + north.bz) / 2;
    const yaw = Math.atan2(north.nx, north.nz);
    b.push(mx, 0, mz, yaw);
    const W = north.L * 0.86;
    // portal glazing proud of the stone up to the overhang, stone fins either side
    b.box('l7ndkPortal', 0, Y(4.5), 0.35, W, 10.3, 0.3, 0, { tw: tile(M, 'l7ndkPortal')[0], th: tile(M, 'l7ndkPortal')[1] });
    for (const sx of [-1, 1]) b.box('l7ndkStone', sx * (W / 2 + 0.7), Y(0.3), 0.6, 1.4, 14.7, 1.4, 0, { tw: 3, th: 1.5 });
    // the Sun (bronze disc with rays) on the dark glass, centred over the entrance
    const sy = Y(22.2), sz = 2.6 + 0.12;
    disc(b, 'l7ndkSun', 0, sy, sz, 2.6, 32);
    rays(b, 'l7ndkSun', 0, sy, sz + 0.01, 2.8, 5.6, 24, 0.55);
    // staircase from the plaza: its foot follows the terrain in front
    const fy = world.hf.heightAt(mx + north.nx * 12, mz + north.nz * 12);
    const n = Math.max(8, Math.round((Y(4.5) - fy) / 0.16));
    const rise = (Y(4.5) - fy) / n;
    b.push(0, fy, 0.4);
    steps(b, 'graniteLight', { w: W, n, rise, tread: 0.42, z0: 0 });
    // handrails down the stairs
    for (const x of [-W / 3, 0, W / 3]) {
      const L = n * 0.42;
      for (let k = 0; k < 3; k++) b.box('steel', x, (n - k * n / 3) * rise - 0.1 + 0.9, (k + 0.5) * L / 3, 0.06, 0.06, L / 3, 0, {});
    }
    b.pop();
    // flags in front of the stairs
    b.push(-W / 2 + 2, fy, n * 0.42 + 4);
    flagpoles(b, M, ['bg', 'eu', 'bg', 'eu', 'bg', 'eu', 'bg', 'eu'], { gap: (W - 4) / 7, h: 10 });
    b.pop();
    b.pop();
  }
  // ---- the terraces either side of the entrance (4 m), the wings (10 m) and the south block (12 m)
  for (const r of replaced.filter((q) => /^NDK (terrace|wing|south)/.test(q.entry.note))) {
    const Q = orient(Array.from(r.b.pts));
    const gq = ground(world, Q);
    const top = Y(r.entry.h);
    if (/terrace/.test(r.entry.note)) {
      b.ring('l7ndkStone', Q, gq.min - 0.6, top, { tw: 3, th: 1.5 });
      b.cap('graniteLight', Q, top, { s: 2 });
      b.ring('l7rail', off(Q, 0.25), top, top + 1.1, { tw: 2, th: 2 });
      b.ring('steel', off(Q, 0.25), top + 1.06, top + 1.12, { tw: 2, th: 2 });
      // planters along the terrace
      for (const e of edgesOf(Q)) if (e.L > 20) {
        for (let t = 0.15; t < 0.9; t += 0.18) b.box('concrete', e.ax + e.tx * e.L * t - e.nx * 2.2, top, e.az + e.tz * e.L * t - e.nz * 2.2, 1.6, 0.6, 1.6, 0, {});
      }
    } else {
      const H = top - gq.min;
      b.ring('l7ndkStone', Q, gq.min - 0.6, top, { tw: 3, th: 1.5 });
      for (let yb = 3.2; yb + 2 < r.entry.h; yb += 3.6) b.ring('l7ndkRibbon', off(Q, -0.04), Y(yb), Y(yb + 1.8), { tw: 12, th: 1.8, v0: Y(yb) });
      b.cap('roofBitumen', Q, top, { s: 6 });
      b.ring('l7ndkStone', Q, top, top + 0.8, { tw: 3, th: 1.5 });
      if (H > 8) roofPlant(b, Q, top, { n: 3, seed: r.b.id, inset: 3, maxH: 2 });
    }
  }
  // ---- jets in the fountain basins of the plaza (OSM water areas north of the building)
  const [cx, cz] = [main.cx, main.cz];
  for (const a of world.data.areas) {
    if (a.type !== 'water' || a.pts.length < 6) continue;
    let ax = 0, az = 0;
    const n = a.pts.length / 2;
    for (let i = 0; i < n; i++) { ax += a.pts[2 * i]; az += a.pts[2 * i + 1]; }
    ax /= n; az /= n;
    if (Math.hypot(ax - cx, az - cz) > 320 || pointInPoly(P, ax, az)) continue;
    fountain(b, world, Array.from(a.pts), { gap: 4.2, h: 3.2 });
  }
  return done(b, M, cx, cz);
}
