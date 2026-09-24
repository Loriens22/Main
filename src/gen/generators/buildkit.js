// ---------------------------------------------------------------------------
// Architectural construction kit.
//
// MeshBuilder accumulates geometry per material key and merges it into one
// mesh per material at the end (few draw calls per building). All UVs are
// world-space metres chosen by face orientation, so brick courses and wood
// planks continue seamlessly across wall segments. Every solid piece can
// also emit a collider (walls, floors, stairs, roofs are all walkable/solid).
//
// Higher-level helpers: walls with window/door openings (split into
// segments around the holes, exterior and interior faces get different
// materials), framed windows with mullions and sills, slabs with stair
// openings, straight staircases, railings, and roofs (flat with parapet,
// gable, hip, shed, pyramid/cone, dome).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class MeshBuilder {
  constructor() {
    this.parts = new Map();   // key -> { pos:[], nor:[], uv:[], idx:[] }
    this.extra = new Map();   // key -> [geometries]
    this.colliders = [];
  }

  _part(key) {
    let p = this.parts.get(key);
    if (!p) { p = { pos: [], nor: [], uv: [], idx: [] }; this.parts.set(key, p); }
    return p;
  }

  // Quad with explicit corners (counter-clockwise when seen from the front).
  quad(key, a, b, c, d, uvs) {
    const p = this._part(key);
    const s = p.pos.length / 3;
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    for (const v of [a, b, c, d]) { p.pos.push(v.x, v.y, v.z); p.nor.push(n.x, n.y, n.z); }
    if (uvs) for (const u of uvs) p.uv.push(u[0], u[1]);
    else this._autoUV(p, [a, b, c, d], n);
    p.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }

  tri(key, a, b, c) {
    const p = this._part(key);
    const s = p.pos.length / 3;
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const v of [a, b, c]) { p.pos.push(v.x, v.y, v.z); p.nor.push(n.x, n.y, n.z); }
    this._autoUV(p, [a, b, c], n);
    p.idx.push(s, s + 1, s + 2);
  }

  _autoUV(p, verts, n) {
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (const v of verts) {
      if (ay >= ax && ay >= az) p.uv.push(v.x, v.z);
      else if (ax >= az) p.uv.push(v.z * Math.sign(n.x || 1), v.y);
      else p.uv.push(-v.x * Math.sign(n.z || 1), v.y);
    }
  }

  // Axis-aligned box from min/max. mats: string or {px,nx,py,ny,pz,nz,default}. skip: faces to omit.
  box(mats, min, max, opts = {}) {
    const m = typeof mats === 'string' ? { default: mats } : mats;
    const key = (f) => m[f] || m.default;
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const skip = opts.skip || {};
    if (!skip.pz) this.quad(key('pz'), V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1));
    if (!skip.nz) this.quad(key('nz'), V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0));
    if (!skip.px) this.quad(key('px'), V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1));
    if (!skip.nx) this.quad(key('nx'), V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0));
    if (!skip.py) this.quad(key('py'), V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0));
    if (!skip.ny) this.quad(key('ny'), V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1));
    if (opts.collide) this.collider(min, max, opts.collide === true ? {} : opts.collide);
  }

  collider(min, max, extra = {}) {
    this.colliders.push({ type: 'box', x: (min[0] + max[0]) / 2, z: (min[2] + max[2]) / 2, y0: min[1], y1: max[1], hx: (max[0] - min[0]) / 2, hz: (max[2] - min[2]) / 2, ...extra });
  }
  cylCollider(x, z, y0, y1, r, extra = {}) { this.colliders.push({ type: 'cyl', x, z, y0, y1, r, ...extra }); }

  // Add an arbitrary geometry (with its own UVs) transformed by matrix.
  geometry(key, geo, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    let list = this.extra.get(key);
    if (!list) { list = []; this.extra.set(key, list); }
    list.push(g);
  }

  // Build meshes. materials: key -> THREE.Material
  build(materials, opts = {}) {
    const group = new THREE.Group();
    const keys = new Set([...this.parts.keys(), ...this.extra.keys()]);
    for (const key of keys) {
      const geos = [];
      const p = this.parts.get(key);
      if (p && p.idx.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
        g.setIndex(p.idx);
        geos.push(g.toNonIndexed());
      }
      for (const g of this.extra.get(key) || []) geos.push(g);
      if (!geos.length) continue;
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      for (const g of geos) if (g !== merged) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mat = materials[key] || materials.default;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = key;
      const transparent = mat && mat.transparent;
      mesh.castShadow = !transparent && opts.castShadow !== false;
      mesh.receiveShadow = true;
      if (transparent) mesh.renderOrder = 2;
      group.add(mesh);
    }
    return group;
  }
}

