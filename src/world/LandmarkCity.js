// City-centre landmarks around the western end of Route 280: the Sofia University Rectorate and
// wings, the National Library, the Eagles' Bridge columns, the St Kliment Ohridski monument and the
// Havel square heart. Positions and sizes from data/research/world/west/landmarks.json.
// Every builder returns {x, z, meshes} (merged per material, compact bounds) or null.
import * as THREE from 'three';
import { MeshBuilder, orient, centroid } from './LandmarkGeometry.js';
import { eagle, lion, seatedFigure, standingFigure } from './LandmarkSculpture.js';
import { facade } from './LandmarkFacade.js';

const ground = (world, pts) => {
  let mn = Infinity, sum = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const h = world.hf.heightAt(pts[2 * i], pts[2 * i + 1]);
    mn = Math.min(mn, h);
    sum += h;
  }
  return { avg: sum / n, min: mn };
};

const done = (b, M, x, z, extra) => ({ x, z, meshes: b.meshes(M.m), tris: b.triangles, ...extra });

// ------------------------------------------------------------------ Rectorate
const CENTRAL = [-1425.1, -2739.5, -1424.2, -2721.6, -1420.3, -2702.6, -1413.1, -2693.6, -1398.7, -2702.1, -1389.3, -2701.9, -1368.3, -2745.3, -1389.7, -2745.9, -1398.2, -2748.1, -1408.7, -2746.4, -1423.5, -2751.7];
const NORTH = [-1419.5, -2770.1, -1412.8, -2796.5, -1410.6, -2814.7, -1402.8, -2820.0, -1388.0, -2816.1, -1388.0, -2812.4, -1324.9, -2795.1, -1320.8, -2796.6, -1306.7, -2792.7, -1302.4, -2789.7, -1301.0, -2782.6, -1304.9, -2768.5, -1311.5, -2763.6, -1332.1, -2769.3, -1392.5, -2788.4, -1397.9, -2768.9, -1403.2, -2746.2, -1423.5, -2751.7];
const SOUTH = [-1416.9, -2695.4, -1402.4, -2670.6, -1388.7, -2653.3, -1378.2, -2638.2, -1368.8, -2636.7, -1355.9, -2649.8, -1339.3, -2663.3, -1355.6, -2682.9, -1372.4, -2668.1, -1384.7, -2683.1, -1397.7, -2700.2];

function wingFacades(M) {
  return M.stoneWall('wing', 'suWing', { bayW: 3.8, floorH: 3.72, bays: 4, floors: 2, wall: '#d6c8a4', trim: '#b3a27c', win: [1.35, 2.15], sill: 0.85, ashlar: { w: 1.2, h: 0.62 }, seed: 5, lit: 0.28 });
}

