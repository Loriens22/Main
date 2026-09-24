// ---------------------------------------------------------------------------
// Landscape features that reshape the terrain heightfield itself:
// mountains (ridged-noise domes that pick up snow above the snow line),
// hills, volcanoes (crater, lava lake, smoke, periodic eruptions), lakes
// (carved basins with a local water surface), rivers (meandering carved
// channels with a flowing water ribbon), craters and waterfalls (cliff
// plateau + plunge pool + falling water + mist).
//
// All edits are tagged with the entity id, so deleting the feature restores
// the original landscape (Terrain.revertOwner) and saves replay them.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { Noise } from '../../core/noise.js';
import { createWaterMaterial } from '../../world/water.js';
import { buildRock } from '../../world/trees.js';
import { markNoAO } from '../../render/renderer.js';
import { animate, glowSprite, glowTexture } from './common.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function has(a, ...ws) { return ws.some((w) => a.words.includes(w) || a.text.includes(w)); }

// Apply edits while keeping nearby entities (and the vegetation) on the ground.
function editTerrain(world, e, ops, radius) {
  const T = world.terrain;
  if (!T) return false;
  const x = e.root.position.x, z = e.root.position.z;
  const affected = [];
  for (const o of world.entities) {
    if (o === e || o.floating) continue;
    const d = Math.hypot(o.root.position.x - x, o.root.position.z - z);
    if (d < radius + 5) affected.push({ o, h0: world.heightAt(o.root.position.x, o.root.position.z) });
  }
  for (const op of ops) T.applyEdit({ ...op, owner: e.id });
  for (const { o, h0 } of affected) {
    const dh = world.heightAt(o.root.position.x, o.root.position.z) - h0;
    if (Math.abs(dh) > 0.01) { o.root.position.y += dh; G.registry.refresh(o); }
  }
  if (world.vegetation) world.vegetation.reseat(x, z, radius + 10);
  return true;
}

function localWater(world, x, z, r, level, opts = {}) {
  const geo = opts.geometry || new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, createWaterMaterial({ terrain: opts.noTerrain ? null : world.terrain, level, depth: 1.6, shallow: opts.shallow, deep: opts.deep, flowX: opts.flowX, flowZ: opts.flowZ }));
  mesh.position.set(x, level, z);
  mesh.renderOrder = 5;
  mesh.receiveShadow = true;
  mesh.userData.noRaycast = true;
  markNoAO(mesh);
  return mesh;
}

// ---------------- Mountain / hill ----------------
function* mountain(ctx, item, rng, hill = false) {
  const a = item.attrs;
  const H = a.dims.height || (hill ? rng.range(10, 22) : rng.range(55, 110)) * clamp(a.sizeMul || 1, 0.3, 3);
  const R = hill ? H * rng.range(2.8, 3.6) : H * rng.range(1.3, 1.7);
  ctx.stage('geometry', hill ? 'Rolling out a hill' : 'Folding rock strata');
  yield;
  const n = new Noise(rng.nextU32() & 0xffff);
  const sharp = has(a, 'sharp', 'jagged', 'spiky', 'alpine') ? 1.4 : 1;
  const root = new THREE.Group();
  const data = {
    root, name: hill ? 'Hill' : (H > 90 ? 'Great mountain' : 'Mountain'), category: 'landscape', icon: hill ? '⛰️' : '🏔️', height: H, footprint: { radius: R * 0.55 },
    suppressGrass: false, keepVegetation: true, preferPlacement: hill ? undefined : 'far',
    onAdded(world) {
      const cx = this.root.position.x, cz = this.root.position.z;
      const noiseFn = hill ? (x, z) => 0.85 + 0.15 * n.fbm2(x * 0.02, z * 0.02, 3)
        : (x, z) => 0.55 + 0.45 * Math.pow(n.ridged2((x - cx) * 0.012 * sharp, (z - cz) * 0.012 * sharp, 5), 1.2) + 0.1 * n.fbm2(x * 0.05, z * 0.05, 3);
      editTerrain(world, this, [{ type: 'raise', x: cx, z: cz, radius: R, falloff: R * 0.25, amount: H, power: hill ? 1.2 : 1.35, noiseFn }], R * 1.25);
      if (!hill && world.vegetation) world.vegetation.clearArea(cx, cz, R * 0.35);
      this.root.position.y = world.heightAt(cx, cz);
    },
  };
  return data;
}

