import * as THREE from 'three';
import { GROUP, groups, PhysicsWorld, RAPIER } from '../physics/Physics';
import { Input } from '../core/Input';
import { clamp, damp, DEG } from '../core/math';
import { bus } from '../core/events';

export type PlayerMode = 'walk' | 'float' | 'seated' | 'frozen';

export interface Seat {
  /** node whose world transform defines the seated eye position (+Y up, -Z facing) */
  node: THREE.Object3D;
  eye: number;
  /** yaw/pitch limits in radians */
  yawLimit: number;
  onLeave?: () => void;
}

const STAND_H = 1.8, CROUCH_H = 1.05, RADIUS = 0.3;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0), _X = new THREE.Vector3(1, 0, 0);

/**
 * First-person character. Works under any gravity vector: "up" follows the local field
 * (planet surface, rotating habitat ring) and the controller switches to free-floating when the
 * effective gravity is negligible (docking hub, de-spun ring, coasting spacecraft).
 */
export class Player {
  /** feet position in the active zone's local frame */
  pos = new THREE.Vector3();
  prevPos = new THREE.Vector3();
  vel = new THREE.Vector3();
  up = new THREE.Vector3(0, 1, 0);
  /** orientation of the body frame (y = up); yaw and pitch are applied inside it */
  basis = new THREE.Quaternion();
  yaw = 0;
  pitch = 0;
  mode: PlayerMode = 'walk';
  grounded = false;
  crouching = false;
  height = STAND_H;
  eyeHeight = 1.66;
  private eyeSmooth = 1.66;
  private stepSmooth = 0;
  gravity = new THREE.Vector3(0, -9.81, 0);
  speedScale = 1;
  seat: Seat | null = null;
  suited = false;
  /** metres walked since last footstep event */
  private stride = 0;
  private bob = 0;
  surface = 'dirt';
  private world: PhysicsWorld | null = null;
  private body: RAPIER.RigidBody | null = null;
  private collider: RAPIER.Collider | null = null;
  private kcc: RAPIER.KinematicCharacterController | null = null;
  walkSpeed = 3.1;
  runSpeed = 6.2;
  lookEnabled = true;
  /** set by vehicles/cutscenes to fully own the camera */
  cameraOverride = false;
  airTime = 0;

  attach(world: PhysicsWorld | null) {
    this.detach();
    this.world = world;
    if (!world) return;
    const w = world.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const hh = this.height / 2 - RADIUS;
    this.collider = w.createCollider(
      RAPIER.ColliderDesc.capsule(hh, RADIUS).setCollisionGroups(groups(GROUP.PLAYER, GROUP.WORLD | GROUP.VEHICLE | GROUP.DYNAMIC | GROUP.NPC)),
      this.body,
    );
    this.kcc = w.createCharacterController(0.02);
    this.kcc.enableAutostep(0.38, 0.18, true);
    this.kcc.enableSnapToGround(0.32);
    this.kcc.setMaxSlopeClimbAngle(52 * DEG);
    this.kcc.setMinSlopeSlideAngle(42 * DEG);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(85);
    this.syncBody();
  }

  detach() {
    if (this.world && this.body) {
      const w = this.world.world;
      if (this.kcc) w.removeCharacterController(this.kcc);
      w.removeRigidBody(this.body);
    }
    this.body = null;
    this.collider = null;
    this.kcc = null;
    this.world = null;
  }

  private syncBody() {
    if (!this.body) return;
    _v.copy(this.pos).addScaledVector(this.up, this.height / 2);
    this.body.setTranslation(_v, true);
    this.body.setRotation(this.basis, true);
  }

  teleport(p: THREE.Vector3Like, yaw?: number, up?: THREE.Vector3) {
    this.pos.set(p.x, p.y, p.z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    if (up) {
      this.up.copy(up).normalize();
      this.basis.setFromUnitVectors(_Y, this.up);
    }
    if (yaw !== undefined) { this.yaw = yaw; this.pitch = 0; }
    this.stepSmooth = 0;
    this.syncBody();
    this.world?.world.propagateModifiedBodyPositionsToColliders();
  }

  setColliderEnabled(on: boolean) {
    this.collider?.setEnabled(on);
  }

  sit(seat: Seat) {
    this.seat = seat;
    this.mode = 'seated';
    this.yaw = 0;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.setColliderEnabled(false);
    bus.emit('player:sit', seat);
  }

  stand(at?: THREE.Vector3, yaw?: number) {
    const s = this.seat;
    this.seat = null;
    this.mode = 'walk';
    this.setColliderEnabled(true);
    if (at) this.teleport(at, yaw ?? this.yaw);
    s?.onLeave?.();
    bus.emit('player:stand', s);
  }

  /** Mouse / stick look. Runs every rendered frame for responsiveness. */
  look(input: Input) {
    const [dx, dy] = input.consumeLook();
    if (!this.lookEnabled) return;
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -88 * DEG, 88 * DEG);
    if (this.seat) this.yaw = clamp(this.yaw, -this.seat.yawLimit, this.seat.yawLimit);
  }

