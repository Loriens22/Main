// ---------------------------------------------------------------------------
// Robots. Humanoid robots and mechs are assembled from rigid mechanical
// parts (panels, joints, visors, pistons) parented to the same skeleton the
// human characters use, so the procedural animator gives them walking,
// gestures, look-at and talking for free. Robot dogs use the quadruped rig;
// drones hover and follow you; rovers trundle around on six wheels.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { computeProportions, computeJoints, buildSkeleton, B, BONE_NAMES } from '../../characters/rig.js';
import { Animator } from '../../characters/animator.js';
import { makeNPC } from '../../characters/npc.js';
import { NAMES } from '../lexicon.js';
import { glowSprite, hsl, labelTexture } from './common.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
function rbox(w, h, d, r = 0.02) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); c.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd)); const o = v.clone().sub(c); if (o.lengthSq() > 1e-10) v.copy(c).add(o.normalize().multiplyScalar(r)); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}

// Place a part between two joints (in character space) and parent it to a bone.
function limb(bone, J, a, b, radius, mat, shape = 'capsule') {
  const pa = J[a], pb = J[b];
  const d = pb.clone().sub(pa);
  const len = d.length();
  const g = shape === 'box' ? rbox(radius * 2, len, radius * 1.7, radius * 0.4) : new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 6, 12);
  const m = mesh(g, mat);
  const mid = pa.clone().add(pb).multiplyScalar(0.5);
  // Bone space: bones have identity rest rotation, so subtract the bone's rest world position.
  m.position.copy(mid).sub(J[bone.name]);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  bone.add(m);
  return m;
}
function joint(bone, J, at, r, mat) { const m = mesh(new THREE.SphereGeometry(r, 16, 12), mat); m.position.copy(J[at]).sub(J[bone.name]); bone.add(m); return m; }