// ---------------- Volcano ----------------
function* volcano(ctx, item, rng) {
  const a = item.attrs;
  const H = a.dims.height || rng.range(45, 80) * clamp(a.sizeMul || 1, 0.3, 3);
  const R = H * 1.5, craterR = H * 0.22;
  ctx.stage('geometry', 'Heating the mantle');
  yield;
  const n = new Noise(rng.nextU32() & 0xffff);
  const root = new THREE.Group();
  const top = new THREE.Group();
  root.add(top);
  // Lava lake, glow, smoke plume, eruption bombs.
  const lava = new THREE.Mesh(new THREE.CircleGeometry(craterR * 0.8, 40).rotateX(-Math.PI / 2), G.materials.get('lava', { world: 6 }));
  lava.userData.noRaycast = true;
  top.add(lava);
  const glow = glowSprite('#ff6020', craterR * 5, 0.6);
  glow.position.y = 3;
  top.add(glow);
  const smokeN = 30;
  const smoke = [];
  for (let i = 0; i < smokeN; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#4a4440', transparent: true, opacity: 0, depthWrite: false }));
    s.userData.seed = Math.random(); s.userData.noRaycast = true; markNoAO(s);
    top.add(s); smoke.push(s);
  }
  const bombs = [];
  const bombMat = G.materials.get('emissive', { color: '#ff5010', emissiveIntensity: 4 });
  for (let i = 0; i < 24; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rng.range(0.4, 1.1), 0), bombMat); b.visible = false; b.userData.noRaycast = true; top.add(b); bombs.push({ m: b, v: new THREE.Vector3(), t: 99 }); }
  let nextErupt = rng.range(6, 14), erupting = 0;
  const data = {
    root, name: 'Volcano', category: 'landscape', icon: '🌋', height: H, footprint: { radius: R * 0.5 }, suppressGrass: false, keepVegetation: true, preferPlacement: 'far',
    lights: [{ pos: [0, H + 4, 0], color: '#ff6a20', intensity: 8, distance: H * 1.2, nightOnly: false, flicker: true, object: top }],
    onAdded(world) {
      const cx = this.root.position.x, cz = this.root.position.z;
      const noiseFn = (x, z) => 0.8 + 0.2 * n.fbm2(x * 0.04, z * 0.04, 4);
      editTerrain(world, this, [
        { type: 'raise', x: cx, z: cz, radius: R, falloff: R * 0.2, amount: H, power: 1.1, noiseFn },
      ], R * 1.2);
      const peak = world.heightAt(cx, cz);
      editTerrain(world, this, [{ type: 'carve', x: cx, z: cz, radius: craterR, falloff: craterR * 0.6, depthTo: peak - H * 0.18, paint: true, channel: 1, value: 255 }], craterR * 2);
      if (world.vegetation) world.vegetation.clearArea(cx, cz, R * 0.55);
      top.position.set(0, world.heightAt(cx, cz) + 0.6 - this.root.position.y, 0);
    },
  };
  animate(root, (t, dt) => {
    for (const s of smoke) {
      const life = (s.userData.seed + t * 0.04) % 1;
      s.position.set(Math.sin(life * 3 + s.userData.seed * 20) * craterR * life + life * 25, 4 + life * H * 1.2, Math.cos(s.userData.seed * 30) * craterR * 0.6 * life);
      s.scale.setScalar(craterR * (0.8 + life * 3.5));
      s.material.opacity = Math.sin(life * Math.PI) * 0.35;
    }
    nextErupt -= dt;
    if (nextErupt < 0) {
      nextErupt = rng.range(10, 25); erupting = 2.5;
      for (const b of bombs) { b.t = 0; b.m.position.set(0, 1, 0); b.v.set(rng.range(-1, 1) * 14, rng.range(18, 34), rng.range(-1, 1) * 14); b.m.visible = true; }
      if (G.audio) G.audio.play('thunder', root.position, { dist: 1.5, max: 400, ref: 60 });
    }
    erupting = Math.max(0, erupting - dt);
    glow.material.opacity = 0.5 + erupting * 0.25 + Math.sin(t * 3) * 0.05;
    for (const b of bombs) {
      if (b.t > 6) { b.m.visible = false; continue; }
      b.t += dt; b.v.y -= 9.8 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 3;
      if (b.m.position.y < -H) b.m.visible = false;
    }
  });
  return data;
}

