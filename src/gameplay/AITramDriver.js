// Autonomous driver of a tram (passenger mode, other trams on the line). No steering: speed planning only,
// from the line speed, the road's limit on street track, curves and points ahead (braking curves), stops,
// signals, cars fouling the track and the tram ahead; the same stop procedure as the bus driver (open the
// doors, wait for boarding, closing warning, depart). Output: a continuous demand for TramPhysics.analog.
import { clamp } from '../core/math.js';

const BRAKE = 0.9; // planned service deceleration (m/s²)

export class AITramDriver {
  constructor(bus, { traffic = null, signals = null, peds = null, others = null, serveAll = false } = {}) {
    this.bus = bus;
    this.traffic = traffic;
    this.signals = signals;
    this.peds = peds;
    this.others = others;
    this.serveAll = serveAll;
    this.state = 'drive';
    this.timer = 0;
    this.vi = 0;
    const p = bus.phys;
    p.parkingBrake = false;
    p.selector = 'D';
    p.engineOn = true;
    p.pantoUp = true;
    p.pantoH = 1;
  }

  shouldServe(stop) {
    if (!stop) return false;
    if (this.serveAll || stop.isFirst || stop.isLast) return true;
    const waiting = this.peds ? this.peds.waitingAt(stop) : 1;
    const riders = (this.bus.riders || []).some((r) => r.dest === stop.index);
    return waiting > 0 || riders || this.bus.stopRequested || this.bus.forceServe === stop.index;
  }

  update(dt) {
    const bus = this.bus, p = bus.phys, L = bus.line;
    const s = p.s;
    const ctl = { throttle: 0, brake: 0 };
    // ---- speed planning: limits ahead reached with a constant service deceleration
    let vDes = bus.limit ? bus.limit.v : 12;
    for (let d = 6; d <= 90; d += 6) {
      const lim = bus.speedLimit(s + d).v;
      vDes = Math.min(vDes, Math.sqrt(lim * lim + 2 * BRAKE * Math.max(0, d - 4)));
    }
    vDes *= 0.94; // a little below the limit
    let gap = Infinity;
    this.why = null;
    const next = bus.stops.nextStop;
    const pending = next && !bus.stops.served.has(next.index) && this.shouldServe(next);
    if (pending && this.state === 'drive') {
      // aim half a metre short of the stop mark; a small overshoot still counts (StopManager arrive window)
      const d = next.frontS - s;
      if (d > -6) { gap = Math.min(gap, Math.max(0, d - 0.5)); this.why = 'stop'; }
    }
    if (this.signals && bus.signalsAhead) {
      for (const sg of bus.signalsAhead) {
        const d = sg.s - s;
        if (d < -2 || d > 80) continue;
        const st = this.signals.state(sg.node, sg.end);
        if (st !== 'G' && !(st === 'Y' && d < Math.abs(p.v) * 1.2) && d - 1.5 < gap) { gap = d - 1.5; this.why = `signal ${st}`; }
        break;
      }
    }
    // cars on the track ahead (the tram cannot go round them)
    if (this.traffic) {
      const hw = bus.spec.dims.halfW + 0.25;
      for (const c of this.traffic.cars) {
        if (Math.abs(c.x - p.x) > 70 || Math.abs(c.z - p.z) > 70) continue;
        const n = L.nearest(c.x, c.z, s + 25, 40);
        const ahead = n.s - s;
        if (ahead < -1 || ahead > 60) continue;
        // lateral clearance of the car's box to the track centre line
        const t = L.tangent(n.s, 2);
        const ox = c.x - L.at(n.s).x, oz = c.z - L.at(n.s).z;
        const lat = Math.abs(-ox * t.tz + oz * t.tx);
        const across = Math.abs(c.dx * -t.tz + c.dz * t.tx) * (c.len / 2) + Math.abs(c.dx * t.tx + c.dz * t.tz) * (c.wid / 2);
        if (lat - across < hw && ahead - c.len / 2 - 2 < gap) { gap = ahead - c.len / 2 - 2; this.why = `car v=${(c.v ?? 0).toFixed(1)}`; }
      }
    }
    // the tram ahead on the same track
    if (this.others) {
      for (const o of this.others()) {
        if (o === bus || !o.isTram || o.dirId !== bus.dirId) continue;
        const tail = o.phys.s - o.spec.dims.length;
        const d = tail - s;
        if (d > 0 && d < 120 && d - 8 < gap) { gap = d - 8; this.why = 'tram ahead'; }
      }
    }
    if (gap < Infinity) vDes = Math.min(vDes, Math.sqrt(Math.max(0, 2 * BRAKE * Math.max(0, gap))));
    // ---- stop procedure (as the bus driver)
    const atStop = bus.stops.atStop >= 0;
    if (this.state === 'drive' && bus.doors.anyOpen && Math.abs(p.v) < 0.2) { this.state = 'dwell'; this.timer = 0; }
    if (this.state === 'drive' && atStop && Math.abs(p.v) < 0.2 && pending) {
      this.state = 'opening';
      bus.doors.open(null, p.v);
      this.timer = 0;
    }
    if (this.state === 'opening') {
      this.timer += dt;
      vDes = 0;
      if (bus.doors.doors.some((d) => d.state !== 'open' && d.state !== 'opening')) bus.doors.open(null, p.v);
      if (bus.doors.doors.every((d) => d.state === 'open') || this.timer > 6) { this.state = 'dwell'; this.timer = 0; }
    } else if (this.state === 'dwell') {
      this.timer += dt;
      vDes = 0;
      if (bus.holdFor > 0) { bus.holdFor = Math.max(0, bus.holdFor - dt); this.timer = 0; }
      const busy = (bus.boarding || 0) > 0;
      this.quiet = busy ? 0 : (this.quiet || 0) + dt;
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
      if (this.timer > 1.0 || !atStop) this.state = 'drive';
      vDes = this.timer > 0.8 ? vDes : 0;
      // a ring of the bell before moving off
      if (this.timer > 0.2 && !this.rang) { this.rang = true; bus.bellRing = (bus.bellRing || 0) + 1; }
    }
    if (this.state !== 'depart') this.rang = false;
    // ---- longitudinal PI control -> demand
    const err = vDes - p.v;
    this.vi = clamp(this.vi + err * dt * 0.25, -0.3, 0.35);
    let u = err * (err < 0 ? 0.7 : 0.4) + this.vi;
    // the last metres: brake firmly to a stand (and hold it)
    if (vDes < 0.3 && p.v < 2.5) { u = -1; this.vi = 0; }
    if (u > 0) ctl.throttle = clamp(u, 0, 0.85);
    else ctl.brake = clamp(-u, 0, 1);
    this.vDes = vDes;
    return ctl;
  }
}
