// Civilian traffic on the OSM road graph: lane following, Bézier turns at
// junctions, IDM car-following, traffic signals with phase groups, yielding
// to buses, time-of-day density, spawn/despawn around the camera.
import * as THREE from 'three';
import { carAssets, carPaint } from '../world/CarModels.js';
import { mulberry32 } from '../core/rng.js';
import { clamp } from '../core/math.js';

const DRIVE = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential']);

/** Signal controller: two (or three) phase groups per signalised junction. */
export class TrafficSignals {
  constructor(network, seed = 7) {
    this.nodes = [];
    const r = mulberry32(seed);
    for (const n of network.nodes.values()) {
      if (!n.signal || !n.sorted) continue;
      const ends = n.sorted.filter((e) => !e.piece.minor);
      if (ends.length < 2) continue;
      // group approaches: those roughly parallel to the first end form phase A
      const ref = ends[0].d;
      const groups = new Map();
      for (const e of ends) {
        const dot = Math.abs(e.d[0] * ref[0] + e.d[1] * ref[1]);
        groups.set(e, dot > 0.7 ? 0 : 1);
      }
      const cycle = [
        { g: 0, s: 'G', t: 20 + r() * 8 }, { g: 0, s: 'Y', t: 3 }, { g: -1, s: 'R', t: 2 },
        { g: 1, s: 'G', t: 15 + r() * 8 }, { g: 1, s: 'Y', t: 3 }, { g: -1, s: 'R', t: 2 },
      ];
      const total = cycle.reduce((a, c) => a + c.t, 0);
      this.nodes.push({ node: n, groups, cycle, total, offset: r() * total });
      n.ctrl = this.nodes[this.nodes.length - 1];
    }
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
  }

  /** 'G' | 'Y' | 'R' | 'RY' for an approach (end object) of a node. */
  state(node, end) {
    const c = node.ctrl;
    if (!c) return 'G';
    const g = c.groups.get(end);
    let t = (this.time + c.offset) % c.total;
    let phase = c.cycle[0], idx = 0;
    for (let i = 0; i < c.cycle.length; i++) {
      if (t < c.cycle[i].t) {
        phase = c.cycle[i];
        idx = i;
        break;
      }
      t -= c.cycle[i].t;
    }
    if (phase.g === g) return phase.s;
    // red+amber in the last 1.5 s before this group's green (Bulgarian sequence)
    const next = c.cycle[(idx + 1) % c.cycle.length];
    if (next.g === g && next.s === 'G' && phase.t - t < 1.5) return 'RY';
    return 'R';
  }
}

function pieceGeom(p) {
  if (p._cum) return;
  const n = p.pts.length / 2;
  p._cum = new Float64Array(n);
  for (let i = 1; i < n; i++) p._cum[i] = p._cum[i - 1] + Math.hypot(p.pts[2 * i] - p.pts[2 * i - 2], p.pts[2 * i + 1] - p.pts[2 * i - 1]);
  p.len = p._cum[n - 1];
  p.lanesPerDir = p.oneway ? Math.max(1, Math.round(p.width / 3.3)) : Math.max(1, Math.round(p.hw / 3.25));
}

/** Point on a piece at arc s measured in the travel direction; lane offset to the right. */
function lanePoint(p, fwd, s, lane, out) {
  pieceGeom(p);
  const L = p.len;
  const sp = clamp(fwd ? s : L - s, 0, L);
  const c = p._cum;
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (c[m] <= sp) lo = m; else hi = m;
  }
  const t = (sp - c[lo]) / Math.max(1e-6, c[hi] - c[lo]);
  const x = p.pts[2 * lo] + (p.pts[2 * hi] - p.pts[2 * lo]) * t, z = p.pts[2 * lo + 1] + (p.pts[2 * hi + 1] - p.pts[2 * lo + 1]) * t;
  let dx = p.pts[2 * hi] - p.pts[2 * lo], dz = p.pts[2 * hi + 1] - p.pts[2 * lo + 1];
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl; dz /= dl;
  if (!fwd) { dx = -dx; dz = -dz; }
  const laneW = (p.oneway ? p.width : p.hw) / p.lanesPerDir;
  const off = (p.oneway ? p.hw : p.hw) - (lane + 0.5) * laneW;
  out.x = x - dz * off;
  out.z = z + dx * off;
  out.dx = dx;
  out.dz = dz;
  return out;
}

