// Rear section and tail of the Mercedes-Benz Conecto G. No photograph shows the tail: it is built from the
// typology of rear-engined Mercedes city buses (rounded corners, engine hatch louvres, vertical lamp
// clusters, dark rear window with the route display, step bumper) and from what the side views of ref01 /
// ref03 show (vent louvres on the flanks behind the rear axle, a roof hatch near the tail, a dark box at the
// top corner holding the rear route display).
import * as THREE from 'three';
import { Parts, M, box, surfaceGrid, lerp, clamp, extrude } from './geom.js';
import { hwAt } from './ConectoFront.js';

const RAKE = 0.12;
const CORNER = 0.45;
const ROOF_Y = 2.9;
const state = { rz: 3.59 };

function rearZ(ax, Y) {
  const HW = 1.25, FLAT = HW - CORNER;
  let z = state.rz - (RAKE * (Y - 0.3)) / (ROOF_Y - 0.3);
  if (ax > FLAT) z -= CORNER - Math.sqrt(Math.max(0, CORNER * CORNER - (ax - FLAT) * (ax - FLAT)));
  const t = clamp((Y - 2.6) / 0.3, 0, 1);
  return z - 0.3 * (1 - Math.sqrt(1 - t * t)) * 0.4;
}
function rearPt(x, Y) {
  return [x, rearZ((Math.abs(x) * 1.25) / hwAt(Y), Y)];
}
/** z of the outer rear surface at real lateral position |x| (beyond the side wall: the full corner), height Y. */
export function rearSkinZ(rz, ax, Y) {
  state.rz = rz;
  return rearZ(Math.min(1.25, (ax * 1.25) / hwAt(Y)), Y);
}
/** Where the plan corners begin (top of the rear face). */
export const rearCornerZ = (rz) => rz - RAKE - CORNER;
export function rearPos(x, Y, off = 0) {
  const [px, pz] = rearPt(x, Y);
  if (!off) return [px, Y, pz];
  const e = 0.004;
  const gx = (rearPt(x + e, Y)[1] - rearPt(x - e, Y)[1]) / (2 * e);
  const gy = (rearPt(x, Y + e)[1] - rearPt(x, Y - e)[1]) / (2 * e);
  const l = Math.hypot(gx, gy, 1);
  return [px - (off * gx) / l, Y - (off * gy) / l, pz + off / l];
}
const HALF = (() => {
  const FLAT = 1.25 - CORNER;
  const a = [0, 0.4, 0.8, FLAT];
  const n = 14;
  for (let k = 1; k <= n; k++) a.push(FLAT + CORNER * Math.sin((k / n) * Math.PI / 2));
  return a;
})();
const COLS = [...HALF.slice().reverse().map((x) => -x), ...HALF.slice(1)]; // viewer behind the bus: left = -x
export function rearPatch({ xs, y0, y1, nv = 1, off = 0, uv = [0, 0, 1, 1], scale = false, back = 0 }) {
  const nu = xs.length - 1;
  return surfaceGrid(nu, nv, (u, v) => {
    let x = xs[Math.round(u * nu)];
    const Y = lerp(y0, y1, v);
    if (scale) x *= hwAt(Y) / 1.25;
    const p = rearPos(x, Y, off);
    p[2] -= back;
    return p;
  }, { uvRect: uv });
}
const span = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));

