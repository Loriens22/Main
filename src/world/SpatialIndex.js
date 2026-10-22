// Uniform grid over 2D segments (building walls, static obstacles) with
// ray casts, point-in-polygon and circle/OBB penetration queries.
import { clamp } from '../core/math.js';

export class SegmentGrid {
  constructor(cell = 24) {
    this.cell = cell;
    this.grid = new Map();
    this.polys = [];
  }

  k(gx, gz) {
    return gx * 73856093 ^ gz * 19349663;
  }

  /** Adds a closed polygon (Float32Array xz pairs). Returns polygon id. */
  addPolygon(pts, data = null) {
    const id = this.polys.length;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
      z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]);
    }
    this.polys.push({ pts, data, box: [x0, z0, x1, z1] });
    // bbox index so points deep inside large footprints are found too
    if (!this.pgrid) this.pgrid = new Map();
    const C = 64;
    for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++)
      for (let gz = Math.floor(z0 / C); gz <= Math.floor(z1 / C); gz++) {
        const key = this.k(gx, gz);
        let a = this.pgrid.get(key);
        if (!a) this.pgrid.set(key, (a = []));
        a.push(id);
      }
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.addSeg(pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1], id);
    }
    return id;
  }

  addSeg(ax, az, bx, bz, id) {
    const c = this.cell;
    const seg = [ax, az, bx, bz, id];
    for (let gx = Math.floor(Math.min(ax, bx) / c); gx <= Math.floor(Math.max(ax, bx) / c); gx++)
      for (let gz = Math.floor(Math.min(az, bz) / c); gz <= Math.floor(Math.max(az, bz) / c); gz++) {
        const key = this.k(gx, gz);
        let a = this.grid.get(key);
        if (!a) this.grid.set(key, (a = []));
        a.push(seg);
      }
  }

  segsNear(x, z, r) {
    const c = this.cell, out = new Set();
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
        const a = this.grid.get(this.k(gx, gz));
        if (a) for (const s of a) out.add(s);
      }
    return out;
  }

  /** Point in polygon id (even-odd). */
  inPoly(id, x, z) {
    const p = this.polys[id];
    if (x < p.box[0] || x > p.box[2] || z < p.box[1] || z > p.box[3]) return false;
    const pts = p.pts, n = pts.length / 2;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[2 * i], zi = pts[2 * i + 1], xj = pts[2 * j], zj = pts[2 * j + 1];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Returns polygon id containing the point or -1. */
  pointInAny(x, z) {
    const a = this.pgrid && this.pgrid.get(this.k(Math.floor(x / 64), Math.floor(z / 64)));
    if (a) for (const id of a) if (this.inPoly(id, x, z)) return id;
    return -1;
  }

  /** Distance along ray (ox,oz)+t*(dx,dz) to the first segment, up to maxT. */
  raycast(ox, oz, dx, dz, maxT) {
    let best = maxT;
    const steps = Math.ceil(maxT / this.cell) + 1;
    const seen = new Set();
    for (let k = 0; k <= steps; k++) {
      const t = Math.min(maxT, k * this.cell);
      for (const s of this.segsNear(ox + dx * t, oz + dz * t, this.cell * 0.75)) {
        if (seen.has(s)) continue;
        seen.add(s);
        const ex = s[2] - s[0], ez = s[3] - s[1];
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const wx = s[0] - ox, wz = s[1] - oz;
        const tt = (wx * ez - wz * ex) / den;
        const uu = (wx * dz - wz * dx) / den;
        if (tt >= 0 && tt < best && uu >= 0 && uu <= 1) best = tt;
      }
      if (best < t) break;
    }
    return best;
  }

  /**
   * Penetration of an oriented box (centre cx,cz; half extents hx (lateral), hz (longitudinal); yaw axes ax,az = forward)
   * against polygon edges. Returns {nx, nz, depth} of the deepest contact or null.
   */
  boxContact(cx, cz, fx, fz, hl, hw) {
    const r = Math.hypot(hl, hw) + 1;
    let best = null;
    const rx = -fz, rz = fx; // right vector
    const corners = [];
    for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) corners.push([cx + fx * hl * a + rx * hw * b, cz + fz * hl * a + rz * hw * b]);
    for (const s of this.segsNear(cx, cz, r)) {
      // segment endpoints inside the box => push box away along nearest box face
      for (const [px, pz] of [[s[0], s[1]], [s[2], s[3]]]) {
        const lx = (px - cx) * fx + (pz - cz) * fz;
        const lz = (px - cx) * rx + (pz - cz) * rz;
        if (Math.abs(lx) < hl && Math.abs(lz) < hw) {
          const pl = hl - Math.abs(lx), pw = hw - Math.abs(lz);
          let nx, nz, depth;
          if (pl < pw) { depth = pl; nx = -fx * Math.sign(lx); nz = -fz * Math.sign(lx); }
          else { depth = pw; nx = -rx * Math.sign(lz); nz = -rz * Math.sign(lz); }
          if (!best || depth > best.depth) best = { nx, nz, depth, px, pz };
        }
      }
      // box corners penetrating the polygon interior side of the segment
      for (const [px, pz] of corners) {
        const ex = s[2] - s[0], ez = s[3] - s[1];
        const L2 = ex * ex + ez * ez || 1e-9;
        const t = clamp(((px - s[0]) * ex + (pz - s[1]) * ez) / L2, 0, 1);
        const qx = s[0] + ex * t, qz = s[1] + ez * t;
        const d = Math.hypot(px - qx, pz - qz);
        if (d < 0.6 && this.inPoly(s[4], px, pz)) {
          const L = Math.sqrt(L2);
          let nx = ez / L, nz = -ex / L;
          // orient normal towards the box centre
          if ((cx - qx) * nx + (cz - qz) * nz < 0) { nx = -nx; nz = -nz; }
          if (!best || d > best.depth) best = { nx, nz, depth: d + 0.02, px, pz };
        }
      }
    }
    return best;
  }
}
