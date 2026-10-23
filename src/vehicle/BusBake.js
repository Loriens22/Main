// Draw-call reduction for the bus model. The builders produce one merged mesh per
// material key (about 60 per section); most of those materials are plain colours that
// differ only in colour, roughness and metalness. This pass merges, inside every group,
// the static untextured opaque meshes that share the remaining material state into one
// mesh whose colour, roughness and metalness come from vertex attributes. Meshes whose
// material changes at runtime (lights, stop button, interior light) are left alone, as
// are textured, transparent, emissive and vertex-coloured (bellows) ones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TEXTURE_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'bumpMap', 'clearcoatMap', 'clearcoatNormalMap'];

function eligible(m, keep) {
  const mat = m.material;
  if (!m.isMesh || Array.isArray(mat) || !mat || keep.has(mat)) return false;
  if (!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) || mat.transparent || mat.alphaTest > 0 || mat.vertexColors) return false;
  if (TEXTURE_SLOTS.some((k) => mat[k])) return false;
  if (mat.emissive && mat.emissiveIntensity > 0 && (mat.emissive.r || mat.emissive.g || mat.emissive.b)) return false;
  if (mat.polygonOffset || mat.wireframe || m.isSkinnedMesh || m.isInstancedMesh || m.morphTargetInfluences) return false;
  return true;
}

function stateKey(m) {
  const mat = m.material;
  return [mat.type, mat.side, mat.flatShading ? 1 : 0, mat.envMapIntensity.toFixed(2), mat.isMeshPhysicalMaterial ? `${mat.clearcoat}/${mat.clearcoatRoughness}` : '', m.castShadow ? 1 : 0, m.receiveShadow ? 1 : 0].join('|');
}

function bakedMaterial(src, cache) {
  const key = stateKey({ material: src, castShadow: false, receiveShadow: false });
  let mat = cache.get(key);
  if (mat) return mat;
  mat = src.isMeshPhysicalMaterial
    ? new THREE.MeshPhysicalMaterial({ clearcoat: src.clearcoat, clearcoatRoughness: src.clearcoatRoughness })
    : new THREE.MeshStandardMaterial();
  mat.vertexColors = true;
  mat.side = src.side;
  mat.flatShading = src.flatShading;
  mat.envMapIntensity = src.envMapIntensity;
  mat.name = 'baked';
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nvarying vec2 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  };
  mat.customProgramCacheKey = () => 'bus-baked';
  cache.set(key, mat);
  return mat;
}

/** Prepares one mesh's geometry for merging: local transform applied, colour and roughness/metalness baked in. */
function bakeGeometry(m) {
  let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  m.updateMatrix();
  g.applyMatrix4(m.matrix);
  const n = g.attributes.position.count, mat = m.material;
  const col = new Float32Array(n * 3), rm = new Float32Array(n * 2);
  const c = mat.color;
  for (let i = 0; i < n; i++) {
    col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
    rm[2 * i] = mat.roughness; rm[2 * i + 1] = mat.metalness;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
  return g;
}

/**
 * Merges the eligible meshes of every group under root. keep = materials changed at runtime.
 * Returns {before, after} mesh counts.
 */
export function bakeStatic(root, keep) {
  const cache = new Map();
  let before = 0, after = 0;
  const groups = [];
  root.traverse((o) => { if (o.children && o.children.length > 1) groups.push(o); });
  for (const grp of groups) {
    const buckets = new Map();
    for (const m of grp.children) {
      if (!m.isMesh) continue;
      before++;
      if (!eligible(m, keep) || m.children.length) continue;
      const k = stateKey(m);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(m);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geo = mergeGeometries(list.map(bakeGeometry), false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, bakedMaterial(list[0].material, cache));
      mesh.name = 'baked';
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = list[0].receiveShadow;
      for (const m of list) grp.remove(m); // nothing is on the GPU yet: no dispose needed
      grp.add(mesh);
      after -= list.length - 1;
    }
  }
  return { before, after: before + after };
}