// ---------------- Walls ----------------
// A wall along the X axis (local frame): from x0..x1 at z (centre of thickness), y0..y0+h.
// openings: [{ u0, u1, v0, v1, kind:'window'|'door'|'hole' }] in wall-local coords (u along x from x0, v from y0).
// side: +1 means exterior faces +Z. Returns list of opening frames for windows/doors.
export function wallSegmentsX(b, o) {
  const { x0, x1, z, y0, h, t } = o;
  const side = o.side ?? 1;
  const ext = o.ext, int = o.int || o.ext, edge = o.edge || o.ext;
  const len = x1 - x0;
  const ops = (o.openings || []).filter((q) => q.u1 > 0 && q.u0 < len).map((q) => ({ ...q, u0: Math.max(0.02, q.u0), u1: Math.min(len - 0.02, q.u1) })).sort((a, b) => a.u0 - b.u0);
  const zA = z - t / 2, zB = z + t / 2;
  const mats = side > 0 ? { pz: ext, nz: int, default: edge } : { pz: int, nz: ext, default: edge };
  const collide = o.collide !== false;
  let u = 0;
  const pieces = [];
  for (const q of ops) {
    if (q.u0 > u) pieces.push([u, q.u0, 0, h]);
    if (q.v0 > 0) pieces.push([q.u0, q.u1, 0, q.v0]);
    if (q.v1 < h) pieces.push([q.u0, q.u1, q.v1, h]);
    u = q.u1;
  }
  if (u < len) pieces.push([u, len, 0, h]);
  for (const [a, bb, v0, v1] of pieces) {
    b.box(mats, [x0 + a, y0 + v0, zA], [x0 + bb, y0 + v1, zB], { collide: collide ? (o.colliderExtra || true) : false });
  }
  return ops.map((q) => ({ ...q, x0: x0 + q.u0, x1: x0 + q.u1, y0: y0 + q.v0, y1: y0 + q.v1, z, t, side }));
}

// Same along the Z axis (exterior facing +X when side = +1).
export function wallSegmentsZ(b, o) {
  const { z0, z1, x, y0, h, t } = o;
  const side = o.side ?? 1;
  const ext = o.ext, int = o.int || o.ext, edge = o.edge || o.ext;
  const len = z1 - z0;
  const ops = (o.openings || []).filter((q) => q.u1 > 0 && q.u0 < len).map((q) => ({ ...q, u0: Math.max(0.02, q.u0), u1: Math.min(len - 0.02, q.u1) })).sort((a, b) => a.u0 - b.u0);
  const xA = x - t / 2, xB = x + t / 2;
  const mats = side > 0 ? { px: ext, nx: int, default: edge } : { px: int, nx: ext, default: edge };
  const collide = o.collide !== false;
  let u = 0;
  const pieces = [];
  for (const q of ops) {
    if (q.u0 > u) pieces.push([u, q.u0, 0, h]);
    if (q.v0 > 0) pieces.push([q.u0, q.u1, 0, q.v0]);
    if (q.v1 < h) pieces.push([q.u0, q.u1, q.v1, h]);
    u = q.u1;
  }
  if (u < len) pieces.push([u, len, 0, h]);
  for (const [a, bb, v0, v1] of pieces) {
    b.box(mats, [xA, y0 + v0, z0 + a], [xB, y0 + v1, z0 + bb], { collide: collide ? (o.colliderExtra || true) : false });
  }
  return ops.map((q) => ({ ...q, z0: z0 + q.u0, z1: z0 + q.u1, y0: y0 + q.v0, y1: y0 + q.v1, x, t, side, axis: 'z' }));
}

