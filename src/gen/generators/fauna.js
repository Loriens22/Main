// ---------------------------------------------------------------------------
// Birds, fish, snakes and blobs.
//
//  birds: SDF bodies with separately animated wings. Fliers circle, soar and
//         land near their home; ground birds (chicken, duck, penguin,
//         flamingo) walk with an NPC brain; the phoenix trails fire.
//  fish:  SDF bodies swimming below the water surface (lake, generated lakes
//         or the underwater dimension); whales surface and spout, dolphins
//         leap. With no water nearby a glass aquarium is built for them.
//  snake: a tube whose spine follows a travelling wave along its path.
//  blob:  jiggly translucent slimes that hop after you, and floaty ghosts.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, genPreset } from '../../core/context.js';
import { SDFBuilder } from '../../core/sdf.js';
import { makeNPC } from '../../characters/npc.js';
import { NAMES } from '../lexicon.js';
import { sdfToGeometry } from './sdfkit.js';
import { animate, glowSprite, glowTexture, hsl } from './common.js';
import { markNoAO } from '../../render/renderer.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function has(a, ...ws) { return ws.some((w) => a.words.includes(w) || a.text.includes(w)); }
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
function userCol(a) { return a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : null; }

// ======================================================================
// Birds
// ======================================================================
const BIRDS = {
  bird: { L: 0.18, body: '#8a6a4a', belly: '#e8d8c0', wing: '#6a4a2a', head: '#8a6a4a', beak: '#e8a020', fly: true, sound: 'chirp' },
  eagle: { L: 0.9, body: '#4a3020', belly: '#5a3a24', wing: '#3a2414', head: '#f4f2ee', beak: '#f0c020', fly: true, soar: true, wingspan: 2.1, sound: 'chirp' },
  parrot: { L: 0.4, body: '#e02020', belly: '#e02020', wing: '#2060e0', head: '#e02020', beak: '#f0e8d0', fly: true, tailLong: 1.2, sound: 'chirp' },
  owl: { L: 0.45, body: '#8a6a4a', belly: '#d8c8a8', wing: '#6a4a30', head: '#8a6a4a', beak: '#4a3a2a', fly: true, round: true, bigEyes: true, sound: 'chirp' },
  crow: { L: 0.45, body: '#141418', belly: '#1a1a20', wing: '#101014', head: '#141418', beak: '#141414', fly: true, sound: 'chirp' },
  duck: { L: 0.5, body: '#8a7a6a', belly: '#c8b8a8', wing: '#6a5a4a', head: '#1a6a3a', beak: '#f0a020', swim: true, sound: 'chirp' },
  chicken: { L: 0.45, body: '#f4f0e8', belly: '#f4f0e8', wing: '#e8e0d0', head: '#f4f0e8', beak: '#f0b020', comb: true, ground: true, sound: 'chirp' },
  penguin: { L: 0.7, body: '#141418', belly: '#f4f4f2', wing: '#141418', head: '#141418', beak: '#f08020', upright: true, ground: true, sound: 'chirp' },
  flamingo: { L: 0.6, body: '#f890b0', belly: '#f8a0c0', wing: '#f07090', head: '#f890b0', beak: '#1a1a1a', legs: 1.0, neck: 0.6, ground: true, sound: 'chirp' },
  phoenix: { L: 1.2, body: '#ff5010', belly: '#ffa020', wing: '#ff3000', head: '#ffc020', beak: '#ffe080', fly: true, soar: true, wingspan: 2.6, fire: true, tailLong: 1.8, sound: 'chirp' },
  butterfly: { L: 0.05, butterfly: true, fly: true },
};

function wingGeometry(span, chord, feathers = 7) {
  // Planform: leading edge straight-ish, trailing edge with feather notches.
  const s = new THREE.Shape();
  s.moveTo(0, chord * 0.5);
  s.quadraticCurveTo(span * 0.6, chord * 0.55, span, chord * 0.1);
  for (let i = feathers; i >= 0; i--) {
    const f = i / feathers;
    const x = span * (0.35 + f * 0.62);
    s.lineTo(x, -chord * (0.35 + (1 - f) * 0.15));
    s.lineTo(x - span * 0.03, -chord * 0.2);
  }
  s.lineTo(0, -chord * 0.5);
  s.lineTo(0, chord * 0.5);
  const g = new THREE.ShapeGeometry(s, 3);
  g.rotateX(-Math.PI / 2);
  return g;
}

