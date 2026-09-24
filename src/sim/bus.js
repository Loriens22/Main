// Articulated trolleybus simulation: kinematics, traction, brakes, doors, poles & wires, collisions.
import * as THREE from 'three';
import { B, updateBellows } from '../bus/model.js';
import { clamp, lerp, damp, wrapAngle, obbOverlap, smoothstep } from '../util.js';
import { WIRE_Y } from '../world/catenary.js';

const G = 9.81;
export const MAX_STEER = 50 * Math.PI / 180;
export const WHEEL_TURNS = 1.5; // steering wheel lock-to-centre turns

export class Bus {
  constructor(rig, route, cat, events) {
    this.rig = rig; this.route = route; this.cat = cat; this.ev = events || (() => {});
    this.dir = new THREE.Vector3();
    this.v = 0; this.a = 0; this.jerk = 0; this.steer = 0; this.steerCmd = 0;
    this.throttle = 0; this.brake = 0; this.gear = 'N'; this.park = true; this.kneel = 0; this.kneelCmd = false;
    this.indicator = 0; this.hazard = false; this.horn = false; this.blinkT = 0;
    this.passengers = 0;
    this.power = true; this.battery = false;
    this.odometer = 0;
    this.collisionT = 0;
    this.shake = 0;
    this.poles = rig.poles.map((p) => ({ ...p, state: 'on', t: 0, yawA: 0, pitchA: 0.3, target: null, hint: -1 }));
    this.sparks = new Sparks(); rig.front.parent?.add?.(this.sparks.points);
    this.tmpM = new THREE.Matrix4(); this.tmpV = new THREE.Vector3(); this.tmpQ = new THREE.Quaternion();
    this.staticColliders = [];
    this.projHint = -1;
    this.spd = 0;
  }

  /** Places the bus with its front bumper at game route distance s (on the lane). */
  placeOnRoute(s) {
    const r = this.route;
    // front axle is 2.7 m behind the bumper, middle axle 5.9 m further
    const a2 = r.pose(s - 2.725 - B.L1);
    const a1 = r.pose(s - 2.725);
    this.x = a2.x; this.z = a2.z; this.h = Math.atan2(a1.z - a2.z, a1.x - a2.x);
    const hitch = r.pose(s - 2.725 - B.L1 - B.hitch);
    const a3 = r.pose(s - 2.725 - B.L1 - B.hitch - B.L2);
    this.hx = hitch.x; this.hz = hitch.z;
    this.ax3 = a3.x; this.az3 = a3.z;
    this.h2 = Math.atan2(hitch.z - a3.z, hitch.x - a3.x);
    this.v = 0; this.steer = 0; this.steerCmd = 0;
    this.applyPose(0);
    for (const p of this.poles) { p.state = 'on'; p.hint = -1; }
    this.updatePoles(0.016, true);
  }

  get articulation() { return wrapAngle(this.h2 - this.h); }
  get steerable() { return true; }
  /** Pure-pursuit steering command (−1..1) towards the route lane, from the middle axle. */
  pursuitSteer(route, sF) {
    const Ld = 11 + Math.abs(this.v) * 0.7;
    const la = route.pose(sF - 2.725 - B.L1 + Ld);
    const dx = la.x - this.x, dz = la.z - this.z; const L = Math.hypot(dx, dz) || 1;
    const al = wrapAngle(Math.atan2(dz, dx) - this.h);
    const delta = Math.atan(2 * B.L1 * Math.sin(al) / L);
    return clamp(delta / MAX_STEER, -1, 1);
  }

  frontBumper(out = new THREE.Vector3()) { return out.set(this.x + Math.cos(this.h) * (B.L1 + 2.725), 0, this.z + Math.sin(this.h) * (B.L1 + 2.725)); }

  doorsOpen() { return this.rig.doors.some((d) => d.open > 0.02 || d.target > 0); }

