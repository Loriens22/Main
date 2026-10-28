// Geometry toolkit for hand-built landmarks and stop hardware: a MeshBuilder that
// merges everything per material key (flat-shaded quads/prisms/roofs with UVs in
// metres, plus any THREE geometry), polygon helpers and canvas texture factories.
// Conventions: game metres, x east, z south, y up. A polygon is a flat [x, z, ...]
// array; walls are emitted with outward normals for either winding.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ polygons
export function signedArea(p) {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  return a / 2;
}

export function orient(p) {
  if (signedArea(p) >= 0) return Array.from(p);
  const out = [];
  for (let i = p.length / 2 - 1; i >= 0; i--) out.push(p[2 * i], p[2 * i + 1]);
  return out;
}

export function centroid(p) {
  let x = 0, z = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) { x += p[2 * i]; z += p[2 * i + 1]; }
  return [x / n, z / n];
}

export function bbox(p) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
    z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]);
  }
  return { x0, z0, x1, z1, w: x1 - x0, d: z1 - z0 };
}

/** Convex hull (monotone chain) of a flat polygon. */
export function hull(p) {
  const pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = [];
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return orient(lo.concat(up).flat());
}

/** Minimum-area oriented rectangle of a polygon: {cx, cz, ux, uz (long axis), w (along u), d, vx, vz}. */
export function obb(p) {
  const h = hull(p);
  const n = h.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = h[2 * j] - h[2 * i], ez = h[2 * j + 1] - h[2 * i + 1], L = Math.hypot(ex, ez) || 1;
    const ux = ex / L, uz = ez / L, vx = -uz, vz = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const a = h[2 * k] * ux + h[2 * k + 1] * uz, c = h[2 * k] * vx + h[2 * k + 1] * vz;
      u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, c); v1 = Math.max(v1, c);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uz, vx, vz, u0, u1, v0, v1 };
  }
  let { ux, uz, vx, vz } = best;
  let w = best.u1 - best.u0, d = best.v1 - best.v0;
  let cu = (best.u0 + best.u1) / 2, cv = (best.v0 + best.v1) / 2;
  if (d > w) { [ux, uz, vx, vz] = [vx, vz, -ux, -uz]; [w, d] = [d, w]; [cu, cv] = [cv, -cu]; }
  return { cx: ux * cu + vx * cv, cz: uz * cu + vz * cv, ux, uz, vx, vz, w, d };
}

/** Scale a polygon about (cx, cz). */
export function scalePoly(p, cx, cz, k) {
  const out = [];
  for (let i = 0; i < p.length; i += 2) out.push(cx + (p[i] - cx) * k, cz + (p[i + 1] - cz) * k);
  return out;
}

/** Inset (d > 0) or outset (d < 0) a convex polygon by moving every edge. */
export function offsetConvex(p, d) {
  p = orient(p);
  const n = p.length / 2;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = p[2 * j] - p[2 * i], dz = p[2 * j + 1] - p[2 * i + 1], L = Math.hypot(dx, dz) || 1;
    // outward normal for positive-area polygons: (dz, -dx)
    const nx = dz / L, nz = -dx / L;
    lines.push({ x: p[2 * i] - nx * d, z: p[2 * i + 1] - nz * d, dx: dx / L, dz: dz / L });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const den = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(den) < 1e-6) { out.push(b.x, b.z); continue; }
    const t = ((b.x - a.x) * b.dz - (b.z - a.z) * b.dx) / den;
    out.push(a.x + a.dx * t, a.z + a.dz * t);
  }
  return out;
}

