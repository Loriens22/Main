// Running gear and moving parts of the Conecto G: silver steel disc wheels on 275/70 R22.5 tyres (single
// tyres on the steered front axle and on the middle axle, twin tyres on the driven rear axle), double
// inward-swinging doors with full-height glass, and the deforming accordion bellows (many narrow folds,
// beige-grey, updated each frame in afterPose).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Parts, M, box, basis, extrude, rectPath, rectShape, mergeFlat } from './geom.js';
import { kitWheel } from '../../BusKit.js';

const DOOR_FOOT = 0.34;
const DOOR_TOP = 2.42;

export const RunningMixin = {
  wheelGeometry() {
    if (this._wheelGeo) return this._wheelGeo;
    const lite = this.lite;
    const seg = lite ? 24 : 44;
    const sq = 0.945;
    const half = [[0.2865, 0.125], [0.3, 0.136], [0.34, 0.142], [0.4, 0.146], [0.44, 0.14], [0.468, 0.118], [0.4775, 0.098], [0.48, 0.09],
      [0.48, 0.082], [0.469, 0.079], [0.469, 0.07], [0.48, 0.067], [0.48, 0.04],
      [0.48, 0.028], [0.469, 0.025], [0.469, 0.016], [0.48, 0.013], [0.48, 0]];
    const prof = half.map(([r, a]) => new THREE.Vector2(r, -a * sq));
    for (const [r, a] of half.slice().reverse().slice(1)) prof.push(new THREE.Vector2(r, a * sq));
    const tyre = new THREE.LatheGeometry(prof, seg);
    tyre.rotateZ(-Math.PI / 2);
    // silver steel disc wheel: flange, dish, raised hub boss and cap (outer face towards +x)
    const face = [[0.305, 0.118], [0.305, 0.126], [0.29, 0.128], [0.272, 0.108], [0.258, 0.09], [0.15, 0.086], [0.14, 0.1], [0.128, 0.106], [0.066, 0.106], [0.062, 0.118], [0.0, 0.122]];
    const rim = new THREE.LatheGeometry(face.map(([r, a]) => new THREE.Vector2(r, a)), seg);
    rim.rotateZ(-Math.PI / 2);
    const back = new THREE.CircleGeometry(0.29, 24);
    back.rotateY(-Math.PI / 2);
    back.translate(-0.1, 0, 0);
    const dark = [back];
    const studs = [];
    for (let i = 0; i < 10; i++) {
      const phi = (i / 10) * Math.PI * 2 + 0.15;
      const hole = new THREE.CircleGeometry(1, 12);
      hole.scale(0.016, 0.031, 1);
      hole.rotateY(Math.PI / 2);
      hole.translate(0.092, 0.205, 0);
      hole.rotateX(phi);
      dark.push(hole);
      if (!lite) {
        const nut = new THREE.CylinderGeometry(0.014, 0.014, 0.018, 6);
        nut.rotateZ(-Math.PI / 2);
        nut.translate(0.113, 0.098, 0);
        nut.rotateX(phi);
        studs.push(nut);
      }
    }
    this._wheelGeo = { tyre, rim, dark: mergeGeometries(mergeFlat(dark), false), studs: studs.length ? mergeGeometries(mergeFlat(studs), false) : null };
    return this._wheelGeo;
  },

  makeWheel(twin) {
    const kw = kitWheel(twin, { kind: 'steel', spacing: 0.31, R: this.D.wheelR });
    if (kw) return kw;
    const g = new THREE.Group();
    const geo = this.wheelGeometry();
    const m = this.mats;
    const add = (geom, mat, x = 0) => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.x = x;
      mesh.castShadow = mat === m.tyre;
      g.add(mesh);
      return mesh;
    };
    add(geo.tyre, m.tyre);
    add(geo.rim, m.rim);
    add(geo.dark, m.matteBlack);
    if (geo.studs) add(geo.studs, m.steel);
    if (twin) add(geo.tyre, m.tyre, -0.31);
    return g;
  },

  addAxle(section, z, twin, steer) {
    const D = this.D;
    for (const side of [1, -1]) {
      const knuckle = new THREE.Group();
      knuckle.position.set(side * (D.track / 2 + (twin ? 0.02 : 0)), D.wheelR, z);
      const spin = new THREE.Group();
      const w = this.makeWheel(twin);
      if (side < 0) w.rotation.y = Math.PI;
      spin.add(w);
      knuckle.add(spin);
      section.add(knuckle);
      this.wheels.push({ knuckle, spin, steer, side, section: section === this.front ? 'front' : 'rear', z });
    }
  },

  /** Double inward-swinging leaves: black frame, one full-height glass, black kick plate, rubber seal at the stile. */
  addDoor(section, d) {
    const HW = this.D.halfW;
    const w = d.z1 - d.z0;
    const leafW = w / 2 - 0.004;
    const h = DOOR_TOP - DOOR_FOOT;
    const leaves = [];
    for (const end of [-1, 1]) {
      const hingeZ = end < 0 ? d.z0 : d.z1;
      const pivot = new THREE.Group();
      pivot.position.set(HW - 0.05, 0, hingeZ);
      const lp = new Parts();
      const cz = -end * (leafW / 2);
      const frame = rectShape(-leafW / 2, 0, leafW / 2, h, 0.02);
      frame.holes.push(rectPath(-leafW / 2 + 0.045, 0.36, leafW / 2 - 0.045, h - 0.05, 0.012));
      lp.add('black', extrude(frame, 0.035, 0.004), basis([0, 0, -end], [0, 1, 0], [end, 0, 0], [end > 0 ? -0.035 : 0, DOOR_FOOT, cz]));
      const g = new THREE.PlaneGeometry(leafW - 0.09, h - 0.41);
      g.rotateY(Math.PI / 2);
      lp.add('glass', g, M(-0.015, DOOR_FOOT + 0.36 + (h - 0.41) / 2, cz));
      // glazing bar one third up (door leaves have a narrow horizontal stiffener)
      lp.add('black', box(0.04, 0.03, leafW - 0.06), M(-0.017, DOOR_FOOT + 0.36, cz));
      lp.add('black', box(0.045, h, 0.03), M(-0.017, DOOR_FOOT + h / 2, -end * (leafW - 0.012)));
      pivot.add(lp.build(this.mats, { castShadow: false }));
      section.add(pivot);
      leaves.push({ pivot, end });
    }
    this.doorLeaves[d.id] = leaves;
  },

  /* ------------------------------------------------------------------ bellows */
  buildBellows() {
    const D = this.D;
    const folds = 9, per = 6;
    this.bellowsRings = folds * per + 1;
    const ring = [];
    const W2 = D.halfW - 0.05, y0 = 0.42, y1 = D.roofY - 0.1, rr = 0.26, segs = 6;
    ring.push([W2, y0]);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * (Math.PI / 2);
      ring.push([W2 - rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr]);
    }
    for (let i = 0; i <= segs; i++) {
      const a = Math.PI / 2 + (i / segs) * (Math.PI / 2);
      ring.push([-W2 + rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr]);
    }
    ring.push([-W2, y0]);
    this.bellowsRing = ring;
    this.bellowsY0 = y0;
    const n = ring.length, R = this.bellowsRings;
    this.bellowsFold = Array.from({ length: R }, (_, k) => 0.5 * (1 - Math.cos(2 * Math.PI * folds * (k / (R - 1)))));
    const pos = new Float32Array(R * n * 3), col = new Float32Array(R * n * 3);
    const crest = new THREE.Color(0xbfb396), valley = new THREE.Color(0x6e6450), c = new THREE.Color();
    for (let k = 0; k < R; k++) {
      c.copy(crest).lerp(valley, this.bellowsFold[k]);
      for (let i = 0; i < n; i++) { col[(k * n + i) * 3] = c.r; col[(k * n + i) * 3 + 1] = c.g; col[(k * n + i) * 3 + 2] = c.b; }
    }
    const idx = [];
    for (let k = 0; k < R - 1; k++) {
      for (let i = 0; i < n - 1; i++) {
        const a = k * n + i, b = k * n + i + 1, cc = (k + 1) * n + i, d = (k + 1) * n + i + 1;
        idx.push(a, cc, b, b, cc, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.bellows = new THREE.Mesh(g, this.mats.bellows);
    this.bellows.frustumCulled = false;
    this.bellows.castShadow = true;
    this.front.add(this.bellows);
    // turntable floor plate (rotates with the rear section)
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.03, 40), this.mats.turntable);
    tt.position.set(0, D.floorY + 0.015, this.F.hitchFront);
    this.front.add(tt);
    this.turntable = tt;
    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._lastRel = new Float32Array(16);
    this._relDirty = true;
  },

  updateBellows() {
    const F = this.F;
    const inv = this._tmpM.copy(this.front.matrixWorld).invert();
    const rel = inv.multiply(this.rear.matrixWorld);
    let same = !this._relDirty;
    if (same) for (let i = 0; i < 16; i++) if (Math.abs(rel.elements[i] - this._lastRel[i]) > 1e-6) { same = false; break; }
    if (same) return;
    this._relDirty = false;
    for (let i = 0; i < 16; i++) this._lastRel[i] = rel.elements[i];
    const pos = this.bellows.geometry.attributes.position;
    const n = this.bellowsRing.length;
    const e = (this._euler = this._euler || new THREE.Euler()).setFromRotationMatrix(rel, 'YXZ');
    const phi = e.y;
    const lzF = F.frontEnd - F.hitchFront;
    const lzR = F.rearStart - F.hitchRear;
    const B = this._tmpV;
    const yBase = this.bellowsY0;
    const R = this.bellowsRings;
    for (let i = 0; i < n; i++) {
      const [x, y] = this.bellowsRing[i];
      B.set(x, y, F.rearStart).applyMatrix4(rel);
      const c1 = Math.cos(phi), s1 = Math.sin(phi);
      const ex = B.x - (x * c1 + lzR * s1), ey = B.y - y, ez = B.z - (F.hitchFront - x * s1 + lzR * c1);
      for (let k = 0; k < R; k++) {
        const t = k / (R - 1);
        const d = this.bellowsFold[k];
        const xf = x * (1 - 0.05 * d), yf = yBase + (y - yBase) * (1 - 0.02 * d);
        const lz = lzF + (lzR - lzF) * t;
        const ang = phi * t;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        pos.setXYZ(k * n + i, xf * ca + lz * sa + ex * t, yf + ey * t, F.hitchFront - xf * sa + lz * ca + ez * t);
      }
    }
    pos.needsUpdate = true;
    this.bellows.geometry.computeVertexNormals();
    this.turntable.rotation.y = phi;
  },

  /** Frame closing the body at the bellows end plus the grey side protection plates. */
  endFrame(parts, zEnd, dir) {
    const D = this.D, HW = D.halfW;
    const outer = rectShape(-HW, D.skirtY, HW, D.roofY, 0.22);
    outer.holes.push(rectPath(-1.18, 0.38, 1.18, 2.8, 0.2));
    parts.add('matteBlack', extrude(outer, 0.06, 0), M(0, 0, dir > 0 ? zEnd : zEnd - 0.06));
    for (const s of [1, -1]) parts.add('bellowsPlate', box(0.045, 2.2, 0.16, 0.01), M(s * (HW - 0.025), 1.5, zEnd - dir * 0.08));
  },
};
