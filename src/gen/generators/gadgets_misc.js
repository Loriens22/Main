// ---------------------------------------------------------------------------
// Gadget recipes, part 5: everything else people ask for.
//
// Historical props (guillotine, gallows, stocks), weather you can build (a
// tornado that wanders and lifts you), sports grounds (tennis/basketball
// courts, football pitch, race track, golf hole), a procedurally carved
// hedge maze, space objects (planets, moons, stars, meteors, atoms, DNA),
// casino and party gear, pets' furniture, and odds and ends such as a
// wheelchair, a shopping cart, a scarecrow or a sword in the stone.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { attachFire } from './furniture.js';
import { hsl, glowTexture } from './common.js';
import { playTune, playBeat } from './gadgets_home.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
function sound(e, name, opts) { if (G.audio) G.audio.play(name, e.root.position, opts); }
const has = (a, re) => re.test(a.text || '');

// Lumpy rock mesh (meteors, asteroids, nuggets, the stone for a sword).
function rockGeo(r, rng, detail = 2, rough = 0.25) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position, v = new THREE.Vector3();
  const bumps = Array.from({ length: 7 }, () => [new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(), rng.range(-1, 1)]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = 1;
    for (const [dir, s] of bumps) d += s * rough * Math.pow(Math.max(0, v.dot(dir)), 3);
    d += (Math.sin(v.x * 9 + v.y * 5) * Math.cos(v.z * 7) * 0.5) * rough * 0.3;
    p.setXYZ(i, v.x * r * d, v.y * r * d, v.z * r * d);
  }
  g.computeVertexNormals();
  return g;
}
function rockMesh(r, rng, mat, rough) { const m = new THREE.Mesh(rockGeo(r, rng, 3, rough), mat); m.castShadow = m.receiveShadow = true; return m; }

