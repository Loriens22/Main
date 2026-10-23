// Autonomous driver for buses not controlled by the player (passenger mode,
// other buses on the line): pure-pursuit steering on the drive line, speed
// planning for curves, stops and traffic, and the full stop procedure
// (open doors, wait for boarding, two-beep close, depart).
import { clamp } from '../core/math.js';

export class AIBusDriver {
  constructor(bus, { traffic = null, signals = null, peds = null, serveAll = false } = {}) {
    this.bus = bus;
    this.traffic = traffic;
    this.signals = signals;
    this.peds = peds;
    this.serveAll = serveAll;
    this.state = 'drive';
    this.timer = 0;
    this.vi = 0;
    bus.phys.parkingBrake = false;
    bus.phys.selector = 'D';
    bus.phys.engineOn = true;
  }

  shouldServe(stop) {
    if (!stop) return false;
    if (this.serveAll || stop.isFirst || stop.isLast) return true;
    const waiting = this.peds ? this.peds.waitingAt(stop) : 1;
    const riders = (this.bus.riders || []).some((r) => r.dest === stop.index);
    return waiting > 0 || riders || this.bus.stopRequested || this.bus.forceServe === stop.index;
  }

  update(dt) {
    const bus = this.bus, p = bus.phys;
    const line = bus.driveLine;
    if (line !== this.line) { this.line = line; this.sHint = null; } // new trip direction
    const ctl = { throttle: 0, brake: 0, steer: 0 };
    const D = p.dims; // this bus's dimensions (vehicle spec)
    // ---- steering: pure pursuit for the front axle
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const ax = p.x + fx * D.wb1, az = p.z + fz * D.wb1;
    const n = line.nearest(ax, az, this.sHint ?? null, this.sHint == null ? 0 : 60);
    this.sHint = n.s;
    const Ld = clamp(5 + Math.abs(p.v) * 0.9, 6, 20);
    const tp = line.at(n.s + Ld);
    // squeeze towards the kerb for oncoming traffic on narrow streets (up to 0.9 m)
    const sq = (this.squeeze || 0) * 0.9;
    if (sq > 0) {
      const tt = line.tangent(n.s + Ld, 2);
      tp.x += -tt.tz * sq; tp.z += tt.tx * sq;
    }
    const dx = tp.x - ax, dz = tp.z - az;
    const alpha = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz); // + = target to the right
    const delta = Math.atan((2 * D.wb1 * Math.sin(-alpha)) / Math.max(4, Math.hypot(dx, dz)));
    ctl.steer = clamp(delta / D.maxSteer, -1, 1);
    // ---- speed planning
    const q = bus.world.roads.query(p.x, p.z, 12);
    let vDes = Math.min(((q && q.piece.speed) || 50) / 3.6, 13.5);
    // curvature ahead
    for (let d = 5; d <= 45; d += 10) {
      const k = Math.abs(line.curvature(n.s + d, 6));
      if (k > 1e-3) vDes = Math.min(vDes, Math.sqrt(1.4 / k) + d * 0.08);
    }
    // stop ahead
    const next = bus.stops.nextStop;
    let gap = Infinity;
    this.why = null; // what limits the speed (for debugging / tests)
    const pending = next && !bus.stops.served.has(next.index) && this.shouldServe(next);
    if (pending && this.state === 'drive') {
      const d = next.frontS - bus.routeS;
      if (d > -3) { gap = Math.min(gap, d + 0.3); this.why = 'stop'; }
    }
    // traffic signals along the drive line
    if (this.signals && bus.signalsAhead) {
      for (const sg of bus.signalsAhead) {
        const d = sg.s - bus.frontS;
        if (d < -2 || d > 70) continue;
        const st = this.signals.state(sg.node, sg.end);
        if (st !== 'G' && !(st === 'Y' && d < Math.abs(p.v) * 1.2) && d - 1.5 < gap) { gap = d - 1.5; this.why = `signal ${st}`; }
        break;
      }
    }
    // cars in the way: test the car's box against the bus's own path ahead
    // (follows the curve through turns and catches cars at the front corners)
    if (this.traffic) {
      const sF = n.s + D.frontOverhang; // front bumper on the drive line
      const probe = [];
      for (let d = -1; d <= 40; d += 1.5) {
        const q = line.at(sF + d), t = line.tangent(sF + d, 2);
        probe.push([d, q.x - t.tz * sq, q.z + t.tx * sq, t.tx, t.tz]);
      }
      let oncoming = false;
      for (const c of this.traffic.cars) {
        if (Math.abs(c.x - p.x) > 55 || Math.abs(c.z - p.z) > 55) continue;
        for (const [d, qx, qz, tx, tz] of probe) {
          if (d - 2 >= gap) break;
          // oncoming traffic keeps to its own lane: only a real overlap counts;
          // a car ahead in the same direction gets a safety buffer
          const dir = c.dx * tx + c.dz * tz;
          const clear = D.halfW + (dir < -0.5 ? 0.05 : dir > 0.5 ? 0.35 : 0.2);
          const ox = qx - c.x, oz = qz - c.z;
          const lx = Math.abs(ox * c.dx + oz * c.dz) - c.len / 2, lz = Math.abs(-ox * c.dz + oz * c.dx) - c.wid / 2;
          if (Math.hypot(Math.max(0, lx), Math.max(0, lz)) < clear) {
            gap = d - 2;
            this.why = `car v=${(c.v ?? 0).toFixed(1)}`;
            if (dir < -0.5) oncoming = true;
            break;
          }
        }
      }
      this.squeeze = clamp((this.squeeze || 0) + (oncoming ? dt * 0.6 : -dt * 0.15), 0, 1);
    }
    if (gap < Infinity) vDes = Math.min(vDes, Math.sqrt(Math.max(0, 2 * 1.1 * Math.max(0, gap))));
    // ---- stop procedure
    const atStop = bus.stops.atStop >= 0;
    // doors left open (e.g. at the terminal where the trip starts): dwell, then close them
    if (this.state === 'drive' && bus.doors.anyOpen && Math.abs(p.v) < 0.2) {
      this.state = 'dwell';
      this.timer = 0;
    }
    if (this.state === 'drive' && atStop && Math.abs(p.v) < 0.2 && pending) {
      this.state = 'opening';
      bus.doors.open(null, p.v);
      this.timer = 0;
    }
    if (this.state === 'opening') {
      this.timer += dt;
      vDes = 0;
      // a close request may have overtaken the opening: command them open again
      if (bus.doors.doors.some((d) => d.state !== 'open' && d.state !== 'opening')) bus.doors.open(null, p.v);
      if (bus.doors.doors.every((d) => d.state === 'open') || this.timer > 6) { this.state = 'dwell'; this.timer = 0; }
    } else if (this.state === 'dwell') {
      this.timer += dt;
      vDes = 0;
      // timetable hold (a bus waiting at the terminal for its departure time)
      if (bus.holdFor > 0) { bus.holdFor = Math.max(0, bus.holdFor - dt); this.timer = 0; }
      const busy = (bus.boarding || 0) > 0;
      if (busy) this.quiet = 0; else this.quiet = (this.quiet || 0) + dt;
      const minDwell = next && next.isLast ? 8 : 5;
      if (this.timer > minDwell && this.quiet > 1.8 && !bus.holdDoors) {
        bus.doors.close();
        this.state = 'closing';
      }
    } else if (this.state === 'closing') {
      vDes = 0;
      if (bus.doors.allClosed) { this.state = 'depart'; this.timer = 0; }
      else if (bus.doors.doors.some((d) => d.state === 'open' && !d.closeRequested)) bus.doors.close();
    } else if (this.state === 'depart') {
      this.timer += dt;
      if (this.timer > 0.8 || !atStop) this.state = 'drive';
      vDes = this.timer > 0.6 ? vDes : 0;
    }
    // indicators when pulling in/out
    bus.lights.right = !!(this.state === 'drive' && pending && next.frontS - bus.routeS < 60 && next.frontS - bus.routeS > 2);
    bus.lights.left = this.state === 'depart';
    // ---- recovery: wedged against something static (a kerb post or a building corner after a knock
    // or a swerve) the bus cannot drive forwards: back up a few metres steering towards the line
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      p.selector = 'R';
      const done = this.reverseT <= 0 || Math.abs(p.distF - this.revFrom) > 4;
      if (!done) {
        this.why = 'recover';
        return { throttle: Math.abs(p.v) < 1.2 ? 0.35 : 0, brake: Math.abs(p.v) < 1.2 ? 0 : 0.3, steer: -ctl.steer };
      }
      this.reverseT = 0;
      p.selector = 'D';
      this.vi = 0;
    }
    const trying = this.state === 'drive' && vDes > 2 && Math.abs(p.v) < 0.4 && !(this.why && this.why.startsWith('car'));
    this.stuckT = trying ? (this.stuckT || 0) + dt : 0;
    if (this.stuckT > 4) {
      this.stuckT = 0;
      this.reverseT = 4;
      this.revFrom = p.distF;
    }
    // ---- longitudinal PI control
    const err = vDes - p.v;
    this.vi = clamp(this.vi + err * dt * 0.3, -0.3, 0.4);
    let u = err * 0.45 + this.vi;
    if (vDes < 0.05 && p.v < 0.3) { u = -1; this.vi = 0; }
    if (u > 0) ctl.throttle = clamp(u, 0, 0.75);
    else ctl.brake = clamp(-u * 0.9, 0, 1);
    return ctl;
  }
}
