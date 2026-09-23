// First-person walking: outside on the street and inside the bus (through open doors), with simple collisions.
import * as THREE from 'three';
import { clamp, damp } from './util.js';

export class Player {
  constructor(bus, rig, heightAt) {
    this.bus = bus; this.rig = rig; this.heightAt = heightAt;
    this.inside = null;              // null | 'front' | 'rear'
    this.pos = new THREE.Vector3();  // world (outside) or body-local (inside)
    this.y = 0.15; this.bob = 0; this.eye = 1.68;
  }
  body(sec) { return this.rig.bodies[sec]; }
  eyeWorld(out = new THREE.Vector3()) {
    const b = Math.sin(this.bob) * 0.025;
    if (this.inside) return out.set(this.pos.x, this.y + this.eye + b, this.pos.z).applyMatrix4(this.body(this.inside).matrixWorld);
    return out.set(this.pos.x, this.y + this.eye + b, this.pos.z);
  }
  /** Static obstacles for walking outside: boxes {x,z,h,hd,hw} and circles {x,z,r}, bucketed on a 10 m grid. */
  setObstacles(boxes, circles) {
    const C = 10, grid = this.grid = new Map();
    const put = (i0, i1, j0, j1, o) => { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i + ',' + j; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); } };
    for (const b of boxes) {
      const r = Math.hypot(b.hd, b.hw);
      put(Math.floor((b.x - r) / C), Math.floor((b.x + r) / C), Math.floor((b.z - r) / C), Math.floor((b.z + r) / C), { box: b, c: Math.cos(b.h), s: Math.sin(b.h) });
    }
    for (const c of circles) put(Math.floor((c.x - c.r) / C), Math.floor((c.x + c.r) / C), Math.floor((c.z - c.r) / C), Math.floor((c.z + c.r) / C), { circ: c });
  }
  /** True when a 0.25 m radius body at (x,z) overlaps a static obstacle. */
  worldHit(x, z) {
    const list = this.grid?.get(Math.floor(x / 10) + ',' + Math.floor(z / 10));
    if (!list) return false;
    const R = 0.25;
    for (const o of list) {
      if (o.circ) { const c = o.circ; if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + R) ** 2) return true; continue; }
      const b = o.box, dx = x - b.x, dz = z - b.z;
      const lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
      if (Math.abs(lx) < b.hd + R && Math.abs(lz) < b.hw + R) return true;
    }
    return false;
  }
  placeWorld(x, z) { this.inside = null; this.pos.set(x, 0, z); this.y = this.heightAt(x, z); }
  /** Local position → section lookup. */
  toLocal(sec, world) { return world.clone().applyMatrix4(new THREE.Matrix4().copy(this.body(sec).matrixWorld).invert()); }
  inCab() { const c = this.rig.cab; return !!c && this.inside === c.section && c.inside(this.pos.x, this.pos.z); }
  update(dt, input, yaw) {
    const rig = this.rig;
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
      if (!hit && this.worldHit(nx, nz) && !this.worldHit(this.pos.x, this.pos.z)) {
        // slide along walls / around poles
        if (!this.worldHit(nx, this.pos.z) && !this.busHit(nx, this.pos.z)) this.pos.x = nx;
        else if (!this.worldHit(this.pos.x, nz) && !this.busHit(this.pos.x, nz)) this.pos.z = nz;
      } else if (!hit) { this.pos.x = nx; this.pos.z = nz; }
      else if (hit.door) {
        // step in through an open door
        this.inside = hit.sec; this.pos.copy(hit.local); this.pos.x = rig.hw - 0.35; this.pos.y = 0;
      } else {
        // slide along the vehicle side
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
    const hw = rig.hw;
    const secIdx = rig.sections.findIndex((s) => s.name === this.inside);
    const sec = rig.sections[secIdx];
    // leaving through a door (doors are on the right-hand side, +x)
    if (nx > hw - 0.3) {
      const door = rig.doors.find((dd) => dd.section === this.inside && nz > dd.d0 + 0.15 && nz < dd.d1 - 0.15);
      if (door && door.open > 0.85) {
        if (nx > hw + 0.25) { const w = new THREE.Vector3(nx + 0.3, 0, nz).applyMatrix4(body.matrixWorld); this.placeWorld(w.x, w.z); return; }
      } else nx = Math.min(nx, hw - 0.3);
    }
    nx = Math.max(nx, -(hw - 0.3));
    // cab partition: only via the aisle side
    const cab = rig.cab;
    if (cab && cab.partition && this.inside === cab.section) {
      const P = cab.partition;
      if (P.z < 0 ? (nz < P.z && this.pos.z >= P.z && nx < P.xMax) : (nz > P.z && this.pos.z <= P.z && nx < P.xMax)) nz = P.z;
    }
    // section transitions through the bellows
    if (nz > sec.z1) { if (secIdx < rig.sections.length - 1) { this.switchSection(rig.sections[secIdx + 1].name, nx, nz); return; } nz = sec.z1; }
    if (nz < sec.z0) { if (secIdx > 0) { this.switchSection(rig.sections[secIdx - 1].name, nx, nz); return; } nz = sec.z0; }
    this.pos.x = nx; this.pos.z = nz;
    const raised = sec.raised && sec.raised(this.pos.x, this.pos.z);
    this.y = damp(this.y, rig.yFloor + (raised ? 0.26 : 0), 10, dt);
  }
  switchSection(to, x, z) {
    const w = new THREE.Vector3(x, 0, z).applyMatrix4(this.body(this.inside).matrixWorld);
    const l = this.toLocal(to, w);
    this.inside = to; this.pos.set(l.x, 0, l.z);
  }
  /** Returns null if free, {door, sec, local} if hitting the vehicle (door=true when it's an open doorway). */
  busHit(x, z) {
    const rig = this.rig;
    for (const sec of rig.sections) {
      const l = this.toLocal(sec.name, new THREE.Vector3(x, 0, z));
      if (Math.abs(l.x) < rig.hw + 0.25 && l.z > sec.oz0 && l.z < sec.oz1) {
        const door = rig.doors.find((dd) => dd.section === sec.name && l.z > dd.d0 + 0.2 && l.z < dd.d1 - 0.2);
        if (l.x > 0.6 && door && door.open > 0.85) return { door: true, sec: sec.name, local: l };
        return { door: false };
      }
    }
    return null;
  }
}
export { clamp };
