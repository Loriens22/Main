// ---------------------------------------------------------------------------
// Humanoid assembly: turns a character spec into a rigged, skinned,
// multi-material character.
//
//   spec -> proportions -> joints -> skeleton
//        -> body SDF (skin + clothing)  --surface nets--> SkinnedMesh
//        -> head SDF (face + hair)      --surface nets--> SkinnedMesh
//        -> hand SDFs                   --surface nets--> SkinnedMesh
//        -> eyes (textured spheres), blinking eyelids, jaw morph + teeth,
//           accessories (glasses, hats)
// All meshes share one THREE.Skeleton driven by the procedural Animator.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { SDFBuilder, extractSDFMesh } from '../core/sdf.js';
import { Noise } from '../core/noise.js';
import { RNG } from '../core/rng.js';
import { G, genPreset } from '../core/context.js';
import { computeProportions, computeJoints, buildSkeleton, B, BONE_NAMES } from './rig.js';
import { buildBodySDF } from './body.js';
import { buildHeadSDF, randomFace } from './head.js';
import { buildHandSDF } from './hands.js';
import { Animator } from './animator.js';
import { buildAccessories } from './accessories.js';

// ---------------- Colours ----------------
export const HAIR_COLORS = {
  black: '#141010', 'jet black': '#0c0a0a', 'dark brown': '#2c1b12', brown: '#4a3020', 'light brown': '#7a5534', chestnut: '#5a2e18',
  auburn: '#6e2e1a', red: '#8e3418', ginger: '#b0521e', copper: '#a0481c', blonde: '#c9a567', 'dirty blonde': '#9a7a4a', golden: '#d0a050', platinum: '#e6dcc0',
  gray: '#8a8680', grey: '#8a8680', silver: '#b8b6b2', white: '#e8e6e2', blue: '#2a5ab8', pink: '#e070a8', green: '#3a9a4a', purple: '#7a3ab0', teal: '#2a9a9a', orange: '#e07a20',
};
export const EYE_COLORS = { brown: '#4a2e1a', 'dark brown': '#2a1a10', hazel: '#7a5a2a', green: '#4a7a3a', blue: '#4a78b0', 'light blue': '#7aa8d8', gray: '#7a8a98', grey: '#7a8a98', amber: '#a06a20', red: '#c02020', violet: '#7a4ab0', gold: '#d0a030' };

// Skin tone from a melanin parameter 0 (very light) .. 1 (very dark).
export function skinToneColor(m, undertone = 0) {
  const stops = [
    [0.0, [0.95, 0.83, 0.77]], [0.2, [0.9, 0.74, 0.65]], [0.4, [0.78, 0.6, 0.49]],
    [0.6, [0.6, 0.43, 0.33]], [0.8, [0.4, 0.27, 0.2]], [1.0, [0.25, 0.16, 0.12]],
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (m >= stops[i][0] && m <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  const t = (m - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const c = a[1].map((v, i) => v + (b[1][i] - v) * t);
  // Undertone: -1 olive/golden .. +1 rosy.
  c[0] *= 1 + undertone * 0.03; c[2] *= 1 - undertone * 0.04; c[1] *= 1 - Math.abs(undertone) * 0.01;
  return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
}

// Iris textures, cached per colour.
const irisCache = new Map();
function irisTexture(hex, seed) {
  const key = hex + ':' + (seed % 4);
  if (irisCache.has(key)) return irisCache.get(key);
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rng = new RNG(seed);
  // Sclera with subtle veins toward the edges.
  const sg = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.5);
  sg.addColorStop(0, '#f4f1ec'); sg.addColorStop(0.7, '#ece4dc'); sg.addColorStop(1, '#e0c8c0');
  g.fillStyle = sg; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(190,60,60,0.18)'; g.lineWidth = 0.8;
  for (let i = 0; i < 18; i++) {
    const a = rng.range(0, Math.PI * 2);
    g.beginPath();
    let x = S / 2 + Math.cos(a) * S * 0.5, y = S / 2 + Math.sin(a) * S * 0.5;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x -= Math.cos(a) * S * 0.04 + rng.range(-4, 4); y -= Math.sin(a) * S * 0.04 + rng.range(-4, 4); g.lineTo(x, y); }
    g.stroke();
  }
  const c = new THREE.Color(hex);
  const ir = S * 0.27;
  const base = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
  const dark = `rgb(${(c.r * 110) | 0},${(c.g * 110) | 0},${(c.b * 110) | 0})`;
  const light = `rgb(${Math.min(255, c.r * 330) | 0},${Math.min(255, c.g * 330) | 0},${Math.min(255, c.b * 330) | 0})`;
  const ig = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, ir);
  ig.addColorStop(0, light); ig.addColorStop(0.45, base); ig.addColorStop(0.88, base); ig.addColorStop(1, dark);
  g.fillStyle = ig; g.beginPath(); g.arc(S / 2, S / 2, ir, 0, Math.PI * 2); g.fill();
  // Radial fibres.
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 + rng.range(-0.02, 0.02);
    g.strokeStyle = rng.chance(0.5) ? `rgba(255,255,255,${rng.range(0.03, 0.12)})` : `rgba(0,0,0,${rng.range(0.05, 0.18)})`;
    g.lineWidth = rng.range(0.6, 1.6);
    g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.07, S / 2 + Math.sin(a) * S * 0.07); g.lineTo(S / 2 + Math.cos(a) * ir * 0.95, S / 2 + Math.sin(a) * ir * 0.95); g.stroke();
  }
  // Limbal ring and pupil.
  g.strokeStyle = 'rgba(10,8,6,0.55)'; g.lineWidth = S * 0.02; g.beginPath(); g.arc(S / 2, S / 2, ir * 0.98, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#050404'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.095, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  irisCache.set(key, tex);
  return tex;
}