class RobotHumanoid {
  constructor(opts) {
    this.opts = opts;
    this.root = new THREE.Group();
    this.meshes = [];
  }
  build(rng) {
    const o = this.opts;
    const spec = { sex: 'neutral', age: 30, height: o.height, fat: 0.1, muscle: o.bulk, headScale: o.mech ? 0.8 : 1.05 };
    const P = computeProportions(spec);
    const J = computeJoints(P);
    const { bones, skeleton, rest } = buildSkeleton(J);
    this.P = P; this.J = J; this.bones = bones; this.skeleton = skeleton; this.rest = rest;
    this.root.add(bones[0]);
    const M = G.materials;
    const paint = M.get(o.mech ? 'paintedWorn' : 'carPaint', { color: o.color, metalness: 0.6, roughness: 0.3 });
    const dark = M.get(o.mech ? 'iron' : 'darkPanels', { color3: o.glow });
    const chrome = M.get('chrome');
    const glowM = M.get('emissive', { color: o.glow, emissiveIntensity: 3 });
    const s = P.H / 1.8;
    const bn = (n) => bones[B[n]];
    // Torso & pelvis.
    const chest = mesh(rbox(P.shoulderW * 0.95, P.H * 0.22, P.H * 0.13 * (o.mech ? 1.4 : 1), 0.03 * s), paint);
    chest.position.copy(J.chest).sub(J.chest).add(new THREE.Vector3(0, P.H * 0.03, 0)); bn('chest').add(chest);
    const core = mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.02 * s, 20).rotateX(Math.PI / 2), glowM, false);
    core.position.set(0, P.H * 0.04, P.H * 0.068 * (o.mech ? 1.4 : 1)); bn('chest').add(core);
    const abs = mesh(new THREE.CylinderGeometry(P.hipW * 0.5, P.hipW * 0.62, P.H * 0.09, 12), dark); abs.position.set(0, (J.spine.y - J.hips.y) * 0.5 + 0.02 * s, 0); bn('spine').add(abs);
    const pelvis = mesh(rbox(P.hipW * 1.4, P.H * 0.07, P.H * 0.11, 0.02 * s), paint); pelvis.position.set(0, -0.02 * s, 0); bn('hips').add(pelvis);
    // Head: rounded helmet with a glowing visor (or a single cyclops eye).
    const head = new THREE.Group();
    head.position.set(0, P.headH * 0.1, 0);
    const skull = mesh(o.round ? new THREE.SphereGeometry(P.headH * 0.55, 24, 18) : rbox(P.headH * 0.85, P.headH * 0.95, P.headH * 0.9, P.headH * 0.2), paint);
    head.add(skull);
    const visor = o.cyclops ? mesh(new THREE.SphereGeometry(P.headH * 0.14, 16, 12), glowM, false) : mesh(rbox(P.headH * 0.7, P.headH * 0.2, 0.02 * s, 0.01 * s), glowM, false);
    visor.position.set(0, P.headH * 0.05, P.headH * (o.round ? 0.5 : 0.45)); head.add(visor);
    for (const sd of [-1, 1]) { const ear = mesh(new THREE.CylinderGeometry(P.headH * 0.12, P.headH * 0.12, 0.04 * s, 16).rotateZ(Math.PI / 2), dark); ear.position.set(sd * P.headH * 0.45, 0, 0); head.add(ear); }
    if (o.antenna) { const ant = mesh(new THREE.CylinderGeometry(0.004 * s, 0.006 * s, P.headH * 0.5, 6), chrome); ant.position.set(P.headH * 0.2, P.headH * 0.7, 0); head.add(ant); const tip = mesh(new THREE.SphereGeometry(0.015 * s, 8, 6), glowM, false); tip.position.set(P.headH * 0.2, P.headH * 0.95, 0); head.add(tip); }
    bn('head').add(head);
    this.headGroup = head;
    joint(bn('neck'), J, 'neck', 0.04 * s, chrome);
    // Arms.
    for (const S of ['L', 'R']) {
      const sh = mesh(new THREE.SphereGeometry(P.H * (o.mech ? 0.07 : 0.05), 16, 12), paint); sh.position.set(0, 0, 0); bn('arm' + S).add(sh);
      limb(bn('arm' + S), J, 'arm' + S, 'fore' + S, P.H * 0.03 * (1 + o.bulk), paint, o.mech ? 'box' : 'capsule');
      joint(bn('fore' + S), J, 'fore' + S, P.H * 0.028 * (1 + o.bulk * 0.5), chrome);
      limb(bn('fore' + S), J, 'fore' + S, 'hand' + S, P.H * 0.026 * (1 + o.bulk), o.mech ? paint : dark, o.mech ? 'box' : 'capsule');
      const hand = mesh(rbox(P.hand * 0.5, P.hand * 0.9, P.hand * 0.25, 0.01 * s), dark);
      hand.position.copy(J['hand' + S].clone().lerp(J['handTip' + S], 0.45)).sub(J['hand' + S]);
      bn('hand' + S).add(hand);
      // Legs.
      limb(bn('thigh' + S), J, 'thigh' + S, 'shin' + S, P.H * 0.04 * (1 + o.bulk), paint, o.mech ? 'box' : 'capsule');
      joint(bn('shin' + S), J, 'shin' + S, P.H * 0.035, chrome);
      limb(bn('shin' + S), J, 'shin' + S, 'foot' + S, P.H * 0.034 * (1 + o.bulk), o.mech ? paint : dark, o.mech ? 'box' : 'capsule');
      const foot = mesh(rbox(P.H * 0.06 * (1 + o.bulk), P.H * 0.04, P.foot * 1.05, 0.01 * s), paint);
      foot.position.copy(J['toe' + S].clone().lerp(J['heel' + S], 0.5)).sub(J['foot' + S]); foot.position.y = -J['foot' + S].y + P.H * 0.02;
      bn('foot' + S).add(foot);
    }
    if (o.mech) {
      // Shoulder cannons & backpack thrusters.
      for (const sd of [-1, 1]) { const pod = mesh(rbox(P.H * 0.08, P.H * 0.06, P.H * 0.16, 0.02 * s), dark); pod.position.set(sd * P.shoulderW * 0.45, P.H * 0.14, -0.02 * s); bn('chest').add(pod); const barrel = mesh(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, P.H * 0.12, 10).rotateX(Math.PI / 2), chrome); barrel.position.set(sd * P.shoulderW * 0.45, P.H * 0.14, P.H * 0.1); bn('chest').add(barrel); }
      const pack = mesh(rbox(P.shoulderW * 0.6, P.H * 0.18, P.H * 0.08, 0.02 * s), dark); pack.position.set(0, P.H * 0.03, -P.H * 0.11); bn('chest').add(pack);
      for (const sd of [-1, 1]) { const th = glowSprite(o.glow, P.H * 0.1, 0.8); th.position.set(sd * P.shoulderW * 0.15, -P.H * 0.07, -P.H * 0.15); bn('chest').add(th); }
    }
    this.root.traverse((m) => { if (m.isMesh) this.meshes.push(m); });
    // Animator interface (no eyes/lids/jaw: visor brightness pulses when talking instead).
    this.eyes = []; this.lids = []; this.headMesh = null; this.jawPivot = null;
    this.visor = visor;
    this.animator = new Animator(this);
    this.height = P.H;
    this.ready = true;
    return this;
  }
  update(dt, st) { this.animator.update(dt, st); if (this.visor) this.visor.scale.y = this.animator.talkT > 0 ? 0.6 + Math.abs(Math.sin(G.time * 18)) * 0.8 : 1; }
  gesture(n, d) { this.animator.gesture(n, d); }
  talk(s) { this.animator.talk(s); }
  setPose(n, d) { this.animator.setPose(n, d); }
  triggerJump() { this.animator.jump(); }
  setFirstPerson() {}
  dispose() { this.skeleton.dispose(); }
}

