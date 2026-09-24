// ---------------------------------------------------------------------------
// Nature: individual trees (every one grown from its own seed with the
// branching tree builder), forests (instanced variants), bushes, flower
// meadows, boulders, mushrooms (glowing fairy rings to giant toadstools),
// cacti, crystal clusters, bamboo groves, coral, floating islands with
// waterfalls, lake islands and caves.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, genPreset } from '../../core/context.js';
import { buildTree, treeMaterials, buildRock, TREE_SPECIES } from '../../world/trees.js';
import { markNoAO } from '../../render/renderer.js';
import { animate, glowSprite, glowTexture, hsl } from './common.js';
import { flowerBed } from './garden.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function has(a, ...ws) { return ws.some((w) => a.words.includes(w) || a.text.includes(w)); }
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }

// Leaf colour overrides from prompt words.
function leafOverrides(a, species) {
  const o = {};
  if (a.flags.autumn || has(a, 'autumn', 'fall', 'orange', 'red leaves')) o.leafColors = ['#c0461a', '#e08a20', '#a8241a'];
  if (a.flags.winter || has(a, 'snowy', 'frosted', 'winter')) o.leafColors = ['#e8eef2', '#c8d8e0', '#a8c0c8'];
  if (a.flags.glow || has(a, 'magic', 'magical', 'enchanted', 'fairy', 'bioluminescent')) { o.leafColors = [a.primaryColor || '#7af0ff', '#b08aff', '#60ffc0']; o.leafEmissive = a.primaryColor || '#60e0ff'; o.leafEmissiveIntensity = 1.2; }
  const leafCol = a.colors.find((c) => !c.part || c.part === 'leaves' || c.part === 'leaf');
  if (leafCol && !o.leafColors && species !== 'dead') { const c = new THREE.Color(leafCol.color); o.leafColors = ['#' + c.clone().multiplyScalar(0.7).getHexString(), '#' + c.getHexString(), '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.25).getHexString()]; }
  return o;
}

function pickSpecies(item, a, rng) {
  let sp = item.params.species || 'oak';
  if (a.flags.dead || has(a, 'dead', 'leafless', 'spooky', 'haunted')) sp = 'dead';
  if (has(a, 'maple')) sp = 'maple';
  if (has(a, 'spruce', 'fir', 'christmas')) sp = 'spruce';
  if (a.flags.autumn && sp === 'oak') sp = 'autumn';
  if (sp === 'oak' && item.concept === 'tree' && !a.words.includes('oak')) sp = rng.weighted([['oak', 4], ['maple', 2], ['birch', 1.5], ['cherry', 0.6]]);
  return sp;
}

function* tree(ctx, item, rng) {
  const a = item.attrs;
  const species = pickSpecies(item, a, rng);
  const sm = (a.dims.height ? a.dims.height / ((TREE_SPECIES[species] || TREE_SPECIES.oak).height[1] * 0.85) : clamp(a.sizeMul || 1, 0.2, 8));
  ctx.stage('geometry', `Growing ${species} tree`);
  yield;
  const ov = leafOverrides(a, species);
  const t = buildTree(species, rng.nextU32(), genPreset().detail > 0.6 ? 1 : 0.7, { scale: sm });
  ctx.progress(0.6);
  yield;
  const mats = treeMaterials(species, rng.int(0, 2), ov);
  const root = new THREE.Group();
  if (t.bark) root.add(mesh(t.bark, mats.barkMat));
  if (t.leaves) { const l = mesh(t.leaves, mats.leafMat); markNoAO(l); root.add(l); }
  root.rotation.y = rng.range(0, TAU);
  const holder = new THREE.Group(); holder.add(root);
  if (has(a, 'christmas')) decorateChristmas(holder, t, rng);
  if (ov.leafEmissive) {
    // Fireflies around a magical tree.
    holder.add(fireflies(rng, t.crownRadius, t.height * 0.7, 40, ov.leafEmissive));
  }
  const name = { oak: 'Oak tree', maple: 'Maple tree', autumn: 'Autumn tree', birch: 'Birch tree', cherry: 'Cherry blossom tree', dead: 'Dead tree', baobab: 'Baobab tree', willow: 'Weeping willow', pine: 'Pine tree', spruce: 'Spruce', sequoia: 'Giant redwood', palm: 'Palm tree' }[species] || 'Tree';
  return {
    root: holder, name: (ov.leafEmissive ? 'Magical ' + name.toLowerCase() : name), category: 'nature', icon: item.icon, height: t.height,
    footprint: { radius: Math.max(0.6, t.trunkRadius * 3) }, colliderDefs: t.trunkRadius > 0 ? [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: t.height * 0.5, r: Math.max(0.12, t.trunkRadius) }] : [],
    suppressGrass: false, lights: ov.leafEmissive ? [{ pos: [0, t.height * 0.6, 0], color: ov.leafEmissive, intensity: 2.5, distance: t.height * 1.5 }] : null,
  };
}

function decorateChristmas(g, t, rng) {
  const cols = ['#e02020', '#f0c020', '#2060e0', '#f4f4f4', '#c040e0'];
  for (let i = 0; i < 40; i++) {
    const h = rng.range(0.15, 0.85) * t.height, r = (1 - h / t.height) * t.crownRadius * 0.9 + 0.1;
    const an = rng.range(0, TAU);
    const orn = mesh(new THREE.SphereGeometry(0.07, 10, 8), G.materials.get('emissive', { color: rng.pick(cols), emissiveIntensity: 1.5 }), false);
    orn.position.set(Math.cos(an) * r, h, Math.sin(an) * r);
    g.add(orn);
  }
  const star = mesh(new THREE.OctahedronGeometry(0.25, 0), G.materials.get('emissive', { color: '#ffd040', emissiveIntensity: 3 }), false);
  star.position.y = t.height + 0.1;
  g.add(star);
}

function fireflies(rng, r, h, n, color) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), s = [];
  for (let i = 0; i < n; i++) s.push([rng.range(0, TAU), rng.range(0.3, 1) * r * 1.3, rng.range(0.5, h * 1.3), rng.range(0.3, 1)]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.18, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture() }));
  pts.frustumCulled = false; pts.userData.noRaycast = true; markNoAO(pts);
  pts.onBeforeRender = () => {
    const t = G.time;
    for (let i = 0; i < n; i++) { const [a0, rr, y, sp] = s[i]; const a = a0 + t * sp * 0.4; p[i * 3] = Math.cos(a) * rr; p[i * 3 + 1] = y + Math.sin(t * sp * 2 + a0) * 0.4; p[i * 3 + 2] = Math.sin(a) * rr; }
    g.attributes.position.needsUpdate = true;
  };
  return pts;
}

