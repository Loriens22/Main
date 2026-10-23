// Shared geometry helpers for the procedural bus model (exterior in
// BusModel.js, interior and cab in BusInterior.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BUS, FRONT_Z } from './BusSpec.js';

export const HW = BUS.halfW;
export const ARCH_R = 0.6; // wheel arch radius (spec 4.6)
export const S_REAR_ORIGIN = BUS.frontOverhang + BUS.wb1 + BUS.wb2; // distance front bumper -> axle 3 (14.575)
export const sToFrontZ = (s) => FRONT_Z + s;
export const sToRearZ = (s) => s - S_REAR_ORIGIN;

/** Collects geometry per material and merges it. */
class Parts {
  constructor() {
    this.map = new Map();
  }

  add(key, geo, m = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    let a = this.map.get(key);
    if (!a) this.map.set(key, (a = []));
    a.push(g);
    return g;
  }

  build(mats, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [k, list] of this.map) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[k]);
      mesh.name = k;
      mesh.castShadow = castShadow && !(mats[k] && mats[k].transparent);
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    return group;
  }
}

const M = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);
const basis = (e1, e2, e3, t) => new THREE.Matrix4().makeBasis(new THREE.Vector3(...e1), new THREE.Vector3(...e2), new THREE.Vector3(...e3)).setPosition(...t);

function box(w, h, d, r = 0) {
  return r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
}

/** Box without some faces (order: +x, -x, +y, -y, +z, -z). */
function openBox(w, h, d, drop) {
  const g = new THREE.BoxGeometry(w, h, d);
  const idx = Array.from(g.index.array);
  const keep = [];
  for (let f = 0; f < 6; f++) if (!drop.includes(f)) keep.push(...idx.slice(f * 6, f * 6 + 6));
  g.setIndex(keep);
  return g;
}

function cyl(r, h, seg = 12, r2 = r) {
  return new THREE.CylinderGeometry(r2, r, h, seg);
}

/** Tube through points [[x,y,z],...]. */
function tube(points, r, seg = 24, rad = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, seg, r, rad, false);
}

function extrude(shape, depth, bevel = 0) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10,
  });
}

