// ---------------------------------------------------------------------------
// Structures: bridges (stone arch, wooden, suspension), walls, fences,
// arches, staircases, roads, swimming pools, stages and playgrounds.
// All walkable surfaces get colliders; swings and seesaws animate.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { MeshBuilder, railing, stairs as buildStairs, slab } from './buildkit.js';
import { fence as gardenFence, pool as gardenPool } from './garden.js';
import { obox, ocyl, beam, animate, labelTexture, glowSprite } from './common.js';
import { placePiece, furnitureMaterials, seatWorldFn, sitNearest } from './furniture.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function has(a, ...ws) { return ws.some((w) => a.words.includes(w) || a.text.includes(w)); }
function userMatKey(a, fallback) { return a.materials && a.materials[0] ? a.materials[0] : fallback; }

function finish(b, mats, root, o) {
  root.add(b.build(mats));
  return { root, category: 'structure', colliderDefs: b.colliders, suppressGrass: o.suppressGrass, ...o };
}

function* bridge(ctx, item, rng) {
  const a = item.attrs;
  const style = has(a, 'suspension', 'rope', 'hanging') ? 'rope' : has(a, 'wood', 'wooden', 'plank') ? 'wood' : has(a, 'stone', 'arch', 'roman') ? 'stone' : rng.pick(['stone', 'wood', 'rope']);
  const L = (a.dims.length || rng.range(14, 24)) * clamp(a.sizeMul || 1, 0.4, 4);
  const W = style === 'rope' ? 1.6 : rng.range(3, 4.5);
  const b = new MeshBuilder();
  const root = new THREE.Group();
  const M = G.materials;
  const mats = { stone: M.get(userMatKey(a, 'castleStone')), deck: M.get(style === 'stone' ? 'cobble' : 'planks'), wood: M.get('darkWood'), rope: M.plain('#b8a070', 0.9), iron: M.get('iron') };
  ctx.stage('geometry', 'Spanning the gap');
  yield;
  const H = style === 'stone' ? 2.2 : 1.2;
  if (style === 'stone') {
    // Deck with a gentle hump, parapets, and arches underneath.
    const n = 24;
    for (let i = 0; i < n; i++) {
      const z0 = -L / 2 + (i / n) * L, z1 = z0 + L / n;
      const y = H * Math.sin(((i + 0.5) / n) * Math.PI);
      b.box({ py: 'deck', default: 'stone' }, [-W / 2, y - 0.5, z0], [W / 2, y, z1], { collide: true });
      for (const s of [-1, 1]) b.box('stone', [s > 0 ? W / 2 - 0.35 : -W / 2, y, z0], [s > 0 ? W / 2 : -W / 2 + 0.35, y + 0.9, z1], { collide: { walkable: false } });
    }
    const arches = Math.max(1, Math.round(L / 9));
    for (let k = 0; k < arches; k++) {
      const zc = -L / 2 + ((k + 0.5) / arches) * L, r = L / arches * 0.42;
      for (let i = 0; i <= 12; i++) { const an = (i / 12) * Math.PI; obox(b, 'stone', 0, -0.5 - r * 0.2 + Math.sin(an) * r * 0.3, zc + Math.cos(an) * r, W, 0.6, r * 0.28, 0, 0, 0); }
      b.box('stone', [-W / 2, -4, zc - r - 0.6], [W / 2, -0.5, zc - r + 0.6]);
    }
  } else if (style === 'wood') {
    for (let z = -L / 2; z < L / 2; z += 0.3) b.box('deck', [-W / 2, 0.5, z], [W / 2, 0.6, z + 0.27]);
    b.collider([-W / 2, 0, -L / 2], [W / 2, 0.6, L / 2]);
    for (const s of [-1, 1]) { railing(b, [[s * (W / 2 - 0.05), -L / 2], [s * (W / 2 - 0.05), L / 2]], 0.6, 1, 'wood', { height: 1 }); for (let z = -L / 2; z <= L / 2; z += 3) b.box('wood', [s * W / 2 - 0.1, -2, z - 0.1], [s * W / 2 + 0.1, 0.6, z + 0.1]); }
    // Ramps at both ends.
    for (const s of [-1, 1]) { const z0 = s * L / 2; for (let i = 0; i < 4; i++) b.box('deck', [-W / 2, 0.15 * i, z0 + s * (i * 0.4)], [W / 2, 0.15 * (i + 1), z0 + s * (i * 0.4 + 0.4)].map((v, k) => (k === 2 && s < 0 ? v : v)), { collide: true }); }
  } else {
    // Rope bridge: sagging planks hung from two ropes between tall posts.
    const sag = L * 0.06;
    const n = Math.round(L / 0.35);
    for (let i = 0; i <= n; i++) {
      const f = i / n, z = -L / 2 + f * L, y = 1.2 - Math.sin(f * Math.PI) * sag;
      obox(b, 'deck', 0, y, z, W, 0.06, 0.28, 0, rng.range(-0.03, 0.03), rng.range(-0.04, 0.04));
      b.colliders.push({ type: 'box', x: 0, z, y0: y - 0.3, y1: y + 0.03, hx: W / 2, hz: 0.2 });
    }
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) { const f = i / 20; pts.push(new THREE.Vector3(s * W / 2, 2.2 - Math.sin(f * Math.PI) * sag, -L / 2 + f * L)); }
      for (let i = 0; i < 20; i++) beam(b, 'rope', pts[i], pts[i + 1], 0.03, 5);
      for (const z of [-L / 2 - 0.2, L / 2 + 0.2]) { ocyl(b, 'wood', s * W / 2, -1, z, 0.12, 4, 8); b.cylCollider(s * W / 2, z, 0, 3, 0.12); }
      for (let i = 0; i <= 20; i += 2) { const f = i / 20; beam(b, 'rope', new THREE.Vector3(s * W / 2, 1.2 - Math.sin(f * Math.PI) * sag, -L / 2 + f * L), pts[i], 0.01, 3); }
    }
    for (const s of [-1, 1]) b.box('deck', [-W / 2, 0, s * L / 2 - 0.5], [W / 2, 1.2, s * L / 2 + 0.5].map((v, k) => v), { collide: true });
  }
  return finish(b, mats, root, { name: { stone: 'Stone arch bridge', wood: 'Wooden bridge', rope: 'Rope bridge' }[style], icon: '🌉', height: H + 1, footprint: { radius: L / 2, rect: { hw: W / 2 + 0.5, hd: L / 2 } }, sideways: false, suppressGrass: false });
}

