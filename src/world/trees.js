// ---------------------------------------------------------------------------
// Procedural vegetation geometry: trees (recursive branching with parallel
// transport tube frames), conifers (whorled branches with needle cards),
// palms (curved trunk + arching pinnate fronds), willows, bushes and rocks.
//
// Leaf cards carry "spherical" normals (pointing away from the crown centre)
// so that a crown made of flat quads is lit like a soft volume, the trick
// used by most modern foliage renderers.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { Noise } from '../core/noise.js';
import { G } from '../core/context.js';

export const TREE_SPECIES = {
  oak: { height: [8, 12], trunkR: [0.24, 0.36], crownStart: 0.32, levels: 3, children: [5, 7], angle: [0.65, 1.05], lenRatio: 0.66, radRatio: 0.5, bend: 0.4, gravity: 0.06, leaf: { shape: 0, count: 20, colors: ['#35601a', '#4f7d22', '#78903a'], size: [1.2, 1.8], perTip: 3 }, bark: 'bark' },
  maple: { height: [8, 11], trunkR: [0.2, 0.3], crownStart: 0.35, levels: 3, children: [5, 7], angle: [0.55, 0.9], lenRatio: 0.64, radRatio: 0.5, bend: 0.3, gravity: 0.12, leaf: { shape: 4, count: 16, colors: ['#3c6a1c', '#5c8a26', '#8aa03a'], size: [1.2, 1.7], perTip: 3 }, bark: 'bark' },
  autumn: { height: [8, 11], trunkR: [0.2, 0.3], crownStart: 0.35, levels: 3, children: [5, 7], angle: [0.55, 0.9], lenRatio: 0.64, radRatio: 0.5, bend: 0.3, gravity: 0.12, leaf: { shape: 4, count: 16, colors: ['#c0461a', '#e08a20', '#a8241a'], size: [1.2, 1.7], perTip: 3 }, bark: 'bark' },
  birch: { height: [9, 13], trunkR: [0.12, 0.18], crownStart: 0.4, levels: 3, children: [5, 8], angle: [0.4, 0.65], lenRatio: 0.55, radRatio: 0.45, bend: 0.35, gravity: 0.2, leaf: { shape: 0, count: 24, colors: ['#5a8a2a', '#7aa03a', '#9ab04a'], size: [0.9, 1.3], perTip: 3 }, bark: 'birchBark' },
  cherry: { height: [5, 7], trunkR: [0.16, 0.24], crownStart: 0.35, levels: 3, children: [5, 6], angle: [0.7, 1.1], lenRatio: 0.7, radRatio: 0.5, bend: 0.5, gravity: 0.02, leaf: { shape: 3, count: 26, colors: ['#f4b6c8', '#f8d0dc', '#e890a8'], size: [1.0, 1.4], perTip: 4 }, bark: 'darkBark' },
  dead: { height: [6, 10], trunkR: [0.2, 0.32], crownStart: 0.3, levels: 3, children: [3, 5], angle: [0.6, 1.2], lenRatio: 0.7, radRatio: 0.5, bend: 0.8, gravity: 0.0, leaf: null, bark: 'darkBark' },
  baobab: { height: [8, 11], trunkR: [0.9, 1.3], crownStart: 0.7, levels: 2, children: [6, 8], angle: [0.8, 1.2], lenRatio: 0.35, radRatio: 0.35, bend: 0.6, gravity: 0.1, leaf: { shape: 0, count: 14, colors: ['#4a7a22', '#5a8a2a', '#6a8a30'], size: [1.0, 1.4], perTip: 2 }, bark: 'bark', taper: 0.75 },
  willow: { height: [8, 11], trunkR: [0.28, 0.4], crownStart: 0.35, levels: 2, children: [7, 9], angle: [0.7, 1.0], lenRatio: 0.6, radRatio: 0.45, bend: 0.4, gravity: 0.0, droop: true, leaf: { shape: 1, count: 30, colors: ['#6a9a3a', '#88aa48', '#5a8a2a'], size: [0.6, 0.8], perTip: 3 }, bark: 'bark' },
  pine: { conifer: true, height: [11, 17], trunkR: [0.2, 0.32], whorls: [10, 15], leaf: { shape: 1, count: 30, colors: ['#1e3a14', '#2c4a1a', '#3a5a22'] }, bark: 'bark' },
  spruce: { conifer: true, height: [9, 14], trunkR: [0.18, 0.26], whorls: [13, 18], dense: true, leaf: { shape: 1, count: 34, colors: ['#1a3218', '#24421e', '#30522a'] }, bark: 'darkBark' },
  sequoia: { conifer: true, height: [26, 36], trunkR: [0.8, 1.1], whorls: [14, 18], leaf: { shape: 1, count: 30, colors: ['#2a4a1a', '#3a5a22', '#4a6a2a'] }, bark: 'bark', barkTint: '#a0522d' },
  palm: { palm: true, height: [6, 10], trunkR: [0.16, 0.22], fronds: [10, 14], leaf: { shape: 5, count: 1, colors: ['#3a6a1a', '#5a8a2a', '#8a8a3a'] }, bark: 'bark' },
  bush: { bush: true, height: [0.9, 1.6], leaf: { shape: 0, count: 20, colors: ['#2e5a18', '#46721e', '#6a8a30'], size: [0.6, 0.9] }, bark: 'bark' },
};

