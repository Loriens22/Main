// Landmarks along the Tsarigradsko shosse / Dr G. M. Dimitrov section: the CCB tower (ex Hotel
// Pliska, aluminium-glass curtain wall since 2015), the Pliska underpass stair canopies and CGM
// cabins, the Aviation monument, Arena 8888 and the metro G. M. Dimitrov pavilions.
// Sources: data/research/world/west/landmarks.json.
import * as THREE from 'three';
import { MeshBuilder, orient, centroid, scalePoly, obb, signTexture } from './LandmarkGeometry.js';
import { eagle } from './LandmarkSculpture.js';
import { curtainWall } from './LandmarkFacade.js';

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
const done = (b, M, x, z) => ({ x, z, meshes: b.meshes(M.m), tris: b.triangles });

// ------------------------------------------------------------------ CCB tower (ex Hotel Pliska)
const TOWER = [610.7, -708.0, 636.1, -734.3, 649.6, -721.3, 624.2, -695.1];
const PODIUM = [636.1, -734.3, 610.7, -708.0, 609.6, -709.1, 644.5, -745.2, 649.7, -740.2, 649.0, -739.5, 679.4, -710.3, 672.0, -702.7, 673.6, -701.1, 646.9, -673.4, 624.2, -695.1, 649.6, -721.3];

export function buildPliska({ world, M }) {
  const b = new MeshBuilder();
  const ct = M.curtain('pliskaTower', { bayW: 1.5, floorH: 3.66, bays: 6, floors: 3, glass: '#8fa1ab', glass2: '#bccbd2', mullion: '#45545d', spandrel: '#aeb7bb', sp: 1.0, lit: 0.2 }, 'pliska');
  const rb = M.ribbon('pliskaPodium', 'pliskaPod', { w: 6, h: 3.7, glass: '#5f717b', glass2: '#9fb1ba', mullion: '#c9ced1', spacing: 1.5 });
  const g = ground(world, TOWER);
  const gp = ground(world, PODIUM);
  // 2-storey zig-zag podium: ribbon glazing, aluminium fascia
  const pb = gp.avg, ptop = pb + 7.4;
  const real = M.realFacades !== false;
  const alu = M.lfColor('#b4bcc1', 0.32, 0.75), glass = M.lfGlass('public', 0x9fb8c8, true), spand = M.lfColor('#5f717d', 0.2, 0.7);
  if (real) {
    b.ring('podiumAl', PODIUM, gp.min - 0.6, pb + 0.05, { tw: 4, th: 4 });
    curtainWall(b, PODIUM, pb, { height: ptop - 0.7 - pb, bayW: 1.5, floorH: 3.35, glass, mullion: alu, spandrel: spand, mullD: 0.16, spandH: 0.55 });
  } else b.ring('pliskaPodium', PODIUM, gp.min - 0.6, ptop - 0.7, { tw: rb[0], th: rb[1], v0: pb });
  b.ring('podiumAl', PODIUM, ptop - 0.7, ptop + 0.5, { tw: 4, th: 4 });
  b.cap('roofBitumen', PODIUM, ptop + 0.5, { s: 4 });
  // 58.6 m tower: curtain wall, aluminium crown, roof plant
  const base = g.avg, top = base + 58.6;
  if (real) {
    // aluminium-glass curtain wall (2015): 1.5 m modules, mullion fins, opaque spandrel glass at each slab
    b.ring('podiumAl', TOWER, g.min - 0.6, base + 0.05, { tw: 4, th: 4 });
    curtainWall(b, TOWER, base, { height: top - base, bayW: 1.5, floorH: 3.66, glass, mullion: alu, spandrel: spand, mullD: 0.22, spandH: 0.95 });
  } else b.ring('pliskaTower', TOWER, g.min - 0.6, top, { tw: ct[0], th: ct[1], v0: base });
  b.ring('podiumAl', TOWER, top, top + 1.1, { tw: 4, th: 4 });
  b.cap('roofBitumen', TOWER, top + 1.1, { s: 4 });
  const [cx, cz] = centroid(TOWER);
  const plant = scalePoly(TOWER, cx, cz, 0.55);
  b.ring('plantAl', plant, top + 1.1, top + 4.6, { tw: 4, th: 4 });
  b.cap('roofBitumen', plant, top + 4.6, { s: 4 });
  b.cyl('steel', cx + 3, top + 4.6, cz - 2, 0.12, 0.05, 9, 6);
  b.cyl('steel', cx - 4, top + 4.6, cz + 3, 0.08, 0.04, 5, 6);
  return done(b, M, 640, -715);
}