function* wall(ctx, item, rng) {
  const a = item.attrs;
  const L = (a.dims.length || a.dims.width || rng.range(12, 20)) * clamp(a.sizeMul || 1, 0.3, 5);
  const H = (a.dims.height || rng.range(2.2, 4)) * (a.dims.height ? 1 : clamp(a.sizeMul || 1, 0.5, 3));
  const great = has(a, 'great wall', 'castle', 'fortress', 'battlement');
  const kind = has(a, 'brick') ? 'brick' : has(a, 'glass') ? 'glass' : has(a, 'wood', 'wooden', 'log') ? 'logs' : great ? 'castleStone' : userMatKey(a, 'fieldstone');
  const b = new MeshBuilder();
  const root = new THREE.Group();
  ctx.stage('geometry', 'Laying stones');
  yield;
  const T = great ? 2.4 : 0.6;
  b.box('w', [-L / 2, 0, -T / 2], [L / 2, H, T / 2], { collide: true });
  if (great || rng.chance(0.4)) { const n = Math.floor(L / 1.3); for (let i = 0; i < n; i++) { const x = -L / 2 + (i + 0.5) * (L / n); b.box('w', [x - L / n * 0.3, H, -T / 2], [x + L / n * 0.3, H + 0.7, -T / 2 + 0.5]); } }
  b.box('cap', [-L / 2 - 0.05, H - 0.02, -T / 2 - 0.05], [L / 2 + 0.05, H + 0.1, T / 2 + 0.05]);
  const mats = { w: G.materials.get(kind, { color: a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : undefined }), cap: G.materials.get('stone') };
  return finish(b, mats, root, { name: great ? 'Great wall' : `${kind === 'brick' ? 'Brick' : 'Stone'} wall`, icon: '🧱', height: H, footprint: { radius: L / 2, rect: { hw: L / 2, hd: T / 2 + 0.3 } }, flattenTerrain: great, suppressGrass: false });
}

