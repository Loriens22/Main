// Shared geometry helpers for the procedural bus model (exterior in
// BusModel.js, interior and cab in BusInterior.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BUS, FRONT_Z } from './BusSpec.js';

export const HW = BUS.halfW;
export const S_REAR_ORIGIN = BUS.frontOverhang + BUS.wb1 + BUS.wb2; // distance front bumper -> axle 3 (14.575)
export const sToFrontZ = (s) => FRONT_Z + s;
export const sToRearZ = (s) => s - S_REAR_ORIGIN;

/** Collects geometry per material and merges it. */
class Parts {
  constructor() {
    this.map = new Map();
  }

  add(key, geo, m = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    let a = this.map.get(key);
    if (!a) this.map.set(key, (a = []));
    a.push(g);
    return g;
  }

  build(mats, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [k, list] of this.map) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[k]);
      mesh.name = k;
      mesh.castShadow = castShadow && !(mats[k] && mats[k].transparent);
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    return group;
  }
}

const M = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);
const basis = (e1, e2, e3, t) => new THREE.Matrix4().makeBasis(new THREE.Vector3(...e1), new THREE.Vector3(...e2), new THREE.Vector3(...e3)).setPosition(...t);

function box(w, h, d, r = 0) {
  return r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
}

/** Box without some faces (order: +x, -x, +y, -y, +z, -z). */
function openBox(w, h, d, drop) {
  const g = new THREE.BoxGeometry(w, h, d);
  const idx = Array.from(g.index.array);
  const keep = [];
  for (let f = 0; f < 6; f++) if (!drop.includes(f)) keep.push(...idx.slice(f * 6, f * 6 + 6));
  g.setIndex(keep);
  return g;
}

function cyl(r, h, seg = 12, r2 = r) {
  return new THREE.CylinderGeometry(r2, r, h, seg);
}

/** Tube through points [[x,y,z],...]. */
function tube(points, r, seg = 24, rad = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, seg, r, rad, false);
}

function extrude(shape, depth, bevel = 0) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10,
  });
}

function rectShape(x0, y0, x1, y1, r = 0) {
  const s = new THREE.Shape();
  if (r <= 0) {
    s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
    return s;
  }
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function rectPath(x0, y0, x1, y1, r = 0) {
  const p = new THREE.Path();
  if (r <= 0) {
    p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.closePath();
    return p;
  }
  p.moveTo(x0 + r, y0);
  p.quadraticCurveTo(x0, y0, x0, y0 + r); p.lineTo(x0, y1 - r);
  p.quadraticCurveTo(x0, y1, x0 + r, y1); p.lineTo(x1 - r, y1);
  p.quadraticCurveTo(x1, y1, x1, y1 - r); p.lineTo(x1, y0 + r);
  p.quadraticCurveTo(x1, y0, x1 - r, y0); p.closePath();
  return p;
}

/** Side skirt between s0..s1 (distance from bus front) with semicircular wheel-arch cut-outs. */
function skirtShape(s0, s1, arches, y0 = BUS.skirtY, y1 = BUS.beltY) {
  const sh = new THREE.Shape();
  const R = 0.535, cy = BUS.wheelR;
  const dy = cy - y0, dx = Math.sqrt(R * R - dy * dy), ang = Math.asin(dy / R);
  sh.moveTo(s0, y0);
  for (const a of [...arches].sort((p, q) => p - q)) {
    if (a - dx < s0 || a + dx > s1) continue;
    sh.lineTo(a - dx, y0);
    sh.absarc(a, cy, R, Math.PI + ang, -ang, true);
    sh.lineTo(a + dx, y0);
  }
  sh.lineTo(s1, y0);
  sh.lineTo(s1, y1);
  sh.lineTo(s0, y1);
  sh.closePath();
  return sh;
}

/** Plan-view outline of a rounded bus end (front or rear) as a list of [x, dz] (dz >= 0 into the body). */
function endOutline(r = 0.24, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 - (i / n) * (Math.PI / 2);
    pts.push([-HW + r - Math.cos(a) * r, r - Math.sin(a) * r]);
  }
  for (let i = n; i >= 0; i--) {
    const a = Math.PI / 2 - (i / n) * (Math.PI / 2);
    pts.push([HW - r + Math.cos(a) * r, r - Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Vertical strip following a plan outline (points [x, dz], dz measured into the
 * body from the end plane zBase). dir = -1 for the front end (body extends to +z),
 * +1 for the rear end. rake leans the top edge into the body.
 */
function outlineStrip(outline, zBase, dir, y0, y1, rake = 0) {
  const pos = [], nrm = [], uv = [], idx = [];
  const n = outline.length;
  const cz = zBase - dir * 1.5;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const [x, dz] = outline[i];
    const z = zBase - dir * dz;
    if (i > 0) u += Math.hypot(x - outline[i - 1][0], dz - outline[i - 1][1]);
    const pa = outline[Math.max(0, i - 1)], pb = outline[Math.min(n - 1, i + 1)];
    const tx = pb[0] - pa[0], tz = -dir * (pb[1] - pa[1]);
    const tl = Math.hypot(tx, tz) || 1;
    let nx = -tz / tl, nz = tx / tl;
    if (nx * x + nz * (z - cz) < 0) { nx = -nx; nz = -nz; }
    pos.push(x, y0, z, x, y1, z - dir * rake);
    nrm.push(nx, 0, nz, nx, 0, nz);
    uv.push(u, 0, u, 1);
  }
  // winding: check the first quad against the intended outward normal
  const p0 = new THREE.Vector3(pos[0], pos[1], pos[2]), p1 = new THREE.Vector3(pos[6], pos[7], pos[8]), p2 = new THREE.Vector3(pos[3], pos[4], pos[5]);
  const fn = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  const flip = fn.x * nrm[0] + fn.z * nrm[2] < 0;
  for (let i = 0; i < n - 1; i++) {
    const a = 2 * i, b = 2 * i + 1, c = 2 * i + 2, d = 2 * i + 3;
    if (!flip) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Horizontal cap at height y following an end outline and extending `depth` into the body. */
function outlineCap(outline, zBase, dir, y, up = true, depth = 0.6) {
  const pts = outline.map(([x, dz]) => new THREE.Vector2(x, zBase - dir * dz));
  pts.push(new THREE.Vector2(HW, zBase - dir * depth), new THREE.Vector2(-HW, zBase - dir * depth));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const pos = [], nrm = [], uv = [];
  for (const t of tris) {
    let [a, b, c] = t.map((k) => pts[k]);
    // orient so the face normal points up (or down)
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); // (x,z) plane
    const facesUp = cross < 0; // in x-east/z-south, clockwise on the map faces +y
    if (facesUp !== up) [b, c] = [c, b];
    for (const v of [a, b, c]) {
      pos.push(v.x, y, v.y);
      nrm.push(0, up ? 1 : -1, 0);
      uv.push(v.x, v.y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function clean(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}

function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}

export { M, Parts, basis, box, clean, cyl, endOutline, extrude, openBox, outlineCap, outlineStrip, rectPath, rectShape, scaleUV, skirtShape, tube };