// Canvas texture for planets (banded gas giant or rocky / earth-like).
function planetTexture(kind, rng, col) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  const base = new THREE.Color(col);
  if (kind === 'earth') {
    g.fillStyle = '#1a4a9a'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 14; i++) { g.fillStyle = rng.pick(['#3a7a2a', '#5a8a3a', '#a89060', '#4a6a2a']); g.beginPath(); g.ellipse(rng.range(0, 512), rng.range(50, 206), rng.range(20, 70), rng.range(14, 40), rng.range(0, 3), 0, TAU); g.fill(); }
    g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 512, 18); g.fillRect(0, 238, 512, 18);
    g.globalAlpha = 0.5; for (let i = 0; i < 30; i++) { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(rng.range(0, 512), rng.range(20, 236), rng.range(10, 50), rng.range(3, 8), 0, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  } else if (kind === 'rocky') {
    g.fillStyle = base.getStyle(); g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 60; i++) { const c = base.clone().multiplyScalar(rng.range(0.6, 1.2)); g.fillStyle = c.getStyle(); g.beginPath(); g.arc(rng.range(0, 512), rng.range(0, 256), rng.range(3, 20), 0, TAU); g.fill(); }
  } else {
    for (let y = 0; y < 256; y += 4) { const c = base.clone().offsetHSL(Math.sin(y * 0.09) * 0.03, 0, Math.sin(y * 0.05 + rng.next() * 2) * 0.12); g.fillStyle = c.getStyle(); g.fillRect(0, y, 512, 4); }
    g.fillStyle = base.clone().offsetHSL(0.02, 0.1, -0.15).getStyle(); g.beginPath(); g.ellipse(340, 160, 34, 16, 0, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Recursive-backtracker maze on an n x n grid: returns wall sets.
function carveMaze(n, rng) {
  const H = Array.from({ length: n + 1 }, () => Array(n).fill(true)); // H[y][x]: wall on the north edge of row y
  const V = Array.from({ length: n }, () => Array(n + 1).fill(true)); // V[y][x]: wall on the west edge of column x
  const seen = Array.from({ length: n }, () => Array(n).fill(false));
  const stack = [[0, 0]]; seen[0][0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !seen[b][a]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[Math.floor(rng.next() * nb.length)];
    if (nx !== x) V[y][Math.max(x, nx)] = false; else H[Math.max(y, ny)][x] = false;
    seen[ny][nx] = true; stack.push([nx, ny]);
  }
  return { H, V };
}

export const MISC = {
  // ================= Historical =================
  guillotine(k, a, r) {
    k.box('w:#6a4a2a', [0, 0.25, 0], [1.8, 0.5, 1.4]);
    for (let i = 0; i < 3; i++) k.box('w:#6a4a2a', [0, 0.08 + i * 0.16, 0.8 + (2 - i) * 0.25], [0.8, 0.16, 0.25]);
    for (const s of [-1, 1]) { k.box('w:#5a3a1a', [s * 0.3, 2.1, -0.2], [0.14, 3.2, 0.14]); k.box('w:#5a3a1a', [s * 0.3, 0.9, -0.55], [0.1, 1.2, 0.1], [0.5, 0, 0]); }
    k.box('w:#5a3a1a', [0, 3.72, -0.2], [0.9, 0.16, 0.2]);
    k.box('w:#5a3a1a', [0, 0.72, -0.2], [0.5, 0.44, 0.12]);
    k.torus('p:#1a1410', [0, 0.84, -0.13], 0.08, 0.012, null, PI, 16);
    k.box('w:#7a5a3a', [0, 0.62, 0.35], [0.4, 0.1, 1.1]);
    const blade = k.sub([0, 3.3, -0.2]);
    blade.ext('steel', [[-0.23, 0], [0.23, 0.14], [0.23, 0.36], [-0.23, 0.36]], 0.02, [0, -0.2, 0], null);
    blade.box('iron', [0, 0.2, 0], [0.5, 0.1, 0.06]);
    k.tube('p:#b8a070', [[0.23, 3.5, -0.2], [0.35, 3.6, -0.2], [0.4, 1.2, -0.25]], 0.012, 12);
    k.cyl('w:#8a6a3a', [0, 0.65, 0.95], 0.2, 0.25, null, { rTop: 0.24, segs: 14, open: true });
    let drop = 0;
    k.tick((dt) => {
      if (drop > 0) { drop += dt; const t = drop; blade.group.position.y = t < 0.35 ? 3.3 - (t / 0.35) ** 2 * 2.3 : t < 2 ? 1.0 : Math.min(3.3, 1.0 + (t - 2) * 1.2); if (t > 4) drop = 0; }
    });
    return { name: 'Guillotine', static: true, interact: { label: () => 'Release the blade', action: (e) => { if (!drop) { drop = 0.001; sound(e, 'whoosh'); setTimeout(() => sound(e, 'creak'), 400); } } } };
  },
  gallows(k) {
    k.box('w:#6a4a2a', [0, 1.1, 0], [2.4, 0.12, 2.4]);
    for (const x of [-1.1, 1.1]) for (const z of [-1.1, 1.1]) k.box('w:#5a3a1a', [x, 0.55, z], [0.14, 1.1, 0.14]);
    for (let i = 0; i < 6; i++) k.box('w:#7a5a3a', [1.6 + i * 0.001, 0.1 + i * 0.18, 1.6 - i * 0.2], [0.8, 0.05, 0.28]);
    k.box('w:#5a3a1a', [-0.9, 2.9, -0.9], [0.18, 3.6, 0.18]);
    k.box('w:#5a3a1a', [-0.25, 4.6, -0.9], [1.5, 0.16, 0.16]);
    k.seg('w:#5a3a1a', [-0.9, 3.9, -0.9], [-0.4, 4.55, -0.9], 0.06, 0.06, 6);
    k.box('w:#4a3020', [0.3, 1.17, -0.3], [0.9, 0.03, 0.9]);
    k.seg('p:#b8a070', [0.3, 4.55, -0.9], [0.3, 3.3, -0.9], 0.015, 0.015, 6);
    k.torus('p:#b8a070', [0.3, 3.15, -0.9], 0.13, 0.018, [0, 0, 0], TAU, 16);
    k.collide([-1.2, 0, -1.2], [1.2, 1.16, 1.2]);
    return { name: 'Gallows', static: true };
  },
  stocks(k, a) {
    const pillory = has(a, /pillory/);
    if (pillory) {
      k.box('w:#5a3a1a', [0, 1.0, 0], [0.16, 2.0, 0.16]);
      k.box('w:#6a4a2a', [0, 1.5, 0.1], [1.0, 0.28, 0.08]);
      for (const x of [-0.32, 0, 0.32]) k.cyl('p:#1a1410', [x, 1.5, 0.15], x ? 0.045 : 0.09, 0.02, [HALF, 0, 0], { segs: 16 });
      k.box('w:#6a4a2a', [0, 0.05, 0.3], [1.2, 0.1, 1.2]);
    } else {
      for (const s of [-1, 1]) k.box('w:#5a3a1a', [s * 0.8, 0.45, 0], [0.12, 0.9, 0.14]);
      k.box('w:#6a4a2a', [0, 0.5, 0], [1.7, 0.3, 0.08]);
      for (const x of [-0.5, -0.2, 0.2, 0.5]) k.cyl('p:#1a1410', [x, 0.5, 0.04], 0.05, 0.02, [HALF, 0, 0], { segs: 14 });
      k.box('w:#7a5a3a', [0, 0.25, -0.5], [1.6, 0.06, 0.3]);
    }
    return { name: pillory ? 'Pillory' : 'Stocks', static: true };
  },

  // ================= Weather =================
  tornado(k, a, r) {
    const t = a.text || '';
    const kind = /fire ?nado|fire tornado|fire whirl/.test(t) ? 'fire' : /water ?spout/.test(t) ? 'water' : /dust ?devil|sand/.test(t) ? 'dust' : 'storm';
    const big = /hurricane|cyclone|typhoon|huge|giant|massive/.test(t);
    const H = big ? 40 : kind === 'dust' ? 10 : 22, R = big ? 12 : kind === 'dust' ? 3 : 7;
    const col = kind === 'fire' ? '#ff8a2a' : kind === 'water' ? '#a8c8e0' : kind === 'dust' ? '#c8a878' : k.color('#8a8c90');
    // Streaky texture so the spin is visible.
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const g2 = cv.getContext('2d');
    for (let i = 0; i < 90; i++) { g2.fillStyle = `rgba(255,255,255,${r.range(0.05, 0.5)})`; g2.fillRect(r.range(0, 256), 0, r.range(2, 12), 64); }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 1);
    const prof = []; for (let i = 0; i <= 16; i++) { const y = (i / 16) * H; prof.push(new THREE.Vector2(R * 0.07 + R * Math.pow(y / H, 1.8), y)); }
    const shells = [];
    for (let j = 0; j < 3; j++) {
      const mat = new THREE.MeshStandardMaterial({ color: col, alphaMap: tex, transparent: true, opacity: 0.55 - j * 0.12, depthWrite: false, side: THREE.DoubleSide, roughness: 1, emissive: kind === 'fire' ? new THREE.Color(col) : new THREE.Color(0), emissiveIntensity: kind === 'fire' ? 1.5 : 0 });
      const m = new THREE.Mesh(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x * (1 + j * 0.18), p.y)), 32, 1), mat);
      m.castShadow = false;
      k.add(m);
      shells.push(m);
    }
    // Swirling particles and debris.
    const N = big ? 2400 : 1400;
    const pg = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), P = [];
    for (let i = 0; i < N; i++) P.push([r.next(), r.range(0, TAU), r.range(0.8, 1.3)]);
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: col, size: big ? 0.35 : 0.2, transparent: true, opacity: 0.6, depthWrite: false, map: glowTexture(), blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending }));
    pts.frustumCulled = false; pts.userData.noRaycast = true;
    k.group.add(pts);
    const debris = k.sub([0, 0, 0]);
    const D = [];
    for (let i = 0; i < 24; i++) { const s = r.range(0.1, 0.5) * (big ? 2 : 1); const h = r.next(); debris.box(r.pick(['w:#6a4a2a', 'p:#5a4a3a', 'w:#8a6a3a', 'p:#3a5a2a']), [R * (0.2 + h), H * h, 0], [s, s * 0.3, s * 0.6], [r.next(), r.next(), 0]); D.push(h); }
    k.torus('p:' + col, [0, 0.3, 0], R * 0.4, R * 0.15, [HALF, 0, 0], TAU, 24);
    if (kind === 'fire') { k.light([0, H * 0.3, 0], '#ff7a2a', 4, 30, false, true); }
    let time = 0;
    const wp = new THREE.Vector3();
    k.tick((dt) => {
      time += dt;
      shells.forEach((m, j) => { m.rotation.y += dt * (2.2 - j * 0.5); m.material.alphaMap.offset.y -= dt * 0.3; });
      for (let i = 0; i < N; i++) {
        const p = P[i];
        p[0] += dt * 0.08 * p[2]; if (p[0] > 1) p[0] -= 1;
        const y = p[0] * H, rad = (R * 0.07 + R * Math.pow(p[0], 1.8)) * p[2];
        p[1] += dt * (3 / Math.max(0.6, rad * 0.4));
        pos[i * 3] = Math.cos(p[1]) * rad; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(p[1]) * rad;
      }
      pg.attributes.position.needsUpdate = true;
      debris.group.rotation.y += dt * 1.4;
      // Wander slowly and pull the player in.
      k.group.position.set(Math.sin(time * 0.05) * R * 2, 0, Math.sin(time * 0.037) * R * 1.4);
      const pl = G.player;
      if (pl && pl.velocity) {
        k.group.getWorldPosition(wp);
        const sc = k.group.parent ? k.group.parent.scale.x : 1;
        const dx = pl.position.x - wp.x, dz = pl.position.z - wp.z, d = Math.hypot(dx, dz);
        if (d < R * 0.9 * sc && pl.position.y < wp.y + H * sc) {
          pl.velocity.y = Math.max(pl.velocity.y, 7);
          pl.velocity.x += (-dz / (d + 0.1)) * 14 * dt; pl.velocity.z += (dx / (d + 0.1)) * 14 * dt;
        }
      }
    });
    const NAME = { fire: 'Fire tornado', water: 'Waterspout', dust: 'Dust devil', storm: big ? 'Hurricane' : 'Tornado' };
    return { name: NAME[kind], static: true, noCollide: true };
  },

  // ================= Sports grounds =================
  court(k, a) {
    const t = a.text || '';
    const kind = /basket/.test(t) ? 'basketball' : /soccer|football|pitch/.test(t) ? 'soccer' : /volley/.test(t) ? 'volleyball' : 'tennis';
    const line = (x0, z0, x1, z1, w = 0.08) => k.box('white', [(x0 + x1) / 2, 0.052, (z0 + z1) / 2], [Math.abs(x1 - x0) || w, 0.004, Math.abs(z1 - z0) || w]);
    if (kind === 'tennis') {
      k.box('p:#3a8a4a', [0, 0.02, 0], [18, 0.04, 36]);
      k.box('p:' + k.color('#2a6aa8'), [0, 0.045, 0], [10.97, 0.01, 23.77]);
      for (const x of [-5.485, -4.115, 4.115, 5.485]) line(x, -11.885, x, 11.885);
      for (const z of [-11.885, 11.885]) line(-5.485, z, 5.485, z);
      for (const z of [-6.4, 6.4]) line(-4.115, z, 4.115, z);
      line(0, -6.4, 0, 6.4);
      for (const s of [-1, 1]) k.cyl('m:#2a3a2a', [s * 6.4, 0.53, 0], 0.04, 1.07, null, { segs: 8 });
      k.box('p:#1a1a1a', [0, 0.52, 0], [12.8, 0.9, 0.02]);
      k.box('white', [0, 0.95, 0], [12.8, 0.07, 0.03]);
      k.collide([-6.4, 0, -0.05], [6.4, 1.0, 0.05]);
    } else if (kind === 'basketball' || kind === 'volleyball') {
      k.box('lightWood', [0, 0.02, 0], [17, 0.04, 30]);
      for (const x of [-7.5, 7.5]) line(x, -14, x, 14);
      for (const z of [-14, 0, 14]) line(-7.5, z, 7.5, z);
      k.torus('white', [0, 0.052, 0], 1.8, 0.04, [HALF, 0, 0], TAU, 40);
      if (kind === 'basketball') {
        for (const s of [-1, 1]) {
          k.torus('white', [0, 0.052, s * 12.6], 6.75, 0.04, [HALF, 0, 0], PI, 40);
          k.box('p:#c8702a', [0, 0.047, s * 11.1], [4.9, 0.006, 5.8]);
          k.cyl('m:#2a2a30', [0, 1.8, s * 14.6], 0.09, 3.6, null, { segs: 10 });
          k.box('m:#2a2a30', [0, 3.3, s * 14.1], [0.12, 0.12, 1.0]);
          k.box('glass', [0, 3.35, s * 13.6], [1.8, 1.05, 0.04]);
          k.box('white', [0, 3.2, s * 13.57], [0.6, 0.45, 0.01]);
          k.torus('m:#e05a1a', [0, 3.05, s * 13.3], 0.23, 0.012, [HALF, 0, 0], TAU, 24);
          k.collideCyl(0, s * 14.6, 0, 3.6, 0.12);
        }
      } else {
        for (const s of [-1, 1]) k.cyl('m:#2a2a30', [s * 8, 1.2, 0], 0.05, 2.4, null, { segs: 8 });
        k.box('p:#1a1a1a', [0, 2.0, 0], [16, 0.9, 0.02]);
      }
    } else {
      k.box('lawn', [0, 0.02, 0], [68, 0.04, 105]);
      for (let i = 0; i < 10; i++) k.box('p:#4a9a3a', [0, 0.041, -47.25 + i * 10.5], [68, 0.002, 5.25]);
      for (const x of [-34, 34]) line(x, -52.5, x, 52.5, 0.12);
      for (const z of [-52.5, 0, 52.5]) line(-34, z, 34, z, 0.12);
      k.torus('white', [0, 0.052, 0], 9.15, 0.06, [HALF, 0, 0], TAU, 48);
      for (const s of [-1, 1]) {
        line(-20.15, s * 36, 20.15, s * 36, 0.12); for (const x of [-20.15, 20.15]) line(x, s * 36, x, s * 52.5, 0.12);
        for (const x of [-3.66, 3.66]) { k.cyl('white', [x, 1.22, s * 52.5], 0.06, 2.44, null, { segs: 10 }); k.collideCyl(x, s * 52.5, 0, 2.44, 0.08); }
        k.seg('white', [-3.66, 2.44, s * 52.5], [3.66, 2.44, s * 52.5], 0.06, 0.06, 10);
        k.box('glass', [0, 1.22, s * 53.5], [7.3, 2.4, 0.02]);
      }
    }
    const NAME = { tennis: 'Tennis court', basketball: 'Basketball court', volleyball: 'Volleyball court', soccer: 'Football pitch' };
    return { name: NAME[kind], static: true, noCollide: true };
  },
  raceTrack(k, a, r) {
    const L = 70, R = 24, W = 11;
    k.box('lawn', [0, 0.01, 0], [2 * (R + W + 8), 0.02, L + 2 * (R + W + 8)]);
    for (const s of [-1, 1]) {
      k.box('asphalt', [s * (R + W / 2), 0.035, 0], [W, 0.03, L]);
      k.disc('asphalt', [0, 0.036, s * L / 2], R + W, [-HALF, s > 0 ? 0 : PI, 0], R, 48);
      for (const e of [R, R + W]) { k.box('white', [s * e, 0.052, 0], [0.25, 0.004, L]); k.disc('white', [0, 0.053, s * L / 2], e + 0.12, [-HALF, s > 0 ? 0 : PI, 0], e - 0.12, 48); }
      for (let i = 0; i < 14; i++) { const an = (i / 13) * PI; k.cyl(i % 2 ? 'p:#d81a1a' : 'white', [Math.cos(an) * (R + W + 0.4) * 1, 0.1, s * (L / 2 + Math.sin(an) * (R + W + 0.4))], 0.35, 0.18, null, { segs: 8 }); }
    }
    // Chequered start line and a grandstand.
    for (let i = 0; i < 11; i++) for (let j = 0; j < 2; j++) k.box((i + j) % 2 ? 'white' : 'black', [R + 0.5 + i, 0.055, j * 1 - 0.5], [1, 0.004, 1]);
    for (let i = 0; i < 6; i++) k.box('concrete', [R + W + 4 + i * 1.2, 0.4 + i * 0.6, 0], [1.2, 0.8 + i * 1.2, 40]);
    k.box('m:#c81a1a', [R + W + 8, 8, 0], [0.3, 0.3, 40]);
    k.collide([R + W + 3.4, 0, -20], [R + W + 11, 7, 20]);
    return { name: 'Race track', static: true, noCollide: false };
  },
  golfCourse(k, a, r) {
    k.ball('lawn', [0, -0.5, 0], 1, [16, 0.52, 40], 32);
    k.ball('p:#5ab04a', [0, -0.5, -28], 1, [9, 0.525, 9], 32);
    k.box('p:#4a9a3a', [0, 0.03, 30], [6, 0.06, 5]);
    k.cyl('p:#141414', [0.8, 0.025, -28], 0.054, 0.01, null, { segs: 16 });
    k.seg('white', [0.8, 0, -28], [0.8, 2.3, -28], 0.012, 0.012, 6);
    k.ext('e:#e0201a', [[0, 0], [0.55, -0.18], [0, -0.36]], 0.01, [0.81, 2.3, -28], null);
    k.ball('sand', [-6, -0.5, -18], 1, [4, 0.54, 3], 20);
    k.ball('sand', [7, -0.5, 4], 1, [3, 0.53, 5], 20);
    k.ball('water', [-8, -0.5, 10], 1, [5, 0.52, 7], 24);
    k.ball('white', [0.4, 0.07, 29], 0.021, null, 12);
    k.seg('w:#e8c040', [0.4, 0.05, 29], [0.4, 0.1, 29], 0.004, 0.002, 5);
    return { name: 'Golf course', static: true, noCollide: true };
  },
  maze(k, a, r) {
    const t = a.text || '';
    const stone = /labyrinth|stone|dungeon|haunted|ancient/.test(t);
    const n = /big|huge|giant/.test(t) ? 14 : 10, cell = 2.6, Hh = stone ? 3.2 : 2.5, th = 0.6;
    const wall = stone ? 'stone' : 'leaves';
    const { H, V } = carveMaze(n, r);
    H[n][Math.floor(n / 2)] = false; H[0][Math.floor(n / 2)] = false; // entrance south, exit north
    const x0 = -n * cell / 2, z0 = -n * cell / 2;
    k.box(stone ? 'cobble' : 'gravel', [0, 0.01, 0], [n * cell + 2, 0.02, n * cell + 2]);
    for (let y = 0; y <= n; y++) {
      let run = -1;
      for (let x = 0; x <= n; x++) {
        const on = x < n && H[y][x];
        if (on && run < 0) run = x;
        if (!on && run >= 0) { const xa = x0 + run * cell - th / 2, xb = x0 + x * cell + th / 2, z = z0 + y * cell; k.box(wall, [(xa + xb) / 2, Hh / 2, z], [xb - xa, Hh, th]); k.collide([xa, 0, z - th / 2], [xb, Hh, z + th / 2]); run = -1; }
      }
    }
    for (let x = 0; x <= n; x++) {
      let run = -1;
      for (let y = 0; y <= n; y++) {
        const on = y < n && V[y][x];
        if (on && run < 0) run = y;
        if (!on && run >= 0) { const za = z0 + run * cell - th / 2, zb = z0 + y * cell + th / 2, xx = x0 + x * cell; k.box(wall, [xx, Hh / 2, (za + zb) / 2], [th, Hh, zb - za]); k.collide([xx - th / 2, 0, za], [xx + th / 2, Hh, zb]); run = -1; }
      }
    }
    // A prize at the exit.
    const ex = x0 + (Math.floor(n / 2) + 0.5) * cell, ez = z0 - 1.6;
    k.cyl('marble', [ex, 0.4, ez], 0.35, 0.8, null, { segs: 16 });
    k.lathe('gold', [ex, 0.8, ez], [[0, 0], [0.12, 0], [0.04, 0.05], [0.03, 0.18], [0.14, 0.24], [0.16, 0.4], [0.14, 0.4], [0.02, 0.26], [0, 0.26]], 20);
    k.glow('#ffe080', [ex, 1.1, ez], 0.9, 0.5);
    if (stone) for (let i = 0; i < 6; i++) { const px = x0 + r.int(0, n - 1) * cell + cell / 2, pz = z0 + r.int(0, n - 1) * cell + cell / 2; k.seg('w:#4a3020', [px, 0, pz], [px, 1.4, pz], 0.04, 0.04, 6); attachFire(k.group, [px, 1.5, pz], 0.4); k.light([px, 1.6, pz], '#ff9a40', 1.2, 6, false, true); }
    return { name: stone ? 'Labyrinth' : 'Hedge maze', static: true, noCollide: true };
  },

  // ================= Space & science =================
  planet(k, a, r) {
    const t = a.text || '';
    const earth = /earth|home ?world|blue planet/.test(t), ringed = /ring|saturn/.test(t), red = /mars|red planet/.test(t);
    const kind = earth ? 'earth' : red || /moon|rocky|mercury|venus|pluto/.test(t) ? 'rocky' : 'gas';
    const col = k.color(red ? '#c8582a' : /jupiter/.test(t) ? '#c8a078' : /neptune|uranus/.test(t) ? '#4a8ad8' : /venus/.test(t) ? '#e8c890' : r.pick(['#c8a078', '#d8b888', '#8ab0d8', '#c89060', '#a870c8']));
    const R = 2.4;
    const m = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshStandardMaterial({ map: planetTexture(kind, r, col), roughness: 0.9 }));
    m.castShadow = true;
    const spin = k.sub([0, R + 1.5, 0], [0.3, 0, 0.2]);
    spin.add(m);
    if (earth) { const cl = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 40, 24), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false })); spin.add(cl); }
    if (ringed || (kind === 'gas' && r.chance(0.5))) {
      const rg = new THREE.RingGeometry(R * 1.4, R * 2.3, 64);
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 4; const g = cv.getContext('2d');
      for (let x = 0; x < 256; x++) { g.fillStyle = `rgba(230,210,170,${0.2 + 0.6 * Math.abs(Math.sin(x * 0.13) * Math.cos(x * 0.041))})`; g.fillRect(x, 0, 1, 4); }
      const tx = new THREE.CanvasTexture(cv);
      const uv = rg.attributes.uv, p = rg.attributes.position;
      for (let i = 0; i < uv.count; i++) { const rr = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (rr - R * 1.4) / (R * 0.9), 0.5); }
      const ring = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -HALF + 0.35;
      ring.position.y = R + 1.5;
      k.add(ring);
    }
    k.tick((dt) => { spin.group.rotation.y += dt * 0.15; });
    const nm = earth ? 'Earth' : red ? 'Mars' : ringed ? 'Ringed planet' : 'Planet';
    return { name: nm, static: true, float: true, noCollide: false, collideAuto: true };
  },
  moon(k, a, r) {
    const R = 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshStandardMaterial({ map: planetTexture('rocky', r, k.color('#b8b4ac')), roughness: 1 }));
    m.castShadow = true;
    const g = k.sub([0, R + 1.5, 0]);
    g.add(m);
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      const c = new THREE.Mesh(new THREE.TorusGeometry(r.range(0.12, 0.35), 0.04, 6, 20), new THREE.MeshStandardMaterial({ color: '#a8a49c', roughness: 1 }));
      c.position.copy(v.multiplyScalar(R * 0.995)); c.lookAt(0, 0, 0);
      g.add(c);
    }
    if (has(a, /cheese/)) m.material.color.set('#f2d24a');
    k.tick((dt) => { g.group.rotation.y += dt * 0.05; });
    return { name: has(a, /cheese/) ? 'Cheese moon' : 'Moon', static: true, float: true, collideAuto: true };
  },
  star(k, a, r) {
    const pts = []; for (let i = 0; i < 10; i++) { const an = (i / 10) * TAU + HALF, rr = i % 2 ? 0.42 : 1; pts.push([Math.cos(an) * rr, Math.sin(an) * rr]); }
    const col = k.color('#ffd84a');
    const s = k.sub([0, 1.6, 0]);
    s.ext('e:' + col, pts, 0.25, [0, 0, 0], null, 0.08);
    k.glow(col, [0, 1.6, 0], 3.2, 0.6);
    k.light([0, 1.6, 0.5], col, 2, 8);
    k.tick((dt, t) => { s.group.rotation.y += dt * 0.8; s.group.position.y = 1.6 + Math.sin(t * 1.5) * 0.08; });
    return { name: 'Star', static: true, float: true, noCollide: true, sparkle: true };
  },
  meteor(k, a, r) {
    const t = a.text || '';
    const comet = /comet/.test(t), asteroid = /asteroid/.test(t) && !/meteor/.test(t);
    const R = asteroid ? 3 : comet ? 1.2 : 0.8;
    const rock = rockMesh(R, r, G.materials.get(asteroid ? 'rock' : 'rock', { color: asteroid ? '#6a6660' : '#3a3430' }), 0.35);
    const g = k.sub([0, R + (comet ? 3 : 0.1), 0]);
    g.add(rock);
    if (!asteroid) {
      const lava = rockMesh(R * 0.97, r, G.materials.get('lava', {}), 0.35);
      g.add(lava);
      k.glow(comet ? '#a8d8ff' : '#ff8a30', [0, R + (comet ? 3 : 0.1), 0], R * 4, 0.55);
      if (comet) {
        const tail = new THREE.Mesh(new THREE.ConeGeometry(R * 1.6, R * 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#b8e0ff', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        tail.rotation.z = -HALF; tail.position.set(-R * 7, R + 3, 0);
        k.add(tail);
      } else {
        attachFire(k.group, [0, R * 1.5, 0], R * 1.2);
        k.light([0, R, 0], '#ff7a2a', 2.5, 10, false, true);
      }
    }
    k.tick((dt) => { g.group.rotation.y += dt * (comet ? 0.4 : 0.1); g.group.rotation.x += dt * 0.07; });
    return { name: comet ? 'Comet' : asteroid ? 'Asteroid' : 'Meteorite', static: true, float: comet, collideAuto: true };
  },
  goldNugget(k, a, r) {
    const g = k.sub([0, 0.05, 0]);
    const mat = G.materials.get(has(a, /silver/) ? 'chrome' : 'gold', {});
    for (let i = 0; i < 5; i++) { const m = rockMesh(r.range(0.02, 0.04), r, mat, 0.5); m.position.set(r.range(-0.03, 0.03), r.range(-0.01, 0.02), r.range(-0.03, 0.03)); g.add(m); }
    return { name: has(a, /silver/) ? 'Silver nugget' : 'Gold nugget', phys: { mass: 0.5 }, sparkle: true };
  },
  atom(k, a, r) {
    const c = k.sub([0, 1.4, 0]);
    for (let i = 0; i < 12; i++) c.ball(i % 2 ? 'g:#d83a3a' : 'g:#3a6ad8', [r.range(-0.12, 0.12), r.range(-0.12, 0.12), r.range(-0.12, 0.12)], 0.1, null, 14);
    const orbits = [];
    for (let i = 0; i < 3; i++) {
      const o = c.sub([0, 0, 0], [i * PI / 3, 0, i * 0.7]);
      o.torus('e:#60c0ff', [0, 0, 0], 0.9, 0.012, [HALF, 0, 0], TAU, 64);
      const el = o.sub([0, 0, 0]);
      el.ball('e:#a0e8ff', [0.9, 0, 0], 0.06, null, 12);
      orbits.push(el);
    }
    c.glow('#60c0ff', [0, 0, 0], 1.2, 0.3);
    k.tick((dt) => { orbits.forEach((o, i) => { o.group.rotation.y += dt * (2.5 + i); }); c.group.rotation.y += dt * 0.2; });
    return { name: 'Atom', static: true, float: true, noCollide: true };
  },
  dna(k, a, r) {
    const h = k.sub([0, 0.2, 0]);
    const n = 30, H = 3, R = 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / n, an = t * TAU * 3, y = t * H;
      const p1 = [Math.cos(an) * R, y, Math.sin(an) * R], p2 = [Math.cos(an + PI) * R, y, Math.sin(an + PI) * R];
      h.ball('g:#3a8ad8', p1, 0.07, null, 10); h.ball('g:#d84a8a', p2, 0.07, null, 10);
      h.seg('g:' + ['#f0c030', '#4ac070', '#e8663a', '#8a5ad8'][i % 4], p1, [0, y, 0], 0.025, 0.025, 6);
      h.seg('g:' + ['#8a5ad8', '#e8663a', '#4ac070', '#f0c030'][i % 4], [0, y, 0], p2, 0.025, 0.025, 6);
    }
    k.tick((dt) => { h.group.rotation.y += dt * 0.4; });
    return { name: 'DNA helix', static: true, noCollide: true };
  },
  heart(k, a, r) {
    const organ = has(a, /human|anatom|real|organ|beating/);
    const g = k.sub([0, organ ? 0.12 : 0.9, 0]);
    if (organ) {
      g.ball('g:#a01a24', [0, 0, 0], 0.07, [1, 1.2, 0.85]);
      g.ball('g:#b02a30', [0.03, 0.04, 0], 0.05);
      g.seg('g:#b02a30', [0.01, 0.06, 0], [0.02, 0.13, -0.01], 0.022, 0.018, 8);
      g.tube('g:#b02a30', [[0.02, 0.12, -0.01], [-0.02, 0.15, -0.01], [-0.05, 0.12, 0]], 0.016, 12);
      g.seg('g:#3a4ab0', [-0.03, 0.05, 0], [-0.04, 0.12, 0.01], 0.016, 0.014, 8);
    } else {
      const s = new THREE.Shape();
      s.moveTo(0, -0.5); s.bezierCurveTo(0.2, -0.3, 0.6, -0.05, 0.6, 0.25); s.bezierCurveTo(0.6, 0.55, 0.2, 0.6, 0, 0.3); s.bezierCurveTo(-0.2, 0.6, -0.6, 0.55, -0.6, 0.25); s.bezierCurveTo(-0.6, -0.05, -0.2, -0.3, 0, -0.5);
      g.ext('g:' + k.color('#e0203a'), s, 0.25, [0, 0, 0], null, 0.08);
    }
    k.tick((dt, t) => { const b = 1 + Math.max(0, Math.sin(t * 7)) * 0.08; g.group.scale.setScalar(b); if (!organ) g.group.rotation.y += dt * 0.6; });
    return { name: organ ? 'Heart' : 'Love heart', static: !organ, phys: organ ? { mass: 0.3 } : null, float: !organ, noCollide: !organ };
  },
  brain(k, a, r) {
    for (const s of [-1, 1]) {
      k.ball('g:#e8a0a8', [s * 0.035, 0.06, 0], 0.055, [0.8, 0.85, 1.25], 18);
      for (let i = 0; i < 16; i++) { const an = r.range(0, TAU), el = r.range(-0.3, 1.3); k.torus('g:#d88a94', [s * 0.035 + s * Math.abs(Math.cos(el) * Math.cos(an)) * 0.04, 0.06 + Math.sin(el) * 0.045, Math.cos(el) * Math.sin(an) * 0.065], 0.012, 0.006, [r.range(0, PI), r.range(0, PI), 0], PI, 10); }
    }
    k.ball('g:#d88a94', [0, 0.02, -0.04], 0.03, [1.3, 0.7, 1]);
    k.seg('g:#d8a0a0', [0, 0.02, -0.02], [0, -0.01, -0.03], 0.012, 0.01, 8);
    return { name: 'Brain', phys: { mass: 1.4 } };
  },
  tooth(k) {
    k.lathe('g:#f4f0e6', [0, 0.04, 0], [[0, 0.1], [0.05, 0.095], [0.065, 0.075], [0.06, 0.04], [0.045, 0.02], [0.04, 0], [0, 0]], 20);
    for (const s of [-1, 1]) { k.seg('g:#f0e8d8', [s * 0.02, 0.05, 0], [s * 0.03, 0, 0], 0.02, 0.008, 10); k.ball('g:#f4f0e6', [s * 0.025, 0.14, s * 0.02], 0.03, [1, 0.6, 1], 12); }
    return { name: 'Tooth', phys: { mass: 0.2 } };
  },

  // ================= Casino & party =================
  slotMachine(k, a, r) {
    const col = k.color('#c81a2a');
    k.rbox('c:' + col, [0, 0.8, 0], [0.6, 1.6, 0.5], 0.06);
    k.dome('c:' + col, [0, 1.6, 0], 0.3, null, { scl: [1, 0.5, 0.8] });
    k.box('chrome', [0, 0.95, 0.2], [0.52, 0.34, 0.14]);
    const SYM = ['🍒', '🍋', '🔔', '⭐', '7', '💎'];
    let reels = [0, 1, 2], spinT = 0;
    const scr = k.screen([0, 0.95, 0.275], 0.46, 0.26, null, (g, w, h) => { g.fillStyle = '#f8f4e8'; g.fillRect(0, 0, w, h); g.font = `${h * 0.7}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; for (let i = 0; i < 3; i++) { g.fillStyle = '#1a1a1a'; g.fillText(SYM[spinT > 0 ? (Math.random() * 6) | 0 : reels[i]], w * (i + 0.5) / 3, h / 2); if (i) { g.fillStyle = '#c8c0a8'; g.fillRect(w * i / 3 - 1, 0, 2, h); } } }, { fps: 12 });
    void scr;
    k.label('JACKPOT', [0, 1.45, 0.26], 0.5, 0.14, null, { fg: '#ffe040', bg: '#1a1a1a', emissive: 1.2 });
    const lever = k.sub([0.32, 1.0, 0]);
    lever.seg('chrome', [0, 0, 0], [0.04, 0.4, 0], 0.015, 0.015, 8);
    lever.ball('g:#d81a1a', [0.04, 0.42, 0], 0.045);
    k.box('chrome', [0, 0.35, 0.26], [0.3, 0.12, 0.06]);
    k.tick((dt) => { if (spinT > 0) { spinT -= dt; lever.group.rotation.x = Math.min(0.9, spinT * 1.5); if (spinT <= 0) { lever.group.rotation.x = 0; } } });
    return { name: 'Slot machine', static: true, interact: { label: () => 'Pull the lever', action: (e) => { if (spinT > 0) return; spinT = 1.6; reels = [r.int(0, 5), r.int(0, 5), r.int(0, 5)]; if (r.chance(0.18)) reels = [reels[0], reels[0], reels[0]]; sound(e, 'whirr'); setTimeout(() => { const win = reels[0] === reels[1] && reels[1] === reels[2]; sound(e, win ? 'magic' : 'beep'); if (G.ui) G.ui.toast(win ? `JACKPOT! ${SYM[reels[0]].repeat(3)}` : 'No luck this time.'); }, 1700); } } };
  },
  roulette(k, a, r) {
    k.rbox('darkWood', [0, 0.45, 0], [2.4, 0.9, 1.3], 0.08);
    k.box('fabric', [0.3, 0.905, 0], [1.6, 0.01, 1.1]);
    k.m('fabric', 'fabric', { color: '#1a6a2a' });
    for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) k.box(i === 0 && j === 1 ? 'p:#1a8a2a' : (i + j) % 2 ? 'p:#c81a1a' : 'p:#141414', [-0.2 + i * 0.1, 0.912, -0.15 + j * 0.15], [0.09, 0.004, 0.14]);
    const wheel = k.sub([-0.75, 0.92, 0]);
    wheel.cyl('darkWood', [0, 0.03, 0], 0.4, 0.06, null, { segs: 40 });
    for (let i = 0; i < 37; i++) { const an = (i / 37) * TAU; wheel.box(i === 0 ? 'p:#1a8a2a' : i % 2 ? 'p:#c81a1a' : 'p:#141414', [Math.sin(an) * 0.3, 0.065, Math.cos(an) * 0.3], [0.045, 0.01, 0.1], [0, an, 0]); }
    wheel.cone('gold', [0, 0.1, 0], 0.08, 0.08);
    wheel.seg('gold', [-0.12, 0.13, 0], [0.12, 0.13, 0], 0.01, 0.01, 6);
    wheel.ball('white', [0.36, 0.08, 0], 0.012);
    let spin = 0;
    k.tick((dt) => { if (spin > 0) { wheel.group.rotation.y += dt * spin * 3; spin = Math.max(0, spin - dt * 0.6); } });
    return { name: 'Roulette table', static: true, interact: { label: () => 'Spin the wheel', action: (e) => { spin = 4; sound(e, 'whirr'); setTimeout(() => { const n = r.int(0, 36); if (G.ui) G.ui.toast(`The ball lands on ${n} ${n === 0 ? 'green' : n % 2 ? 'red' : 'black'}!`); sound(e, 'ding'); }, 5500); } } };
  },
  pokerTable(k, a, r) {
    k.m('felt', 'fabric', { color: k.color('#1a6a2a') });
    k.ball('darkWood', [0, 0.72, 0], 1, [1.25, 0.05, 0.7], 32);
    k.ball('felt', [0, 0.745, 0], 1, [1.15, 0.03, 0.62], 32);
    k.cyl('darkWood', [0, 0.36, 0], 0.15, 0.72, null, { segs: 12 });
    for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU; for (let j = 0; j < 5; j++) k.cyl('g:' + ['#c81a1a', '#1a4ad8', '#141414', '#f0f0f0', '#2a9a3a'][j % 5], [Math.cos(an) * 0.85, 0.78 + j * 0.008, Math.sin(an) * 0.45], 0.02, 0.007, null, { segs: 12 }); }
    for (let i = 0; i < 5; i++) k.box('white', [-0.2 + i * 0.1, 0.766, 0], [0.06, 0.002, 0.09]);
    return { name: 'Poker table', static: true };
  },
  jukebox(k, a, r) {
    k.rbox('darkWood', [0, 0.7, 0], [0.9, 1.4, 0.6], 0.06);
    k.cyl('darkWood', [0, 1.4, 0], 0.45, 0.6, [HALF, 0, 0], { arcStart: -HALF, arc: PI, segs: 24 });
    k.cyl('e:#ff7a2a', [0, 1.4, 0.02], 0.4, 0.6, [HALF, 0, 0], { arcStart: -HALF, arc: PI, segs: 24, open: true });
    for (const s of [-1, 1]) k.seg('e:#40c0ff', [s * 0.42, 0.1, 0.31], [s * 0.42, 1.4, 0.31], 0.03, 0.03, 8);
    k.box('glass', [0, 1.05, 0.31], [0.6, 0.4, 0.02]);
    k.box('chrome', [0, 0.45, 0.31], [0.6, 0.3, 0.02]);
    for (let i = 0; i < 8; i++) k.box('white', [-0.21 + (i % 4) * 0.14, 1.1 - Math.floor(i / 4) * 0.12, 0.33], [0.1, 0.06, 0.01]);
    k.light([0, 1.2, 0.6], '#ff9a60', 1.5, 5, false);
    return { name: 'Jukebox', static: true, interact: { label: () => 'Play a record', action: (e) => playTune(e, 'piano', [60, 64, 67, 72, 67, 64, 65, 69, 72, 69, 67, 64]) } };
  },
  discoBall(k, a, r) {
    const g = k.sub([0, 2.6, 0]);
    const geo = new THREE.SphereGeometry(0.35, 24, 16).toNonIndexed(); geo.computeVertexNormals();
    const ball = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#e8e8f0', metalness: 1, roughness: 0.08, flatShading: true }));
    g.add(ball);
    k.seg('chrome', [0, 2.95, 0], [0, 4, 0], 0.008, 0.008, 6);
    const cols = ['#ff3a8a', '#3a8aff', '#3aff8a', '#ffd83a'];
    cols.forEach((c, i) => k.light([Math.cos(i * HALF) * 1.2, 2.2, Math.sin(i * HALF) * 1.2], c, 1.4, 7));
    for (let i = 0; i < 6; i++) k.glow(cols[i % 4], [Math.cos(i) * 0.3, 2.6 + Math.sin(i * 2) * 0.3, Math.sin(i) * 0.3], 0.25, 0.8);
    k.tick((dt) => { g.group.rotation.y += dt * 0.9; });
    return { name: 'Disco ball', static: true, noCollide: true, float: true };
  },
  chandelier(k, a, r) {
    const n = 8, y = 2.6;
    k.seg('gold', [0, y + 0.3, 0], [0, y + 1.4, 0], 0.012, 0.012, 6);
    k.torus('gold', [0, y, 0], 0.6, 0.02, [HALF, 0, 0], TAU, 40);
    k.lathe('gold', [0, y - 0.25, 0], [[0, 0], [0.06, 0.05], [0.04, 0.3], [0.08, 0.5], [0, 0.55]], 16);
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU, x = Math.cos(an) * 0.6, z = Math.sin(an) * 0.6;
      k.tube('gold', [[0, y + 0.2, 0], [x * 0.5, y + 0.05, z * 0.5], [x, y, z]], 0.012, 10);
      k.cyl('white', [x, y + 0.08, z], 0.018, 0.14, null, { segs: 8 });
      attachFire(k.group, [x, y + 0.18, z], 0.06);
      for (let j = 0; j < 3; j++) k.ball('crystal', [x * (0.7 + j * 0.1), y - 0.12 - j * 0.05, z * (0.7 + j * 0.1)], 0.025, [1, 1.6, 1], 6);
    }
    k.light([0, y, 0], '#ffd8a0', 2.5, 10, false, true);
    return { name: 'Chandelier', static: true, noCollide: true, float: true };
  },
  menorah(k, a, r) {
    k.lathe('gold', [0, 0, 0], [[0, 0], [0.15, 0], [0.12, 0.04], [0.03, 0.08], [0.025, 0.3], [0, 0.3]], 24);
    for (let i = -4; i <= 4; i++) {
      const x = i * 0.07, top = i === 0 ? 0.56 : 0.5;
      if (i) k.tube('gold', [[0, 0.3, 0], [x * 0.6, 0.3 + Math.abs(i) * 0.005, 0], [x, 0.36, 0], [x, top - 0.04, 0]], 0.01, 12);
      else k.seg('gold', [0, 0.3, 0], [0, top - 0.04, 0], 0.012, 0.012, 8);
      k.cyl('gold', [x, top - 0.03, 0], 0.02, 0.02, null, { segs: 10 });
      k.cyl('white', [x, top + 0.03, 0], 0.008, 0.08, null, { segs: 6 });
      attachFire(k.group, [x, top + 0.09, 0], 0.035);
    }
    k.light([0, 0.7, 0.2], '#ffd090', 1, 4, false, true);
    return { name: 'Menorah', phys: { mass: 2 } };
  },
  giftBox(k, a, r) {
    const col = k.color(r.pick(['#c81a2a', '#2a5ad8', '#2a9a4a', '#8a3ab0', '#f0c030']));
    const rib = k.color2(r.pick(['#f0c030', '#f8f4ec', '#c81a2a']));
    k.box('g:' + col, [0, 0.13, 0], [0.3, 0.26, 0.3]);
    const lid = k.sub([0, 0.26, 0]);
    lid.box('g:' + col, [0, 0.025, 0], [0.32, 0.05, 0.32]);
    for (const rot of [0, HALF]) { k.box('g:' + rib, [0, 0.13, 0], [0.305, 0.262, 0.05], [0, rot, 0]); lid.box('g:' + rib, [0, 0.026, 0], [0.325, 0.054, 0.05], [0, rot, 0]); }
    for (const s of [-1, 1]) lid.torus('g:' + rib, [s * 0.04, 0.09, 0], 0.045, 0.012, [0, 0, s * 0.6], TAU, 16);
    let open = 0;
    k.tick((dt) => { if (open > 0 && open < 1) { open = Math.min(1, open + dt * 2); lid.group.position.y = 0.26 + Math.sin(open * PI) * 0.3; lid.group.rotation.z = open * 0.8; } });
    return { name: 'Present', phys: { mass: 1 }, interact: { label: () => (open ? 'It\'s open!' : 'Open the present'), action: (e) => { if (!open) { open = 0.01; sound(e, 'pop'); sound(e, 'magic'); if (G.ui) G.ui.toast(r.pick(['A pair of socks. Classic.', 'A tiny dragon egg!', 'A golden ticket!', 'Another, smaller present...', 'A rubber duck!'])); } } } };
  },
  balloonBunch(k, a, r) {
    const n = has(a, /bunch|lots|many|balloons/) ? 7 : 1;
    for (let i = 0; i < n; i++) {
      const x = n > 1 ? r.range(-0.3, 0.3) : 0, z = n > 1 ? r.range(-0.3, 0.3) : 0, y = 1.6 + (n > 1 ? r.range(0, 0.5) : 0);
      const col = n > 1 ? hsl(i / n, 0.8, 0.55) : k.color('#e8203a');
      k.ball('g:' + col, [x, y, z], 0.14, [1, 1.2, 1], 18);
      k.cone('g:' + col, [x, y - 0.18, z], 0.02, 0.03, [PI, 0, 0], 8);
      k.tube('white', [[x, y - 0.2, z], [x * 0.5 + 0.02, (y - 0.2) * 0.5, z * 0.5], [0, 0.02, 0]], 0.002, 10, false, 4);
    }
    k.ball('p:#4a4a4a', [0, 0.02, 0], 0.03);
    return { name: n > 1 ? 'Bunch of balloons' : 'Balloon', phys: { mass: 0.1 } };
  },

  // ================= Nature bits =================
  seashell(k, a, r) {
    if (has(a, /conch|spiral/)) {
      for (let i = 0; i < 26; i++) { const t = i / 26, an = t * TAU * 2.4, rr = 0.012 + t * 0.06; k.ball('g:#f0c8a8', [Math.cos(an) * t * 0.05, 0.05 + t * 0.02, Math.sin(an) * t * 0.05 - t * 0.06], rr, [1, 1, 1.4], 12, [0, -an, 0]); }
      return { name: 'Conch shell', phys: { mass: 0.3 } };
    }
    for (let i = 0; i < 11; i++) { const an = -1.1 + (i / 10) * 2.2; k.ext(i % 2 ? 'g:#f4d8c8' : 'g:#e8b8a0', [[0, 0], [Math.sin(an - 0.11) * 0.09, Math.cos(an - 0.11) * 0.09], [Math.sin(an + 0.11) * 0.09, Math.cos(an + 0.11) * 0.09]], 0.012 + Math.cos(an) * 0.01, [0, 0.012, 0], [-HALF + 0.2, 0, 0]); }
    k.box('g:#e8b8a0', [0, 0.008, 0.005], [0.03, 0.012, 0.02]);
    return { name: 'Seashell', phys: { mass: 0.1 } };
  },
  pearl(k, a, r) {
    k.dome('p:#8a8a80', [0, 0, 0], 0.08, null, { scl: [1, 0.3, 0.8], t0: HALF, t1: HALF });
    k.dome('g:#e8e4ec', [0, 0.005, 0], 0.074, null, { scl: [1, 0.25, 0.75], t0: HALF, t1: HALF });
    const top = k.sub([0, 0.01, -0.06], [-1.0, 0, 0]);
    top.dome('p:#8a8a80', [0, 0, 0.06], 0.08, null, { scl: [1, 0.3, 0.8] });
    k.ball('chrome', [0, 0.02, 0], 0.025, null, 20);
    k.m('chrome', 'glossyPlastic', { color: '#f8f4f0' });
    k.glow('#ffffff', [0, 0.03, 0], 0.12, 0.4);
    return { name: 'Pearl in an oyster', phys: { mass: 0.3 }, sparkle: true };
  },
  beehive(k, a, r) {
    for (let i = 0; i < 9; i++) k.torus('p:#c8a050', [0, 0.06 + i * 0.07, 0], 0.26 * Math.sqrt(1 - (i / 9.5) ** 2) + 0.01, 0.045, [HALF, 0, 0], TAU, 28);
    k.dome('p:#c8a050', [0, 0.6, 0], 0.1, null, { scl: [1, 0.6, 1] });
    k.cyl('p:#1a1208', [0, 0.06, 0.26], 0.05, 0.02, [HALF, 0, 0], { segs: 12 });
    k.box('w:#6a4a2a', [0, -0.02, 0], [0.7, 0.04, 0.7]);
    const bees = k.sub([0, 0.4, 0]);
    for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU, rr = r.range(0.4, 0.7), y = r.range(-0.2, 0.3); bees.ball('p:#f0c010', [Math.cos(an) * rr, y, Math.sin(an) * rr], 0.012, [1, 1, 1.5], 6); bees.box('p:#141414', [Math.cos(an) * rr, y, Math.sin(an) * rr], [0.02, 0.008, 0.004], [0, -an, 0]); }
    k.tick((dt, t) => { bees.group.rotation.y += dt * 1.6; bees.group.position.y = 0.4 + Math.sin(t * 3) * 0.04; });
    return { name: 'Beehive', static: true, interact: { label: () => 'Listen', action: (e) => sound(e, 'whirr') } };
  },
  spiderWeb(k, a, r) {
    for (const s of [-1, 1]) k.seg('w:#5a3a1a', [s * 1.1, 0, 0], [s * 1.0, 2.4, 0], 0.05, 0.035, 8);
    const c = [0, 1.4, 0], R = 0.9;
    k.m('silk', 'emissive', { color: '#e8f0ff', emissiveIntensity: 0.4 });
    for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; k.seg('silk', c, [Math.cos(an) * R, 1.4 + Math.sin(an) * R, 0], 0.003, 0.003, 3); }
    const pts = []; for (let i = 0; i < 12 * 7; i++) { const an = (i / 12) * TAU, rr = 0.08 + (i / (12 * 7)) * (R - 0.1); pts.push([Math.cos(an) * rr, 1.4 + Math.sin(an) * rr, 0]); }
    for (let i = 0; i < pts.length - 1; i++) k.seg('silk', pts[i], pts[i + 1], 0.0025, 0.0025, 3);
    k.ball('p:#141414', [0.1, 1.5, 0.02], 0.04); k.ball('p:#141414', [0.1, 1.45, 0.02], 0.03);
    for (let i = 0; i < 8; i++) { const s = i < 4 ? 1 : -1, j = i % 4; k.seg('p:#141414', [0.1, 1.5, 0.02], [0.1 + s * 0.08, 1.52 - j * 0.03 + 0.05, 0.03], 0.005, 0.004, 4); }
    return { name: 'Spider web', static: true, noCollide: true };
  },
  birdNest(k, a, r) {
    for (let i = 0; i < 80; i++) { const an = r.range(0, TAU), rr = r.range(0.07, 0.12), y = r.range(0, 0.07); k.seg('w:#7a5a3a', [Math.cos(an) * rr, y, Math.sin(an) * rr], [Math.cos(an + 0.8) * rr, y + r.range(-0.02, 0.02), Math.sin(an + 0.8) * rr], 0.004, 0.003, 3); }
    k.dome('w:#6a4a2a', [0, 0.04, 0], 0.09, [PI, 0, 0], { scl: [1, 0.45, 1] });
    for (let i = 0; i < 3; i++) k.ball('g:#8ac8e0', [Math.cos(i * 2.1) * 0.03, 0.035, Math.sin(i * 2.1) * 0.03], 0.018, [1, 0.8, 1.3], 12, [0, i, 0]);
    return { name: 'Bird nest', phys: { mass: 0.3 } };
  },
  fishTank(k, a, r) {
    const W = 1.2, H = 0.6, D = 0.45;
    k.rbox('darkWood', [0, 0.4, 0], [W + 0.06, 0.8, D + 0.06], 0.02);
    k.box('glass', [0, 0.8 + H / 2, 0], [W, H, D]);
    k.box('water', [0, 0.8 + H * 0.45, 0], [W - 0.03, H * 0.88, D - 0.03]);
    k.box('gravel', [0, 0.82, 0], [W - 0.03, 0.04, D - 0.03]);
    for (let i = 0; i < 6; i++) { const x = r.range(-0.5, 0.5), z = r.range(-0.15, 0.15); for (let j = 0; j < 4; j++) k.seg('p:#3a9a3a', [x, 0.84, z], [x + r.range(-0.04, 0.04), 0.84 + r.range(0.15, 0.4), z], 0.008, 0.003, 4); }
    k.box('black', [0, 0.8 + H + 0.02, 0], [W + 0.04, 0.04, D + 0.04]);
    const fish = [];
    for (let i = 0; i < 6; i++) { const f = k.sub([0, 0.95 + r.range(0, 0.35), r.range(-0.12, 0.12)]); const c = r.pick(['#f08a1a', '#f0d020', '#3a8ad8', '#e8303a', '#f8f8f8']); f.ball('g:' + c, [0, 0, 0], 0.025, [1.6, 1, 0.5], 10); f.cone('g:' + c, [-0.05, 0, 0], 0.018, 0.025, [0, 0, HALF], 6); fish.push([f, r.range(0, TAU), r.range(0.3, 0.7)]); }
    k.light([0, 1.3, 0], '#a8e0ff', 0.8, 3, false);
    k.tick((dt, t) => { for (const [f, ph, sp] of fish) { const x = Math.sin(t * sp + ph) * 0.48; f.group.position.x = x; f.group.rotation.y = Math.cos(t * sp + ph) > 0 ? 0 : PI; } });
    return { name: 'Fish tank', static: true };
  },
  hamsterCage(k, a, r) {
    k.rbox('g:#3a8ad8', [0, 0.05, 0], [0.6, 0.1, 0.4], 0.02);
    for (let i = 0; i <= 12; i++) { const x = -0.29 + i * 0.048; for (const z of [-0.19, 0.19]) k.seg('chrome', [x, 0.1, z], [x, 0.45, z], 0.002, 0.002, 3); }
    for (let i = 0; i <= 8; i++) { const z = -0.19 + i * 0.0475; for (const x of [-0.29, 0.29]) k.seg('chrome', [x, 0.1, z], [x, 0.45, z], 0.002, 0.002, 3); }
    for (let i = 0; i <= 8; i++) k.seg('chrome', [-0.29, 0.45, -0.19 + i * 0.0475], [0.29, 0.45, -0.19 + i * 0.0475], 0.002, 0.002, 3);
    const wheel = k.sub([0.1, 0.25, 0]);
    wheel.torus('g:#f0c030', [0, 0, 0], 0.12, 0.01, null, TAU, 24);
    for (let i = 0; i < 8; i++) wheel.seg('g:#f0c030', [0, 0, 0], [Math.cos(i * PI / 4) * 0.12, Math.sin(i * PI / 4) * 0.12, 0], 0.004, 0.004, 3);
    k.ball('fur', [-0.15, 0.13, 0], 0.035, [1.3, 0.9, 1]);
    k.m('fur', 'fur', { color: '#d8a068' });
    k.tick((dt) => { wheel.group.rotation.z -= dt * 3; });
    return { name: 'Hamster cage', phys: { mass: 3 } };
  },
  petBed(k, a, r) {
    const col = k.color(r.pick(['#8a6a5a', '#5a6a8a', '#c8a888', '#7a3a3a']));
    k.torus('k:' + col, [0, 0.09, 0], 0.32, 0.09, [HALF, 0, 0], TAU, 32);
    k.cyl('k:#f0e6d8', [0, 0.04, 0], 0.32, 0.08, null, { segs: 32 });
    return { name: has(a, /cat/) ? 'Cat bed' : 'Dog bed', static: true, seats: [] };
  },
  catTree(k, a, r) {
    k.box('knit', [0, 0.02, 0], [0.7, 0.04, 0.7]);
    k.m('knit', 'knit', { color: '#c8b8a0' });
    for (const [x, z, h] of [[-0.2, -0.2, 1.4], [0.2, 0.15, 0.9]]) k.cyl('p:#c8a870', [x, h / 2, z], 0.05, h, null, { segs: 12 });
    k.box('knit', [-0.1, 0.9, 0], [0.6, 0.04, 0.5]);
    k.rbox('knit', [-0.2, 1.45, -0.15], [0.45, 0.3, 0.4], 0.05);
    k.cyl('p:#2a1a14', [-0.2, 1.45, 0.06], 0.1, 0.02, [HALF, 0, 0]);
    k.box('knit', [0.2, 0.5, 0.15], [0.35, 0.04, 0.35]);
    k.seg('p:#f0c030', [0.1, 0.88, 0.2], [0.1, 0.7, 0.2], 0.003, 0.003, 3);
    k.ball('g:#e8303a', [0.1, 0.68, 0.2], 0.025);
    return { name: has(a, /post/) ? 'Scratching post' : 'Cat tree', static: true };
  },
  djBooth(k, a, r) {
    k.box('black', [0, 0.5, 0], [1.8, 1.0, 0.7]);
    k.box('e:' + k.color('#8a3aff'), [0, 0.5, 0.36], [1.7, 0.05, 0.02]);
    for (const s of [-1, 1]) { k.box('dark', [s * 0.55, 1.03, 0], [0.5, 0.06, 0.4]); const pl = k.sub([s * 0.55, 1.07, 0]); pl.cyl('black', [0, 0, 0], 0.16, 0.01, null, { segs: 32 }); pl.cyl('p:#d81a1a', [0, 0.006, 0], 0.05, 0.004, null, { segs: 16 }); k.tick((dt) => { pl.group.rotation.y += dt * 3.5; }); }
    k.box('dark', [0, 1.04, 0], [0.4, 0.08, 0.35]);
    for (let i = 0; i < 6; i++) k.cyl('white', [-0.12 + i * 0.05, 1.09, 0.05], 0.01, 0.02, null, { segs: 8 });
    for (let i = 0; i < 4; i++) k.light([-0.9 + i * 0.6, 2.2, 0.5], hsl(i / 4, 0.9, 0.55), 1.2, 6);
    return { name: 'DJ booth', static: true, interact: { label: () => 'Drop the beat', action: (e) => playBeat(e) } };
  },
  logPile(k, a, r) {
    for (let row = 0; row < 4; row++) for (let i = 0; i < 5 - row; i++) {
      const x = (i - (4 - row) / 2) * 0.34, y = 0.16 + row * 0.29;
      k.cyl('w:#6a4a2a', [x, y, 0], 0.16 + r.range(-0.015, 0.015), 1.8, [HALF, 0, 0], { segs: 12 });
      for (const s of [-1, 1]) k.disc('w:#c8a070', [x, y, s * 0.901], 0.15, [0, s > 0 ? 0 : PI, 0], 0, 12);
    }
    return { name: 'Log pile', static: true };
  },
  silo(k, a) {
    k.cyl('m:' + k.color('#c8ccd0'), [0, 7, 0], 3, 14, null, { segs: 32 });
    for (let i = 0; i < 14; i++) k.torus('m:#9a9ea4', [0, i + 0.5, 0], 3.02, 0.04, [HALF, 0, 0], TAU, 32);
    k.dome('m:#9a9ea4', [0, 14, 0], 3.05, null, { scl: [1, 0.45, 1] });
    for (let i = 0; i < 28; i++) k.box('m:#6a6e74', [3.15, i * 0.5 + 0.2, 0], [0.05, 0.04, 0.5]);
    for (const z of [-0.25, 0.25]) k.seg('m:#6a6e74', [3.15, 0, z], [3.15, 14, z], 0.02, 0.02, 4);
    return { name: 'Silo', static: true };
  },

  // ================= Characters as objects =================
  scarecrow(k, a, r) {
    k.seg('w:#7a5a3a', [0, 0, 0], [0, 2.0, 0], 0.04, 0.04, 8);
    k.seg('w:#7a5a3a', [-0.75, 1.45, 0], [0.75, 1.45, 0], 0.035, 0.035, 8);
    k.rbox('f:#8a2a1a', [0, 1.25, 0], [0.5, 0.55, 0.22], 0.06);
    for (const s of [-1, 1]) k.seg('f:#8a2a1a', [s * 0.2, 1.45, 0], [s * 0.62, 1.45, 0], 0.07, 0.06, 10);
    k.rbox('f:#3a4a6a', [0, 0.8, 0], [0.45, 0.4, 0.2], 0.05);
    for (let i = 0; i < 16; i++) { const s = i < 8 ? 1 : -1; k.seg('p:#e0c060', [s * 0.62, 1.45, 0], [s * (0.7 + r.range(0, 0.1)), 1.45 + r.range(-0.08, 0.08), r.range(-0.05, 0.05)], 0.006, 0.004, 3); }
    k.ball('f:#c8a878', [0, 1.72, 0], 0.16, [1, 1.1, 1], 16);
    for (const s of [-1, 1]) k.box('p:#1a1a1a', [s * 0.055, 1.76, 0.155], [0.035, 0.035, 0.01], [0, 0, PI / 4]);
    k.tube('p:#1a1a1a', [[-0.07, 1.65, 0.15], [0, 1.62, 0.16], [0.07, 1.65, 0.15]], 0.006, 8);
    k.cyl('p:#d8b860', [0, 1.86, 0], 0.3, 0.02, null, { segs: 24 });
    k.cyl('p:#d8b860', [0, 1.95, 0], 0.13, 0.18, null, { rTop: 0.11, segs: 20 });
    return { name: 'Scarecrow', static: true };
  },
  gingerbreadMan(k, a, r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0.2); s.absarc(0, 0.16, 0.045, HALF + 1.2, HALF - 1.2 + TAU, true);
    s.lineTo(0.095, 0.12); s.quadraticCurveTo(0.12, 0.1, 0.1, 0.085); s.lineTo(0.05, 0.085); s.lineTo(0.08, 0.01); s.quadraticCurveTo(0.075, -0.01, 0.055, 0); s.lineTo(0, 0.05);
    s.lineTo(-0.055, 0); s.quadraticCurveTo(-0.075, -0.01, -0.08, 0.01); s.lineTo(-0.05, 0.085); s.lineTo(-0.1, 0.085); s.quadraticCurveTo(-0.12, 0.1, -0.095, 0.12); s.closePath();
    k.ext('p:#b8702a', s, 0.012, [0, 0.012, 0], [-HALF, 0, 0], 0.004);
    for (const [x, y] of [[-0.015, 0.17], [0.015, 0.17], [0, 0.11], [0, 0.08]]) k.ball('white', [x, 0.02, -y], 0.006, [1, 0.5, 1]);
    k.tube('white', [[-0.02, 0.02, -0.145], [0, 0.02, -0.138], [0.02, 0.02, -0.145]], 0.003, 8);
    return food2('Gingerbread man', 0.05);
  },
  witchHat(k, a) {
    const col = k.color('#1a1420');
    k.cyl('f:' + col, [0, 0.005, 0], 0.26, 0.01, null, { segs: 32 });
    k.tube('f:' + col, [[0, 0, 0], [0, 0.15, 0], [0.02, 0.3, -0.02], [0.08, 0.38, -0.06]], 0.001, 2);
    k.cone('f:' + col, [0, 0.18, 0], 0.13, 0.36, null, 24);
    k.cone('f:' + col, [0.05, 0.4, -0.03], 0.035, 0.1, [0.4, 0, -0.8], 12);
    k.cyl('f:#6a2a8a', [0, 0.03, 0], 0.132, 0.04, null, { rTop: 0.123, segs: 24 });
    k.box('gold', [0, 0.03, 0.13], [0.05, 0.04, 0.008]);
    return { name: 'Witch hat', phys: { mass: 0.2 } };
  },
  broom(k, a, r) {
    const flying = has(a, /flying|magic|witch/);
    const g = k.sub([0, flying ? 1.0 : 0.05, 0], flying ? null : [0, 0, 0]);
    g.seg('w:#7a5a3a', [-0.7, 0, 0], [0.5, 0, 0], 0.018, 0.016, 8);
    g.cone('p:#d8b860', [0.62, 0, 0], 0.12, 0.3, [0, 0, HALF], 16);
    g.torus('p:#8a2a1a', [0.48, 0, 0], 0.03, 0.008, [0, HALF, 0], TAU, 12);
    if (flying) k.tick((dt, t) => { g.group.position.y = 1.0 + Math.sin(t * 1.4) * 0.1; g.group.rotation.x = Math.sin(t * 0.9) * 0.08; });
    return { name: flying ? 'Flying broom' : 'Broom', phys: flying ? null : { mass: 0.8 }, static: flying, float: flying, noCollide: flying, seats: flying ? [{ x: 0, y: 1.0, z: 0, yaw: -HALF }] : undefined };
  },
  magicCarpet(k, a, r) {
    const col = k.color('#8a1a2a');
    const n = 8, L = 2.2, W = 1.3;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const p = k.sub([-L / 2 + (i + 0.5) * L / n, 0.9, 0]);
      p.box('v:' + col, [0, 0, 0], [L / n + 0.005, 0.02, W]);
      p.box('gold', [0, 0.012, 0], [L / n + 0.005, 0.004, W * 0.7]);
      p.box('v:#1a3a6a', [0, 0.015, 0], [L / n * 0.6, 0.004, W * 0.4]);
      for (const s of [-1, 1]) p.box('gold', [0, 0.011, s * W * 0.46], [L / n + 0.005, 0.006, 0.03]);
      parts.push(p);
    }
    for (const s of [-1, 1]) for (let j = 0; j < 8; j++) parts[s > 0 ? n - 1 : 0].seg('gold', [s * (L / n / 2), 0, -W / 2 + (j + 0.5) * W / 8], [s * (L / n / 2 + 0.08), -0.02, -W / 2 + (j + 0.5) * W / 8], 0.006, 0.004, 4);
    k.tick((dt, t) => { parts.forEach((p, i) => { p.group.position.y = 0.9 + Math.sin(t * 2 + i * 0.6) * 0.04; p.group.rotation.z = Math.cos(t * 2 + i * 0.6) * 0.04; }); });
    return { name: 'Magic carpet', static: true, float: true, noCollide: true, sparkle: true, seats: [{ x: 0, y: 0.93, z: 0, yaw: 0 }] };
  },
  swordInStone(k, a, r) {
    const stone = rockMesh(0.7, r, G.materials.get('rock', {}), 0.3);
    stone.scale.set(1.2, 0.8, 1); stone.position.y = 0.35;
    k.add(stone);
    k.box('chrome', [0, 1.05, 0], [0.07, 0.8, 0.012]);
    k.ext('chrome', [[-0.035, 0], [0.035, 0], [0, 0.07]], 0.012, [0, 1.45, 0], [PI, 0, 0]);
    k.box('gold', [0, 1.47, 0], [0.32, 0.04, 0.05]);
    k.seg('leather', [0, 1.49, 0], [0, 1.7, 0], 0.02, 0.02, 8);
    k.ball('gold', [0, 1.72, 0], 0.035);
    k.glow('#fff0b0', [0, 1.3, 0], 1.4, 0.35);
    let pulled = false;
    return { name: has(a, /excalibur/) ? 'Excalibur' : 'Sword in the stone', static: true, collideAuto: true, sparkle: true, interact: { label: () => 'Try to pull the sword', action: (e) => { if (G.ui) G.ui.toast(pulled || r.chance(0.3) ? 'The sword slides free! You are the rightful ruler!' : 'It will not budge... Only the worthy may pull it.'); pulled = true; sound(e, 'magic'); } } };
  },
  dragonEgg(k, a, r) {
    const col = k.color(r.pick(['#8a1a2a', '#1a5a3a', '#2a3a8a', '#4a2a6a', '#c89020']));
    const prof = [[0, 0], [0.12, 0.02], [0.18, 0.12], [0.19, 0.24], [0.15, 0.38], [0.08, 0.46], [0, 0.48]];
    k.lathe('g:' + col, [0, 0.02, 0], prof, 32);
    for (let i = 0; i < 90; i++) { const y = r.range(0.04, 0.44), an = r.range(0, TAU), rr = rAt(prof, y); k.ball('g:#' + new THREE.Color(col).multiplyScalar(0.7).getHexString(), [Math.sin(an) * rr, y + 0.02, Math.cos(an) * rr], 0.03, [1, 0.6, 0.3], 6, [0, an, 0]); }
    for (let i = 0; i < 40; i++) { const an = r.range(0, TAU), rr = r.range(0.12, 0.26); k.seg('w:#6a4a2a', [Math.cos(an) * rr, 0.02, Math.sin(an) * rr], [Math.cos(an + 0.6) * rr, 0.04, Math.sin(an + 0.6) * rr], 0.012, 0.01, 4); }
    k.glow(col, [0, 0.25, 0], 0.9, 0.35);
    k.light([0, 0.3, 0], col, 0.8, 3, true);
    return { name: 'Dragon egg', phys: { mass: 8 }, sparkle: true, interact: { label: () => 'Listen to the egg', action: (e) => { sound(e, 'creak'); if (G.ui) G.ui.toast('Something is moving inside...'); } } };
  },

  // ================= Mobility =================
  wheelchair(k, a) {
    k.rbox('f:' + k.color('#1a1a1e'), [0, 0.5, 0], [0.44, 0.05, 0.42], 0.02);
    k.rbox('f:' + k.color('#1a1a1e'), [0, 0.78, -0.2], [0.44, 0.42, 0.04], 0.02);
    for (const s of [-1, 1]) {
      k.seg('chrome', [s * 0.22, 0.5, 0.2], [s * 0.22, 0.5, -0.22], 0.012, 0.012, 6);
      k.seg('chrome', [s * 0.22, 0.5, -0.22], [s * 0.22, 1.0, -0.26], 0.012, 0.012, 6);
      k.seg('chrome', [s * 0.22, 1.0, -0.26], [s * 0.22, 1.0, -0.36], 0.012, 0.012, 6);
      k.ball('rubber', [s * 0.22, 1.0, -0.37], 0.018, [1, 1, 1.8]);
      k.seg('chrome', [s * 0.22, 0.5, 0.2], [s * 0.16, 0.12, 0.34], 0.01, 0.01, 6);
      k.box('dark', [s * 0.1, 0.1, 0.36], [0.14, 0.02, 0.12]);
      k.seg('chrome', [s * 0.22, 0.68, 0.12], [s * 0.22, 0.68, -0.2], 0.01, 0.01, 6);
      k.box('dark', [s * 0.22, 0.7, -0.04], [0.05, 0.03, 0.3]);
      k.torus('tire', [s * 0.28, 0.3, -0.06], 0.29, 0.018, [0, HALF, 0], TAU, 36);
      k.torus('chrome', [s * 0.31, 0.3, -0.06], 0.26, 0.007, [0, HALF, 0], TAU, 32);
      for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; k.seg('chrome', [s * 0.28, 0.3, -0.06], [s * 0.28, 0.3 + Math.cos(an) * 0.27, -0.06 + Math.sin(an) * 0.27], 0.002, 0.002, 3); }
      k.cyl('chrome', [s * 0.28, 0.3, -0.06], 0.03, 0.06, [0, 0, HALF]);
      k.torus('tire', [s * 0.18, 0.07, 0.3], 0.06, 0.012, [0, HALF, 0], TAU, 16);
    }
    return { name: 'Wheelchair', phys: { mass: 15 }, seats: [{ x: 0, y: 0.53, z: 0, yaw: 0 }] };
  },
  shoppingCart(k) {
    const W = 0.55, L = 0.85, y0 = 0.45, y1 = 0.95;
    for (let i = 0; i <= 10; i++) { const z = -L / 2 + i * L / 10; for (const s of [-1, 1]) k.seg('chrome', [s * W / 2, y0, z], [s * W / 2 * 1.08, y1, z], 0.004, 0.004, 3); }
    for (let i = 0; i <= 6; i++) { const x = -W / 2 + i * W / 6; k.seg('chrome', [x, y0, L / 2], [x * 1.08, y1, L / 2], 0.004, 0.004, 3); k.seg('chrome', [x, y0, -L / 2], [x * 1.08, y1, -L / 2], 0.004, 0.004, 3); k.seg('chrome', [x, y0, -L / 2], [x, y0, L / 2], 0.004, 0.004, 3); }
    for (const y of [y0, (y0 + y1) / 2, y1]) { const f = 1 + (y - y0) / (y1 - y0) * 0.08; k.tube('chrome', [[-W / 2 * f, y, -L / 2], [W / 2 * f, y, -L / 2], [W / 2 * f, y, L / 2], [-W / 2 * f, y, L / 2]], 0.006, 16, true, 5); }
    k.seg('p:#d81a1a', [-W / 2 * 1.1, 1.05, -L / 2 - 0.12], [W / 2 * 1.1, 1.05, -L / 2 - 0.12], 0.018, 0.018, 8);
    for (const s of [-1, 1]) k.seg('chrome', [s * W / 2 * 1.08, y1, -L / 2], [s * W / 2 * 1.1, 1.05, -L / 2 - 0.12], 0.008, 0.008, 4);
    for (const s of [-1, 1]) { k.seg('chrome', [s * W / 2, y0, L / 2], [s * 0.22, 0.1, L / 2 - 0.05], 0.01, 0.01, 4); k.seg('chrome', [s * W / 2, y0, -L / 2], [s * 0.22, 0.1, -L / 2 + 0.05], 0.01, 0.01, 4); }
    k.seg('chrome', [-0.22, 0.1, L / 2 - 0.05], [-0.22, 0.1, -L / 2 + 0.05], 0.01, 0.01, 4); k.seg('chrome', [0.22, 0.1, L / 2 - 0.05], [0.22, 0.1, -L / 2 + 0.05], 0.01, 0.01, 4);
    for (const x of [-0.22, 0.22]) for (const z of [-L / 2 + 0.05, L / 2 - 0.05]) k.cyl('rubber', [x, 0.05, z], 0.05, 0.03, [0, 0, HALF], { segs: 12 });
    return { name: 'Shopping cart', phys: { mass: 12 } };
  },
  stroller(k, a) {
    const col = k.color('#3a5a8a');
    k.dome('f:' + col, [0, 0.62, 0], 0.32, [HALF, 0, 0], { scl: [0.9, 1, 0.8], t1: HALF });
    k.rbox('f:' + col, [0, 0.58, 0.05], [0.42, 0.22, 0.6], 0.1);
    k.dome('f:#' + new THREE.Color(col).multiplyScalar(0.7).getHexString(), [0, 0.66, -0.15], 0.3, [-0.6, 0, 0], { t1: HALF, scl: [0.8, 1, 1] });
    for (const s of [-1, 1]) {
      k.seg('chrome', [s * 0.2, 0.5, -0.25], [s * 0.2, 0.15, 0.3], 0.01, 0.01, 6);
      k.seg('chrome', [s * 0.2, 0.5, 0.25], [s * 0.2, 0.15, -0.3], 0.01, 0.01, 6);
      k.seg('chrome', [s * 0.2, 0.5, -0.25], [s * 0.2, 1.0, -0.5], 0.01, 0.01, 6);
      for (const z of [-0.3, 0.3]) k.torus('tire', [s * 0.22, 0.13, z], 0.11, 0.02, [0, HALF, 0], TAU, 20);
    }
    k.seg('rubber', [-0.21, 1.0, -0.5], [0.21, 1.0, -0.5], 0.018, 0.018, 8);
    return { name: 'Baby stroller', phys: { mass: 8 } };
  },
};

function food2(name, mass) {
  return { name, phys: { mass }, interact: { label: () => `Take a bite of the ${name.toLowerCase()}`, action: (e) => { sound(e, 'pop'); if (G.registry) G.registry.remove(e.id); if (G.ui) G.ui.toast('Crunchy!'); } } };
}
function rAt(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return r0 + (r1 - r0) * ((y - y0) / ((y1 - y0) || 1));
  }
  return 0;
}