  private setHeight(h: number) {
    if (h === this.height || !this.collider) return;
    this.height = h;
    this.collider.setHalfHeight(h / 2 - RADIUS);
  }

  /** Fixed-step locomotion. */
  step(dt: number, input: Input) {
    this.prevPos.copy(this.pos);
    if (this.mode === 'seated' || this.mode === 'frozen' || !this.kcc || !this.collider || !this.body || !this.world) return;

    const gMag = this.gravity.length();
    const floating = gMag < 0.45;
    if (floating !== (this.mode === 'float')) {
      this.mode = floating ? 'float' : 'walk';
      bus.emit('player:mode', this.mode);
    }
    // Re-orient the body frame so that "up" opposes gravity, carrying yaw along (parallel transport).
    if (!floating) {
      _v.copy(this.gravity).multiplyScalar(-1 / gMag);
      if (_v.distanceToSquared(this.up) > 1e-10) {
        _v2.copy(this.up).lerp(_v, 1 - Math.exp(-8 * dt)).normalize();
        _q.setFromUnitVectors(this.up, _v2);
        this.basis.premultiply(_q).normalize();
        this.up.copy(_v2);
      }
    }
    _q.setFromAxisAngle(_Y, this.yaw);
    const fwd = _v.set(0, 0, -1).applyQuaternion(_q).applyQuaternion(this.basis);
    const right = _v2.set(1, 0, 0).applyQuaternion(_q).applyQuaternion(this.basis);
    const mx = input.axis('left', 'right', 'moveX');
    const mz = input.axis('back', 'forward', 'moveY');

    const wantCrouch = input.down('crouch') && !floating;
    if (wantCrouch !== this.crouching) {
      if (wantCrouch || this.canStand()) {
        this.crouching = wantCrouch;
        this.setHeight(wantCrouch ? CROUCH_H : STAND_H);
      }
    }
    this.eyeHeight = this.crouching ? 0.92 : 1.66;

    const desired = _v3.set(0, 0, 0);
    if (floating) {
      // Zero-g: push off in the look direction; velocity persists and bleeds off slowly (handholds, air drag).
      _q2.setFromAxisAngle(_X, this.pitch);
      const lookF = new THREE.Vector3(0, 0, -1).applyQuaternion(_q2).applyQuaternion(_q).applyQuaternion(this.basis);
      const upL = new THREE.Vector3(0, 1, 0).applyQuaternion(_q).applyQuaternion(this.basis);
      const vy = (input.down('jump') ? 1 : 0) - (input.down('crouch') ? 1 : 0);
      const acc = new THREE.Vector3().addScaledVector(lookF, mz).addScaledVector(right, mx).addScaledVector(upL, vy);
      const max = input.down('sprint') ? 3.2 : 1.7;
      if (acc.lengthSq() > 0) this.vel.addScaledVector(acc.normalize(), 4.5 * dt);
      else this.vel.multiplyScalar(Math.exp(-1.4 * dt));
      if (this.vel.length() > max) this.vel.setLength(damp(this.vel.length(), max, 6, dt));
      this.vel.addScaledVector(this.gravity, dt);
      desired.copy(this.vel).multiplyScalar(dt);
      this.kcc.disableSnapToGround();
      this.kcc.disableAutostep();
      this.grounded = false;
    } else {
      this.kcc.enableSnapToGround(0.32);
      this.kcc.enableAutostep(0.38, 0.18, true);
      const speed = (this.crouching ? 1.5 : input.down('sprint') ? this.runSpeed : this.walkSpeed) * this.speedScale;
      const wish = new THREE.Vector3().addScaledVector(fwd, mz).addScaledVector(right, mx);
      if (wish.lengthSq() > 1) wish.normalize();
      wish.multiplyScalar(speed);
      let vUp = this.vel.dot(this.up);
      const horiz = new THREE.Vector3().copy(this.vel).addScaledVector(this.up, -vUp);
      horiz.lerp(wish, 1 - Math.exp(-(this.grounded ? 11 : 1.6) * dt));
      if (this.grounded) {
        this.airTime = 0;
        if (vUp < 0) vUp = -0.5;
        if (input.pressed('jump') && !this.crouching) {
          vUp = Math.sqrt(2 * gMag * 0.5) * (this.suited ? 0.8 : 1);
          bus.emit('player:jump');
        }
      } else this.airTime += dt;
      vUp -= gMag * dt;
      vUp = Math.max(vUp, -55);
      this.vel.copy(horiz).addScaledVector(this.up, vUp);
      desired.copy(this.vel).multiplyScalar(dt);
    }

    this.kcc.setUp(this.up);
    this.body.setRotation(this.basis, true);
    this.kcc.computeColliderMovement(this.collider, desired, undefined, groups(GROUP.PLAYER, GROUP.WORLD | GROUP.VEHICLE | GROUP.DYNAMIC));
    const m = this.kcc.computedMovement();
    const wasGrounded = this.grounded;
    if (!floating) this.grounded = this.kcc.computedGrounded();
    const before = this.pos.clone();
    this.pos.x += m.x; this.pos.y += m.y; this.pos.z += m.z;
    // Movement actually achieved: kills velocity into walls / ceilings so it does not accumulate.
    if (dt > 0) {
      const ach = _v.set(m.x, m.y, m.z).multiplyScalar(1 / dt);
      if (floating) this.vel.lerp(ach, 0.6);
      else {
        const vUpWant = this.vel.dot(this.up), vUpGot = ach.dot(this.up);
        if (vUpWant > 0 && vUpGot < vUpWant * 0.5) this.vel.addScaledVector(this.up, vUpGot - vUpWant);
      }
    }
    // Smooth out the vertical pop of auto-stepping for the camera.
    const dUp = _v.copy(this.pos).sub(before).dot(this.up);
    const expected = desired.dot(this.up);
    if (!floating && this.grounded && Math.abs(dUp - expected) > 0.04 && Math.abs(dUp) < 0.6) this.stepSmooth -= dUp - Math.max(expected, -0.02);
    this.stepSmooth = damp(this.stepSmooth, 0, 12, dt);

    if (!floating && this.grounded) {
      const d = _v.copy(this.pos).sub(before);
      d.addScaledVector(this.up, -d.dot(this.up));
      const moved = d.length();
      this.stride += moved;
      this.bob += moved;
      const strideLen = input.down('sprint') ? 1.9 : 1.45;
      if (this.stride > strideLen) {
        this.stride = 0;
        bus.emit('player:footstep', { surface: this.surface, run: input.down('sprint') });
      }
      if (!wasGrounded && this.airTime > 0.25) bus.emit('player:land', { surface: this.surface });
    }
    _v.copy(this.pos).addScaledVector(this.up, this.height / 2);
    this.body.setNextKinematicTranslation(_v);
  }