function* fenceGen(ctx, item, rng, env) {
  const a = item.attrs;
  const around = item.placement && item.placement.mode === 'around';
  const style = has(a, 'picket', 'white') ? 'picket' : has(a, 'iron', 'metal', 'wrought') ? 'iron' : has(a, 'stone') ? 'wall' : rng.pick(['picket', 'rail', 'rail']);
  const L = (a.dims.length || rng.range(10, 18)) * clamp(a.sizeMul || 1, 0.3, 5);
  const b = new MeshBuilder();
  const root = new THREE.Group();
  ctx.stage('geometry', 'Setting posts');
  yield;
  let pts;
  if (around) { const R = 5; pts = []; for (let i = 0; i <= 24; i++) { const an = (i / 24) * TAU; if (i === 0) continue; pts.push([Math.cos(an) * R, Math.sin(an) * R]); } pts.push([R * Math.cos(TAU / 24), R * Math.sin(TAU / 24)]); }
  else pts = [[-L / 2, 0], [L / 2, 0]];
  if (style === 'iron') {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.14));
      for (let k = 0; k <= n; k++) { const f = k / n; const x = ax + (bx - ax) * f, z = az + (bz - az) * f; b.box('iron', [x - 0.012, 0, z - 0.012], [x + 0.012, 1.5, z + 0.012]); b.box('iron', [x - 0.025, 1.5, z - 0.025], [x + 0.025, 1.58, z + 0.025]); }
      beam(b, 'iron', new THREE.Vector3(ax, 1.35, az), new THREE.Vector3(bx, 1.35, bz), 0.02, 4); beam(b, 'iron', new THREE.Vector3(ax, 0.15, az), new THREE.Vector3(bx, 0.15, bz), 0.02, 4);
      b.collider([Math.min(ax, bx) - 0.05, 0, Math.min(az, bz) - 0.05], [Math.max(ax, bx) + 0.05, 1.5, Math.max(az, bz) + 0.05], { walkable: false });
    }
  } else gardenFence(b, pts, style, style === 'picket' ? 'fenceWhite' : 'fenceWood', {});
  const mats = { fenceWhite: G.materials.get('paint', { color: a.primaryColor || '#f4f4f0' }), fenceWood: G.materials.get(a.primaryColor ? 'paint' : 'wood', { color: a.primaryColor }), fenceStone: G.materials.get('fieldstone'), iron: G.materials.get('iron'), wall: G.materials.get('fieldstone'), frame: G.materials.get('wood') };
  return finish(b, mats, root, { name: around ? 'Fence around you' : `${style[0].toUpperCase() + style.slice(1)} fence`, icon: '🚧', height: 1.4, footprint: { radius: around ? 5.5 : L / 2, rect: around ? undefined : { hw: L / 2, hd: 0.3 } }, suppressGrass: false, preferPlacement: around ? 'here' : undefined });
}

function* arch(ctx, item, rng) {
  const a = item.attrs;
  const S = clamp(a.sizeMul || 1, 0.4, 5);
  const W = rng.range(5, 8) * S, H = rng.range(7, 10) * S, D = rng.range(2, 3) * S;
  const b = new MeshBuilder();
  const root = new THREE.Group();
  ctx.stage('geometry', 'Carving the arch');
  yield;
  const pw = W * 0.28, openW = W - pw * 2, springY = H * 0.55;
  for (const s of [-1, 1]) b.box('m', [s > 0 ? W / 2 - pw : -W / 2, 0, -D / 2], [s > 0 ? W / 2 : -W / 2 + pw, H, D / 2], { collide: true });
  b.box('m', [-W / 2 + pw, springY + openW / 2, -D / 2], [W / 2 - pw, H, D / 2], { collide: true });
  // Voussoirs.
  for (let i = 0; i <= 14; i++) { const an = (i / 14) * Math.PI; const r = openW / 2; obox(b, 'trim', Math.cos(an) * r, springY + Math.sin(an) * r, 0, 0.5 * S, 0.35 * S, D * 1.02, 0, 0, an - Math.PI / 2); }
  for (let i = 0; i <= 20; i++) { const an = (i / 20) * Math.PI; const r = openW / 2 - 0.02; obox(b, 'm', Math.cos(an) * (r + openW * 0.12), springY + Math.sin(an) * (r + openW * 0.12) * 0.5 + openW * 0.2, 0, openW * 0.14, openW * 0.4, D * 0.98, 0, 0, an - Math.PI / 2); }
  b.box('trim', [-W / 2 - 0.2 * S, H, -D / 2 - 0.2 * S], [W / 2 + 0.2 * S, H + 0.6 * S, D / 2 + 0.2 * S]);
  b.box('trim', [-W / 2 - 0.2 * S, 0, -D / 2 - 0.2 * S], [W / 2 + 0.2 * S, 0.5 * S, D / 2 + 0.2 * S]);
  const label = a.label;
  if (label) { const tex = labelTexture(label, { fg: '#2a2016', w: 1024, h: 200, font: 'Georgia, serif' }); for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.8, W * 0.16), new THREE.MeshStandardMaterial({ map: tex, transparent: true })); p.position.set(0, H - 0.8 * S, s * (D / 2 + 0.01)); if (s < 0) p.rotation.y = Math.PI; root.add(p); } }
  const mats = { m: G.materials.get(userMatKey(a, rng.pick(['marble', 'castleStone', 'sand']))), trim: G.materials.get('stone', { color: '#d8d0c0' }) };
  return finish(b, mats, root, { name: label ? `Arch: ${label}` : 'Triumphal arch', icon: '🏛️', height: H + 0.6 * S, footprint: { radius: W / 2, rect: { hw: W / 2 + 0.3, hd: D / 2 + 0.3 } }, flattenTerrain: true, flattenFalloff: 3 });
}

