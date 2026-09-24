// Garden / landscaping helpers shared by buildings and scenes: hedges,
// flower beds (instanced procedural flowers), stepping-stone paths, decks,
// picket fences, bollard lights, small ornamental trees and pools.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from '../../core/context.js';
import { Noise } from '../../core/noise.js';
import { buildTree, treeMaterials } from '../../world/trees.js';
import { createWaterMaterial } from '../../world/water.js';
import { markNoAO } from '../../render/renderer.js';

// Lumpy hedge block (box with noise-displaced vertices).
export function hedgeGeometry(w, h, d, seed) {
  const n = new Noise(seed);
  const g = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.round(w * 3)), Math.max(2, Math.round(h * 3)), Math.max(2, Math.round(d * 3)));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = n.fbm3(v.x * 1.7, v.y * 1.7, v.z * 1.7, 3) * 0.09 + n.n3(v.x * 6, v.y * 6, v.z * 6) * 0.03;
    const len = Math.max(1e-3, Math.hypot(v.x / (w / 2), v.y / (h / 2), v.z / (d / 2)));
    v.x += (v.x / (w / 2)) / len * k; v.y += Math.max(0, (v.y / (h / 2))) / len * k; v.z += (v.z / (d / 2)) / len * k;
    p.setXYZ(i, v.x, v.y + h / 2, v.z);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d), uv.getY(i) * h);
  return g;
}

export function hedgeMaterial() {
  return G.materials.get('grass', { color: '#1f3d12', color2: '#2f5418', color3: '#4a6a24', world: 0.7, bump: 0.03, seed: 5 });
}

// One flower prototype: stem + petal ring + centre. Returns merged geometry with vertex colours.
function flowerGeometry(petalColor, kind) {
  const parts = [];
  const stemH = kind === 'tulip' ? 0.32 : kind === 'sunflower' ? 0.9 : 0.25;
  const stem = new THREE.CylinderGeometry(0.004, 0.005, stemH, 4);
  stem.translate(0, stemH / 2, 0);
  parts.push(colorize(stem, new THREE.Color('#3a6a1a')));
  const leaf = new THREE.PlaneGeometry(0.03, 0.08); leaf.rotateY(0.6); leaf.rotateZ(0.5); leaf.translate(0.02, stemH * 0.35, 0);
  parts.push(colorize(leaf, new THREE.Color('#3f7a1f')));
  if (kind === 'tulip') {
    const cup = new THREE.SphereGeometry(0.03, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.65);
    cup.rotateX(Math.PI); cup.translate(0, stemH + 0.03, 0); cup.scale(1, 1.4, 1);
    parts.push(colorize(cup, petalColor));
  } else {
    const n = kind === 'sunflower' ? 16 : kind === 'daisy' ? 10 : 6;
    const pr = kind === 'sunflower' ? 0.08 : 0.022;
    for (let i = 0; i < n; i++) {
      const pet = new THREE.CircleGeometry(pr * 0.6, 5);
      pet.scale(0.55, 1.2, 1);
      pet.translate(0, pr * 0.8, 0);
      pet.rotateZ((i / n) * Math.PI * 2);
      pet.rotateX(-Math.PI / 2 + 0.35);
      pet.translate(0, stemH, 0);
      parts.push(colorize(pet, petalColor));
    }
    const c = new THREE.SphereGeometry(kind === 'sunflower' ? 0.05 : 0.009, 6, 4);
    c.translate(0, stemH + 0.005, 0);
    parts.push(colorize(c, new THREE.Color(kind === 'sunflower' ? '#3a2a10' : '#f0c020')));
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  return g;
}
function colorize(g, col) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

const FLOWER_COLORS = ['#e8404a', '#f0c020', '#f4f0e8', '#b050d0', '#f080b0', '#f08030', '#5070e0', '#e02060'];

// Instanced flower bed in local coordinates: rect [x0,z0,x1,z1].
export function flowerBed(group, rng, rect, density = 18, kinds = null) {
  const [x0, z0, x1, z1] = rect;
  const area = Math.abs((x1 - x0) * (z1 - z0));
  const count = Math.min(900, Math.round(area * density));
  const variants = [];
  const pal = rng.shuffle(FLOWER_COLORS.slice()).slice(0, rng.int(2, 4));
  for (const c of pal) variants.push(flowerGeometry(new THREE.Color(c), kinds ? rng.pick(kinds) : rng.pick(['daisy', 'tulip', 'cosmos', 'cosmos'])));
  const mat = G.materials.plain('#ffffff', 0.7, 0, { vertexColors: true, side: THREE.DoubleSide });
  const per = Math.ceil(count / variants.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const g of variants) {
    const inst = new THREE.InstancedMesh(g, mat, per);
    for (let i = 0; i < per; i++) {
      p.set(rng.range(x0, x1), 0, rng.range(z0, z1));
      q.setFromEuler(new THREE.Euler(rng.range(-0.15, 0.15), rng.range(0, 6.28), rng.range(-0.15, 0.15)));
      s.setScalar(rng.range(0.8, 1.3));
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = false; inst.receiveShadow = true;
    inst.userData.noRaycast = true;
    markNoAO(inst);
    group.add(inst);
  }
  // Soil / mulch strip.
  const soil = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.1, 0.08, Math.abs(z1 - z0) + 0.1), G.materials.get('forestFloor', { world: 1.5 }));
  soil.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
  soil.receiveShadow = true;
  group.add(soil);
}

