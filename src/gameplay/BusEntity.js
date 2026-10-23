// A bus in the world: physics + 3D model + doors + route state + signs.
import * as THREE from 'three';
import { ArticulatedBus } from '../vehicle/ArticulatedBus.js';
import { DoorSystem, doorTiming } from '../vehicle/DoorController.js';
import { vehicleSpec } from '../vehicle/Vehicles.js';
import { StopManager } from './StopManager.js';
import { AnnouncementManager } from './AnnouncementManager.js';
import { DestinationDisplay } from './DestinationDisplay.js';
import { buildDriveLine } from './DriveLine.js';
import { fwdX, fwdZ, clamp } from '../core/math.js';

const FIXED = 1 / 120;

export class BusEntity {
  constructor({ scene, world, route, dirId = 'A', vehicle = 'man', fleet = null, quality = 'high', player = false, serviceNo = 0 }) {
    this.scene = scene;
    this.world = world;
    this.route = route;
    this.player = player;
    this.serviceNo = serviceNo;
    // everything vehicle-specific comes from the spec: model, dimensions, doors, physics, sound
    this.spec = vehicleSpec(vehicle);
    this.vehicle = this.spec.id;
    this.fleet = fleet || this.spec.fleets[0].fleet;
    this.model = this.spec.create({ fleet: this.fleet, quality, interior: true });
    scene.add(this.model.root);
    this.phys = new ArticulatedBus({
      spec: this.spec,
      heightAt: (x, z) => world.hf.heightAt(x, z),
      collide: (b) => this.collideStatic(b),
    });
    this.doors = new DoorSystem(this.spec.doors.map((d) => d.id), doorTiming(this.spec.doorWarning));
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
    this.routeHint = null; // the new direction's path has its own arc lengths
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
    const frontToAxle2 = this.spec.dims.frontOverhang + this.spec.dims.wb1;
    // route distance -> drive-line distance (the lane offset changes arc lengths in bends)
    const rp = this.dir.path.at(Math.min(s, this.dir.path.length));
    const ds = Math.min(L.nearest(rp.x, rp.z, Math.min(s, L.length), 400).s, L.length);
    // the route starts at the first stop: behind it, follow the terminal link
    // that leads into this direction (the turning loop / approach street)
    const p0 = L.at(0), t0 = L.tangent(0, 4);
    let lead = [[p0.x, p0.z], ...[...(this.route.terminalLinks[this.dirId === 'A' ? 'BtoA' : 'AtoB'] || [])].reverse()];
    let leadLen = 0;
    for (let i = 1; i < lead.length; i++) leadLen += Math.hypot(lead[i][0] - lead[i - 1][0], lead[i][1] - lead[i - 1][1]);
    if (leadLen < 12) lead = [[p0.x, p0.z], [p0.x - t0.tx * 10, p0.z - t0.tz * 10]]; // no real lead-in: straight back
    const at = (sv) => {
      if (sv >= 0) return L.at(sv);
      let rest = -sv;
      for (let i = 1; i < lead.length; i++) {
        const [ax, az] = lead[i - 1], [bx, bz] = lead[i];
        const seg = Math.hypot(bx - ax, bz - az);
        if (seg < 1e-6) continue;
        // beyond the last point keep going in the last segment's direction
        if (seg >= rest || i === lead.length - 1) return { x: ax + ((bx - ax) * rest) / seg, z: az + ((bz - az) * rest) / seg };
        rest -= seg;
      }
      return { x: p0.x + t0.tx * sv, z: p0.z + t0.tz * sv };
    };
    const a = at(ds - frontToAxle2);
    const b = at(ds - frontToAxle2 + 3);
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    this.phys.reset(a.x, a.z, yaw);
    // settle the trailer along the path
    if (this.phys.articulated) {
      const c = at(ds - frontToAxle2 - this.phys.c - this.phys.L2);
      const [hx, hz] = this.phys.hitch();
      const dx = hx - c.x, dz = hz - c.z, dl = Math.hypot(dx, dz) || 1;
      this.phys.rx = hx - (dx / dl) * this.phys.L2;
      this.phys.rz = hz - (dz / dl) * this.phys.L2;
      this.phys.yawR = Math.atan2(-dx, -dz);
    }
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
    // still on the turning loop before the start of this direction: negative distance
    let rs = c.s, off = c.d;
    if (c.s < 0.5 && c.d > 5) {
      const p0 = this.dir.path.at(0);
      rs = c.s - Math.hypot(fx - p0.x, fz - p0.z);
      off = 0;
    }
    this.routeS = rs;
    this.stops.update({ frontS: rs, speed: p.v, doorsOpen: this.doors.anyOpen, dt, offRoute: off });
    this.announcer.update({
      nextIndex: this.stops.next,
      distanceToNext: this.stops.distanceToNext(rs),
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
    const wb1 = this.spec.dims.wb1;
    const h2 = hf.heightAt(x, z);
    const h1 = hf.heightAt(x + fx * wb1, z + fz * wb1);
    const hl = hf.heightAt(x - rgx, z - rgz), hr = hf.heightAt(x + rgx, z + rgz);
    const pitchF = Math.atan2(h1 - h2, wb1);
    const rollF = Math.atan2(hr - hl, 2);
    const kneel = p.kneel * 0.028;
    const m = this.model;
    m.front.position.set(x, h2 - p.kneel * 0.04, z);
    m.front.rotation.set(pitchF + lerp(q.pitch[0], p.pitch[0]), yaw, rollF + lerp(q.roll[0], p.roll[0]) - kneel, 'YXZ');
    if (p.articulated) {
      const rfx = fwdX(yawR), rfz = fwdZ(yawR), L2 = p.L2;
      const h3 = hf.heightAt(rx, rz);
      const hh = hf.heightAt(rx + rfx * L2, rz + rfz * L2);
      const pitchR = Math.atan2(hh - h3, L2);
      m.rear.position.set(rx, h3, rz);
      m.rear.rotation.set(pitchR + lerp(q.pitch[1], p.pitch[1]), yawR, rollF * 0.5 + lerp(q.roll[1], p.roll[1]), 'YXZ');
    } else {
      // rigid bus: the (empty) rear group rides with the body so section-relative code keeps working
      m.rear.position.copy(m.front.position);
      m.rear.rotation.copy(m.front.rotation);
    }
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
    this.model.dispose();
  }

  /** World position of a point given in a section's local frame. */
  localToWorld(section, v, out = new THREE.Vector3()) {
    const g = section === 'rear' ? this.model.rear : this.model.front;
    return out.copy(v).applyMatrix4(g.matrixWorld);
  }
}

export { clamp };