function eyeGeometry(r) {
  const g = new THREE.SphereGeometry(r, 28, 20);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Front projection (+Z is the pupil direction); the back maps to sclera.
    const k = z > 0 ? 1 : 0.2;
    uv.setXY(i, 0.5 + (x / r) * 0.5 * k, 0.5 + (y / r) * 0.5 * k);
  }
  return g;
}

// Cylindrical UVs around the dominant bone axis (metres) so fabric/skin detail
// maps have consistent texel density.
function computeUVs(mesh, sdf, rest, J) {
  const n = mesh.vertexCount, pos = mesh.positions;
  const uv = new Float32Array(n * 2);
  const axisCache = new Map();
  const getAxis = (bone) => {
    if (axisCache.has(bone)) return axisCache.get(bone);
    const name = BONE_NAMES[bone];
    const origin = J[name] || J.hips;
    let dir = rest.dir[name];
    if (!dir) dir = new THREE.Vector3(0, 1, 0);
    const ref = Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const t1 = ref.clone().sub(dir.clone().multiplyScalar(ref.dot(dir))).normalize();
    const t2 = new THREE.Vector3().crossVectors(dir, t1);
    const a = { origin, dir, t1, t2 };
    axisCache.set(bone, a);
    return a;
  };
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const prim = sdf.prims[mesh.dominant[i]];
    const ax = getAxis(prim.bone || 0);
    v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(ax.origin);
    const h = v.dot(ax.dir);
    const a = Math.atan2(v.dot(ax.t2), v.dot(ax.t1));
    uv[i * 2] = a * 0.11;
    uv[i * 2 + 1] = h;
  }
  return uv;
}

