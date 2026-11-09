import * as THREE from 'three';
import type { EarthContent } from './EarthContent';
import { RAPIER, GROUP, groups } from '../../physics/Physics';
import { GROUND, type GroundVehicleSpec } from '../../data/vehicles';
import type { VehicleState } from '../../core/State';
import type { Controllable } from '../../core/Controllable';
import type { Input } from '../../core/Input';
import type { ModelInstance } from '../../render/Assets';
import { FIELDS, FARM_VEHICLE_SPOTS, NASA, FARM_PROPS } from '../../data/earthLayout';
import { Loops, type LoopHandle } from '../../audio/Audio';
import { cumulative, project, pointAt, type P2 } from '../../util/spline';
import { h } from '../../ui/UI';

type TaskKind = 'parked' | 'drive' | 'harvest' | 'fieldwork' | 'route' | 'refuel' | 'repair' | 'unload';

interface Task {
  kind: TaskKind;
  path?: P2[];
  cum?: Float64Array;
  s?: number; // arc position along path
  field?: number;
  speed?: number;
  wait?: number;
  then?: Task;
  label: string;
}

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** One drivable ground vehicle (pickup, tractor, combine). */
export class GroundVehicle implements Controllable {
  readonly context = 'drive' as const;
  readonly spec: GroundVehicleSpec;
  root: THREE.Object3D;
  wheels: (THREE.Object3D | null)[] = [];
  wheelBase: THREE.Vector3[] = [];
  steerNode: THREE.Object3D | null;
  frontFrame: THREE.Object3D | null;
  reel: THREE.Object3D | null;
  auger: THREE.Object3D | null;
  doors: THREE.Object3D[] = [];
  doorBase: THREE.Quaternion[] = [];
  doorT = 0;
  doorOpenUntil = 0;
  body: RAPIER.RigidBody | null = null;
  vc: RAPIER.DynamicRayCastVehicleController | null = null;
  steer = 0;
  throttle = 0;
  brake = 0;
  speed = 0; // m/s forward
  wheelRot = 0;
  task: Task = { kind: 'parked', label: 'Parked' };
  driver: 'player' | 'ai' | null = null;
  camMode: 'cab' | 'chase' = 'cab';
  private camYaw = 0;
  private camPitch = -0.12;
  engine: LoopHandle | null = null;
  readonly heading = new THREE.Vector3(0, 0, -1);
  lights = false;
  headlights: THREE.SpotLight[] = [];
  blockedT = 0;
  tankFill = 0;
  wearReported = false;
  gpsCanvas: HTMLCanvasElement | null = null;
  gpsTex: THREE.CanvasTexture | null = null;
  private gpsT = 0;
  private lastPos = new THREE.Vector3();
  odometer = 0;