function* buildBird(ctx, item, rng) {
  const a = item.attrs;
  const sp = BIRDS[item.params.species] ? item.params.species : 'bird';
  const B = { ...BIRDS[sp] };
  const scale = clamp(a.sizeMul || 1, 0.3, 10);
  const L = B.L * scale;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  let wingL, wingR, flap = 0;
  if (B.butterfly) {
    const col = userCol(a) || hsl(rng.range(0, 1), 0.85, 0.55);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = col; g.beginPath(); g.ellipse(64, 50, 60, 45, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(50, 100, 40, 28, 0.3, 0, TAU); g.fill();
    g.fillStyle = '#1a1a1a'; g.lineWidth = 6; g.strokeStyle = '#1a1a1a'; g.beginPath(); g.ellipse(64, 50, 60, 45, 0, 0, TAU); g.stroke();
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#1a1a1a'; g.beginPath(); g.arc(30 + i * 15, 30 + (i % 3) * 20, 6, 0, TAU); g.fill(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const wm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6 });
    const wg = new THREE.PlaneGeometry(0.06 * scale, 0.06 * scale); wg.translate(0.03 * scale, 0, 0); wg.rotateX(-Math.PI / 2);
    wingL = new THREE.Mesh(wg, wm); wingR = new THREE.Mesh(wg, wm); wingR.scale.x = -1;
    const thorax = mesh(new THREE.CapsuleGeometry(0.004 * scale, 0.03 * scale, 4, 6).rotateX(Math.PI / 2), G.materials.plain('#1a1a1a'));
    body.add(thorax, wingL, wingR);
  } else {
    ctx.stage('geometry', 'Sculpting ' + sp);
    const sdf = new SDFBuilder();
    const up = B.upright ? 1 : 0;
    const bodyC = [0, L * (B.legs ? B.legs + 0.2 : 0.35 + up * 0.3), 0];
    sdf.ellipsoid(bodyC, [L * 0.22 * (B.round ? 1.2 : 1), L * (0.24 + up * 0.18), L * (0.42 - up * 0.2)], { mat: 'body', tag: 'body', rot: [up ? 0 : -0.2, 0, 0] });
    const neckL = L * (B.neck || 0.15);
    const headC = [0, bodyC[1] + L * (0.18 + up * 0.25) + neckL, L * (0.32 - up * 0.2) + (B.neck ? L * 0.15 : 0)];
    if (B.neck) sdf.roundCone(bodyC, headC, L * 0.06, L * 0.05, { mat: 'body', op: 'smooth', k: L * 0.05, tag: 'neck' });
    sdf.sphere(headC, L * (B.round ? 0.2 : 0.14), { mat: 'head', op: 'smooth', k: L * 0.08, tag: 'head' });
    const beakBase = [headC[0], headC[1] - L * 0.02, headC[2] + L * 0.12];
    sdf.roundCone(beakBase, [beakBase[0], beakBase[1] - L * (sp === 'eagle' || sp === 'parrot' || sp === 'owl' ? 0.07 : 0.02) - (sp === 'flamingo' ? L * 0.1 : 0), beakBase[2] + L * (sp === 'duck' ? 0.16 : 0.12)], L * (sp === 'duck' ? 0.05 : 0.035), L * 0.008, { mat: 'beak', op: 'smooth', k: L * 0.01, tag: 'beak', priority: 2 });
    if (B.comb) sdf.ellipsoid([headC[0], headC[1] + L * 0.14, headC[2]], [L * 0.02, L * 0.06, L * 0.08], { mat: 'beak', tag: 'comb', priority: 2 });
    // Tail.
    const tl = L * (B.tailLong || 0.4);
    sdf.ellipsoid([0, bodyC[1] + L * 0.05, bodyC[2] - L * 0.35 - tl * 0.35], [L * 0.12, L * 0.03, tl * 0.5], { mat: 'wing', op: 'smooth', k: L * 0.05, tag: 'tail', rot: [0.25, 0, 0] });
    // Legs.
    const legH = L * (B.legs || 0.25 + up * 0.05);
    for (const s of [-1, 1]) {
      sdf.capsule([s * L * 0.07, bodyC[1] - L * 0.15, 0], [s * L * 0.07, 0.02, L * 0.02], L * (B.legs ? 0.012 : 0.02), { mat: 'beak', tag: 'leg' });
      sdf.ellipsoid([s * L * 0.07, 0.01, L * 0.06], [L * 0.05, L * 0.01, L * 0.07], { mat: 'beak', tag: 'foot' });
    }
    if (B.upright) for (const s of [-1, 1]) sdf.ellipsoid([s * L * 0.21, bodyC[1] + L * 0.05, 0], [L * 0.03, L * 0.3, L * 0.1], { mat: 'wing', op: 'smooth', k: L * 0.03, tag: 'flipper', rot: [0, 0, s * 0.15] });
    const voxel = clamp(L * 0.02 / Math.max(0.5, genPreset().detail), 0.002, 0.05);
    const cols = { body: new THREE.Color(userCol(a) || B.body), belly: new THREE.Color(B.belly), head: new THREE.Color(B.head), wing: new THREE.Color(B.wing) };
    const colorFn = (i, m, prim) => {
      const y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
      if (prim.mat === 'head') return [cols.head.r, cols.head.g, cols.head.b];
      if (prim.mat === 'wing') return [cols.wing.r, cols.wing.g, cols.wing.b];
      const under = clamp((bodyC[1] - y) / (L * 0.2) + (B.upright && z > 0 ? 1 : 0), 0, 1);
      const c = cols.body.clone().lerp(cols.belly, under);
      return [c.r, c.g, c.b];
    };
    const { geometry } = yield* sdfToGeometry(sdf, ctx, { voxel, matOrder: ['body', 'head', 'beak', 'wing'], colorFn, aoMin: 0.4, onProgress: (f) => ctx.progress(f * 0.9) });
    const feather = G.materials.get('fur', { color: '#ffffff', vertexColors: true, world: 0.1 });
    const beakM = G.materials.get('glossyPlastic', { color: B.beak });
    const mats = B.fire ? [G.materials.get('emissive', { color: '#ff6010', emissiveIntensity: 2, vertexColors: true }), G.materials.get('emissive', { color: '#ffc020', emissiveIntensity: 2.5 }), beakM, G.materials.get('emissive', { color: '#ff3000', emissiveIntensity: 2.5 })] : [feather, feather, beakM, feather];
    const bm = mesh(geometry, mats);
    body.add(bm);
    // Eyes.
    for (const s of [-1, 1]) {
      const er = L * (B.bigEyes ? 0.05 : 0.022);
      const eye = mesh(new THREE.SphereGeometry(er, 10, 8), B.bigEyes ? G.materials.get('emissive', { color: '#f0a020', emissiveIntensity: 0.6 }) : G.materials.plain('#0a0a0a', 0.1), false);
      eye.position.set(s * L * (B.bigEyes ? 0.08 : 0.11), headC[1] + L * 0.03, headC[2] + L * (B.bigEyes ? 0.14 : 0.07));
      body.add(eye);
    }
    // Wings (separate meshes for flapping).
    const span = (B.wingspan || 1.3) * L * 0.5;
    const wg = wingGeometry(span, L * 0.35);
    const wmat = B.fire ? G.materials.get('emissive', { color: B.wing, emissiveIntensity: 2.5, side: THREE.DoubleSide }) : G.materials.get('fur', { color: userCol(a) && !B.fire ? userCol(a) : B.wing, side: THREE.DoubleSide, world: 0.1 });
    wingL = new THREE.Mesh(wg, wmat); wingR = new THREE.Mesh(wg, wmat); wingR.scale.x = -1;
    wingL.castShadow = wingR.castShadow = true;
    const wy = bodyC[1] + L * 0.12;
    wingL.position.set(L * 0.15, wy, bodyC[2]); wingR.position.set(-L * 0.15, wy, bodyC[2]);
    if (!B.upright) body.add(wingL, wingR);
  }
  ctx.stage('textures', 'Finishing');
  yield;
  const data = { root, name: sp === 'bird' ? rng.pick(['Sparrow', 'Robin', 'Finch', 'Songbird']) : sp[0].toUpperCase() + sp.slice(1), category: 'animal', icon: item.icon, height: L, footprint: { radius: Math.max(0.2, L * 0.5) } };
  if (B.fire) {
    const glow = glowSprite('#ff8020', L * 3, 0.6); glow.position.y = L * 0.4; body.add(glow);
    data.lights = [{ pos: [0, L * 0.4, 0], color: '#ff7020', intensity: 3, distance: 10, nightOnly: false, object: body }];
  }
  // Behaviour.
  if (B.fly && !B.ground) {
    // Circle/soar around home, periodically landing.
    const st = { t: rng.range(0, 100), mode: 'fly', timer: rng.range(8, 20), alt: rng.range(4, 12) * Math.max(1, scale * 0.5), radius: rng.range(6, 16), dir: rng.chance(0.5) ? 1 : -1 };
    const home = new THREE.Vector3();
    const flying = new THREE.Vector3();
    data.floating = true; data.floatHeight = st.alt;
    data.onAdded = function () { home.copy(this.root.position); home.y -= st.alt; flying.copy(this.root.position); };
    data.update = function (dt, t) {
      const world = G.worlds.get(this.worldId);
      if (!world) return;
      st.t += dt; st.timer -= dt;
      const r = this.root;
      if (st.mode === 'fly') {
        const ang = st.t * (B.soar ? 0.25 : 0.6) * st.dir * (8 / st.radius);
        const tx = home.x + Math.cos(ang) * st.radius, tz = home.z + Math.sin(ang) * st.radius;
        const ty = Math.max(world.heightAt(tx, tz), world.waterAt ? world.waterAt(tx, tz) : -1e9) + st.alt + Math.sin(st.t * 0.7) * 1.5;
        const prev = r.position.clone();
        r.position.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 2));
        const v = r.position.clone().sub(prev);
        if (v.lengthSq() > 1e-8) r.rotation.y = Math.atan2(v.x, v.z);
        body.rotation.z = -st.dir * (B.soar ? 0.35 : 0.2);
        flap += dt * (B.butterfly ? 30 : B.soar && Math.sin(st.t * 0.3) > -0.3 ? 2 : 14);
        const amp = B.soar && Math.sin(st.t * 0.3) > -0.3 ? 0.12 : 0.8;
        wingL.rotation.z = Math.sin(flap) * amp + (B.soar ? 0.05 : 0); wingR.rotation.z = -wingL.rotation.z;
        if (st.timer < 0 && !B.butterfly) { st.mode = 'land'; st.timer = rng.range(4, 10); }
      } else {
        const g = world.colliders.groundHeight(r.position.x, r.position.z, 0.1, r.position.y + 0.5, 60);
        r.position.y += (g - r.position.y) * Math.min(1, dt * 2);
        body.rotation.z *= 0.9;
        const onGround = r.position.y - g < 0.05;
        wingL.rotation.z = onGround ? -0.1 : Math.sin((flap += dt * 12)) * 0.7; wingR.rotation.z = -wingL.rotation.z;
        if (onGround) body.rotation.x = Math.sin(st.t * 3) > 0.7 ? 0.4 : 0; // pecking
        if (st.timer < 0 || (G.player && G.player.position.distanceTo(r.position) < 2.5)) { st.mode = 'fly'; st.timer = rng.range(10, 25); if (G.audio) G.audio.play('chirp', r.position); }
      }
      if (rng.chance(dt * 0.1) && G.audio) G.audio.play('chirp', r.position);
    };
    data.interact = { label: () => `Watch the ${data.name.toLowerCase()}`, action: () => { st.mode = 'fly'; st.timer = 20; st.alt = Math.max(2, st.alt - 1); G.ui.toast(`The ${data.name.toLowerCase()} swoops around you!`); } };
  } else {
    // Ground birds: walking NPC with a waddle.
    let walkPhase = 0;
    const creature = {
      update: (dt, s) => {
        walkPhase += dt * (s.speed || 0) * 8;
        body.rotation.z = Math.sin(walkPhase) * (B.upright ? 0.12 : 0.05);
        body.position.y = Math.abs(Math.sin(walkPhase)) * L * 0.03;
        if (wingL) { wingL.rotation.z = -0.1 + (s.speed > 2 ? Math.sin(walkPhase * 3) * 0.6 : 0); wingR.rotation.z = -wingL.rotation.z; }
      },
      vocalize: () => G.audio && G.audio.play('chirp', root.position),
      happy: () => { body.rotation.x = -0.2; setTimeout(() => (body.rotation.x = 0), 400); },
    };
    makeNPC(data, { creature, rng: rng.fork('mind'), seed: rng.nextU32(), personalityInfo: { name: rng.pick(NAMES.animal), animal: true, species: sp }, radius: Math.max(0.15, L * 0.3), subtitle: data.name, brainOpts: { animal: true, walkSpeed: 0.6 * Math.sqrt(scale), runSpeed: 2.5, radius: Math.max(0.15, L * 0.3), wanderRadius: 5 } });
    if (B.swim) data.wantsWater = true;
  }
  return data;
}