export function pointInPoly(p, x, z) {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------------ MeshBuilder
export class MeshBuilder {
  constructor() {
    this.buckets = new Map();
    this.m = new THREE.Matrix4();
    this.nm = new THREE.Matrix3();
    this.stack = [];
    this.v = new THREE.Vector3();
  }

  bucket(k) {
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = { p: [], n: [], u: [] }));
    return b;
  }

  /** Enter a local frame: translate(x,y,z) * rotateY(yaw) * scale(s), relative to the current one. */
  push(x = 0, y = 0, z = 0, yaw = 0, s = 1) {
    this.stack.push(this.m.clone());
    const L = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(s, s, s));
    this.m.multiply(L);
    this.nm.getNormalMatrix(this.m);
    return this;
  }

  pop() {
    this.m.copy(this.stack.pop());
    this.nm.getNormalMatrix(this.m);
    return this;
  }

  /** World position of a local point. */
  world(x, y, z) {
    return this.v.set(x, y, z).applyMatrix4(this.m).toArray();
  }

  /** Flat triangle from local points a, b, c (counter-clockwise seen from the front). */
  tri(k, a, b, c, ua = [0, 0], ub = [1, 0], uc = [0, 1]) {
    const g = this.bucket(k);
    const A = this.world(...a), B = this.world(...b), C = this.world(...c);
    const e1x = B[0] - A[0], e1y = B[1] - A[1], e1z = B[2] - A[2];
    const e2x = C[0] - A[0], e2y = C[1] - A[1], e2z = C[2] - A[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const [P, U] of [[A, ua], [B, ub], [C, uc]]) {
      g.p.push(P[0], P[1], P[2]);
      g.n.push(nx, ny, nz);
      g.u.push(U[0], U[1]);
    }
  }

  /** Quad a, b, c, d counter-clockwise seen from the front; uv = [[u,v] x4]. */
  quad(k, a, b, c, d, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    this.tri(k, a, b, c, uv[0], uv[1], uv[2]);
    this.tri(k, a, c, d, uv[0], uv[2], uv[3]);
  }

  /** Vertical wall over a->b with the outward side on the right of a->b when seen from above (positive-area polygons). */
  wall(k, ax, az, bx, bz, y0, y1, uA = 0, uB = 1, vB = 0, vT = 1) {
    this.quad(k, [bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz], [[uB, vB], [uA, vB], [uA, vT], [uB, vT]]);
  }

  /**
   * Walls around a polygon. o: {tw, th (tile size in m, default 1), v0 (height giving v=0, default y0),
   * key: fn(edge) -> material key or null (overrides k), flip}.
   */
  ring(k, pts, y0, y1, o = {}) {
    const p = o.flip ? Array.from(pts) : orient(pts);
    const n = p.length / 2;
    const tw = o.tw || 1, th = o.th || 1, v0 = o.v0 ?? y0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * j], bz = p[2 * j + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-4) continue;
      const key = typeof k === 'function' ? k({ i, ax, az, bx, bz, len: L, nx: (bz - az) / L, nz: -(bx - ax) / L }) : k;
      if (key) this.wall(key, ax, az, bx, bz, y0, y1, (o.u0 || 0) + s / tw, (o.u0 || 0) + (s + L) / tw, (y0 - v0) / th, (y1 - v0) / th);
      s += L;
    }
  }

  /** Horizontal polygon (triangulated). up: normal +y, otherwise -y. uv: planar in metres / s. */
  cap(k, pts, y, o = {}) {
    const up = o.up !== false;
    const s = o.s || 4;
    const n = pts.length / 2;
    const contour = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(pts[2 * i], pts[2 * i + 1]));
    const holes = (o.holes || []).map((h) => {
      const r = [];
      for (let i = 0; i < h.length; i += 2) r.push(new THREE.Vector2(h[i], h[i + 1]));
      return r;
    });
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = contour.concat(...holes);
    for (const t of tris) {
      const a = all[t[0]], b = all[t[1]], c = all[t[2]];
      // enforce facing: (b-a) x (c-a) y-component sign
      const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); // xz cross, +y normal is -cr for x-z (z south)
      const upFacing = cr < 0;
      const [p, q, r] = upFacing === up ? [a, b, c] : [a, c, b];
      this.tri(k, [p.x, y, p.y], [q.x, y, q.y], [r.x, y, r.y], [p.x / s, p.y / s], [q.x / s, q.y / s], [r.x / s, r.y / s]);
    }
  }

  /** Prism: walls + top cap (and bottom if o.bottom). */
  prism(k, pts, y0, y1, o = {}) {
    this.ring(o.wall || k, pts, y0, y1, o);
    if (o.top !== false) this.cap(o.topKey || k, pts, y1, { s: o.capS || 4 });
    if (o.bottom) this.cap(o.bottomKey || k, pts, y0, { up: false, s: o.capS || 4 });
  }

  /**
   * Axis-aligned box in the current frame (centre x,z; base y0): w along x, d along z.
   * o: {tw, th, bottom, top:false, sides:'nsew', roof:key, topKey}
   */
  box(k, cx, y0, cz, w, h, d, yaw = 0, o = {}) {
    if (yaw) this.push(cx, 0, cz, yaw), (cx = 0), (cz = 0);
    const tw = o.tw || 1, th = o.th || 1;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const v1 = h / th;
    const sides = o.sides || 'nsew';
    // front (+z): left-to-right = +x
    if (sides.includes('s')) this.quad(o.south || k, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [[0, 0], [w / tw, 0], [w / tw, v1], [0, v1]]);
    if (sides.includes('n')) this.quad(o.north || k, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [[0, 0], [w / tw, 0], [w / tw, v1], [0, v1]]);
    if (sides.includes('e')) this.quad(o.east || k, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [[0, 0], [d / tw, 0], [d / tw, v1], [0, v1]]);
    if (sides.includes('w')) this.quad(o.west || k, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [[0, 0], [d / tw, 0], [d / tw, v1], [0, v1]]);
    if (o.top !== false) this.quad(o.topKey || k, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [[x0 / tw, z1 / tw], [x1 / tw, z1 / tw], [x1 / tw, z0 / tw], [x0 / tw, z0 / tw]]);
    if (o.bottom) this.quad(k, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (yaw) this.pop();
  }

  /** Rectangular frustum (base w0 x d0 at y0, top w1 x d1 at y0+h), centred at (cx, cz). */
  frustum(k, cx, y0, cz, w0, d0, w1, d1, h, yaw = 0, o = {}) {
    if (yaw) { this.push(cx, 0, cz, yaw); cx = 0; cz = 0; }
    const tw = o.tw || 1, th = o.th || 1;
    const y1 = y0 + h;
    const B = [[cx - w0 / 2, cz - d0 / 2], [cx + w0 / 2, cz - d0 / 2], [cx + w0 / 2, cz + d0 / 2], [cx - w0 / 2, cz + d0 / 2]];
    const T = [[cx - w1 / 2, cz - d1 / 2], [cx + w1 / 2, cz - d1 / 2], [cx + w1 / 2, cz + d1 / 2], [cx - w1 / 2, cz + d1 / 2]];
    const sl = Math.hypot(h, Math.max(w0 - w1, d0 - d1) / 2);
    // order: south(+z), east(+x), north(-z), west(-x) seen from outside
    const faces = [[3, 2], [2, 1], [1, 0], [0, 3]];
    for (const [a, c] of faces) {
      const L = Math.hypot(B[c][0] - B[a][0], B[c][1] - B[a][1]);
      this.quad(k, [B[a][0], y0, B[a][1]], [B[c][0], y0, B[c][1]], [T[c][0], y1, T[c][1]], [T[a][0], y1, T[a][1]], [[0, 0], [L / tw, 0], [L / tw, sl / th], [0, sl / th]]);
    }
    if (o.top !== false) this.quad(o.topKey || k, [T[3][0], y1, T[3][1]], [T[2][0], y1, T[2][1]], [T[1][0], y1, T[1][1]], [T[0][0], y1, T[0][1]]);
    if (yaw) this.pop();
  }

  /** Gable roof over a rectangle (ridge along local x): eaves at y0, ridge at y0+rise. */
  gable(k, cx, y0, cz, w, d, rise, yaw = 0, o = {}) {
    const ov = o.overhang ?? 0.3, ove = o.eave ?? 0.3;
    this.push(cx, y0, cz, yaw);
    const hw = w / 2 + ove, hd = d / 2 + ov;
    const s = o.s || 2;
    // south slope (+z) and north slope (-z)
    const sl = Math.hypot(hd, rise);
    this.quad(k, [-hw, 0, hd], [hw, 0, hd], [hw, rise, 0], [-hw, rise, 0], [[0, 0], [2 * hw / s, 0], [2 * hw / s, sl / s], [0, sl / s]]);
    this.quad(k, [hw, 0, -hd], [-hw, 0, -hd], [-hw, rise, 0], [hw, rise, 0], [[0, 0], [2 * hw / s, 0], [2 * hw / s, sl / s], [0, sl / s]]);
    if (o.gableKey !== null) {
      const gk = o.gableKey || o.wallKey || k;
      const gw = d / 2;
      const gr = rise * (gw / hd);
      this.tri(gk, [w / 2, 0, gw], [w / 2, 0, -gw], [w / 2, gr, 0], [0, 0], [d / s, 0], [d / 2 / s, gr / s]);
      this.tri(gk, [-w / 2, 0, -gw], [-w / 2, 0, gw], [-w / 2, gr, 0], [0, 0], [d / s, 0], [d / 2 / s, gr / s]);
    }
    this.pop();
  }

  /** Hip / pyramid roof over a convex-ish polygon: top polygon = scaled copy at y + rise. */
  hip(k, pts, y, rise, topScale = 0.0, o = {}) {
    const p = orient(pts);
    const [cx, cz] = o.centre || centroid(p);
    const n = p.length / 2;
    const s = o.s || 2;
    const top = [];
    for (let i = 0; i < n; i++) top.push(cx + (p[2 * i] - cx) * topScale, cz + (p[2 * i + 1] - cz) * topScale);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const L = Math.hypot(p[2 * j] - p[2 * i], p[2 * j + 1] - p[2 * i + 1]);
      const a = [p[2 * i], y, p[2 * i + 1]], b = [p[2 * j], y, p[2 * j + 1]];
      const ta = [top[2 * i], y + rise, top[2 * i + 1]], tb = [top[2 * j], y + rise, top[2 * j + 1]];
      const sl = Math.hypot(rise, Math.hypot(ta[0] - a[0], ta[2] - a[2]));
      if (topScale > 0.001) this.quad(k, b, a, ta, tb, [[(acc + L) / s, 0], [acc / s, 0], [acc / s, sl / s], [(acc + L) / s, sl / s]]);
      else this.tri(k, b, a, ta, [(acc + L) / s, 0], [acc / s, 0], [(acc + L / 2) / s, sl / s]);
      acc += L;
    }
    if (topScale > 0.001 && o.cap !== false) this.cap(o.capKey || k, top, y + rise, { s });
  }

  /** Add any THREE geometry (transformed by the current frame). o: {matrix, colourless} */
  geo(k, g, o = {}) {
    g = g.index ? g.toNonIndexed() : g.clone();
    if (o.matrix) g.applyMatrix4(o.matrix);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const b = this.bucket(k);
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(this.m);
      b.p.push(v.x, v.y, v.z);
      if (nor) nv.fromBufferAttribute(nor, i).applyMatrix3(this.nm).normalize(); else nv.set(0, 1, 0);
      b.n.push(nv.x, nv.y, nv.z);
      if (uv) b.u.push(uv.getX(i), uv.getY(i)); else b.u.push(0, 0);
    }
    g.dispose();
  }

  /** Vertical cylinder / cone frustum. */
  cyl(k, x, y0, z, r0, r1, h, seg = 16, o = {}) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, !!o.open);
    g.translate(0, h / 2, 0);
    this.geo(k, g, { matrix: new THREE.Matrix4().makeTranslation(x, y0, z) });
  }

  sphere(k, x, y, z, r, sx = 1, sy = 1, sz = 1, seg = 12) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1));
    g.scale(sx, sy, sz);
    this.geo(k, g, { matrix: new THREE.Matrix4().makeTranslation(x, y, z) });
  }

  /** Lathe from a [r, y] profile around the vertical axis at (x, y0, z). */
  lathe(k, x, y0, z, profile, seg = 16) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    this.geo(k, g, { matrix: new THREE.Matrix4().makeTranslation(x, y0, z) });
  }

  /** Extrude a 2D shape (in local x,y) by depth along local z (centred if o.center). */
  extrude(k, shapePts, depth, o = {}) {
    const sh = new THREE.Shape(shapePts.map(([a, b]) => new THREE.Vector2(a, b)));
    for (const h of o.holes || []) sh.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(a, b))));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!o.bevel, bevelThickness: o.bevel || 0, bevelSize: o.bevel || 0, bevelSegments: 1, curveSegments: o.curve || 6 });
    if (o.center) g.translate(0, 0, -depth / 2);
    this.geo(k, g, { matrix: o.matrix });
  }

  get triangles() {
    let t = 0;
    for (const b of this.buckets.values()) t += b.p.length / 9;
    return t;
  }

  /** One Mesh per material key. mats: {key: Material}; opts.shadow = set of keys that cast shadows (default all but 'glass*'). */
  meshes(mats, opts = {}) {
    const out = [];
    for (const [k, b] of this.buckets) {
      if (!b.p.length) continue;
      const mat = mats[k];
      if (!mat) { console.warn('[landmarks] no material for', k); continue; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.name = k;
      const noShadow = mat.transparent || /^(glass|water|decal|paint|lfGlass|lfc:)/.test(k); // window glass and frames sit in the reveals' shadow anyway
      m.castShadow = opts.cast !== false && !noShadow;
      m.receiveShadow = true;
      out.push(m);
    }
    return out;
  }
}

