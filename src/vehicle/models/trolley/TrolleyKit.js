// Trolleybus parts modelled in Blender (tools/blender/kit_trolley.py -> src/data/kit_trolley.glb): the trolley
// pole equipment (base frame, turrets with springs, hinge clamps, pole tubes, trolley heads with carbon
// sliders, rest hooks, rope retrievers), roof equipment (louvres, fans, the Ikarus braking resistor), the
// seats, mirrors and headlamp clusters of the three line-9 vehicles. One baked atlas material, parsed once and
// shared by every trolleybus (like BusKit.js); without it the models fall back to procedural parts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let KIT = null;
let loading = null;

export function loadTrolleyKit() {
  if (KIT) return Promise.resolve(KIT);
  if (loading) return loading;
  loading = import('../../../data/kit_trolley.glb').then(({ default: glb }) => {
    const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
    return new GLTFLoader().parseAsync(buf, '');
  }).then((gltf) => {
    const pieces = {};
    let material = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.userData.shared = true;
      o.geometry.computeBoundingSphere();
      pieces[o.name] = o.geometry;
      material = material || o.material;
    });
    material.name = 'trolleykit';
    material.userData.shared = true;
    for (const v of Object.values(material)) if (v && v.isTexture) { v.userData.shared = true; v.anisotropy = 4; }
    KIT = { pieces, material };
    return KIT;
  }).catch((e) => {
    console.warn('trolley kit unavailable', e);
    return null;
  });
  return loading;
}

export function trolleyKit() {
  return KIT;
}

/** One kit piece as a mesh (shared geometry and material), or null without the kit. */
export function tkMesh(piece, { castShadow = false, color = null } = {}) {
  const K = KIT;
  if (!K || !K.pieces[piece]) return null;
  let mat = K.material;
  if (color != null) {
    // a tinted copy (multiplies the baked albedo), e.g. a seat shell colour; owned by the model
    mat = K.material.clone();
    mat.color = new THREE.Color(color);
    mat.userData = {};
  }
  const m = new THREE.Mesh(K.pieces[piece], mat);
  m.name = `tk_${piece}`;
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

/** A kit piece at many placements {x, y, z, yaw}: one InstancedMesh (null without the kit). */
export function tkInstances(piece, list, { castShadow = false } = {}) {
  const K = KIT;
  if (!K || !K.pieces[piece] || !list.length) return null;
  const im = new THREE.InstancedMesh(K.pieces[piece], K.material, list.length);
  const m = new THREE.Matrix4();
  list.forEach((p, i) => {
    m.makeRotationY(p.yaw || 0).setPosition(p.x, p.y, p.z);
    im.setMatrixAt(i, m);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.name = `tk_${piece}`;
  im.castShadow = castShadow;
  im.receiveShadow = true;
  return im;
}
