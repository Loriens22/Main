// Rear end of the MAN Lion's City G (typology only, no photograph exists):
// white engine cover with a black louvre hatch, plate, small rear window,
// vertical tail-lamp clusters, rear route display, step bumper. Frame: rear
// section, +z backwards, rear face at REAR_Z (3.405).
import * as THREE from 'three';
import { BUS, REAR_Z } from './BusSpec.js';
import { HW, M, box, surfaceGrid, lerp, sstep, clamp } from './BusGeom.js';
import { hwAt } from './BusFront.js';

const RAKE = 0.15; // top edge about 0.15 m forward of the bottom
const CORNER = 0.4; // plan corner radius
const FLAT = HW - CORNER;
export const REAR_ROOF_END = REAR_Z - RAKE - CORNER; // where the plan corners begin at the top (roof extrusion ends here)

/** z of the outer rear surface at plan coordinate ax (0..HW, unscaled) and height Y. */
function rearZ(ax, Y) {
  let z = REAR_Z - (RAKE * (Y - BUS.skirtY)) / (BUS.roofY - BUS.skirtY);
  if (ax > FLAT) z -= CORNER - Math.sqrt(Math.max(0, CORNER * CORNER - (ax - FLAT) * (ax - FLAT)));
  const t = clamp((Y - 2.76) / 0.12, 0, 1);
  return z - 0.12 * (1 - Math.sqrt(1 - t * t));
}

function rearPt(x, Y) {
  return [x, rearZ((Math.abs(x) * HW) / hwAt(Y), Y)];
}

/** Point on the rear surface pushed `off` metres along the outward (+z) normal. */
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
  const a = [0, 0.4, 0.8, FLAT];
  const n = 14;
  for (let k = 1; k <= n; k++) a.push(FLAT + CORNER * Math.sin((k / n) * Math.PI / 2));
  return a;
})();
// viewer behind the bus: left = -x, right = +x
const COLS = [...HALF.slice().reverse().map((x) => -x), ...HALF.slice(1)];

/** Patch on the rear surface; xs ascending (viewer's left to right). */
export function rearPatch({ xs, y0, y1, nv = 1, off = 0, uv = [0, 0, 1, 1], scale = false, back = 0 }) {
  const nu = xs.length - 1;
  return surfaceGrid(nu, nv, (u, v) => {
    let x = xs[Math.round(u * nu)];
    const Y = lerp(y0, y1, v);
    if (scale) x *= hwAt(Y) / HW;
    const p = rearPos(x, Y, off);
    p[2] -= back;
    return p;
  }, { uvRect: uv });
}

const span = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));

export const RearMixin = {
  rearEnd(parts) {
    const lite = this.lite;
    // black step bumper (recessed), white lower body, white upper body with the rounded roof edge
    parts.add('black', rearPatch({ xs: COLS, y0: BUS.skirtY, y1: 0.45, nv: 1, back: 0.04 }));
    parts.add('paint', rearPatch({ xs: COLS, y0: 0.45, y1: 2.76, nv: 4, scale: true }));
    parts.add('paint', rearPatch({ xs: COLS, y0: 2.76, y1: 2.878, nv: 3, scale: true }));
    // flat cap between the roof extrusion and the rear edge
    const cap = surfaceGrid(COLS.length - 1, 1, (u, v) => {
      const q = COLS[Math.round(u * (COLS.length - 1))];
      const x = (q * hwAt(2.878)) / HW;
      const zEdge = rearZ(Math.abs(q), 2.878);
      return [x, 2.879, lerp(REAR_ROOF_END - 0.02, zEdge, v)];
    });
    parts.add('paint', cap);
    // engine hatch: black louvre field 1.3 x 0.5 centred at Y 1.0 in a dark frame
    parts.add('black', rearPatch({ xs: span(-0.68, 0.68, 4), y0: 0.72, y1: 1.28, nv: 1, off: 0.003 }));
    parts.add('louvreDark', rearPatch({ xs: span(-0.65, 0.65, 8), y0: 0.75, y1: 1.25, nv: 1, off: 0.005, uv: [0, 0, 1.3 / 0.4, 0.5 / 0.4] }));
    // registration plate on the hatch
    parts.add('plate', rearPatch({ xs: [-0.27, 0.27], y0: 0.54, y1: 0.69, off: 0.006 }));
    parts.add('black', rearPatch({ xs: [-0.275, 0.275], y0: 0.535, y1: 0.695, off: 0.003 }));
    // small rear window 1.4 x 0.45 (Y 1.95-2.40)
    parts.add('black', rearPatch({ xs: span(-0.74, 0.74, 6), y0: 1.91, y1: 2.44, nv: 1, off: 0.002, scale: true }));
    const win = () => rearPatch({ xs: span(-0.7, 0.7, 14), y0: 1.95, y1: 2.4, nv: 3, off: 0.005, scale: true });
    parts.add('glassOut', win());
    parts.add('glassIn', win());
    // vertical tail-lamp clusters 0.12 x 0.55 at both corners (top at Y 1.5)
    for (const sg of [1, -1]) {
      const xs = (a, b) => (sg > 0 ? span(a, b, 3) : span(-b, -a, 3));
      parts.add('lampFrame', rearPatch({ xs: xs(1.085, 1.225), y0: 0.935, y1: 1.515, nv: 1, off: 0.002 }));
      const key = sg > 0 ? 'indicatorR' : 'indicatorL';
      parts.add(key, rearPatch({ xs: xs(1.095, 1.215), y0: 1.38, y1: 1.5, nv: 1, off: 0.004 }));
      parts.add('tail', rearPatch({ xs: xs(1.095, 1.215), y0: 1.14, y1: 1.38, nv: 2, off: 0.004 }));
      parts.add('brake', rearPatch({ xs: xs(1.095, 1.215), y0: 1.04, y1: 1.14, nv: 1, off: 0.004 }));
      parts.add('reverse', rearPatch({ xs: xs(1.095, 1.215), y0: 0.95, y1: 1.04, nv: 1, off: 0.004 }));
    }
    // step edge and a tow-eye cover
    if (!lite) parts.add('matteBlack', box(0.2, 0.06, 0.02), M(0, 0.4, REAR_Z - 0.03));
    // roof equipment at the tail: flat vented hatch
    const z0 = REAR_ROOF_END - 1.55;
    parts.add('paint', box(1.5, 0.07, 1.25, 0.03), M(0, BUS.roofY + 0.03, z0 - 0.7));
    parts.add('louvreDark', surfaceGrid(1, 1, (u, v) => [lerp(0.55, -0.55, u), BUS.roofY + 0.0675, z0 - 0.7 + lerp(-0.45, 0.45, v)], { uvRect: [0, 0, 1.1 / 0.4, 0.9 / 0.4] }));
  },
};
void sstep;
void THREE;
