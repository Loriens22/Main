// Stanchions, candy-cane arches, overhead rails, teardrop straps, yellow door poles and barriers,
// validators and stop buttons of one bus section (interior_spec.md section 2).
import * as THREE from 'three';
import { BUS } from './BusSpec.js';
import { SEATS, PODIUMS, PODIUM_Y, AISLE_X, WALL_X } from './BusLayout.js';
import { M, box } from './BusGeom.js';
import { sweep, rod, fillet, smooth, decal } from './BusInteriorGeom.js';

const FY = BUS.floorY;
export const RAIL_Y = 2.48; // overhead rail height (just under the sloped duct, photos 4 and 5)
export const RAIL_X = 0.7; // overhead rail |x|
const YP_X = 1.03; // |x| of the yellow door poles
const R_STAN = 0.02, R_RAIL = 0.019, R_YEL = 0.017;

const CFG = {
  front: {
    L: [-5.0, -3.0, -1.85, -0.45, 0.95],
    R: [-4.3, -3.3, -0.45, 0.95],
    rail: [-5.74, 1.2], // z range of the rails; the front end bends down into a stanchion at the cab bulkhead
    bendFront: true,
  },
  rear: {
    L: [-3.85, -2.35, -0.85, 0.2, 1.15],
    R: [-3.85, -2.95, 0.0],
    rail: [-4.55, 2.15],
    bendFront: false,
  },
};

/** Floor height under a pole at (side, z): the podium top where a podium covers the aisle edge. */
function baseY(sec, side, z) {
  for (const p of PODIUMS) if (p.sec === sec && p.side === side && z > p.z0 && z < p.z1) return PODIUM_Y;
  return FY;
}

