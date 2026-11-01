// Millennium Center, бул. Витоша 89Б (2020; architect Borislav Bogdanov, Amfion; developer NIKMI): three towers
// on a five-storey base between Vitosha and Bulgaria boulevards; the 32-storey tower is the Grand Hotel
// Millennium Sofia, beside it a 24-storey office tower and a residential tower (data/research/line7/README.md).
// Footprints and storeys are the OSM building parts (pack); the hotel tower's height is the 112 m of the facade
// supplier's reference (Reynaers; Wikipedia gives 118 m to the top floor), the others from their storeys.
// Facade: about 40 000 m² of glass "made up of geometric forms", grey and white elements echoing the NDK
// (Reynaers, Amfion via search summaries); the pattern drawn here (white floor bands and fins, a diagonal
// lattice on the hotel tower, a glazed crown with the sky bar) is estimated.
import { MeshBuilder, orient } from '../LandmarkGeometry.js';
import { ground, done, edgesOf, mat, std, signMat, roofPlant, canopy, doors } from '../LandmarkInstitutionsKit.js';
import { off } from './kit7.js';

export function millMats(M) {
  if (M.m.l7mcGlass) return;
  M.curtain('l7mcGlass', { bayW: 1.5, floorH: 3.5, bays: 8, floors: 4, glass: '#6e8796', glass2: '#b9cbd5', mullion: '#9aa6ad', spandrel: '#7f8c93', sp: 0.0, lit: 0.42, seed: 61 }, 'mcGlass');
  M.curtain('l7mcGlass2', { bayW: 1.5, floorH: 3.5, bays: 8, floors: 4, glass: '#5f7686', glass2: '#a4b8c4', mullion: '#c9d0d4', spandrel: '#d7dcdf', sp: 0.9, lit: 0.35, seed: 62 }, 'mcGlass2');
  M.curtain('l7mcPodium', { bayW: 2.0, floorH: 4.2, bays: 6, floors: 2, glass: '#4f6270', glass2: '#9fb2bd', mullion: '#d9dde0', spandrel: '#e4e6e7', sp: 0.7, lit: 0.6, seed: 63 }, 'mcPodium');
  mat(M, 'l7mcWhite', () => std({ color: 0xeceeed, roughness: 0.45, metalness: 0.1 }));
  mat(M, 'l7mcGrey', () => std({ color: 0x8b9398, roughness: 0.5, metalness: 0.3 }));
  mat(M, 'l7mcCrown', () => { const m = std({ color: 0xbfd2dc, roughness: 0.08, metalness: 0.5, emissive: 0x9fd0ff, emissiveIntensity: 0 }); M.night.push(m); return m; });
  signMat(M, 'l7mcHotelSign', { w: 1024, h: 128, bg: '#1d2226', lines: [{ text: 'GRAND HOTEL MILLENNIUM SOFIA', size: 66, color: '#e8d6a6', y: 66, weight: 600 }] });
}

/** A flat bar 'w' wide from point p to q in a facade plane with outward normal (nx, 0, nz), facing out. */
function bar(b, key, p, q, w, nx, nz) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz) || 1;
  // in-plane perpendicular: n x d
  let px = (0 * dz - nz * dy) / L, py = (nz * dx - nx * dz) / L, pz = (nx * dy - 0 * dx) / L;
  const pl = Math.hypot(px, py, pz) || 1;
  px *= w / 2 / pl; py *= w / 2 / pl; pz *= w / 2 / pl;
  const A = [p[0] - px, p[1] - py, p[2] - pz], B = [q[0] - px, q[1] - py, q[2] - pz], C = [q[0] + px, q[1] + py, q[2] + pz], D = [p[0] + px, p[1] + py, p[2] + pz];
  // (B - A) x (C - A) must point out
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  const cx = uy * vz - uz * vy, cz = ux * vy - uy * vx;
  if (cx * nx + cz * nz >= 0) b.quad(key, A, B, C, D);
  else b.quad(key, A, D, C, B);
}

