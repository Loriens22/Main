// ---------------------------------------------------------------------------
// Abstract & surreal objects, and the universal FALLBACK generator.
//
//   primitives (cube, sphere, pyramid, torus, knot) honouring colour,
//   material, size, glow, float and spin; SDF-sculpted organic sculptures
//   (unique every time); fractals (Menger sponge / Sierpinski, instanced);
//   a 4D tesseract projected in real time; a black hole with an accretion
//   disk and fake gravitational-lensing ring; a Dali melting clock; rainbows;
//   a giant eye that follows the player; holograms; spiral galaxies;
//   fireworks; lightning/energy orbs; fluffy clouds.
//
// FALLBACK interprets *anything* (unknown nouns, generator failures) as a
// sculpted, labelled art piece so every prompt produces a result.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, genPreset } from '../../core/context.js';
import { SDFBuilder } from '../../core/sdf.js';
import { markNoAO } from '../../render/renderer.js';
import { sdfToGeometry } from './sdfkit.js';
import { animate, labelTexture, glowSprite, glowTexture, hsl, boxUV } from './common.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function mainColor(a, rng, fallback) {
  if (a.primaryColor === 'rainbow') return hsl(rng.range(0, 1), 0.85, 0.55);
  return a.primaryColor || fallback || hsl(rng.range(0, 1), rng.range(0.5, 0.85), rng.range(0.4, 0.6));
}

function surfaceMaterial(a, rng, fallbackType = 'glossyPlastic', color, extra = {}) {
  const M = G.materials;
  const col = color || mainColor(a, rng);
  if (a.flags.glow) return M.get('emissive', { color: col, emissiveIntensity: 2.5, ...extra });
  if (a.flags.transparent) return M.get('glass', { color: col, opacity: 0.35 });
  const mt = a.materials[0];
  if (mt) return M.get(mt, { color: ['glass', 'gold', 'chrome', 'crystal', 'ice', 'lava', 'marble'].includes(mt) && !a.primaryColor ? undefined : col, ...extra });
  return M.get(fallbackType, { color: col, ...extra });
}

// Size from explicit dimensions / size words.
function targetSize(a, base) {
  const d = a.dims || {};
  return d.height || d.size || d.width || d.length || base * clamp(a.sizeMul || 1, 0.05, 30);
}

function applyMotion(data, a, root, holder, rng) {
  if (a.flags.float || a.placementFloat) { data.floating = true; data.floatHeight = data.floatHeight || 1.2; }
  if (a.flags.spin || data._spin) {
    const sp = rng.range(0.4, 0.9) * (rng.chance(0.5) ? 1 : -1);
    animate(root, (t, dt) => { holder.rotation.y += dt * sp; });
  }
  if (data.floating) {
    const y0 = holder.position.y, ph = rng.range(0, 6);
    animate(root, (t) => { holder.position.y = y0 + Math.sin(t * 1.1 + ph) * 0.12; });
  }
  if (a.flags.glow) data.lights = (data.lights || []).concat([{ pos: [0, data.height * 0.5, 0], color: mainColor(a, rng), intensity: 2.5, distance: 8 + data.height * 2, nightOnly: false }]);
}

function meshOf(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}

// ---------------- Primitives ----------------
function* primitive(ctx, item, rng) {
  const a = item.attrs;
  const kind = item.params.kind;
  const size = targetSize(a, kind === 'knot' || kind === 'torus' ? 1.6 : 1.2);
  ctx.stage('geometry', 'Shaping ' + kind);
  yield;
  let geo;
  const seg = Math.round(24 + 40 * genPreset().detail);
  switch (kind) {
    case 'cube': { const r = size * 0.04; geo = roundedBox(size, size, size, r, 3); break; }
    case 'sphere': geo = new THREE.SphereGeometry(size / 2, seg, Math.round(seg * 0.7)); break;
    case 'pyramidShape': geo = new THREE.ConeGeometry(size * 0.7, size, 4, 1); geo.rotateY(Math.PI / 4); break;
    case 'torus': geo = new THREE.TorusGeometry(size * 0.38, size * 0.13, Math.round(seg * 0.6), seg * 2); break;
    case 'knot': geo = new THREE.TorusKnotGeometry(size * 0.32, size * 0.1, seg * 4, Math.round(seg * 0.5), rng.pick([2, 2, 3, 5]), rng.pick([3, 3, 4, 7])); break;
    default: geo = new THREE.IcosahedronGeometry(size / 2, 3);
  }
  scaleUV(geo, size);
  const mat = surfaceMaterial(a, rng, rng.pick(['glossyPlastic', 'glossyPlastic', 'painted', 'metal']));
  const root = new THREE.Group();
  const holder = new THREE.Group();
  const mesh = meshOf(geo, mat);
  geo.computeBoundingBox();
  const lift = -geo.boundingBox.min.y;
  mesh.position.y = lift;
  if (kind === 'torus' || kind === 'knot') { mesh.rotation.x = kind === 'torus' ? 0 : rng.range(0, 1); }
  holder.add(mesh);
  root.add(holder);
  const h = geo.boundingBox.max.y - geo.boundingBox.min.y;
  ctx.stage('textures', 'Finishing');
  yield;
  const data = {
    root, name: (a.colors[0] ? a.colors[0].word + ' ' : '') + ({ pyramidShape: 'pyramid', knot: 'torus knot' }[kind] || kind), category: 'object', icon: item.icon,
    height: h, footprint: { radius: size * 0.55 },
    colliderDefs: [kind === 'sphere' || kind === 'torus' || kind === 'knot' ? { type: 'cyl', x: 0, z: 0, y0: 0, y1: h, r: size * 0.45 } : { type: 'box', x: 0, z: 0, y0: 0, y1: h, hx: size / 2, hz: size / 2 }],
  };
  applyMotion(data, a, root, holder, rng);
  if (data.floating) data.colliderDefs = [];
  return data;
}

