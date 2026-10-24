// The two cemeteries that name request stops of line 64: Гробищен парк Бояна (0263 / 0262) and
// Гробищен парк Драгалевци (0510 / 0509). Their boundaries are the OSM cemetery areas; the Boyana
// gate stands where the OSM footpath enters the north-west corner, the Dragalevtsi gate on the road
// edge beside the stops. Walls, gates, the florists' stalls that stand at every Sofia cemetery gate,
// cypresses and the Dragalevtsi chapel (OSM building 8747, 12.4 m) are drawn in the usual local
// manner; their exact look is NOT verified (data/research/line64/landmarks/NOTES.md).
import * as THREE from 'three';
import { MeshBuilder } from '../LandmarkGeometry.js';
import { done, barFence, wallRun, resample, signMat, fitText } from './common.js';
import { baseMats, barFenceMat } from './mats.js';
import { tree, treeMats } from './props.js';
import { plasterMat } from '../LandmarkInstitutionsKit.js';

function cemMats(M) {
  baseMats(M);
  treeMats(M);
  plasterMat(M, 'cemWall', '#ece8dd', 0.08);
  barFenceMat(M, 'cemGate', { color: '#1b1d1f', bars: 16, rails: [0.08, 0.5, 0.92], panelFrame: true });
  for (const [k, c] of [['flRed', 0xc8202c], ['flYellow', 0xf2c230], ['flWhite', 0xf3f1ea], ['flPink', 0xe58fb0], ['flPurple', 0x7d4fa8]]) {
    if (!M.m[k]) M.m[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  }
  signMat(M, 'cemFlowers', 512, 96, (g, w, h) => {
    g.fillStyle = '#2f6b3c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; fitText(g, 'ЦВЕТЯ · СВЕЩИ · ВЕНЦИ', w / 2, h / 2, w * 0.9, 50, 700);
  });
}

function nameSign(M, key, name) {
  signMat(M, key, 1024, 160, (g, w, h) => {
    g.fillStyle = '#1b1d1f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a85a'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#e9d9a6';
    fitText(g, 'ГРОБИЩЕН ПАРК', w / 2, h * 0.34, w * 0.6, 50, 700, 'Georgia, "DejaVu Serif", serif');
    fitText(g, name, w / 2, h * 0.7, w * 0.86, 58, 700, 'Georgia, "DejaVu Serif", serif');
  });
}

/** Plastered wall with a tiled coping along a polyline. */
function wall(b, pts, y, h = 2.0) {
  wallRun(b, 'cemWall', pts, { h, t: 0.36, y, step: 3, tw: 4, th: 4 });
  wallRun(b, 'roofRed', pts, { h: 0.14, t: 0.56, y: (x, z) => y(x, z) + h, step: 3, sink: 0, tw: 2, th: 2 });
}

/**
 * Gate in the current frame (+z = outside, x along the wall): tiled piers, two leaves open inwards,
 * a steel arch carrying the name plate and a cross.
 */
function gate(b, w, signKey) {
  for (const s of [-1, 1]) {
    const x = s * (w / 2 + 0.45);
    b.box('cemWall', x, -0.3, 0, 0.9, 3.3, 0.9, 0, { tw: 2, th: 2 });
    b.frustum('roofRed', x, 3.0, 0, 1.15, 1.15, 0.12, 0.12, 0.55);
    // leaf hinged at the pier, swung 70 degrees inwards
    const hx = s * (w / 2 - 0.02), a = (70 * Math.PI) / 180, lw = w / 2 - 0.05;
    const ex = hx - s * Math.cos(a) * lw, ez = -Math.sin(a) * lw;
    b.quad('cemGate', [hx, 0.05, 0], [ex, 0.05, ez], [ex, 2.25, ez], [hx, 2.25, 0], [[0, 0], [lw / 2.4, 0], [lw / 2.4, 1], [0, 1]]);
  }
  // arch: two bars and a plate, cross at the apex
  b.box('l64steelDark', 0, 3.05, 0, w + 0.9, 0.08, 0.08, 0, {});
  b.box('l64steelDark', 0, 3.85, 0, w * 0.6, 0.08, 0.08, 0, {});
  for (const s of [-1, 1]) b.box('l64steelDark', s * w * 0.4, 3.05, 0, 0.08, 0.85, 0.08, s * 0.5, {});
  const pw = Math.min(w + 0.2, 4.2), ph = pw * 0.156;
  b.quad(signKey, [-pw / 2, 3.15, 0.06], [pw / 2, 3.15, 0.06], [pw / 2, 3.15 + ph, 0.06], [-pw / 2, 3.15 + ph, 0.06]);
  b.quad(signKey, [pw / 2, 3.15, -0.06], [-pw / 2, 3.15, -0.06], [-pw / 2, 3.15 + ph, -0.06], [pw / 2, 3.15 + ph, -0.06]);
  b.box('brass', 0, 3.93, 0, 0.07, 0.9, 0.07, 0, {});
  b.box('brass', 0, 4.5, 0, 0.5, 0.06, 0.06, 0, {});
  b.box('brass', 0, 4.25, 0, 0.3, 0.05, 0.05, -0.35, {});
}

/** Florist's stall: a small kiosk with an awning and buckets of flowers in front (+z). */
function stall(b, seed) {
  b.box('l64green', 0, 0, 0, 2.6, 2.45, 2.2, 0, {});
  b.quad('l64black', [-1.1, 0.95, 1.11], [1.1, 0.95, 1.11], [1.1, 2.05, 1.11], [-1.1, 2.05, 1.11]);
  b.box('l64offwhite', 0, 2.45, 0, 2.9, 0.1, 2.5, 0, {});
  b.quad('l64green', [-1.4, 2.45, 1.25], [1.4, 2.45, 1.25], [1.4, 2.0, 2.15], [-1.4, 2.0, 2.15]);
  b.quad('l64green', [1.4, 2.45, 1.25], [-1.4, 2.45, 1.25], [-1.4, 2.0, 2.15], [1.4, 2.0, 2.15]);
  b.quad('cemFlowers', [-1.3, 2.46, 1.21], [1.3, 2.46, 1.21], [1.3, 2.9, 1.21], [-1.3, 2.9, 1.21]);
  b.box('l64wood', 0, 0.55, 1.55, 2.4, 0.06, 0.7, 0, {});
  const cols = ['flRed', 'flYellow', 'flWhite', 'flPink', 'flPurple', 'flRed'];
  for (let i = 0; i < 6; i++) {
    const x = -1.0 + i * 0.4, z = 1.45 + (i % 2) * 0.22;
    b.cyl('l64steelDark', x, 0.61, z, 0.13, 0.11, 0.3, 8);
    b.sphere(cols[(i + seed) % cols.length], x, 1.0, z, 0.2, 1, 0.8, 1, 6);
  }
  for (let i = 0; i < 4; i++) b.sphere(cols[(i * 2 + seed + 1) % cols.length], -0.8 + i * 0.55, 0.32, 2.05, 0.22, 1, 0.75, 1, 6);
}

/** Cypresses inside a wall, `inset` metres in from it, every `gap` metres. */
function cypresses(b, pts, y, inset, gap) {
  for (const p of resample(pts, gap)) {
    const x = p.x + p.tz * inset, z = p.z - p.tx * inset;
    tree(b, x, y(x, z), z, 0.9 + ((Math.abs(x * 7 + z) % 10) / 40), 'l64leafDark', { conifer: true, h: 10, r: 1.1 });
  }
}

// ------------------------------------------------------------------ Гробищен парк Бояна
export function buildBoyanaCemetery({ M, y }) {
  cemMats(M);
  nameSign(M, 'cemSignBoyana', '„БОЯНА“');
  const b = new MeshBuilder();
  // north wall towards the gate, then the west wall south of it (points on the OSM boundary)
  const north = [-5898.0, 2044.2, -5946.0, 2064.0, -5954.0, 2066.0, -5954.2, 2067.4];
  const west = [-5954.6, 2072.6, -5955.0, 2076.0, -5956.2, 2122.0];
  wall(b, north, y);
  wall(b, west, y);
  // both runs have the cemetery on their left, the side cypresses() offsets to
  cypresses(b, north.slice(0, 4), y, 3.0, 9);
  cypresses(b, west.slice(2), y, 3.0, 9);
  const gx = -5954.4, gz = 2070.0, yaw = Math.atan2(-0.995, -0.0995); // +z = west, out of the cemetery
  b.push(gx, y(gx, gz), gz, yaw);
  gate(b, 4.2, 'cemSignBoyana');
  b.pop();
  // two florists' stalls on the forecourt outside the gate
  for (const [ox, oz, s] of [[-6.5, -2.2, 0], [-6.8, 4.6, 2]]) {
    const x = gx + ox, z = gz + oz;
    b.push(x, y(x, z), z, Math.atan2(-0.72, -0.69)); // facing the path from the stop (north-west)
    stall(b, s);
    b.pop();
  }
  return done(b, M, gx, gz);
}

// ------------------------------------------------------------------ Гробищен парк Драгалевци
function chapelMats(M) {
  if (M.m.chapelDark) return;
  M.m.chapelDark = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.7, side: THREE.DoubleSide });
}

