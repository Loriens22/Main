// ---------------------------------------------------------------------------
// Portal dimensions: self-contained worlds with their own sky, lighting,
// fog, terrain, physics rules (gravity, swimming, speed), post-processing
// grade, ambience and scenery.
//
//   crystal     low-gravity violet world of glowing crystal spires
//   underwater  a sunken city: swim everywhere, coral, kelp, fish, god rays
//   library     an infinite library of towering shelves and floating books
//   nightmare   blood-red sky, dead forest, watching eyes, warped vision
//   sky         floating islands above an endless sea of clouds
//   desert      golden dunes, pyramids and heat haze
//   frozen      glaciers, ice spikes and auroras
//   space       a cratered moon under a giant planet, very low gravity
//   lava        obsidian plains cut by rivers of lava
//   neon        a synthwave grid city with a striped sunset
//   candy       pastel hills, lollipop trees and gumdrops
//   alien       a bioluminescent jungle under two moons
//
// Dimensions are built by a time-sliced generator (inside the portal's
// generation job) so creating a portal never freezes the game, and they are
// fully built before the portal opens, which makes crossing instant.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../core/context.js';
import { World } from './world.js';
import { Atmosphere } from '../render/atmosphere.js';
import { Terrain } from './terrain.js';
import { Noise, smoothstep } from '../core/noise.js';
import { Weather } from './weather.js';
import { RNG } from '../core/rng.js';
import { buildTree, treeMaterials, buildRock } from './trees.js';
import { createWaterMaterial } from './water.js';
import { markNoAO } from '../render/renderer.js';
import { LightPool } from '../render/lights.js';

const TAU = Math.PI * 2;
const C = (h) => new THREE.Color(h);
const L = (recipe, world, colA, colB, colC, p, bump = 0.02, seed = 1) => ({ recipe, world, colA: C(colA), colB: C(colB || colA), colC: C(colC || colB || colA), p: p ? [...p, 0, 0, 0].slice(0, 4) : [0, 0, 0, 0], bump, seed });

// ---------------- Destination classification ----------------
const KEYWORDS = [
  ['underwater', /underwater|under water|ocean|sea\b|atlantis|sunken|mermaid|coral|aquatic|deep sea|reef/],
  ['library', /library|books|archive|librar/],
  ['nightmare', /nightmare|horror|hell|dark dimension|spooky|haunted|evil|shadow realm|scary|creepy|demon|abyss/],
  ['crystal', /crystal|gem|low gravity|low-gravity|amethyst|prism/],
  ['space', /space|stars|galaxy|orbit|cosmos|moon|asteroid|planet|zero gravity|astronaut/],
  ['sky', /sky|cloud|heaven|floating island|floating islands|sky islands|paradise/],
  ['desert', /desert|dune|sahara|egypt|sand/],
  ['frozen', /frozen|ice|arctic|snow|winter|aurora|glacier|tundra|polar/],
  ['lava', /lava|volcan|fire|inferno|magma|molten|burning/],
  ['neon', /neon|cyber|synth|retro|vapor|tron|digital|matrix|future city|futuristic/],
  ['candy', /candy|sweet|chocolate|dessert|sugar|gummy|lollipop|wonderland/],
  ['alien', /alien|jungle|bioluminescent|glowing forest|mushroom|fantasy|fairy|magic forest|other planet|exoplanet/],
];
export function classifyDestination(text, rng) {
  const t = (text || '').toLowerCase();
  for (const [kind, re] of KEYWORDS) if (re.test(t)) return kind;
  return rng ? rng.pick(KEYWORDS.map((k) => k[0])) : 'crystal';
}

// ---------------- Helpers ----------------
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }

function instanced(world, geo, mat, list, opts = {}) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  list.forEach((it, i) => {
    p.set(it.x, it.y, it.z); e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
    s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    m.compose(p, q, s); im.setMatrixAt(i, m);
    if (it.color && im.instanceColor !== undefined) im.setColorAt(i, C(it.color));
  });
  im.castShadow = opts.cast !== false; im.receiveShadow = true;
  im.computeBoundingSphere();
  if (opts.noAO) markNoAO(im);
  world.scene.add(im);
  return im;
}

// Random points on the terrain, avoiding the spawn area.
function scatter(world, rng, n, radius, minR = 12, opts = {}) {
  const out = [];
  let tries = 0;
  while (out.length < n && tries++ < n * 20) {
    const a = rng.range(0, TAU), r = minR + Math.sqrt(rng.next()) * (radius - minR);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = world.heightAt(x, z);
    if (opts.aboveWater !== undefined && y < opts.aboveWater) continue;
    if (opts.maxSlope && world.terrain && world.terrain.slopeAt(x, z) > opts.maxSlope) continue;
    out.push({ x, y, z });
  }
  return out;
}

function particles(world, n, color, size, area, height, opts = {}) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), seeds = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { seeds[i * 4] = (Math.random() - 0.5) * area; seeds[i * 4 + 1] = Math.random() * height + (opts.base || 0); seeds[i * 4 + 2] = (Math.random() - 0.5) * area; seeds[i * 4 + 3] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const tex = glowTex();
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity: opts.opacity ?? 0.8, depthWrite: false, blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, map: tex, sizeAttenuation: true }));
  pts.frustumCulled = false; pts.userData.noRaycast = true; markNoAO(pts);
  world.scene.add(pts);
  const vy = opts.vy ?? 0.3, drift = opts.drift ?? 0.4;
  world.addUpdater((dt, t, cam) => {
    const cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0, cy = cam ? cam.position.y : 0;
    for (let i = 0; i < n; i++) {
      const s3 = seeds[i * 4 + 3];
      let y = seeds[i * 4 + 1] + t * vy * (0.5 + s3);
      y = ((y % height) + height) % height + (opts.base || 0) + (opts.follow ? cy - height / 2 : 0);
      const wrap = (v, c) => ((v - c + area / 2) % area + area) % area - area / 2 + c;
      p[i * 3] = wrap(seeds[i * 4] + Math.sin(t * 0.3 + s3 * 20) * drift, cx);
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = wrap(seeds[i * 4 + 2] + Math.cos(t * 0.27 + s3 * 17) * drift, cz);
    }
    g.attributes.position.needsUpdate = true;
  });
  return pts;
}

let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(cv);
  return _glow;
}

function crystalPrism(r, h) {
  const g = new THREE.CylinderGeometry(r, r, h, 6, 1); g.translate(0, h / 2, 0);
  const tip = new THREE.ConeGeometry(r, r * 1.8, 6); tip.translate(0, h + r * 0.9, 0);
  const a = g.toNonIndexed(), b = tip.toNonIndexed();
  const pos = new Float32Array(a.attributes.position.array.length + b.attributes.position.array.length);
  pos.set(a.attributes.position.array); pos.set(b.attributes.position.array, a.attributes.position.array.length);
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.computeVertexNormals();
  return out;
}

// Build a terrain for a dimension from a height function and 8 layer recipes.
function* makeTerrain(world, def, seed, onProgress) {
  const q = G.quality;
  const td = def.terrain;
  const heightFn = td.height(new Noise(seed));
  const terrain = new Terrain({ size: td.size || 384, res: td.res || 1.5, waterLevel: td.waterLevel ?? -100, heightFn, lodBias: q.terrainLodBias, snowLine: td.snowLine ?? 999, farRing: false });
  yield* terrain.generate((f) => onProgress && onProgress(f * 0.5, 'Shaping the land'));
  terrain.buildTextures();
  const layers = td.layers;
  layers.rockSlope = td.rockSlope ?? 0.3;
  const arrays = G.baker.bakeArray(layers, 512);
  terrain.buildMaterial(arrays, layers);
  terrain.buildChunks();
  world.scene.add(terrain.group);
  world.terrain = terrain;
  world.colliders.terrain = terrain;
  world.bounds = terrain.half - 12;
  return terrain;
}

