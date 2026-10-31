// Храм „Свети Седмочисленици“ (Graf Ignatiev 25), the former Black Mosque of the 16th century, converted into
// a church in 1901-1903 by Alexander Pomerantsev, Yordan Milanov and Petko Momchilov in the neo-Byzantine
// style (data/research/line12/README.md). Position: the OSM dome part (pack building 3935, the domed hall).
// Built: the square prayer hall in banded stone and brick, the great lead-covered dome on a windowed drum, the
// east apse added at the conversion, the narthex with three arches and the bell tower over the entrance, crosses.
// Proportions are estimated from the footprint (no reachable drawings); the garden round it has trees.
import { MeshBuilder, makeCanvas, toTexture, cached } from '../LandmarkGeometry.js';
import { done, mat, std } from '../LandmarkInstitutionsKit.js';
import { mulberry32 } from '../../core/rng.js';

const C = [-1999.0, -2325.0]; // centre of the dome part
const TOWER = [-2011.9, -2339.4]; // the bell tower part (pack building 3936)

function churchMats(M) {
  if (M.m.l12chWall) return;
  // opus mixtum: three courses of pale stone, one band of red brick (tile 2 x 2 m)
  const t = cached('l12:chWall', () => {
    const [c, g] = makeCanvas(256, 256);
    const rnd = mulberry32(17);
    const course = 256 / 10;
    for (let r = 0; r < 10; r++) {
      const brick = r % 4 === 3;
      for (let x = (r % 2) * 20 - 20; x < 256; x += brick ? 22 : 44) {
        const v = brick ? 150 + rnd() * 25 : 205 + rnd() * 25;
        g.fillStyle = brick ? `rgb(${v},${v * 0.52},${v * 0.38})` : `rgb(${v},${v * 0.95},${v * 0.84})`;
        g.fillRect(x + 1, r * course + 1, (brick ? 22 : 44) - 2, course - 2);
      }
      g.fillStyle = 'rgba(120,110,95,0.6)';
      g.fillRect(0, r * course, 256, 1.5);
    }
    return toTexture(c);
  });
  mat(M, 'l12chWall', () => std({ map: t, roughness: 0.85 }));
  mat(M, 'l12chLead', () => std({ color: 0x7c8186, roughness: 0.5, metalness: 0.55 }));
  mat(M, 'l12chGold', () => std({ color: 0xd4a73a, roughness: 0.3, metalness: 1.0 }));
  mat(M, 'l12chWin', () => std({ color: 0x1d2328, roughness: 0.2, metalness: 0.3 }));
  mat(M, 'l12chTrim', () => std({ color: 0xe8e0cc, roughness: 0.7 }));
  mat(M, 'l12chRoof', () => std({ color: 0x8a4a33, roughness: 0.8 }));
  mat(M, 'l12chDoor', () => std({ color: 0x4a2c1c, roughness: 0.6 }));
}

/** Arched window (opening with a semicircular head) on a wall facing +z in the current frame. */
function archWindow(b, x, y, z, w, h, key = 'l12chWin') {
  b.box(key, x, y, z, w, h - w / 2, 0.05, 0, {});
  b.cyl(key, x, y + h - w / 2, z - 0.025, w / 2, w / 2, 0.05, 12);
  // stone surround and sill
  b.box('l12chTrim', x, y - 0.12, z + 0.04, w + 0.3, 0.12, 0.12, 0, {});
}

/** Cross on top of a dome or the tower. */
function cross(b, y, s = 1) {
  b.box('l12chGold', 0, y, 0, 0.08 * s, 1.6 * s, 0.08 * s, 0, {});
  b.box('l12chGold', 0, y + 1.0 * s, 0, 0.8 * s, 0.08 * s, 0.08 * s, 0, {});
  b.sphere('l12chGold', 0, y, 0, 0.18 * s);
}

