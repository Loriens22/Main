import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { ColliderDesc, ModelInstance } from '../render/Assets';
import { nodeMatrixIn } from '../render/Assets';

export { RAPIER };

let ready: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  if (!ready) ready = RAPIER.init().then(() => undefined);
  return ready;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: RAPIER.Collider;
}

/** Collision groups: 16-bit membership << 16 | filter */
export const GROUP = {
  STATIC: 0x0001,
  PLAYER: 0x0002,
  NPC: 0x0004,
  VEHICLE: 0x0008,
  DOOR: 0x0010,
  TRIGGER: 0x0020,
};
export function groups(member: number, filter: number) {
  return (member << 16) | filter;
}

/**
 * A Rapier world for one Frame (a zone ground, a ship interior, ...).
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly doors = new Map<string, RAPIER.Collider[]>();
  private terrain: RAPIER.Collider | null = null;
  terrainCenter = new THREE.Vector2(1e9, 1e9);
  /**
   * Volumes (frame-local boxes) where the terrain is cut away for a structure under it, e.g. a tunnel driven into a
   * hillside. A height map cannot pass over a tunnel: its surface comes down through the portal. Inside these boxes
   * the player and ray queries ignore the terrain collider (the structure brings its own floor), and the terrain is
   * not drawn there (Terrain.addCut).
   */
  readonly terrainCuts: THREE.Box3[] = [];

  /** the streamed terrain heightfield collider (null before the first patch) */
  get terrainCollider() {
    return this.terrain;
  }

  inTerrainCut(p: { x: number; y: number; z: number }) {
    for (const b of this.terrainCuts) {
      if (p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z) return true;
    }
    return false;
  }

  /** a query filter that skips the terrain where a point lies in a terrain cut (undefined: no filtering needed) */
  terrainFilterAt(p: { x: number; y: number; z: number }): ((c: RAPIER.Collider) => boolean) | undefined {
    const t = this.terrain;
    if (!t || !this.terrainCuts.length || !this.inTerrainCut(p)) return undefined;
    const h = t.handle;
    return (c) => c.handle !== h;
  }

  constructor(gravity = new THREE.Vector3(0, -9.81, 0)) {
    this.world = new RAPIER.World({ x: gravity.x, y: gravity.y, z: gravity.z });
    this.world.timestep = 1 / 60;
  }

  setGravity(g: THREE.Vector3) {
    this.world.gravity = { x: g.x, y: g.y, z: g.z };
  }

  step(dt: number) {
    this.world.timestep = Math.min(dt, 1 / 30);
    if (!this.terrainCuts.length) {
      this.world.step();
      return;
    }
    // the colliders of moving bodies inside a cut, gathered now: the hook runs inside rapier's step and must not call
    // back into the world (wasm refuses the re-entrant borrow and a throwing hook silently drops every terrain contact)
    this.inCut.clear();
    this.terrainHandle = this.terrain ? this.terrain.handle : null;
    this.world.forEachRigidBody((b) => {
      if (b.isFixed()) return;
      for (let i = 0; i < b.numColliders(); i++) {
        const c = b.collider(i);
        if (this.inTerrainCut(c.translation())) this.inCut.add(c.handle);
      }
    });
    if (!this.inCut.size) {
      this.world.step();
      return;
    }
    // rapier only runs physics hooks on the stepWithEvents path: that needs an event queue (auto-drained, unused)
    this.events ??= new RAPIER.EventQueue(true);
    this.world.step(this.events, this.hooks);
  }

  private events: RAPIER.EventQueue | null = null;
  private readonly inCut = new Set<number>();
  private terrainHandle: number | null = null;

  /** bodies inside a terrain cut (a vehicle driven into the tunnel) make no contact with the terrain collider */
  private readonly hooks: RAPIER.PhysicsHooks = {
    filterContactPair: (h1, h2) => {
      const t = this.terrainHandle;
      if (t !== null && ((h1 === t && this.inCut.has(h2)) || (h2 === t && this.inCut.has(h1)))) return null;
      return RAPIER.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair: () => true,
  };

  addBox(half: THREE.Vector3, pos: THREE.Vector3, quat = new THREE.Quaternion(), data: any = {}): RAPIER.Collider {
    const d = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    const c = this.world.createCollider(d);
    (c as any).userData = data;
    return c;
  }

  addSphere(x: number, y: number, z: number, r: number, data: any = {}): RAPIER.Collider {
    const d = RAPIER.ColliderDesc.ball(r).setTranslation(x, y, z).setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    const c = this.world.createCollider(d);
    (c as any).userData = data;
    return c;
  }

  addTrimesh(positions: Float32Array, indices: Uint32Array, data: any = {}): RAPIER.Collider | null {
    const d = RAPIER.ColliderDesc.trimesh(positions, indices);
    if (!d) return null;
    d.setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    const c = this.world.createCollider(d);
    (c as any).userData = data;
    return c;
  }

  /** Bake a three geometry (with transform) into a trimesh collider. */
  addGeometry(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, data: any = {}) {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const verts = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      verts[i * 3] = v.x;
      verts[i * 3 + 1] = v.y;
      verts[i * 3 + 2] = v.z;
    }
    let idx: Uint32Array;
    if (geo.index) idx = new Uint32Array(geo.index.array as ArrayLike<number>);
    else {
      idx = new Uint32Array(pos.count);
      for (let i = 0; i < pos.count; i++) idx[i] = i;
    }
    return this.addTrimesh(verts, idx, data);
  }

  /**
   * Add colliders of a model instance placed with `matrix` relative to this world.
   * filter: 'interior' (only non-exterior), 'exterior', or 'all'.
   */
  addModelColliders(inst: ModelInstance, matrix: THREE.Matrix4, filter: 'interior' | 'exterior' | 'all' = 'all', data: any = {}) {
    const out: RAPIER.Collider[] = [];
    for (const c of inst.colliders) {
      if (filter === 'interior' && c.exterior) continue;
      if (filter === 'exterior' && !c.exterior) continue;
      out.push(...this.addColliderDesc(inst, c, matrix, data));
    }
    return out;
  }

  addColliderDesc(inst: ModelInstance, c: ColliderDesc, matrix: THREE.Matrix4, data: any = {}): RAPIER.Collider[] {
    nodeMatrixIn(c.node, inst.root, _m);
    _m.premultiply(matrix);
    if (c.kind === 'box') {
      _m.decompose(_p, _q, _s);
      const half = c.half!.clone().multiply(_s);
      const center = c.center!.clone().multiply(_s).applyQuaternion(_q).add(_p);
      const col = this.addBox(half, center, _q, { ...data, door: c.door });
      if (c.door) {
        const list = this.doors.get(c.door) ?? [];
        list.push(col);
        this.doors.set(c.door, list);
      }
      return [col];
    }
    const col = this.addGeometry(c.geometry!, _m, data);
    return col ? [col] : [];
  }

  /** Enable/disable door colliders (doors are open → walk-through). */
  setDoorOpen(id: string, open: boolean) {
    const list = this.doors.get(id);
    if (!list) return;
    for (const c of list) c.setEnabled(!open);
  }

  /**
   * Terrain patch: a heightfield centred at (cx, cz) sampled from fn(x, z) with `n` cells of `cell` metres.
   * Recreated when the player moves far from the patch centre (heightfield streaming).
   */
  setTerrainPatch(cx: number, cz: number, n: number, cell: number, fn: (x: number, z: number) => number) {
    if (this.terrain) this.world.removeCollider(this.terrain, false);
    const size = n * cell;
    const heights = new Float32Array((n + 1) * (n + 1));
    // Rapier heightfield layout (verified empirically): heights[i * (n+1) + j] with i along X and j along Z.
    for (let i = 0; i <= n; i++) {
      const x = cx - size / 2 + i * cell;
      for (let j = 0; j <= n; j++) {
        const z = cz - size / 2 + j * cell;
        heights[i * (n + 1) + j] = fn(x, z);
      }
    }
    const d = RAPIER.ColliderDesc.heightfield(n, n, heights, { x: size, y: 1, z: size })
      .setTranslation(cx, 0, cz)
      .setCollisionGroups(groups(GROUP.STATIC, 0xffff))
      // lets step() drop contacts with bodies inside a terrain cut (only consulted while cuts exist)
      .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
    this.terrain = this.world.createCollider(d);
    (this.terrain as any).userData = { terrain: true };
    this.terrainCenter.set(cx, cz);
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, filterGroups = groups(0xffff, GROUP.STATIC | GROUP.VEHICLE | GROUP.DOOR), exclude?: RAPIER.Collider): RayHit | null {
    // Rapier heightfield ray casts can miss for perfectly axis-aligned rays crossing grid lines: nudge.
    const dx = Math.abs(dir.x) < 1e-5 ? 1.3e-4 : dir.x;
    const dz = Math.abs(dir.z) < 1e-5 ? 1.1e-4 : dir.z;
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dx, y: dir.y, z: dz });
    // from inside a terrain cut (a tunnel under a hill) the terrain surface above or across the way is not there
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, filterGroups, exclude, undefined, this.terrainFilterAt(origin));
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: t,
      collider: hit.collider,
    };
  }

  dispose() {
    this.events?.free();
    this.events = null;
    this.world.free();
  }
}
