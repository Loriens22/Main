// The current collection of a trolleybus: two spring-raised trolley poles on the roof of the rear section, each
// pressing its collector shoe up against one of the two contact wires (the left pole on the positive wire, the
// right pole on the negative one). Every frame the shoe slides along its wire at the point whose distance from
// the pole base equals the pole length, behind the base (the poles trail); the pole follows by yaw and pitch
// about the base. The bus may move sideways under the wire as far as the pole geometry allows.
//
// States of each pole: 'down' (lying back in its hook), 'raising' (pneumatic / manual raise to the wire),
// 'up' (on the wire), 'dewired' (jumped off: the spring throws it up and it swings), 'lowering'.
// Dewirement (realistic mode): too far from the wire laterally (spec.trolley.maxLateral), or the pole swinging
// sideways too fast in a curve at speed. Modern Škoda buses detect it and lower the poles pneumatically
// (spec.trolley.autoLower); the Ikarus pole stays up on its rope until the driver pulls it down.
// Power: both shoes on the wire -> line voltage; otherwise the Solaris IV runs on its traction battery
// (limited power and speed, finite energy); the others coast.
import * as THREE from 'three';
import { fwdX, fwdZ, clamp } from '../core/math.js';

const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const RAISE_T = 2.6, LOWER_T = 2.0;

function makeSparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(190,220,255,0.95)');
  gr.addColorStop(0.45, 'rgba(120,160,255,0.35)');
  gr.addColorStop(1, 'rgba(80,120,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let SPARK_TEX = null;

export class TrolleyPoles {
  constructor(bus, world, { realistic = false, autoRecover = true } = {}) {
    this.bus = bus;
    this.world = world;
    this.T = bus.spec.trolley;
    this.net = world.trolleyWires || null;
    this.realistic = realistic;
    this.autoRecover = autoRecover;
    const T = this.T;
    this.poles = T.base.map((b, i) => ({
      i,
      side: i === 0 ? 'left' : 'right',
      baseLocal: new THREE.Vector3(b[0], b[1], b[2]),
      state: 'down',
      t: 0, // raise / lower progress
      dir: new THREE.Vector3(), // current pole direction in the rear-section frame
      from: new THREE.Vector3(),
      head: new THREE.Vector3(), // world position of the shoe
      hint: null,
      yawRate: 0,
      prevYaw: null,
      swing: 0,
      swingV: 0,
      contact: false,
    }));
    // rest direction: from the base back and slightly down to the hook at the tail
    for (const p of this.poles) p.rest = new THREE.Vector3(0, T.hook[1] - p.baseLocal.y, T.hook[0] - p.baseLocal.z).normalize();
    for (const p of this.poles) p.dir.copy(p.rest);
    this.battery = T.battery ? { soc: 1, kWh: T.battery.kWh * T.battery.usable } : null;
    this.line = false; // line voltage at the shoes
    this.events = []; // 'dewire', 'rewire', 'spark', 'raised', 'lowered' for audio / HUD
    this.sparkT = 0;
    this.buildVisuals();
  }

  /** Pole meshes: the model's own (model.poles = [{pivot}], pole along +z of the pivot) or simple tubes. */
  buildVisuals() {
    const m = this.bus.model;
    if (m.poles && m.poles.length === 2) {
      this.vis = m.poles;
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.5, metalness: 0.5 });
      const L = this.T.length;
      this.vis = this.poles.map((p) => {
        const pivot = new THREE.Group();
        pivot.position.copy(p.baseLocal);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, L, 8).rotateX(Math.PI / 2).translate(0, 0, L / 2), mat);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.26).translate(0, 0.03, L), mat);
        pivot.add(tube, shoe);
        m.rear.add(pivot);
        return { pivot };
      });
    }
    if (typeof document !== 'undefined') {
      SPARK_TEX = SPARK_TEX || makeSparkTexture();
      this.spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: SPARK_TEX, color: 0xbfd6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      this.spark.scale.set(0.9, 0.9, 0.9);
      this.spark.visible = false;
      this.bus.scene.add(this.spark);
    }
  }

  get up() {
    return this.poles.every((p) => p.state === 'up');
  }

  get anyDewired() {
    return this.poles.some((p) => p.state === 'dewired');
  }

  /** Driver: raise both poles (to the wire overhead) or lower them. */
  toggle() {
    if (this.poles.some((p) => p.state === 'up' || p.state === 'raising')) this.lower();
    else this.raise();
  }

  raise() {
    for (const p of this.poles) {
      if (p.state === 'up' || p.state === 'raising') continue;
      p.from.copy(p.dir);
      p.state = 'raising';
      p.t = 0;
    }
    this.events.push('raising');
  }

  lower() {
    for (const p of this.poles) {
      if (p.state === 'down' || p.state === 'lowering') continue;
      p.from.copy(p.dir);
      p.state = 'lowering';
      p.t = 0;
    }
    this.events.push('lowering');
  }

  /** Place both poles on the wire at once (start of a service, AI buses). */
  snapUp() {
    for (const p of this.poles) { p.state = 'up'; p.t = 1; p.hint = null; }
    this.manualDown = false;
  }

  /** Both poles on their hooks at once (a trolleybus prepared from cold). */
  snapDown() {
    for (const p of this.poles) { p.state = 'down'; p.t = 0; p.hint = null; p.dir.copy(p.rest); }
    this.manualDown = true; // stays down until the driver raises them
    this.line = false;
  }

  /** World transform of the rear section (as BusEntity posed it). */
  rearMatrix() {
    const r = this.bus.model.rear;
    r.updateMatrixWorld();
    return r.matrixWorld;
  }

  /** Contact point of a pole on its wire, or null (no wire within reach). Returns {head, lateral, line}. */
  contact(p, B) {
    const net = this.net;
    if (!net) return null;
    const ph = this.bus.phys;
    const hx = fwdX(ph.yawR), hz = fwdZ(ph.yawR);
    const f = net.find(B.x, B.z, hx, hz, 9, p.hint);
    if (!f) return null;
    const W = p.side === 'left' ? f.line.left : f.line.right;
    const L = this.T.length;
    const n = W.nearest(B.x, B.z, p.hint && p.hint.line === f.line ? p.hint.s : f.s, 25);
    const at = W.at(n.s);
    const dh = at.y - B.y;
    const e = n.d;
    const reach2 = L * L - dh * dh - e * e;
    if (reach2 < 0.25) return { head: null, lateral: e, line: f.line };
    // the shoe trails behind the base: solve |W(s) - B| = L for s behind the nearest point (Newton)
    let s = n.s - Math.sqrt(reach2);
    const q = {};
    for (let k = 0; k < 4; k++) {
      W.at(s, q);
      const dx = q.x - B.x, dy = q.y - B.y, dz = q.z - B.z, D = Math.hypot(dx, dy, dz) || 1;
      const dfds = (q.tx * dx + q.tz * dz) / D;
      if (Math.abs(dfds) < 1e-3) break;
      s -= (D - L) / dfds;
      if (s < 0) { s = 0; break; }
    }
    W.at(s, q);
    p.hint = { line: f.line, s: n.s };
    return { head: new THREE.Vector3(q.x, q.y, q.z), lateral: e, line: f.line, s, W };
  }

  /** Advance the poles after the physics step (dt real time). */
  update(dt) {
    const M = this.rearMatrix();
    const rq = _q.setFromRotationMatrix(M).invert();
    const speed = Math.abs(this.bus.phys.v);
    let contacts = 0;
    for (const p of this.poles) {
      const B = _v.copy(p.baseLocal).applyMatrix4(M);
      const c = p.state === 'down' ? null : this.contact(p, B);
      const target = c && c.head ? c.head.clone().sub(B).applyQuaternion(rq).normalize() : null;
      switch (p.state) {
        case 'raising': {
          p.t = Math.min(1, p.t + dt / RAISE_T);
          const k = p.t * p.t * (3 - 2 * p.t);
          const aim = target || new THREE.Vector3(0, 0.62, 0.79).normalize(); // no wire: up to the stop
          p.dir.copy(p.from).lerp(aim, k).normalize();
          if (p.t >= 1) {
            if (target) { p.state = 'up'; this.events.push('raised'); this.sparkAt(c.head, 0.12); }
            else { p.state = 'lowering'; p.from.copy(p.dir); p.t = 0; this.events.push('nowire'); }
          }
          break;
        }
        case 'up': {
          if (!target) { this.dewire(p, 'lost'); break; }
          // swing rate of the pole sideways (yaw in the section frame)
          const yaw = Math.atan2(target.x, target.z);
          if (p.prevYaw != null) p.yawRate = p.yawRate * 0.85 + ((yaw - p.prevYaw) / Math.max(dt, 1e-3)) * 0.15;
          p.prevYaw = yaw;
          const tooFar = c.lateral > this.T.maxLateral;
          const whip = Math.abs(p.yawRate) > 1.25 && speed > 8;
          if (this.realistic && (tooFar || whip)) { this.dewire(p, tooFar ? 'lateral' : 'whip'); break; }
          p.dir.copy(target);
          p.head.copy(c.head);
          contacts++;
          // insulated crossings and section breaks: a short gap in the supply and a flash at the shoe
          if (this.net && this.net.crossings.length) {
            for (const k of this.net.crossings) {
              if (Math.abs(k.x - c.head.x) < 1.2 && Math.abs(k.z - c.head.z) < 1.2) { p.gap = 0.25; if (this.bus.phys.motorPower > 5e3) this.sparkAt(c.head, 0.09); }
            }
          }
          if (p.gap > 0) { p.gap -= dt; contacts--; }
          break;
        }
        case 'dewired': {
          // the spring throws the pole up; it swings and settles near its top stop
          p.swingV += (-p.swing * 9 - p.swingV * 1.4) * dt;
          p.swing += p.swingV * dt;
          const aim = new THREE.Vector3(Math.sin(p.swing) * 0.55, 0.78, Math.cos(p.swing) * 0.62).normalize();
          p.dir.lerp(aim, clamp(dt * 6, 0, 1)).normalize();
          p.t += dt;
          if (this.T.autoLower && p.t > 0.6) { p.state = 'lowering'; p.from.copy(p.dir); p.t = 0; }
          break;
        }
        case 'lowering': {
          p.t = Math.min(1, p.t + dt / LOWER_T);
          const k = p.t * p.t * (3 - 2 * p.t);
          p.dir.copy(p.from).lerp(p.rest, k).normalize();
          if (p.t >= 1) { p.state = 'down'; this.events.push('lowered'); }
          break;
        }
        default:
          p.dir.copy(p.rest);
      }
      p.contact = p.state === 'up';
    }
    this.line = contacts === 2;
    // supply: line, else battery (Solaris IV), else nothing
    const ph = this.bus.phys;
    if (this.line) {
      ph.powerAvail = 1; ph.powerLimit = Infinity; ph.speedLimit = Infinity;
      if (this.battery && this.battery.soc < 1) this.battery.soc = Math.min(1, this.battery.soc + (25 * dt) / 3600 / this.battery.kWh); // 25 kW charging
      this.onBattery = false;
    } else if (this.battery && this.battery.soc > 0.03) {
      ph.powerAvail = 1; ph.powerLimit = this.T.battery.power; ph.speedLimit = this.T.battery.vmax;
      const kw = Math.max(0, ph.motorPower) / 1000 + 6; // traction + auxiliaries (compressor, heating, lighting)
      this.battery.soc = Math.max(0, this.battery.soc - (kw * dt) / 3600 / this.battery.kWh);
      this.onBattery = true;
    } else {
      ph.powerAvail = 0;
      this.onBattery = false;
    }
    // automatic recovery (beginner mode): stopped under the wire with a pole off -> lower it, then raise again
    if (this.autoRecover && !this.manualDown && speed < 0.2 && this.poles.some((p) => p.state === 'down' || p.state === 'dewired')) {
      this.recoverT = (this.recoverT || 0) + dt;
      if (this.recoverT > 1.2 && this.poles.some((p) => p.state === 'dewired')) { this.lower(); this.recoverT = 0; }
      else if (this.recoverT > 2.5 && this.poles.some((p) => p.state === 'down')) { this.raise(); this.recoverT = 0; }
    } else this.recoverT = 0;
    this.sparkT -= dt;
    if (this.spark) {
      this.spark.visible = this.sparkT > 0;
      if (this.spark.visible) this.spark.material.opacity = clamp(this.sparkT * 9, 0, 1) * (0.7 + Math.random() * 0.3);
    }
  }

  dewire(p, why) {
    p.state = 'dewired';
    p.t = 0;
    p.swing = (p.side === 'left' ? -1 : 1) * 0.6 * (Math.sign(p.yawRate) || 1);
    p.swingV = 0;
    p.from.copy(p.dir);
    this.events.push('dewire');
    this.dewireWhy = why;
    if (p.head) this.sparkAt(p.head, 0.25);
  }

  sparkAt(pos, dur) {
    if (!this.spark) return;
    this.spark.position.copy(pos);
    this.sparkT = Math.max(this.sparkT, dur);
    this.events.push('spark');
  }

  /** Orient the pole meshes (after the sections were posed). */
  pose() {
    for (let i = 0; i < this.poles.length; i++) {
      const p = this.poles[i], v = this.vis[i];
      if (!v) continue;
      v.pivot.quaternion.setFromUnitVectors(Z, _w.copy(p.dir).normalize());
      if (v.onPose) v.onPose(p);
    }
  }

  dispose() {
    if (this.spark) { this.bus.scene.remove(this.spark); this.spark.material.dispose(); }
  }
}