// ------------------------------------------------------------------ textures
const texCache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Cached texture factory: fn() -> THREE.Texture. */
export function cached(key, fn) {
  let t = texCache.get(key);
  if (!t) texCache.set(key, (t = fn()));
  return t;
}

function speckle(g, w, h, rnd, amount, base = [128, 128, 128], n = 0.04) {
  // fine per-pixel noise as translucent dots
  const cnt = Math.floor(w * h * n);
  for (let i = 0; i < cnt; i++) {
    const v = rnd() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${amount * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + (rnd() < 0.3 ? 1 : 0), 1);
  }
  void base;
}

/** Window grid facade tile. Returns {map, emissive, w, h} where w,h = tile size in metres. */
export function facadeTexture(key, spec) {
  return cached(key, () => {
    const s = {
      bayW: 3.6, floorH: 3.7, bays: 4, floors: 2, ppm: 36, wall: '#d8cfb6', trim: '#b3a78b', glass: '#3a4854', glass2: '#6c8294',
      win: [1.3, 2.1], sill: 0.9, frame: 0.07, ashlar: null, band: null, lit: 0.3, seed: 7, arch: false, mullion: 0, pediment: false,
      ...spec,
    };
    const W = Math.round(s.bayW * s.bays * s.ppm), H = Math.round(s.floorH * s.floors * s.ppm);
    const rnd = mulberry32(s.seed);
    const lit = [];
    for (let i = 0; i < s.bays * s.floors; i++) lit.push(rnd() < s.lit);
    const draw = (night) => {
      const [c, g] = canvas(W, H);
      const px = s.ppm;
      if (night) {
        g.fillStyle = '#000';
        g.fillRect(0, 0, W, H);
      } else {
        g.fillStyle = s.wall;
        g.fillRect(0, 0, W, H);
        speckle(g, W, H, mulberry32(s.seed + 3), 0.10, undefined, 0.06);
        if (s.ashlar) {
          // masonry courses
          g.strokeStyle = s.ashlar.line || 'rgba(0,0,0,0.10)';
          g.lineWidth = 1;
          const ch = s.ashlar.h * px, cw = s.ashlar.w * px;
          for (let y = 0; y < H; y += ch) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
          let row = 0;
          for (let y = 0; y < H; y += ch, row++) for (let x = (row % 2) * cw / 2; x < W; x += cw) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + ch); g.stroke(); }
        }
      }
      let li = 0;
      for (let f = 0; f < s.floors; f++) {
        for (let b = 0; b < s.bays; b++, li++) {
          const cx = (b + 0.5) * s.bayW * px;
          const ww = s.win[0] * px, wh = s.win[1] * px;
          const wy = H - ((f * s.floorH + s.sill + s.win[1]) * px);
          const x = cx - ww / 2;
          if (night) {
            if (!lit[li]) continue;
            // a lit room: warm ceiling glow fading down, sometimes a drawn curtain
            const k = rnd();
            const gr = g.createLinearGradient(0, wy, 0, wy + wh);
            gr.addColorStop(0, k < 0.5 ? '#f0c27a' : k < 0.85 ? '#f6dcae' : '#cfe0ff');
            gr.addColorStop(1, k < 0.5 ? '#6e4a26' : k < 0.85 ? '#806650' : '#56627a');
            g.fillStyle = gr;
            g.fillRect(x, wy, ww, wh);
            if (rnd() < 0.35) { g.fillStyle = 'rgba(40,28,18,0.55)'; g.fillRect(x, wy, ww * 0.28, wh); g.fillRect(x + ww * 0.72, wy, ww * 0.28, wh); }
            continue;
          }
          const fr = s.frame * px;
          const path = (xx, yy, w2, h2) => {
            g.beginPath();
            if (s.arch) { const r = w2 / 2; g.moveTo(xx, yy + h2); g.lineTo(xx, yy + r); g.arc(xx + r, yy + r, r, Math.PI, 0); g.lineTo(xx + w2, yy + h2); g.closePath(); } else g.rect(xx, yy, w2, h2);
          };
          // surround
          g.fillStyle = s.trim;
          path(x - fr * 1.6, wy - fr * 1.6, ww + fr * 3.2, wh + fr * 1.6);
          g.fill();
          if (s.pediment) {
            // triangular / segmental pediment over the surround on alternate bays
            g.beginPath();
            if (b % 2) { g.moveTo(x - fr * 3, wy - fr * 1.6); g.lineTo(x + ww / 2, wy - fr * 1.6 - ww * 0.34); g.lineTo(x + ww + fr * 3, wy - fr * 1.6); }
            else { g.moveTo(x - fr * 3, wy - fr * 1.6); g.quadraticCurveTo(x + ww / 2, wy - fr * 1.6 - ww * 0.62, x + ww + fr * 3, wy - fr * 1.6); }
            g.closePath();
            g.fill();
          }
          // sill
          g.fillStyle = s.trim;
          g.fillRect(x - fr * 2.4, wy + wh + fr * 0.4, ww + fr * 4.8, fr * 1.5);
          // glass with sky gradient
          const gr = g.createLinearGradient(0, wy, 0, wy + wh);
          gr.addColorStop(0, s.glass2);
          gr.addColorStop(1, s.glass);
          g.fillStyle = gr;
          path(x, wy, ww, wh);
          g.fill();
          // frame / glazing bars
          g.fillStyle = s.frameColour || '#e9e6dc';
          g.fillRect(x + ww / 2 - fr * 0.35, wy, fr * 0.7, wh);
          g.fillRect(x, wy + wh * 0.35 - fr * 0.3, ww, fr * 0.6);
        }
      }
      if (s.band && !night) {
        g.fillStyle = s.band.colour;
        for (let f = 0; f < s.floors; f++) g.fillRect(0, H - (f * s.floorH + s.band.y + s.band.h) * px, W, s.band.h * px);
      }
      return toTexture(c);
    };
    return { map: draw(false), emissive: draw(true), w: s.bayW * s.bays, h: s.floorH * s.floors };
  });
}