export function buildRectorate({ world, M, y, kit }) {
  const b = new MeshBuilder();
  const wing = wingFacades(M);
  const rust = M.stoneWall('rust', 'suRust', { bayW: 4.2, floorH: 4.6, bays: 4, floors: 1, wall: '#cdb985', trim: '#b9a070', win: [1.05, 2.1], sill: 1.2, arch: true, ashlar: { w: 1.4, h: 0.58, line: 'rgba(0,0,0,0.24)' }, seed: 8, lit: 0.2 });
  const nob = M.stoneWall('nob', 'suNobile', { bayW: 4.2, floorH: 6.2, bays: 4, floors: 1, wall: '#d9c797', trim: '#c4ad7a', win: [1.6, 3.7], sill: 1.15, arch: true, pediment: true, frame: 0.09, seed: 9, lit: 0.3 });
  const sec = M.stoneWall('sec', 'suSecond', { bayW: 4.2, floorH: 5.2, bays: 4, floors: 1, wall: '#d9c797', trim: '#c4ad7a', win: [1.3, 2.5], sill: 1.2, frame: 0.08, seed: 10, lit: 0.3 });
  const att = M.stoneWall('att', 'suAttic', { bayW: 4.2, floorH: 4.2, bays: 4, floors: 1, wall: '#ddcc9f', trim: '#c4ad7a', win: [0.9, 0.9], sill: 1.9, seed: 11, lit: 0.25 });

  // ---------- central block (main facade to Vasil Levski on the west)
  {
    const g = ground(world, CENTRAL);
    const base = g.avg, bot = g.min - 0.6, top = base + 20.2;
    if (M.realFacades === false) {
      const band = (key, tile, y0, y1) => b.ring(key, CENTRAL, base + y0, base + y1, { tw: tile[0], th: tile[1], v0: base + y0 });
      b.ring('rust', CENTRAL, bot, base + 4.6, { tw: rust[0], th: rust[1], v0: base });
      band('nob', nob, 4.6, 10.8);
      band('sec', sec, 10.8, 16.0);
      band('att', att, 16.0, 20.2);
    } else {
      // rusticated ground floor with small arched windows, the piano nobile with tall arched windows under
      // pediments, a second floor of plain windows, the attic storey with square windows
      const stone = M.lf('ashlar', '#ddcfa6', 21), rustic = M.lf('rustic', '#cfbd8d', 22), trim = M.lf('trim', '#e8dcbc', 23);
      facade(b, CENTRAL, base, {
        height: 20.2, wall: stone, wallTile: M.tile(stone), tiles: { [rustic]: M.tile(rustic) }, bayW: 4.2, endPier: 1.6, depth: 0.4,
        frame: M.lfColor('#e9e4d4', 0.5, 0.05), glass: M.lfGlass('public', 0xb0bcc2), sill: trim, reveal: trim,
        storeys: [
          { h: 4.6, wall: rustic, win: { w: 1.1, h: 2.1, sill: 1.2, arch: true, cols: 2, rows: 2 }, surround: { w: 0.18, d: 0.07, key: trim, head: 'keystone' } },
          { h: 6.2, win: { w: 1.6, h: 3.7, sill: 1.15, arch: true, cols: 2, rows: 3 }, surround: { w: 0.2, d: 0.08, key: trim, head: 'pediment' } },
          { h: 5.2, win: { w: 1.3, h: 2.5, sill: 1.2, cols: 2, rows: 2 }, surround: { w: 0.16, d: 0.06, key: trim, head: 'cornice' } },
          { h: 4.2, win: { w: 0.95, h: 0.95, sill: 1.6, cols: 1, rows: 1 }, surround: { w: 0.12, d: 0.05, key: trim } },
        ],
        plinth: { h: 0.8, d: 0.12, key: 'granite' },
        pilasters: { every: 1, w: 0.7, d: 0.14, key: stone, from: 1, capital: true },
        bands: [{ y: 4.6, h: 0.45, d: 0.22, key: trim }, { y: 15.95, h: 0.3, d: 0.15, key: trim }],
        cornice: { h: 0.9, d: 0.6, key: trim, steps: 3 }, seed: 21,
      });
    }
    b.cap('roofDark', CENTRAL, top + (M.realFacades === false ? 0 : 0.9), { s: 4 });
    // pitched crown along the front (mansard-like) and a parapet line
    const A = [-1425.1, -2739.5], B = [-1420.3, -2702.6];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const tx = (B[0] - A[0]) / L, tz = (B[1] - A[1]) / L;
    const nx = -tz, nz = tx; // outward (west)
    const ox = -1424.2, oz = -2721.6; // facade centre on the bulged middle vertex
    const yaw = Math.atan2(nx, nz);
    const gy = y(ox, oz);
    b.push(ox, gy, oz, yaw);
    // roof pitch over the front 13 m, ridge along the facade
    b.gable('roofDark', 0, top - gy, -7.5, 33, 13, 3.4, 0, { overhang: 0.0, eave: 0.0, gableKey: 'roofDark', s: 3 });
    const FL = 1.6; // ground-floor level above the pavement (stair rise)
    // avant-corps: pierced slab with the arch opening and two statue niches, front face at z = +1.5, back at -1.5
    const arch = (cx, w, y0, y1) => {
      const r = w / 2, pts = [];
      pts.push([cx - r, y0]);
      for (let a = 0; a <= 12; a++) { const t = Math.PI - (a / 12) * Math.PI; pts.push([cx + r * Math.cos(t), y1 - r + r * Math.sin(t)]); }
      pts.push([cx + r, y0]);
      return pts.reverse();
    };
    const AW = 9.4; // half width of the avant-corps
    b.push(0, 0, -1.5, 0);
    b.extrude('stonePale', [[-AW, 0], [AW, 0], [AW, 16.4], [-AW, 16.4]], 3.0, {
      holes: [arch(0, 4.9, FL, FL + 7.7), arch(-5.75, 2.6, FL + 1.0, FL + 6.6), arch(5.75, 2.6, FL + 1.0, FL + 6.6)],
    });
    b.pop();
    // recess back panels: dark door with a bronze frame, shadow niches
    b.extrude('doorDark', arch(0, 4.9, FL, FL + 7.7), 0.1, { matrix: new THREE.Matrix4().makeTranslation(0, 0, 0.3) });
    for (const sx of [-1, 1]) b.extrude('graniteDark', arch(sx * 5.75, 2.6, FL + 1.0, FL + 6.6), 0.1, { matrix: new THREE.Matrix4().makeTranslation(0, 0, 0.3) });
    // doors: three bronze door leaves with glazing, tympanum
    for (const dx of [-1.2, 0, 1.2]) b.box('bronze', dx, FL, 0.5, 1.1, 3.6, 0.1, 0, {});
    b.box('glassDark', 0, FL + 3.7, 0.5, 4.2, 2.6, 0.06, 0, {});
    // statues of Socrates and Plato in the niches
    for (const sx of [-1, 1]) {
      b.box('granite', sx * 5.75, FL, 0.75, 1.2, 1.0, 0.9, 0, { tw: 4, th: 4 });
      if (kit) kit.put(b, 'figureStanding', sx * 5.75, FL + 1.0, 0.75, 0, 2.7);
      else {
        b.push(sx * 5.75, FL + 1.0, 0.75, 0);
        standingFigure(b, 'bronze', 2.7);
        b.pop();
      }
    }
    // four engaged columns (Corinthian order) on pedestals: Blender base, fluted shaft and capital
    for (const cx of [-7.9, -3.6, 3.6, 7.9]) {
      b.box('stoneLight', cx, FL, 2.1, 1.3, 0.9, 1.3, 0, {});
      if (kit) kit.column(b, cx, FL + 0.9, 2.1, 0.48, FL + 10.33);
      else {
        b.cyl('stoneLight', cx, FL + 0.9, 2.1, 0.62, 0.55, 0.28, 14);
        b.cyl('stoneLight', cx, FL + 1.18, 2.1, 0.52, 0.42, 8.4, 16);
        b.cyl('stoneLight', cx, FL + 9.58, 2.1, 0.44, 0.64, 0.55, 16);
        b.box('stoneLight', cx, FL + 10.13, 2.1, 1.4, 0.2, 1.4, 0, {});
      }
    }
    // entablature + attic with inscription panel, statue plinths and balustrade
    const E0 = FL + 10.33;
    b.box('stoneLight', 0, E0, 0.75, 2 * AW + 0.8, 0.5, 4.5, 0, {});
    b.box('stoneLight', 0, E0 + 0.5, 0.75, 2 * AW + 0.6, 0.6, 4.3, 0, {});
    b.box('stoneLight', 0, E0 + 1.1, 0.75, 2 * AW + 1.2, 0.55, 4.9, 0, {});
    const T0 = E0 + 1.65;
    b.box('stoneLight', 0, T0, 0, 2 * AW - 0.4, 2.6, 3.0, 0, {});
    b.quad('bronze', [-3.1, T0 + 0.5, 1.51], [3.1, T0 + 0.5, 1.51], [3.1, T0 + 2.1, 1.51], [-3.1, T0 + 2.1, 1.51]);
    for (const cx of [-7.9, -3.6, 3.6, 7.9]) {
      b.box('stoneLight', cx, T0 + 2.6, 1.0, 1.1, 1.0, 1.1, 0, {});
      if (kit) kit.put(b, 'figureStanding', cx, T0 + 3.6, 1.0, 0, 1.9);
      else {
        b.push(cx, T0 + 3.6, 1.0, 0);
        standingFigure(b, 'bronze', 1.9);
        b.pop();
      }
    }
    b.box('stoneLight', 0, T0 + 2.6, 0.9, 2 * AW - 0.4, 0.8, 0.5, 0, {});
    // stair: 8 steps, 15.8 m wide, rising to the ground-floor level; cheek walls
    for (let j = 0; j < 8; j++) {
      const top = FL - j * 0.2;
      b.box('graniteLight', 0, 0, 3.65 + j * 0.38 + 0.19, 15.8, top, 0.38, 0, { tw: 4, th: 4, bottom: false });
    }
    b.box('graniteLight', 0, 0, 2.6, 15.8, FL, 1.0, 0, { tw: 4, th: 4 });
    for (const sx of [-1, 1]) for (let j = 0; j < 9; j++) {
      const top = FL - j * 0.2 + 0.6;
      b.box('graniteLight', sx * 8.3, 0, 2.8 + j * 0.42 + 0.21, 0.7, Math.max(top, 0.8), 0.42, 0, { tw: 4, th: 4 });
    }
    // lions on plinths at the foot of the stair, donors' statues in front
    for (const sx of [-1, 1]) {
      if (kit) {
        // lions on the cheek-wall plinths, the donors in their armchairs on granite pedestals
        b.box('graniteLight', sx * 8.3, 0, 6.9, 0.95, 0.85, 1.9, 0, { tw: 4, th: 4 });
        b.box('graniteLight', sx * 8.3, 0.85, 6.9, 1.05, 0.1, 2.0, 0, { tw: 4, th: 4 });
        kit.put(b, 'lion', sx * 8.3, 0.95, 6.9 + 0.95, 0, 0.95);
        b.box('graniteLight', sx * 4.6, 0, 8.3, 1.4, 1.1, 1.3, 0, { tw: 4, th: 4 });
        kit.put(b, 'figureSeated', sx * 4.6, 1.1, 8.25, 0, 1.45);
      } else {
        b.push(sx * 8.3, 0, 6.9, 0);
        lion(b, 'graniteLight', 'graniteLight', 0.95);
        b.pop();
        b.push(sx * 4.6, 0, 8.3, 0);
        seatedFigure(b, 'bronze', 'graniteLight', 0.85);
        b.pop();
      }
    }
    b.pop();
  }

  // ---------- north wing (stone slab on Shipka, 5 floors, flat roof) and south wing (Tsar Osvoboditel)
  const wingShell = (poly, h, entrances) => {
    const g = ground(world, poly);
    const base = g.avg, bot = g.min - 0.6, top = base + h;
    if (M.realFacades === false) {
      b.ring('wing', poly, bot, top, { tw: wing[0], th: wing[1], v0: base });
      b.ring('stoneTrim', poly, base + h - 1.2, base + h - 1.0, { tw: 4, th: 4, o: 0 });
    } else {
      // stone-clad slab: five storeys of tall windows in deep reveals, a band under the top floor
      const stone = M.lf('ashlar', '#ddd3ba', 24), trim = M.lf('trim', '#e6dcc2', 25);
      const fl = h / 5;
      facade(b, poly, base, {
        height: h, wall: stone, wallTile: M.tile(stone), bayW: 3.8, endPier: 1.4, depth: 0.36,
        frame: M.lfColor('#3c3f42', 0.45, 0.4), glass: M.lfGlass('public', 0xaab8c0), sill: trim, reveal: stone, surround: null,
        storeys: [0, 1, 2, 3, 4].map((k) => ({ h: fl, win: { w: 1.35, h: 2.15, sill: k === 0 ? 1.0 : 0.85, cols: 2, rows: 2 } })),
        plinth: { h: 0.9, d: 0.1, key: 'granite' }, bands: [{ y: h - 1.2, h: 0.22, d: 0.12, key: trim }], seed: 24 + Math.round(base),
        // the doors on the Shipka front replace windows there
        skip: () => false,
      });
    }
    b.cap('roofBitumen', poly, top, { s: 4 });
    // parapet on the street edges
    b.ring('stoneTrim', poly, top, top + 0.7, { tw: 4, th: 4 });
    for (const e of entrances || []) {
      const [ax, az, bx, bz] = e.edge;
      const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      // outward normal: away from the building centre
      const [cx, cz] = centroid(poly);
      let nx = dz, nz = -dx;
      if ((ax - cx) * nx + (az - cz) * nz < 0) { nx = -nx; nz = -nz; }
      const yaw = Math.atan2(nx, nz);
      for (const t of e.at) {
        const px = ax + dx * L * t, pz = az + dz * L * t;
        const py = y(px, pz);
        b.push(px, py, pz, yaw);
        b.box('doorDark', 0, 0.1, 0.05, 2.6, 2.9, 0.15, 0, {});
        b.box('stoneTrim', 0, 3.1, 0.5, 4.2, 0.3, 1.3, 0, {});
        b.box('concreteDark', 0, 0, 0.7, 3.6, 0.15, 0.9, 0, {});
        for (const sx of [-1, 1]) b.box('stoneTrim', sx * 1.55, 0, 0.1, 0.35, 3.1, 0.3, 0, {});
        b.pop();
      }
    }
  };
  wingShell(NORTH, 18.6, [{ edge: [-1388.0, -2812.4, -1324.9, -2795.1], at: [0.15, 0.4, 0.6] }]);
  wingShell(SOUTH, 18.6, []);
  return done(b, M, -1379, -2738);
}