/** 2D OBB vs OBB separating-axis test. Boxes {cx,cz,fx,fz,hl,hw}. Returns MTV for A or null. */
export function obbOverlap(a, b) {
  const axes = [[a.fx, a.fz], [-a.fz, a.fx], [b.fx, b.fz], [-b.fz, b.fx]];
  let best = null;
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  for (const [ax, az] of axes) {
    const ra = Math.abs(a.hl * (a.fx * ax + a.fz * az)) + Math.abs(a.hw * (-a.fz * ax + a.fx * az));
    const rb = Math.abs(b.hl * (b.fx * ax + b.fz * az)) + Math.abs(b.hw * (-b.fz * ax + b.fx * az));
    const d = dx * ax + dz * az;
    const o = ra + rb - Math.abs(d);
    if (o <= 0) return null;
    if (!best || o < best.depth) best = { depth: o, nx: -Math.sign(d) * ax, nz: -Math.sign(d) * az };
  }
  return best;
}

export class TrafficManager {
  constructor({ scene, world, quality }) {
    this.scene = scene;
    this.world = world;
    this.net = world.roads;
    this.signals = new TrafficSignals(this.net);
    this.rand = mulberry32(99);
    this.cars = [];
    this.maxCars = quality === 'balanced' ? 36 : quality === 'high' ? 60 : 80;
    this.target = Math.round(this.maxCars * 0.65);
    this.radius = quality === 'balanced' ? 280 : 360;
    this.drivable = this.net.pieces.filter((p) => DRIVE.has(p.cls) && !p.minor && p.len > 12);
    const { types, bodyMat, trimMat } = carAssets();
    this.types = types;
    this.meshes = types.map((t) => {
      const body = new THREE.InstancedMesh(t.geo.body, bodyMat, this.maxCars);
      const trim = new THREE.InstancedMesh(t.geo.trim, trimMat, this.maxCars);
      body.count = trim.count = 0;
      body.castShadow = trim.castShadow = true;
      body.frustumCulled = trim.frustumCulled = false;
      body.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(body, trim);
      return { body, trim };
    });
    // night lights: front white / rear red quads
    const lg = new THREE.BufferGeometry();
    const quad = (x, y, z, w, h, col, back) => {
      const pos = [], c = [];
      const v = [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]];
      for (const k of back ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) { pos.push(v[k][0], v[k][1], z); c.push(...col); }
      return { pos, c };
    };
    const parts = [quad(-0.6, 0.72, -2.32, 0.14, 0.05, [3, 3, 2.6], true), quad(0.6, 0.72, -2.32, 0.14, 0.05, [3, 3, 2.6], true), quad(-0.6, 0.85, 2.32, 0.13, 0.05, [3, 0.15, 0.1], false), quad(0.6, 0.85, 2.32, 0.13, 0.05, [3, 0.15, 0.1], false)];
    lg.setAttribute('position', new THREE.Float32BufferAttribute(parts.flatMap((p) => p.pos), 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(parts.flatMap((p) => p.c), 3));
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    this.lights = new THREE.InstancedMesh(lg, this.lightMat, this.maxCars * types.length);
    this.lights.count = 0;
    this.lights.frustumCulled = false;
    scene.add(this.lights);
    this.tmp = {};
    this.M = new THREE.Matrix4();
    this.Q = new THREE.Quaternion();
    this.E = new THREE.Euler();
    this.S = new THREE.Vector3(1, 1, 1);
    this.P = new THREE.Vector3();
    this.buses = [];
    this.peds = null;
    this.density = 1;
  }

  setDensity(d) {
    this.density = d === 'low' ? 0.5 : d === 'high' ? 1.4 : 1;
  }

  setFocusBus() {}

  reset() {
    this.cars.length = 0;
  }

