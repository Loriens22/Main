// Camera modes: driver cab, chase/orbit, passenger interior, roadside cinematic, first-person walk.
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from './util.js';

export const MODES = ['cab', 'chase', 'interior', 'cinema'];
export const MODE_NAMES = { cab: 'Шофьорска кабина', chase: 'Външна камера', interior: 'Салон', cinema: 'Кино камера', walk: 'Пеша' };

export class CameraRig {
  constructor(camera, bus, rig) {
    this.cam = camera; this.bus = bus; this.rig = rig;
    this.mode = 'cab';
    this.look = { yaw: 0, pitch: -0.08 };        // cab / interior free look offsets
    this.orbit = { yaw: 0.55, pitch: 0.36, dist: 21 };
    this.cine = { t: 0, pos: new THREE.Vector3() };
    this.tmp = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.smoothTarget = new THREE.Vector3();
    this.first = true;
    this.curDist = this.orbit.dist;
    this.obstacles = null;
  }
  setMode(m) { this.mode = m; this.first = true; if (m === 'cab' || m === 'interior') { this.look.yaw = 0; this.look.pitch = m === 'cab' ? -0.2 : -0.05; } }
  resetLook() { this.look.yaw = 0; this.look.pitch = this.mode === 'cab' ? -0.2 : -0.05; }
  drag(dx, dy) {
    if (this.mode === 'cab' || this.mode === 'interior' || this.mode === 'walk') {
      this.look.yaw = clamp(this.look.yaw - dx * 0.0042, -2.6, 2.6);
      this.look.pitch = clamp(this.look.pitch - dy * 0.0036, -1.1, 1.0);
      if (this.mode === 'walk') this.look.yaw = wrapAngle(this.look.yaw);
    } else if (this.mode === 'chase' || this.mode === 'cinema') {
      if (this.mode === 'cinema') this.mode = 'chase';
      this.orbit.yaw -= dx * 0.005; this.orbit.pitch = clamp(this.orbit.pitch + dy * 0.004, 0.02, 1.35);
    }
  }
  zoom(f) { this.orbit.dist = clamp(this.orbit.dist * f, 7, 70); }
  /** Local (body) camera placement helper. */
  placeLocal(body, local, yaw, pitch) {
    body.updateMatrixWorld();
    this.cam.position.copy(local).applyMatrix4(body.matrixWorld);
    body.getWorldQuaternion(this.q);
    this.e.set(pitch, yaw, 0, 'YXZ');
    this.cam.quaternion.copy(this.q).multiply(new THREE.Quaternion().setFromEuler(this.e));
  }
  update(dt, player) {
    const bus = this.bus, rig = this.rig;
    const fov = window.innerWidth > window.innerHeight ? 60 : 74;
    if (this.mode === 'walk' && player) {
      const target = player.eyeWorld();
      this.cam.position.copy(target);
      this.e.set(this.look.pitch, this.look.yaw, 0, 'YXZ');
      this.cam.quaternion.setFromEuler(this.e);
      this.setFov(fov, 0.05);
      return;
    }
    if (this.mode === 'cab') {
      // driver's eye with slight inertia against acceleration
      const lean = clamp(-bus.a * 0.012, -0.05, 0.05);
      const eye = this.tmp.copy(rig.eye.pos); eye.z += lean;
      const shake = bus.shake ? (Math.random() - 0.5) * bus.shake * 0.04 : 0;
      this.placeLocal(rig.bodies[rig.eye.section], eye, this.look.yaw + shake, this.look.pitch + shake);
      this.setFov(fov + 8, 0.06);
      return;
    }
    if (this.mode === 'interior') {
      this.placeLocal(rig.bodies[rig.interiorEye.section], rig.interiorEye.pos, this.look.yaw, this.look.pitch);
      this.setFov(fov + 8, 0.06);
      return;
    }
    // world-space cameras: focus near the articulation joint
    const fx = bus.hx, fz = bus.hz;
    const focus = this.tmp.set(fx, 2.0, fz);
    if (this.first) { this.smoothTarget.copy(focus); }
    this.smoothTarget.x = damp(this.smoothTarget.x, focus.x, 10, dt); this.smoothTarget.z = damp(this.smoothTarget.z, focus.z, 10, dt); this.smoothTarget.y = 2.0;
    if (this.mode === 'chase') {
      const heading = bus.h;
      if (this.first) this.orbitBase = heading;
      this.orbitBase = this.orbitBase + wrapAngle(heading - this.orbitBase) * Math.min(1, dt * 1.5);
      const yaw = this.orbitBase + Math.PI + this.orbit.yaw;
      const p = this.orbit.pitch;
      // pull the camera in front of buildings that would block the view
      const want = this.orbit.dist;
      const hit = this.obstacleHit(this.smoothTarget.x, this.smoothTarget.z, Math.cos(yaw) * Math.cos(p) * want, Math.sin(yaw) * Math.cos(p) * want);
      const target = hit < 1 ? Math.max(5, hit * want - 0.8) : want;
      if (this.first || target < this.curDist) this.curDist = target; else this.curDist = damp(this.curDist, target, 2.5, dt);
      const d = this.curDist;
      const cx = this.smoothTarget.x + Math.cos(yaw) * Math.cos(p) * d;
      const cz = this.smoothTarget.z + Math.sin(yaw) * Math.cos(p) * d;
      const cy = Math.max(1.2, 2.0 + Math.sin(p) * d);
      this.cam.position.set(cx, cy, cz);
      this.cam.lookAt(this.smoothTarget);
      this.setFov(fov - 6, 0.08);
    } else if (this.mode === 'cinema') {
      this.cine.t -= dt;
      if (this.cine.t <= 0 || this.first || this.cam.position.distanceTo(focus) > 70) {
        // new roadside spot ahead of the bus on the right or left side
        const side = Math.random() < 0.5 ? 1 : -1;
        const ahead = 18 + Math.random() * 28;
        const hx = Math.cos(bus.h), hz = Math.sin(bus.h);
        this.cine.pos.set(bus.x + hx * ahead - hz * side * (9 + Math.random() * 5), 1.3 + Math.random() * 3.5, bus.z + hz * ahead + hx * side * (9 + Math.random() * 5));
        this.cine.t = 9;
      }
      this.cam.position.copy(this.cine.pos);
      this.cam.lookAt(this.smoothTarget);
      this.setFov(40, 1);
    }
    this.first = false;
  }
  /** First hit (0..1) of the 2D segment (x,z)+t·(dx,dz) with a static building box, 1 if clear. */
  obstacleHit(x, z, dx, dz) {
    let best = 1;
    const obs = this.obstacles; if (!obs) return best;
    const L = Math.hypot(dx, dz);
    for (const o of obs) {
      const r = Math.max(o.hd, o.hw);
      const ox = o.x - x, oz = o.z - z;
      if (ox * ox + oz * oz > (L + r) ** 2) continue;
      const c = Math.cos(o.h), s = Math.sin(o.h);
      // segment in the box frame
      const px = -ox * c - oz * s, pz = ox * s - oz * c;
      const vx = dx * c + dz * s, vz = -dx * s + dz * c;
      let t0 = 0, t1 = best;
      for (const [p0, v, e] of [[px, vx, o.hd + 0.4], [pz, vz, o.hw + 0.4]]) {
        if (Math.abs(v) < 1e-9) { if (Math.abs(p0) > e) { t0 = 2; break; } continue; }
        let a = (-e - p0) / v, b = (e - p0) / v; if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 > 0.02 && t0 < best) best = t0;
    }
    return best;
  }
  setFov(f, k) { if (Math.abs(this.cam.fov - f) > 0.05) { this.cam.fov = lerp(this.cam.fov, f, k === 1 ? 1 : Math.max(k, 0.05)); this.cam.updateProjectionMatrix(); } }
}