// ======================================================================
// Fish
// ======================================================================
const FISH = {
  fish: { L: 0.35, colors: ['#f08020', '#f0c020', '#4080f0', '#e04040', '#40c0a0'], depth: 1.2 },
  shark: { L: 3.2, colors: ['#6a7480'], belly: '#e8e8e8', depth: 2.5, dorsal: 1.6, sound: 'roar' },
  whale: { L: 14, colors: ['#3a4a5a'], belly: '#c8c8c0', depth: 6, surface: true, fluke: true },
  dolphin: { L: 2.3, colors: ['#8a98a8'], belly: '#e8eef2', depth: 1.5, jump: true, beak: true },
  octopus: { L: 1.2, octopus: true, colors: ['#d8603a', '#a0306a', '#8a4ad0'] },
  jellyfish: { L: 0.6, jelly: true, colors: ['#ff80d0', '#80c0ff', '#c0a0ff'] },
};

function* buildFish(ctx, item, rng, env) {
  const a = item.attrs;
  const sp = FISH[item.params.species] ? item.params.species : 'fish';
  const F = FISH[sp];
  const scale = clamp(a.sizeMul || 1, 0.2, 5);
  const L = F.L * scale;
  const col = userCol(a) || rng.pick(F.colors);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  ctx.stage('geometry', 'Sculpting ' + sp);
  yield;
  let tail = null;
  const tentacles = [];
  if (F.octopus) {
    const mat = G.materials.get('skin', { color: col });
    const head = mesh(new THREE.SphereGeometry(L * 0.3, 24, 16), mat); head.scale.set(1, 1.3, 1); head.position.y = L * 0.5; body.add(head);
    for (let i = 0; i < 8; i++) {
      const pts = []; const an = (i / 8) * TAU;
      for (let k = 0; k <= 8; k++) pts.push(new THREE.Vector3(Math.cos(an) * L * 0.1 * (1 + k * 0.8), L * 0.3 - k * L * 0.04, Math.sin(an) * L * 0.1 * (1 + k * 0.8)));
      const curve = new THREE.CatmullRomCurve3(pts);
      const tm = mesh(new THREE.TubeGeometry(curve, 16, L * 0.04, 6), mat);
      body.add(tm); tentacles.push({ tm, pts, an, curve });
    }
    for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(L * 0.05, 10, 8), G.materials.plain('#f0e8c0', 0.2)); e.position.set(s * L * 0.15, L * 0.5, L * 0.22); body.add(e); }
  } else if (F.jelly) {
    const bellMat = new THREE.MeshPhysicalMaterial({ color: col, transparent: true, opacity: 0.55, roughness: 0.1, emissive: col, emissiveIntensity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const bell = mesh(new THREE.SphereGeometry(L * 0.5, 24, 12, 0, TAU, 0, Math.PI / 2), bellMat, false); body.add(bell);
    for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, (_, k) => new THREE.Vector3(Math.cos(an) * L * 0.3, -k * L * 0.15, Math.sin(an) * L * 0.3))); const ln = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 })); body.add(ln); tentacles.push({ ln, an }); }
    tail = bell;
  } else {
    const sdf = new SDFBuilder();
    sdf.ellipsoid([0, 0, 0], [L * 0.12, L * 0.16, L * 0.5], { mat: 'body', tag: 'body' });
    if (F.beak) sdf.roundCone([0, 0, L * 0.4], [0, -L * 0.02, L * 0.62], L * 0.06, L * 0.03, { mat: 'body', op: 'smooth', k: L * 0.05 });
    sdf.ellipsoid([0, L * 0.12, -L * 0.05], [L * 0.015, L * 0.12 * (F.dorsal || 1), L * 0.12], { mat: 'body', op: 'smooth', k: L * 0.03, rot: [-0.5, 0, 0], tag: 'fin' });
    for (const s of [-1, 1]) sdf.ellipsoid([s * L * 0.12, -L * 0.07, L * 0.12], [L * 0.1, L * 0.012, L * 0.06], { mat: 'body', op: 'smooth', k: L * 0.02, rot: [0, s * 0.6, s * -0.4], tag: 'fin' });
    const voxel = clamp(L * 0.018, 0.003, 0.2);
    const base = new THREE.Color(col), belly = new THREE.Color(F.belly || col).lerp(new THREE.Color('#ffffff'), F.belly ? 0 : 0.5);
    const stripe = sp === 'fish' && rng.chance(0.5);
    const colorFn = (i, m) => { const y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2]; const c = base.clone().lerp(belly, clamp(-y / (L * 0.1) + 0.3, 0, 1)); if (stripe && Math.sin(z / L * 18) > 0.6) c.lerp(new THREE.Color('#ffffff'), 0.8); return [c.r, c.g, c.b]; };
    const { geometry } = yield* sdfToGeometry(sdf, ctx, { voxel, matOrder: ['body'], colorFn, aoMin: 0.5 });
    const mat = G.materials.get(sp === 'fish' ? 'scales' : 'skin', { color: '#ffffff', vertexColors: true, world: L * 0.4 });
    body.add(mesh(geometry, mat));
    // Tail fin (separate for wagging).
    const tg = new THREE.Group(); tg.position.z = -L * 0.45;
    const ts = new THREE.Shape(); ts.moveTo(0, 0); ts.lineTo(-L * 0.28, L * 0.22); ts.quadraticCurveTo(-L * 0.18, 0, -L * 0.28, -L * 0.22); ts.lineTo(0, 0);
    const tailGeo = new THREE.ShapeGeometry(ts); tailGeo.rotateY(Math.PI / 2);
    if (F.fluke) tailGeo.rotateZ(Math.PI / 2);
    const tm = mesh(tailGeo, G.materials.get('skin', { color: col, side: THREE.DoubleSide }));
    tg.add(tm); body.add(tg); tail = tg;
    for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(L * 0.025, 8, 6), G.materials.plain('#0a0a0a', 0.1), false); e.position.set(s * L * 0.1, L * 0.04, L * 0.32); body.add(e); }
  }
  ctx.stage('textures', 'Finishing');
  yield;
  const world = env.world;
  const data = { root, name: sp === 'fish' ? rng.pick(['Goldfish', 'Clownfish', 'Trout', 'Koi', 'Angelfish']) : sp[0].toUpperCase() + sp.slice(1), category: 'animal', icon: item.icon, height: L * 0.3, footprint: { radius: Math.max(0.3, L * 0.5) }, suppressGrass: false, wantsWater: true, preferPlacement: 'onWater' };
  // Aquarium fallback when there is no water near the player.
  const pp = G.player ? G.player.position : new THREE.Vector3();
  const hasWater = world.rules.water || (world.lake && Math.hypot(pp.x - world.lake.x, pp.z - world.lake.z) < world.lake.r + 120) || world.waterVolumes.length > 0;
  let tank = null;
  if (!hasWater && L < 3) {
    tank = { w: Math.max(1.2, L * 4), h: Math.max(0.8, L * 2.5), d: Math.max(0.6, L * 2.5) };
    const glass = mesh(new THREE.BoxGeometry(tank.w, tank.h, tank.d), G.materials.get('glass', { color: '#d0f0ff', opacity: 0.18 }), false);
    glass.position.y = 0.8 + tank.h / 2; root.add(glass);
    const water = mesh(new THREE.BoxGeometry(tank.w * 0.98, tank.h * 0.88, tank.d * 0.98), G.materials.get('water', { color: '#60b0d0', opacity: 0.35 }), false);
    water.position.y = 0.8 + tank.h * 0.44; root.add(water);
    const stand = mesh(new THREE.BoxGeometry(tank.w, 0.8, tank.d), G.materials.get('darkWood')); stand.position.y = 0.4; root.add(stand);
    const gravel = mesh(new THREE.BoxGeometry(tank.w * 0.98, 0.06, tank.d * 0.98), G.materials.get('gravel', { color: '#c8b890' }), false); gravel.position.y = 0.83; root.add(gravel);
    data.preferPlacement = undefined; data.wantsWater = false;
    data.colliderDefs = [{ type: 'box', x: 0, z: 0, y0: 0, y1: 0.8 + tank.h, hx: tank.w / 2, hz: tank.d / 2 }];
    data.name += ' in an aquarium';
    data.height = 0.8 + tank.h;
    body.scale.setScalar(Math.min(1, (tank.w * 0.3) / L));
  }
  const st = { t: rng.range(0, 100), jump: -1, spout: 0, r: tank ? 0 : rng.range(3, 8) * Math.max(1, L * 0.3), dir: rng.chance(0.5) ? 1 : -1 };
  const home = new THREE.Vector3();
  data.onAdded = function () { home.copy(this.root.position); };
  data.update = function (dt, t) {
    const w = G.worlds.get(this.worldId);
    if (!w) return;
    st.t += dt;
    const r = this.root;
    if (tank) {
      const a2 = st.t * 0.5 * st.dir;
      body.position.set(Math.cos(a2) * tank.w * 0.3, 0.8 + tank.h * 0.45 + Math.sin(st.t * 0.8) * tank.h * 0.15, Math.sin(a2) * tank.d * 0.25);
      body.rotation.y = -a2 + (st.dir > 0 ? Math.PI : 0);
    } else if (F.octopus) {
      const ground = w.heightAt(r.position.x, r.position.z);
      r.position.y = ground;
      for (const tt of tentacles) {
        const pts = tt.pts.map((p, k) => new THREE.Vector3(p.x + Math.sin(st.t * 2 + k * 0.6 + tt.an * 3) * L * 0.04 * k, p.y + Math.sin(st.t * 1.5 + k) * L * 0.02 * k, p.z + Math.cos(st.t * 2 + k * 0.6 + tt.an * 3) * L * 0.04 * k));
        tt.tm.geometry.dispose();
        tt.tm.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, L * 0.04, 6);
      }
    } else {
      const ang = st.t * 0.35 * st.dir * (6 / Math.max(2, st.r));
      const tx = home.x + Math.cos(ang) * st.r, tz = home.z + Math.sin(ang) * st.r;
      const surf = w.rules.water ? w.heightAt(tx, tz) + 3 + Math.sin(st.t * 0.3) * 2 : (w.waterAt ? w.waterAt(tx, tz) : w.waterLevel);
      const floor = w.heightAt(tx, tz);
      let ty = w.rules.water ? surf : Math.max(floor + L * 0.3, surf - (F.depth || 1) * Math.max(0.5, Math.min(1, (surf - floor) / 3)));
      if (F.jump) { if (st.jump < 0 && rng.chance(dt * 0.12)) st.jump = 0; if (st.jump >= 0) { st.jump += dt; ty = surf + Math.sin(Math.min(1, st.jump / 1.2) * Math.PI) * 2.5 - 0.5; body.rotation.x = -Math.cos(Math.min(1, st.jump / 1.2) * Math.PI) * 0.8; if (st.jump > 1.2) { st.jump = -1; body.rotation.x = 0; if (G.audio) G.audio.play('splash', r.position); } } }
      if (F.surface) { const s2 = Math.sin(st.t * 0.15); ty = s2 > 0.85 ? surf - L * 0.08 : ty; if (s2 > 0.95 && st.spout <= 0) { st.spout = 3; spout(r, L); } st.spout -= dt; }
      if (F.jelly) ty = (w.rules.water ? surf : surf - 1) + Math.sin(st.t * 0.6) * 0.5;
      const prev = r.position.clone();
      r.position.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 1.5));
      const v = r.position.clone().sub(prev);
      if (v.lengthSq() > 1e-8 && !F.jelly) r.rotation.y = Math.atan2(v.x, v.z);
    }
    if (tail && !F.jelly) tail.rotation.y = Math.sin(st.t * (F.fluke ? 2 : 8)) * 0.4;
    if (!tank && !F.jelly && !F.octopus) body.rotation.y = Math.sin(st.t * 8) * 0.05;
    if (F.jelly) { const p = 1 + Math.sin(st.t * 2.5) * 0.12; tail.scale.set(p, 2 - p, p); }
  };
  if (F.octopus || F.jelly) data.lights = F.jelly ? [{ pos: [0, 0, 0], color: col, intensity: 1.5, distance: 5, nightOnly: false, object: body }] : null;
  data.interact = { label: () => `Look at the ${data.name.toLowerCase()}`, action: () => { st.dir *= -1; G.ui.toast(`The ${data.name.toLowerCase()} swims the other way.`); } };
  return data;
}