function scaleUV(geo, s) {
  const uv = geo.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s * 2, uv.getY(i) * s);
}

function roundedBox(w, h, d, r, segs) {
  // Box with rounded edges: subdivided box whose vertices are pushed onto a rounded shape.
  const g = new THREE.BoxGeometry(w, h, d, segs * 2, segs * 2, segs * 2);
  const p = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd));
    const off = v.clone().sub(c);
    if (off.lengthSq() > 1e-12) v.copy(c).add(off.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  boxUV(g, w, h, d);
  return g;
}

// ---------------- SDF sculpture (organic, unique per seed) ----------------
function* sculpture(ctx, item, rng, label) {
  const a = item.attrs;
  const H = targetSize(a, rng.range(1.8, 3.2));
  const style = rng.pick(['blobs', 'twist', 'arch', 'stack', 'figure', 'rings']);
  ctx.stage('geometry', 'Sculpting ' + (label || 'sculpture'));
  const sdf = new SDFBuilder();
  const s = H;
  const k = 0.08 * s;
  if (style === 'blobs') {
    let p = [0, 0.25 * s, 0];
    for (let i = 0; i < 7; i++) {
      const r = s * rng.range(0.1, 0.2) * (1 - i * 0.07);
      sdf.sphere(p.slice(), r, { op: i ? 'smooth' : 'union', k });
      p = [p[0] + rng.range(-0.2, 0.2) * s, p[1] + r * rng.range(0.9, 1.4), p[2] + rng.range(-0.2, 0.2) * s];
    }
  } else if (style === 'twist') {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const t = i / n, ang = t * TAU * 0.8;
      sdf.box([Math.sin(ang) * 0.05 * s, (0.08 + t * 0.85) * s, Math.cos(ang) * 0.05 * s], [0.18 * s * (1 - t * 0.5), 0.045 * s, 0.07 * s], { rot: [0, ang, 0.2 * Math.sin(ang)], op: i ? 'smooth' : 'union', k: k * 0.6, round: 0.02 * s });
    }
  } else if (style === 'arch') {
    sdf.torus([0, 0.45 * s, 0], 0.36 * s, 0.07 * s, { rot: [Math.PI / 2, 0, 0] });
    sdf.box([0, 0.06 * s, 0], [0.45 * s, 0.06 * s, 0.12 * s], { op: 'smooth', k, round: 0.02 * s });
    sdf.plane([0, 1, 0], 0.0, { op: 'inter' });
    sdf.sphere([rng.range(-0.1, 0.1) * s, 0.45 * s, 0], 0.12 * s);
  } else if (style === 'stack') {
    let y = 0;
    for (let i = 0; i < 5; i++) {
      const r = s * rng.range(0.1, 0.18);
      sdf.ellipsoid([rng.range(-0.05, 0.05) * s, y + r * 0.7, 0], [r * rng.range(1, 1.6), r * 0.7, r * rng.range(0.9, 1.3)], { rot: [0, rng.range(0, 3), rng.range(-0.2, 0.2)], op: i ? 'smooth' : 'union', k: k * 0.4 });
      y += r * 1.3;
    }
  } else if (style === 'figure') {
    // Abstract Henry-Moore-like reclining form with holes.
    sdf.capsule([-0.3 * s, 0.2 * s, 0], [0.3 * s, 0.25 * s, 0], 0.16 * s);
    sdf.sphere([0.35 * s, 0.45 * s, 0.02 * s], 0.13 * s, { op: 'smooth', k });
    sdf.capsule([-0.25 * s, 0.2 * s, 0], [-0.1 * s, 0.55 * s, 0.05 * s], 0.1 * s, { op: 'smooth', k });
    sdf.sphere([0.0, 0.3 * s, 0.1 * s], 0.09 * s, { op: 'smoothSub', k: k * 0.5 });
    sdf.capsule([0.1 * s, 0.25 * s, -0.3 * s], [0.1 * s, 0.25 * s, 0.3 * s], 0.06 * s, { op: 'smoothSub', k: k * 0.4 });
  } else {
    for (let i = 0; i < 4; i++) sdf.torus([0, (0.3 + i * 0.17) * s, 0], (0.26 - i * 0.04) * s, 0.035 * s, { rot: [rng.range(-0.8, 0.8), rng.range(0, 3), rng.range(-0.8, 0.8)], op: i ? 'smooth' : 'union', k: k * 0.3 });
    sdf.capsule([0, 0, 0], [0, 0.85 * s, 0], 0.03 * s, { op: 'smooth', k: k * 0.3 });
  }
  const voxel = Math.max(0.006, s * 0.012 / Math.max(0.5, genPreset().detail));
  const { geometry } = yield* sdfToGeometry(sdf, ctx, { voxel, onProgress: (f) => ctx.progress(f * 0.9, 'Sculpting') });
  const baseType = rng.pick(['bronze', 'marble', 'chrome', 'glossyPlastic', 'copper', 'granite']);
  const mat = surfaceMaterial(a, rng, baseType, a.primaryColor || a.materials[0] ? undefined : (baseType === 'glossyPlastic' ? undefined : '#ffffff'), { vertexColors: true });
  const root = new THREE.Group();
  const holder = new THREE.Group();
  const mesh = meshOf(geometry, mat);
  // Plinth.
  const plinthH = 0.35 * Math.min(1.5, s / 2.5);
  const plinth = meshOf(roundedBox(s * 0.5, plinthH, s * 0.5, 0.02, 1), G.materials.get('marble', { color: '#e8e6e0' }));
  plinth.position.y = plinthH / 2;
  geometry.computeBoundingBox();
  mesh.position.y = plinthH - geometry.boundingBox.min.y;
  holder.add(mesh);
  root.add(plinth, holder);
  if (label) {
    const tex = labelTexture(label, { bg: '#1a1a1a', fg: '#e8d8a0', w: 512, h: 128, font: 'Georgia, serif' });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.36, s * 0.09), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.3 }));
    plate.position.set(0, plinthH * 0.5, s * 0.25 + 0.005);
    root.add(plate);
  }
  const h = plinthH + geometry.boundingBox.max.y - geometry.boundingBox.min.y;
  const data = {
    root, name: label ? `"${label[0].toUpperCase() + label.slice(1)}" (sculpture)` : 'Abstract sculpture', category: 'art', icon: '🗿', height: h,
    footprint: { radius: s * 0.4 }, colliderDefs: [{ type: 'box', x: 0, z: 0, y0: 0, y1: h, hx: s * 0.25, hz: s * 0.25 }],
  };
  applyMotion(data, a, root, holder, rng);
  return data;
}