export function buildDragalevtsiCemetery({ M, y, replaced }) {
  cemMats(M);
  chapelMats(M);
  nameSign(M, 'cemSignDragalevtsi', '„ДРАГАЛЕВЦИ“');
  const b = new MeshBuilder();
  // the boundary along the road (OSM cemetery area, west side), with the gate near the stops
  const ex = 24 / 79.7, ez = 76 / 79.7; // direction of the south-west edge (-3400,3837) -> (-3376,3913)
  const gx = -3400 + ex * 63, gz = 3837 + ez * 63, w = 4.4;
  const wallN = [-3394.0, 3769.0, -3400.0, 3837.0, gx - ex * (w / 2 + 0.9), gz - ez * (w / 2 + 0.9)];
  const wallS = [gx + ex * (w / 2 + 0.9), gz + ez * (w / 2 + 0.9), -3376.0, 3913.0, -3352.0, 3895.5];
  wall(b, wallN, y);
  wall(b, wallS, y);
  cypresses(b, wallN, y, 3.2, 10);
  cypresses(b, wallS.slice(0, 4), y, 3.2, 10);
  const yaw = Math.atan2(-0.954, 0.301); // +z = outward (west)
  b.push(gx, y(gx, gz), gz, yaw);
  gate(b, w, 'cemSignDragalevtsi');
  b.pop();
  // a florist's stall outside the gate, towards the stops
  {
    const x = gx - 0.954 * 5.5 + ex * 6.5, z = gz + 0.301 * 5.5 + ez * 6.5;
    b.push(x, y(x, z), z, yaw);
    stall(b, 1);
    b.pop();
  }
  const part = replaced.find((r) => /^Dragalevtsi cemetery chapel/.test(r.entry.note));
  if (part) chapel(b, y, part);
  return done(b, M, gx, gz);
}