// ---------------- Dimension definitions ----------------
export const DIMENSIONS = {
  crystal: {
    name: 'Crystal Realm', rulesLabel: 'Low gravity', ambient: 'crystal', surface: 'stone',
    rules: { gravity: 3.2, jump: 1.8, speed: 1.1 }, post: { tint: [1.02, 0.96, 1.08], saturation: 1.18, vignette: 0.32, ca: 0.003 },
    atmo: { mode: 'gradient', zenith: '#0e0626', horizon: '#6a3ab0', ground: '#1a0a2a', sunGlow: '#ff9ae0', sunDir: [0.4, 0.35, -0.6], sunColor: '#ffd0f0', sunIntensity: 2.2, fogColor: '#5a2a8a', ambient: '#402060', stars: 0.8, nebula: 0.9, nebulaA: '#ff40c0', nebulaB: '#4060ff', planet: 1, planetA: '#e0b0ff', planetB: '#6040a0', exposure: 1.1, cloudCover: 0.2, fogDensity: 0.004, hemi: 0.7, groundColor: '#301848' },
    terrain: {
      size: 384, height: (n) => (x, z) => { const r = Math.hypot(x, z); return n.fbm2(x * 0.01, z * 0.01, 4) * 10 + Math.pow(n.ridged2(x * 0.006, z * 0.006, 4), 2) * 30 * smoothstep(40, 160, r) + 2; },
      layers: [L('rock', 5, '#3a2a5a', '#5a3a8a', '#8a6ac0', [3], 0.08, 1), L('rock', 6, '#4a3070', '#2a1a4a', '#6a4aa0', [3], 0.1, 2), L('gravel', 2, '#6a5a8a', '#9a8ac0', '#3a2a5a', [30], 0.03, 3), L('rock', 9, '#2a1a3a', '#4a3a5a', '#6a5a7a', [3], 0.2, 4), L('sand', 4, '#b0a0d8', '#8a7ab0', null, [14], 0.01, 5), L('snow', 5, '#f0e0ff', null, null, null, 0.03, 6), L('gravel', 1.6, '#8a7aa8', '#b8a8d8', '#5a4a78', [30], 0.03, 7), L('dirt', 3, '#3a2a4a', '#2a1a3a', '#5a4a6a', null, 0.02, 8)],
    },
    *decorate(world, rng) {
      const cols = ['#c070ff', '#60c0ff', '#ff60c0', '#80ffd0'];
      const mats = cols.map((c) => new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.1, transmission: 0.3, thickness: 1, flatShading: true }));
      const geo = crystalPrism(0.6, 5);
      for (let k = 0; k < mats.length; k++) {
        const list = scatter(world, rng, 45, 170, 14).map((p) => ({ ...p, y: p.y - 0.5, s: rng.range(0.5, 2.6), rx: rng.range(-0.35, 0.35), ry: rng.range(0, TAU), rz: rng.range(-0.35, 0.35) }));
        instanced(world, geo, mats[k], list);
        for (const it of list.filter((_, i) => i % 6 === 0)) world.lightPool.add({ position: new THREE.Vector3(it.x, it.y + 3 * it.s, it.z), color: cols[k], intensity: 3, distance: 14 });
        for (const it of list) world.colliders.cyl(it.x, it.z, it.y, it.y + 5 * it.s, 0.5 * it.s);
        yield;
      }
      // Floating rock shards.
      const shards = [];
      for (let i = 0; i < 40; i++) { const a = rng.range(0, TAU), r = rng.range(20, 150); shards.push({ x: Math.cos(a) * r, y: rng.range(15, 50), z: Math.sin(a) * r, s: rng.range(1, 5), ry: rng.range(0, 6), rx: rng.range(0, 6) }); }
      const sg = buildRock(7, 1, { detail: 2, moss: 0 });
      const sim = instanced(world, sg, G.materials.get('rock', { color: '#5a3a8a', vertexColors: true }), shards);
      world.addUpdater((dt, t) => { sim.position.y = Math.sin(t * 0.3) * 1.5; sim.rotation.y = t * 0.01; });
      particles(world, 500, '#e0b0ff', 0.25, 120, 30, { vy: 0.4 });
    },
  },
  underwater: {
    name: 'Sunken City', rulesLabel: 'Underwater · swim anywhere', ambient: 'underwater', surface: 'sand',
    rules: { gravity: 3.5, jump: 1.2, speed: 0.75, water: true, drag: 0.8 }, post: { tint: [0.8, 1.0, 1.08], lift: [0.0, 0.03, 0.05], saturation: 1.0, vignette: 0.45, wobble: 0.5, ca: 0.002 },
    atmo: { mode: 'gradient', zenith: '#0a4a6a', horizon: '#0a3048', ground: '#02101a', sunGlow: '#80e0ff', sunDir: [0.1, 1, 0.2], sunColor: '#a0e8ff', sunIntensity: 1.6, fogColor: '#0a4058', ambient: '#1a6080', stars: 0, cloudCover: 0, exposure: 1.2, fogDensity: 0.022, hemi: 0.9, groundColor: '#08303a' },
    terrain: {
      size: 320, height: (n) => (x, z) => n.fbm2(x * 0.012, z * 0.012, 4) * 6 + Math.sin(x * 0.05 + n.fbm2(x * 0.02, z * 0.02, 2) * 3) * 0.8 - 2 + smoothstep(90, 150, Math.hypot(x, z)) * 25,
      layers: [L('sand', 4, '#c8b890', '#a89870', null, [12], 0.02, 1), L('sand', 5, '#b8a880', '#988860', null, [10], 0.02, 2), L('gravel', 2, '#8a8a7a', '#6a6a5a', '#aaa', [30], 0.03, 3), L('rock', 7, '#4a5a5a', '#3a4a4a', '#5a7a6a', [3], 0.15, 4), L('sand', 4, '#d8c8a0', '#b8a880', null, [14], 0.01, 5), L('sand', 5, '#e0d8c0', null, null, [10], 0.02, 6), L('gravel', 1.6, '#7a8a7a', '#a8b8a8', '#5a6a5a', [30], 0.03, 7), L('dirt', 3, '#4a4a3a', '#3a3a2a', '#6a6a5a', null, 0.02, 8)],
    },
    *decorate(world, rng) {
      // Sunken city: broken columns, arches, domed buildings.
      const stone = G.materials.get('marble', { color: '#a8b8b0' });
      const colGeo = new THREE.CylinderGeometry(0.6, 0.7, 1, 12);
      const cols = [];
      for (let i = 0; i < 60; i++) { const a = rng.range(0, TAU), r = rng.range(18, 80); const x = Math.cos(a) * r, z = Math.sin(a) * r, h = rng.range(2, 9); const y = world.heightAt(x, z); cols.push({ x, y: y + h / 2, z, sx: 1, sy: h, sz: 1, rx: rng.chance(0.2) ? 1.4 : rng.range(-0.1, 0.1), rz: rng.range(-0.15, 0.15) }); world.colliders.cyl(x, z, y, y + h, 0.65); }
      instanced(world, colGeo, stone, cols);
      yield;
      for (let i = 0; i < 12; i++) {
        const a = rng.range(0, TAU), r = rng.range(25, 90), x = Math.cos(a) * r, z = Math.sin(a) * r, y = world.heightAt(x, z);
        const w = rng.range(6, 12), h = rng.range(5, 12);
        const bld = mesh(new THREE.BoxGeometry(w, h, w * rng.range(0.7, 1.2)), G.materials.get('castleStone', { color: '#8aa0a0' }));
        bld.position.set(x, y + h / 2 - 1, z); bld.rotation.y = rng.range(0, TAU); bld.rotation.z = rng.range(-0.08, 0.08);
        world.scene.add(bld);
        world.colliders.add({ type: 'box', x, z, y0: y - 1, y1: y + h - 1, hx: w / 2, hz: w / 2, yaw: bld.rotation.y });
        if (rng.chance(0.5)) { const dome = mesh(new THREE.SphereGeometry(w * 0.45, 20, 10, 0, TAU, 0, Math.PI / 2), G.materials.get('copper', { color: '#5aa090' })); dome.position.set(x, y + h - 1, z); world.scene.add(dome); }
      }
      yield;
      // Coral & kelp.
      const coralCols = ['#ff6a5a', '#ff9ad0', '#ffb040', '#a060ff', '#40d0c0'];
      for (const c of coralCols) {
        const g = new THREE.IcosahedronGeometry(0.6, 1);
        const list = scatter(world, rng, 60, 120, 6).map((p) => ({ ...p, s: rng.range(0.5, 2), sy: rng.range(0.6, 1.8) }));
        instanced(world, g, G.materials.get('glossyPlastic', { color: c, roughness: 0.7 }), list);
      }
      const kelpGeo = new THREE.PlaneGeometry(0.5, 8, 1, 8); kelpGeo.translate(0, 4, 0);
      const kelpMat = new THREE.MeshStandardMaterial({ color: '#2a6a2a', side: THREE.DoubleSide, roughness: 0.8 });
      kelpMat.onBeforeCompile = (sh) => { sh.uniforms.uT = { value: 0 }; kelpMat.userData.sh = sh; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float kw = position.y / 8.0; transformed.x += sin(uT * 1.3 + position.y * 0.5 + float(gl_InstanceID) * 1.7) * kw * kw * 1.2;'); };
      const kelp = instanced(world, kelpGeo, kelpMat, scatter(world, rng, 260, 130, 5).map((p) => ({ ...p, ry: rng.range(0, TAU), s: rng.range(0.6, 1.5) })), { cast: false });
      world.addUpdater((dt, t) => { if (kelpMat.userData.sh) kelpMat.userData.sh.uniforms.uT.value = t; });
      void kelp;
      yield;
      // Fish schools circling.
      const fishGeo = new THREE.ConeGeometry(0.12, 0.5, 6).rotateX(Math.PI / 2);
      const fishMat = new THREE.MeshStandardMaterial({ color: '#f0c040', metalness: 0.4, roughness: 0.4 });
      const N = 160;
      const fish = new THREE.InstancedMesh(fishGeo, fishMat, N);
      const seeds = Array.from({ length: N }, () => [rng.range(5, 40), rng.range(3, 14), rng.range(0, TAU), rng.range(0.2, 0.6) * (rng.chance(0.5) ? 1 : -1), rng.int(0, 5)]);
      const cols2 = ['#f0c040', '#40a0f0', '#f06040', '#f4f4f4', '#a060f0', '#40e0a0'];
      seeds.forEach((s, i) => fish.setColorAt(i, C(cols2[s[4]])));
      world.scene.add(fish);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      world.addUpdater((dt, t) => {
        for (let i = 0; i < N; i++) {
          const [r, h, a0, sp] = seeds[i];
          const a = a0 + t * sp;
          p.set(Math.cos(a) * r, h + Math.sin(t + i) * 0.5, Math.sin(a) * r);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + (sp > 0 ? Math.PI : 0));
          m.compose(p, q, sc); fish.setMatrixAt(i, m);
        }
        fish.instanceMatrix.needsUpdate = true;
      });
      // God rays and bubbles.
      const rayMat = new THREE.MeshBasicMaterial({ color: '#80e0ff', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      for (let i = 0; i < 18; i++) { const r = mesh(new THREE.PlaneGeometry(rng.range(2, 6), 60), rayMat, false); r.position.set(rng.range(-60, 60), 25, rng.range(-60, 60)); r.rotation.set(0.15, rng.range(0, TAU), 0.1); r.userData.noRaycast = true; markNoAO(r); world.scene.add(r); }
      particles(world, 400, '#d0f4ff', 0.18, 80, 40, { vy: 1.2, drift: 0.2, opacity: 0.6 });
    },
  },
  library: {
    name: 'Infinite Library', rulesLabel: 'Silence, please', ambient: 'library', surface: 'wood',
    rules: { gravity: 9.81, jump: 1 }, post: { tint: [1.08, 1.0, 0.88], saturation: 1.0, vignette: 0.5, grain: 0.05 },
    atmo: { mode: 'gradient', zenith: '#0a0604', horizon: '#2a1a0c', ground: '#1a100a', sunDir: [0.3, 0.9, 0.2], sunColor: '#ffd8a0', sunIntensity: 0.9, fogColor: '#2a1a0e', ambient: '#3a2814', stars: 0, cloudCover: 0, sunDisk: 0, exposure: 1.3, fogDensity: 0.03, hemi: 0.5, groundColor: '#2a1a0e' },
    flat: 0,
    *decorate(world, rng) {
      const floor = mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), G.materials.get('floorWood', { world: 3 }), false);
      const uv = floor.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 600, uv.getY(i) * 600);
      world.scene.add(floor);
      world.colliders.floorY = 0;
      world.bounds = 280;
      const shelfMat = G.materials.get('darkWood');
      const bookMat = G.materials.get('books', { seed: 3, world: 0.9 });
      const H = 14, spacing = 8;
      const shelves = [], books = [];
      for (let gx = -12; gx <= 12; gx++) for (let gz = -12; gz <= 12; gz++) {
        if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1) continue; // spawn hall
        if ((gx + gz) % 5 === 0) continue; // cross aisles
        const x = gx * spacing, z = gz * spacing;
        shelves.push({ x, y: H / 2, z, sx: 6, sy: H, sz: 1.2 });
        for (const s of [-1, 1]) books.push({ x, y: H / 2, z: z + s * 0.61, sx: 5.8, sy: H - 0.4, sz: 0.02, ry: s < 0 ? Math.PI : 0 });
        world.colliders.add({ type: 'box', x, z, y0: 0, y1: H, hx: 3, hz: 0.6 });
      }
      instanced(world, new THREE.BoxGeometry(1, 1, 1), shelfMat, shelves);
      const bg = new THREE.PlaneGeometry(1, 1);
      const buv = bg.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * 6, buv.getY(i) * 14);
      instanced(world, bg, bookMat, books, { cast: false });
      yield;
      // Reading tables with green lamps and warm light pools.
      for (let i = 0; i < 30; i++) {
        const x = rng.int(-10, 10) * spacing + 4, z = rng.int(-10, 10) * spacing;
        const t = mesh(new THREE.BoxGeometry(2, 0.08, 1), G.materials.get('wood')); t.position.set(x, 0.78, z); world.scene.add(t);
        const lamp = mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, TAU, 0, Math.PI / 2), G.materials.get('emissive', { color: '#80ff90', emissiveIntensity: 1.5 })); lamp.position.set(x, 1.2, z); world.scene.add(lamp);
        world.lightPool.add({ position: new THREE.Vector3(x, 2, z), color: '#ffc880', intensity: 4, distance: 12 });
        world.colliders.add({ type: 'box', x, z, y0: 0, y1: 0.8, hx: 1, hz: 0.5 });
      }
      // Floating books drifting through the air.
      const fb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.05, 0.22), G.materials.get('leather', { color: '#7a1a1a' }), 120);
      const fs = Array.from({ length: 120 }, () => [rng.range(-60, 60), rng.range(2, 12), rng.range(-60, 60), rng.range(0, 6)]);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      world.scene.add(fb);
      world.addUpdater((dt, t) => {
        for (let i = 0; i < fs.length; i++) { const f = fs[i]; p.set(f[0] + Math.sin(t * 0.2 + f[3]) * 3, f[1] + Math.sin(t * 0.6 + f[3]) * 0.5, f[2] + Math.cos(t * 0.17 + f[3]) * 3); e.set(Math.sin(t + f[3]) * 0.3, t * 0.3 + f[3], 0); q.setFromEuler(e); m.compose(p, q, s1); fb.setMatrixAt(i, m); }
        fb.instanceMatrix.needsUpdate = true;
      });
      particles(world, 300, '#ffe0a0', 0.06, 60, 14, { vy: 0.05, opacity: 0.5 });
      world.spawn.pos.set(0, 0, 0);
    },
  },
  nightmare: {
    name: 'Nightmare Dimension', rulesLabel: 'Something is watching', ambient: 'nightmare', surface: 'dirt',
    rules: { gravity: 11, jump: 0.9, speed: 0.9 }, post: { tint: [1.15, 0.72, 0.72], saturation: 0.55, contrast: 1.2, vignette: 0.75, wobble: 0.8, ca: 0.006, grain: 0.09, pulse: 0.15 },
    atmo: { mode: 'gradient', zenith: '#050000', horizon: '#5a0a0a', ground: '#0a0000', sunGlow: '#ff2010', sunDir: [0.2, 0.25, -0.8], sunColor: '#ff5040', sunIntensity: 1.2, fogColor: '#2a0404', ambient: '#200606', stars: 0.3, planet: 1, planetA: '#ff2020', planetB: '#300000', exposure: 1.2, cloudCover: 0.6, cloudTint: '#400808', fogDensity: 0.012, hemi: 0.4, groundColor: '#1a0202' },
    terrain: {
      size: 320, height: (n) => (x, z) => n.fbm2(x * 0.015, z * 0.015, 5) * 8 + Math.pow(n.ridged2(x * 0.02, z * 0.02, 3), 3) * 12 + smoothstep(80, 150, Math.hypot(x, z)) * 30,
      layers: [L('dirt', 3, '#2a1a14', '#1a0e0a', '#3a2a20', null, 0.03, 1), L('dirt', 4, '#3a1a14', '#2a0e0a', '#4a2a20', null, 0.03, 2), L('gravel', 2, '#3a3030', '#1a1414', '#4a3a3a', [30], 0.04, 3), L('rock', 7, '#2a2020', '#1a1010', '#3a2a28', [3], 0.2, 4), L('sand', 4, '#4a3a30', '#3a2a20', null, [12], 0.02, 5), L('snow', 5, '#8a7a7a', null, null, null, 0.03, 6), L('gravel', 1.6, '#3a3030', '#5a4a4a', '#2a2020', [30], 0.03, 7), L('forest', 3, '#1a0e08', null, null, null, 0.03, 8)],
    },
    *decorate(world, rng) {
      // Dead forest.
      const variants = [0, 1, 2].map((v) => ({ t: buildTree('dead', 900 + v * 17, 0.6, { scale: 1.3 }), m: treeMaterials('dead', v) }));
      for (const { t, m } of variants) {
        const list = scatter(world, rng, 60, 140, 10).map((p) => ({ ...p, y: p.y - 0.1, ry: rng.range(0, TAU), s: rng.range(0.8, 1.6) }));
        instanced(world, t.bark, m.barkMat, list);
        for (const it of list) world.colliders.cyl(it.x, it.z, it.y, it.y + 4, Math.max(0.15, t.trunkRadius * it.s));
        yield;
      }
      // Twisted spires.
      const spireMat = G.materials.get('blackMarble');
      for (let i = 0; i < 14; i++) {
        const a = rng.range(0, TAU), r = rng.range(40, 120), x = Math.cos(a) * r, z = Math.sin(a) * r, y = world.heightAt(x, z);
        const h = rng.range(20, 60);
        const g = new THREE.CylinderGeometry(0.2, 3, h, 8, 12);
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) { const yy = p.getY(k) / h + 0.5, ang = yy * 3; const px = p.getX(k), pz = p.getZ(k); p.setX(k, px * Math.cos(ang) - pz * Math.sin(ang) + Math.sin(yy * 5) * 2 * yy); p.setZ(k, px * Math.sin(ang) + pz * Math.cos(ang)); }
        g.computeVertexNormals();
        const s = mesh(g, spireMat); s.position.set(x, y + h / 2 - 1, z); world.scene.add(s);
        world.colliders.cyl(x, z, y, y + h, 2.5);
      }
      // Floating eyes that track the player.
      const eyes = [];
      const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#f0e0d8', roughness: 0.2, clearcoat: 1 });
      const irisMat = G.materials.get('emissive', { color: '#ff2020', emissiveIntensity: 3 });
      for (let i = 0; i < 16; i++) {
        const g = new THREE.Group();
        const r = rng.range(0.8, 2.5);
        g.add(mesh(new THREE.SphereGeometry(r, 20, 14), eyeMat));
        const iris = mesh(new THREE.SphereGeometry(r * 0.4, 16, 10), irisMat, false); iris.position.z = r * 0.72; iris.scale.z = 0.4; g.add(iris);
        const a = rng.range(0, TAU), rr = rng.range(15, 80);
        g.position.set(Math.cos(a) * rr, world.heightAt(Math.cos(a) * rr, Math.sin(a) * rr) + rng.range(6, 20), Math.sin(a) * rr);
        world.scene.add(g); eyes.push({ g, ph: rng.range(0, 6), y0: g.position.y });
      }
      world.addUpdater((dt, t) => {
        if (!G.player) return;
        for (const e of eyes) { e.g.lookAt(G.camera.position); e.g.position.y = e.y0 + Math.sin(t * 0.7 + e.ph) * 0.8; }
      });
      particles(world, 400, '#ff4020', 0.12, 80, 20, { vy: 0.8, opacity: 0.7 });
    },
  },
  sky: {
    name: 'Sky Islands', rulesLabel: 'Mind the edge', ambient: 'nature', surface: 'grass',
    rules: { gravity: 7, jump: 1.3, fallRespawn: -60 }, post: { tint: [1.02, 1.02, 1.05], saturation: 1.15, vignette: 0.2 },
    atmo: { mode: 'gradient', zenith: '#2a6ad8', horizon: '#c8e4ff', ground: '#e8f0ff', sunGlow: '#fff0c0', sunDir: [0.5, 0.6, -0.4], sunColor: '#fff4e0', sunIntensity: 3.2, fogColor: '#d0e4ff', ambient: '#8ab8f0', stars: 0, cloudCover: 0.35, exposure: 1.0, fogDensity: 0.0025, hemi: 0.8, groundColor: '#d8e8ff' },
    *decorate(world, rng) {
      world.colliders.floorY = null;
      world.bounds = 250;
      // Cloud sea: a big plane with animated noise clouds far below.
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const g2 = cv.getContext('2d'); g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 300; i++) { g2.fillStyle = `rgba(200,210,230,${Math.random() * 0.25})`; g2.beginPath(); g2.arc(Math.random() * 256, Math.random() * 256, Math.random() * 30 + 5, 0, TAU); g2.fill(); }
      const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(20, 20);
      const sea = mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, color: '#ffffff', roughness: 1, emissive: '#8898b0', emissiveIntensity: 0.4 }), false);
      sea.position.y = -40; world.scene.add(sea);
      world.addUpdater((dt, t) => { tex.offset.set(t * 0.002, t * 0.001); });
      // Islands.
      const islands = [{ x: 0, z: 0, R: 16, y: 0 }];
      for (let i = 0; i < 14; i++) { const a = rng.range(0, TAU), r = rng.range(35, 180); islands.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, R: rng.range(6, 18), y: rng.range(-15, 25) }); }
      const rockMat = G.materials.get('rock', { world: 4 }), grassMat = G.materials.get('lawn');
      for (const is of islands) {
        const depth = is.R * 1.3;
        const pts = []; for (let k = 0; k <= 10; k++) { const tt = k / 10; pts.push(new THREE.Vector2(Math.max(0.1, is.R * Math.pow(1 - tt, 0.7)), -tt * depth)); }
        const lg = new THREE.LatheGeometry(pts, 28);
        const lp = lg.attributes.position; for (let k = 0; k < lp.count; k++) { const x = lp.getX(k), y = lp.getY(k), z = lp.getZ(k); const kk = 1 + 0.15 * Math.sin(Math.atan2(z, x) * 4 + y); lp.setXYZ(k, x * kk, y, z * kk); }
        lg.computeVertexNormals();
        const rm = mesh(lg, rockMat); rm.position.set(is.x, is.y, is.z); world.scene.add(rm);
        const top = mesh(new THREE.CircleGeometry(is.R * 1.03, 28).rotateX(-Math.PI / 2), grassMat); top.position.set(is.x, is.y + 0.02, is.z); world.scene.add(top);
        world.colliders.cyl(is.x, is.z, is.y - depth * 0.5, is.y, is.R);
        const nt = Math.round(is.R / 5);
        for (let k = 0; k < nt; k++) {
          const sp = rng.pick(['oak', 'cherry', 'birch']);
          const t = buildTree(sp, rng.nextU32(), 0.6, { scale: rng.range(0.6, 0.9) });
          const mm = treeMaterials(sp, rng.int(0, 1));
          const tg = new THREE.Group();
          if (t.bark) tg.add(mesh(t.bark, mm.barkMat)); if (t.leaves) { const lm = mesh(t.leaves, mm.leafMat); markNoAO(lm); tg.add(lm); }
          const a = rng.range(0, TAU), r = rng.range(0, is.R * 0.7);
          tg.position.set(is.x + Math.cos(a) * r, is.y, is.z + Math.sin(a) * r);
          if (Math.hypot(tg.position.x, tg.position.z) < 5) continue;
          world.scene.add(tg);
          world.colliders.cyl(tg.position.x, tg.position.z, is.y, is.y + t.height * 0.5, Math.max(0.12, t.trunkRadius));
        }
        yield;
      }
      // Rope bridges between the spawn island and its nearest neighbours.
      const plank = G.materials.get('planks');
      const near = islands.slice(1).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, 3);
      for (const n of near) {
        const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(n.x, n.y, n.z);
        const dir = b.clone().sub(a).setY(0).normalize();
        const start = a.clone().addScaledVector(dir, 15), end = b.clone().addScaledVector(dir, -n.R + 1); end.y = n.y;
        const len = start.distanceTo(end), steps = Math.ceil(len / 0.6);
        for (let k = 0; k <= steps; k++) {
          const f = k / steps; const p = start.clone().lerp(end, f); p.y -= Math.sin(f * Math.PI) * 1.5;
          const pm = mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), plank); pm.position.copy(p); pm.rotation.y = Math.atan2(dir.x, dir.z); world.scene.add(pm);
          world.colliders.add({ type: 'box', x: p.x, z: p.z, y0: p.y - 0.3, y1: p.y + 0.04, hx: 0.9, hz: 0.35, yaw: pm.rotation.y });
        }
      }
      particles(world, 200, '#ffffff', 0.4, 120, 30, { vy: 0.05, opacity: 0.5, additive: false });
      world.spawn.pos.set(0, 0.1, 0);
    },
  },
  desert: {
    name: 'Endless Desert', rulesLabel: 'Scorching heat', ambient: 'nature', surface: 'sand',
    rules: { gravity: 9.81, speed: 0.95 }, post: { tint: [1.1, 1.0, 0.86], saturation: 1.1, wobble: 0.15, vignette: 0.3 },
    atmo: { mode: 'gradient', zenith: '#3a7ad0', horizon: '#f0d8a8', ground: '#c8a878', sunGlow: '#fff0c0', sunDir: [0.3, 0.8, -0.3], sunColor: '#fff0d0', sunIntensity: 3.6, fogColor: '#e8d0a8', ambient: '#9ab8d8', stars: 0, cloudCover: 0.05, exposure: 1.0, fogDensity: 0.003, hemi: 0.7, groundColor: '#c8a878' },
    terrain: {
      size: 384, height: (n) => (x, z) => { const d = n.fbm2(x * 0.008, z * 0.008, 3); return Math.abs(Math.sin(x * 0.03 + d * 4 + z * 0.01)) * 6 * (0.5 + d) + n.fbm2(x * 0.03, z * 0.03, 2) * 1.5 + 3; },
      rockSlope: 0.6,
      layers: [L('sand', 4, '#d8b880', '#c09860', null, [12], 0.02, 1), L('sand', 5, '#e0c090', '#c8a070', null, [10], 0.02, 2), L('sand', 3, '#c8a070', '#b08858', null, [16], 0.02, 3), L('rock', 7, '#b08a60', '#8a6a48', '#c8a078', [3], 0.2, 4), L('sand', 4, '#e8d0a0', '#d0b080', null, [14], 0.01, 5), L('sand', 5, '#f0e0c0', null, null, [10], 0.02, 6), L('gravel', 1.6, '#b09878', '#d0b898', '#806850', [30], 0.03, 7), L('sand', 3, '#c8a878', '#a88858', null, [12], 0.02, 8)],
    },
    *decorate(world, rng) {
      const sand = G.materials.get('sand', { color: '#d8c090', world: 6 });
      for (let i = 0; i < 3; i++) {
        const a = rng.range(0, TAU), r = rng.range(80, 150), x = Math.cos(a) * r, z = Math.sin(a) * r, y = world.heightAt(x, z);
        const s = rng.range(25, 45);
        const p = mesh(new THREE.ConeGeometry(s, s * 0.9, 4), sand); p.position.set(x, y + s * 0.45 - 1, z); p.rotation.y = Math.PI / 4; world.scene.add(p);
        world.colliders.cyl(x, z, y - 1, y + s * 0.8, s * 0.6);
      }
      yield;
      const cactusMat = G.materials.get('plastic', { color: '#4a7a3a' });
      const cg = new THREE.CapsuleGeometry(0.25, 3, 4, 10); cg.translate(0, 1.7, 0);
      const list = scatter(world, rng, 90, 170, 10).map((p) => ({ ...p, s: rng.range(0.6, 1.4), ry: rng.range(0, TAU) }));
      instanced(world, cg, cactusMat, list);
      const arm = new THREE.CapsuleGeometry(0.18, 1.2, 4, 8); arm.translate(0.7, 2.2, 0);
      instanced(world, arm, cactusMat, list.filter((_, i) => i % 2 === 0));
      for (const it of list) world.colliders.cyl(it.x, it.z, it.y, it.y + 3.5 * it.s, 0.3 * it.s);
      const rocks = scatter(world, rng, 50, 170, 10).map((p) => ({ ...p, s: rng.range(0.5, 3), ry: rng.range(0, TAU) }));
      instanced(world, buildRock(31, 1, { detail: 2, moss: 0 }), G.materials.get('rock', { color: '#b08a60', vertexColors: true }), rocks);
      particles(world, 300, '#f0d8a0', 0.1, 90, 6, { vy: 0.1, drift: 3, opacity: 0.5, additive: false });
    },
  },
  frozen: {
    name: 'Frozen Wastes', rulesLabel: 'Slippery & cold', ambient: 'nature', surface: 'snow',
    rules: { gravity: 9.81, speed: 0.95 }, post: { tint: [0.92, 1.0, 1.1], saturation: 0.9, vignette: 0.35 },
    atmo: { mode: 'gradient', zenith: '#050a20', horizon: '#2a4a70', ground: '#101a2a', sunGlow: '#a0c0ff', sunDir: [-0.3, 0.2, -0.8], sunColor: '#b0c8ff', sunIntensity: 1.4, fogColor: '#1a2a44', ambient: '#304a70', stars: 1, aurora: 1, moon: 1, cloudCover: 0.1, exposure: 1.5, fogDensity: 0.004, hemi: 0.8, groundColor: '#304060', night: 0.6 },
    terrain: {
      size: 384, snowLine: -100, height: (n) => (x, z) => n.fbm2(x * 0.008, z * 0.008, 5) * 16 + Math.pow(n.ridged2(x * 0.005, z * 0.005, 4), 2) * 40 * smoothstep(60, 170, Math.hypot(x, z)),
      layers: [L('snow', 5, '#eef4fa', null, null, null, 0.03, 1), L('snow', 6, '#e0ecf6', null, null, null, 0.03, 2), L('ice', 3, '#a8d0e8', null, null, null, 0.01, 3), L('rock', 8, '#6a7a8a', '#4a5a6a', '#8a9aaa', [3], 0.2, 4), L('ice', 4, '#b8d8f0', null, null, null, 0.01, 5), L('snow', 5, '#f6faff', null, null, null, 0.03, 6), L('gravel', 1.6, '#8a98a8', '#b8c8d8', '#5a6878', [30], 0.03, 7), L('snow', 4, '#dde8f2', null, null, null, 0.03, 8)],
    },
    *decorate(world, rng) {
      const ice = new THREE.MeshPhysicalMaterial({ color: '#a8e0ff', roughness: 0.05, transmission: 0.5, thickness: 2, emissive: '#2060a0', emissiveIntensity: 0.3, flatShading: true });
      const g = new THREE.ConeGeometry(1.5, 10, 6); g.translate(0, 5, 0);
      const list = scatter(world, rng, 120, 170, 14).map((p) => ({ ...p, y: p.y - 1, s: rng.range(0.4, 2.2), rx: rng.range(-0.3, 0.3), rz: rng.range(-0.3, 0.3), ry: rng.range(0, 6) }));
      instanced(world, g, ice, list);
      for (const it of list) world.colliders.cyl(it.x, it.z, it.y, it.y + 8 * it.s, 1.2 * it.s);
      yield;
      const pines = [0, 1].map((v) => ({ t: buildTree('spruce', 700 + v, 0.6), m: treeMaterials('spruce', v, { leafColors: ['#dde8f0', '#a8b8c8', '#6a8a7a'] }) }));
      for (const { t, m } of pines) {
        const pl = scatter(world, rng, 70, 170, 14).map((p) => ({ ...p, ry: rng.range(0, 6), s: rng.range(0.7, 1.3) }));
        instanced(world, t.bark, m.barkMat, pl); if (t.leaves) instanced(world, t.leaves, m.leafMat, pl, { noAO: true });
        for (const it of pl) world.colliders.cyl(it.x, it.z, it.y, it.y + 5, 0.3);
        yield;
      }
      world.weather = new Weather(world);
      world.weather.set('snow');
    },
  },
  space: {
    name: 'Lunar Outpost', rulesLabel: 'Moon gravity', ambient: 'space', surface: 'stone',
    rules: { gravity: 1.62, jump: 2.4, speed: 0.9 }, post: { tint: [1, 1, 1.02], saturation: 0.85, contrast: 1.15, vignette: 0.3 },
    atmo: { mode: 'gradient', zenith: '#000000', horizon: '#02040a', ground: '#000000', sunGlow: '#ffffff', sunDir: [0.6, 0.35, -0.5], sunColor: '#ffffff', sunIntensity: 4, sunSize: 0.6, fogColor: '#000000', ambient: '#0a0a14', stars: 1.4, nebula: 0.6, nebulaA: '#4060ff', nebulaB: '#ff40a0', planet: 1.8, planetA: '#3a7ad8', planetB: '#f0f4ff', exposure: 1.1, cloudCover: 0, fogDensity: 0.0002, hemi: 0.2, groundColor: '#202020' },
    terrain: {
      size: 384, height: (n) => { const craters = []; const r = new RNG(99); for (let i = 0; i < 40; i++) craters.push([r.range(-180, 180), r.range(-180, 180), r.range(4, 30)]); return (x, z) => { let h = n.fbm2(x * 0.01, z * 0.01, 4) * 5; for (const [cx, cz, cr] of craters) { const d = Math.hypot(x - cx, z - cz) / cr; if (d < 1.4) h += d < 1 ? (d * d - 1) * cr * 0.25 : Math.max(0, (1.4 - d)) * cr * 0.3 * (d - 1) * 4; } return h + 5; }; },
      layers: [L('rock', 5, '#8a8a88', '#6a6a68', '#a8a8a4', [3], 0.08, 1), L('gravel', 2, '#9a9a96', '#7a7a78', '#bbbbb8', [30], 0.04, 2), L('dirt', 3, '#6a6a68', '#5a5a58', '#8a8a88', null, 0.03, 3), L('rock', 8, '#5a5a58', '#4a4a48', '#7a7a78', [3], 0.2, 4), L('sand', 4, '#a8a8a4', '#8a8a86', null, [14], 0.01, 5), L('snow', 5, '#d8d8d4', null, null, null, 0.03, 6), L('gravel', 1.6, '#8a8a86', '#b0b0ac', '#6a6a68', [30], 0.03, 7), L('dirt', 3, '#5a5a58', '#4a4a48', '#7a7a78', null, 0.02, 8)],
    },
    *decorate(world, rng) {
      // A small outpost dome and flag near spawn.
      const dome = mesh(new THREE.SphereGeometry(6, 32, 16, 0, TAU, 0, Math.PI / 2), G.materials.get('glass', { color: '#c8e0ff', opacity: 0.25 }));
      const y0 = world.heightAt(20, -10);
      dome.position.set(20, y0, -10); world.scene.add(dome);
      const ring = mesh(new THREE.TorusGeometry(6, 0.3, 8, 40), G.materials.get('panels'));
      ring.rotation.x = Math.PI / 2; ring.position.set(20, y0 + 0.2, -10); world.scene.add(ring);
      world.lightPool.add({ position: new THREE.Vector3(20, y0 + 3, -10), color: '#c8e0ff', intensity: 4, distance: 15 });
      // Floating asteroids.
      const ast = [];
      for (let i = 0; i < 60; i++) { const a = rng.range(0, TAU), r = rng.range(30, 200); ast.push({ x: Math.cos(a) * r, y: rng.range(30, 120), z: Math.sin(a) * r, s: rng.range(1, 8), rx: rng.range(0, 6), ry: rng.range(0, 6) }); }
      const am = instanced(world, buildRock(55, 1, { detail: 2, moss: 0 }), G.materials.get('rock', { color: '#7a7470', vertexColors: true }), ast);
      world.addUpdater((dt, t) => { am.rotation.y = t * 0.005; });
      const rocks = scatter(world, rng, 80, 170, 8).map((p) => ({ ...p, y: p.y - 0.2, s: rng.range(0.3, 2.5), ry: rng.range(0, 6) }));
      instanced(world, buildRock(56, 1, { detail: 2, moss: 0 }), G.materials.get('rock', { color: '#8a8a88', vertexColors: true }), rocks);
      yield;
    },
  },
  lava: {
    name: 'Molten Core', rulesLabel: "Don't touch the lava", ambient: 'lava', surface: 'stone',
    rules: { gravity: 9.81 }, post: { tint: [1.12, 0.95, 0.85], saturation: 1.15, contrast: 1.1, vignette: 0.4, wobble: 0.2 },
    atmo: { mode: 'gradient', zenith: '#1a0604', horizon: '#8a2a0a', ground: '#200804', sunGlow: '#ff8020', sunDir: [0.1, 0.4, -0.9], sunColor: '#ff8a40', sunIntensity: 1.5, fogColor: '#4a1406', ambient: '#401408', stars: 0, cloudCover: 0.7, cloudTint: '#502010', exposure: 1.2, fogDensity: 0.006, hemi: 0.5, groundColor: '#301008' },
    terrain: {
      size: 384, waterLevel: -1, height: (n) => (x, z) => n.fbm2(x * 0.01, z * 0.01, 5) * 12 + Math.pow(n.ridged2(x * 0.004, z * 0.004, 3), 2) * 35 * smoothstep(60, 170, Math.hypot(x, z)) + smoothstep(20, 6, Math.hypot(x, z)) * 4 + 1,
      layers: [L('rock', 5, '#1a1414', '#2a2020', '#3a2a28', [3], 0.1, 1), L('rock', 6, '#2a1c18', '#1a1010', '#3a2a24', [3], 0.1, 2), L('gravel', 2, '#3a2a24', '#1a1210', '#5a3a2a', [30], 0.04, 3), L('rock', 8, '#141010', '#0a0808', '#2a2020', [3], 0.2, 4), L('lava', 4, '#000000', null, null, null, 0.05, 5), L('snow', 5, '#5a4a48', null, null, null, 0.03, 6), L('gravel', 1.6, '#3a2a24', '#5a4a44', '#2a1a14', [30], 0.03, 7), L('dirt', 3, '#2a1a14', '#1a0e0a', '#3a2a20', null, 0.02, 8)],
    },
    *decorate(world, rng) {
      const lava = mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), G.materials.get('lava', { world: 8 }), false);
      lava.position.y = -0.4; world.scene.add(lava);
      world.lavaLevel = -0.2;
      for (let i = 0; i < 20; i++) { const a = rng.range(0, TAU), r = rng.range(20, 150); world.lightPool.add({ position: new THREE.Vector3(Math.cos(a) * r, 2, Math.sin(a) * r), color: '#ff5010', intensity: 5, distance: 25, flicker: true }); }
      const spikes = scatter(world, rng, 70, 170, 12, { aboveWater: 0.5 }).map((p) => ({ ...p, y: p.y - 0.5, s: rng.range(0.5, 2), rx: rng.range(-0.2, 0.2), rz: rng.range(-0.2, 0.2) }));
      const sg = new THREE.ConeGeometry(1, 8, 5); sg.translate(0, 4, 0);
      instanced(world, sg, G.materials.get('blackMarble'), spikes);
      for (const it of spikes) world.colliders.cyl(it.x, it.z, it.y, it.y + 6 * it.s, 0.8 * it.s);
      particles(world, 500, '#ff7020', 0.15, 90, 25, { vy: 1.5, opacity: 0.9 });
      world.addUpdater(() => {
        if (G.world !== world || !G.player) return;
        const P = G.player.position;
        if (P.y < world.lavaLevel && !G.player.flying) { G.player.teleport(world.spawn.pos.clone().add(new THREE.Vector3(0, 1, 0)), world.spawn.yaw); G.ui.toast('🔥 Too hot! Back to safety.', 'bad'); G.ui.flash('#ff6020', 400); }
      });
      yield;
    },
  },
  neon: {
    name: 'Neon Grid', rulesLabel: 'Synthwave city', ambient: 'neon', surface: 'metal',
    rules: { gravity: 9.81, speed: 1.2, jump: 1.2 }, post: { tint: [1.05, 0.95, 1.12], saturation: 1.3, contrast: 1.1, vignette: 0.4, ca: 0.004, grain: 0.04 },
    atmo: { mode: 'gradient', zenith: '#0a0020', horizon: '#ff4aa0', ground: '#0a0014', sunGlow: '#ff8040', sunDir: [0, 0.12, -1], sunColor: '#ff80c0', sunIntensity: 1.2, sunSize: 3, fogColor: '#3a0a4a', ambient: '#2a1040', stars: 0.8, cloudCover: 0, exposure: 1.2, fogDensity: 0.005, hemi: 0.6, groundColor: '#200030', night: 0.8 },
    flat: 0,
    *decorate(world, rng) {
      world.colliders.floorY = 0;
      world.bounds = 280;
      const gridMat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 } },
        vertexShader: 'varying vec3 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
        fragmentShader: 'uniform float uT; varying vec3 vP; void main(){ vec2 g = abs(fract(vP.xz/4.0)-0.5); float l = smoothstep(0.47,0.5,max(g.x,g.y)); float d = length(vP.xz); vec3 c = mix(vec3(0.02,0.0,0.05), vec3(1.0,0.2,0.8)*2.0, l) * (1.0 - smoothstep(60.0, 250.0, d)*0.7); gl_FragColor = vec4(c, 1.0); }',
      });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), gridMat);
      floor.receiveShadow = false; world.scene.add(floor);
      const cols = ['#ff30c0', '#30e0ff', '#a040ff', '#ffb020'];
      const dark = G.materials.get('darkPanels', { color3: '#ff30c0' });
      for (let i = 0; i < 90; i++) {
        const a = rng.range(0, TAU), r = rng.range(30, 220), x = Math.cos(a) * r, z = Math.sin(a) * r;
        const w = rng.range(6, 16), d = rng.range(6, 16), h = rng.range(15, 90);
        const b = mesh(new THREE.BoxGeometry(w, h, d), dark); b.position.set(x, h / 2, z); world.scene.add(b);
        const col = rng.pick(cols);
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1)), new THREE.LineBasicMaterial({ color: col }));
        edge.position.copy(b.position); world.scene.add(edge);
        for (let k = 0; k < 3; k++) { const strip = mesh(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2), G.materials.get('emissive', { color: col, emissiveIntensity: 3 }), false); strip.position.set(x, h * (0.3 + k * 0.25), z); world.scene.add(strip); }
        world.colliders.add({ type: 'box', x, z, y0: 0, y1: h, hx: w / 2, hz: d / 2 });
        if (i % 6 === 0) world.lightPool.add({ position: new THREE.Vector3(x, 8, z), color: col, intensity: 6, distance: 30 });
        if ((i & 7) === 7) yield;
      }
      world.addUpdater((dt, t) => { gridMat.uniforms.uT.value = t; });
      particles(world, 200, '#ff80e0', 0.2, 100, 30, { vy: 0.2 });
    },
  },
  candy: {
    name: 'Candy Land', rulesLabel: 'Bouncy & sweet', ambient: 'nature', surface: 'grass',
    rules: { gravity: 8, jump: 1.6, speed: 1.1 }, post: { tint: [1.05, 1.0, 1.05], saturation: 1.35, vignette: 0.15 },
    atmo: { mode: 'gradient', zenith: '#7ab8ff', horizon: '#ffd0f0', ground: '#ffe0f0', sunGlow: '#fff0f8', sunDir: [0.4, 0.7, -0.3], sunColor: '#fff4f8', sunIntensity: 3, fogColor: '#ffd8ec', ambient: '#c0b0e0', stars: 0, cloudCover: 0.4, cloudTint: '#ffe8f4', exposure: 1.0, fogDensity: 0.003, hemi: 0.9, groundColor: '#ffc8e0' },
    terrain: {
      size: 320, height: (n) => (x, z) => n.fbm2(x * 0.012, z * 0.012, 3) * 10 + Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4 + 3,
      layers: [L('grass', 3.5, '#f0a0c8', '#f8c0d8', '#ffd8e8', null, 0.01, 1), L('grass', 4.5, '#a0e8c8', '#c0f0d8', '#d8f8e8', null, 0.01, 2), L('dirt', 3, '#8a4a2a', '#6a3a1a', '#aa6a4a', null, 0.02, 3), L('rock', 6, '#f8e0c0', '#e8c8a0', '#fff0d8', [3], 0.05, 4), L('sand', 4, '#fff0c0', '#f8e0a0', null, [14], 0.01, 5), L('snow', 5, '#ffffff', null, null, null, 0.02, 6), L('gravel', 1.6, '#ff80b0', '#80c0ff', '#ffe060', [30], 0.02, 7), L('dirt', 3, '#6a3a1a', '#4a2a10', '#8a5a3a', null, 0.02, 8)],
    },
    *decorate(world, rng) {
      const stick = G.materials.get('glossyPlastic', { color: '#f8f4ec' });
      const lolli = scatter(world, rng, 80, 150, 8).map((p) => ({ ...p, s: rng.range(0.7, 1.8) }));
      const sg = new THREE.CylinderGeometry(0.15, 0.15, 5, 8); sg.translate(0, 2.5, 0);
      instanced(world, sg, stick, lolli);
      const discCv = document.createElement('canvas'); discCv.width = discCv.height = 256;
      const dg = discCv.getContext('2d');
      for (let i = 0; i < 12; i++) { dg.fillStyle = i % 2 ? '#ffffff' : ['#ff4a8a', '#4ab8ff', '#ffd040', '#8a4aff'][Math.floor(i / 2) % 4]; dg.beginPath(); dg.moveTo(128, 128); dg.arc(128, 128, 128, (i / 12) * TAU, ((i + 1) / 12) * TAU + 0.02); dg.fill(); }
      const dtex = new THREE.CanvasTexture(discCv); dtex.colorSpace = THREE.SRGBColorSpace;
      const disc = new THREE.CylinderGeometry(1.4, 1.4, 0.4, 32); disc.rotateX(Math.PI / 2); disc.translate(0, 5.8, 0);
      const duv = disc.attributes.uv, dp = disc.attributes.position;
      for (let i = 0; i < duv.count; i++) duv.setXY(i, 0.5 + dp.getX(i) / 2.8, 0.5 + (dp.getY(i) - 5.8) / 2.8);
      instanced(world, disc, new THREE.MeshPhysicalMaterial({ map: dtex, roughness: 0.2, clearcoat: 1 }), lolli.map((l) => ({ ...l, ry: rng.range(0, 6) })));
      for (const it of lolli) world.colliders.cyl(it.x, it.z, it.y, it.y + 6 * it.s, 0.25 * it.s);
      yield;
      const gumCols = ['#ff3a5a', '#3aff8a', '#ffd03a', '#8a5aff', '#3ab8ff', '#ff8a3a'];
      for (const c of gumCols) {
        const gl = scatter(world, rng, 30, 150, 6).map((p) => ({ ...p, s: rng.range(0.4, 1.6) }));
        instanced(world, new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.15, transmission: 0.4, thickness: 1, clearcoat: 1 }), gl);
        for (const it of gl) world.colliders.cyl(it.x, it.z, it.y, it.y + it.s, it.s * 0.9);
      }
      const cane = new THREE.TorusGeometry(1, 0.2, 8, 20, Math.PI); cane.translate(-1, 6, 0);
      const caneStick = new THREE.CylinderGeometry(0.2, 0.2, 6, 10); caneStick.translate(0, 3, 0);
      const caneList = scatter(world, rng, 30, 150, 10).map((p) => ({ ...p, ry: rng.range(0, 6), s: rng.range(0.8, 1.6) }));
      const caneMat = G.materials.get('stripes', { color: '#ffffff', color2: '#e01a2a', p: [8, 0.5, 0.5] });
      instanced(world, caneStick, caneMat, caneList); instanced(world, cane, caneMat, caneList);
      particles(world, 300, '#ffffff', 0.12, 80, 20, { vy: 0.3, opacity: 0.7 });
    },
  },
  alien: {
    name: 'Alien Jungle', rulesLabel: 'Bioluminescent · slightly lower gravity', ambient: 'nature', surface: 'grass',
    rules: { gravity: 7.5, jump: 1.3 }, post: { tint: [0.9, 1.05, 1.05], saturation: 1.3, vignette: 0.35, ca: 0.003 },
    atmo: { mode: 'gradient', zenith: '#020818', horizon: '#0a4a4a', ground: '#021010', sunGlow: '#40ffc0', sunDir: [-0.4, 0.3, -0.6], sunColor: '#80ffd0', sunIntensity: 1.1, fogColor: '#04282a', ambient: '#0a3030', stars: 0.9, planet: 1.4, planetA: '#ffb060', planetB: '#6040ff', nebula: 0.4, nebulaA: '#20ffa0', nebulaB: '#a020ff', exposure: 1.4, cloudCover: 0.2, fogDensity: 0.008, hemi: 0.6, groundColor: '#042020', night: 0.7 },
    terrain: {
      size: 320, height: (n) => (x, z) => n.fbm2(x * 0.012, z * 0.012, 5) * 10 + smoothstep(80, 150, Math.hypot(x, z)) * 25,
      layers: [L('grass', 3.5, '#0a3a3a', '#145050', '#1a6a5a', null, 0.012, 1), L('grass', 4.5, '#2a1a4a', '#3a2a6a', '#5a3a8a', null, 0.012, 2), L('dirt', 3, '#1a1a2a', '#0e0e1a', '#2a2a3a', null, 0.03, 3), L('rock', 8, '#2a3a4a', '#1a2a3a', '#3a4a5a', [3], 0.2, 4), L('sand', 4, '#3a4a4a', '#2a3a3a', null, [12], 0.02, 5), L('snow', 5, '#a0f0e0', null, null, null, 0.03, 6), L('gravel', 1.6, '#2a3a3a', '#4a5a5a', '#1a2a2a', [30], 0.03, 7), L('forest', 3, '#0a1a1a', null, null, null, 0.03, 8)],
    },
    *decorate(world, rng) {
      const cols = ['#40ffe0', '#ff40d0', '#a0ff40', '#6080ff'];
      for (const c of cols) {
        const list = scatter(world, rng, 30, 140, 8).map((p) => ({ ...p, s: rng.range(1, 4) }));
        const stem = new THREE.CylinderGeometry(0.15, 0.25, 3, 10); stem.translate(0, 1.5, 0);
        const cap = new THREE.SphereGeometry(1.2, 20, 10, 0, TAU, 0, Math.PI / 2); cap.scale(1, 0.5, 1); cap.translate(0, 3, 0);
        instanced(world, stem, G.materials.get('plaster', { color: '#d0e0e0' }), list);
        instanced(world, cap, G.materials.get('emissive', { color: c, emissiveIntensity: 1.6 }), list, { cast: false });
        for (const it of list) { world.colliders.cyl(it.x, it.z, it.y, it.y + 3 * it.s, 0.25 * it.s); }
        for (const it of list.filter((_, i) => i % 4 === 0)) world.lightPool.add({ position: new THREE.Vector3(it.x, it.y + 2.8 * it.s, it.z), color: c, intensity: 4, distance: 10 * it.s });
        yield;
      }
      // Tall alien fronds (tube plants).
      const tube = new THREE.CylinderGeometry(0.08, 0.3, 6, 8, 6); tube.translate(0, 3, 0);
      const tp = tube.attributes.position; for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + Math.sin(y * 0.6) * 0.4); }
      tube.computeVertexNormals();
      instanced(world, tube, G.materials.get('glossyPlastic', { color: '#2a6a5a' }), scatter(world, rng, 220, 140, 6).map((p) => ({ ...p, ry: rng.range(0, 6), s: rng.range(0.5, 1.5) })));
      particles(world, 600, '#80ffd0', 0.14, 90, 12, { vy: 0.15, opacity: 0.9 });
    },
  },
};