// ---------------- Lake ----------------
function* lake(ctx, item, rng) {
  const a = item.attrs;
  const R = (a.dims.width ? a.dims.width / 2 : rng.range(14, 28)) * clamp(a.sizeMul || 1, 0.3, 4);
  ctx.stage('geometry', 'Digging a basin');
  yield;
  const n = new Noise(rng.nextU32() & 0xffff);
  const root = new THREE.Group();
  const data = {
    root, name: has(a, 'pond') ? 'Pond' : 'Lake', category: 'landscape', icon: '💧', height: 1, footprint: { radius: R }, suppressGrass: false, keepVegetation: true,
    onAdded(world) {
      const cx = this.root.position.x, cz = this.root.position.z;
      // Level the shore, then carve an organic basin below it.
      let level = Infinity;
      for (let i = 0; i < 16; i++) { const an = (i / 16) * TAU; level = Math.min(level, world.heightAt(cx + Math.cos(an) * R, cz + Math.sin(an) * R)); }
      level = Math.min(level, world.heightAt(cx, cz)) - 0.35;
      const useGlobal = world.waterLevel > -1e8 && Math.abs(level - world.waterLevel) < 1.2;
      if (useGlobal) level = world.waterLevel;
      const depth = clamp(R * 0.18, 2.5, 7);
      const ops = [
        { type: 'flatten', x: cx, z: cz, radius: R + 2, falloff: 6, height: level + 0.5 },
        { type: 'carve', x: cx, z: cz, radius: R * 0.55, falloff: R * 0.55, depthTo: level - depth, paint: true, channel: 2, value: 170 },
      ];
      // Irregular shoreline: a few extra lobes.
      for (let i = 0; i < 4; i++) { const an = rng.range(0, TAU), d = R * rng.range(0.3, 0.6); ops.push({ type: 'carve', x: cx + Math.cos(an) * d, z: cz + Math.sin(an) * d, radius: R * rng.range(0.25, 0.4), falloff: R * 0.3, depthTo: level - depth * 0.6 }); }
      editTerrain(world, this, ops, R * 1.4);
      if (world.vegetation) world.vegetation.clearArea(cx, cz, R + 1);
      if (!useGlobal) {
        const w = localWater(world, 0, 0, R * 1.35, level);
        w.position.set(0, level - this.root.position.y, 0);
        this.root.add(w);
        this.waterVol = { x: cx, z: cz, r: R * 1.1, level };
        world.waterVolumes.push(this.waterVol);
      }
      for (const c of this.root.children) if (c.userData.groundMe) { const wp = c.position.clone().applyMatrix4(this.root.matrixWorld); c.position.y = world.heightAt(wp.x, wp.z) - this.root.position.y + 0.4; }
      void n;
    },
    onRemove(world) { if (this.waterVol) world.waterVolumes.splice(world.waterVolumes.indexOf(this.waterVol), 1); },
  };
  // Reeds and lily pads around the edge.
  const reedMat = G.materials.get('grass', { color: '#5a7a3a' });
  for (let i = 0; i < 30; i++) {
    const an = rng.range(0, TAU), d = R * rng.range(0.9, 1.1);
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, rng.range(0.8, 1.6), 4), reedMat);
    reed.position.set(Math.cos(an) * d, 0.5, Math.sin(an) * d);
    reed.userData.groundMe = true;
    root.add(reed);
  }
  return data;
}