// ---------------- Fractals ----------------
function* fractal(ctx, item, rng) {
  const a = item.attrs;
  const kind = a.words.includes('sierpinski') || a.words.includes('triangle') ? 'sierpinski' : a.words.includes('menger') || a.words.includes('sponge') ? 'menger' : rng.pick(['menger', 'sierpinski']);
  const size = targetSize(a, rng.range(3, 5));
  ctx.stage('geometry', 'Recursing ' + kind);
  const cells = [];
  if (kind === 'menger') {
    const level = genPreset().detail > 0.7 ? 3 : 2;
    const rec = (x, y, z, s, l) => {
      if (l === 0) { cells.push([x, y, z, s]); return; }
      const t = s / 3;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        if ((i === 0) + (j === 0) + (k === 0) >= 2) continue;
        rec(x + i * t, y + j * t, z + k * t, t, l - 1);
      }
    };
    rec(0, size / 2, 0, size, level);
  } else {
    const level = genPreset().detail > 0.7 ? 5 : 4;
    const rec = (x, y, z, s, l) => {
      if (l === 0) { cells.push([x, y, z, s]); return; }
      const h = s / 2;
      rec(x, y + h * 0.8165 * 0.5, z, h, l - 1);
      for (let i = 0; i < 3; i++) { const ang = (i / 3) * TAU; rec(x + Math.sin(ang) * h * 0.577 * 0.5, y - h * 0.8165 * 0.0, z + Math.cos(ang) * h * 0.577 * 0.5, h, l - 1); }
    };
    rec(0, 0, 0, size, level);
  }
  yield;
  const geo = kind === 'menger' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.TetrahedronGeometry(0.61, 0);
  if (kind !== 'menger') { geo.rotateX(-Math.atan(Math.SQRT2)); geo.rotateY(Math.PI / 4); }
  const mat = a.materials[0] ? surfaceMaterial(a, rng) : new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.6 });
  const inst = new THREE.InstancedMesh(geo, mat, cells.length);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  const hue = a.primaryColor ? new THREE.Color(a.primaryColor).getHSL({}).h : rng.range(0, 1);
  let minY = Infinity;
  cells.forEach(([x, y, z, s], i) => {
    m.makeScale(s, s, s).setPosition(x, y, z);
    inst.setMatrixAt(i, m);
    col.setHSL(hue + (y / size) * 0.25 + Math.hypot(x, z) / size * 0.1, 0.7, 0.5);
    if (!a.materials[0]) inst.setColorAt(i, col);
    minY = Math.min(minY, y - s * 0.5);
  });
  inst.position.y = -minY + 0.02;
  inst.castShadow = true; inst.receiveShadow = true;
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.add(inst);
  root.add(holder);
  const data = { root, name: kind === 'menger' ? 'Menger sponge' : 'Sierpinski pyramid', category: 'art', icon: '🔷', height: size, footprint: { radius: size * 0.6 }, colliderDefs: [{ type: 'box', x: 0, z: 0, y0: 0, y1: size, hx: size / 2, hz: size / 2 }] };
  data._spin = a.flags.spin;
  applyMotion(data, a, root, holder, rng);
  return data;
}

// ---------------- Tesseract (4D hypercube, projected every frame) ----------------
function* tesseract(ctx, item, rng) {
  const a = item.attrs;
  const size = targetSize(a, 2.4);
  const col = mainColor(a, rng, '#40d0ff');
  ctx.stage('geometry', 'Unfolding the 4th dimension');
  yield;
  const verts = [];
  for (let i = 0; i < 16; i++) verts.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
  const edges = [];
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) edges.push([i, j]); }
  const edgeGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const edgeMat = G.materials.get('emissive', { color: col, emissiveIntensity: 3 });
  const nodeMat = G.materials.get('emissive', { color: '#ffffff', emissiveIntensity: 4 });
  const edgesMesh = new THREE.InstancedMesh(edgeGeo, edgeMat, edges.length);
  const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), nodeMat, 16);
  edgesMesh.frustumCulled = false; nodes.frustumCulled = false;
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.y = size * 0.9 + 0.8;
  holder.add(edgesMesh, nodes);
  const glass = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.25, 1), G.materials.get('glass', { color: col, opacity: 0.15 }));
  holder.add(glass);
  root.add(holder);
  const p3 = verts.map(() => new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion(), mm = new THREE.Matrix4(), sc = new THREE.Vector3();
  const speed = rng.range(0.3, 0.6);
  animate(root, (t) => {
    const a1 = t * speed, a2 = t * speed * 0.7;
    const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
    for (let i = 0; i < 16; i++) {
      let [x, y, z, w] = verts[i];
      // Rotate in XW and YZ planes, then ZW.
      [x, w] = [x * c1 - w * s1, x * s1 + w * c1];
      [y, z] = [y * c2 - z * s2, y * s2 + z * c2];
      [z, w] = [z * c2 - w * s2, z * s2 + w * c2];
      const k = 1 / (2.6 - w); // stereographic-ish perspective from 4D
      p3[i].set(x * k, y * k, z * k).multiplyScalar(size);
      mm.makeScale(0.06 * size * k, 0.06 * size * k, 0.06 * size * k).setPosition(p3[i]);
      nodes.setMatrixAt(i, mm);
    }
    edges.forEach(([i, j], e) => {
      dir.subVectors(p3[j], p3[i]);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      sc.set(0.018 * size, len, 0.018 * size);
      mm.compose(p3[i].clone().add(p3[j]).multiplyScalar(0.5), q, sc);
      edgesMesh.setMatrixAt(e, mm);
    });
    edgesMesh.instanceMatrix.needsUpdate = true;
    nodes.instanceMatrix.needsUpdate = true;
    holder.rotation.y = t * 0.15;
  });
  markNoAO(holder);
  return { root, name: 'Tesseract', category: 'art', icon: '🧊', height: size * 1.8 + 0.8, footprint: { radius: size }, lights: [{ pos: [0, size + 0.8, 0], color: col, intensity: 3, distance: 10, nightOnly: false }] };
}

