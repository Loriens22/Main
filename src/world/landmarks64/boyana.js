// Boyana, along the middle of line 64: the public perimeter of the Boyana Residence park past stops
// 1439 / 1448 (the OSM park fence line, redrawn as a stone plinth with a steel bar fence and piers -
// nothing inside the park is modelled), the street gate of the Boyana film studios at stops 0930 /
// 0931 (the OSM access road into the studio grounds), and Боянско ханче, the inn that names stops
// 0265 / 0266, on its OSM footprint. Fence, gate and inn styling are inferred, not verified
// (data/research/line64/landmarks/NOTES.md).
import { MeshBuilder, orient } from '../LandmarkGeometry.js';
import { done, barFence, posts, wallRun, resample, signMat, fitText, rrect, ground } from './common.js';
import { baseMats, barFenceMat } from './mats.js';
import { tree, treeMats } from './props.js';
import { RESIDENCE_FENCE } from './data.js';
import { facadeMat, plasterMat, blockMat, bayRing, ledge, edgesOf } from '../LandmarkInstitutionsKit.js';

// ------------------------------------------------------------------ Boyana Residence perimeter
export function buildResidenceFence({ M, y }) {
  baseMats(M);
  barFenceMat(M, 'resFence', { color: '#1d2621', bars: 26, rails: [0.05, 0.93] });
  const b = new MeshBuilder();
  const pts = RESIDENCE_FENCE;
  // rubble-stone plinth, bar fence on top, posts every panel and stone piers every ~24 m
  wallRun(b, 'l64granite', pts, { h: 0.55, t: 0.42, y, step: 3, tw: 2, th: 2 });
  barFence(b, 'resFence', pts, { h: 1.85, y: (x, z) => y(x, z) + 0.5, tw: 2.4, step: 2.4 });
  posts(b, 'l64steelDark', pts, { spacing: 2.4, h: 2.4, w: 0.07, y });
  for (const p of resample(pts, 24)) {
    const gy = y(p.x, p.z);
    b.box('l64granite', p.x, gy - 0.2, p.z, 0.7, 2.85, 0.7, Math.atan2(p.tx, p.tz), { tw: 2, th: 2 });
    b.box('l64offwhite', p.x, gy + 2.65, p.z, 0.86, 0.14, 0.86, Math.atan2(p.tx, p.tz), {});
  }
  const n = pts.length / 2;
  return done(b, M, (pts[0] + pts[2 * (n - 1)]) / 2, (pts[1] + pts[2 * n - 1]) / 2);
}

// ------------------------------------------------------------------ Boyana film studios gate
function kinoMats(M) {
  baseMats(M);
  barFenceMat(M, 'kinoFence', { color: '#2b2f33', bars: 18, rails: [0.06, 0.5, 0.95], panelFrame: true });
  signMat(M, 'kinoSign', 1024, 256, (g, w, h) => {
    g.fillStyle = '#16191c'; g.fillRect(0, 0, w, h);
    // film strip edges
    g.fillStyle = '#3a3f44'; g.fillRect(0, 0, w, 30); g.fillRect(0, h - 30, w, 30);
    g.fillStyle = '#16191c';
    for (let x = 12; x < w; x += 34) { rrect(g, x, 8, 18, 14, 3); g.fill(); rrect(g, x, h - 22, 18, 14, 3); g.fill(); }
    g.fillStyle = '#f2f2ee';
    fitText(g, 'КИНОЦЕНТЪР БОЯНА', w / 2, h * 0.42, w * 0.86, 92, 800);
    g.fillStyle = '#d7b45a';
    fitText(g, 'NU BOYANA FILM STUDIOS', w / 2, h * 0.7, w * 0.7, 44, 700);
  });
}