  constructor(readonly sys: GroundVehicles, readonly state: VehicleState, readonly inst: ModelInstance) {
    this.spec = GROUND[state.type];
    this.root = inst.root;
    const n = inst.nodes;
    const order = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];
    this.wheels = order.map((k) => n.get(k) ?? null);
    if (state.type === 'car' || state.type === 'tractor' || state.type === 'combine') {
      this.wheelBase = this.wheels.map((w) => (w ? w.position.clone() : new THREE.Vector3()));
    }
    this.steerNode = n.get('steer') ?? null;
    this.frontFrame = n.get('front_frame') ?? null;
    this.reel = n.get('reel') ?? null;
    this.auger = n.get('auger') ?? null;
    for (const k of ['door_L', 'door_R']) {
      const d = n.get(k);
      if (d) {
        this.doors.push(d);
        this.doorBase.push(d.quaternion.clone());
      }
    }
    this.root.position.set(...state.pos);
    this.root.quaternion.set(...state.quat);
    this.heading.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    this.lastPos.copy(this.root.position);
    if (state.type === 'car') this.setupGps();
    // headlights (spot lights, only active on the vehicle the player drives)
    for (const nm of ['light_head_L', 'light_head_R']) {
      const e = n.get(nm);
      if (!e) continue;
      const sl = new THREE.SpotLight(0xfff1d6, 0, 70, 0.55, 0.5, 1.5);
      sl.position.set(0, 0, 0);
      e.add(sl);
      const t = new THREE.Object3D();
      t.position.set(0, -0.6, -10);
      e.add(t);
      sl.target = t;
      this.headlights.push(sl);
    }
    const ai = (state.data.task as Task | undefined) ?? null;
    const fix = (t: Task) => {
      if (t.path) t.cum = cumulative(t.path);
      if (t.then) fix(t.then);
    };
    if (ai && state.type !== 'car') {
      fix(ai);
      this.task = ai;
    }
  }

  get id() {
    return this.state.id;
  }

  get game() {
    return this.sys.content.game;
  }

  // ---------------------------------------------------------------------------------------- physics
  enablePhysics() {
    if (this.body) return;
    const w = this.sys.world;
    const p = this.root.position, q = this.root.quaternion;
    const body = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y + 0.05, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.6),
    );
    const s = this.spec;
    w.createCollider(
      RAPIER.ColliderDesc.cuboid(s.chassisHalf[0], s.chassisHalf[1], s.chassisHalf[2])
        .setTranslation(0, s.chassisOffsetY, 0)
        .setMass(s.mass)
        .setFriction(0.6)
        .setCollisionGroups(groups(GROUP.VEHICLE, GROUP.STATIC | GROUP.VEHICLE | GROUP.PLAYER | GROUP.DOOR)),
      body,
    );
    const vc = w.createVehicleController(body);
    vc.indexUpAxis = 1;
    vc.setIndexForwardAxis = 2;
    s.wheelPositions.forEach((wp, i) => {
      const base = this.wheelBase[i] ?? new THREE.Vector3(...wp);
      vc.addWheel({ x: base.x, y: base.y + s.suspensionRest, z: base.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, s.suspensionRest, s.wheelRadius[i]);
      vc.setWheelSuspensionStiffness(i, s.suspensionStiffness);
      vc.setWheelSuspensionCompression(i, 4.4);
      vc.setWheelSuspensionRelaxation(i, 2.3);
      vc.setWheelMaxSuspensionTravel(i, 0.35);
      vc.setWheelFrictionSlip(i, s.kind === 'car' ? 1.9 : 2.6);
      vc.setWheelSideFrictionStiffness(i, 1.0);
      vc.setWheelMaxSuspensionForce(i, s.mass * 9.81 * 2);
    });
    this.body = body;
    this.vc = vc;
  }

  disablePhysics() {
    if (!this.body) return;
    const w = this.sys.world;
    try {
      if (this.vc) w.removeVehicleController(this.vc);
      w.removeRigidBody(this.body);
    } catch {
      /* ignore */
    }
    this.body = null;
    this.vc = null;
  }

  // ---------------------------------------------------------------------------------------- player control
  control(dt: number, input: Input) {
    const fwd = input.move.y;
    const sp = this.speed;
    // automatic gearbox: S brakes when moving forward, reverses when stopped
    if (fwd > 0.05) {
      this.throttle = fwd;
      this.brake = sp < -0.5 ? 1 : 0;
    } else if (fwd < -0.05) {
      if (sp > 0.8) {
        this.throttle = 0;
        this.brake = -fwd;
      } else {
        this.throttle = fwd * 0.6;
        this.brake = 0;
      }
    } else {
      this.throttle = 0;
      this.brake = 0.06;
    }
    if (input.held('brake')) this.brake = 1;
    const maxSteer = this.spec.maxSteer * (1 - Math.min(0.55, Math.abs(sp) / 40));
    this.steer = THREE.MathUtils.damp(this.steer, -input.move.x * maxSteer, 6, dt);
    if (input.pressed('flashlight')) this.setLights(!this.lights);
    // free look in cab
    this.camYaw = THREE.MathUtils.clamp(this.camYaw + input.look.x, -2.2, 2.2);
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + input.look.y, -0.9, 0.7);
    if (Math.abs(input.look.x) < 1e-4 && this.camMode === 'chase') this.camYaw *= 1 - dt * 0.8;
  }

  cycleCamera() {
    this.camMode = this.camMode === 'cab' ? 'chase' : 'cab';
    this.camYaw = 0;
  }

  setLights(on: boolean) {
    this.lights = on;
    this.state.lights = on;
    for (const l of this.headlights) l.intensity = on ? 60 : 0;
  }

  camera(cam: THREE.PerspectiveCamera, dt: number) {
    this.root.updateMatrixWorld(true);
    if (this.camMode === 'cab') {
      const eye = this.inst.nodes.get('eye_driver');
      const m = (eye ?? this.root).matrixWorld;
      m.decompose(cam.position, cam.quaternion, tmpV);
      cam.quaternion.multiply(tmpQ.setFromEuler(new THREE.Euler(this.camPitch, this.camYaw, 0, 'YXZ')));
    } else {
      const dist = this.spec.kind === 'car' ? 8.5 : 14;
      const height = this.spec.kind === 'car' ? 3.0 : 5.5;
      const yaw = Math.atan2(-this.heading.x, -this.heading.z) + this.camYaw;
      const target = this.root.position.clone().add(new THREE.Vector3(0, height * 0.45, 0));
      const want = target.clone().add(new THREE.Vector3(Math.sin(yaw) * dist, height, Math.cos(yaw) * dist));
      const gy = this.sys.content.zone.height(want.x, want.z) + 1.0;
      if (want.y < gy) want.y = gy;
      cam.position.lerp(want, 1 - Math.exp(-dt * 6));
      cam.lookAt(target);
    }
    cam.updateMatrixWorld(true);
  }

  exit(): boolean {
    if (Math.abs(this.speed) > 3) {
      this.game.notify('Slow down before leaving the vehicle', 'warn', 2);
      return false;
    }
    const side = this.inst.nodes.get('exit_L') ?? this.inst.nodes.get('exit_R');
    const p = side ? side.getWorldPosition(new THREE.Vector3()) : this.root.position.clone().add(new THREE.Vector3(2.5, 0, 0));
    p.y = this.sys.content.zone.height(p.x, p.z) + 0.1;
    this.openDoorsBriefly();
    this.driver = null;
    this.throttle = 0;
    this.brake = 1;
    this.game.player.enterFrame(this.sys.content.zone.ground, p, Math.atan2(-this.heading.x, -this.heading.z));
    this.game.state.player.vehicle = null;
    this.game.events.emit('vehicleExited', { id: this.id });
    this.game.ui.layer.innerHTML = '';
    this.game.input.requestLock();
    this.sys.hudFor(null);
    if (this.state.type !== 'car') this.task = { kind: 'parked', label: 'Parked (manual)' };
    return true;
  }

  enter() {
    this.driver = 'player';
    this.task = { kind: 'parked', label: 'Manual control' };
    this.game.player.removeCollider();
    this.camYaw = 0;
    this.camPitch = -0.12;
    this.openDoorsBriefly();
    this.game.setControl(this);
    this.game.state.player.vehicle = this.id;
    this.game.events.emit('vehicleEntered', { id: this.id });
    this.sys.hudFor(this);
    if (this.state.type === 'car') this.game.flag('enteredPickup', true);
    const hrs = this.sys.content.zone.localHours();
    if (hrs < 6.5 || hrs > 19.5) this.setLights(true);
  }

  openDoorsBriefly() {
    if (!this.doors.length) return;
    this.doorOpenUntil = this.sys.time + 1.6;
    this.game.audio.door('car', this.root.position);
  }

  // ---------------------------------------------------------------------------------------- update
  update(dt: number) {
    const zone = this.sys.content.zone;
    const hasDriver = this.driver === 'player';
    // AI inputs
    if (!hasDriver) this.runAI(dt);
    const s = this.spec;
    const fuelOk = this.state.fuel > 0.1 || this.game.state.creative.unlimitedResources;
    const wear = this.state.maintenance > 0.85 ? 0.6 : 1;
    if (this.body && this.vc) {
      const vc = this.vc;
      const ef = fuelOk ? -this.throttle * s.engineForce * wear : 0;
      const capped = Math.abs(this.speed) > s.maxSpeed && Math.sign(-ef) === Math.sign(this.speed) ? 0 : ef;
      s.driveWheels.forEach((i) => vc.setWheelEngineForce(i, capped / s.driveWheels.length));
      const steerSign = s.kind === 'combine' ? -1 : 1;
      s.steerWheels.forEach((i) => vc.setWheelSteering(i, this.steer * steerSign));
      for (let i = 0; i < 4; i++) vc.setWheelBrake(i, this.brake * s.brakeForce * (s.mass / 2000));
      vc.updateVehicle(dt, undefined, groups(GROUP.VEHICLE, GROUP.STATIC | GROUP.VEHICLE | GROUP.DOOR));
      this.speed = -vc.currentVehicleSpeed();
      const t = this.body.translation(), r = this.body.rotation();
      this.root.position.set(t.x, t.y, t.z);
      this.root.quaternion.set(r.x, r.y, r.z, r.w);
      // safety: never fall through the terrain
      const gy = zone.height(t.x, t.z);
      if (t.y < gy - 1.5) {
        this.body.setTranslation({ x: t.x, y: gy + 1.0, z: t.z }, true);
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      // wheels
      for (let i = 0; i < 4; i++) {
        const wn = this.wheels[i];
        if (!wn) continue;
        const susp = vc.wheelSuspensionLength(i) ?? s.suspensionRest;
        const base = this.wheelBase[i];
        if (s.kind === 'tractor' && i < 2) {
          wn.position.set(base.x, base.y + (s.suspensionRest - susp) * 0.5, base.z);
        } else wn.position.set(base.x, base.y + (s.suspensionRest - susp), base.z);
        const rot = vc.wheelRotation(i) ?? 0;
        const steerA = s.steerWheels.includes(i) && s.kind !== 'tractor' ? vc.wheelSteering(i) ?? 0 : 0;
        wn.quaternion.setFromEuler(new THREE.Euler(-rot, steerA, 0, 'YXZ'));
      }
    } else {
      // kinematic AI movement (far from the player)
      this.kinematicMove(dt);
    }
    this.heading.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    // articulation, steering wheel, reel, auger, doors
    if (this.frontFrame) this.frontFrame.quaternion.setFromAxisAngle(UP, this.steer * 0.9);
    if (this.steerNode) this.steerNode.rotation.y = this.steer * 6;
    if (this.reel) this.reel.rotation.x -= dt * (this.task.kind === 'harvest' && Math.abs(this.speed) > 0.3 ? 4.5 : 0);
    if (this.auger) {
      const target = this.task.kind === 'unload' ? 1.35 : 0;
      this.auger.rotation.y = THREE.MathUtils.damp(this.auger.rotation.y, target, 1.2, dt);
    }
    const doorOpen = this.sys.time < this.doorOpenUntil;
    this.doorT = THREE.MathUtils.damp(this.doorT, doorOpen ? 1 : 0, 6, dt);
    this.doors.forEach((d, i) => {
      const side = d.userData.side ?? (i === 0 ? -1 : 1);
      d.quaternion.copy(this.doorBase[i]).multiply(tmpQ.setFromAxisAngle(UP, -side * 1.1 * this.doorT));
    });
    // fuel & wear
    const moved = this.root.position.distanceTo(this.lastPos);
    this.lastPos.copy(this.root.position);
    if (moved < 50) {
      this.odometer += moved;
      if (!this.game.state.creative.unlimitedResources) this.state.fuel = Math.max(0, this.state.fuel - (moved / 1000) * s.fuelPerKm * (0.6 + Math.abs(this.throttle)));
      if (s.kind !== 'car') this.state.maintenance = Math.min(1, this.state.maintenance + moved * 0.000035);
    }
    if (this.state.maintenance > 0.85 && !this.wearReported && s.kind !== 'car') {
      this.wearReported = true;
      const issues = ['low hydraulic pressure', 'engine running hot — radiator screen clogged with dust', 'drive belt slipping', 'header bearing grinding'];
      this.game.notify(`${this.state.name} reports a maintenance problem: ${issues[this.id.length % issues.length]}. Command REPAIR to send it to the workshop.`, 'warn', 9);
    }
    // engine audio
    this.updateAudio(dt);
    if (this.gpsCanvas) {
      this.gpsT -= dt;
      if (this.gpsT <= 0) {
        this.gpsT = 0.2;
        this.drawGps();
      }
    }
    // write state
    const p = this.root.position, q = this.root.quaternion;
    this.state.pos = [p.x, p.y, p.z];
    this.state.quat = [q.x, q.y, q.z, q.w];
  }

  private updateAudio(dt: number) {
    const a = this.game.audio;
    if (!a.ctx) return;
    const near = this.root.position.distanceTo(this.game.camera.position) < 160;
    const running = this.driver === 'player' || (this.task.kind !== 'parked' && near);
    if (running && !this.engine) {
      this.engine = a.loop(`engine_${this.id}`, 'sfx', Loops.engine(this.spec.kind === 'car' ? 8 : 6, this.spec.kind === 'car' ? 750 : 600), {
        pos: this.driver === 'player' ? undefined : this.root.position,
        gain: this.driver === 'player' ? 0.5 : 0.8,
      });
    } else if (!running && this.engine) {
      this.engine.stop(0.6);
      this.engine = null;
    }
    if (this.engine) {
      const rpm = (this.spec.kind === 'car' ? 800 : 650) + Math.min(1, Math.abs(this.speed) / this.spec.maxSpeed) * (this.spec.kind === 'car' ? 3600 : 1500) + Math.abs(this.throttle) * 500;
      this.engine.set('rpm', rpm, 0.15);
      this.engine.set('load', Math.abs(this.throttle), 0.2);
      if (this.driver !== 'player') this.engine.setPosition(this.root.position);
    }
  }

  // ---------------------------------------------------------------------------------------- AI
  private runAI(dt: number) {
    const t = this.task;
    const spd = this.speed;
    const stop = () => {
      this.throttle = 0;
      this.brake = 1;
      this.steer *= 0.9;
    };
    switch (t.kind) {
      case 'parked':
        stop();
        return;
      case 'unload': {
        stop();
        t.wait = (t.wait ?? 18) - dt;
        this.tankFill = Math.max(0, this.tankFill - dt / 18);
        if (t.wait <= 0) this.task = t.then ?? { kind: 'parked', label: 'Parked' };
        return;
      }
      case 'refuel':
      case 'repair': {
        if (t.path && (t.s ?? 0) < (t.cum![t.cum!.length - 1] - 4)) break; // still driving there
        stop();
        t.wait = (t.wait ?? (t.kind === 'refuel' ? 8 : 25)) - dt;
        if (t.wait <= 0) {
          if (t.kind === 'refuel') this.state.fuel = this.state.fuelMax;
          else {
            this.state.maintenance = 0;
            this.wearReported = false;
          }
          this.game.notify(`${this.state.name}: ${t.kind === 'refuel' ? 'refuelled at the farm tank' : 'repaired in the workshop'}`, 'ok', 4);
          this.task = t.then ?? this.sys.returnTask(this);
        }
        return;
      }
    }
    if (!t.path || !t.cum) {
      stop();
      return;
    }
    // pure pursuit along the path
    const pos = this.root.position;
    const proj = project(t.path, pos.x, pos.z, t.cum);
    t.s = Math.max(t.s ?? 0, proj.along);
    const total = t.cum[t.cum.length - 1];
    const look = 4 + Math.abs(spd) * 0.9;
    const tgt = pointAt(t.path, t.cum, Math.min(total, t.s + look));
    const fx = this.heading.x, fz = this.heading.z;
    const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
    const ld = Math.hypot(dx, dz) || 1;
    const cross = fx * dz - fz * dx; // >0 target to the right? (three: x right, z back)
    const dot = fx * dx + fz * dz;
    const alpha = Math.atan2(cross, dot);
    const wb = Math.abs(this.spec.wheelPositions[0][2] - this.spec.wheelPositions[2][2]);
    let steer = -Math.atan2(2 * wb * Math.sin(alpha), ld);
    if (this.spec.kind === 'combine') steer = -steer * 0.8;
    this.steer = THREE.MathUtils.clamp(THREE.MathUtils.damp(this.steer, steer, 5, dt), -this.spec.maxSteer, this.spec.maxSteer);
    // speed profile: slow down at the end and in tight turns
    const remaining = total - t.s;
    let vt = (t.speed ?? this.spec.maxSpeed * 0.6) * (this.state.maintenance > 0.85 ? 0.6 : 1);
    vt = Math.min(vt, Math.max(1.2, remaining * 0.45), 2.5 + 8 / (1 + Math.abs(alpha) * 6));
    // obstacle avoidance: player or another vehicle ahead
    const blocked = this.sys.obstacleAhead(this);
    if (blocked) {
      vt = 0;
      this.blockedT += dt;
      if (this.blockedT > 4 && this.blockedT < 4.2) this.game.audio.beep(420, 0.4, 0.05, 'square', this.root.position);
    } else this.blockedT = 0;
    const err = vt - spd;
    this.throttle = THREE.MathUtils.clamp(err * 0.5, -0.2, 1);
    this.brake = err < -1.5 ? 0.6 : vt === 0 ? 1 : 0;
    // harvesting progress
    if (t.kind === 'harvest' && t.field !== undefined) {
      const corn = this.sys.corn;
      if (corn) {
        const f = FIELDS[t.field];
        const p = corn.harvest.progress[t.field] ?? 0;
        // advance progress by distance covered along the strip
        const strips = corn.harvest.strips(f);
        const len = f.rowDir === 'z' ? f.rect[3] - f.rect[1] - 4 : f.rect[2] - f.rect[0] - 4;
        const ds = Math.max(0, spd) * dt;
        const np = Math.min(1, p + ds / (len * strips));
        corn.setProgress(t.field, np);
        this.tankFill += ds / 900;
        if (this.tankFill >= 1) {
          this.game.notify(`${this.state.name}: grain tank full — unloading`, 'info', 4);
          this.task = { kind: 'unload', label: 'Unloading grain', wait: 18, then: this.sys.harvestTask(this, t.field) };
          return;
        }
        if (np >= 1) {
          this.game.notify(`${this.state.name}: Field ${t.field + 1} harvested`, 'ok', 5);
          this.task = this.sys.returnTask(this);
          return;
        }
      }
    }
    if (remaining < 2.5 && Math.abs(spd) < 1.2) {
      if (t.kind === 'route' || t.kind === 'fieldwork') {
        t.s = 0; // loop
        return;
      }
      if (t.kind === 'harvest' && t.field !== undefined) {
        this.task = this.sys.harvestTask(this, t.field);
        return;
      }
      if (t.kind === 'drive' && t.then) {
        this.task = t.then;
        return;
      }
      if (t.kind === 'drive') this.task = { kind: 'parked', label: 'Parked' };
    }
  }

  /** Simple path follower without physics (far from the player). */
  private kinematicMove(dt: number) {
    const t = this.task;
    const zone = this.sys.content.zone;
    let v = 0;
    if (t.path && t.cum && (t.kind === 'drive' || t.kind === 'harvest' || t.kind === 'route' || t.kind === 'fieldwork' || ((t.kind === 'refuel' || t.kind === 'repair') && (t.s ?? 0) < t.cum[t.cum.length - 1] - 4))) {
      v = Math.max(0, this.throttle) * (t.speed ?? this.spec.maxSpeed * 0.6) + 0.5;
      v = Math.min(v, t.speed ?? this.spec.maxSpeed * 0.6);
      t.s = (t.s ?? 0) + v * dt;
      const total = t.cum[t.cum.length - 1];
      const p = pointAt(t.path, t.cum, Math.min(total, t.s));
      const y = zone.height(p.x, p.z);
      this.root.position.set(p.x, y, p.z);
      const yaw = Math.atan2(-p.dirX, -p.dirZ);
      this.root.quaternion.setFromAxisAngle(UP, yaw);
      this.throttle = 0.6;
    }
    this.speed = v;
    // wheels spin visually
    this.wheelRot += (v * dt) / this.spec.wheelRadius[0];
    this.wheels.forEach((w, i) => {
      if (!w) return;
      w.position.copy(this.wheelBase[i]);
      w.rotation.set(-this.wheelRot, 0, 0);
    });
  }

  // ---------------------------------------------------------------------------------------- GPS
  private setupGps() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 336;
    this.gpsCanvas = c;
    this.gpsTex = new THREE.CanvasTexture(c);
    this.gpsTex.colorSpace = THREE.SRGBColorSpace;
    const scr = this.inst.nodes.get('screen_gps') as THREE.Mesh | undefined;
    if (scr) {
      scr.material = new THREE.MeshBasicMaterial({ map: this.gpsTex, toneMapped: false });
    }
    this.drawGps();
  }

  remainingRoute(): number {
    const r = this.sys.route;
    const pr = project(r.pts, this.root.position.x, this.root.position.z, r.cum);
    return Math.max(0, r.cum[r.cum.length - 1] - pr.along) + pr.dist;
  }

  drawGps() {
    const c = this.gpsCanvas!;
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height;
    g.fillStyle = '#081016';
    g.fillRect(0, 0, W, H);
    const r = this.sys.route;
    const pos = this.root.position;
    const yaw = Math.atan2(-this.heading.x, -this.heading.z);
    const scale = 0.09; // px per metre (heading-up map)
    g.save();
    g.translate(W / 2, H * 0.68);
    g.rotate(yaw);
    // fields
    g.fillStyle = 'rgba(80,110,40,0.25)';
    for (const f of FIELDS) {
      const [x0, z0, x1, z1] = f.rect;
      g.fillRect((x0 - pos.x) * scale, (z0 - pos.z) * scale, (x1 - x0) * scale, (z1 - z0) * scale);
    }
    // all roads
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const road of this.sys.content.zone.gen.roads) {
      g.strokeStyle = road.route ? '#3ea6e0' : 'rgba(180,170,150,0.45)';
      g.lineWidth = road.route ? 7 : 4;
      g.beginPath();
      road.pts.forEach((p, i) => (i ? g.lineTo((p[0] - pos.x) * scale, (p[1] - pos.z) * scale) : g.moveTo((p[0] - pos.x) * scale, (p[1] - pos.z) * scale)));
      g.stroke();
    }
    // destination
    g.fillStyle = '#e8c070';
    g.beginPath();
    g.arc((NASA.portal.x - pos.x) * scale, (NASA.portal.z - pos.z) * scale, 9, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // vehicle arrow
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(W / 2, H * 0.68 - 16);
    g.lineTo(W / 2 - 10, H * 0.68 + 10);
    g.lineTo(W / 2, H * 0.68 + 4);
    g.lineTo(W / 2 + 10, H * 0.68 + 10);
    g.closePath();
    g.fill();
    // header
    const rem = this.remainingRoute();
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, W, 58);
    g.fillStyle = '#9fd4ea';
    g.font = '600 20px Inter, sans-serif';
    g.fillText('NASA RESEARCH FACILITY', 16, 26);
    g.fillStyle = '#ffffff';
    g.font = '600 24px Inter, sans-serif';
    g.fillText(rem < 40 ? 'ARRIVED' : `${(rem / 1000).toFixed(1)} KM`, 16, 52);
    g.textAlign = 'right';
    g.font = '18px JetBrains Mono, monospace';
    g.fillText(`${Math.round(Math.abs(this.speed) * 3.6)} km/h`, W - 14, 50);
    g.textAlign = 'left';
    // next instruction
    const pr = project(r.pts, pos.x, pos.z, r.cum);
    const ahead = pointAt(r.pts, r.cum, pr.along + 120);
    const fwdx = this.heading.x, fwdz = this.heading.z;
    const ax = ahead.x - pos.x, az = ahead.z - pos.z;
    const turn = fwdx * az - fwdz * ax;
    const road = this.sys.content.zone.gen.roads.filter((rr) => rr.route).find((rr) => project(rr.pts, pos.x, pos.z, rr.cum).dist < 15);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, H - 40, W, 40);
    g.fillStyle = '#ecebe6';
    g.font = '16px Inter, sans-serif';
    const instr = rem < 40 ? 'You have arrived. Approach the security gate.' : pr.dist > 25 ? 'Return to the route' : Math.abs(turn) > 60 ? (turn > 0 ? 'Turn right ahead' : 'Turn left ahead') : `Continue on ${road?.name ?? 'route'}`;
    g.fillText(instr, 14, H - 14);
    if (this.gpsTex) this.gpsTex.needsUpdate = true;
  }

  hud() {
    /* drawn by GroundVehicles.hudFor */
  }

  dispose() {
    this.disablePhysics();
    this.engine?.stop(0.2);
    this.root.removeFromParent();
  }
}

