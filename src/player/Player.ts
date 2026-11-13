import * as THREE from 'three';
import { RAPIER, GROUP, groups } from '../physics/Physics';
import type { Frame, Surface } from '../world/Frame';
import type { Input } from '../core/Input';
import type { PlayerMode } from '../core/State';

const CAPSULE_R = 0.3;
const CAPSULE_HALF = 0.6; // total height 1.8
const EYE = 1.64;
const EYE_CROUCH = 1.05;

export interface SeatRef {
  id: string;
  anchor: THREE.Object3D; // seat root (frame-local hierarchy)
  eye: THREE.Object3D; // eye anchor
  frame: Frame;
  exit: () => THREE.Vector3; // exit position (frame local)
  onStand?: () => void;
  yawLimit?: number;
}

export interface LadderRef {
  id: string;
  frame: Frame;
  a: THREE.Vector3; // bottom (frame local)
  b: THREE.Vector3; // top
  exitA: THREE.Vector3;
  exitB: THREE.Vector3;
  /** frame-local direction from the climber toward the rungs (the player faces the ladder) */
  face?: THREE.Vector3;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

/**
 * First/third person controller living in a Frame. Supports arbitrary local "up" (rotating habitats),
 * microgravity floating, ladders and seats.
 */
/** water deeper than this over the feet (chest height) switches to swimming */
export const SWIM_DEPTH = 1.25;
/** floating at the surface: the feet this far under it (the head above) */
const SURFACE_FLOAT = 1.45;

export class Player {
  frame!: Frame;
  mode: PlayerMode = 'walk';
  readonly pos = new THREE.Vector3(); // feet position (frame local)
  readonly vel = new THREE.Vector3(); // frame-local velocity
  readonly up = new THREE.Vector3(0, 1, 0);
  readonly heading = new THREE.Vector3(0, 0, -1);
  pitch = 0;
  private vUp = 0;
  grounded = false;
  crouch = 0;
  sprinting = false;
  private collider: RAPIER.Collider | null = null;
  private controller: RAPIER.KinematicCharacterController | null = null;
  /** float mode orientation (frame local) */
  readonly floatQ = new THREE.Quaternion();
  seat: SeatRef | null = null;
  seatYaw = 0;
  seatPitch = 0;
  ladder: LadderRef | null = null;
  ladderT = 0;
  thirdPerson = false;
  readonly camLocal = new THREE.Matrix4();
  readonly camWorld = new THREE.Matrix4();
  private bobPhase = 0;
  private stepAcc = 0;
  onStep: ((surface: Surface, worldPos: THREE.Vector3) => void) | null = null;
  speedScale = 1; // suit encumbrance etc.
  /** water surface height (frame-local y) above a point, or null on dry worlds: deep water switches to swimming */
  water: ((p: THREE.Vector3) => number) | null = null;
  /** depth of the feet below the water surface (0 when dry); > SWIM_DEPTH: swimming */
  submerged = 0;
  /** an outside current pushing the player (m/s, frame-local), e.g. a tidal surge felt in deep water */
  readonly current = new THREE.Vector3();
  gEff = 9.81;
  noclip = false;
  /** body model for third-person */
  bodyModel: THREE.Object3D | null = null;
  readonly lastGravity = new THREE.Vector3(0, -9.81, 0);

  get yaw(): number {
    // yaw relative to the frame's -Z (only meaningful when up ≈ +Y)
    return Math.atan2(-this.heading.x, -this.heading.z);
  }

  /** Carry the player kinematically (a wave, a moving platform): set the position and clear the fall speed. */
  carry(p: THREE.Vector3) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.vUp = 0;
  }

  /** Place the player into a frame at a local position. */
  enterFrame(frame: Frame, pos: THREE.Vector3, yaw = 0, mode: PlayerMode = 'walk') {
    this.removeCollider();
    this.frame = frame;
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.vUp = 0;
    const g = frame.gravity(pos, _v);
    if (g.lengthSq() > 1e-4) this.up.copy(g).negate().normalize();
    else this.up.set(0, 1, 0);
    this.heading.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.orthoHeading();
    this.mode = mode;
    this.seat = null;
    this.ladder = null;
    this.createCollider();
    if (mode === 'float') this.floatQ.copy(this.basisQuat());
  }

