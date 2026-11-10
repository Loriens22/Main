import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hashCell } from './SurfaceGen';
import type { SurfaceGen } from './SurfaceGen';
import type { PhysicsWorld } from '../../physics/Physics';

/**
 * Boulder field around the focus point: deterministic per 5 m cell (hash), density from the generator's rockiness,
 * power-law sizes. Six procedural rock shapes (displaced icospheres, flattened bases) instanced per shape.
 * Large rocks near the player get sphere colliders so they can be climbed and bumped into.
 */
const VARIANTS = 6;
const CELL = 5;

function rockGeometry(seed: number) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const rnd = (i: number) => (hashCell(i, seed, 71) & 0xffffff) / 16777216;
  // a few random planes cut facets; low-frequency lumps; flattened base
  const planes = Array.from({ length: 7 }, (_, i) => ({ n: new THREE.Vector3(rnd(i * 3) - 0.5, rnd(i * 3 + 1) - 0.3, rnd(i * 3 + 2) - 0.5).normalize(), d: 0.55 + 0.35 * rnd(i + 40) }));
  const sx = 0.8 + 0.5 * rnd(90), sy = 0.55 + 0.35 * rnd(91), sz = 0.8 + 0.5 * rnd(92);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let r = 1 + 0.12 * Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 0.7) * Math.sin(v.z * 3.7 + seed * 1.3);
    for (const pl of planes) {
      const k = v.dot(pl.n) * r;
      if (k > pl.d) r *= pl.d / k;
    }
    v.multiplyScalar(r);
    v.set(v.x * sx, v.y * sy, v.z * sz);
    if (v.y < -0.25 * sy) v.y = -0.25 * sy + (v.y + 0.25 * sy) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export class Rocks {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private center = new THREE.Vector2(1e12, 1e12);
  private colliders: import('@dimforge/rapier3d-compat').Collider[] = [];
  private colCenter = new THREE.Vector2(1e12, 1e12);
  private placed: { x: number; y: number; z: number; s: number }[] = [];
  readonly radius: number;

  constructor(readonly gen: SurfaceGen, color: THREE.Color, opts: { max?: number; radius?: number } = {}) {
    const max = opts.max ?? 2600;
    this.radius = opts.radius ?? 320;
    for (let k = 0; k < VARIANTS; k++) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.93, metalness: 0 });
      const m = new THREE.InstancedMesh(rockGeometry(k * 17 + 3), mat, Math.ceil(max / VARIANTS));
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.userData.owned = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(m);
      this.group.add(m);
    }
  }

  /** Re-place when the focus moves away from the last placement centre. */
  update(focus: THREE.Vector3, physics: PhysicsWorld | null) {
    const f2 = new THREE.Vector2(focus.x, focus.z);
    if (f2.distanceTo(this.center) > this.radius * 0.3) this.place(f2);
    if (physics && f2.distanceTo(this.colCenter) > 20) this.collide(f2, physics);
  }

  private place(c: THREE.Vector2) {
    this.center.copy(c);
    const R = this.radius;
    const counts = new Array(VARIANTS).fill(0);
    const cap = this.meshes[0].instanceMatrix.count;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const i0 = Math.floor((c.x - R) / CELL), i1 = Math.floor((c.x + R) / CELL);
    const j0 = Math.floor((c.y - R) / CELL), j1 = Math.floor((c.y + R) / CELL);
    this.placed = [];
    const seed = this.gen.seed;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const h = hashCell(i, j, seed + 5003);
        const x = (i + ((h & 0xff) / 255)) * CELL, z = (j + (((h >>> 8) & 0xff) / 255)) * CELL;
        const dx = x - c.x, dz = z - c.y;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        const rk = this.gen.rockiness(x, z);
        const pr = ((h >>> 16) & 0xff) / 255;
        if (pr > rk * 0.9) continue;
        // power-law size: most are pebbles to 0.5 m, a few metre-class boulders
        const u = (h32b(h) & 0xffff) / 65536;
        let size = 0.12 * Math.pow(1 - u * 0.985, -0.75);
        size = Math.min(size, 3.2);
        // far: drop the small ones (they would be sub-pixel)
        const d = Math.sqrt(d2);
        if (size < d * 0.004) continue;
        const k = h % VARIANTS;
        if (counts[k] >= cap) continue;
        const y = this.gen.field.height(x, z);
        this.gen.field.normal(x, z, Math.max(0.6, size), n);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((h >>> 3) & 0x3ff) * 0.0061));
        p.set(x, y - size * 0.12, z);
        s.setScalar(size);
        m4.compose(p, q, s);
        this.meshes[k].setMatrixAt(counts[k]++, m4);
        if (size > 0.55) this.placed.push({ x, y, z, s: size });
      }
    }
    this.meshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  private collide(c: THREE.Vector2, physics: PhysicsWorld) {
    this.colCenter.copy(c);
    for (const col of this.colliders) physics.world.removeCollider(col, false);
    this.colliders = [];
    for (const r of this.placed) {
      const dx = r.x - c.x, dz = r.z - c.y;
      if (dx * dx + dz * dz > 45 * 45) continue;
      this.colliders.push(physics.addSphere(r.x, r.y + r.s * 0.12, r.z, r.s * 0.72));
    }
  }

  /** Nearest boulder top under a point (for the craft's landing legs): returns extra height or 0. */
  bumpAt(x: number, z: number) {
    let best = 0;
    for (const r of this.placed) {
      const d = Math.hypot(r.x - x, r.z - z);
      if (d < r.s * 0.8) best = Math.max(best, r.s * 0.6 * (1 - (d / (r.s * 0.8)) ** 2));
    }
    return best;
  }

  dispose(physics: PhysicsWorld | null) {
    if (physics) for (const col of this.colliders) physics.world.removeCollider(col, false);
    this.colliders = [];
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}

function h32b(x: number) {
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return (x ^ (x >>> 15)) >>> 0;
}
