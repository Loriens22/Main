// Camera modes for driver and passenger play. All cameras are smoothed and
// pulled in front of building walls so they never clip through the city.
import * as THREE from 'three';
import { clamp, damp } from '../core/math.js';
import { BUS, FRONT_Z, REAR_Z } from '../vehicle/BusSpec.js';

export const DRIVER_CAMS = ['cab', 'follow', 'front', 'side', 'joint', 'free'];
export const PASSENGER_CAMS = ['eyes', 'cinematic'];

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 'cab';
    this.yaw = 0;
    this.pitch = -0.12;
    this.fovCab = 72;
    this.dist = 22;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.smoothYaw = null;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.shake = 0;
  }

  setMode(m) {
    this.mode = m;
    this.yaw = 0;
    this.pitch = m === 'cab' ? -0.12 : -0.15;
    this.smoothYaw = null;
    this.snap = true;
  }

  cycle(list) {
    const i = list.indexOf(this.mode);
    this.setMode(list[(i + 1) % list.length]);
    return this.mode;
  }

  /** Avoid placing the camera inside buildings: pull it towards the target. */
  clampToWorld(from, to) {
    const g = this.world && this.world.bgrid;
    if (!g) return to;
    const dx = to.x - from.x, dz = to.z - from.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.5) return to;
    const hit = g.raycast(from.x, from.z, dx / L, dz / L, L);
    if (hit < L) {
      const k = Math.max(0.5, hit - 0.6) / L;
      to.x = from.x + dx * k;
      to.z = from.z + dz * k;
    }
    const gy = this.world.hf.heightAt(to.x, to.z) + 0.4;
    if (to.y < gy) to.y = gy;
    return to;
  }

  /** Update for a bus-based camera. look = {lookX, lookY, zoom} deltas. */
  updateBus(dt, bus, look) {
    const cam = this.camera;
    const m = bus.model;
    this.yaw -= look.lookX;
    this.pitch = clamp(this.pitch - look.lookY, -1.2, 1.0);
    if (look.zoom) this.dist = clamp(this.dist * (1 + look.zoom * 0.08), 8, 60);
    const frontYaw = bus.phys.yaw;
    if (this.smoothYaw == null || this.snap) this.smoothYaw = frontYaw;
    let dy = frontYaw - this.smoothYaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    this.smoothYaw += dy * (1 - Math.exp(-3 * dt));
    const sp = Math.abs(bus.phys.v);
    if (this.mode === 'cab') {
      cam.fov = damp(cam.fov, this.fovCab, 6, dt);
      // head sways slightly with longitudinal / lateral acceleration
      const ax = clamp(bus.phys.aLong, -4, 4), ay = clamp(bus.phys.aLat, -4, 4);
      this.tmp.copy(m.driverEyeLocal).add(this.tmp2.set(-ay * 0.006, 0, -ax * 0.008));
      m.front.localToWorld(this.tmp);
      cam.position.copy(this.tmp);
      m.front.getWorldQuaternion(this.q);
      this.e.set(this.pitch, this.yaw, 0, 'YXZ');
      cam.quaternion.copy(this.q).multiply(new THREE.Quaternion().setFromEuler(this.e));
      if (this.shake > 0) {
        cam.position.y += (Math.random() - 0.5) * this.shake * 0.02;
        this.shake = Math.max(0, this.shake - dt * 4);
      }
    } else {
      cam.fov = damp(cam.fov, 55, 4, dt);
      const fx = -Math.sin(this.smoothYaw), fz = -Math.cos(this.smoothYaw);
      const base = m.front.position;
      let want;
      let look2;
      if (this.mode === 'follow') {
        const d = this.dist + sp * 0.15;
        const a = this.yaw;
        const cx = Math.cos(a), sx = Math.sin(a);
        const bx = -fx * cx - fz * sx, bz = fx * sx - fz * cx;
        want = this.tmp.set(base.x + bx * d, base.y + 5.5 + this.pitch * -8, base.z + bz * d);
        look2 = this.tmp2.set(base.x + fx * 6, base.y + 2, base.z + fz * 6);
      } else if (this.mode === 'front') {
        const d = 14;
        want = this.tmp.set(base.x + fx * (Math.abs(FRONT_Z) + d), base.y + 2.4, base.z + fz * (Math.abs(FRONT_Z) + d));
        look2 = this.tmp2.set(base.x + fx * 2, base.y + 1.6, base.z + fz * 2);
      } else if (this.mode === 'side') {
        const rx = -fz, rz = fx;
        want = this.tmp.set(base.x + rx * 11 + fx * 2, base.y + 2.2, base.z + rz * 11 + fz * 2);
        look2 = this.tmp2.set(base.x + fx * 1, base.y + 1.5, base.z + fz * 1);
      } else if (this.mode === 'joint') {
        // above and behind the articulation, looking at the bellows/rear section
        const hx = base.x - fx * 1.7, hz = base.z - fz * 1.7;
        const rx = -fz, rz = fx;
        want = this.tmp.set(hx + rx * 3.2 + fx * 4, base.y + 4.6, hz + rz * 3.2 + fz * 4);
        look2 = this.tmp2.set(hx - fx * 3, base.y + 1.2, hz - fz * 3);
      } else {
        // free orbit
        const d = this.dist;
        const a = this.smoothYaw + this.yaw;
        want = this.tmp.set(base.x + Math.sin(a) * d * Math.cos(this.pitch), base.y + 2 + Math.sin(-this.pitch) * d + 4, base.z + Math.cos(a) * d * Math.cos(this.pitch));
        look2 = this.tmp2.set(base.x, base.y + 1.5, base.z);
      }
      this.clampToWorld(look2, want);
      if (this.snap) this.pos.copy(want), this.target.copy(look2);
      else {
        const k = 1 - Math.exp(-(this.mode === 'follow' ? 4 : 6) * dt);
        this.pos.lerp(want, k);
        this.target.lerp(look2, 1 - Math.exp(-10 * dt));
      }
      cam.position.copy(this.pos);
      cam.lookAt(this.target);
    }
    this.snap = false;
    cam.updateProjectionMatrix();
  }
}

export { BUS, REAR_Z };
