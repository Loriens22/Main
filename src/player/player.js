// ---------------------------------------------------------------------------
// First/third-person player controller.
//
// The player is a 2.00 m tall human (eye height 1.87 m). Physics: capsule vs
// the 2.5D collision world (walls, stairs, furniture, terrain), step-up of
// 0.45 m with smoothed camera, slope sliding, crouching (with ceiling
// check), sprinting, jumping, swimming in water, optional creative flight,
// per-world gravity/speed/jump rules (low-gravity portal dimensions...).
// The rigged avatar (characters/humanoid.js) is driven from the same state
// so that the full body is visible when looking down, in third person and
// in mirrors.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, settings } from '../core/context.js';

const PLAYER_HEIGHT = 2.0;
const EYE_HEIGHT = 1.87;
const CROUCH_HEIGHT = 1.3;
const CROUCH_EYE = 1.2;
const RADIUS = 0.3;
const STEP = 0.45;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.height = PLAYER_HEIGHT;
    this.eyeHeight = EYE_HEIGHT;
    this.radius = RADIUS;
    this.grounded = false;
    this.crouching = false;
    this.sprinting = false;
    this.swimming = false;
    this.flying = false;
    this.sitting = null;       // seat descriptor
    this.vehicle = null;       // vehicle entity being driven
    this.cameraMode = settings.thirdPerson ? 'third' : 'first';
    this.tpDistance = 3.6;
    this.eyeSmoothY = 0;
    this.bobPhase = 0;
    this.speed = 0;
    this.moveInput = new THREE.Vector2();
    this.avatar = null;
    this.landTimer = 0;
    this.airTime = 0;
    this.jumpedAt = -10;
    this.gesture = null;
    this.stepAccumulator = 0;
    this.onStep = null;
    this.onLand = null;
    this.held = null;          // picked-up prop
    this._camTarget = new THREE.Vector3();
    this._tpCam = new THREE.Vector3();
    this.fov = settings.fov;
  }

  get feet() { return this.position; }
  get eyePos() { return new THREE.Vector3(this.position.x, this.position.y + this.eyeSmoothY, this.position.z); }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  teleport(pos, yaw) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.eyeSmoothY = this.eyeHeight;
    this.grounded = false;
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === 'first' ? 'third' : 'first';
    settings.thirdPerson = this.cameraMode === 'third';
    if (this.avatar) this.avatar.setFirstPerson(this.cameraMode === 'first' && !this.vehicle);
  }

  update(dt, input, world) {
    const rules = world.rules;
    // Look.
    const look = input.lookDelta();
    this.yaw -= look.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.dy, -1.5, 1.5);
    if (this.cameraMode === 'third' && input.wheel) this.tpDistance = THREE.MathUtils.clamp(this.tpDistance + input.wheel * 0.6, 1.4, 14);

    if (this.vehicle) { this.vehicle.drive(dt, input, this); this._updateCamera(dt, world); return; }
    if (this.sitting) {
      if (input.pressed('jump') || input.moveAxes().y !== 0 && Math.abs(input.moveAxes().y) > 0.5) this.standUp();
      else { this._updateCamera(dt, world); return; }
    }

    const ax = input.moveAxes();
    this.moveInput.set(ax.x, ax.y);
    const C = world.colliders;

    // Crouch (hold) with ceiling check on stand-up.
    const wantCrouch = input.held('crouch') && !this.flying;
    if (wantCrouch !== this.crouching) {
      if (wantCrouch) this.crouching = true;
      else {
        const ceil = C.ceilingHeight(this.position.x, this.position.z, this.radius, this.position.y, this.position.y + PLAYER_HEIGHT);
        if (ceil > this.position.y + PLAYER_HEIGHT) this.crouching = false;
      }
    }
    this.height = this.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
    const targetEye = this.crouching ? CROUCH_EYE : EYE_HEIGHT;

    // Water.
    const water = world.waterAt ? world.waterAt(this.position.x, this.position.z) : world.waterLevel;
    const inWater = rules.water || (water > -1e8 && this.position.y < water - 1.1);
    this.swimming = inWater && !this.flying;

    // Desired horizontal velocity.
    const fwd = this.forward(_v1);
    const right = _v2.set(-fwd.z, 0, fwd.x);
    const wish = _v3.set(0, 0, 0).addScaledVector(fwd, ax.y).addScaledVector(right, ax.x);
    this.sprinting = ax.sprint && ax.y > 0.3 && !this.crouching;
    let speed = (this.crouching ? 1.6 : this.sprinting ? 7.2 : 3.4) * (rules.speed || 1);
    if (this.swimming) speed *= 0.55;
    if (this.flying) speed = this.sprinting ? 42 : 14;
    wish.multiplyScalar(speed);

    if (this.flying) {
      const vy = (input.held('jump') ? 1 : 0) - (input.held('crouch') ? 1 : 0);
      const lookUp = Math.sin(this.pitch) * ax.y;
      const target = _v4.set(wish.x, (vy + lookUp) * speed * 0.8, wish.z);
      this.velocity.lerp(target, 1 - Math.exp(-dt * 6));
      this.position.addScaledVector(this.velocity, dt);
      C.resolve(this.position, this.radius, this.height, 0.1);
      const g = C.groundHeight(this.position.x, this.position.z, this.radius, this.position.y, 0.2);
      if (this.position.y < g) { this.position.y = g; this.velocity.y = Math.max(0, this.velocity.y); }
      this.grounded = false;
    } else {
      const accel = this.grounded ? 14 : (this.swimming ? 4 : 2.2);
      const k = 1 - Math.exp(-dt * accel);
      this.velocity.x += (wish.x - this.velocity.x) * k;
      this.velocity.z += (wish.z - this.velocity.z) * k;
      // Gravity / buoyancy.
      const grav = rules.gravity ?? 9.81;
      if (this.swimming) {
        const surfaceDepth = rules.water ? 0 : (water - 0.35) - (this.position.y + 1.4);
        const buoy = rules.water ? 0 : THREE.MathUtils.clamp(surfaceDepth * 4, -3, 6);
        this.velocity.y += (buoy - grav * 0.1) * dt;
        if (input.held('jump')) this.velocity.y += 7 * dt;
        if (input.held('crouch')) this.velocity.y -= 5 * dt;
        this.velocity.y *= Math.exp(-dt * 2.5);
      } else {
        this.velocity.y -= grav * dt;
        if (rules.drag) this.velocity.multiplyScalar(Math.exp(-dt * rules.drag));
      }
      this.velocity.y = Math.max(this.velocity.y, -55);
      // Jump.
      if (input.pressed('jump') && this.grounded && !this.swimming) {
        const h = 1.05 * (rules.jump || 1);
        this.velocity.y = Math.sqrt(2 * grav * h);
        this.grounded = false;
        this.jumpedAt = G.time;
        if (this.avatar) this.avatar.triggerJump();
      }

      // Integrate horizontally, then resolve walls.
      const prevY = this.position.y;
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      C.resolve(this.position, this.radius, this.height, STEP);
      this._resolveNPCs(world);

      // Vertical + ground.
      this.position.y += this.velocity.y * dt;
      const stepUp = this.grounded ? STEP : 0.12;
      const ground = C.groundHeight(this.position.x, this.position.z, this.radius, Math.max(prevY, this.position.y), stepUp);
      const wasGrounded = this.grounded;
      const snap = wasGrounded && this.velocity.y <= 0 ? 0.35 : 0;
      if (this.position.y <= ground + snap && this.velocity.y <= 0.5) {
        const stepped = ground - this.position.y;
        if (!wasGrounded && this.airTime > 0.25) {
          this.landTimer = Math.min(0.35, -this.velocity.y * 0.03);
          if (this.onLand) this.onLand(-this.velocity.y);
          if (this.avatar) this.avatar.triggerLand(-this.velocity.y);
        }
        this.position.y = ground;
        if (stepped > 0.05 && wasGrounded) this.eyeSmoothY -= stepped; // smooth stair steps
        this.velocity.y = 0;
        this.grounded = true;
        this.airTime = 0;
        // Slide down steep terrain.
        if (!C.lastGroundCollider && world.terrain) {
          const n = world.terrain.normalAt(this.position.x, this.position.z, _v4);
          if (n.y < 0.62) {
            this.velocity.x += n.x * 18 * dt; this.velocity.z += n.z * 18 * dt;
            this.grounded = n.y > 0.5;
          }
        }
      } else {
        this.grounded = false;
        this.airTime += dt;
      }
      // Ceiling.
      const ceil = C.ceilingHeight(this.position.x, this.position.z, this.radius, this.position.y, this.position.y + this.height);
      if (this.position.y + this.height > ceil && this.velocity.y > 0) { this.velocity.y = 0; this.position.y = ceil - this.height; }
    }

    // World bounds and respawn.
    const B = world.bounds;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -B, B);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -B, B);
    if (this.position.y < (rules.fallRespawn ?? -80)) {
      this.teleport(world.spawn.pos.clone().add(new THREE.Vector3(0, 1, 0)), world.spawn.yaw);
      if (G.ui) G.ui.toast('You fell out of the world — respawned.');
    }

    // Speed / footsteps / head bob.
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed = hs;
    if (this.grounded && hs > 0.5) {
      this.bobPhase += dt * hs * 1.9;
      this.stepAccumulator += hs * dt;
      const stride = this.sprinting ? 1.6 : 1.15;
      if (this.stepAccumulator > stride) { this.stepAccumulator = 0; if (this.onStep) this.onStep(hs); }
    }
    this.eyeSmoothY += (targetEye - this.eyeSmoothY) * (1 - Math.exp(-dt * 14));
    this.landTimer = Math.max(0, this.landTimer - dt);
    this._updateCamera(dt, world);
    if (this.held) this._updateHeld(dt);
  }

  _resolveNPCs(world) {
    // Soft push against characters/creatures (dynamic circles).
    for (const e of world.entities) {
      if (!e.body || e.body.noPush) continue;
      const b = e.body;
      const dx = this.position.x - b.x, dz = this.position.z - b.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + b.r;
      if (d < min && d > 1e-4 && Math.abs(this.position.y - b.y) < 1.8) {
        const push = (min - d);
        this.position.x += (dx / d) * push * 0.8;
        this.position.z += (dz / d) * push * 0.8;
        if (e.onBumped) e.onBumped(push);
      }
    }
  }

  _updateCamera(dt, world) {
    const cam = this.camera;
    const bob = settings.headBob && this.grounded && this.cameraMode === 'first' ? Math.sin(this.bobPhase * 2) * 0.035 * Math.min(1, this.speed / 4) : 0;
    const land = -this.landTimer * 0.35;
    let eye;
    if (this.vehicle) eye = this.vehicle.seatEye ? this.vehicle.seatEye() : this.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    else if (this.sitting) eye = this.sitting.eye.clone();
    else eye = _v5.set(this.position.x, this.position.y + this.eyeSmoothY + bob + land, this.position.z);
    const fov = this.fov + (this.sprinting && this.speed > 5 ? 6 : 0) + (this.flying && this.sprinting ? 12 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
    cam.rotation.order = 'YXZ';
    if (this.cameraMode === 'first' && !(this.vehicle && this.vehicle.thirdPersonOnly)) {
      // Slightly forward of the eyes so the camera never sees inside the head.
      const f = this.forward(_v6);
      cam.position.copy(eye).addScaledVector(f, this.vehicle ? 0 : 0.1);
      cam.rotation.set(this.pitch, this.yaw, 0);
    } else {
      const dist = this.vehicle ? (this.vehicle.camDistance || 7) : this.tpDistance;
      const pivot = _v7.copy(eye).add(new THREE.Vector3(0, this.vehicle ? 1.0 : 0.15, 0));
      const dir = this.lookDir(_v8).negate();
      // Over-the-shoulder offset.
      const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(this.vehicle ? 0 : 0.45);
      let want = pivot.clone().add(side).addScaledVector(dir, dist);
      // Keep the camera out of walls and terrain.
      const rayDir = want.clone().sub(pivot);
      const len = rayDir.length(); rayDir.normalize();
      const hit = world.colliders.raycast(pivot, rayDir, len + 0.3, (c) => c.owner !== (this.vehicle && this.vehicle.id));
      if (hit && hit.distance < len + 0.3) want = pivot.clone().addScaledVector(rayDir, Math.max(0.4, hit.distance - 0.3));
      const th = world.heightAt(want.x, want.z) + 0.3;
      if (want.y < th) want.y = th;
      cam.position.lerp(want, 1 - Math.exp(-dt * 18));
      if (cam.position.distanceTo(want) > 5) cam.position.copy(want);
      cam.lookAt(pivot.clone().addScaledVector(this.lookDir(_v8), 3));
    }
    cam.updateMatrixWorld();
  }

  sitAt(seat) {
    this.sitting = seat;
    this.velocity.set(0, 0, 0);
    this.position.copy(seat.feet);
    if (seat.yaw !== undefined) this.yaw = seat.yaw;
    if (this.avatar) this.avatar.setPose('sit', seat);
  }
  standUp() {
    if (!this.sitting) return;
    const s = this.sitting;
    this.sitting = null;
    if (s.exit) this.position.copy(s.exit);
    if (this.avatar) this.avatar.setPose(null);
  }

  // Held props float in front of the camera.
  _updateHeld(dt) {
    const p = this.held;
    const target = this.camera.position.clone().addScaledVector(this.lookDir(_v6), 1.4 + (p.holdDist || 0)).add(new THREE.Vector3(0, -0.25, 0));
    p.object.position.lerp(target, 1 - Math.exp(-dt * 16));
    p.object.rotation.y += (this.yaw - p.object.rotation.y) * Math.min(1, dt * 8);
  }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3(), _v8 = new THREE.Vector3();