// ---------------- Black hole ----------------
const DISK_VS = /* glsl */`
varying vec2 vUv; varying vec3 vPos;
void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const DISK_FS = /* glsl */`
uniform float uTime; uniform float uInner; uniform float uOuter; uniform vec3 uHot; uniform vec3 uCool;
varying vec2 vUv; varying vec3 vPos;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  float r = length(vPos.xy);
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;
  float ang = atan(vPos.y, vPos.x);
  float swirl = ang + uTime * (1.6 / (0.3 + t)) + log(r) * 4.0;
  float bands = n2(vec2(swirl * 3.0, t * 18.0)) * 0.6 + n2(vec2(swirl * 9.0, t * 40.0)) * 0.4;
  float fade = smoothstep(0.0, 0.08, t) * pow(1.0 - t, 1.6);
  vec3 col = mix(uHot, uCool, smoothstep(0.0, 0.8, t)) * (0.6 + bands * 1.2);
  // Doppler beaming: one side brighter.
  col *= 0.55 + 0.9 * (0.5 + 0.5 * cos(ang));
  gl_FragColor = vec4(col * fade * 2.2, fade);
}`;

function* blackHole(ctx, item, rng) {
  const a = item.attrs;
  const R = targetSize(a, 2.2) / 2;
  ctx.stage('geometry', 'Collapsing a star');
  yield;
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.y = R * 4 + 1;
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const uniforms = { uTime: { value: 0 }, uInner: { value: R * 1.5 }, uOuter: { value: R * 5 }, uHot: { value: new THREE.Color('#fff2d0') }, uCool: { value: new THREE.Color(a.primaryColor || '#ff6a1a') } };
  const diskMat = new THREE.ShaderMaterial({ uniforms, vertexShader: DISK_VS, fragmentShader: DISK_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const disk = new THREE.Mesh(new THREE.RingGeometry(R * 1.5, R * 5, 128, 4), diskMat);
  disk.rotation.x = -Math.PI / 2 + 0.12;
  // Lensed image of the far side of the disk: a camera-facing ring hugging the horizon.
  const lensUniforms = { ...uniforms, uInner: { value: R * 1.02 }, uOuter: { value: R * 1.9 } };
  const lensMat = new THREE.ShaderMaterial({ uniforms: lensUniforms, vertexShader: DISK_VS, fragmentShader: DISK_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const lens = new THREE.Mesh(new THREE.RingGeometry(R * 1.02, R * 1.9, 96, 2), lensMat);
  const photon = glowSprite('#ffe8c0', R * 3.2, 0.55);
  holder.add(horizon, disk, lens, photon);
  // Particles spiralling inwards.
  const N = 1500;
  const pg = new THREE.BufferGeometry();
  const pp = new Float32Array(N * 3), seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) seeds[i] = Math.random();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#ffd8a0', size: 0.05 * R, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture() }));
  pts.frustumCulled = false;
  holder.add(pts);
  root.add(holder);
  markNoAO(holder);
  const camDir = new THREE.Vector3();
  animate(root, (t) => {
    uniforms.uTime.value = t;
    if (G.camera) { lens.lookAt(G.camera.position); camDir.copy(G.camera.position); }
    for (let i = 0; i < N; i++) {
      const life = (seeds[i] + t * 0.05) % 1;
      const r = R * (7 - life * 5.6);
      const ang = seeds[i] * 100 + t * (3 / (r / R)) + life * 8;
      pp[i * 3] = Math.cos(ang) * r; pp[i * 3 + 2] = Math.sin(ang) * r; pp[i * 3 + 1] = Math.sin(seeds[i] * 50) * 0.1 * R * (1 - life);
    }
    pg.attributes.position.needsUpdate = true;
  });
  // Gravity: pulls the player gently when close (handled by data.update).
  const data = { root, name: 'Black hole', category: 'cosmic', icon: '🕳️', height: holder.position.y + R * 2, footprint: { radius: R * 5 }, floating: false, lights: [{ pos: [0, holder.position.y, 0], color: '#ffa860', intensity: 4, distance: R * 14, nightOnly: false }] };
  data.update = (dt) => {
    if (!G.player) return;
    const wp = new THREE.Vector3(); horizon.getWorldPosition(wp);
    const d = wp.distanceTo(G.player.position);
    if (d < R * 10 && d > 0.5 && !G.player.sitting) {
      const pull = wp.sub(G.player.position).normalize().multiplyScalar(Math.min(6, 30 / (d * d)) * dt);
      G.player.velocity.add(pull);
    }
  };
  return data;
}

// ---------------- Melting clock ----------------
function* meltingClock(ctx, item, rng) {
  const a = item.attrs;
  const R = targetSize(a, 1.4) / 2;
  ctx.stage('geometry', 'Melting time');
  yield;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#d8c890'; g.beginPath(); g.arc(256, 256, 250, 0, TAU); g.fill();
  g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(256, 256, 225, 0, TAU); g.fill();
  g.fillStyle = '#2a2018'; g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const an = (i / 12) * TAU; g.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i - 1], 256 + Math.sin(an) * 185, 256 - Math.cos(an) * 185); }
  g.lineWidth = 10; g.lineCap = 'round'; g.strokeStyle = '#1a140e';
  g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + 90, 256 - 60); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(256, 256); g.lineTo(256 - 30, 256 - 150); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  // Dense disc so the drape over the ledge edge (x = edge) bends smoothly.
  const dense = subdivideDisc(R, R * 0.08, 64, 20);
  const dp = dense.attributes.position;
  const edge = R * 0.15, c = R * 0.06;
  for (let i = 0; i < dp.count; i++) {
    let x = dp.getX(i), y = dp.getY(i);
    const z = dp.getZ(i);
    if (x > edge) {
      // Wrap around the ledge corner (pivot just below the disc), then hang down.
      const over = x - edge;
      const rad = y + c;
      const ang = over / Math.max(0.01, c + R * 0.04);
      if (ang < Math.PI / 2) { x = edge + Math.sin(ang) * rad; y = -c + Math.cos(ang) * rad; }
      else {
        const rest = over - (c + R * 0.04) * Math.PI / 2;
        x = edge + rad + Math.sin(rest * 3 + z * 4) * 0.03 * R;
        y = -c - rest * (1 + 0.25 * Math.sin(z * 5 / R));
      }
    }
    dp.setXYZ(i, x, y, z);
  }
  dense.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide });
  const clock = meshOf(dense, mat);
  // A stone ledge the clock drapes over.
  const ledge = meshOf(roundedBox(R * 1.4, R * 0.9, R * 1.6, 0.03, 1), G.materials.get('stone'));
  ledge.position.set(edge - R * 0.7, R * 0.45, 0);
  const root = new THREE.Group();
  root.add(ledge, clock);
  clock.position.y = R * 0.9 + R * 0.04;
  return { root, name: 'Melting clock', category: 'art', icon: '🕰️', height: R * 1.2, footprint: { radius: R * 1.2 }, colliderDefs: [{ type: 'box', x: edge - R * 0.7, z: 0, y0: 0, y1: R * 0.9, hx: R * 0.7, hz: R * 0.8 }] };
}

function subdivideDisc(R, th, radial, rings) {
  // Top & bottom discs with concentric rings (so the drape bends smoothly) + rim.
  const pos = [], uv = [], idx = [];
  const ringVerts = (y, flip) => {
    const base = pos.length / 3;
    pos.push(0, y, 0); uv.push(0.5, 0.5);
    for (let r = 1; r <= rings; r++) for (let s = 0; s < radial; s++) {
      const a = (s / radial) * TAU, rr = (r / rings) * R;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr); uv.push(0.5 + Math.cos(a) * rr / (2 * R), 0.5 - Math.sin(a) * rr / (2 * R));
    }
    const at = (r, s) => (r === 0 ? base : base + 1 + (r - 1) * radial + (s % radial));
    for (let s = 0; s < radial; s++) flip ? idx.push(at(0, 0), at(1, s + 1), at(1, s)) : idx.push(at(0, 0), at(1, s), at(1, s + 1));
    for (let r = 1; r < rings; r++) for (let s = 0; s < radial; s++) {
      const a0 = at(r, s), a1 = at(r, s + 1), b0 = at(r + 1, s), b1 = at(r + 1, s + 1);
      flip ? idx.push(a0, a1, b1, a0, b1, b0) : idx.push(a0, b1, a1, a0, b0, b1);
    }
    return (s) => at(rings, s);
  };
  const top = ringVerts(th / 2, false), bot = ringVerts(-th / 2, true);
  for (let s = 0; s < radial; s++) idx.push(top(s), bot(s), top(s + 1), top(s + 1), bot(s), bot(s + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------------- Rainbow ----------------
function* rainbow(ctx, item, rng) {
  const a = item.attrs;
  const R = targetSize(a, rng.range(30, 50));
  ctx.stage('geometry', 'Bending light');
  yield;
  const geo = new THREE.RingGeometry(R * 0.86, R, 128, 8, 0, Math.PI);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uInner: { value: R * 0.86 }, uOuter: { value: R } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uInner; uniform float uOuter; varying vec3 vP;
      vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); }
      void main(){ float t = (length(vP.xy)-uInner)/(uOuter-uInner); float a = smoothstep(0.0,0.15,t)*smoothstep(1.0,0.85,t);
        float fadeEnds = smoothstep(0.0, 0.25, vP.y / uOuter);
        gl_FragColor = vec4(hue(t*0.78)*1.2, a*0.55*fadeEnds); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.noRaycast = true;
  const root = new THREE.Group();
  root.add(mesh);
  markNoAO(mesh);
  return { root, name: 'Rainbow', category: 'sky', icon: '🌈', height: R, footprint: { radius: 2 }, suppressGrass: false, noCollide: true };
}

// ---------------- Giant eye ----------------
function* giantEye(ctx, item, rng) {
  const a = item.attrs;
  const R = targetSize(a, rng.range(1.2, 2.2)) / 2;
  ctx.stage('geometry', 'Growing an eye');
  yield;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2ece4'; g.fillRect(0, 0, 512, 512);
  // Veins.
  g.strokeStyle = 'rgba(170,30,30,0.55)';
  for (let i = 0; i < 40; i++) {
    g.lineWidth = rng.range(0.5, 2.5);
    let x = rng.range(0, 512), y = rng.chance(0.5) ? 0 : 512;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += rng.range(-30, 30); y += (y < 256 ? 1 : -1) * rng.range(8, 24); g.lineTo(x, y); }
    g.stroke();
  }
  const irisCol = mainColor(a, rng, rng.pick(['#3a7ad8', '#3a9a4a', '#8a5a2a', '#9a3ad8', '#d8a02a']));
  const gr = g.createRadialGradient(256, 256, 20, 256, 256, 110);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.28, '#000'); gr.addColorStop(0.3, irisCol); gr.addColorStop(0.85, new THREE.Color(irisCol).multiplyScalar(0.5).getStyle()); gr.addColorStop(1, '#101010');
  g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 110, 0, TAU); g.fill();
  for (let i = 0; i < 120; i++) { const an = rng.range(0, TAU); g.strokeStyle = `rgba(255,255,255,${rng.range(0.05, 0.2)})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(256 + Math.cos(an) * 36, 256 + Math.sin(an) * 36); g.lineTo(256 + Math.cos(an) * 105, 256 + Math.sin(an) * 105); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(R, 64, 48);
  // Planar projection from the front so the iris sits at +Z.
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const k = z > 0 ? 1 : 1.6; uv.setXY(i, 0.5 + (x / R) * 0.5 / k, 0.5 + (y / R) * 0.5 / k); }
  const eye = meshOf(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.02 }));
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.y = R * 1.6;
  holder.add(eye);
  // Fleshy stalk.
  const stalk = meshOf(new THREE.CylinderGeometry(R * 0.25, R * 0.45, R * 1.1, 20), G.materials.get('skin', { color: '#b86a6a' }));
  stalk.position.y = R * 0.5;
  root.add(stalk, holder);
  const target = new THREE.Vector3(), wp = new THREE.Vector3();
  let blink = 0, nextBlink = 3;
  animate(root, (t, dt) => {
    if (!G.player) return;
    holder.getWorldPosition(wp);
    target.copy(G.camera ? G.camera.position : G.player.position);
    const m = new THREE.Matrix4().lookAt(target, wp, new THREE.Vector3(0, 1, 0));
    const qTarget = new THREE.Quaternion().setFromRotationMatrix(m);
    const parentQ = new THREE.Quaternion(); root.getWorldQuaternion(parentQ);
    qTarget.premultiply(parentQ.invert());
    holder.quaternion.slerp(qTarget, Math.min(1, dt * 4));
    nextBlink -= dt;
    if (nextBlink < 0) { blink = 1; nextBlink = rng.range(2, 6); }
    blink = Math.max(0, blink - dt * 6);
    holder.scale.set(1, 1 - Math.sin(blink * Math.PI) * 0.9, 1);
  });
  return { root, name: 'Giant eye', category: 'surreal', icon: '👁️', height: R * 2.6, footprint: { radius: R }, colliderDefs: [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: R * 2.6, r: R * 0.9 }] };
}

