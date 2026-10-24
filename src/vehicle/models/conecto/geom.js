// Geometry helpers of the Conecto G model (copies / adaptations of the generic helpers so that
// nothing here depends on the MAN constants in BusSpec.js).
import * as THREE from 'three';

export { Parts, M, box, cyl, surfaceGrid, loftRings, extrude, rectPath, rectShape, pchip, lerp, clamp, sstep, superEllipsoid, tiltBox, basis, sweep as ellSweep } from '../../BusGeom.js';

/** Replace the corners of a polyline by quadratic-Bezier arcs of radius r. */
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

/** Smooth Catmull-Rom resample of a control polyline into n+1 points. */
export function smooth(points, n = 12, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  const pts = curve.getSpacedPoints(n).map((v) => [v.x, v.y, v.z]);
  if (closed) pts.pop();
  return pts;
}

/** Tube of radius r swept along a polyline (parallel-transport frames, smooth normals, optional end caps). */
export function tube(points, r, radial = 8, { closed = false, caps = false } = {}) {
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

/** Straight cylinder between two points. */
export function rod(a, b, r, radial = 8, caps = true) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, !caps);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Box whose UVs are in metres * scale on every face. */
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

/** Axis-aligned quad in a plane with metre UVs. kind 'x' spans z (a) and y (b) at x = c; 'y' spans x (a), z (b); 'z' spans x (a), y (b). */
export function quad(kind, a0, a1, b0, b1, c, up = true, uvScale = 0) {
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

/** Extruded profile (array of [x, y]) along z with smooth normals and metre UVs. */
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
    for (const z of [z0, z1]) {
      pos.push(profile[i][0], profile[i][1], z);
      nrm.push(nx, ny, 0);
      uv.push((z - z0) * uScale, lens[i] / total);
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

/** Side skirt shape (in the s-y plane) between s0..s1 with circular wheel-arch cut-outs; y0 bottom, y1 top (a number or a function of s). */
export function skirtShape(s0, s1, arches, { y0, y1, wheelR, archR }) {
  const top = typeof y1 === 'function' ? y1 : () => y1;
  const sh = new THREE.Shape();
  const cy = wheelR;
  const dy = cy - y0, dx = Math.sqrt(archR * archR - dy * dy), ang = Math.asin(dy / archR);
  sh.moveTo(s0, y0);
  for (const a of [...arches].sort((p, q) => p - q)) {
    if (a - dx < s0 || a + dx > s1) continue;
    sh.lineTo(a - dx, y0);
    sh.absarc(a, cy, archR, Math.PI + ang, -ang, true);
    sh.lineTo(a + dx, y0);
  }
  sh.lineTo(s1, y0);
  sh.lineTo(s1, top(s1));
  // top edge: sample the function so that slopes are preserved
  const n = 24;
  for (let i = n - 1; i >= 0; i--) {
    const s = s0 + ((s1 - s0) * i) / n;
    sh.lineTo(s, top(s));
  }
  sh.closePath();
  return sh;
}

/** Flat polygon (array of [x, y]) with optional holes as ShapeGeometry. */
export function polyGeo(points, holes = []) {
  const s = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) s.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  return new THREE.ShapeGeometry(s, 4);
}

/** Rounded rectangle outline shape. */
export function roundRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** Merge a list of geometries (positions, normals, uvs only). */
export function mergeFlat(list) {
  const flat = list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    return c;
  });
  return flat;
}

/** Plane (w x h) whose UVs address a rectangle [u0, v0, u1, v1] of a decal atlas. Faces +z; rotate it afterwards. */
export function decal(w, h, rect) {
  const g = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = rect;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}
