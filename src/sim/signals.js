// Traffic signal controller for the three signalised intersections (with public-transport priority).
import * as THREE from 'three';

const Y = 3, AR = 2, RY = 1.5;

export class TrafficLights {
  constructor(route) {
    this.inters = route.inters.filter((i) => i.signal);
    this.st = new Map();
    const lens = (c) => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: new THREE.Color(c), emissiveIntensity: 0.04, roughness: 0.25 });
    this.inters.forEach((it, k) => {
      const T = it.green.A + Y + AR + it.green.B + Y + AR;
      const mats = {};
      for (const g of ['A', 'B']) mats[g] = { R: lens(0xff2a1a), Y: lens(0xffb000), G: lens(0x33ff88), PR: lens(0xff2a1a), PG: lens(0x33ff88) };
      this.st.set(it, { t: (k * 17.3) % T, T, mats });
    });
  }
  /** Phase letter for a group: 'G','Y','R','RY' and seconds until change. */
  state(it, g) {
    const s = this.st.get(it); if (!s) return { c: 'G', left: 99 };
    const gA = it.green.A, gB = it.green.B, t = s.t;
    const tA0 = 0, tA1 = gA, tAy = gA + Y, tB0 = gA + Y + AR, tB1 = tB0 + gB, tBy = tB1 + Y, T = s.T;
    if (g === 'A') {
      if (t < tA1) return { c: 'G', left: tA1 - t };
      if (t < tAy) return { c: 'Y', left: tAy - t };
      if (t > T - RY) return { c: 'RY', left: T - t };
      return { c: 'R', left: T - RY - t };
    } else {
      if (t >= tB0 && t < tB1) return { c: 'G', left: tB1 - t };
      if (t >= tB1 && t < tBy) return { c: 'Y', left: tBy - t };
      if (t >= tB0 - RY && t < tB0) return { c: 'RY', left: tB0 - t };
      return { c: 'R', left: (t < tB0 ? tB0 - RY - t : T + tB0 - RY - t) };
    }
    void tA0;
  }
  mats(it, g) { return this.st.get(it).mats[g]; }
  /** bus approaching on group g: shorten the conflicting green (Sofia public transport priority). */
  requestPriority(it, g) {
    const s = this.st.get(it); if (!s || s.prioCool > 0) return;
    const other = g === 'A' ? 'B' : 'A';
    const so = this.state(it, other);
    if (so.c === 'G' && so.left > 5) {
      // how long has the other been green?
      const gOther = it.green[other];
      if (gOther - so.left > 6) { s.t += so.left - 5; s.prioCool = 40; }
    }
  }
  update(dt, t) {
    for (const [it, s] of this.st) {
      s.t = (s.t + dt) % s.T;
      if (s.prioCool > 0) s.prioCool -= dt;
      for (const g of ['A', 'B']) {
        const { c, left } = this.state(it, g);
        const m = s.mats[g];
        const on = 3.2, off = 0.03;
        m.R.emissiveIntensity = c === 'R' || c === 'RY' ? on : off;
        m.Y.emissiveIntensity = c === 'Y' || c === 'RY' ? on : off;
        m.G.emissiveIntensity = c === 'G' ? on : off;
        // pedestrians crossing *across* group g's street walk when the other group has green
        const o = this.state(it, g === 'A' ? 'B' : 'A');
        const pg = o.c === 'G' && (o.left > 4 || Math.floor(t * 2) % 2 === 0);
        m.PG.emissiveIntensity = pg ? on : off;
        m.PR.emissiveIntensity = pg ? off : on;
        void left;
      }
    }
  }
  /** Can a vehicle on group g pass a stop line `dist` metres ahead at speed v? */
  mayPass(it, g, dist, v, decel = 3.0) {
    const { c, left } = this.state(it, g);
    if (c === 'G') return true;
    if (c === 'Y') { const stopDist = (v * v) / (2 * decel); return stopDist > dist - 1 || left * v > dist + 5; }
    return false;
  }
}
