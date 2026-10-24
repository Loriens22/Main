// Outer skin of the front and rear ends of the Yutong ZK6126HGA as functions of (|x|, Y), plus patches that
// conform to them (so decals, lamps and glass follow the rounded corners). z is backwards, S = distance behind
// the front plane (front) or in front of the rear plane (rear).
import { K } from './consts.js';
import { surfaceGrid, lerp, clamp } from '../../BusGeom.js';

const HW = K.hw;

/** Depth S behind the front plane at plan coordinate ax (0..HW) and height Y. */
export function frontS(ax, Y) {
  const R = K.rf, a0 = HW - R;
  let s = 0;
  if (ax > a0) {
    const d = Math.min(ax - a0, R);
    s = R - Math.sqrt(Math.max(0, R * R - d * d));
  }
  s += K.rake * clamp((Y - K.bumperTop) / (K.roofY - K.bumperTop), 0, 1); // raked windscreen and header
  if (Y < 0.6) s += 0.07 * Math.pow(clamp((0.6 - Y) / 0.23, 0, 1), 2); // bumper tucks under
  if (Y > K.winTopY) {
    const d = clamp((Y - K.winTopY) / (K.roofY - K.winTopY), 0, 1);
    s += 0.06 * (1 - Math.sqrt(1 - d * d)); // rounded roof edge
  }
  return s;
}

/** Half width of the body at height Y: constant up to the glazing top, then the rounded roof edge turns inwards. */
export function hwAt(Y) {
  if (Y <= K.winTopY) return HW;
  const d = clamp((Y - K.winTopY) / (K.roofY - K.winTopY), 0, 1);
  return HW - (K.roofY - K.winTopY) * (1 - Math.sqrt(1 - d * d));
}

const fPt = (x, Y) => [x, K.frontZ + frontS((Math.abs(x) * HW) / hwAt(Y), Y)];

/** Point on the front surface pushed `off` metres along the outward normal. */
export function frontPos(x, Y, off = 0) {
  const [px, pz] = fPt(x, Y);
  if (!off) return [px, Y, pz];
  const e = 0.004;
  const gx = (fPt(x + e, Y)[1] - fPt(x - e, Y)[1]) / (2 * e);
  const gy = (fPt(x, Y + e)[1] - fPt(x, Y - e)[1]) / (2 * e);
  const l = Math.hypot(gx, gy, 1);
  return [px + (off * gx) / l, Y + (off * gy) / l, pz - off / l];
}

/** Depth behind the rear plane's reference (z of the surface = rearZ - depth). */
export function rearD(ax, Y) {
  const R = K.rr, a0 = HW - R;
  let d = 0;
  if (ax > a0) {
    const q = Math.min(ax - a0, R);
    d = R - Math.sqrt(Math.max(0, R * R - q * q));
  }
  d += 0.05 * clamp((Y - K.skirtY) / (K.roofY - K.skirtY), 0, 1); // the rear face leans forward slightly
  if (Y > K.winTopY) {
    const t = clamp((Y - K.winTopY) / (K.roofY - K.winTopY), 0, 1);
    d += 0.06 * (1 - Math.sqrt(1 - t * t));
  }
  return d;
}

const rPt = (x, Y) => [x, K.rearZ - rearD((Math.abs(x) * HW) / hwAt(Y), Y)];

/** Point on the rear surface pushed `off` metres along the outward (+z) normal. */
export function rearPos(x, Y, off = 0) {
  const [px, pz] = rPt(x, Y);
  if (!off) return [px, Y, pz];
  const e = 0.004;
  const gx = (rPt(x + e, Y)[1] - rPt(x - e, Y)[1]) / (2 * e);
  const gy = (rPt(x, Y + e)[1] - rPt(x, Y - e)[1]) / (2 * e);
  const l = Math.hypot(gx, gy, 1);
  return [px - (off * gx) / l, Y - (off * gy) / l, pz + off / l];
}

/** x samples from +x (viewer's left at the front) to -x, dense in the corners. */
const halfCols = (R) => {
  const a0 = HW - R;
  const a = [0, 0.25, 0.5, 0.75];
  for (let x = 0.75 + 0.2; x < a0; x += 0.2) a.push(x);
  a.push(a0);
  const n = 14;
  for (let k = 1; k <= n; k++) a.push(a0 + R * Math.sin((k / n) * Math.PI / 2));
  return a;
};
const FH = halfCols(K.rf), RH = halfCols(K.rr);
export const FCOLS = [...FH.slice().reverse(), ...FH.slice(1).map((x) => -x)]; // +x ... -x
export const RCOLS = [...RH.slice().map((x) => -x).reverse(), ...RH.slice(1)]; // -x ... +x (viewer behind the bus)
export const colsBetween = (xl, xr, n) => Array.from({ length: n + 1 }, (_, i) => lerp(xl, xr, i / n));

/**
 * Patch on the front surface. xs run from +x (viewer's left) to -x; y0 / y1 may be functions of x; clip(Y) keeps
 * |x| >= clip (frame pieces beside the glass); xScale(Y) shrinks the columns (glass outline).
 */
export function frontPatch({ xs, y0, y1, nv = 1, rows = null, off = 0, uv = [0, 0, 1, 1], clip = null, clipSign = 1, xScale = null, scale = false }) {
  const fr = rows || Array.from({ length: nv + 1 }, (_, j) => j / nv);
  const nu = xs.length - 1, mv = fr.length - 1;
  const f0 = typeof y0 === 'function' ? y0 : () => y0;
  const f1 = typeof y1 === 'function' ? y1 : () => y1;
  return surfaceGrid(nu, mv, (u, v) => {
    let x = xs[Math.round(u * nu)];
    const Y = lerp(f0(x), f1(x), fr[Math.round(v * mv)]);
    if (xScale) x *= xScale(Y);
    if (scale) x *= hwAt(Y) / HW;
    if (clip) x = clipSign * Math.max(Math.abs(x), clip(Y));
    return frontPos(x, Y, off);
  }, { uvRect: uv });
}

/** Patch on the rear surface; xs ascending (viewer behind the bus: left = -x). */
export function rearPatch({ xs, y0, y1, nv = 1, rows = null, off = 0, uv = [0, 0, 1, 1], back = 0, flip = false, scale = false }) {
  const fr = rows || Array.from({ length: nv + 1 }, (_, j) => j / nv);
  const nu = xs.length - 1, mv = fr.length - 1;
  const f0 = typeof y0 === 'function' ? y0 : () => y0;
  const f1 = typeof y1 === 'function' ? y1 : () => y1;
  return surfaceGrid(nu, mv, (u, v) => {
    let x = xs[Math.round(u * nu)];
    const Y = lerp(f0(x), f1(x), fr[Math.round(v * mv)]);
    if (scale) x *= hwAt(Y) / HW;
    const p = rearPos(x, Y, off);
    p[2] -= back;
    return p;
  }, { uvRect: uv, flip });
}
