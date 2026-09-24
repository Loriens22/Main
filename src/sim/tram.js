// Rail-bound tram simulation (Pesa Swing): module kinematics on the track polyline, traction / brakes,
// pantograph, plug doors, lights and collision boxes. Same interface as the trolleybus simulation.
import * as THREE from 'three';
import { TR } from '../tram/model.js';
import { clamp, lerp, damp, wrapAngle, obbOverlap, smoothstep } from '../util.js';

const G = 9.81;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

export class Tram {
  constructor(rig, route, cat, events) {
    this.rig = rig; this.route = route; this.cat = cat; this.ev = events || (() => {});
    this.s = 0; this.v = 0; this.a = 0; this.jerk = 0;
    this.throttle = 0; this.brake = 0; this.gear = 'N'; this.park = true;
    this.kneel = 0; this.kneelCmd = false; this.steer = 0; this.steerCmd = 0;
    this.indicator = 0; this.hazard = false; this.blinkT = 0;
    this.passengers = 0; this.power = true; this.battery = false;
    this.collisionT = 0; this.shake = 0; this.odometer = 0;
    this.panto = { state: 'up', h: 5.9 };
    this.sparks = new Sparks();
    this.staticColliders = [];
    this.curv = 0;
    this.x = 0; this.z = 0; this.h = 0; this.hx = 0; this.hz = 0; this.h2 = 0;
    this.mods = TR.modules;
  }
  get steerable() { return false; }
  // autopilot planning: 40 t on steel rails brakes gently (service ~1.5 m/s², jerk-limited)
  get planDecel() { return 1.05; }
  get brakeCap() { return 1.35; }
  get aLat() { return 0.9; }
  get serviceDecel() { return 1.55; }
  /** Places the tram with its nose tip at game route distance s. */
  placeOnRoute(s) {
    this.s = s; this.v = 0; this.thrEff = 0; this.brkEff = 0;
    this.applyPose(0);
    this.panto.state = 'up'; this.updatePanto(0.016, true);
  }
  frontBumper(out = new THREE.Vector3()) { const p = this.route.pose(this.s); return out.set(p.x, 0, p.z); }
  doorsOpen() { return this.rig.doors.some((d) => d.open > 0.02 || d.target > 0); }
  setDoor(i, open) {
    const d = this.rig.doors[i];
    if (open && Math.abs(this.v) > 0.5) { this.ev('msg', 'Вратите не се отварят в движение', 'bad'); return; }
    if (!open && d.blocked) { this.ev('msg', 'Пътник на вратата!', 'bad'); this.ev('beep'); return; }
    if ((d.target > 0) === open) return;
    d.target = open ? 1 : 0;
    d.pending = open ? 0 : 1.2;
    this.ev(open ? 'doorOpen' : 'doorWarn', i);
  }
  toggleDoors() {
    const anyOpen = this.rig.doors.some((d) => d.target > 0);
    for (let i = 0; i < this.rig.doors.length; i++) this.setDoor(i, !anyOpen);
  }
  /* ---------------- pantograph (replaces the trolley poles) ---------------- */
  canRaisePoles() { return this.panto.state === 'down' && Math.abs(this.v) < 0.5; }
  raisePoles() {
    const P = this.panto;
    if (P.state === 'up' || P.state === 'raising') { P.state = 'lowering'; this.ev('msg', 'Пантографът се сваля'); this.ev('raising'); return; }
    if (Math.abs(this.v) > 0.5) { this.ev('msg', 'Спрете, за да вдигнете пантографа', 'bad'); return; }
    P.state = 'raising'; this.ev('raising'); this.ev('msg', 'Пантографът се вдига');
  }
  updatePanto(dt, snap = false) {
    const P = this.panto, rig = this.rig;
    const C = rig.bodies.C; C.updateMatrixWorld(true);
    const base = tmpA.set(0, TR.roofY, 0.6).applyMatrix4(C.matrixWorld);
    const wireY = this.cat?.wireHeightAt ? this.cat.wireHeightAt(base.x, base.z) : 5.9;
    const folded = TR.roofY + 0.5;
    if (P.state === 'up') P.h = snap ? wireY : damp(P.h, wireY, 12, dt);
    else if (P.state === 'raising') { P.h = Math.min(wireY, P.h + dt * 1.1); if (P.h >= wireY - 0.01) { P.state = 'up'; this.sparks.burst(tmpB.set(base.x, wireY, base.z), 14); this.ev('rewired'); } }
    else if (P.state === 'lowering') { P.h = Math.max(folded, P.h - dt * 1.4); if (P.h <= folded + 0.01) P.state = 'down'; }
    else P.h = folded;
    rig.setPantograph(P.h);
    this.power = P.state === 'up' && wireY > 4;
    if (P.state === 'up' && Math.abs(this.v) > 3 && this.throttle > 0.3 && Math.random() < dt * 0.35) this.sparks.burst(tmpB.set(base.x, wireY, base.z), 5);
  }
  /* ---------------- dynamics ---------------- */
  update(dt, traffic) {
    const rig = this.rig;
    // doors
    let anyDoor = false;
    for (let i = 0; i < rig.doors.length; i++) {
      const d = rig.doors[i];
      if (d.target === 0 && d.pending > 0) { d.pending -= dt; if (d.pending <= 0) this.ev('doorClose', i); }
      const goal = d.target === 0 && d.pending > 0 ? 1 : d.target;
      d.open = clamp(d.open + Math.sign(goal - d.open) * dt / 2.2, 0, 1);
      d.anim(d.open * d.open * (3 - 2 * d.open));
      d.lampMat.emissiveIntensity = d.open > 0.01 && d.open < 0.99 ? (Math.floor(performance.now() / 250) % 2 ? 2.5 : 0.2) : d.open >= 0.99 ? 1.8 : 0;
      if (d.open > 0.01) anyDoor = true;
    }
    // traction & brakes
    const m = 40500 + this.passengers * 75;
    const vAbs = Math.abs(this.v);
    const canDrive = !anyDoor && !this.park && this.power && (this.gear === 'D' || this.gear === 'R');
    this.hintT = Math.max(0, (this.hintT || 0) - dt);
    if (!canDrive && this.throttle > 0.3 && this.hintT <= 0) {
      this.hintT = 3.5;
      const why = anyDoor ? (rig.doors.some((d) => d.blocked) ? 'Блокировка на вратите — пътници още се качват' : 'Блокировка: затворете вратите (ВРАТИ / O)')
        : this.park ? 'Освободете пружинната спирачка (P)' : !this.power ? 'Няма напрежение — вдигнете пантографа (ПАНТОГРАФ / T)' : 'Изберете посока D или R';
      this.ev('msg', why, 'bad');
    }
    this.thrEff = this.thrEff || 0; this.brkEff = this.brkEff || 0;
    this.thrEff += clamp((canDrive ? this.throttle : 0) - this.thrEff, -2.5 * dt, 0.8 * dt);
    this.brkEff += clamp(this.brake - this.brkEff, -3 * dt, (this.brake > 0.95 ? 7 : 1.6) * dt);
    let F = 0;
    if (canDrive && this.thrEff > 0.001) {
      const vmax = this.gear === 'R' ? 2.5 : 19.4;
      let f = this.thrEff * Math.min(58000, 600000 / Math.max(vAbs, 3));
      f *= 1 - smoothstep(vmax - 1.2, vmax, vAbs);
      F += this.gear === 'R' ? -f : f;
    }
    F -= 0.5 * 1.2 * 7.5 * this.v * vAbs + 0.0025 * m * G * Math.sign(this.v);
    let decel = this.brkEff * (this.brake > 0.96 ? 2.9 : 1.55);
    if (this.throttle < 0.02 && this.brake < 0.02 && vAbs > 0.6 && this.power) decel += 0.2;
    // sanders (button, 3 s) and automatic sanding in emergency braking improve adhesion
    if (this.kneelCmd) { this.sandT = (this.sandT || 0) + dt; if (this.sandT > 3) { this.kneelCmd = false; this.sandT = 0; } }
    if ((this.kneelCmd || this.brake > 0.96) && this.brkEff > 0.05) decel += 0.3;
    if (anyDoor || this.park) decel = Math.max(decel, 3);
    const vNew = this.v + (F / m) * dt;
    const dv = decel * dt;
    let v2 = vNew > 0 ? Math.max(0, vNew - dv) : vNew < 0 ? Math.min(0, vNew + dv) : 0;
    if ((anyDoor || this.park) && vAbs < 0.3) v2 = 0;
    const aReal = (v2 - this.v) / dt;
    this.jerk = damp(this.jerk, Math.abs(aReal - this.a) / dt, 5, dt);
    this.a = damp(this.a, aReal, 8, dt);
    const prevS = this.s;
    this.v = v2;
    this.s += this.v * dt;
    this.s = clamp(this.s, TR.length + 1 - (this.route.busOffset || 0), this.route.length - 1);
    this.odometer += Math.abs(this.s - prevS);
    this.applyPose(dt);
    // collisions with road vehicles (level crossings / junctions)
    if (traffic && this.checkCollision(traffic)) {
      this.s = prevS; this.applyPose(0);
      if (Math.abs(this.v) > 1.2 && this.collisionT <= 0) { this.ev('collision', Math.abs(this.v)); this.shake = Math.min(1, Math.abs(this.v) / 6); this.collisionT = 1.5; }
      this.v = 0;
    }
    this.collisionT -= dt;
    // lights
    this.blinkT += dt;
    const blink = Math.floor(this.blinkT / 0.4) % 2 === 0;
    rig.M.indL.emissiveIntensity = (this.indicator < 0 || this.hazard) && blink ? 3 : 0;
    rig.M.indR.emissiveIntensity = (this.indicator > 0 || this.hazard) && blink ? 3 : 0;
    if (blink !== this._lastBlink && (this.indicator || this.hazard)) this.ev('tick', blink);
    this._lastBlink = blink;
    rig.M.brake.emissiveIntensity = this.brake > 0.05 || (vAbs < 0.1 && (anyDoor || this.park)) ? 3.5 : 0;
    if (rig.controller) rig.controller.rotation.x = damp(rig.controller.rotation.x, -this.throttle * 0.55 + this.brake * 0.55, 10, dt);
    this.updatePanto(dt);
    this.sparks.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.5);
  }
  /** Positions every module: bogie modules on the track, suspended modules between their neighbours. */
  applyPose(dt) {
    const r = this.route, rig = this.rig;
    const place = (m, x, z, h) => { const g = rig.groups[m.name]; g.position.set(x, 0, z); g.rotation.set(0, -h - Math.PI / 2, 0); };
    const poseOf = {};
    for (const m of this.mods) {
      if (!m.bogie) continue;
      const sb = this.s - m.dist;
      const p = r.pose(sb), a = r.pose(sb + 1.4), b = r.pose(sb - 1.4);
      const h = Math.atan2(a.z - b.z, a.x - b.x);
      poseOf[m.name] = { x: p.x, z: p.z, h };
      place(m, p.x, p.z, h);
    }
    for (let i = 0; i < this.mods.length; i++) {
      const m = this.mods[i]; if (m.bogie) continue;
      const pA = this.mods[i - 1], pC = this.mods[i + 1];
      const A = poseOf[pA.name], C = poseOf[pC.name];
      const dA = pA.z1 + TR.gap / 2, dC = -(pC.z0 - TR.gap / 2);
      const fx = A.x - Math.cos(A.h) * dA, fz = A.z - Math.sin(A.h) * dA;   // rear joint of the module ahead
      const rx = C.x + Math.cos(C.h) * dC, rz = C.z + Math.sin(C.h) * dC;   // front joint of the module behind
      const h = Math.atan2(fz - rz, fx - rx);
      const mz = (m.z0 + m.z1) / 2;
      place(m, (fx + rx) / 2 + Math.cos(h) * mz, (fz + rz) / 2 + Math.sin(h) * mz, h);
      poseOf[m.name] = { x: (fx + rx) / 2, z: (fz + rz) / 2, h };
    }
    const A = poseOf.A, C = poseOf.C, E = poseOf.E;
    this.x = A.x; this.z = A.z; this.h = A.h; this.hx = C.x; this.hz = C.z; this.h2 = E.h;
    this.poseOf = poseOf;
    // body motion: small pitch with acceleration, roll in curves, running vibration
    const k = Math.abs(wrapAngle(r.pose(this.s - 6).h - r.pose(this.s - 16).h)) / 10;
    this.curv = damp(this.curv, k, 4, dt || 0.016);
    this._pitch = damp(this._pitch || 0, clamp(this.a * 0.003, -0.012, 0.012), 4, dt || 0.016);
    const vib = Math.abs(this.v) > 0.5 ? Math.sin(performance.now() * 0.03) * 0.0008 * Math.min(1, Math.abs(this.v) / 8) : 0;
    for (const m of this.mods) {
      const b = rig.bodies[m.name];
      b.rotation.x = this._pitch;
      b.rotation.z = clamp(this.v * this.v * this.curv * 0.004, 0, 0.02) * Math.sign(wrapAngle(r.pose(this.s - m.dist + 3).h - r.pose(this.s - m.dist - 3).h));
      b.position.y = vib + (this.shake ? (Math.random() - 0.5) * this.shake * 0.04 : 0);
    }
    for (const root of rig.roots) root.updateMatrixWorld(true);
    rig.updateBellows();
  }
  obbs() {
    const out = [];
    for (const m of this.mods) {
      const P = this.poseOf[m.name]; const c = (m.z0 + m.z1) / 2;
      out.push({ x: P.x - Math.cos(P.h) * c, z: P.z - Math.sin(P.h) * c, h: P.h, hd: (m.z1 - m.z0) / 2, hw: 1.22 });
    }
    return out;
  }
  checkCollision(traffic) {
    const bx = this.obbs();
    for (const c of traffic.boxes()) {
      if (Math.abs(c.x - this.hx) > 30 || Math.abs(c.z - this.hz) > 30) continue;
      for (const b of bx) if (obbOverlap(b, c)) { c.ref.v = 0; this.lastHit = { kind: 'car', x: c.x, z: c.z }; return true; }
    }
    return false;
  }
  /** Points along the tram (for traffic look-ahead). */
  samplePts(out = []) {
    out.length = 0;
    for (let d = 0; d <= TR.length; d += 2.6) { const p = this.route.pose(this.s - d); const rx = p.rx * 1.15, rz = p.rz * 1.15; out.push(p.x, p.z, p.x + rx, p.z + rz, p.x - rx, p.z - rz); }
    return out;
  }
}

/** Blue-white sparks at the pantograph. */
class Sparks {
  constructor(n = 160) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -100;
  }
  burst(p, k) {
    for (let j = 0; j < k; j++) {
      const i = this.i++ % this.n;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = (Math.random() - 0.5) * 3; this.vel[i * 3 + 1] = Math.random() * 1.5 - 0.5; this.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      this.life[i] = 0.25 + Math.random() * 0.35;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -100;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
export { lerp };