// ---------------- Forest ----------------
function* forest(ctx, item, rng) {
  const a = item.attrs;
  const R = clamp(18 * (a.sizeMul || 1), 8, 60);
  let speciesList = has(a, 'pine', 'conifer', 'snowy', 'winter', 'taiga') ? ['pine', 'spruce'] : has(a, 'birch') ? ['birch'] : has(a, 'autumn', 'fall') ? ['autumn', 'maple', 'oak'] : has(a, 'dead', 'spooky', 'haunted', 'dark') ? ['dead', 'dead', 'spruce'] : has(a, 'jungle', 'tropical', 'palm') ? ['palm', 'baobab'] : has(a, 'cherry', 'sakura') ? ['cherry'] : ['oak', 'maple', 'birch', 'pine'];
  const variants = [];
  ctx.stage('geometry', 'Growing a forest');
  const ov = leafOverrides(a, speciesList[0]);
  for (const sp of speciesList) {
    for (let v = 0; v < 2; v++) {
      const t = buildTree(sp, rng.nextU32(), 0.55, {});
      const mats = treeMaterials(sp, v, ov);
      variants.push({ t, mats, sp });
      ctx.progress(variants.length / (speciesList.length * 2) * 0.7);
      yield;
    }
  }
  const n = Math.round(clamp(R * R * 0.12, 20, 260) * (0.5 + genPreset().detail * 0.5));
  const spots = [];
  const tries = n * 6;
  for (let i = 0; i < tries && spots.length < n; i++) {
    const an = rng.range(0, TAU), rr = Math.sqrt(rng.next()) * R;
    const x = Math.cos(an) * rr, z = Math.sin(an) * rr;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 2.6)) continue;
    spots.push({ x, z, v: rng.int(0, variants.length - 1), s: rng.range(0.75, 1.3), rot: rng.range(0, TAU) });
  }
  const root = new THREE.Group();
  const colliders = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const byV = variants.map(() => []);
  for (const s of spots) byV[s.v].push(s);
  byV.forEach((list, vi) => {
    if (!list.length) return;
    const { t, mats } = variants[vi];
    const bark = t.bark ? new THREE.InstancedMesh(t.bark, mats.barkMat, list.length) : null;
    const leaves = t.leaves ? new THREE.InstancedMesh(t.leaves, mats.leafMat, list.length) : null;
    list.forEach((s, k) => {
      pos.set(s.x, 0, s.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot); sc.setScalar(s.s);
      m.compose(pos, q, sc);
      if (bark) bark.setMatrixAt(k, m);
      if (leaves) leaves.setMatrixAt(k, m);
      colliders.push({ type: 'cyl', x: s.x, z: s.z, y0: 0, y1: t.height * 0.5 * s.s, r: Math.max(0.12, t.trunkRadius * s.s) });
    });
    for (const im of [bark, leaves]) if (im) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im); }
    if (leaves) markNoAO(leaves);
  });
  // Instanced trees sit on the flat entity plane; conform each instance to the terrain on add.
  const data = {
    root, name: 'Forest', category: 'nature', icon: '🌲', height: 14, footprint: { radius: R }, colliderDefs: colliders, suppressGrass: false, flattenTerrain: false,
    onAdded(world) {
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      for (const im of root.children) {
        if (!im.isInstancedMesh) continue;
        for (let k = 0; k < im.count; k++) {
          im.getMatrixAt(k, m);
          m.decompose(pos, q, sc);
          const wp = pos.clone().applyMatrix4(root.matrixWorld);
          const h = world.heightAt(wp.x, wp.z);
          const lp = new THREE.Vector3(wp.x, h - 0.05, wp.z).applyMatrix4(inv);
          pos.y = lp.y;
          m.compose(pos, q, sc);
          im.setMatrixAt(k, m);
        }
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }
      for (const c of this.colliders) { const h = world.heightAt(c.x, c.z); const d = c.y1 - c.y0; c.y0 = h; c.y1 = h + d; world.colliders.update(c); }
    },
  };
  if (ov.leafEmissive) root.add(fireflies(rng, R, 8, 160, ov.leafEmissive));
  return data;
}