/** Small Orthodox chapel on the OSM footprint: nave, east apse, west belfry with a cross. */
function chapel(b, y, part) {
  const cx = part.cx, cz = part.cz;
  const yaw = Math.atan2(-0.379, 0.925); // local +x = east along the long axis (apse end)
  let gy = Infinity;
  for (let i = 0; i < part.b.pts.length; i += 2) gy = Math.min(gy, y(part.b.pts[i], part.b.pts[i + 1]));
  b.push(cx, gy, cz, yaw);
  // stone plinth, nave, gable roof
  b.box('l64granite', -0.05, -0.5, 0, 12.6, 0.8, 6.3, 0, { tw: 2, th: 2 });
  b.box('cemWall', 0.3, 0.3, 0, 7.6, 4.9, 6.0, 0, { tw: 4, th: 4, top: false });
  b.gable('roofRed', 0.3, 5.2, 0, 7.6, 6.0, 2.4, 0, { overhang: 0.35, eave: 0.3, gableKey: 'cemWall' });
  // apse with a conical roof
  b.cyl('cemWall', 4.1, 0.3, 0, 2.1, 2.1, 4.2, 18);
  b.cyl('roofRed', 4.1, 4.5, 0, 2.35, 0.15, 1.3, 18);
  // narrow arched windows (dark) on the nave sides and the apse
  for (const s of [-1, 1]) for (const x of [-1.6, 1.0, 3.0]) {
    const z = s * 3.01;
    const q = s > 0 ? [[x - 0.3, 2.2, z], [x + 0.3, 2.2, z], [x + 0.3, 3.6, z], [x - 0.3, 3.6, z]] : [[x + 0.3, 2.2, z], [x - 0.3, 2.2, z], [x - 0.3, 3.6, z], [x + 0.3, 3.6, z]];
    b.quad('chapelDark', ...q);
  }
  // belfry over the west door
  b.box('cemWall', -4.9, 0.3, 0, 2.8, 8.7, 2.8, 0, { tw: 4, th: 4, top: false });
  for (const [nx, nz] of [[-1, 0], [0, 1], [0, -1]]) {
    const fx = -4.9 + nx * 1.41, fz = nz * 1.41;
    if (nx) b.quad('chapelDark', [fx, 6.6, fz + 0.5], [fx, 6.6, fz - 0.5], [fx, 8.1, fz - 0.5], [fx, 8.1, fz + 0.5]);
    else b.quad('chapelDark', nz > 0 ? [-5.4, 6.6, fz] : [-4.4, 6.6, fz], nz > 0 ? [-4.4, 6.6, fz] : [-5.4, 6.6, fz], nz > 0 ? [-4.4, 8.1, fz] : [-5.4, 8.1, fz], nz > 0 ? [-5.4, 8.1, fz] : [-4.4, 8.1, fz]);
  }
  b.box('l64steelDark', -4.9, 6.9, 0, 0.5, 0.5, 0.5, 0, {}); // the bell
  b.frustum('roofRed', -4.9, 9.0, 0, 3.3, 3.3, 0.15, 0.15, 2.2);
  b.box('brass', -4.9, 11.1, 0, 0.08, 1.25, 0.08, 0, {});
  b.box('brass', -4.9, 11.85, 0, 0.08, 0.06, 0.62, 0, {});
  b.box('brass', -4.9, 11.55, 0, 0.08, 0.05, 0.4, 0.4, {});
  // west door with a small porch roof
  b.box('chapelDark', -6.32, 0.3, 0, 0.06, 2.3, 1.3, 0, {});
  b.box('roofRed', -6.6, 2.7, 0, 0.9, 0.12, 2.0, 0, {});
  b.pop();
}
