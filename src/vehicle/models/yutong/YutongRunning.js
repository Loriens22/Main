// Running gear and moving parts of the Yutong ZK6126HGA: steel disc wheels on 255/70 R22.5 tyres (twin
// tyres on the driven axle), inward-swinging double doors, windscreen wipers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { K } from './consts.js';
import { M, Parts, basis, box, extrude, rectPath, rectShape } from '../../BusGeom.js';
import { rod } from '../../BusInteriorGeom.js';
import { frontPos, frontS } from './surfaces.js';
import { decUV } from './YutongTextures.js';
import { kitWheel } from '../../BusKit.js';

const HW = K.hw;
const DOOR_TOP = 2.38; // top of the leaves
const DOOR_FOOT = 0.4; // bottom of the leaves, just above the threshold

function mergeFlat(list) {
  const flat = list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    return c;
  });
  return mergeGeometries(flat, false);
}

export const RunningMixin = {
  /** Wheel geometry, built once per bus and shared by every wheel mesh. */
  wheelGeometry() {
    if (this._wheelGeo) return this._wheelGeo;
    const lite = this.lite;
    const seg = lite ? 24 : 40;
    const R = K.wheelR, k = R / 0.465;
    // tyre half-section (r, axial offset): sidewall, shoulder and a grooved tread
    const half = [[0.2858, 0.115], [0.3, 0.126], [0.34, 0.131], [0.4, 0.135], [0.44, 0.128], [0.458, 0.108], [0.465, 0.088], [0.465, 0.078],
      [0.455, 0.074], [0.455, 0.064], [0.465, 0.06], [0.465, 0.034], [0.455, 0.03], [0.455, 0.02], [0.465, 0.016], [0.465, 0]];
    const prof = half.map(([r, a]) => new THREE.Vector2(r * k, -a));
    for (const [r, a] of half.slice().reverse().slice(1)) prof.push(new THREE.Vector2(r * k, a));
    const tyre = new THREE.LatheGeometry(prof, seg);
    tyre.rotateZ(-Math.PI / 2);
    // steel disc wheel, outer face towards +x
    const face = [[0.2858, 0.112], [0.2858, 0.12], [0.272, 0.122], [0.256, 0.104], [0.244, 0.088], [0.15, 0.084], [0.14, 0.098], [0.126, 0.104], [0.066, 0.104], [0.062, 0.116], [0, 0.12]];
    const rim = new THREE.LatheGeometry(face.map(([r, a]) => new THREE.Vector2(r, a)), seg);
    rim.rotateZ(-Math.PI / 2);
    const back = new THREE.CircleGeometry(0.28, 24);
    back.rotateY(-Math.PI / 2);
    back.translate(-0.09, 0, 0);
    const dark = [back], studs = [];
    for (let i = 0; i < 10; i++) {
      const phi = (i / 10) * Math.PI * 2 + 0.15;
      const hole = new THREE.CircleGeometry(1, 12);
      hole.scale(0.016, 0.031, 1);
      hole.rotateY(Math.PI / 2);
      hole.translate(0.092, 0.2, 0);
      hole.rotateX(phi);
      dark.push(hole);
      if (!lite) {
        const nut = new THREE.CylinderGeometry(0.014, 0.014, 0.018, 6);
        nut.rotateZ(-Math.PI / 2);
        nut.translate(0.113, 0.097, 0);
        nut.rotateX(phi);
        studs.push(nut);
      }
    }
    this._wheelGeo = { tyre, rim, dark: mergeFlat(dark), studs: studs.length ? mergeFlat(studs) : null };
    return this._wheelGeo;
  },

  makeWheel(twin) {
    // polished aluminium wheels with loose-nut indicators (ref12)
    const kw = kitWheel(twin, { kind: 'alu', spacing: 0.3, R: K.wheelR });
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
    if (geo.studs) add(geo.studs, m.chrome);
    if (twin) add(geo.tyre, m.tyre, -0.3);
    return g;
  },

  addWheels() {
    const axle = (z, steer, twin) => {
      for (const side of [1, -1]) {
        const knuckle = new THREE.Group();
        knuckle.position.set(side * (twin ? 1.0 : 1.03), K.wheelR, z);
        const spin = new THREE.Group();
        const w = this.makeWheel(twin);
        if (side < 0) w.rotation.y = Math.PI;
        spin.add(w);
        knuckle.add(spin);
        this.front.add(knuckle);
        this.wheels.push({ knuckle, spin, steer, side, section: 'front', z });
      }
    };
    axle(K.axleF, true, false);
    axle(K.axleR, false, true);
  },

  /** Double inward-swinging leaves (black frame, upper and lower pane); the portal is part of the body. */
  addDoor(section, d) {
    const w = d.z1 - d.z0;
    const leafW = w / 2 - 0.005;
    const h = DOOR_TOP - DOOR_FOOT;
    const leaves = [];
    for (const end of [-1, 1]) {
      const hingeZ = end < 0 ? d.z0 : d.z1;
      const pivot = new THREE.Group();
      pivot.position.set(HW - 0.05, 0, hingeZ);
      const lp = new Parts();
      const cz = -end * (leafW / 2);
      const frame = rectShape(-leafW / 2, 0, leafW / 2, h, 0.025);
      frame.holes.push(rectPath(-leafW / 2 + 0.05, 0.06, leafW / 2 - 0.05, 0.7, 0.015));
      frame.holes.push(rectPath(-leafW / 2 + 0.05, 0.78, leafW / 2 - 0.05, h - 0.05, 0.015));
      lp.add('black', extrude(frame, 0.035, 0.005), basis([0, 0, -end], [0, 1, 0], [end, 0, 0], [end > 0 ? -0.035 : 0, DOOR_FOOT, cz]));
      for (const [y0, y1] of [[0.06, 0.7], [0.78, h - 0.05]]) {
        const g = new THREE.PlaneGeometry(leafW - 0.1, y1 - y0);
        g.rotateY(Math.PI / 2);
        lp.add(d.id === 1 ? 'glassClear' : 'glassDoor', g, M(-0.015, DOOR_FOOT + (y0 + y1) / 2, cz));
      }
      // rubber seal at the meeting stile, the two round sensor buttons on the stiles
      lp.add('black', box(0.045, h, 0.03), M(-0.017, DOOR_FOOT + h / 2, -end * (leafW - 0.012)));
      if (!this.lite) {
        for (const y of [1.4, 1.3]) lp.add('matteBlack', new THREE.CylinderGeometry(0.014, 0.014, 0.012, 8).rotateZ(Math.PI / 2), M(0.004, DOOR_FOOT + y, -end * (leafW - 0.06)));
      }
      if (d.id === 1) {
        // two crossing grab rails behind the glass of the front door (visible in the photo through the leaves)
        const s = -end;
        lp.add('pole', rod([-0.06, DOOR_FOOT + 1.55, cz + s * 0.2], [-0.06, DOOR_FOOT + 1.05, cz - s * 0.2], 0.014, 6));
        lp.add('pole', rod([-0.06, DOOR_FOOT + 0.95, cz + s * 0.2], [-0.06, DOOR_FOOT + 0.45, cz - s * 0.2], 0.014, 6));
        // red notice on the glass
        const g = new THREE.PlaneGeometry(0.2, 0.1);
        g.rotateY(Math.PI / 2);
        const uv = decUV('doorNote'), a = g.attributes.uv;
        for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
        lp.add('decals', g, M(0.022, DOOR_FOOT + 1.82, cz));
      }
      pivot.add(lp.build(this.mats, { castShadow: false }));
      section.add(pivot);
      leaves.push({ pivot, end });
    }
    this.doorLeaves[d.id] = leaves;
  },

  /** Tandem wipers: pivots on the base of the windscreen, parked horizontally. */
  buildWipers() {
    this.wipers = [];
    const defs = [
      { x: 0.55, y: 1.22, len: 0.9, park: Math.PI, sweep: -1 },
      { x: -0.45, y: 1.22, len: 0.9, park: Math.PI, sweep: -1 },
    ];
    const rake = Math.atan(K.rake / (K.roofY - K.bumperTop));
    for (const dd of defs) {
      const tilt = new THREE.Group();
      const zArm = frontPos(dd.x, dd.y, 0.034)[2];
      tilt.position.set(dd.x, dd.y, zArm);
      tilt.rotation.x = rake;
      const L = dd.len;
      const p = new Parts();
      p.add('satin', box(L, 0.02, 0.014), M(L / 2, 0, 0));
      p.add('satin', box(L * 0.82, 0.016, 0.024), M(L * 0.6, -0.022, -0.004));
      p.add('satin', new THREE.CylinderGeometry(0.026, 0.026, 0.034, 12).rotateX(Math.PI / 2), M(0, 0, 0));
      const piv = new THREE.Group();
      piv.add(p.build(this.mats, { castShadow: false, receiveShadow: false }));
      piv.rotation.z = dd.park;
      tilt.add(piv);
      this.front.add(tilt);
      this.wipers.push({ piv, park: dd.park, sweep: dd.sweep });
    }
    void frontS;
  },
};