// Stepping-stone path from a to b (local), returns paint op for the terrain.
export function steppingPath(group, rng, a, b, width = 1.1) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(len / 0.75));
  const geo = new THREE.CylinderGeometry(0.34, 0.36, 0.06, 9);
  const mat = G.materials.get('pavers', { world: 1.5 });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    p.set(a[0] + (b[0] - a[0]) * t + rng.range(-0.08, 0.08), 0.02, a[1] + (b[1] - a[1]) * t + rng.range(-0.05, 0.05));
    q.setFromEuler(new THREE.Euler(0, rng.range(0, 6), 0));
    s.set(rng.range(0.9, 1.25) * width / 1.1, 1, rng.range(0.75, 1) * width / 1.1);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  inst.receiveShadow = true; inst.castShadow = false;
  group.add(inst);
  return { type: 'paint', shape: 'path', points: [a, b], radius: width * 0.6, channel: 3, value: 255, falloff: 0.3, x: 0, z: 0 };
}

// Garden bollard light (returns light request descriptor in local coords).
export function bollard(group, x, z, h = 0.8) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, h, 12), G.materials.get('painted', { color: '#2a2c30' }));
  body.position.set(x, h / 2, z);
  body.castShadow = true;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 12), G.materials.get('emissive', { color: '#ffe2b0', emissiveIntensity: 2.5 }));
  lamp.position.set(x, h - 0.06, z);
  group.add(body, lamp);
  return { pos: [x, h, z], color: '#ffd9a0', intensity: 1.6, distance: 6, nightOnly: true };
}

// Small ornamental tree as a regular (non-instanced) mesh pair.
export function gardenTree(group, rng, x, z, species, scale = 0.6) {
  const t = buildTree(species, rng.nextU32(), 0.8);
  const mats = treeMaterials(species, rng.int(0, 1));
  const g = new THREE.Group();
  if (t.bark) { const m = new THREE.Mesh(t.bark, mats.barkMat); m.castShadow = m.receiveShadow = true; g.add(m); }
  if (t.leaves) { const m = new THREE.Mesh(t.leaves, mats.leafMat); m.castShadow = true; m.receiveShadow = true; markNoAO(m); g.add(m); }
  g.position.set(x, -0.05, z);
  g.scale.setScalar(scale);
  g.rotation.y = rng.range(0, 6.28);
  group.add(g);
  return { type: 'cyl', x, z, y0: 0, y1: t.height * scale * 0.5, r: Math.max(0.12, t.trunkRadius * scale) };
}