// ---------------- Rocks & boulders ----------------
function* rock(ctx, item, rng) {
  const a = item.attrs;
  const size = a.dims.height ? a.dims.height : rng.range(0.8, 2.2) * clamp(a.sizeMul || 1, 0.1, 20);
  ctx.stage('geometry', 'Weathering stone');
  yield;
  const geo = buildRock(rng.nextU32(), size, { detail: size > 3 ? 5 : 4, moss: has(a, 'mossy') ? 1 : 0.5, tall: has(a, 'tall', 'pillar', 'monolith') ? 2.5 : 1 });
  const matType = a.materials[0] || (has(a, 'granite') ? 'granite' : 'rock');
  const m = mesh(geo, G.materials.get(matType, { color: a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : undefined, vertexColors: true, world: Math.max(2, size * 1.5) }));
  const root = new THREE.Group();
  m.rotation.y = rng.range(0, TAU);
  root.add(m);
  const bb = geo.boundingBox;
  // Pebbles around it.
  for (let i = 0; i < 5; i++) {
    const pg = buildRock(rng.nextU32(), size * rng.range(0.08, 0.2), { detail: 2 });
    const pm = mesh(pg, m.material);
    const an = rng.range(0, TAU), rr = size * rng.range(1, 1.6);
    pm.position.set(Math.cos(an) * rr, 0, Math.sin(an) * rr);
    root.add(pm);
  }
  const r = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
  return { root, name: size > 3 ? 'Giant boulder' : 'Rock', category: 'nature', icon: '🪨', height: bb.max.y, footprint: { radius: r }, colliderDefs: [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: bb.max.y, r: r * 0.8 }], suppressGrass: false };
}

// ---------------- Flowers ----------------
function* flowers(ctx, item, rng) {
  const a = item.attrs;
  const R = clamp(2.5 * (a.sizeMul || 1), 1, 20);
  ctx.stage('geometry', 'Planting flowers');
  yield;
  const root = new THREE.Group();
  const kinds = has(a, 'tulip') ? ['tulip'] : has(a, 'rose') ? ['rose'] : has(a, 'sunflower') ? ['sunflower'] : has(a, 'daisy', 'daisies') ? ['daisy'] : null;
  flowerBed(root, rng, [-R, -R, R, R], 14, kinds);
  // Tint petals if a colour was requested.
  if (a.primaryColor && a.primaryColor !== 'rainbow') root.traverse((o) => { if (o.isMesh && o.userData.petal) { o.material = G.materials.get('glossyPlastic', { color: a.primaryColor }); } });
  // Butterflies.
  root.add(butterflies(rng, R, 6));
  return { root, name: 'Flower meadow', category: 'nature', icon: '🌷', height: 0.6, footprint: { radius: R }, suppressGrass: false };
}

function butterflies(rng, R, n) {
  const g = new THREE.Group();
  const wings = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    const col = hsl(rng.range(0, 1), 0.85, 0.6);
    const mat = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.6 });
    const wl = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), mat); wl.geometry.translate(0.05, 0, 0);
    const wr = wl.clone(); wr.scale.x = -1;
    b.add(wl, wr);
    g.add(b);
    wings.push({ b, wl, wr, ph: rng.range(0, 6), a0: rng.range(0, TAU), rr: rng.range(0.3, 1) * R, sp: rng.range(0.2, 0.5) });
  }
  g.onBeforeRender = () => {};
  g.userData.tick = (t) => {
    for (const w of wings) {
      const a = w.a0 + t * w.sp;
      w.b.position.set(Math.cos(a) * w.rr, 0.5 + Math.sin(t * 1.3 + w.ph) * 0.3 + 0.3, Math.sin(a * 1.3) * w.rr);
      w.b.rotation.y = -a;
      const f = Math.sin(t * 18 + w.ph) * 1.1;
      w.wl.rotation.y = f; w.wr.rotation.y = -f;
    }
  };
  const holder = new THREE.Group(); holder.add(g);
  holder.userData.animatedTick = g.userData.tick;
  return holder;
}