// ------------------------------------------------------------------ Pliska underpass canopies and CGM cabins
export function buildPliskaCanopies({ world, M, y, replaced, route }) {
  const b = new MeshBuilder();
  const canopies = replaced.filter((r) => /^Pliska . canopy/.test(r.entry.note));
  const cgms = replaced.filter((r) => /CGM/.test(r.entry.note));
  if (!M.m.cgmSign) M.m.cgmSign = new THREE.MeshStandardMaterial({ map: signTexture(256, 96, '#0b4f9c', [{ text: 'ЦГМ', size: 62, color: '#ffffff', y: 34 }, { text: 'Мобилност', size: 24, color: '#d8e6f5', y: 74 }]), roughness: 0.5 });
  let sx = 0, sz = 0;
  for (const { b: bd, cx, cz } of canopies) {
    const o = obb(bd.pts);
    const gy = Math.max(...[[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, c]) => y(o.cx + o.ux * o.w / 2 * a + o.vx * o.d / 2 * c, o.cz + o.uz * o.w / 2 * a + o.vz * o.d / 2 * c)));
    b.push(o.cx, gy, o.cz, Math.atan2(-o.uz, o.ux));
    const w = o.w, d = o.d, H = 3.95;
    // stairwell: dark opening with step lines, railings along the long sides
    b.quad('doorDark', [-w / 2 + 0.3, 0.05, d / 2 - 0.3], [w / 2 - 0.3, 0.05, d / 2 - 0.3], [w / 2 - 0.3, 0.05, -d / 2 + 0.3], [-w / 2 + 0.3, 0.05, -d / 2 + 0.3]);
    for (let i = 0; i < 9; i++) b.box('concreteDark', -w / 2 + 1.2 + i * 0.5, 0.05, 0, 0.18, 0.015, d - 0.7, 0, {});
    for (const sz2 of [-1, 1]) {
      b.box('steel', 0, 0.92, sz2 * (d / 2 - 0.2), w - 0.4, 0.05, 0.05, 0, {});
      b.box('steel', 0, 0.45, sz2 * (d / 2 - 0.2), w - 0.4, 0.03, 0.03, 0, {});
      for (let i = 0; i <= 8; i++) b.box('steel', -w / 2 + 0.2 + (i * (w - 0.4)) / 8, 0, sz2 * (d / 2 - 0.2), 0.05, 0.92, 0.05, 0, {});
      // posts to the roof
      for (let i = 0; i <= 4; i++) b.box('steelDark', -w / 2 + 0.25 + (i * (w - 0.5)) / 4, 0, sz2 * (d / 2 - 0.12), 0.14, H, 0.14, 0, {});
    }
    // flat steel roof with a glazed centre
    b.box('steelDark', 0, H, 0, w + 0.4, 0.14, d + 0.4, 0, {});
    b.quad('glass', [-w / 2 + 0.6, H + 0.15, d / 2 - 0.5], [w / 2 - 0.6, H + 0.15, d / 2 - 0.5], [w / 2 - 0.6, H + 0.15, -d / 2 + 0.5], [-w / 2 + 0.6, H + 0.15, -d / 2 + 0.5]);
    b.pop();
    sx += cx; sz += cz;
  }
  for (const { b: bd } of cgms) {
    const o = obb(bd.pts);
    // the cabin's glazed front faces the carriageway
    let fx = o.vx, fz = o.vz;
    let best = null;
    for (const id of ['A', 'B']) {
      const n = route.direction(id).path.nearest(o.cx, o.cz);
      if (!best || n.d < best.d) { const P = route.direction(id).path.at(n.s, {}); best = { d: n.d, x: P.x, z: P.z }; }
    }
    if (best && (best.x - o.cx) * fx + (best.z - o.cz) * fz < 0) { fx = -fx; fz = -fz; }
    const gy = y(o.cx, o.cz);
    b.push(o.cx, gy, o.cz, Math.atan2(fx, fz));
    const w = o.w, d = o.d, H = 2.7;
    b.box('white', 0, 0, 0, w, H, d, 0, {});
    b.box('blueStripe', 0, H - 0.4, 0, w + 0.04, 0.4, d + 0.04, 0, { top: false });
    b.box('steelDark', 0, H, 0, w + 0.3, 0.12, d + 0.3, 0, {});
    // glazed front (+z) with a door
    b.quad('glassDark', [-w / 2 + 0.4, 0.4, d / 2 + 0.01], [w / 2 - 0.4, 0.4, d / 2 + 0.01], [w / 2 - 0.4, 2.1, d / 2 + 0.01], [-w / 2 + 0.4, 2.1, d / 2 + 0.01]);
    b.quad('cgmSign', [-0.9, 2.15, d / 2 + 0.02], [0.9, 2.15, d / 2 + 0.02], [0.9, 2.6, d / 2 + 0.02], [-0.9, 2.6, d / 2 + 0.02]);
    b.pop();
    sx += o.cx; sz += o.cz;
  }
  const n = canopies.length + cgms.length;
  return n ? done(b, M, sx / n, sz / n) : null;
}

