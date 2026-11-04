import * as THREE from 'three';
import { Rig } from '../core/rig';
import { T, lin, sstep, sstep2, clamp, mix, pulse, snoise1 } from '../core/util';

const M = () => T.manor;

/** Positions (metres, manor space) used by the choreography. */
export const MAN_SPOTS = {
  start: new THREE.Vector2(0.45, 5.7),
  tv: new THREE.Vector2(2.3, 0.72),
  sofaFront: new THREE.Vector2(-1.58, 1.03),
  seat: new THREE.Vector2(-2.14, 1.03),
};

export interface LipTrack { start: number; rate: number; env: number[]; }

/** The Bulgarian man: walk -> press TV buttons (IK) -> shout -> turn -> sit -> speak. */
export class ManActor {
  rig: Rig;
  group: THREE.Object3D;
  buttons: THREE.Object3D[] = [];
  buttonRest: THREE.Vector3[] = [];
  lips: LipTrack[] = [];
  private tmp = new THREE.Vector3();

  constructor(root: THREE.Object3D, public sofaSit: (k: number) => void) {
    this.group = root;
    this.rig = new Rig(root);
  }

  /** button world targets (front face centre) */
  buttonTarget(i: number) {
    const b = this.buttons[i];
    b.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(b);
    const c = box.getCenter(new THREE.Vector3());
    c.x = box.min.x - 0.004; // front face (TV faces -x)
    return c;
  }