/** Aluminium + glass curtain wall tile with horizontal floor lines (Pliska / CCB). */
export function curtainTexture(key, spec = {}) {
  return cached(key, () => {
    const s = { bayW: 1.5, floorH: 3.7, bays: 6, floors: 3, ppm: 34, glass: '#8fa1ab', glass2: '#b8c8d0', mullion: '#45545d', spandrel: '#aab3b8', sp: 1.0, lit: 0.22, seed: 11, ...spec };
    const W = Math.round(s.bayW * s.bays * s.ppm), H = Math.round(s.floorH * s.floors * s.ppm);
    const rnd = mulberry32(s.seed);
    const lit = [];
    for (let i = 0; i < s.bays * s.floors; i++) lit.push(rnd() < s.lit);
    const draw = (night) => {
      const [c, g] = canvas(W, H);
      const px = s.ppm;
      g.fillStyle = night ? '#000' : s.mullion;
      g.fillRect(0, 0, W, H);
      let li = 0;
      for (let f = 0; f < s.floors; f++) {
        const yTop = H - (f + 1) * s.floorH * px;
        for (let b = 0; b < s.bays; b++, li++) {
          const x = b * s.bayW * px, w = s.bayW * px;
          const gy = yTop + 0.12 * px, gh = (s.floorH - s.sp - 0.12) * px;
          if (night) {
            if (lit[li]) { g.fillStyle = '#ffe2ae'; g.fillRect(x + 2, gy + 2, w - 4, gh - 4); }
            continue;
          }
          // glass pane with sky gradient
          const gr = g.createLinearGradient(0, gy, 0, gy + gh);
          gr.addColorStop(0, s.glass2);
          gr.addColorStop(0.6, s.glass);
          gr.addColorStop(1, '#6f8591');
          g.fillStyle = gr;
          g.fillRect(x + 2, gy, w - 4, gh);
          // transom
          g.fillStyle = s.mullion;
          g.fillRect(x, gy + gh * 0.55, w, 1.5);
          // spandrel (aluminium panel)
          g.fillStyle = s.spandrel;
          g.fillRect(x + 1, yTop + (s.floorH - s.sp) * px + 1, w - 2, s.sp * px - 2);
        }
      }
      if (!night) speckle(g, W, H, mulberry32(5), 0.05, undefined, 0.03);
      return toTexture(c);
    };
    return { map: draw(false), emissive: draw(true), w: s.bayW * s.bays, h: s.floorH * s.floors };
  });
}