/**
 * Fleet manager: spawns the farm vehicles, switches physics/kinematic by distance, provides AI tasks,
 * the command interface and the driving HUD.
 */
export class GroundVehicles {
  readonly list: GroundVehicle[] = [];
  readonly route: { pts: P2[]; cum: Float64Array };
  time = 0;
  private hudEl: HTMLElement | null = null;
  private hudVehicle: GroundVehicle | null = null;
  private gpsCanvasHud: HTMLCanvasElement | null = null;

  constructor(readonly content: EarthContent) {
    const pts = content.zone.gen.routePolyline();
    this.route = { pts, cum: cumulative(pts) };
  }

  get world() {
    return this.content.zone.ground.physics.world;
  }

  get corn() {
    return (this.content as any).corn as import('./Corn').CornFields | undefined;
  }

  async load() {
    const st = this.content.game.state;
    const models: Record<string, string> = { car: 'pickup', tractor: 'tractor', combine: 'combine' };
    for (const v of Object.values(st.vehicles)) {
      if (v.location !== 'earth' || !models[v.type]) continue;
      const inst = await this.content.game.assets.instance(models[v.type]);
      // snap stored height to terrain (positions from layout start at y=0)
      const gy = this.content.zone.height(v.pos[0], v.pos[2]);
      if (Math.abs(v.pos[1]) < 0.001 || v.pos[1] < gy - 0.5) v.pos[1] = gy + 0.02;
      const gv = new GroundVehicle(this, v, inst);
      this.content.zone.scene.add(gv.root);
      this.list.push(gv);
      this.registerInteraction(gv);
    }
    // grain cart prop (static, image 1)
    const cart = await this.content.game.assets.instance('graincart');
    const [cx, , cz] = FARM_PROPS.grainCart.pos;
    cart.root.position.set(cx, this.content.zone.height(cx, cz), cz);
    cart.root.rotation.y = FARM_PROPS.grainCart.yaw;
    this.content.zone.scene.add(cart.root);
    // default autonomous jobs: one combine harvesting, one tractor on a field-edge route
    const c1 = this.list.find((v) => v.id === 'combine1');
    if (c1 && !c1.state.data.task) c1.task = this.harvestTask(c1, 2);
    const t2 = this.list.find((v) => v.id === 'tractor2');
    if (t2 && !t2.state.data.task) t2.task = this.routeTask(t2, 0);
  }