/** Live rear-view mirrors rendered to textures. */
export class Mirrors {
  constructor(engine, rig, size = 320) {
    this.engine = engine; this.rig = rig; this.enabled = true; this.k = 0;
    this.items = rig.mirrors.map((m) => {
      const rt = new THREE.WebGLRenderTarget(size, Math.round(size * 1.45), { type: THREE.HalfFloatType, samples: 0 });
      rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.repeat.x = -1; rt.texture.offset.x = 1;
      m.glassMat.map = rt.texture; m.glassMat.color.set(0xffffff); m.glassMat.needsUpdate = true;
      const cam = new THREE.PerspectiveCamera(24, 1 / 1.45, 0.3, 320);
      return { m, rt, cam };
    });
  }
  resize(size) { for (const it of this.items) it.rt.setSize(size, Math.round(size * 1.45)); }
  render(scene) {
    if (!this.enabled) return;
    this.k++;
    if (this.k % 2) return; // each mirror refreshes every 4th frame (~15 Hz)
    const it = this.items[(this.k >> 1) % this.items.length];
    const r = this.engine.renderer;
    const head = it.m.head;
    head.updateMatrixWorld();
    const p = new THREE.Vector3(0, 0, 0.1).applyMatrix4(head.matrixWorld);
    // look backwards along the bus side, slightly outward and down
    const back = new THREE.Vector3(0.08 * it.m.side, -0.12, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).normalize();
    it.cam.position.copy(p);
    it.cam.lookAt(p.clone().add(back));
    const auto = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
    for (const o of this.items) o.m.glass.visible = false; // avoid sampling the target being rendered
    r.setRenderTarget(it.rt);
    r.render(scene, it.cam);
    r.setRenderTarget(null);
    for (const o of this.items) o.m.glass.visible = true;
    r.shadowMap.autoUpdate = auto;
  }
}
