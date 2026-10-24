// Shared helpers of the line 64 landmark builders: ground and surface heights, polyline runs
// (guard rails, bar fences, walls), canvas sign materials that glow at night, and a few
// small street props. Game metres: x east, z south, y up. Local frames are MeshBuilder frames
// (push(x, y, z, yaw): local +z points to (sin yaw, cos yaw), local +x to (cos yaw, -sin yaw)).
import * as THREE from 'three';
import { makeCanvas, toTexture } from '../LandmarkGeometry.js';
import { mulberry32 } from '../../core/rng.js';

export const done = (b, M, x, z, extra) => ({ x, z, meshes: b.meshes(M.m), tris: b.triangles, ...extra });

/** Lowest and mean terrain height under a footprint. */
export function ground(world, pts) {
  let mn = Infinity, mx = -Infinity, sum = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const h = world.hf.heightAt(pts[2 * i], pts[2 * i + 1]);
    mn = Math.min(mn, h); mx = Math.max(mx, h);
    sum += h;
  }
  return { avg: sum / n, min: mn, max: mx };
}

const ROAD_Y = 0.07, KERB = 0.15;
/** Height of the walkable surface at (x, z): carriageway, raised pavement beside a road, or terrain. */
export function topY(world, x, z) {
  const h = world.hf.heightAt(x, z);
  const q = world.roads && world.roads.query(x, z, 14, (p) => !p.minor);
  if (!q) return h;
  const sw = Math.max(q.piece.swLeft || 0, q.piece.swRight || 0, 2.2);
  if (q.d < q.piece.hw) return h + ROAD_Y;
  if (q.d < q.piece.hw + sw) return h + ROAD_Y + KERB;
  return h;
}

/** Nearest point on a polyline (flat [x, z, ...]) to (x, z): {x, z, d, s, tx, tz}. */
export function nearestOn(pts, x, z) {
  let best = null, acc = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { x: px, z: pz, d, s: acc + L * t, tx: dx / L, tz: dz / L };
    acc += L;
  }
  return best;
}

/** Resample a polyline every `step` m: [{x, z, tx, tz, s}] (tangent per point). */
export function resample(pts, step = 3) {
  const out = [];
  let s = 0;
  const n = pts.length / 2;
  const segs = [];
  let total = 0;
  for (let i = 0; i + 1 < n; i++) {
    const L = Math.hypot(pts[2 * i + 2] - pts[2 * i], pts[2 * i + 3] - pts[2 * i + 1]);
    segs.push(L); total += L;
  }
  const cnt = Math.max(1, Math.round(total / step));
  const at = (d) => {
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      if (acc + segs[i] >= d || i === segs.length - 1) {
        const t = segs[i] ? Math.max(0, Math.min(1, (d - acc) / segs[i])) : 0;
        const ax = pts[2 * i], az = pts[2 * i + 1], bx = pts[2 * i + 2], bz = pts[2 * i + 3];
        const L = segs[i] || 1;
        return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / L, tz: (bz - az) / L, s: d };
      }
      acc += segs[i];
    }
  };
  for (let k = 0; k <= cnt; k++) { out.push(at((total * k) / cnt)); s = total; }
  void s;
  out.total = total;
  return out;
}

/** Offset a polyline sideways by `off` m (left of travel, x east / z south => (tz, -tx)); returns flat points. */
export function offsetLine(pts, off, step = 2) {
  const r = resample(pts, step);
  const out = [];
  for (const p of r) out.push(p.x + p.tz * off, p.z - p.tx * off);
  return out;
}

/** Thin box between two ground points: width t, height h above a base following y(x, z). */
export function segBox(b, key, ax, az, bx, bz, y0a, y0b, h, t, o = {}) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 0.02) return;
  const yaw = Math.atan2(-(bz - az), bx - ax);
  const pitch = Math.atan2(y0b - y0a, L);
  if (Math.abs(pitch) < 0.02) {
    b.box(key, (ax + bx) / 2, (y0a + y0b) / 2, (az + bz) / 2, L, h, t, yaw, { tw: o.tw || 1, th: o.th || 1, ...o });
  } else {
    // sloped: a prism along the segment
    b.push((ax + bx) / 2, (y0a + y0b) / 2 + h / 2, (az + bz) / 2, yaw);
    const g = new THREE.BoxGeometry(L, h, t);
    g.rotateZ(pitch);
    b.geo(key, g);
    b.pop();
  }
}

/**
 * Tubular guard rail along a polyline: posts every `spacing`, two or three horizontal rails.
 * o: {h: 1.0, spacing: 2.0, key: 'steel', postKey, y: (x,z)=>height, rails: [0.95, 0.5], r: 0.025, gaps: fn(x,z)->bool(skip)}
 */