function* staircase(ctx, item, rng) {
  const a = item.attrs;
  const sky = has(a, 'sky', 'heaven', 'clouds', 'endless', 'infinite');
  const spiral = sky || has(a, 'spiral', 'winding');
  const H = (a.dims.height || (sky ? rng.range(40, 80) : rng.range(4, 8))) * (a.dims.height ? 1 : clamp(a.sizeMul || 1, 0.3, 6));
  const b = new MeshBuilder();
  const root = new THREE.Group();
  ctx.stage('geometry', 'Building steps');
  yield;
  const matKey = sky ? 'marble' : userMatKey(a, 'stone');
  if (spiral) {
    const R = sky ? 3 : 2.2, turns = H / 3.2;
    const n = Math.round(H / 0.2);
    for (let i = 0; i < n; i++) {
      const an = (i / n) * turns * TAU, y = (i + 1) * (H / n);
      const x = Math.cos(an) * R * 0.55, z = Math.sin(an) * R * 0.55;
      obox(b, 's', x, y - 0.08, z, R * 0.9, 0.16, 0.55, -an, 0, 0);
      b.colliders.push({ type: 'box', x, z, y0: y - 0.16, y1: y, hx: R * 0.45, hz: 0.3, yaw: -an });
      if (i % 6 === 0) { const rx = Math.cos(an) * R, rz = Math.sin(an) * R; ocyl(b, 'rail', rx, y, rz, 0.02, 1, 6); }
    }
    ocyl(b, 's', 0, 0, 0, 0.3, H + 0.5, 12);
    b.cylCollider(0, 0, 0, H + 0.5, 0.3);
    slab(b, -R, -R, R, R, H, 0.25, { default: 's' });
    if (sky) { const g = glowSprite('#fff0d0', 12, 0.7); g.position.y = H + 2; root.add(g); }
  } else {
    const W = 2.4, run = H * 1.5;
    buildStairs(b, -W / 2, W / 2, -run / 2, 0, H, run, { default: 's' }, { solid: true });
    b.box('s', [-W / 2, 0, run / 2], [W / 2, H, run / 2 + 2.5], { collide: true });
    for (const s of [-1, 1]) railing(b, [[s * W / 2, -run / 2], [s * W / 2, run / 2]], 0, H, 'rail', { sloped: true, run });
  }
  const mats = { s: G.materials.get(matKey, { color: a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : undefined }), rail: G.materials.get('iron') };
  return finish(b, mats, root, { name: sky ? 'Stairway to heaven' : spiral ? 'Spiral staircase' : 'Staircase', icon: '🪜', height: H, footprint: { radius: spiral ? 3 : H }, lights: sky ? [{ pos: [0, H + 1, 0], color: '#fff0d0', intensity: 4, distance: 20, nightOnly: false }] : null });
}