// Window frame + glass (+ optional mullions and sill) inside an opening returned by wallSegments*.
export function windowFrame(b, w, o = {}) {
  const fw = o.frameW ?? 0.06, fd = o.frameD ?? 0.08;
  const frame = o.frame || 'frame', glass = o.glass || 'glass', sill = o.sill;
  const axisZ = w.axis === 'z';
  const inset = (o.inset ?? 0.35) * w.t * w.side; // glass sits towards the outside
  if (!axisZ) {
    const zc = w.z + inset * 0.5;
    const z0 = zc - fd / 2, z1 = zc + fd / 2;
    b.box(frame, [w.x0, w.y0, z0], [w.x0 + fw, w.y1, z1]);
    b.box(frame, [w.x1 - fw, w.y0, z0], [w.x1, w.y1, z1]);
    b.box(frame, [w.x0 + fw, w.y1 - fw, z0], [w.x1 - fw, w.y1, z1]);
    if (w.kind !== 'door') b.box(frame, [w.x0 + fw, w.y0, z0], [w.x1 - fw, w.y0 + fw, z1]);
    const mullX = o.mullions ?? Math.max(0, Math.round((w.x1 - w.x0) / 1.4) - 1);
    for (let i = 1; i <= mullX; i++) {
      const x = w.x0 + (w.x1 - w.x0) * (i / (mullX + 1));
      b.box(frame, [x - fw * 0.4, w.y0, z0 + fd * 0.2], [x + fw * 0.4, w.y1, z1 - fd * 0.2]);
    }
    if (o.transom && w.y1 - w.y0 > 2.2) { const y = w.y0 + (w.y1 - w.y0) * 0.72; b.box(frame, [w.x0, y - fw * 0.4, z0 + fd * 0.2], [w.x1, y + fw * 0.4, z1 - fd * 0.2]); }
    if (w.kind === 'window') {
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      b.quad(glass, V(w.x0 + fw, w.y0 + fw, zc), V(w.x1 - fw, w.y0 + fw, zc), V(w.x1 - fw, w.y1 - fw, zc), V(w.x0 + fw, w.y1 - fw, zc));
      b.collider([w.x0, w.y0, zc - 0.03], [w.x1, w.y1, zc + 0.03]);
    }
    if (sill && w.kind === 'window') b.box(sill, [w.x0 - 0.05, w.y0 - 0.05, w.z + w.side * w.t * 0.5 - (w.side > 0 ? 0 : 0.12)], [w.x1 + 0.05, w.y0, w.z + w.side * w.t * 0.5 + (w.side > 0 ? 0.12 : 0)]);
  } else {
    const xc = w.x + inset * 0.5;
    const x0 = xc - fd / 2, x1 = xc + fd / 2;
    b.box(frame, [x0, w.y0, w.z0], [x1, w.y1, w.z0 + fw]);
    b.box(frame, [x0, w.y0, w.z1 - fw], [x1, w.y1, w.z1]);
    b.box(frame, [x0, w.y1 - fw, w.z0 + fw], [x1, w.y1, w.z1 - fw]);
    if (w.kind !== 'door') b.box(frame, [x0, w.y0, w.z0 + fw], [x1, w.y0 + fw, w.z1 - fw]);
    const mullZ = o.mullions ?? Math.max(0, Math.round((w.z1 - w.z0) / 1.4) - 1);
    for (let i = 1; i <= mullZ; i++) {
      const z = w.z0 + (w.z1 - w.z0) * (i / (mullZ + 1));
      b.box(frame, [x0 + fd * 0.2, w.y0, z - fw * 0.4], [x1 - fd * 0.2, w.y1, z + fw * 0.4]);
    }
    if (o.transom && w.y1 - w.y0 > 2.2) { const y = w.y0 + (w.y1 - w.y0) * 0.72; b.box(frame, [x0 + fd * 0.2, y - fw * 0.4, w.z0], [x1 - fd * 0.2, y + fw * 0.4, w.z1]); }
    if (w.kind === 'window') {
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      b.quad(glass, V(xc, w.y0 + fw, w.z1 - fw), V(xc, w.y0 + fw, w.z0 + fw), V(xc, w.y1 - fw, w.z0 + fw), V(xc, w.y1 - fw, w.z1 - fw));
      b.collider([xc - 0.03, w.y0, w.z0], [xc + 0.03, w.y1, w.z1]);
    }
    if (sill && w.kind === 'window') b.box(sill, [w.x + w.side * w.t * 0.5 - (w.side > 0 ? 0 : 0.12), w.y0 - 0.05, w.z0 - 0.05], [w.x + w.side * w.t * 0.5 + (w.side > 0 ? 0.12 : 0), w.y0, w.z1 + 0.05]);
  }
}

