import * as THREE from 'three';
import { assets, Model } from '../render/Assets';
import { materials } from '../render/Materials';
import { GROUP, PhysicsWorld, RAPIER } from '../physics/Physics';

/**
 * The warp starship WSV-1 HALCYON as a place in a zone: the Blender model (hull, the two field rings as separate
 * objects, glass), a kinematic rigid body carrying its collision boxes, and the idle look of the field rings (their
 * light channels breathing slowly while the drive is on standby). The zone positions `root`.
 */
export class WarpShip {
  name = 'WSV-1 Halcyon';
  root = new THREE.Group();
  model!: Model;
  body!: RAPIER.RigidBody;
  /** the field-ring light channels (a private copy of warp_glow, so the rings can breathe and later spool up) */
  glow!: THREE.MeshStandardMaterial;
  /** 0 standby .. 1 field fully up */
  field = 0;
  private time = 0;

  constructor(private phys: PhysicsWorld) { this.root.name = 'warpship'; }

  async load() {
    this.model = await assets.load('warpship');
    this.root.add(this.model.root);
    this.glow = materials.unique('warp_glow') as THREE.MeshStandardMaterial;
    this.model.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (Array.isArray(m.material)) m.material = m.material.map((x) => (x.name === 'warp_glow' ? this.glow : x));
      else if (m.material?.name === 'warp_glow') m.material = this.glow;
    });
    this.root.updateMatrixWorld(true);
    this.body = this.phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    this.phys.addTrimesh(this.model.colliders, { body: this.body, frameInv: inv, friction: 0.6, group: GROUP.WORLD });
    this.sync(true);
    return this;
  }

  /** a marker's pose in zone space */
  marker(kind: string, id: string) { return this.model.markerPose(kind, id); }

  private sync(now = false) {
    this.root.updateMatrixWorld(true);
    const p = this.root.position, q = this.root.quaternion;
    if (now) { this.body.setTranslation(p, true); this.body.setRotation(q, true); }
    else { this.body.setNextKinematicTranslation(p); this.body.setNextKinematicRotation(q); }
  }

  /** place the ship (zone frame); `snap` teleports the body instead of sweeping it */
  place(pos: THREE.Vector3, quat: THREE.Quaternion, snap = false) {
    this.root.position.copy(pos);
    this.root.quaternion.copy(quat);
    this.sync(snap);
  }

  setVisible(v: boolean) {
    this.root.visible = v;
    this.body.setEnabled(v);
  }

  update(dt: number) {
    this.time += dt;
    // standby: a slow breath in the light channels; with the field up they burn steadily and brighter
    const breath = 0.5 + 0.5 * Math.sin(this.time * 0.9);
    this.glow.emissiveIntensity = (1 - this.field) * (1.1 + 0.9 * breath) + this.field * 4.5;
  }

  dispose() {
    if (this.phys.world.bodies.contains(this.body.handle)) this.phys.world.removeRigidBody(this.body);
  }
}
