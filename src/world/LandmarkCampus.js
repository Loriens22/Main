// Landmarks of the Studentski grad / Lesotekhnicheski end of Route 280: the Winter Palace of Sport
// (chamfered octagon), the Hristo Botev hall (hexagon), the saw-tooth north front of UNWE with its
// flagpoles, the LTU main building portal, the student chapel, the OMV station and the rows of
// kiosk modules on ul. Yordan Yosifov. Sources: data/research/world/east/landmarks.json.
import * as THREE from 'three';
import { curtainWall } from './LandmarkFacade.js';
import { MeshBuilder, orient, centroid, hull, scalePoly, obb, signTexture } from './LandmarkGeometry.js';

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

// ------------------------------------------------------------------ Winter Palace of Sport
const WP = [-682.6, 2800.7, -687.3, 2795.3, -682.8, 2763.3, -674.3, 2755.7, -688.1, 2740.3, -698.6, 2728.6, -707.2, 2736.3, -740.7, 2732.3, -745.1, 2727.3, -752.2, 2733.5, -754.5, 2730.9, -768.4, 2743.1, -765.9, 2745.9, -768.9, 2748.6, -772.4, 2751.6, -769.0, 2755.5, -771.6, 2791.7, -778.2, 2797.4, -775.9, 2800.1, -775.3, 2800.8, -754.7, 2824.7, -748.3, 2819.2, -715.0, 2819.3, -710.3, 2824.5, -703.5, 2818.5, -701.5, 2820.8, -687.9, 2808.7, -689.6, 2806.8];

export function buildWinterPalace({ world, M, y }) {
  const b = new MeshBuilder();
  const gl = M.ribbon('wpGlass', 'wpGlass', { w: 6, h: 3.5, glass: '#4a4f55', glass2: '#7d8c96', mullion: '#2b2e31', spacing: 1.5 });
  const cn = M.panel('wpConcrete', 'wpConcrete', { w: 6, h: 6, base: '#cfcbc3', joint: 'rgba(70,70,65,0.30)', cols: 3, rows: 3, noise: 0.10, stain: 0.06, seed: 6 });
  const g = ground(world, WP);
  const base = g.avg, bot = g.min - 0.6;
  const [cx, cz] = centroid(WP);
  // two-storey foyer ring following the OSM outline: glazed on the west (road) side, blank concrete elsewhere
  const real = M.realFacades !== false;
  const conc = real ? M.lf('concrete', '#d3cfc6', 61) : 'wpConcrete', ct = real ? M.tile(conc) : [6, 6];
  if (real) {
    // the glazed west foyer: two storeys of real mullions in front of the glass; blank precast panels elsewhere
    b.ring((e) => (e.nx < -0.45 ? null : conc), WP, bot, base + 7, { tw: ct[0], th: ct[1], v0: base });
    b.ring((e) => (e.nx < -0.45 ? 'concreteDark' : null), WP, bot, base + 0.05, { tw: 4, th: 4 });
    curtainWall(b, WP, base, { height: 7, bayW: 1.5, floorH: 3.5, glass: M.lfGlass('public', 0x8c9aa3), mullion: M.lfColor('#2b2e31', 0.4, 0.5), spandrel: M.lfColor('#3f454a', 0.4, 0.3), mullD: 0.16, spandH: 0.35, only: (e) => e.nx < -0.45 });
  } else b.ring((e) => (e.nx < -0.45 ? 'wpGlass' : 'wpConcrete'), WP, bot, base + 7, { tw: 6, th: 3.5, v0: base });
  b.cap('roofBitumen', WP, base + 7, { s: 4 });
  b.ring('concrete', WP, base + 7, base + 7.5, { tw: 4, th: 4 });
  // main hall: the outline's hull pulled in by about 10 m, 18 m high, blue-grey band under the parapet
  const H = scalePoly(hull(WP), cx, cz, 0.8);
  b.ring(conc, H, base + 7, base + 16.6, { tw: real ? ct[0] : cn[0], th: real ? ct[1] : cn[1], v0: base });
  b.ring('wpBand', H, base + 16.6, base + 17.6, { tw: 4, th: 4 });
  b.ring('concrete', H, base + 17.6, base + 18.8, { tw: 4, th: 4 });
  b.cap('roofBitumen', H, base + 17.6, { s: 4 });
  // roof plant boxes
  for (const [dx, dz] of [[-12, -10], [10, -14], [14, 12], [-9, 14]]) b.box('plantAl', cx + dx, base + 17.6, cz + dz, 6, 2, 4, 0.3, {});
  // entrance canopy on four square columns, centred on the west face
  const wx = -770.5, wz = 2776;
  b.box('concrete', wx - 3, base + 5.1, wz, 6.2, 0.4, 22, 0, { tw: 4, th: 4 });
  for (const [dx, dz] of [[-5.4, -9.6], [-5.4, 9.6], [-5.4, -3.2], [-5.4, 3.2]]) b.box('concrete', wx + dx + 2.4, 0, wz + dz, 0.5, 5.2, 0.5, 0, { tw: 4, th: 4 });
  return done(b, M, cx, cz);
}