// Horizontal slab with optional rectangular holes (stairwells). holes: [[x0,z0,x1,z1]]
export function slab(b, x0, z0, x1, z1, y0, th, mats, holes = [], collide = true) {
  // Decompose the rectangle minus holes into strips along X.
  const xs = new Set([x0, x1]);
  for (const hl of holes) { xs.add(Math.max(x0, Math.min(x1, hl[0]))); xs.add(Math.max(x0, Math.min(x1, hl[2]))); }
  const xa = [...xs].sort((a, b) => a - b);
  for (let i = 0; i < xa.length - 1; i++) {
    const ax = xa[i], bx = xa[i + 1];
    if (bx - ax < 1e-3) continue;
    const mid = (ax + bx) / 2;
    const cuts = holes.filter((hl) => mid > hl[0] && mid < hl[2]).map((hl) => [hl[1], hl[3]]).sort((a, b) => a[0] - b[0]);
    let z = z0;
    for (const [c0, c1] of cuts) {
      if (c0 > z) b.box(mats, [ax, y0, z], [bx, y0 + th, c0], { collide });
      z = Math.max(z, c1);
    }
    if (z < z1) b.box(mats, [ax, y0, z], [bx, y0 + th, z1], { collide });
  }
}

// Straight stair along +Z starting at (x0..x1, z0) rising `rise` over `run`.
export function stairs(b, x0, x1, z0, y0, rise, run, mats, opts = {}) {
  const n = Math.max(3, Math.round(rise / 0.18));
  const sh = rise / n, sd = run / n;
  for (let i = 0; i < n; i++) {
    const zA = z0 + i * sd, zB = zA + sd;
    const yT = y0 + (i + 1) * sh;
    b.box(mats, [x0, opts.solid ? y0 : yT - sh - 0.04, zA], [x1, yT, zB], { collide: true });
  }
  if (opts.rail) railing(b, [[x1, z0], [x1, z0 + run]], y0, rise, opts.railMat || mats.default || mats, { sloped: true, run });
  return n;
}