function* road(ctx, item, rng) {
  const a = item.attrs;
  const L = (a.dims.length || rng.range(50, 90)) * clamp(a.sizeMul || 1, 0.3, 4);
  const W = has(a, 'highway', 'motorway') ? 14 : has(a, 'path', 'trail', 'dirt') ? 2.4 : 7;
  const dirt = has(a, 'dirt', 'trail', 'path', 'gravel');
  const root = new THREE.Group();
  ctx.stage('geometry', 'Paving');
  yield;
  // Asphalt ribbon that follows the terrain (conformed in onAdded) + lane markings.
  const segs = Math.round(L / 2);
  const geo = new THREE.PlaneGeometry(W, L, 2, segs).rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W, uv.getY(i) * L);
  const mat = G.materials.get(dirt ? 'gravel' : 'asphalt', { world: 3 });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  root.add(m);
  const marks = [];
  if (!dirt) {
    const lineMat = G.materials.plain('#f0f0e8', 0.6);
    for (let z = -L / 2 + 1; z < L / 2 - 1; z += 4) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 2).rotateX(-Math.PI / 2), lineMat); d.position.set(0, 0.03, z); root.add(d); marks.push(d); }
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.12, L).rotateX(-Math.PI / 2), lineMat); e.position.set(s * (W / 2 - 0.3), 0.03, 0); root.add(e); marks.push(e); }
  }
  return {
    root, name: dirt ? 'Dirt path' : W > 10 ? 'Highway' : 'Road', category: 'structure', icon: '🛣️', height: 0.1, footprint: { radius: L / 2, rect: { hw: W / 2 + 0.5, hd: L / 2 } }, suppressGrass: undefined, keepVegetation: false,
    paintGround: [{ type: 'paint', shape: 'rect', x: 0, z: 0, hw: W / 2 + 0.4, hd: L / 2, yaw: 0, radius: Math.hypot(W, L) / 2, channel: dirt ? 1 : 0, value: 255, falloff: 0.6, alsoSuppressGrass: true }],
    onAdded(world) {
      const pos = geo.attributes.position;
      const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
      for (let i = 0; i < pos.count; i++) { const wp = new THREE.Vector3(pos.getX(i), 0, pos.getZ(i)).applyMatrix4(this.root.matrixWorld); const h = world.heightAt(wp.x, wp.z) + 0.05; pos.setY(i, new THREE.Vector3(wp.x, h, wp.z).applyMatrix4(inv).y); }
      pos.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
      for (const d of marks) { const wp = d.position.clone().applyMatrix4(this.root.matrixWorld); d.position.y = new THREE.Vector3(wp.x, world.heightAt(wp.x, wp.z) + 0.08, wp.z).applyMatrix4(inv).y; }
    },
  };
}

function* poolGen(ctx, item, rng) {
  const a = item.attrs;
  const W = rng.range(4, 6) * clamp(a.sizeMul || 1, 0.5, 4), D = W * rng.range(1.6, 2.2);
  const b = new MeshBuilder();
  const root = new THREE.Group();
  const deck = new THREE.Group();
  ctx.stage('geometry', 'Digging the pool');
  yield;
  const op = gardenPool(deck, b, 0, 0, W, D, 1.6);
  root.add(deck);
  // Loungers.
  const fm = furnitureMaterials(rng, {});
  const seats = [];
  for (const s of [-1, 1]) { const info = placePiece(b, 'bench', rng, W / 2 + 1.4, 0, s * D * 0.25, -Math.PI / 2, {}); seats.push(...info.seats); }
  const mats = { ...fm, coping: G.materials.get('concrete', { color: '#d8d6d0' }), poolTiles: G.materials.get('poolTiles'), deck: G.materials.get('deck'), frame: G.materials.get('chrome') };
  root.add(b.build(mats));
  const data = { root, name: 'Swimming pool', category: 'structure', icon: '🏊', height: 1, footprint: { radius: Math.hypot(W, D) / 2 + 1.5, rect: { hw: W / 2 + 2.2, hd: D / 2 + 1.2 } }, colliderDefs: b.colliders, flattenTerrain: true, flattenFalloff: 3, terrainOps: op ? [op] : [], seats };
  data.seatWorld = seatWorldFn(data);
  data.interact = { label: () => 'Relax on a lounger', action: (e, player) => sitNearest(data, player) };
  data.onAdded = function (world) { this.waterVol = { x: this.root.position.x, z: this.root.position.z, r: Math.min(W, D) / 2, level: this.root.position.y - 0.15 }; world.waterVolumes.push(this.waterVol); };
  data.onRemove = function (world) { if (this.waterVol) world.waterVolumes.splice(world.waterVolumes.indexOf(this.waterVol), 1); };
  return data;
}

