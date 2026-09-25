// ---------------------------------------------------------------------------
// Gadget recipes, part 2: toys & games, sports gear, musical instruments,
// magic & fantasy items, (non-functional) weapons, containers, decor and
// workshop tools. Organic toys (teddy bear, rubber duck, piggy bank) are
// SDF-sculpted; everything else is assembled from kit primitives.
// Instruments play notes, magic items sparkle, cannons boom.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, genPreset } from '../../core/context.js';
import { SDFBuilder } from '../../core/sdf.js';
import { sdfToGeometry } from './sdfkit.js';
import { hsl } from './common.js';
import { knob, playTune, playBeat } from './gadgets_home.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
const Z = [HALF, 0, 0], X = [0, 0, HALF];
function sound(e, name, opts) { if (G.audio) G.audio.play(name, e.root.position, opts); }

// SDF-sculpted part: build(sdf) adds primitives tagged with mat names; mats maps
// mat name -> [libraryType, opts]. Returns the mesh (added to the kit).
export function* sdfPart(k, ctx, build, mats, voxel, pos = [0, 0, 0]) {
  const sdf = new SDFBuilder();
  build(sdf);
  const order = Object.keys(mats);
  const v = voxel / Math.max(0.6, genPreset().detail);
  const { geometry } = yield* sdfToGeometry(sdf, ctx, { voxel: v, matOrder: order, aoMin: 0.35 });
  const arr = order.map((m) => G.materials.get(mats[m][0], { ...(mats[m][1] || {}), vertexColors: true }));
  const mesh = new THREE.Mesh(geometry, arr);
  k.add(mesh, pos);
  return mesh;
}

// Confetti burst (piñatas, gifts, party poppers).
function confetti(k, e) {
  const n = 120, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), c = new Float32Array(n * 3), v = [];
  for (let i = 0; i < n; i++) { const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6); c.set([col.r, col.g, col.b], i * 3); p.set([0, 1.2, 0], i * 3); v.push([(Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5]); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, vertexColors: true }));
  pts.frustumCulled = false; pts.userData.noRaycast = true;
  e.root.add(pts);
  let life = 0;
  const tick = (dt) => { life += dt; for (let i = 0; i < n; i++) { v[i][1] -= 6 * dt; p[i * 3] += v[i][0] * dt; p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1] + v[i][1] * dt); p[i * 3 + 2] += v[i][2] * dt; } g.attributes.position.needsUpdate = true; if (life > 5) { pts.visible = false; } };
  k.top.ticks.push(tick);
}

