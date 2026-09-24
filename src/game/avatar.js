// The player's own body: a fully rigged procedural humanoid (2.00 m, curly
// dark-brown hair, t-shirt, jeans, sneakers) driven from the player
// controller state. In first person the head is moved to a render layer the
// main camera does not see, so looking down shows the body and feet while
// mirrors (which enable that layer) and third person show everything.

import * as THREE from 'three';
import { Humanoid } from '../characters/humanoid.js';
import { PLAYER_SPEC } from '../characters/specs.js';
import { G } from '../core/context.js';

export class PlayerAvatar {
  constructor(seed = 20260924) {
    this.h = new Humanoid({ ...PLAYER_SPEC }, seed);
    this.root = this.h.root;
    this.ready = false;
    this.pose = null;
    this.lastYaw = 0;
    this.name = 'You';
  }

  *build(ctx, onProgress) {
    yield* this.h.build(ctx, onProgress);
    this.ready = true;
    this.root.traverse((o) => { o.userData.isPlayer = true; o.userData.noRaycast = true; });
    this.setFirstPerson(G.player ? G.player.cameraMode === 'first' : true);
  }

  setFirstPerson(on) { if (this.ready) this.h.setFirstPerson(on); }
  triggerJump() { if (this.ready) this.h.triggerJump(); if (G.audio) G.audio.play('jump'); }
  triggerLand(v) { if (this.ready) this.h.triggerLand(v); if (G.audio) G.audio.play('land', null, { v }); }
  setPose(name, seat) { this.pose = name; if (this.ready) this.h.setPose(name, seat ? { seatHeight: seat.seatHeight ?? seat.height ?? 0.45 } : null); }
  gesture(name, dur) { if (this.ready) this.h.gesture(name, dur); }
  talk(sec) { if (this.ready) this.h.talk(sec); }

  // Character-space position of the head (for speech bubbles).
  headPos(out = new THREE.Vector3()) { return out.copy(this.root.position).add(new THREE.Vector3(0, 2.05, 0)); }

  update(dt, player) {
    if (!this.ready) return;
    const root = this.root;
    root.visible = !player.vehicle || !!player.vehicle.showDriver;
    const seat = player.sitting;
    if (player.vehicle && player.vehicle.driverPose) {
      const dp = player.vehicle.driverPose();
      root.position.copy(dp.pos);
      root.rotation.y = dp.yaw;
    } else if (seat) {
      root.position.copy(seat.feet);
      root.rotation.y = (seat.lookYaw ?? (seat.yaw - Math.PI)) ;
    } else {
      root.position.copy(player.position);
      // The model faces +Z; the controller's forward is -Z at yaw 0.
      root.rotation.y = player.yaw + Math.PI;
    }
    let yawRate = (player.yaw - this.lastYaw) / Math.max(1e-3, dt);
    this.lastYaw = player.yaw;
    if (!Number.isFinite(yawRate)) yawRate = 0;
    const mv = player.moveInput;
    const moveAngle = mv.lengthSq() > 0.01 ? Math.atan2(mv.x, mv.y) : 0;
    // Look target in character space: along the camera pitch.
    const look = new THREE.Vector3(0, 1.75 + Math.sin(player.pitch) * 3, Math.cos(player.pitch) * 3);
    const world = G.world;
    const groundAt = (lx, lz) => {
      const c = Math.cos(root.rotation.y), s = Math.sin(root.rotation.y);
      const wx = root.position.x + lx * c + lz * s, wz = root.position.z - lx * s + lz * c;
      return world.colliders.groundHeight(wx, wz, 0.08, root.position.y + 0.5, 0.5) - root.position.y;
    };
    this.h.update(dt, {
      speed: player.vehicle || seat ? 0 : player.speed, moveAngle, grounded: player.grounded || player.flying, crouch: player.crouching, sprint: player.sprinting,
      swim: player.swimming, yawRate: Math.max(-6, Math.min(6, yawRate)), look, lookPitch: player.pitch, groundAt: player.grounded ? groundAt : null,
    });
  }
}
