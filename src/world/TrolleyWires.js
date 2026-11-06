// Trolleybus overhead line: two contact wires over the kerb-side lane of each direction (positive on the left,
// negative on the right, 0.6 m apart, 5.6 m above the road), hung from insulated hangers on bracket arms or
// cross-span wires, carried by tubular poles at the kerb about every 27 m. Curves are polygonal, as real
// trolley wire is (a pull-off at every support, closer supports in bends). Section insulators break the line
// every ~350 m; where the line crosses a tram line a crossing frame insulates the four wires from each other.
//
// The same geometry is what the trolley poles run on: world.trolleyWires exposes each wire line (both
// conductors as polylines with arc lengths) and a query for the wire pair nearest a point and heading.
// Everything is generated from the route (both directions and the terminal loops) and the road widths; pole
// positions avoid carriageways and buildings. Positions are estimated, not surveyed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const WIRE_H = 5.6; // contact wire above the road
export const WIRE_GAP = 0.6; // between the two conductors
const TILE = 256;
const SPAN = 27; // m between supports on the straight
const STEP = 1.5; // sampling of the wire line

/** A polyline [x, z, x, z ...] with arc lengths, nearest-point search and sampling. */
class WireLine {
  constructor(pts, y) {
    this.x = pts.map((p) => p[0]);
    this.z = pts.map((p) => p[1]);
    this.y = y; // wire height (world y) per vertex
    this.n = pts.length;
    this.s = new Float32Array(this.n);
    for (let i = 1; i < this.n; i++) this.s[i] = this.s[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    this.length = this.s[this.n - 1];
    this.x0 = Math.min(...this.x) - 8; this.x1 = Math.max(...this.x) + 8;
    this.z0 = Math.min(...this.z) - 8; this.z1 = Math.max(...this.z) + 8;
  }

  /** Point (x, y, z) and unit tangent at arc length s (clamped). */
  at(s, out = {}) {
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    const L = this.s[hi] - this.s[lo] || 1e-6, t = (s - this.s[lo]) / L;
    out.x = this.x[lo] + (this.x[hi] - this.x[lo]) * t;
    out.z = this.z[lo] + (this.z[hi] - this.z[lo]) * t;
    out.y = this.y[lo] + (this.y[hi] - this.y[lo]) * t;
    out.tx = (this.x[hi] - this.x[lo]) / L;
    out.tz = (this.z[hi] - this.z[lo]) / L;
    return out;
  }

  /** Nearest point: {s, d, side} (side > 0: the point is right of the wire's direction). Optional window. */
  nearest(x, z, s0 = null, win = 40) {
    let i0 = 0, i1 = this.n - 2;
    if (s0 != null) {
      const find = (v) => { let lo = 0, hi = this.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= v) lo = m; else hi = m; } return lo; };
      i0 = Math.min(this.n - 2, find(s0 - win));
      i1 = Math.min(this.n - 2, find(s0 + win) + 1);
    }
    let best = { s: 0, d: Infinity, side: 0 };
    for (let i = i0; i <= i1; i++) {
      const ax = this.x[i], az = this.z[i], dx = this.x[i + 1] - ax, dz = this.z[i + 1] - az;
      const L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { s: this.s[i] + Math.sqrt(L2) * t, d, side: Math.sign(dx * (z - az) - dz * (x - ax)) };
    }
    return best;
  }
}

/** Offset polyline: dist > 0 to the right of travel (x east, z south: right = (-tz, tx)). */
function offsetLine(pts, dist) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const L = Math.hypot(tx, tz) || 1;
    tx /= L; tz /= L;
    out.push([pts[i][0] - tz * dist, pts[i][1] + tx * dist]);
  }
  return out;
}

/** Resample a polyline every `step` metres (keeps the ends). */
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    while (s <= L) { out.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L]); s += step; }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > 0.3) out.push(last);
  return out;
}

/** The wire centre line of a direction: the route centre line shifted into the kerb-side lane (smoothed). */
function laneCentre(route, dirId) {
  const d = route.direction(dirId), P = d.path;
  const offs = [];
  for (let s = 0; s <= P.length; s += STEP) offs.push([s, route.laneOffset(dirId, s)]);
  const pts = [];
  const tmp = {};
  for (let i = 0; i < offs.length; i++) {
    let a = 0, n = 0;
    for (let k = -14; k <= 14; k++) { a += offs[Math.min(offs.length - 1, Math.max(0, i + k))][1]; n++; }
    const s = offs[i][0], o = a / n;
    P.at(s, tmp);
    const t = P.tangent(s, 5);
    pts.push([tmp.x - t.tz * o, tmp.z + t.tx * o]);
  }
  return pts;
}

