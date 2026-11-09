/** 2D polyline / Catmull-Rom helpers used for roads, routes and GPS. Points are [x, z]. */
export type P2 = [number, number];

export function catmullRom(points: P2[], spacing = 4): P2[] {
  if (points.length < 2) return points.slice();
  const out: P2[] = [];
  const pts = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(len / spacing));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export function polylineLength(p: P2[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
}

export interface Projection {
  dist: number; // distance from point to polyline
  along: number; // arc length position of the closest point
  seg: number;
  t: number;
  x: number;
  z: number;
}

/** Closest point on polyline (brute force with optional segment hint window). */
export function project(p: P2[], x: number, z: number, cum?: Float64Array): Projection {
  let best: Projection = { dist: Infinity, along: 0, seg: 0, t: 0, x: 0, z: 0 };
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const ax = p[i - 1][0], az = p[i - 1][1];
    const bx = p[i][0], bz = p[i][1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t, cz = az + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    const L = Math.sqrt(l2);
    if (d < best.dist) best = { dist: d, along: (cum ? cum[i - 1] : acc) + t * L, seg: i - 1, t, x: cx, z: cz };
    acc += L;
  }
  return best;
}

export function cumulative(p: P2[]): Float64Array {
  const c = new Float64Array(p.length);
  for (let i = 1; i < p.length; i++) c[i] = c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return c;
}

/** Point at arc length s. */
export function pointAt(p: P2[], cum: Float64Array, s: number): { x: number; z: number; dirX: number; dirZ: number } {
  const total = cum[cum.length - 1];
  s = Math.max(0, Math.min(total, s));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const L = cum[hi] - cum[lo] || 1e-9;
  const t = (s - cum[lo]) / L;
  const dx = p[hi][0] - p[lo][0], dz = p[hi][1] - p[lo][1];
  const dl = Math.hypot(dx, dz) || 1;
  return { x: p[lo][0] + dx * t, z: p[lo][1] + dz * t, dirX: dx / dl, dirZ: dz / dl };
}
