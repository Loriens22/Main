// 2D path utilities in the XZ plane. Heading h: direction = (cos h, sin h) in (x, z).
// "Right" of travel = (-sin h, cos h). Right turns increase h.
import { clamp, wrapAngle } from './util.js';

export class Turtle {
  constructor(x, z, h) { this.pts = [[x, z]]; this.x = x; this.z = z; this.h = h; }
  line(len, step = 2) {
    const n = Math.max(1, Math.ceil(len / step));
    const dx = Math.cos(this.h), dz = Math.sin(this.h);
    for (let i = 1; i <= n; i++) this.pts.push([this.x + (dx * len * i) / n, this.z + (dz * len * i) / n]);
    this.x += dx * len; this.z += dz * len;
    return this;
  }
  /** Arc of given radius; angle in radians, positive = right turn. */
  arc(radius, angle, step = 1) {
    const sgn = Math.sign(angle);
    const rx = -Math.sin(this.h), rz = Math.cos(this.h);
    const cx = this.x + rx * radius * sgn, cz = this.z + rz * radius * sgn;
    const len = Math.abs(angle) * radius;
    const n = Math.max(2, Math.ceil(len / step));
    const a0 = Math.atan2(this.z - cz, this.x - cx);
    for (let i = 1; i <= n; i++) {
      const a = a0 + (angle * i) / n;
      this.pts.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
    }
    const a = a0 + angle;
    this.x = cx + Math.cos(a) * radius; this.z = cz + Math.sin(a) * radius;
    this.h += angle;
    return this;
  }
  build() { return new Polyline(this.pts); }
}

export class Polyline {
  constructor(pts) {
    // drop duplicates
    const clean = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = clean[clean.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) clean.push(p);
    }
    this.pts = clean;
    const n = clean.length;
    this.s = new Float64Array(n);
    this.hd = new Float64Array(n);
    for (let i = 1; i < n; i++) this.s[i] = this.s[i - 1] + Math.hypot(clean[i][0] - clean[i - 1][0], clean[i][1] - clean[i - 1][1]);
    for (let i = 0; i < n - 1; i++) this.hd[i] = Math.atan2(clean[i + 1][1] - clean[i][1], clean[i + 1][0] - clean[i][0]);
    this.hd[n - 1] = this.hd[n - 2] || 0;
    // vertex headings (average of adjacent segments) for smooth interpolation
    this.vh = new Float64Array(n);
    this.vh[0] = this.hd[0];
    for (let i = 1; i < n - 1; i++) this.vh[i] = this.hd[i - 1] + wrapAngle(this.hd[i] - this.hd[i - 1]) / 2;
    this.vh[n - 1] = this.hd[n - 2] || 0;
    this.length = this.s[n - 1];
  }
  _seg(s) {
    let lo = 0, hi = this.pts.length - 1;
    if (s <= 0) return 0;
    if (s >= this.length) return this.pts.length - 2;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    return lo;
  }
  /** Point at arc length s (extrapolates linearly beyond the ends). out = {x, z, h} */
  at(s, out = {}) {
    const i = this._seg(s);
    const p = this.pts[i], q = this.pts[i + 1] || p;
    const L = this.s[i + 1] - this.s[i] || 1;
    const t = (s - this.s[i]) / L;
    out.x = p[0] + (q[0] - p[0]) * t; out.z = p[1] + (q[1] - p[1]) * t;
    // smooth heading between vertex headings
    const tt = clamp(t, 0, 1);
    out.h = this.vh[i] + wrapAngle(this.vh[i + 1] - this.vh[i]) * tt;
    if (s < 0 || s > this.length) out.h = this.hd[i];
    return out;
  }
  /** Offset point: lateral > 0 is to the right of travel. */
  offsetAt(s, lat, out = {}) {
    this.at(s, out);
    out.x += -Math.sin(out.h) * lat; out.z += Math.cos(out.h) * lat;
    return out;
  }
  /**
   * Closest point projection. Returns {s, lat, d, i}. hint: previous segment index for local search.
   */
  project(x, z, hint = -1, win = 60) {
    let lo = 0, hi = this.pts.length - 2;
    if (hint >= 0) { lo = Math.max(0, hint - win); hi = Math.min(this.pts.length - 2, hint + win); }
    let best = Infinity, bs = 0, blat = 0, bi = 0;
    for (let i = lo; i <= hi; i++) {
      const p = this.pts[i], q = this.pts[i + 1];
      const dx = q[0] - p[0], dz = q[1] - p[1];
      const L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - p[0]) * dx + (z - p[1]) * dz) / L2;
      t = clamp(t, 0, 1);
      const px = p[0] + dx * t, pz = p[1] + dz * t;
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < best) {
        best = d2; bi = i;
        bs = this.s[i] + Math.sqrt(L2) * t;
        const L = Math.sqrt(L2);
        blat = ((x - px) * (-dz / L) + (z - pz) * (dx / L));
        // sign: right of travel = (-sin h, cos h) = (-dz, dx)/L
      }
    }
    if (hint >= 0 && (bi === lo && lo > 0 || bi === hi && hi < this.pts.length - 2)) return this.project(x, z, -1);
    return { s: bs, lat: blat, d: Math.sqrt(best), i: bi };
  }
  /** New polyline offset laterally by f(s) (right positive). */
  offset(f, step = 1) {
    const out = [];
    const o = {};
    const n = Math.max(2, Math.ceil(this.length / step));
    for (let k = 0; k <= n; k++) {
      const s = (this.length * k) / n;
      const lat = typeof f === 'function' ? f(s) : f;
      this.offsetAt(s, lat, o);
      out.push([o.x, o.z]);
    }
    return new Polyline(out);
  }
  slice(s0, s1, step = 1) {
    const out = []; const o = {};
    const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step));
    for (let k = 0; k <= n; k++) { this.at(s0 + ((s1 - s0) * k) / n, o); out.push([o.x, o.z]); }
    return new Polyline(out);
  }
  reversed() { return new Polyline(this.pts.slice().reverse()); }
}