function* humanoidRobot(ctx, item, rng, mech) {
  const a = item.attrs;
  const H = a.dims.height || (mech ? rng.range(6, 9) : rng.range(1.5, 2.1)) * clamp(a.sizeMul || 1, 0.3, 6);
  const color = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(mech ? ['#6a7a5a', '#8a8a8a', '#c8a020', '#3a4a6a', '#a02a2a'] : ['#e8eaee', '#c8ccd0', '#2a2c30', '#3a6ab8', '#e8a020', '#b83a3a']);
  const glow = rng.pick(['#40c8ff', '#40ff90', '#ff4060', '#ffb020', '#c060ff']);
  ctx.stage('geometry', mech ? 'Assembling mech' : 'Assembling robot');
  yield;
  const r = new RobotHumanoid({ height: H, color, glow, mech, bulk: mech ? 0.8 : rng.range(0.1, 0.5), round: rng.chance(0.4), cyclops: rng.chance(0.2), antenna: !mech && rng.chance(0.6) });
  r.build(rng);
  yield;
  const root = new THREE.Group();
  root.add(r.root);
  const name = a.name || rng.pick(NAMES.robot);
  const data = { root, name, category: 'robot', icon: item.icon, height: H, footprint: { radius: Math.max(0.4, H * 0.2) } };
  makeNPC(data, {
    humanoid: r, rng: rng.fork('mind'), seed: rng.nextU32(),
    personalityInfo: { name, robot: true, sex: 'neutral', traits: a.personality && a.personality.length ? a.personality : ['robotic'] },
    radius: Math.max(0.3, H * 0.16), subtitle: mech ? 'Battle mech' : 'Robot',
    brainOpts: { walkSpeed: 1.2 * Math.sqrt(H / 1.8), runSpeed: 3.5 * Math.sqrt(H / 1.8), radius: Math.max(0.3, H * 0.16), wanderRadius: mech ? 10 : 5 },
  });
  data.lights = [{ pos: [0, H * 0.75, 0.2], color: glow, intensity: mech ? 2.5 : 1.2, distance: mech ? 10 : 4, nightOnly: false }];
  const prevSay = data.say;
  data.say = (text, sec) => { prevSay(text.toUpperCase().startsWith('BEEP') ? text : text, sec); if (G.audio) G.audio.play('robot', data.root.position); };
  if (mech) { data.colliderDefs = []; }
  return data;
}

