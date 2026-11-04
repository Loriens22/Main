import * as THREE from 'three';

/** Procedural skeletal animation.
 *  Deltas are Euler angles expressed in the character's MODEL axes at rest
 *  (+Y up, facing +Z, character-left = +X), so poses read the same regardless of
 *  how Blender/glTF oriented each bone:  L' = L_rest * C^-1 * D * C. */
export class Rig {
  root: THREE.Object3D;
  bones: Record<string, THREE.Bone> = {};
  rest: Record<string, THREE.Quaternion> = {};
  restPos: Record<string, THREE.Vector3> = {};
  C: Record<string, THREE.Quaternion> = {};
  Ci: Record<string, THREE.Quaternion> = {};
  mesh: THREE.SkinnedMesh | null = null;
  morph: Record<string, number> = {};
  private _q = new THREE.Quaternion();
  private _e = new THREE.Euler();

  constructor(root: THREE.Object3D) {
    this.root = root;
    root.updateMatrixWorld(true);
    const rootQi = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    root.traverse((o: any) => {
      if (o.isBone) {
        // glTF loader strips '.' from node names: 'uparm.R' -> 'uparmR'
        this.bones[o.name] = o;
        this.rest[o.name] = o.quaternion.clone();
        this.restPos[o.name] = o.position.clone();
        const wq = o.getWorldQuaternion(new THREE.Quaternion());
        this.C[o.name] = rootQi.clone().multiply(wq);
        this.Ci[o.name] = this.C[o.name].clone().invert();
      }
      if (o.isSkinnedMesh) {
        if (!this.mesh) this.mesh = o;
        o.frustumCulled = false;
      }
    });
    if (this.mesh?.morphTargetDictionary) this.morph = { ...this.mesh.morphTargetDictionary } as any;
  }

  /** resolve 'uparm.R' style names against sanitised glTF names */
  key(n: string) { return this.bones[n] ? n : n.replace(/[.:\/\[\]]/g, ''); }

  reset() {
    for (const n in this.bones) {
      this.bones[n].quaternion.copy(this.rest[n]);
      this.bones[n].position.copy(this.restPos[n]);
    }
  }

  /** apply model-axis Euler delta [x,y,z] (radians) to bone n */
  rot(n: string, x = 0, y = 0, z = 0, order: THREE.EulerOrder = 'YXZ') {
    n = this.key(n);
    const b = this.bones[n];
    if (!b) return;
    this._e.set(x, y, z, order);
    this._q.setFromEuler(this._e);
    const d = this.Ci[n].clone().multiply(this._q).multiply(this.C[n]);
    b.quaternion.copy(this.rest[n]).multiply(d);
  }

  /** translate a bone in model axes (used for pelvis/hips offsets) */
  move(n: string, x = 0, y = 0, z = 0) {
    n = this.key(n);
    const b = this.bones[n];
    if (!b || !b.parent) return;
    const v = new THREE.Vector3(x, y, z);
    // convert model-space offset into the parent's local frame
    const pq = this.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion()));
    v.applyQuaternion(pq.invert());
    const ps = b.parent.getWorldScale(new THREE.Vector3()).divide(this.root.getWorldScale(new THREE.Vector3()));
    v.divide(ps);
    b.position.copy(this.restPos[n]).add(v);
  }

  setMorph(name: string, v: number) {
    const i = this.morph[name];
    if (i !== undefined && this.mesh) this.mesh.morphTargetInfluences![i] = v;
  }

  wpos(n: string, out = new THREE.Vector3()) {
    n = this.key(n);
    return this.bones[n].getWorldPosition(out);
  }

  /** rotate bone so that the world vector from it to `from` turns toward `to` */
  aimDelta(n: string, from: THREE.Vector3, to: THREE.Vector3, weight = 1) {
    n = this.key(n);
    const b = this.bones[n];
    const o = b.getWorldPosition(new THREE.Vector3());
    const a = from.clone().sub(o).normalize();
    const c = to.clone().sub(o).normalize();
    const dq = new THREE.Quaternion().setFromUnitVectors(a, c);
    if (weight < 1) dq.slerp(new THREE.Quaternion(), 1 - weight);
    const wq = b.getWorldQuaternion(new THREE.Quaternion());
    const pq = b.parent!.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(pq.invert().multiply(dq.multiply(wq)));
    b.updateMatrixWorld(true);
  }

  /** two-bone IK: upper(n1) -> lower(n2) -> effector point (tip of chain).
   *  pole: world direction the elbow/knee should bend toward. */
  ik2(n1: string, n2: string, tip: () => THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, weight = 1) {
    n1 = this.key(n1); n2 = this.key(n2);
    if (weight <= 0) return;
    this.root.updateMatrixWorld(true);
    const S = this.wpos(n1), E = this.wpos(n2), F = tip();
    const a = S.distanceTo(E), b = E.distanceTo(F);
    const P = F.clone().lerp(target, weight);
    const d = Math.min(S.distanceTo(P), a + b - 1e-4);
    const dir = P.clone().sub(S).normalize();
    // elbow position in the plane spanned by dir and pole
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const Et = S.clone().add(dir.clone().multiplyScalar(a * cosA)).add(pp.multiplyScalar(a * sinA));
    this.aimDelta(n1, E, Et);
    this.root.updateMatrixWorld(true);
    const F2 = tip();
    this.aimDelta(n2, F2, P);
  }
}

export function findRig(obj: THREE.Object3D) {
  return new Rig(obj);
}
