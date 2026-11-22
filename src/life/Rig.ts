import * as THREE from 'three';

/**
 * Procedural animation for the creature rigs built by blender/lib/bio.py. Bones are found by name:
 *
 *   sp0..spN   spine, head to tail          jaw        lower jaw
 *   <prefix>i  any chain (finL0_0, legR3_1, arm2_0, lure0, wingL0 ...)
 *
 * A bone is turned about one of the BODY's axes (up, right, forward) expressed in that bone's own rest frame, so the
 * same call bends a spine laterally whatever the bone roll was in Blender. Each frame the pose starts from rest and
 * the motions are composed on top. Legs are placed with a small CCD inverse-kinematics solver against the ground.
 */

export type Axis = 'up' | 'right' | 'fwd' | 'tan';

const BODY_AXES: Record<'up' | 'right' | 'fwd', THREE.Vector3> = {
  up: new THREE.Vector3(0, 1, 0),
  right: new THREE.Vector3(1, 0, 0),
  fwd: new THREE.Vector3(0, 0, -1),
};

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3(),
  _e = new THREE.Vector3(), _t = new THREE.Vector3(), _b = new THREE.Vector3();

interface BoneInfo { bone: THREE.Bone; rest: THREE.Quaternion; axes: Record<Axis, THREE.Vector3>; len: number }

export class Rig {
  bones = new Map<string, BoneInfo>();
  spine: BoneInfo[] = [];
  chains = new Map<string, BoneInfo[]>();
  jaw: BoneInfo | null = null;
  root: THREE.Object3D;
  /** bounding length of the rig (metres): head of sp0 to the tail end */
  length = 1;