// ------------------------------------------------------------------ Hristo Botev hall
const BOTEV = [-974.5, 1909.2, -1009.4, 1924.4, -1011.5, 1967.1, -981.8, 1988.6, -947.8, 1972.3, -945.3, 1928.4];

export function buildBotevHall({ world, M }) {
  const b = new MeshBuilder();
  const gl = M.ribbon('botevGlass', 'botevGlass', { w: 6, h: 2.8, glass: '#4a4f55', glass2: '#7d8c96', mullion: '#2b2e31', spacing: 1.5 });
  const cn = M.panel('botevConcrete', 'botevConcrete', { w: 6, h: 5, base: '#cfcbc0', joint: 'rgba(70,70,65,0.28)', cols: 3, rows: 2, noise: 0.12, stain: 0.08, seed: 9 });
  const g = ground(world, BOTEV);
  const base = g.avg, bot = g.min - 0.6;
  const [cx, cz] = centroid(BOTEV);
  if (M.realFacades !== false) {
    const conc = M.lf('concrete', '#d0ccc1', 62), ct = M.tile(conc);
    b.ring(conc, BOTEV, bot, base + 1.0, { tw: ct[0], th: ct[1], v0: base });
    b.ring(conc, BOTEV, base + 3.8, base + 4.2, { tw: ct[0], th: ct[1], v0: base });
    curtainWall(b, BOTEV, base + 1.0, { height: 2.8, bayW: 1.5, floorH: 2.8, glass: M.lfGlass('public', 0x8c9aa3), mullion: M.lfColor('#2b2e31', 0.4, 0.5), spandrel: 'concrete', mullD: 0.12, spandH: 0 });
  } else {
    b.ring('botevConcrete', BOTEV, bot, base + 4.2, { tw: cn[0], th: cn[1], v0: base });
    b.ring('botevGlass', BOTEV, base + 1.0, base + 3.8, { tw: gl[0], th: gl[1], v0: base + 1.0, flip: false });
  }
  b.ring('concrete', BOTEV, base + 4.2, base + 5.0, { tw: 4, th: 4 });
  b.cap('roofBitumen', BOTEV, base + 5.0, { s: 4 });
  const hexIn = scalePoly(BOTEV, cx, cz, 0.78);
  b.ring('botevConcrete', hexIn, base + 5.0, base + 14.0, { tw: cn[0], th: cn[1], v0: base });
  b.ring('podiumAl', hexIn, base + 13.2, base + 14.0, { tw: 4, th: 4 });
  b.hip('roofBitumen', hexIn, base + 14.0, 2.0, 0.0, { s: 6, centre: [cx, cz] });
  // glazed vestibule 12 x 5 m on the east face with six steps
  const mx = (-947.8 - 945.3) / 2, mz = (1972.3 + 1928.4) / 2;
  b.push(mx, world.hf.heightAt(mx, mz), mz, Math.PI / 2 + 0.057);
  b.box('botevGlass', 0, 0, 2.5, 12, 4.4, 5, 0, { tw: gl[0], th: gl[1] });
  b.box('concrete', 0, 4.4, 2.7, 12.6, 0.3, 5.6, 0, { tw: 4, th: 4 });
  for (let i = 0; i < 6; i++) b.box('concreteDark', 0, 0, 5.4 + i * 0.35, 12, 0.9 - i * 0.15, 0.35, 0, { tw: 4, th: 4 });
  b.pop();
  return done(b, M, cx, cz);
}

