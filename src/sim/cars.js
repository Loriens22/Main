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

// Cross-section of one station: 22 points, left sill → over the roof → right sill (closed loop).
// Segment zones by index: 0-5 lower body, 6 side window band, 7-10 roof / hood, mirrored after that, 21 underside.
const RING_N = 22;
const ZONE = []; for (let j = 0; j < RING_N; j++) { const k = j < 11 ? j : 20 - j; ZONE.push(j === 21 ? 'bot' : k <= 5 ? 'low' : k === 6 ? 'win' : 'top'); }
function ringHalf(s) {
  const [, hw, y0, yb, cab, yt, rw] = s;
  const mid = (y0 + 0.14 + yb - 0.07) / 2;
  const low = [[y0, hw * 0.86], [y0 + 0.05, hw * 0.96], [y0 + 0.14, hw * 0.995], [mid, hw], [yb - 0.07, hw * 0.995], [yb - 0.015, hw * 0.975]];
  const up = cab
    ? [[yb + 0.012, hw * 0.955], [yt - 0.06, rw + 0.015], [yt - 0.024, rw * 0.97], [yt - 0.004, rw * 0.86], [yt, rw * 0.5]]
    : [[yb + 0.004, hw * 0.945], [yb + 0.012, hw * 0.9], [yb + 0.02, hw * 0.82], [yb + 0.026, hw * 0.7], [yb + 0.03, hw * 0.5]];
  return low.concat(up); // 11 × [y, |z|]
}
/** Monotone Catmull-Rom (no overshoot between the two middle samples). */
function mcr(a, b, c, d, t) {
  const v = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  return Math.min(Math.max(v, Math.min(b, c)), Math.max(b, c));
}