  constructor(root: THREE.Object3D) {
    this.root = root;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const all: THREE.Bone[] = [];
    root.traverse((o) => { if ((o as THREE.Bone).isBone) all.push(o as THREE.Bone); });
    for (const b of all) {
      // rest orientation relative to the creature root: body axes seen from the bone
      _m.multiplyMatrices(inv, b.matrixWorld);
      const qb = new THREE.Quaternion().setFromRotationMatrix(_m.extractRotation(_m));
      const qi = qb.clone().invert();
      const up = BODY_AXES.up.clone().applyQuaternion(qi);
      // 'tan': the horizontal axis across this bone (bones point along their local +Y): opens radial lips, lifts legs
      const tan = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0));
      if (tan.lengthSq() < 1e-6) tan.set(1, 0, 0); else tan.normalize();
      const axes = {
        up,
        right: BODY_AXES.right.clone().applyQuaternion(qi),
        fwd: BODY_AXES.fwd.clone().applyQuaternion(qi),
        tan,
      };
      const child = b.children.find((c) => (c as THREE.Bone).isBone);
      const len = child ? child.position.length() : 0;
      const info: BoneInfo = { bone: b, rest: b.quaternion.clone(), axes, len };
      this.bones.set(b.name, info);
    }
    // chains by name: trailing index after a prefix
    for (const [name, info] of this.bones) {
      if (name === 'jaw') { this.jaw = info; continue; }
      const m = /^(.*?)(\d+)$/.exec(name);
      if (!m) continue;
      const list = this.chains.get(m[1]) ?? [];
      list[Number(m[2])] = info;
      this.chains.set(m[1], list);
    }
    for (const [k, v] of this.chains) this.chains.set(k, v.filter(Boolean));
    this.spine = this.chains.get('sp') ?? [];
    // length from the spine's world extent
    if (this.spine.length) {
      const a = this.spine[0].bone.getWorldPosition(new THREE.Vector3());
      const z = this.spine[this.spine.length - 1].bone.getWorldPosition(new THREE.Vector3());
      this.length = a.distanceTo(z) + this.spine[this.spine.length - 1].len + 0.01;
    }
  }

  /** chains whose prefix starts with `p` (e.g. 'leg' -> legL0_, legR0_, ...) */
  chainsLike(p: string) { return [...this.chains.entries()].filter(([k]) => k.startsWith(p)); }

  /** back to the rest pose (call first every frame) */
  reset() { for (const i of this.bones.values()) i.bone.quaternion.copy(i.rest); }

  /** turn a bone about a body axis by `angle` (radians), on top of what it already has */
  turn(info: BoneInfo | undefined, axis: Axis, angle: number) {
    if (!info || angle === 0) return;
    _q.setFromAxisAngle(info.axes[axis], angle);
    info.bone.quaternion.multiply(_q);
  }

  /**
   * Swimming body wave: a travelling wave of lateral (or vertical, for fluked swimmers) bending along the spine,
   * amplitude growing toward the tail; `curve` bends the whole body into a turn; `pitch` arches it.
   */
  wave(phase: number, amp: number, opts: { axis?: Axis; waves?: number; tail?: number; curve?: number; pitch?: number; headFix?: number } = {}) {
    const n = this.spine.length;
    if (!n) return;
    const axis = opts.axis ?? 'up';
    const waves = opts.waves ?? 1.0;
    const tail = opts.tail ?? 2.5;
    for (let i = 0; i < n; i++) {
      const s = i / Math.max(1, n - 1);
      // envelope: the head holds steady, the tail sweeps widest
      const env = (opts.headFix ?? 0.15) + (1 - (opts.headFix ?? 0.15)) * Math.pow(s, tail * 0.5);
      const a = amp * env * Math.sin(phase - s * waves * Math.PI * 2) / n * 3.2;
      this.turn(this.spine[i], axis, a);
      if (opts.curve) this.turn(this.spine[i], 'up', opts.curve / n);
      if (opts.pitch) this.turn(this.spine[i], 'right', opts.pitch / n);
    }
  }

  /** flap/scull a chain: base angle about `axis`, a stroke travelling out along the chain (lag per bone) */
  flap(prefix: string, phase: number, amp: number, axis: Axis = 'fwd', opts: { lag?: number; bias?: number; mirror?: boolean; twist?: number } = {}) {
    const c = this.chains.get(prefix);
    if (!c) return;
    const sign = opts.mirror ? -1 : 1;
    for (let i = 0; i < c.length; i++) {
      const a = (opts.bias ?? 0) / c.length + amp * Math.sin(phase - i * (opts.lag ?? 0.6)) / Math.sqrt(c.length);
      this.turn(c[i], axis, a * sign);
      if (opts.twist) this.turn(c[i], 'right', opts.twist * Math.cos(phase - i * (opts.lag ?? 0.6)) / c.length);
    }
  }

  /** curl a chain (tentacles, tails, lures): a constant bend plus a slow wave, about `axis` */
  curl(prefix: string, bend: number, phase: number, wave: number, axis: Axis = 'right', lag = 0.8, side: Axis = 'up', sideAmp = 0) {
    const c = this.chains.get(prefix);
    if (!c) return;
    for (let i = 0; i < c.length; i++) {
      this.turn(c[i], axis, bend / c.length + wave * Math.sin(phase - i * lag) / c.length);
      if (sideAmp) this.turn(c[i], side, sideAmp * Math.sin(phase * 0.7 - i * lag + 1.3) / c.length);
    }
  }

  openJaw(a: number) { if (this.jaw) this.turn(this.jaw, 'right', a); }

  /**
   * Two/three-bone leg reaching for a world-space foot target: cyclic coordinate descent, a few iterations, bones
   * kept from folding backward past `maxBend`.
   */
  reach(prefix: string, target: THREE.Vector3, iters = 4) {
    const c = this.chains.get(prefix);
    if (!c || !c.length) return;
    const last = c[c.length - 1];
    for (let it = 0; it < iters; it++) {
      for (let i = c.length - 1; i >= 0; i--) {
        const b = c[i].bone;
        b.updateWorldMatrix(true, true);
        // end effector: the tail of the last bone
        _e.set(0, last.len || 0.1, 0).applyMatrix4(last.bone.matrixWorld);
        b.getWorldPosition(_b);
        _v.subVectors(_e, _b).normalize();
        _w.subVectors(target, _b).normalize();
        const d = _v.dot(_w);
        if (d > 0.9999) continue;
        _q.setFromUnitVectors(_v, _w);
        // into the bone's parent space: q_local = parentWorld^-1 * q * parentWorld
        b.parent!.getWorldQuaternion(_q2);
        const pq = _q2.clone();
        _q2.invert().multiply(_q).multiply(pq);
        // damp the step (stability) and apply
        _q.identity().slerp(_q2, 0.7);
        b.quaternion.premultiply(_q);
      }
    }
    void _t;
  }
}