// ------------------------------------------------------------------ Aviation monument
const PILLAR = [1394.35, -161.3];

/** Curved fin: height H at the apex end, tapering in depth; footprint w x d (plan), apex at +x. */
function wingBody(b, key, w, d, H) {
  const N = 10;
  const sec = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const x = -w / 2 + s * w;
    const top = H * (0.12 + 0.88 * Math.pow(s, 1.7));
    const a = (d / 2) * (1 - 0.65 * Math.pow(s, 1.2));
    sec.push([x, top, a]);
  }
  for (let i = 0; i < N; i++) {
    const [x0, y0, a0] = sec[i], [x1, y1, a1] = sec[i + 1];
    b.quad(key, [x0, 0, a0], [x1, 0, a1], [x1, y1, a1], [x0, y0, a0]); // +z side
    b.quad(key, [x1, 0, -a1], [x0, 0, -a0], [x0, y0, -a0], [x1, y1, -a1]); // -z side
    b.quad(key, [x0, y0, a0], [x1, y1, a1], [x1, y1, -a1], [x0, y0, -a0]); // top
  }
  const [xe, ye, ae] = sec[N];
  b.quad(key, [xe, 0, ae], [xe, 0, -ae], [xe, ye, -ae], [xe, ye, ae]);
  const [xs, ys, as] = sec[0];
  b.quad(key, [xs, 0, -as], [xs, 0, as], [xs, ys, as], [xs, ys, -as]);
}

export function buildAviation({ world, M, y, replaced, kit }) {
  const b = new MeshBuilder();
  const wings = replaced.filter((r) => /Aviation/.test(r.entry.note));
  const [px, pz] = PILLAR;
  const gy = y(px, pz);
  // pillar: 10.6 m tapering granite pylon (2.4 x 1.2 m -> 1.2 x 0.6 m) on a low plinth, brass eagle on top
  b.push(px, gy, pz, 0);
  b.box('graniteLight', 0, -0.2, 0, 3.6, 0.55, 2.4, 0, { tw: 4, th: 4 });
  b.frustum('granite', 0, 0.35, 0, 1.2, 2.4, 0.6, 1.2, 10.6, 0, { tw: 4, th: 4 });
  if (kit) kit.put(b, 'eagle', 0, 10.95 - 0.15 * 1.45, 0, 0, 1.45);
  else {
    b.push(0, 10.95, 0, 0);
    eagle(b, 'brass', 2.5);
    b.pop();
  }
  b.pop();
  // the two wing-shaped bodies of 4.6 m and 3.0 m, apex towards the pillar
  for (const { b: bd } of wings) {
    const o = obb(bd.pts);
    const H = o.cz < pz ? 4.6 : 3.0; // the 4.6 m wing lies north of the pillar, the 3.0 m wing south
    const gy2 = y(o.cx, o.cz);
    // apex (+x local) points to the pillar along the long axis
    const toP = (px - o.cx) * o.ux + (pz - o.cz) * o.uz;
    b.push(o.cx, gy2, o.cz, Math.atan2(-o.uz * Math.sign(toP || 1), o.ux * Math.sign(toP || 1)));
    wingBody(b, 'granite', o.w, o.d, H);
    b.pop();
  }
  return done(b, M, px, pz);
}