// ---------------- River ----------------
function* river(ctx, item, rng) {
  const a = item.attrs;
  const L = (a.dims.length || rng.range(90, 150)) * clamp(a.sizeMul || 1, 0.3, 3);
  const W = rng.range(5, 8) * clamp((a.sizeMul || 1) ** 0.5, 0.5, 2);
  ctx.stage('geometry', 'Carving a river bed');
  yield;
  // Meandering centre line (local frame, flowing along -Z → +Z across the player's view).
  const pts = [];
  const n = Math.round(L / 4);
  let x = 0, dir = 0;
  for (let i = 0; i <= n; i++) {
    dir += rng.range(-0.25, 0.25); dir *= 0.9;
    x += Math.sin(dir) * 4;
    pts.push([x, -L / 2 + (i / n) * L]);
  }
  const root = new THREE.Group();
  const data = {
    root, name: 'River', category: 'landscape', icon: '🏞️', height: 1, footprint: { radius: W * 2 }, suppressGrass: false, keepVegetation: true, sideways: true,
    onAdded(world) {
      const m = this.root.matrixWorld;
      const wp = pts.map(([px, pz]) => new THREE.Vector3(px, 0, pz).applyMatrix4(m));
      // Water level per sample: follows the ground but never flows uphill.
      let prev = Infinity;
      const levels = wp.map((p) => { const h = world.heightAt(p.x, p.z) - 1.0; prev = Math.min(prev + 0.02, h); return prev; });
      const ops = [];
      wp.forEach((p, i) => ops.push({ type: 'carve', x: p.x, z: p.z, radius: W * 0.5, falloff: W * 0.6, depthTo: levels[i] - 1.6, paint: true, channel: 2, value: 150 }));
      editTerrain(world, this, ops, L / 2 + W * 2);
      for (const p of wp) if (world.vegetation) world.vegetation.clearArea(p.x, p.z, W);
      // Water ribbon (world-space geometry parented to the root with inverse transform).
      const pos = [], idx = [];
      for (let i = 0; i < wp.length; i++) {
        const p = wp[i], q = wp[Math.min(wp.length - 1, i + 1)], o = wp[Math.max(0, i - 1)];
        const t = new THREE.Vector3().subVectors(q, o).setY(0).normalize();
        const side = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(W * 0.75);
        pos.push(p.x - side.x, levels[i], p.z - side.z, p.x + side.x, levels[i], p.z + side.z);
        if (i < wp.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const flow = new THREE.Vector3().subVectors(wp[wp.length - 1], wp[0]).normalize().multiplyScalar(0.12);
      const water = localWater(world, 0, 0, 1, 0, { geometry: g, flowX: flow.x, flowZ: flow.z, noTerrain: true });
      water.position.set(0, 0, 0);
      water.matrixAutoUpdate = false;
      water.matrix.copy(new THREE.Matrix4().copy(this.root.matrixWorld).invert());
      this.root.add(water);
      this.waterVol = { points: wp.map((p, i) => [p.x, p.z, levels[i]]), r: W * 0.7 };
      world.waterVolumes.push(this.waterVol);
    },
    onRemove(world) { if (this.waterVol) world.waterVolumes.splice(world.waterVolumes.indexOf(this.waterVol), 1); },
  };
  return data;
}

// ---------------- Crater ----------------
function* crater(ctx, item, rng) {
  const a = item.attrs;
  const R = rng.range(12, 22) * clamp(a.sizeMul || 1, 0.3, 4);
  ctx.stage('geometry', 'Impact!');
  yield;
  const root = new THREE.Group();
  const meteor = new THREE.Mesh(buildRock(rng.nextU32(), R * 0.08, { detail: 3, moss: 0 }), G.materials.get('iron', { vertexColors: true }));
  meteor.castShadow = true;
  const mglow = glowSprite('#ff7a30', R * 0.4, 0.5);
  root.add(meteor, mglow);
  const data = {
    root, name: 'Impact crater', category: 'landscape', icon: '☄️', height: 2, footprint: { radius: R }, suppressGrass: false, keepVegetation: true,
    lights: [{ pos: [0, 1, 0], color: '#ff7a30', intensity: 3, distance: R, nightOnly: false, flicker: true }],
    onAdded(world) {
      const cx = this.root.position.x, cz = this.root.position.z;
      const g0 = world.heightAt(cx, cz);
      editTerrain(world, this, [
        { type: 'raise', x: cx, z: cz, radius: R * 1.2, falloff: R * 0.5, amount: R * 0.12, power: 0.6 },
        { type: 'carve', x: cx, z: cz, radius: R * 0.6, falloff: R * 0.5, depthTo: g0 - R * 0.25, paint: true, channel: 1, value: 255 },
      ], R * 1.8);
      if (world.vegetation) world.vegetation.clearArea(cx, cz, R * 1.1);
      const hy = world.heightAt(cx, cz);
      meteor.position.y = hy - this.root.position.y + R * 0.03;
      mglow.position.copy(meteor.position);
    },
  };
  return data;
}

// ---------------- Waterfall ----------------
function* waterfall(ctx, item, rng) {
  const a = item.attrs;
  const H = (a.dims.height || rng.range(12, 22)) * clamp(a.sizeMul || 1, 0.3, 4);
  const hw = rng.range(10, 16), hd = rng.range(8, 12), fallW = rng.range(3, 6);
  ctx.stage('geometry', 'Raising a cliff');
  yield;
  const root = new THREE.Group();
  const fx = new THREE.Group();
  root.add(fx);
  // Falling water: particle curtain + mist sprites at the bottom.
  const N = 1400;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(N * 3), s = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { s[i * 2] = Math.random(); s[i * 2 + 1] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#e8f6ff', size: 0.45, transparent: true, opacity: 0.55, depthWrite: false, map: glowTexture() }));
  pts.frustumCulled = false; pts.userData.noRaycast = true; markNoAO(pts);
  fx.add(pts);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(fallW, H, 1, 8), new THREE.MeshStandardMaterial({ color: '#cfe8f4', transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  sheet.userData.noRaycast = true; markNoAO(sheet);
  fx.add(sheet);
  const mist = [];
  for (let i = 0; i < 14; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false })); m.userData.seed = Math.random(); m.userData.noRaycast = true; markNoAO(m); fx.add(m); mist.push(m); }
  let topY = H, baseY = 0;
  const data = {
    root, name: 'Waterfall', category: 'landscape', icon: '🏞️', height: H, footprint: { radius: Math.max(hw, hd) }, suppressGrass: false, keepVegetation: true,
    onAdded(world) {
      const m = this.root.matrixWorld;
      const yaw = this.root.rotation.y;
      const cliffC = new THREE.Vector3(0, 0, -hd).applyMatrix4(m);
      const poolC = new THREE.Vector3(0, 0, hd * 0.2).applyMatrix4(m);
      const g0 = world.heightAt(this.root.position.x, this.root.position.z);
      editTerrain(world, this, [
        { type: 'flatten', shape: 'rect', x: cliffC.x, z: cliffC.z, hw, hd, yaw, radius: Math.hypot(hw, hd), falloff: 3, height: g0 + H, paint: true, channel: 1, value: 60 },
        { type: 'carve', x: poolC.x, z: poolC.z, radius: fallW * 1.2, falloff: fallW, depthTo: g0 - 2.5, paint: true, channel: 2, value: 160 },
      ], Math.hypot(hw, hd) + 10);
      if (world.vegetation) world.vegetation.clearArea(poolC.x, poolC.z, fallW * 2.5);
      topY = g0 + H - this.root.position.y; baseY = g0 - 0.6 - this.root.position.y;
      const w = localWater(world, 0, 0, fallW * 2.2, g0 - 0.6);
      w.position.set(0, baseY, hd * 0.2);
      this.root.add(w);
      this.waterVol = { x: poolC.x, z: poolC.z, r: fallW * 1.8, level: g0 - 0.6 };
      world.waterVolumes.push(this.waterVol);
      sheet.position.set(0, (topY + baseY) / 2, 0.3); sheet.scale.y = (topY - baseY) / H;
    },
    onRemove(world) { if (this.waterVol) world.waterVolumes.splice(world.waterVolumes.indexOf(this.waterVol), 1); },
  };
  animate(root, (t) => {
    const fall = topY - baseY;
    const tf = Math.sqrt(2 * Math.max(1, fall) / 9.8);
    for (let i = 0; i < N; i++) {
      const life = (s[i * 2] + t * 0.6) % 1;
      const tt = life * tf;
      p[i * 3] = (s[i * 2 + 1] - 0.5) * fallW; p[i * 3 + 1] = topY - 4.9 * tt * tt; p[i * 3 + 2] = 0.2 + tt * 1.5;
    }
    g.attributes.position.needsUpdate = true;
    for (const m of mist) { const life = (m.userData.seed + t * 0.15) % 1; m.position.set((m.userData.seed - 0.5) * fallW * 2, baseY + life * 4, 1 + m.userData.seed * 3); m.scale.setScalar(2 + life * 4); m.material.opacity = Math.sin(life * Math.PI) * 0.25; }
  });
  return data;
}

export const terrainGen = {
  maxCount: 4,
  estimate: (item) => ({ mountain: 2, volcano: 3, river: 3, lake: 2 }[item.params.kind] || 2),
  stages: () => [{ name: 'geometry', label: 'Reshaping terrain', weight: 3 }, { name: 'textures', label: 'Weathering', weight: 1 }],
  *build(ctx, item, rng, env) {
    if (!env.world.terrain) {
      // Dimensions without a heightfield: fall back to a floating rock sculpture of the feature.
      const { natureGen } = yield import('./nature.js');
      return yield* natureGen.build(ctx, { ...item, params: { kind: 'rock' }, attrs: { ...item.attrs, sizeMul: 6 } }, rng, env);
    }
    switch (item.params.kind) {
      case 'mountain': return yield* mountain(ctx, item, rng, false);
      case 'hill': return yield* mountain(ctx, item, rng, true);
      case 'volcano': return yield* volcano(ctx, item, rng);
      case 'lake': return yield* lake(ctx, item, rng);
      case 'river': return yield* river(ctx, item, rng);
      case 'crater': return yield* crater(ctx, item, rng);
      case 'waterfall': return yield* waterfall(ctx, item, rng);
      default: return yield* mountain(ctx, item, rng, true);
    }
  },
};