// Railing along a polyline: posts + top rail (+ glass panels when glassMat given).
export function railing(b, pts, y0, h = 1.0, mat = 'frame', opts = {}) {
  const hh = opts.height ?? 1.0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const yb = opts.sloped ? y0 + h * ((z - pts[0][1]) / (opts.run || 1)) : y0;
      b.box(mat, [x - 0.025, yb, z - 0.025], [x + 0.025, yb + hh, z + 0.025]);
    }
    const ya = opts.sloped ? y0 + h * ((az - pts[0][1]) / (opts.run || 1)) : y0;
    const yb2 = opts.sloped ? y0 + h * ((bz - pts[0][1]) / (opts.run || 1)) : y0;
    const dir = new THREE.Vector3(bx - ax, yb2 - ya, bz - az);
    const mid = new THREE.Vector3((ax + bx) / 2, (ya + yb2) / 2 + hh, (az + bz) / 2);
    const geo = new THREE.BoxGeometry(0.05, 0.05, dir.length());
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)).setPosition(mid);
    b.geometry(mat, geo, m);
    if (opts.glass && !opts.sloped) {
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      b.quad(opts.glass, V(ax, y0 + 0.05, az), V(bx, y0 + 0.05, bz), V(bx, y0 + hh - 0.03, bz), V(ax, y0 + hh - 0.03, az));
      b.quad(opts.glass, V(bx, y0 + 0.05, bz), V(ax, y0 + 0.05, az), V(ax, y0 + hh - 0.03, az), V(bx, y0 + hh - 0.03, bz));
    }
    if (!opts.sloped) {
      const minx = Math.min(ax, bx) - 0.05, maxx = Math.max(ax, bx) + 0.05, minz = Math.min(az, bz) - 0.05, maxz = Math.max(az, bz) + 0.05;
      b.collider([minx, y0, minz], [maxx, y0 + hh, maxz], { walkable: false });
    }
  }
}

// ---------------- Roofs ----------------
// Gable roof over rectangle x0..x1, z0..z1 at eave height y, ridge along X (or Z when alongZ).
export function gableRoof(b, x0, z0, x1, z1, y, pitch, mats, o = {}) {
  const V = (x, yy, z) => new THREE.Vector3(x, yy, z);
  const ov = o.overhang ?? 0.45;
  const roof = mats.roof, gable = mats.gable || mats.wall, fascia = mats.fascia || mats.trim || roof;
  const th = o.thickness ?? 0.18;
  if (!o.alongZ) {
    const zc = (z0 + z1) / 2, halfD = (z1 - z0) / 2;
    const ridgeH = halfD * Math.tan(pitch);
    const X0 = x0 - ov, X1 = x1 + ov, Z0 = z0 - ov, Z1 = z1 + ov;
    const yE = y - ov * Math.tan(pitch);
    const yR = y + ridgeH;
    // Slopes (top surfaces) + undersides.
    b.quad(roof, V(X0, yE, Z1), V(X1, yE, Z1), V(X1, yR, zc), V(X0, yR, zc), slopeUV(X0, X1, Z1, zc, yE, yR));
    b.quad(roof, V(X1, yE, Z0), V(X0, yE, Z0), V(X0, yR, zc), V(X1, yR, zc), slopeUV(X1, X0, Z0, zc, yE, yR));
    b.quad(fascia, V(X1, yE - th, Z1), V(X0, yE - th, Z1), V(X0, yR - th, zc), V(X1, yR - th, zc));
    b.quad(fascia, V(X0, yE - th, Z0), V(X1, yE - th, Z0), V(X1, yR - th, zc), V(X0, yR - th, zc));
    // Fascia boards.
    b.quad(fascia, V(X0, yE - th, Z1), V(X1, yE - th, Z1), V(X1, yE, Z1), V(X0, yE, Z1));
    b.quad(fascia, V(X1, yE - th, Z0), V(X0, yE - th, Z0), V(X0, yE, Z0), V(X1, yE, Z0));
    // Gable triangles (walls).
    b.tri(gable, V(x1, y, z1), V(x1, y, z0), V(x1, y + ridgeH, zc));
    b.tri(gable, V(x0, y, z0), V(x0, y, z1), V(x0, y + ridgeH, zc));
    // Barge boards along the gable edges.
    for (const X of [X0, X1]) {
      const s = X === X1 ? 1 : -1;
      b.quad(fascia, V(X, yE - th, s > 0 ? Z0 : Z1), V(X, yE - th, s > 0 ? Z1 : Z0), V(X, yE, s > 0 ? Z1 : Z0), V(X, yE, s > 0 ? Z0 : Z1));
      b.tri(fascia, V(X, yE - th, s > 0 ? Z1 : Z0), V(X, yR - th, zc), V(X, yR, zc));
    }
    if (o.ridgeCap) b.box(o.ridgeCap, [X0, yR - 0.05, zc - 0.12], [X1, yR + 0.1, zc + 0.12]);
    // Walkable roof collision (stepped approximation).
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const f0 = i / steps, f1 = (i + 1) / steps;
      const yy = y + ridgeH * f1;
      b.collider([x0, y, zc + (1 - f1) * halfD * -1], [x1, yy, zc + (1 - f1) * halfD], { walkable: true });
      void f0;
    }
    return { ridgeH };
  }
  // Ridge along Z: swap axes by building in rotated space.
  const xc = (x0 + x1) / 2, halfW = (x1 - x0) / 2;
  const ridgeH = halfW * Math.tan(pitch);
  const X0 = x0 - ov, X1 = x1 + ov, Z0 = z0 - ov, Z1 = z1 + ov;
  const yE = y - ov * Math.tan(pitch), yR = y + ridgeH;
  b.quad(roof, V(X1, yE, Z1), V(X1, yE, Z0), V(xc, yR, Z0), V(xc, yR, Z1), slopeUV(Z1, Z0, X1, xc, yE, yR));
  b.quad(roof, V(X0, yE, Z0), V(X0, yE, Z1), V(xc, yR, Z1), V(xc, yR, Z0), slopeUV(Z0, Z1, X0, xc, yE, yR));
  b.quad(fascia, V(X1, yE - th, Z0), V(X1, yE - th, Z1), V(xc, yR - th, Z1), V(xc, yR - th, Z0));
  b.quad(fascia, V(X0, yE - th, Z1), V(X0, yE - th, Z0), V(xc, yR - th, Z0), V(xc, yR - th, Z1));
  b.quad(fascia, V(X1, yE - th, Z0), V(X1, yE - th, Z1), V(X1, yE, Z1), V(X1, yE, Z0));
  b.quad(fascia, V(X0, yE - th, Z1), V(X0, yE - th, Z0), V(X0, yE, Z0), V(X0, yE, Z1));
  b.tri(gable, V(x0, y, z1), V(x1, y, z1), V(xc, y + ridgeH, z1));
  b.tri(gable, V(x1, y, z0), V(x0, y, z0), V(xc, y + ridgeH, z0));
  if (o.ridgeCap) b.box(o.ridgeCap, [xc - 0.12, yR - 0.05, Z0], [xc + 0.12, yR + 0.1, Z1]);
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const f1 = (i + 1) / steps;
    b.collider([xc - (1 - f1) * halfW, y, z0], [xc + (1 - f1) * halfW, y + ridgeH * f1, z1], { walkable: true });
  }
  return { ridgeH };
}