// ---------------- Mushrooms ----------------
function* mushroom(ctx, item, rng) {
  const a = item.attrs;
  const giant = has(a, 'giant', 'huge', 'big', 'large', 'house') || (a.sizeMul || 1) > 1.5;
  const glowing = a.flags.glow || has(a, 'glowing', 'bioluminescent', 'magic', 'fairy');
  const n = giant ? rng.int(1, 3) : rng.int(5, 12);
  const baseScale = giant ? rng.range(2.5, 4.5) * Math.max(1, (a.sizeMul || 1) / 2) : 0.18;
  ctx.stage('geometry', 'Growing mushrooms');
  yield;
  const root = new THREE.Group();
  const capCol = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : glowing ? rng.pick(['#40e0ff', '#a060ff', '#60ff90']) : rng.pick(['#c81a1a', '#b86a2a', '#e8c890', '#8a4a2a']);
  const capMat = glowing ? G.materials.get('emissive', { color: capCol, emissiveIntensity: 1.6 }) : G.materials.get('glossyPlastic', { color: capCol });
  const stemMat = G.materials.get('plaster', { color: '#f0eadc' });
  const spotMat = G.materials.plain('#fbf8f0', 0.6);
  let maxH = 0;
  const colliders = [];
  for (let i = 0; i < n; i++) {
    const s = baseScale * rng.range(0.6, 1.2);
    const an = rng.range(0, TAU), rr = n === 1 ? 0 : (giant ? rng.range(2, 5) : rng.range(0.2, 0.9)) * (i === 0 ? 0 : 1);
    const g = new THREE.Group();
    g.position.set(Math.cos(an) * rr, 0, Math.sin(an) * rr);
    const h = s * rng.range(0.8, 1.3);
    const stem = mesh(new THREE.LatheGeometry([[0.14, 0], [0.12, 0.2], [0.1, 0.6], [0.11, 0.95], [0, 1]].map(([x, y]) => new THREE.Vector2(x * s, y * h)), 16), stemMat);
    g.add(stem);
    const capR = s * rng.range(0.45, 0.65);
    const cap = mesh(new THREE.SphereGeometry(capR, 24, 12, 0, TAU, 0, Math.PI / 2), capMat);
    cap.scale.y = rng.range(0.5, 0.8); cap.position.y = h * 0.95;
    g.add(cap);
    const gill = mesh(new THREE.CircleGeometry(capR * 0.98, 24), G.materials.plain('#e8dcc8', 0.9)); gill.rotation.x = Math.PI / 2; gill.position.y = h * 0.95; g.add(gill);
    if (!glowing && capCol === '#c81a1a' || rng.chance(0.4)) for (let k = 0; k < 9; k++) { const u = rng.range(0.15, 1), th = rng.range(0, TAU); const sp = mesh(new THREE.SphereGeometry(capR * 0.08, 6, 4), spotMat, false); const phi = u * Math.PI / 2 * 0.9; sp.position.set(Math.sin(phi) * Math.cos(th) * capR, h * 0.95 + Math.cos(phi) * capR * cap.scale.y, Math.sin(phi) * Math.sin(th) * capR); sp.scale.y = 0.4; g.add(sp); }
    g.rotation.z = rng.range(-0.12, 0.12);
    root.add(g);
    maxH = Math.max(maxH, h + capR * 0.6);
    if (giant) colliders.push({ type: 'cyl', x: g.position.x, z: g.position.z, y0: 0, y1: h, r: 0.13 * s }, { type: 'cyl', x: g.position.x, z: g.position.z, y0: h * 0.9, y1: h + capR * 0.3, r: capR * 0.8 });
  }
  if (glowing) root.add(fireflies(rng, giant ? 6 : 1.5, giant ? 4 : 1, giant ? 40 : 15, capCol));
  return {
    root, name: (glowing ? 'Glowing ' : giant ? 'Giant ' : '') + (n > 1 ? 'mushrooms' : 'mushroom'), category: 'nature', icon: '🍄', height: maxH,
    footprint: { radius: giant ? 5 : 1 }, colliderDefs: colliders, suppressGrass: false,
    lights: glowing ? [{ pos: [0, maxH * 0.6, 0], color: capCol, intensity: giant ? 3 : 1.2, distance: giant ? 14 : 4 }] : null,
  };
}

// ---------------- Cactus ----------------
function* cactus(ctx, item, rng) {
  const a = item.attrs;
  const H = (a.dims.height || rng.range(2.5, 5)) * (a.dims.height ? 1 : clamp(a.sizeMul || 1, 0.2, 5));
  ctx.stage('geometry', 'Growing cactus');
  yield;
  const mat = G.materials.get('plastic', { color: a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : '#3a7a3a', roughness: 0.7 });
  const root = new THREE.Group();
  const ribbed = (r, h) => {
    const g = new THREE.CylinderGeometry(r, r, h, 16, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), an = Math.atan2(z, x); const k = 1 + 0.07 * Math.cos(an * 8); p.setX(i, x * k); p.setZ(i, z * k); }
    g.computeVertexNormals();
    return g;
  };
  const r = H * 0.09;
  const trunk = mesh(ribbed(r, H - r), mat); trunk.position.y = (H - r) / 2; root.add(trunk);
  const top = mesh(new THREE.SphereGeometry(r * 1.02, 16, 8, 0, TAU, 0, Math.PI / 2), mat); top.position.y = H - r; root.add(top);
  const arms = rng.int(1, 3);
  for (let i = 0; i < arms; i++) {
    const side = i % 2 ? -1 : 1, an = rng.range(-0.4, 0.4) + (i > 1 ? Math.PI / 2 : 0);
    const y0 = H * rng.range(0.3, 0.55), out = r * rng.range(2.2, 3), up = H * rng.range(0.2, 0.35), ar = r * 0.7;
    const arm = new THREE.Group(); arm.rotation.y = an; arm.position.y = y0;
    const hz = mesh(new THREE.CylinderGeometry(ar, ar, out, 12), mat); hz.rotation.z = Math.PI / 2; hz.position.x = side * out / 2; arm.add(hz);
    const elbow = mesh(new THREE.SphereGeometry(ar, 12, 8), mat); elbow.position.x = side * out; arm.add(elbow);
    const vt = mesh(ribbed(ar, up), mat); vt.position.set(side * out, up / 2, 0); arm.add(vt);
    const cap = mesh(new THREE.SphereGeometry(ar, 12, 6, 0, TAU, 0, Math.PI / 2), mat); cap.position.set(side * out, up, 0); arm.add(cap);
    root.add(arm);
  }
  if (has(a, 'flower', 'blooming') || rng.chance(0.3)) { const fl = mesh(new THREE.SphereGeometry(r * 0.35, 8, 6), G.materials.plain('#f050a0', 0.5)); fl.position.y = H; root.add(fl); }
  return { root, name: 'Saguaro cactus', category: 'nature', icon: '🌵', height: H, footprint: { radius: r * 4 }, colliderDefs: [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: H, r: r * 1.1 }], suppressGrass: false };
}