/** A glass tower on footprint Q from y0 to y1: curtain walls, white slab bands every `band` m, corner fins, roof. */
export function tower(b, M, Q, y0, y1, { key = 'l7mcGlass', band = 3.5, lattice = false, crown = 0 } = {}) {
  const [tw, th] = M.m[key].userData.tile;
  b.ring(key, Q, y0, y1 - crown, { tw, th, v0: y0 });
  // white slab bands proud of the glass
  for (let y = y0 + band; y < y1 - crown - 0.5; y += band) b.ring('l7mcWhite', off(Q, -0.12), y - 0.18, y + 0.12, { tw: 4, th: 1 });
  // fins at the corners and at every 4.5 m on the long faces
  for (const e of edgesOf(Q)) {
    const n = Math.max(1, Math.round(e.L / 4.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = e.ax + e.tx * e.L * t + e.nx * 0.2, z = e.az + e.tz * e.L * t + e.nz * 0.2;
      b.box(i === 0 || i === n ? 'l7mcWhite' : 'l7mcGrey', x, y0, z, 0.32, y1 - crown - y0, 0.32, Math.atan2(e.nx, e.nz), {});
    }
    // the hotel tower's "geometric forms": a diagonal lattice of white frames over the glass, rising in Vs
    if (lattice && e.L > 12) {
      const H = y1 - crown - y0, step = 14;
      for (let yy = y0 + 6; yy + step < y0 + H; yy += step) {
        for (const [ta, tb] of [[0, 0.5], [0.5, 1]]) {
          const ax = e.ax + e.tx * e.L * ta + e.nx * 0.3, az = e.az + e.tz * e.L * ta + e.nz * 0.3;
          const bx = e.ax + e.tx * e.L * tb + e.nx * 0.3, bz = e.az + e.tz * e.L * tb + e.nz * 0.3;
          const up = ta === 0;
          const pa = [ax, up ? yy : yy + step, az], pb = [bx, up ? yy + step : yy, bz];
          bar(b, 'l7mcWhite', pa, pb, 0.5, e.nx, e.nz);
        }
      }
    }
  }
  if (crown) {
    // the glazed crown (sky bar), set back, lit at night
    const C = off(Q, 1.2);
    b.ring('l7mcCrown', C, y1 - crown, y1, { tw: 3, th: 3 });
    b.cap('l7mcWhite', Q, y1 - crown, { s: 4 });
    b.ring('l7mcWhite', off(Q, -0.25), y1 - 0.6, y1 + 0.4, { tw: 4, th: 1 });
    b.cap('roofBitumen', C, y1, { s: 4 });
    // the white frame continuing above the roof
    b.ring((e) => (e.len > 15 ? 'l7mcWhite' : null), off(Q, -0.25), y1 + 0.4, y1 + 3.5, { tw: 4, th: 1 });
  } else {
    b.cap('roofBitumen', Q, y1, { s: 4 });
    b.ring('l7mcWhite', off(Q, -0.2), y1 - 0.3, y1 + 1.0, { tw: 4, th: 1 });
    roofPlant(b, Q, y1, { n: 3, seed: 7, inset: 2.5, maxH: 2.5 });
  }
}

export function buildMillennium({ world, M, replaced }) {
  const parts = replaced.filter((r) => /^Millennium/.test(r.entry.note));
  if (!parts.length) return null;
  millMats(M);
  const b = new MeshBuilder();
  let sx = 0, sz = 0, base = Infinity;
  for (const r of parts) base = Math.min(base, ground(world, r.b.pts).avg);
  for (const r of parts) {
    const Q = orient(Array.from(r.b.pts));
    const g = ground(world, Q);
    sx += r.cx; sz += r.cz;
    const h = r.entry.h;
    b.ring('graniteDark', Q, g.min - 0.6, base + 0.2, { tw: 3, th: 3 });
    if (/hotel tower/.test(r.entry.note)) {
      // the base storeys round the tower foot, then the tower
      b.ring('l7mcPodium', Q, base + 0.2, base + 21, { tw: M.m.l7mcPodium.userData.tile[0], th: M.m.l7mcPodium.userData.tile[1], v0: base + 0.2 });
      tower(b, M, off(Q, 0.6), base + 21, base + h, { key: 'l7mcGlass', band: 3.5, lattice: true, crown: 7 });
    } else if (/tower/.test(r.entry.note)) {
      b.ring('l7mcPodium', Q, base + 0.2, base + 21, { tw: M.m.l7mcPodium.userData.tile[0], th: M.m.l7mcPodium.userData.tile[1], v0: base + 0.2 });
      tower(b, M, off(Q, 0.6), base + 21, base + h, { key: 'l7mcGlass2', band: 3.5 });
    } else {
      // the five-storey base: glazed bands between white floor edges, roof terraces
      b.ring('l7mcPodium', Q, base + 0.2, base + h, { tw: M.m.l7mcPodium.userData.tile[0], th: M.m.l7mcPodium.userData.tile[1], v0: base + 0.2 });
      for (let y = base + 4.4; y < base + h - 0.5; y += 4.2) b.ring('l7mcWhite', off(Q, -0.15), y - 0.2, y + 0.15, { tw: 4, th: 1 });
      b.cap('roofBitumen', Q, base + h, { s: 4 });
      b.ring('l7mcGrey', off(Q, -0.1), base + h, base + h + 1.1, { tw: 4, th: 1 });
    }
  }
  // the hotel entrance: canopy with the name over the doors on the longest wall of the main base part
  const main = parts.find((r) => /base main/.test(r.entry.note));
  if (main) {
    const e = edgesOf(Array.from(main.b.pts)).sort((a, c) => c.L - a.L)[0];
    const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2;
    b.push(mx, base, mz, Math.atan2(e.nx, e.nz));
    b.push(0, 0, 3.2);
    canopy(b, { w: 16, d: 6.4, y: 4.4, th: 0.45, cols: 4, colR: 0.16, slab: 'l7mcWhite', fascia: 'l7mcGrey', colKey: 'steel', lights: true });
    b.pop();
    b.quad('l7mcHotelSign', [-7, 4.96, 6.42], [7, 4.96, 6.42], [7, 5.84, 6.42], [-7, 5.84, 6.42]);
    for (let i = -2; i <= 2; i++) doors(b, { x: i * 2.9, y: 0.2, z: 0.12, w: 2.4, h: 3.0, frame: 'steelDark', glass: 'glassDark' });
    b.pop();
  }
  return done(b, M, sx / parts.length, sz / parts.length);
}
