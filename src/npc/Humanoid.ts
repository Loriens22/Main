import * as THREE from 'three';
import { Model } from '../render/Assets';
import { materials } from '../render/Materials';
import { clamp, damp } from '../core/math';

export type PoseName = 'stand' | 'walk' | 'sit' | 'operate' | 'kneel' | 'float' | 'lie' | 'talk' | 'point' | 'inspect';

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperarm_r', 'forearm_r', 'hand_r', 'upperarm_l', 'forearm_l', 'hand_l', 'thigh_r', 'shin_r', 'foot_r', 'thigh_l', 'shin_l', 'foot_l'] as const;
type BoneName = (typeof BONES)[number];

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();

export interface Appearance {
  shirt?: string; pants?: string; skin?: string; hair?: string; hat?: string | null; longHair?: boolean; helmet?: boolean; suit?: string; scale?: number; width?: number;
}

/**
 * Procedurally animated humanoid on the shared skeleton exported from Blender.
 * Poses are authored as per-bone rotations in character space (X right, Y up, forward -Z) relative to the
 * parent's posed frame, so they are independent of bone roll: local = Rparent^-1 * Q * Rbone.
 */
export class Humanoid {
  root: THREE.Object3D;
  private bone = {} as Record<BoneName, THREE.Bone>;
  private R = {} as Record<BoneName, THREE.Quaternion>;
  private Rp = {} as Record<BoneName, THREE.Quaternion>;
  private cur = {} as Record<BoneName, THREE.Quaternion>;
  private tgt = {} as Record<BoneName, THREE.Quaternion>;
  private hipsRest = new THREE.Vector3();
  private hipsOff = 0;
  private hipsOffT = 0;
  pose: PoseName = 'stand';
  /** ground speed for the gait cycle (m/s) */
  speed = 0;
  phase = Math.random() * 6;
  private t = Math.random() * 100;
  /** point in world space the head turns toward (null = straight ahead) */
  lookAt: THREE.Vector3 | null = null;
  /** restricted movement in a pressure suit */
  suited = false;
  height = 1.8;