// ------------------------------------------------------------------ UNWE saw-tooth north front + flagpoles
const UNWE = [-239, 1982, -238, 1960, -237, 1958, -253, 1956, -253, 1958, -255, 1981, -280, 1979, -280, 1976, -291, 1975, -291, 1978, -300, 1977, -300, 1974, -311, 1973, -311, 1976, -320, 1975, -319, 1973, -330, 1972, -330, 1974, -340, 1973, -339, 1970, -350, 1970, -350, 1972, -354, 1972, -358, 1972, -358, 1978, -371, 1977, -372, 1984];

function northZ(poly, x) {
  let best = Infinity;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = poly[2 * i], z0 = poly[2 * i + 1], x1 = poly[2 * j], z1 = poly[2 * j + 1];
    if ((x0 - x) * (x1 - x) > 0 || x0 === x1) continue;
    best = Math.min(best, z0 + ((z1 - z0) * (x - x0)) / (x1 - x0));
  }
  return best;
}

function flagTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'bg') {
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 192, 43);
    g.fillStyle = '#00966e'; g.fillRect(0, 43, 192, 43);
    g.fillStyle = '#d62612'; g.fillRect(0, 86, 192, 42);
  } else if (kind === 'eu') {
    g.fillStyle = '#003399'; g.fillRect(0, 0, 192, 128);
    g.fillStyle = '#ffcc00';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(96 + Math.cos(a) * 36, 64 + Math.sin(a) * 36, 5, 0, 7); g.fill(); }
  } else {
    g.fillStyle = '#0b4f9c'; g.fillRect(0, 0, 192, 128);
    g.fillStyle = '#ffffff'; g.font = '700 46px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('УНСС', 96, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildUnwe({ world, M, y }) {
  const b = new MeshBuilder();
  // projecting fins on the 21 m north front, one per 10.5 m bay between x = -355 and -255
  for (let x = -354.5; x < -254; x += 10.5) {
    const z = northZ(UNWE, x);
    if (!isFinite(z)) continue;
    const gy = y(x, z);
    b.box('concrete', x, gy - 0.4, z - 0.25, 1.2, 21.8, 0.55, 0, { tw: 4, th: 4 });
  }
  // flagpoles on the forecourt: Bulgaria, EU, UNWE
  const flags = ['bg', 'eu', 'unwe'];
  flags.forEach((kind, i) => {
    const x = -252 - i * 4.2, z = 1946;
    const gy = y(x, z);
    b.cyl('steel', x, gy - 0.1, z, 0.1, 0.06, 9.8, 8);
    b.sphere('gold', x, gy + 9.85, z, 0.12, 1, 1, 1, 6);
    const key = 'flag' + kind;
    if (!M.m[key]) M.m[key] = new THREE.MeshStandardMaterial({ map: flagTexture(kind), roughness: 0.8, side: THREE.DoubleSide });
    b.quad(key, [x, gy + 9.4, z], [x + 2.2, gy + 9.4 - 0.12, z], [x + 2.2, gy + 7.9 - 0.12, z], [x, gy + 7.9, z], [[1, 1], [0, 1], [0, 0], [1, 0]]);
  });
  return done(b, M, -300, 1960);
}

// ------------------------------------------------------------------ LTU main building: portal with steps on the boulevard side
export function buildLtu({ world, M, y }) {
  const b = new MeshBuilder();
  const ax = 571.4, az = 1711.2, bx = 558.4, bz = 1621.1;
  const t = 0.5, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
  const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
  const nx = -dz, nz = dx; // east (towards the boulevard)
  const gy = y(px, pz);
  b.push(px, gy, pz, Math.atan2(nx, nz));
  // five-step flight, four square piers carrying a two-storey entablature, glazed doors between them
  for (let i = 0; i < 5; i++) b.box('concreteDark', 0, 0, 3.0 - i * 0.4 + 0.2, 11 - i * 0.6, 0.9 - i * 0.18, 0.4, 0, { tw: 4, th: 4 });
  b.box('stonePale', 0, 0.8, 0.7, 11.5, 0.3, 3.2, 0, {});
  for (const dx2 of [-4.4, -1.5, 1.5, 4.4]) b.box('stonePale', dx2, 1.1, 1.8, 0.9, 8.2, 0.9, 0, {});
  b.box('stonePale', 0, 9.3, 0.9, 12.4, 0.9, 3.6, 0, {});
  b.box('glassDark', 0, 1.1, 0.35, 8.4, 4.0, 0.12, 0, {});
  b.box('stoneTrim', 0, 10.2, 0.9, 12.8, 0.3, 3.9, 0, {});
  b.pop();
  return done(b, M, px, pz);
}

