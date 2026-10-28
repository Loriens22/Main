// Bus parts modelled in Blender (tools/blender/kit_bus.py -> src/data/kit_bus.glb): tyres, steel and
// aluminium wheels, the seat shells of the four buses. One baked atlas material (albedo with contact
// shading, normal map, ORM). The kit is parsed once at start-up (loadBusKit) and shared by every bus: its
// geometry, material and textures are marked shared so a bus's dispose() leaves them alone. Without the
// kit (load failure) the models keep their procedural parts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let KIT = null;
let loading = null;

const TYRE_R = 0.478; // outer radius of the modelled 275/70 R22.5 tyre

/** Parses the kit (once). Safe to call from several places. */
export function loadBusKit() {
  if (KIT) return Promise.resolve(KIT);
  if (loading) return loading;
  // imported lazily: the vehicle modules stay loadable without the binary (node tests)
  loading = import('../data/kit_bus.glb').then(({ default: kitGlb }) => {
    const buf = kitGlb.buffer.slice(kitGlb.byteOffset, kitGlb.byteOffset + kitGlb.byteLength);
    return new GLTFLoader().parseAsync(buf, '');
  }).then((gltf) => {
    const pieces = {};
    let material = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.userData.shared = true;
      pieces[o.name] = o.geometry;
      material = material || o.material;
    });
    material.name = 'buskit';
    material.userData.shared = true;
    for (const v of Object.values(material)) if (v && v.isTexture) { v.userData.shared = true; v.anisotropy = 4; }
    KIT = { pieces, material, cache: new Map() };
    return KIT;
  }).catch((e) => {
    console.warn('bus kit unavailable', e);
    return null;
  });
  return loading;
}

/** The parsed kit, or null before loadBusKit() resolved. */
export function busKit() {
  return KIT;
}

function shared(g) {
  g.userData.shared = true;
  g.computeBoundingSphere();
  return g;
}

/**
 * Wheel assembly as one mesh: tyre + wheel face; twin = outer deep-dish wheel and the inner tyre `spacing`
 * metres further in. kind 'steel' | 'alu'. Scaled to the bus's tyre radius R. Outer face towards +x.
 */
export function kitWheel(twin, { kind = 'steel', spacing = 0.31, R = TYRE_R } = {}) {
  const K = KIT;
  if (!K) return null;
  const key = `wheel|${kind}|${twin ? 1 : 0}|${spacing}|${R.toFixed(3)}`;
  let geo = K.cache.get(key);
  if (!geo) {
    const P = K.pieces;
    const face = P[kind === 'alu' ? (twin ? 'wheelAluRear' : 'wheelAlu') : (twin ? 'wheelSteelRear' : 'wheelSteel')];
    if (!P.tyre || !face) return null;
    const list = [P.tyre.clone(), face.clone()];
    if (twin) list.push(P.tyre.clone().translate(-spacing, 0, 0));
    geo = mergeGeometries(list, false);
    if (!geo) return null;
    const k = R / TYRE_R;
    geo.scale(k, k, k);
    K.cache.set(key, shared(geo));
  }
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, K.material);
  mesh.name = 'kitWheel';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

/**
 * Seat shells of one kind for a list of seats {x, z, yaw, fy}: one InstancedMesh, origin on the seat's
 * floor under the pan centre, yaw 0 facing forward (-z). colors: optional per-seat tint (THREE.Color).
 */
export function kitSeats(piece, seats, colors = null) {
  const K = KIT;
  if (!K || !K.pieces[piece] || !seats.length) return null;
  const im = new THREE.InstancedMesh(K.pieces[piece], K.material, seats.length);
  const m = new THREE.Matrix4();
  seats.forEach((s, i) => {
    m.makeRotationY(s.yaw || 0).setPosition(s.x, s.fy, s.z);
    im.setMatrixAt(i, m);
    if (colors) im.setColorAt(i, colors[i]);
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  im.name = 'kitSeats';
  im.castShadow = false;
  im.receiveShadow = true;
  return im;
}

/**
 * Any kit piece at a list of placements {x, y, z, yaw}: one InstancedMesh (null without the kit).
 * color: one tint for all instances (multiplies the baked albedo), e.g. black straps.
 */
export function kitInstances(piece, list, { color = null, castShadow = false } = {}) {
  const K = KIT;
  if (!K || !K.pieces[piece] || !list.length) return null;
  const im = new THREE.InstancedMesh(K.pieces[piece], K.material, list.length);
  const m = new THREE.Matrix4();
  const c = color ? new THREE.Color(color) : null;
  list.forEach((p, i) => {
    m.makeRotationY(p.yaw || 0).setPosition(p.x, p.y, p.z);
    im.setMatrixAt(i, m);
    if (c) im.setColorAt(i, c);
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  im.name = `kit_${piece}`;
  im.castShadow = castShadow;
  im.receiveShadow = true;
  return im;
}

/** One kit piece as a plain mesh (shared geometry and material), or null without the kit. */
export function kitMesh(piece, { castShadow = false } = {}) {
  const K = KIT;
  if (!K || !K.pieces[piece]) return null;
  const mesh = new THREE.Mesh(K.pieces[piece], K.material);
  mesh.name = `kit_${piece}`;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Frees one bus's GPU resources but keeps what the kit (and other shared assets) own.
 * extra: more materials to release (the model's material table).
 */
export function disposeModel(root, extra = []) {
  const mats = new Set(), texs = new Set();
  root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) mats.add(m);
  });
  for (const m of [...mats, ...extra]) {
    if (!m || (m.userData && m.userData.shared)) continue;
    for (const v of Object.values(m)) if (v && v.isTexture && !(v.userData && v.userData.shared)) texs.add(v);
    m.dispose();
  }
  for (const t of texs) t.dispose();
}
