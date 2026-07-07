// ---------------------------------------------------------------------------
// PartBaker — turns richly-detailed "part" Groups into a handful of merged
// meshes so a part can be stamped across hundreds of facade bays while keeping
// draw-calls (and mobile GPUs) happy.
//
//   const baker = new PartBaker();
//   baker.register('window', createWindowUnit(3.2, 2.6));   // flatten once
//   baker.place('window', matrix4A);                         // stamp many times
//   baker.place('window', matrix4B);
//   scene.add(baker.finalize());                             // merge → few meshes
//
// Instancing and per-instance colours are expanded and baked into vertex
// colours so nothing is lost in the merge.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function matSig(m) {
  const c = m.color ? m.color.getHexString() : 'fff';
  const e = m.emissive ? m.emissive.getHexString() : '000';
  return [c, m.roughness ?? 0.5, m.metalness ?? 0, m.transparent ? 1 : 0,
    (m.opacity ?? 1).toFixed(2), e, (m.emissiveIntensity ?? 0).toFixed(2),
    m.side ?? 0, m.vertexColors ? 1 : 0, m.flatShading ? 1 : 0].join('_');
}

function matParams(m, vc) {
  return {
    color: vc ? 0xffffff : (m.color ? m.color.getHex() : 0xffffff),
    roughness: m.roughness ?? 0.5, metalness: m.metalness ?? 0,
    transparent: !!m.transparent, opacity: m.opacity ?? 1,
    emissive: m.emissive ? m.emissive.getHex() : 0x000000,
    emissiveIntensity: m.emissiveIntensity ?? 0,
    side: m.side ?? THREE.FrontSide, vertexColors: vc,
    flatShading: !!m.flatShading, envMapIntensity: m.envMapIntensity ?? 0.8
  };
}

// Keep only position/normal/uv(+color); make non-indexed so any set merges.
function normalize(geo, wantColor) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const keep = ['position', 'normal', 'uv'];
  if (wantColor) {
    if (!g.attributes.color) {
      const arr = new Float32Array(n * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    keep.push('color');
  }
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
  return g;
}

export class PartBaker {
  constructor() {
    this.cache = new Map();  // key -> [{sig, params, geom(local merged)}]
    this.global = new Map(); // sig -> {params, geoms:[]}
    this._tmpColor = new THREE.Color();
  }

  register(key, group) {
    if (this.cache.has(key)) return;
    group.updateMatrixWorld(true);
    const buckets = new Map(); // sig -> {params, geoms:[]}
    const push = (sig, params, geo) => {
      if (!buckets.has(sig)) buckets.set(sig, { params, geoms: [] });
      buckets.get(sig).geoms.push(geo);
    };
    group.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (o.isInstancedMesh) {
        const hasColor = !!o.instanceColor;
        const sig = matSig(m) + (hasColor ? '_vc' : '');
        const params = matParams(m, hasColor);
        const inst = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, inst);
          const world = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, inst);
          let g = normalize(o.geometry, hasColor);
          g.applyMatrix4(world);
          if (hasColor) {
            o.getColorAt(i, this._tmpColor);
            const col = g.attributes.color;
            for (let k = 0; k < col.count; k++) col.setXYZ(k, this._tmpColor.r, this._tmpColor.g, this._tmpColor.b);
          }
          push(sig, params, g);
        }
      } else {
        const vc = !!m.vertexColors;
        const sig = matSig(m) + (vc ? '_vc' : '');
        const params = matParams(m, vc);
        const g = normalize(o.geometry, vc);
        g.applyMatrix4(o.matrixWorld);
        push(sig, params, g);
      }
    });
    // merge each bucket into one local geometry for cheap re-stamping
    const entries = [];
    buckets.forEach((b, sig) => {
      const merged = b.geoms.length === 1 ? b.geoms[0] : mergeGeometries(b.geoms, false);
      entries.push({ sig, params: b.params, geom: merged });
    });
    this.cache.set(key, entries);
  }

  // stamp a registered part at a world matrix
  place(key, matrix4) {
    const entries = this.cache.get(key);
    if (!entries) throw new Error('PartBaker: unknown part ' + key);
    for (const e of entries) {
      if (!this.global.has(e.sig)) this.global.set(e.sig, { params: e.params, geoms: [] });
      const g = e.geom.clone();
      g.applyMatrix4(matrix4);
      this.global.get(e.sig).geoms.push(g);
    }
  }

  finalize() {
    const out = new THREE.Group();
    this.global.forEach((b) => {
      if (!b.geoms.length) return;
      const merged = mergeGeometries(b.geoms, false);
      const mat = new THREE.MeshStandardMaterial(b.params);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      out.add(mesh);
      b.geoms.forEach((g) => g.dispose());
    });
    this.global.clear();
    return out;
  }

  // convenience: a Matrix4 from a wing basis (dir,up,facing) + local offset
  static matrix(dir, up, facing, pos) {
    const m = new THREE.Matrix4().makeBasis(dir, up, facing);
    m.setPosition(pos);
    return m;
  }
}