export const FUN = {
  // ================= Toys =================
  *teddyBear(k, a, r, item, ctx) {
    const fur = k.color(r.pick(['#a8703a', '#c89060', '#7a4a2a', '#f0e6d8', '#e8a8c0']));
    const light = '#' + new THREE.Color(fur).lerp(new THREE.Color('#fff4e0'), 0.55).getHexString();
    yield* sdfPart(k, ctx, (s) => {
      s.beginGroup({ op: 'union', defaults: { mat: 'fur' } });
      s.ellipsoid([0, 0.15, 0], [0.11, 0.13, 0.095]);
      s.sphere([0, 0.32, 0.01], 0.088, { op: 'smooth', k: 0.03 });
      for (const x of [-1, 1]) {
        s.sphere([x * 0.07, 0.395, 0], 0.032, { op: 'smooth', k: 0.012 });
        s.capsule([x * 0.09, 0.21, 0.02], [x * 0.145, 0.11, 0.07], 0.036, { op: 'smooth', k: 0.02 });
        s.capsule([x * 0.06, 0.07, 0.03], [x * 0.085, 0.045, 0.14], 0.043, { op: 'smooth', k: 0.02 });
        s.ellipsoid([x * 0.087, 0.045, 0.172], [0.036, 0.04, 0.012], { mat: 'pad', priority: 2 });
        s.sphere([x * 0.072, 0.393, 0.018], 0.018, { mat: 'pad', priority: 2 });
        s.sphere([x * 0.032, 0.34, 0.08], 0.012, { mat: 'eye', priority: 3 });
      }
      s.ellipsoid([0, 0.295, 0.075], [0.045, 0.034, 0.035], { mat: 'pad', op: 'smooth', k: 0.01, priority: 2 });
      s.ellipsoid([0, 0.305, 0.109], [0.016, 0.011, 0.009], { mat: 'eye', priority: 3 });
      s.ellipsoid([0, 0.13, 0.07], [0.07, 0.08, 0.035], { mat: 'pad', priority: 1 });
      s.endGroup();
    }, { fur: ['knit', { color: fur }], pad: ['fabric', { color: light }], eye: ['glossyPlastic', { color: '#141414' }] }, 0.006);
    const bow = k.color2(r.pick(['#c62828', '#2a5ad8', '#e8b020', '#ff7ab0']));
    k.torus('f:' + bow, [0, 0.24, 0.005], 0.068, 0.011, [HALF, 0, 0], TAU, 28);
    for (const s of [-1, 1]) k.ball('f:' + bow, [s * 0.025, 0.24, 0.085], 0.022, [1.2, 0.8, 0.5]);
    return { name: 'Teddy bear', phys: { mass: 0.6 }, interact: { label: () => 'Hug the teddy', action: (e) => sound(e, 'squeak') } };
  },
  *rubberDuck(k, a, r, item, ctx) {
    const col = k.color('#ffd21a');
    yield* sdfPart(k, ctx, (s) => {
      s.beginGroup({ op: 'union', defaults: { mat: 'body' } });
      s.ellipsoid([0, 0.065, -0.01], [0.085, 0.062, 0.105]);
      s.ellipsoid([0, 0.1, -0.1], [0.04, 0.035, 0.04], { op: 'smooth', k: 0.03 });
      s.sphere([0, 0.14, 0.045], 0.052, { op: 'smooth', k: 0.03 });
      s.ellipsoid([0, 0.13, 0.1], [0.032, 0.013, 0.035], { mat: 'beak', op: 'smooth', k: 0.006, priority: 2 });
      for (const x of [-1, 1]) { s.sphere([x * 0.03, 0.16, 0.085], 0.009, { mat: 'eye', priority: 3 }); s.ellipsoid([x * 0.06, 0.08, -0.01], [0.03, 0.03, 0.06], { op: 'smooth', k: 0.02 }); }
      s.endGroup();
    }, { body: ['glossyPlastic', { color: col }], beak: ['glossyPlastic', { color: '#ff7a10' }], eye: ['glossyPlastic', { color: '#101010' }] }, 0.0045);
    return { name: 'Rubber duck', phys: { mass: 0.1 }, interact: { label: () => 'Squeak!', action: (e) => sound(e, 'squeak') }, floats: true };
  },
  *piggyBank(k, a, r, item, ctx) {
    const col = k.color('#f4a8b8');
    yield* sdfPart(k, ctx, (s) => {
      s.beginGroup({ op: 'union', defaults: { mat: 'body' } });
      s.ellipsoid([0, 0.13, 0], [0.12, 0.105, 0.15]);
      s.cylinder([0, 0.13, 0.16], 0.035, 0.03, { rot: [HALF, 0, 0], op: 'smooth', k: 0.02, round: 0.01 });
      for (const x of [-1, 1]) { s.roundCone([x * 0.06, 0.21, 0.07], [x * 0.08, 0.26, 0.06], 0.025, 0.006, { op: 'smooth', k: 0.01 }); for (const z of [-1, 1]) s.capsule([x * 0.06, 0.06, z * 0.08], [x * 0.065, 0.015, z * 0.085], 0.025, { op: 'smooth', k: 0.015 }); s.sphere([x * 0.035, 0.17, 0.125], 0.01, { mat: 'eye', priority: 3 }); s.sphere([x * 0.012, 0.13, 0.19], 0.007, { mat: 'eye', priority: 3 }); }
      s.endGroup();
    }, { body: ['glossyPlastic', { color: col }], eye: ['glossyPlastic', { color: '#201010' }] }, 0.005);
    k.box('black', [0, 0.235, -0.01], [0.012, 0.004, 0.05]);
    k.torus('p:' + col, [0, 0.14, -0.155], 0.015, 0.004, [0, HALF, 0], TAU * 0.8, 10);
    return { name: 'Piggy bank', phys: { mass: 0.5 }, interact: { label: () => 'Drop a coin in', action: (e) => sound(e, 'ding') } };
  },
  toyBlocks(k, a, r) {
    const letters = 'ABCGENSIXYZ123';
    const cols = ['#e83a3a', '#3a8ae8', '#f2c21a', '#3ac85a', '#ff8a2a', '#a85ae8'];
    const s = 0.08;
    const spots = [[0, 0, 0], [s * 1.05, 0, 0.01], [-s * 1.05, 0, -0.01], [0.5 * s, s, 0], [-0.5 * s, s, 0.01], [0, 2 * s, 0]];
    spots.forEach(([x, y, z], i) => {
      const c = cols[(i + r.int(0, 5)) % cols.length];
      k.rbox('lightWood', [x, y + s / 2, z], [s, s, s], 0.006, [0, r.range(-0.2, 0.2), 0]);
      k.label(letters[r.int(0, letters.length - 1)], [x, y + s / 2, z + s / 2 + 0.001], s * 0.8, s * 0.8, null, { bg: c, fg: '#fff', font: 'Arial Black, sans-serif' });
    });
    return { name: 'Toy blocks', phys: { mass: 0.8 } };
  },
  rockingHorse(k, a, r) {
    k.body('painted', r.pick(['#f2f0ea', '#8a5a36', '#c62828']));
    // Everything hangs off a pivot at the rockers' centre of curvature so it rocks naturally.
    const h = k.sub([0, 0.6, 0]);
    const Y = (y) => y - 0.6;
    for (const x of [-0.18, 0.18]) h.torus('darkWood', [x, 0, 0], 0.6, 0.02, [0, HALF, -HALF - 0.65], 1.3, 24);
    h.ball('body', [0, Y(0.52), 0], 0.13, [1, 0.8, 2.1]);
    h.seg('body', [0, Y(0.58), 0.22], [0, Y(0.78), 0.33], 0.07, 0.06);
    h.rbox('body', [0, Y(0.8), 0.4], [0.1, 0.1, 0.2], 0.04, [0.4, 0, 0]);
    for (const s of [-1, 1]) for (const z of [-1, 1]) h.seg('body', [s * 0.07, Y(0.48), z * 0.18], [s * 0.18, Y(0.04), z * 0.33], 0.025);
    h.box('#6a2a1a', [0, Y(0.84), 0.26], [0.03, 0.12, 0.2]);
    h.seg('#6a2a1a', [0, Y(0.52), -0.25], [0, Y(0.35), -0.38], 0.03, 0.01);
    h.rbox('#c62828', [0, Y(0.63), 0.0], [0.2, 0.03, 0.2], 0.01);
    for (const s of [-1, 1]) h.ball('black', [s * 0.045, Y(0.84), 0.47], 0.012);
    k.tick((dt, t) => { h.group.rotation.x = Math.sin(t * 2) * 0.08; });
    return { name: 'Rocking horse', phys: { mass: 8 } };
  },
  kite(k, a, r) {
    const col = k.color(r.pick(['#e83a3a', '#3a8ae8', '#f2c21a', '#3ac85a']));
    const kite = k.sub([0, 6, 0]);
    kite.ext('f:' + col, [[0, 0.5], [0.35, 0.05], [0, -0.55], [-0.35, 0.05]], 0.01, [0, 0, 0]);
    kite.seg('darkWood', [0, 0.5, 0.01], [0, -0.55, 0.01], 0.006); kite.seg('darkWood', [-0.35, 0.05, 0.01], [0.35, 0.05, 0.01], 0.006);
    const tail = [];
    for (let i = 0; i < 6; i++) tail.push([Math.sin(i) * 0.1, -0.6 - i * 0.18, 0]);
    kite.tube('f:#f2f0ea', tail, 0.004, 20);
    for (let i = 1; i < 6; i++) kite.box('f:' + hsl(i / 6, 0.8, 0.55), tail[i], [0.06, 0.02, 0.005], [0, 0, 0.8]);
    k.tube('white', [[0, 0.02, 0], [0.3, 2, 0.2], [0.2, 4, 0.1], [0, 6, 0]], 0.0015, 30, false, 4);
    k.cyl('wood', [0, 0.05, 0], 0.03, 0.1, null, { segs: 10 });
    k.tick((dt, t) => { kite.group.rotation.z = Math.sin(t * 1.3) * 0.25; kite.group.position.x = Math.sin(t * 0.7) * 0.4; });
    return { name: 'Kite', static: true };
  },
  spinningTop(k, a, r) {
    const col = k.color(r.pick(['#e83a3a', '#3a8ae8', '#f2c21a']));
    const top = k.sub([0, 0, 0]);
    top.lathe('g:' + col, [0, 0, 0], [[0, 0], [0.04, 0.03], [0.07, 0.06], [0.07, 0.07], [0.02, 0.09], [0.008, 0.12], [0, 0.12]], 24);
    for (let i = 0; i < 4; i++) top.box('white', [Math.cos(i * HALF) * 0.068, 0.065, Math.sin(i * HALF) * 0.068], [0.012, 0.01, 0.012]);
    k.tick((dt, t) => { top.group.rotation.y += dt * 25; top.group.rotation.z = Math.sin(t * 3) * 0.06; });
    return { name: 'Spinning top', phys: { mass: 0.2 } };
  },
  dice(k, a, r) {
    const col = k.color(r.pick(['#f4f2ee', '#e83a3a', '#1a1a1c']));
    const dot = col === '#f4f2ee' ? 'black' : 'white';
    for (const [x, ry] of [[-0.06, 0.3], [0.06, -0.5]]) {
      const d = k.sub([x, 0.025, 0], [0, ry, 0]);
      d.rbox('g:' + col, [0, 0, 0], [0.05, 0.05, 0.05], 0.008);
      const face = (n, pos, rot) => { const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, 1], [-1, 1], [1, -1]], 5: [[-1, -1], [1, 1], [-1, 1], [1, -1], [0, 0]], 6: [[-1, -1], [1, 1], [-1, 1], [1, -1], [-1, 0], [1, 0]] }[n]; for (const [u, v] of P) { const p = new THREE.Vector3(u * 0.013, v * 0.013, 0.0252).applyEuler(new THREE.Euler(...rot)); d.disc(dot, [p.x + pos[0], p.y + pos[1], p.z + pos[2]], 0.0045, rot); } };
      face(1, [0, 0, 0], [0, 0, 0]); face(6, [0, 0, 0], [0, PI, 0]); face(2, [0, 0, 0], [0, HALF, 0]); face(5, [0, 0, 0], [0, -HALF, 0]); face(3, [0, 0, 0], [-HALF, 0, 0]); face(4, [0, 0, 0], [HALF, 0, 0]);
    }
    return { name: 'Dice', phys: { mass: 0.05 }, interact: { label: () => 'Roll the dice', action: (e) => { sound(e, 'bounce'); if (e.body) { e.body.vy = 3; e.body.vx = r.range(-1, 1); e.body.sleeping = false; } } } };
  },
  rubiksCube(k, a, r) {
    const s = 0.057, c = s / 3;
    const faces = [['#e8e8e6', [0, 1, 0]], ['#f2d21a', [0, -1, 0]], ['#e83a2a', [0, 0, 1]], ['#ff8a1a', [0, 0, -1]], ['#2a6ae8', [1, 0, 0]], ['#2aa84a', [-1, 0, 0]]];
    k.rbox('black', [0, s / 2, 0], [s, s, s], 0.004);
    for (const [col, n] of faces) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const off = new THREE.Vector3(...n).multiplyScalar(s / 2 + 0.0005);
      const u = n[1] !== 0 ? [i * c, 0, j * c] : n[2] !== 0 ? [i * c, j * c, 0] : [0, i * c, j * c];
      const rot = n[1] !== 0 ? [HALF, 0, 0] : n[0] !== 0 ? [0, HALF, 0] : [0, 0, 0];
      k.rbox(col, [off.x + u[0], s / 2 + off.y + u[1], off.z + u[2]], [c * 0.86, c * 0.86, 0.001], 0.002, rot);
    }
    return { name: "Rubik's cube", phys: { mass: 0.1 } };
  },
  chessPiece(k, a, r, item) {
    const t = item.attrs.text;
    const kind = /king/.test(t) ? 'king' : /queen/.test(t) ? 'queen' : /knight|horse/.test(t) ? 'knight' : /bishop/.test(t) ? 'bishop' : /rook|castle/.test(t) ? 'rook' : /pawn/.test(t) ? 'pawn' : r.pick(['king', 'queen', 'knight', 'rook']);
    const white = !/black|dark/.test(t);
    const B = k.body('marble', white ? '#f0ece4' : '#1a1a1c');
    chessMan(k, B, kind, 1);
    return { name: `${white ? 'White' : 'Black'} chess ${kind}`, phys: { mass: 0.4 } };
  },
  chessSet(k, a, r) {
    const sq = 0.055, n = 8, half = sq * n / 2;
    k.box('darkWood', [0, 0.012, 0], [sq * n + 0.04, 0.024, sq * n + 0.04]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) k.box((i + j) % 2 ? '#2a2420' : '#e8dcc4', [-half + (i + 0.5) * sq, 0.025, -half + (j + 0.5) * sq], [sq, 0.003, sq]);
    const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    for (const [side, keyRow, pawnRow] of [['w', 0, 1], ['b', 7, 6]]) {
      const key = side === 'w' ? 'marble' : 'm:#1a1a1c';
      for (let i = 0; i < 8; i++) {
        const pk = k.sub([-half + (i + 0.5) * sq, 0.027, -half + (keyRow + 0.5) * sq], [0, side === 'w' ? 0 : PI, 0]);
        chessMan(pk, key, back[i], 0.28);
        const pp = k.sub([-half + (i + 0.5) * sq, 0.027, -half + (pawnRow + 0.5) * sq]);
        chessMan(pp, key, 'pawn', 0.28);
      }
    }
    return { name: 'Chess set', phys: { mass: 2 } };
  },
  jackInTheBox(k, a, r) {
    const B = k.body('painted', r.pick(['#e83a3a', '#3a8ae8', '#f2c21a']));
    k.rbox(B, [0, 0.1, 0], [0.2, 0.2, 0.2], 0.01);
    k.cyl('chrome', [0.11, 0.1, 0], 0.01, 0.03, X);
    k.seg('chrome', [0.13, 0.1, 0], [0.13, 0.05, 0.03], 0.005);
    const pop = k.sub([0, 0.2, 0]);
    for (let i = 0; i < 8; i++) pop.torus('chrome', [0, i * 0.02, 0], 0.04, 0.004, [HALF, 0, 0], TAU, 14);
    pop.ball('#f4d0b0', [0, 0.2, 0], 0.05);
    pop.cone('#e83a3a', [0, 0.28, 0], 0.045, 0.09);
    pop.ball('#e83a3a', [0, 0.195, 0.05], 0.012);
    pop.group.scale.y = 0.05;
    let up = 0, target = 0;
    k.tick((dt) => { up += (target - up) * Math.min(1, dt * 12); pop.group.scale.y = Math.max(0.05, up + Math.sin(up * 20) * 0.05 * up); });
    return { name: 'Jack-in-the-box', phys: { mass: 0.8 }, interact: { label: () => (target ? 'Close the lid' : 'Turn the crank'), action: (e) => { target = target ? 0 : 1; if (target) { playTune(e, 'bell', [0, 2, 4, 0, 4, 7]); } } } };
  },
  toyTrain(k, a, r) {
    const R = 0.9;
    k.torus('darkWood', [0, 0.01, 0], R, 0.03, [HALF, 0, 0], TAU, 48);
    for (let i = 0; i < 36; i++) { const an = i / 36 * TAU; k.box('wood', [Math.cos(an) * R, 0.008, Math.sin(an) * R], [0.04, 0.016, 0.16], [0, -an, 0]); }
    for (const rr of [R - 0.04, R + 0.04]) k.torus('chrome', [0, 0.02, 0], rr, 0.006, [HALF, 0, 0], TAU, 48);
    const train = k.sub([0, 0.02, 0]);
    const cols = ['#c62828', '#2a5ad8', '#2aa84a', '#f2c21a'];
    for (let c = 0; c < 4; c++) {
      const an = -c * 0.24;
      const car = train.sub([Math.cos(an) * R, 0, Math.sin(an) * R], [0, -an, 0]);
      car.rbox(cols[c], [0, 0.06, 0], [0.09, 0.07, 0.16], 0.01);
      if (c === 0) { car.cyl('black', [0, 0.12, 0.04], 0.018, 0.06, null, { segs: 12 }); car.rbox(cols[c], [0, 0.12, -0.04], [0.08, 0.06, 0.06], 0.01); }
      for (const s of [-1, 1]) for (const z of [-1, 1]) car.cyl('black', [s * 0.05, 0.03, z * 0.05], 0.022, 0.01, X, { segs: 12 });
    }
    k.tick((dt) => { train.group.rotation.y -= dt * 0.6; });
    return { name: 'Toy train set', static: true, interact: { label: () => 'Choo choo!', action: (e) => sound(e, 'honk') } };
  },
  snowGlobe(k, a, r) {
    k.body('wood', '#6a3a1a');
    k.lathe('body', [0, 0, 0], [[0.1, 0], [0.09, 0.06], [0.07, 0.08]], 24);
    k.ball('glass', [0, 0.16, 0], 0.1);
    k.cyl('snow', [0, 0.082, 0], 0.07, 0.01, null, { segs: 20 });
    k.cone('#1a5a2a', [0.02, 0.12, 0], 0.025, 0.07, null, 10);
    k.rbox('#c62828', [-0.03, 0.1, 0.01], [0.04, 0.035, 0.035], 0.003);
    k.cone('#f4f4f2', [-0.03, 0.125, 0.01], 0.03, 0.02, [0, PI / 4, 0], 4);
    const n = 60, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) { p.set([(Math.random() - 0.5) * 0.12, 0.1 + Math.random() * 0.12, (Math.random() - 0.5) * 0.12], i * 3); v.push(Math.random()); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.006, color: 0xffffff }));
    pts.userData.noRaycast = true; k.group.add(pts);
    let shake = 0;
    k.tick((dt, t) => { shake = Math.max(0, shake - dt * 0.3); for (let i = 0; i < n; i++) { let y = p[i * 3 + 1] - dt * 0.01 * (1 + v[i]) + shake * dt * (Math.random() - 0.3) * 0.3; if (y < 0.09) y = 0.24; p[i * 3 + 1] = y; p[i * 3] += Math.sin(t + i) * 0.0002; } g.attributes.position.needsUpdate = true; });
    return { name: 'Snow globe', phys: { mass: 0.6 }, interact: { label: () => 'Shake it', action: (e) => { shake = 1; for (let i = 0; i < n; i++) p[i * 3 + 1] = 0.09 + Math.random() * 0.02; sound(e, 'magic'); } } };
  },
  pinata(k, a, r) {
    const cols = ['#ff3a8a', '#3ac8ff', '#ffd21a', '#3aff6a', '#ff8a1a', '#a85aff'];
    const p = k.sub([0, 1.8, 0]);
    const stripes = (x, y, z, w, h, d) => { const n = Math.max(2, Math.round(h / 0.05)); for (let i = 0; i < n; i++) p.box('f:' + cols[i % cols.length], [x, y - h / 2 + (i + 0.5) * h / n, z], [w, h / n, d]); };
    stripes(0, 0, 0, 0.26, 0.24, 0.5);
    stripes(0, 0.22, 0.22, 0.14, 0.26, 0.14);
    stripes(0, 0.33, 0.33, 0.13, 0.12, 0.2);
    for (const s of [-1, 1]) { stripes(s * 0.04, 0.42, 0.26, 0.03, 0.12, 0.03); for (const z of [-1, 1]) stripes(s * 0.09, -0.2, z * 0.18, 0.06, 0.18, 0.06); }
    stripes(0, 0.05, -0.28, 0.04, 0.1, 0.08);
    k.tube('white', [[0, 1.9, 0], [0, 2.6, 0], [0, 3.4, 0]], 0.004, 4, false, 4);
    let hits = 0;
    k.tick((dt, t) => { p.group.rotation.z = Math.sin(t * 1.2) * 0.1 * (1 + hits * 0.3); });
    return { name: 'Piñata', static: true, interact: { label: () => (hits < 3 ? 'Whack the piñata' : 'Confetti!'), action: (e) => { hits++; sound(e, 'pop'); if (hits === 3) { p.group.visible = false; confetti(k, e); sound(e, 'firework'); } } } };
  },
  // ================= Games & sports =================
  poolTable(k, a, r) {
    const felt = k.body('velvet', r.pick(['#1a6a3a', '#1a3a7a', '#7a1a2a']));
    const w = 2.5, d = 1.4;
    k.box('darkWood', [0, 0.72, 0], [w + 0.2, 0.12, d + 0.2]);
    k.box(felt, [0, 0.785, 0], [w, 0.01, d]);
    for (const [x, z, sx, sz] of [[0, d / 2 + 0.05, w, 0.1], [0, -d / 2 - 0.05, w, 0.1], [w / 2 + 0.05, 0, 0.1, d], [-w / 2 - 0.05, 0, 0.1, d]]) k.box('darkWood', [x, 0.82, z], [sx + 0.1, 0.08, sz + 0.1]);
    for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, d / 2]) k.cyl('black', [x, 0.79, z], 0.055, 0.02, null, { segs: 14 });
    for (const x of [-1, 1]) for (const z of [-1, 1]) k.lathe('darkWood', [x * (w / 2 - 0.1), 0, z * (d / 2 - 0.1)], [[0.08, 0], [0.06, 0.2], [0.09, 0.4], [0.07, 0.66]], 14);
    const cols = ['#f2d21a', '#2a5ad8', '#e83a2a', '#6a2aa8', '#ff8a1a', '#2aa84a', '#8a1a1a', '#141414'];
    let i = 0;
    for (let row = 0; row < 4; row++) for (let j = 0; j <= row; j++) k.ball(cols[i++ % 8], [0.6 + row * 0.052, 0.818, (j - row / 2) * 0.058], 0.028, null, 12);
    k.ball('white', [-0.6, 0.818, 0], 0.028, null, 12);
    k.seg('lightWood', [-0.9, 0.84, 0.15], [0.2, 0.83, 0.5], 0.008, 0.012);
    k.collide([-w / 2 - 0.1, 0, -d / 2 - 0.1], [w / 2 + 0.1, 0.86, d / 2 + 0.1]);
    return { name: 'Pool table', interact: { label: () => 'Break!', action: (e) => { for (let n = 0; n < 5; n++) setTimeout(() => sound(e, 'click'), n * 60 + Math.random() * 40); } } };
  },
  pingPong(k, a, r) {
    k.body('painted', '#1a4a8a');
    const w = 2.74, d = 1.525;
    k.box('body', [0, 0.745, 0], [w, 0.03, d]);
    k.box('white', [0, 0.761, 0], [w, 0.002, 0.02]); k.box('white', [0, 0.761, d / 2 - 0.01], [w, 0.002, 0.02]); k.box('white', [0, 0.761, -d / 2 + 0.01], [w, 0.002, 0.02]);
    k.box('white', [0, 0.84, 0], [0.01, 0.15, d + 0.1]);
    for (const x of [-1, 1]) for (const z of [-1, 1]) k.box('dark', [x * 1.1, 0.37, z * 0.6], [0.05, 0.73, 0.05]);
    for (const s of [-1, 1]) { k.cyl('#c62828', [s * 0.9, 0.78, s * 0.3], 0.075, 0.012, null, { segs: 18 }); k.seg('wood', [s * 0.9, 0.78, s * 0.3 + s * 0.07], [s * 0.9, 0.78, s * 0.3 + s * 0.17], 0.013); }
    k.ball('white', [0.2, 0.8, 0.1], 0.02, null, 10);
    k.collide([-w / 2, 0, -d / 2], [w / 2, 0.77, d / 2]);
    return { name: 'Ping-pong table' };
  },
  foosball(k, a, r) {
    k.body('wood', '#6a4226');
    k.box('body', [0, 0.8, 0], [1.2, 0.2, 0.7]);
    k.box('velvet', [0, 0.84, 0], [1.1, 0.01, 0.6]);
    for (const x of [-1, 1]) for (const z of [-1, 1]) k.box('body', [x * 0.5, 0.35, z * 0.28], [0.08, 0.7, 0.08]);
    for (let i = 0; i < 8; i++) {
      const z = -0.26 + (i / 7) * 0.52, x = -0.52 + (i / 7) * 1.04;
      k.seg('chrome', [x, 0.9, -0.5], [x, 0.9, 0.5], 0.008);
      k.cyl('black', [x, 0.9, 0.52], 0.02, 0.08, Z, { segs: 10 });
      const col = i % 2 ? '#c62828' : '#2a5ad8';
      for (let j = 0; j < 3; j++) k.rbox(col, [x, 0.87, -0.2 + j * 0.2], [0.02, 0.08, 0.03], 0.008);
      void z;
    }
    return { name: 'Foosball table', static: true, collideAuto: true };
  },
  basketballHoop(k, a, r) {
    k.body('painted', '#2a2a2c');
    k.seg('body', [0, 0, -0.6], [0, 3.1, -0.6], 0.06);
    k.seg('body', [0, 2.9, -0.6], [0, 3.05, -0.1], 0.04);
    k.box('glass', [0, 3.35, -0.05], [1.8, 1.05, 0.03]);
    k.box('white', [0, 3.2, -0.03], [0.59, 0.03, 0.01]); k.box('white', [0, 3.42, -0.03], [0.59, 0.03, 0.01]);
    k.box('white', [-0.28, 3.31, -0.03], [0.03, 0.25, 0.01]); k.box('white', [0.28, 3.31, -0.03], [0.03, 0.25, 0.01]);
    k.torus('m:#ff6a10', [0, 3.05, 0.23], 0.23, 0.01, [HALF, 0, 0], TAU, 28);
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; k.seg('white', [Math.cos(an) * 0.23, 3.05, 0.23 + Math.sin(an) * 0.23], [Math.cos(an) * 0.13, 2.65, 0.23 + Math.sin(an) * 0.13], 0.003); }
    k.collideCyl(0, -0.6, 0, 3.1, 0.08);
    return { name: 'Basketball hoop', static: true };
  },
  soccerGoal(k, a, r) {
    k.body('white', '#f4f4f2');
    const w = 7.32, h = 2.44, d = 2;
    k.seg('body', [-w / 2, 0, 0], [-w / 2, h, 0], 0.06); k.seg('body', [w / 2, 0, 0], [w / 2, h, 0], 0.06); k.seg('body', [-w / 2, h, 0], [w / 2, h, 0], 0.06);
    for (const x of [-w / 2, w / 2]) { k.seg('body', [x, h, 0], [x, 0, -d], 0.03); k.seg('body', [x, 0, -d], [x, 0, 0], 0.03); }
    k.seg('body', [-w / 2, 0, -d], [w / 2, 0, -d], 0.03);
    for (let i = 0; i <= 20; i++) { const x = -w / 2 + i * w / 20; k.seg('lightgray', [x, h, 0], [x, 0, -d], 0.005); }
    for (let i = 1; i < 8; i++) { const f = i / 8; k.seg('lightgray', [-w / 2, h * (1 - f), -d * f], [w / 2, h * (1 - f), -d * f], 0.005); }
    k.collideCyl(-w / 2, 0, 0, h, 0.08); k.collideCyl(w / 2, 0, 0, h, 0.08);
    return { name: 'Soccer goal', static: true };
  },
  bowling(k, a, r) {
    for (let row = 0; row < 4; row++) for (let j = 0; j <= row; j++) {
      const x = (j - row / 2) * 0.3, z = -row * 0.26;
      k.lathe('white', [x, 0, z], [[0.02, 0], [0.055, 0.08], [0.06, 0.14], [0.03, 0.25], [0.025, 0.28], [0.035, 0.33], [0, 0.38]], 18);
      k.torus('#c62828', [x, 0.27, z], 0.027, 0.006, [HALF, 0, 0], TAU, 14);
    }
    k.ball(k.body('glossyPlastic', r.pick(['#1a1a1c', '#2a3a8a', '#8a1a3a'])), [0, 0.11, 1.6], 0.11);
    return { name: 'Bowling pins', phys: { mass: 8 } };
  },
  dartboard(k, a, r) {
    k.body('darkWood', '#3a2a1a');
    k.box('body', [0, 1.6, -0.03], [0.7, 0.7, 0.04]);
    const rings = [[0.23, '#141414'], [0.2, '#f0e6d0'], [0.16, '#c62828'], [0.13, '#141414'], [0.1, '#2a8a3a'], [0.06, '#f0e6d0'], [0.02, '#c62828'], [0.008, '#2a8a3a']];
    rings.forEach(([rr, c], i) => k.cyl(c, [0, 1.6, 0.0 + i * 0.002], rr, 0.02, Z, { segs: 40 }));
    for (const [x, y] of [[0.05, 1.63], [-0.07, 1.55], [0.01, 1.6]]) { k.seg('chrome', [x, y, 0.02], [x, y, 0.1], 0.003); k.cone('#ff3a8a', [x, y, 0.12], 0.012, 0.04, [-HALF, 0, 0], 4); }
    return { name: 'Dartboard', static: true };
  },
  surfboard(k, a, r) {
    const col = k.color(r.pick(['#f2f0ea', '#3ac8ff', '#ff6a3a', '#ffd21a']));
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; const y = -1 + t * 2; pts.push([0.27 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y - 0.1) / 1.1, 2.5)), 0.5), y]); }
    const outline = pts.concat(pts.slice().reverse().map(([x, y]) => [-x, y]));
    k.ext('g:' + col, outline, 0.05, [0, 1.0, 0], [0, 0, 0.1], 0.015);
    k.box(k.color2('#1a1a1c'), [0, 1.0, 0.035], [0.02, 1.8, 0.005], [0, 0, 0.1]);
    return { name: 'Surfboard', phys: { mass: 4 }, floats: true };
  },
  skis(k, a, r) {
    const col = k.color(r.pick(['#e83a3a', '#2a5ad8', '#1a1a1c']));
    for (const x of [-0.07, 0.07]) { k.box('g:' + col, [x, 0.01, 0], [0.08, 0.015, 1.7]); k.box('g:' + col, [x, 0.03, 0.87], [0.08, 0.015, 0.08], [-0.5, 0, 0]); k.rbox('black', [x, 0.05, 0], [0.09, 0.06, 0.3], 0.02); }
    for (const x of [0.25, 0.35]) { k.seg('chrome', [x, 0, 0.3], [x, 1.2, 0.2], 0.008); k.cyl('black', [x, 1.2, 0.2], 0.015, 0.12, null, { segs: 8 }); }
    return { name: 'Skis', phys: { mass: 3 } };
  },
  sled(k, a, r) {
    const B = k.body('wood', '#b07a4a');
    for (const x of [-0.18, 0.18]) k.tube('m:#c62828', [[x, 0.25, -0.5], [x, 0.03, -0.45], [x, 0.02, 0.4], [x, 0.12, 0.62], [x, 0.3, 0.55]], 0.015, 24);
    for (let i = 0; i < 5; i++) k.box(B, [0, 0.14, -0.35 + i * 0.18], [0.46, 0.025, 0.14]);
    for (const x of [-0.18, 0.18]) for (const z of [-0.3, 0.3]) k.seg('m:#c62828', [x, 0.03, z], [x, 0.13, z], 0.012);
    return { name: 'Sled', phys: { mass: 6 }, seats: [{ x: 0, y: 0.16, z: -0.1, yaw: 0 }] };
  },
  // ================= Music =================
  drumKit(k, a, r) {
    const shell = k.body('carPaint', r.pick(['#c62828', '#1a1a1c', '#2a5ad8', '#e8e8e6', '#6a1a8a']));
    const drum = (pos, rr, d, rot) => { k.cyl(shell, pos, rr, d, rot, { segs: 28 }); const n = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...(rot || [0, 0, 0]), 'YXZ')); for (const s of [-1, 1]) k.cyl('white', [pos[0] + n.x * s * d / 2, pos[1] + n.y * s * d / 2, pos[2] + n.z * s * d / 2], rr * 1.01, 0.01, rot, { segs: 28 }); };
    drum([0, 0.28, 0], 0.28, 0.4, Z);
    k.label('♪ GENESIS ♪', [0, 0.28, 0.212], 0.4, 0.12, null, { fg: '#fff' });
    drum([-0.45, 0.5, 0.25], 0.18, 0.14, null);
    for (const x of [-0.45]) for (const [lx, lz] of [[-0.1, 0.1], [0.1, 0.1], [0, -0.1]]) k.seg('chrome', [x + lx, 0, 0.25 + lz], [x, 0.43, 0.25], 0.008);
    drum([-0.15, 0.62, -0.05], 0.14, 0.16, [0.3, 0, 0.2]);
    drum([0.18, 0.62, -0.05], 0.15, 0.17, [0.3, 0, -0.2]);
    drum([0.5, 0.42, 0.15], 0.22, 0.4, null);
    const cym = (x, y, z, rr, tilt) => { k.seg('chrome', [x, 0, z], [x, y, z], 0.01); k.cyl('brass', [x, y, z], rr, 0.006, [tilt, 0, 0], { segs: 32, rTop: rr * 0.1 }); };
    cym(-0.7, 1.0, -0.1, 0.22, 0.15); cym(0.72, 1.1, -0.2, 0.25, 0.2); cym(-0.8, 0.8, 0.35, 0.18, 0.05);
    k.cyl('leather', [0, 0.5, -0.6], 0.18, 0.08, null, { segs: 20 });
    k.seg('chrome', [0, 0, -0.6], [0, 0.46, -0.6], 0.02);
    k.collide([-0.8, 0, -0.3], [0.8, 0.6, 0.4]);
    return { name: 'Drum kit', interact: { label: () => 'Play the drums', action: (e) => playBeat(e) }, seats: [{ x: 0, y: 0.54, z: -0.6, yaw: 0 }] };
  },
  violin(k, a, r, item) {
    const big = /cello|bass|contrabass/.test(item.attrs.text);
    const s = big ? (/bass/.test(item.attrs.text) ? 2.9 : 2.1) : 1;
    const B = k.body('wood', '#a0501e');
    const g = k.sub([0, big ? 0.05 : 0.02, 0], big ? [0, 0, 0] : [-HALF + 0.1, 0, 0]);
    const outline = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, y = t * 0.36 - 0.18; const w = 0.1 * (1 - 0.35 * Math.exp(-Math.pow((y - 0.0) / 0.035, 2))) * Math.sqrt(Math.max(0, 1 - Math.pow(y / 0.185, 2))) + (y < 0 ? 0.012 * Math.sqrt(Math.max(0, 1 - Math.pow((y + 0.08) / 0.1, 2))) : 0); outline.push([w, y]); }
    const shape = outline.concat(outline.slice().reverse().map(([x, y]) => [-x, y]));
    g.ext(B, shape.map(([x, y]) => [x * s, (y + 0.18) * s]), 0.04 * s, [0, 0, 0], null, 0.004 * s);
    g.box('black', [0, 0.52 * s, 0.024 * s], [0.025 * s, 0.26 * s, 0.01 * s]);
    g.box(B, [0, 0.5 * s, 0.01 * s], [0.03 * s, 0.3 * s, 0.018 * s]);
    g.torus(B, [0, 0.67 * s, 0.01 * s], 0.018 * s, 0.008 * s, [0, HALF, 0], TAU * 1.5, 16);
    for (const x of [-0.02, 0.02]) { g.ext('black', [[-0.004, -0.03], [0.004, -0.03], [0.004, 0.03], [-0.004, 0.03]], 0.02 * s, [x * s, 0.17 * s, 0.021 * s]); }
    for (let i = 0; i < 4; i++) g.seg('lightgray', [(-0.009 + i * 0.006) * s, 0.06 * s, 0.03 * s], [(-0.006 + i * 0.004) * s, 0.64 * s, 0.03 * s], 0.0008 * s, 0.0008 * s, 4);
    g.box('lightWood', [0, 0.13 * s, 0.035 * s], [0.04 * s, 0.018 * s, 0.004 * s]);
    if (big) { g.seg('chrome', [0, 0, 0], [0, -0.05, 0], 0.01); }
    else k.seg('darkWood', [0.25, 0.02, 0.1], [-0.35, 0.02, 0.2], 0.005);
    return { name: big ? (s > 2.5 ? 'Double bass' : 'Cello') : 'Violin', phys: { mass: big ? 6 : 0.5 }, interact: { label: () => 'Play a melody', action: (e) => playTune(e, 'string', big ? [0, 2, 4, 2, 0] : [4, 5, 7, 9, 7, 5, 4, 2]) } };
  },
  trumpet(k, a, r) {
    const B = k.body('gold', '#d8b050');
    const y = 0.05;
    k.lathe(B, [0.24, y, 0], [[0.008, 0], [0.012, 0.1], [0.03, 0.16], [0.065, 0.19], [0.066, 0.192]], 24, [0, 0, -HALF]);
    k.seg(B, [-0.2, y, 0], [0.24, y, 0], 0.007);
    k.tube(B, [[-0.12, y, 0], [-0.18, y, 0.03], [-0.2, y, 0.08], [-0.12, y, 0.1], [0.14, y, 0.1], [0.18, y, 0.06], [0.14, y, 0.04]], 0.007, 24);
    for (let i = 0; i < 3; i++) { k.cyl(B, [-0.03 + i * 0.035, y + 0.02, 0.05], 0.012, 0.08, null, { segs: 12 }); k.cyl('white', [-0.03 + i * 0.035, y + 0.07, 0.05], 0.009, 0.01, null, { segs: 10 }); }
    k.lathe(B, [-0.2, y, 0], [[0.006, 0], [0.012, 0.02], [0.004, 0.025]], 14, [0, 0, HALF]);
    return { name: 'Trumpet', phys: { mass: 1 }, interact: { label: () => 'Toot!', action: (e) => playTune(e, 'brass', [4, 4, 4, 7, 4, 7, 9]) } };
  },
  saxophone(k, a, r) {
    const B = k.body('gold', '#d8a840');
    k.tube(B, [[0, 0.75, 0], [0, 0.4, 0], [0, 0.18, 0], [0.04, 0.08, 0], [0.12, 0.08, 0], [0.15, 0.2, 0]], 0.03, 30, false, 14);
    k.lathe(B, [0.15, 0.2, 0], [[0.03, 0], [0.045, 0.08], [0.07, 0.13], [0.072, 0.135]], 22);
    k.seg(B, [0, 0.75, 0], [-0.03, 0.82, 0.02], 0.012, 0.008);
    k.seg('black', [-0.03, 0.82, 0.02], [-0.05, 0.85, 0.05], 0.007, 0.005);
    for (let i = 0; i < 7; i++) k.cyl('lightgray', [0, 0.3 + i * 0.06, 0.03], 0.01, 0.008, Z, { segs: 10 });
    return { name: 'Saxophone', phys: { mass: 2.5 }, interact: { label: () => 'Play some jazz', action: (e) => playTune(e, 'reed', [0, 3, 5, 6, 5, 3, 0]) } };
  },
  flute(k, a, r) {
    const B = k.body('chrome', '#d8dce0');
    k.seg(B, [-0.33, 0.02, 0], [0.33, 0.02, 0], 0.01, 0.01, 14);
    for (let i = 0; i < 8; i++) k.cyl('chrome', [-0.1 + i * 0.045, 0.031, 0], 0.007, 0.006, null, { segs: 10 });
    k.rbox('chrome', [-0.28, 0.03, 0], [0.03, 0.006, 0.02], 0.003);
    return { name: 'Flute', phys: { mass: 0.4 }, interact: { label: () => 'Play a tune', action: (e) => playTune(e, 'flute', [7, 9, 7, 4, 5, 4, 2, 0]) } };
  },
  harp(k, a, r) {
    const B = k.body('gold', '#c8a040');
    k.tube(B, [[0, 0.1, -0.35], [0, 0.6, -0.4], [0, 1.4, -0.3], [0, 1.75, -0.05], [0, 1.72, 0.25]], 0.035, 24);
    k.seg(B, [0, 0.08, -0.35], [0, 1.65, 0.3], 0.03, 0.05);
    k.lathe(B, [0, 0, 0.3], [[0.1, 0], [0.06, 0.08], [0.05, 0.12]], 16);
    for (let i = 0; i < 18; i++) { const f = i / 17; const ax = new THREE.Vector3(0, 0.1 + f * 1.5, -0.35 + f * 0.64); const top = new THREE.Vector3(0, Math.min(1.72, 0.6 + f * 1.2 + (1 - Math.pow(1 - f, 2)) * 0.1 + 0.3), -0.38 + f * 0.62); k.seg(i % 7 === 0 ? '#c62828' : 'lightgray', [0, ax.y, ax.z], [0, Math.max(ax.y + 0.1, top.y), top.z - 0.1], 0.0015, 0.0015, 4); }
    return { name: 'Harp', phys: { mass: 30 }, interact: { label: () => 'Pluck the strings', action: (e) => sound(e, 'chord', { freqs: [262, 330, 392, 523, 659, 784], timbre: 'pluck', strum: 0.07 }) } };
  },
  xylophone(k, a, r) {
    k.body('darkWood', '#4a2a1a');
    for (const s of [-1, 1]) k.box('body', [0, 0.35, s * 0.12], [0.9, 0.04, 0.04]);
    for (const x of [-0.4, 0.4]) for (const s of [-1, 1]) k.seg('body', [x, 0, s * 0.14], [x, 0.35, s * 0.12], 0.015);
    const cols = ['#e83a3a', '#ff8a1a', '#f2d21a', '#3ac85a', '#2a8ae8', '#5a3ad8', '#b04ad8', '#e83a8a'];
    for (let i = 0; i < 8; i++) k.rbox(cols[i], [-0.36 + i * 0.1, 0.39, 0], [0.08, 0.025, 0.34 - i * 0.025], 0.006);
    k.seg('lightWood', [0.3, 0.42, 0.25], [0.1, 0.41, 0.35], 0.005); k.ball('#c62828', [0.3, 0.42, 0.25], 0.018);
    return { name: 'Xylophone', phys: { mass: 5 }, interact: { label: () => 'Play the xylophone', action: (e) => playTune(e, 'mallet', [0, 1, 2, 3, 4, 5, 6, 7]) } };
  },
  synthesizer(k, a, r) {
    k.body('glossyPlastic', '#1a1a1c');
    for (const s of [-1, 1]) { k.seg('chrome', [s * 0.4, 0, 0.2], [-s * 0.4, 0.75, -0.1], 0.015); k.seg('chrome', [s * 0.4, 0, -0.2], [-s * 0.4, 0.75, 0.1], 0.015); }
    k.rbox('body', [0, 0.8, 0], [1.0, 0.08, 0.34], 0.01);
    for (let i = 0; i < 36; i++) k.box('white', [-0.44 + i * 0.0252, 0.842, 0.08], [0.023, 0.012, 0.15]);
    for (let i = 0; i < 36; i++) if ([1, 3, 6, 8, 10].includes(i % 12)) k.box('black', [-0.44 + i * 0.0252 - 0.0126, 0.852, 0.05], [0.014, 0.014, 0.09]);
    for (let i = 0; i < 12; i++) knob(k, 'chrome', -0.4 + i * 0.07, 0.84, -0.09, 0.012, 0.012);
    k.screen([0.35, 0.842, -0.09], 0.12, 0.05, [-HALF, 0, 0], SCREENS_WAVE, { fps: 8, res: 128 });
    return { name: 'Synthesizer', interact: { label: () => 'Play a chord', action: (e) => sound(e, 'chord', { freqs: [220, 277, 330], timbre: 'synth' }) }, collideAuto: true, static: true };
  },
  // ================= Magic & fantasy =================
  magicWand(k, a, r) {
    k.body('darkWood', '#2a1a10');
    k.seg('body', [0, 0.01, -0.17], [0, 0.01, 0.17], 0.008, 0.004);
    k.seg('gold', [0, 0.01, -0.17], [0, 0.01, -0.12], 0.009);
    const col = k.color2('#b080ff');
    k.ball('e:' + col, [0, 0.01, 0.175], 0.008);
    k.glow(col, [0, 0.01, 0.18], 0.12, 0.9);
    return { name: 'Magic wand', phys: { mass: 0.05 }, interact: { label: () => 'Cast a spell', action: (e) => { sound(e, 'magic'); confetti(k, e); } }, sparkle: col };
  },
  wizardStaff(k, a, r) {
    k.body('darkWood', '#4a2a16');
    k.tube('body', [[0, 0, 0], [0.02, 0.6, 0], [-0.01, 1.2, 0.01], [0.01, 1.7, 0], [0.08, 1.85, 0], [0.02, 1.95, 0], [-0.07, 1.88, 0]], 0.022, 30, false, 10);
    const col = k.color2(r.pick(['#40c8ff', '#b060ff', '#ff4a3a', '#3aff8a']));
    k.ball('e:' + col, [0.0, 1.87, 0], 0.05);
    k.glow(col, [0, 1.87, 0], 0.6, 0.9);
    k.light([0, 1.87, 0], col, 1, 3, false, true);
    return { name: 'Wizard staff', phys: { mass: 1.5 }, interact: { label: () => 'Channel magic', action: (e) => { sound(e, 'magic'); confetti(k, e); } } };
  },
  crystalBall(k, a, r) {
    k.body('gold', '#c8a040');
    k.lathe('body', [0, 0, 0], [[0.12, 0], [0.1, 0.03], [0.06, 0.08], [0.09, 0.12], [0.07, 0.13]], 24);
    const col = k.color2('#8a6aff');
    k.ball('glass', [0, 0.25, 0], 0.13, null, 28);
    const inner = k.sub([0, 0.25, 0]);
    inner.ball('e:' + col, [0, 0, 0], 0.06, [1, 0.8, 1]);
    k.glow(col, [0, 0.25, 0], 0.5, 0.6);
    k.tick((dt, t) => { inner.group.rotation.y += dt; inner.group.scale.setScalar(0.8 + Math.sin(t * 2) * 0.2); });
    k.light([0, 0.25, 0], col, 0.8, 2.5, false);
    return { name: 'Crystal ball', phys: { mass: 3 }, interact: { label: () => 'Gaze into the future', action: (e) => { sound(e, 'magic'); if (G.ui) G.ui.toast(r.pick(['I see... a dragon in your future.', 'Great fortune awaits beyond the portal.', 'Beware the rubber duck.', 'You will build something amazing today.', 'The stars say: try typing "a castle made of candy".'])); } } };
  },
  cauldron(k, a, r) {
    k.body('iron', '#2a2a2c');
    k.lathe('body', [0, 0.12, 0], [[0.02, 0], [0.3, 0.05], [0.4, 0.25], [0.36, 0.5], [0.38, 0.52], [0.34, 0.52]], 28);
    for (let i = 0; i < 3; i++) { const an = i / 3 * TAU; k.seg('body', [Math.cos(an) * 0.25, 0.18, Math.sin(an) * 0.25], [Math.cos(an) * 0.32, 0, Math.sin(an) * 0.32], 0.03); }
    const col = k.color2(r.pick(['#3aff4a', '#b04aff', '#ff4a8a', '#3ac8ff']));
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.34, 28), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(col), emissiveIntensity: 1.6, roughness: 0.2 }));
    brew.rotation.x = -HALF; k.add(brew, [0, 0.58, 0]);
    const bubbles = [];
    for (let i = 0; i < 6; i++) { const b = k.sub([r.range(-0.2, 0.2), 0.6, r.range(-0.2, 0.2)]); b.ball('e:' + col, [0, 0, 0], 0.03); bubbles.push(b); }
    k.tick((dt, t) => bubbles.forEach((b, i) => { const ph = (t * 0.7 + i * 0.37) % 1; b.group.position.y = 0.58 + ph * 0.1; b.group.scale.setScalar(1 - ph); }));
    k.glow(col, [0, 0.75, 0], 1.2, 0.5);
    k.light([0, 0.8, 0], col, 1.2, 4, false, true);
    k.collideCyl(0, 0, 0, 0.64, 0.42);
    for (let i = 0; i < 5; i++) { const an = i / 5 * TAU; k.ball('fire', [Math.cos(an) * 0.12, 0.04, Math.sin(an) * 0.12], 0.05, [1, 1.6, 1]); }
    return { name: 'Bubbling cauldron', static: true, interact: { label: () => 'Stir the potion', action: (e) => sound(e, 'bubble') } };
  },
  potions(k, a, r) {
    const cols = ['#ff3a6a', '#3aff6a', '#3a8aff', '#ffd23a', '#c83aff'];
    const shapes = [[[0.03, 0], [0.045, 0.02], [0.045, 0.08], [0.012, 0.11], [0.012, 0.14]], [[0.02, 0], [0.05, 0.04], [0.02, 0.09], [0.01, 0.12]], [[0.035, 0], [0.035, 0.12], [0.01, 0.14], [0.01, 0.16]]];
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.1, z = (i % 2) * 0.05, prof = shapes[i % 3];
      k.lathe('glass', [x, 0, z], prof, 16);
      k.lathe('e:' + cols[(i + r.int(0, 4)) % 5], [x, 0.004, z], prof.slice(0, 2).concat([[0, prof[1][1]]]).map(([rr, y]) => [rr * 0.9, y]), 14);
      k.cyl('wood', [x, prof[prof.length - 1][1] + 0.01, z], 0.012, 0.025, null, { segs: 8 });
    }
    return { name: 'Potion bottles', phys: { mass: 0.8 }, interact: { label: () => 'Drink a potion', action: (e) => { sound(e, 'bubble'); if (G.ui) G.ui.toast(r.pick(['You feel stronger!', 'You feel... bouncy.', 'Nothing happens. Or does it?', 'Your ears tingle.'])); } } };
  },
  crown(k, a, r) {
    const B = k.body('gold', '#e0b040');
    k.cyl(B, [0, 0.04, 0], 0.1, 0.08, null, { segs: 32, open: true });
    for (let i = 0; i < 8; i++) { const an = i / 8 * TAU; k.cone(B, [Math.cos(an) * 0.1, 0.11, Math.sin(an) * 0.1], 0.02, 0.07, null, 6); k.ball('#c62828', [Math.cos(an) * 0.1, 0.05, Math.sin(an) * 0.1], 0.012); k.ball('gold', [Math.cos(an) * 0.1, 0.15, Math.sin(an) * 0.1], 0.01); }
    k.torus(B, [0, 0.005, 0], 0.1, 0.008, [HALF, 0, 0], TAU, 32);
    k.dome('velvet', [0, 0.06, 0], 0.095, null, { scl: [1, 0.6, 1] });
    return { name: 'Crown', phys: { mass: 1 }, sparkle: '#ffe080' };
  },
  throne(k, a, r) {
    const B = k.body('gold', '#d8a830');
    const cushion = k.accent('velvet', r.pick(['#8a1a2a', '#2a1a6a', '#1a4a2a']));
    k.box(B, [0, 0.12, 0], [1.1, 0.24, 0.9]);
    k.box(B, [0, 0.35, 0], [0.9, 0.2, 0.75]);
    k.rbox(cushion, [0, 0.5, 0.03], [0.8, 0.1, 0.65], 0.04);
    k.box(B, [0, 1.3, -0.33], [0.9, 1.8, 0.12]);
    k.rbox(cushion, [0, 1.15, -0.26], [0.65, 1.1, 0.06], 0.03);
    for (const s of [-1, 1]) { k.box(B, [s * 0.46, 0.72, 0], [0.12, 0.3, 0.75]); k.ball(B, [s * 0.46, 0.9, 0.35], 0.08); k.cone(B, [s * 0.4, 2.35, -0.33], 0.06, 0.3, null, 8); }
    k.cone(B, [0, 2.45, -0.33], 0.1, 0.4, null, 8);
    k.ball('#c62828', [0, 2.1, -0.26], 0.06);
    k.collide([-0.55, 0, -0.45], [0.55, 0.45, 0.45]); k.collide([-0.45, 0, -0.4], [0.45, 2.2, -0.27]);
    return { name: 'Throne', seats: [{ x: 0, y: 0.55, z: 0.05, yaw: 0 }] };
  },
  treasure(k, a, r) {
    for (let i = 0; i < 120; i++) { const an = r.range(0, TAU), d = Math.pow(r.range(0, 1), 0.6) * 0.8; const h = (0.8 - d) * 0.5; k.cyl('gold', [Math.cos(an) * d, r.range(0, h) + 0.01, Math.sin(an) * d], 0.025, 0.006, [r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5)], { segs: 10 }); }
    k.dome('gold', [0, 0, 0], 0.75, null, { scl: [1, 0.45, 1] });
    for (let i = 0; i < 10; i++) { const an = r.range(0, TAU), d = r.range(0.1, 0.6); k.ball(r.pick(['#e8203a', '#20c8e8', '#30e860', '#b040ff']), [Math.cos(an) * d, 0.34 - d * 0.35, Math.sin(an) * d], 0.04, null, 6); }
    k.lathe('gold', [0.2, 0.3, 0.05], [[0.05, 0], [0.02, 0.05], [0.02, 0.1], [0.07, 0.18]], 16);
    k.glow('#ffd060', [0, 0.3, 0], 2, 0.35);
    k.light([0, 0.6, 0], '#ffd060', 1.2, 4, false);
    k.collideCyl(0, 0, 0, 0.3, 0.7);
    return { name: 'Pile of treasure', static: true, sparkle: '#ffe080' };
  },
  hourglass(k, a, r) {
    const B = k.body('darkWood', '#5a3a22');
    for (const y of [0.01, 0.39]) k.cyl(B, [0, y, 0], 0.12, 0.03, null, { segs: 6 });
    for (let i = 0; i < 3; i++) { const an = i / 3 * TAU + 0.5; k.lathe(B, [Math.cos(an) * 0.1, 0.02, Math.sin(an) * 0.1], [[0.012, 0], [0.018, 0.1], [0.012, 0.18], [0.018, 0.27], [0.012, 0.36]], 10); }
    k.lathe('glass', [0, 0.025, 0], [[0.08, 0], [0.075, 0.08], [0.01, 0.175], [0.075, 0.27], [0.08, 0.35]], 22);
    const top = k.sub([0, 0.2, 0]), bot = k.sub([0, 0.03, 0]);
    top.lathe('sand', [0, 0, 0], [[0.01, -0.02], [0.07, 0.08], [0, 0.08]], 18);
    bot.lathe('sand', [0, 0, 0], [[0.07, 0], [0.01, 0.07], [0, 0.07]], 18);
    k.tick((dt, t) => { const f = (t * 0.02) % 1; top.group.scale.set(1, 1 - f * 0.95, 1); bot.group.scale.set(1, 0.05 + f * 0.95, 1); });
    return { name: 'Hourglass', phys: { mass: 1 } };
  },
  lantern(k, a, r) {
    const B = k.body('iron', '#2a2a2c');
    k.cyl(B, [0, 0.015, 0], 0.08, 0.03, null, { segs: 6 });
    for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; k.seg(B, [Math.cos(an) * 0.075, 0.03, Math.sin(an) * 0.075], [Math.cos(an) * 0.075, 0.22, Math.sin(an) * 0.075], 0.005); }
    k.cyl('glass', [0, 0.125, 0], 0.07, 0.19, null, { segs: 6, open: true });
    k.cone(B, [0, 0.26, 0], 0.09, 0.08, null, 6);
    k.torus(B, [0, 0.32, 0], 0.03, 0.005, null, TAU, 14);
    k.ball('fire', [0, 0.1, 0], 0.02, [1, 1.8, 1]);
    k.glow('#ffb050', [0, 0.12, 0], 0.5, 0.8);
    k.light([0, 0.13, 0], '#ffb050', 1.2, 4, false, true);
    return { name: 'Lantern', phys: { mass: 1 } };
  },
  candles(k, a, r) {
    const B = k.body('gold', '#c8a040');
    k.lathe(B, [0, 0, 0], [[0.1, 0], [0.04, 0.03], [0.025, 0.3], [0.04, 0.33]], 20);
    k.seg(B, [-0.2, 0.33, 0], [0.2, 0.33, 0], 0.012);
    for (const x of [-0.2, 0, 0.2]) {
      k.cyl(B, [x, 0.34, 0], 0.03, 0.02, null, { segs: 14 });
      k.cyl('cream', [x, 0.43 + (x ? 0 : 0.03), 0], 0.018, 0.16 + (x ? 0 : 0.06), null, { segs: 12 });
      const fy = 0.52 + (x ? 0 : 0.06);
      k.ball('fire', [x, fy, 0], 0.012, [1, 2, 1]);
      k.glow('#ffb050', [x, fy, 0], 0.25, 0.8);
    }
    k.light([0, 0.6, 0], '#ffb050', 1, 3.5, false, true);
    return { name: 'Candelabra', phys: { mass: 2 } };
  },
  skull(k, a, r) {
    k.body('glossyPlastic', '#e8dfc8');
    k.ball('body', [0, 0.1, -0.01], 0.085, [0.9, 0.95, 1.05]);
    k.rbox('body', [0, 0.04, 0.04], [0.09, 0.06, 0.08], 0.025);
    for (const s of [-1, 1]) k.ball('black', [s * 0.03, 0.09, 0.068], 0.022, [1, 1, 0.5]);
    k.cone('black', [0, 0.06, 0.08], 0.01, 0.02, [PI, 0, 0], 3);
    for (let i = 0; i < 6; i++) k.box('white', [-0.025 + i * 0.01, 0.022, 0.078], [0.008, 0.014, 0.005]);
    return { name: 'Skull', phys: { mass: 0.8 } };
  },
  skeleton(k, a, r) {
    k.body('glossyPlastic', '#e8dfc8');
    const bone = 'body';
    k.ball(bone, [0, 1.62, 0], 0.1, [0.9, 1, 1.05]);
    k.rbox(bone, [0, 1.53, 0.04], [0.1, 0.06, 0.08], 0.025);
    for (const s of [-1, 1]) k.ball('black', [s * 0.035, 1.61, 0.08], 0.024, [1, 1, 0.5]);
    for (let i = 0; i < 18; i++) k.cyl(bone, [0, 0.95 + i * 0.03, -0.03], 0.018, 0.02, null, { segs: 8 });
    for (let i = 0; i < 7; i++) k.torus(bone, [0, 1.38 - i * 0.045, 0.0], 0.13 - Math.abs(i - 2) * 0.008, 0.008, [HALF, 0, 0], TAU * 0.85, 20);
    k.torus(bone, [0, 0.95, 0], 0.12, 0.03, [HALF, 0, 0], TAU, 16);
    for (const s of [-1, 1]) {
      k.seg(bone, [s * 0.05, 1.42, 0], [s * 0.2, 1.42, 0], 0.012);
      k.seg(bone, [s * 0.2, 1.42, 0], [s * 0.26, 1.14, 0.02], 0.014); k.seg(bone, [s * 0.26, 1.14, 0.02], [s * 0.28, 0.9, 0.06], 0.012);
      for (let f = 0; f < 4; f++) k.seg(bone, [s * 0.28, 0.9, 0.06], [s * (0.27 + f * 0.012), 0.82, 0.08], 0.004);
      k.seg(bone, [s * 0.09, 0.92, 0], [s * 0.1, 0.5, 0.02], 0.02); k.ball(bone, [s * 0.1, 0.5, 0.03], 0.028);
      k.seg(bone, [s * 0.1, 0.5, 0.02], [s * 0.1, 0.08, 0], 0.017);
      k.rbox(bone, [s * 0.1, 0.03, 0.05], [0.07, 0.04, 0.16], 0.015);
    }
    return { name: 'Skeleton', phys: { mass: 6 }, interact: { label: () => 'Rattle the bones', action: (e) => { for (let i = 0; i < 6; i++) setTimeout(() => sound(e, 'click'), i * 50); } } };
  },
  coffin(k, a, r) {
    const B = k.body('darkWood', '#3a2418');
    const pts = [[-0.25, -1], [0.25, -1], [0.33, 0.45], [0.2, 1], [-0.2, 1], [-0.33, 0.45]];
    k.ext(B, pts, 0.45, [0, 0.22, 0], [-HALF, 0, 0], 0.01);
    k.box('gold', [0, 0.46, 0.1], [0.04, 0.01, 0.4]); k.box('gold', [0, 0.46, 0.2], [0.24, 0.01, 0.04]);
    return { name: 'Coffin', static: true, collideAuto: true, interact: { label: () => 'Knock knock', action: (e) => sound(e, 'creak') } };
  },
  totemPole(k, a, r) {
    const faces = ['#c62828', '#2a5ad8', '#f2c21a', '#2aa84a', '#1a1a1c'];
    const B = k.body('wood', '#8a5a36');
    const n = 4;
    for (let i = 0; i < n; i++) {
      const y = i * 1.0;
      k.cyl(B, [0, y + 0.5, 0], 0.35, 1.0, null, { segs: 16 });
      const c = faces[(i + r.int(0, 4)) % faces.length];
      for (const s of [-1, 1]) { k.ball('white', [s * 0.13, y + 0.62, 0.3], 0.08, [1, 1, 0.5]); k.ball('black', [s * 0.13, y + 0.62, 0.34], 0.04, [1, 1, 0.5]); k.box(c, [s * 0.13, y + 0.74, 0.31], [0.2, 0.05, 0.06]); }
      k.cone(c, [0, y + 0.45, 0.4], 0.07, 0.25, [HALF, 0, 0], 4);
      k.box(i % 2 ? 'white' : c, [0, y + 0.22, 0.33], [0.36, 0.1, 0.06]);
    }
    k.ext(faces[0], [[-1.1, 0], [-0.3, 0.2], [0.3, 0.2], [1.1, 0], [0.3, -0.1], [-0.3, -0.1]], 0.12, [0, n * 1.0 - 0.3, 0.05]);
    k.ball(B, [0, n + 0.2, 0], 0.33); k.cone('#f2c21a', [0, n + 0.25, 0.35], 0.08, 0.3, [HALF, 0, 0], 4);
    k.collideCyl(0, 0, 0, n + 0.5, 0.36);
    return { name: 'Totem pole', static: true };
  },
  dreamcatcher(k, a, r) {
    k.body('leather', '#8a5a36');
    const c = k.sub([0, 1.6, 0]);
    c.torus('body', [0, 0, 0], 0.15, 0.008, null, TAU, 36);
    for (let i = 0; i < 16; i++) { const a1 = i / 8 * PI, a2 = (i + 5) / 8 * PI; c.seg('cream', [Math.cos(a1) * 0.15, Math.sin(a1) * 0.15, 0], [Math.cos(a2) * 0.15, Math.sin(a2) * 0.15, 0], 0.0012, 0.0012, 3); }
    c.ball('ledB', [0, 0, 0], 0.012);
    for (const x of [-0.1, 0, 0.1]) { c.seg('cream', [x, -0.13, 0], [x, -0.35, 0], 0.001, 0.001, 3); c.ext('f:#f4f0e8', [[0, 0], [0.02, -0.03], [0, -0.1], [-0.02, -0.03]], 0.002, [x, -0.36, 0]); }
    k.tick((dt, t) => { c.group.rotation.y = Math.sin(t * 0.6) * 0.3; });
    return { name: 'Dreamcatcher', static: true };
  },
  altar(k, a, r) {
    k.body('stone', '#8a8478');
    k.box('body', [0, 0.1, 0], [2.2, 0.2, 1.4]); k.box('body', [0, 0.3, 0], [1.8, 0.2, 1.1]); k.box('body', [0, 0.75, 0], [1.4, 0.7, 0.8]);
    k.box('marble', [0, 1.13, 0], [1.6, 0.06, 0.95]);
    k.ball('e:#ff3a2a', [0, 1.35, 0], 0.12);
    k.glow('#ff5a2a', [0, 1.35, 0], 1, 0.6);
    for (const x of [-0.6, 0.6]) { k.cyl('cream', [x, 1.28, 0.3], 0.03, 0.24, null, { segs: 10 }); k.ball('fire', [x, 1.42, 0.3], 0.02, [1, 2, 1]); }
    k.light([0, 1.5, 0], '#ff6a3a', 1.2, 5, false, true);
    k.collide([-1.1, 0, -0.7], [1.1, 1.16, 0.7]);
    return { name: 'Ancient altar', static: true, interact: { label: () => 'Make an offering', action: (e) => sound(e, 'magic') } };
  },
  obelisk(k, a, r) {
    const B = k.body('granite', '#5a5654');
    k.box(B, [0, 0.3, 0], [1.6, 0.6, 1.6]);
    k.lathe(B, [0, 0.6, 0], [[0.55, 0], [0.4, 6], [0, 6.8]], 4, [0, PI / 4, 0]);
    for (let i = 0; i < 6; i++) k.box('gold', [0, 1.2 + i * 0.8, 0.5 - i * 0.022], [0.3, 0.3, 0.01]);
    k.collide([-0.8, 0, -0.8], [0.8, 7.4, 0.8]);
    return { name: 'Obelisk', static: true };
  },
  idol(k, a, r) {
    const B = k.body('gold', '#e0b040');
    k.box('stone', [0, 0.4, 0], [0.5, 0.8, 0.5]);
    k.rbox(B, [0, 0.95, 0], [0.18, 0.3, 0.14], 0.05);
    k.ball(B, [0, 1.2, 0], 0.1, [1, 1.1, 0.9]);
    for (const s of [-1, 1]) { k.ball('#1ae860', [s * 0.035, 1.22, 0.085], 0.018); k.seg(B, [s * 0.1, 1.05, 0], [s * 0.1, 0.88, 0.08], 0.03); }
    k.cone(B, [0, 1.38, 0], 0.1, 0.14, null, 4);
    k.glow('#ffe080', [0, 1.1, 0], 0.8, 0.5);
    k.collide([-0.25, 0, -0.25], [0.25, 0.8, 0.25]);
    return { name: 'Golden idol', static: true, sparkle: '#ffe080', interact: { label: () => 'Take the idol...', action: (e) => { sound(e, 'roar'); if (G.ui) G.ui.toast('The ground rumbles. Maybe put it back?'); } } };
  },
  orb(k, a, r) {
    const col = k.color(r.pick(['#40c8ff', '#b060ff', '#ffd040', '#40ff90', '#ff4060']));
    const o = k.sub([0, 1.4, 0]);
    o.ball('e:' + col, [0, 0, 0], 0.25, null, 28);
    for (let i = 0; i < 3; i++) o.torus('gold', [0, 0, 0], 0.34 + i * 0.05, 0.008, [i * 0.9, i * 0.6, 0], TAU, 40);
    k.glow(col, [0, 1.4, 0], 2.2, 0.6);
    k.light([0, 1.4, 0], col, 2, 6, false);
    k.tick((dt, t) => { o.group.rotation.y += dt * 0.8; o.group.rotation.x = Math.sin(t) * 0.3; o.group.position.y = 1.4 + Math.sin(t * 1.5) * 0.1; });
    return { name: 'Glowing orb', static: true, interact: { label: () => 'Touch the orb', action: (e) => sound(e, 'magic') } };
  },
  runestone(k, a, r) {
    const B = k.body('stone', '#6a6a64');
    k.ext(B, [[-0.5, 0], [0.5, 0], [0.45, 1.6], [0.1, 2.1], [-0.35, 1.8]], 0.4, [0, 0, 0], null, 0.05);
    k.label('ᚠᚢᚦᚨᚱᚲ ᚷᚹᚺ', [0, 1.1, 0.26], 0.8, 0.9, null, { fg: '#40e8ff', glow: '#40e8ff', emissive: 1.8, font: 'serif' });
    k.collide([-0.5, 0, -0.2], [0.5, 2, 0.2]);
    return { name: 'Runestone', static: true };
  },
  magicCircle(k, a, r) {
    const col = k.color(r.pick(['#40e8ff', '#b060ff', '#ff4a3a']));
    const c = k.sub([0, 0.02, 0]);
    c.torus('e:' + col, [0, 0, 0], 2, 0.03, [HALF, 0, 0], TAU, 64);
    c.torus('e:' + col, [0, 0, 0], 1.6, 0.02, [HALF, 0, 0], TAU, 64);
    for (let i = 0; i < 6; i++) { const a1 = i / 6 * TAU, a2 = (i + 2) / 6 * TAU; c.seg('e:' + col, [Math.cos(a1) * 1.6, 0, Math.sin(a1) * 1.6], [Math.cos(a2) * 1.6, 0, Math.sin(a2) * 1.6], 0.015); }
    k.glow(col, [0, 0.3, 0], 5, 0.25);
    k.light([0, 0.5, 0], col, 1.5, 5, false);
    k.tick((dt) => { c.group.rotation.y += dt * 0.3; });
    return { name: 'Magic circle', static: true, noShadowGround: true };
  },
  grail(k, a, r) {
    const B = k.body('gold', '#e0b040');
    k.lathe(B, [0, 0, 0], [[0.07, 0], [0.06, 0.01], [0.015, 0.03], [0.012, 0.12], [0.02, 0.14], [0.06, 0.17], [0.075, 0.26], [0.07, 0.26], [0.05, 0.18], [0, 0.16]], 24);
    for (let i = 0; i < 6; i++) k.ball('#c62828', [Math.cos(i) * 0.07, 0.22, Math.sin(i) * 0.07], 0.008);
    k.glow('#ffe080', [0, 0.2, 0], 0.5, 0.6);
    return { name: 'Golden goblet', phys: { mass: 0.8 }, sparkle: '#ffe080' };
  },
  // ================= Weapons (props, non-functional) =================
  bow(k, a, r) {
    k.body('wood', '#6a3a1a');
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12 - 0.5; pts.push([0.0 + 0.16 * (1 - Math.pow(t * 2, 2)) * 0.8 + (Math.abs(t) > 0.42 ? -(Math.abs(t) - 0.42) * 0.8 : 0), 0.8 + t * 1.5, 0]); }
    k.tube('body', pts, 0.012, 30);
    k.seg('white', pts[0], pts[12], 0.002, 0.002, 4);
    k.seg('leather', [0.13, 0.7, 0], [0.13, 0.9, 0], 0.018);
    // Quiver with arrows.
    k.cyl('leather', [0.4, 0.3, -0.1], 0.06, 0.6, [0.2, 0, 0], { segs: 14 });
    for (let i = 0; i < 5; i++) { const x = 0.4 + (i - 2) * 0.02; k.seg('lightWood', [x, 0.2, -0.05], [x, 0.9, -0.2], 0.004); k.ext('f:#c62828', [[0, 0], [0.02, -0.05], [0, -0.07]], 0.002, [x, 0.88, -0.195], [0.2, 0, 0]); }
    return { name: 'Bow & arrows', phys: { mass: 1 } };
  },
  crossbow(k, a, r) {
    k.body('wood', '#5a3a22');
    k.box('body', [0, 0.05, 0], [0.05, 0.05, 0.7]);
    k.tube('steel', [[-0.3, 0.07, 0.28], [0, 0.07, 0.33], [0.3, 0.07, 0.28]], 0.012, 12);
    k.seg('white', [-0.3, 0.07, 0.28], [0, 0.07, 0.05], 0.002); k.seg('white', [0.3, 0.07, 0.28], [0, 0.07, 0.05], 0.002);
    k.seg('steel', [0, 0.085, 0.05], [0, 0.085, 0.4], 0.004);
    k.box('body', [0, 0.0, -0.3], [0.05, 0.08, 0.15]);
    return { name: 'Crossbow', phys: { mass: 3 } };
  },
  shield(k, a, r) {
    const round = r.chance(0.5);
    const B = k.body(round ? 'wood' : 'painted', r.pick(['#8a1a1a', '#1a3a8a', '#e8e8e6', '#2a5a2a']));
    const pivot = k.sub([0, 0.5, 0], [-0.25, 0, 0]);
    if (round) { pivot.cyl(B, [0, 0, 0], 0.4, 0.04, Z, { segs: 32 }); pivot.torus('iron', [0, 0, 0.02], 0.4, 0.02, null, TAU, 32); pivot.dome('iron', [0, 0, 0.02], 0.09, [HALF, 0, 0]); }
    else {
      const pts = [[-0.3, 0.35], [0.3, 0.35], [0.3, 0.0], [0.15, -0.3], [0, -0.42], [-0.15, -0.3], [-0.3, 0]];
      pivot.ext(B, pts, 0.04, [0, 0, 0], null, 0.01);
      pivot.box('gold', [0, 0.05, 0.028], [0.07, 0.6, 0.01]); pivot.box('gold', [0, 0.12, 0.028], [0.5, 0.07, 0.01]);
    }
    return { name: round ? 'Round shield' : 'Knight shield', phys: { mass: 4 } };
  },
  spear(k, a, r) {
    k.body('wood', '#6a4226');
    k.seg('body', [0, 0.02, -1.0], [0, 0.02, 1.0], 0.018);
    k.ext('steel', [[0, 0], [0.04, 0.08], [0, 0.3], [-0.04, 0.08]], 0.01, [0, 0.02, 1.0], [-HALF, 0, 0]);
    k.seg('leather', [0, 0.02, 0.0], [0, 0.02, 0.25], 0.022);
    return { name: 'Spear', phys: { mass: 2 } };
  },
  battleAxe(k, a, r) {
    k.body('wood', '#5a3a22');
    k.seg('body', [0, 0.02, -0.5], [0, 0.02, 0.5], 0.02);
    k.ext('steel', [[0, 0.02], [0.28, 0.2], [0.33, 0.0], [0.28, -0.2], [0, -0.04]], 0.02, [0, 0.03, 0.4], [HALF, 0, HALF]);
    k.ext('steel', [[0, 0.02], [-0.18, 0.1], [-0.2, 0], [-0.18, -0.1], [0, -0.04]], 0.02, [0, 0.03, 0.4], [HALF, 0, HALF]);
    return { name: 'Battle axe', phys: { mass: 3 } };
  },
  mace(k, a, r) {
    k.body('wood', '#4a2a16');
    k.seg('body', [0, 0.03, -0.35], [0, 0.03, 0.2], 0.018);
    k.ball('iron', [0, 0.06, 0.28], 0.08);
    for (let i = 0; i < 14; i++) { const p = new THREE.Vector3().randomDirection(); k.cone('steel', [p.x * 0.08, 0.06 + p.y * 0.08, 0.28 + p.z * 0.08], 0.018, 0.06, [Math.acos(p.y), 0, 0], 6); }
    return { name: 'Mace', phys: { mass: 3 } };
  },
  warHammer(k, a, r) {
    k.body('iron', '#6a6c70');
    k.seg('leather', [0, 0.05, -0.4], [0, 0.05, 0.3], 0.02);
    k.rbox('body', [0, 0.05, 0.35], [0.14, 0.14, 0.26], 0.02, [0, HALF, 0]);
    for (let i = 0; i < 3; i++) k.torus('gold', [0, 0.05, 0.25 + i * 0.1], 0.075, 0.008, null, TAU, 20);
    k.glow('#80c0ff', [0, 0.05, 0.35], 0.5, 0.4);
    return { name: 'War hammer', phys: { mass: 5 } };
  },
  dagger(k, a, r) {
    k.body('steel', '#c8ccd2');
    k.ext('body', [[-0.015, 0], [0.015, 0], [0.004, 0.2], [-0.004, 0.2]], 0.005, [0, 0.01, 0], [-HALF, 0, 0]);
    k.box('gold', [0, 0.01, 0], [0.08, 0.012, 0.015]);
    k.seg('leather', [0, 0.01, -0.01], [0, 0.01, -0.1], 0.01);
    k.ball('gold', [0, 0.01, -0.11], 0.014);
    return { name: 'Dagger', phys: { mass: 0.3 } };
  },
  pistol(k, a, r) {
    const sci = r.chance(0.3);
    const B = k.body('glossyPlastic', sci ? '#e8e8e6' : '#1a1a1c');
    k.rbox(B, [0, 0.07, 0], [0.03, 0.035, 0.2], 0.006);
    k.rbox(B, [0, 0.03, -0.07], [0.028, 0.09, 0.04], 0.008, [-0.3, 0, 0]);
    k.torus(B, [0, 0.04, -0.03], 0.02, 0.003, [0, HALF, 0], PI, 10);
    if (sci) { k.ball('cyanGlow', [0, 0.07, 0.11], 0.015); k.torus('cyanGlow', [0, 0.07, 0.04], 0.022, 0.004, null, TAU, 14); }
    return { name: sci ? 'Ray gun (toy)' : 'Toy pistol', phys: { mass: 0.8 }, interact: { label: () => 'Pew pew', action: (e) => sound(e, sci ? 'zap' : 'pop') } };
  },
  rifle(k, a, r) {
    const B = k.body('wood', '#6a4226');
    k.rbox(B, [0, 0.06, -0.3], [0.04, 0.12, 0.35], 0.01);
    k.box('dark', [0, 0.08, 0.05], [0.04, 0.06, 0.4]);
    k.seg('dark', [0, 0.09, 0.25], [0, 0.09, 0.75], 0.01);
    k.cyl('dark', [0, 0.135, 0.05], 0.018, 0.25, Z, { segs: 12 });
    k.box('dark', [0, 0.02, 0.1], [0.03, 0.08, 0.04], [0.3, 0, 0]);
    return { name: 'Rifle (prop)', phys: { mass: 3.5 } };
  },
  cannon(k, a, r) {
    k.body('iron', '#2a2a2c');
    const wood = 'wood';
    k.box(wood, [0, 0.35, -0.1], [0.5, 0.25, 1.1]);
    for (const s of [-1, 1]) { k.cyl(wood, [s * 0.35, 0.4, 0.2], 0.4, 0.08, X, { segs: 20 }); for (let i = 0; i < 4; i++) k.box(wood, [s * 0.35, 0.4, 0.2], [0.06, 0.78, 0.05], [i * PI / 4, 0, 0]); k.cyl('iron', [s * 0.35, 0.4, 0.2], 0.41, 0.03, X, { segs: 20, open: true }); k.cyl(wood, [s * 0.35, 0.3, -0.5], 0.28, 0.08, X, { segs: 16 }); }
    const barrel = k.sub([0, 0.62, 0.1], [-0.15, 0, 0]);
    barrel.lathe('body', [0, 0, -0.6], [[0.2, 0], [0.22, 0.1], [0.18, 0.4], [0.15, 1.3], [0.18, 1.35], [0.18, 1.4], [0.1, 1.4], [0.1, 0.3]], 24, [HALF, 0, 0]);
    barrel.ball('body', [0, 0, -0.63], 0.13);
    k.collide([-0.45, 0, -0.65], [0.45, 0.8, 0.7]);
    const smoke = [];
    return {
      name: 'Cannon', interact: { label: () => 'Fire the cannon!', action: (e) => { sound(e, 'firework'); sound(e, 'thunder'); barrel.group.position.z = -0.1; setTimeout(() => { barrel.group.position.z = 0.1; }, 300); void smoke; } },
    };
  },
  catapult(k, a, r) {
    k.body('wood', '#7a5030');
    k.box('body', [0, 0.25, 0], [1.2, 0.18, 2.2]);
    for (const s of [-1, 1]) { for (const z of [-0.8, 0.8]) k.cyl('darkWood', [s * 0.7, 0.3, z], 0.3, 0.1, X, { segs: 14 }); k.seg('body', [s * 0.5, 0.3, 0.2], [s * 0.4, 1.5, -0.1], 0.07); }
    k.seg('body', [-0.5, 1.4, -0.1], [0.5, 1.4, -0.1], 0.07);
    const arm = k.sub([0, 0.5, 0.6], [0.5, 0, 0]);
    arm.seg('body', [0, 0, 0], [0, 0, -2.2], 0.07);
    arm.dome('darkWood', [0, 0.05, -2.2], 0.25, [PI, 0, 0]);
    arm.ball('stone', [0, 0.18, -2.2], 0.17);
    k.collide([-0.6, 0, -1.1], [0.6, 0.35, 1.1]);
    let fire = 0;
    k.tick((dt) => { if (fire > 0) { fire -= dt; arm.group.rotation.x = 0.5 - Math.min(1, (1.2 - fire) * 4) * 1.8; } else arm.group.rotation.x += (0.5 - arm.group.rotation.x) * dt; });
    return { name: 'Catapult', interact: { label: () => 'Launch!', action: (e) => { fire = 1.2; sound(e, 'whoosh'); } } };
  },
  trebuchet(k, a, r) {
    k.body('wood', '#6a4226');
    k.box('body', [0, 0.15, 0], [2.4, 0.3, 4]);
    for (const s of [-1, 1]) { k.seg('body', [s * 0.8, 0.3, -1.2], [s * 0.5, 4, 0], 0.12); k.seg('body', [s * 0.8, 0.3, 1.2], [s * 0.5, 4, 0], 0.12); }
    k.seg('body', [-0.6, 4, 0], [0.6, 4, 0], 0.1);
    const arm = k.sub([0, 4, 0], [0.9, 0, 0]);
    arm.seg('body', [0, 0, 1.5], [0, 0, -5], 0.1, 0.06);
    arm.box('stone', [0, -0.6, 1.5], [0.9, 0.9, 0.9]);
    arm.seg('white', [0, 0, -5], [0, -1.2, -5.2], 0.01);
    k.collide([-1.2, 0, -2], [1.2, 0.3, 2]);
    return { name: 'Trebuchet', static: true };
  },
  bomb(k, a, r) {
    k.body('glossyPlastic', '#1a1a1c');
    k.ball('body', [0, 0.16, 0], 0.16);
    k.cyl('dark', [0, 0.33, 0], 0.05, 0.05, null, { segs: 14 });
    k.tube('#c8b890', [[0, 0.35, 0], [0.03, 0.42, 0], [0.07, 0.45, 0]], 0.006, 10);
    k.glow('#ffb040', [0.07, 0.46, 0], 0.2, 0.9);
    return { name: 'Cartoon bomb', phys: { mass: 4 }, interact: { label: () => 'Light the fuse (it is fake)', action: (e) => { sound(e, 'pop'); confetti(k, e); } } };
  },
  boomerang(k, a, r) {
    const B = k.body('wood', '#b0703a');
    k.ext(B, [[-0.25, 0.1], [-0.05, 0.12], [0.25, 0.1], [0.27, 0.05], [0, 0.05], [-0.25, 0.05]].map(([x, y]) => [x, y - 0.08]), 0.012, [0, 0.01, 0], [HALF, 0, 0]);
    return { name: 'Boomerang', phys: { mass: 0.3 } };
  },
  // ================= Containers & decor =================
  vase(k, a, r) {
    const B = k.body(r.pick(['glossyPlastic', 'marble']), r.pick(['#2a4a8a', '#e8e0d0', '#8a2a1a', '#2a6a5a']));
    const h = r.range(0.35, 0.6);
    k.lathe(B, [0, 0, 0], [[0.08, 0], [0.14, h * 0.25], [0.13, h * 0.55], [0.06, h * 0.85], [0.08, h]], 28);
    if (r.chance(0.6)) for (let i = 0; i < 5; i++) { const an = i / 5 * TAU; k.seg('#2a6a2a', [0, h * 0.8, 0], [Math.cos(an) * 0.12, h + 0.25, Math.sin(an) * 0.12], 0.004); k.ball(hsl(r.range(0, 1), 0.7, 0.6), [Math.cos(an) * 0.12, h + 0.27, Math.sin(an) * 0.12], 0.035, [1, 0.6, 1]); }
    return { name: 'Vase', phys: { mass: 2 } };
  },
  bottle(k, a, r) {
    const col = k.color(r.pick(['#2a6a3a', '#6a3a1a', '#3a5a8a']));
    k.lathe('g:' + col, [0, 0, 0], [[0.035, 0], [0.037, 0.18], [0.013, 0.24], [0.013, 0.3]], 20);
    k.m('bottleGlass', 'glass', { color: col, opacity: 0.6 });
    k.cyl('cream', [0, 0.1, 0], 0.038, 0.07, null, { segs: 18 });
    k.cyl('wood', [0, 0.305, 0], 0.012, 0.02, null, { segs: 10 });
    return { name: 'Bottle', phys: { mass: 0.6 } };
  },
  jar(k, a, r) {
    k.lathe('glass', [0, 0, 0], [[0.06, 0], [0.065, 0.14], [0.05, 0.16], [0.05, 0.18]], 20);
    const col = r.pick(['#ffb030', '#c62828', '#6a2a8a']);
    k.lathe('g:' + col, [0, 0.005, 0], [[0.058, 0], [0.062, 0.12], [0, 0.12]], 18);
    k.cyl('chrome', [0, 0.185, 0], 0.053, 0.02, null, { segs: 18 });
    return { name: col === '#ffb030' ? 'Jar of honey' : 'Jar of jam', phys: { mass: 0.5 } };
  },
  basket(k, a, r) {
    k.body('thatch', '#b8904a');
    k.lathe('body', [0, 0, 0], [[0.15, 0], [0.2, 0.2], [0.21, 0.22]], 24);
    k.torus('body', [0, 0.25, 0], 0.2, 0.012, [0, 0, 0], PI, 20);
    for (let i = 0; i < 5; i++) k.ball(r.pick(['#c62828', '#8ac83a', '#ffb030']), [r.range(-0.1, 0.1), 0.2, r.range(-0.1, 0.1)], 0.04);
    return { name: 'Basket', phys: { mass: 1 } };
  },
  suitcase(k, a, r) {
    const B = k.body(r.pick(['leather', 'glossyPlastic']), r.pick(['#5a3a22', '#1a1a1c', '#c62828', '#2a5a8a']));
    k.rbox(B, [0, 0.36, 0], [0.45, 0.62, 0.25], 0.04);
    k.rbox('black', [0, 0.72, 0], [0.14, 0.03, 0.04], 0.012);
    for (const x of [-0.18, 0.18]) k.cyl('black', [x, 0.03, -0.1], 0.03, 0.02, X, { segs: 12 });
    for (const x of [-0.12, 0.12]) k.box('chrome', [x, 0.36, 0.126], [0.03, 0.6, 0.004]);
    return { name: 'Suitcase', phys: { mass: 6 } };
  },
  backpack(k, a, r) {
    const B = k.body('fabric', r.pick(['#c62828', '#2a5ad8', '#2a2a2c', '#3a7a3a', '#ff8a1a']));
    k.rbox(B, [0, 0.25, 0], [0.32, 0.45, 0.16], 0.07);
    k.rbox(B, [0, 0.16, 0.09], [0.26, 0.18, 0.06], 0.03);
    k.box('black', [0, 0.36, 0.082], [0.26, 0.012, 0.004]);
    for (const x of [-0.08, 0.08]) k.tube('black', [[x, 0.45, -0.08], [x, 0.3, -0.12], [x, 0.08, -0.08]], 0.015, 10);
    return { name: 'Backpack', phys: { mass: 2 } };
  },
  bucket(k, a, r) {
    const B = k.body(r.pick(['metal', 'glossyPlastic']), r.pick(['#a8acb0', '#c62828', '#2a5ad8']));
    k.lathe(B, [0, 0, 0], [[0.12, 0], [0.15, 0.28], [0.155, 0.29]], 24);
    k.torus('chrome', [0, 0.29, 0], 0.15, 0.004, [0, HALF, 0], PI, 20);
    return { name: 'Bucket', phys: { mass: 1 } };
  },
  wateringCan(k, a, r) {
    const B = k.body('painted', r.pick(['#2a8a4a', '#8a8c90', '#c62828']));
    k.cyl(B, [0, 0.13, 0], 0.11, 0.24, null, { segs: 22 });
    k.seg(B, [0.08, 0.06, 0], [0.32, 0.3, 0], 0.02, 0.012);
    k.cyl(B, [0.33, 0.31, 0], 0.03, 0.02, X, { segs: 12 });
    k.torus(B, [-0.02, 0.26, 0], 0.09, 0.012, [0, 0, 0], PI, 16);
    return { name: 'Watering can', phys: { mass: 1 } };
  },
  cooler(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#2a6ad8', '#c62828', '#f0f0ee']));
    k.rbox(B, [0, 0.2, 0], [0.6, 0.35, 0.38], 0.03);
    k.rbox('white', [0, 0.39, 0], [0.62, 0.05, 0.4], 0.02);
    k.tube('white', [[-0.25, 0.3, 0], [-0.25, 0.46, 0], [0.25, 0.46, 0], [0.25, 0.3, 0]], 0.012, 12);
    return { name: 'Cooler', phys: { mass: 5 }, seats: [{ x: 0, y: 0.42, z: 0, yaw: 0 }] };
  },
  birdhouse(k, a, r) {
    const B = k.body('wood', r.pick(['#b07a4a', '#e8d8b0', '#6a9ac8']));
    k.seg('darkWood', [0, 0, 0], [0, 1.4, 0], 0.035);
    k.box(B, [0, 1.6, 0], [0.26, 0.3, 0.26]);
    k.ext('#8a2a1a', [[-0.18, 0], [0, 0.16], [0.18, 0]], 0.3, [0, 1.75, 0], null);
    k.cyl('black', [0, 1.63, 0.13], 0.04, 0.01, Z, { segs: 16 });
    k.seg('darkWood', [0, 1.55, 0.13], [0, 1.55, 0.2], 0.006);
    return { name: 'Birdhouse', static: true, interact: { label: () => 'Tweet tweet', action: (e) => sound(e, 'chirp') } };
  },
  doghouse(k, a, r) {
    const B = k.body('planks', r.pick(['#c62828', '#b07a4a', '#e8d8b0']));
    k.box(B, [0, 0.4, 0], [0.9, 0.8, 1.1]);
    k.ext('#3a3a3c', [[-0.6, 0], [0, 0.45], [0.6, 0]], 1.25, [0, 0.8, 0], null, 0.01);
    k.box('black', [0, 0.3, 0.551], [0.4, 0.5, 0.01]);
    k.label(k.a.name || r.pick(['REX', 'MAX', 'BUDDY', 'LUNA']), [0, 0.68, 0.556], 0.4, 0.1, null, { bg: '#f4f0e0', fg: '#3a2a1a' });
    k.collide([-0.45, 0, -0.55], [0.45, 1.2, 0.55]);
    return { name: 'Dog house', static: true };
  },
  bell(k, a, r) {
    const B = k.body('bronze', '#b08040');
    for (const s of [-1, 1]) k.box('darkWood', [s * 0.8, 1.2, 0], [0.15, 2.4, 0.15]);
    k.box('darkWood', [0, 2.35, 0], [1.9, 0.15, 0.2]);
    const b = k.sub([0, 2.25, 0]);
    b.lathe(B, [0, -0.9, 0], [[0.48, 0], [0.42, 0.1], [0.32, 0.4], [0.28, 0.75], [0.15, 0.88], [0, 0.9]], 32);
    b.ball('iron', [0, -0.8, 0], 0.07);
    let swing = 0;
    k.tick((dt, t) => { swing *= Math.pow(0.4, dt); b.group.rotation.x = Math.sin(t * 3) * swing; });
    k.collide([-0.9, 0, -0.1], [-0.7, 2.4, 0.1]); k.collide([0.7, 0, -0.1], [0.9, 2.4, 0.1]);
    return { name: 'Bronze bell', static: true, interact: { label: () => 'Ring the bell', action: (e) => { swing = 0.35; sound(e, 'bell', { freq: 220 }); } } };
  },
  gong(k, a, r) {
    k.body('bronze', '#c8a040');
    for (const s of [-1, 1]) k.box('darkWood', [s * 0.75, 0.95, 0], [0.1, 1.9, 0.1]);
    k.box('darkWood', [0, 1.9, 0], [1.7, 0.12, 0.12]);
    const g = k.sub([0, 1.8, 0]);
    g.cyl('body', [0, -0.65, 0], 0.55, 0.04, Z, { segs: 40 });
    g.torus('body', [0, -0.65, 0], 0.55, 0.03, null, TAU, 40);
    g.seg('dark', [-0.2, 0, 0], [-0.2, -0.15, 0], 0.005); g.seg('dark', [0.2, 0, 0], [0.2, -0.15, 0], 0.005);
    let swing = 0;
    k.tick((dt, t) => { swing *= Math.pow(0.5, dt); g.group.rotation.x = Math.sin(t * 4) * swing; });
    return { name: 'Gong', static: true, collideAuto: true, interact: { label: () => 'Strike the gong', action: (e) => { swing = 0.12; sound(e, 'gong'); } } };
  },
  sundial(k, a, r) {
    k.body('stone', '#9a948a');
    k.lathe('body', [0, 0, 0], [[0.3, 0], [0.18, 0.1], [0.12, 0.8], [0.35, 0.95], [0.35, 1.0]], 20);
    k.cyl('bronze', [0, 1.01, 0], 0.32, 0.02, null, { segs: 32 });
    k.ext('bronze', [[0, 0], [0.25, 0], [0, 0.2]], 0.01, [-0.12, 1.02, 0], [0, HALF, 0]);
    return { name: 'Sundial', static: true, collideAuto: true };
  },
  weatherVane(k, a, r) {
    k.body('iron', '#2a2a2c');
    k.seg('body', [0, 0, 0], [0, 2.5, 0], 0.02);
    for (const [d, l] of [[0, 'N'], [HALF, 'E'], [PI, 'S'], [-HALF, 'W']]) { k.seg('body', [0, 2.2, 0], [Math.sin(d) * 0.35, 2.2, Math.cos(d) * 0.35], 0.01); void l; }
    const v = k.sub([0, 2.45, 0]);
    v.ext('body', [[-0.4, 0], [0.25, 0], [0.25, 0.08], [0.4, 0], [0.25, -0.08], [0.25, 0]].map(([x, y]) => [x, y]), 0.01, [0, 0, 0], [0, HALF, 0]);
    v.ext('body', [[0, 0], [0.12, 0.1], [0.2, 0.05], [0.15, -0.05]], 0.012, [0, 0.05, -0.25], [0, HALF, 0]);
    k.tick((dt, t) => { v.group.rotation.y = Math.sin(t * 0.2) * 1.5 + Math.sin(t * 1.3) * 0.1; });
    return { name: 'Weather vane', static: true };
  },
  grandfatherClock(k, a, r) {
    const B = k.body('darkWood', '#4a2a16');
    k.box(B, [0, 0.2, 0], [0.55, 0.4, 0.35]);
    k.box(B, [0, 1.05, 0], [0.45, 1.3, 0.3]);
    k.box(B, [0, 1.95, 0], [0.55, 0.55, 0.36]);
    k.ext(B, [[-0.3, 0], [0.3, 0], [0.2, 0.15], [-0.2, 0.15]], 0.36, [0, 2.22, 0]);
    k.box('glass', [0, 1.05, 0.152], [0.3, 1.0, 0.01]);
    k.cyl('cream', [0, 1.95, 0.18], 0.2, 0.01, Z, { segs: 36 });
    k.torus('gold', [0, 1.95, 0.185], 0.2, 0.012, null, TAU, 36);
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; k.box('black', [Math.sin(an) * 0.17, 1.95 + Math.cos(an) * 0.17, 0.19], [0.012, 0.03, 0.004], [0, 0, -an]); }
    const hands = k.sub([0, 1.95, 0.195]);
    const hh = hands.sub([0, 0, 0]); hh.box('black', [0, 0.05, 0], [0.012, 0.1, 0.004]);
    const mh = hands.sub([0, 0, 0.003]); mh.box('black', [0, 0.075, 0], [0.008, 0.15, 0.004]);
    const pend = k.sub([0, 1.5, 0.08]);
    pend.seg('gold', [0, 0, 0], [0, -0.7, 0], 0.005);
    pend.cyl('gold', [0, -0.72, 0], 0.07, 0.01, Z, { segs: 24 });
    k.tick((dt, t) => { const d = new Date(); mh.group.rotation.z = -d.getMinutes() / 60 * TAU; hh.group.rotation.z = -((d.getHours() % 12) + d.getMinutes() / 60) / 12 * TAU; pend.group.rotation.z = Math.sin(t * PI) * 0.2; });
    k.collide([-0.28, 0, -0.18], [0.28, 2.4, 0.18]);
    return { name: 'Grandfather clock', interact: { label: () => 'Chime', action: (e) => [0, 2, 1, 4].forEach((n, i) => setTimeout(() => sound(e, 'note', { freq: [330, 392, 294, 262, 196][n], timbre: 'bell' }), i * 600)) } };
  },
  // ================= Workshop tools =================
  ladder(k, a, r) {
    const B = k.body(r.pick(['wood', 'metal']), '#b08a5a');
    for (const x of [-0.22, 0.22]) k.box(B, [x, 1.5, 0], [0.05, 3.0, 0.07], [-0.15, 0, 0]);
    for (let i = 0; i < 10; i++) { const y = 0.25 + i * 0.28; k.seg(B, [-0.22, y, -Math.sin(0.15) * y + 0.0], [0.22, y, -Math.sin(0.15) * y], 0.018); }
    return { name: 'Ladder', static: true, collideAuto: true };
  },
  wheelbarrow(k, a, r) {
    const B = k.body('painted', r.pick(['#c62828', '#2a8a4a', '#2a5ad8']));
    k.ext(B, [[-0.35, 0], [0.35, 0], [0.45, 0.3], [-0.45, 0.3]], 0.9, [0, 0.35, 0], [0, 0, 0]);
    k.cyl('tire', [0, 0.18, 0.6], 0.18, 0.08, X, { segs: 18 });
    for (const s of [-1, 1]) { k.seg('metal', [s * 0.2, 0.3, 0.55], [s * 0.25, 0.55, -0.9], 0.018); k.seg('metal', [s * 0.25, 0.35, -0.3], [s * 0.25, 0, -0.35], 0.015); k.cyl('black', [s * 0.25, 0.55, -0.95], 0.02, 0.12, Z, { segs: 8 }); }
    return { name: 'Wheelbarrow', phys: { mass: 15 } };
  },
  anvil(k, a, r) {
    k.body('iron', '#3a3a3c');
    k.box('wood', [0, 0.25, 0], [0.45, 0.5, 0.45]);
    k.ext('body', [[-0.3, 0], [0.3, 0], [0.18, 0.08], [0.18, 0.16], [0.35, 0.2], [0.55, 0.22], [0.35, 0.26], [-0.3, 0.26], [-0.18, 0.16], [-0.18, 0.08]], 0.18, [0, 0.5, 0], [0, HALF, 0]);
    return { name: 'Anvil', static: true, collideAuto: true, interact: { label: () => 'Hammer the anvil', action: (e) => sound(e, 'bell', { freq: 880 }) } };
  },
  workbench(k, a, r) {
    k.body('wood', '#a87a4a');
    k.box('body', [0, 0.88, 0], [1.8, 0.07, 0.8]);
    for (const x of [-0.8, 0.8]) for (const z of [-0.32, 0.32]) k.box('body', [x, 0.43, z], [0.08, 0.86, 0.08]);
    k.box('body', [0, 0.25, 0], [1.6, 0.03, 0.7]);
    k.box('#8a8c90', [0, 1.5, -0.38], [1.8, 1.1, 0.03]);
    for (let i = 0; i < 6; i++) k.seg('chrome', [-0.7 + i * 0.28, 1.7, -0.36], [-0.7 + i * 0.28, 1.4, -0.33], 0.01);
    k.rbox('#c62828', [0.5, 0.97, 0.1], [0.4, 0.12, 0.2], 0.01);
    k.box('iron', [-0.7, 0.98, 0.3], [0.15, 0.1, 0.12]);
    k.collide([-0.9, 0, -0.4], [0.9, 0.92, 0.4]);
    return { name: 'Workbench' };
  },
  toolbox(k, a, r) {
    const B = k.body('painted', r.pick(['#c62828', '#2a2a2c', '#2a5ad8']));
    k.rbox(B, [0, 0.12, 0], [0.5, 0.22, 0.24], 0.015);
    k.tube('black', [[-0.12, 0.24, 0], [-0.12, 0.3, 0], [0.12, 0.3, 0], [0.12, 0.24, 0]], 0.012, 12);
    k.box('chrome', [0, 0.2, 0.121], [0.06, 0.03, 0.004]);
    return { name: 'Toolbox', phys: { mass: 8 } };
  },
  shovel(k, a, r) {
    k.body('wood', '#8a5a36');
    k.seg('body', [0, 0.25, 0], [0, 1.25, 0], 0.017);
    k.tube('black', [[-0.07, 1.28, 0], [0, 1.33, 0], [0.07, 1.28, 0]], 0.012, 8);
    k.ext('steel', [[-0.12, 0.25], [0.12, 0.25], [0.12, 0.05], [0, -0.02], [-0.12, 0.05]], 0.01, [0, 0, 0]);
    return { name: 'Shovel', phys: { mass: 2 } };
  },
  pickaxe(k, a, r) {
    k.body('wood', '#8a5a36');
    k.seg('body', [0, 0.02, -0.4], [0, 0.02, 0.35], 0.02);
    k.tube('iron', [[-0.35, 0.0, 0.3], [0, 0.03, 0.4], [0.35, 0.0, 0.3]], 0.02, 12);
    return { name: 'Pickaxe', phys: { mass: 3 } };
  },
  hammer(k, a, r) {
    k.body('wood', '#a0703a');
    k.seg('body', [0, 0.015, -0.18], [0, 0.015, 0.12], 0.013);
    k.rbox('steel', [0, 0.02, 0.14], [0.12, 0.03, 0.03], 0.006, [0, HALF, 0]);
    k.ext('steel', [[0, 0], [0.06, 0.015], [0.08, -0.01], [0, 0.015]], 0.02, [-0.06, 0.02, 0.14], [0, 0, 0]);
    return { name: 'Hammer', phys: { mass: 0.7 } };
  },
  wrench(k, a, r) {
    k.body('chrome', '#c8ccd2');
    k.box('body', [0, 0.008, 0], [0.03, 0.012, 0.25]);
    for (const s of [-1, 1]) { k.cyl('body', [0, 0.008, s * 0.13], 0.03, 0.012, null, { segs: 16 }); k.box('black', [0, 0.012, s * 0.15], [0.02, 0.012, 0.03]); }
    return { name: 'Wrench', phys: { mass: 0.5 } };
  },
  saw(k, a, r) {
    k.body('steel', '#c8ccd2');
    k.ext('body', [[0, 0], [0.5, 0.02], [0.5, 0.1], [0, 0.14]], 0.002, [0, 0.01, 0], [HALF, 0, 0]);
    k.rbox('#c62828', [-0.06, 0.01, -0.07], [0.12, 0.03, 0.14], 0.02, [0, 0, 0]);
    return { name: 'Hand saw', phys: { mass: 0.6 } };
  },
  chainsaw(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#ff7a10', '#e8c81a', '#c62828']));
    k.rbox(B, [0, 0.12, -0.15], [0.16, 0.2, 0.35], 0.04);
    k.tube('black', [[-0.0, 0.22, -0.3], [0, 0.3, -0.2], [0, 0.26, -0.02]], 0.014, 12);
    k.rbox('steel', [0, 0.1, 0.25], [0.015, 0.08, 0.5], 0.03);
    for (let i = 0; i < 18; i++) k.box('dark', [0, 0.1 + (i < 9 ? 0.045 : -0.045), 0.03 + (i % 9) * 0.05], [0.02, 0.012, 0.025]);
    return { name: 'Chainsaw (off)', phys: { mass: 5 }, interact: { label: () => 'Rev it', action: (e) => sound(e, 'whirr') } };
  },
  drill(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#e8c81a', '#2a8ad8', '#c62828']));
    k.rbox(B, [0, 0.2, -0.02], [0.06, 0.08, 0.2], 0.02);
    k.rbox(B, [0, 0.1, -0.08], [0.05, 0.16, 0.06], 0.015, [-0.2, 0, 0]);
    k.rbox('black', [0, 0.02, -0.08], [0.08, 0.05, 0.1], 0.01);
    k.cyl('black', [0, 0.2, 0.1], 0.022, 0.05, Z, { segs: 12 });
    k.seg('chrome', [0, 0.2, 0.12], [0, 0.2, 0.22], 0.005, 0.002, 6);
    return { name: 'Power drill', phys: { mass: 1.5 }, interact: { label: () => 'Brrrr', action: (e) => sound(e, 'whirr') } };
  },
  lawnMower(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#2a8a3a', '#c62828', '#e8a81a']));
    k.rbox(B, [0, 0.18, 0], [0.5, 0.2, 0.6], 0.06);
    k.cyl('dark', [0, 0.32, -0.05], 0.1, 0.12, null, { segs: 16 });
    for (const x of [-0.25, 0.25]) for (const z of [-0.24, 0.24]) k.cyl('tire', [x, 0.09, z], 0.09, 0.05, X, { segs: 16 });
    for (const s of [-1, 1]) k.seg('chrome', [s * 0.18, 0.25, -0.28], [s * 0.2, 0.95, -0.75], 0.012);
    k.seg('black', [-0.2, 0.95, -0.75], [0.2, 0.95, -0.75], 0.016);
    return { name: 'Lawn mower', phys: { mass: 25 }, interact: { label: () => 'Start the engine', action: (e) => sound(e, 'whirr') } };
  },
};

