// ---------------------------------------------------------------------------
// World vegetation scatter: trees, bushes and boulders as instanced meshes,
// grouped into 256 m cells (frustum culling + distance LOD per cell).
//
// Species are chosen from altitude, slope, distance to water and a forest
// density field. Each tree gets a trunk collider. Instances overlapping a
// newly generated entity (e.g. a house placed in a forest) are removed so
// creations never intersect vegetation.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { buildTree, buildRock, treeMaterials, TREE_SPECIES } from './trees.js';
import { G } from '../core/context.js';
import { markNoAO } from '../render/renderer.js';

// JS port of the terrain shader's hash value noise (keeps forests and the
// forest-floor texture layer roughly aligned).
function fract(x) { return x - Math.floor(x); }
function tHash(x, y) {
  let p3x = fract(x * 0.1031), p3y = fract(y * 0.1031), p3z = fract(x * 0.1031);
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d; p3y += d; p3z += d;
  return fract((p3x + p3y) * p3z);
}
function tNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = tHash(ix, iy), b = tHash(ix + 1, iy), c = tHash(ix, iy + 1), d = tHash(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
export function tFbm(x, y) { return tNoise(x, y) * 0.5 + tNoise(x * 2.03 + 7.1, y * 2.03 + 7.1) * 0.3 + tNoise(x * 4.1 + 3.3, y * 4.1 + 3.3) * 0.2; }
export function forestDensity(x, z) { const f = tFbm(x * 0.008 + 5, z * 0.008 + 5); return Math.min(1, Math.max(0, (f - 0.5) / 0.22)); }

const CELL = 256;

export class Vegetation {
  constructor(world, opts = {}) {
    this.world = world;
    this.terrain = world.terrain;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    this.density = opts.density ?? 1;
    this.protos = [];     // {key, species, lod0:{bark,leaves}, lod1:{...}, mats, height, trunkR}
    this.instances = [];  // {proto, x, y, z, rot, scale, cell, index, collider, removed}
    this.cells = new Map();
    this.spawnClear = opts.spawnClear ?? 38;
    this.rules = opts.rules || null;
    this.seed = opts.seed || 1;
  }

  _proto(species, variant, extra = {}) {
    const key = species + ':' + variant + (extra.tag || '');
    let p = this.protos.find((q) => q.key === key);
    if (p) return p;
    const seed = 1000 + variant * 7919 + species.length * 131;
    const hi = buildTree(species, seed, 1, extra.overrides);
    const lo = buildTree(species, seed, 0.3, extra.overrides);
    const mats = treeMaterials(species, variant, extra.overrides || {});
    p = { key, species, lod0: hi, lod1: lo, mats, height: hi.height, trunkR: hi.trunkRadius, crownR: hi.crownRadius, rock: false };
    this.protos.push(p);
    return p;
  }

  _rockProto(variant) {
    const key = 'rock:' + variant;
    let p = this.protos.find((q) => q.key === key);
    if (p) return p;
    const geo = buildRock(5000 + variant * 37, 1, { detail: 3, moss: 0.7 });
    const geoLo = buildRock(5000 + variant * 37, 1, { detail: 1, moss: 0.7 });
    const mat = G.materials.get('rock', { seed: variant % 2, vertexColors: true, world: 3 });
    p = { key, rock: true, geo, geoLo, mat, height: geo.boundingBox.max.y };
    this.protos.push(p);
    return p;
  }

  // Scatter for the overworld. Generator for progressive loading.
  *scatterOverworld(onProgress) {
    const T = this.terrain;
    const rng = new RNG(this.seed);
    const spacing = 5.5 / Math.sqrt(Math.max(0.2, this.density));
    const half = T.half - 8;
    const water = T.waterLevel;
    const lakeInfo = this.world.lake;
    let count = 0;
    const n = Math.floor((half * 2) / spacing);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -half + (i + rng.next()) * spacing, z = -half + (j + rng.next()) * spacing;
        const r = Math.hypot(x, z);
        if (r < this.spawnClear) continue;
        const h = T.heightAt(x, z);
        if (h < water + 1.2) continue;
        const slope = T.slopeAt(x, z);
        if (slope > 0.42) continue;
        if (h > 150) continue;
        const f = forestDensity(x, z);
        const nearLake = lakeInfo ? Math.hypot(x - lakeInfo.x, z - lakeInfo.z) < lakeInfo.r + 25 : false;
        let p = 0.012 + f * 0.75;
        if (r < 90) p *= 0.25 + (r - this.spawnClear) / 90;
        if (h > 110) p *= 0.4;
        if (!rng.chance(p)) {
          // Boulders and bushes where no tree.
          if (rng.chance(0.012 + slope * 0.05 + (h > 60 ? 0.02 : 0))) this._addRock(rng, x, z, h, rng.range(0.4, slope > 0.25 ? 2.8 : 1.6));
          else if (rng.chance(0.02 + f * 0.05)) this._addTree(this._proto('bush', rng.int(0, 1)), x, z, h, rng.range(0.7, 1.4), rng, false);
          continue;
        }
        // Species selection.
        let species;
        const alt = h + (tFbm(x * 0.02, z * 0.02) - 0.5) * 40;
        const pick = tFbm(x * 0.006 + 20, z * 0.006 - 13);
        if (nearLake && rng.chance(0.3)) species = 'willow';
        else if (alt > 55) species = rng.chance(0.6) ? 'pine' : 'spruce';
        else if (pick > 0.62) species = rng.chance(0.7) ? 'pine' : 'spruce';
        else if (pick < 0.32) species = 'birch';
        else if (r < 140 && rng.chance(0.07)) species = 'cherry';
        else species = rng.chance(0.6) ? 'oak' : 'maple';
        const variant = rng.int(0, species === 'oak' || species === 'pine' ? 2 : 1);
        this._addTree(this._proto(species, variant), x, z, h, rng.range(0.75, 1.25), rng, true);
        count++;
      }
      if (j % 6 === 0) { if (onProgress) onProgress(j / n); yield; }
    }
    this._buildMeshes();
  }

  // Generic scatter used by dimensions: rules = [{species|rock, density, minR, filter(x,z,h)}]
  *scatterCustom(rules, area, onProgress) {
    const rng = new RNG(this.seed);
    for (const rule of rules) {
      const spacing = rule.spacing || 6;
      const n = Math.floor((area * 2) / spacing);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const x = -area + (i + rng.next()) * spacing, z = -area + (j + rng.next()) * spacing;
          if (Math.hypot(x, z) < (rule.minR ?? 20)) continue;
          const h = this.world.colliders.terrainHeight(x, z);
          if (rule.filter && !rule.filter(x, z, h)) continue;
          if (!rng.chance(rule.density)) continue;
          if (rule.rock) this._addRock(rng, x, z, h, rng.range(rule.minSize || 0.5, rule.maxSize || 2));
          else this._addTree(this._proto(rule.species, rng.int(0, rule.variants || 1), { overrides: rule.overrides, tag: rule.tag || '' }), x, z, h, rng.range(0.7, 1.3) * (rule.scale || 1), rng, rule.collide !== false);
        }
        if (j % 8 === 0) yield;
      }
    }
    this._buildMeshes();
  }

  _addTree(proto, x, z, h, scale, rng, collide) {
    const inst = { proto, x, y: h - 0.05, z, rot: rng.range(0, Math.PI * 2), scale, removed: false };
    if (collide && proto.trunkR > 0.05) {
      const r = Math.max(0.15, proto.trunkR * scale * 1.1);
      inst.collider = this.world.colliders.cyl(x, z, h - 1, h + proto.height * scale * 0.6, r, { owner: 'veg', vegetation: true });
    }
    this.instances.push(inst);
  }

  _addRock(rng, x, z, h, size) {
    const proto = this._rockProto(rng.int(0, 3));
    const inst = { proto, x, y: h - size * 0.15, z, rot: rng.range(0, Math.PI * 2), scale: size, removed: false };
    if (size > 0.6) inst.collider = this.world.colliders.cyl(x, z, h - 1, h + proto.height * size * 0.75, size * 0.85, { owner: 'veg', vegetation: true });
    this.instances.push(inst);
  }

  _buildMeshes() {
    // Group instances by cell and prototype.
    const groups = new Map();
    this.instances.forEach((inst, idx) => {
      const ci = Math.floor((inst.x + 4096) / CELL), cj = Math.floor((inst.z + 4096) / CELL);
      const key = ci + ',' + cj + '|' + inst.proto.key;
      let g = groups.get(key);
      if (!g) { g = { ci, cj, proto: inst.proto, list: [] }; groups.set(key, g); }
      g.list.push(idx);
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const g of groups.values()) {
      const cellKey = g.ci + ',' + g.cj;
      let cell = this.cells.get(cellKey);
      if (!cell) {
        cell = { cx: g.ci * CELL - 4096 + CELL / 2, cz: g.cj * CELL - 4096 + CELL / 2, meshes: [], lod: 0 };
        this.cells.set(cellKey, cell);
      }
      const parts = g.proto.rock
        ? [{ hi: g.proto.geo, lo: g.proto.geoLo, mat: g.proto.mat, shadow: true }]
        : [
          g.proto.lod0.bark && { hi: g.proto.lod0.bark, lo: g.proto.lod1.bark || g.proto.lod0.bark, mat: g.proto.mats.barkMat, shadow: true },
          g.proto.lod0.leaves && { hi: g.proto.lod0.leaves, lo: g.proto.lod1.leaves || g.proto.lod0.leaves, mat: g.proto.mats.leafMat, shadow: true, leaves: true },
        ].filter(Boolean);
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(part.hi, part.mat, g.list.length);
        mesh.castShadow = part.shadow;
        mesh.receiveShadow = true;
        mesh.userData.noRaycast = true;
        mesh.userData.hi = part.hi; mesh.userData.lo = part.lo;
        g.list.forEach((idx, k) => {
          const inst = this.instances[idx];
          p.set(inst.x, inst.y, inst.z);
          q.setFromAxisAngle(yAxis, inst.rot);
          s.setScalar(inst.scale);
          m.compose(p, q, s);
          mesh.setMatrixAt(k, m);
          (inst.meshes || (inst.meshes = [])).push({ mesh, k });
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        if (part.leaves) markNoAO(mesh);
        cell.meshes.push(mesh);
        this.group.add(mesh);
      }
    }
    // Keep the materials alive for the world's lifetime.
    for (const pr of this.protos) {
      if (pr.rock) G.materials.retain(pr.mat);
      else { G.materials.retain(pr.mats.barkMat); if (pr.mats.leafMat) G.materials.retain(pr.mats.leafMat); }
    }
  }

  // Remove vegetation overlapping a circle or rotated rect footprint.
  clearArea(x, z, radius, rect = null) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let removed = 0;
    for (const inst of this.instances) {
      if (inst.removed) continue;
      const pad = inst.proto.rock ? inst.scale : (inst.proto.trunkR || 0.3) * inst.scale + 0.5;
      let inside;
      if (rect) {
        const c = Math.cos(rect.yaw || 0), s = Math.sin(rect.yaw || 0);
        const dx = inst.x - x, dz = inst.z - z;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        inside = Math.abs(lx) < rect.hw + pad && Math.abs(lz) < rect.hd + pad;
      } else inside = Math.hypot(inst.x - x, inst.z - z) < radius + pad;
      if (!inside) continue;
      inst.removed = true;
      removed++;
      if (inst.collider) this.world.colliders.remove(inst.collider);
      for (const { mesh, k } of inst.meshes || []) { mesh.setMatrixAt(k, zero); mesh.instanceMatrix.needsUpdate = true; }
    }
    return removed;
  }

  // Re-seat instances after terrain edits.
  reseat(x, z, radius) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const inst of this.instances) {
      if (inst.removed || Math.hypot(inst.x - x, inst.z - z) > radius) continue;
      const h = this.terrain.heightAt(inst.x, inst.z);
      if (h < this.terrain.waterLevel + 0.5 || this.terrain.slopeAt(inst.x, inst.z) > 0.55) { this.clearArea(inst.x, inst.z, 0.01); continue; }
      inst.y = h - (inst.proto.rock ? inst.scale * 0.15 : 0.05);
      p.set(inst.x, inst.y, inst.z); q.setFromAxisAngle(yAxis, inst.rot); s.setScalar(inst.scale); m.compose(p, q, s);
      for (const { mesh, k } of inst.meshes || []) { mesh.setMatrixAt(k, m); mesh.instanceMatrix.needsUpdate = true; }
      if (inst.collider) { inst.collider.y0 = h - 1; inst.collider.y1 = h + (inst.proto.height || 1) * inst.scale * 0.6; }
    }
  }

  update(camPos) {
    for (const cell of this.cells.values()) {
      const d = Math.hypot(camPos.x - cell.cx, camPos.z - cell.cz);
      const lod = d > 330 ? 1 : 0;
      if (lod !== cell.lod) {
        cell.lod = lod;
        for (const mesh of cell.meshes) mesh.geometry = lod ? mesh.userData.lo : mesh.userData.hi;
      }
      const castFar = d < 260;
      for (const mesh of cell.meshes) mesh.castShadow = castFar;
    }
  }

  dispose() {
    for (const p of this.protos) {
      if (p.rock) { p.geo.dispose(); p.geoLo.dispose(); G.materials.release(p.mat); }
      else {
        for (const l of [p.lod0, p.lod1]) { if (l.bark) l.bark.dispose(); if (l.leaves) l.leaves.dispose(); }
        G.materials.release(p.mats.barkMat); if (p.mats.leafMat) G.materials.release(p.mats.leafMat);
      }
    }
    for (const cell of this.cells.values()) for (const m of cell.meshes) m.dispose();
  }
}

export { TREE_SPECIES };