function rectShape(x0, y0, x1, y1, r = 0) {
  const s = new THREE.Shape();
  if (r <= 0) {
    s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
    return s;
  }
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function rectPath(x0, y0, x1, y1, r = 0) {
  const p = new THREE.Path();
  if (r <= 0) {
    p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.closePath();
    return p;
  }
  p.moveTo(x0 + r, y0);
  p.quadraticCurveTo(x0, y0, x0, y0 + r); p.lineTo(x0, y1 - r);
  p.quadraticCurveTo(x0, y1, x0 + r, y1); p.lineTo(x1 - r, y1);
  p.quadraticCurveTo(x1, y1, x1, y1 - r); p.lineTo(x1, y0 + r);
  p.quadraticCurveTo(x1, y0, x1 - r, y0); p.closePath();
  return p;
}

/** Side skirt between s0..s1 (distance from bus front) with semicircular wheel-arch cut-outs. */
function skirtShape(s0, s1, arches, y0 = BUS.skirtY, y1 = BUS.beltY) {
  const sh = new THREE.Shape();
  const R = ARCH_R, cy = BUS.wheelR;
  const dy = cy - y0, dx = Math.sqrt(R * R - dy * dy), ang = Math.asin(dy / R);
  sh.moveTo(s0, y0);
  for (const a of [...arches].sort((p, q) => p - q)) {
    if (a - dx < s0 || a + dx > s1) continue;
    sh.lineTo(a - dx, y0);
    sh.absarc(a, cy, R, Math.PI + ang, -ang, true);
    sh.lineTo(a + dx, y0);
  }
  sh.lineTo(s1, y0);
  sh.lineTo(s1, y1);
  sh.lineTo(s0, y1);
  sh.closePath();
  return sh;
}

/** Plan-view outline of a rounded bus end (front or rear) as a list of [x, dz] (dz >= 0 into the body). */
function endOutline(r = 0.24, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 - (i / n) * (Math.PI / 2);
    pts.push([-HW + r - Math.cos(a) * r, r - Math.sin(a) * r]);
  }
  for (let i = n; i >= 0; i--) {
    const a = Math.PI / 2 - (i / n) * (Math.PI / 2);
    pts.push([HW - r + Math.cos(a) * r, r - Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Vertical strip following a plan outline (points [x, dz], dz measured into the
 * body from the end plane zBase). dir = -1 for the front end (body extends to +z),
 * +1 for the rear end. rake leans the top edge into the body.
 */
function outlineStrip(outline, zBase, dir, y0, y1, rake = 0) {
  const pos = [], nrm = [], uv = [], idx = [];
  const n = outline.length;
  const cz = zBase - dir * 1.5;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const [x, dz] = outline[i];
    const z = zBase - dir * dz;
    if (i > 0) u += Math.hypot(x - outline[i - 1][0], dz - outline[i - 1][1]);
    const pa = outline[Math.max(0, i - 1)], pb = outline[Math.min(n - 1, i + 1)];
    const tx = pb[0] - pa[0], tz = -dir * (pb[1] - pa[1]);
    const tl = Math.hypot(tx, tz) || 1;
    let nx = -tz / tl, nz = tx / tl;
    if (nx * x + nz * (z - cz) < 0) { nx = -nx; nz = -nz; }
    pos.push(x, y0, z, x, y1, z - dir * rake);
    nrm.push(nx, 0, nz, nx, 0, nz);
    uv.push(u, 0, u, 1);
  }
  // winding: check the first quad against the intended outward normal
  const p0 = new THREE.Vector3(pos[0], pos[1], pos[2]), p1 = new THREE.Vector3(pos[6], pos[7], pos[8]), p2 = new THREE.Vector3(pos[3], pos[4], pos[5]);
  const fn = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  const flip = fn.x * nrm[0] + fn.z * nrm[2] < 0;
  for (let i = 0; i < n - 1; i++) {
    const a = 2 * i, b = 2 * i + 1, c = 2 * i + 2, d = 2 * i + 3;
    if (!flip) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Horizontal cap at height y following an end outline and extending `depth` into the body. */
function outlineCap(outline, zBase, dir, y, up = true, depth = 0.6) {
  const pts = outline.map(([x, dz]) => new THREE.Vector2(x, zBase - dir * dz));
  pts.push(new THREE.Vector2(HW, zBase - dir * depth), new THREE.Vector2(-HW, zBase - dir * depth));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const pos = [], nrm = [], uv = [];
  for (const t of tris) {
    let [a, b, c] = t.map((k) => pts[k]);
    // orient so the face normal points up (or down)
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); // (x,z) plane
    const facesUp = cross < 0; // in x-east/z-south, clockwise on the map faces +y
    if (facesUp !== up) [b, c] = [c, b];
    for (const v of [a, b, c]) {
      pos.push(v.x, y, v.y);
      nrm.push(0, up ? 1 : -1, 0);
      uv.push(v.x, v.y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function clean(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}

function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}


/* ------------------------------------------------------------------ numeric helpers */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Monotone cubic (Fritsch-Carlson) interpolation through (xs, ys): returns f(x), clamped outside. */
function pchip(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

/**
 * Parametric grid surface: fn(u, v) -> [x, y, z] for u, v in 0..1. Triangles are wound so that
 * the normal is e_u x e_v (reversed with flip). uvRect = [u0, v0, u1, v1] remaps the texture coordinates.
 */
function surfaceGrid(nu, nv, fn, { flip = false, uvRect = [0, 0, 1, 1] } = {}) {
  const n = (nu + 1) * (nv + 1);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let k = 0;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const p = fn(i / nu, j / nv);
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      uv[k * 2] = lerp(uvRect[0], uvRect[2], i / nu);
      uv[k * 2 + 1] = lerp(uvRect[1], uvRect[3], j / nv);
      k++;
    }
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (!flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flips triangle winding (and normals) of an indexed geometry whose faces point towards (cx, cy, cz). */
function orientOutward(g, cx, cy, cz) {
  const p = g.attributes.position, idx = g.index.array;
  let score = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a);
    const e1x = p.getX(b) - ax, e1y = p.getY(b) - ay, e1z = p.getZ(b) - az;
    const e2x = p.getX(c) - ax, e2y = p.getY(c) - ay, e2z = p.getZ(c) - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    score += nx * (ax - cx) + ny * (ay - cy) + nz * (az - cz);
  }
  if (score < 0) {
    for (let t = 0; t < idx.length; t += 3) { const b = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = b; }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Loft through closed rings of 3D points (all rings with the same count). Returns [body, ...caps]
 * (each a separate geometry so the caps keep flat normals); faces are oriented outwards automatically.
 */
function loftRings(rings, { capStart = true, capEnd = true } = {}) {
  const M = rings[0].length, K = rings.length;
  const pos = [];
  for (const r of rings) for (const q of r) pos.push(q[0], q[1], q[2]);
  const idx = [];
  for (let k = 0; k < K - 1; k++) {
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      const a = k * M + j, b = k * M + j1, c = (k + 1) * M + j, d = (k + 1) * M + j1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx);
  let cx = 0, cy = 0, cz = 0;
  for (const r of rings) for (const q of r) { cx += q[0]; cy += q[1]; cz += q[2]; }
  const cnt = K * M;
  cx /= cnt; cy /= cnt; cz /= cnt;
  orientOutward(body, cx, cy, cz);
  const out = [body];
  for (const [on, ring] of [[capStart, rings[0]], [capEnd, rings[K - 1]]]) {
    if (!on) continue;
    const p = [], ii = [];
    let mx = 0, my = 0, mz = 0;
    for (const q of ring) { p.push(q[0], q[1], q[2]); mx += q[0]; my += q[1]; mz += q[2]; }
    p.push(mx / M, my / M, mz / M);
    for (let j = 0; j < M; j++) ii.push(j, (j + 1) % M, M);
    const cap = new THREE.BufferGeometry();
    cap.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    cap.setIndex(ii);
    orientOutward(cap, cx, cy, cz);
    out.push(cap);
  }
  return out;
}

/** Tube with an elliptical, varying section along a smooth path. secFn(t) -> [halfWidth, halfHeight]. */
function sweep(points, secFn, segs = 24, rad = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const fr = curve.computeFrenetFrames(segs, false);
  const rings = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const [a, b] = secFn(t);
    const ring = [];
    for (let j = 0; j < rad; j++) {
      const ang = (j / rad) * Math.PI * 2;
      const ca = Math.cos(ang) * a, sb = Math.sin(ang) * b;
      ring.push([P.x + fr.normals[i].x * ca + fr.binormals[i].x * sb, P.y + fr.normals[i].y * ca + fr.binormals[i].y * sb, P.z + fr.normals[i].z * ca + fr.binormals[i].z * sb]);
    }
    rings.push(ring);
  }
  return loftRings(rings);
}

/** Super-ellipsoid (rx, ry, rz) with exponents e1 (vertical) and e2 (horizontal); smaller = squarer. */
function superEllipsoid(rx, ry, rz, e1 = 0.6, e2 = 0.6, nu = 20, nv = 12) {
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const g = surfaceGrid(nu, nv, (u, v) => {
    const th = -Math.PI / 2 + Math.PI * v, ph = -Math.PI + 2 * Math.PI * u;
    return [rx * sp(Math.cos(th), e1) * sp(Math.cos(ph), e2), ry * sp(Math.sin(th), e1), rz * sp(Math.cos(th), e1) * sp(Math.sin(ph), e2)];
  });
  return orientOutward(g, 0, 0, 0);
}

/** Axis-aligned box rotated about z by `tilt` (tumblehome), centre (x, y, z). */
function tiltBox(w, h, d, x, y, z, tilt = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateZ(tilt);
  g.translate(x, y, z);
  return g;
}

export { clamp, lerp, sstep, pchip, surfaceGrid, orientOutward, loftRings, sweep, superEllipsoid, tiltBox };
export { M, Parts, basis, box, clean, cyl, endOutline, extrude, openBox, outlineCap, outlineStrip, rectPath, rectShape, scaleUV, skirtShape, tube };