// ------------------------------------------------------------------ student chapel St John of Rila
export function buildChapel({ world, M, y }) {
  const b = new MeshBuilder();
  const x0 = -325.1, x1 = -315.1, z0 = 1855.9, z1 = 1862.8;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const gy = Math.max(y(x0, z0), y(x1, z0), y(x0, z1), y(x1, z1));
  b.push(cx, gy, cz, 0);
  const w = x1 - x0, d = z1 - z0;
  // nave: cream walls, gabled red tile roof (ridge east-west), 35 degree pitch
  b.box('plasterCream', 0, -0.4, 0, w, 4.4, d, 0, { tw: 4, th: 4 });
  b.gable('roofRed', 0, 4.0, 0, w, d, (d / 2) * Math.tan(0.61), 0, { overhang: 0.35, eave: 0.35, gableKey: 'plasterCream', s: 4 });
  // apse: half cylinder on the east end under a half cone
  const apse = new THREE.CylinderGeometry(2.0, 2.0, 3.6, 12, 1, false, 0, Math.PI);
  apse.rotateY(-Math.PI / 2 + Math.PI);
  apse.translate(w / 2, 1.4, 0);
  b.geo('plasterCream', apse);
  const cone = new THREE.ConeGeometry(2.1, 1.6, 12, 1, false, 0, Math.PI);
  cone.rotateY(Math.PI / 2 + Math.PI);
  cone.translate(w / 2, 3.2 + 0.8, 0);
  b.geo('roofRed', cone);
  // porches on both long sides: 5.2 x 0.9 m with small gables
  for (const s of [-1, 1]) {
    b.push(0, 0, s * (d / 2 + 0.45), 0);
    b.box('plasterCream', 0, 0, 0, 5.2, 3.0, 0.9, 0, { tw: 4, th: 4 });
    b.gable('roofRed', 0, 3.0, 0, 5.2, 0.9, 0.8, 0, { overhang: 0.25, eave: 0.2, gableKey: 'plasterCream', s: 4 });
    b.box('doorDark', 0, 0, s * 0.46, 1.3, 2.3, 0.05, 0, {});
    b.pop();
  }
  // small arched windows on the long walls
  for (const s of [-1, 1]) for (const wx of [-3.4, 3.2]) b.box('glassDark', wx, 1.5, s * (d / 2 + 0.02), 0.6, 1.5, 0.05, 0, {});
  // west gable: bell cupola 1.6 x 1.6 m with a cross
  b.box('plasterCream', -w / 2 + 0.6, 4.0 + 0.5, 0, 1.6, 1.6, 1.6, 0, { tw: 4, th: 4 });
  b.hip('roofRed', [-w / 2 - 0.35, -1.05, -w / 2 + 1.55, -1.05, -w / 2 + 1.55, 1.05, -w / 2 - 0.35, 1.05], 5.6, 1.1, 0.0, { s: 4, centre: [-w / 2 + 0.6, 0] });
  b.box('gold', -w / 2 + 0.6, 6.5, 0, 0.08, 0.7, 0.08, 0, {});
  b.box('gold', -w / 2 + 0.6, 6.95, 0, 0.08, 0.08, 0.4, 0, {});
  b.pop();
  return done(b, M, cx, cz);
}