class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

// Tube along points with per-point radius, using parallel-transported frames.
export function addTube(b, points, radii, radial, vOffset = 0, uScale = 1) {
  const n = points.length;
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], c = points[Math.min(n - 1, i + 1)];
    T.push(new THREE.Vector3().subVectors(c, a).normalize());
  }
  let n0 = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3().crossVectors(T[0], UP).normalize() : new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    if (i > 0) n0 = n0.clone().sub(T[i].clone().multiplyScalar(n0.dot(T[i]))).normalize();
    N.push(n0.clone());
    B.push(new THREE.Vector3().crossVectors(T[i], n0).normalize());
  }
  const start = b.count;
  let vAcc = vOffset;
  for (let i = 0; i < n; i++) {
    if (i > 0) vAcc += points[i].distanceTo(points[i - 1]);
    const circ = Math.max(0.25, 2 * Math.PI * radii[0]) * uScale;
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = N[i].x * ca + B[i].x * sa, ny = N[i].y * ca + B[i].y * sa, nz = N[i].z * ca + B[i].z * sa;
      const r = radii[i];
      b.pos.push(points[i].x + nx * r, points[i].y + ny * r, points[i].z + nz * r);
      b.nor.push(nx, ny, nz);
      b.uv.push((k / radial) * circ, vAcc);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = start + i * row + k, bb = a + 1, c = a + row, d = c + 1;
      b.idx.push(a, c, bb, bb, c, d);
    }
  }
}

// A leaf card (quad) centred at p, spanning axes ax (width) & ay (height).
function addCard(b, p, ax, ay, w, h, crownCenter, uvRect = [0, 0, 1, 1], normalBlend = 0.75) {
  const s = b.count;
  const face = new THREE.Vector3().crossVectors(ax, ay).normalize();
  const corners = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];
  for (const [cx, cy] of corners) {
    const v = new THREE.Vector3().copy(p).addScaledVector(ax, cx * w).addScaledVector(ay, cy * h);
    const sph = new THREE.Vector3().subVectors(v, crownCenter);
    if (sph.lengthSq() < 1e-6) sph.copy(face);
    sph.normalize();
    const nn = sph.multiplyScalar(normalBlend).addScaledVector(face, 1 - normalBlend).normalize();
    b.pos.push(v.x, v.y, v.z);
    b.nor.push(nn.x, nn.y, nn.z);
    b.uv.push(uvRect[0] + (cx + 0.5) * (uvRect[2] - uvRect[0]), uvRect[1] + cy * (uvRect[3] - uvRect[1]));
  }
  b.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
}

function randomUnit(rng, out = new THREE.Vector3()) {
  const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}

function perpendicular(v) {
  const p = Math.abs(v.y) < 0.95 ? new THREE.Vector3().crossVectors(v, UP) : new THREE.Vector3().crossVectors(v, new THREE.Vector3(1, 0, 0));
  return p.normalize();
}

