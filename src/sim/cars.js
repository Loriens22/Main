// Car models (lofted bodies, instanced per part) and the traffic simulation.
import * as THREE from 'three';
import { prepGeo, xform, mat, roundedBox, clamp, lerp, smoothstep, makeRng, wrapAngle } from '../util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from '../textures.js';

/* ------------------------------------------------------------------ */
/* Car geometry                                                        */
/* ------------------------------------------------------------------ */
// station: x (forward), hw, y0 bottom, yb beltline, cab (has greenhouse), yt roof, rw roof half-width, win (side glass)
const TYPES = {
  hatch: { L: 4.25, W: 1.79, wb: 2.6, track: 1.54, wr: 0.31, st: [
    [-2.12, 0.80, 0.40, 0.90, 0], [-2.06, 0.87, 0.32, 0.98, 1, 1.26, 0.6, 1], [-1.75, 0.89, 0.28, 1.0, 1, 1.44, 0.66, 1],
    [-0.3, 0.9, 0.27, 0.99, 1, 1.47, 0.68, 1], [0.5, 0.9, 0.27, 0.97, 1, 1.39, 0.66, 1], [1.05, 0.89, 0.28, 0.93, 0],
    [1.8, 0.86, 0.3, 0.83, 0], [2.12, 0.74, 0.4, 0.7, 0]] },
  sedan: { L: 4.72, W: 1.82, wb: 2.78, track: 1.56, wr: 0.32, st: [
    [-2.36, 0.8, 0.42, 0.95, 0], [-2.1, 0.89, 0.3, 1.0, 0], [-1.45, 0.9, 0.28, 1.0, 0], [-1.1, 0.9, 0.28, 0.99, 1, 1.38, 0.66, 1],
    [-0.2, 0.91, 0.27, 0.98, 1, 1.45, 0.68, 1], [0.55, 0.91, 0.27, 0.96, 1, 1.38, 0.66, 1], [1.15, 0.9, 0.28, 0.92, 0],
    [2.0, 0.87, 0.3, 0.8, 0], [2.36, 0.75, 0.42, 0.68, 0]] },
  suv: { L: 4.55, W: 1.86, wb: 2.68, track: 1.6, wr: 0.36, st: [
    [-2.27, 0.84, 0.46, 1.08, 0], [-2.2, 0.92, 0.4, 1.12, 1, 1.62, 0.72, 1], [-1.6, 0.93, 0.38, 1.13, 1, 1.72, 0.74, 1],
    [0.3, 0.93, 0.38, 1.12, 1, 1.72, 0.74, 1], [0.85, 0.93, 0.38, 1.1, 1, 1.6, 0.72, 1], [1.35, 0.92, 0.4, 1.06, 0],
    [2.05, 0.89, 0.42, 0.98, 0], [2.27, 0.8, 0.5, 0.85, 0]] },
  van: { L: 5.4, W: 2.05, wb: 3.45, track: 1.75, wr: 0.36, st: [
    [-2.7, 0.99, 0.42, 1.2, 1, 2.45, 0.96, 0], [-2.6, 1.02, 0.4, 1.2, 1, 2.5, 0.99, 0], [1.3, 1.02, 0.4, 1.18, 1, 2.5, 0.99, 0],
    [1.6, 1.02, 0.4, 1.15, 1, 2.35, 0.97, 1], [2.2, 1.0, 0.42, 1.12, 0], [2.55, 0.97, 0.45, 0.95, 0], [2.7, 0.9, 0.5, 0.8, 0]] },
  small: { L: 3.65, W: 1.66, wb: 2.37, track: 1.43, wr: 0.29, st: [
    [-1.82, 0.74, 0.38, 0.9, 0], [-1.76, 0.8, 0.32, 0.96, 1, 1.3, 0.58, 1], [-1.4, 0.82, 0.3, 0.98, 1, 1.46, 0.62, 1],
    [0.2, 0.83, 0.29, 0.97, 1, 1.48, 0.63, 1], [0.75, 0.83, 0.3, 0.95, 1, 1.36, 0.6, 1], [1.2, 0.82, 0.3, 0.9, 0],
    [1.65, 0.78, 0.33, 0.8, 0], [1.82, 0.7, 0.42, 0.68, 0]] },
};
TYPES.taxi = { ...TYPES.sedan, taxi: true };