// ---------------- Crystals ----------------
function* crystal(ctx, item, rng) {
  const a = item.attrs;
  const giant = has(a, 'giant', 'huge', 'massive', 'big', 'large') || (a.sizeMul || 1) > 1.5;
  const S = (a.dims.height ? a.dims.height / 2.5 : 1) * (giant ? rng.range(1.5, 2.2) * Math.max(1, (a.sizeMul || 1) / 2.5) : 1);
  const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(['#9a6aff', '#40d0ff', '#ff5ab0', '#60ffb0', '#ffd040']);
  ctx.stage('geometry', 'Growing crystal lattice');
  yield;
  const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.08, metalness: 0, transmission: 0.55, thickness: 0.5 * S, ior: 1.8, emissive: col, emissiveIntensity: a.flags.glow || giant ? 0.9 : 0.5, flatShading: true, transparent: true, opacity: 0.92 });
  const root = new THREE.Group();
  const n = rng.int(5, 11);
  let maxH = 0;
  const prism = (r, h) => {
    const g = new THREE.CylinderGeometry(r, r, h, 6, 1);
    g.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 1.6, 6);
    tip.translate(0, h + r * 0.8, 0);
    const merged = new THREE.BufferGeometry();
    const a1 = g.toNonIndexed(), a2 = tip.toNonIndexed();
    const pos = new Float32Array(a1.attributes.position.count * 3 + a2.attributes.position.count * 3);
    pos.set(a1.attributes.position.array, 0); pos.set(a2.attributes.position.array, a1.attributes.position.array.length);
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.computeVertexNormals();
    return merged;
  };
  for (let i = 0; i < n; i++) {
    const h = S * (i === 0 ? rng.range(2, 2.8) : rng.range(0.6, 1.8)), r = S * rng.range(0.14, 0.26) * (i === 0 ? 1.4 : 1);
    const m = mesh(prism(r, h), mat, true);
    m.position.set(i === 0 ? 0 : rng.range(-0.5, 0.5) * S, -0.1 * S, i === 0 ? 0 : rng.range(-0.5, 0.5) * S);
    m.rotation.set(i === 0 ? rng.range(-0.1, 0.1) : rng.range(-0.7, 0.7), rng.range(0, TAU), i === 0 ? rng.range(-0.1, 0.1) : rng.range(-0.7, 0.7));
    root.add(m);
    maxH = Math.max(maxH, h);
  }
  const base = mesh(buildRock(rng.nextU32(), S * 0.7, { detail: 3 }), G.materials.get('rock', { vertexColors: true }));
  base.scale.y = 0.5; root.add(base);
  const glow = glowSprite(col, S * 5, 0.35); glow.position.y = S * 1.2; root.add(glow);
  animate(root, (t) => { mat.emissiveIntensity = (a.flags.glow || giant ? 0.9 : 0.5) * (0.8 + 0.2 * Math.sin(t * 1.7)); });
  return {
    root, name: giant ? 'Giant crystal' : 'Crystal cluster', category: 'nature', icon: '💎', height: maxH, footprint: { radius: S * 0.9 },
    colliderDefs: [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: maxH, r: S * 0.5 }], lights: [{ pos: [0, S * 1.2, 0], color: col, intensity: giant ? 5 : 2, distance: giant ? 18 : 7, nightOnly: false }], suppressGrass: false,
  };
}

// ---------------- Bamboo ----------------
function* bamboo(ctx, item, rng) {
  const a = item.attrs;
  ctx.stage('geometry', 'Growing bamboo');
  yield;
  const root = new THREE.Group();
  const R = clamp(2.5 * (a.sizeMul || 1), 1, 12);
  const n = Math.round(R * R * 4);
  const stalkMat = G.materials.get('glossyPlastic', { color: a.primaryColor || '#8ab040' });
  const nodeMat = G.materials.get('glossyPlastic', { color: '#6a8a30' });
  const leafMat = treeMaterials('bush', 0, { leafColors: ['#4a8a2a', '#6aa03a', '#88b048'] }).leafMat;
  const colliders = [];
  for (let i = 0; i < n; i++) {
    const an = rng.range(0, TAU), rr = Math.sqrt(rng.next()) * R;
    const x = Math.cos(an) * rr, z = Math.sin(an) * rr, h = rng.range(4, 8), r = rng.range(0.03, 0.06);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.set(rng.range(-0.06, 0.06), 0, rng.range(-0.06, 0.06));
    const st = mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 8), stalkMat); st.position.y = h / 2; g.add(st);
    for (let y = 0.4; y < h; y += rng.range(0.35, 0.5)) { const nd = mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.03, 8), nodeMat, false); nd.position.y = y; g.add(nd); }
    for (let k = 0; k < 6; k++) { const lf = mesh(new THREE.PlaneGeometry(0.6, 0.6), leafMat, false); lf.position.set(rng.range(-0.3, 0.3), h * rng.range(0.6, 1), rng.range(-0.3, 0.3)); lf.rotation.set(rng.range(-1, 1), rng.range(0, 3), rng.range(-1, 1)); g.add(lf); }
    root.add(g);
    colliders.push({ type: 'cyl', x, z, y0: 0, y1: h, r: r + 0.02 });
  }
  return { root, name: 'Bamboo grove', category: 'nature', icon: '🎋', height: 8, footprint: { radius: R }, colliderDefs: colliders, suppressGrass: false };
}

