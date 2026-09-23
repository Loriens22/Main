// Automatic driving: follows the route, keeps to speed limits and curve speeds, obeys signals,
// keeps distance to traffic and stops precisely at every stop. The driver still works the doors
// and the informator; once the doors are closed and the next stop is announced it drives on.
import { clamp, wrapAngle } from '../util.js';

const VMAX = 13.3;       // m/s cruise (≈48 km/h, under the 50 km/h limit)
const A_LAT = 1.1;       // m/s² comfortable lateral acceleration in curves
const B_COMF = 1.0;      // m/s² planning deceleration
const STOP_B = 0.85;     // m/s² deceleration into a stop

export class Autopilot {
  constructor(game) {
    this.g = game;
    this.on = false;
    this.state = 'drive';
    this.t = 0;
    this.hint = '';
    this.indT = 0;
  }
  toggle() {
    this.on = !this.on;
    const g = this.g, v = g.veh;
    if (this.on) {
      this.state = g.atStop >= 0 ? 'atstop' : 'drive';
      this.t = 0;
      if (v.gear !== 'D' && Math.abs(v.v) < 0.5) g.setGear('D');
      g.ui.toast('Автоматично управление: ВКЛ', 'good');
    } else {
      this.hint = '';
      g.ui.toast('Автоматично управление: ИЗКЛ');
    }
  }
  /** Route curvature speed limit looking `ahead` metres forward from s. */
  curveLimit(s, v) {
    const r = this.g.route;
    let lim = VMAX;
    const h0 = r.pose(s).h;
    let hPrev = h0;
    for (let d = 4; d <= 90; d += 6) {
      const h = r.pose(s + d).h;
      const k = Math.abs(wrapAngle(h - hPrev)) / 6; // 1/m
      hPrev = h;
      if (k < 1e-4) continue;
      const vc = Math.sqrt(A_LAT / k);
      lim = Math.min(lim, Math.sqrt(vc * vc + 2 * B_COMF * Math.max(0, d - 6)));
    }
    void v;
    return lim;
  }
  /** Returns {throttle, brake, steer} or null when the autopilot is off. */
  update(dt) {
    if (!this.on) return null;
    const g = this.g, veh = g.veh, r = g.route;
    const sF = g.sFrontNow ?? 0;
    const stops = r.stops, k = g.nextStop, N = stops.length;
    const inf = g.informator;
    let vT = VMAX * (r.speedFactor || 1);
    this.t += dt;
    // ---------- stop handling ----------
    const doorsOpen = veh.doorsOpen();
    const stop = k < N ? stops[k] : null;
    const dStop = stop ? stop.s - sF : 1e9;
    if (this.state === 'drive') {
      if (stop && !g.served.has(k) && dStop < 0.6 && dStop > -6 && Math.abs(veh.v) < 0.3) { this.state = 'atstop'; this.t = 0; }
    }
    if (this.state === 'atstop') {
      vT = 0;
      const served = g.served.has(k) || (k === 0 && g.atStop === 0);
      if (!served && !doorsOpen) this.hint = 'АВТО: отворете вратите';
      else if (doorsOpen) this.hint = g.people.busy() ? 'АВТО: пътниците се качват…' : 'АВТО: затворете вратите';
      else if (k + 1 >= N) this.hint = 'Край на маршрута';
      else if (inf.idx <= k + 1) this.hint = 'АВТО: обявете следващата спирка (ИНФОРМ.)';
      else { this.state = 'depart'; this.t = 0; this.hint = ''; veh.indicator = -1; this.indT = 4; }
      if (g.atStop < 0 && !doorsOpen && Math.abs(dStop) > 8) this.state = 'drive'; // pushed away from the stop
    }
    if (this.state === 'depart') {
      vT = this.t > 1.2 ? VMAX : 0;
      if (veh.park) g.togglePark();
      if (veh.gear !== 'D') g.setGear('D');
      if (this.t > 1.2 && k < N && sF - stops[k].s > -2) { /* still at the stop: keep going */ }
      if (this.t > 1.2) this.state = 'drive';
    }
    if (this.state === 'drive') {
      this.hint = '';
      if (veh.park) g.togglePark();
      if (veh.gear !== 'D' && Math.abs(veh.v) < 0.5) g.setGear('D');
      vT = Math.min(vT, this.curveLimit(sF, veh.v));
      // stop ahead that still has to be served
      if (stop && !g.served.has(k) && dStop > -3) {
        const vs = dStop > 0.35 ? Math.sqrt(2 * STOP_B * (dStop - 0.35)) : 0;
        vT = Math.min(vT, dStop > 2 ? Math.max(1.0, vs) : vs);
      }
      // signals
      for (const sl of r.stopLines) {
        const d = sl.s - sF;
        if (d < -0.5 || d > 110) continue;
        if (!g.tl.mayPass(sl.inter, sl.group, d, Math.abs(veh.v))) vT = Math.min(vT, d > 1.5 ? Math.sqrt(2 * 1.6 * (d - 1.5)) : 0);
        // indicator ahead of turns
        if (sl.turn && d < 70 && d > 0) { veh.indicator = sl.turn === 'right' ? 1 : -1; this.indT = 9; }
      }
      // traffic ahead on our path
      const fx = g.frontX, fz = g.frontZ;
      for (const c of g.traffic.boxes()) {
        if (Math.abs(c.x - fx) > 70 || Math.abs(c.z - fz) > 70) continue;
        const pc = r.project(c.x, c.z);
        if (!pc || Math.abs(pc.lat) > 2.4) continue;
        const gap = pc.s - sF - c.hd;
        if (gap < -2 || gap > 60) continue;
        vT = Math.min(vT, Math.max(0, Math.sqrt(2 * 1.4 * Math.max(0, gap - 5))));
      }
      if (k >= N) vT = 0;
    }
    if (this.indT > 0) { this.indT -= dt; if (this.indT <= 0) veh.indicator = 0; }
    // ---------- speed controller ----------
    const v = veh.v;
    let throttle = 0, brake = 0;
    if (vT < 0.05 && v < 0.35) brake = 0.55;
    else if (v > vT + 0.25) brake = clamp((v - vT) * 0.32 + 0.08, 0.06, 0.95);
    else if (v < vT - 0.25) throttle = clamp((vT - v) * 0.35 + 0.15, 0.1, 1);
    // ---------- steering (road vehicles) ----------
    let steer = null;
    if (veh.steerable) steer = veh.pursuitSteer(r, sF);
    return { throttle, brake, steer, vT };
  }
}
