// A tram in the world: rail dynamics + 3D model + doors + route state + signs. It has the interface of a
// BusEntity (the game, camera, sounds, passengers and pedestrians talk to both alike), but no steering: one
// degree of freedom, the arc length s of its front end along the track of its direction, from which every
// body section and bogie is placed (TramDynamics.js).
import * as THREE from 'three';
import { DoorSystem, doorTiming } from '../vehicle/DoorController.js';
import { vehicleSpec } from '../vehicle/Vehicles.js';
import { TrackLine, placeSections, bogiePoses, TramPhysics } from '../vehicle/trams/TramDynamics.js';
import { StopManager } from './StopManager.js';
import { AnnouncementManager } from './AnnouncementManager.js';
import { DestinationDisplay } from './DestinationDisplay.js';

const FIXED = 1 / 120;
const SWITCH_LIMIT = 30 / 3.6; // over points and crossings (the diverging track is limited by its curve)
const CURVE_ACC = 1.0; // m/s² lateral at the curve limit (comfort); derailment protection trips well above it

/** Track line of a direction, built once per route (it is the same for every tram). */
function trackLine(route, dirId, hf, railAt = null) {
  const c = route._trackLines || (route._trackLines = {});
  return c[dirId] || (c[dirId] = new TrackLine(route, dirId, hf, railAt));
}

/** Switches on a direction's track: arc lengths where the tram runs over points. */
function switchesOn(route, line) {
  const out = [];
  for (const sw of route.switches || []) {
    const [x, z] = sw;
    const n = line.nearest(x, z);
    if (n.d < 1.5 && n.s > -150 && n.s < line.end) out.push(n.s);
  }
  return out.sort((a, b) => a - b);
}

export class TramEntity {
  constructor({ scene, world, route, dirId = 'A', vehicle = 'schindler', fleet = null, quality = 'high', player = false, serviceNo = 0 }) {
    this.isTram = true;
    this.scene = scene;
    this.world = world;
    this.route = route;
    this.player = player;
    this.serviceNo = serviceNo;
    this.spec = vehicleSpec(vehicle);
    this.vehicle = this.spec.id;
    this.fleet = fleet || this.spec.fleets[0].fleet;
    this.model = this.spec.create({ fleet: this.fleet, quality, interior: true });
    scene.add(this.model.root);
    this.phys = new TramPhysics(this.spec);
    this.doors = new DoorSystem(this.spec.doors.map((d) => d.id), doorTiming(this.spec.doorWarning));
    this.lights = { head: false, left: false, right: false, hazard: false, interior: 1 };
    this.wiper = { mode: 0, phase: 0 };
    this.bell = false;
    this.blink = 0;
    this.acc = 0;
    this.prevS = null;
    this.stopRequested = false;
    this.events = [];
    this.limit = { v: 60 / 3.6, why: 'line' };
    this.setDirection(dirId);
  }

  setDirection(dirId) {
    this.dirId = dirId;
    this.dir = this.route.direction(dirId);
    const was = this.line ? [this.phys.x, this.phys.z] : null;
    this.line = trackLine(this.route, dirId, this.world.hf, this.world.tramRailAt || null);
    // a new trip: the tram stays where it is (at the terminal), now on the track line of the new direction,
    // which runs in from the end of the old one through the loop
    if (was) {
      const n = this.line.nearest(was[0], was[1]);
      this.phys.s = n.d < 3 ? n.s : 0;
    }
    this.driveLine = this.line; // same queries as a bus's drive line (nearest, at, tangent, curvature)
    this.switchS = switchesOn(this.route, this.line);
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
    this.routeHint = null;
    this.frontS = this.phys.s;
    this.signalsAhead = this.findSignals();
  }