function slopeUV(xa, xb, zEave, zRidge, yE, yR) {
  const L = Math.hypot(zRidge - zEave, yR - yE);
  return [[xa, 0], [xb, 0], [xb, L], [xa, L]];
}

// Hip roof (4 slopes) - pyramid when square.
export function hipRoof(b, x0, z0, x1, z1, y, pitch, mats, o = {}) {
  const V = (x, yy, z) => new THREE.Vector3(x, yy, z);
  const ov = o.overhang ?? 0.45;
  const X0 = x0 - ov, X1 = x1 + ov, Z0 = z0 - ov, Z1 = z1 + ov;
  const w = X1 - X0, d = Z1 - Z0;
  const h = Math.min(w, d) / 2 * Math.tan(pitch);
  const yE = y - ov * Math.tan(pitch) * 0.5;
  const inset = Math.min(w, d) / 2;
  const rA = w >= d ? V(X0 + inset, yE + h, (Z0 + Z1) / 2) : V((X0 + X1) / 2, yE + h, Z0 + inset);
  const rB = w >= d ? V(X1 - inset, yE + h, (Z0 + Z1) / 2) : V((X0 + X1) / 2, yE + h, Z1 - inset);
  const roof = mats.roof;
  const c00 = V(X0, yE, Z0), c10 = V(X1, yE, Z0), c11 = V(X1, yE, Z1), c01 = V(X0, yE, Z1);
  if (w >= d) {
    b.quad(roof, c01, c11, rB, rA);
    b.quad(roof, c10, c00, rA, rB);
    b.tri(roof, c11, c10, rB);
    b.tri(roof, c00, c01, rA);
  } else {
    b.quad(roof, c11, c10, rA, rB);
    b.quad(roof, c00, c01, rB, rA);
    b.tri(roof, c01, c11, rB);
    b.tri(roof, c10, c00, rA);
  }
  // Soffit.
  b.quad(mats.fascia || roof, V(X0, yE - 0.02, Z1), V(X0, yE - 0.02, Z0), V(X1, yE - 0.02, Z0), V(X1, yE - 0.02, Z1));
  // Stepped-pyramid collision so the roof is walkable.
  const steps = 5;
  const inX = Math.min(x1 - x0, z1 - z0) / 2;
  for (let i = 0; i < steps; i++) {
    const f = (i + 1) / steps;
    const s = f * inX * 0.95;
    b.collider([x0 + s * 0.999, y, z0 + s * 0.999], [x1 - s * 0.999, y + h * f * 0.95, z1 - s * 0.999], { walkable: true });
  }
  return { ridgeH: h };
}

