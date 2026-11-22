import * as THREE from 'three';
import { Model } from '../render/Assets';
import { materials } from '../render/Materials';
import { GROUP, groups, PhysicsWorld, RAPIER } from '../physics/Physics';
import { clamp, damp, moveToward } from '../core/math';
import { Fixture, LightPool } from '../render/LightPool';

export interface VehicleTuning {
  /** peak drive force per driven wheel (N) */
  engine: number;
  brake: number;
  maxSteer: number;
  topSpeed: number;
  reverseSpeed: number;
  stiffness: number;
  damping: number;
  rest: number;
  travel: number;
  grip: number;
  /** litres */
  fuelCapacity: number;
  /** litres per second at full throttle */
  burn: number;
}

export const TUNING: Record<string, VehicleTuning> = {
  pickup: { engine: 1750, brake: 70, maxSteer: 0.58, topSpeed: 38, reverseSpeed: 9, stiffness: 34, damping: 4.2, rest: 0.32, travel: 0.3, grip: 1.9, fuelCapacity: 98, burn: 0.004 },
  tractor: { engine: 11000, brake: 400, maxSteer: 0.5, topSpeed: 11, reverseSpeed: 5, stiffness: 26, damping: 4.0, rest: 0.3, travel: 0.25, grip: 2.4, fuelCapacity: 1150, burn: 0.02 },
  combine: { engine: 9000, brake: 380, maxSteer: 0.55, topSpeed: 8.5, reverseSpeed: 4, stiffness: 26, damping: 4.0, rest: 0.28, travel: 0.22, grip: 2.4, fuelCapacity: 950, burn: 0.022 },
};

interface Wheel { node: THREE.Object3D; id: string; radius: number; steer: boolean; base: THREE.Vector3; q0: THREE.Quaternion; spin: number; flip: number; parent: THREE.Object3D }

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _w = new THREE.Vector3(), _m2 = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

/**
 * A wheeled ground vehicle with two interchangeable drive modes:
 *  - 'dynamic': Rapier ray-cast suspension, engine/brake/steering forces (player-driven, or parked)
 *  - 'rail':    kinematic path following on the analytic terrain (autonomous machines far from the player)
 * The chassis frame has +Z forward; the Blender model (forward = -Z after export) is mounted rotated by 180 deg.
 */
export class WheeledVehicle {
  root = new THREE.Group();
  body: RAPIER.RigidBody;
  private ctrl: RAPIER.DynamicRayCastVehicleController | null = null;
  wheels: Wheel[] = [];
  tuning: VehicleTuning;
  mode: 'dynamic' | 'rail' = 'dynamic';
  // driver inputs
  throttle = 0;
  steerInput = 0;
  handbrake = true;
  // state
  steer = 0;
  speed = 0;
  fuel: number;
  condition = 1;
  engineOn = false;
  lightsOn = false;
  occupied = false;
  private prevPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private curPos = new THREE.Vector3();
  private curQuat = new THREE.Quaternion();
  private spec: Record<string, any>;
  private sag = 0;
  private lamps: Fixture[] = [];
  private lampMesh: THREE.Mesh | null = null;
  private front: THREE.Object3D | null;
  private rear: THREE.Object3D | null;
  private doors = new Map<string, { node: THREE.Object3D; q0: THREE.Quaternion; angle: number; t: number; target: number }>();
  /** rail mode: target pose supplied by the owner each step */
  railPos = new THREE.Vector3();
  railYaw = 0;
  railSpeed = 0;
  railSteer = 0;
  /** terrain query for rail mode */
  ground: ((x: number, z: number) => number) | null = null;
  rpm = 0;