  /** Signalised junctions along the track with their stop-line positions (as for a bus). */
  findSignals() {
    const out = [];
    const L = this.line;
    for (const n of this.world.roads.nodes.values()) {
      if (!n.signal || !n.sorted) continue;
      const near = L.nearest(n.x, n.z);
      if (near.d > 12 || near.s < -50 || near.s > L.length + 50) continue;
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

  /** Put the tram on its track with the front end at arc length s. */
  placeAt(s) {
    const p = this.phys;
    p.s = s;
    p.v = 0;
    p.a = 0;
    this.prevS = null;
    this.sHint = null;
    this.routeHint = null;
    const win = this.stops.opts.arriveWindow;
    let idx = this.dir.stops.findIndex((st) => st.frontS > s - win);
    if (idx < 0) idx = this.dir.stops.length - 1;
    if (idx !== this.stops.next || this.stops.log.length) {
      this.stops.reset(idx);
      this.announcer.startTrip();
      for (let i = 0; i <= idx; i++) this.announcer.nextAnnounced.add(i);
    }
    this.pose(s);
    this.syncVisual(1);
  }

  /** Speed limit at the front end: line speed, the road's limit on street track, curves and points ahead. */
  speedLimit(s) {
    const L = this.line;
    let v = this.spec.physics.vmax, why = 'line';
    const at = L.at(s);
    const q = this.world.roads.query(at.x, at.z, 4);
    if (q && q.piece.speed && L.streetAt(s)) {
      const r = q.piece.speed / 3.6;
      if (r < v) { v = r; why = 'road'; }
    }
    // the whole tram has to be through a curve or over the points before it may speed up again
    const len = this.spec.dims.length;
    for (let d = -len; d <= 4; d += 4) {
      const k = Math.abs(L.curvature(s + d, 6));
      if (k > 1 / 400) {
        const c = Math.sqrt(CURVE_ACC / k);
        if (c < v) { v = c; why = 'curve'; }
      }
    }
    for (const sw of this.switchS) {
      if (sw > s + 4) break;
      if (sw > s - len - 2 && SWITCH_LIMIT < v) { v = SWITCH_LIMIT; why = 'switch'; }
    }
    return { v: Math.max(v, 10 / 3.6), why, street: L.streetAt(s) };
  }

  /** Advance the simulation by real time dt using fixed sub-steps. controls: {notch} or {throttle, brake}. */
  update(dt, controls = {}) {
    const p = this.phys, L = this.line;
    this.acc += Math.min(dt, 0.1);
    if (controls.notch != null) { p.notch = controls.notch; p.analog = null; }
    else if (controls.throttle != null || controls.brake != null) p.analog = (controls.throttle || 0) - (controls.brake || 0);
    if (controls.emergency) p.emergency = true;
    const len = this.spec.dims.length;
    // the pantograph rises in ~2.5 s and drops in ~1 s
    p.pantoH = p.pantoUp ? Math.min(1, p.pantoH + dt * 0.4) : Math.max(0, p.pantoH - dt);
    this.bellT = Math.max(0, (this.bellT || 0) - dt);
    if ((this.bellRing || 0) > (this.bellDone || 0)) { this.bellDone = this.bellRing; this.bellT = 0.6; }
    while (this.acc >= FIXED) {
      this.prevS = p.s;
      const sc = p.s - len / 2;
      p.slope = (L.y(sc + 4) - L.y(sc - 4)) / 8;
      p.wet = this.world.wet || 0;
      p.step(FIXED, { interlock: this.doors.interlockActive });
      // a car fouling the track ahead: the tram cannot swerve, it stops against it (a car that runs into the
      // side or the back of the tram is the car's business: its contact normal does not oppose the motion)
      if (this.extraColliders && Math.abs(p.v) > 0.05) {
        this.pose(p.s);
        const sg = Math.sign(p.v), fx = -Math.sin(p.yaw) * sg, fz = -Math.cos(p.yaw) * sg;
        for (const fn of this.extraColliders) {
          const c = fn(p);
          if (c && (c.nx == null || c.nx * fx + c.nz * fz < -0.6)) {
            p.lastCollision = { speed: Math.abs(p.v), depth: c.depth };
            p.s -= Math.sign(p.v) * Math.min(0.2, c.depth || 0.05);
            p.v = 0;
            break;
          }
        }
      }
      this.doors.update(FIXED);
      this.acc -= FIXED;
    }
    // the end of the track line: the tram waits at the buffer of the loop (the next trip turns it)
    if (p.s > L.end - 2) { p.s = L.end - 2; p.v = Math.min(p.v, 0); }
    if (p.s < -100) { p.s = -100; p.v = Math.max(p.v, 0); }
    this.pose(p.s);
    // lateral acceleration in the middle of the tram, curve and derailment margins
    const sc = p.s - len / 2;
    const k = L.curvature(sc, 6);
    p.aLat = p.v * p.v * k;
    p.aLong = p.a;
    this.limit = this.speedLimit(p.s);
    this.overspeed = Math.abs(p.v) - this.limit.v;
    this.frontS = p.s;
    this.sHint = p.s;
    this.offRoute = 0;
    this.lateral = 0;
    this.routeS = p.s;
    this.stops.update({ frontS: p.s, speed: p.v, doorsOpen: this.doors.anyOpen, dt, offRoute: 0 });
    this.announcer.update({
      nextIndex: this.stops.next,
      distanceToNext: this.stops.distanceToNext(p.s),
      speed: Math.abs(p.v),
      doorsOpen: this.doors.anyOpen,
    });
    // hazard / indicator lamps (trams have them too)
    this.blink = (this.blink + dt) % 0.8;
    const on = this.blink < 0.42;
    this.indicatorOn = (this.lights.left || this.lights.right || this.lights.hazard) ? on : false;
    this.model.setLights({
      head: this.lights.head, brake: p.force < -0.05 || p.emergency || (p.parkingBrake && p.engineOn), reverse: p.selector === 'R',
      left: (this.lights.left || this.lights.hazard) && on, right: (this.lights.right || this.lights.hazard) && on,
      interior: this.lights.interior,
    });
    if (this.wiper.mode > 0) {
      this.wiper.phase += dt * (this.wiper.mode === 1 ? 0.9 : 1.5);
      const t = this.wiper.phase % 1;
      this.model.setWiper(Math.sin(Math.min(1, t * 1.6) * Math.PI) * 1.45);
    } else this.model.setWiper(0);
    this.model.setStopRequested(this.stopRequested);
    if (this.model.setPantograph) this.model.setPantograph(p.pantoH, this.wireHeight(p.s));
  }

  /**
   * Cars have to clear tram tracks: a car that has stood on the track just ahead of the stopped tram for 12 s
   * drives off (the traffic manager removes it), so a car waiting for the tram and the tram waiting for the car
   * never lock each other.
   */
  clearTrack(traffic, dt) {
    const p = this.phys;
    if (!traffic || Math.abs(p.v) > 0.3) { this.blockT = 0; return; }
    let blocker = null;
    for (const c of traffic.cars) {
      if (Math.abs(c.x - p.x) > 30 || Math.abs(c.z - p.z) > 30 || (c.v ?? 0) > 0.2) continue;
      const n = this.line.nearest(c.x, c.z, p.s + 10, 25);
      if (n.d < 2.4 && n.s > p.s - 1 && n.s < p.s + 20) { blocker = c; break; }
    }
    this.blockT = blocker ? (this.blockT || 0) + dt : 0;
    if (blocker && this.blockT > 12) {
      blocker.stuck = 100;
      this.blockT = 0;
    }
  }

  /** Contact wire height above the rail head at the pantograph (constant on line 12). */
  wireHeight() {
    return 5.6;
  }

  /** Section poses for the front end at s (world), copied into phys (x, z, yaw, rx, rz, yawR). */
  pose(s) {
    const p = this.phys;
    placeSections(this.spec, this.line, s, p.poses);
    const secs = this.spec.sections;
    const f = p.poses[secs[0].id], r = p.poses[secs[secs.length - 1].id];
    p.x = f.x; p.z = f.z; p.yaw = f.yaw;
    p.rx = r.x; p.rz = r.z; p.yawR = r.yaw;
    return p.poses;
  }

  /** Set the model transforms (interpolated between physics steps). */
  syncVisual(alpha = this.acc / FIXED) {
    const p = this.phys;
    const s = this.prevS == null ? p.s : this.prevS + (p.s - this.prevS) * alpha;
    const poses = this.visPoses || (this.visPoses = {});
    placeSections(this.spec, this.line, s, poses);
    const m = this.model;
    // body roll on the secondary suspension: outwards in curves, a little rocking on street track
    const roll = Math.max(-0.035, Math.min(0.035, -p.aLat * 0.012));
    for (const sec of this.spec.sections) {
      const q = poses[sec.id], g = m[sec.id];
      if (!q || !g) continue;
      g.position.set(q.x, q.y, q.z);
      g.rotation.set(q.pitch, q.yaw, roll, 'YXZ');
    }
    m.placeBogiePoses(bogiePoses(this.spec, this.line, s, this.bogieBuf || (this.bogieBuf = [])));
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
    const g = this.model[section] || this.model.front;
    return out.copy(v).applyMatrix4(g.matrixWorld);
  }
}