function ringPoints(s) {
  const [x, hw, y0, yb, cab, yt, rw] = s;
  const top = cab ? yt : yb + 0.002, rwi = cab ? rw : hw * 0.9;
  // closed loop, left → right over the top (z = lateral)
  return [
    [x, y0, -hw * 0.9], [x, y0 + 0.14, -hw], [x, yb - 0.06, -hw], [x, yb, -hw * 0.97],
    [x, top - 0.05, -rwi], [x, top, -rwi * 0.82], [x, top, rwi * 0.82], [x, top - 0.05, rwi],
    [x, yb, hw * 0.97], [x, yb - 0.06, hw], [x, y0 + 0.14, hw], [x, y0, hw * 0.9],
  ];
}

function buildCarGeometry(type) {
  const T = TYPES[type];
  const rings = T.st.map(ringPoints);
  const body = [], glass = [];
  const push = (arr, a, b, c) => arr.push(...a, ...b, ...c);
  const n = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], Bb = rings[i + 1];
    const ca = T.st[i][4], cbb = T.st[i + 1][4];
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      if (j === n - 1) { /* bottom closing strip */ }
      let isGlass = false;
      const winA = T.st[i][7], winB = T.st[i + 1][7];
      if ((j === 3 || j === 7) && ca && cbb && (winA || winB)) isGlass = true; // side windows
      if (j >= 4 && j <= 6 && ca !== cbb) isGlass = true; // windscreen / rear window
      if ((j === 3 || j === 7) && ca !== cbb && (winA || winB)) isGlass = true;
      const arr = isGlass ? glass : body;
      push(arr, A[j], Bb[j], Bb[j2]); push(arr, A[j], Bb[j2], A[j2]);
    }
  }
  // end caps
  for (const [ring, flip] of [[rings[0], true], [rings[rings.length - 1], false]]) {
    const c = ring.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n], [0, 0, 0]);
    for (let j = 0; j < n; j++) { const a = ring[j], b = ring[(j + 1) % n]; if (flip) push(body, c, b, a); else push(body, c, a, b); }
  }
  const mk = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; };
  const bodyG = mk(body), glassG = mk(glass);
  // make normals point outwards (check the roof)
  fixOutward(bodyG); fixOutward(glassG);
  // smooth-ish shading: merge vertices then recompute normals
  const smooth = (g) => { const m = mergeVerts(g); m.computeVertexNormals(); return m; };
  const bodyS = smooth(bodyG);

  // trim: bumpers, grille, mirrors, arches, plate
  const trim = [], lights = [], wheels = [], rims = [];
  const hw = T.W / 2;
  const L2 = T.L / 2;
  const front = T.st[T.st.length - 1], rear = T.st[0];
  trim.push(xform(prepGeo(roundedBox(0.16, 0.2, T.W * 0.96, 0.05)), mat(L2 - 0.02, front[2] + 0.1, 0)));
  trim.push(xform(prepGeo(roundedBox(0.16, 0.2, T.W * 0.96, 0.05)), mat(-L2 + 0.02, rear[2] + 0.12, 0)));
  trim.push(xform(prepGeo(new THREE.BoxGeometry(0.04, 0.16, T.W * 0.45)), mat(L2 + 0.005, front[2] + 0.28, 0)));
  for (const s of [-1, 1]) {
    trim.push(xform(prepGeo(roundedBox(0.16, 0.1, 0.2, 0.03)), mat(T.st.find((q) => q[4])[0] + (type === 'van' ? 3.9 : 1.55), T.st[3][3] + 0.05, s * (hw + 0.06))));
    lights.push(xform(prepGeo(roundedBox(0.06, 0.1, 0.32, 0.03), 0xf4f4f0), mat(L2 - 0.04, front[3] - 0.1, s * (hw - 0.25))));
    lights.push(xform(prepGeo(roundedBox(0.06, 0.12, 0.3, 0.03), 0xb0100a), mat(-L2 + 0.04, rear[3] - 0.08, s * (hw - 0.22))));
  }
  // wheels
  const tire = new THREE.CylinderGeometry(T.wr, T.wr, 0.22, 20).rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(T.wr * 0.62, T.wr * 0.62, 0.225, 16).rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    wheels.push(xform(prepGeo(tire), mat(sx * T.wb / 2, T.wr, sz * T.track / 2)));
    rims.push(xform(prepGeo(rim), mat(sx * T.wb / 2, T.wr, sz * (T.track / 2 + 0.005))));
  }
  if (T.taxi) {
    trim.push(xform(prepGeo(roundedBox(0.35, 0.14, 0.6, 0.04), 0xf2c200), mat(-0.2, 1.52, 0)));
  }
  const brake = [];
  for (const s of [-1, 1]) brake.push(xform(prepGeo(new THREE.PlaneGeometry(0.34, 0.14).rotateY(-Math.PI / 2)), mat(-L2 - 0.02, rear[3] - 0.08, s * (hw - 0.22))));
  const merge = (a) => mergeGeometries(a.map((g) => prepGeo(g)), false);
  return {
    body: prepGeo(bodyS), glass: prepGeo(glassG), trim: merge(trim), lights: merge(lights), wheels: merge(wheels), rims: merge(rims), brake: merge(brake),
    L: T.L, W: T.W, type,
  };
}
function fixOutward(g) {
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) {
    // centroid vs normal: outward if dot(n, centroid - (0, 0.8, 0)) > 0
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const cx = (p[i] + p[i + 3] + p[i + 6]) / 3, cy = (p[i + 1] + p[i + 4] + p[i + 7]) / 3 - 0.8, cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
    if (nx * cx * 0.3 + ny * cy + nz * cz < 0) { for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; } }
  }
  g.computeVertexNormals();
}
function mergeVerts(g) {
  // weld identical positions so normals are smoothed
  const p = g.attributes.position.array; const map = new Map(); const verts = []; const idx = [];
  for (let i = 0; i < p.length; i += 3) {
    const k = `${p[i].toFixed(3)},${p[i + 1].toFixed(3)},${p[i + 2].toFixed(3)}`;
    let id = map.get(k); if (id === undefined) { id = verts.length / 3; verts.push(p[i], p[i + 1], p[i + 2]); map.set(k, id); }
    idx.push(id);
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); out.setIndex(idx);
  return out;
}