// ---------------- Hologram ----------------
function* hologram(ctx, item, rng) {
  const a = item.attrs;
  const H = targetSize(a, 1.8);
  const col = mainColor(a, rng, '#40c8ff');
  ctx.stage('geometry', 'Projecting hologram');
  yield;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(col) } },
    vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vW; varying vec3 vN;
      void main(){ vec3 V = normalize(cameraPosition - vW); float fres = pow(1.0 - abs(dot(V, vN)), 2.0);
        float scan = 0.55 + 0.45 * sin(vW.y * 60.0 - uTime * 8.0); float flick = 0.85 + 0.15 * sin(uTime * 37.0);
        gl_FragColor = vec4(uColor * (0.25 + fres * 1.6) * scan * flick * 1.5, (0.2 + fres) * 0.8); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const shapes = [() => new THREE.TorusKnotGeometry(H * 0.2, H * 0.06, 160, 16), () => new THREE.IcosahedronGeometry(H * 0.3, 1), () => new THREE.SphereGeometry(H * 0.3, 24, 16)];
  const geo = rng.pick(shapes)();
  const holo = new THREE.Mesh(geo, mat);
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  const holder = new THREE.Group();
  holder.position.y = H * 0.65;
  holder.add(holo, wire);
  const base = meshOf(new THREE.CylinderGeometry(H * 0.25, H * 0.3, 0.15, 32), G.materials.get('darkPanels', { color3: col }));
  base.position.y = 0.075;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.12, H * 0.12, 0.02, 24), G.materials.get('emissive', { color: col, emissiveIntensity: 3 }));
  lens.position.y = 0.16;
  const beamMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamC = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.35, H * 0.12, H * 0.5, 24, 1, true), beamMat);
  beamC.position.y = 0.16 + H * 0.25;
  const root = new THREE.Group();
  root.add(base, lens, beamC, holder);
  markNoAO(holder); markNoAO(beamC);
  animate(root, (t) => { mat.uniforms.uTime.value = t; holder.rotation.y = t * 0.6; holder.position.y = H * 0.65 + Math.sin(t * 1.3) * 0.03; });
  return { root, name: 'Hologram', category: 'tech', icon: '💠', height: H, footprint: { radius: H * 0.35 }, colliderDefs: [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: 0.2, r: H * 0.3 }], lights: [{ pos: [0, H * 0.6, 0], color: col, intensity: 1.8, distance: 6, nightOnly: false }] };
}

