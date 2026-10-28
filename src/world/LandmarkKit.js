// Sculpture and ornament modelled in Blender for the landmarks (tools/blender/kit_landmark.py ->
// src/data/kit_landmark.glb): bronze eagle, stone lion, standing robed figure with a book, seated figure
// in an armchair, Corinthian capital, fluted shaft, Attic base, baluster. Builders place pieces in their
// MeshBuilder frame with put(); every landmark gets one InstancedMesh per piece it uses.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import kitGlb from '../data/kit_landmark.glb';

export async function loadLandmarkKit() {
  const buf = kitGlb.buffer.slice(kitGlb.byteOffset, kitGlb.byteOffset + kitGlb.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  const pieces = {};
  let material = null;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    pieces[o.name] = o.geometry;
    material = material || o.material;
  });
  material.name = 'lmkit';
  return { pieces, material };
}

const UP = new THREE.Vector3(0, 1, 0);

/** Collects the kit pieces a landmark builder places, in world space. */
export class LandmarkKit {
  constructor(kit) {
    this.kit = kit;
    this.items = new Map();
  }

  /** A piece at (x, y, z) of the builder's current frame, turned by yaw, scaled (sx, sy, sz). */
  put(b, piece, x, y, z, yaw = 0, sx = 1, sy = sx, sz = sx) {
    if (!this.kit.pieces[piece]) return;
    const L = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(sx, sy, sz));
    const m = b.m.clone().multiply(L);
    if (!this.items.has(piece)) this.items.set(piece, []);
    this.items.get(piece).push(m);
  }

  /** Column: Attic base, fluted shaft and Corinthian capital for a shaft of radius r from y0 to y1 (top of the abacus). */
  column(b, x, y0, z, r, y1, yaw = 0) {
    const s = r / 0.5;
    const capH = 1.15 * s, baseH = 0.5 * s;
    this.put(b, 'columnBase', x, y0, z, yaw, s);
    this.put(b, 'shaft', x, y0 + baseH, z, yaw, s * 0.96, y1 - capH - y0 - baseH, s * 0.96);
    this.put(b, 'capital', x, y1 - capH, z, yaw, s);
  }

  /** The InstancedMeshes of everything placed since the last call. */
  meshes() {
    const out = [];
    for (const [piece, ms] of this.items) {
      const im = new THREE.InstancedMesh(this.kit.pieces[piece], this.kit.material, ms.length);
      ms.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = `lmkit_${piece}`;
      im.castShadow = true;
      im.receiveShadow = true;
      im.matrixAutoUpdate = false;
      out.push(im);
    }
    this.items.clear();
    return out;
  }
}