function buildCarGeometry(type) {
  const T = TYPES[type];
  const st = T.st, NS = st.length;
  const halves = st.map(ringHalf);
  // longitudinal samples: every station, ~0.22 m in between, and dense around the wheel arches
  const R = T.wr + 0.065, axles = [-T.wb / 2, T.wb / 2];
  let xs = [];
  for (let i = 0; i < NS - 1; i++) { const a = st[i][0], b = st[i + 1][0], n = Math.max(1, Math.ceil((b - a) / 0.22)); for (let k = 0; k < n; k++) xs.push(a + (b - a) * k / n); }
  xs.push(st[NS - 1][0]);
  for (const ax of axles) for (let k = 0; k <= 12; k++) xs.push(ax + R * Math.cos(Math.PI * k / 12));
  xs.sort((a, b) => a - b);
  xs = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 0.015);
  // interpolated half-section of every sample (+ the station interval it lies in, for glass)
  const secs = xs.map((x) => {
    let i = 0; while (i < NS - 2 && x >= st[i + 1][0]) i++;
    const t = clamp((x - st[i][0]) / (st[i + 1][0] - st[i][0] || 1), 0, 1);
    const A = halves[Math.max(0, i - 1)], Bh = halves[i], C = halves[i + 1], D = halves[Math.min(NS - 1, i + 2)];
    const pts = Bh.map((_, j) => [mcr(A[j][0], Bh[j][0], C[j][0], D[j][0], t), mcr(A[j][1], Bh[j][1], C[j][1], D[j][1], t)]);
    // wheel arch: lift the sill line over the tyre
    for (const ax of axles) {
      const dx = x - ax; if (Math.abs(dx) >= R) continue;
      const ya = Math.min(T.wr + Math.sqrt(R * R - dx * dx), pts[5][0] - 0.12);
      for (let j = 0; j <= 4; j++) pts[j][0] = Math.max(pts[j][0], ya + j * 0.012);
    }
    return { x, i, pts };
  });
  const S = secs.length;
  const pos = [], col = [];
  for (const sc of secs) {
    const ring = []; for (let j = 0; j < 11; j++) ring.push([sc.pts[j][0], -sc.pts[j][1]]);
    for (let j = 10; j >= 0; j--) ring.push([sc.pts[j][0], sc.pts[j][1]]);
    ring.forEach(([y, z], j) => {
      pos.push(sc.x, y, z);
      const k = j < 11 ? j : 21 - j; const c = k === 0 ? 0.08 : k === 1 ? 0.3 : 1; // dark underside and wheel wells
      col.push(c, c, c);
    });
  }
  const bodyIdx = [], glassIdx = [];
  // winding: the roof quad must face up
  const P = (a, j) => new THREE.Vector3().fromArray(pos, (a * RING_N + j) * 3);
  const m0 = Math.floor(S / 2), e1 = P(m0 + 1, 10).sub(P(m0, 10)), e2 = P(m0 + 1, 11).sub(P(m0, 10));
  const flipQ = e1.cross(e2).y < 0;
  for (let a = 0; a < S - 1; a++) {
    const iv = secs[a].i;
    const A0 = st[iv], A1 = st[Math.min(NS - 1, iv + 1)];
    const ca = !!A0[4], cb = !!A1[4], wA = !!A0[7], wB = !!A1[7];
    for (let j = 0; j < RING_N; j++) {
      const j2 = (j + 1) % RING_N, z = ZONE[j];
      const glass = (z === 'win' && ca && cb && (wA || wB)) || (z === 'top' && ca !== cb);
      const q = [a * RING_N + j, (a + 1) * RING_N + j, (a + 1) * RING_N + j2, a * RING_N + j2];
      if (flipQ) (glass ? glassIdx : bodyIdx).push(q[0], q[2], q[1], q[0], q[3], q[2]);
      else (glass ? glassIdx : bodyIdx).push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
  }
  // end caps
  for (const [a, sx] of [[0, -1], [S - 1, 1]]) {
    const c = [0, 0, 0]; for (let j = 0; j < RING_N; j++) for (let k = 0; k < 3; k++) c[k] += pos[(a * RING_N + j) * 3 + k] / RING_N;
    const ci = pos.length / 3; pos.push(...c); col.push(1, 1, 1);
    // the cap must face outwards (−x at the rear, +x at the front)
    const C = new THREE.Vector3().fromArray(c), f1 = P(a, 10).sub(C), f2 = P(a, 11).sub(C);
    const flip = Math.sign(f1.cross(f2).x) !== sx;
    for (let j = 0; j < RING_N; j++) { const p = a * RING_N + j, q = a * RING_N + (j + 1) % RING_N; if (flip) bodyIdx.push(ci, q, p); else bodyIdx.push(ci, p, q); }
  }
  const mkI = (idx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const bodyS = mkI(bodyIdx), glassG = mkI(glassIdx);

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
  // rounded tyre (lathe) and a dished five-spoke rim facing outwards
  const r = T.wr, V2 = (a, b) => new THREE.Vector2(a * r, b);
  const tire = new THREE.LatheGeometry([V2(0.63, -0.104), V2(0.8, -0.112), V2(0.93, -0.1), V2(0.985, -0.068), V2(1, 0), V2(0.985, 0.068), V2(0.93, 0.1), V2(0.8, 0.112), V2(0.63, 0.104)], 28).rotateX(Math.PI / 2);
  const rimParts = [
    new THREE.LatheGeometry([V2(0.66, 0.1), V2(0.63, 0.1), V2(0.55, 0.05), V2(0.2, 0.07), V2(0.16, 0.075), V2(0.01, 0.075)], 24).rotateX(Math.PI / 2),
    new THREE.CylinderGeometry(0.07 * r / 0.31, 0.08 * r / 0.31, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, 0.09),
  ];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    rimParts.push(new THREE.BoxGeometry(0.46 * r, 0.075 * r, 0.03).translate(0.36 * r, 0, 0.078).rotateZ(a));
  }
  const rim = mergeGeometries(rimParts.map((g) => prepGeo(g)), false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    wheels.push(xform(prepGeo(tire), mat(sx * T.wb / 2, T.wr, sz * T.track / 2)));
    // rim geometry faces +z; turn it around for the left-hand wheels
    rims.push(xform(prepGeo(rim), mat(sx * T.wb / 2, T.wr, sz * (T.track / 2 + 0.005), 0, sz > 0 ? 0 : Math.PI, 0)));
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
export const CAR_COLORS = [0xe8e8e8, 0xf4f4f2, 0x1b1c1e, 0x2a2d31, 0x8d949b, 0xa9afb4, 0x5f666d, 0x7a1414, 0xa5231f, 0x1f3f7a, 0x23508f, 0x2f5d3a, 0x6b5a3e, 0xc9b99a, 0x3a4a5a, 0x8a1c3b];

export class CarFleet {
  constructor(scene) {
    this.scene = scene;
    const plateTex = TX.plate('CB 9016 KM');
    this.mats = {
      body: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, vertexColors: true }),
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
      let obst = 'car';
      const checkPts = (pts, halfW, kind) => {
        for (let i = 0; i < pts.length; i += 2) {
          const dx = pts[i] - p.x, dz = pts[i + 1] - p.z;
          const f = dx * hx + dz * hz, l = -dx * hz + dz * hx;
          if (f > 0 && f < 45 && Math.abs(l) < halfW) { const g2 = f - c.car.L / 2 - 0.4; if (g2 < gap) { gap = g2; vLead = 0; obst = kind; } }
        }
      };
      if (busPts) checkPts(busPts, 0.4 + c.car.W / 2, 'bus');
      if (peds && peds.length) checkPts(peds, 1.1, 'ped');
      // signals
      for (const sg of L.signals) {
        const d = sg.s - c.s;
        if (d < -1 || d > 90) continue;
        if (!this.tl.mayPass(sg.inter, sg.group, d, c.v)) { const g2 = d - c.car.L / 2 - 0.5; if (g2 < gap) { gap = Math.max(0.1, g2); vLead = 0; obst = 'sig'; } }
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
      // (only to get past the stopped bus/tram — never out of a queue at a red light)
      if (c.v < 0.5 && gap < 14 && vLead < 0.5 && !c.change && obst === 'bus') c.stuck += dt; else c.stuck = Math.max(0, c.stuck - dt);
      if (c.stuck > 2.5 && L.neighbor && !c.change && (L.neighborFrom === undefined || c.s > L.neighborFrom)) {
        const N = L.neighbor;
        const tS = c.s + (L.neighborOffset || 0);
        const pr = N.poly.project(p.x, p.z, N.poly._seg(tS), 25);
        let ok = pr.d < 5 && (byLane.get(N) || []).every((o) => o.s < pr.s - 10 || o.s > pr.s + 14);
        // the target lane must be clear of the bus too
        if (ok && busPts) for (let i = 0; i < busPts.length; i += 2) {
          const q = N.poly.project(busPts[i], busPts[i + 1], N.poly._seg(pr.s), 40);
          if (Math.abs(q.lat) < 2.6 && q.s > pr.s - 12 && q.s < pr.s + 16) { ok = false; break; }
        }
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