// ---------------- Galaxy ----------------
function* galaxy(ctx, item, rng) {
  const a = item.attrs;
  const R = targetSize(a, rng.range(8, 14));
  ctx.stage('geometry', 'Spinning up a galaxy');
  const N = Math.round(12000 + 30000 * genPreset().detail);
  const arms = rng.int(2, 5);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c1 = new THREE.Color(a.primaryColor || hsl(rng.range(0.5, 0.75), 0.8, 0.6)), c2 = new THREE.Color('#ffd8a0'), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const r = Math.pow(rng.next(), 1.6) * R;
    const arm = (i % arms) / arms * TAU;
    const spin = r / R * 5;
    const scatter = (1 - r / R) * 0.2 + 0.25;
    const ang = arm + spin + rng.normal() * scatter;
    pos[i * 3] = Math.cos(ang) * r + rng.normal() * 0.2;
    pos[i * 3 + 1] = rng.normal() * 0.18 * R * 0.1 * (1.2 - r / R);
    pos[i * 3 + 2] = Math.sin(ang) * r + rng.normal() * 0.2;
    c.copy(c2).lerp(c1, Math.min(1, r / R * 1.4));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    if ((i & 4095) === 0 && ctx.shouldYield()) yield;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture(), sizeAttenuation: true }));
  const core = glowSprite('#fff0d0', R * 0.5, 0.9);
  const holder = new THREE.Group();
  holder.position.y = R * 0.6 + 2;
  holder.rotation.x = rng.range(0.2, 0.5);
  holder.add(pts, core);
  const root = new THREE.Group();
  root.add(holder);
  markNoAO(holder);
  animate(root, (t, dt) => { pts.rotation.y += dt * 0.08; });
  return { root, name: 'Spiral galaxy', category: 'cosmic', icon: '🌌', height: R * 0.6 + 2 + R * 0.3, footprint: { radius: 2 }, suppressGrass: false, lights: [{ pos: [0, R * 0.6 + 2, 0], color: '#ffe0c0', intensity: 3, distance: R * 2, nightOnly: false }] };
}