function spout(root, L) {
  const N = 120;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(N * 3), v = [];
  for (let i = 0; i < N; i++) v.push([(Math.random() - 0.5) * 1.5, 6 + Math.random() * 4, (Math.random() - 0.5) * 1.5]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#e8f4ff', size: 0.3, transparent: true, opacity: 0.7, depthWrite: false, map: glowTexture() }));
  pts.position.set(0, L * 0.12, L * 0.2); pts.frustumCulled = false; pts.userData.noRaycast = true;
  root.add(pts);
  let life = 0;
  const upd = (t, dt) => {
    life += dt;
    for (let i = 0; i < N; i++) { p[i * 3] = v[i][0] * life; p[i * 3 + 1] = v[i][1] * life - 4.9 * life * life; p[i * 3 + 2] = v[i][2] * life; }
    g.attributes.position.needsUpdate = true;
    if (life > 2.2) { root.remove(pts); g.dispose(); pts.material.dispose(); const arr = root.userData.animated; arr.splice(arr.indexOf(upd), 1); }
  };
  animate(root, upd);
}

// ======================================================================
// Snake
// ======================================================================
function* buildSnake(ctx, item, rng) {
  const a = item.attrs;
  const L = rng.range(1.6, 3.2) * clamp(a.sizeMul || 1, 0.2, 10);
  const R = L * 0.022;
  ctx.stage('geometry', 'Growing scales');
  yield;
  const col = userCol(a) || rng.pick(['#3a6a2a', '#8a6a2a', '#1a1a1a', '#c8a020', '#6a3a1a']);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = col; g.fillRect(0, 0, 512, 64);
  const pattern = rng.pick(['diamond', 'bands', 'spots']);
  g.fillStyle = new THREE.Color(col).multiplyScalar(0.45).getStyle();
  for (let x = 0; x < 512; x += 32) {
    if (pattern === 'diamond') { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 12); g.lineTo(x + 32, 32); g.lineTo(x + 16, 52); g.fill(); }
    else if (pattern === 'bands') { g.fillStyle = x % 64 ? '#f0e0a0' : '#1a1a1a'; g.fillRect(x, 0, 12, 64); }
    else { g.beginPath(); g.arc(x + 16, 20 + (x % 64 ? 20 : 0), 7, 0, TAU); g.fill(); }
  }
  g.fillStyle = 'rgba(255,240,200,0.5)'; g.fillRect(0, 50, 512, 14);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.6 });
  const N = 48;
  const spine = Array.from({ length: N }, (_, i) => new THREE.Vector3(0, R, -i * (L / N)));
  let tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spine), N * 2, R, 10), mat);
  const root = new THREE.Group();
  root.add(tube);
  const head = new THREE.Group();
  const hm = mesh(new THREE.SphereGeometry(R * 1.6, 16, 10), mat); hm.scale.set(1, 0.7, 1.5); head.add(hm);
  for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(R * 0.35, 8, 6), G.materials.get('emissive', { color: '#f0c020', emissiveIntensity: 0.5 }), false); e.position.set(s * R * 0.9, R * 0.4, R * 1.1); head.add(e); }
  const tongue = mesh(new THREE.BoxGeometry(R * 0.2, R * 0.05, R * 2), G.materials.plain('#c01a2a', 0.4), false); tongue.position.z = R * 2.2; head.add(tongue);
  root.add(head);
  // Taper the tube by scaling each ring (tail thinner).
  const taper = (geo) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const ring = Math.floor(i / 11) / (N * 2);
      const k = ring > 0.6 ? 1 - (ring - 0.6) / 0.4 * 0.85 : 1;
      const c = spineAt(ring);
      p.setX(i, c.x + (p.getX(i) - c.x) * k); p.setY(i, c.y + (p.getY(i) - c.y) * k); p.setZ(i, c.z + (p.getZ(i) - c.z) * k);
    }
    geo.computeVertexNormals();
  };
  let curve = new THREE.CatmullRomCurve3(spine);
  const spineAt = (u) => curve.getPointAt(Math.min(1, Math.max(0, u)));
  taper(tube.geometry);
  const st = { t: 0, dir: rng.range(0, TAU), speed: 0.5, timer: 3 };
  const data = { root, name: rng.pick(['Python', 'Garter snake', 'Rattlesnake', 'Cobra', 'Viper']), category: 'animal', icon: item.icon, height: R * 3, footprint: { radius: L * 0.3 }, suppressGrass: false };
  let acc = 0;
  data.update = function (dt, t) {
    const w = G.worlds.get(this.worldId);
    if (!w) return;
    st.t += dt; st.timer -= dt;
    if (st.timer < 0) { st.timer = rng.range(2, 6); st.dir += rng.range(-1.5, 1.5); st.speed = rng.chance(0.3) ? 0 : rng.range(0.3, 0.9); }
    const r = this.root;
    // Head leads; the body follows a travelling sine wave behind it (local frame).
    r.position.x += Math.sin(st.dir) * st.speed * dt; r.position.z += Math.cos(st.dir) * st.speed * dt;
    r.position.y = w.heightAt(r.position.x, r.position.z);
    r.rotation.y += ((st.dir) - r.rotation.y) * Math.min(1, dt * 2);
    acc += dt;
    if (acc < 0.05) return;
    acc = 0;
    const ph = st.t * 4 * (0.3 + st.speed);
    for (let i = 0; i < N; i++) { const u = i / N; spine[i].set(Math.sin(ph - u * 12) * L * 0.06 * Math.min(1, u * 5), R, -u * L); }
    curve = new THREE.CatmullRomCurve3(spine);
    tube.geometry.dispose();
    tube.geometry = new THREE.TubeGeometry(curve, N * 2, R, 10);
    taper(tube.geometry);
    head.position.set(spine[0].x, R, R * 0.8);
    tongue.visible = Math.sin(st.t * 5) > 0.6;
  };
  data.interact = { label: () => 'Stay back from the snake', action: () => { st.speed = 1.5; st.dir += Math.PI; if (G.audio) G.audio.play('bark', data.root.position, { pitch: 900 }); G.ui.toast('Hsssss!'); } };
  return data;
}