// Convert extracted SDF mesh data into a skinned BufferGeometry with material groups.
function toGeometry(mesh, sdf, matOrder, colorFn, uvs) {
  const n = mesh.vertexCount;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (mesh.skinIndex) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(mesh.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(mesh.skinWeight, 4));
  }
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = colorFn(i);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Group triangles by material (majority vote of the three vertices, ties -> priority).
  const idx = mesh.indices;
  const tri = idx.length / 3;
  const buckets = matOrder.map(() => []);
  const matIndex = new Map(matOrder.map((m, i) => [m, i]));
  for (let t = 0; t < tri; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    const pa = sdf.prims[mesh.dominant[a]], pb = sdf.prims[mesh.dominant[b]], pc = sdf.prims[mesh.dominant[c]];
    let m;
    if (pa.mat === pb.mat || pa.mat === pc.mat) m = pa.mat;
    else if (pb.mat === pc.mat) m = pb.mat;
    else m = [pa, pb, pc].sort((x, y) => (y.priority || 0) - (x.priority || 0))[0].mat;
    const mi = matIndex.has(m) ? matIndex.get(m) : 0;
    buckets[mi].push(a, b, c);
  }
  const all = [];
  let start = 0;
  buckets.forEach((bk, i) => {
    if (bk.length) { g.addGroup(start, bk.length, i); start += bk.length; for (const x of bk) all.push(x); }
  });
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(all), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// Material factory for clothing/body regions.
function makeMaterials(spec, rng) {
  const M = G.materials;
  const outfit = spec.outfit || {};
  const top = outfit.top || {}, bottom = outfit.bottom || {}, shoes = outfit.shoes || {};
  const skinCol = spec.skinColor ? new THREE.Color(spec.skinColor) : skinToneColor(spec.skinTone ?? 0.35, spec.undertone ?? 0);
  const hairCol = new THREE.Color(spec.hair && spec.hair.color ? (HAIR_COLORS[spec.hair.color] || spec.hair.color) : '#2c1b12');
  const seed = rng.int(0, 2);
  const common = { vertexColors: true, seed };
  const topMatType = { tshirt: 'knit', tank: 'knit', crop: 'knit', polo: 'knit', sweater: 'knit', hoodie: 'knit', shirt: 'cotton', dress: top.fabric === 'velvet' ? 'velvet' : 'cotton', suit: 'fabric', jacket: top.fabric === 'denim' ? 'denim' : top.fabric === 'leather' ? 'leather' : 'fabric', coat: 'fabric', labcoat: 'cotton', robe: 'velvet', armor: 'steel', uniform: 'cotton' }[top.type] || 'knit';
  let topType = top.pattern === 'plaid' ? 'plaid' : top.pattern === 'stripes' ? 'stripes' : top.fabric && !topMatType ? top.fabric : topMatType;
  const bottomMatType = { jeans: 'denim', shorts: bottom.fabric === 'denim' ? 'denim' : 'cotton', skirt: bottom.pattern === 'plaid' ? 'plaid' : 'fabric', sweatpants: 'knit', trousers: 'fabric', chinos: 'cotton', leggings: 'knit' }[bottom.type] || 'fabric';
  const shoeMat = { sneakers: 'fabric', boots: 'leather', dress: 'leather', heels: 'leather', sandals: 'leather' }[shoes.type] || 'fabric';
  const mats = {
    skin: M.get('skin', { color: skinCol, ...common, seed: 0 }),
    lips: M.get('skin', { color: skinCol.clone().lerp(new THREE.Color(spec.lipColor || '#a04a48'), spec.lipstick ? 0.75 : 0.32), ...common, seed: 1, roughness: 0.75 }),
    hair: M.get('hair', { color: hairCol, ...common }),
    top: topType === 'stripes'
      ? M.get('stripes', { color: top.color || '#ffffff', color2: top.color2 || '#1a2a5a', ...common, p: [18, 0, 0.9] })
      : topType === 'plaid'
        ? M.get('plaid', { color: top.color || '#8a1c1c', color2: top.color2 || '#1c2a4a', color3: '#e0d0a0', ...common })
        : M.get(topType, { color: top.color || '#dcdcdc', ...common, sheen: topType === 'knit' }),
    bottom: bottomMatType === 'denim' ? M.get('denim', { color: bottom.color || '#2b3e66', ...common }) : M.get(bottomMatType, { color: bottom.color || '#3a3a40', ...common }),
    shoe: M.get(shoeMat, { color: shoes.color || (shoes.type === 'sneakers' ? '#f0f0f0' : shoes.type === 'boots' ? '#4a2e1c' : '#141414'), ...common, roughness: shoes.type === 'dress' ? 0.55 : undefined }),
    sole: M.get('rubber', { color: shoes.type === 'sneakers' ? '#f4f2ee' : '#1a1818', ...common }),
    lace: M.plain(shoes.laceColor || '#f2f2f2', 0.8, 0, { vertexColors: true }),
    belt: M.get('leather', { color: outfit.beltColor || '#2a1a10', ...common }),
    metal: M.get('metal', { color: '#c8c0a8', ...common }),
    button: M.plain('#e8e4dc', 0.4, 0, { vertexColors: true }),
    tie: M.get('cotton', { color: outfit.tieColor || '#7a1a22', ...common }),
    shirt: M.get('cotton', { color: '#f2f2f0', ...common }),
    accent: M.plain(outfit.accentColor || '#e8e8e8', 0.6, 0, { vertexColors: true }),
    nail: M.plain(skinCol.clone().lerp(new THREE.Color('#f0c8c0'), 0.5), 0.35, 0, { vertexColors: true }),
    glove: M.get('leather', { color: outfit.gloveColor || '#2a2a2a', ...common }),
    teeth: M.plain('#f0ece0', 0.3, 0, { vertexColors: true }),
    glow: M.get('emissive', { color: outfit.glowColor || '#60d0ff', emissiveIntensity: 2 }),
  };
  return { mats, skinCol, hairCol };
}

