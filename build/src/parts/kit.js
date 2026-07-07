// ---------------------------------------------------------------------------
// Shared geometry/material helper kit for the detailed 3D "parts".
// Every part module imports from here so the whole complex stays consistent.
// All units are METRES, +Y up. For facade-mounted parts, +Z is OUTWARD (front).
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export { THREE, RoundedBoxGeometry, mergeGeometries };

// A crisp, lightly-bevelled box — the workhorse for hard-surface detail.
// Bevels catch highlights so nothing reads as a flat "voxel" cube.
export function bevelBox(w, h, d, r = 0.012, seg = 2) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  if (r <= 0) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, seg, r);
}

// Extrude a 2D profile (array of [x,y]) along Z with optional bevel.
export function extrudeProfile(pts, depth, bevel = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 1, steps: 1, curveSegments: 6
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Lathe a profile (array of [radius,y]) around the Y axis — vases, posts, lamps.
export function lathe(profilePts, segments = 24) {
  const v = profilePts.map(p => new THREE.Vector2(p[0], p[1]));
  return new THREE.LatheGeometry(v, segments);
}

// A round tube following a polyline path — pipes, cables, handrails.
// Guards against degenerate paths (duplicate points) that produce NaN geometry.
export function tube(points, radius = 0.02, radialSeg = 8, tubularSeg = null) {
  const pts = [];
  for (const p of points) {
    const v = new THREE.Vector3(p[0], p[1], p[2]);
    if (!pts.length || v.distanceToSquared(pts[pts.length - 1]) > 1e-8) pts.push(v);
  }
  if (pts.length < 2) {
    const b = pts[0] ? pts[0].clone() : new THREE.Vector3();
    pts.length = 0;
    pts.push(b, b.clone().add(new THREE.Vector3(0, 0.01, 0)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, tubularSeg || Math.max(16, pts.length * 8), radius, radialSeg, false);
}

// A hanging catenary between two points (string lights, cables).
export function catenary(a, b, sag = 0.25, steps = 20) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const droop = -Math.sin(Math.PI * t) * sag;
    pts.push([x, y + droop, z]);
  }
  return pts;
}

// Standard PBR material with sensible defaults; envMap comes from scene.environment.
export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: o.roughness ?? 0.6, metalness: o.metalness ?? 0.0,
    envMapIntensity: o.envMapIntensity ?? 0.8,
    transparent: o.transparent ?? false, opacity: o.opacity ?? 1.0,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 0,
    side: o.side ?? THREE.FrontSide, flatShading: o.flatShading ?? false,
    map: o.map ?? null, normalMap: o.normalMap ?? null
  });
}

// A curated, shared palette so parts from different agents match each other.
export function palette() {
  return {
    white:    mat(0xeef0ee, { roughness: 0.7, envMapIntensity: 0.5 }),
    offwhite: mat(0xe4e6e2, { roughness: 0.75, envMapIntensity: 0.4 }),
    wood:     mat(0x9a6238, { roughness: 0.55, envMapIntensity: 0.5 }),
    woodDark: mat(0x6e4326, { roughness: 0.6 }),
    charcoal: mat(0x2c2e33, { roughness: 0.55, metalness: 0.3, envMapIntensity: 0.6 }),
    black:    mat(0x141519, { roughness: 0.5, metalness: 0.4 }),
    steel:    mat(0x9aa0a6, { roughness: 0.35, metalness: 0.9, envMapIntensity: 1.0 }),
    darkMetal:mat(0x26282d, { roughness: 0.4, metalness: 0.85, envMapIntensity: 0.9 }),
    glass:    mat(0x152430, { roughness: 0.06, metalness: 0.85, envMapIntensity: 1.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    glassClear:mat(0xbfe0e6, { roughness: 0.04, metalness: 0.2, envMapIntensity: 1.4, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    concrete: mat(0xc0c0bb, { roughness: 0.9 }),
    soil:     mat(0x3a2a1c, { roughness: 1.0 }),
    leaf:     mat(0x3f7d34, { roughness: 0.75, envMapIntensity: 0.4 }),
    leafDark: mat(0x2f5f28, { roughness: 0.8 }),
    fabric:   mat(0xd8d3c8, { roughness: 0.9 }),
    cushion:  mat(0xb9b3a6, { roughness: 0.95 })
  };
}

// Recursively enable shadows on a group/mesh.
export function shadows(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

// Merge all (non-instanced) meshes in a group that share a material into single
// meshes, keeping draw-calls low. Geometries are normalised (non-indexed,
// position/normal/uv) so mixed primitive types merge cleanly. InstancedMeshes
// are preserved as-is with their world transform baked in.
export function optimize(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  const out = new THREE.Group();
  group.traverse(o => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh) {
      const c = o.clone();
      c.matrix.copy(o.matrixWorld); c.matrixAutoUpdate = false;
      c.castShadow = true; c.receiveShadow = true;
      out.add(c);
      return;
    }
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(o.matrixWorld);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  byMat.forEach((geos, material) => {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    const m = new THREE.Mesh(merged, material);
    m.castShadow = true; m.receiveShadow = true;
    out.add(m);
  });
  return out;
}