  private createCollider() {
    const w = this.frame.physics.world;
    const center = this.pos.clone().addScaledVector(this.up, CAPSULE_HALF + CAPSULE_R);
    // standalone (parentless) collider: moved explicitly every step by the character controller
    this.collider = w.createCollider(
      RAPIER.ColliderDesc.capsule(CAPSULE_HALF, CAPSULE_R)
        .setTranslation(center.x, center.y, center.z)
        .setCollisionGroups(groups(GROUP.PLAYER, GROUP.STATIC | GROUP.VEHICLE | GROUP.DOOR | GROUP.NPC)),
    );
    this.controller = w.createCharacterController(0.03);
    this.controller.enableAutostep(0.35, 0.2, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(85);
  }

  removeCollider() {
    if (!this.frame || !this.collider) return;
    const w = this.frame.physics.world;
    try {
      if (this.controller) w.removeCharacterController(this.controller);
      w.removeCollider(this.collider, false);
    } catch {
      /* world disposed */
    }
    this.collider = null;
    this.controller = null;
  }

  private orthoHeading() {
    this.heading.addScaledVector(this.up, -this.heading.dot(this.up));
    if (this.heading.lengthSq() < 1e-6) {
      this.heading.set(1, 0, 0).addScaledVector(this.up, -this.up.x);
    }
    this.heading.normalize();
  }

  /** Quaternion of the walking basis: -Z = heading, +Y = up. */
  basisQuat(out = new THREE.Quaternion()) {
    const right = _v2.copy(this.heading).cross(this.up).normalize();
    _m.makeBasis(right, this.up, _v.copy(this.heading).negate());
    return out.setFromRotationMatrix(_m);
  }

  sit(seat: SeatRef) {
    this.seat = seat;
    this.mode = 'seat';
    this.seatYaw = 0;
    this.seatPitch = -0.05;
    this.removeCollider();
    if (seat.frame !== this.frame) this.frame = seat.frame;
  }

  stand() {
    const s = this.seat;
    if (!s) return;
    this.seat = null;
    const exit = s.exit();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(s.anchor.getWorldQuaternion(new THREE.Quaternion()));
    // express forward in frame local
    const inv = new THREE.Quaternion().copy(this.frame.anchor.getWorldQuaternion(new THREE.Quaternion())).invert();
    fwd.applyQuaternion(inv);
    const g = this.frame.gravity(exit, _v);
    const mode: PlayerMode = g.length() < 0.8 ? 'float' : 'walk';
    this.enterFrame(this.frame, exit, 0, mode);
    this.heading.copy(fwd);
    this.orthoHeading();
    if (mode === 'float') this.floatQ.copy(this.basisQuat());
    s.onStand?.();
  }

  grabLadder(l: LadderRef) {
    this.ladder = l;
    this.mode = 'ladder';
    const ab = _v.copy(l.b).sub(l.a);
    // never grab exactly at an end: 0 / 1 mean 'stepped off' in updateLadder
    this.ladderT = THREE.MathUtils.clamp(_v2.copy(this.pos).sub(l.a).dot(ab) / ab.lengthSq(), 0.03, 0.97);
    this.removeCollider();
    if (l.face) {
      this.up.copy(ab).normalize();
      this.heading.copy(l.face);
      this.orthoHeading();
      this.pitch = 0;
    }
  }

  update(dt: number, input: Input, opts: { sprintAllowed?: boolean } = {}) {
    if (!this.frame) return;
    switch (this.mode) {
      case 'walk':
        this.updateWalk(dt, input, opts);
        break;
      case 'float':
        this.updateFloat(dt, input);
        break;
      case 'ladder':
        this.updateLadder(dt, input);
        break;
      case 'seat':
        this.updateSeat(dt, input);
        break;
      default:
        break;
    }
    this.computeCamera();
  }

  private moveCollider(delta: THREE.Vector3, upVec: THREE.Vector3): THREE.Vector3 {
    if (!this.collider || !this.controller || this.noclip) {
      this.pos.add(delta);
      return delta;
    }
    // orient capsule along up
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upVec);
    const center = _v.copy(this.pos).addScaledVector(upVec, CAPSULE_HALF + CAPSULE_R);
    this.collider.setTranslation({ x: center.x, y: center.y, z: center.z });
    this.collider.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
    this.controller.setUp({ x: upVec.x, y: upVec.y, z: upVec.z });
    this.controller.computeColliderMovement(this.collider, { x: delta.x, y: delta.y, z: delta.z }, undefined, groups(0xffff, GROUP.STATIC | GROUP.VEHICLE | GROUP.DOOR));
    const m = this.controller.computedMovement();
    const out = new THREE.Vector3(m.x, m.y, m.z);
    this.pos.add(out);
    this.grounded = this.controller.computedGrounded();
    const nc = _v.copy(this.pos).addScaledVector(upVec, CAPSULE_HALF + CAPSULE_R);
    this.collider.setTranslation({ x: nc.x, y: nc.y, z: nc.z });
    return out;
  }