function* stage(ctx, item, rng) {
  const a = item.attrs;
  const W = 10 * clamp(a.sizeMul || 1, 0.5, 3), D = 6 * clamp(a.sizeMul || 1, 0.5, 3), H = 1.2;
  const b = new MeshBuilder();
  const root = new THREE.Group();
  ctx.stage('geometry', 'Setting the stage');
  yield;
  b.box({ py: 'floor', default: 'black' }, [-W / 2, 0, -D / 2], [W / 2, H, D / 2], { collide: true });
  buildStairs(b, -1, 1, D / 2, 0, H, 1.6, { default: 'black' }, { solid: true });
  // Truss & lights.
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) { ocyl(b, 'truss', x, H, z, 0.12, 5, 8); b.cylCollider(x, z, H, H + 5, 0.12); }
  for (const z of [-D / 2, D / 2]) b.box('truss', [-W / 2, H + 5, z - 0.12], [W / 2, H + 5.25, z + 0.12]);
  const cols = ['#ff3070', '#30a0ff', '#ffd030', '#a040ff', '#30ff90'];
  const beams = [];
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 + ((i + 0.5) / 6) * W;
    const col = cols[i % cols.length];
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.35, 12), G.materials.get('emissive', { color: col, emissiveIntensity: 3 }));
    lamp.position.set(x, H + 4.8, D / 2); root.add(lamp);
    const bm = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 16, 1, true).translate(0, -2.5, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    bm.position.copy(lamp.position); bm.userData.noRaycast = true; root.add(bm); beams.push({ bm, ph: i });
  }
  // Curtain backdrop, speakers, mic stand.
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(W, 5.2, 40, 1), G.materials.get('velvet', { color: a.primaryColor || '#6a0a1a', side: THREE.DoubleSide }));
  const cp = curtain.geometry.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 4) * 0.12);
  curtain.geometry.computeVertexNormals();
  curtain.position.set(0, H + 2.6, -D / 2 + 0.2); root.add(curtain);
  for (const s of [-1, 1]) b.box('black', [s * W / 2 - 0.5, H, D / 2 - 1.2], [s * W / 2 + 0.5, H + 1.8, D / 2 - 0.4], { collide: true });
  ocyl(b, 'truss', 0, H, D / 4, 0.02, 1.5, 6);
  const mats = { floor: G.materials.get('planks', { color: '#3a2a20' }), black: G.materials.plain('#141416', 0.7), truss: G.materials.get('steel') };
  const data = finish(b, mats, root, { name: 'Concert stage', icon: '🎤', height: H + 5.3, footprint: { radius: Math.hypot(W, D) / 2, rect: { hw: W / 2 + 0.5, hd: D / 2 + 1.8 } }, flattenTerrain: true, flattenFalloff: 3 });
  data.lights = [{ pos: [-W / 4, H + 3, D / 2], color: '#ff3070', intensity: 4, distance: 14 }, { pos: [W / 4, H + 3, D / 2], color: '#30a0ff', intensity: 4, distance: 14 }];
  animate(root, (t) => { for (const b2 of beams) { b2.bm.rotation.z = Math.sin(t * 1.2 + b2.ph) * 0.5; b2.bm.rotation.x = Math.cos(t * 0.9 + b2.ph) * 0.3; } });
  return data;
}