export function buildSevenSaints({ M, y, replaced }) {
  if (!replaced.some((r) => /^Seven Saints/.test(r.entry.note))) return null;
  churchMats(M);
  const b = new MeshBuilder();
  const [cx, cz] = C;
  const gy = y(cx, cz);
  // the altar to the east (+x): frame with local +z pointing west (the entrance) -> yaw so that +z = -x
  b.push(cx, gy, cz, -Math.PI / 2);
  const S = 17.0, W = 12.0; // hall side and wall height
  const base = 0.0;
  // stone plinth and the hall
  b.box('granite', 0, base - 0.5, 0, S + 0.8, 1.1, S + 0.8, 0, { tw: 2, th: 2 });
  b.box('l12chWall', 0, base + 0.6, 0, S, W, S, 0, { tw: 2, th: 2, topKey: 'l12chLead' });
  // cornice, and the octagonal pendentive zone stepped up to the drum
  b.box('l12chTrim', 0, base + W + 0.5, 0, S + 0.5, 0.35, S + 0.5, 0, {});
  b.frustum('l12chLead', 0, base + W + 0.85, 0, S, S, 13.5, 13.5, 1.6, Math.PI / 8, {});
  // arched windows: two rows on each face (photos of the converted mosque show tall lower and smaller upper)
  for (let side = 0; side < 4; side++) {
    b.push(0, 0, 0, (side * Math.PI) / 2);
    for (const x of [-5.2, 0, 5.2]) {
      archWindow(b, x, base + 2.4, S / 2 + 0.01, 1.4, 3.2);
      archWindow(b, x, base + 7.4, S / 2 + 0.01, 1.1, 2.4);
    }
    b.pop();
  }
  // the drum with sixteen windows, the lead dome, lantern and cross
  const dy = base + W + 2.45, R = 7.2;
  b.cyl('l12chWall', 0, dy, 0, R, R, 3.6, 32, {});
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    b.push(Math.sin(a) * (R + 0.02), dy + 0.6, Math.cos(a) * (R + 0.02), a);
    archWindow(b, 0, 0, 0, 0.8, 2.2);
    b.pop();
  }
  b.box('l12chTrim', 0, dy + 3.6, 0, 0.1, 0.1, 0.1, 0, {});
  b.cyl('l12chTrim', 0, dy + 3.55, 0, R + 0.3, R + 0.3, 0.3, 32, {});
  b.sphere('l12chLead', 0, dy + 3.85, 0, R + 0.15, 1, 0.82, 1, 24);
  b.cyl('l12chLead', 0, dy + 3.85 + (R + 0.15) * 0.82 - 0.3, 0, 0.7, 0.6, 1.4, 12, {});
  b.sphere('l12chLead', 0, dy + 3.85 + (R + 0.15) * 0.82 + 1.1, 0, 0.75, 1, 0.8, 1, 12);
  b.push(0, 0, 0);
  cross(b, dy + 3.85 + (R + 0.15) * 0.82 + 1.7, 1.2);
  b.pop();
  // the east apse (local -z): half cylinder with a half dome and three windows
  b.push(0, 0, -S / 2);
  b.cyl('l12chWall', 0, base + 0.6, -0.01, 4.2, 4.2, 9.0, 24, {});
  b.sphere('l12chLead', 0, base + 9.6, -0.01, 4.35, 1, 0.75, 1, 18);
  for (const a of [-0.7, 0, 0.7]) {
    b.push(Math.sin(a + Math.PI) * 4.22, 0, Math.cos(a + Math.PI) * 4.22, a + Math.PI);
    archWindow(b, 0, base + 3.0, 0, 0.9, 2.8);
    b.pop();
  }
  b.pop();
  // the narthex on the west front (local +z): three arches, a pent roof, the doors
  const nz = S / 2 + 3.0;
  b.box('l12chWall', 0, base + 0.6, nz, S, 7.0, 6.0, 0, { tw: 2, th: 2, topKey: 'l12chRoof' });
  b.box('l12chTrim', 0, base + 7.6, nz, S + 0.4, 0.3, 6.4, 0, {});
  for (const x of [-5, 0, 5]) archWindow(b, x, base + 0.6, nz + 3.01, x === 0 ? 2.6 : 2.2, x === 0 ? 5.0 : 4.4, 'l12chWin');
  b.box('l12chDoor', 0, base + 0.6, nz + 2.4, 1.8, 3.0, 0.1, 0, {});
  // steps up from the garden
  for (let k = 0; k < 4; k++) b.box('graniteLight', 0, base - 0.4 + k * 0.15, nz + 3.4 + (3 - k) * 0.32, 8, 0.15, 0.32, 0, {});
  // the bell tower standing apart at the north-west corner (OSM part, 18 m to the cornice): shaft, belfry with
  // arches, dome and cross; local frame: +z west, +x south
  const [tx, tzw] = TOWER;
  const lx = tzw - cz, lz = cx - tx; // world (dx, dz) -> local (x = dz, z = -dx)
  const th = 18;
  b.push(lx, 0, lz);
  b.box('granite', 0, base - 0.5, 0, 5.4, 0.9, 5.4, 0, { tw: 2, th: 2 });
  b.box('l12chWall', 0, base + 0.4, 0, 4.6, th - 0.4, 4.6, 0, { tw: 2, th: 2 });
  b.box('l12chTrim', 0, base + th - 0.2, 0, 5.0, 0.3, 5.0, 0, {});
  for (let side = 0; side < 4; side++) {
    b.push(0, 0, 0, (side * Math.PI) / 2);
    archWindow(b, 0, base + th - 5.0, 2.31, 1.6, 4.0);
    archWindow(b, 0, base + 7.5, 2.31, 0.8, 1.8);
    if (side === 1) b.box('l12chDoor', 0, base + 0.4, 2.33, 1.3, 2.5, 0.06, 0, {});
    b.pop();
  }
  b.cyl('l12chWall', 0, base + th + 0.1, 0, 2.0, 2.0, 1.4, 16, {});
  b.sphere('l12chLead', 0, base + th + 1.5, 0, 2.1, 1, 1.1, 1, 16);
  cross(b, base + th + 3.8, 1.0);
  b.pop();
  // crosses on the apse and the narthex corners
  b.push(0, 0, -S / 2 - 3.0);
  cross(b, base + 12.6, 0.7);
  b.pop();
  b.pop();
  // the garden round the church: paving and trees are left to the world (OSM park, Vegetation)
  return done(b, M, cx, cz);
}