  private updateWalk(dt: number, input: Input, opts: { sprintAllowed?: boolean }) {
    const g = this.frame.gravity(this.pos, new THREE.Vector3());
    // Coriolis: changes apparent weight when walking along the spin direction in rotating frames
    if (this.frame.omega.lengthSq() > 0) {
      const cor = _v.copy(this.frame.omega).cross(this.vel).multiplyScalar(-2);
      g.add(cor);
    }
    this.lastGravity.copy(g);
    const gmag = g.length();
    this.gEff = gmag;
    if (gmag < 0.8) {
      this.mode = 'float';
      this.floatQ.copy(this.basisQuat()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch));
      return;
    }
    // re-align up (parallel transport heading)
    const targetUp = _v2.copy(g).negate().normalize();
    const oldUp = this.up.clone();
    this.up.lerp(targetUp, Math.min(1, dt * 6)).normalize();
    _q.setFromUnitVectors(oldUp, this.up);
    this.heading.applyQuaternion(_q);
    this.orthoHeading();
    // look
    _q.setFromAxisAngle(this.up, input.look.x);
    this.heading.applyQuaternion(_q);
    this.orthoHeading();
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.look.y, -1.45, 1.45);
    // crouch / sprint
    const wantCrouch = input.held('crouch');
    this.crouch = THREE.MathUtils.damp(this.crouch, wantCrouch ? 1 : 0, 10, dt);
    this.sprinting = input.held('sprint') && !wantCrouch && (opts.sprintAllowed ?? true);
    const lowG = THREE.MathUtils.clamp(gmag / 9.81, 0.35, 1.2);
    // deep water: the suit is slightly heavier than the water it displaces — the player walks the bottom slowly,
    // rises on the suit's jets (jump held) and sinks faster with crouch held
    this.submerged = this.water ? Math.max(0, this.water(this.pos) - this.pos.y) : 0;
    const swim = this.submerged > SWIM_DEPTH;
    let speed = (this.sprinting ? 4.6 : 1.75) * this.speedScale * (1 - this.crouch * 0.5) * Math.sqrt(lowG);
    if (swim) speed = (this.sprinting ? 2.3 : 1.25) * this.speedScale;
    const right = _v.copy(this.heading).cross(this.up).normalize();
    const desired = new THREE.Vector3().addScaledVector(this.heading, input.move.y).addScaledVector(right, input.move.x);
    if (desired.lengthSq() > 1) desired.normalize();
    desired.multiplyScalar(speed);
    // smooth acceleration
    const horiz = this.vel.clone().addScaledVector(this.up, -this.vel.dot(this.up));
    const accel = swim ? 2.2 : this.grounded ? 14 : 2.5;
    horiz.lerp(desired, Math.min(1, accel * dt));
    // vertical
    if (swim) {
      const want = input.held('jump') ? 1.5 : input.held('crouch') ? -1.8 : -0.35;
      // the head stops at the surface (the suit floats there with the jets held)
      const vmax = Math.min(1.5, (this.submerged - SURFACE_FLOAT) * 2);
      this.vUp = THREE.MathUtils.damp(this.vUp, Math.min(want, vmax), 2.2, dt);
      if (this.grounded && this.vUp < 0) this.vUp = -0.2;
    } else {
      if (this.grounded && this.vUp < 0) this.vUp = -0.5;
      if (this.grounded && input.pressed('jump')) this.vUp = Math.sqrt(2 * gmag * 0.55);
      this.vUp -= gmag * dt;
      this.vUp = Math.max(this.vUp, -55);
    }
    const delta = horiz.clone().multiplyScalar(dt).addScaledVector(this.up, this.vUp * dt);
    if (this.current.lengthSq() > 1e-6) delta.addScaledVector(this.current, dt);
    const moved = this.moveCollider(delta, this.up);
    this.vel.copy(moved).divideScalar(Math.max(dt, 1e-4));
    if (this.grounded && this.vUp < 0) this.vUp = 0;
    // footsteps / bob
    const hs = horiz.length();
    if (this.grounded && hs > 0.3) {
      this.bobPhase += dt * hs * 3.1;
      this.stepAcc += hs * dt;
      const stride = this.sprinting ? 1.5 : 0.8;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const s = this.frame.surfaceFn(this.pos);
        this.onStep?.(s, this.frame.localToWorld(this.pos, new THREE.Vector3()));
      }
    } else this.bobPhase *= 0.9;
  }

  private updateFloat(dt: number, input: Input) {
    const g = this.frame.gravity(this.pos, new THREE.Vector3());
    this.lastGravity.copy(g);
    this.gEff = g.length();
    // free 6-DOF look
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), input.look.x);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), input.look.y);
    this.floatQ.multiply(qYaw).multiply(qPitch);
    // gentle auto-roll towards local "up" when weak gravity exists
    if (this.gEff > 0.15) {
      const curUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.floatQ);
      const target = g.clone().negate().normalize();
      const corr = new THREE.Quaternion().setFromUnitVectors(curUp, curUp.clone().lerp(target, Math.min(1, dt * 0.6)).normalize());
      this.floatQ.premultiply(corr);
    }
    this.floatQ.normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.floatQ);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.floatQ);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(this.floatQ);
    const thrust = new THREE.Vector3()
      .addScaledVector(fwd, input.move.y)
      .addScaledVector(right, input.move.x)
      .addScaledVector(upv, (input.held('jump') ? 1 : 0) - (input.held('crouch') ? 1 : 0));
    const maxV = input.held('sprint') ? 3.5 : 2.0;
    this.vel.addScaledVector(thrust, 2.2 * dt);
    this.vel.addScaledVector(g, dt);
    if (thrust.lengthSq() < 0.01) this.vel.multiplyScalar(Math.max(0, 1 - dt * 0.9)); // grab handholds
    if (this.vel.length() > maxV) this.vel.setLength(maxV);
    const moved = this.moveCollider(this.vel.clone().multiplyScalar(dt), upv);
    if (moved.lengthSq() < this.vel.lengthSq() * dt * dt * 0.25) this.vel.multiplyScalar(0.5); // bumped
    // keep walking basis in sync
    this.up.copy(upv);
    this.heading.copy(fwd);
    this.orthoHeading();
    this.pitch = 0;
    if (this.gEff > 1.4) {
      // gravity returned (rotation spun up or moved outward): drop into walk mode
      const target = g.clone().negate().normalize();
      this.up.copy(target);
      this.heading.copy(fwd);
      this.orthoHeading();
      this.pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(fwd.dot(target), -1, 1)), -1.2, 1.2);
      this.mode = 'walk';
    }
  }

  private updateLadder(dt: number, input: Input) {
    const l = this.ladder!;
    const ab = new THREE.Vector3().subVectors(l.b, l.a);
    const len = ab.length();
    this.ladderT += (input.move.y * 1.1 * dt) / len;
    // look freely
    _q.setFromAxisAngle(this.up, input.look.x);
    this.heading.applyQuaternion(_q);
    this.orthoHeading();
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.look.y, -1.45, 1.45);
    if (this.ladderT >= 1) {
      this.ladder = null;
      this.enterFrame(this.frame, l.exitB.clone(), 0, this.frame.gravity(l.exitB, _v).length() < 0.8 ? 'float' : 'walk');
      return;
    }
    if (this.ladderT <= 0 || input.pressed('jump')) {
      this.ladder = null;
      this.enterFrame(this.frame, l.exitA.clone(), 0, this.frame.gravity(l.exitA, _v).length() < 0.8 ? 'float' : 'walk');
      return;
    }
    this.pos.copy(l.a).addScaledVector(ab, this.ladderT);
    const g = this.frame.gravity(this.pos, new THREE.Vector3());
    this.gEff = g.length();
    if (g.lengthSq() > 0.01) {
      this.up.lerp(g.negate().normalize(), Math.min(1, dt * 4)).normalize();
      this.orthoHeading();
    }
    this.stepAcc += Math.abs(input.move.y) * dt;
    if (this.stepAcc > 0.35) {
      this.stepAcc = 0;
      this.onStep?.('metal', this.frame.localToWorld(this.pos, new THREE.Vector3()));
    }
  }

  private updateSeat(dt: number, input: Input) {
    const lim = this.seat?.yawLimit ?? 2.0;
    this.seatYaw = THREE.MathUtils.clamp(this.seatYaw + input.look.x, -lim, lim);
    this.seatPitch = THREE.MathUtils.clamp(this.seatPitch + input.look.y, -1.2, 1.3);
  }

  private computeCamera() {
    if (this.mode === 'seat' && this.seat) {
      const eye = this.seat.eye;
      eye.updateWorldMatrix(true, false);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.seatPitch, this.seatYaw, 0, 'YXZ'));
      this.camWorld.copy(eye.matrixWorld).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
      // remove any scale
      const p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3();
      this.camWorld.decompose(p, r, s);
      this.camWorld.compose(p, r, new THREE.Vector3(1, 1, 1));
      this.frame.anchor.updateWorldMatrix(true, false);
      this.camLocal.copy(this.frame.anchor.matrixWorld).invert().multiply(this.camWorld);
      return;
    }
    let q: THREE.Quaternion;
    const eyeH = THREE.MathUtils.lerp(EYE, EYE_CROUCH, this.crouch);
    const camPos = this.pos.clone();
    if (this.mode === 'float') {
      q = this.floatQ.clone();
      camPos.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), eyeH - 0.9);
    } else {
      q = this.basisQuat().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch));
      const bob = this.mode === 'walk' ? Math.sin(this.bobPhase * 2) * 0.035 : 0;
      camPos.addScaledVector(this.up, eyeH + bob);
    }
    if (this.thirdPerson && this.mode !== 'float') {
      const back = new THREE.Vector3(0, 0.25, 2.6).applyQuaternion(q);
      camPos.add(back);
    }
    this.camLocal.compose(camPos, q, new THREE.Vector3(1, 1, 1));
    this.frame.anchor.updateWorldMatrix(true, false);
    this.camWorld.multiplyMatrices(this.frame.anchor.matrixWorld, this.camLocal);
  }

  /** World position of the player's feet. */
  worldPos(out = new THREE.Vector3()) {
    return this.frame.localToWorld(this.pos, out);
  }

  applyToCamera(cam: THREE.PerspectiveCamera) {
    this.camWorld.decompose(cam.position, cam.quaternion, cam.scale);
    cam.scale.set(1, 1, 1);
    cam.updateMatrixWorld(true);
  }
}