/** Concrete / metal panel wall tile (joints), optional horizontal band. */
export function panelTexture(key, spec = {}) {
  return cached(key, () => {
    const s = { w: 6, h: 6, ppm: 24, base: '#cfcbc3', joint: 'rgba(60,60,60,0.35)', cols: 2, rows: 2, noise: 0.10, seed: 3, stain: 0.0, ...spec };
    const W = Math.round(s.w * s.ppm), H = Math.round(s.h * s.ppm);
    const [c, g] = canvas(W, H);
    const rnd = mulberry32(s.seed);
    g.fillStyle = s.base;
    g.fillRect(0, 0, W, H);
    // slightly different panel tones
    for (let r = 0; r < s.rows; r++) for (let q = 0; q < s.cols; q++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.05})`;
      g.fillRect((q * W) / s.cols, (r * H) / s.rows, W / s.cols, H / s.rows);
    }
    g.strokeStyle = s.joint;
    g.lineWidth = 1.5;
    for (let q = 0; q <= s.cols; q++) { g.beginPath(); g.moveTo(Math.min(W - 1, (q * W) / s.cols) + 0.5, 0); g.lineTo(Math.min(W - 1, (q * W) / s.cols) + 0.5, H); g.stroke(); }
    for (let r = 0; r <= s.rows; r++) { g.beginPath(); g.moveTo(0, Math.min(H - 1, (r * H) / s.rows) + 0.5); g.lineTo(W, Math.min(H - 1, (r * H) / s.rows) + 0.5); g.stroke(); }
    speckle(g, W, H, rnd, s.noise * 2, undefined, 0.08);
    if (s.stain) {
      for (let i = 0; i < 40; i++) {
        const x = rnd() * W;
        const gr = g.createLinearGradient(x, 0, x, H);
        gr.addColorStop(0, `rgba(40,40,30,${s.stain * rnd()})`);
        gr.addColorStop(1, 'rgba(40,40,30,0)');
        g.fillStyle = gr;
        g.fillRect(x, 0, 2 + rnd() * 4, H * (0.3 + rnd() * 0.5));
      }
    }
    return toTexture(c);
  });
}

/** Glazed ribbon (dark bronze glass, mullions) tile: w x h metres. */
export function ribbonGlassTexture(key, spec = {}) {
  return cached(key, () => {
    const s = { w: 6, h: 3.5, ppm: 28, glass: '#4a4f55', glass2: '#7d8c96', mullion: '#2b2e31', spacing: 1.5, base: 0.0, lit: 0.0, seed: 4, ...spec };
    const W = Math.round(s.w * s.ppm), H = Math.round(s.h * s.ppm);
    const draw = (night) => {
      const [c, g] = canvas(W, H);
      if (night) {
        g.fillStyle = '#000';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#ffd9a0';
        const n = Math.round(s.w / s.spacing);
        const rnd = mulberry32(s.seed);
        for (let i = 0; i < n; i++) if (rnd() < 0.6) g.fillRect(i * s.spacing * s.ppm + 3, H * 0.12, s.spacing * s.ppm - 6, H * 0.76);
        return toTexture(c);
      }
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, s.glass2);
      gr.addColorStop(1, s.glass);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.fillStyle = s.mullion;
      for (let x = 0; x <= s.w; x += s.spacing) g.fillRect(x * s.ppm - 1.5, 0, 3, H);
      g.fillRect(0, H * 0.45, W, 2);
      g.fillRect(0, 0, W, 3);
      g.fillRect(0, H - 3, W, 3);
      return toTexture(c);
    };
    return { map: draw(false), emissive: draw(true), w: s.w, h: s.h };
  });
}

/** Plain plaster / stone with fine noise. */
export function plasterTexture(key, base = '#e8dfc8', amount = 0.12, size = 128, ppm = 32) {
  return cached(key, () => {
    const [c, g] = canvas(size, size);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    speckle(g, size, size, mulberry32(21), amount, undefined, 0.2);
    const t = toTexture(c);
    t.userData = { w: size / ppm, h: size / ppm };
    return t;
  });
}

/** Roof tiles (courses) tile 4x4 m. */
export function tileRoofTexture(key, base = '#9a3b26') {
  return cached(key, () => {
    const W = 128, H = 128;
    const [c, g] = canvas(W, H);
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const rnd = mulberry32(8);
    for (let r = 0; r < 16; r++) {
      for (let q = 0; q < 16; q++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '255,200,150' : '30,10,5'},${0.04 + rnd() * 0.1})`;
        g.fillRect(q * 8 + (r % 2) * 4 - 4, r * 8, 8, 8);
      }
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, r * 8 + 7, W, 1);
    }
    return toTexture(c);
  });
}

