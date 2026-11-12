import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };

export const GROUP = { WORLD: 0x0001, PLAYER: 0x0002, VEHICLE: 0x0004, NPC: 0x0008, DYNAMIC: 0x0010, SENSOR: 0x0020 };
/** Rapier packs membership (high 16 bits) and filter (low 16 bits) into one u32. */
export const groups = (member: number, filter: number) => ((member << 16) | filter) >>> 0;

let ready = false;
export async function initPhysics() {
  if (!ready) {
    await RAPIER.init();
    ready = true;
  }
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3();

/** Thin wrapper around a Rapier world with helpers to build colliders from render geometry. */
export class PhysicsWorld {
  world: RAPIER.World;
  private staticBody: RAPIER.RigidBody;

  constructor(gravity = { x: 0, y: -9.81, z: 0 }) {
    this.world = new RAPIER.World(gravity);
    this.world.timestep = 1 / 60;
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  step(dt: number) {
    this.world.timestep = dt;
    this.world.step();
  }

  /**
   * Build a triangle-mesh collider from meshes. Vertices are expressed relative to `frame`
   * (a matrix world -> body space); with no body the colliders are attached to the static world.
   */
  addTrimesh(meshes: THREE.Mesh[], opts: { body?: RAPIER.RigidBody; frameInv?: THREE.Matrix4; friction?: number; group?: number } = {}): RAPIER.Collider[] {
    const out: RAPIER.Collider[] = [];
    for (const mesh of meshes) {
      const g = mesh.geometry;
      const pos = g.attributes.position;
      if (!pos || pos.count < 3) continue;
      mesh.updateWorldMatrix(true, false);
      _m.copy(mesh.matrixWorld);
      if (opts.frameInv) _m.premultiply(opts.frameInv);
      const verts = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(_m);
        verts[i * 3] = _v.x; verts[i * 3 + 1] = _v.y; verts[i * 3 + 2] = _v.z;
      }
      let idx: Uint32Array;
      if (g.index) idx = Uint32Array.from(g.index.array as ArrayLike<number>);
      else { idx = new Uint32Array(pos.count); for (let i = 0; i < pos.count; i++) idx[i] = i; }
      // mirrored instances flip winding; Rapier trimeshes are double sided for the KCC so no fix-up is needed
      const desc = RAPIER.ColliderDesc.trimesh(verts, idx)
        .setFriction(opts.friction ?? 0.9)
        .setCollisionGroups(groups(opts.group ?? GROUP.WORLD, 0xffff));
      const c = this.world.createCollider(desc, opts.body ?? this.staticBody);
      out.push(c);
    }
    return out;
  }

  addBox(half: THREE.Vector3Like, pos: THREE.Vector3Like, quat?: THREE.Quaternion, body?: RAPIER.RigidBody, group = GROUP.WORLD) {
    const d = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(pos.x, pos.y, pos.z).setCollisionGroups(groups(group, 0xffff));
    if (quat) d.setRotation(quat);
    return this.world.createCollider(d, body ?? this.staticBody);
  }

  remove(colliders: RAPIER.Collider[]) {
    for (const c of colliders) if (this.world.colliders.contains(c.handle)) this.world.removeCollider(c, false);
  }

  /** Ray cast returning distance and normal, or null. */
  raycast(origin: THREE.Vector3Like, dir: THREE.Vector3Like, maxDist: number, filterGroups = groups(0xffff, GROUP.WORLD | GROUP.VEHICLE | GROUP.DYNAMIC), exclude?: RAPIER.Collider) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, filterGroups, exclude);
    if (!hit) return null;
    return { dist: hit.timeOfImpact, normal: hit.normal, collider: hit.collider };
  }

  dispose() {
    this.world.free();
  }
}
