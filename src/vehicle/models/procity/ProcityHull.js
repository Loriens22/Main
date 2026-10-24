// Outer surface functions of the BMC Procity body: the front face faceS(|x|, Y) (depth behind the bumper plane),
// the rear face rearZ(|x|, Y), the side tumblehome hwAt(Y). Conformal patches (facePatch / rearPatch) place
// decals, lamps and glass exactly on these surfaces, so everything follows the rounded corners.
import { surfaceGrid, pchip, lerp, sstep, clamp } from '../../BusGeom.js';
import spec from './spec.js';

const D = spec.dims;
export const HW = D.halfW;
export const FRONT_Z = -(D.frontOverhang + D.wb1); // front bumper plane (-8.59)
export const REAR_Z = D.rearOverhang; // rear bumper plane (3.5)

/* ------------------------------------------------------------------ front plan outlines */
// lower body (bumper, mask, lamp cheeks): flat centre |x| < 0.86, then the rounded corner module
const sLow = pchip([0.86, 1.0, 1.1, 1.18, 1.23, 1.26, 1.272, HW], [0, 0.006, 0.04, 0.11, 0.2, 0.31, 0.4, 0.52]);
// glazed zone (windscreen and A-pillar corner)
const sUp = pchip([0, 0.95, 1.05, 1.12, 1.18, 1.23, 1.26, HW], [0, 0, 0.012, 0.045, 0.1, 0.18, 0.28, 0.52]);
// LED header (top corners R about 0.28)
const sHdr = pchip([0, 1.0, 1.08, 1.16, 1.22, 1.255, HW], [0, 0, 0.04, 0.13, 0.27, 0.4, 0.52]);

export const FACE = {
  bumperTop: 0.5, // top of the white bumper
  maskTop: 0.9, // top of the black mask (centre)
  bandTop: 1.3, // top of the black base band = bottom of the windscreen
  hdrBot: 2.4, // bottom of the black header (LED sign zone)
  hdrTop: 2.88,
  rake: 0.2, // windscreen leans back by this much over its height
};

export const TUMBLE_IN = 0.015;
export const ROOF_HW = HW - TUMBLE_IN;

/** Half width of the body at height Y (tumblehome to the roof edge, then the roof radius 0.12). */
export function hwAt(Y) {
  if (Y <= 1.3) return HW;
  if (Y <= 2.76) return HW - TUMBLE_IN * clamp((Y - 1.3) / 1.46, 0, 1);
  const d = Math.min(0.12, Y - 2.76);
  return ROOF_HW - 0.12 + Math.sqrt(Math.max(0, 0.0144 - d * d));
}

/** Depth S of the outer front surface at plan coordinate ax (0..HW, unscaled) and height Y. */
export function faceS(ax, Y) {
  const low = ax <= 0.86 ? 0 : sLow(ax);
  if (Y <= 1.1) return low + 0.06 * (1 - sstep(0.32, 0.6, Y)); // the bumper is slightly undercut
  if (Y <= FACE.bandTop) return lerp(low, sUp(ax), sstep(1.1, FACE.bandTop, Y)) + 0.02 * sstep(1.1, FACE.bandTop, Y);
  if (Y < FACE.hdrBot) return sUp(ax) + 0.02 + (FACE.rake - 0.02) * (Y - FACE.bandTop) / (FACE.hdrBot - FACE.bandTop);
  const t = clamp((Y - 2.78) / 0.1, 0, 1);
  return sHdr(ax) + 0.04 + (FACE.rake - 0.02) + 0.07 * (Y - FACE.hdrBot) / (FACE.hdrTop - FACE.hdrBot) + 0.09 * (1 - Math.sqrt(1 - t * t));
}

/** Surface point [x, z] at real lateral position x. */
export function facePt(x, Y) {
  const ax = (Math.abs(x) * HW) / hwAt(Y);
  return [x, FRONT_Z + faceS(ax, Y)];
}

/** Point on the surface pushed `off` metres along the outward normal. */
export function facePos(x, Y, off = 0) {
  const [px, pz] = facePt(x, Y);
  if (!off) return [px, Y, pz];
  const e = 0.004;
  const gx = (facePt(x + e, Y)[1] - facePt(x - e, Y)[1]) / (2 * e);
  const gy = (facePt(x, Y + e)[1] - facePt(x, Y - e)[1]) / (2 * e);
  const l = Math.hypot(gx, gy, 1);
  return [px + (off * gx) / l, Y + (off * gy) / l, pz - off / l];
}

/** x samples from the +x side wall (viewer's left) to -x, dense in the corners. */
const HALF = (() => {
  const a = [0, 0.3, 0.6, 0.86, 0.95];
  const n = 16;
  for (let k = 1; k <= n; k++) a.push(0.95 + (HW - 0.95) * Math.sin((k / n) * Math.PI / 2));
  return a;
})();
export const COLS = [...HALF.slice().reverse(), ...HALF.slice(1).map((x) => -x)];
export const colsBetween = (xl, xr, n) => Array.from({ length: n + 1 }, (_, i) => lerp(xl, xr, i / n));

/**
 * Patch conforming to the front surface. xs run from the viewer's left (+x) to the right;
 * y0 / y1 may be functions of x; scale=true treats xs as plan coordinates scaled by the tumblehome.
 */
export function facePatch({ xs, y0, y1, nv = 1, rows = null, off = 0, uv = [0, 0, 1, 1], scale = false, clip = null, clipSign = 1 }) {
  const fr = rows || Array.from({ length: nv + 1 }, (_, j) => j / nv);
  const nu = xs.length - 1, mv = fr.length - 1;
  const f0 = typeof y0 === 'function' ? y0 : () => y0;
  const f1 = typeof y1 === 'function' ? y1 : () => y1;
  return surfaceGrid(nu, mv, (u, v) => {
    let x = xs[Math.round(u * nu)];
    const Y = lerp(f0(x), f1(x), fr[Math.round(v * mv)]);
    if (scale) x *= hwAt(Y) / HW;
    if (clip) x = clipSign * Math.max(Math.abs(x), clip(Y));
    return facePos(x, Y, off);
  }, { uvRect: uv });
}

/* ------------------------------------------------------------------ rear face */
const RAKE = 0.12; // top edge about 0.12 m forward of the bottom
const CORNER = 0.45; // plan corner radius
const FLAT = HW - CORNER;
export const REAR_ROOF_END = REAR_Z - RAKE - CORNER; // where the plan corners begin at the top

/** z of the outer rear surface at plan coordinate ax (0..HW, unscaled) and height Y. */
export function rearZ(ax, Y) {
  let z = REAR_Z - (RAKE * (Y - D.skirtY)) / (D.roofY - D.skirtY);
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

const RHALF = (() => {
  const a = [0, 0.4, 0.8, FLAT];
  const n = 14;
  for (let k = 1; k <= n; k++) a.push(FLAT + CORNER * Math.sin((k / n) * Math.PI / 2));
  return a;
})();
// viewer behind the bus: left = -x, right = +x
export const RCOLS = [...RHALF.slice().reverse().map((x) => -x), ...RHALF.slice(1)];

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

export const span = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