/** Granite / stone block texture (large ashlar) with light/dark flecks. */
export function graniteTexture(key, base = '#8f8b84', block = [1.2, 0.6], ppm = 64, size = 4) {
  return cached(key, () => {
    const W = size * ppm, H = size * ppm;
    const [c, g] = canvas(W, H);
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const rnd = mulberry32(31);
    for (let i = 0; i < W * H * 0.05; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(20,20,20,0.22)';
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
    g.strokeStyle = 'rgba(30,30,30,0.35)';
    g.lineWidth = 1.5;
    const bh = block[1] * ppm, bw = block[0] * ppm;
    let row = 0;
    for (let y = 0; y < H; y += bh, row++) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      for (let x = (row % 2) * bw / 2; x < W; x += bw) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + bh); g.stroke(); }
    }
    return toTexture(c);
  });
}

/** Generic text sign canvas texture. lines: [{text,size,color,y,weight,align}] */
export function signTexture(w, h, bg, lines, o = {}) {
  const [c, g] = canvas(w, h);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.textBaseline = 'middle';
  for (const ln of lines) {
    let size = ln.size || 40;
    const weight = ln.weight || 700;
    const font = (sz) => `${weight} ${sz}px ${ln.family || 'Roboto, Arial, "Helvetica Neue", sans-serif'}`;
    g.font = font(size);
    while (g.measureText(ln.text).width > (ln.max || w - 16) && size > 8) { size -= 2; g.font = font(size); }
    g.fillStyle = ln.color || '#fff';
    g.textAlign = ln.align || 'center';
    g.fillText(ln.text, ln.align === 'left' ? 10 : ln.align === 'right' ? w - 10 : w / 2, ln.y ?? h / 2);
  }
  const t = toTexture(c, { repeat: false, aniso: o.aniso || 8 });
  return t;
}

export { canvas as makeCanvas, toTexture };