function* playground(ctx, item, rng) {
  const root = new THREE.Group();
  const b = new MeshBuilder();
  const M = G.materials;
  ctx.stage('geometry', 'Building a playground');
  yield;
  const cols = ['#e83a3a', '#3a8ae8', '#f0c020', '#3ac860'];
  const mats = { red: M.get('glossyPlastic', { color: cols[0] }), blue: M.get('glossyPlastic', { color: cols[1] }), yellow: M.get('glossyPlastic', { color: cols[2] }), green: M.get('glossyPlastic', { color: cols[3] }), steel: M.get('steel'), wood: M.get('wood'), sand: M.get('sand'), rubber: M.get('rubber', { color: '#3a3a3a' }) };
  // Slide tower.
  const tx = -3, tz = 0;
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { ocyl(b, 'steel', tx + x, 0, tz + z, 0.06, 3.2, 8); b.cylCollider(tx + x, tz + z, 0, 3.2, 0.06); }
  b.box('wood', [tx - 0.9, 1.6, tz - 0.9], [tx + 0.9, 1.72, tz + 0.9], { collide: true });
  b.box('red', [tx - 1, 3.2, tz - 1], [tx + 1, 3.3, tz + 1]);
  for (let i = 0; i < 8; i++) b.box('steel', [tx - 0.3, i * 0.2 + 0.2, tz - 1.2 - i * 0.01], [tx + 0.3, i * 0.2 + 0.24, tz - 1.0]);
  const slideLen = 3.5;
  obox(b, 'yellow', tx + 0.9 + slideLen * 0.45, 0.85, tz, slideLen, 0.08, 0.8, Math.PI / 2, 0, -0.45);
  for (const s of [-1, 1]) obox(b, 'yellow', tx + 0.9 + slideLen * 0.45, 1.0, tz + s * 0.42, slideLen, 0.3, 0.06, Math.PI / 2, 0, -0.45);
  // Swing set with two animated swings.
  const sx = 3, sz = 0;
  for (const s of [-1, 1]) { beam(b, 'steel', new THREE.Vector3(sx + s * 2, 0, sz - 1), new THREE.Vector3(sx + s * 2, 2.6, sz), 0.05, 8); beam(b, 'steel', new THREE.Vector3(sx + s * 2, 0, sz + 1), new THREE.Vector3(sx + s * 2, 2.6, sz), 0.05, 8); }
  beam(b, 'steel', new THREE.Vector3(sx - 2, 2.6, sz), new THREE.Vector3(sx + 2, 2.6, sz), 0.05, 8);
  const swings = [];
  for (const x of [-0.8, 0.8]) {
    const pivot = new THREE.Group(); pivot.position.set(sx + x, 2.6, sz);
    for (const dx of [-0.25, 0.25]) { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.1, 4), mats.steel); ch.position.set(dx, -1.05, 0); pivot.add(ch); }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.25), mats.rubber); seat.position.y = -2.1; pivot.add(seat);
    root.add(pivot); swings.push({ pivot, ph: rng.range(0, 6) });
  }
  // Seesaw & sandbox.
  const saw = new THREE.Group(); saw.position.set(0, 0.45, 4);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 3.6), mats.blue); saw.add(plank); root.add(saw);
  b.box('steel', [-0.1, 0, 3.9], [0.1, 0.45, 4.1]);
  b.box('wood', [-1.5, 0, -4.5], [1.5, 0.3, -4.3]); b.box('wood', [-1.5, 0, -1.7], [1.5, 0.3, -1.5]); b.box('wood', [-1.5, 0, -4.5], [-1.3, 0.3, -1.5]); b.box('wood', [1.3, 0, -4.5], [1.5, 0.3, -1.5]);
  b.box('sand', [-1.3, 0, -4.3], [1.3, 0.2, -1.7]);
  root.add(b.build(mats));
  animate(root, (t) => { for (const s of swings) s.pivot.rotation.x = Math.sin(t * 1.6 + s.ph) * 0.35; saw.rotation.x = Math.sin(t * 0.8) * 0.2; });
  return { root, name: 'Playground', category: 'structure', icon: '🛝', height: 3.3, footprint: { radius: 6.5 }, colliderDefs: b.colliders, flattenTerrain: true, flattenFalloff: 3, paintGround: [{ type: 'paint', x: 0, z: 0, radius: 6.5, channel: 1, value: 180, falloff: 1.5 }] };
}

export const structureGen = {
  maxCount: 6,
  estimate: () => 1.2,
  stages: () => [{ name: 'geometry', label: 'Building', weight: 3 }, { name: 'textures', label: 'Materials', weight: 1 }],
  *build(ctx, item, rng, env) {
    let data;
    switch (item.params.kind) {
      case 'bridge': data = yield* bridge(ctx, item, rng); break;
      case 'wall': data = yield* wall(ctx, item, rng); break;
      case 'fence': data = yield* fenceGen(ctx, item, rng, env); break;
      case 'arch': data = yield* arch(ctx, item, rng); break;
      case 'stairs': data = yield* staircase(ctx, item, rng); break;
      case 'road': data = yield* road(ctx, item, rng); break;
      case 'pool': data = yield* poolGen(ctx, item, rng); break;
      case 'stage': data = yield* stage(ctx, item, rng); break;
      case 'playground': data = yield* playground(ctx, item, rng); break;
      default: data = yield* wall(ctx, item, rng);
    }
    return data;
  },
};