export const CAR_COLORS = [0xe8e8e8, 0xf4f4f2, 0x1b1c1e, 0x2a2d31, 0x8d949b, 0xa9afb4, 0x5f666d, 0x7a1414, 0xa5231f, 0x1f3f7a, 0x23508f, 0x2f5d3a, 0x6b5a3e, 0xc9b99a, 0x3a4a5a, 0x8a1c3b];

export class CarFleet {
  constructor(scene) {
    this.scene = scene;
    const plateTex = TX.plate('CB 9016 KM');
    this.mats = {
      body: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x0f1418, roughness: 0.03, metalness: 0.2, envMapIntensity: 1.8 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.6, vertexColors: true }),
      lights: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.3, vertexColors: true, envMapIntensity: 2 }),
      wheels: new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.9 }),
      rims: new THREE.MeshStandardMaterial({ color: 0xa8adb2, metalness: 0.85, roughness: 0.3 }),
      brake: new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false }),
    };
    this.plateTex = plateTex;
    this.geo = {};
    for (const t of Object.keys(TYPES)) this.geo[t] = buildCarGeometry(t);
    this.meshes = {};
    this.used = {};
    this.cars = [];
  }
  /** Allocates instanced meshes once the number of cars per type is known. */
  allocate(counts) {
    for (const [t, n] of Object.entries(counts)) {
      if (!n) continue;
      const G = this.geo[t];
      const parts = {};
      for (const k of ['body', 'glass', 'trim', 'lights', 'wheels', 'rims', 'brake']) {
        const m = new THREE.InstancedMesh(G[k], this.mats[k], n);
        m.castShadow = k !== 'brake' && k !== 'glass'; m.receiveShadow = k !== 'brake';
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        if (k === 'body') for (let i = 0; i < n; i++) m.setColorAt(i, new THREE.Color(1, 1, 1));
        this.scene.add(m);
        parts[k] = m;
      }
      this.meshes[t] = parts;
    }
  }
  /** Creates a car record of type t with colour. Instance slots are assigned per frame (visibility compaction). */
  add(t, color) {
    const car = { type: t, color: new THREE.Color(t === 'taxi' ? 0xf4c20d : color), L: this.geo[t].L, W: this.geo[t].W, x: 0, z: 0, h: 0, y: 0, braking: false, visible: true };
    this.cars.push(car);
    return car;
  }
  place() { /* kept for API compatibility: matrices are written in render() */ }
  /** Writes visible cars into consecutive instance slots. */
  render(camera, shadowFocus) {
    if (!this._fr) { this._fr = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sph = new THREE.Sphere(new THREE.Vector3(), 3.2); this._M = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0); this._p = new THREE.Vector3(); this._one = new THREE.Vector3(1, 1, 1); }
    camera.updateMatrixWorld();
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this._fr.setFromProjectionMatrix(this._pm);
    const cx = camera.position.x, cz = camera.position.z;
    const slots = {};
    for (const t of Object.keys(this.meshes)) slots[t] = 0;
    const M = this._M, q = this._q, p = this._p;
    for (const car of this.cars) {
      if (!car.visible) continue;
      const dx = car.x - cx, dz = car.z - cz, d2 = dx * dx + dz * dz;
      if (d2 > 380 * 380) continue;
      this._sph.center.set(car.x, 1, car.z);
      const nearShadow = shadowFocus && (car.x - shadowFocus.x) ** 2 + (car.z - shadowFocus.z) ** 2 < 3600;
      if (!nearShadow && !this._fr.intersectsSphere(this._sph)) continue;
      const parts = this.meshes[car.type];
      const i = slots[car.type]++;
      q.setFromAxisAngle(this._up, -car.h); p.set(car.x, car.y || 0, car.z);
      M.compose(p, q, this._one);
      for (const k of ['body', 'glass', 'trim', 'lights', 'wheels', 'rims']) parts[k].setMatrixAt(i, M);
      parts.body.setColorAt(i, car.color);
      if (!car.braking) M.makeScale(0, 0, 0);
      parts.brake.setMatrixAt(i, M);
    }
    for (const [t, parts] of Object.entries(this.meshes)) {
      for (const m of Object.values(parts)) { m.count = slots[t]; m.visible = slots[t] > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
  }
  flush() {}
  computeBounds() { for (const parts of Object.values(this.meshes)) for (const m of Object.values(parts)) m.computeBoundingSphere(); }
}

