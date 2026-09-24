// ---------------------------------------------------------------------------
// Lightweight "2.5D" collision world.
//
// Everything a character can bump into is approximated by vertical prisms:
//   box   - yaw-rotated box (walls, floors, stairs, furniture, vehicles)
//   cyl   - vertical cylinder (tree trunks, pillars, rocks, towers)
// plus the terrain heightfield. Characters are vertical capsules resolved as
// circles in XZ against every prism whose vertical span overlaps the body
// above the step height; ground height is the max of terrain and prism tops
// below the feet (+ step-up tolerance). This handles walls, doorways, stairs,
// multi-storey buildings and standing on objects robustly and cheaply.
// A spatial hash (8 m cells) keeps queries local as the world grows.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

let COLLIDER_ID = 1;
const CELL = 8;

export class ColliderSet {
  constructor(terrain = null) {
    this.terrain = terrain;
    this.cells = new Map();
    this.all = new Map();
    this._stamp = 0;
    this.floorY = null; // optional flat floor (dimensions without terrain)
    this.killY = -200;
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  _aabb(c) {
    if (c.type === 'cyl') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
    const ca = Math.abs(Math.cos(c.yaw || 0)), sa = Math.abs(Math.sin(c.yaw || 0));
    const ex = c.hx * ca + c.hz * sa, ez = c.hx * sa + c.hz * ca;
    return [c.x - ex, c.z - ez, c.x + ex, c.z + ez];
  }

  add(desc) {
    const c = { id: COLLIDER_ID++, solid: true, walkable: true, ...desc };
    if (c.type === 'box') {
      c.hx = c.hx ?? c.half?.x; c.hz = c.hz ?? c.half?.z;
      c.cos = Math.cos(c.yaw || 0); c.sin = Math.sin(c.yaw || 0);
    }
    c._cells = [];
    this._insert(c);
    this.all.set(c.id, c);
    return c;
  }

  // Convenience: box from centre/size.
  box(x, y0, z, hx, hy, hz, yaw = 0, extra = {}) {
    return this.add({ type: 'box', x, z, y0, y1: y0 + hy * 2, hx, hz, yaw, ...extra });
  }
  cyl(x, z, y0, y1, r, extra = {}) { return this.add({ type: 'cyl', x, z, y0, y1, r, ...extra }); }

  _insert(c) {
    const [x0, z0, x1, z1] = this._aabb(c);
    c.aabb = [x0, z0, x1, z1];
    const i0 = Math.floor(x0 / CELL), i1 = Math.floor(x1 / CELL), j0 = Math.floor(z0 / CELL), j1 = Math.floor(z1 / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this._key(i, j);
        let cell = this.cells.get(k);
        if (!cell) { cell = []; this.cells.set(k, cell); }
        cell.push(c);
        c._cells.push(k);
      }
    }
  }

  _unhash(c) {
    for (const k of c._cells) {
      const cell = this.cells.get(k);
      if (!cell) continue;
      const i = cell.indexOf(c);
      if (i >= 0) cell.splice(i, 1);
      if (!cell.length) this.cells.delete(k);
    }
    c._cells = [];
  }

  remove(c) {
    if (!c || !this.all.has(c.id)) return;
    this._unhash(c);
    this.all.delete(c.id);
  }

  removeOwner(owner) {
    for (const c of [...this.all.values()]) if (c.owner === owner) this.remove(c);
  }

  // Move/modify a collider after changing x/z/yaw/y0/y1.
  update(c) {
    if (c.type === 'box') { c.cos = Math.cos(c.yaw || 0); c.sin = Math.sin(c.yaw || 0); }
    this._unhash(c);
    this._insert(c);
  }