export class Humanoid {
  constructor(spec, seed = 1) {
    this.spec = spec;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.root = new THREE.Group();
    this.root.name = 'humanoid';
    this.meshes = [];
    this.firstPerson = false;
    this.ready = false;
  }

  *build(ctx, onProgress = () => {}) {
    const spec = this.spec;
    const gp = genPreset();
    const detail = ctx ? ctx.detail : 1;
    const noise = new Noise(this.seed);
    const P = computeProportions(spec);
    const J = computeJoints(P);
    const { bones, skeleton, rest } = buildSkeleton(J);
    this.P = P; this.J = J; this.bones = bones; this.skeleton = skeleton; this.rest = rest;
    const face = randomFace(this.rng.fork('face'), spec);
    this.face = face;
    const { mats, skinCol } = makeMaterials(spec, this.rng.fork('mats'));
    this.materials = mats;
    const hScale = Math.min(3, Math.max(0.55, P.H / 1.8));
    const fine = detail < 0.6 ? 1.35 : 1;

    // ---- Body ----
    onProgress(0.02, 'Sculpting body');
    const sdfB = new SDFBuilder();
    const bodyInfo = buildBodySDF(sdfB, P, J, spec, noise);
    sdfB.compile(noise);
    const bodyMesh = yield* extractSDFMesh(sdfB, {
      voxel: gp.bodyVoxel * hScale * fine, skin: true, boneCount: BONE_NAMES.length, sigma: 0.011 * P.s, aoScale: 0.06 * P.s,
      onProgress: (f) => onProgress(0.02 + f * 0.4, 'Sculpting body'),
    }, ctx);
    onProgress(0.43, 'Tailoring clothes');
    const bodyOrder = ['skin', ...bodyInfo.mats.filter((m) => m !== 'skin')];
    const bodyColor = (i) => { const a = Math.pow(bodyMesh.ao[i], 1.3) * 0.85 + 0.15; return [a, a, a]; };
    const bodyGeo = toGeometry(bodyMesh, sdfB, bodyOrder, bodyColor, computeUVs(bodyMesh, sdfB, rest, J));
    yield;

    // ---- Head ----
    onProgress(0.45, 'Sculpting face');
    const sdfH = new SDFBuilder();
    const headInfo = buildHeadSDF(sdfH, P, J, spec, face, noise, bodyInfo.parts.neck);
    sdfH.compile(noise);
    this.headInfo = headInfo;
    const hb = sdfH.bounds(0.01);
    const headMesh = yield* extractSDFMesh(sdfH, {
      voxel: gp.headVoxel * Math.pow(headInfo.hs, 0.8) * fine, bounds: hb, skin: true, boneCount: BONE_NAMES.length, sigma: 0.008, aoScale: 0.018 * headInfo.hs,
      onProgress: (f) => onProgress(0.45 + f * 0.3, 'Sculpting face'),
    }, ctx);
    onProgress(0.76, 'Painting skin');
    const headOrder = ['skin', 'lips', 'hair', 'accent', 'teeth'];
    const hp = headMesh.positions;
    const brows = headInfo.brows;
    const browColor = new THREE.Color(spec.hair && spec.hair.color ? (HAIR_COLORS[spec.hair.color] || spec.hair.color) : '#2c1b12');
    const browDark = [browColor.r / Math.max(0.05, skinCol.r), browColor.g / Math.max(0.05, skinCol.g), browColor.b / Math.max(0.05, skinCol.b)].map((v) => Math.min(1, v * 1.2 + 0.05));
    const segDist = (px, py, pz, a, b) => {
      const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy + (pz - a[2]) * vz) / (vx * vx + vy * vy + vz * vz)));
      return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t, pz - a[2] - vz * t);
    };
    const hsz = headInfo.hs, O = headInfo.O;
    const headColor = (i) => {
      const ao = Math.pow(headMesh.ao[i], 0.8) * 0.55 + 0.45;
      const prim = sdfH.prims[headMesh.dominant[i]];
      if (prim.mat !== 'skin') return [ao, ao, ao];
      const x = hp[i * 3], y = hp[i * 3 + 1], z = hp[i * 3 + 2];
      let r = 1, g = 1, b = 1;
      // Rosy cheeks, nose and ears.
      const cheek = Math.max(0, 1 - Math.hypot(Math.abs(x) - 0.042 * hsz, y - (O[1] - 0.03 * hsz), z - (O[2] + 0.06 * hsz)) / (0.025 * hsz));
      const nose = Math.max(0, 1 - Math.hypot(x, y - (O[1] - 0.035 * hsz), z - (O[2] + 0.11 * hsz)) / (0.018 * hsz));
      const ear = Math.abs(x) > 0.068 * hsz && z < O[2] + 0.015 * hsz && y > O[1] - 0.05 * hsz ? 0.5 : 0;
      const red = Math.min(1, cheek * 0.8 + nose * 0.6 + ear) * 0.1;
      r *= 1 + red * 0.3; g *= 1 - red * 0.6; b *= 1 - red * 0.5;
      // Darker under the eyes.
      const under = Math.max(0, 1 - Math.hypot(Math.abs(x) - 0.032 * hsz, y - (O[1] - 0.014 * hsz), z - (O[2] + 0.078 * hsz)) / (0.012 * hsz));
      r *= 1 - under * 0.12; g *= 1 - under * 0.14; b *= 1 - under * 0.08;
      // Eyebrows.
      let bd = Infinity;
      for (const br of brows) { bd = Math.min(bd, segDist(x, y, z, br[0], br[1]), segDist(x, y, z, br[1], br[2])); }
      const browW = 0.0048 * hsz * (P.female ? 0.85 : 1.15);
      const bw = Math.max(0, Math.min(1, (browW - bd) / (0.0025 * hsz)));
      r = r * (1 - bw) + browDark[0] * bw; g = g * (1 - bw) + browDark[1] * bw; b = b * (1 - bw) + browDark[2] * bw;
      // Stubble shadow.
      if (headInfo.beardZone || spec.facialHair === 'stubble') {
        const beardY = y < O[1] - 0.035 * hsz && z > O[2] - 0.02 * hsz && y > J.chin.y - 0.015 * hsz;
        if (beardY) {
          const s = Math.min(1, (O[1] - 0.035 * hsz - y) / (0.015 * hsz)) * 0.28;
          r *= 1 - s; g *= 1 - s * 0.95; b *= 1 - s * 0.9;
        }
      }
      return [r * ao, g * ao, b * ao];
    };
    const headUV = new Float32Array(headMesh.vertexCount * 2);
    for (let i = 0; i < headMesh.vertexCount; i++) {
      const x = hp[i * 3] - O[0], y = hp[i * 3 + 1] - O[1], z = hp[i * 3 + 2] - O[2];
      headUV[i * 2] = Math.atan2(x, z) * 0.1; headUV[i * 2 + 1] = y;
    }
    const headGeo = toGeometry(headMesh, sdfH, headOrder, headColor, headUV);
    this._addJawMorph(headGeo, headInfo, J);
    yield;

    // ---- Hands ----
    onProgress(0.8, 'Forming hands');
    const handGeos = [];
    for (const side of [1, -1]) {
      const sdfHd = new SDFBuilder();
      buildHandSDF(sdfHd, P, J, side, spec);
      sdfHd.compile(noise);
      const hm = yield* extractSDFMesh(sdfHd, { voxel: gp.handVoxel * Math.pow(P.hand / 0.19, 0.9) * fine, skin: true, boneCount: BONE_NAMES.length, sigma: 0.006, aoScale: 0.012 }, ctx);
      const hc = (i) => { const a = Math.pow(hm.ao[i], 1.2) * 0.8 + 0.2; return [a, a, a]; };
      const uv = new Float32Array(hm.vertexCount * 2);
      for (let i = 0; i < hm.vertexCount; i++) { uv[i * 2] = hm.positions[i * 3] + hm.positions[i * 3 + 2]; uv[i * 2 + 1] = hm.positions[i * 3 + 1]; }
      handGeos.push(toGeometry(hm, sdfHd, ['skin', 'nail', 'glove'], hc, uv));
    }

    // ---- Assemble ----
    onProgress(0.9, 'Rigging skeleton');
    const root = this.root;
    root.add(bones[0]);
    const bindAll = (geo, order) => {
      const matsArr = order.map((k) => mats[k] || mats.accent);
      const m = new THREE.SkinnedMesh(geo, matsArr);
      m.bind(skeleton, new THREE.Matrix4());
      m.castShadow = true; m.receiveShadow = true;
      m.frustumCulled = false; // skinned bounds change with animation
      root.add(m);
      this.meshes.push(m);
      return m;
    };
    this.bodyMesh = bindAll(bodyGeo, bodyOrder);
    this.headMesh = bindAll(headGeo, headOrder);
    this.headMesh.morphTargetInfluences = [0];
    this.handMeshes = handGeos.map((g) => bindAll(g, ['skin', 'nail', 'glove']));

    // Eyes, eyelids, mouth interior (children of the head bone).
    const headBone = bones[B.head];
    const hbPos = J.head;
    this.eyes = [];
    this.lids = [];
    const eyeColor = EYE_COLORS[spec.eyeColor] || spec.eyeColor || this.rng.pick(['#4a2e1a', '#2a1a10', '#7a5a2a', '#4a7a3a', '#4a78b0', '#7a8a98']);
    const eyeMat = G.materials.get('eye', { map: null });
    for (const e of headInfo.eyes) {
      const mat = eyeMat.clone();
      mat.map = irisTexture(eyeColor, this.seed + (e.side > 0 ? 0 : 1));
      mat.userData = {};
      const eye = new THREE.Mesh(eyeGeometry(e.r), mat);
      eye.position.set(e.pos[0] - hbPos.x, e.pos[1] - hbPos.y, e.pos[2] - hbPos.z);
      eye.castShadow = false;
      headBone.add(eye);
      this.eyes.push(eye);
      const lidPivot = new THREE.Object3D();
      lidPivot.position.copy(eye.position);
      const lidGeo = new THREE.SphereGeometry(e.r * 1.16, 22, 8, 0, Math.PI * 2, 0, 1.38);
      const lid = new THREE.Mesh(lidGeo, mats.skin);
      lid.castShadow = false;
      lidPivot.add(lid);
      lidPivot.rotation.z = e.tilt * 0.6;
      headBone.add(lidPivot);
      lidPivot.userData.open = -0.12 - (e.open - 1) * 0.3;
      lidPivot.userData.closed = 0.62;
      lidPivot.rotation.x = lidPivot.userData.open;
      this.lids.push(lidPivot);
    }
    // Mouth interior + teeth.
    const mouth = headInfo.mouth;
    const hs = headInfo.hs;
    const interior = new THREE.Mesh(new THREE.SphereGeometry(0.02 * hs, 12, 8), G.materials.plain('#2a0c0c', 0.9, 0));
    interior.scale.set(1.1, 0.6, 0.8);
    interior.position.set(mouth.pos[0] - hbPos.x, mouth.pos[1] - hbPos.y, mouth.pos[2] - hbPos.z - 0.018 * hs);
    headBone.add(interior);
    const teethMat = mats.teeth;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.03 * hs, 0.008 * hs, 0.012 * hs), teethMat);
    upper.position.set(mouth.pos[0] - hbPos.x, mouth.pos[1] - hbPos.y + 0.004 * hs, mouth.pos[2] - hbPos.z - 0.011 * hs);
    headBone.add(upper);
    this.jawPivot = new THREE.Object3D();
    this.jawPivot.position.set(0, O[1] - 0.02 * hs - hbPos.y, O[2] - 0.01 * hs - hbPos.z);
    headBone.add(this.jawPivot);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.027 * hs, 0.007 * hs, 0.011 * hs), teethMat);
    lower.position.set(mouth.pos[0] - hbPos.x - this.jawPivot.position.x, mouth.pos[1] - hbPos.y - 0.005 * hs - this.jawPivot.position.y, mouth.pos[2] - hbPos.z - 0.012 * hs - this.jawPivot.position.z);
    this.jawPivot.add(lower);
    this.headOnly = [this.headMesh, ...this.eyes, ...this.lids, interior, upper, this.jawPivot];

    // Accessories (glasses, hats...).
    const acc = buildAccessories(this, spec, headInfo);
    this.headOnly.push(...acc);

    onProgress(0.97, 'Animating');
    this.animator = new Animator(this);
    this.height = P.H;
    this.ready = true;
    onProgress(1, 'Done');
    return this;
  }

  // Jaw-open morph target: rotate lower-face vertices around the jaw hinge.
  _addJawMorph(geo, info, J) {
    const pos = geo.attributes.position;
    const n = pos.count;
    const d = new Float32Array(n * 3);
    const hs = info.hs, O = info.O;
    const hinge = new THREE.Vector3(0, O[1] - 0.02 * hs, O[2] - 0.01 * hs);
    const mY = info.mouth.pos[1];
    const ang = 0.2;
    const c = Math.cos(ang), s = Math.sin(ang);
    const chinY = J.chin.y;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const wy = Math.min(1, Math.max(0, (mY + 0.0005 - y) / (0.004 * hs)));
      const wz = Math.min(1, Math.max(0, (z - (O[2] - 0.035 * hs)) / (0.04 * hs)));
      const wn = 1 - Math.min(1, Math.max(0, (chinY - 0.012 * hs - y) / (0.025 * hs)));
      const wx = 1 - Math.min(1, Math.max(0, (Math.abs(x) - 0.045 * hs) / (0.02 * hs)));
      const w = wy * wz * wn * wx;
      if (w <= 0) continue;
      const ly = y - hinge.y, lz = z - hinge.z;
      // Rotate about +X by -ang (chin moves down).
      const ny = ly * c + lz * s, nz = -ly * s + lz * c;
      d[i * 3 + 1] = (ny - ly) * w;
      d[i * 3 + 2] = (nz - lz) * w;
    }
    geo.morphAttributes.position = [new THREE.BufferAttribute(d, 3)];
  }

  setFirstPerson(on) {
    this.firstPerson = on;
    // Head parts go to layer 1 (hidden from the first-person camera, visible in mirrors/3rd person).
    for (const o of this.headOnly) o.traverse((c) => { if (on) { c.layers.disable(0); c.layers.enable(1); } else { c.layers.enable(0); } });
  }

  update(dt, state) { if (this.animator) this.animator.update(dt, state); }
  triggerJump() { if (this.animator) this.animator.jump(); }
  triggerLand(v) { if (this.animator) this.animator.land(v); }
  setPose(name, data) { if (this.animator) this.animator.setPose(name, data); }
  gesture(name, dur) { if (this.animator) this.animator.gesture(name, dur); }
  talk(seconds) { if (this.animator) this.animator.talk(seconds); }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    for (const e of this.eyes || []) { e.geometry.dispose(); e.material.dispose(); }
    for (const l of this.lids || []) l.children[0].geometry.dispose();
    this.skeleton.dispose();
  }
}
