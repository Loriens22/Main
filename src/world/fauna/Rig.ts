import * as THREE from 'three';
import type { ModelInstance } from '../../render/Assets';

const _a = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** three.js strips '.', ':', '/', '[' and ']' from glTF node names (PropertyBinding.sanitizeNodeName) */
export const boneName = (n: string) => n.replace(/\s/g, '_').replace(/[[\].:/]/g, '');

/**
 * Procedural pose driver for a skinned creature (blender/lib/creature.py). Every frame: reset() to the rest pose, then
 * rot(bone, axis, angle) with axes in MODEL space — forward −Z, up +Y, right +X (Blender +Y forward / +Z up). The
 * axis is converted to the bone's own frame at rest, so `rot('thigh.L', X, +a)` swings a downward leg forward
 * whatever the bone's roll.
 */
export class Rig {
  readonly bones = new Map<string, THREE.Bone>();
  private rest = new Map<string, THREE.Quaternion>();
  private restInv = new Map<string, THREE.Quaternion>();
  private restScale = new Map<string, THREE.Vector3>();
  private restPos = new Map<string, THREE.Vector3>();
  /** model space → the bone's parent space (rest), for move() */
  private parentInv = new Map<string, { q: THREE.Quaternion; s: THREE.Vector3 }>();
  readonly meshes: THREE.SkinnedMesh[] = [];

  constructor(readonly inst: ModelInstance) {
    const root = inst.root;
    root.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    root.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone) {
        this.bones.set(b.name, b);
        this.rest.set(b.name, b.quaternion.clone());
        this.restScale.set(b.name, b.scale.clone());
        this.restPos.set(b.name, b.position.clone());
        const par = b.parent!;
        const pq = rootInv.clone().multiply(par.getWorldQuaternion(new THREE.Quaternion())).invert();
        const ps = par.getWorldScale(new THREE.Vector3()).divide(root.getWorldScale(new THREE.Vector3()));
        this.parentInv.set(b.name, { q: pq, s: ps });
        const wq = b.getWorldQuaternion(new THREE.Quaternion());
        this.restInv.set(b.name, rootInv.clone().multiply(wq).invert());
      }
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        // bounds are the bind pose's: animated limbs leave them, so never cull a creature by them
        m.frustumCulled = false;
        this.meshes.push(m);
      }
    });
  }

  has(name: string) {
    return this.bones.has(boneName(name));
  }

  reset() {
    for (const [n, b] of this.bones) {
      b.quaternion.copy(this.rest.get(n)!);
      b.scale.copy(this.restScale.get(n)!);
      b.position.copy(this.restPos.get(n)!);
    }
  }

  /** rotate a bone about a model-space axis (radians), after its rest orientation and any earlier rot() this frame */
  rot(name: string, axis: THREE.Vector3, angle: number) {
    if (angle === 0) return;
    const n = boneName(name);
    const b = this.bones.get(n);
    if (!b) return;
    _a.copy(axis).applyQuaternion(this.restInv.get(n)!).normalize();
    b.quaternion.multiply(_q.setFromAxisAngle(_a, angle));
  }

  /** shorthand: pitch (about +X), yaw (about +Y), roll (about −Z, the creature's forward) */
  pitch(name: string, a: number) {
    this.rot(name, AX.x, a);
  }
  yaw(name: string, a: number) {
    this.rot(name, AX.y, a);
  }
  roll(name: string, a: number) {
    this.rot(name, AX.fwd, a);
  }

  scale(name: string, s: number | THREE.Vector3) {
    const b = this.bones.get(boneName(name));
    if (!b) return;
    const r = this.restScale.get(boneName(name))!;
    if (typeof s === 'number') b.scale.copy(r).multiplyScalar(s);
    else b.scale.copy(r).multiply(s);
  }

  /** translate a bone by a model-space offset (model units), after reset(); for bones whose parent is not posed */
  move(name: string, off: THREE.Vector3) {
    const n = boneName(name);
    const b = this.bones.get(n);
    if (!b) return;
    const pi = this.parentInv.get(n)!;
    _a.copy(off).applyQuaternion(pi.q).divide(pi.s);
    b.position.copy(this.restPos.get(n)!).add(_a);
  }

  /** world position of a bone's head */
  pos(name: string, out = new THREE.Vector3()) {
    const b = this.bones.get(boneName(name));
    if (!b) return out.set(0, 0, 0);
    return b.getWorldPosition(out);
  }
}

export const AX = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
  fwd: new THREE.Vector3(0, 0, -1),
};