// ---------------- Fireworks ----------------
function* fireworks(ctx, item, rng) {
  const a = item.attrs;
  ctx.stage('geometry', 'Packing gunpowder');
  yield;
  const root = new THREE.Group();
  // Launch tube.
  const tube = meshOf(new THREE.CylinderGeometry(0.15, 0.18, 0.6, 12), G.materials.get('painted', { color: '#b02020' }));
  tube.position.y = 0.3;
  root.add(tube);
  const BURSTS = 5, PER = 400;
  const bursts = [];
  for (let k = 0; k < BURSTS; k++) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(PER * 3), v = new Float32Array(PER * 3);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ size: 0.35, color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture() });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    root.add(pts);
    bursts.push({ pts, g, p, v, age: 99, origin: new THREE.Vector3(), trail: 0 });
  }
  markNoAO(root);
  let timer = 0.5, next = 0;
  const pick = () => (a.primaryColor ? new THREE.Color(a.primaryColor) : new THREE.Color().setHSL(rng.range(0, 1), 0.9, 0.6));
  animate(root, (t, dt) => {
    timer -= dt;
    if (timer <= 0) {
      timer = rng.range(0.6, 1.6);
      const b = bursts[next++ % BURSTS];
      b.age = 0; b.origin.set(rng.range(-8, 8), rng.range(22, 38), rng.range(-8, 8));
      b.pts.material.color.copy(pick());
      const shape = rng.int(0, 2);
      for (let i = 0; i < PER; i++) {
        const u = rng.range(-1, 1), th = rng.range(0, TAU), s = Math.sqrt(1 - u * u);
        const sp = shape === 1 ? 9 : rng.range(4, 10);
        b.v[i * 3] = s * Math.cos(th) * sp; b.v[i * 3 + 1] = (shape === 2 ? Math.abs(u) : u) * sp; b.v[i * 3 + 2] = s * Math.sin(th) * sp;
        b.p[i * 3] = b.origin.x; b.p[i * 3 + 1] = b.origin.y; b.p[i * 3 + 2] = b.origin.z;
      }
      if (G.audio) setTimeout(() => G.audio.play('firework', root.position), 200);
    }
    for (const b of bursts) {
      if (b.age > 3) { b.pts.material.opacity = 0; continue; }
      b.age += dt;
      const drag = Math.exp(-dt * 1.2);
      for (let i = 0; i < PER; i++) {
        b.v[i * 3] *= drag; b.v[i * 3 + 1] = b.v[i * 3 + 1] * drag - 4 * dt; b.v[i * 3 + 2] *= drag;
        b.p[i * 3] += b.v[i * 3] * dt; b.p[i * 3 + 1] += b.v[i * 3 + 1] * dt; b.p[i * 3 + 2] += b.v[i * 3 + 2] * dt;
      }
      b.g.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.age / 2.6) * (0.8 + 0.2 * Math.sin(t * 40));
    }
  });
  return { root, name: 'Fireworks show', category: 'effect', icon: '🎆', height: 1, footprint: { radius: 0.5 }, suppressGrass: false, lights: [{ pos: [0, 28, 0], color: '#ffd0a0', intensity: 2, distance: 40, nightOnly: true, flicker: true }] };
}

// ---------------- Energy / lightning orb ----------------
function* energy(ctx, item, rng) {
  const a = item.attrs;
  const col = mainColor(a, rng, '#8ab8ff');
  const H = targetSize(a, 2.5);
  ctx.stage('geometry', 'Charging capacitors');
  yield;
  const root = new THREE.Group();
  // Tesla coil base.
  const coil = meshOf(new THREE.CylinderGeometry(0.25, 0.4, H, 16), G.materials.get('copper'));
  coil.position.y = H / 2;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), G.materials.get('chrome'));
  orb.position.y = H + 0.3;
  const glow = glowSprite(col, 3, 0.7);
  glow.position.copy(orb.position);
  root.add(coil, orb, glow);
  const NB = 6, SEG = 14;
  const bolts = [];
  for (let k = 0; k < NB; k++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false;
    root.add(line);
    bolts.push(line);
  }
  markNoAO(root);
  let acc = 0;
  animate(root, (t, dt) => {
    acc += dt;
    if (acc < 0.06) return;
    acc = 0;
    for (const bl of bolts) {
      const p = bl.geometry.attributes.position.array;
      const dir = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.8, 0.6), rng.range(-1, 1)).normalize();
      const len = rng.range(1, 2.8);
      for (let i = 0; i <= SEG; i++) {
        const f = i / SEG;
        const j = f > 0 && f < 1 ? 0.25 : 0;
        p[i * 3] = orb.position.x + dir.x * len * f + rng.range(-j, j);
        p[i * 3 + 1] = orb.position.y + dir.y * len * f + rng.range(-j, j);
        p[i * 3 + 2] = orb.position.z + dir.z * len * f + rng.range(-j, j);
      }
      bl.geometry.attributes.position.needsUpdate = true;
      bl.material.opacity = rng.range(0.4, 1);
    }
    glow.material.opacity = rng.range(0.5, 0.9);
  });
  return { root, name: 'Tesla coil', category: 'effect', icon: '⚡', height: H + 1, footprint: { radius: 0.6 }, colliderDefs: [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: H + 0.7, r: 0.45 }], lights: [{ pos: [0, H + 0.3, 0], color: col, intensity: 3, distance: 9, nightOnly: false, flicker: true }] };
}