// Build a tree. Returns { bark, leaves, height, crownRadius, trunkRadius, species, leafDef }.
export function buildTree(speciesName, seed = 1, detail = 1, overrides = {}) {
  const sp = { ...(TREE_SPECIES[speciesName] || TREE_SPECIES.oak), ...overrides };
  const rng = new RNG(seed);
  const bark = new GeoBuilder();
  const leaves = new GeoBuilder();
  const scale = overrides.scale || 1;
  const height = rng.range(sp.height[0], sp.height[1]) * scale;
  const trunkR = rng.range((sp.trunkR || [0.2, 0.3])[0], (sp.trunkR || [0.2, 0.3])[1]) * scale;
  const out = { height, trunkRadius: trunkR, species: speciesName, leafDef: sp.leaf, crownRadius: height * 0.35 };
  if (sp.conifer) buildConifer(sp, rng, bark, leaves, height, trunkR, detail, out);
  else if (sp.palm) buildPalm(sp, rng, bark, leaves, height, trunkR, detail, out);
  else if (sp.bush) buildBush(sp, rng, bark, leaves, height, detail, out);
  else buildDeciduous(sp, rng, bark, leaves, height, trunkR, detail, out);
  out.bark = bark.count ? bark.build() : null;
  out.leaves = leaves.count ? leaves.build() : null;
  return out;
}

function buildDeciduous(sp, rng, bark, leaves, height, trunkR, detail, out) {
  const tips = [];
  const maxLevel = detail < 0.5 ? Math.max(1, sp.levels - 1) : sp.levels;
  const crownCenter = new THREE.Vector3(0, height * (sp.crownStart + (1 - sp.crownStart) * 0.5), 0);
  const grow = (p0, dir, len, rad, level) => {
    const segLen = level === 0 ? 0.7 : 0.45;
    const nSeg = Math.max(2, Math.min(9, Math.round(len / segLen)));
    const pts = [p0.clone()], radii = [rad * (level === 0 ? 1.35 : 1)];
    const d = dir.clone();
    const tmp = new THREE.Vector3();
    const taper = sp.taper ?? 0.72;
    for (let s = 1; s <= nSeg; s++) {
      d.addScaledVector(randomUnit(rng, tmp), sp.bend * (level === 0 ? 0.12 : 0.3));
      if (sp.droop && level > 0) d.y -= 0.12 * level;
      else d.y += sp.gravity * (level === 0 ? 0.5 : 1);
      d.normalize();
      pts.push(pts[pts.length - 1].clone().addScaledVector(d, len / nSeg));
      radii.push(Math.max(0.008, rad * (1 - taper * (s / nSeg))));
    }
    addTube(bark, pts, radii, level === 0 ? Math.max(6, Math.round(10 * detail)) : level === 1 ? 6 : 4);
    if (level < maxLevel) {
      let nChild = rng.int(sp.children[0], sp.children[1]);
      if (level > 0) nChild = Math.max(2, Math.round(nChild * 0.7));
      nChild = Math.max(1, Math.round(nChild * (0.5 + detail * 0.5)));
      const golden = 2.39996;
      const phase = rng.range(0, Math.PI * 2);
      for (let c = 0; c < nChild; c++) {
        const t = level === 0 ? rng.range(sp.crownStart, 0.95) : rng.range(0.3, 0.95);
        const fi = t * (pts.length - 1);
        const i0 = Math.floor(fi), i1 = Math.min(pts.length - 1, i0 + 1);
        const pos = pts[i0].clone().lerp(pts[i1], fi - i0);
        const r = radii[i0] + (radii[i1] - radii[i0]) * (fi - i0);
        const axis = new THREE.Vector3().subVectors(pts[i1], pts[i0]).normalize();
        if (axis.lengthSq() < 0.5) axis.copy(UP);
        const perp = perpendicular(axis).applyAxisAngle(axis, phase + c * golden + rng.range(-0.3, 0.3));
        const ang = rng.range(sp.angle[0], sp.angle[1]);
        const cdir = axis.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang)).normalize();
        const clen = len * sp.lenRatio * (1 - (t - 0.3) * 0.35) * rng.range(0.8, 1.15);
        grow(pos, cdir, level === 0 ? clen * (height / (len + 0.01)) * 0.55 : clen, r * sp.radRatio / 0.7, level + 1);
      }
    }
    if (level >= maxLevel - (sp.droop ? 1 : 0) || level === maxLevel) {
      tips.push({ pts, level });
    }
  };
  grow(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(rng.range(-0.08, 0.08), 1, rng.range(-0.08, 0.08)).normalize(), height * 0.92, trunkR, 0);
  // Leaves.
  let maxR = 0;
  if (sp.leaf) {
    const L = sp.leaf;
    const perTip = Math.max(1, Math.round(L.perTip * (0.4 + detail * 0.6)));
    for (const tip of tips) {
      const pts = tip.pts;
      for (let k = 0; k < perTip; k++) {
        const t = rng.range(0.45, 1.0);
        const fi = t * (pts.length - 1);
        const i0 = Math.floor(fi), i1 = Math.min(pts.length - 1, i0 + 1);
        const p = pts[i0].clone().lerp(pts[i1], fi - i0).add(randomUnit(rng).multiplyScalar(0.25));
        const size = rng.range(L.size ? L.size[0] : 1, L.size ? L.size[1] : 1.5) * (out.height / 10) ** 0.3;
        if (sp.droop) {
          // Hanging strands.
          const ay = new THREE.Vector3(0, -1, 0);
          const ax = perpendicular(ay).applyAxisAngle(ay, rng.range(0, Math.PI * 2));
          const len = rng.range(1.5, Math.max(2, p.y - 0.8));
          addCard(leaves, p, ax, ay, size * 0.6, len, crownCenter, [0, 0, 1, 1], 0.6);
        } else {
          const ay = randomUnit(rng);
          const toOut = new THREE.Vector3().subVectors(p, crownCenter).normalize();
          ay.lerp(toOut, 0.4).normalize();
          const ax = perpendicular(ay).applyAxisAngle(ay, rng.range(0, Math.PI * 2));
          addCard(leaves, p.clone().addScaledVector(ay, -size * 0.4), ax, ay, size, size, crownCenter);
        }
        maxR = Math.max(maxR, Math.hypot(p.x, p.z));
      }
    }
  }
  out.crownRadius = Math.max(1.5, maxR + 0.5);
}

