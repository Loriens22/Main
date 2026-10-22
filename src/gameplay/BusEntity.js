// A bus in the world: physics + 3D model + doors + route state + signs.
import * as THREE from 'three';
import { ArticulatedBus } from '../vehicle/ArticulatedBus.js';
import { BusModel } from '../vehicle/BusModel.js';
import { DoorSystem } from '../vehicle/DoorController.js';
import { BUS, HITCH_FRONT_Z } from '../vehicle/BusSpec.js';
import { StopManager } from './StopManager.js';
import { AnnouncementManager } from './AnnouncementManager.js';
import { DestinationDisplay } from './DestinationDisplay.js';
import { buildDriveLine } from './DriveLine.js';
import { fwdX, fwdZ, clamp } from '../core/math.js';

const FIXED = 1 / 120;

export class BusEntity {
  constructor({ scene, world, route, dirId = 'A', fleet = '3145', quality = 'high', player = false }) {
    this.scene = scene;
    this.world = world;
    this.route = route;
    this.player = player;
    this.model = new BusModel({ fleet, quality, interior: true });
    scene.add(this.model.root);
    this.phys = new ArticulatedBus({
      heightAt: (x, z) => world.hf.heightAt(x, z),
      collide: (b) => this.collideStatic(b),
    });
    this.doors = new DoorSystem([1, 2, 3, 4]);
    this.lights = { head: false, left: false, right: false, hazard: false, interior: 1 };
    this.wiper = { mode: 0, phase: 0 };
    this.blink = 0;
    this.acc = 0;
    this.prev = null;
    this.stopRequested = false;
    this.events = [];
    this.setDirection(dirId);
  }

  setDirection(dirId) {
    this.dirId = dirId;
    this.dir = this.route.direction(dirId);
    this.driveLine = buildDriveLine(this.route, dirId);
    this.stops = new StopManager(this.dir);
    this.announcer = this.announcer ? (this.announcer.setDirection(this.dir), this.announcer) : new AnnouncementManager(this.dir);
    this.announcer.startTrip();
    this.stops.on((e) => {
      this.announcer.onStopEvent(e);
      this.events.push(e);
      if (e.type === 'terminal') this.display.onTerminal();
    });
    if (!this.display) this.display = new DestinationDisplay(this.route, dirId);
    else this.display.setDirection(dirId);
    this.updateSigns();
    this.sHint = null;
    this.frontS = 0;
    this.signalsAhead = this.findSignals();
  }

  /** Signalised junctions along the drive line with their stop-line positions. */
  findSignals() {
    const out = [];
    const L = this.driveLine;
    for (const n of this.world.roads.nodes.values()) {
      if (!n.signal || !n.sorted) continue;
      const near = L.nearest(n.x, n.z);
      if (near.d > 12) continue;
      const t = L.tangent(Math.max(0, near.s - 14), 6);
      let best = null, bd = -2;
      for (const e of n.sorted) {
        const dot = -(e.d[0] * t.tx + e.d[1] * t.tz);
        if (dot > bd) { bd = dot; best = e; }
      }
      if (!best || bd < 0.5) continue;
      out.push({ s: near.s - (best.trim || 6) - 1.5, node: n, end: best });
    }
    return out.sort((a, b) => a.s - b.s);
  }

  updateSigns() {
    const t = this.display.frontText;
    this.model.setDestination(t.number, t.text);
  }

  /** Place the bus on its drive line with the front at arc length s. */
  placeAt(s) {
    const L = this.driveLine;
    const frontToAxle2 = BUS.frontOverhang + BUS.wb1;
    const a = L.at(Math.max(0, s - frontToAxle2));
    const b = L.at(Math.max(0, s - frontToAxle2) + 3);
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    this.phys.reset(a.x, a.z, yaw);
    // settle the trailer along the path
    const c = L.at(Math.max(0, s - frontToAxle2 - HITCH_FRONT_Z - 5.07));
    const [hx, hz] = this.phys.hitch();
    const dx = hx - c.x, dz = hz - c.z, dl = Math.hypot(dx, dz) || 1;
    this.phys.rx = hx - (dx / dl) * this.phys.L2;
    this.phys.rz = hz - (dz / dl) * this.phys.L2;
    this.phys.yawR = Math.atan2(-dx, -dz);
    this.sHint = null;
    this.routeHint = null;
    this.prev = null;
    // a teleport is not a missed stop: resume the stop sequence from here
    const win = this.stops.opts.arriveWindow;
    let idx = this.dir.stops.findIndex((st) => st.frontS > s - win);
    if (idx < 0) idx = this.dir.stops.length - 1;
    if (idx !== this.stops.next || this.stops.log.length) {
      this.stops.reset(idx);
      this.announcer.startTrip();
      for (let i = 0; i <= idx; i++) this.announcer.nextAnnounced.add(i);
    }
    this.syncVisual(1);
  }

  collideStatic(b) {
    const grid = this.world.bgrid;
    if (!grid) return null;
    let best = null;
    for (const box of b.boxes()) {
      const c = grid.boxContact(box.cx, box.cz, box.fx, box.fz, box.hl, box.hw);
      if (c && (!best || c.depth > best.depth)) best = c;
    }
    if (this.extraColliders) {
      for (const fn of this.extraColliders) {
        const c = fn(b);
        if (c && (!best || c.depth > best.depth)) best = c;
      }
    }
    return best;
  }