  query(x, z, r, out = []) {
    out.length = 0;
    const stamp = ++this._stamp;
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cell = this.cells.get(this._key(i, j));
        if (!cell) continue;
        for (const c of cell) {
          if (c._stamp === stamp || c.disabled) continue;
          c._stamp = stamp;
          const a = c.aabb;
          if (x + r < a[0] || x - r > a[2] || z + r < a[1] || z - r > a[3]) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Signed penetration of a circle vs a collider footprint. Returns push vector or null.
  circlePush(c, x, z, r, out) {
    if (c.type === 'cyl') {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const pen = r + c.r - d;
      if (pen <= 0) return null;
      if (d < 1e-6) { out.x = pen; out.z = 0; return out; }
      out.x = (dx / d) * pen; out.z = (dz / d) * pen;
      return out;
    }
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
    let px = lx - qx, pz = lz - qz;
    const d = Math.hypot(px, pz);
    let lpx, lpz;
    if (d > 1e-6) {
      if (d >= r) return null;
      lpx = (px / d) * (r - d); lpz = (pz / d) * (r - d);
    } else {
      const penX = c.hx - Math.abs(lx), penZ = c.hz - Math.abs(lz);
      if (penX < penZ) { lpx = Math.sign(lx || 1) * (penX + r); lpz = 0; }
      else { lpz = Math.sign(lz || 1) * (penZ + r); lpx = 0; }
    }
    // Back to world (inverse rotation).
    out.x = lpx * c.cos + lpz * c.sin;
    out.z = -lpx * c.sin + lpz * c.cos;
    return out;
  }

  // Does the circle overlap the collider footprint (optionally shrunk)?
  overlaps(c, x, z, r) {
    if (c.type === 'cyl') return Math.hypot(x - c.x, z - c.z) < r + c.r;
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
    return Math.hypot(lx - qx, lz - qz) < r;
  }

  terrainHeight(x, z) {
    if (this.terrain) return this.terrain.heightAt(x, z);
    if (this.floorY !== null) return this.floorY;
    return -1e6;
  }

  // Highest walkable surface under a circle at feet height feetY (+stepUp tolerance).
  groundHeight(x, z, r, feetY, stepUp = 0.45, ignoreOwner = null) {
    let g = this.terrainHeight(x, z);
    const list = this.query(x, z, r, _tmpList);
    let hit = null;
    for (const c of list) {
      if (!c.solid || !c.walkable || c.owner === ignoreOwner && ignoreOwner !== null) continue;
      if (c.y1 > feetY + stepUp) continue;
      if (c.y1 <= g) continue;
      if (!this.overlaps(c, x, z, r * 0.6)) continue;
      g = c.y1; hit = c;
    }
    this.lastGroundCollider = hit;
    return g;
  }

  // Lowest ceiling above headY-ish. Returns Infinity if none.
  ceilingHeight(x, z, r, feetY, headY) {
    let ceil = Infinity;
    const list = this.query(x, z, r, _tmpList);
    for (const c of list) {
      if (!c.solid) continue;
      if (c.y0 < feetY + 0.5 || c.y0 > headY + 0.5) continue;
      if (!this.overlaps(c, x, z, r * 0.7)) continue;
      ceil = Math.min(ceil, c.y0);
    }
    return ceil;
  }

  // Resolve a character circle against prisms overlapping [feetY+stepUp, feetY+height].
  resolve(pos, r, height, stepUp = 0.45, ignoreOwner = null, iterations = 3) {
    let hitAny = false;
    for (let it = 0; it < iterations; it++) {
      const list = this.query(pos.x, pos.z, r + 0.1, _tmpList);
      let moved = false;
      for (const c of list) {
        if (!c.solid || (ignoreOwner !== null && c.owner === ignoreOwner)) continue;
        const bottom = pos.y + stepUp, top = pos.y + height;
        if (c.y1 <= bottom || c.y0 >= top) continue;
        const p = this.circlePush(c, pos.x, pos.z, r, _push);
        if (p) { pos.x += p.x; pos.z += p.z; moved = true; hitAny = true; }
      }
      if (!moved) break;
    }
    return hitAny;
  }

  // Ray vs prisms (+terrain). Returns {distance, point, collider} or null.
  raycast(origin, dir, maxDist = 100, filter = null) {
    let best = null;
    // Coarse traversal of hash cells along the ray.
    const steps = Math.ceil(maxDist / (CELL * 0.5));
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * maxDist;
      const x = origin.x + dir.x * t, z = origin.z + dir.z * t;
      const list = this.query(x, z, CELL * 0.75, _tmpList2);
      for (const c of list) {
        if (seen.has(c.id) || !c.solid) continue;
        seen.add(c.id);
        if (filter && !filter(c)) continue;
        const d = rayPrism(c, origin, dir);
        if (d !== null && d <= maxDist && (!best || d < best.distance)) best = { distance: d, collider: c };
      }
      if (best && best.distance < t - CELL) break;
    }
    if (this.terrain) {
      const th = this.terrain.raycast(origin, dir, best ? best.distance : maxDist);
      if (th && (!best || th.distance < best.distance)) best = { distance: th.distance, collider: null, terrain: true };
    }
    if (best) best.point = new THREE.Vector3().copy(origin).addScaledVector(dir, best.distance);
    return best;
  }
}

const _tmpList = [];
const _tmpList2 = [];
const _push = { x: 0, z: 0 };

// Slab test in the prism's local frame.
function rayPrism(c, o, d) {
  if (c.type === 'cyl') {
    const ox = o.x - c.x, oz = o.z - c.z;
    const a = d.x * d.x + d.z * d.z;
    let tmin = -Infinity, tmax = Infinity;
    if (a > 1e-9) {
      const b = 2 * (ox * d.x + oz * d.z), cc = ox * ox + oz * oz - c.r * c.r;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      tmin = (-b - sq) / (2 * a); tmax = (-b + sq) / (2 * a);
    } else if (ox * ox + oz * oz > c.r * c.r) return null;
    const ty0 = (c.y0 - o.y) / d.y, ty1 = (c.y1 - o.y) / d.y;
    const tyMin = Math.min(ty0, ty1), tyMax = Math.max(ty0, ty1);
    if (Math.abs(d.y) < 1e-9) { if (o.y < c.y0 || o.y > c.y1) return null; }
    else { tmin = Math.max(tmin, tyMin); tmax = Math.min(tmax, tyMax); }
    if (tmax < Math.max(tmin, 0)) return null;
    return tmin >= 0 ? tmin : null;
  }
  const dx = o.x - c.x, dz = o.z - c.z;
  const lox = dx * c.cos - dz * c.sin, loz = dx * c.sin + dz * c.cos;
  const ldx = d.x * c.cos - d.z * c.sin, ldz = d.x * c.sin + d.z * c.cos;
  const hy = (c.y1 - c.y0) / 2, cy = (c.y0 + c.y1) / 2;
  const lo = [lox, o.y - cy, loz], ld = [ldx, d.y, ldz], h = [c.hx, hy, c.hz];
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-9) { if (lo[i] < -h[i] || lo[i] > h[i]) return null; continue; }
    let t1 = (-h[i] - lo[i]) / ld[i], t2 = (h[i] - lo[i]) / ld[i];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : null;
}
