// Trees & bushes: a few high-quality variants rendered with InstancedMesh, split into spatial groups for culling.
import * as THREE from 'three';
import { WM } from './materials.js';
import { makeRng, prepGeo, xform, mat } from '../util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Trunk + branches (tapered cylinders), returns merged geometry. */
function trunkGeo(rnd, { h = 4, r = 0.2, branches = 6, crownY = 6, crownR = 3.5, white = false }) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(r * 0.55, r, h + crownY * 0.35, 7, 1);
  trunk.translate(0, (h + crownY * 0.35) / 2, 0);
  parts.push(prepGeo(trunk, white ? 0xe8e6e0 : 0xffffff));
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + rnd() * 0.6;
    const len = crownR * (0.55 + rnd() * 0.35);
    const g = new THREE.CylinderGeometry(r * 0.12, r * 0.35, len, 4);
    g.translate(0, len / 2, 0);
    const y0 = h * 0.8 + rnd() * crownY * 0.3;
    const tilt = 0.6 + rnd() * 0.5;
    xform(g, mat(0, y0, 0, 0, a, tilt));
    parts.push(prepGeo(g, white ? 0xe8e6e0 : 0xffffff));
  }
  // birch black marks via vertex colours are skipped; bark texture tinted
  return mergeGeometries(parts.map((g) => prepGeo(g)), false);
}