// ------------------------------------------------------------------ Arena 8888
export function buildArena({ world, M, y, partsOf, replaced }) {
  const parts = replaced.filter((r) => /Arena/.test(r.entry.note));
  if (!parts.length) return null;
  const b = new MeshBuilder();
  const gl = M.ribbon('arenaGlass', 'arenaGlass', { w: 6, h: 4.5, glass: '#3f474d', glass2: '#7c8a93', mullion: '#aeb4b8', spacing: 1.5, base: 0 });
  const pn = M.panel('arenaPanel', 'arenaPanel', { w: 8, h: 6, base: '#b7bdc0', joint: 'rgba(40,50,60,0.32)', cols: 16, rows: 6, noise: 0.06, stain: 0.04 });
  const band = M.ribbon('arenaBand', 'arenaBand', { w: 6, h: 3.0, glass: '#2c3238', glass2: '#58656e', mullion: '#9aa2a6', spacing: 2.0 });
  for (const { b: bd } of parts) {
    const poly = orient(bd.pts);
    const g = ground(world, poly);
    const base = g.avg, bot = g.min - 0.6;
    const [cx, cz] = centroid(poly);
    // glazed foyer storey, concrete cornice, insulated panel bowl with a dark concourse band, low steel dome
    if (M.realFacades !== false) {
      b.ring('podiumAl', poly, bot, base + 0.05, { tw: 4, th: 4 });
      curtainWall(b, poly, base, { height: 9, bayW: 1.5, floorH: 4.5, glass: M.lfGlass('public', 0x8a9ba6, true), mullion: M.lfColor('#aeb4b8', 0.35, 0.7), spandrel: M.lfColor('#5c666c', 0.3, 0.5), mullD: 0.18, spandH: 0 });
    } else b.ring('arenaGlass', poly, bot, base + 9, { tw: gl[0], th: gl[1], v0: base });
    b.ring('podiumAl', poly, base + 9, base + 9.6, { tw: 4, th: 4 });
    const up = scalePoly(poly, cx, cz, 0.965);
    b.cap('concrete', poly, base + 9.6, { s: 4 });
    b.ring('arenaPanel', up, base + 9.6, base + 20.5, { tw: pn[0], th: pn[1], v0: base });
    b.ring('arenaBand', up, base + 20.5, base + 23.5, { tw: band[0], th: band[1], v0: base + 20.5 });
    b.ring('arenaPanel', up, base + 23.5, base + 27, { tw: pn[0], th: pn[1], v0: base });
    const rings = [[0.965, 27], [0.9, 28.2], [0.78, 29.4], [0.6, 30.4], [0.38, 31.0]];
    for (let i = 0; i < rings.length - 1; i++) {
      const p0 = scalePoly(poly, cx, cz, rings[i][0]), p1 = scalePoly(poly, cx, cz, rings[i + 1][0]);
      const n = p0.length / 2;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        b.quad('roofSteel', [p0[2 * k], base + rings[i][1], p0[2 * k + 1]], [p0[2 * j], base + rings[i][1], p0[2 * j + 1]], [p1[2 * j], base + rings[i + 1][1], p1[2 * j + 1]], [p1[2 * k], base + rings[i + 1][1], p1[2 * k + 1]]);
      }
    }
    b.cap('roofSteel', scalePoly(poly, cx, cz, rings[rings.length - 1][0]), base + rings[rings.length - 1][1], { s: 6 });
  }
  return done(b, M, 1425, -248);
}