// ---------------- Coral ----------------
function* coral(ctx, item, rng) {
  const a = item.attrs;
  ctx.stage('geometry', 'Growing coral');
  yield;
  const root = new THREE.Group();
  const n = rng.int(4, 8);
  for (let i = 0; i < n; i++) {
    const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(['#ff6a5a', '#ff9ad0', '#ffb040', '#a060ff', '#40d0c0']);
    const mat = G.materials.get('glossyPlastic', { color: col, roughness: 0.6 });
    const g = new THREE.Group();
    const an = rng.range(0, TAU), rr = rng.range(0, 1.2);
    g.position.set(Math.cos(an) * rr, 0, Math.sin(an) * rr);
    const branch = (p, dir, len, r, depth) => {
      const end = p.clone().addScaledVector(dir, len);
      const c = new THREE.CatmullRomCurve3([p, p.clone().lerp(end, 0.5).add(new THREE.Vector3(rng.range(-0.05, 0.05), 0, rng.range(-0.05, 0.05))), end]);
      g.add(mesh(new THREE.TubeGeometry(c, 6, r, 6, false), mat));
      const tip = mesh(new THREE.SphereGeometry(r, 6, 4), mat); tip.position.copy(end); g.add(tip);
      if (depth > 0) for (let k = 0; k < 2; k++) { const nd = dir.clone().add(new THREE.Vector3(rng.range(-0.7, 0.7), rng.range(0.1, 0.5), rng.range(-0.7, 0.7))).normalize(); branch(end, nd, len * 0.75, r * 0.72, depth - 1); }
    };
    branch(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), rng.range(0.3, 0.5), 0.05, 3);
    root.add(g);
  }
  return { root, name: 'Coral reef', category: 'nature', icon: '🪸', height: 1.2, footprint: { radius: 1.6 }, suppressGrass: false, wantsWater: false };
}