function buildConifer(sp, rng, bark, leaves, height, trunkR, detail, out) {
  const n = new Noise(rng.int(1, 1e6));
  const trunkPts = [], trunkRad = [];
  const segs = 12;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    trunkPts.push(new THREE.Vector3(n.n2(t * 3, 1) * 0.15, -0.3 + t * height, n.n2(t * 3, 7) * 0.15));
    trunkRad.push(trunkR * (1 - t * 0.92) * (i === 0 ? 1.4 : 1));
  }
  addTube(bark, trunkPts, trunkRad, Math.max(6, Math.round(9 * detail)));
  const whorls = Math.round(rng.int(sp.whorls[0], sp.whorls[1]) * (0.6 + detail * 0.4));
  const base = height * (sp.conifer && height > 20 ? 0.35 : 0.14);
  const maxLen = height * (height > 20 ? 0.18 : 0.3);
  const center = new THREE.Vector3(0, height * 0.55, 0);
  let maxR = 0;
  for (let w = 0; w < whorls; w++) {
    const t = w / whorls;
    const y = base + (height - base) * t;
    const len = Math.max(0.5, maxLen * Math.pow(1 - t, 0.9) * rng.range(0.85, 1.1) + 0.3);
    const nb = rng.int(5, sp.dense ? 8 : 7);
    const phase = rng.range(0, Math.PI * 2);
    for (let k = 0; k < nb; k++) {
      const a = phase + (k / nb) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const droop = rng.range(-0.35, 0.05) - t * 0.1 + (1 - t) * -0.15;
      const dir = new THREE.Vector3(Math.cos(a), droop, Math.sin(a)).normalize();
      const p0 = new THREE.Vector3(0, y, 0);
      const pts = [p0, p0.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, -len * 0.05, 0)), p0.clone().addScaledVector(dir, len).add(new THREE.Vector3(0, -len * 0.18, 0))];
      addTube(bark, pts, [trunkR * 0.25 * (1 - t) + 0.02, 0.025, 0.01], 4);
      // Needle cards along the branch: one flat-ish, one vertical for volume.
      const ax = new THREE.Vector3(-dir.z, 0, dir.x);
      const cardW = len * 0.55 + 0.4;
      const ay = new THREE.Vector3().subVectors(pts[2], p0).normalize();
      addCard(leaves, p0.clone().addScaledVector(ay, -0.1), ax, ay, cardW, len * 1.1, center, [0, 0, 1, 1], 0.65);
      if (detail > 0.4) {
        const ax2 = new THREE.Vector3().crossVectors(ay, ax).normalize();
        addCard(leaves, p0.clone().addScaledVector(ay, -0.1), ax2.lerp(ax, 0.3).normalize(), ay, cardW * 0.8, len * 1.05, center, [0, 0, 1, 1], 0.65);
      }
      maxR = Math.max(maxR, len);
    }
  }
  // Leader at the top.
  const top = new THREE.Vector3(0, height - 0.3, 0);
  addCard(leaves, top.clone().add(new THREE.Vector3(0, -1.2, 0)), new THREE.Vector3(1, 0, 0), UP, 0.9, 1.8, center, [0, 0, 1, 1], 0.5);
  addCard(leaves, top.clone().add(new THREE.Vector3(0, -1.2, 0)), new THREE.Vector3(0, 0, 1), UP, 0.9, 1.8, center, [0, 0, 1, 1], 0.5);
  out.crownRadius = maxR + 0.4;
}

