import * as THREE from 'three';

/** Regular-grid heightfield (row-major by Z: data[j * res + i], i along X). */
export class Heightmap {
  readonly data: Float32Array;
  readonly cell: number;
  min = Infinity;
  max = -Infinity;
  private tex: THREE.DataTexture | null = null;

  /** Move the map (same size/resolution) — for streaming with reused buffers; callers refill `data` then touch(). */
  recenter(cx: number, cz: number) {
    this.minX = cx - this.size / 2;
    this.minZ = cz - this.size / 2;
    this.min = Infinity;
    this.max = -Infinity;
  }

  constructor(public minX: number, public minZ: number, readonly size: number, readonly res: number, data?: Float32Array) {
    this.data = data ?? new Float32Array(res * res);
    this.cell = size / (res - 1);
  }

  static generate(cx: number, cz: number, size: number, res: number, fn: (x: number, z: number) => number): Heightmap {
    const hm = new Heightmap(cx - size / 2, cz - size / 2, size, res);
    const d = hm.data;
    const c = hm.cell;
    for (let j = 0; j < res; j++) {
      const z = hm.minZ + j * c;
      for (let i = 0; i < res; i++) {
        const v = fn(hm.minX + i * c, z);
        d[j * res + i] = v;
        if (v < hm.min) hm.min = v;
        if (v > hm.max) hm.max = v;
      }
    }
    return hm;
  }

  contains(x: number, z: number, margin = 0) {
    return x >= this.minX + margin && z >= this.minZ + margin && x <= this.minX + this.size - margin && z <= this.minZ + this.size - margin;
  }

  /** Distance from (x,z) to the nearest edge (negative outside). */
  edgeDistance(x: number, z: number) {
    const rx = x - this.minX, rz = z - this.minZ;
    return Math.min(rx, this.size - rx, rz, this.size - rz);
  }

  sample(x: number, z: number): number {
    const r = this.res;
    let px = ((x - this.minX) / this.size) * (r - 1);
    let pz = ((z - this.minZ) / this.size) * (r - 1);
    px = px < 0 ? 0 : px > r - 1.001 ? r - 1.001 : px;
    pz = pz < 0 ? 0 : pz > r - 1.001 ? r - 1.001 : pz;
    const i = Math.floor(px), j = Math.floor(pz);
    const fx = px - i, fz = pz - j;
    const d = this.data;
    const a = d[j * r + i], b = d[j * r + i + 1], c = d[(j + 1) * r + i], e = d[(j + 1) * r + i + 1];
    return (a + (b - a) * fx) * (1 - fz) + (c + (e - c) * fx) * fz;
  }

  texture(): THREE.DataTexture {
    if (this.tex) return this.tex;
    const t = new THREE.DataTexture(this.data, this.res, this.res, THREE.RedFormat, THREE.FloatType);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.tex = t;
    return t;
  }

  /** Re-upload after CPU edits. */
  touch() {
    if (this.tex) this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex?.dispose();
  }
}

/** Near (high-res) + optional mid + far (low-res) maps with smooth blends at the finer maps' borders. */
export class HeightField {
  /** optional middle tier between near and far (surface zones) */
  mid: Heightmap | null = null;
  midBlend = 1500;
  constructor(public near: Heightmap, public far: Heightmap | null, public blend = 300) {}

  private coarse(x: number, z: number): number {
    const far = this.far!;
    const mid = this.mid;
    if (!mid) return far.sample(x, z);
    const e = mid.edgeDistance(x, z);
    if (e <= 0) return far.sample(x, z);
    const hm = mid.sample(x, z);
    if (e >= this.midBlend) return hm;
    const hf = far.sample(x, z);
    const t = e / this.midBlend;
    return hf + (hm - hf) * t * t * (3 - 2 * t);
  }

  height(x: number, z: number): number {
    const far = this.far;
    const e = this.near.edgeDistance(x, z);
    if (!far) return this.near.sample(x, z);
    if (e <= 0) return this.coarse(x, z);
    const hn = this.near.sample(x, z);
    if (e >= this.blend) return hn;
    const hf = this.coarse(x, z);
    const t = e / this.blend;
    const s = t * t * (3 - 2 * t);
    return hf + (hn - hf) * s;
  }

  normal(x: number, z: number, e = 2, out = new THREE.Vector3()): THREE.Vector3 {
    const hx = this.height(x - e, z) - this.height(x + e, z);
    const hz = this.height(x, z - e) - this.height(x, z + e);
    return out.set(hx, 2 * e, hz).normalize();
  }
}
