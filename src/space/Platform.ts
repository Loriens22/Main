import * as THREE from 'three';
import { assets, Model } from '../render/Assets';
import { GROUP, PhysicsWorld, RAPIER } from '../physics/Physics';
import { DockHost, DockPort, DockingSystem } from '../vehicles/Docking';

/**
 * NASA's Meridian orbital platform as a place in the orbital zone: the Blender model (keel, landing deck with the
 * Ranger berth, the access arm reaching the warp ship between its rings, cradle, gantries, crane, solar wings), a
 * kinematic body with its collision, and the berth port the Ranger docks to ("AUTO LAND - ORBITAL PLATFORM").
 * It shares the warp ship's frame: the ship sits in its cradle at the platform's origin.
 */
export class OrbitalPlatform implements DockHost {
  name = 'Meridian platform';
  root = new THREE.Group();
  model!: Model;
  body!: RAPIER.RigidBody;
  ports: DockPort[] = [];
  private time = 0;

  constructor(private phys: PhysicsWorld) { this.root.name = 'platform'; }

  async load(docking: DockingSystem | null) {
    this.model = await assets.load('platform');
    this.root.add(this.model.root);
    this.root.updateMatrixWorld(true);
    this.body = this.phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    this.phys.addTrimesh(this.model.colliders, { body: this.body, frameInv: inv, friction: 0.6, group: GROUP.WORLD });
    this.sync(true);
    for (const m of this.model.ofKind('dock')) {
      const p = new DockPort(m.id, String(m.data.label ?? m.id), String(m.data.port ?? 'berth'), String(m.data.accepts ?? 'ranger'), m.node, this, m.data);
      this.ports.push(p);
      docking?.addPort(p);
    }
    return this;
  }

  port(id: string) { return this.ports.find((p) => p.id === id) ?? null; }

  // DockHost: a station holding its attitude in the LVLH frame (no spin)
  origin(out: THREE.Vector3) { return this.root.getWorldPosition(out); }
  velocity(out: THREE.Vector3) { return out.set(0, 0, 0); }
  omega(out: THREE.Vector3) { return out.set(0, 0, 0); }

  private sync(now = false) {
    this.root.updateMatrixWorld(true);
    const p = this.root.position, q = this.root.quaternion;
    if (now) { this.body.setTranslation(p, true); this.body.setRotation(q, true); }
    else { this.body.setNextKinematicTranslation(p); this.body.setNextKinematicRotation(q); }
  }

  place(pos: THREE.Vector3, quat: THREE.Quaternion, snap = false) {
    this.root.position.copy(pos);
    this.root.quaternion.copy(quat);
    this.sync(snap);
  }

  setVisible(v: boolean) {
    this.root.visible = v;
    this.body.setEnabled(v);
  }

  update(dt: number) { this.time += dt; }
}