  private registerInteraction(gv: GroundVehicle) {
    const game = this.content.game;
    const targets: THREE.Object3D[] = [];
    gv.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.name.startsWith('COL_')) targets.push(o);
    });
    game.interaction.add({
      id: `veh:${gv.id}`,
      targets: [gv.root],
      range: 4.5,
      label: () => (gv.driver === 'player' ? null : gv.spec.kind === 'car' ? `Drive ${gv.state.name}` : `${gv.state.name} — ${gv.task.label}  [E] commands`),
      use: () => (gv.spec.kind === 'car' ? gv.enter() : this.openCommands(gv)),
    });
  }

  // ---------------------------------------------------------------------------------------- tasks
  private mkPath(points: P2[]): { path: P2[]; cum: Float64Array } {
    const clean: P2[] = [];
    for (const p of points) {
      const l = clean[clean.length - 1];
      if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 0.5) clean.push(p);
    }
    if (clean.length < 2) clean.push([clean[0][0] + 0.1, clean[0][1] + 0.1]);
    return { path: clean, cum: cumulative(clean) };
  }

  /** Field approach: go to the strip start, then serpentine across the strips. */
  harvestTask(v: GroundVehicle, fieldId: number): Task {
    const corn = this.corn;
    const f = FIELDS[fieldId];
    const p = corn ? corn.harvest.progress[fieldId] ?? 0 : 0;
    const n = corn ? corn.harvest.strips(f) : 10;
    const pts: P2[] = [[v.root.position.x, v.root.position.z]];
    const start = corn?.harvest.pathPoint(f, p);
    if (start) pts.push([start.x - start.dirX * 12, start.z - start.dirZ * 12]);
    // remaining part of current strip + next strips (path through strip ends with headland turns)
    const s0 = Math.floor(p * n);
    for (let k = s0; k < Math.min(n, s0 + 4); k++) {
      const a = corn!.harvest.pathPoint(f, k / n + 1e-4);
      const b = corn!.harvest.pathPoint(f, (k + 1) / n - 1e-4);
      if (k === s0 && start) pts.push([start.x, start.z]);
      else pts.push([a.x, a.z]);
      pts.push([b.x, b.z]);
      // headland turn: arc outside the strip end
      pts.push([b.x + b.dirX * 6 + (f.rowDir === 'z' ? 4.5 : 0), b.z + b.dirZ * 6 + (f.rowDir === 'x' ? 4.5 : 0)]);
    }
    const { path, cum } = this.mkPath(pts);
    return { kind: 'harvest', path, cum, s: 0, field: fieldId, speed: 2.4, label: `Harvesting field ${fieldId + 1}` };
  }

  routeTask(v: GroundVehicle, fieldId: number): Task {
    const f = FIELDS[fieldId];
    const [x0, z0, x1, z1] = f.rect;
    const m = 5;
    const pts: P2[] = [[v.root.position.x, v.root.position.z], [x1 + m, z1 - 10], [x1 + m, z0 - m], [x0 - m, z0 - m], [x0 - m, z1 + m], [x1 + m, z1 + m], [x1 + m, z1 - 10]];
    const { path, cum } = this.mkPath(pts);
    return { kind: 'route', path, cum, s: 0, speed: 5, label: `Patrolling field ${fieldId + 1} edges` };
  }

  driveTo(v: GroundVehicle, x: number, z: number, then?: Task, label = 'Driving'): Task {
    // via the nearest road if far away
    const pts: P2[] = [[v.root.position.x, v.root.position.z]];
    const far = Math.hypot(x - v.root.position.x, z - v.root.position.z) > 250;
    if (far) {
      const r = this.route;
      const a = project(r.pts, v.root.position.x, v.root.position.z, r.cum);
      const b = project(r.pts, x, z, r.cum);
      const step = a.along < b.along ? 8 : -8;
      for (let s = a.along; step > 0 ? s < b.along : s > b.along; s += step) {
        const p = pointAt(r.pts, r.cum, s);
        pts.push([p.x, p.z]);
      }
    }
    pts.push([x, z]);
    const { path, cum } = this.mkPath(pts);
    return { kind: 'drive', path, cum, s: 0, speed: v.spec.maxSpeed * 0.55, then, label };
  }

  returnTask(v: GroundVehicle): Task {
    const spot = FARM_VEHICLE_SPOTS[v.id];
    const x = spot ? spot.pos[0] : 0, z = spot ? spot.pos[2] : 20;
    const t = this.driveTo(v, x, z - 8, undefined, 'Returning to the farm');
    t.path!.push([x, z]);
    t.cum = cumulative(t.path!);
    return t;
  }

  serviceTask(v: GroundVehicle, kind: 'refuel' | 'repair'): Task {
    const [x, , z] = kind === 'refuel' ? [16 + 1.5, 0, 26 + 4] : [24, 0, -14 + 9];
    const t = this.driveTo(v, x, z, undefined, kind === 'refuel' ? 'Driving to the fuel tank' : 'Driving to the workshop');
    return { ...t, kind, label: kind === 'refuel' ? 'Refuelling' : 'Repairing in workshop', then: this.returnTask(v) };
  }

  obstacleAhead(v: GroundVehicle): boolean {
    const pos = v.root.position;
    const f = v.heading;
    const check = (p: THREE.Vector3, r: number) => {
      const dx = p.x - pos.x, dz = p.z - pos.z;
      const along = dx * f.x + dz * f.z;
      const lat = Math.abs(dx * f.z - dz * f.x);
      const len = v.spec.chassisHalf[2] + 7;
      return along > 0 && along < len && lat < v.spec.chassisHalf[0] + r;
    };
    const game = this.content.game;
    if (game.player.frame === this.content.zone.ground && check(game.player.pos, 1.2)) return true;
    for (const o of this.list) {
      if (o === v) continue;
      if (check(o.root.position, o.spec.chassisHalf[0] + 0.5)) return true;
    }
    return false;
  }

  refuelNear(local: THREE.Vector3, radius: number) {
    let n = 0;
    for (const v of this.list) {
      if (v.root.position.distanceTo(local) < radius) {
        v.state.fuel = v.state.fuelMax;
        n++;
      }
    }
    this.content.game.notify(n ? `Refuelled ${n} vehicle${n > 1 ? 's' : ''} from the farm tank` : 'Bring a vehicle next to the tank to refuel it', n ? 'ok' : 'info', 3);
  }

  // ---------------------------------------------------------------------------------------- command UI
  openCommands(v: GroundVehicle) {
    const game = this.content.game;
    game.flag('commandedTractor', true);
    game.input.releaseLock();
    game.ui.openPanel(`${v.state.name.toUpperCase()} — FARM COMMAND`, (b, p) => {
      const st = v.state;
      const info = h('div', { class: 'card' }, h('h3', {}, 'STATUS'), h('div', { class: 'kv' },
        h('span', {}, 'Task'), h('span', {}, v.task.label),
        h('span', {}, 'Fuel'), h('span', {}, `${Math.round(st.fuel)} / ${st.fuelMax} L`),
        h('span', {}, 'Condition'), h('span', {}, st.maintenance > 0.85 ? 'NEEDS SERVICE' : `${Math.round((1 - st.maintenance) * 100)}%`),
        h('span', {}, 'Speed'), h('span', {}, `${(Math.abs(v.speed) * 3.6).toFixed(1)} km/h`),
        ...(v.spec.kind === 'combine' ? [h('span', {}, 'Grain tank'), h('span', {}, `${Math.round(v.tankFill * 100)}%`)] : []),
      ));
      const cmds = h('div', { class: 'menu-list', style: { marginTop: '12px' } });
      const cmd = (label: string, fn: () => void) => cmds.append(game.ui.button(label, () => { fn(); game.audio.ui('confirm'); p.close(); game.input.requestLock(); }, ''));
      if (v.spec.kind === 'combine') {
        const field = this.nearestField(v);
        cmd(`START HARVESTING (field ${field + 1})`, () => (v.task = this.harvestTask(v, field)));
      } else {
        cmd('FOLLOW ASSIGNED ROUTE', () => (v.task = this.routeTask(v, this.nearestField(v))));
      }
      cmd('STOP VEHICLE', () => (v.task = { kind: 'parked', label: 'Stopped by command' }));
      cmd('RETURN TO FARM', () => (v.task = this.returnTask(v)));
      cmd('REFUEL', () => (v.task = this.serviceTask(v, 'refuel')));
      cmd('REPAIR', () => (v.task = this.serviceTask(v, 'repair')));
      cmd('SWITCH TO MANUAL CONTROL', () => v.enter());
      const sel = game.ui.select<number>(this.nearestField(v), FIELDS.map((f) => [f.id, `Field ${f.id + 1}`] as [number, string]), () => {});
      const go = game.ui.button('MOVE TO SELECTED FIELD', () => {
        const fid = +(sel as HTMLSelectElement).value;
        const f = FIELDS[fid];
        const then = v.spec.kind === 'combine' ? this.harvestTask(v, fid) : this.routeTask(v, fid);
        v.task = this.driveTo(v, f.rect[0] - 6, (f.rect[1] + f.rect[3]) / 2, then, `Driving to field ${fid + 1}`);
        p.close();
        game.input.requestLock();
      }, 'btn small');
      b.append(info, cmds, h('div', { class: 'row', style: { marginTop: '10px' } }, sel, go));
    }, { narrow: true, onClose: () => game.input.requestLock() });
  }

  private nearestField(v: GroundVehicle) {
    let best = 0, bd = Infinity;
    for (const f of FIELDS) {
      const cx = (f.rect[0] + f.rect[2]) / 2, cz = (f.rect[1] + f.rect[3]) / 2;
      const d = Math.hypot(cx - v.root.position.x, cz - v.root.position.z);
      if (d < bd) { bd = d; best = f.id; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------------------- HUD
  hudFor(v: GroundVehicle | null) {
    const ui = this.content.game.ui;
    this.hudVehicle = v;
    this.hudEl?.remove();
    this.hudEl = null;
    ui.hud.classList.toggle('driving', !!v);
    if (!v) return;
    const el = h('div', {});
    ui.vhud.innerHTML = '';
    ui.vhud.append(el);
    if (v.gpsCanvas) {
      const box = h('div', { class: 'gps' });
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 336;
      box.append(c, h('div', { class: 'lbl' }, 'GPS'));
      box.style.height = '160px';
      box.style.width = '244px';
      ui.layer.append(box);
      this.gpsCanvasHud = c;
    }
    this.hudEl = el;
  }

  private drawHud() {
    const v = this.hudVehicle;
    if (!v || !this.hudEl) return;
    const kmh = Math.round(Math.abs(v.speed) * 3.6);
    const fuel = v.state.fuel / v.state.fuelMax;
    this.hudEl.innerHTML = `<div style="display:flex;gap:26px;align-items:flex-end">
      <div class="blk"><span class="big">${kmh}</span><span>KM/H</span></div>
      <div class="blk"><span>${v.speed < -0.3 ? 'R' : Math.abs(v.speed) < 0.3 ? 'N' : 'D'}</span><span>GEAR</span></div>
      <div class="blk"><span>${Math.round(fuel * 100)}%</span><span>FUEL</span></div>
      <div class="blk"><span>${v.camMode.toUpperCase()}</span><span>C · CAMERA</span></div>
      <div class="blk"><span>${v.lights ? 'ON' : 'OFF'}</span><span>L · LIGHTS</span></div>
      <div class="blk"><span>F</span><span>EXIT</span></div></div>`;
    if (this.gpsCanvasHud && v.gpsCanvas) {
      const g = this.gpsCanvasHud.getContext('2d')!;
      g.drawImage(v.gpsCanvas, 0, 0);
    }
  }

  // ---------------------------------------------------------------------------------------- update
  private hudT = 0;
  update(dt: number) {
    this.time += dt;
    const game = this.content.game;
    const focus = game.control instanceof GroundVehicle ? game.control.root.position : game.player.frame === this.content.zone.ground ? game.player.pos : game.camera.position;
    for (const v of this.list) {
      const d = v.root.position.distanceTo(focus);
      const wantPhys = v.driver === 'player' || d < 180;
      if (wantPhys && !v.body) v.enablePhysics();
      else if (!wantPhys && v.body) v.disablePhysics();
      v.update(dt);
      v.state.data.task = v.task.kind === 'parked' ? undefined : (stripTask(v.task) as any);
    }
    // arrival at NASA by road
    const pk = this.list.find((v) => v.id === 'pickup');
    if (pk && !game.state.flags.reachedNasa && pk.root.position.distanceTo(new THREE.Vector3(NASA.gate.pos[0], pk.root.position.y, NASA.gate.pos[2])) < 60) {
      game.flag('reachedNasa', true);
      game.notify('You have reached the NASA research facility. Park and approach the security gate on foot.', 'ok', 8);
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      this.drawHud();
    }
  }

  focusXZ(): THREE.Vector2 | null {
    const c = this.content.game.control;
    if (c instanceof GroundVehicle) return new THREE.Vector2(c.root.position.x, c.root.position.z);
    return null;
  }

  recover() {
    for (const v of this.list) {
      const spot = FARM_VEHICLE_SPOTS[v.id];
      if (!spot) continue;
      v.disablePhysics();
      v.root.position.set(spot.pos[0], this.content.zone.height(spot.pos[0], spot.pos[2]) + 0.1, spot.pos[2]);
      v.root.quaternion.set(...spot.quat);
      v.task = { kind: 'parked', label: 'Recovered' };
    }
    this.content.game.notify('All farm vehicles returned to the farmyard', 'ok', 3);
  }

  writeState() {
    for (const v of this.list) {
      const p = v.root.position, q = v.root.quaternion;
      v.state.pos = [p.x, p.y, p.z];
      v.state.quat = [q.x, q.y, q.z, q.w];
      v.state.data.task = v.task.kind === 'parked' ? undefined : (stripTask(v.task) as any);
    }
  }

  spawnInFrame(_spec: unknown) {
    return false;
  }
}

/** Tasks hold typed arrays; convert for JSON save. */
function stripTask(t: Task): unknown {
  return { ...t, cum: undefined, path: t.path, then: t.then ? stripTask(t.then) : undefined };
}
