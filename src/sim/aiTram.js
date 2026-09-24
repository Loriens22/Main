// Other trams of line 7 on the opposite track (towards кв. Манастирски ливади): they obey the signals,
// stop at the opposite platforms with their doors open and loop back when out of sight.
import * as THREE from 'three';
import { buildTram, TR } from '../tram/model.js';
import { Tram } from './tram.js';
import { clamp } from '../util.js';
import { Polyline } from '../path.js';

const VMAX = 12.5, B_STOP = 0.9, DWELL = 18;

export class AITrams {
  constructor(game, fleets = ['2314', '2318']) {
    this.g = game;
    const r = game.route;
    // opposite track, then on into the balloon loop (terminus platform, layover in the loop)
    const loopLen = r.busOffset - r.stops[0].sb, tp = r.bus.pts;
    const ext = []; let acc = 0;
    for (let i = 1; i < tp.length && acc < loopLen * 0.6; i++) { acc += Math.hypot(tp[i][0] - tp[i - 1][0], tp[i][1] - tp[i - 1][1]); ext.push(tp[i]); }
    const opp = new Polyline([...r.opp.pts, ...ext]);
    // route adapter for the Tram simulation: s along the opposite track, nose first
    this.path = {
      busOffset: 0,
      get length() { return opp.length; },
      pose(s, lat = 0) { const o = opp.offsetAt(s, lat); o.rx = -Math.sin(o.h); o.rz = Math.cos(o.h); return o; },
      project(x, z, hint) { return opp.project(x, z, hint); },
    };
    // stop positions: nose at the far end of each opposite platform (low street s)
    const TRACK = 1.8;
    this.stops = r.stops.map((st) => { const p = st.st.poly.offsetAt(st.sb - 37, -TRACK, {}); return opp.project(p.x, p.z).s; }).filter((s) => s > TR.length + 5).sort((a, b) => a - b);
    // stop lines before every junction approach the opposite track passes
    this.stopLines = [];
    for (const it of r.inters) for (const arm of [it.a, it.b]) {
      const other = arm === it.a ? it.b : it.a;
      const dist = other.st.halfW + it.rc + 6;
      for (const dir of [1, -1]) {
        const sA = arm.s - dir * dist; if (sA < 0 || sA > arm.st.poly.length) continue;
        const p = arm.st.poly.at(sA), pr = opp.project(p.x, p.z);
        if (pr.d > 6) continue;
        const lp = opp.at(pr.s, {}), hd = p.h + (dir < 0 ? Math.PI : 0);
        if (Math.cos(lp.h - hd) < 0.8) continue;
        this.stopLines.push({ s: pr.s, inter: it, group: it.groups[arm.st.id] });
      }
    }
    this.stopLines.sort((a, b) => a.s - b.s);
    this.trams = fleets.map((fleet, i) => {
      const rig = buildTram({ number: '7', fleet, destShort: 'КВ. М.ЛИВАДИ', viaShort: 'ХАН КУБРАТ - М.ЛИВАДИ', destLong: 'Метростанция Хан Кубрат → кв. Манастирски ливади' });
      game.scene.add(...rig.roots);
      const t = new Tram(rig, this.path, null, () => {});
      t.gear = 'D'; t.park = false;
      for (const d of rig.doors) { d.target = 0; d.open = 0; d.anim(0); }
      const a = { t, rig, state: 'drive', dwell: 0, served: new Set(), visible: true };
      this.spawn(a, TR.length + 40 + i * (opp.length * 0.45));
      return a;
    });
    this.pts = [];
  }
  spawn(a, s) {
    a.t.placeOnRoute(s); a.t.v = 8; a.state = 'drive'; a.served = new Set(this.stops.filter((x) => x < s - 5)); a.t.gear = 'D'; a.t.park = false;
  }
  update(dt, time, cam) {
    const tl = this.g.tl, L = this.path.length;
    for (const a of this.trams) {
      const t = a.t, s = t.s, v = t.v;
      let vT = VMAX;
      // curves (small radius at the J3 corner and the loop entry)
      for (let d = 4; d <= 60; d += 8) {
        const h0 = this.path.pose(s + d - 4).h, h1 = this.path.pose(s + d + 4).h;
        const k = Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0))) / 8;
        if (k > 1e-3) vT = Math.min(vT, Math.sqrt(Math.sqrt(0.8 / k) ** 2 + 2 * 0.8 * Math.max(0, d - 6)));
      }
      // next stop
      const ns = this.stops.find((x) => !a.served.has(x) && x > s - 3);
      if (a.state === 'drive' && ns !== undefined) {
        const d = ns - s;
        vT = Math.min(vT, d > 0.3 ? Math.max(d > 3 ? 1 : 0, Math.sqrt(2 * B_STOP * (d - 0.3))) : 0);
        if (d < 0.8 && Math.abs(v) < 0.2) { a.state = 'dwell'; a.dwell = DWELL; for (let i = 0; i < a.rig.doors.length; i++) t.setDoor(i, true); }
      }
      if (a.state === 'dwell') {
        vT = 0; a.dwell -= dt;
        if (a.dwell < 4 && a.rig.doors.some((d) => d.target > 0)) for (let i = 0; i < a.rig.doors.length; i++) t.setDoor(i, false);
        if (a.dwell <= 0 && !t.doorsOpen()) { a.state = 'drive'; a.served.add(ns); }
      }
      // signals
      for (const sl of this.stopLines) {
        const d = sl.s - s; if (d < -0.5 || d > 120) continue;
        if (!tl.mayPass(sl.inter, sl.group, d, Math.abs(v), 1.3)) vT = Math.min(vT, d > 1.5 ? Math.sqrt(2 * 1.0 * (d - 1.5)) : 0);
        break;
      }
      // speed controller (same traction model as the player's tram)
      let thr = 0, brk = 0;
      if (vT < 0.05 && v < 0.3) brk = 0.6;
      else if (v > vT + 0.2) brk = clamp((v - vT) * 0.9 + 0.1, 0.05, 0.95);
      else if (v < vT - 0.2) thr = clamp((vT - v) * 0.35 + 0.15, 0.1, 1);
      t.throttle = thr; t.brake = brk;
      if (a.visible) t.update(dt, null);
      else {
        // out of sight: plain kinematics, no articulation / bellows / pantograph work
        t.v = Math.max(0, t.v + clamp(vT - t.v, -1.3 * dt, 0.9 * dt));
        t.s = Math.min(L - 1, t.s + t.v * dt);
        for (const d of a.rig.doors) { if (d.target === 0 && d.pending > 0) d.pending -= dt; d.open = d.target === 0 && d.pending > 0 ? 1 : d.target; }
      }
      // end of the opposite track (loop entry): come back from the far end when nobody is looking
      if (t.s > L - 3) {
        const far = this.path.pose(TR.length + 40);
        const near = (p) => Math.hypot(p.x - cam.x, p.z - cam.z) < 260;
        if (!near(far) && !near(this.path.pose(t.s))) this.spawn(a, TR.length + 40);
      }
      // hide far away trams (and skip their per-frame bellows/pantograph work)
      const pc = this.path.pose(t.s - 15);
      const vis = Math.hypot(pc.x - cam.x, pc.z - cam.z) < 700;
      if (vis !== a.visible) { a.visible = vis; for (const r of a.rig.roots) r.visible = vis; if (vis) { t.applyPose(0); for (const d of a.rig.doors) d.anim(d.open); } }
      if (vis) a.rig.displays.tick(time);
    }
  }
  /** Points along every AI tram (for the traffic's obstacle checks). */
  samplePts(out) {
    for (const a of this.trams) { a.t.samplePts(this.pts); for (const p of this.pts) out.push(p); }
    return out;
  }
}
export { THREE };