// ======================================================================
// Blobs: slime & ghost
// ======================================================================
function* buildBlob(ctx, item, rng) {
  const a = item.attrs;
  const kind = item.params.kind;
  const S = rng.range(0.5, 0.8) * clamp(a.sizeMul || 1, 0.2, 8);
  ctx.stage('geometry', kind === 'ghost' ? 'Summoning a ghost' : 'Mixing slime');
  yield;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  let blob;
  if (kind === 'ghost') {
    const g = new THREE.SphereGeometry(S * 0.5, 32, 24, 0, TAU, 0, Math.PI * 0.62);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) p.setY(i, y * 3.2); }
    g.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ color: userCol(a) || '#f0f4ff', transparent: true, opacity: 0.72, roughness: 0.3, emissive: userCol(a) || '#a0c0ff', emissiveIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    blob = mesh(g, mat, false);
    body.add(blob);
    for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(S * 0.07, 10, 8), G.materials.plain('#0a0a14', 0.3), false); e.scale.y = 1.5; e.position.set(s * S * 0.14, S * 0.05, S * 0.45); body.add(e); }
    const mouth = mesh(new THREE.SphereGeometry(S * 0.06, 10, 8), G.materials.plain('#0a0a14', 0.3), false); mouth.scale.set(1, 1.5, 0.5); mouth.position.set(0, -S * 0.12, S * 0.47); body.add(mouth);
    body.position.y = S * 1.2;
  } else {
    const col = userCol(a) || rng.pick(['#40e060', '#40a0ff', '#ff60b0', '#ffd040', '#b060ff']);
    const g = new THREE.SphereGeometry(S * 0.5, 40, 28);
    const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.05, transmission: 0.55, thickness: S * 0.6, ior: 1.33, clearcoat: 1, emissive: col, emissiveIntensity: 0.15 });
    blob = mesh(g, mat);
    blob.userData.base = g.attributes.position.array.slice();
    body.add(blob);
    for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(S * 0.08, 12, 8), G.materials.plain('#101014', 0.1), false); e.position.set(s * S * 0.15, S * 0.12, S * 0.42); body.add(e); const hl = mesh(new THREE.SphereGeometry(S * 0.025, 6, 4), G.materials.plain('#ffffff', 0.1), false); hl.position.set(s * S * 0.15 + S * 0.03, S * 0.15, S * 0.49); body.add(hl); }
    body.position.y = S * 0.45;
  }
  const data = { root, name: kind === 'ghost' ? 'Ghost' : 'Slime', category: 'creature', icon: item.icon, height: kind === 'ghost' ? S * 2 : S, footprint: { radius: S * 0.5 } };
  let hop = 0, squash = 0, t0 = rng.range(0, 10);
  const creature = {
    update: (dt, s) => {
      t0 += dt;
      if (kind === 'ghost') {
        body.position.y = S * 1.2 + Math.sin(t0 * 1.3) * S * 0.15;
        body.rotation.z = Math.sin(t0 * 0.9) * 0.1;
        const p = blob.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -S * 0.2) p.setX(i, p.getX(i) + Math.sin(t0 * 3 + y * 8 + i) * 0.0008); }
        p.needsUpdate = true;
        blob.material.opacity = 0.55 + Math.sin(t0 * 2) * 0.15;
      } else {
        const moving = (s.speed || 0) > 0.2;
        if (moving) hop += dt * 3.2; else hop = 0;
        const jumpY = moving ? Math.abs(Math.sin(hop * Math.PI)) * S * 0.6 : 0;
        const landing = moving ? Math.max(0, 1 - Math.abs(Math.sin(hop * Math.PI)) * 4) : 0;
        squash += ((landing * 0.35 + Math.sin(t0 * 2) * 0.03) - squash) * Math.min(1, dt * 10);
        body.position.y = S * 0.45 * (1 - squash) + jumpY;
        body.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
        // Surface wobble.
        const p = blob.geometry.attributes.position, b = blob.userData.base;
        for (let i = 0; i < p.count; i++) { const x = b[i * 3], y = b[i * 3 + 1], z = b[i * 3 + 2]; const w = 1 + Math.sin(t0 * 4 + x * 12 + y * 9) * 0.025 + Math.sin(t0 * 6 + z * 14) * 0.015; p.setXYZ(i, x * w, y * w, z * w); }
        p.needsUpdate = true; blob.geometry.computeVertexNormals();
      }
    },
    vocalize: () => { if (G.audio) G.audio.play(kind === 'ghost' ? 'roar' : 'bounce', root.position, { v: 3 }); },
    happy: () => { squash = -0.3; },
  };
  makeNPC(data, {
    creature, rng: rng.fork('mind'), seed: rng.nextU32(),
    personalityInfo: { name: kind === 'ghost' ? rng.pick(['Boo', 'Casper', 'Wisp', 'Specter', 'Mist']) : rng.pick(['Gloop', 'Jelly', 'Bloop', 'Squish', 'Goo']), animal: kind !== 'ghost', species: kind, traits: kind === 'ghost' ? ['mysterious'] : ['cheerful'] },
    radius: S * 0.4, subtitle: data.name,
    brainOpts: { animal: kind !== 'ghost', walkSpeed: kind === 'ghost' ? 0.8 : 1.2, runSpeed: kind === 'ghost' ? 2 : 3, radius: S * 0.4, wanderRadius: 5, flying: kind === 'ghost' },
  });
  if (kind === 'ghost') {
    data.lights = [{ pos: [0, S * 1.2, 0], color: '#a0c0ff', intensity: 1.2, distance: 5, nightOnly: true }];
    data.name = 'Ghost';
  }
  return data;
}

export const birdGen = { maxCount: 16, estimate: () => 2, stages: () => [{ name: 'geometry', label: 'Sculpting', weight: 3 }, { name: 'textures', label: 'Feathers', weight: 1 }], build: buildBird };
export const fishGen = { maxCount: 16, estimate: () => 1.5, stages: () => [{ name: 'geometry', label: 'Sculpting', weight: 3 }, { name: 'textures', label: 'Scales', weight: 1 }], build: buildFish };
export const snakeGen = { maxCount: 8, estimate: () => 1, stages: () => [{ name: 'geometry', label: 'Growing', weight: 3 }], build: buildSnake };
export const blobGen = { maxCount: 12, estimate: () => 0.8, stages: () => [{ name: 'geometry', label: 'Shaping', weight: 3 }], build: buildBlob };