// Picket / modern slat fence along a polyline (MeshBuilder b).
export function fence(b, pts, style, matKey, opts = {}) {
  const h = opts.h ?? (style === 'picket' ? 1.0 : style === 'wall' ? 0.9 : 1.2);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.1) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const yaw = Math.atan2(dx, dz);
    if (style === 'wall') {
      const m = new THREE.Matrix4().makeTranslation((ax + bx) / 2, h / 2, (az + bz) / 2).multiply(new THREE.Matrix4().makeRotationY(yaw));
      const g = new THREE.BoxGeometry(0.3, h, len);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * len, uv.getY(k) * h);
      b.geometry(matKey, g, m);
      b.colliders.push({ type: 'box', x: (ax + bx) / 2, z: (az + bz) / 2, y0: 0, y1: h, hx: 0.15, hz: len / 2, yaw });
      continue;
    }
    const spacing = style === 'picket' ? 0.14 : 0.2;
    const n = Math.floor(len / spacing);
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n);
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const post = k % 12 === 0;
      const g = new THREE.BoxGeometry(post ? 0.09 : 0.07, post ? h + 0.08 : h, post ? 0.09 : 0.022);
      if (style === 'picket' && !post) { const pos = g.attributes.position; for (let v = 0; v < pos.count; v++) if (pos.getY(v) > 0) pos.setY(v, pos.getY(v) + (Math.abs(pos.getX(v)) < 0.01 ? 0.04 : 0)); }
      b.geometry(matKey, g, new THREE.Matrix4().makeTranslation(x, (post ? h + 0.08 : h) / 2, z).multiply(new THREE.Matrix4().makeRotationY(yaw)));
    }
    for (const y of style === 'picket' ? [0.25, h - 0.25] : [0.2, h * 0.5, h - 0.15]) {
      const g = new THREE.BoxGeometry(0.03, 0.06, len);
      b.geometry(matKey, g, new THREE.Matrix4().makeTranslation((ax + bx) / 2, y, (az + bz) / 2).multiply(new THREE.Matrix4().makeRotationY(yaw)));
    }
    b.colliders.push({ type: 'box', x: (ax + bx) / 2, z: (az + bz) / 2, y0: 0, y1: h, hx: 0.05, hz: len / 2, yaw });
  }
}

// Sunken pool (needs a terrain carve op under it). Local rect centre (cx,cz), size w x d, depth.
export function pool(group, b, cx, cz, w, d, depth = 1.5) {
  const tiles = 'poolTiles', coping = 'coping';
  const t = 0.25;
  // Walls & floor (interior faces tiled).
  b.box({ default: tiles }, [cx - w / 2 - t, -depth, cz - d / 2 - t], [cx + w / 2 + t, -depth + 0.2, cz + d / 2 + t]);
  b.box({ default: tiles }, [cx - w / 2 - t, -depth, cz - d / 2 - t], [cx - w / 2, 0, cz + d / 2 + t], { collide: true });
  b.box({ default: tiles }, [cx + w / 2, -depth, cz - d / 2 - t], [cx + w / 2 + t, 0, cz + d / 2 + t], { collide: true });
  b.box({ default: tiles }, [cx - w / 2, -depth, cz - d / 2 - t], [cx + w / 2, 0, cz - d / 2], { collide: true });
  b.box({ default: tiles }, [cx - w / 2, -depth, cz + d / 2], [cx + w / 2, 0, cz + d / 2 + t], { collide: true });
  // Coping stones.
  b.box(coping, [cx - w / 2 - 0.5, -0.02, cz - d / 2 - 0.5], [cx + w / 2 + 0.5, 0.04, cz - d / 2]);
  b.box(coping, [cx - w / 2 - 0.5, -0.02, cz + d / 2], [cx + w / 2 + 0.5, 0.04, cz + d / 2 + 0.5]);
  b.box(coping, [cx - w / 2 - 0.5, -0.02, cz - d / 2], [cx - w / 2, 0.04, cz + d / 2]);
  b.box(coping, [cx + w / 2, -0.02, cz - d / 2], [cx + w / 2 + 0.5, 0.04, cz + d / 2]);
  b.collider([cx - w / 2, -depth + 0.2, cz - d / 2], [cx + w / 2, -depth + 0.2 + 0.01, cz + d / 2]);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), createWaterMaterial({ depth: depth, shallow: 0x3fb8d0, deep: 0x0e6a9a, foam: 0, waveScale: 2.5, level: -0.15 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, -0.15, cz);
  water.renderOrder = 3;
  water.userData.noRaycast = true;
  markNoAO(water);
  group.add(water);
  return { type: 'flatten', shape: 'rect', x: cx, z: cz, hw: w / 2 + t + 0.3, hd: d / 2 + t + 0.3, radius: Math.hypot(w, d) / 2 + 1, heightRel: -depth - 0.3, falloff: 0 };
}