  spawn(focus) {
    for (let tries = 0; tries < 12; tries++) {
      const p = this.drivable[Math.floor(this.rand() * this.drivable.length)];
      pieceGeom(p);
      const fwd = p.oneway ? true : this.rand() < 0.5;
      const s = 6 + this.rand() * Math.max(1, p.len - 12);
      const lane = Math.floor(this.rand() * p.lanesPerDir);
      const pt = lanePoint(p, fwd, s, lane, {});
      const d = Math.hypot(pt.x - focus.x, pt.z - focus.z);
      if (d < 90 || d > this.radius - 20) continue;
      if (this.cars.some((c) => Math.hypot(c.x - pt.x, c.z - pt.z) < 14)) continue;
      if (this.buses.some((b) => Math.hypot(b.phys.x - pt.x, b.phys.z - pt.z) < 30)) continue;
      const ti = Math.floor(this.rand() * (this.types.length - 0.3));
      const t = this.types[ti];
      const taxi = this.rand() < 0.08;
      const car = {
        p, fwd, s, lane, ti, len: t.L, wid: t.W, v: (p.speed || 50) / 3.6 * 0.7, x: pt.x, z: pt.z, dx: pt.dx, dz: pt.dz,
        color: carPaint(this.rand, taxi), factor: 0.85 + this.rand() * 0.25, turn: null, stuck: 0, brake: false,
      };
      this.cars.push(car);
      return car;
    }
    return null;
  }