  setDoor(i, open) {
    const d = this.rig.doors[i];
    if (open && Math.abs(this.v) > 0.8) { this.ev('msg', 'Вратите не се отварят в движение', 'bad'); return; }
    if (!open && d.blocked) { this.ev('msg', 'Пътник на вратата!', 'bad'); this.ev('beep'); return; }
    if ((d.target > 0) === open) return;
    d.target = open ? 1 : 0;
    d.pending = open ? 0 : 1.1; // close: warning beeps first
    this.ev(open ? 'doorOpen' : 'doorWarn', i);
  }
  toggleDoors() {
    const anyOpen = this.rig.doors.some((d) => d.target > 0);
    for (let i = 0; i < this.rig.doors.length; i++) this.setDoor(i, !anyOpen);
  }

  update(dt, traffic) {
    const rig = this.rig;
    // ---------------- doors ----------------
    let anyDoor = false;
    for (let i = 0; i < rig.doors.length; i++) {
      const d = rig.doors[i];
      if (d.target === 0 && d.pending > 0) { d.pending -= dt; if (d.pending <= 0) this.ev('doorClose', i); }
      const goal = d.target === 0 && d.pending > 0 ? 1 : d.target;
      const sp = 1 / 1.5;
      d.open = clamp(d.open + Math.sign(goal - d.open) * sp * dt, 0, 1);
      const e = d.open * d.open * (3 - 2 * d.open);
      for (const l of d.leaves) l.pivot.rotation.y = l.dir * e * 1.52;
      d.lampMat.emissiveIntensity = d.open > 0.01 && d.open < 0.99 ? (Math.floor(performance.now() / 250) % 2 ? 2.5 : 0.2) : d.open >= 0.99 ? 1.5 : 0;
      if (d.open > 0.01) anyDoor = true;
    }
    // ---------------- steering ----------------
    const steerRate = 1.1; // rad/s at the wheels
    this.steer += clamp(this.steerCmd * MAX_STEER - this.steer, -steerRate * dt, steerRate * dt);
    // ---------------- longitudinal ----------------
    const m = 18500 + this.passengers * 75;
    const vAbs = Math.abs(this.v);
    let F = 0;
    const powered = this.power || this.battery;
    const canDrive = !anyDoor && !this.park && powered && (this.gear === 'D' || this.gear === 'R');
    // tell the driver why the pedal does nothing
    this.hintT = Math.max(0, (this.hintT || 0) - dt);
    if (!canDrive && this.throttle > 0.3 && this.hintT <= 0) {
      this.hintT = 3.5;
      const why = anyDoor ? (rig.doors.some((d) => d.blocked) ? 'Блокировка на вратите — пътници още се качват' : 'Блокировка: затворете вратите (ВРАТИ / O)')
        : this.park ? 'Освободете ръчната спирачка (P)'
          : !powered ? 'Няма напрежение — вдигнете щангите (ЩАНГИ / T)'
            : 'Изберете посока D или R';
      this.ev('msg', why, 'bad');
    }
    // traction/brake controllers ramp their demand (jerk limitation of the Škoda drive, ~1.2 m/s³)
    this.thrEff = this.thrEff || 0; this.brkEff = this.brkEff || 0;
    const thrT = canDrive ? this.throttle : 0;
    this.thrEff += clamp(thrT - this.thrEff, -2.5 * dt, 0.9 * dt);
    this.brkEff += clamp(this.brake - this.brkEff, -3 * dt, (this.brake > 0.95 ? 6 : 1.8) * dt);
    if (canDrive && this.thrEff > 0.001) {
      const P = this.battery && !this.power ? 70000 : 250000;
      const Fmax = this.battery && !this.power ? 20000 : 36000;
      const vmax = this.gear === 'R' ? 2.8 : this.battery && !this.power ? 7 : 18.5;
      let f = this.thrEff * Math.min(Fmax, P / Math.max(vAbs, 2.2));
      f *= 1 - smoothstep(vmax - 1.2, vmax, vAbs);
      F += this.gear === 'R' ? -f : f;
    }
    const drag = 0.5 * 1.2 * 6.8 * this.v * vAbs + 0.009 * m * G * Math.sign(this.v);
    F -= drag;
    let decel = this.brkEff * (this.brake > 0.96 ? 6.5 : 4.2);
    if (this.throttle < 0.02 && this.brake < 0.02 && vAbs > 0.6 && powered) decel += 0.28; // electric coast regen
    if (anyDoor || this.park) decel = Math.max(decel, 6);
    let aTot = F / m;
    const vNew = this.v + aTot * dt;
    // brake opposes motion without reversing it
    const dv = decel * dt;
    let v2;
    if (vNew > 0) v2 = Math.max(0, vNew - dv); else if (vNew < 0) v2 = Math.min(0, vNew + dv); else v2 = 0;
    if ((anyDoor || this.park) && vAbs < 0.3) v2 = 0;
    const aReal = (v2 - this.v) / dt;
    this.jerk = damp(this.jerk, Math.abs(aReal - this.a) / dt, 5, dt);
    this.a = damp(this.a, aReal, 8, dt);
    this.v = v2;
    // ---------------- kinematics ----------------
    const prev = { x: this.x, z: this.z, h: this.h, h2: this.h2, ax3: this.ax3, az3: this.az3 };
    const ds = this.v * dt;
    this.odometer += Math.abs(ds);
    this.h += (this.v * Math.tan(this.steer) / B.L1) * dt;
    this.x += Math.cos(this.h) * ds; this.z += Math.sin(this.h) * ds;
    this.hx = this.x - Math.cos(this.h) * B.hitch; this.hz = this.z - Math.sin(this.h) * B.hitch;
    let dx = this.hx - this.ax3, dz = this.hz - this.az3; const L = Math.hypot(dx, dz) || 1;
    this.ax3 = this.hx - (dx / L) * B.L2; this.az3 = this.hz - (dz / L) * B.L2;
    this.h2 = Math.atan2(this.hz - this.az3, this.hx - this.ax3);
    const lim = 0.9;
    const art = wrapAngle(this.h2 - this.h);
    if (Math.abs(art) > lim) { this.h2 = this.h + Math.sign(art) * lim; this.ax3 = this.hx - Math.cos(this.h2) * B.L2; this.az3 = this.hz - Math.sin(this.h2) * B.L2; if (this.v < 0) this.v *= 0.5; }
    // ---------------- collisions ----------------
    if (this.checkCollision(traffic)) {
      Object.assign(this, prev);
      this.hx = this.x - Math.cos(this.h) * B.hitch; this.hz = this.z - Math.sin(this.h) * B.hitch;
      if (Math.abs(this.v) > 1.2 && this.collisionT <= 0) { this.ev('collision', Math.abs(this.v)); this.shake = Math.min(1, Math.abs(this.v) / 6); this.collisionT = 1.5; }
      this.v = 0;
    }
    this.collisionT -= dt;
    // ---------------- lights ----------------
    this.blinkT += dt;
    const blink = Math.floor(this.blinkT / 0.4) % 2 === 0;
    const L_on = (this.indicator < 0 || this.hazard) && blink, R_on = (this.indicator > 0 || this.hazard) && blink;
    rig.M.indL.emissiveIntensity = L_on ? 3 : 0; rig.M.indR.emissiveIntensity = R_on ? 3 : 0;
    const blinkEdge = blink !== this._lastBlink; this._lastBlink = blink;
    if (blinkEdge && (this.indicator || this.hazard)) this.ev('tick', blink);
    rig.M.brake.emissiveIntensity = this.brake > 0.05 || (vAbs < 0.1 && (anyDoor || this.park)) ? 3.5 : 0;
    rig.M.reverse.emissiveIntensity = this.gear === 'R' ? 2.5 : 0;
    // kneeling (right side lowers ~7 cm)
    this.kneel = damp(this.kneel, this.kneelCmd && vAbs < 0.5 ? 1 : 0, 2.2, dt);
    this.applyPose(dt);
    this.updatePoles(dt);
    this.sparks.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  applyPose(dt) {
    const rig = this.rig;
    rig.front.position.set(this.x, 0, this.z);
    rig.front.rotation.set(0, -this.h - Math.PI / 2, 0);
    rig.rear.position.set(this.hx, 0, this.hz);
    rig.rear.rotation.set(0, -this.h2 - Math.PI / 2, 0);
    // suspension: pitch with acceleration, roll with lateral acceleration, kneel, small road vibration
    const aLat = this.v * this.v * Math.tan(this.steer) / B.L1;
    this._pitch = damp(this._pitch || 0, clamp(this.a * 0.0045, -0.025, 0.02), 4, dt || 0.016);
    this._roll = damp(this._roll || 0, clamp(aLat * 0.009, -0.03, 0.03), 3, dt || 0.016);
    const vib = Math.abs(this.v) > 0.5 ? (Math.sin(performance.now() * 0.021) * 0.0012 + Math.sin(performance.now() * 0.047) * 0.0008) * Math.min(1, Math.abs(this.v) / 8) : 0;
    const kneelRoll = -this.kneel * 0.028, kneelY = -this.kneel * 0.035;
    for (const [body, k] of [[rig.frontBody, 1], [rig.rearBody, 0.8]]) {
      body.rotation.x = this._pitch * k;
      body.rotation.z = this._roll * k + kneelRoll;
      body.position.y = vib + kneelY + (this.shake ? (Math.random() - 0.5) * this.shake * 0.05 : 0);
    }
    const artic = (-this.h2) - (-this.h);
    updateBellows(rig, artic);
    // wheels
    const dA = (this.v * (dt || 0)) / B.wheelR;
    const inner = Math.atan(Math.tan(this.steer) * B.L1 / (B.L1 - 1.0 * Math.sign(this.steer || 1)));
    for (const w of rig.wheels) {
      w.spin.rotation.x -= dA;
      if (w.steer) {
        const isInner = (this.steer > 0 && w.side > 0) || (this.steer < 0 && w.side < 0);
        w.steerG.rotation.y = -(isInner ? inner : this.steer);
      }
    }
    // cab steering wheel & speedometer
    rig.steeringWheel.rotation.y = -(this.steer / MAX_STEER) * WHEEL_TURNS * Math.PI * 2;
    const kmh = Math.abs(this.v) * 3.6;
    const a = Math.PI * 0.75 + Math.PI * 1.5 * clamp(kmh / 100, 0, 1);
    rig.speedNeedle.rotation.z = -a - Math.PI / 2;
    if (rig.gearMat) for (const g of ['D', 'N', 'R']) rig.gearMat[g].emissiveIntensity = this.gear === g ? 2 : 0.05;
  }

  /* ---------------------------- poles ---------------------------- */
  poleBaseWorld(p, out) {
    return out.set(p.side * B.pole.x, B.pole.y, B.pole.z).applyMatrix4(this.rig.rearBody.matrixWorld);
  }
  updatePoles(dt, snap = false) {
    const rig = this.rig;
    rig.rear.updateMatrixWorld(true);
    const inv = this.tmpM.copy(rig.rearBody.matrixWorld).invert();
    let allOn = true;
    for (const p of this.poles) {
      const base = this.poleBaseWorld(p, new THREE.Vector3());
      const wire = p.side < 0 ? this.cat.wireL : this.cat.wireR;
      const pr = wire.project(base.x, base.z, p.hint, 40);
      p.hint = pr.i;
      p.lat = pr.lat;
      const rise = WIRE_Y - base.y;
      const reach = Math.sqrt(Math.max(1, B.pole.len * B.pole.len - rise * rise));
      // find the point on the wire at horizontal distance `reach` behind the base
      let sT = pr.s - Math.sqrt(Math.max(0, reach * reach - pr.lat * pr.lat));
      const o = {};
      for (let k = 0; k < 3; k++) { wire.at(sT, o); const d = Math.hypot(o.x - base.x, o.z - base.z); sT += d - reach; }
      wire.at(sT, o);
      const target = new THREE.Vector3(o.x, WIRE_Y + 0.04, o.z);
      const local = target.clone().applyMatrix4(inv).sub(new THREE.Vector3(p.side * B.pole.x, B.pole.y, B.pole.z)).normalize();
      const yawT = Math.atan2(local.x, local.z), pitchT = -Math.asin(clamp(local.y, -1, 1));
      p.contact = target;
      if (p.state === 'on') {
        if (Math.abs(pr.lat) > 4.6 || Math.abs(yawT) > 1.15 || local.z < 0.2) { this.dewire(p); }
        else { p.yawA = snap ? yawT : damp(p.yawA, yawT, 30, dt); p.pitchA = snap ? pitchT : damp(p.pitchA, pitchT, 30, dt); }
      } else if (p.state === 'dewired') {
        p.t += dt;
        if (p.t < 0.35) { p.pitchA = damp(p.pitchA, -0.95, 10, dt); p.yawA = damp(p.yawA, p.yawA * 1.3, 3, dt); }
        else { p.pitchA = damp(p.pitchA, 0.012 + Math.sin(p.t * 9) * 0.03 * Math.exp(-p.t * 2), 3.2, dt); p.yawA = damp(p.yawA, 0, 3, dt); if (p.t > 2.6) p.state = 'down'; }
      } else if (p.state === 'down') {
        p.pitchA = damp(p.pitchA, 0.012, 5, dt); p.yawA = damp(p.yawA, 0, 5, dt);
      } else if (p.state === 'raising') {
        p.t += dt;
        const k = smoothstep(0, 1, p.t / 2.8);
        p.pitchA = lerp(0.012, pitchT, k) - Math.sin(k * Math.PI) * 0.12; p.yawA = lerp(0, yawT, k);
        if (p.t >= 2.8) { p.state = 'on'; this.sparks.burst(target, 12); this.ev('rewired'); }
      }
      if (p.state !== 'on') allOn = false;
      p.yaw.rotation.y = p.yawA; p.pitch.rotation.x = p.pitchA;
      // retriever rope from the pole to the drum on the rear panel
      const tip = new THREE.Vector3(0, 0, B.pole.len - 0.45).applyAxisAngle(new THREE.Vector3(1, 0, 0), p.pitchA).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yawA).add(new THREE.Vector3(p.side * B.pole.x, B.pole.y, B.pole.z));
      const ret = p.retriever;
      const arr = p.rope.geometry.attributes.position.array;
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const x = lerp(tip.x, ret.x, t), y = lerp(tip.y, ret.y, t) - Math.sin(t * Math.PI) * 0.25, z = lerp(tip.z, ret.z, t) + Math.sin(t * Math.PI) * 0.15;
        arr[i * 3] = x; arr[i * 3 + 1] = Math.max(y, t > 0.5 ? ret.y : y); arr[i * 3 + 2] = z;
      }
      p.rope.geometry.attributes.position.needsUpdate = true;
      // occasional sparks while drawing current
      if (p.state === 'on' && Math.abs(this.v) > 3 && this.throttle > 0.3 && Math.random() < dt * 0.25) this.sparks.burst(target, 4);
    }
    this.power = allOn;
  }
  dewire(p) {
    if (p.state !== 'on') return;
    p.state = 'dewired'; p.t = 0;
    this.sparks.burst(p.contact, 40);
    // the other pole usually follows
    for (const q of this.poles) if (q !== p && q.state === 'on') { q.state = 'dewired'; q.t = -0.15; }
    this.ev('dewire');
  }
  canRaisePoles() {
    return Math.abs(this.v) < 0.8 && this.poles.every((p) => p.state === 'down' && Math.abs(p.lat) < 2.2);
  }
  raisePoles() {
    if (this.poles.every((p) => p.state === 'on')) { for (const p of this.poles) { p.state = 'dewired'; p.t = 0.4; } this.ev('msg', 'Щангите са свалени'); return; }
    if (!this.canRaisePoles()) {
      if (this.poles.some((p) => p.state === 'down')) this.ev('msg', Math.abs(this.v) > 0.8 ? 'Спрете, за да вдигнете щангите' : 'Приближете се под контактната мрежа (< 2 м)', 'bad');
      return;
    }
    for (const p of this.poles) { p.state = 'raising'; p.t = 0; }
    this.ev('raising');
  }

  /* ------------------------- collisions ------------------------- */
  obbs() {
    const cF = -(8.625 - 1.35) / 2 - 1.35 + 1.35; // centre of front body in local z ≈ -3.64
    const fz = (-8.625 + 1.35) / 2, rz = (B.rearStart + B.rearEnd) / 2;
    const dF = { x: this.x - Math.cos(this.h) * fz, z: this.z - Math.sin(this.h) * fz, h: this.h, hd: (8.625 + 1.35) / 2, hw: 1.29 };
    const dR = { x: this.hx - Math.cos(this.h2) * rz, z: this.hz - Math.sin(this.h2) * rz, h: this.h2, hd: (B.rearEnd - B.rearStart) / 2, hw: 1.29 };
    void cF;
    return [dF, dR];
  }
  checkCollision(traffic) {
    const bx = this.obbs();
    if (traffic) for (const c of traffic.boxes()) for (const b of bx) if (obbOverlap(b, c)) { c.ref.v = 0; this.lastHit = { kind: 'car', x: c.x, z: c.z, lane: c.ref.lane?.name }; return true; }
    for (const c of this.staticColliders) {
      if (Math.abs(c.x - this.x) > 90 || Math.abs(c.z - this.z) > 90) continue;
      for (const b of bx) if (obbOverlap(b, c)) { this.lastHit = { kind: 'static', x: c.x, z: c.z, hd: c.hd, hw: c.hw }; return true; }
    }
    return false;
  }
  /** Sample points along the bus (for traffic look-ahead). */
  samplePts(out = []) {
    out.length = 0;
    // centre line and both flanks (cars crossing in front of the bus must stop short of its side)
    const add = (x, z, h) => { const rx = -Math.sin(h) * 1.2, rz = Math.cos(h) * 1.2; out.push(x, z, x + rx, z + rz, x - rx, z - rz); };
    for (const z of [-8.4, -6, -3.6, -1.2, 1.2]) add(this.x - Math.cos(this.h) * z, this.z - Math.sin(this.h) * z, this.h);
    for (const z of [0.6, 3.0, 5.4, 7.5]) add(this.hx - Math.cos(this.h2) * z, this.hz - Math.sin(this.h2) * z, this.h2);
    return out;
  }
}

/** Blue-white electric sparks at the trolley heads. */
class Sparks {
  constructor(n = 200) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xbfe4ff, size: 0.12, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -100;
  }
  burst(p, k) {
    if (!p) return;
    for (let j = 0; j < k; j++) {
      const i = this.i = (this.i + 1) % this.n;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = (Math.random() - 0.5) * 6; this.vel[i * 3 + 1] = Math.random() * 3 - 0.5; this.vel[i * 3 + 2] = (Math.random() - 0.5) * 6;
      this.life[i] = 0.3 + Math.random() * 0.5;
    }
    this.flash = 0.12;
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
    if (this.flash > 0) this.flash -= dt;
  }
}
