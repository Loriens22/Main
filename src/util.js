import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const DEG = Math.PI / 180;
export function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const R = makeRng(1650);
export const rr = (a, b) => a + (b - a) * R();
export const ri = (a, b) => Math.floor(rr(a, b + 1));
export const pick = (arr) => arr[Math.floor(R() * arr.length) % arr.length];
export const chance = (p) => R() < p;

/* ---------------- value noise ---------------- */
function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
/** Tileable value noise with integer period p. */
export function tnoise(x, y, p, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (n) => ((n % p) + p) % p;
  const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed);
  const c = hash2(m(xi), m(yi + 1), seed), d = hash2(m(xi + 1), m(yi + 1), seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
/** Tileable fbm over [0,1)^2 with base period p. */
export function tfbm(u, v, p, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * tnoise(u * p * f, v * p * f, p * f, seed + i * 31); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

/* ---------------- geometry helpers ---------------- */
const KEEP = new Set(['position', 'normal', 'uv', 'color']);
const _c = new THREE.Color();

/** Returns a non-indexed geometry with position/normal/uv/color only (safe for merging). */
export function prepGeo(g, color) {
  let geo = g.index ? g.toNonIndexed() : g.clone();
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (!KEEP.has(k)) geo.deleteAttribute(k);
  if (!geo.attributes.color || color !== undefined) {
    const arr = new Float32Array(n * 3);
    _c.set(color === undefined ? 0xffffff : color);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  }
  geo.morphAttributes = {};
  geo.groups = [];
  return geo;
}

/** Reverses triangle winding of a non-indexed geometry (needed after mirroring transforms). */
export function flipWinding(geo) {
  for (const key of Object.keys(geo.attributes)) {
    const attr = geo.attributes[key]; const s = attr.itemSize; const a = attr.array;
    for (let t = 0; t < attr.count; t += 3) {
      for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k; const tmp = a[i1]; a[i1] = a[i2]; a[i2] = tmp; }
    }
    attr.needsUpdate = true;
  }
  return geo;
}

export function xform(geo, m) {
  geo.applyMatrix4(m);
  if (m.determinant() < 0) flipWinding(geo);
  return geo;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
/** Build a matrix from position, euler rotation (radians, YXZ order default) and scale. */
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, order = 'YXZ') {
  _e.set(rx, ry, rz, order); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_v, _q, _s);
}

/** Collects geometry per material and merges it into as few meshes as possible. */
export class Batch {
  constructor() { this.map = new Map(); }
  add(material, geo, matrix, color) {
    const g = prepGeo(geo, color);
    if (matrix) xform(g, matrix);
    let list = this.map.get(material);
    if (!list) { list = []; this.map.set(material, list); }
    list.push(g);
    return this;
  }
  /** Adds a pre-transformed prepared geometry (no clone). */
  addRaw(material, g) {
    let list = this.map.get(material);
    if (!list) { list = []; this.map.set(material, list); }
    list.push(g);
  }
  build(parent, { cast = true, receive = true, name = '' } = {}) {
    const meshes = [];
    for (const [material, list] of this.map) {
      if (!list.length) continue;
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) { console.warn('merge failed', name, material.name); continue; }
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, material);
      const ud = material.userData || {};
      mesh.castShadow = ud.cast !== undefined ? ud.cast : cast;
      mesh.receiveShadow = ud.receive !== undefined ? ud.receive : receive;
      mesh.name = name + ':' + (material.name || '');
      if (material.transparent) mesh.renderOrder = ud.renderOrder || 1;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.map.clear();
    return meshes;
  }
}

/** Planar UV projection. axis: 'xy' | 'zy' | 'xz'; scale in meters per texture repeat. */
export function planarUV(geo, axis = 'xz', su = 1, sv = 1, ou = 0, ov = 0) {
  const p = geo.attributes.position; const n = p.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (axis === 'xy') { u = x; v = y; } else if (axis === 'zy') { u = z; v = y; } else if (axis === '-zy') { u = -z; v = y; } else { u = x; v = z; }
    uv[i * 2] = u / su + ou; uv[i * 2 + 1] = v / sv + ov;
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/** Box-projected UV (world-scale), good for buildings & props. */
export function boxUV(geo, scale = 1) {
  const p = geo.attributes.position, nrm = geo.attributes.normal; const n = p.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/** Rounded box built from an extruded rounded rectangle (x-y profile, depth along z). */
export function roundedBox(w, h, d, r = 0.05, seg = 3) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const shape = roundRectShape(w - 2 * r, h - 2 * r, 0.001);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: 2 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}

export function roundRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Tube along a list of points with rounded corners (for handrails, poles, frames). */
export function tubePath(points, radius = 0.02, bend = 0.08, radial = 8, closed = false) {
  const pts = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  const path = new THREE.CurvePath();
  if (pts.length === 2) {
    path.add(new THREE.LineCurve3(pts[0], pts[1]));
  } else {
    let prev = pts[0].clone();
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const d1 = b.clone().sub(a), d2 = c.clone().sub(b);
      const r1 = Math.min(bend, d1.length() * 0.45), r2 = Math.min(bend, d2.length() * 0.45);
      const p1 = b.clone().sub(d1.normalize().multiplyScalar(r1));
      const p2 = b.clone().add(d2.normalize().multiplyScalar(r2));
      if (prev.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(prev, p1));
      path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
      prev = p2;
    }
    path.add(new THREE.LineCurve3(prev, pts[pts.length - 1]));
  }
  const len = path.getLength();
  const segs = Math.max(2, Math.ceil(len / 0.05) + pts.length * 6);
  return new THREE.TubeGeometry(path, Math.min(segs, 400), radius, radial, closed);
}

export function nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }

/** Oriented box overlap in XZ plane (separating axis). Boxes: {x,z,hw,hd,h (heading angle)} */
export function obbOverlap(a, b) {
  const axes = [
    [Math.cos(a.h), Math.sin(a.h)], [-Math.sin(a.h), Math.cos(a.h)],
    [Math.cos(b.h), Math.sin(b.h)], [-Math.sin(b.h), Math.cos(b.h)],
  ];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const ra = a.hd * Math.abs(Math.cos(a.h) * ax + Math.sin(a.h) * az) + a.hw * Math.abs(-Math.sin(a.h) * ax + Math.cos(a.h) * az);
    const rb = b.hd * Math.abs(Math.cos(b.h) * ax + Math.sin(b.h) * az) + b.hw * Math.abs(-Math.sin(b.h) * ax + Math.cos(b.h) * az);
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}