function buildPalm(sp, rng, bark, leaves, height, trunkR, detail, out) {
  const lean = new THREE.Vector3(rng.range(-1, 1), 0, rng.range(-1, 1)).normalize().multiplyScalar(rng.range(0.1, 0.35));
  const pts = [], rad = [];
  const segs = 14;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const bendT = t * t;
    pts.push(new THREE.Vector3(lean.x * bendT * height, -0.3 + t * height, lean.z * bendT * height));
    rad.push(trunkR * (1.35 - t * 0.35) * (1 + 0.06 * Math.sin(t * 60)) * (i === 0 ? 1.3 : 1));
  }
  addTube(bark, pts, rad, 8);
  const top = pts[pts.length - 1];
  const nF = Math.round(rng.int(sp.fronds[0], sp.fronds[1]) * (0.6 + detail * 0.4));
  const center = top.clone();
  for (let f = 0; f < nF; f++) {
    const a = (f / nF) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const up = rng.range(0.1, 0.9);
    const len = rng.range(3.2, 4.6) * (height / 8) ** 0.4;
    const width = len * 0.42;
    const dirH = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dirH.z, 0, dirH.x);
    const n = 10;
    const s = leaves.count;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const horiz = t * len;
      const y = up * horiz * 0.8 - t * t * len * 0.75;
      const c = top.clone().addScaledVector(dirH, horiz).add(new THREE.Vector3(0, y, 0));
      const w = width * Math.sin(Math.min(1, t * 1.2 + 0.1) * Math.PI) * 0.5 + 0.05;
      const droopSide = t * 0.35;
      for (const sgn of [-1, 1]) {
        const v = c.clone().addScaledVector(side, sgn * w).add(new THREE.Vector3(0, -droopSide * w, 0));
        const nrm = new THREE.Vector3().subVectors(v, center).normalize().lerp(UP, 0.5).normalize();
        leaves.pos.push(v.x, v.y, v.z); leaves.nor.push(nrm.x, nrm.y, nrm.z);
        leaves.uv.push(sgn < 0 ? 0 : 1, t);
      }
    }
    for (let i = 0; i < n; i++) {
      const a0 = s + i * 2;
      leaves.idx.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2);
    }
  }
  // Coconuts.
  if (rng.chance(0.6)) {
    const cn = rng.int(3, 6);
    for (let i = 0; i < cn; i++) {
      const a = rng.range(0, Math.PI * 2);
      const c = top.clone().add(new THREE.Vector3(Math.cos(a) * 0.25, -0.35, Math.sin(a) * 0.25));
      const sphere = [];
      for (let k = 0; k <= 4; k++) sphere.push(c.clone().add(new THREE.Vector3(0, 0.12 - k * 0.06, 0)));
      addTube(bark, sphere, [0.02, 0.1, 0.12, 0.1, 0.02], 6);
    }
  }
  out.crownRadius = 4;
}