/* ------------------------------------------------------------------ */
/* Traffic simulation                                                  */
/* ------------------------------------------------------------------ */
export class Traffic {
  constructor(route, fleet, tl, movers) {
    this.route = route; this.fleet = fleet; this.tl = tl;
    this.cars = movers; // [{car, lane, s, v, v0}]
    this.rnd = makeRng(77);
    // speed caps from curvature
    for (const L of route.lanes) {
      const n = Math.ceil(L.poly.length / 5) + 1; L.cap = new Float32Array(n);
      const o1 = {}, o2 = {};
      for (let i = 0; i < n; i++) {
        L.poly.at(i * 5 - 6, o1); L.poly.at(i * 5 + 6, o2);
        const k = Math.abs(wrapAngle(o2.h - o1.h)) / 12;
        L.cap[i] = k > 1e-4 ? Math.sqrt(2.2 / k) : 30;
      }
    }
    this.byLane = new Map();
  }
  capAt(L, s) { const i = clamp(Math.round(s / 5), 0, L.cap.length - 1); return L.cap[i]; }
  pos(c) {
    const o = c._o || (c._o = {});
    c.lane.poly.at(c.s, o);
    if (c.change) {
      const o2 = c._o2 || (c._o2 = {});
      c.change.from.poly.at(c.s + c.change.dS, o2);
      const t = smoothstep(0, 1, c.change.t);
      o.x = lerp(o2.x, o.x, t); o.z = lerp(o2.z, o.z, t);
      o.h = o2.h + wrapAngle(o.h - o2.h) * t + Math.sin(t * Math.PI) * 0.12 * c.change.dir;
    }
    return o;
  }
  update(dt, busPts, camPos, peds) {
    const byLane = this.byLane; byLane.clear();
    for (const c of this.cars) { if (!c.active) continue; if (!byLane.has(c.lane)) byLane.set(c.lane, []); byLane.get(c.lane).push(c); }
    for (const arr of byLane.values()) arr.sort((a, b) => a.s - b.s);
    for (const c of this.cars) {
      if (!c.active) { c.respawnT -= dt; if (c.respawnT <= 0) this.tryRespawn(c, camPos); continue; }
      const L = c.lane;
      const p = this.pos(c);
      const hx = Math.cos(p.h), hz = Math.sin(p.h);
      // ---- find the nearest obstacle ahead ----
      let gap = 200, vLead = 20;
      const arr = byLane.get(L);
      const idx = arr.indexOf(c);
      if (idx >= 0 && idx < arr.length - 1) { const nb = arr[idx + 1]; gap = nb.s - c.s - (nb.car.L + c.car.L) / 2; vLead = nb.v; }
      // cars merging into our lane
      for (const o of this.cars) {
        if (o === c || !o.active || !o.change || o.lane !== L) continue;
        const d = o.s - c.s; if (d > 0 && d < gap) { gap = d - (o.car.L + c.car.L) / 2; vLead = o.v; }
      }
      // bus + pedestrians (point checks in the car frame)
      const checkPts = (pts, halfW) => {
        for (let i = 0; i < pts.length; i += 2) {
          const dx = pts[i] - p.x, dz = pts[i + 1] - p.z;
          const f = dx * hx + dz * hz, l = -dx * hz + dz * hx;
          if (f > 0 && f < 45 && Math.abs(l) < halfW) { const g2 = f - c.car.L / 2 - 0.4; if (g2 < gap) { gap = g2; vLead = 0; } }
        }
      };
      if (busPts) checkPts(busPts, 1.35 + c.car.W / 2);
      if (peds && peds.length) checkPts(peds, 1.1);
      // signals
      for (const sg of L.signals) {
        const d = sg.s - c.s;
        if (d < -1 || d > 90) continue;
        if (!this.tl.mayPass(sg.inter, sg.group, d, c.v)) { const g2 = d - c.car.L / 2 - 0.5; if (g2 < gap) { gap = Math.max(0.1, g2); vLead = 0; } }
        break;
      }
      // ---- IDM ----
      const v0 = Math.min(c.v0, this.capAt(L, c.s + 8));
      const s0 = 2.2, T = 1.25, a = 1.7, b = 2.6;
      const dv = c.v - vLead;
      const sStar = s0 + Math.max(0, c.v * T + (c.v * dv) / (2 * Math.sqrt(a * b)));
      let acc = a * (1 - Math.pow(c.v / Math.max(0.1, v0), 4) - Math.pow(sStar / Math.max(0.2, gap), 2));
      acc = clamp(acc, -7, a);
      c.v = Math.max(0, c.v + acc * dt);
      if (gap < 0.3) c.v = 0;
      c.car.braking = acc < -0.6 || (c.v < 0.3 && gap < 12);
      c.s += c.v * dt;
      // ---- lane change when stuck behind a stationary obstacle ----
      if (c.v < 0.5 && gap < 14 && vLead < 0.5 && !c.change) c.stuck += dt; else c.stuck = Math.max(0, c.stuck - dt);
      if (c.stuck > 2.5 && L.neighbor && !c.change && (L.neighborFrom === undefined || c.s > L.neighborFrom)) {
        const N = L.neighbor;
        const tS = c.s + (L.neighborOffset || 0);
        const pr = N.poly.project(p.x, p.z, N.poly._seg(tS), 25);
        const ok = pr.d < 5 && (byLane.get(N) || []).every((o) => o.s < pr.s - 10 || o.s > pr.s + 14);
        if (ok) {
          c.change = { from: L, dS: c.s - pr.s, t: 0, dir: Math.sign(pr.lat) || 1 };
          c.lane = N; c.s = pr.s; c.stuck = 0;
        }
      }
      if (c.change) { c.change.t += dt / 2.6; if (c.change.t >= 1) c.change = null; }
      // ---- end of lane ----
      if (c.s > c.lane.poly.length - 1) {
        if (c.lane.next) {
          const nl = c.lane.next.lane; const e = this.pos(c);
          const pr = nl.poly.project(e.x, e.z);
          c.lane = nl; c.s = pr.s;
        } else { c.active = false; c.car.visible = false; c.respawnT = 1 + this.rnd() * 4; this.fleet.place(c.car); continue; }
      }
      const q = this.pos(c);
      c.car.x = q.x; c.car.z = q.z; c.car.h = q.h;
      this.fleet.place(c.car);
    }
  }
  tryRespawn(c, camPos) {
    const lanes = this.route.lanes.filter((l) => l.spawn);
    const L = c.home || lanes[Math.floor(this.rnd() * lanes.length)];
    const o = L.poly.at(0, {});
    if (camPos && Math.hypot(o.x - camPos.x, o.z - camPos.z) < 140) { c.respawnT = 2; return; }
    const occupied = this.cars.some((d) => d.active && d.lane === L && d.s < 25);
    if (occupied) { c.respawnT = 1.5; return; }
    c.lane = L; c.s = 0; c.v = 8; c.active = true; c.car.visible = true; c.change = null; c.stuck = 0;
  }
  /** OBBs of all active cars (for bus collisions). */
  boxes() {
    return this.cars.filter((c) => c.active).map((c) => ({ x: c.car.x, z: c.car.z, h: c.car.h, hd: c.car.L / 2, hw: c.car.W / 2, ref: c }));
  }
}
