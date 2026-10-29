// Geometry helpers for the passenger interior: swept tubes with filleted bends, boxes with metre-scaled UVs,
// decal quads mapped onto the decal sheet, rounded outlines.
import * as THREE from 'three';
import { signUV } from './BusInteriorTextures.js';

/** Replace the corners of a polyline by circular-ish arcs of radius r (quadratic Bezier, n samples). */
export function fillet(points, r, n = 6) {
  if (points.length < 3 || r <= 0) return points.map((p) => p.slice());
  const out = [points[0].slice()];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const va = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vc = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const la = Math.hypot(...va), lc = Math.hypot(...vc);
    const d = Math.min(r, la * 0.5, lc * 0.5);
    const p0 = [b[0] + (va[0] / la) * d, b[1] + (va[1] / la) * d, b[2] + (va[2] / la) * d];
    const p1 = [b[0] + (vc[0] / lc) * d, b[1] + (vc[1] / lc) * d, b[2] + (vc[2] / lc) * d];
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * b[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * b[1] + t * t * p1[1], u * u * p0[2] + 2 * u * t * b[2] + t * t * p1[2]]);
    }
  }
  out.push(points[points.length - 1].slice());
  return out;
}

/** Smooth Catmull-Rom resample of a control polyline into n+1 points (for arches and loops). */
export function smooth(points, n = 12, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  const pts = curve.getSpacedPoints(n).map((v) => [v.x, v.y, v.z]);
  if (closed) pts.pop();
  return pts;
}

/** Tube of radius r swept along a polyline (parallel-transport frames, smooth normals, optional end caps). */
export function sweep(points, r, radial = 8, { closed = false, caps = false } = {}) {
  const n = points.length;
  const pos = [], nrm = [], idx = [];
  const T = [];
  for (let i = 0; i < n; i++) {
    const a = points[closed ? (i + n - 1) % n : Math.max(0, i - 1)], b = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.push(new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize());
  }
  let nv = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    nv = nv.sub(T[i].clone().multiplyScalar(nv.dot(T[i]))).normalize();
    const bv = new THREE.Vector3().crossVectors(T[i], nv).normalize();
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const nx = nv.x * ca + bv.x * sa, ny = nv.y * ca + bv.y * sa, nz = nv.z * ca + bv.z * sa;
      pos.push(points[i][0] + r * nx, points[i][1] + r * ny, points[i][2] + r * nz);
      nrm.push(nx, ny, nz);
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const i2 = (i + 1) % n;
    for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial;
      const a = i * radial + k, b = i * radial + k2, c = i2 * radial + k, d = i2 * radial + k2;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (caps && !closed) {
    for (const [i, s] of [[0, -1], [n - 1, 1]]) {
      const base = pos.length / 3;
      pos.push(points[i][0], points[i][1], points[i][2]);
      nrm.push(T[i].x * s, T[i].y * s, T[i].z * s);
      for (let k = 0; k < radial; k++) {
        const k2 = (k + 1) % radial;
        if (s > 0) idx.push(base, i * radial + k, i * radial + k2);
        else idx.push(base, i * radial + k2, i * radial + k);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** Straight cylinder between two points (open ends optional). */
export function rod(a, b, r, radial = 8, caps = true) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, !caps);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Box whose UVs are in metres * scale on every face (for the speckled rubber floor and risers). */
export function texBox(w, h, d, scale = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] * scale, uv.getY(k) * dims[f][1] * scale);
  }
  return g;
}