function buildBush(sp, rng, bark, leaves, height, detail, out) {
  const r = height * 0.6;
  const center = new THREE.Vector3(0, height * 0.5, 0);
  const n = Math.round(60 * (0.4 + detail * 0.6) * height);
  for (let i = 0; i < n; i++) {
    const d = randomUnit(rng);
    d.y = Math.abs(d.y) * 0.8 + 0.1;
    const p = center.clone().add(new THREE.Vector3(d.x * r, d.y * r * 0.7 - r * 0.2, d.z * r).multiplyScalar(rng.range(0.4, 1)));
    const ay = randomUnit(rng).lerp(d, 0.5).normalize();
    const ax = perpendicular(ay).applyAxisAngle(ay, rng.range(0, 6.28));
    const s = rng.range(sp.leaf.size[0], sp.leaf.size[1]);
    addCard(leaves, p.clone().addScaledVector(ay, -s * 0.4), ax, ay, s, s, center.clone().add(new THREE.Vector3(0, -r * 0.3, 0)), [0, 0, 1, 1], 0.8);
  }
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, 6.28);
    addTube(bark, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * r * 0.4, height * 0.5, Math.sin(a) * r * 0.4)], [0.03, 0.01], 4);
  }
  out.crownRadius = r;
  out.trunkRadius = 0;
}

// Displaced icosphere rock with box-projected UVs.
export function buildRock(seed, size = 1, opts = {}) {
  const rng = new RNG(seed);
  const n = new Noise(seed);
  const geo = new THREE.IcosahedronGeometry(1, opts.detail ?? 4);
  const pos = geo.attributes.position;
  const sx = rng.range(0.8, 1.5), sy = rng.range(0.45, 0.9) * (opts.tall || 1), sz = rng.range(0.8, 1.3);
  const flat = opts.flatBottom !== false;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + n.fbm3(v.x * 1.3, v.y * 1.3, v.z * 1.3, 4) * 0.35 + n.ridged2(v.x * 2 + v.z, v.y * 2, 3) * 0.15;
    v.multiplyScalar(d);
    v.x *= sx; v.y *= sy; v.z *= sz;
    if (flat && v.y < -0.1) v.y = -0.1 + (v.y + 0.1) * 0.25;
    pos.setXYZ(i, v.x * size, v.y * size, v.z * size);
  }
  geo.computeVertexNormals();
  // Box projection UVs (metres) chosen per vertex by dominant normal axis.
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getZ(i); }
    else if (nx >= nz) { uv[i * 2] = pos.getZ(i); uv[i * 2 + 1] = pos.getY(i); }
    else { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getY(i); }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // Moss/dirt tint via vertex colours: up-facing surfaces greener.
  const col = new Float32Array(pos.count * 3);
  const mossy = opts.moss ?? 0.5;
  for (let i = 0; i < pos.count; i++) {
    const up = Math.max(0, nor.getY(i));
    const m = Math.min(1, Math.max(0, (up - 0.55) * 3)) * mossy * (0.6 + 0.4 * n.n3(pos.getX(i) * 2, pos.getY(i) * 2, pos.getZ(i) * 2));
    col[i * 3] = 1 - m * 0.65; col[i * 3 + 1] = 1 - m * 0.35; col[i * 3 + 2] = 1 - m * 0.8;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// Materials for a species (shared via the material library).
export function treeMaterials(speciesName, variant = 0, overrides = {}) {
  const sp = TREE_SPECIES[speciesName] || TREE_SPECIES.oak;
  const M = G.materials;
  const barkOpts = { wind: 'bark', seed: variant };
  if (sp.barkTint || overrides.barkColor) barkOpts.color = overrides.barkColor || sp.barkTint;
  const barkMat = M.get(overrides.bark || sp.bark || 'bark', barkOpts);
  let leafMat = null;
  const L = overrides.leaf || sp.leaf;
  if (L) {
    const cols = overrides.leafColors || L.colors;
    leafMat = M.get('leaves', {
      color: cols[0], color2: cols[1], color3: cols[2], p: [L.shape, L.count], seed: variant,
      alphaTest: 0.42, side: THREE.DoubleSide, wind: 'leaf', foliage: true,
      translucent: new THREE.Color(cols[1]).multiplyScalar(0.55).getHex(), size: 512,
      emissive: overrides.leafEmissive, emissiveIntensity: overrides.leafEmissiveIntensity,
    });
  }
  return { barkMat, leafMat };
}
