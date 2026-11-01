// Small geometry helpers of the line 7 landmarks: sloped wall rings between two offset outlines, horizontal
// rings with a hole, discs and sun rays in a vertical plane, fountain jets in the water basins.
import { offsetConvex, orient, pointInPoly, bbox } from '../LandmarkGeometry.js';

/** Inset (d > 0) or outset (d < 0) of an outline, keeping its vertex order. */
export const off = (P, d) => offsetConvex(P, d);

/**
 * Wall ring leaning between outline A at height ya and outline B at yb (same vertex count and order, e.g. two
 * offsets of one outline): one quad per edge facing outwards, uv in metres / tile.
 */
export function loftRing(b, key, A, ya, B, yb, { tw = 4, th = 4, v0 = ya } = {}) {
  A = orient(A);
  B = orient(B);
  const n = A.length / 2;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = A[2 * i], az = A[2 * i + 1], bx = A[2 * j], bz = A[2 * j + 1];
    const cx = B[2 * i], cz = B[2 * i + 1], dx = B[2 * j], dz = B[2 * j + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-3) continue;
    const slant = Math.hypot(yb - ya, Math.hypot((cx + dx) / 2 - (ax + bx) / 2, (cz + dz) / 2 - (az + bz) / 2));
    const k = typeof key === 'function' ? key({ i, ax, az, bx, bz, len: L }) : key;
    if (k) {
      b.quad(k, [bx, ya, bz], [ax, ya, az], [cx, yb, cz], [dx, yb, dz],
        [[(s + L) / tw, (ya - v0) / th], [s / tw, (ya - v0) / th], [s / tw, (ya - v0 + slant) / th], [(s + L) / tw, (ya - v0 + slant) / th]]);
    }
    s += L;
  }
}

/** Horizontal ring between an outer and an inner outline (an overhang soffit, a terrace roof). */
export function capRing(b, key, outer, inner, y, up = true, s = 4) {
  b.cap(key, orient(outer), y, { holes: [orient(inner)], up, s });
}

/** Disc of radius r in the x-y plane of the current frame (facing +z), segments n. */
export function disc(b, key, cx, cy, cz, r, n = 28) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    b.tri(key, [cx, cy, cz], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cz], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cz],
      [0.5, 0.5], [0.5 + Math.cos(a0) / 2, 0.5 + Math.sin(a0) / 2], [0.5 + Math.cos(a1) / 2, 0.5 + Math.sin(a1) / 2]);
  }
}

/** Rays of a sun round (cx, cy) in the x-y plane, from r0 to r1, n rays of width w (facing +z at depth cz). */
export function rays(b, key, cx, cy, cz, r0, r1, n, w) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const ux = Math.cos(a), uy = Math.sin(a), px = -uy * w / 2, py = ux * w / 2;
    const rr = i % 2 ? r1 * 0.82 : r1;
    b.quad(key, [cx + ux * r0 - px, cy + uy * r0 - py, cz], [cx + ux * r0 + px, cy + uy * r0 + py, cz],
      [cx + ux * rr, cy + uy * rr, cz], [cx + ux * rr, cy + uy * rr, cz]);
  }
}

/** Fountain jets on a grid inside a water polygon (flat [x, z, ...]) with its stone rim. */
export function fountain(b, world, poly, { gap = 4.5, h = 3.0, rim = 0.45, jetKey = 'l7jet', rimKey = 'graniteLight' } = {}) {
  const bb = bbox(poly);
  let gy = 0, n = poly.length / 2;
  for (let i = 0; i < n; i++) gy += world.hf.heightAt(poly[2 * i], poly[2 * i + 1]);
  gy /= n;
  b.ring(rimKey, poly, gy - 0.2, gy + rim, { tw: 2, th: 2 });
  let k = 0;
  for (let x = bb.x0 + gap / 2; x < bb.x0 + bb.w; x += gap) {
    for (let z = bb.z0 + gap / 2; z < bb.z0 + bb.d; z += gap) {
      if (!pointInPoly(poly, x, z)) continue;
      const hh = h * (0.7 + ((k++ * 37) % 10) / 22);
      b.cyl(jetKey, x, gy + 0.1, z, 0.09, 0.025, hh, 6);
      b.cyl(jetKey, x, gy + 0.1, z, 0.35, 0.05, 0.35, 8);
    }
  }
  return gy;
}