export function buildPoles(model, parts, sec) {
  const low = model.quality === 'low';
  const rad = low ? 6 : 10;
  const cfg = CFG[sec];
  const doors = BUS.doors.filter((d) => d.section === sec);
  const seats = SEATS.filter((s) => s.sec === sec);
  // ---- overhead rails (one per side), stays to the duct
  for (const sg of [-1, 1]) {
    const pts = [];
    const [z0, z1] = cfg.rail;
    const x = sg * RAIL_X;
    if (cfg.bendFront) pts.push([x, baseY(sec, sg, z0), z0], [x, RAIL_Y - 0.3, z0], [x, RAIL_Y, z0 + 0.3]);
    else pts.push([x, RAIL_Y, z0]);
    pts.push([x, RAIL_Y, z1]);
    const path = fillet(pts, 0.16, 6);
    parts.add('pole', sweep(path, R_RAIL, rad, { caps: true }));
    for (let z = z0 + 0.9; z < z1 - 0.3; z += 1.6) {
      parts.add('pole', rod([x, RAIL_Y + 0.01, z], [sg * 0.88, 2.71, z + 0.1], 0.011, 6));
      parts.add('pole', box(0.05, 0.03, 0.06), M(x, RAIL_Y + 0.03, z));
    }
  }
  // ---- stanchions with candy-cane arches
  const stan = (sg, z) => {
    const yb = baseY(sec, sg, z);
    const x = sg * (AISLE_X + 0.01);
    parts.add('pole', rod([x, yb, z], [x, 1.98, z], R_STAN, rad));
    // swan neck: outwards and up to the rail collar, on into the duct
    const ctrl = [[0.3, 1.98], [0.3, 2.12], [0.33, 2.26], [0.42, 2.38], [0.56, 2.45], [0.7, RAIL_Y], [0.8, 2.55], [0.88, 2.64], [0.92, 2.72]];
    const arch = smooth(ctrl.map(([ax, ay]) => [sg * ax, ay, z]), low ? 10 : 18);
    parts.add('pole', sweep(arch, 0.016, low ? 5 : 7, { caps: true }));
    parts.add('pole', new THREE.CylinderGeometry(0.03, 0.03, 0.075, 10), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(sg * RAIL_X, RAIL_Y + 0.015, z));
    // black two-bolt clamp beside the seat pan
    const adj = seats.find((s) => Math.sign(s.x) === sg && Math.abs(s.x) < 0.6 && Math.abs(z - (s.z + 0.2 * Math.cos(s.yaw))) < 0.45);
    if (adj) parts.add('frame', box(0.05, 0.09, 0.05), M(x, adj.fy + 0.36, z));
    // straps: a cluster of three narrow teardrop loops on pale sleeve clips
    const nStrap = low ? 2 : 3;
    for (let k = 0; k < nStrap; k++) strap(parts, sg * RAIL_X, z + (k - (nStrap - 1) / 2) * 0.045);
  };
  for (const z of cfg.L) stan(-1, z);
  for (const z of cfg.R) stan(1, z);
  // wheelchair-bay horizontal grab rail with a black foam grip (front section, left wall to the aisle pole)
  if (sec === 'front') {
    parts.add('pole', rod([-AISLE_X - 0.01, 1.0, -3.0], [-WALL_X + 0.02, 1.0, -3.0], 0.016, 8));
    parts.add('frame', rod([-0.55, 1.0, -3.0], [-0.9, 1.0, -3.0], 0.021, 8));
    // white two-LED stop modules on the podium-front poles
    for (const sg of [-1, 1]) {
      parts.add('wall', box(0.04, 0.14, 0.045), M(sg * (AISLE_X + 0.01), PODIUM_Y + 0.14, -0.45 - 0.035));
    }
  }
  // ---- yellow door poles, request-to-open button, validator, barriers
  for (const d of doors) {
    const zl = d.z0 - 0.08, zt = d.z1 + 0.08;
    const front1 = sec === 'front' && d.id === 1;
    // leading pole (candy-cane at door 1: curves towards the aisle at the top)
    if (front1) {
      const path = smooth([[YP_X, FY, zl], [YP_X, 1.9, zl], [YP_X - 0.03, 2.15, zl], [YP_X - 0.22, 2.33, zl], [YP_X - 0.42, 2.4, zl]].map((p) => p), 16);
      parts.add('railYellow', sweep(path, R_YEL, rad, { caps: true }));
    } else {
      parts.add('railYellow', rod([YP_X, FY, zl], [YP_X, 2.64, zl], R_YEL, rad));
    }
    parts.add('railYellow', rod([YP_X, FY, zt], [YP_X, 2.64, zt], R_YEL, rad));
    // request-to-open knob (red) on the leading pole, facing the aisle
    const knob = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 14);
    knob.rotateZ(Math.PI / 2);
    parts.add('stopBtn', knob, M(YP_X - 0.04, 1.05, zl));
    // validator on the trailing pole: bracket + body + colour screen
    parts.add('frame', box(0.07, 0.19, 0.1), M(YP_X - 0.06, 1.17, zt));
    parts.add('frame', box(0.05, 0.03, 0.03), M(YP_X - 0.03, 1.17, zt));
    const sc = decal(0.05, 0.05, 'valScreen');
    sc.rotateY(Math.PI);
    sc.rotateX(-0.5);
    parts.add('signs', sc, M(YP_X - 0.06, 1.23, zt - 0.052));
    // yellow floor edge strip at the sill
    parts.add('stripYellow', box(0.05, 0.004, d.z1 - d.z0), M(WALL_X - 0.02, FY + 0.002, (d.z0 + d.z1) / 2));
    // barrier tubes behind the row in front of the door: two crossing curved yellow bars
    if (sec === 'front' && d.id === 2) {
      const A = smooth([[YP_X, 1.0, zl + 0.03], [0.98, 1.34, zl - 0.04], [0.82, 1.5, zl - 0.1], [0.6, 1.5, zl - 0.17], [0.46, 1.38, zl - 0.2], [0.4, 1.05, zl - 0.2]], 20);
      const B = smooth([[YP_X, 0.78, zl + 0.03], [0.86, 0.96, zl - 0.06], [0.66, 1.1, zl - 0.12], [0.5, 1.16, zl - 0.17]], 14);
      parts.add('railYellow', sweep(A, R_YEL, 8, { caps: true }));
      parts.add('railYellow', sweep(B, R_YEL, 8, { caps: true }));
    }
  }
}

/** One teardrop strap: closed loop of thin webbing in the x-y plane, hanging from a pale sleeve clip on the rail. */
function strap(parts, x, z) {
  const y0 = RAIL_Y - 0.03;
  const R = [[0, 0], [0.012, -0.12], [0.028, -0.26], [0.043, -0.42], [0.038, -0.52], [0.012, -0.57]];
  const loop = [...R, [0, -0.58], ...R.slice(1).reverse().map(([a, b]) => [-a, b])].map(([a, b]) => [x + a, y0 + b, z]);
  parts.add('strap', sweep(smooth(loop, 14, true), 0.0048, 4, { closed: true }));
  parts.add('pole', box(0.022, 0.05, 0.026), M(x, RAIL_Y - 0.03, z));
}
