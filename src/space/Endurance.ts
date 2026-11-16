import * as THREE from 'three';
import { assets, Model } from '../render/Assets';
import { GROUP, groups, PhysicsWorld, RAPIER } from '../physics/Physics';
import { Fixture, LightPool } from '../render/LightPool';
import { DockHost, DockPort, DockingSystem } from '../vehicles/Docking';
import { clamp } from '../core/math';
import { bus } from '../core/events';

export const ENDURANCE = {
  /** outer radius of the ring (m): the 64 m reference diameter */
  ringR: 32,
  /** nominal spin for ~1 g at the outer floor */
  spinRpm: 5.25,
  mass: 480000,
};
const RPM = (2 * Math.PI) / 60;

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

/**
 * The Endurance as a place in a zone: the Blender model on a spinning node, a kinematic rigid body with convex
 * hull colliders that turns with it, its docking ports, navigation and docking lights, and the rotation system
 * (start, stop, set speed, automatic gravity control). The ring's spin is real: the ports, docked craft and
 * anything walking inside are carried by the same rotation.
 */
export class EnduranceShip implements DockHost {
  name = 'Endurance';
  /** positioned and oriented by the zone; the spin axis is this node's local +Z */
  root = new THREE.Group();
  spinNode = new THREE.Group();
  model!: Model;
  body!: RAPIER.RigidBody;
  /** spin angle (rad) at the last fixed step, and before it (for interpolation) */
  angle = 0;
  private prevAngle = 0;
  /** current and commanded spin rate (rad/s) */
  rate = ENDURANCE.spinRpm * RPM;
  targetRate = ENDURANCE.spinRpm * RPM;
  /** spin-up / spin-down authority of the ring thrusters (rad/s^2): ~1 rpm per 30 s */
  spinAccel = 0.0035;
  autoGravity = true;
  ports: DockPort[] = [];
  private navLights: Fixture[] = [];
  private flood: Fixture[] = [];
  private time = 0;
  /** extra rotation applied on top of the spin for rendering (interpolation between fixed steps) */
  visualAngle = 0;

  constructor(private phys: PhysicsWorld) {
    this.root.name = 'endurance';
    this.root.add(this.spinNode);
  }

  async load(lights: LightPool | null, docking: DockingSystem | null) {
    this.model = await assets.load('endurance');
    this.spinNode.add(this.model.root);
    this.root.updateMatrixWorld(true);
    // kinematic body: its colliders are the convex hulls authored in Blender (model space)
    this.body = this.phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const inv = new THREE.Matrix4().copy(this.model.root.matrixWorld).invert();
    for (const mesh of this.model.colliders) {
      const pos = mesh.geometry.attributes.position;
      _m.multiplyMatrices(inv, mesh.matrixWorld);
      const pts = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(_m);
        pts[i * 3] = _v.x; pts[i * 3 + 1] = _v.y; pts[i * 3 + 2] = _v.z;
      }
      const d = RAPIER.ColliderDesc.convexHull(pts);
      if (!d) continue;
      d.setFriction(0.6).setRestitution(0.05).setCollisionGroups(groups(GROUP.WORLD, 0xffff));
      this.phys.world.createCollider(d, this.body);
    }
    this.syncBody(true);
    for (const m of this.model.ofKind('dock')) {
      const p = new DockPort(m.id, String(m.data.label ?? m.id), String(m.data.port ?? 'axial'), String(m.data.accepts ?? 'ranger'), m.node, this, m.data);
      this.ports.push(p);
      docking?.addPort(p);
    }
    if (lights) for (const m of this.model.ofKind('light')) {
      const g = m.data.group;
      const f = lights.addFromMarker(m.node, m.data, true);
      if (g === 'endurance_nav') this.navLights.push(f);
      else this.flood.push(f);
    }
    return this;
  }

  port(id: string) { return this.ports.find((p) => p.id === id) ?? null; }

  get rpm() { return this.rate / RPM; }
  /** centripetal acceleration at radius r (m/s^2) */
  gravityAtRadius(r: number) { return this.rate * this.rate * r; }

  // ------------------------------------------------------------------------------------------- rotation system
  startRotation(rpm = ENDURANCE.spinRpm) { this.targetRate = clamp(rpm, 0, 8) * RPM; bus.emit('endurance:spin', this.targetRate / RPM); }
  stopRotation() { this.targetRate = 0; bus.emit('endurance:spin', 0); }
  setRotationSpeed(rpm: number) { this.startRotation(rpm); }
  /** automatic gravity control: hold 1 g (9.81 m/s^2) at the outer floor */
  setAutoGravity(on: boolean) { this.autoGravity = on; if (on) this.startRotation(Math.sqrt(9.81 / ENDURANCE.ringR) / RPM); }

  // ------------------------------------------------------------------------------------------- DockHost
  origin(out: THREE.Vector3) { return this.root.getWorldPosition(out); }
  velocity(out: THREE.Vector3) { return out.set(0, 0, 0); }
  omega(out: THREE.Vector3) { return this.spinAxis(out).multiplyScalar(this.rate); }
  spinAxis(out: THREE.Vector3) { return out.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(_q)); }

  private syncBody(now = false) {
    this.root.updateMatrixWorld(true);
    const p = this.root.getWorldPosition(_v);
    const q = this.root.getWorldQuaternion(_q).multiply(this.spinNode.quaternion);
    if (now) { this.body.setTranslation(p, true); this.body.setRotation(q, true); }
    else { this.body.setNextKinematicTranslation(p); this.body.setNextKinematicRotation(q); }
  }

  /** fixed step: spin dynamics; leaves the spin node at the physics angle so port poses are exact */
  fixedUpdate(dt: number) {
    this.time += dt;
    const d = this.targetRate - this.rate;
    this.rate += clamp(d, -this.spinAccel * dt, this.spinAccel * dt);
    this.prevAngle = this.angle;
    this.angle = (this.angle + this.rate * dt) % (Math.PI * 2);
    if (this.angle - this.prevAngle > Math.PI) this.prevAngle += Math.PI * 2;
    else if (this.prevAngle - this.angle > Math.PI) this.prevAngle -= Math.PI * 2;
    this.spinNode.quaternion.setFromAxisAngle(_z, this.angle);
    this.syncBody();
  }

  /** per frame: render at the interpolated angle (docked craft interpolate the same way) */
  update(dt: number, alpha: number) {
    this.visualAngle = this.prevAngle + (this.angle - this.prevAngle) * alpha;
    this.spinNode.quaternion.setFromAxisAngle(_z, this.visualAngle);
    const blink = (this.time % 1.5) < 0.1;
    for (let i = 0; i < this.navLights.length; i++) this.navLights[i].level = i % 3 === 0 ? (blink ? 1 : 0.15) : 1;
    void dt;
  }

  /** put the spin node back to the physics angle (call before fixed-step work that reads port poses) */
  restorePhysicsPose() { this.spinNode.quaternion.setFromAxisAngle(_z, this.angle); }

  setFloodlights(on: boolean) { for (const f of this.flood) f.on = on; }

  serialize() { return { angle: this.angle, rate: this.rate, target: this.targetRate, auto: this.autoGravity }; }
  deserialize(d: any) {
    if (!d) return;
    this.angle = this.prevAngle = d.angle ?? 0; this.rate = d.rate ?? this.rate; this.targetRate = d.target ?? this.targetRate; this.autoGravity = d.auto ?? true;
    this.spinNode.quaternion.setFromAxisAngle(_z, this.angle);
    this.syncBody(true);
  }
}

const _z = new THREE.Vector3(0, 0, 1);
