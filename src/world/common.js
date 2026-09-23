import * as THREE from 'three';
import { Batch, prepGeo, xform } from '../util.js';

/** Batches static geometry per spatial chunk and material → few draw calls, good frustum culling. */
export class ChunkBatch {
  constructor(size = 220) { this.size = size; this.map = new Map(); }
  key(x, z) { return Math.floor(x / this.size) + ',' + Math.floor(z / this.size); }
  get(x, z) {
    const k = this.key(x, z);
    let b = this.map.get(k);
    if (!b) { b = new Batch(); this.map.set(k, b); }
    return b;
  }
  /** Adds geometry; chunk chosen by (x,z) or by the transformed geometry centre. */
  add(material, geo, matrix, color, x, z) {
    const g = prepGeo(geo, color);
    if (matrix) xform(g, matrix);
    if (x === undefined) {
      g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new THREE.Vector3());
      x = c.x; z = c.z;
    }
    this.get(x, z).addRaw(material, g);
    return g;
  }
  build(parent, name = 'chunk') {
    let n = 0;
    this.chunks = [];
    for (const [k, b] of this.map) {
      const [ix, iz] = k.split(',').map(Number);
      const meshes = b.build(parent, { name: name + k });
      n += meshes.length;
      // real extent of the chunk (long ribbons can reach far outside their home cell)
      const box = new THREE.Box3();
      for (const m of meshes) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
      this.chunks.push({ x: (ix + 0.5) * this.size, z: (iz + 0.5) * this.size, box, meshes, vis: true });
    }
    this.map.clear();
    return n;
  }
  /** Hide whole chunks far beyond the fog. */
  cull(cam, dist) {
    const d2 = dist * dist;
    for (const c of this.chunks) {
      const b = c.box;
      const dx = Math.max(b.min.x - cam.x, 0, cam.x - b.max.x), dz = Math.max(b.min.z - cam.z, 0, cam.z - b.max.z);
      const v = dx * dx + dz * dz < d2;
      if (v !== c.vis) { c.vis = v; for (const m of c.meshes) m.visible = v; }
    }
  }
}

/** Strip along a list of centre points [x,z] between lateral offsets l0..l1 (right positive). */
export function stripGeo(pts, l0, l1, y0, y1 = y0, { uvScale = 4, across = 1, vOffset = 0, colorFn = null } = {}) {
  const n = pts.length;
  const pos = [], uv = [], col = [], idx = [];
  let s = vOffset;
  const cols = across + 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const rx = -dz, rz = dx;
    if (i > 0) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    for (let k = 0; k < cols; k++) {
      const t = k / across;
      const l = l0 + (l1 - l0) * t;
      const x = p[0] + rx * l, z = p[1] + rz * l;
      pos.push(x, y0 + (y1 - y0) * t, z);
      uv.push(l / uvScale, s / uvScale);
      const c = colorFn ? colorFn(l, s) : 1;
      col.push(c, c, c);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < across; k++) {
    const a = i * cols + k, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure it faces up (strips may be built in either direction)
  const nrm = g.attributes.normal;
  let up = 0; for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
  if (up < 0 && y1 === y0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

/** Curb (kerb stone) along points at lateral offset lat; face towards the road on the 'faceSide'. */
export function curbGeo(pts, lat, faceSide = -1, h = 0.15, w = 0.18) {
  // profile: road-side vertical face + top, built as two strips
  const inner = lat, outer = lat - faceSide * w;
  const top = stripGeo(pts, Math.min(inner, outer), Math.max(inner, outer), h, h, { uvScale: 1 });
  const face = stripGeo(pts, inner, inner, 0, h, { uvScale: 1, across: 1 });
  return [top, face];
}

/** Flat polygon (array of [x,z]) with optional holes, at height y, world UVs. */
export function polyGeo(outline, y = 0, holes = [], uvScale = 4) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const p = g.attributes.position; const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / uvScale, p.getZ(i) / uvScale);
  return g;
}

export function circlePts(cx, cz, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}

/** Oriented box helper: returns matrix for a box centred at (x,y,z) with heading h (direction cos h, sin h). */
export function hmat(x, y, z, h, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  // local +x along heading, local +z to the right
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -h);
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}

/** Coarse occupancy grid used to keep buildings/trees off roads and away from each other. */
export class OccGrid {
  constructor(x0, z0, x1, z1, cell = 2) {
    this.x0 = x0; this.z0 = z0; this.cell = cell;
    this.nx = Math.ceil((x1 - x0) / cell); this.nz = Math.ceil((z1 - z0) / cell);
    this.a = new Uint8Array(this.nx * this.nz);
  }
  idx(x, z) { const i = Math.floor((x - this.x0) / this.cell), k = Math.floor((z - this.z0) / this.cell); if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return -1; return k * this.nx + i; }
  get(x, z) { const i = this.idx(x, z); return i < 0 ? 255 : this.a[i]; }
  markDisc(x, z, r, v = 1) {
    const c = this.cell;
    for (let dz = -r; dz <= r; dz += c) for (let dx = -r; dx <= r; dx += c) {
      if (dx * dx + dz * dz > r * r) continue;
      const i = this.idx(x + dx, z + dz); if (i >= 0 && this.a[i] < v) this.a[i] = v;
    }
  }
  /** Oriented rectangle: centre, heading h, half-length hl (along h), half-width hw. */
  markRect(x, z, h, hl, hw, v = 1) {
    const c = this.cell / 2, ch = Math.cos(h), sh = Math.sin(h);
    for (let a = -hl; a <= hl; a += c) for (let b = -hw; b <= hw; b += c) {
      const i = this.idx(x + ch * a - sh * b, z + sh * a + ch * b); if (i >= 0 && this.a[i] < v) this.a[i] = v;
    }
  }
  rectFree(x, z, h, hl, hw, maxV = 0) {
    const c = this.cell / 2, ch = Math.cos(h), sh = Math.sin(h);
    for (let a = -hl; a <= hl; a += c) for (let b = -hw; b <= hw; b += c) {
      if (this.get(x + ch * a - sh * b, z + sh * a + ch * b) > maxV) return false;
    }
    return true;
  }
  /** Chamfer distance (metres) from cells with value >= minV. */
  buildDist(minV = 2) {
    const { nx, nz, a } = this; const INF = 65000;
    const d = new Uint16Array(nx * nz);
    for (let i = 0; i < d.length; i++) d[i] = a[i] >= minV && a[i] !== 255 ? 0 : INF;
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const id = k * nx + i; let v = d[id];
      if (i > 0) v = Math.min(v, d[id - 1] + 2);
      if (k > 0) { v = Math.min(v, d[id - nx] + 2); if (i > 0) v = Math.min(v, d[id - nx - 1] + 3); if (i < nx - 1) v = Math.min(v, d[id - nx + 1] + 3); }
      d[id] = v;
    }
    for (let k = nz - 1; k >= 0; k--) for (let i = nx - 1; i >= 0; i--) {
      const id = k * nx + i; let v = d[id];
      if (i < nx - 1) v = Math.min(v, d[id + 1] + 2);
      if (k < nz - 1) { v = Math.min(v, d[id + nx] + 2); if (i < nx - 1) v = Math.min(v, d[id + nx + 1] + 3); if (i > 0) v = Math.min(v, d[id + nx - 1] + 3); }
      d[id] = v;
    }
    this.d = d;
  }
  dist(x, z) { const i = this.idx(x, z); return i < 0 || !this.d ? 9999 : (this.d[i] / 2) * this.cell; }
}
