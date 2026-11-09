import * as THREE from 'three';
import type { EarthContent, EarthSubsystem } from './EarthContent';
import { RAPIER, groups, GROUP } from '../../physics/Physics';

/**
 * Dense conifer forest on the front range and around the NASA facility.
 *
 * Trees are placed deterministically per chunk from the baked density map (EarthGen.forest) and drawn with
 * instancing in distance rings: full-detail meshes (LOD0) close by, simplified meshes (LOD1), crossed-quad
 * impostors rendered from the Blender models, and a sparse far impostor ring; beyond that the terrain shader paints
 * the canopy. Trunk colliders follow the player. Branches sway in the wind (vertex shader).
 */
const SPECIES = ['spruce', 'fir', 'pine', 'snag'] as const;
const FINE = 48; // m, fine chunk
const COARSE = 192; // m, coarse chunk (far impostors)
const TRUNK_R = [0.26, 0.3, 0.34, 0.22];

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}
interface ChunkData {
  /** per species: packed instance matrices and positions */
  mats: Float32Array[];
  pos: Float32Array[]; // x, z, scale per tree
  count: number[];
  cx: number;
  cz: number;
}
interface Ring {
  meshes: THREE.InstancedMesh[][]; // [species][part]
  cap: number;
  n: number[];
}