export function railRun(b, pts, o = {}) {
  const h = o.h ?? 1.0, sp = o.spacing ?? 2.0, key = o.key || 'steel', pk = o.postKey || key;
  const y = o.y || (() => 0);
  const rails = o.rails || [h - 0.05, h * 0.5];
  const r = resample(pts, sp);
  let prev = null;
  for (const p of r) {
    if (o.gaps && o.gaps(p.x, p.z)) { prev = null; continue; }
    const gy = y(p.x, p.z);
    b.box(pk, p.x, gy - 0.05, p.z, 0.06, h + 0.05, 0.06, 0, {});
    if (prev) for (const ry of rails) segBox(b, key, prev.x, prev.z, p.x, p.z, prev.y + ry, gy + ry, 0.04, 0.04);
    prev = { x: p.x, z: p.z, y: gy };
  }
}

/** Texture-mapped bar fence strip along a polyline (alpha-tested bars): material key must exist in M.m. */
export function barFence(b, key, pts, o = {}) {
  const h = o.h ?? 1.8, y = o.y || (() => 0), tw = o.tw || 2.4;
  const r = resample(pts, o.step || 2.4);
  let u = 0;
  for (let i = 0; i + 1 < r.length; i++) {
    const A = r[i], B = r[i + 1];
    if (o.gaps && (o.gaps(A.x, A.z) || o.gaps(B.x, B.z))) continue;
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const ya = y(A.x, A.z), yb = y(B.x, B.z);
    b.quad(key, [A.x, ya, A.z], [B.x, yb, B.z], [B.x, yb + h, B.z], [A.x, ya + h, A.z], [[u / tw, 0], [(u + L) / tw, 0], [(u + L) / tw, 1], [u / tw, 1]]);
    u += L;
  }
}

/** Posts every `spacing` with caps (fence posts / bollards). */
export function posts(b, key, pts, o = {}) {
  const r = resample(pts, o.spacing || 2.4);
  const y = o.y || (() => 0);
  for (const p of r) {
    if (o.gaps && o.gaps(p.x, p.z)) continue;
    b.box(key, p.x, y(p.x, p.z) - 0.05, p.z, o.w || 0.12, (o.h || 1.9) + 0.05, o.w || 0.12, 0, {});
  }
}

/** Wall (or kerb-high plinth) along a polyline: thickness t, from base to base+h; the cap is the top face. */
export function wallRun(b, key, pts, o = {}) {
  const h = o.h ?? 2.0, t = o.t ?? 0.3, y = o.y || (() => 0), step = o.step || 4;
  const r = resample(pts, step);
  for (let i = 0; i + 1 < r.length; i++) {
    const A = r[i], B = r[i + 1];
    if (o.gaps && (o.gaps(A.x, A.z) || o.gaps(B.x, B.z))) continue;
    segBox(b, key, A.x, A.z, B.x, B.z, y(A.x, A.z) - (o.sink ?? 0.15), y(B.x, B.z) - (o.sink ?? 0.15), h + (o.sink ?? 0.15), t, { tw: o.tw || 2, th: o.th || 2 });
  }
}

// ------------------------------------------------------------------ canvas sign materials
/**
 * A sign material: draw(g, w, h) paints a canvas; the same canvas is the emissive map, so it glows at
 * night (LandmarkMaterials.setNight drives every material in M.night).
 */
export function signMat(M, key, w, h, draw, o = {}) {
  if (M.m[key]) return M.m[key];
  const [c, g] = makeCanvas(w, h);
  draw(g, w, h);
  const map = toTexture(c, { repeat: false, aniso: 8 });
  const mat = new THREE.MeshStandardMaterial({ map, roughness: o.rough ?? 0.5, metalness: o.metal ?? 0.1 });
  if (o.glow !== false) { mat.emissiveMap = map; mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 0; M.night.push(mat); }
  if (o.double) mat.side = THREE.DoubleSide;
  M.m[key] = mat;
  return mat;
}

/** Tiling canvas material (repeat); o.night = a second canvas painter for the emissive map. */
export function tileMat(M, key, w, h, draw, o = {}) {
  if (M.m[key]) return M.m[key];
  const [c, g] = makeCanvas(w, h);
  draw(g, w, h, false);
  const map = toTexture(c, { repeat: true, aniso: o.aniso || 8 });
  const mat = new THREE.MeshStandardMaterial({ map, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0 });
  if (o.alpha) { mat.alphaTest = 0.5; mat.side = THREE.DoubleSide; }
  if (o.night) {
    const [c2, g2] = makeCanvas(w, h);
    o.night(g2, w, h);
    mat.emissiveMap = toTexture(c2, { repeat: true });
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 0;
    M.night.push(mat);
  }
  if (o.offset) { mat.polygonOffset = true; mat.polygonOffsetFactor = -o.offset; mat.polygonOffsetUnits = -o.offset; }
  M.m[key] = mat;
  return mat;
}

/** Rounded rectangle path. */
export function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Text fitted to a width. */
export function fitText(g, text, cx, cy, maxW, size, weight = 700, family = 'Roboto, Arial, "Helvetica Neue", sans-serif') {
  g.font = `${weight} ${size}px ${family}`;
  while (g.measureText(text).width > maxW && size > 8) { size -= 2; g.font = `${weight} ${size}px ${family}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, cx, cy);
}

export { mulberry32 };