// Flat roof slab with parapet and coping.
export function flatRoof(b, x0, z0, x1, z1, y, mats, o = {}) {
  const par = o.parapet ?? 0.5, t = o.parapetT ?? 0.2;
  b.box({ py: mats.roof, default: mats.wall }, [x0, y, z0], [x1, y + 0.25, z1], { collide: true });
  if (par > 0) {
    const yy = y + 0.25;
    b.box(mats.wall, [x0, yy, z0], [x1, yy + par, z0 + t], { collide: true });
    b.box(mats.wall, [x0, yy, z1 - t], [x1, yy + par, z1], { collide: true });
    b.box(mats.wall, [x0, yy, z0 + t], [x0 + t, yy + par, z1 - t], { collide: true });
    b.box(mats.wall, [x1 - t, yy, z0 + t], [x1, yy + par, z1 - t], { collide: true });
    const c = mats.coping || mats.trim || mats.wall;
    b.box(c, [x0 - 0.03, yy + par, z0 - 0.03], [x1 + 0.03, yy + par + 0.05, z0 + t + 0.03]);
    b.box(c, [x0 - 0.03, yy + par, z1 - t - 0.03], [x1 + 0.03, yy + par + 0.05, z1 + 0.03]);
    b.box(c, [x0 - 0.03, yy + par, z0 + t], [x0 + t + 0.03, yy + par + 0.05, z1 - t]);
    b.box(c, [x1 - t - 0.03, yy + par, z0 + t], [x1 + 0.03, yy + par + 0.05, z1 - t]);
  }
  return { top: y + 0.25 };
}

// Lathe-based round tower roof (cone) or dome.
export function coneRoof(b, cx, cz, y, r, h, mat, segs = 24, dome = false) {
  const pts = [];
  if (dome) for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * h)); }
  else { pts.push(new THREE.Vector2(r * 1.12, -0.05)); pts.push(new THREE.Vector2(r * 1.12, 0.05)); pts.push(new THREE.Vector2(0.001, h)); }
  const g = new THREE.LatheGeometry(pts, segs);
  // UVs in metres around.
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * Math.hypot(r, h));
  b.geometry(mat, g, new THREE.Matrix4().makeTranslation(cx, y, cz));
}

// Cylinder wall (round towers, silos, lighthouses). Openings not supported; add windows as dark insets.
export function roundWall(b, cx, cz, y0, h, r, mat, segs = 28, open = false) {
  const g = new THREE.CylinderGeometry(r, r, h, segs, 1, open);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * h);
  b.geometry(mat, g, new THREE.Matrix4().makeTranslation(cx, y0 + h / 2, cz));
  b.cylCollider(cx, cz, y0, y0 + h, r);
}