// ---------------- Build ----------------
export function* buildDimension(kind, seed, onProgress) {
  const def = DIMENSIONS[kind] || DIMENSIONS.crystal;
  const rng = new RNG(seed);
  const world = new World({ name: def.name, kind, rules: def.rules, post: def.post, seed, meta: { label: '∞', rulesLabel: def.rulesLabel, surface: def.surface, dimension: kind }, ambientSound: def.ambient });
  world.lightPool = new LightPool(world.scene, G.quality.maxPointLights);
  onProgress && onProgress(0.02, 'Forming the sky');
  world.atmosphere = new Atmosphere(G.renderer.renderer, world.scene, { dynamic: false, ...def.atmo });
  world.atmosphere.shadowRange = Math.min(50, G.quality.shadowRange);
  world.atmosphere.shadowMapSize = Math.min(2048, G.quality.shadowMap);
  world.atmosphere.sun.shadow.mapSize.set(world.atmosphere.shadowMapSize, world.atmosphere.shadowMapSize);
  world.atmosphere.fogDensity = def.atmo.fogDensity ?? 0.003;
  yield;
  if (def.terrain) {
    yield* makeTerrain(world, def, seed, onProgress);
    world.waterLevel = def.rules.water ? 1e4 : -1e9;
  } else if (def.flat !== undefined) {
    world.colliders.floorY = def.flat;
  }
  onProgress && onProgress(0.6, 'Decorating');
  yield* def.decorate(world, rng);
  const sy = world.heightAt(world.spawn.pos.x, world.spawn.pos.z);
  if (Number.isFinite(sy) && sy > -1e5) world.spawn.pos.y = sy;
  // Clear decorations out of the spawn circle is handled by scatter(minR).
  onProgress && onProgress(0.95, 'Lighting');
  world.atmosphere.update(0, G.camera, true);
  world.atmosphere.maybeUpdateEnv(true);
  return world;
}
