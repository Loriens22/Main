// World container + the overworld builder.
//
// A World owns a THREE.Scene, its atmosphere (sky, sun, env map, fog), an
// optional terrain, a collision set, gameplay rules (gravity, speed, jump,
// swimming) and the entities created inside it. The overworld is World 0;
// every portal creates an additional World with its own rules.

import * as THREE from 'three';
import { Noise, smoothstep } from '../core/noise.js';
import { Atmosphere } from '../render/atmosphere.js';
import { Terrain } from './terrain.js';
import { GrassLayer } from './grass.js';
import { Vegetation } from './vegetation.js';
import { createLakePlane } from './water.js';
import { Weather } from './weather.js';
import { ColliderSet } from '../physics/collision.js';
import { G, settings } from '../core/context.js';

let WORLD_ID = 0;

export class World {
  constructor(opts = {}) {
    this.id = opts.id ?? WORLD_ID++;
    WORLD_ID = Math.max(WORLD_ID, this.id + 1);
    this.name = opts.name || 'World';
    this.kind = opts.kind || 'overworld';
    this.scene = new THREE.Scene();
    this.scene.name = this.name;
    this.terrain = null;
    this.colliders = new ColliderSet(null);
    this.rules = { gravity: 9.81, speed: 1, jump: 1, swim: false, water: false, drag: 0, fallRespawn: -80, ...(opts.rules || {}) };
    this.entities = new Set();
    this.portals = [];
    this.updaters = [];
    this.spawn = { pos: new THREE.Vector3(0, 0, 0), yaw: 0 };
    this.post = { tint: [1, 1, 1], lift: [0, 0, 0], saturation: 1.08, contrast: 1.04, vignette: 0.28, wobble: 0, ca: 0.0015, grain: 0.035, pulse: 0, invert: 0, ...(opts.post || {}) };
    this.waterLevel = opts.waterLevel ?? -1e9;
    this.waterVolumes = [];
    this.bounds = opts.bounds || 490;
    this.atmosphere = null;
    this.weather = null;
    this.grass = [];
    this.vegetation = null;
    this.seed = opts.seed || 1;
    this.meta = opts.meta || {};
    this.ambientSound = opts.ambientSound || 'nature';
  }

  heightAt(x, z) { return this.colliders.terrainHeight(x, z); }

  // Water surface height at (x, z): the global sea/lake level or any local
  // water body (generated lakes, ponds, rivers, pools). -1e9 when dry.
  waterAt(x, z) {
    let w = this.waterLevel;
    for (const v of this.waterVolumes) {
      if (v.points) {
        for (let i = 0; i < v.points.length; i++) { const p = v.points[i]; if (Math.hypot(x - p[0], z - p[1]) < v.r) { w = Math.max(w, p[2]); break; } }
      } else if (Math.hypot(x - v.x, z - v.z) < v.r) w = Math.max(w, v.level);
    }
    return w;
  }

  addUpdater(fn) { this.updaters.push(fn); return fn; }
  removeUpdater(fn) { const i = this.updaters.indexOf(fn); if (i >= 0) this.updaters.splice(i, 1); }

  update(dt, camera, playerPos) {
    const t = G.time;
    if (this.terrain) this.terrain.update(camera.position);
    for (const g of this.grass) g.update(camera.position, playerPos);
    if (this.vegetation) this.vegetation.update(camera.position);
    if (this.weather) this.weather.update(dt, camera.position, this.atmosphere, t);
    for (const fn of this.updaters) fn(dt, t, camera);
    if (this.atmosphere) {
      this.atmosphere.update(dt, camera, false, settings.dayLengthMin, settings.dayCycle && this.kind === 'overworld');
    }
  }

  // Remove vegetation where an entity is placed and optionally flatten terrain.
  prepareFootprint(fp) {
    if (this.vegetation) {
      if (fp.rect) this.vegetation.clearArea(fp.x, fp.z, 0, { hw: fp.rect.hw + 0.5, hd: fp.rect.hd + 0.5, yaw: fp.rect.yaw });
      else this.vegetation.clearArea(fp.x, fp.z, fp.radius);
    }
  }

  dispose() {
    if (this.terrain) this.terrain.dispose();
    for (const g of this.grass) g.dispose();
    if (this.vegetation) this.vegetation.dispose();
    if (this.weather) this.weather.dispose();
    if (this.atmosphere) this.atmosphere.dispose();
  }
}

// ---------------- Overworld ----------------

export function overworldHeightFn(seed) {
  const n = new Noise(seed);
  const lake = { x: 175, z: -55, r: 78 };
  const fn = (x, z) => {
    const r = Math.hypot(x, z);
    const wx = x + n.fbm2(x * 0.002, z * 0.002, 3) * 120;
    const wz = z + n.fbm2(x * 0.002 + 50, z * 0.002 + 50, 3) * 120;
    let h = n.fbm2(wx * 0.0028, wz * 0.0028, 5) * 20 + 7;
    h += n.fbm2(x * 0.012, z * 0.012, 3) * 2.2;
    h += n.fbm2(x * 0.055, z * 0.055, 2) * 0.3;
    // Ring of mountains around the playable valley.
    const mMask = smoothstep(240, 470, r + n.fbm2(x * 0.004, z * 0.004, 2) * 90);
    const ridge = n.ridged2(wx * 0.0026 + 3, wz * 0.0026 - 7, 6);
    const massif = n.fbm2(x * 0.0015 + 9, z * 0.0015 - 4, 3) * 0.5 + 0.5;
    h += mMask * (Math.pow(ridge, 1.6) * 165 * (0.6 + massif * 0.7) + massif * 55 + 10 + n.fbm2(x * 0.02, z * 0.02, 3) * 6);
    // Gentle meadow around spawn for building.
    const meadow = smoothstep(120, 28, r);
    h = h * (1 - meadow * 0.88) + (4.5 + n.fbm2(x * 0.012, z * 0.012, 2) * 1.0) * meadow * 0.88;
    // Lake basin.
    const ld = Math.hypot(x - lake.x, z - lake.z) + n.fbm2(x * 0.02, z * 0.02, 2) * 16;
    const lm = smoothstep(lake.r + 50, lake.r - 12, ld);
    h = h * (1 - lm) + (-6 + (ld / lake.r) * 4.5) * lm;
    return h;
  };
  fn.lake = lake;
  return fn;
}

