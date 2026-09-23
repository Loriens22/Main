// First-person walking: outside on the street and inside the bus (through open doors), with simple collisions.
import * as THREE from 'three';
import { B } from './bus/model.js';
import { clamp, damp } from './util.js';

export class Player {
  constructor(bus, rig, heightAt) {
    this.bus = bus; this.rig = rig; this.heightAt = heightAt;
    this.inside = null;              // null | 'front' | 'rear'
    this.pos = new THREE.Vector3();  // world (outside) or body-local (inside)
    this.y = 0.15; this.bob = 0; this.eye = 1.68;
  }
  body(sec) { return sec === 'front' ? this.rig.frontBody : this.rig.rearBody; }
  eyeWorld(out = new THREE.Vector3()) {
    const b = Math.sin(this.bob) * 0.025;
    if (this.inside) return out.set(this.pos.x, this.y + this.eye + b, this.pos.z).applyMatrix4(this.body(this.inside).matrixWorld);
    return out.set(this.pos.x, this.y + this.eye + b, this.pos.z);
  }
  placeWorld(x, z) { this.inside = null; this.pos.set(x, 0, z); this.y = this.heightAt(x, z); }
  /** Local position → section lookup. */
  toLocal(sec, world) { return world.clone().applyMatrix4(new THREE.Matrix4().copy(this.body(sec).matrixWorld).invert()); }
  inCab() { return this.inside === 'front' && this.pos.z < -6.5 && this.pos.x < -0.15; }
  update(dt, input, yaw) {
    const sp = (input.run ? 3.2 : 1.6);
    const mx = input.x, my = input.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    if (mag < 0.05) { this.bob = 0; return; }
    // camera yaw: forward (0,0,-1) rotated by yaw
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const wx = (fx * -my + rx * mx) * sp * dt, wz = (fz * -my + rz * mx) * sp * dt;
    this.bob += dt * 9 * mag;
    if (!this.inside) {
      const nx = this.pos.x + wx, nz = this.pos.z + wz;
      const hit = this.busHit(nx, nz);
      if (!hit) { this.pos.x = nx; this.pos.z = nz; }
      else if (hit.door) {
        // step in through an open door
        this.inside = hit.sec; this.pos.copy(hit.local); this.pos.x = B.hw - 0.35; this.pos.y = 0;
      } else {
        // slide along the bus side
        if (!this.busHit(nx, this.pos.z)) this.pos.x = nx; else if (!this.busHit(this.pos.x, nz)) this.pos.z = nz;
      }
      this.y = damp(this.y, this.heightAt(this.pos.x, this.pos.z), 12, dt);
      return;
    }
    // inside: convert world delta into body-local delta
    const body = this.body(this.inside);
    const q = body.getWorldQuaternion(new THREE.Quaternion()).invert();
    const d = new THREE.Vector3(wx, 0, wz).applyQuaternion(q);
    let nx = this.pos.x + d.x, nz = this.pos.z + d.z;
    const doors = this.inside === 'front' ? B.doorsF : B.doorsR;
    const doorIdx = this.inside === 'front' ? 0 : 2;
    // leaving through a door
    if (nx > B.hw - 0.3) {
      const k = doors.findIndex(([a, b]) => nz > a + 0.15 && nz < b - 0.15);
      if (k >= 0 && this.rig.doors[doorIdx + k].open > 0.85) {
        if (nx > B.hw + 0.25) { const w = new THREE.Vector3(nx + 0.3, 0, nz).applyMatrix4(body.matrixWorld); this.placeWorld(w.x, w.z); return; }
      } else nx = Math.min(nx, B.hw - 0.3);
    }
    nx = Math.max(nx, -(B.hw - 0.3));
    // cab partition: only via the aisle side
    if (this.inside === 'front' && nz < -6.95 && this.pos.z >= -6.95 && nx < -0.3) nz = -6.95;
    // section transitions through the bellows
    if (this.inside === 'front') {
      nz = Math.max(nz, -8.15);
      if (nz > B.frontEnd + 0.15) { this.switchSection('rear', nx, nz); return; }
    } else {
      nz = Math.min(nz, B.zR + 0.05);
      if (nz < B.rearStart - 0.15) { this.switchSection('front', nx, nz); return; }
    }
    this.pos.x = nx; this.pos.z = nz;
    const cab = this.inside === 'front' && this.pos.z < -6.95 && this.pos.x < -0.3;
    const rearBench = this.inside === 'rear' && this.pos.z > 6.6;
    this.y = damp(this.y, B.yFloor + (cab || rearBench ? 0.26 : 0), 10, dt);
  }
  switchSection(to, x, z) {
    const w = new THREE.Vector3(x, 0, z).applyMatrix4(this.body(this.inside).matrixWorld);
    const l = this.toLocal(to, w);
    this.inside = to; this.pos.set(l.x, 0, l.z);
  }
  /** Returns null if free, {door, sec, local} if hitting the bus (door=true when it's an open doorway). */
  busHit(x, z) {
    for (const sec of ['front', 'rear']) {
      const l = this.toLocal(sec, new THREE.Vector3(x, 0, z));
      const z0 = sec === 'front' ? -8.7 : B.rearStart - 0.4, z1 = sec === 'front' ? B.frontEnd + 0.4 : B.rearEnd + 0.1;
      if (Math.abs(l.x) < B.hw + 0.25 && l.z > z0 && l.z < z1) {
        const doors = sec === 'front' ? B.doorsF : B.doorsR;
        const base = sec === 'front' ? 0 : 2;
        const k = doors.findIndex(([a, b]) => l.z > a + 0.2 && l.z < b - 0.2);
        if (l.x > 0.6 && k >= 0 && this.rig.doors[base + k].open > 0.85) return { door: true, sec, local: l };
        return { door: false };
      }
    }
    return null;
  }
}
export { clamp };