/** The wire network of a trolleybus route; builds the meshes into the world tiles. */
export function buildTrolleyWires(world) {
  const route = world.route;
  if (!route || !route.isTrolley) return null;
  const hf = world.hf, roads = world.roads;
  const lite = world.quality === 'balanced' || world.quality === 'low';
  // ---- the wire centre lines: both directions and the two terminal links (turning loops)
  const centres = [];
  for (const id of ['A', 'B']) centres.push({ id, kind: 'dir', pts: resample(laneCentre(route, id), STEP) });
  for (const [key, pts] of Object.entries(route.terminalLinks || {})) {
    if (!pts || pts.length < 2) continue;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (L < 6) continue;
    // a loop road is narrow: the wires hang 1.2 m right of its centre line
    centres.push({ id: key, kind: 'link', pts: resample(offsetLine(pts, 1.2), STEP) });
  }
  const lines = centres.map((c) => {
    const ys = c.pts.map(([x, z]) => hf.heightAt(x, z) + WIRE_H);
    // positive wire on the left (-), negative on the right (+) of travel
    const left = offsetLine(c.pts, -WIRE_GAP / 2), right = offsetLine(c.pts, WIRE_GAP / 2);
    return { ...c, centre: new WireLine(c.pts, ys), left: new WireLine(left, ys), right: new WireLine(right, ys) };
  });

  // ---- supports: one about every SPAN m, closer in bends (every ~12 m when the heading turns)
  const mats = {
    pole: new THREE.MeshStandardMaterial({ color: 0x5f6b62, roughness: 0.55, metalness: 0.45 }),
    arm: new THREE.MeshStandardMaterial({ color: 0x8a9095, roughness: 0.5, metalness: 0.6 }),
    insul: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.4 }),
    wire: new THREE.LineBasicMaterial({ color: 0x3a3631 }),
    span: new THREE.LineBasicMaterial({ color: 0x55524d }),
  };
  const supports = []; // {x, z, gy, top, wire points [[x,y,z],[x,y,z]], span: bool, far: {x,z}}
  const blocked = (x, z) => (roads && roads.onRoad(x, z, 0.25)) || (world.bgrid && world.bgrid.pointInAny(x, z) >= 0);
  const kerbHalf = (dirId, s) => {
    try { return route.laneInfo(dirId, s)[0]; } catch (e) { return 5; }
  };
  for (const L of lines) {
    const C = L.centre;
    let last = -1e9;
    let prevT = null;
    for (let s = 0; s <= C.length; s += 3) {
      const p = C.at(s);
      const turn = prevT ? Math.abs(Math.atan2(prevT.tx * p.tz - prevT.tz * p.tx, prevT.tx * p.tx + prevT.tz * p.tz)) : 0;
      prevT = { tx: p.tx, tz: p.tz };
      const need = turn > 0.025 ? 11 : SPAN;
      if (s - last < need && s < C.length - 1) continue;
      // pole spot: right of the lane at the kerb (the carriageway half width from the route centre line)
      const rx = -p.tz, rz = p.tx;
      let spot = null;
      if (L.kind === 'dir') {
        const rs = route.direction(L.id).path.nearest(p.x, p.z).s;
        const hw = kerbHalf(L.id, rs);
        const c = route.direction(L.id).path.at(rs);
        // lateral position of the wire from the route centre line
        const lat = (p.x - c.x) * rx + (p.z - c.z) * rz;
        for (const extra of [0.7, 1.1, 1.6, 2.3]) {
          const off = hw + extra - lat;
          const x = p.x + rx * off, z = p.z + rz * off;
          if (!blocked(x, z)) { spot = { x, z, arm: off }; break; }
        }
      } else {
        for (const off of [3.2, 3.8, 4.6, 5.5]) {
          const x = p.x + rx * off, z = p.z + rz * off;
          if (!blocked(x, z)) { spot = { x, z, arm: off }; break; }
        }
      }
      if (!spot) continue;
      last = s;
      const gy = hf.heightAt(spot.x, spot.z);
      const wl = L.left.at(L.left.nearest(p.x - rx * WIRE_GAP / 2, p.z - rz * WIRE_GAP / 2, s, 6).s);
      const wr = L.right.at(L.right.nearest(p.x + rx * WIRE_GAP / 2, p.z + rz * WIRE_GAP / 2, s, 6).s);
      supports.push({ x: spot.x, z: spot.z, gy, top: p.y + 1.15, arm: spot.arm, w: [[wl.x, wl.y, wl.z], [wr.x, wr.y, wr.z]], rx, rz, span: spot.arm > 7.2 });
    }
  }

  // ---- crossings with tram lines: a crossing frame where a wire centre line crosses a tram track
  const crossings = [];
  const rails = (world.data && world.data.rails) || [];
  const segX = (a, b, c, d) => {
    const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * q[1] - r[1] * q[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t, Math.atan2(q[0], q[1])] : null;
  };
  for (const L of lines) {
    const P = L.centre;
    for (const rl of rails) {
      let rx0 = Infinity, rx1 = -Infinity, rz0 = Infinity, rz1 = -Infinity;
      for (let i = 0; i < rl.length; i += 2) { rx0 = Math.min(rx0, rl[i]); rx1 = Math.max(rx1, rl[i]); rz0 = Math.min(rz0, rl[i + 1]); rz1 = Math.max(rz1, rl[i + 1]); }
      if (rx1 < P.x0 || rx0 > P.x1 || rz1 < P.z0 || rz0 > P.z1) continue;
      for (let i = 0; i + 3 < rl.length; i += 2) {
        const c = [rl[i], rl[i + 1]], d = [rl[i + 2], rl[i + 3]];
        for (let j = 0; j < P.n - 1; j++) {
          const x = segX([P.x[j], P.z[j]], [P.x[j + 1], P.z[j + 1]], c, d);
          if (x && !crossings.some((k) => Math.hypot(k.x - x[0], k.z - x[1]) < 4)) crossings.push({ x: x[0], z: x[1], tramYaw: x[2], line: L, s: P.s[j] });
        }
      }
    }
  }

  // ---- geometry per tile
  const tileOf = (x, z) => `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
  const segs = new Map(), spans = new Map();
  const pushSeg = (map, x, z, arr) => {
    const k = tileOf(x, z);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(...arr);
  };
  // contact wires: straight chords between supports (polygonal curves), sampled every 3 m on the straight
  for (const L of lines) {
    for (const W of [L.left, L.right]) {
      for (let i = 0; i < W.n - 1; i += 2) {
        const j = Math.min(W.n - 1, i + 2);
        pushSeg(segs, W.x[i], W.z[i], [W.x[i], W.y[i], W.z[i], W.x[j], W.y[j], W.z[j]]);
      }
    }
  }
  const poleM = new Map(), armM = new Map(), insM = new Map();
  const add = (map, x, z, m) => { const k = tileOf(x, z); if (!map.has(k)) map.set(k, []); map.get(k).push(m); };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const sp of supports) {
    const h = sp.top + 0.6 - sp.gy;
    add(poleM, sp.x, sp.z, m4.compose(v.set(sp.x, sp.gy, sp.z), q.identity(), sc.set(1, h, 1)).clone());
    const [wl, wr] = sp.w;
    const cx = (wl[0] + wr[0]) / 2, cz = (wl[2] + wr[2]) / 2, wy = (wl[1] + wr[1]) / 2;
    const dx = cx - sp.x, dz = cz - sp.z, Lh = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(-dz, dx);
    if (!sp.span) {
      // bracket arm from the pole over the wires (with a stay below it) and the cross bar carrying the hangers
      const armY = wy + 0.75;
      add(armM, sp.x, sp.z, m4.compose(v.set(sp.x, armY, sp.z), q.setFromAxisAngle(up, yaw), sc.set(Lh + 0.5, 1, 1)).clone());
      const stayL = Math.hypot(Lh * 0.55, 0.85);
      add(armM, sp.x, sp.z, m4.compose(v.set(sp.x, armY - 0.85, sp.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.atan2(0.85, Lh * 0.55), 'YZX')), sc.set(stayL, 0.75, 0.75)).clone());
      pushSeg(spans, sp.x, sp.z, [cx, armY, cz, cx, wy + 0.32, cz]);
    } else {
      // cross-span wire from the pole top across the road to a pole on the far kerb
      const fx = cx + (dx / Lh) * 6.5, fz = cz + (dz / Lh) * 6.5;
      const fgy = hf.heightAt(fx, fz);
      if (!blocked(fx, fz)) add(poleM, fx, fz, m4.compose(v.set(fx, fgy, fz), q.identity(), sc.set(1, sp.top + 0.6 - fgy, 1)).clone());
      pushSeg(spans, sp.x, sp.z, [sp.x, sp.top + 0.4, sp.z, cx, wy + 0.45, cz, cx, wy + 0.45, cz, fx, sp.top + 0.4, fz]);
    }
    // hanger frame: a short insulated bar across both wires, insulators above each wire
    pushSeg(spans, sp.x, sp.z, [wl[0], wl[1] + 0.32, wl[2], wr[0], wr[1] + 0.32, wr[2], wl[0], wl[1] + 0.32, wl[2], wl[0], wl[1], wl[2], wr[0], wr[1] + 0.32, wr[2], wr[0], wr[1], wr[2]]);
    for (const w of sp.w) add(insM, w[0], w[2], m4.compose(v.set(w[0], w[1] + 0.12, w[2]), q.identity(), sc.set(1, 1, 1)).clone());
  }
  // section insulators every ~350 m: dark blocks in both wires
  const secM = new Map();
  for (const L of lines) {
    for (let s = 180; s < L.centre.length - 20; s += 350) {
      for (const W of [L.left, L.right]) {
        const p = W.at(s);
        add(secM, p.x, p.z, m4.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(up, Math.atan2(p.tx, p.tz)), sc.set(1, 1, 1)).clone());
      }
    }
  }
  // crossing frames: an insulated square of four bars where the trolley wires cross a tram wire; the tram contact
  // wire is drawn 14 m either side
  const crossM = new Map();
  for (const c of crossings) {
    const y = hf.heightAt(c.x, c.z) + WIRE_H;
    add(crossM, c.x, c.z, m4.compose(v.set(c.x, y + 0.02, c.z), q.setFromAxisAngle(up, c.tramYaw), sc.set(1, 1, 1)).clone());
    const tx = Math.sin(c.tramYaw), tz = Math.cos(c.tramYaw);
    pushSeg(segs, c.x, c.z, [c.x - tx * 14, y, c.z - tz * 14, c.x + tx * 14, y, c.z + tz * 14]);
  }
  const poleGeo = new THREE.CylinderGeometry(0.085, 0.13, 1, lite ? 6 : 10).translate(0, 0.5, 0);
  const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0);
  const insGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.24, 8);
  const secGeo = new THREE.BoxGeometry(0.12, 0.08, 1.9);
  const crossGeo = mergeGeometries([
    new THREE.BoxGeometry(1.7, 0.06, 0.06).translate(0, 0, -0.55), new THREE.BoxGeometry(1.7, 0.06, 0.06).translate(0, 0, 0.55),
    new THREE.BoxGeometry(0.06, 0.06, 1.2).translate(-0.8, 0, 0), new THREE.BoxGeometry(0.06, 0.06, 1.2).translate(0.8, 0, 0),
  ]);
  const out = [];
  const inst = (geo, mat, map, shadow) => {
    for (const [k, list] of map) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.computeBoundingSphere();
      im.castShadow = shadow;
      im.name = `trolleyWire:${k}`;
      out.push(im);
    }
  };
  inst(poleGeo, mats.pole, poleM, true);
  inst(armGeo, mats.arm, armM, true);
  inst(insGeo, mats.insul, insM, false);
  inst(secGeo, mats.insul, secM, false);
  inst(crossGeo, mats.insul, crossM, false);
  for (const [map, mat] of [[segs, mats.wire], [spans, mats.span]]) {
    for (const [k, arr] of map) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeBoundingSphere();
      const ls = new THREE.LineSegments(g, mat);
      ls.name = `trolleyWire:${k}`;
      out.push(ls);
    }
  }
  for (const o of out) world.addToTile(o.name.split(':')[1], o);

  // ---- the query the trolley poles use
  const net = {
    lines,
    crossings,
    supports,
    /**
     * The wire line under which a vehicle at (x, z) heading (hx, hz) runs: the line whose centre is nearest
     * and runs within 75 degrees of the heading. Returns {line, s, d, side} or null beyond maxD.
     */
    find(x, z, hx, hz, maxD = 9, hint = null) {
      let best = null;
      for (const L of lines) {
        const C = L.centre;
        if (x < C.x0 - maxD || x > C.x1 + maxD || z < C.z0 - maxD || z > C.z1 + maxD) continue;
        const n = C.nearest(x, z, hint && hint.line === L ? hint.s : null, hint && hint.line === L ? 30 : 40);
        if (n.d > maxD) continue;
        const t = C.at(n.s);
        if (t.tx * hx + t.tz * hz < 0.26) continue;
        if (!best || n.d < best.d) best = { line: L, ...n };
      }
      return best;
    },
  };
  world.trolleyWires = net;
  return { lines: lines.length, supports: supports.length, crossings: crossings.length, meshes: out.length };
}