// Chess man by lathe profile (unit height ~0.1 m at s = 1 means 0.1*... scaled to 1.0 m for the single piece).
function chessMan(k, key, kind, s) {
  const P = {
    pawn: [[0.2, 0], [0.2, 0.05], [0.12, 0.1], [0.08, 0.35], [0.14, 0.4], [0.07, 0.43], [0.11, 0.52], [0.12, 0.58], [0.08, 0.66], [0, 0.68]],
    rook: [[0.22, 0], [0.22, 0.06], [0.14, 0.12], [0.12, 0.55], [0.17, 0.6], [0.17, 0.75], [0, 0.75]],
    bishop: [[0.22, 0], [0.22, 0.06], [0.13, 0.12], [0.08, 0.5], [0.15, 0.55], [0.08, 0.6], [0.12, 0.72], [0.1, 0.84], [0.04, 0.9], [0.03, 0.95], [0, 0.96]],
    queen: [[0.23, 0], [0.23, 0.06], [0.14, 0.12], [0.08, 0.6], [0.16, 0.66], [0.09, 0.7], [0.15, 0.95], [0.1, 0.97], [0.05, 1.02], [0, 1.03]],
    king: [[0.24, 0], [0.24, 0.06], [0.15, 0.12], [0.09, 0.65], [0.17, 0.7], [0.1, 0.74], [0.15, 0.98], [0.06, 1.02], [0, 1.03]],
    knight: [[0.22, 0], [0.22, 0.06], [0.14, 0.12], [0.13, 0.3], [0, 0.3]],
  }[kind] || [[0.2, 0], [0, 0.6]];
  const sc = s * 0.8;
  k.lathe(key, [0, 0, 0], P.map(([r0, y]) => [r0 * sc, y * sc]), s < 0.5 ? 12 : 24);
  if (kind === 'rook') for (let i = 0; i < 4; i++) k.box(key, [0, 0.77 * sc, 0], [0.34 * sc, 0.06 * sc, 0.06 * sc], [0, i * PI / 4 + PI / 8, 0]);
  if (kind === 'king') { k.box(key, [0, 1.15 * sc, 0], [0.05 * sc, 0.25 * sc, 0.05 * sc]); k.box(key, [0, 1.17 * sc, 0], [0.16 * sc, 0.05 * sc, 0.05 * sc]); }
  if (kind === 'queen') for (let i = 0; i < 8; i++) k.ball(key, [Math.cos(i * TAU / 8) * 0.13 * sc, 0.97 * sc, Math.sin(i * TAU / 8) * 0.13 * sc], 0.025 * sc);
  if (kind === 'knight') {
    k.ext(key, [[-0.12, 0], [0.13, 0], [0.12, 0.25], [0.22, 0.42], [0.16, 0.52], [0.02, 0.6], [-0.06, 0.72], [-0.14, 0.55], [-0.15, 0.3]].map(([x, y]) => [x * sc, y * sc]), 0.14 * sc, [0, 0.28 * sc, 0], [0, HALF, 0], 0.02 * sc);
  }
}

function SCREENS_WAVE(g, w, h, t) {
  g.fillStyle = '#04100a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3aff9a'; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x <= w; x += 4) { const y = h / 2 + Math.sin(x * 0.08 + t * 6) * h * 0.3; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
}