  /** Advance simulation by real time dt using fixed sub-steps. */
  update(dt, controls) {
    this.acc += Math.min(dt, 0.1);
    const p = this.phys;
    while (this.acc >= FIXED) {
      this.prev = {
        x: p.x, z: p.z, yaw: p.yaw, rx: p.rx, rz: p.rz, yawR: p.yawR, roll: [...p.roll], pitch: [...p.pitch],
      };
      // slope along the heading from the terrain
      const fx = fwdX(p.yaw), fz = fwdZ(p.yaw);
      const h0 = this.world.hf.heightAt(p.x, p.z), h1 = this.world.hf.heightAt(p.x + fx * 4, p.z + fz * 4);
      p.slope = (h1 - h0) / 4;
      p.step(FIXED, { ...controls, interlock: this.doors.interlockActive });
      this.doors.update(FIXED);
      this.acc -= FIXED;
    }
    // route progress (front bumper projected on the drive line)
    const [fx, fz] = p.frontPoint();
    const n = this.driveLine.nearest(fx, fz, this.sHint, this.sHint == null ? 0 : 90);
    if (this.sHint == null || n.d < 25) this.sHint = n.s;
    else {
      const g = this.driveLine.nearest(fx, fz);
      if (g.d < 25) this.sHint = g.s;
    }
    this.frontS = this.sHint;
    this.offRoute = n.d;
    this.lateral = n.d * n.side;
    // stop logic uses the route centre line arc length (stops are defined there)
    const c = this.dir.path.nearest(fx, fz, this.routeHint ?? null, this.routeHint == null ? 0 : 90);
    this.routeHint = c.s;
    this.routeS = c.s;
    this.stops.update({ frontS: c.s, speed: p.v, doorsOpen: this.doors.anyOpen, dt });
    this.announcer.update({
      nextIndex: this.stops.next,
      distanceToNext: this.stops.distanceToNext(c.s),
      speed: Math.abs(p.v),
      doorsOpen: this.doors.anyOpen,
    });
    // indicators
    this.blink = (this.blink + dt) % 0.8;
    const on = this.blink < 0.42;
    const left = (this.lights.left || this.lights.hazard) && on;
    const right = (this.lights.right || this.lights.hazard) && on;
    this.indicatorOn = (this.lights.left || this.lights.right || this.lights.hazard) ? on : false;
    this.model.setLights({
      head: this.lights.head, brake: controls.brake > 0.08 || p.stopBrake, reverse: p.selector === 'R', left, right,
      interior: this.lights.interior,
    });
    // wipers
    if (this.wiper.mode > 0) {
      this.wiper.phase += dt * (this.wiper.mode === 1 ? 0.9 : 1.5);
      const t = this.wiper.phase % 1;
      this.model.setWiper(Math.sin(Math.min(1, t * 1.6) * Math.PI) * 1.45);
    } else this.model.setWiper(0);
    this.model.setStopRequested(this.stopRequested);
  }

  /** Set model transforms (interpolated between physics steps). */
  syncVisual(alpha = this.acc / FIXED) {
    const p = this.phys;
    const q = this.prev || p;
    const lerp = (a, b) => a + (b - a) * alpha;
    const lerpA = (a, b) => {
      let d = b - a;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return a + d * alpha;
    };
    const x = lerp(q.x, p.x), z = lerp(q.z, p.z), yaw = lerpA(q.yaw, p.yaw);
    const rx = lerp(q.rx, p.rx), rz = lerp(q.rz, p.rz), yawR = lerpA(q.yawR, p.yawR);
    const hf = this.world.hf;
    const fx = fwdX(yaw), fz = fwdZ(yaw);
    const rgx = -fz, rgz = fx;
    const h2 = hf.heightAt(x, z);
    const h1 = hf.heightAt(x + fx * BUS.wb1, z + fz * BUS.wb1);
    const hl = hf.heightAt(x - rgx, z - rgz), hr = hf.heightAt(x + rgx, z + rgz);
    const pitchF = Math.atan2(h1 - h2, BUS.wb1);
    const rollF = Math.atan2(hr - hl, 2);
    const kneel = p.kneel * 0.028;
    const m = this.model;
    m.front.position.set(x, h2 - p.kneel * 0.04, z);
    m.front.rotation.set(pitchF + lerp(q.pitch[0], p.pitch[0]), yaw, rollF + lerp(q.roll[0], p.roll[0]) - kneel, 'YXZ');
    const rfx = fwdX(yawR), rfz = fwdZ(yawR);
    const h3 = hf.heightAt(rx, rz);
    const hh = hf.heightAt(rx + rfx * 5.07, rz + rfz * 5.07);
    const pitchR = Math.atan2(hh - h3, 5.07);
    m.rear.position.set(rx, h3, rz);
    m.rear.rotation.set(pitchR + lerp(q.pitch[1], p.pitch[1]), yawR, rollF * 0.5 + lerp(q.roll[1], p.roll[1]), 'YXZ');
    m.setSteer(p.delta);
    m.spin(p.distF, p.distR);
    for (const d of this.doors.doors) m.setDoor(d.id, d.openness);
    m.afterPose();
  }

  get speed() {
    return this.phys.v;
  }

  dispose() {
    this.scene.remove(this.model.root);
  }

  /** World position of a point given in a section's local frame. */
  localToWorld(section, v, out = new THREE.Vector3()) {
    const g = section === 'rear' ? this.model.rear : this.model.front;
    return out.copy(v).applyMatrix4(g.matrixWorld);
  }
}

export { clamp };