export function buildKinoGate({ M, y }) {
  kinoMats(M);
  const b = new MeshBuilder();
  // the access road (OSM service way) leaves the street at A heading into the grounds towards B
  const A = [-4835.0, 3040.0], B = [-4881.0, 3113.0];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const dx = (B[0] - A[0]) / L, dz = (B[1] - A[1]) / L;
  const gx = A[0] + dx * 12, gz = A[1] + dz * 12;
  const yaw = Math.atan2(-dx, -dz); // local +z faces the street, local +x runs along it
  const W = (xl, zl) => [gx + -dz * xl + -dx * zl, gz + dx * xl + -dz * zl]; // local -> world
  const gy = y(gx, gz);
  b.push(gx, gy, gz, yaw);
  // gate piers, the barrier and the guard booth
  for (const s of [-1, 1]) {
    b.box('l64granite', s * 3.9, -0.2, 0, 1.0, 3.0, 1.0, 0, { tw: 2, th: 2 });
    b.box('l64offwhite', s * 3.9, 2.8, 0, 1.2, 0.18, 1.2, 0, {});
  }
  b.box('l64steelDark', 2.9, 0, -1.2, 0.35, 1.05, 0.35, 0, {});
  for (let i = 0; i < 6; i++) b.box(i % 2 ? 'l64white' : 'l64red', 2.7 - i * 0.92, 0.95, -1.2, 0.92, 0.1, 0.1, 0, {});
  b.box('l64white', 6.2, 0, -2.4, 2.6, 2.6, 2.6, 0, {});
  b.quad('glassTintL64', [4.88, 1.0, -1.08], [7.52, 1.0, -1.08], [7.52, 2.2, -1.08], [4.88, 2.2, -1.08]);
  b.box('l64steelDark', 6.2, 2.6, -2.4, 3.2, 0.18, 3.2, 0, {});
  // the name wall left of the gate, facing the street
  b.box('l64granite', -9.6, -0.2, -0.3, 7.6, 0.6, 0.6, 0, { tw: 2, th: 2 });
  b.box('l64offwhite', -9.6, 0.4, -0.3, 7.6, 2.2, 0.45, 0, { tw: 2, th: 2 });
  b.quad('kinoSign', [-13.0, 0.75, -0.06], [-6.2, 0.75, -0.06], [-6.2, 2.45, -0.06], [-13.0, 2.45, -0.06]);
  b.pop();
  // bar fence along the street on both sides of the gate (stone footing)
  const runs = [[[-4.4, 0], [-5.8, 0]], [[-13.4, 0], [-26, 0.6]], [[4.4, 0], [24, 0.4]]];
  for (const run of runs) {
    const pts = run.flatMap(([xl, zl]) => W(xl, zl));
    wallRun(b, 'l64granite', pts, { h: 0.4, t: 0.35, y, step: 2.4, tw: 2, th: 2 });
    barFence(b, 'kinoFence', pts, { h: 1.7, y: (x, z) => y(x, z) + 0.38, tw: 2.4, step: 2.4 });
    posts(b, 'l64steelDark', pts, { spacing: 2.4, h: 2.1, w: 0.08, y });
  }
  // a row of poplars inside the fence
  treeMats(M);
  for (let i = -5; i <= 5; i++) {
    if (Math.abs(i) < 2) continue;
    const [x, z] = W(i * 4.5, -4.5);
    tree(b, x, y(x, z), z, 0.9, 'l64leafDark', { conifer: true, h: 11, r: 1.2 });
  }
  return done(b, M, gx, gz);
}