function* drone(ctx, item, rng) {
  const a = item.attrs;
  const S = clamp(a.sizeMul || 1, 0.3, 5) * 0.5;
  ctx.stage('geometry', 'Assembling drone');
  yield;
  const M = G.materials;
  const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(['#e8e8ea', '#2a2a2e', '#e02020']);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(rbox(0.3 * S, 0.08 * S, 0.3 * S, 0.03 * S), M.get('glossyPlastic', { color: col })));
  const cam = mesh(new THREE.SphereGeometry(0.05 * S, 12, 10), M.get('tintedGlass', { opacity: 0.8 })); cam.position.set(0, -0.06 * S, 0.1 * S); body.add(cam);
  const props = [];
  for (let i = 0; i < 4; i++) {
    const an = (i / 4) * TAU + Math.PI / 4;
    const x = Math.cos(an) * 0.3 * S, z = Math.sin(an) * 0.3 * S;
    const arm = mesh(new THREE.BoxGeometry(0.02 * S, 0.02 * S, 0.3 * S), M.plain('#1a1a1a', 0.5)); arm.position.set(x / 2, 0, z / 2); arm.rotation.y = -an + Math.PI / 2; body.add(arm);
    const motor = mesh(new THREE.CylinderGeometry(0.025 * S, 0.025 * S, 0.04 * S, 10), M.get('chrome')); motor.position.set(x, 0.02 * S, z); body.add(motor);
    const prop = new THREE.Group(); prop.position.set(x, 0.05 * S, z);
    for (let k = 0; k < 2; k++) { const bl = mesh(new THREE.BoxGeometry(0.2 * S, 0.004 * S, 0.02 * S), M.plain('#2a2a2a', 0.5)); bl.rotation.y = k * Math.PI / 2; prop.add(bl); }
    body.add(prop); props.push(prop);
    const led = mesh(new THREE.SphereGeometry(0.01 * S, 6, 4), M.get('emissive', { color: i < 2 ? '#20ff40' : '#ff2020', emissiveIntensity: 3 }), false); led.position.set(x, -0.01 * S, z); body.add(led);
  }
  const name = a.name || rng.pick(['Buzz', 'Hover', 'Quad-7', 'Skye', 'Zippy']);
  const data = { root, name, category: 'robot', icon: item.icon, height: 0.2, footprint: { radius: 0.4 * S }, floating: true, floatHeight: 1.6 };
  const creature = {
    update: (dt, s) => {
      for (const p of props) p.rotation.y += dt * 60;
      body.position.y = 1.6 + Math.sin(G.time * 2) * 0.08;
      body.rotation.x = -(s.speed || 0) * 0.08;
      body.rotation.z = Math.sin(G.time * 1.3) * 0.04;
    },
    vocalize: () => G.audio && G.audio.play('robot', root.position),
    happy: () => { body.rotation.y += Math.PI * 2; },
  };
  makeNPC(data, { creature, rng: rng.fork('mind'), seed: rng.nextU32(), personalityInfo: { name, robot: true, animal: true, species: 'drone' }, radius: 0.3 * S, subtitle: 'Drone', brainOpts: { animal: true, walkSpeed: 2, runSpeed: 6, radius: 0.3, wanderRadius: 6, flying: true } });
  data.brain.command('follow');
  return data;
}

