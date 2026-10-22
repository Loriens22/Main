// Small growable geometry accumulator used by the procedural world builders.
import * as THREE from 'three';

export class GeoBuffer {
  constructor({ uv2 = false, color = false, extra = null } = {}) {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.uv2 = uv2 ? [] : null;
    this.col = color ? [] : null;
    this.extra = extra ? { name: extra.name, size: extra.size, data: [] } : null;
    this.idx = [];
    this.count = 0;
  }

  vertex(x, y, z, nx, ny, nz, u, v, u2 = 0, v2 = 0, c = null, e = null) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    if (this.uv2) this.uv2.push(u2, v2);
    if (this.col) this.col.push(c ? c[0] : 1, c ? c[1] : 1, c ? c[2] : 1);
    if (this.extra) for (let i = 0; i < this.extra.size; i++) this.extra.data.push(e ? e[i] : 0);
    return this.count++;
  }

  tri(a, b, c) {
    this.idx.push(a, b, c);
  }

  quad(a, b, c, d) {
    // a-b-c-d counter-clockwise (seen from the front face)
    this.idx.push(a, b, c, a, c, d);
  }

  get empty() {
    return this.count === 0;
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.uv2) g.setAttribute('uv1', new THREE.Float32BufferAttribute(this.uv2, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.extra) g.setAttribute(this.extra.name, new THREE.Float32BufferAttribute(this.extra.data, this.extra.size));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Buckets GeoBuffers by tile key and material key. */
export class TileBuckets {
  constructor(tileSize = 256, opts = {}) {
    this.tileSize = tileSize;
    this.opts = opts;
    this.map = new Map();
  }

  key(x, z) {
    return `${Math.floor(x / this.tileSize)},${Math.floor(z / this.tileSize)}`;
  }

  get(x, z, mat, opts = this.opts[mat] || {}) {
    const k = this.key(x, z);
    let t = this.map.get(k);
    if (!t) this.map.set(k, (t = new Map()));
    let b = t.get(mat);
    if (!b) t.set(mat, (b = new GeoBuffer(opts)));
    return b;
  }
}
