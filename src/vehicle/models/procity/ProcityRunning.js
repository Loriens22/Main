// Running gear and moving parts of the BMC Procity: steel disc wheels on 275/70 R22.5 tyres (silver dome hub
// caps on the front wheels), twin tyres on the driven rear axle, three double inward-swinging doors.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, Parts, basis, box, extrude, rectPath, rectShape } from '../../BusGeom.js';
import spec from './spec.js';
import { kitWheel } from '../../BusKit.js';

const D = spec.dims, HW = D.halfW;
const DOOR_TOP = 2.42;
const DOOR_FOOT = 0.38;

function mergeFlat(list) {
  const flat = list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    return c;
  });
  return mergeGeometries(flat, false);
}

export const RunningMixin = {
  wheelGeometry() {
    if (this._wheelGeo) return this._wheelGeo;
    const lite = this.lite;
    const seg = lite ? 24 : 44;
    const sq = 0.945;
    const half = [[0.2865, 0.125], [0.3, 0.136], [0.34, 0.142], [0.4, 0.146], [0.44, 0.14], [0.468, 0.118], [0.4775, 0.098], [0.478, 0.09],
      [0.478, 0.082], [0.467, 0.079], [0.467, 0.07], [0.478, 0.067], [0.478, 0.04],
      [0.478, 0.028], [0.467, 0.025], [0.467, 0.016], [0.478, 0.013], [0.478, 0]];
    const prof = half.map(([r, a]) => new THREE.Vector2(r, -a * sq));
    for (const [r, a] of half.slice().reverse().slice(1)) prof.push(new THREE.Vector2(r, a * sq));
    const tyre = new THREE.LatheGeometry(prof, seg);
    tyre.rotateZ(-Math.PI / 2);
    const face = [[0.305, 0.118], [0.305, 0.126], [0.29, 0.128], [0.272, 0.108], [0.258, 0.09], [0.15, 0.086], [0.14, 0.1], [0.128, 0.106], [0.066, 0.106], [0.062, 0.118], [0.0, 0.122]];
    const rim = new THREE.LatheGeometry(face.map(([r, a]) => new THREE.Vector2(r, a)), seg);
    rim.rotateZ(-Math.PI / 2);
    // front hub cap: a raised dome in bright steel (the Procity shows a big silver cap on the front wheels)
    const capPts = [[0.0, 0.205], [0.05, 0.2], [0.1, 0.188], [0.13, 0.168], [0.14, 0.14], [0.14, 0.106]];
    const cap = new THREE.LatheGeometry(capPts.map(([r, a]) => new THREE.Vector2(r, a)), seg);
    cap.rotateZ(-Math.PI / 2);
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
    this._wheelGeo = { tyre, rim, cap, dark: mergeFlat(dark), studs: studs.length ? mergeFlat(studs) : null };
    return this._wheelGeo;
  },

  makeWheel(twin, front) {
    const kw = kitWheel(twin, { kind: 'steel', spacing: 0.31, R: D.wheelR });
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
    if (front) add(geo.cap, m.hub);
    else if (geo.studs) add(geo.studs, m.chrome);
    if (twin) add(geo.tyre, m.tyre, -0.31);
    return g;
  },

  addAxle(section, z, twin, steer) {
    for (const side of [1, -1]) {
      const knuckle = new THREE.Group();
      knuckle.position.set(side * (D.track / 2 + (twin ? 0.02 : 0)), D.wheelR, z);
      const spin = new THREE.Group();
      const w = this.makeWheel(twin, steer);
      if (side < 0) w.rotation.y = Math.PI;
      spin.add(w);
      knuckle.add(spin);
      section.add(knuckle);
      this.wheels.push({ knuckle, spin, steer, side, section: 'front', z });
    }
  },

  /** Double inward-swinging leaves: black frame, large tinted upper pane, small lower pane. */
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
      frame.holes.push(rectPath(-leafW / 2 + 0.045, 0.07, leafW / 2 - 0.045, 0.62, 0.015));
      frame.holes.push(rectPath(-leafW / 2 + 0.045, 0.72, leafW / 2 - 0.045, h - 0.045, 0.015));
      lp.add('black', extrude(frame, 0.035, 0.005), basis([0, 0, -end], [0, 1, 0], [end, 0, 0], [end > 0 ? -0.035 : 0, DOOR_FOOT, cz]));
      for (const [y0, y1] of [[0.07, 0.62], [0.72, h - 0.045]]) {
        const g = new THREE.PlaneGeometry(leafW - 0.09, y1 - y0);
        g.rotateY(Math.PI / 2);
        lp.add('glass', g, M(-0.015, DOOR_FOOT + (y0 + y1) / 2, cz));
      }
      lp.add('black', box(0.045, h, 0.03), M(-0.017, DOOR_FOOT + h / 2, -end * (leafW - 0.012)));
      pivot.add(lp.build(this.mats, { castShadow: false }));
      section.add(pivot);
      leaves.push({ pivot, end });
    }
    this.doorLeaves[d.id] = leaves;
  },
};