  /** Choose the next piece at the node the car is driving into and build the turn curve. */
  planTurn(car) {
    const p = car.p;
    const nodeId = car.fwd ? p.b : p.a;
    const node = this.net.nodes.get(nodeId);
    if (!node) return false;
    const inDx = car.dx, inDz = car.dz;
    const opts = [];
    for (const e of node.ends) {
      const q = e.piece;
      if (q === p || q.minor || !DRIVE.has(q.cls)) continue;
      const fwd = e.atStart; // leaving the node
      if (q.oneway && !fwd) continue;
      const dot = inDx * e.d[0] + inDz * e.d[1];
      if (dot < -0.5) continue; // no U-turns
      const w = (dot > 0.8 ? 3 : 1) * (q.rank >= 6 ? 1.5 : 1);
      opts.push({ q, fwd, w, e });
    }
    if (!opts.length) return false;
    let tot = opts.reduce((a, o) => a + o.w, 0), r = this.rand() * tot;
    let pick = opts[0];
    for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
    pieceGeom(pick.q);
    const R = Math.min(9, p.len * 0.4, pick.q.len * 0.4);
    const lane = Math.min(car.lane, pick.q.lanesPerDir - 1);
    const a = lanePoint(p, car.fwd, p.len - R, car.lane, {});
    const b = lanePoint(pick.q, pick.fwd, R, lane, {});
    // control point: intersection of the two lane tangents (fallback: midpoint)
    const det = a.dx * -b.dz - a.dz * -b.dx;
    let cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
    if (Math.abs(det) > 0.05) {
      const rx = b.x - a.x, rz = b.z - a.z;
      const t = (rx * -b.dz - rz * -b.dx) / det;
      if (t > 0 && t < 3 * R) { cx = a.x + a.dx * t; cz = a.z + a.dz * t; }
    }
    let len = 0, px = a.x, pz = a.z;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, u = 1 - t;
      const x = u * u * a.x + 2 * u * t * cx + t * t * b.x, z = u * u * a.z + 2 * u * t * cz + t * t * b.z;
      len += Math.hypot(x - px, z - pz);
      px = x; pz = z;
    }
    car.turn = { a, b, cx, cz, len, u: 0, next: pick.q, nextFwd: pick.fwd, nextLane: lane, R, node, endIn: node.sorted && node.sorted.find((e) => e.piece === p && e.atStart === !car.fwd), sharp: Math.abs(det) > 0.5 };
    return true;
  }

  update(dt, focus, buses) {
    this.buses = buses || [];
    this.signals.update(dt);
    // population
    const want = Math.min(this.maxCars, Math.round(this.target * this.density * (this.night ? 0.55 : 1)));
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const dist = Math.hypot(c.x - focus.x, c.z - focus.z);
      // a car and a bus waiting for each other never resolve: the car gives up
      // (quickly when it is far from the camera, later if it is in view)
      const deadlock = c.busWait > (dist > 60 ? 8 : 20);
      if (dist > this.radius + 40 || c.stuck > 40 || deadlock) this.cars.splice(i, 1);
    }
    let spawned = 0;
    while (this.cars.length < want && spawned++ < 3) if (!this.spawn(focus)) break;
    // bus boxes for interaction
    const busBoxes = this.buses.flatMap((b) => b.phys.boxes());
    for (const car of this.cars) this.step(car, dt, busBoxes);
    this.render();
  }

  step(car, dt, busBoxes) {
    const p = car.p;
    const limit = ((p.speed || 50) / 3.6) * car.factor;
    let v0 = car.turn ? Math.min(limit, car.turn.sharp ? 6 : 9) : limit;
    // leader search
    let gap = 80, vLead = v0;
    const fx = car.dx, fz = car.dz;
    for (const o of this.cars) {
      if (o === car) continue;
      const rx = o.x - car.x, rz = o.z - car.z;
      const along = rx * fx + rz * fz;
      if (along <= 0 || along > 45) continue;
      const lat = Math.abs(-rx * fz + rz * fx);
      if (lat > 1.7) continue;
      if (o.dx * fx + o.dz * fz < 0.3) continue;
      const g = along - (o.len + car.len) / 2;
      if (g < gap) { gap = g; vLead = o.v; }
    }
    // buses (and anything box-shaped in the lane ahead)
    let byBus = false;
    for (const b of busBoxes) {
      // an oncoming bus in its own lane is passed; only a bus across or in our lane stops us
      // (a car in a turn swings across the bus's lane: keep the full margin then)
      const side = b.fx * fx + b.fz * fz < -0.5 && !car.turn ? 0.25 : 0.9;
      for (let d = 2; d <= 30; d += 2) {
        const px = car.x + fx * (car.len / 2 + d), pz = car.z + fz * (car.len / 2 + d);
        const lx = (px - b.cx) * b.fx + (pz - b.cz) * b.fz, lz = (px - b.cx) * -b.fz + (pz - b.cz) * b.fx;
        if (Math.abs(lx) < b.hl + 0.5 && Math.abs(lz) < b.hw + side) {
          if (d - 1 < gap) { gap = d - 1; vLead = 0; byBus = true; }
          break;
        }
      }
    }
    // pedestrians crossing in front
    if (this.peds) {
      const ped = this.peds.blocking(car.x + fx * (car.len / 2 + 3), car.z + fz * (car.len / 2 + 3), fx, fz, 14);
      if (ped != null && ped < gap) { gap = ped; vLead = 0; }
    }
    // traffic signal at the node ahead
    if (!car.turn) {
      const nodeId = car.fwd ? p.b : p.a;
      const node = this.net.nodes.get(nodeId);
      if (node && node.ctrl) {
        const end = node.sorted.find((e) => e.piece === p && e.atStart === !car.fwd);
        if (end) {
          const st = this.signals.state(node, end);
          const stopS = p.len - (end.trim || 6) - 1.8;
          const dist = stopS - car.s - car.len / 2;
          if (st !== 'G' && dist > -0.5) {
            const canStop = dist > (car.v * car.v) / (2 * 3.5);
            if (st !== 'Y' || canStop) if (dist < gap) { gap = Math.max(0.1, dist); vLead = 0; }
          }
        }
      }
    }
    // IDM
    const aMax = 1.6, b = 2.6, s0 = 2.2, T = 1.25;
    const dv = car.v - vLead;
    const sStar = s0 + Math.max(0, car.v * T + (car.v * dv) / (2 * Math.sqrt(aMax * b)));
    let acc = aMax * (1 - Math.pow(car.v / Math.max(0.1, v0), 4) - Math.pow(sStar / Math.max(0.1, gap), 2));
    acc = clamp(acc, -8, aMax);
    car.brake = acc < -0.5;
    car.v = Math.max(0, car.v + acc * dt);
    if (car.v < 0.1) car.stuck += dt; else car.stuck = 0;
    // creeping at a bus that waits for us is a deadlock too
    car.busWait = byBus && car.v < 1.0 ? (car.busWait || 0) + dt : 0;
    const ds = car.v * dt;
    // advance
    if (car.turn) {
      const t = car.turn;
      t.u += ds / Math.max(0.5, t.len);
      if (t.u >= 1) {
        car.p = t.next;
        car.fwd = t.nextFwd;
        car.lane = t.nextLane;
        car.s = t.R + (t.u - 1) * t.len;
        car.turn = null;
      } else {
        const u = t.u, w = 1 - u;
        const x = w * w * t.a.x + 2 * w * u * t.cx + u * u * t.b.x, z = w * w * t.a.z + 2 * w * u * t.cz + u * u * t.b.z;
        const tx = 2 * w * (t.cx - t.a.x) + 2 * u * (t.b.x - t.cx), tz = 2 * w * (t.cz - t.a.z) + 2 * u * (t.b.z - t.cz);
        const tl = Math.hypot(tx, tz) || 1;
        car.x = x; car.z = z; car.dx = tx / tl; car.dz = tz / tl;
        return;
      }
    } else {
      car.s += ds;
      pieceGeom(car.p);
      const R = Math.min(9, car.p.len * 0.4);
      if (car.s >= car.p.len - R) {
        if (!this.planTurn(car)) {
          car.stuck = 100; // dead end: despawn
          return;
        }
        return;
      }
    }
    lanePoint(car.p, car.fwd, car.s, car.lane, this.tmp);
    car.x = this.tmp.x; car.z = this.tmp.z; car.dx = this.tmp.dx; car.dz = this.tmp.dz;
  }

  render() {
    const counts = this.types.map(() => 0);
    const hf = this.world.hf;
    let li = 0;
    for (const car of this.cars) {
      const m = this.meshes[car.ti];
      const i = counts[car.ti]++;
      const y = hf.heightAt(car.x, car.z) + 0.07;
      const yaw = Math.atan2(-car.dx, -car.dz);
      const yF = hf.heightAt(car.x + car.dx * 1.5, car.z + car.dz * 1.5), yB = hf.heightAt(car.x - car.dx * 1.5, car.z - car.dz * 1.5);
      this.E.set(Math.atan2(yF - yB, 3), yaw, 0, 'YXZ');
      this.Q.setFromEuler(this.E);
      this.M.compose(this.P.set(car.x, y, car.z), this.Q, this.S);
      m.body.setMatrixAt(i, this.M);
      m.trim.setMatrixAt(i, this.M);
      m.body.setColorAt(i, car.color);
      if (this.lightMat.opacity > 0 || car.brake) this.lights.setMatrixAt(li++, this.M);
    }
    this.meshes.forEach((m, k) => {
      m.body.count = m.trim.count = counts[k];
      m.body.instanceMatrix.needsUpdate = m.trim.instanceMatrix.needsUpdate = true;
      if (m.body.instanceColor) m.body.instanceColor.needsUpdate = true;
    });
    this.lights.count = li;
    this.lights.instanceMatrix.needsUpdate = true;
  }

  setNight(n) {
    this.night = n > 0.5;
    this.lightMat.opacity = n > 0.3 ? 1 : 0;
  }

  /** Bus vs traffic collision (used as an extra collider of the player's bus). */
  collideBus(phys) {
    let best = null;
    for (const box of phys.boxes()) {
      for (const car of this.cars) {
        if (Math.abs(car.x - box.cx) > 14 || Math.abs(car.z - box.cz) > 14) continue;
        const c = obbOverlap(box, { cx: car.x, cz: car.z, fx: car.dx, fz: car.dz, hl: car.len / 2, hw: car.wid / 2 });
        if (c && (!best || c.depth > best.depth)) best = c;
      }
    }
    return best;
  }
}
