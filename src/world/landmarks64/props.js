// Small reusable props of the line 64 landmarks, built into a MeshBuilder in its current frame:
// ornamental trees (alpha-tested leaf cards), benches, planters, bollards, lamp columns, flag poles,
// ground patches that follow the terrain (paving overlays) and plain signs.
import * as THREE from 'three';
import { makeLeafCard } from '../../render/Textures.js';
import { mulberry32 } from '../../core/rng.js';
import { pointInPoly } from '../LandmarkGeometry.js';

const S = THREE.MeshStandardMaterial;

/** Leaf and bark materials for hand-placed trees (keys l64leaf*, l64bark). */
export function treeMats(M) {
  if (M.l64trees) return;
  M.l64trees = true;
  const leaf = (hue, seed) => new S({ map: makeLeafCard(256, seed, hue), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  M.m.l64leaf = leaf([74, 112, 46], 301);
  M.m.l64leafLight = leaf([104, 138, 58], 302);
  M.m.l64leafDark = leaf([38, 74, 40], 303);
  M.m.l64leafAutumn = leaf([176, 128, 46], 304);
  M.m.l64bark = new S({ color: 0x5f5448, roughness: 0.95 });
}

/**
 * Broad-leaf tree at (x, y, z) in the current frame. s = scale (1 = 7 m tall); leaf = material key.
 * Conifer: stacked crossed cards (cypress / spruce) when o.conifer.
 */
export function tree(b, x, y, z, s = 1, leaf = 'l64leaf', o = {}) {
  const r = mulberry32(Math.floor(Math.abs(x * 13 + z * 7)) + 11);
  if (o.conifer) {
    const H = (o.h || 9) * s, R = (o.r || 1.6) * s;
    b.cyl('l64bark', x, y - 0.1, z, 0.16 * s, 0.1 * s, H * 0.25, 6);
    for (let i = 0; i < 6; i++) {
      const t = i / 6, yy = y + H * (0.1 + t * 0.85), w = R * (1.05 - t * 0.95);
      for (let k = 0; k < 2; k++) {
        const a = (k * Math.PI) / 2 + i * 0.5;
        const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
        b.quad(leaf, [x - dx, yy, z - dz], [x + dx, yy, z + dz], [x + dx, yy + H * 0.24, z + dz], [x - dx, yy + H * 0.24, z - dz]);
      }
    }
    return;
  }
  const th = 2.6 * s, cr = 3.2 * s;
  b.cyl('l64bark', x, y - 0.1, z, 0.2 * s, 0.11 * s, th + 0.6 * s, 7);
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, e = (r() - 0.25) * 1.1, d = (0.2 + r() * 0.55) * cr;
    const cx = x + Math.cos(a) * Math.cos(e) * d, cy = y + th + 0.5 * cr + Math.sin(e) * d * 0.75, cz = z + Math.sin(a) * Math.cos(e) * d;
    const q = (1.3 + r() * 0.5) * s * 1.35, ra = r() * Math.PI, tilt = (r() - 0.5) * 1.0;
    const ux = Math.cos(ra) * q / 2, uz = Math.sin(ra) * q / 2;
    b.quad(leaf, [cx - ux, cy - q * 0.5 * Math.cos(tilt), cz - uz], [cx + ux, cy - q * 0.5 * Math.cos(tilt), cz + uz], [cx + ux, cy + q * 0.5 * Math.cos(tilt), cz + uz], [cx - ux, cy + q * 0.5 * Math.cos(tilt), cz - uz]);
    b.quad(leaf, [cx - uz, cy - q * 0.4, cz + ux], [cx + uz, cy - q * 0.4, cz - ux], [cx + uz, cy + q * 0.4, cz - ux], [cx - uz, cy + q * 0.4, cz + ux]);
  }
}

/** Park bench (wood slats, steel ends), seat facing +z, 1.8 m long. */
export function bench(b, x, y, z, yaw = 0) {
  b.push(x, y, z, yaw);
  b.box('l64wood', 0, 0.42, 0, 1.8, 0.05, 0.42, 0, { tw: 1, th: 1 });
  b.box('l64wood', 0, 0.62, -0.2, 1.8, 0.34, 0.05, 0, { tw: 1, th: 1 });
  for (const s of [-1, 1]) b.box('l64steelDark', s * 0.8, 0, 0, 0.06, 0.42, 0.4, 0, {});
  b.pop();
}

/** Stone planter with a clipped shrub (or a tree if tree=true leaves to the caller). */
export function planter(b, x, y, z, w = 1.4, d = 1.4, yaw = 0) {
  b.push(x, y, z, yaw);
  b.box('l64granite', 0, 0, 0, w, 0.55, d, 0, { tw: 2, th: 2 });
  b.box('l64graniteGreen', 0, 0.55, 0, w - 0.2, 0.05, d - 0.2, 0, {});
  b.pop();
  b.sphere('l64leafShrub', x, y + 0.85, z, Math.min(w, d) * 0.42, 1, 0.8, 1, 8);
}

export function bollard(b, key, x, y, z, h = 0.8, r = 0.07) {
  b.cyl(key, x, y - 0.05, z, r, r, h + 0.05, 8);
}

/** Street lamp column with a curved arm: height h, arm length reaching +z by `arm`. */
export function lampColumn(b, x, y, z, yaw = 0, h = 8, arm = 1.6) {
  b.push(x, y, z, yaw);
  b.cyl('l64steelDark', 0, -0.2, 0, 0.12, 0.07, h + 0.2, 8);
  b.box('l64steelDark', 0, h - 0.1, arm / 2, 0.08, 0.08, arm, 0, {});
  b.box('l64steelDark', 0, h - 0.18, arm, 0.3, 0.1, 0.7, 0, {});
  b.box('l64glow', 0, h - 0.24, arm, 0.22, 0.03, 0.55, 0, { top: false });
  b.pop();
}

/** A flag pole with a flag of width fw (m) facing +z; flagKey = textured material key or null. */
export function flagPole(b, x, y, z, h = 9, flagKey = null, fw = 1.8) {
  b.cyl('l64steel', x, y - 0.1, z, 0.07, 0.04, h + 0.1, 8);
  b.sphere('l64steel', x, y + h + 0.05, z, 0.07, 1, 1, 1, 6);
  if (flagKey) {
    const fh = fw * 0.62;
    b.quad(flagKey, [x, y + h - fh - 0.2, z + 0.02], [x + fw, y + h - fh - 0.2, z + 0.02], [x + fw, y + h - 0.2, z + 0.02], [x, y + h - 0.2, z + 0.02]);
    b.quad(flagKey, [x + fw, y + h - fh - 0.2, z - 0.02], [x, y + h - fh - 0.2, z - 0.02], [x, y + h - 0.2, z - 0.02], [x + fw, y + h - 0.2, z - 0.02]);
  }
}

/**
 * Terrain-following overlay inside a polygon: cells of `step` m whose centres lie inside, lifted by
 * `lift` above y(x, z). UVs are metres / tile. Used for paving over plazas.
 */
export function groundPatch(b, key, poly, y, o = {}) {
  const step = o.step || 3, lift = o.lift ?? 0.03, tile = o.tile || 4;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]); }
  const h = (x, z) => y(x, z) + lift;
  for (let x = x0; x < x1; x += step) for (let z = z0; z < z1; z += step) {
    const xa = x, xb = Math.min(x + step, x1), za = z, zb = Math.min(z + step, z1);
    if (!pointInPoly(poly, (xa + xb) / 2, (za + zb) / 2)) continue;
    if (o.skip && o.skip((xa + xb) / 2, (za + zb) / 2)) continue;
    b.quad(key, [xa, h(xa, zb), zb], [xb, h(xb, zb), zb], [xb, h(xb, za), za], [xa, h(xa, za), za], [[xa / tile, zb / tile], [xb / tile, zb / tile], [xb / tile, za / tile], [xa / tile, za / tile]]);
  }
}

/** Shrub material. */
export function shrubMat(M) {
  if (!M.m.l64leafShrub) M.m.l64leafShrub = new S({ color: 0x3f6a34, roughness: 0.95, flatShading: true });
}