// ------------------------------------------------------------------ National Library (NBKM)
// The 1953 stone-clad block of Vasilyov & Tsolov: rusticated ground storey with arched openings, three
// storeys of tall windows between pilasters, string course, stepped cornice and attic; the main front with
// its portal faces west (Vasil Levski), the flank the buses on Shipka pass faces south. The two pack parts
// (west block, taller east block) share a plain party wall. Details beyond "symmetrical, tall rhythmic
// windows, stone" are not documented (research confidence low).
export function buildNbkm({ world, M, parts, kit }) {
  if (!parts.length) return null;
  const b = new MeshBuilder();
  const stone = M.lf('ashlar', '#d8ceb6', 3), rustic = M.lf('rustic', '#c8bc9f', 4), trim = M.lf('trim', '#e3dac4', 5);
  const glass = M.lfGlass('public', 0xaab6bb), frame = M.lfColor('#3e3832', 0.45, 0.3), door = M.lfColor('#2c241d', 0.5, 0.2);
  let cx = 0, cz = 0;
  const polys = parts.map(({ b: bd }) => orient(bd.pts));
  // an edge lying on another part's outline is a party wall
  const shared = (pi) => (i, L, ax, az, bx, bz) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    return polys.some((q, qi) => qi !== pi && distToPoly(q, mx, mz) < 1.5);
  };
  parts.forEach(({ b: bd }, pi) => {
    const poly = polys[pi];
    const g = ground(world, poly);
    const H = bd.h >= 20 ? 21 : 17.4; // the taller east block (stacks) over the 4-storey front block
    const upper = (H - 5.4 - 1.0) / 3;
    const storeys = [
      { h: 5.4, wall: rustic, win: { w: 1.7, h: 3.0, sill: 1.3, arch: true, cols: 2, rows: 2 }, surround: { w: 0.22, d: 0.08, key: trim, head: 'keystone' } },
      { h: upper, win: { w: 1.55, h: upper - 1.2, sill: 0.75, cols: 2, rows: 3 } },
      { h: upper, win: { w: 1.55, h: upper - 1.3, sill: 0.8, cols: 2, rows: 3 } },
      { h: upper, win: { w: 1.55, h: upper - 1.6, sill: 0.85, cols: 2, rows: 2 }, surround: { w: 0.14, d: 0.05, key: trim } },
      { h: 1.0, blank: true },
    ];
    const top = facade(b, poly, g.avg, {
      height: H, wall: stone, wallTile: M.tile(stone), tiles: { [rustic]: M.tile(rustic) }, storeys, bayW: 3.5, endPier: 2.4, depth: 0.42,
      frame, glass, sill: trim, reveal: trim, door, doorGlass: glass,
      surround: { w: 0.16, d: 0.06, key: trim, head: 'cornice' },
      plinth: { h: 0.75, d: 0.14, key: 'granite' },
      pilasters: { every: 1, w: 0.62, d: 0.16, key: stone, from: 1, capital: true },
      bands: [{ y: 5.4, h: 0.4, d: 0.2, key: trim }, { y: H - 1.0, h: 0.25, d: 0.1, key: trim }],
      cornice: { h: 1.0, d: 0.75, key: trim, steps: 3 }, attic: { h: 1.1, key: stone },
      skip: shared(pi), seed: 40 + pi,
      // the portal: three tall arched doors in the middle of the west front
      doors: (i, L, ax, az, bx, bz) => {
        const nx = (bz - az) / L;
        if (nx > -0.8 || L < 30) return [];
        return [0.4, 0.5, 0.6].map((at) => ({ at, w: 2.0, h: 4.6, arch: 1.0 }));
      },
    });
    b.cap('roofDark', poly, top - 1.1 + 0.02, { s: 4 });
    // west front: the portal frontispiece, steps, and the monument of the two saints on the forecourt
    const n = poly.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = poly[2 * i], az = poly[2 * i + 1], bx = poly[2 * j], bz = poly[2 * j + 1];
      const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
      if (tz > -0.8 || L < 30) continue; // outward normal (tz, -tx) must point west
      b.push((ax + bx) / 2, g.avg, (az + bz) / 2, Math.atan2(tz, -tx));
      // frontispiece: four pilasters rising through two storeys, entablature with the library's name band
      for (const x of [-4.6, -1.55, 1.55, 4.6]) {
        b.box(trim, x, 0.75, 0.55, 0.95, 9.6, 0.5, 0, {});
        b.box(trim, x, 0.75, 0.6, 1.15, 0.5, 0.6, 0, {});
        b.box(trim, x, 10.0, 0.6, 1.15, 0.45, 0.6, 0, {});
      }
      b.box(trim, 0, 10.35, 0.55, 11.0, 1.3, 0.75, 0, {});
      b.box(stone, 0, 11.65, 0.45, 11.4, 0.35, 0.95, 0, {});
      // steps up to the doors
      for (let k = 0; k < 5; k++) b.box('graniteLight', 0, -0.4 + k * 0.17, 1.6 - k * 0.32, 12 - k * 0.3, 0.17 + 0.4 * (k === 0), 3.2 - k * 0.64, 0, {});
      // the monument (1972) on the forecourt: two robed figures on a stepped granite pedestal
      b.push(0, 0, 24, 0);
      b.box('graniteLight', 0, -0.3, 0, 6.2, 0.6, 4.4, 0, {});
      b.box('granite', 0, 0.3, 0, 4.6, 0.5, 3.0, 0, {});
      b.box('granite', 0, 0.8, 0, 3.4, 2.6, 1.9, 0, {});
      if (kit) {
        kit.put(b, 'figureStanding', -0.7, 3.4, 0, Math.PI, 3.4);
        kit.put(b, 'figureStanding', 0.7, 3.4, 0.05, Math.PI, 3.3);
      } else {
        b.push(-0.65, 3.4, 0, Math.PI);
        standingFigure(b, 'bronze', 3.4);
        b.pop();
        b.push(0.65, 3.4, 0.05, Math.PI);
        standingFigure(b, 'bronze', 3.3);
        b.pop();
      }
      b.box('bronze', 0, 5.2, -0.45, 0.9, 0.62, 0.1, 0, {}); // the open book with the alphabet held between them
      b.pop();
      b.pop();
    }
    const c = centroid(poly);
    cx += c[0]; cz += c[1];
  });
  return done(b, M, cx / parts.length, cz / parts.length);
}