// ---------------- Floating island ----------------
function* floatingIsland(ctx, item, rng) {
  const a = item.attrs;
  const R = rng.range(5, 8) * clamp(a.sizeMul || 1, 0.4, 4);
  ctx.stage('geometry', 'Lifting land into the sky');
  const root = new THREE.Group();
  const holder = new THREE.Group();
  // Rocky inverted cone: displaced lathe.
  const pts = [];
  const depth = R * rng.range(1.1, 1.6);
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(Math.max(0.05, R * Math.pow(1 - t, 0.7) * (1 + 0.08 * Math.sin(t * 9))), -t * depth)); }
  const geo = new THREE.LatheGeometry(pts, 40);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.18 * Math.sin(Math.atan2(z, x) * 5 + y * 0.8) * Math.sin(y * 1.3) + 0.08 * Math.sin(x * 2.1 + z * 1.7);
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * R * 3, uv.getY(i) * depth);
  holder.add(mesh(geo, G.materials.get('rock', { world: 4 })));
  // Grass top (slightly domed disc).
  const top = new THREE.CircleGeometry(R * 1.02, 40, 0, TAU);
  top.rotateX(-Math.PI / 2);
  const tp = top.attributes.position;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i), d = Math.hypot(x, z) / R; tp.setY(i, (1 - d * d) * 0.6 + 0.02); }
  top.computeVertexNormals();
  const tuv = top.attributes.uv; for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tp.getX(i), tp.getZ(i));
  holder.add(mesh(top, G.materials.get('lawn')));
  yield;
  // Trees and rocks on top.
  const nt = rng.int(2, 5);
  const colliders = [];
  for (let i = 0; i < nt; i++) {
    const sp = rng.pick(['oak', 'pine', 'cherry', 'birch']);
    const t = buildTree(sp, rng.nextU32(), 0.7, { scale: rng.range(0.5, 0.8) });
    const mats = treeMaterials(sp, rng.int(0, 1), leafOverrides(a, sp));
    const g = new THREE.Group();
    if (t.bark) g.add(mesh(t.bark, mats.barkMat));
    if (t.leaves) { const l = mesh(t.leaves, mats.leafMat); markNoAO(l); g.add(l); }
    const an = rng.range(0, TAU), rr = rng.range(0, R * 0.65);
    g.position.set(Math.cos(an) * rr, (1 - (rr / R) ** 2) * 0.6, Math.sin(an) * rr);
    holder.add(g);
    colliders.push({ type: 'cyl', x: g.position.x, z: g.position.z, y0: 0, y1: t.height * 0.5, r: Math.max(0.1, t.trunkRadius) });
    yield;
  }
  // Waterfall pouring off the edge.
  const wa = rng.range(0, TAU);
  const wx = Math.cos(wa) * R * 0.95, wz = Math.sin(wa) * R * 0.95;
  const N = 500;
  const wg = new THREE.BufferGeometry();
  const wp = new Float32Array(N * 3), ws = new Float32Array(N);
  for (let i = 0; i < N; i++) ws[i] = Math.random();
  wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
  const wpts = new THREE.Points(wg, new THREE.PointsMaterial({ color: '#dff0ff', size: 0.25, transparent: true, opacity: 0.55, depthWrite: false, map: glowTexture() }));
  wpts.frustumCulled = false; wpts.userData.noRaycast = true; markNoAO(wpts);
  holder.add(wpts);
  const fallH = depth + 12;
  animate(root, (t) => {
    for (let i = 0; i < N; i++) {
      const life = (ws[i] + t * 0.35) % 1;
      const tt = life * Math.sqrt(2 * fallH / 9.8);
      const side = (ws[i] - 0.5) * 1.4;
      wp[i * 3] = wx + Math.cos(wa) * tt * 1.2 - Math.sin(wa) * side; wp[i * 3 + 2] = wz + Math.sin(wa) * tt * 1.2 + Math.cos(wa) * side; wp[i * 3 + 1] = 0.5 - 4.9 * tt * tt;
    }
    wg.attributes.position.needsUpdate = true;
  });
  // Small chunks orbiting underneath.
  for (let i = 0; i < 5; i++) {
    const cg = buildRock(rng.nextU32(), rng.range(0.4, 1.1), { detail: 2 });
    const cm = mesh(cg, G.materials.get('rock', { vertexColors: true }));
    const an = rng.range(0, TAU), rr = R * rng.range(1.1, 1.5), yy = -depth * rng.range(0.2, 0.7);
    holder.add(cm);
    const sp = rng.range(0.05, 0.15);
    animate(root, (t) => { const aa = an + t * sp; cm.position.set(Math.cos(aa) * rr, yy + Math.sin(t + an) * 0.4, Math.sin(aa) * rr); cm.rotation.y = t * 0.3; });
  }
  holder.position.y = depth + rng.range(8, 16);
  root.add(holder);
  animate(root, (t) => { holder.position.y = depth + 12 + Math.sin(t * 0.4) * 0.5; });
  const colTop = [{ type: 'cyl', x: 0, z: 0, y0: holder.position.y - depth * 0.5, y1: holder.position.y + 0.55, r: R * 0.95 }, ...colliders.map((c) => ({ ...c, y0: c.y0 + holder.position.y, y1: c.y1 + holder.position.y }))];
  return { root, name: 'Floating island', category: 'nature', icon: '🏝️', height: holder.position.y + 8, footprint: { radius: R }, colliderDefs: colTop, suppressGrass: false, floating: true, floatHeight: 0, noClear: true };
}

// ---------------- Island in the lake ----------------
function* island(ctx, item, rng) {
  const a = item.attrs;
  const R = rng.range(7, 12) * clamp(a.sizeMul || 1, 0.5, 3);
  ctx.stage('geometry', 'Raising an island');
  yield;
  const root = new THREE.Group();
  const palms = rng.int(2, 5);
  const colliders = [];
  for (let i = 0; i < palms; i++) {
    const t = buildTree('palm', rng.nextU32(), 0.8);
    const mats = treeMaterials('palm', 0);
    const g = new THREE.Group();
    if (t.bark) g.add(mesh(t.bark, mats.barkMat));
    if (t.leaves) { const l = mesh(t.leaves, mats.leafMat); markNoAO(l); g.add(l); }
    const an = rng.range(0, TAU), rr = rng.range(0, R * 0.4);
    g.position.set(Math.cos(an) * rr, 0, Math.sin(an) * rr);
    g.userData.groundMe = true;
    root.add(g);
    colliders.push({ type: 'cyl', x: g.position.x, z: g.position.z, y0: 0, y1: 4, r: 0.2 });
    yield;
  }
  const data = {
    root, name: 'Tropical island', category: 'nature', icon: '🏝️', height: 8, footprint: { radius: R }, colliderDefs: colliders, suppressGrass: false, wantsWater: true, preferPlacement: 'onWater',
    onAdded(world) {
      if (!world.terrain) return;
      const x = this.root.position.x, z = this.root.position.z;
      world.terrain.applyEdit({ type: 'flatten', x, z, radius: R * 0.55, falloff: R * 0.6, height: (world.waterLevel || 0) + 1.2, owner: this.id, paint: true, channel: 2, value: 255 });
      world.terrain.applyEdit({ type: 'paint', x, z, radius: R * 0.9, falloff: 2, channel: 2, value: 255, owner: this.id });
      this.root.position.y = world.heightAt(x, z);
      for (const c of this.root.children) if (c.userData.groundMe) { const wp = c.position.clone().applyMatrix4(this.root.matrixWorld); c.position.y = world.heightAt(wp.x, wp.z) - this.root.position.y - 0.1; }
      G.registry.refresh(this);
    },
  };
  return data;
}