// ------------------------------------------------------------------ Боянско ханче
function hancheMats(M) {
  baseMats(M);
  facadeMat(M, 'hanUpper', {
    bayW: 2.6, floorH: 2.9, bays: 6, floors: 1, ppm: 36, style: 'punched',
    wall: '#f2eee4', pier: '#ebe6da', win: [1.0, 1.25], sillY: 0.85, mull: 2, fr: 0.07,
    lit: 0.7, litWarm: 0.95, blind: 0.15, seed: 265, glass: '#3d3328', glass2: '#8f8270', frame: '#5a3b22',
    shutter: '#4f331d', sill: '#6b4a2b', grime: 0.03,
  });
  facadeMat(M, 'hanLower', {
    bayW: 2.6, floorH: 3.0, bays: 6, floors: 1, ppm: 36, style: 'punched',
    wall: '#9d917c', pier: '#988b75', win: [1.1, 1.35], sillY: 0.8, mull: 2, fr: 0.07,
    lit: 0.8, litWarm: 0.95, blind: 0.1, seed: 266, glass: '#3a3026', glass2: '#8a7a66', frame: '#5a3b22',
    surround: '#c9bda4', surroundW: 0.14, ashlar: { w: 0.55, h: 0.28, line: 'rgba(40,32,24,0.32)' }, grime: 0.04,
  });
  plasterMat(M, 'hanPlaster', '#f0ebe0', 0.06);
  blockMat(M, 'hanStone', { base: '#968a76', joint: 'rgba(35,28,20,0.4)', w: 0.5, h: 0.26, seed: 7, tone: 0.22 });
  if (!M.m.hanTimber) M.m.hanTimber = M.m.l64wood.clone(), M.m.hanTimber.color.set(0x4a2f1b);
  signMat(M, 'hanSign', 768, 192, (g, w, h) => {
    g.fillStyle = '#5a3a20'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2e1d0f'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#f3e3b8';
    fitText(g, 'БОЯНСКО ХАНЧЕ', w / 2, h * 0.5, w * 0.86, 96, 700, 'Georgia, "DejaVu Serif", serif');
  });
}

export function buildHanche({ world, M, y, replaced }) {
  const part = replaced.find((r) => /^Boyansko hanche/.test(r.entry.note));
  if (!part) return null;
  hancheMats(M);
  const b = new MeshBuilder();
  // the L footprint (pack 5293) as a two-storey main house and a one-storey wing
  const main = [-6974.5, 2509.3, -6951.6, 2511.4, -6953.3, 2530.3, -6976.2, 2528.2];
  const wing = [-6966.6, 2528.3, -6967.3, 2536.2, -6976.9, 2535.4, -6976.2, 2528.2];
  const g = ground(world, part.b.pts);
  const base = g.avg;
  house(b, M, orient(main), base, g.min, 2, true);
  house(b, M, orient(wing), base, g.min, 1, false);
  // the sign board and a porch on the street (east) face
  const ex = -6952.45, ez = 2520.85; // middle of the east wall
  const eyaw = Math.atan2(0.9958, 0.0896); // outward normal of the east wall
  b.push(ex, base, ez, eyaw);
  for (const x of [-2.6, 2.6]) b.box('hanTimber', x, 0, 2.4, 0.26, 3.0, 0.26, 0, {});
  b.box('hanTimber', 0, 2.95, 1.25, 5.8, 0.24, 2.7, 0, {});
  b.gable('roofRed', 0, 3.2, 1.3, 2.9, 6.4, 0.9, Math.PI / 2, { overhang: 0.3, eave: 0.25, gableKey: 'hanTimber' });
  b.quad('hanSign', [-2.4, 3.25, 2.95], [2.4, 3.25, 2.95], [2.4, 4.45, 2.95], [-2.4, 4.45, 2.95]);
  b.box('doorDark', 0, 0, 0.06, 1.8, 2.4, 0.1, 0, {});
  b.box('hanStone', 0, -0.3, 1.4, 5.6, 0.32, 2.6, 0, { tw: 4, th: 4 });
  b.pop();
  // garden trees on the street side
  treeMats(M);
  for (const [x, z, s] of [[-6946.5, 2512.0, 1.05], [-6947.5, 2531.5, 0.95]]) tree(b, x, y(x, z), z, s, 'l64leaf');
  return done(b, M, part.cx, part.cz);
}