  private canStand(): boolean {
    if (!this.world || !this.collider) return true;
    const o = _v.copy(this.pos).addScaledVector(this.up, CROUCH_H - 0.05);
    const hit = this.world.raycast(o, this.up, STAND_H - CROUCH_H + 0.1, groups(0xffff, GROUP.WORLD | GROUP.VEHICLE), this.collider);
    return !hit;
  }

  /** Orientation of the view in zone space. */
  viewQuaternion(out: THREE.Quaternion) {
    _q.setFromAxisAngle(_Y, this.yaw);
    _q2.setFromAxisAngle(_X, this.pitch);
    if (this.seat) {
      this.seat.node.getWorldQuaternion(out);
      return out.multiply(_q).multiply(_q2);
    }
    return out.copy(this.basis).multiply(_q).multiply(_q2);
  }

  eyePosition(out: THREE.Vector3, alpha = 1) {
    if (this.seat) {
      this.seat.node.updateWorldMatrix(true, false);
      out.set(0, this.seat.eye, 0).applyMatrix4(this.seat.node.matrixWorld);
      return out;
    }
    out.copy(this.prevPos).lerp(this.pos, alpha);
    const bobAmt = this.mode === 'walk' && this.grounded ? Math.sin(this.bob * 4.4) * 0.018 * Math.min(1, this.vel.length() / 3) : 0;
    return out.addScaledVector(this.up, this.eyeSmooth + this.stepSmooth + bobAmt);
  }

  /** Drive the camera (first person). */
  applyCamera(cam: THREE.PerspectiveCamera, alpha: number, dt: number) {
    this.eyeSmooth = damp(this.eyeSmooth, this.eyeHeight, 10, dt);
    if (this.cameraOverride) return;
    this.eyePosition(cam.position, alpha);
    this.viewQuaternion(cam.quaternion);
  }

  forward(out: THREE.Vector3) {
    return out.set(0, 0, -1).applyQuaternion(this.viewQuaternion(_q));
  }

  serialize() {
    return { pos: this.pos.toArray(), yaw: this.yaw, pitch: this.pitch, up: this.up.toArray(), suited: this.suited, crouching: this.crouching };
  }

  deserialize(d: any) {
    this.suited = !!d.suited;
    this.teleport(new THREE.Vector3().fromArray(d.pos), d.yaw, new THREE.Vector3().fromArray(d.up || [0, 1, 0]));
    this.pitch = d.pitch || 0;
  }
}
