// Brushed-steel stanchions with swan-neck arches, overhead rails with black grab loops, yellow door poles, door
// barriers (grey screen + steel bar), validators and yellow stop buttons of the Yutong saloon (photo ref15).
// Same construction as the BMC Procity's (../procity/ProcityPoles.js).
import * as THREE from 'three';
import spec from './spec.js';
import { M, box } from '../../BusGeom.js';
import { sweep, rod, fillet, smooth } from '../../BusInteriorGeom.js';
import { FY, PODIUM_Y, AISLE_X, WALL_X, podiums, cabPartitionZ, rearWallZ } from './layout.js';
import { signUV } from './YutongInteriorTextures.js';

export const RAIL_Y = 2.5;
export const RAIL_X = 0.7;
const YP_X = 1.01; // |x| of the yellow door poles
const R_STAN = 0.019, R_RAIL = 0.018, R_YEL = 0.017;

/** Plane (w x h) whose UVs address a rectangle of the interior sign sheet. Faces +z; rotate it afterwards. */
export function decal(w, h, name) {
  const g = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = signUV(name);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

function baseY(pods, side, z) {
  for (const p of pods) if (p.side === side && z > p.z0 && z < p.z1) return PODIUM_Y;
  return FY;
}

function strap(parts, x, z) {
  // black triangular grab loop on a sleeve clip
  const y0 = RAIL_Y - 0.03;
  const R = [[0, 0], [0.02, -0.1], [0.045, -0.22], [0.06, -0.33], [0.05, -0.4], [0.02, -0.43]];
  const loop = [...R, [0, -0.44], ...R.slice(1).reverse().map(([a, b]) => [-a, b])].map(([a, b]) => [x + a, y0 + b, z]);
  parts.add('strap', sweep(smooth(loop, 14, true), 0.007, 5, { closed: true }));
  parts.add('strap', box(0.026, 0.05, 0.03), M(x, RAIL_Y - 0.03, z));
}

export function buildPoles(model, parts) {
  const d = spec.dims;
  const low = model.lite;
  const rad = low ? 6 : 10;
  const pods = podiums(d);
  const zCab = cabPartitionZ(d);
  const zRear = rearWallZ(d);
  // ---- overhead rails with stays to the cove
  for (const sg of [-1, 1]) {
    const x = sg * RAIL_X;
    const z0 = zCab + 0.18, z1 = zRear - 1.2;
    const pts = [[x, baseY(pods, sg, z0), z0], [x, RAIL_Y - 0.3, z0], [x, RAIL_Y, z0 + 0.3], [x, RAIL_Y, z1]];
    parts.add('pole', sweep(fillet(pts, 0.16, 6), R_RAIL, rad, { caps: true }));
    for (let z = z0 + 0.9; z < z1 - 0.3; z += 1.6) {
      parts.add('pole', rod([x, RAIL_Y + 0.01, z], [sg * 0.9, 2.64, z + 0.08], 0.011, 6));
      parts.add('pole', box(0.05, 0.03, 0.06), M(x, RAIL_Y + 0.03, z));
    }
  }
  // ---- stanchions with swan-neck arches
  const stan = (sg, z) => {
    const yb = baseY(pods, sg, z);
    const x = sg * (AISLE_X + 0.01);
    parts.add('pole', rod([x, yb, z], [x, 1.98, z], R_STAN, rad));
    const ctrl = [[0.3, 1.98], [0.3, 2.12], [0.33, 2.26], [0.42, 2.38], [0.56, 2.45], [0.7, RAIL_Y], [0.8, 2.56], [0.88, 2.62]];
    parts.add('pole', sweep(smooth(ctrl.map(([ax, ay]) => [sg * ax, ay, z]), low ? 10 : 18), 0.015, low ? 5 : 7, { caps: true }));
    parts.add('pole', new THREE.CylinderGeometry(0.028, 0.028, 0.07, 10), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(sg * RAIL_X, RAIL_Y + 0.015, z));
    // black clamp beside the seat
    parts.add('frame', box(0.05, 0.09, 0.05), M(x, yb + 0.72, z));
    const n = low ? 2 : 3;
    for (let k = 0; k < n; k++) strap(parts, sg * RAIL_X, z + (k - (n - 1) / 2) * 0.05);
  };
  for (const z of [-5.95, -4.2, -1.65, -0.05, 1.5]) stan(-1, z);
  for (const z of [-5.0, -4.3, -0.95, 0.05]) stan(1, z);
  // ---- wheelchair bay: horizontal grab rail, call button and the bay markings
  parts.add('pole', rod([-AISLE_X - 0.01, 0.95, -3.45], [-WALL_X + 0.02, 0.95, -3.45], 0.016, 8));
  parts.add('pole', rod([-AISLE_X - 0.01, 0.34, -3.45], [-AISLE_X - 0.01, 0.95, -3.45], 0.016, 8));
  parts.add('buttonBlue', new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(-WALL_X + 0.03, 0.9, -2.5));
  // ---- doors: yellow poles, stop button, validator, barrier
  for (const dr of spec.doors) {
    const zl = dr.z0 - 0.09, zt = dr.z1 + 0.09;
    const first = dr.id === 1;
    if (first) {
      const path = smooth([[YP_X, FY, zl], [YP_X, 1.9, zl], [YP_X - 0.03, 2.15, zl], [YP_X - 0.22, 2.33, zl], [YP_X - 0.42, 2.4, zl]], 16);
      parts.add('railYellow', sweep(path, R_YEL, rad, { caps: true }));
    } else parts.add('railYellow', rod([YP_X, FY, zl], [YP_X, 2.6, zl], R_YEL, rad));
    parts.add('railYellow', rod([YP_X, FY, zt], [YP_X, 2.6, zt], R_YEL, rad));
    // stop-request button on the leading pole
    const knob = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 14);
    knob.rotateZ(Math.PI / 2);
    parts.add('stopBtn', knob, M(YP_X - 0.04, 1.05, zl));
    // validator beside the trailing pole: black body with blue edge and touch screen
    if (!first) {
      const zv = dr.z1 + 0.22;
      parts.add('validator', box(0.075, 0.3, 0.14, 0.012), M(YP_X - 0.2, 1.22, zv));
      parts.add('validatorBlue', box(0.012, 0.3, 0.14), M(YP_X - 0.2 + 0.044, 1.22, zv));
      const sc = decal(0.11, 0.2, 'valScreen');
      sc.rotateY(-Math.PI / 2);
      parts.add('signs', sc, M(YP_X - 0.2 - 0.0395, 1.25, zv));
      parts.add('pole', rod([YP_X - 0.2, FY, zv + 0.08], [YP_X - 0.2, 1.4, zv + 0.08], 0.017, 8));
      parts.add('pole', rod([YP_X - 0.2, 1.4, zv + 0.08], [YP_X - 0.2, 1.4, zv], 0.012, 6));
    }
    // yellow sill strip
    parts.add('stripYellow', box(0.05, 0.004, dr.z1 - dr.z0), M(WALL_X - 0.02, FY + 0.002, (dr.z0 + dr.z1) / 2));
    // barrier at the leading jamb of doors 2 and 3: grey screen, stainless bar
    if (!first) {
      const zb = dr.z0 - 0.2;
      parts.add('screen', box(0.9, 0.62, 0.02), M(AISLE_X + 0.45 + 0.06, FY + 0.31 + 0.1, zb));
      parts.add('pole', rod([AISLE_X + 0.06, 1.02, zb], [WALL_X - 0.02, 1.02, zb], 0.017, 8));
      parts.add('pole', rod([AISLE_X + 0.06, FY + 0.1, zb], [AISLE_X + 0.06, 1.02, zb], 0.017, 8));
    }
  }
  // yellow stop-request boxes clamped to the stanchions (ref15), lit when a stop is requested
  for (const [sg, z] of [[-1, -5.95], [-1, -4.2], [1, -5.0], [1, -4.3], [1, -0.95], [-1, -1.65], [-1, -0.05], [1, 0.05], [-1, 1.5]]) {
    const x = sg * (AISLE_X + 0.01), y = baseY(pods, sg, z) + 1.15;
    parts.add('stopBtn', box(0.07, 0.13, 0.05, 0.01), M(x, y, z - 0.035));
    parts.add('redPlastic', box(0.035, 0.035, 0.006), M(x, y + 0.02, z - 0.062));
  }
}