// ---------------- Cave ----------------
function* cave(ctx, item, rng) {
  const a = item.attrs;
  const S = rng.range(6, 9) * clamp(a.sizeMul || 1, 0.5, 3);
  ctx.stage('geometry', 'Hollowing out a cave');
  yield;
  const root = new THREE.Group();
  // Rocky hill shell (hemisphere) with an entrance cut and a tunnel inside.
  const geo = new THREE.SphereGeometry(S, 48, 24, 0, TAU, 0, Math.PI / 2);
  const p = geo.attributes.position;
  const rngN = (x, y, z) => Math.sin(x * 0.9 + z * 0.4) * Math.sin(y * 1.1 + x * 0.3) + Math.sin(z * 1.7 - y * 0.6) * 0.5;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + 0.1 * rngN(x, y, z); p.setXYZ(i, x * k, y * k * 0.8, z * k); }
  // Remove triangles in the entrance region (front, low).
  const idx = geo.index.array;
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    let inside = true;
    for (let k = 0; k < 3; k++) { const v = idx[t + k]; const x = p.getX(v), y = p.getY(v), z = p.getZ(v); if (!(z > S * 0.55 && Math.abs(x) < S * 0.28 && y < S * 0.42)) inside = false; }
    if (!inside) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  geo.setIndex(keep);
  geo.computeVertexNormals();
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * S * 4, uv.getY(i) * S * 1.5);
  const shell = mesh(geo, G.materials.get('rock', { world: 4, side: THREE.DoubleSide }));
  root.add(shell);
  // Stalactites & glowing mushrooms inside.
  for (let i = 0; i < 18; i++) {
    const h = rng.range(0.4, 1.4);
    const st = mesh(new THREE.ConeGeometry(rng.range(0.08, 0.2), h, 6), G.materials.get('rock'));
    const an = rng.range(0, TAU), rr = rng.range(0, S * 0.6);
    st.position.set(Math.cos(an) * rr, S * 0.75 * Math.sqrt(1 - (rr / S) ** 2) - h / 2, Math.sin(an) * rr); st.rotation.x = Math.PI;
    root.add(st);
  }
  const glowCol = rng.pick(['#40e0ff', '#a060ff', '#60ff90']);
  for (let i = 0; i < 10; i++) { const m = mesh(new THREE.SphereGeometry(0.12, 8, 6, 0, TAU, 0, Math.PI / 2), G.materials.get('emissive', { color: glowCol, emissiveIntensity: 2 }), false); const an = rng.range(0, TAU), rr = rng.range(1, S * 0.7); m.position.set(Math.cos(an) * rr, 0.1, Math.sin(an) * rr); root.add(m); }
  // Ring collider around the shell leaving the entrance open.
  const colliders = [];
  for (let i = 0; i < 20; i++) { const an = (i / 20) * TAU; if (Math.abs(Math.sin(an / 2)) < 0.14) continue; colliders.push({ type: 'box', x: Math.sin(an) * S * 0.95, z: Math.cos(an) * S * 0.95, y0: 0, y1: S * 0.75, hx: (TAU * S / 40) + 0.2, hz: 0.5, yaw: an }); }
  colliders.push({ type: 'cyl', x: 0, z: 0, y0: S * 0.72, y1: S * 0.85, r: S * 0.9 });
  return {
    root, name: 'Cave', category: 'nature', icon: '🕳️', height: S * 0.85, footprint: { radius: S }, colliderDefs: colliders, flattenTerrain: true, flattenFalloff: 4,
    lights: [{ pos: [0, 1, 0], color: glowCol, intensity: 2.5, distance: S * 1.4, nightOnly: false }],
  };
}

export const natureGen = {
  maxCount: 24,
  estimate: (item) => ({ forest: 6, floatingIsland: 4, tree: 1.5, cave: 2, island: 3, bamboo: 2 }[item.params.kind] || 1),
  stages: () => [{ name: 'geometry', label: 'Growing', weight: 4 }, { name: 'textures', label: 'Materials', weight: 1 }],
  *build(ctx, item, rng) {
    const kind = item.params.kind;
    let data;
    switch (kind) {
      case 'tree': data = yield* tree(ctx, item, rng); break;
      case 'forest': data = yield* forest(ctx, item, rng); break;
      case 'bush': data = yield* tree(ctx, { ...item, params: { ...item.params, species: 'bush' } }, rng); data.name = 'Bush'; break;
      case 'flowers': data = yield* flowers(ctx, item, rng); break;
      case 'rock': data = yield* rock(ctx, item, rng); break;
      case 'mushroom': data = yield* mushroom(ctx, item, rng); break;
      case 'cactus': data = yield* cactus(ctx, item, rng); break;
      case 'crystal': data = yield* crystal(ctx, item, rng); break;
      case 'bamboo': data = yield* bamboo(ctx, item, rng); break;
      case 'coral': data = yield* coral(ctx, item, rng); break;
      case 'floatingIsland': data = yield* floatingIsland(ctx, item, rng); break;
      case 'island': data = yield* island(ctx, item, rng); break;
      case 'cave': data = yield* cave(ctx, item, rng); break;
      default: data = yield* tree(ctx, item, rng);
    }
    // Hook per-frame ticks from sub-objects (butterflies...).
    const ticks = [];
    data.root.traverse((o) => { if (o.userData.animatedTick) ticks.push(o.userData.animatedTick); });
    if (ticks.length) animate(data.root, (t) => { for (const f of ticks) f(t); });
    return data;
  },
};