export const OVERWORLD_LAYERS = [
  { recipe: 'grass', world: 3.5, colA: new THREE.Color('#2d5214'), colB: new THREE.Color('#44661c'), colC: new THREE.Color('#6a7430'), bump: 0.012, seed: 1 },
  { recipe: 'grass', world: 4.5, colA: new THREE.Color('#5a6a26'), colB: new THREE.Color('#7a7834'), colC: new THREE.Color('#948650'), bump: 0.012, seed: 2 },
  { recipe: 'dirt', world: 3, colA: new THREE.Color('#5a4232'), colB: new THREE.Color('#3e2d22'), colC: new THREE.Color('#8a8070'), bump: 0.03, seed: 3 },
  { recipe: 'rock', world: 9, colA: new THREE.Color('#7b756c'), colB: new THREE.Color('#5c5750'), colC: new THREE.Color('#8f806a'), p: [3, 0, 0, 0], bump: 0.25, seed: 4 },
  { recipe: 'sand', world: 4, colA: new THREE.Color('#cfb88a'), colB: new THREE.Color('#b39b6d'), p: [14, 0, 0, 0], bump: 0.015, seed: 5 },
  { recipe: 'snow', world: 5, colA: new THREE.Color('#f2f5fa'), bump: 0.03, seed: 6 },
  { recipe: 'gravel', world: 1.6, colA: new THREE.Color('#8e887c'), colB: new THREE.Color('#bdb6a8'), colC: new THREE.Color('#5e584e'), p: [30, 0, 0, 0], bump: 0.03, seed: 7 },
  { recipe: 'forest', world: 3, colA: new THREE.Color('#3a2c1e'), bump: 0.03, seed: 8 },
];

export function* buildOverworld(onProgress) {
  const q = G.quality;
  const world = new World({ id: 0, name: 'Overworld', kind: 'overworld', waterLevel: 0, seed: 20260924 });
  const report = (p, text) => onProgress && onProgress(p, text);

  report(0.02, 'Forming the sky');
  world.atmosphere = new Atmosphere(G.renderer.renderer, world.scene, { dynamic: true, timeOfDay: 9.6 });
  world.atmosphere.shadowRange = q.shadowRange;
  world.atmosphere.shadowMapSize = q.shadowMap;
  world.atmosphere.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
  yield;

  report(0.05, 'Shaping terrain');
  const heightFn = overworldHeightFn(world.seed);
  world.lake = heightFn.lake;
  const terrain = new Terrain({ size: 1024, res: 1, waterLevel: 0, heightFn, lodBias: q.terrainLodBias, snowLine: 105 });
  yield* terrain.generate((f) => report(0.05 + f * 0.3, 'Shaping terrain'));
  terrain.buildTextures();
  world.terrain = terrain;
  world.colliders.terrain = terrain;

  report(0.36, 'Baking terrain materials');
  yield;
  const arrays = G.baker.bakeArray(OVERWORLD_LAYERS, q.texSize >= 1024 ? 1024 : 512);
  terrain.buildMaterial(arrays, OVERWORLD_LAYERS);
  terrain.buildChunks();
  world.scene.add(terrain.group);
  yield;

  report(0.42, 'Filling the lake');
  const lakeMesh = createLakePlane(terrain, 0, 1024);
  world.scene.add(lakeMesh);
  world.lakeMesh = lakeMesh;

  report(0.45, 'Growing grass');
  const gd = settings.grassDensity;
  const near = new GrassLayer(terrain, { count: Math.round(q.grassCount * 0.45 * gd), radius: Math.max(12, q.grassRadius * 0.34), seed: 3, height: 1 });
  const far = new GrassLayer(terrain, { count: Math.round(q.grassCount * 0.55 * gd), radius: q.grassRadius, seed: 4, height: 1.05, width: 1.25 });
  world.grass.push(near, far);
  world.scene.add(near.mesh, far.mesh);
  yield;

  report(0.5, 'Planting forests');
  const veg = new Vegetation(world, { density: q.treeDensity, seed: world.seed });
  yield* veg.scatterOverworld((f) => report(0.5 + f * 0.35, 'Planting forests'));
  world.vegetation = veg;
  world.scene.add(veg.group);

  report(0.88, 'Brewing weather');
  world.weather = new Weather(world);
  world.spawn.pos.set(0, terrain.heightAt(0, 6), 6);
  world.spawn.yaw = 0;
  report(0.92, 'Lighting the world');
  world.atmosphere.update(0, G.camera, true);
  world.atmosphere.applyGlobals();
  world.atmosphere.maybeUpdateEnv(true);
  yield;
  return world;
}