  private walkPath(t: number) {
    const m = M();
    const S = MAN_SPOTS;
    // segment A: doorway -> TV ; segment B: TV -> sofa front ; then sit back onto seat
    if (t < m.turn) {
      const k = sstep2(t, m.manEnter, m.manArrive);
      // slight curve so he passes the camera on its right
      const ctrl = new THREE.Vector2(0.95, 2.6);
      const a = S.start, b = S.tv;
      const u = k;
      const p = new THREE.Vector2(
        (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * ctrl.x + u * u * b.x,
        (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * ctrl.y + u * u * b.y);
      const du = Math.min(0.999, u + 0.01);
      const p2 = new THREE.Vector2(
        (1 - du) * (1 - du) * a.x + 2 * (1 - du) * du * ctrl.x + du * du * b.x,
        (1 - du) * (1 - du) * a.y + 2 * (1 - du) * du * ctrl.y + du * du * b.y);
      let yaw = Math.atan2(p2.x - p.x, p2.y - p.y);
      // settle to face the TV (+x)
      yaw = mix(yaw, Math.PI / 2, sstep(t, m.manArrive - 1.2, m.manArrive + 0.3));
      const dist = this.arcLen(a, ctrl, b, u);
      return { x: p.x, z: p.y, yaw, dist, walking: k > 0 && k < 1 };
    }
    // turn toward the room (through facing the camera), walk to the sofa
    const k = sstep2(t, m.walkSofa, m.sitStart - 0.1);
    const a = S.tv, b = S.sofaFront;
    const x = mix(a.x, b.x, k), z = mix(a.y, b.y, k) + Math.sin(k * Math.PI) * 0.35;
    let yaw = mix(Math.PI / 2, -Math.PI / 2, sstep(t, m.turn, m.walkSofa + 0.4));
    // turn around to sit (through facing camera again)
    yaw = mix(yaw, Math.PI / 2, sstep(t, m.sitStart - 0.55, m.sitStart + 0.35));
    const dist = 6 + k * 4.1;
    return { x, z, yaw, dist, walking: k > 0.0 && k < 1 };
  }

  private arcLen(a: THREE.Vector2, c: THREE.Vector2, b: THREE.Vector2, u: number) {
    let L = 0, prev = a.clone();
    const n = 24;
    for (let i = 1; i <= n; i++) {
      const s = (i / n) * u;
      const p = new THREE.Vector2((1 - s) ** 2 * a.x + 2 * (1 - s) * s * c.x + s * s * b.x, (1 - s) ** 2 * a.y + 2 * (1 - s) * s * c.y + s * s * b.y);
      L += p.distanceTo(prev); prev = p;
    }
    return L;
  }

  lipEnv(t: number) {
    for (const L of this.lips) {
      const i = (t - L.start) * L.rate;
      if (i >= 0 && i < L.env.length - 1) {
        const f = i - Math.floor(i);
        return mix(L.env[Math.floor(i)], L.env[Math.floor(i) + 1], f);
      }
    }
    return 0;
  }

  update(t: number) {
    const m = M();
    const R = this.rig;
    R.reset();
    const visible = t >= m.manEnter - 0.2;
    this.group.visible = visible;
    if (!visible) return;
    const P = this.walkPath(t);
    // --- sitting blend
    const sit = sstep(t, m.sitStart, m.sitImpact);
    const sitBounce = Math.exp(-Math.max(0, t - m.sitImpact) * 6) * Math.sin(Math.max(0, t - m.sitImpact) * 18) * 0.025 * (t > m.sitImpact ? 1 : 0);
    const rx = mix(P.x, MAN_SPOTS.seat.x, sit), rz = P.z;
    const rootY = mix(0, -0.418, sstep(sit, 0.0, 1.0)) - sitBounce;
    this.group.position.set(rx, rootY, rz);
    // he half-turns toward the doorway (his wife) while shouting line 1
    const turnDoor = pulse(t, m.line1 - 0.5, m.line1 + 3.7, 0.5);
    this.group.rotation.set(0, P.yaw - 0.95 * turnDoor, 0);
    this.sofaSit(clamp(sstep(t, m.sitImpact - 0.25, m.sitImpact) * 1.0 + sitBounce * 4));

    // --- walk cycle (1.4 m per full stride cycle)
    const walkAmt = P.walking ? 1 : 0;
    const wk = mix(0, 1, walkAmt) * (1 - sit);
    const ph = (P.dist / 1.42) * Math.PI * 2;
    const s = Math.sin(ph), c = Math.cos(ph);
    const kneeL = 0.06 + 0.7 * Math.max(0, Math.cos(ph + 0.6)) ** 2;
    const kneeR = 0.06 + 0.7 * Math.max(0, Math.cos(ph + Math.PI + 0.6)) ** 2;
    R.rot('thigh.L', -0.42 * s * wk);
    R.rot('thigh.R', 0.42 * s * wk);
    R.rot('shin.L', kneeL * wk);
    R.rot('shin.R', kneeR * wk);
    R.rot('foot.L', (0.18 * Math.max(0, Math.sin(ph + 1.2)) - 0.12 * Math.max(0, -s)) * wk);
    R.rot('foot.R', (0.18 * Math.max(0, Math.sin(ph + Math.PI + 1.2)) - 0.12 * Math.max(0, s)) * wk);
    R.move('hips', 0, (-0.022 * Math.abs(c) + 0.008) * wk, 0);
    R.rot('hips', 0.03 * wk, 0.07 * s * wk, 0.03 * c * wk);
    R.rot('spine', 0.05 * wk, -0.05 * s * wk, 0);
    R.rot('chest', 0, -0.06 * s * wk, 0);

    // breathing / idle
    const br = Math.sin(t * 1.7) * 0.012;
    R.rot('chest', br, 0, 0);

    // --- arms default (hanging, natural)
    const irritated = pulse(t, m.manArrive - 0.5, m.turn + 0.3, 0.6);
    let armL = { x: 0.3 * s * wk - 0.08, y: 0, z: 0.12 }, armR = { x: -0.3 * s * wk - 0.08, y: 0, z: -0.12 };
    let farmL = -0.32 - 0.2 * wk, farmR = -0.32 - 0.2 * wk;

    // --- line 1 gesture: turns toward the doorway (his right), left hand flung at the TV
    const l1 = pulse(t, m.line1 - 0.45, m.line1 + 3.9, 0.45);
    const shout = pulse(t, m.line1 - 0.1, m.line1 + 3.4, 0.25);
    armL = { x: mix(armL.x, -0.75, l1), y: mix(0, -0.35, l1), z: mix(armL.z, 0.52, l1) };
    farmL = mix(farmL, -1.15 + 0.25 * Math.sin(t * 9) * shout, l1);
    R.rot('uparm.L', armL.x, armL.y, armL.z);
    R.rot('farm.L', farmL, 0, 0);
    R.rot('hand.L', 0, 0, 0.3 * l1);

    // --- head / torso attitude
    const lookDoor = l1;
    const tilt = pulse(t, m.headTilt, m.headTilt + 1.3, 0.3);
    const lookTv = pulse(t, m.logo - 0.1, m.turn + 0.2, 0.25);
    R.rot('chest', 0, -0.15 * lookDoor, 0);
    R.rot('neck', -0.05 * lookDoor + 0.06 * irritated, -0.3 * lookDoor, -0.18 * tilt);
    R.rot('head', -0.12 * shout + 0.08 * lookTv, 0.1 * Math.sin(t * 7) * shout * 0.4, 0.06 * tilt);
    // surprised step back when the logo appears
    const startle = pulse(t, m.logo, m.turn + 0.1, 0.2);
    R.rot('spine', -0.08 * startle, 0, 0);

    // --- sitting pose
    if (sit > 0) {
      const k = sit;
      R.rot('thigh.L', -1.5 * k, 0.05 * k, 0.12 * k);
      R.rot('thigh.R', -1.5 * k, -0.05 * k, -0.12 * k);
      R.rot('shin.L', 1.45 * k);
      R.rot('shin.R', 1.45 * k);
      R.rot('foot.L', 0.05 * k);
      R.rot('foot.R', 0.05 * k);
      R.rot('hips', -0.12 * k * (1 - pulse(t, m.sitStart, m.sitImpact, 0.4) * 0.5) + 0.25 * pulse(t, m.sitStart, m.sitImpact + 0.1, 0.35), 0, 0);
      R.rot('spine', -0.06 * k, 0, 0);
      armL = { x: -0.42 * k, y: 0, z: 0.16 * k };
      armR = { x: -0.42 * k, y: 0, z: -0.16 * k };
      farmL = mix(farmL, -0.95, k); farmR = mix(farmR, -0.95, k);
      R.rot('uparm.L', armL.x, 0, armL.z);
      R.rot('farm.L', farmL);
      // line 2: skeptical head tilt + palm-up gesture with the right hand
      const l2 = pulse(t, m.line2 - 0.3, m.line2 + 3.2, 0.35);
      R.rot('neck', 0.04 * l2, 0.12 * l2, 0.14 * l2);
      R.rot('head', -0.06 * l2, 0.08 * Math.sin(t * 2.5) * l2, 0);
      armR = { x: mix(armR.x, -0.8, l2), y: 0, z: mix(armR.z, -0.3, l2) };
      farmR = mix(farmR, -1.3 + 0.12 * Math.sin(t * 6) * l2, l2);
    }

    R.rot('uparm.R', armR.x, armR.y, armR.z);
    R.rot('farm.R', farmR, 0, 0);
    // pointing hand (index extended, thumb tucked)
    R.rot('thumb.R', 0, 0, 0.3);
    R.rot('thumb.L', 0, 0, -0.3);

    // --- button presses: right-arm IK onto the physical buttons
    this.group.updateMatrixWorld(true);
    const presses = [[m.press1, 0], [m.press2, 0], [m.press3, 2], [m.press4, 0]] as [number, number][];
    let reach = 0, bi = 0, push = 0;
    for (const [tp, b] of presses) {
      const w = pulse(t, tp - 0.75, tp + 0.55, 0.42);
      if (w > reach) { reach = w; bi = b; }
      push = Math.max(push, this.pressCurve(t, tp));
    }
    reach = Math.max(reach, 0) * (1 - sit);
    if (this.buttons.length) {
      for (let i = 0; i < this.buttons.length; i++) this.buttons[i].position.copy(this.buttonRest[i]);
      // button travel 7 mm (into the panel = -z in TV local space)
      if (push > 0) this.buttons[bi].position.z = this.buttonRest[bi].z - 0.007 * push;
      if (reach > 0.001) {
        R.rot('spine', 0.1 * reach, 0.12 * reach, 0);
        R.rot('hips', 0.04 * reach);
        this.group.updateMatrixWorld(true);
        const tgt = this.buttonTarget(bi).clone();
        tgt.x -= 0.012 * (1 - push) - 0.002; // fingertip meets the cap then pushes
        const tip = () => {
          const h = R.wpos('hand.R'), f = R.wpos('finger.R');
          return f.clone().add(f.clone().sub(h).multiplyScalar(0.95));
        };
        const pole = new THREE.Vector3(0.0, -0.6, 1.0).normalize();
        R.ik2('uparm.R', 'farm.R', tip, tgt, pole, sstep(reach, 0, 1));
      }
    }

    // --- face morphs
    const env = this.lipEnv(t);
    R.setMorph('MouthOpen', clamp(env * 1.25));
    R.setMorph('Brow', clamp(0.85 * irritated + 0.6 * pulse(t, m.line2 - 0.4, m.line2 + 3.3, 0.4) + 0.1 * snoise1(t)));
  }

  pressCurve(t: number, tp: number) {
    // fingertip contact at tp: 0.12 s travel down, short hold, 0.16 s spring return
    if (t < tp - 0.02 || t > tp + 0.42) return 0;
    if (t < tp + 0.1) return sstep(t, tp - 0.02, tp + 0.1);
    if (t < tp + 0.22) return 1;
    return 1 - sstep(t, tp + 0.22, tp + 0.42);
  }
}