function* rover(ctx, item, rng) {
  const a = item.attrs;
  const S = clamp(a.sizeMul || 1, 0.3, 5);
  ctx.stage('geometry', 'Assembling rover');
  yield;
  const M = G.materials;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const deck = mesh(rbox(1.0 * S, 0.3 * S, 1.4 * S, 0.04 * S), M.get('panels', { color: a.primaryColor || '#d8dade' })); deck.position.y = 0.55 * S; body.add(deck);
  const mast = mesh(new THREE.CylinderGeometry(0.03 * S, 0.04 * S, 0.8 * S, 8), M.get('metal')); mast.position.set(0.25 * S, 1.1 * S, 0.45 * S); body.add(mast);
  const headG = new THREE.Group(); headG.position.set(0.25 * S, 1.55 * S, 0.45 * S);
  headG.add(mesh(rbox(0.28 * S, 0.14 * S, 0.14 * S, 0.02 * S), M.get('glossyPlastic', { color: '#e8e8e8' })));
  for (const sd of [-1, 1]) { const lens = mesh(new THREE.CylinderGeometry(0.04 * S, 0.04 * S, 0.03 * S, 12).rotateX(Math.PI / 2), M.get('tintedGlass', { opacity: 0.9 })); lens.position.set(sd * 0.07 * S, 0, 0.08 * S); headG.add(lens); }
  body.add(headG);
  const panel = mesh(new THREE.BoxGeometry(1.2 * S, 0.02 * S, 0.8 * S), M.get('facade', { color: '#1a2a6a', color2: '#c8c8c8', p: [6, 4, 0.03, 0] })); panel.position.set(0, 0.75 * S, -0.3 * S); body.add(panel);
  const wheels = [];
  for (const z of [-0.55, 0, 0.55]) for (const sd of [-1, 1]) {
    const w = mesh(new THREE.CylinderGeometry(0.2 * S, 0.2 * S, 0.16 * S, 16).rotateZ(Math.PI / 2), M.get('tire')); w.position.set(sd * 0.62 * S, 0.2 * S, z * S); body.add(w); wheels.push(w);
    const strut = mesh(new THREE.BoxGeometry(0.04 * S, 0.35 * S, 0.04 * S), M.get('metal')); strut.position.set(sd * 0.55 * S, 0.4 * S, z * S); body.add(strut);
  }
  const name = a.name || rng.pick(['Rover', 'Curio', 'Pathfinder', 'Wall-B', 'Scout']);
  const data = { root, name, category: 'robot', icon: item.icon, height: 1.7 * S, footprint: { radius: 0.9 * S } };
  let look = 0;
  const creature = {
    update: (dt, s) => { for (const w of wheels) w.rotation.x += (s.speed || 0) * dt / (0.2 * S); look += dt; headG.rotation.y = Math.sin(look * 0.5) * 0.8; },
    vocalize: () => G.audio && G.audio.play('robot', root.position),
    happy: () => { headG.rotation.x = -0.4; setTimeout(() => (headG.rotation.x = 0), 500); },
  };
  makeNPC(data, { creature, rng: rng.fork('mind'), seed: rng.nextU32(), personalityInfo: { name, robot: true, animal: true, species: 'rover' }, radius: 0.7 * S, subtitle: 'Rover', brainOpts: { animal: true, walkSpeed: 0.8, runSpeed: 1.6, radius: 0.7 * S, wanderRadius: 8, turnSpeed: 1.5 } });
  return data;
}

function* robotDog(ctx, item, rng) {
  // A quadruped from the creature pipeline, but with rigid robotic parts on its bones.
  const { creatureGen } = yield import('./creatures.js');
  const data = yield* creatureGen.build(ctx, { ...item, params: { species: 'dog', breed: 'shepherd' }, attrs: { ...item.attrs, colors: item.attrs.colors.length ? item.attrs.colors : [{ color: '#9aa0a8', part: 'body' }], materials: ['metal'] } }, rng);
  // Swap the organic coat for brushed metal with glowing eyes.
  data.root.traverse((o) => { if (o.isSkinnedMesh) o.material = o.material.map((m, i) => (i === 0 ? G.materials.get('metal', { color: '#b8bcc4', vertexColors: true }) : m)); });
  data.name = item.attrs.name || rng.pick(['K-9', 'Sparky', 'Bolt', 'Rex-2000']);
  data.subtitle = 'Robot dog';
  data.category = 'robot';
  return data;
}

export const robotGen = {
  maxCount: 10,
  estimate: (item) => (item.params.kind === 'dog' ? 4 : 1.5),
  stages: () => [{ name: 'plan', label: 'Designing', weight: 0.4 }, { name: 'geometry', label: 'Assembling parts', weight: 3 }, { name: 'rig', label: 'Calibrating servos', weight: 1 }, { name: 'textures', label: 'Painting', weight: 0.5 }],
  *build(ctx, item, rng) {
    switch (item.params.kind) {
      case 'mech': return yield* humanoidRobot(ctx, item, rng, true);
      case 'drone': return yield* drone(ctx, item, rng);
      case 'rover': return yield* rover(ctx, item, rng);
      case 'dog': return yield* robotDog(ctx, item, rng);
      default: return yield* humanoidRobot(ctx, item, rng, false);
    }
  },
};