function distToPoly(p, x, z) {
  let d = Infinity;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * j] - ax, bz = p[2 * j + 1] - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1)));
    d = Math.min(d, Math.hypot(x - ax - bx * k, z - az - bz * k));
  }
  return d;
}

// ------------------------------------------------------------------ Eagles' Bridge
const EAGLES = [[-1183.2, -2401.7], [-1175.5, -2394.6], [-1196.1, -2375.7], [-1203.7, -2382.8]];

export function buildEagleBridge({ world, M, y, kit }) {
  const b = new MeshBuilder();
  // road axis NW-SE: from the pair direction
  const dx = EAGLES[1][0] - EAGLES[0][0], dz = EAGLES[1][1] - EAGLES[0][1];
  const L = Math.hypot(dx, dz), ax = dx / L, az = dz / L;
  const cx = EAGLES.reduce((s, p) => s + p[0], 0) / 4, cz = EAGLES.reduce((s, p) => s + p[1], 0) / 4;
  const col = (x, z, face) => {
    const gy = y(x, z);
    b.push(x, gy, z, Math.atan2(face[0], face[1]));
    // hewn granite plinth with relief panels, base moulding, tapering shaft, cornice, ball
    b.box('granite', 0, -0.3, 0, 1.75, 1.3, 1.75, 0, { tw: 4, th: 4 });
    for (const s of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      b.push(0, 0, 0, s);
      b.box('graniteLight', 0, 0.25, 0.875, 1.0, 0.55, 0.05, 0, { tw: 4, th: 4 });
      b.pop();
    }
    b.box('graniteLight', 0, 1.0, 0, 1.5, 0.3, 1.5, 0, { tw: 4, th: 4 });
    b.box('granite', 0, 1.3, 0, 1.35, 0.15, 1.35, 0, { tw: 4, th: 4 });
    const shaft = new THREE.CylinderGeometry(0.5 * Math.SQRT2, 0.6 * Math.SQRT2, 3.3, 4, 1);
    shaft.rotateY(Math.PI / 4);
    shaft.translate(0, 1.45 + 1.65, 0);
    b.geo('granite', shaft);
    b.box('graniteLight', 0, 4.75, 0, 1.35, 0.2, 1.35, 0, { tw: 4, th: 4 });
    b.box('granite', 0, 4.95, 0, 1.6, 0.28, 1.6, 0, { tw: 4, th: 4 });
    b.box('graniteLight', 0, 5.23, 0, 1.45, 0.14, 1.45, 0, { tw: 4, th: 4 });
    b.sphere('graniteLight', 0, 5.65, 0, 0.45, 1, 1, 1, 14);
    if (kit) kit.put(b, 'eagle', 0, 6.1 - 0.15 * 1.2, 0, 0, 1.2); // the Blender eagle, talons on the ball
    else {
      b.push(0, 6.02, 0, 0);
      eagle(b, 'bronze', 2.0);
      b.pop();
    }
    b.pop();
  };
  EAGLES.forEach(([x, z], i) => {
    // each eagle looks along the road axis, outwards from the bridge centre
    const s = Math.sign((x - cx) * ax + (z - cz) * az) || 1;
    col(x, z, [ax * s, az * s]);
  });
  // stone parapets between the columns of each pair, with a bronze lamp standard in the middle
  for (const [i, j] of [[0, 1], [2, 3]]) {
    const [x0, z0] = EAGLES[i], [x1, z1] = EAGLES[j];
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, gy = Math.max(y(x0, z0), y(x1, z1)) + 0.1;
    b.push(mx, gy, mz, yaw);
    b.box('graniteLight', 0, -0.4, 0, len - 1.7, 1.45, 0.6, 0, { tw: 4, th: 4 });
    b.box('granite', 0, 1.05, 0, len - 1.6, 0.14, 0.78, 0, { tw: 4, th: 4 });
    b.cyl('bronze', 0, 1.2, 0, 0.09, 0.07, 2.2, 8);
    b.sphere('lamp', 0, 3.55, 0, 0.2, 1, 1.3, 1, 8);
    b.pop();
  }
  return done(b, M, cx, cz);
}