  constructor(public id: string, public kind: string, public model: Model, private phys: PhysicsWorld, lights: LightPool | null) {
    this.tuning = TUNING[kind];
    this.fuel = this.tuning.fuelCapacity * 0.8;
    const vm = model.ofKind('vehicle')[0];
    this.spec = vm?.data ?? {};
    model.root.rotation.y = Math.PI;
    this.root.add(model.root);
    this.root.name = `vehicle:${id}`;
    this.front = model.part('front') ?? null;
    this.rear = model.part('rear') ?? null;
    const half = this.spec.half ?? [1, 2.5, 0.5];
    const mass = this.spec.mass ?? 2000;
    this.body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.03).setAngularDamping(0.5).setCanSleep(true));
    const hx = half[0], hy = half[2], hz = half[1];
    const lower = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(0, this.spec.body_z ?? 0.9, 0)
      .setMassProperties(mass, { x: 0, y: -hy * 0.55, z: 0 }, { x: (mass / 3) * (hy * hy + hz * hz), y: (mass / 3) * (hx * hx + hz * hz), z: (mass / 3) * (hx * hx + hy * hy) }, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(0.6).setCollisionGroups(groups(GROUP.VEHICLE, GROUP.WORLD | GROUP.PLAYER | GROUP.VEHICLE | GROUP.DYNAMIC | GROUP.NPC));
    phys.world.createCollider(lower, this.body);
    if (this.spec.cab_half) {
      const c = this.spec.cab_half;
      phys.world.createCollider(RAPIER.ColliderDesc.cuboid(c[0], c[2], c[1]).setTranslation(0, this.spec.cab_z, this.spec.cab_y ?? 0).setMass(1)
        .setCollisionGroups(groups(GROUP.VEHICLE, GROUP.WORLD | GROUP.PLAYER | GROUP.VEHICLE | GROUP.DYNAMIC | GROUP.NPC)), this.body);
    }
    model.root.updateWorldMatrix(true, true);
    for (const m of model.ofKind('wheel')) {
      const n = m.node;
      this.wheels.push({ node: n, id: m.id, radius: m.data.radius ?? 0.4, steer: !!m.data.steer, base: n.position.clone(), q0: n.quaternion.clone(), spin: 0, flip: Math.abs(n.rotation.z) > 1 || Math.abs(n.rotation.y) > 1 ? -1 : 1, parent: n.parent! });
    }
    for (const m of model.ofKind('vdoor')) this.doors.set(m.id, { node: m.node, q0: m.node.quaternion.clone(), angle: ((m.data.angle ?? 60) * Math.PI) / 180, t: 0, target: 0 });
    this.addGuards(model);
    // the cab's windows: clear glass with a faint tint (the dusty farmhouse glass the model is authored with hid the
    // road from the driver's seat, seen through both faces of each pane)
    const clear = materials.get('glass_vehicle', false);
    model.root.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && (me.material as THREE.Material).name === 'glass_dirty') me.material = clear; });
    if (lights) for (const m of model.ofKind('light')) { const f = lights.addFromMarker(m.node, m.data, false); f.angle = 0.42; this.lamps.push(f); }
    const lamp = model.part('headlights');
    if (lamp) {
      lamp.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.material = (me.material as THREE.MeshStandardMaterial).clone(); (me.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.02; this.lampMesh = me; } });
    }
    this.buildController();
  }

  /**
   * Solid wheels and implements for people: the chassis boxes stop the vehicle against the world, but tyres, a header
   * or an auger stand out of them. Each gets a massless collider that only people (the player, the crew) touch, so
   * nobody walks through a tractor's rear wheel; the wheels' own ground contact stays the suspension rays'. The
   * colliders follow their parts (steering, suspension, a header lowered to cut, an auger swung out).
   */
  private guards: { col: RAPIER.Collider; node: THREE.Object3D; c: THREE.Vector3; align: THREE.Quaternion }[] = [];

  private addGuards(model: Model) {
    const people = groups(GROUP.VEHICLE, GROUP.PLAYER | GROUP.NPC);
    const box = new THREE.Box3(), part = new THREE.Box3();
    const add = (node: THREE.Object3D, wheel: boolean) => {
      // the part's extent in its own frame
      node.updateWorldMatrix(true, true);
      const inv = _m.copy(node.matrixWorld).invert();
      box.makeEmpty();
      node.traverse((x) => {
        const me = x as THREE.Mesh;
        if (!me.isMesh) return;
        if (!me.geometry.boundingBox) me.geometry.computeBoundingBox();
        box.union(part.copy(me.geometry.boundingBox!).applyMatrix4(_m2.multiplyMatrices(inv, me.matrixWorld)));
      });
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(_w);
      let desc: RAPIER.ColliderDesc;
      const align = new THREE.Quaternion();
      if (wheel) {
        // a cylinder along the axle (the part's thinnest extent); Rapier's cylinders stand along Y
        const ax = sz.x <= sz.y && sz.x <= sz.z ? 'x' : sz.z <= sz.y ? 'z' : 'y';
        const w = ax === 'x' ? sz.x : ax === 'z' ? sz.z : sz.y, d = ax === 'x' ? Math.max(sz.y, sz.z) : ax === 'z' ? Math.max(sz.x, sz.y) : Math.max(sz.x, sz.z);
        if (ax === 'x') align.setFromAxisAngle(Z, Math.PI / 2);
        else if (ax === 'z') align.setFromAxisAngle(X, Math.PI / 2);
        desc = RAPIER.ColliderDesc.cylinder(Math.max(0.05, w / 2), d / 2);
      } else desc = RAPIER.ColliderDesc.cuboid(Math.max(0.05, sz.x / 2), Math.max(0.05, sz.y / 2), Math.max(0.05, sz.z / 2));
      const col = this.phys.world.createCollider(desc.setDensity(0).setCollisionGroups(people), this.body);
      this.guards.push({ col, node, c, align });
    };
    for (const m of model.ofKind('wheel')) add(m.node, true);
    for (const kind of ['lift', 'swing']) for (const m of model.ofKind(kind)) add(m.node, false);
    this.updateGuards();
  }

  /** move the people colliders onto their parts' current poses (in the chassis frame) */
  private updateGuards() {
    if (!this.guards.length) return;
    this.root.updateWorldMatrix(true, false);
    const rootInv = _m.copy(this.root.matrixWorld).invert();
    for (const g of this.guards) {
      g.node.updateWorldMatrix(true, false);
      const rel = _m2.multiplyMatrices(rootInv, g.node.matrixWorld);
      _v2.copy(g.c).applyMatrix4(rel);
      _q2.setFromRotationMatrix(rel).multiply(g.align);
      g.col.setTranslationWrtParent(_v2);
      g.col.setRotationWrtParent(_q2);
    }
  }

  private buildController() {
    const t = this.tuning;
    const w = this.phys.world;
    this.ctrl = w.createVehicleController(this.body);
    this.ctrl.indexUpAxis = 1;
    this.ctrl.setIndexForwardAxis = 2;
    this.sag = 9.81 / (this.wheels.length * t.stiffness);
    for (let i = 0; i < this.wheels.length; i++) {
      const wh = this.wheels[i];
      // wheel centre in chassis space (the model is mounted rotated 180 deg about Y)
      wh.node.getWorldPosition(_v);
      this.root.worldToLocal(_v);
      const conn = { x: _v.x, y: _v.y + (t.rest - this.sag), z: _v.z };
      this.ctrl.addWheel(conn, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, t.rest, wh.radius);
      this.ctrl.setWheelSuspensionStiffness(i, t.stiffness);
      this.ctrl.setWheelSuspensionCompression(i, t.damping);
      this.ctrl.setWheelSuspensionRelaxation(i, t.damping * 0.85);
      this.ctrl.setWheelMaxSuspensionTravel(i, t.travel);
      this.ctrl.setWheelMaxSuspensionForce(i, 1e7);
      this.ctrl.setWheelFrictionSlip(i, t.grip);
      this.ctrl.setWheelSideFrictionStiffness(i, 1.0);
    }
  }

  /** Place the vehicle (zone coordinates) with a heading (yaw, 0 = facing -Z, positive = turning left). */
  place(x: number, y: number, z: number, yaw: number) {
    // chassis +Z is forward, so a model heading of `yaw` (forward = -Z rotated by yaw) is a chassis yaw of yaw + PI
    _q.setFromAxisAngle(Y, yaw + Math.PI);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation(_q, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.curPos.set(x, y, z); this.prevPos.copy(this.curPos);
    this.curQuat.copy(_q); this.prevQuat.copy(_q);
    this.root.position.copy(this.curPos);
    this.root.quaternion.copy(this.curQuat);
    this.railPos.set(x, y, z);
    this.railYaw = yaw;
  }

  get position() { return this.curPos; }
  /** model-space heading (0 = facing -Z) */
  get yaw() {
    _v.set(0, 0, 1).applyQuaternion(this.curQuat);
    return Math.atan2(-_v.x, -_v.z);
  }
  forward(out: THREE.Vector3) { return out.set(0, 0, 1).applyQuaternion(this.curQuat); }

  setMode(mode: 'dynamic' | 'rail') {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'rail') {
      this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      this.railPos.copy(this.curPos);
      this.railYaw = this.yaw;
    } else {
      this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  setLights(on: boolean) {
    this.lightsOn = on;
    for (const f of this.lamps) f.on = on;
    if (this.lampMesh) (this.lampMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 9 : 0.02;
  }

  setDoor(id: string, open: boolean) { const d = this.doors.get(id); if (d) d.target = open ? 1 : 0; }

  fixedUpdate(dt: number) {
    this.prevPos.copy(this.curPos);
    this.prevQuat.copy(this.curQuat);
    const t = this.tuning;
    if (this.mode === 'rail') {
      // kinematic: follow the supplied rail pose, sitting on the terrain and pitched to it
      const g = this.ground;
      const x = this.railPos.x, z = this.railPos.z;
      let y = this.railPos.y;
      _q.setFromAxisAngle(Y, this.railYaw + Math.PI);
      if (g) {
        const wb = (this.spec.wheelbase ?? 3) / 2, tr = (this.spec.track ?? 2) / 2;
        const fx = -Math.sin(this.railYaw), fz = -Math.cos(this.railYaw);
        const hf = g(x + fx * wb, z + fz * wb), hr = g(x - fx * wb, z - fz * wb);
        const hl = g(x - fz * tr, z + fx * tr), hrr = g(x + fz * tr, z - fx * tr);
        y = (hf + hr + hl + hrr) / 4;
        const pitch = Math.atan2(hf - hr, wb * 2), roll = Math.atan2(hl - hrr, tr * 2);
        _q.multiply(_q2.setFromAxisAngle(X, -pitch)).multiply(_q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -roll));
      }
      this.curPos.set(x, y, z);
      this.curQuat.copy(_q);
      this.body.setNextKinematicTranslation(this.curPos);
      this.body.setNextKinematicRotation(this.curQuat);
      this.speed = this.railSpeed;
      this.steer = damp(this.steer, this.railSteer, 4, dt);
      for (const w of this.wheels) w.spin += (this.speed / w.radius) * dt;
      this.rpm = damp(this.rpm, this.engineOn ? 0.25 + Math.min(1, Math.abs(this.speed) / t.topSpeed) * 0.6 : 0, 3, dt);
      return;
    }
    const c = this.ctrl!;
    const p = this.body.translation(), r = this.body.rotation(), lv = this.body.linvel();
    this.curPos.set(p.x, p.y, p.z);
    this.curQuat.set(r.x, r.y, r.z, r.w);
    this.forward(_v);
    this.speed = _v.x * lv.x + _v.y * lv.y + _v.z * lv.z;
    const sp = Math.abs(this.speed);
    const canDrive = this.engineOn && this.fuel > 0 && this.condition > 0.05;
    let thr = canDrive ? this.throttle : 0;
    let brake = 0;
    if (this.handbrake) brake = t.brake;
    // pressing the opposite direction brakes first, then reverses
    if (thr < 0 && this.speed > 0.6) { brake = Math.max(brake, t.brake * -thr); thr = 0; }
    if (thr > 0 && this.speed < -0.6) { brake = Math.max(brake, t.brake * thr); thr = 0; }
    let force = 0;
    if (thr > 0) force = t.engine * thr * clamp(1 - sp / t.topSpeed, 0, 1) * (0.55 + 0.45 * clamp(1 - sp / (t.topSpeed * 0.5), 0, 1) + 0.45);
    else if (thr < 0) force = t.engine * thr * 0.7 * clamp(1 - sp / t.reverseSpeed, 0, 1);
    if (!this.occupied && Math.abs(thr) < 0.01) brake = Math.max(brake, t.brake * 0.6);
    // rolling resistance / engine braking
    if (Math.abs(thr) < 0.01 && !this.handbrake) brake = Math.max(brake, t.brake * 0.035);
    const steerMax = t.maxSteer / (1 + sp * 0.055);
    this.steer = moveToward(this.steer, this.steerInput * steerMax, dt * 1.8);
    const rearSteer = !!this.spec.rear_steer;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      c.setWheelEngineForce(i, force);
      c.setWheelBrake(i, brake);
      if (w.steer) c.setWheelSteering(i, rearSteer ? -this.steer : this.steer);
      else if (this.spec.articulated) c.setWheelSteering(i, w.id.startsWith('f') ? this.steer * 0.6 : -this.steer * 0.6);
    }
    if (this.body.isSleeping() && (Math.abs(force) > 1 || this.occupied)) this.body.wakeUp();
    c.updateVehicle(dt, undefined, groups(GROUP.VEHICLE, GROUP.WORLD));
    for (const w of this.wheels) w.spin += (this.speed / w.radius) * dt;
    if (canDrive) this.fuel = Math.max(0, this.fuel - t.burn * (0.08 + Math.abs(this.throttle)) * dt);
    this.rpm = damp(this.rpm, this.engineOn ? 0.18 + 0.5 * Math.min(1, sp / t.topSpeed) + 0.32 * Math.abs(thr) : 0, 4, dt);
  }

  /** Interpolated visual sync; call every rendered frame. */
  update(dt: number, alpha: number) {
    if (this.mode === 'rail') {
      this.root.position.copy(this.prevPos).lerp(this.curPos, alpha);
      this.root.quaternion.copy(this.prevQuat).slerp(this.curQuat, alpha);
    } else {
      this.root.position.copy(this.prevPos).lerp(this.curPos, alpha);
      this.root.quaternion.copy(this.prevQuat).slerp(this.curQuat, alpha);
    }
    const t = this.tuning;
    const art = this.spec.articulated ? this.steer * 0.62 : 0;
    if (this.front) this.front.rotation.y = art;
    if (this.rear) this.rear.rotation.y = -art;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      let drop = 0;
      if (this.mode === 'dynamic' && this.ctrl) {
        const len = this.ctrl.wheelSuspensionLength(i) ?? t.rest - this.sag;
        drop = len - (t.rest - this.sag);
      }
      w.node.position.set(w.base.x, w.base.y - clamp(drop, -t.travel, t.travel), w.base.z);
      const st = w.steer && !this.spec.articulated ? (this.spec.rear_steer ? -this.steer : this.steer) : 0;
      // model space: axle along X; forward is -Z, so rolling forward is a negative rotation about +X
      _q.setFromAxisAngle(Y, st);
      _q2.setFromAxisAngle(X, -w.spin * w.flip);
      w.node.quaternion.copy(_q).multiply(w.q0).multiply(_q2);
    }
    for (const d of this.doors.values()) {
      if (d.t !== d.target) {
        d.t = moveToward(d.t, d.target, dt * 2.6);
        const e = d.t * d.t * (3 - 2 * d.t);
        d.node.quaternion.copy(d.q0).multiply(_q.setFromAxisAngle(Y, d.angle * e));
      }
    }    this.updateGuards();
  }

  /** World position of a marker (exit points, seats). */
  markerWorld(kind: string, id: string, out: THREE.Vector3) {
    const n = this.model.node(kind, id);
    if (!n) return out.copy(this.root.position);
    return n.getWorldPosition(out);
  }

  serialize() {
    return { pos: this.curPos.toArray(), quat: this.curQuat.toArray(), fuel: this.fuel, condition: this.condition, lights: this.lightsOn, mode: this.mode, engineOn: this.engineOn };
  }

  deserialize(d: any) {
    if (!d) return;
    this.fuel = d.fuel ?? this.fuel;
    this.condition = d.condition ?? 1;
    this.engineOn = !!d.engineOn;
    this.setLights(!!d.lights);
    const q = new THREE.Quaternion().fromArray(d.quat);
    this.body.setTranslation({ x: d.pos[0], y: d.pos[1], z: d.pos[2] }, true);
    this.body.setRotation(q, true);
    this.curPos.fromArray(d.pos); this.prevPos.copy(this.curPos);
    this.curQuat.copy(q); this.prevQuat.copy(q);
    this.railPos.copy(this.curPos);
    this.railYaw = this.yaw;
    if (d.mode) this.setMode(d.mode);
  }
}

void _v2; void _m;