// ------------------------------------------------------------------ OMV filling station
export function buildOmv({ world, M, y, replaced, route }) {
  const part = replaced.find((r) => /OMV/.test(r.entry.note));
  if (!part) return null;
  const b = new MeshBuilder();
  if (!M.m.omvSign) M.m.omvSign = new THREE.MeshStandardMaterial({ map: signTexture(128, 256, '#0a4aa0', [{ text: 'OMV', size: 58, color: '#ffffff', y: 52 }, { text: '24', size: 34, color: '#ffd21a', y: 120 }, { text: '24', size: 34, color: '#ffffff', y: 170 }, { text: 'ГОРИВА', size: 20, color: '#d0e0f5', y: 218 }]), roughness: 0.5 });
  const o = obb(part.b.pts);
  const gy = Math.max(y(o.cx, o.cz), ...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, c]) => y(o.cx + o.ux * o.w / 2 * a + o.vx * o.d / 2 * c, o.cz + o.uz * o.w / 2 * a + o.vz * o.d / 2 * c)));
  b.push(o.cx, gy, o.cz, Math.atan2(-o.uz, o.ux));
  const w = o.w, d = o.d;
  // flat canopy at 5 m on four columns, white fascia with a blue stripe; pumps and kerbed island below
  b.box('white', 0, 5.0, 0, w, 0.55, d, 0, { tw: 4, th: 4 });
  b.box('blueStripe', 0, 5.18, 0, w + 0.04, 0.16, d + 0.04, 0, { top: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('white', sx * (w / 2 - 2.2), 0, sz * (d / 2 - 2.0), 0.6, 5.0, 0.6, 0, {});
  b.box('concreteDark', 0, 0, 0, w - 5.5, 0.15, 1.6, 0, { tw: 4, th: 4 });
  for (const sx of [-1, 1]) b.box('blueStripe', sx * (w / 4), 0.15, 0, 0.8, 1.6, 0.5, 0, {});
  // shop box 9 x 5 x 3.4 m beyond the canopy end
  const side = (o.cx + o.ux * w / 2 + o.cz + o.uz * w / 2) > (o.cx - o.ux * w / 2 + o.cz - o.uz * w / 2) ? 1 : -1;
  b.box('white', side * (w / 2 + 5.0), 0, -d / 2 + 2.8, 9, 3.4, 5, 0, { tw: 4, th: 4 });
  b.box('blueStripe', side * (w / 2 + 5.0), 3.1, -d / 2 + 2.8, 9.04, 0.3, 5.04, 0, { top: false });
  b.box('glassDark', side * (w / 2 + 5.0), 0.7, -d / 2 + 5.32, 7.4, 2.1, 0.06, 0, {});
  b.box('roofBitumen', side * (w / 2 + 5.0), 3.4, -d / 2 + 2.8, 9.3, 0.15, 5.3, 0, { tw: 4, th: 4 });
  // price pylon 6 m at the road corner (nearest the route)
  let best = null;
  for (const id of ['A', 'B']) {
    const n = route.direction(id).path.nearest(o.cx, o.cz);
    if (!best || n.d < best.d) { const P = route.direction(id).path.at(n.s, {}); best = { d: n.d, x: P.x, z: P.z }; }
  }
  let px = w / 2 + 1.5, pz2 = 0;
  if (best) {
    const lu = (best.x - o.cx) * o.ux + (best.z - o.cz) * o.uz, lv = (best.x - o.cx) * o.vx + (best.z - o.cz) * o.vz;
    px = Math.sign(lu || 1) * (w / 2 + 1.2);
    pz2 = Math.sign(lv || 1) * (d / 2 + 1.5);
  }
  b.box('steelDark', px, 0, pz2, 0.3, 4.0, 0.3, 0, {});
  b.quad('omvSign', [px + 0.6, 3.9, pz2 + 0.17], [px - 0.6, 3.9, pz2 + 0.17], [px - 0.6, 6.0, pz2 + 0.17], [px + 0.6, 3.9 + 2.1, pz2 + 0.17]);
  b.quad('omvSign', [px - 0.6, 3.9, pz2 - 0.17], [px + 0.6, 3.9, pz2 - 0.17], [px + 0.6, 6.0, pz2 - 0.17], [px - 0.6, 6.0, pz2 - 0.17]);
  b.pop();
  return done(b, M, o.cx, o.cz);
}

// ------------------------------------------------------------------ Yosifov kiosk modules (two rows of three)
export function buildKiosks({ world, M, y, replaced }) {
  const parts = replaced.filter((r) => /Yosifov/.test(r.entry.note));
  if (!parts.length) return null;
  const b = new MeshBuilder();
  const palette = [0xc84b3a, 0x2f6fb0, 0x3f8f5a, 0xe0a030, 0x7a5aa8, 0x2aa3a3];
  palette.forEach((c, i) => { if (!M.m['kiosk' + i]) M.m['kiosk' + i] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.15 }); });
  if (!M.m.kioskWall) M.m.kioskWall = new THREE.MeshStandardMaterial({ color: 0xaeb6bb, roughness: 0.55, metalness: 0.2 });
  let sx = 0, sz = 0;
  parts.forEach(({ b: bd }, i) => {
    const o = obb(bd.pts);
    // the glazed front faces the alley between the two rows (x about -421)
    let fx = o.vx, fz = o.vz;
    // pick the axis pointing along x
    if (Math.abs(o.ux) > Math.abs(o.vx)) { fx = o.ux; fz = o.uz; }
    if ((-421 - o.cx) * fx + (1678 - o.cz) * fz < 0) { fx = -fx; fz = -fz; }
    const fd = Math.abs(fx * o.ux + fz * o.uz) > 0.5 ? o.w : o.d; // depth along the facing axis
    const wd = Math.abs(fx * o.ux + fz * o.uz) > 0.5 ? o.d : o.w;
    const gy = Math.max(y(o.cx, o.cz), y(o.cx + fx * fd / 2, o.cz + fz * fd / 2), y(o.cx - fx * fd / 2, o.cz - fz * fd / 2));
    b.push(o.cx, gy, o.cz, Math.atan2(fx, fz));
    const key = 'kiosk' + (i % 6);
    b.box('kioskWall', 0, -0.2, 0, wd, 3.4, fd, 0, { tw: 4, th: 4 });
    b.box(key, 0, 2.9, 0.0, wd + 0.1, 0.42, fd + 0.1, 0, { top: false });
    b.box('roofBitumen', 0, 3.2, 0, wd + 0.5, 0.15, fd + 0.5, 0, { tw: 4, th: 4 });
    // glazed shopfront on the alley side (+z local) with a door
    b.quad('glassDark', [-wd / 2 + 0.35, 0.3, fd / 2 + 0.02], [wd / 2 - 0.35, 0.3, fd / 2 + 0.02], [wd / 2 - 0.35, 2.4, fd / 2 + 0.02], [-wd / 2 + 0.35, 2.4, fd / 2 + 0.02]);
    // terrace: two parasols with tables
    for (const ox of [-wd / 4, wd / 4]) {
      b.cyl('steel', ox, 0, fd / 2 + 2.6, 0.04, 0.03, 2.3, 6);
      b.cyl(key, ox, 2.2, fd / 2 + 2.6, 1.15, 0.05, 0.45, 10);
      b.cyl('white', ox, 0.72, fd / 2 + 2.6 + 0.0, 0.4, 0.4, 0.04, 10);
      for (const [cx2, cz2] of [[-0.7, 0], [0.7, 0]]) b.box('steelDark', ox + cx2, 0, fd / 2 + 2.6 + cz2, 0.4, 0.45, 0.4, 0, {});
    }
    b.pop();
    sx += o.cx; sz += o.cz;
  });
  return done(b, M, sx / parts.length, sz / parts.length);
}