// ------------------------------------------------------------------ monuments
export function buildKlimentMonument({ M, y, kit }) {
  const b = new MeshBuilder();
  const x = -1469, z = -2840, gy = y(x, z);
  b.push(x, gy, z, 0);
  // stepped granite base and pedestal, bronze figure of St Kliment of Ohrid, facing the university
  for (let i = 0; i < 3; i++) b.box('graniteLight', 0, i * 0.18, 0, 4.2 - i * 0.7, 0.18, 4.2 - i * 0.7, 0, { tw: 4, th: 4 });
  b.box('granite', 0, 0.54, 0, 1.9, 2.6, 1.9, 0, { tw: 4, th: 4 });
  b.box('graniteLight', 0, 3.14, 0, 2.2, 0.25, 2.2, 0, { tw: 4, th: 4 });
  b.push(0, 3.39, 0, Math.atan2(1, 0.15));
  if (kit) kit.put(b, 'figureStanding', 0, 0, 0, 0, 2.7);
  else standingFigure(b, 'bronze', 2.7);
  b.pop();
  b.pop();
  return done(b, M, x, z);
}

export function buildHavelHeart({ M, y }) {
  const b = new MeshBuilder();
  const x = -662.1, z = -2615.6, gy = y(x, z);
  b.push(x, gy, z, 0.6);
  b.cyl('graniteLight', 0, 0, 0, 1.0, 1.0, 0.35, 20);
  // heart outline (parametric), 1.5 m tall, 0.6 m thick, standing on the base
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([(hx / 16) * 0.78, (hy + 17) / 29 * 1.5]);
  }
  pts.reverse();
  b.extrude('graniteDark', pts, 0.6, { center: true, matrix: new THREE.Matrix4().makeTranslation(0, 0.5, 0) });
  b.pop();
  // the three benches of the plaza
  for (const [bx, bz] of [[-665.8, -2613.6], [-661.4, -2616.8], [-660.9, -2611.7]]) {
    b.push(bx, y(bx, bz), bz, Math.atan2(-662.1 - bx, -2615.6 - bz));
    for (const dz of [-0.12, 0, 0.12]) b.box('steelDark', 0, 0.44, dz, 1.7, 0.04, 0.11, 0, {});
    b.box('steelDark', 0, 0.7, 0.22, 1.7, 0.3, 0.03, 0, {});
    for (const dx of [-0.75, 0.75]) b.box('steelDark', dx, 0, 0, 0.05, 0.44, 0.4, 0, {});
    b.pop();
  }
  return done(b, M, -662, -2615);
}
