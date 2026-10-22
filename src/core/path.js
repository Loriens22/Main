// Arc-length parameterised polyline in the XZ plane with fast nearest-point queries.
import { clamp } from './math.js';

export class PathSampler {
  /** @param {Array<[number,number]>} pts */
  constructor(pts) {
    this.x = new Float64Array(pts.length);
    this.z = new Float64Array(pts.length);
    this.s = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      this.x[i] = pts[i][0];
      this.z[i] = pts[i][1];
      if (i > 0) this.s[i] = this.s[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    }
    this.n = pts.length;
    this.length = this.s[this.n - 1];
    // coarse grid index for nearest queries
    this.cell = 50;
    this.grid = new Map();
    for (let i = 0; i < this.n - 1; i++) {
      const x0 = Math.min(this.x[i], this.x[i + 1]), x1 = Math.max(this.x[i], this.x[i + 1]);
      const z0 = Math.min(this.z[i], this.z[i + 1]), z1 = Math.max(this.z[i], this.z[i + 1]);
      for (let gx = Math.floor(x0 / this.cell); gx <= Math.floor(x1 / this.cell); gx++)
        for (let gz = Math.floor(z0 / this.cell); gz <= Math.floor(z1 / this.cell); gz++) {
          const k = gx * 73856093 ^ gz * 19349663;
          let a = this.grid.get(k);
          if (!a) this.grid.set(k, (a = []));
          a.push(i);
        }
    }
  }

  index(s) {
    s = clamp(s, 0, this.length);
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.s[m] <= s) lo = m; else hi = m;
    }
    return lo;
  }

  /** Position and unit tangent at arc length s. out = {x,z,tx,tz,i} */
  at(s, out = {}) {
    const i = this.index(s);
    const j = Math.min(i + 1, this.n - 1);
    const L = this.s[j] - this.s[i] || 1;
    const t = clamp((s - this.s[i]) / L, 0, 1);
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t;
    out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
    const dx = this.x[j] - this.x[i], dz = this.z[j] - this.z[i];
    const d = Math.hypot(dx, dz) || 1;
    out.tx = dx / d;
    out.tz = dz / d;
    out.i = i;
    return out;
  }

  /** Smoothed tangent (averaged over a window) — avoids heading snaps at vertices. */
  tangent(s, win = 4, out = {}) {
    const a = this.at(s - win, {}), b = this.at(s + win, {});
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
    out.tx = dx / d;
    out.tz = dz / d;
    return out;
  }

  /** Nearest point on path. Optional hint s0 & window restrict the search (for tracking). */
  nearest(x, z, s0 = null, window = 120) {
    let best = { d2: Infinity, s: 0, i: 0, side: 0 };
    const test = (i) => {
      const ax = this.x[i], az = this.z[i], bx = this.x[i + 1], bz = this.z[i + 1];
      const dx = bx - ax, dz = bz - az;
      const L2 = dx * dx + dz * dz || 1e-9;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
      const px = ax + dx * t, pz = az + dz * t;
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < best.d2) {
        // cross > 0 => point lies to the RIGHT of travel direction (x east, z south)
        const cross = dx * (z - az) - dz * (x - ax);
        best = { d2, s: this.s[i] + Math.sqrt(L2) * t, i, side: Math.sign(cross) };
      }
    };
    if (s0 !== null) {
      const i0 = this.index(s0 - window), i1 = this.index(s0 + window);
      for (let i = i0; i <= Math.min(i1, this.n - 2); i++) test(i);
    } else {
      const gx = Math.floor(x / this.cell), gz = Math.floor(z / this.cell);
      for (let r = 0; r <= 4 && best.d2 === Infinity; r++) {
        for (let ix = gx - r; ix <= gx + r; ix++)
          for (let iz = gz - r; iz <= gz + r; iz++) {
            const a = this.grid.get(ix * 73856093 ^ iz * 19349663);
            if (a) for (const i of a) test(i);
          }
        if (best.d2 !== Infinity && r === 0) {
          // also check ring 1 to be safe near cell borders
          for (let ix = gx - 1; ix <= gx + 1; ix++)
            for (let iz = gz - 1; iz <= gz + 1; iz++) {
              const a = this.grid.get(ix * 73856093 ^ iz * 19349663);
              if (a) for (const i of a) test(i);
            }
        }
      }
      if (best.d2 === Infinity) for (let i = 0; i < this.n - 1; i++) test(i);
    }
    best.d = Math.sqrt(best.d2);
    return best;
  }

  /** Signed curvature (1/m) estimated around s; positive = left turn. */
  curvature(s, win = 8) {
    const a = this.tangent(s - win, 4), b = this.tangent(s + win, 4);
    const cross = a.tx * b.tz - a.tz * b.tx; // >0 => turning right in x-east/z-south
    const dot = a.tx * b.tx + a.tz * b.tz;
    return -Math.atan2(cross, dot) / (2 * win);
  }
}