/** Foliage cards distributed in an ellipsoid crown, with spherical normals for soft lighting. */
function crownGeo(rnd, { cy = 7, rx = 3.5, ry = 3, n = 110, size = 1.9, droop = 0 }) {
  const pos = [], nrm = [], uv = [], col = [];
  const c = new THREE.Vector3(0, cy, 0);
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i < n; i++) {
    // point in ellipsoid, biased to the surface
    let x, y, z;
    do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const k = 0.55 + 0.45 * Math.cbrt(rnd());
    const l = Math.hypot(x, y, z) || 1;
    x = (x / l) * k; y = (y / l) * k; z = (z / l) * k;
    const p = new THREE.Vector3(x * rx, y * ry - droop * (1 - y) * 0.5, z * rx).add(c);
    const s = size * (0.75 + rnd() * 0.5);
    const shade = 0.62 + 0.45 * (y * 0.5 + 0.5) + (rnd() - 0.5) * 0.12;
    for (let plane = 0; plane < 2; plane++) {
      e.set(rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI); q.setFromEuler(e);
      const quad = corners.map(([a, b]) => new THREE.Vector3(a * s, b * s * (droop ? 1.5 : 1), 0).applyQuaternion(q).add(p));
      const ids = [0, 1, 2, 0, 2, 3];
      for (const id of ids) {
        const v = quad[id];
        pos.push(v.x, v.y, v.z);
        tmp.copy(v).sub(c); tmp.y *= 0.7; tmp.normalize();
        nrm.push(tmp.x, tmp.y, tmp.z);
        uv.push(uvs[id][0], uvs[id][1]);
        col.push(shade, shade, shade);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function coniferGeo(rnd, { h = 14, r = 3.2 }) {
  const pos = [], nrm = [], uv = [], col = [];
  const tiers = 16;
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const y = 1.8 + f * (h - 2);
    const rad = r * (1 - f) * (0.85 + rnd() * 0.3) + 0.3;
    const cards = 6 + Math.floor((1 - f) * 6);
    for (let k = 0; k < cards; k++) {
      const a = (k / cards) * Math.PI * 2 + rnd();
      const dx = Math.cos(a), dz = Math.sin(a);
      // a drooping card from the trunk outward
      const w = 1.2 + (1 - f) * 0.8, L = rad + 0.4;
      const p0 = [0, y + 0.3, 0], p1 = [dx * L, y - 0.5, dz * L];
      const px = -dz * w * 0.5, pz = dx * w * 0.5;
      const quad = [[p0[0] - px, p0[1], p0[2] - pz], [p0[0] + px, p0[1], p0[2] + pz], [p1[0] + px, p1[1], p1[2] + pz], [p1[0] - px, p1[1], p1[2] - pz]];
      const uvq = [[0, 1], [1, 1], [1, 0], [0, 0]];
      const shade = 0.55 + f * 0.45 + (rnd() - 0.5) * 0.1;
      for (const id of [0, 1, 2, 0, 2, 3]) {
        pos.push(...quad[id]); nrm.push(dx * 0.7, 0.7, dz * 0.7); uv.push(...uvq[id]); col.push(shade, shade, shade);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function makeTreeKinds() {
  const r = makeRng(404);
  const kinds = {
    linden: { trunk: trunkGeo(r, { h: 3.2, r: 0.24, branches: 7, crownY: 6.5, crownR: 3.8 }), crown: crownGeo(r, { cy: 7.2, rx: 3.8, ry: 3.4, n: 70, size: 3.0 }), leaf: WM.leaves },
    chestnut: { trunk: trunkGeo(r, { h: 2.6, r: 0.28, branches: 8, crownY: 6, crownR: 4.4 }), crown: crownGeo(r, { cy: 6.6, rx: 4.3, ry: 3.2, n: 76, size: 3.2 }), leaf: WM.leaves },
    small: { trunk: trunkGeo(r, { h: 2.0, r: 0.14, branches: 5, crownY: 3.5, crownR: 2.3 }), crown: crownGeo(r, { cy: 4.2, rx: 2.2, ry: 2.0, n: 38, size: 2.2 }), leaf: WM.leaves },
    birch: { trunk: trunkGeo(r, { h: 4.5, r: 0.16, branches: 6, crownY: 7, crownR: 2.6, white: true }), crown: crownGeo(r, { cy: 8.2, rx: 2.6, ry: 4.2, n: 64, size: 2.3, droop: 1 }), leaf: WM.leavesBirch, white: true },
    // purple-leaf cherry plum (Prunus cerasifera 'Pissardii'), common in the newer Sofia estates
    plum: { trunk: trunkGeo(r, { h: 1.8, r: 0.15, branches: 6, crownY: 3.6, crownR: 2.6 }), crown: crownGeo(r, { cy: 4.1, rx: 2.7, ry: 2.2, n: 46, size: 2.2 }), leaf: WM.leavesPlum, tint: false },
    // weeping willow
    willow: { trunk: trunkGeo(r, { h: 2.6, r: 0.32, branches: 9, crownY: 5.2, crownR: 4.6 }), crown: crownGeo(r, { cy: 6.2, rx: 4.8, ry: 3.6, n: 92, size: 2.5, droop: 1.8 }), leaf: WM.leavesBirch },
    spruce: { trunk: (() => { const g = new THREE.CylinderGeometry(0.1, 0.28, 15, 8); g.translate(0, 7.5, 0); return prepGeo(g); })(), crown: coniferGeo(r, { h: 15, r: 3.3 }), leaf: WM.needles },
  };
  const r2 = makeRng(505);
  kinds.linden.far = crownGeo(r2, { cy: 7.2, rx: 3.6, ry: 3.3, n: 22, size: 4.2 });
  kinds.chestnut.far = crownGeo(r2, { cy: 6.6, rx: 4.1, ry: 3.1, n: 24, size: 4.4 });
  kinds.small.far = crownGeo(r2, { cy: 4.2, rx: 2.1, ry: 1.9, n: 14, size: 3.0 });
  kinds.birch.far = crownGeo(r2, { cy: 8.2, rx: 2.5, ry: 4.1, n: 22, size: 3.2, droop: 1 });
  kinds.spruce.far = coniferGeo(r2, { h: 15, r: 3.3 });
  kinds.plum.far = crownGeo(r2, { cy: 4.1, rx: 2.6, ry: 2.1, n: 14, size: 3.0 });
  kinds.willow.far = crownGeo(r2, { cy: 6.2, rx: 4.6, ry: 3.5, n: 26, size: 3.6, droop: 1.8 });
  const simpleTrunk = (h, r) => { const g = new THREE.CylinderGeometry(r * 0.5, r, h, 5, 1); g.translate(0, h / 2, 0); return prepGeo(g); };
  kinds.linden.trunkFar = simpleTrunk(6, 0.24); kinds.chestnut.trunkFar = simpleTrunk(5, 0.28); kinds.small.trunkFar = simpleTrunk(3.5, 0.14);
  kinds.plum.trunkFar = simpleTrunk(3, 0.15); kinds.willow.trunkFar = simpleTrunk(5, 0.32);
  kinds.birch.trunkFar = simpleTrunk(8, 0.16); kinds.spruce.trunkFar = simpleTrunk(12, 0.25);
  return kinds;
}

/**
 * Builds all trees as a few BatchedMeshes (one per foliage material + one for trunks).
 * Per-instance frustum culling and a distance LOD (near/far geometry) keep it to ~4 draw calls.
 */
export function buildTrees(scene, kinds, list) {
  const barkMat = WM.bark;
  const leafSets = new Map(); // material -> kinds using it
  for (const [name, k] of Object.entries(kinds)) { if (!leafSets.has(k.leaf)) leafSets.set(k.leaf, []); leafSets.get(k.leaf).push(name); }
  const count = (arr, key) => arr.reduce((a, g) => a + g[key], 0);
  // trunk batch
  const trunkGeos = Object.values(kinds).flatMap((k) => [k.trunk, k.trunkFar]);
  const tb = new THREE.BatchedMesh(list.length, count(trunkGeos.map((g) => ({ v: g.attributes.position.count })), 'v'), 0, barkMat);
  const trunkIds = {};
  for (const [name, k] of Object.entries(kinds)) trunkIds[name] = [tb.addGeometry(k.trunk), tb.addGeometry(k.trunkFar)];
  const crownB = new Map(), crownIds = {};
  for (const [mat, names] of leafSets) {
    const geos = names.flatMap((n) => [kinds[n].crown, kinds[n].far]);
    const nInst = list.filter((t) => names.includes(t.kind)).length;
    const b = new THREE.BatchedMesh(Math.max(1, nInst), count(geos.map((g) => ({ v: g.attributes.position.count })), 'v'), 0, mat);
    for (const n of names) crownIds[n] = [b.addGeometry(kinds[n].crown), b.addGeometry(kinds[n].far)];
    crownB.set(mat, b);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color(), white = new THREE.Color(1, 1, 1), birchW = new THREE.Color(0xf4f2ec);
  const inst = [];
  for (const t of list) {
    const k = kinds[t.kind];
    q.setFromAxisAngle(up, t.rot); p.set(t.x, t.y || 0, t.z); s.setScalar(t.s);
    m.compose(p, q, s);
    const ti = tb.addInstance(trunkIds[t.kind][0]); tb.setMatrixAt(ti, m); tb.setColorAt(ti, k.white ? birchW : white);
    const cb = crownB.get(k.leaf);
    const ci = cb.addInstance(crownIds[t.kind][0]); cb.setMatrixAt(ci, m);
    if (k.tint === false) col.setScalar(0.92 + (t.hue || 0)); else { col.setHSL(0.24 + (t.hue || 0), 0.35, 0.5); col.lerp(white, 0.55); }
    cb.setColorAt(ci, col);
    inst.push({ x: t.x, z: t.z, kind: t.kind, ti, ci, cb, lod: 0 });
  }
  for (const b of [tb, ...crownB.values()]) {
    b.castShadow = true; b.receiveShadow = true; b.sortObjects = false;
    b.computeBoundingSphere(); b.computeBoundingBox();
    scene.add(b);
  }
  let hidden = [];
  return {
    /** Hides trees standing between the chase camera and the bus (2D capsule test); pass null to restore. */
    clearView(a, b, r = 4.2) {
      for (const it of hidden) { tb.setVisibleAt(it.ti, true); it.cb.setVisibleAt(it.ci, true); it.hid = false; }
      hidden = [];
      if (!a) return;
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      const minX = Math.min(a.x, b.x) - r, maxX = Math.max(a.x, b.x) + r, minZ = Math.min(a.z, b.z) - r, maxZ = Math.max(a.z, b.z) + r;
      for (const it of inst) {
        if (it.x < minX || it.x > maxX || it.z < minZ || it.z > maxZ) continue;
        const t = ((it.x - a.x) * dx + (it.z - a.z) * dz) / L2;
        if (t < 0.22 || t > 1.15) continue;
        const px = a.x + dx * t - it.x, pz = a.z + dz * t - it.z;
        const rr = r * (0.7 + 0.9 * Math.min(1, t)); // wider near the camera where crowns fill the frame
        if (px * px + pz * pz > rr * rr) continue;
        tb.setVisibleAt(it.ti, false); it.cb.setVisibleAt(it.ci, false); it.hid = true; hidden.push(it);
      }
    },
    update(cam) {
      for (const it of inst) {
        const d2 = (it.x - cam.x) ** 2 + (it.z - cam.z) ** 2;
        const lod = d2 < 210 * 210 ? 0 : 1;
        if (lod === it.lod) continue;
        it.lod = lod;
        tb.setGeometryIdAt(it.ti, trunkIds[it.kind][lod]);
        it.cb.setGeometryIdAt(it.ci, crownIds[it.kind][lod]);
      }
    },
  };
}
