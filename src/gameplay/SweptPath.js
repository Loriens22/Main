// Ground area swept by the articulated bus when it follows its drive lines
// (both directions, including the terminal links). The front axle follows
// the line; the middle axle and the trailer follow as tractrices, so the
// inside-of-curve cut of the rear section is included. World builders use
// it to keep lamp posts, trees, bins and parked cars off the bus's way.
import { buildDriveLine } from './DriveLine.js';
import { BUS, FRONT_Z, FRONT_BODY_END_Z, REAR_BODY_START_Z, REAR_Z } from '../vehicle/BusSpec.js';

const CELL = 8;

export class SweptPath {
  constructor(route, { margin = 0.45, dirs = ['A', 'B'] } = {}) {
    this.cells = new Map();
    this.margin = margin;
    for (const id of dirs) this.trace(buildDriveLine(route, id));
  }

  key(i, j) {
    return i * 100003 + j;
  }

  addBox(cx, cz, fx, fz, hl, hw) {
    const k = this.key(Math.floor(cx / CELL), Math.floor(cz / CELL));
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    c.push(cx, cz, fx, fz, hl, hw);
  }

  trace(line) {
    const wb1 = BUS.wb1, c = BUS.hitchBehindAxle2, L2 = BUS.wb2 - BUS.hitchBehindAxle2;
    const hw = BUS.halfW + this.margin;
    // front section box relative to axle 2, rear section box relative to axle 3
    const fC = (-FRONT_Z - FRONT_BODY_END_Z) / 2, fHL = (-FRONT_Z + FRONT_BODY_END_Z) / 2 + 0.2;
    const rC = (-REAR_BODY_START_Z - REAR_Z) / 2, rHL = (-REAR_BODY_START_Z + REAR_Z) / 2 + 0.2;
    const p0 = line.at(0), t0 = line.tangent(0, 4);
    let mx = p0.x - t0.tx * wb1, mz = p0.z - t0.tz * wb1;
    let rx = mx - t0.tx * (c + L2), rz = mz - t0.tz * (c + L2);
    let n = 0;
    for (let s = 0; s <= line.length; s += 0.5, n++) {
      const p = line.at(s);
      // middle axle trails the front axle at the wheelbase
      let dx = p.x - mx, dz = p.z - mz, d = Math.hypot(dx, dz) || 1;
      const fx = dx / d, fz = dz / d;
      mx = p.x - fx * wb1;
      mz = p.z - fz * wb1;
      const hx = mx - fx * c, hz = mz - fz * c;
      dx = hx - rx; dz = hz - rz; d = Math.hypot(dx, dz) || 1;
      const gx = dx / d, gz = dz / d;
      rx = hx - gx * L2;
      rz = hz - gz * L2;
      if (s < 2 || n % 2) continue;
      this.addBox(mx + fx * fC, mz + fz * fC, fx, fz, fHL, hw);
      this.addBox(rx + gx * rC, rz + gz * rC, gx, gz, rHL, hw);
    }
  }

  /** True if a disc of radius r at (x, z) intersects the swept area. */
  hits(x, z, r = 0) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++) {
        const c = this.cells.get(this.key(i, j));
        if (!c) continue;
        for (let k = 0; k < c.length; k += 6) {
          const ox = x - c[k], oz = z - c[k + 1];
          const l = ox * c[k + 2] + oz * c[k + 3];
          if (Math.abs(l) > c[k + 4] + r) continue;
          const w = -ox * c[k + 3] + oz * c[k + 2];
          if (Math.abs(w) <= c[k + 5] + r) return true;
        }
      }
    return false;
  }
}