// ------------------------------------------------------------------ metro G. M. Dimitrov pavilions
export function buildMetro({ world, M, y, replaced }) {
  const parts = replaced.filter((r) => /metro/.test(r.entry.note));
  if (!parts.length) return null;
  const b = new MeshBuilder();
  if (!M.m.metroSign) M.m.metroSign = new THREE.MeshStandardMaterial({ map: signTexture(512, 96, '#0b4f9c', [{ text: 'Г. М. Димитров', size: 54, color: '#ffffff' }]), roughness: 0.5 });
  let sx = 0, sz = 0;
  for (const { b: bd } of parts) {
    const o = obb(bd.pts);
    const gy = y(o.cx, o.cz);
    b.push(o.cx, gy, o.cz, Math.atan2(-o.uz, o.ux));
    const w = o.w, d = o.d, H = 6.0;
    // concourse pavilion: glazed walls between slim steel posts, flat concrete roof with an overhang, dark interior
    b.box('glassDark', 0, 0, 0, w - 0.8, H, d - 0.8, 0, {});
    b.box('glass', 0, 0.2, 0, w - 0.2, H - 0.5, d - 0.2, 0, { top: false });
    const nx = Math.round(w / 3.6);
    for (let i = 0; i <= nx; i++) for (const sz2 of [-1, 1]) b.box('steelDark', -w / 2 + 0.2 + (i * (w - 0.4)) / nx, 0, sz2 * (d / 2 - 0.1), 0.16, H - 0.2, 0.16, 0, {});
    b.box('concrete', 0, H - 0.2, 0, w + 1.0, 0.5, d + 1.0, 0, { tw: 4, th: 4 });
    b.quad('metroSign', [3, H - 0.16, d / 2 + 0.52], [-3, H - 0.16, d / 2 + 0.52], [-3, H + 0.2, d / 2 + 0.52], [3, H + 0.2, d / 2 + 0.52]);
    b.pop();
    sx += o.cx; sz += o.cz;
  }
  return done(b, M, sx / parts.length, sz / parts.length);
}

// ------------------------------------------------------------------ Tsarigradsko shosse guard fence (Pliska - Iztok)
/** Continuous W-beam guard fence 10.6 m right of each carriageway centre between the Pliska and Iztok stops,
 *  with gaps where a road crosses (service-lane connections, crossings). Chunked every 110 m. */
export function buildGuardFences({ world, M, y, route }) {
  const A = route.direction('A').path, Bp = route.direction('B').path;
  const ranges = [];
  ranges.push({ path: A, s0: 3300, s1: 4551 });
  // direction B: the stretch that runs alongside A's section
  let cur = null;
  for (let s = 0; s <= Bp.length; s += 10) {
    const p = Bp.at(s, {});
    const n = A.nearest(p.x, p.z);
    const inside = n.s >= 3300 && n.s <= 4551 && n.d < 40;
    if (inside) { if (!cur) cur = { path: Bp, s0: s, s1: s }; cur.s1 = s; } else if (cur) { ranges.push(cur); cur = null; }
  }
  if (cur) ranges.push(cur);
  const out = [];
  const OFF = 10.6, STEP = 3.0;
  for (const rg of ranges) {
    let b = null, bx = 0, bz = 0, bn = 0;
    const flush = () => { if (b && bn > 0) out.push(done(b, M, bx / bn, bz / bn)); b = null; bx = bz = bn = 0; };
    let prev = null;
    for (let s = rg.s0; s <= rg.s1; s += STEP) {
      const P = rg.path.at(s, {}), t = rg.path.tangent(s, 4, {});
      const x = P.x - t.tz * OFF, z = P.z + t.tx * OFF;
      // gap where another road crosses the line
      const q = world.roads.query(x, z, 8);
      const cross = q && q.d < q.piece.hw + 0.8 && Math.abs(q.dir[0] * t.tx + q.dir[1] * t.tz) < 0.75;
      if (cross) { prev = null; continue; }
      if (!b || bn >= 36) { flush(); b = new MeshBuilder(); }
      const gy = y(x, z);
      if (prev) {
        const dx = x - prev.x, dz = z - prev.z, L = Math.hypot(dx, dz);
        if (L < STEP * 2.5) {
          const yaw = Math.atan2(-dz, dx);
          b.box('steel', (x + prev.x) / 2, (gy + prev.gy) / 2 + 0.5, (z + prev.z) / 2, L, 0.3, 0.06, yaw, {});
          b.box('steel', (x + prev.x) / 2, (gy + prev.gy) / 2 + 0.58, (z + prev.z) / 2, L, 0.05, 0.1, yaw, {});
        }
      }
      b.box('galv', x, gy - 0.1, z, 0.12, 0.9, 0.12, 0, {});
      b.box('steelDark', x, gy + 0.36, z, 0.05, 0.25, 0.14, 0, {});
      prev = { x, z, gy };
      bx += x; bz += z; bn++;
    }
    flush();
  }
  return out;
}