// ---------------- Cloud ----------------
let cloudTex = null;
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 40, r = 18 + Math.random() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  cloudTex = new THREE.CanvasTexture(cv);
  cloudTex.userData = { shared: true };
  return cloudTex;
}
function* cloud(ctx, item, rng) {
  const a = item.attrs;
  const S = targetSize(a, rng.range(4, 7));
  ctx.stage('geometry', 'Condensing vapour');
  yield;
  const root = new THREE.Group();
  const holder = new THREE.Group();
  const dark = a.words.includes('storm') || a.words.includes('rain') || a.words.includes('dark') || a.words.includes('thunder');
  const col = a.primaryColor || (dark ? '#6a6e78' : '#ffffff');
  for (let i = 0; i < 26; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTexture(), color: col, transparent: true, opacity: dark ? 0.9 : 0.8, depthWrite: false });
    const s = new THREE.Sprite(m);
    const r = S * 0.5;
    s.position.set(rng.normal() * r * 0.6, Math.abs(rng.normal()) * r * 0.3, rng.normal() * r * 0.35);
    s.scale.setScalar(S * rng.range(0.4, 0.8));
    s.userData.noRaycast = true;
    holder.add(s);
  }
  holder.position.y = 8 + S * 0.3;
  root.add(holder);
  markNoAO(holder);
  const data = { root, name: dark ? 'Rain cloud' : 'Fluffy cloud', category: 'sky', icon: '☁️', height: holder.position.y + S * 0.4, footprint: { radius: 1 }, suppressGrass: false };
  if (dark) {
    // Rain streaks falling from the cloud.
    const N = 600;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(N * 6);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#a8b8d0', transparent: true, opacity: 0.45 }));
    lines.frustumCulled = false;
    root.add(lines);
    const drops = [];
    for (let i = 0; i < N; i++) drops.push([rng.normal() * S * 0.3, rng.range(0, holder.position.y), rng.normal() * S * 0.2]);
    animate(root, (t, dt) => {
      for (let i = 0; i < N; i++) {
        const d = drops[i];
        d[1] -= dt * 12;
        if (d[1] < 0) d[1] = holder.position.y;
        p.set([d[0], d[1], d[2], d[0], d[1] + 0.4, d[2]], i * 6);
      }
      g.attributes.position.needsUpdate = true;
    });
  }
  const y0 = holder.position.y;
  animate(root, (t) => { holder.position.y = y0 + Math.sin(t * 0.3) * 0.3; holder.position.x = Math.sin(t * 0.1) * 0.8; });
  return data;
}

// ---------------- Dispatch ----------------
export const abstractGen = {
  maxCount: 12,
  estimate: (item) => ({ sculpture: 5, fractal: 3, galaxy: 3 }[item.params.kind] || 1.5),
  stages: () => [{ name: 'geometry', label: 'Generating geometry', weight: 4 }, { name: 'textures', label: 'Materials', weight: 1 }],
  *build(ctx, item, rng) {
    switch (item.params.kind) {
      case 'cube': case 'sphere': case 'pyramidShape': case 'torus': case 'knot': return yield* primitive(ctx, item, rng);
      case 'fractal': return yield* fractal(ctx, item, rng);
      case 'tesseract': return yield* tesseract(ctx, item, rng);
      case 'blackhole': return yield* blackHole(ctx, item, rng);
      case 'meltingClock': return yield* meltingClock(ctx, item, rng);
      case 'rainbow': return yield* rainbow(ctx, item, rng);
      case 'eye': return yield* giantEye(ctx, item, rng);
      case 'hologram': return yield* hologram(ctx, item, rng);
      case 'galaxy': return yield* galaxy(ctx, item, rng);
      case 'fireworks': return yield* fireworks(ctx, item, rng);
      case 'energy': return yield* energy(ctx, item, rng);
      case 'cloud': return yield* cloud(ctx, item, rng);
      default: return yield* sculpture(ctx, item, rng, item.attrs.unknownNoun || null);
    }
  },
};

// Universal fallback: unknown nouns or generator failures become a sculpted,
// labelled art piece that still honours colour/material/size.
export const FALLBACK = {
  maxCount: 8,
  estimate: () => 4,
  stages: () => [{ name: 'geometry', label: 'Interpreting', weight: 4 }, { name: 'textures', label: 'Materials', weight: 1 }],
  *build(ctx, item, rng, env = {}) {
    const label = item.attrs && item.attrs.unknownNoun ? item.attrs.unknownNoun : (env.error ? item.concept : null);
    try {
      return yield* sculpture(ctx, { ...item, attrs: item.attrs || { colors: [], materials: [], flags: {}, words: [], dims: {} } }, rng, label);
    } catch (err) {
      // Last resort: a simple labelled primitive.
      console.warn('[fallback sculpture failed]', err);
      return yield* primitive(ctx, { ...item, params: { kind: 'sphere' } }, rng);
    }
  },
};
