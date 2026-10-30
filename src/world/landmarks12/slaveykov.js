// пл. Славейков on Граф Игнатиев (line 12): the bronze sculpture of Petko and Pencho Slaveykov sitting on a
// bench (OSM artwork point "Петко и Пенчо Славейкови") and the open-air book market of the square (132
// tables after the 1998 renovation; data/research/line12/README.md). Positions: the sculpture point and the
// square's OSM outline; the stalls are laid out in rows along the square and kept off roads, buildings and
// the tram tracks. The figures are simplified and their pose is estimated (no reachable imagery used).
import { MeshBuilder, makeCanvas, toTexture, cached, pointInPoly } from '../LandmarkGeometry.js';
import { done, mat, std } from '../LandmarkInstitutionsKit.js';
import { mulberry32 } from '../../core/rng.js';

const SQUARE = [-2214.6, -2497.9, -2298.3, -2619.8, -2321.4, -2604.9, -2307.1, -2584.4, -2278.4, -2536.9, -2236.3, -2482.2];
const SCULPTURE = [-2308.9, -2598.2];

function mats(M) {
  if (M.m.l12books) return;
  // book covers seen from above: a grid of coloured covers with title bands
  const t = cached('l12:books', () => {
    const [c, g] = makeCanvas(256, 128);
    const rnd = mulberry32(9);
    const pal = ['#a8322d', '#1f4f8a', '#e0c341', '#2f6b3c', '#efe8d8', '#5b3a6e', '#1d1d1f', '#c96a28', '#7c8f9c', '#d8b4a0'];
    g.fillStyle = '#5a4632'; g.fillRect(0, 0, 256, 128);
    for (let y = 2; y < 128; y += 31) for (let x = 2; x < 256; x += 22) {
      const w = 18 + Math.floor(rnd() * 3), h = 26 + Math.floor(rnd() * 3);
      g.fillStyle = pal[Math.floor(rnd() * pal.length)]; g.fillRect(x, y, w, h);
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.55)';
      g.fillRect(x + 3, y + 5 + rnd() * 6, w - 6, 3); g.fillRect(x + 3, y + 12 + rnd() * 6, w - 8, 2);
    }
    return toTexture(c);
  });
  mat(M, 'l12books', () => std({ map: t, roughness: 0.8 }));
  mat(M, 'l12table', () => std({ color: 0x6e5a44, roughness: 0.75 }));
  mat(M, 'l12awning', () => std({ color: 0xece7da, roughness: 0.85 }));
}

/** A seated bronze figure on the bench (local: +z forward from the bench, y up from the seat). */
function figure(b, x, seatY, beard) {
  const k = 'bronze';
  b.box(k, x, seatY, 0.05, 0.36, 0.16, 0.34, 0, {}); // pelvis
  for (const s of [-1, 1]) {
    b.box(k, x + s * 0.1, seatY + 0.02, 0.32, 0.14, 0.14, 0.42, 0, {}); // thigh
    b.box(k, x + s * 0.1, 0.06, 0.5, 0.12, seatY - 0.02, 0.13, 0, {}); // shin
    b.box(k, x + s * 0.1, 0, 0.56, 0.12, 0.08, 0.26, 0, {}); // foot
    b.box(k, x + s * 0.22, seatY + 0.28, 0.08, 0.1, 0.32, 0.1, 0, {}); // upper arm
    b.box(k, x + s * 0.17, seatY + 0.2, 0.26, 0.09, 0.09, 0.3, 0, {}); // forearm on the thigh
  }
  b.box(k, x, seatY + 0.14, 0.0, 0.42, 0.5, 0.26, 0, {}); // torso (coat)
  b.box(k, x, seatY + 0.6, 0.0, 0.46, 0.08, 0.24, 0, {}); // shoulders
  b.cyl(k, x, seatY + 0.66, 0.02, 0.06, 0.06, 0.08, 10); // neck
  b.sphere(k, x, seatY + 0.84, 0.03, 0.11, 1, 1.12, 1.05, 12); // head
  if (beard) b.sphere(k, x, seatY + 0.74, 0.09, 0.075, 1, 1.2, 0.8, 10);
}

export function buildSlaveykov({ world, M, y }) {
  mats(M);
  const b = new MeshBuilder();
  // ---- the sculpture: granite slab, bronze bench, father and son (Petko with the beard)
  const [sx, sz] = SCULPTURE;
  const gy = y(sx, sz);
  // the bench faces across the square (towards its middle)
  const mx = (SQUARE[0] + SQUARE[2]) / 2, mz = (SQUARE[1] + SQUARE[3]) / 2;
  const yaw = Math.atan2(mx - sx, mz - sz);
  b.push(sx, gy, sz, yaw);
  b.box('granite', 0, -0.2, 0.2, 3.0, 0.32, 1.6, 0, { tw: 2, th: 2 });
  const top = 0.12, seatY = top + 0.44;
  b.box('bronze', 0, top + 0.38, 0, 2.3, 0.07, 0.48, 0, {}); // seat
  b.box('bronze', 0, top + 0.5, -0.24, 2.3, 0.42, 0.05, 0, {}); // back
  for (const x of [-1.05, 1.05]) b.box('bronze', x, top, 0, 0.08, 0.42, 0.44, 0, {});
  figure(b, -0.55, seatY, true);
  figure(b, 0.25, seatY, false);
  b.pop();
  // ---- the book market: rows of tables along the square, off roads, buildings and the tracks
  const ax = SQUARE[2] - SQUARE[0], az = SQUARE[3] - SQUARE[1], L = Math.hypot(ax, az);
  const ux = ax / L, uz = az / L, vx = -uz, vz = ux;
  const ty = Math.atan2(ux, uz);
  let n = 0;
  for (let row = -2; row <= 2; row++) {
    for (let t = 6; t < L - 6 && n < 132; t += 2.2) {
      const x = SQUARE[0] + ux * t + vx * row * 4.2 + vx * 8, z = SQUARE[1] + uz * t + vz * row * 4.2 + vz * 8;
      if (!pointInPoly(SQUARE, x, z)) continue;
      if (Math.hypot(x - sx, z - sz) < 7) continue;
      if (world.roads.onRoad(x, z, 1.2) || world.bgrid.pointInAny(x, z) >= 0) continue;
      if (world.sweep && world.sweep.hits(x, z, 1.2)) continue;
      const gyy = y(x, z);
      b.push(x, gyy, z, ty);
      b.box('l12table', 0, 0.72, 0, 0.8, 0.05, 1.8, 0, {});
      for (const [lx, lz] of [[-0.35, -0.8], [0.35, -0.8], [-0.35, 0.8], [0.35, 0.8]]) b.box('steelDark', lx, 0, lz, 0.04, 0.72, 0.04, 0, {});
      b.box('l12books', 0, 0.77, 0, 0.74, 0.07, 1.72, 0, { tw: 1.72, th: 1 });
      if (n % 3 === 0) b.box('l12awning', 0, 2.1, 0, 1.3, 0.04, 2.2, 0, { bottom: true });
      if (n % 3 === 0) b.box('steelDark', 0.55, 0, 0.95, 0.04, 2.1, 0.04, 0, {});
      b.pop();
      n++;
    }
  }
  return done(b, M, sx, sz);
}