/** Revival-style house on a footprint: stone ground floor, plastered upper floor with timber bands, deep eaves, tiled hip roof. */
function house(b, M, poly, base, gmin, floors, chimney) {
  const lowH = 3.0, upH = 2.9;
  b.ring('hanStone', poly, gmin - 0.5, base, { tw: 4, th: 4 });
  bayRing(b, M, 'hanLower', poly, base, 1);
  let top = base + lowH;
  if (floors > 1) {
    // the upper floor oversails the stone storey a little, on a timber beam
    const up = grow(poly, 0.35);
    ledge(b, 'hanTimber', poly, top - 0.05, 0.3, 0.38, { tw: 2, th: 2 });
    bayRing(b, M, 'hanUpper', up, top + 0.25, 1);
    // corner posts and a timber band under the eaves
    for (const e of edgesOf(up)) b.box('hanTimber', e.ax, top + 0.25, e.az, 0.24, upH, 0.24, Math.atan2(e.tx, e.tz), {});
    top += 0.25 + upH;
    ledge(b, 'hanTimber', up, top - 0.25, 0.25, 0.06, { tw: 2, th: 2 });
    eaves(b, up, top, 0.95);
    hipRoof(b, up, top, 0.95, 0.42);
  } else {
    ledge(b, 'hanTimber', poly, top - 0.25, 0.25, 0.06, { tw: 2, th: 2 });
    eaves(b, poly, top, 0.8);
    hipRoof(b, poly, top, 0.8, 0.5);
  }
  if (chimney) {
    const [cx, cz] = [(poly[0] + poly[4]) / 2, (poly[1] + poly[5]) / 2];
    b.box('hanStone', cx + 3.5, top + 1.2, cz - 2.0, 0.8, 3.2, 0.8, 0, { tw: 2, th: 2 });
    b.box('roofRed', cx + 3.5, top + 4.4, cz - 2.0, 1.1, 0.15, 1.1, 0, {});
  }
}

/** Offset a convex rectangle outwards by d. */
function grow(poly, d) {
  const n = poly.length / 2;
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += poly[2 * i] / n; cz += poly[2 * i + 1] / n; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = poly[2 * i] - cx, z = poly[2 * i + 1] - cz, l = Math.hypot(x, z);
    out.push(cx + x * (1 + d * 1.414 / l), cz + z * (1 + d * 1.414 / l));
  }
  return out;
}

/** Timber soffit under the roof overhang. */
function eaves(b, poly, y, ov) {
  const big = grow(poly, ov);
  b.cap('hanTimber', [...big], y - 0.02, { up: false, s: 2 });
}

/** Hip roof over a rectangle (4 points): ridge along the long side, pitch = rise / half-depth. */
function hipRoof(b, poly, y, ov, pitch) {
  const p = grow(poly, ov);
  const P = [[p[0], p[1]], [p[2], p[3]], [p[4], p[5]], [p[6], p[7]]];
  const l01 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), l12 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
  // long axis from the midpoint of the short edges
  const [a, c] = l01 >= l12 ? [[P[1], P[2]], [P[3], P[0]]] : [[P[0], P[1]], [P[2], P[3]]];
  const ma = [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2], mc = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
  const half = Math.min(l01, l12) / 2, rise = half * pitch;
  const ux = mc[0] - ma[0], uz = mc[1] - ma[1], ul = Math.hypot(ux, uz);
  // ridge ends: half-depth in from each short edge
  const r0 = [ma[0] + (ux / ul) * half, ma[1] + (uz / ul) * half], r1 = [mc[0] - (ux / ul) * half, mc[1] - (uz / ul) * half];
  const R0 = [r0[0], y + rise, r0[1]], R1 = [r1[0], y + rise, r1[1]];
  const V = (q) => [q[0], y, q[1]];
  // the two short (hip) ends and the two long slopes; vertices wound to face outwards
  // the footprint's winding is not known here: emit each slope from both sides
  const tri = (k, A, B, C) => {
    const u = Math.hypot(B[0] - A[0], B[2] - A[2]) / 2;
    b.tri(k, A, B, C, [0, 0], [u, 0], [u / 2, rise / 2]);
    b.tri(k, B, A, C, [u, 0], [0, 0], [u / 2, rise / 2]);
  };
  const quad = (k, A, B, C, D) => {
    const u = Math.hypot(B[0] - A[0], B[2] - A[2]) / 2, v = rise / 1.6;
    b.quad(k, A, B, C, D, [[0, 0], [u, 0], [u, v], [0, v]]);
    b.quad(k, B, A, D, C, [[u, 0], [0, 0], [0, v], [u, v]]);
  };
  tri('roofRed', V(a[1]), V(a[0]), R0);
  tri('roofRed', V(c[1]), V(c[0]), R1);
  quad('roofRed', V(a[0]), V(c[1]), R1, R0);
  quad('roofRed', V(c[0]), V(a[1]), R0, R1);
}