/** Joins two straight-ending polylines with a circular fillet of radius R (returns point list). */
export function fillet(aPts, bPts, R, step = 0.8) {
  const A1 = aPts[aPts.length - 1], A0 = aPts[aPts.length - 2];
  const B0 = bPts[0], B1 = bPts[1];
  let dax = A1[0] - A0[0], daz = A1[1] - A0[1]; let l = Math.hypot(dax, daz); dax /= l; daz /= l;
  let dbx = B1[0] - B0[0], dbz = B1[1] - B0[1]; l = Math.hypot(dbx, dbz); dbx /= l; dbz /= l;
  // intersection of the two lines
  const den = dax * dbz - daz * dbx;
  const t = ((B0[0] - A1[0]) * dbz - (B0[1] - A1[1]) * dbx) / den;
  const X = [A1[0] + dax * t, A1[1] + daz * t];
  const ha = Math.atan2(daz, dax), hb = Math.atan2(dbz, dbx);
  const turn = wrapAngle(hb - ha);
  const T = R * Math.tan(Math.abs(turn) / 2);
  const P = [X[0] - dax * T, X[1] - daz * T];
  const Q = [X[0] + dbx * T, X[1] + dbz * T];
  // trim A to before P, B to after Q
  const distAlong = (pt, o, dx, dz) => (pt[0] - o[0]) * dx + (pt[1] - o[1]) * dz;
  // trim only the contiguous tail of A / head of B that lies beyond the tangent points
  let ea = aPts.length; while (ea > 1 && distAlong(aPts[ea - 1], P, dax, daz) > -0.05) ea--;
  let sb = 0; while (sb < bPts.length - 1 && distAlong(bPts[sb], Q, dbx, dbz) < 0.05) sb++;
  const a = aPts.slice(0, ea), b = bPts.slice(sb);
  const sgn = Math.sign(turn);
  const cx = P[0] + -daz * R * sgn, cz = P[1] + dax * R * sgn;
  const a0 = Math.atan2(P[1] - cz, P[0] - cx);
  const n = Math.max(3, Math.ceil((Math.abs(turn) * R) / step));
  const arc = [];
  for (let i = 0; i <= n; i++) { const ang = a0 + (turn * i) / n; arc.push([cx + Math.cos(ang) * R, cz + Math.sin(ang) * R]); }
  return { pts: [...a, ...arc, ...b], X, P, Q, turn };
}