function hash(i: number, j: number, k: number) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Forest implements EarthSubsystem {
  private fine = new Map<number, ChunkData>();
  private coarse = new Map<number, ChunkData>();
  private rings: Ring[] = [];
  private root = new THREE.Group();
  private windMats: THREE.Material[] = [];
  private time = { value: 0 };
  private lastFine = new THREE.Vector3(1e9, 0, 1e9);
  private lastNear = new THREE.Vector3(1e9, 0, 1e9);
  private lastFar = new THREE.Vector3(1e9, 0, 1e9);
  private lastCol = new THREE.Vector3(1e9, 0, 1e9);
  private colliders = new Map<number, RAPIER.Collider>();
  private impH: number[] = [];
  private r0 = 70;
  private r1 = 240;
  private r2 = 1000;
  private r3 = 2600;
  private spacing = 4.6;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private genBudgetMs = 6;

  constructor(readonly content: EarthContent) {}

  get zone() {
    return this.content.zone;
  }

  async load() {
    const game = this.content.game;
    this.configure();
    const gltf = await game.assets.load('trees');
    const lod: Part[][][] = [[], []]; // [lod][species] -> parts
    for (let si = 0; si < SPECIES.length; si++) {
      for (const l of [0, 1]) {
        const node = gltf.scene.getObjectByName(`${SPECIES[si]}_lod${l}`);
        const parts: Part[] = [];
        node?.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mat = this.windify((m.material as THREE.Material).clone());
          parts.push({ geo: m.geometry, mat });
        });
        lod[l][si] = parts;
        if (l === 0 && node) this.impH[si] = (node.userData.imp_h as number) ?? 18;
      }
    }
    this.rings.push(this.makeRing(lod[0], 1400, true, true));
    // mid ring: three-plane impostors (6 triangles a tree) — the LOD1 meshes stay in the GLB for close-up tools
    const imp3 = SPECIES.map((sp, si) => [this.impostorPart(sp, this.impH[si] ?? 18, 3)]);
    this.rings.push(this.makeRing(imp3, 9000, false, true));
    const imp = SPECIES.map((sp, si) => [this.impostorPart(sp, this.impH[si] ?? 18, 2)]);
    this.rings.push(this.makeRing(imp, 45000, false, false));
    this.rings.push(this.makeRing(imp, 22000, false, false));
    this.zone.scene.add(this.root);
  }

  private configure() {
    const q = this.content.game.settings.graphics.vegetationDensity;
    this.r0 = 35 + 25 * q;
    this.r1 = 150 + 85 * q;
    this.r2 = 650 + 330 * q;
    this.r3 = 2200 + 500 * q;
    this.spacing = THREE.MathUtils.clamp(4.3 / Math.sqrt(Math.max(0.3, q)), 3.8, 6.2);
  }

  onSettingsChanged() {
    this.configure();
    this.fine.clear();
    this.coarse.clear();
    this.lastFine.set(1e9, 0, 1e9);
    this.lastNear.set(1e9, 0, 1e9);
    this.lastFar.set(1e9, 0, 1e9);
  }

  /** Branch/needle materials sway: displacement grows with height inside the tree. */
  private windify(mat: THREE.Material) {
    const time = this.time;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTreeTime = time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTreeTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 tip = instanceMatrix[3];
            float tph = tip.x * 0.071 + tip.z * 0.053;
            float th = max(transformed.y, 0.0);
            float sw = sin(uTreeTime * 1.05 + tph) * 0.65 + sin(uTreeTime * 2.4 + tph * 1.7) * 0.22;
            transformed.x += sw * 0.0011 * th * th;
            transformed.z += sw * 0.0007 * th * th * cos(tph);
          #endif`,
        );
    };
    mat.customProgramCacheKey = () => 'tree-wind';
    this.windMats.push(mat);
    return mat;
  }

  private impostorPart(sp: string, H: number, planes = 2): Part {
    const mats = this.content.game.materials;
    const tex = mats.tex(`imp_${sp}_rgba`, true, 1);
    const hq = H * 1.04, w = hq / 2, z0 = -0.02 * H;
    const g1 = new THREE.PlaneGeometry(w, hq).translate(0, z0 + hq / 2, 0);
    const gs = [g1];
    for (let k = 1; k < planes; k++) gs.push(g1.clone().rotateY((Math.PI * k) / planes));
    const geo = mergeGeos(gs);
    // normals point up/out so the crossed quads shade evenly like a canopy
    const n = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0, color: new THREE.Color(0.9, 0.95, 0.9) });
    return { geo, mat };
  }

  private makeRing(parts: Part[][], cap: number, castShadow: boolean, receiveShadow: boolean): Ring {
    const meshes: THREE.InstancedMesh[][] = [];
    for (let si = 0; si < parts.length; si++) {
      const list: THREE.InstancedMesh[] = [];
      let shared: THREE.InstancedBufferAttribute | null = null;
      for (const p of parts[si] ?? []) {
        const im = new THREE.InstancedMesh(p.geo, p.mat, cap);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (shared) im.instanceMatrix = shared;
        else shared = im.instanceMatrix;
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = castShadow;
        im.receiveShadow = receiveShadow;
        this.root.add(im);
        list.push(im);
      }
      meshes.push(list);
    }
    return { meshes, cap, n: parts.map(() => 0) };
  }

  // -------------------------------------------------------------------------------------------- placement
  private chunkKey(i: number, j: number) {
    return (i + 4096) * 8192 + (j + 4096);
  }

  private genChunk(i: number, j: number, size: number, spacing: number, scaleMul: number): ChunkData {
    const gen = this.zone.gen;
    const x0 = i * size, z0 = j * size;
    const n = Math.max(1, Math.round(size / spacing));
    const cell = size / n;
    const tmp: number[][] = SPECIES.map(() => []);
    const tpos: number[][] = SPECIES.map(() => []);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const gx = Math.floor(x0 / cell) + a, gz = Math.floor(z0 / cell) + b;
      const x = x0 + (a + 0.15 + 0.7 * hash(gx, gz, 1)) * cell;
      const z = z0 + (b + 0.15 + 0.7 * hash(gx, gz, 2)) * cell;
      const d = gen.forestDensity(x, z);
      if (d <= 0.02 || hash(gx, gz, 3) > Math.min(1, d * 1.15)) continue;
      const r = hash(gx, gz, 4);
      const alt = gen.height(x, z) - gen.portalLevel;
      // species mix: spruce/fir dominate, pine on lower warm slopes and the plains belt, a few dead snags
      const pinePref = 0.1 + 0.18 * THREE.MathUtils.smoothstep(-alt, -40, 80);
      const si = r < 0.045 ? 3 : r < 0.045 + pinePref ? 2 : r < 0.045 + pinePref + 0.36 ? 1 : 0;
      const sc = (0.55 + 0.7 * hash(gx, gz, 5) * (0.6 + 0.4 * d)) * scaleMul;
      const rot = hash(gx, gz, 6) * Math.PI * 2;
      const y = gen.height(x, z) - 0.2;
      this.q.setFromAxisAngle(this.up, rot);
      const lean = (hash(gx, gz, 7) - 0.5) * 0.06;
      this.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean));
      this.m4.compose(this.v.set(x, y, z), this.q, this.s.set(sc, sc * (0.92 + 0.16 * hash(gx, gz, 8)), sc));
      for (let k = 0; k < 16; k++) tmp[si].push(this.m4.elements[k]);
      tpos[si].push(x, z, sc);
    }
    return {
      mats: tmp.map((a) => new Float32Array(a)),
      pos: tpos.map((a) => new Float32Array(a)),
      count: tmp.map((a) => a.length / 16),
      cx: x0 + size / 2,
      cz: z0 + size / 2,
    };
  }

  private ensureChunks(map: Map<number, ChunkData>, size: number, cx: number, cz: number, radius: number, spacing: number, scaleMul: number, budgetMs: number) {
    const t0 = performance.now();
    const i0 = Math.floor((cx - radius) / size), i1 = Math.floor((cx + radius) / size);
    const j0 = Math.floor((cz - radius) / size), j1 = Math.floor((cz + radius) / size);
    const f = this.zone.gen.forest;
    let complete = true;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.chunkKey(i, j);
      if (map.has(k)) continue;
      const mx = i * size + size / 2, mz = j * size + size / 2;
      if (Math.hypot(mx - cx, mz - cz) > radius + size) continue;
      if (mx < f.x0 - size || mz < f.z0 - size || mx > f.x0 + f.w * f.cell + size || mz > f.z0 + f.h * f.cell + size) {
        map.set(k, { mats: [], pos: [], count: [0, 0, 0, 0], cx: mx, cz: mz });
        continue;
      }
      if (performance.now() - t0 > budgetMs) {
        complete = false;
        continue;
      }
      map.set(k, this.genChunk(i, j, size, spacing, scaleMul));
    }
    return complete;
  }

  // -------------------------------------------------------------------------------------------- rings
  private writeRing(ring: Ring, si: number, src: Float32Array, start: number, count: number) {
    const list = ring.meshes[si];
    if (!list.length || ring.n[si] + count > ring.cap) return;
    const arr = list[0].instanceMatrix.array as Float32Array;
    arr.set(src.subarray(start * 16, (start + count) * 16), ring.n[si] * 16);
    ring.n[si] += count;
  }

  private commit(ring: Ring) {
    for (let si = 0; si < ring.meshes.length; si++) {
      const list = ring.meshes[si];
      for (const m of list) m.count = ring.n[si];
      if (list.length) {
        const attr = list[0].instanceMatrix;
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, Math.max(16, ring.n[si] * 16));
        attr.needsUpdate = true;
      }
    }
  }

  /** LOD0 / LOD1 / near impostors from fine chunks around the camera. */
  private rebuildNear(cx: number, cz: number, includeImpostors: boolean) {
    const [R0, R1, R2] = this.rings;
    R0.n.fill(0);
    R1.n.fill(0);
    if (includeImpostors) R2.n.fill(0);
    const r0s = this.r0 * this.r0, r1s = this.r1 * this.r1;
    const diag = FINE * 0.75;
    for (const c of this.fine.values()) {
      const dc = Math.hypot(c.cx - cx, c.cz - cz);
      if (dc > this.r2 + diag) continue;
      for (let si = 0; si < SPECIES.length; si++) {
        const n = c.count[si];
        if (!n) continue;
        if (dc - diag > this.r1) {
          if (includeImpostors) this.writeRing(R2, si, c.mats[si], 0, n);
          continue;
        }
        const pos = c.pos[si];
        for (let t = 0; t < n; t++) {
          const dx = pos[t * 3] - cx, dz = pos[t * 3 + 1] - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r0s) this.writeRing(R0, si, c.mats[si], t, 1);
          else if (d2 < r1s) this.writeRing(R1, si, c.mats[si], t, 1);
          else if (includeImpostors) this.writeRing(R2, si, c.mats[si], t, 1);
        }
      }
    }
    this.commit(R0);
    this.commit(R1);
    if (includeImpostors) this.commit(R2);
  }

  private rebuildFar(cx: number, cz: number) {
    const R3 = this.rings[3];
    R3.n.fill(0);
    for (const c of this.coarse.values()) {
      const dc = Math.hypot(c.cx - cx, c.cz - cz);
      if (dc < this.r2 - COARSE * 0.4 || dc > this.r3 + COARSE) continue;
      for (let si = 0; si < SPECIES.length; si++) if (c.count[si]) this.writeRing(R3, si, c.mats[si], 0, c.count[si]);
    }
    this.commit(R3);
  }

  // -------------------------------------------------------------------------------------------- colliders
  private updateColliders(px: number, pz: number) {
    const phys = this.zone.ground.physics;
    const want = new Map<number, [number, number, number, number]>();
    const R = 45;
    for (const c of this.fine.values()) {
      if (Math.hypot(c.cx - px, c.cz - pz) > R + FINE) continue;
      for (let si = 0; si < SPECIES.length; si++) {
        const pos = c.pos[si];
        for (let t = 0; t < c.count[si]; t++) {
          const x = pos[t * 3], z = pos[t * 3 + 1], sc = pos[t * 3 + 2];
          if (Math.hypot(x - px, z - pz) > R) continue;
          const id = Math.round(x * 10) * 100003 + Math.round(z * 10);
          want.set(id, [x, z, TRUNK_R[si] * sc + 0.04, si]);
        }
      }
    }
    for (const [id, col] of this.colliders) {
      if (!want.has(id)) {
        phys.world.removeCollider(col, false);
        this.colliders.delete(id);
      }
    }
    for (const [id, [x, z, r]] of want) {
      if (this.colliders.has(id)) continue;
      const y = this.zone.gen.height(x, z);
      const d = RAPIER.ColliderDesc.cylinder(3.0, r).setTranslation(x, y + 2.8, z).setCollisionGroups(groups(GROUP.STATIC, 0xffff));
      const col = phys.world.createCollider(d);
      (col as any).userData = { surface: 'wood', tree: true };
      this.colliders.set(id, col);
    }
  }

  // -------------------------------------------------------------------------------------------- update
  update(dt: number) {
    this.time.value += dt;
    const cam = this.content.game.camera.getWorldPosition(this.v.clone());
    // the zone renders in frame-local coordinates; the Earth ground frame is the world here
    const cx = cam.x, cz = cam.z;
    // underground (inside the facility) the forest is fully occluded: skip drawing it
    this.root.visible = cam.y > this.zone.gen.height(cx, cz) - 12;
    const fineOk = this.ensureChunks(this.fine, FINE, cx, cz, this.r2 + FINE, this.spacing, 1.0, this.genBudgetMs);
    const coarseOk = this.ensureChunks(this.coarse, COARSE, cx, cz, this.r3 + COARSE, this.spacing * 2.6, 1.3, fineOk ? this.genBudgetMs : 1);
    const movedNear = Math.hypot(cx - this.lastNear.x, cz - this.lastNear.z);
    const movedFine = Math.hypot(cx - this.lastFine.x, cz - this.lastFine.z);
    if (movedFine > 30 || (!fineOk && movedNear > 4)) {
      this.rebuildNear(cx, cz, true);
      this.lastFine.set(cx, 0, cz);
      this.lastNear.set(cx, 0, cz);
    } else if (movedNear > 4) {
      this.rebuildNear(cx, cz, false);
      this.lastNear.set(cx, 0, cz);
    }
    if (Math.hypot(cx - this.lastFar.x, cz - this.lastFar.z) > 120 || !coarseOk) {
      this.rebuildFar(cx, cz);
      if (coarseOk) this.lastFar.set(cx, 0, cz);
    }
    // trunk colliders around the player (on foot or driving)
    const p = this.content.game.player.pos;
    if (Math.hypot(p.x - this.lastCol.x, p.z - this.lastCol.z) > 8) {
      this.updateColliders(p.x, p.z);
      this.lastCol.set(p.x, 0, p.z);
    }
    // drop far chunk caches
    if (this.fine.size > 4000) {
      for (const [k, c] of this.fine) if (Math.hypot(c.cx - cx, c.cz - cz) > this.r2 * 1.6) this.fine.delete(k);
    }
  }

  /** Warm the caches around a point synchronously (used before screenshots / on spawn). */
  prime(x: number, z: number) {
    this.ensureChunks(this.fine, FINE, x, z, this.r2 + FINE, this.spacing, 1.0, 1e9);
    this.ensureChunks(this.coarse, COARSE, x, z, this.r3 + COARSE, this.spacing * 2.6, 1.3, 1e9);
    this.rebuildNear(x, z, true);
    this.rebuildFar(x, z);
    this.lastFine.set(x, 0, z);
    this.lastNear.set(x, 0, z);
    this.lastFar.set(x, 0, z);
  }

  dispose() {
    const phys = this.zone.ground.physics;
    for (const col of this.colliders.values()) phys.world.removeCollider(col, false);
    this.colliders.clear();
    this.root.removeFromParent();
  }
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let base = 0;
  for (const g of geos) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