  constructor(public model: Model, look: Appearance = {}) {
    this.root = model.root;
    this.root.updateMatrixWorld(true);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const n of BONES) {
      const b = this.root.getObjectByName(n) as THREE.Bone;
      if (!b) throw new Error(`humanoid: missing bone ${n}`);
      this.bone[n] = b;
      this.R[n] = rootQ.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
      this.Rp[n] = rootQ.clone().multiply(b.parent!.getWorldQuaternion(new THREE.Quaternion())).invert();
      this.cur[n] = new THREE.Quaternion();
      this.tgt[n] = new THREE.Quaternion();
    }
    this.hipsRest.copy(this.bone.hips.position);
    this.suited = model.name.includes('astronaut');
    this.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; } });
    this.setAppearance(look);
  }

  setAppearance(a: Appearance) {
    const swap: Record<string, string | undefined> = {
      cloth_plaid: a.shirt, cloth_denim: a.pants, skin: a.skin, hair_brown: a.hair, cloth_khaki: a.hat ?? undefined, suit_white: a.suit,
    };
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = (m.material as THREE.Material).name;
      const to = swap[name];
      if (to && materials.has(to)) m.material = materials.get(to, !!m.geometry.attributes.color);
    });
    const show = (part: string, v: boolean) => { const p = this.model.part(part); if (p) p.visible = v; };
    show('cap', a.hat !== null && a.hat !== undefined && !this.suited);
    show('hair_long', !!a.longHair);
    show('hair', !a.longHair && !(this.suited && a.helmet !== false));
    show('helmet', a.helmet !== false && this.suited);
    const s = a.scale ?? 1, w = a.width ?? 1;
    this.root.scale.set(s * w, s, s * w);
    this.height = 1.8 * s;
  }

  setHelmet(on: boolean) {
    const p = this.model.part('helmet');
    if (p) p.visible = on;
    const h = this.model.part('hair');
    if (h) h.visible = !on;
  }

  private set(n: BoneName, x = 0, y = 0, z = 0) {
    this.tgt[n].setFromEuler(_e.set(x, y, z, 'YXZ'));
  }

  /** Fill target rotations for the current pose. Angles in radians, character space. */
  private solve(dt: number) {
    const t = this.t, s = Math.sin, c = Math.cos;
    const stiff = this.suited ? 0.72 : 1;
    for (const n of BONES) this.tgt[n].identity();
    this.hipsOffT = 0;
    const breathe = s(t * 1.25) * 0.012;
    switch (this.pose) {
      case 'walk': {
        const v = Math.abs(this.speed);
        const run = clamp((v - 2.6) / 2.5, 0, 1);
        const A = (0.32 + 0.22 * Math.min(1, v / 1.6) + 0.35 * run) * stiff;
        const ph = this.phase;
        this.set('thigh_r', A * s(ph) + 0.05 * run); this.set('thigh_l', -A * s(ph) + 0.05 * run);
        this.set('shin_r', -(0.08 + (0.75 + 0.6 * run) * Math.max(0, c(ph))) * stiff); this.set('shin_l', -(0.08 + (0.75 + 0.6 * run) * Math.max(0, -c(ph))) * stiff);
        this.set('foot_r', 0.12 * c(ph)); this.set('foot_l', -0.12 * c(ph));
        const arm = (0.38 + 0.5 * run) * stiff;
        this.set('upperarm_r', -arm * s(ph), 0, 0.06); this.set('upperarm_l', arm * s(ph), 0, -0.06);
        this.set('forearm_r', 0.18 + 0.9 * run + 0.12 * Math.max(0, -s(ph))); this.set('forearm_l', 0.18 + 0.9 * run + 0.12 * Math.max(0, s(ph)));
        this.set('spine', -0.03 - 0.12 * run, 0.07 * s(ph)); this.set('hips', 0, -0.05 * s(ph), 0.02 * c(ph));
        this.hipsOffT = -0.018 * Math.abs(s(ph)) - 0.02 * run;
        break;
      }
      case 'sit':
        this.set('thigh_r', 1.5, 0, 0.06); this.set('thigh_l', 1.5, 0, -0.06);
        this.set('shin_r', -1.5); this.set('shin_l', -1.5);
        this.set('spine', 0.04 + breathe); this.set('chest', -0.02);
        this.set('upperarm_r', 0.42, 0, 0.1); this.set('upperarm_l', 0.42, 0, -0.1);
        this.set('forearm_r', 0.95); this.set('forearm_l', 0.95);
        this.hipsOffT = -0.42;
        break;
      case 'operate': {
        const j = s(t * 6.3) * 0.05, k = s(t * 4.9 + 1) * 0.05;
        this.set('upperarm_r', 0.75 + j * 0.3, 0, 0.12); this.set('upperarm_l', 0.75 + k * 0.3, 0, -0.12);
        this.set('forearm_r', 0.75 + j); this.set('forearm_l', 0.75 + k);
        this.set('hand_r', 0.2 + j); this.set('hand_l', 0.2 + k);
        this.set('spine', -0.08 + breathe); this.set('neck', -0.12); this.set('head', -0.14);
        break;
      }
      case 'inspect':
        this.set('spine', -0.42 + breathe); this.set('chest', -0.2); this.set('head', -0.2);
        this.set('thigh_r', 0.35); this.set('thigh_l', 0.35); this.set('shin_r', -0.35); this.set('shin_l', -0.35);
        this.set('upperarm_r', 1.0 + s(t * 1.4) * 0.08, 0, 0.1); this.set('forearm_r', 0.5 + s(t * 2.3) * 0.15);
        this.set('upperarm_l', 0.25, 0, -0.1); this.set('forearm_l', 0.4);
        this.hipsOffT = -0.06;
        break;
      case 'kneel': {
        const j = s(t * 3.1) * 0.12;
        this.set('thigh_r', 1.55); this.set('shin_r', -1.75);
        this.set('thigh_l', 0.15); this.set('shin_l', -1.9); this.set('foot_l', -0.6);
        this.set('spine', -0.28 + breathe); this.set('chest', -0.12); this.set('head', -0.2);
        this.set('upperarm_r', 1.05 + j * 0.4, 0, 0.1); this.set('forearm_r', 0.55 + j);
        this.set('upperarm_l', 0.9 - j * 0.3, 0, -0.1); this.set('forearm_l', 0.6 - j);
        this.hipsOffT = -0.47;
        break;
      }
      case 'float': {
        // neutral body posture in weightlessness
        const w = s(t * 0.5) * 0.06;
        this.set('thigh_r', 0.55 + w, 0, 0.08); this.set('thigh_l', 0.5 - w, 0, -0.08);
        this.set('shin_r', -0.85); this.set('shin_l', -0.8);
        this.set('foot_r', 0.5); this.set('foot_l', 0.5);
        this.set('spine', -0.12); this.set('head', -0.08);
        this.set('upperarm_r', 0.75 + w, 0, 0.3); this.set('upperarm_l', 0.7 - w, 0, -0.3);
        this.set('forearm_r', 0.8); this.set('forearm_l', 0.8);
        break;
      }
      case 'lie':
        this.set('upperarm_r', 0, 0, 0.05); this.set('upperarm_l', 0, 0, -0.05);
        this.set('chest', breathe * 1.5);
        break;
      case 'talk': {
        const g1 = s(t * 2.1) * 0.25, g2 = s(t * 1.3 + 2) * 0.2;
        this.set('upperarm_r', 0.3 + g2 * 0.4, 0, 0.12); this.set('forearm_r', 1.0 + g1);
        this.set('hand_r', 0.1 + g1 * 0.5, g2);
        this.set('upperarm_l', 0.05, 0, -0.08); this.set('forearm_l', 0.2);
        this.set('spine', breathe, s(t * 0.6) * 0.05); this.set('hips', 0, 0, s(t * 0.35) * 0.02);
        break;
      }
      case 'point':
        this.set('upperarm_r', 1.35, 0, 0.1); this.set('forearm_r', 0.1);
        this.set('upperarm_l', 0, 0, -0.07); this.set('forearm_l', 0.15);
        this.set('spine', breathe);
        break;
      default:
        this.set('spine', breathe, 0, 0); this.set('chest', breathe * 0.5);
        this.set('hips', 0, 0, s(t * 0.37) * 0.018);
        this.set('upperarm_r', 0.02, 0, 0.07); this.set('upperarm_l', 0.02, 0, -0.07);
        this.set('forearm_r', 0.14); this.set('forearm_l', 0.14);
        this.set('thigh_r', 0, 0, 0.03); this.set('thigh_l', 0, 0, -0.03);
    }
    // head tracking
    if (this.lookAt && this.pose !== 'lie') {
      _v.copy(this.lookAt);
      this.root.worldToLocal(_v);
      _v.y -= 1.7;
      const yaw = clamp(Math.atan2(-_v.x, -_v.z), -1.1, 1.1);
      const pitch = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.5, 0.6);
      _q.setFromEuler(_e.set(pitch * 0.6, yaw * 0.65, 0, 'YXZ'));
      this.tgt.head.multiply(_q);
      _q.setFromEuler(_e.set(pitch * 0.25, yaw * 0.3, 0, 'YXZ'));
      this.tgt.neck.multiply(_q);
    }
    void dt;
  }

  update(dt: number) {
    this.t += dt;
    if (this.pose === 'walk') this.phase += (Math.abs(this.speed) * dt * Math.PI * 2) / (this.speed > 2.6 ? 2.3 : 1.45);
    this.solve(dt);
    const k = 1 - Math.exp(-(this.pose === 'walk' ? 16 : 7) * dt);
    for (const n of BONES) {
      this.cur[n].slerp(this.tgt[n], k);
      this.bone[n].quaternion.copy(this.Rp[n]).multiply(this.cur[n]).multiply(this.R[n]);
    }
    this.hipsOff = damp(this.hipsOff, this.hipsOffT, 7, dt);
    _v.set(0, this.hipsOff, 0).applyQuaternion(this.Rp.hips);
    this.bone.hips.position.copy(this.hipsRest).add(_v);
  }

  /** World position of a bone (e.g. to attach props or find the head). */
  bonePos(n: BoneName, out: THREE.Vector3) { return this.bone[n].getWorldPosition(out); }
}

void X; void Y; void Z; void _q2;