/** Plane (w x h) whose UVs address a rectangle of the decal sheet. Faces +z; rotate it afterwards. */
export function decal(w, h, name) {
  const g = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = signUV(name);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

/** Axis-aligned quad in a plane with metre UVs; kind 'x' (normal +-x), 'y', 'z'. Normal toward +axis when pos. */
export function quad(kind, a0, a1, b0, b1, c, up = true, uvScale = 0) {
  // kind 'x': spans z (a) and y (b) at x = c; 'y': spans x (a), z (b) at y = c; 'z': spans x (a), y (b) at z = c
  const g = new THREE.PlaneGeometry(a1 - a0, b1 - b0);
  if (kind === 'x') { g.rotateY(up ? Math.PI / 2 : -Math.PI / 2); g.translate(c, (b0 + b1) / 2, (a0 + a1) / 2); }
  else if (kind === 'y') { g.rotateX(up ? -Math.PI / 2 : Math.PI / 2); g.translate((a0 + a1) / 2, c, (b0 + b1) / 2); }
  else { if (!up) g.rotateY(Math.PI); g.translate((a0 + a1) / 2, (b0 + b1) / 2, c); }
  if (uvScale) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (a1 - a0) * uvScale, uv.getY(i) * (b1 - b0) * uvScale);
  }
  return g;
}

/** Extruded profile (array of [x, y]) along z: smooth-shaded strip with UVs (u = z * uScale, v = arc fraction). */
export function profileStrip(profile, z0, z1, uScale = 1, flip = false) {
  const n = profile.length;
  const pos = [], nrm = [], uv = [], idx = [];
  let total = 0;
  const lens = [0];
  for (let i = 1; i < n; i++) { total += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]); lens.push(total); }
  for (let i = 0; i < n; i++) {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const nx = -ty * (flip ? -1 : 1), ny = tx * (flip ? -1 : 1);
    for (const [k, z] of [[0, z0], [1, z1]]) {
      pos.push(profile[i][0], profile[i][1], z);
      nrm.push(nx, ny, 0);
      uv.push((z - z0) * uScale, lens[i] / total);
      void k;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Flat polygon (array of [x, y]) as a ShapeGeometry with metre UVs. */
export function polyGeo(points, holes = []) {
  const s = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) s.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  return new THREE.ShapeGeometry(s, 4);
}

/**
 * Saloon floor plate: |x| <= xo from z0 to z1 at height y, narrowed to |x| <= hx beside the wheel housings
 * (axle +- hh), so the plate does not run through the wheel arches and show across the tyres.
 */
export function floorPlate(parts, xo, z0, z1, y, axles, hx, hh, key = 'floor') {
  parts.add(key, quad('y', -hx, hx, z0, z1, y, true, 2));
  let a = z0;
  const spans = [];
  for (const az of [...axles].sort((p, q) => p - q)) {
    if (az + hh < z0 || az - hh > z1) continue;
    spans.push([a, Math.max(a, az - hh)]);
    a = Math.min(z1, az + hh);
  }
  spans.push([a, z1]);
  for (const [za, zb] of spans) {
    if (zb - za < 0.02) continue;
    for (const sg of [-1, 1]) parts.add(key, quad('y', sg > 0 ? hx : -xo, sg > 0 ? xo : -hx, za, zb, y, true, 2));
  }
}

/**
 * Keeps the cabin inside the rounded rear corners of the body. Walls, coves and platforms are built to the full
 * cabin width up to the rear wall, but the body's plan corners curve in before it, so their outer ends would poke
 * through the skin. Every vertex behind zFrom is moved forward to limit(|x|, y) (the largest z the inside may
 * reach there) when it lies beyond it. Long panels end up as chords of the convex corner, i.e. inside it; the
 * normals are kept (the moved faces turn by a few degrees at most).
 */
export function clipRear(parts, zFrom, limit) {
  for (const list of parts.map.values()) {
    for (const g of list) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        if (z <= zFrom) continue;
        const zl = limit(Math.abs(p.getX(i)), p.getY(i));
        if (z > zl) p.setZ(i, zl);
      }
    }
  }
}

/** The same at the front end: vertices ahead of zFrom are moved back to limit(|x|, y), the smallest z allowed. */
export function clipFront(parts, zFrom, limit) {
  for (const list of parts.map.values()) {
    for (const g of list) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        if (z >= zFrom) continue;
        const zl = limit(Math.abs(p.getX(i)), p.getY(i));
        if (z < zl) p.setZ(i, zl);
      }
    }
  }
}
