// Ground elevation. The near grid (16 m) covers the route corridor; the far
// grid (250 m) covers Sofia valley and Vitosha for the backdrop.
// heightAt() uses the SAME triangle split as the terrain mesh so roads,
// buildings and vehicles sit exactly on the rendered ground.
export const BASE_ELEVATION = 520; // world y = elevation - BASE_ELEVATION

export class Heightfield {
  constructor(dem) {
    this.near = dem.near;
    this.far = dem.far;
    const n = this.near;
    this.xMin = n.x0;
    this.zMin = n.z0;
    this.xMax = n.x0 + (n.nx - 1) * n.dx;
    this.zMax = n.z0 + (n.nz - 1) * n.dx;
  }

  static sampleTri(g, x, z) {
    let fx = (x - g.x0) / g.dx, fz = (z - g.z0) / g.dx;
    fx = Math.max(0, Math.min(g.nx - 1.0001, fx));
    fz = Math.max(0, Math.min(g.nz - 1.0001, fz));
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const h = g.h, nx = g.nx;
    const h00 = h[j * nx + i], h10 = h[j * nx + i + 1], h01 = h[(j + 1) * nx + i], h11 = h[(j + 1) * nx + i + 1];
    // triangles (00,01,10) and (01,11,10): diagonal 01-10
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  inNear(x, z, margin = 0) {
    return x >= this.xMin + margin && x <= this.xMax - margin && z >= this.zMin + margin && z <= this.zMax - margin;
  }

  /** Elevation in world y units. */
  heightAt(x, z) {
    if (this.inNear(x, z)) return Heightfield.sampleTri(this.near, x, z) - BASE_ELEVATION;
    return Heightfield.sampleTri(this.far, x, z) - BASE_ELEVATION;
  }

  /** Surface normal from finite differences. */
  normalAt(x, z, out = { x: 0, y: 1, z: 0 }, e = 2) {
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -hx, ny = 2 * e, nz = -hz;
    const l = Math.hypot(nx, ny, nz);
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }
}