// ------------------------------------------------------------------ terminal 1693: open dispatcher shelter
export function buildTerminalHut({ world, M, y, replaced }) {
  const part = replaced.find((r) => /Terminal 1693/.test(r.entry.note));
  if (!part) return null;
  const b = new MeshBuilder();
  const o = obb(part.b.pts);
  const gy = Math.max(y(o.cx, o.cz), y(o.cx + o.ux * o.w / 2, o.cz + o.uz * o.w / 2), y(o.cx - o.ux * o.w / 2, o.cz - o.uz * o.w / 2));
  // local +z faces the pole (west): choose the axis pointing at x = -440.5
  let fx = o.vx, fz = o.vz;
  if ((-440.5 - o.cx) * fx + (2473.9 - o.cz) * fz < 0) { fx = -fx; fz = -fz; }
  b.push(o.cx, gy, o.cz, Math.atan2(fx, fz));
  // 15.8 m long, low-pitched roof on steel posts, a closed dispatcher cabin at one end, benches along the back
  const w = o.w, d = o.d;
  b.box('steelDark', 0, 2.55, 0, w + 0.4, 0.18, d + 0.4, 0, {});
  for (let i = 0; i <= 4; i++) for (const sz of [-1, 1]) b.box('steelDark', -w / 2 + 0.3 + (i * (w - 0.6)) / 4, 0, sz * (d / 2 - 0.2), 0.14, 2.55, 0.14, 0, {});
  b.box('white', -w / 2 + 2.2, 0, 0, 3.8, 2.5, d - 0.6, 0, { tw: 4, th: 4 });
  b.box('glassDark', -w / 2 + 2.2, 0.9, (d - 0.6) / 2 + 0.01, 2.6, 1.2, 0.05, 0, {});
  for (let i = 0; i < 3; i++) b.box('steelDark', 1.5 + i * 3.4, 0.0, -d / 2 + 0.6, 1.8, 0.45, 0.4, 0, {});
  b.pop();
  return done(b, M, o.cx, o.cz);
}