export const RearMixin = {
  buildRear() {
    state.rz = this.F.rearZ;
    const parts = new Parts();
    const L = this.sideBody(parts, 'rear');
    const roofEnd = this.F.rearZ - RAKE - CORNER;
    this.roofBody(parts, L, this.F.rearStart, roofEnd, 'rear');
    this.rearEnd(parts);
    this.endFrame(parts, this.F.rearStart, 1);
    this.addAxle(this.rear, 0, true, false);
    for (const d of this.spec.doors.filter((q) => q.section === 'rear')) this.addDoor(this.rear, d);
    const grp = this.finish(parts);
    this.rear.add(grp);
    this.rearExterior = grp;
  },

  rearEnd(parts) {
    const D = this.D, lite = this.lite;
    const rz = this.F.rearZ;
    // black step bumper (recessed), orange upper body, white top
    parts.add('black', rearPatch({ xs: COLS, y0: D.skirtY, y1: 0.46, nv: 1, back: 0.04 }));
    parts.add('paint', rearPatch({ xs: COLS, y0: 0.46, y1: 2.5, nv: 5, scale: true }));
    parts.add('roof', rearPatch({ xs: COLS, y0: 2.5, y1: 2.78, nv: 2, scale: true }));
    parts.add('roof', rearPatch({ xs: COLS, y0: 2.78, y1: 2.9, nv: 3, scale: true }));
    const roofEnd = rz - RAKE - CORNER;
    const cap = surfaceGrid(COLS.length - 1, 1, (u, v) => {
      const q = COLS[Math.round(u * (COLS.length - 1))];
      const x = (q * hwAt(2.9)) / 1.25;
      const zEdge = rearZ(Math.abs(q), 2.9);
      return [x, 2.9005, lerp(roofEnd - 0.02, zEdge, v)];
    });
    parts.add('roof', cap);
    // engine hatch: black louvre field in a dark frame
    parts.add('black', rearPatch({ xs: span(-0.7, 0.7, 4), y0: 0.82, y1: 1.42, nv: 1, off: 0.003 }));
    parts.add('vent', rearPatch({ xs: span(-0.66, 0.66, 8), y0: 0.86, y1: 1.38, nv: 1, off: 0.005, uv: [0, 0, 1.32 / 0.4, 0.52 / 0.4] }));
    // registration plate below the hatch
    parts.add('plate', rearPatch({ xs: [-0.26, 0.26], y0: 0.58, y1: 0.69, off: 0.006 }));
    parts.add('black', rearPatch({ xs: [-0.28, 0.28], y0: 0.565, y1: 0.705, off: 0.003 }));
    // dark rear window across the top (route display behind its left half)
    parts.add('black', rearPatch({ xs: span(-0.95, 0.95, 8), y0: 1.9, y1: 2.5, nv: 1, off: 0.002, scale: true }));
    const win = () => rearPatch({ xs: span(-0.9, 0.9, 14), y0: 1.95, y1: 2.45, nv: 3, off: 0.005, scale: true });
    parts.add('glassOut', win());
    parts.add('glassIn', win());
    // tail-lamp clusters 0.13 x 0.6 m at both corners
    for (const sg of [1, -1]) {
      const xs = (a, b) => (sg > 0 ? span(a, b, 3) : span(-b, -a, 3));
      parts.add('matteBlack', rearPatch({ xs: xs(1.065, 1.215), y0: 0.88, y1: 1.52, nv: 1, off: 0.002 }));
      parts.add(sg > 0 ? 'indicatorR' : 'indicatorL', rearPatch({ xs: xs(1.075, 1.205), y0: 1.38, y1: 1.5, nv: 1, off: 0.004 }));
      parts.add('tail', rearPatch({ xs: xs(1.075, 1.205), y0: 1.12, y1: 1.38, nv: 2, off: 0.004 }));
      parts.add('brake', rearPatch({ xs: xs(1.075, 1.205), y0: 1.0, y1: 1.12, nv: 1, off: 0.004 }));
      parts.add('reverse', rearPatch({ xs: xs(1.075, 1.205), y0: 0.9, y1: 1.0, nv: 1, off: 0.004 }));
    }
    // vent louvres on the flanks behind the rear axle (ref01: left, low) and a step in the bumper
    for (const side of [1, -1]) {
      parts.add('vent', surfaceGrid(1, 1, (u, v) => [side * (D.halfW + 0.003), lerp(0.62, 1.12, v), lerp(rz - 1.55, rz - 0.75, u)], { flip: side > 0, uvRect: [0, 0, 2.0, 1.2] }));
    }
    if (!lite) parts.add('matteBlack', box(0.2, 0.06, 0.02), M(0, 0.4, rz - 0.03));
    // roof hatch (white, rounded) near the tail
    const hz = roofEnd - 1.3;
    parts.add('roof', box(1.25, 0.1, 1.05, 0.04), M(0, ROOF_Y + 0.045, hz));
    parts.add('vent', surfaceGrid(1, 1, (u, v) => [lerp(0.45, -0.45, u), ROOF_Y + 0.0955, hz + lerp(-0.38, 0.38, v)], { uvRect: [0, 0, 0.9 / 0.4, 0.76 / 0.4] }));
    void extrude;
  },

  /** Route display inside the rear window, left half (seen from behind). */
  buildRearSign(mat) {
    const [px, py, pz] = rearPos(0.5, 2.22, -0.06);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.25), mat);
    m.position.set(px, py, pz);
    m.rotation.x = -RAKE / (ROOF_Y - 0.3);
    this.rear.add(m);
  },
};
