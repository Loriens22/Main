// ---------------------------------------------------------------------------
// Procedural character animation.
//
// Instead of baked clips, every frame the pose is synthesised from layered,
// continuously blended controllers, which adapt automatically to any body
// proportion the generator produces (a 1.2 m child or a 6 m giant):
//   - locomotion: phase-driven gait with foot trajectories (stance/swing),
//     hip bob/sway/twist, arm swing and forward lean, blended walk <-> run
//     by speed; direction-aware for strafing/backpedalling,
//   - legs: analytic two-bone IK with knee pole vectors onto ground height
//     samples (feet adapt to slopes and stairs), hips drop if needed,
//   - idle: breathing, weight shifts, micro head motion,
//   - air (jump anticipation/tuck/landing squash), crouch, sit, swim,
//   - upper-body gesture overlays (wave, point, shrug, cheer, clap, dance,
//     talk, nod, headshake, bow, think, thumbs-up),
//   - look-at for neck/head/eyes, blinking eyelids, jaw motion when talking.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { B, A_POSE } from './rig.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

const smooth = (cur, target, dt, speed) => cur + (target - cur) * (1 - Math.exp(-dt * speed));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (t) => t * t * (3 - 2 * t);

function qEuler(x, y, z, order = 'XYZ', out = new THREE.Quaternion()) {
  _e.set(x, y, z, order);
  return out.setFromEuler(_e);
}

// Rotation mapping basis (a0,b0) onto (a1,b1): R = [a1 b1 c1] * [a0 b0 c0]^T
function basisRotation(a0, b0, a1, b1, out) {
  const c0 = new THREE.Vector3().crossVectors(a0, b0);
  const c1 = new THREE.Vector3().crossVectors(a1, b1);
  _m.makeBasis(a1, b1, c1);
  _m2.makeBasis(a0, b0, c0).transpose();
  _m.multiply(_m2);
  return out.setFromRotationMatrix(_m);
}

export class Animator {
  constructor(h) {
    this.h = h;
    this.bones = h.bones;
    this.rest = h.rest;
    this.J = h.J;
    this.P = h.P;
    this.phase = 0;
    this.time = Math.random() * 100;
    this.w = { move: 0, run: 0, air: 0, crouch: 0, sit: 0, swim: 0, gesture: 0 };
    this.speedS = 0;
    this.dirAngle = 0;
    this.lookYaw = 0; this.lookPitch = 0;
    this.eyeYaw = 0; this.eyePitch = 0;
    this.blinkT = 2 + Math.random() * 3; this.blinkPhase = -1;
    this.jumpT = -1; this.landT = -1; this.landAmt = 0;
    this.pose = null; this.poseData = null;
    this.gest = null; this.gestT = 0; this.gestDur = 0;
    this.talkT = 0; this.jaw = 0;
    this.hipsOffset = new THREE.Vector3();
    this.idleSeed = Math.random() * 10;
    this.q = this.bones.map(() => new THREE.Quaternion());
    // Leg rest geometry.
    this.L1 = this.rest.len.thighL; this.L2 = this.rest.len.shinL;
    this.hipRel = { L: this.J.thighL.clone().sub(this.J.hips), R: this.J.thighR.clone().sub(this.J.hips) };
    // Elbow flexion axes in the upper arm's local (rest) frame.
    this.elbowAxis = {
      L: new THREE.Vector3().crossVectors(this.rest.dir.armL, Z).normalize(),
      R: new THREE.Vector3().crossVectors(this.rest.dir.armR, Z).normalize(),
    };
    this.kneeAxis = new THREE.Vector3(1, 0, 0);
    this.footFlat = { L: this.J.footL.y, R: this.J.footR.y };
    this.armRest = A_POSE - (0.14 + this.P.fat * 0.14 + this.P.muscle * 0.1);
  }

  jump() { this.jumpT = 0; }
  land(v) { this.landT = 0; this.landAmt = clamp(v / 12, 0.2, 1); }
  setPose(name, data) { this.pose = name; this.poseData = data || null; }
  gesture(name, dur = 2.5) { this.gest = name; this.gestT = 0; this.gestDur = dur; }
  talk(sec) { this.talkT = Math.max(this.talkT, sec); }

  // state: { speed, moveAngle, grounded, crouch, sprint, swim, yawRate, look: Vector3|null (character-space target), lookPitch, groundAt(x,z) }
  update(dt, st) {
    this.time += dt;
    const P = this.P, H = P.H, t = this.time;
    const scale = H / 1.8;
    // ---- Blend weights ----
    const speed = st.speed || 0;
    this.speedS = smooth(this.speedS, speed, dt, 8);
    const sp = this.speedS / Math.max(0.3, scale);
    const w = this.w;
    const inAir = !st.grounded && !st.swim;
    w.move = smooth(w.move, clamp(sp / 1.2, 0, 1), dt, 8);
    w.run = smooth(w.run, clamp((sp - 3.2) / 2.2, 0, 1), dt, 5);
    w.air = smooth(w.air, inAir ? 1 : 0, dt, inAir ? 10 : 14);
    w.crouch = smooth(w.crouch, st.crouch ? 1 : 0, dt, 9);
    w.sit = smooth(w.sit, this.pose === 'sit' ? 1 : 0, dt, 5);
    w.swim = smooth(w.swim, st.swim ? 1 : 0, dt, 4);
    if (st.moveAngle !== undefined && this.speedS > 0.2) {
      let da = st.moveAngle - this.dirAngle;
      while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      this.dirAngle += da * (1 - Math.exp(-dt * 10));
    }
    // ---- Gait phase ----
    const stride = (1.35 + w.run * 1.3) * scale * (0.85 + 0.3 * P.legRatio / 0.505);
    this.phase = (this.phase + (this.speedS / stride) * dt + (w.move < 0.05 && Math.abs(st.yawRate || 0) > 1 ? dt * 1.2 : 0)) % 1;
    const ph = this.phase;
    const TAU = Math.PI * 2;
    // ---- Timers ----
    if (this.jumpT >= 0) { this.jumpT += dt; if (this.jumpT > 0.4) this.jumpT = -1; }
    if (this.landT >= 0) { this.landT += dt; if (this.landT > 0.35) this.landT = -1; }
    if (this.gest) { this.gestT += dt; if (this.gestT > this.gestDur) this.gest = null; }
    w.gesture = smooth(w.gesture, this.gest ? 1 : 0, dt, 6);
    this.talkT = Math.max(0, this.talkT - dt);

    // ================= Compute pose =================
    const q = this.q;
    for (const x of q) x.identity();
    const hipsOff = this.hipsOffset.set(0, 0, 0);
    let hipsPitch = 0, hipsYaw = 0, hipsRoll = 0;
    let spinePitch = 0, spineYaw = 0, spineRoll = 0, chestPitch = 0, chestYaw = 0, chestRoll = 0;
    let neckPitch = 0, neckYaw = 0, headPitch = 0, headYaw = 0, headRoll = 0;
    const arm = {
      L: { down: this.armRest, swing: 0.05, twist: 0, elbow: 0.22, wrist: 0, wristTwist: 0, clavZ: 0, clavY: 0 },
      R: { down: this.armRest, swing: 0.05, twist: 0, elbow: 0.22, wrist: 0, wristTwist: 0, clavZ: 0, clavY: 0 },
    };
    // Idle: breathing & weight shift.
    const breath = Math.sin(t * 1.6 + this.idleSeed);
    chestPitch -= breath * 0.012;
    arm.L.clavZ += breath * 0.012; arm.R.clavZ -= breath * 0.012;
    const idleW = (1 - w.move) * (1 - w.sit) * (1 - w.air);
    const shift = Math.sin(t * 0.45 + this.idleSeed * 3);
    hipsOff.x += shift * 0.018 * scale * idleW;
    hipsRoll += shift * 0.025 * idleW;
    spineRoll -= shift * 0.02 * idleW;
    headYaw += Math.sin(t * 0.31 + this.idleSeed) * 0.06 * idleW + Math.sin(t * 0.97) * 0.015;
    headPitch += Math.sin(t * 0.23 + this.idleSeed * 2) * 0.04 * idleW;
    arm.L.swing += Math.sin(t * 0.7 + 1) * 0.02 * idleW; arm.R.swing += Math.sin(t * 0.63 + 2) * 0.02 * idleW;

    // Locomotion.
    const mw = w.move * (1 - w.sit) * (1 - w.swim);
    const run = w.run;
    const bobA = (0.022 + run * 0.03) * scale;
    // Walk: hips highest at mid-stance; run: lowest at mid-stance.
    const bob = Math.cos((ph * 2 - 0.3) * TAU);
    hipsOff.y += mw * (bob * bobA * (1 - run * 2) - (0.018 + run * 0.06) * scale);
    hipsOff.x += mw * Math.sin(ph * TAU) * (0.03 - run * 0.02) * scale;
    hipsYaw += mw * Math.sin(ph * TAU) * (0.09 + run * 0.05);
    hipsRoll += mw * Math.sin(ph * TAU + 1.2) * 0.045;
    chestYaw -= mw * Math.sin(ph * TAU) * (0.12 + run * 0.1);
    spinePitch += mw * (0.035 + run * 0.16) * Math.cos(this.dirAngle);
    const aSwing = (0.32 + run * 0.55) * mw * Math.cos(this.dirAngle);
    arm.L.swing += -aSwing * Math.cos(ph * TAU);
    arm.R.swing += aSwing * Math.cos(ph * TAU);
    arm.L.elbow += mw * (0.15 + run * 1.1 + Math.max(0, -Math.cos(ph * TAU)) * 0.25);
    arm.R.elbow += mw * (0.15 + run * 1.1 + Math.max(0, Math.cos(ph * TAU)) * 0.25);
    arm.L.down += mw * run * 0.12; arm.R.down += mw * run * 0.12;
    headPitch -= mw * run * 0.08;
    headYaw -= hipsYaw * 0.5 + chestYaw * 0.6;

    // Crouch.
    const cw = w.crouch * (1 - w.sit);
    hipsOff.y -= cw * 0.36 * scale * (1 - w.air);
    spinePitch += cw * 0.32; chestPitch += cw * 0.1; headPitch -= cw * 0.3;
    arm.L.swing += cw * 0.35; arm.R.swing += cw * 0.35; arm.L.elbow += cw * 0.5; arm.R.elbow += cw * 0.5;

    // Air: anticipation, tuck, arms up.
    const aw = w.air * (1 - w.swim);
    arm.L.down -= aw * 0.5; arm.R.down -= aw * 0.5;
    arm.L.swing += aw * 0.25; arm.R.swing += aw * 0.1;
    arm.L.elbow += aw * 0.4; arm.R.elbow += aw * 0.4;
    spinePitch += aw * 0.08;
    if (this.jumpT >= 0 && this.jumpT < 0.12) hipsOff.y -= (1 - this.jumpT / 0.12) * 0.08 * scale;
    if (this.landT >= 0) {
      const k = Math.sin(clamp(this.landT / 0.35, 0, 1) * Math.PI) * this.landAmt;
      hipsOff.y -= k * 0.16 * scale; spinePitch += k * 0.2; arm.L.down -= k * 0.2; arm.R.down -= k * 0.2;
    }

    // Swimming.
    const sw = w.swim;
    if (sw > 0.01) {
      const s2 = Math.sin(t * 2.4);
      hipsPitch += sw * 0.9;
      headPitch -= sw * 0.7;
      arm.L.down -= sw * (1.6 + s2 * 0.6); arm.R.down -= sw * (1.6 - s2 * 0.6);
      arm.L.swing += sw * (1.0 + s2 * 1.2); arm.R.swing += sw * (1.0 - s2 * 1.2);
      arm.L.elbow += sw * 0.5; arm.R.elbow += sw * 0.5;
    }

    // Sitting.
    const sitW = w.sit;
    if (sitW > 0.01) {
      const seatY = this.poseData && this.poseData.seatHeight !== undefined ? this.poseData.seatHeight : 0.46 * scale;
      const restHipsY = this.J.hips.y;
      const targetHipsY = seatY + 0.075 * scale;
      hipsOff.y += sitW * (targetHipsY - restHipsY);
      hipsOff.z += sitW * -0.05 * scale;
      spinePitch -= sitW * 0.08;
      chestPitch += sitW * 0.06;
      arm.L.swing += sitW * 0.55; arm.R.swing += sitW * 0.55;
      arm.L.down += sitW * 0.05; arm.R.down += sitW * 0.05;
      arm.L.elbow += sitW * 0.75; arm.R.elbow += sitW * 0.75;
    }

    // Gestures.
    const gw = w.gesture;
    const gt = this.gestT;
    const g = this.gest || this._lastGest;
    if (this.gest) this._lastGest = this.gest;
    if (gw > 0.01 && g) this._gesture(g, gw, gt, arm, { set: (k, v) => { if (k === 'hipsY') hipsOff.y += v * scale; }, add: (k, v) => {
      if (k === 'spinePitch') spinePitch += v; else if (k === 'chestPitch') chestPitch += v; else if (k === 'headPitch') headPitch += v;
      else if (k === 'headYaw') headYaw += v; else if (k === 'headRoll') headRoll += v; else if (k === 'hipsYaw') hipsYaw += v; else if (k === 'hipsRoll') hipsRoll += v;
      else if (k === 'chestYaw') chestYaw += v; else if (k === 'hipsX') hipsOff.x += v * scale; else if (k === 'hipsY') hipsOff.y += v * scale; else if (k === 'spineRoll') spineRoll += v;
    } });

    // Talking: hand motion + jaw.
    if (this.talkT > 0) {
      const tw = Math.min(1, this.talkT) * (1 - gw);
      arm.R.elbow += tw * (0.6 + Math.sin(t * 2.3) * 0.25); arm.R.swing += tw * (0.25 + Math.sin(t * 1.7) * 0.1);
      arm.L.elbow += tw * (0.35 + Math.sin(t * 1.9 + 1) * 0.2); arm.L.swing += tw * 0.12;
      arm.R.twist -= tw * 0.4;
      headPitch += Math.sin(t * 3.1) * 0.035 * tw; headRoll += Math.sin(t * 1.3) * 0.03 * tw;
      const syll = Math.max(0, Math.sin(t * 13.0) * 0.6 + Math.sin(t * 7.3 + 1) * 0.4);
      this.jaw = smooth(this.jaw, syll * 0.75, dt, 25);
    } else this.jaw = smooth(this.jaw, 0, dt, 12);

    // Look-at (character space target) or explicit pitch (player).
    let lyaw = 0, lpitch = 0;
    if (st.look) {
      const eyeY = this.J.eyes.y + hipsOff.y;
      const dx = st.look.x, dy = st.look.y - eyeY, dz = st.look.z;
      lyaw = Math.atan2(dx, dz);
      lpitch = -Math.atan2(dy, Math.hypot(dx, dz));
      if (Math.abs(lyaw) > 1.9) { lyaw = 0; lpitch = 0; }
      lyaw = clamp(lyaw, -1.25, 1.25); lpitch = clamp(lpitch, -0.7, 0.8);
    } else if (st.lookPitch !== undefined) {
      lpitch = clamp(-st.lookPitch, -0.8, 0.9);
    }
    this.lookYaw = smooth(this.lookYaw, lyaw, dt, 6);
    this.lookPitch = smooth(this.lookPitch, lpitch, dt, 6);
    neckYaw += this.lookYaw * 0.4; headYaw += this.lookYaw * 0.6;
    neckPitch += this.lookPitch * 0.35; headPitch += this.lookPitch * 0.55;
    chestPitch += this.lookPitch * 0.1 * (st.lookPitch !== undefined ? 1 : 0);
    // Eyes follow beyond the head limits.
    this.eyeYaw = smooth(this.eyeYaw, clamp(lyaw - this.lookYaw, -0.4, 0.4) + Math.sin(t * 0.7 + this.idleSeed) * 0.05, dt, 18);
    this.eyePitch = smooth(this.eyePitch, clamp(lpitch - this.lookPitch, -0.3, 0.3), dt, 18);

    // ================= Apply rotations =================
    qEuler(hipsPitch, hipsYaw, hipsRoll, 'YXZ', q[B.hips]);
    qEuler(spinePitch, spineYaw, spineRoll, 'YXZ', q[B.spine]);
    qEuler(chestPitch - P.stoop * 0.3, chestYaw, chestRoll, 'YXZ', q[B.chest]);
    qEuler(neckPitch + P.stoop * 0.35, neckYaw, 0, 'YXZ', q[B.neck]);
    qEuler(headPitch, headYaw, headRoll, 'YXZ', q[B.head]);
    for (const S of ['L', 'R']) {
      const side = S === 'L' ? 1 : -1;
      const a = arm[S];
      qEuler(0, a.clavY * side, a.clavZ * side, 'XYZ', q[B['clav' + S]]);
      // Upper arm: twist about the rest axis, lower toward the body (Z), swing forward (X).
      _q.setFromAxisAngle(this.rest.dir['arm' + S], side * a.twist);
      _q2.setFromAxisAngle(Z, -side * a.down);
      _q3.setFromAxisAngle(X, -a.swing);
      q[B['arm' + S]].copy(_q3).multiply(_q2).multiply(_q);
      q[B['fore' + S]].setFromAxisAngle(this.elbowAxis[S], clamp(a.elbow, 0, 2.5));
      _q.setFromAxisAngle(this.rest.dir['fore' + S], side * a.wristTwist);
      q[B['fore' + S]].multiply(_q);
      q[B['hand' + S]].setFromAxisAngle(this.elbowAxis[S], a.wrist);
    }

    // ================= Legs (IK) =================
    this._legs(dt, st, q, hipsOff, mw, run, ph, aw, cw, sitW, sw, scale);

    // Write to bones.
    const bones = this.bones;
    for (let i = 1; i < bones.length; i++) bones[i].quaternion.copy(q[i]);
    bones[B.hips].position.copy(this.rest.pos[B.hips]).add(hipsOff);

    // Eyes, blinking, jaw.
    const h = this.h;
    if (h.eyes) {
      for (const e of h.eyes) e.rotation.set(this.eyePitch, this.eyeYaw, 0, 'YXZ');
      this.blinkT -= dt;
      if (this.blinkT <= 0 && this.blinkPhase < 0) { this.blinkPhase = 0; this.blinkT = 2 + Math.random() * 4.5; }
      let close = 0;
      if (this.blinkPhase >= 0) {
        this.blinkPhase += dt;
        const bp = this.blinkPhase;
        close = bp < 0.07 ? bp / 0.07 : bp < 0.11 ? 1 : bp < 0.24 ? 1 - (bp - 0.11) / 0.13 : 0;
        if (bp >= 0.24) this.blinkPhase = -1;
      }
      const lidLook = clamp(this.eyePitch + this.lookPitch * 0.3, -0.3, 0.4) * 0.5;
      for (const lid of h.lids) lid.rotation.x = lid.userData.open + lidLook + (lid.userData.closed - lid.userData.open - lidLook) * sstep(close);
    }
    if (h.headMesh && h.headMesh.morphTargetInfluences) h.headMesh.morphTargetInfluences[0] = this.jaw;
    if (h.jawPivot) h.jawPivot.rotation.x = this.jaw * 0.2;
  }

  _gesture(g, gw, gt, arm, pose) {
    const t = gt;
    const R = arm.R, L = arm.L;
    const mix = (obj, key, val) => { obj[key] = obj[key] * (1 - gw) + val * gw; };
    switch (g) {
      case 'wave': {
        mix(R, 'down', -1.75); mix(R, 'swing', 0.35); mix(R, 'twist', -1.35); mix(R, 'elbow', 1.35 + Math.sin(t * 9) * 0.35); mix(R, 'wrist', Math.sin(t * 9 + 0.5) * 0.2);
        pose.add('headRoll', 0.08 * gw); pose.add('spineRoll', 0.05 * gw);
        break;
      }
      case 'point': {
        mix(R, 'down', 0.15); mix(R, 'swing', 1.45); mix(R, 'elbow', 0.05); mix(R, 'twist', -0.3);
        pose.add('chestYaw', -0.15 * gw);
        break;
      }
      case 'shrug': {
        const k = Math.sin(Math.min(1, t / 0.4) * Math.PI * 0.5);
        for (const a of [L, R]) { mix(a, 'clavZ', 0.22 * k); mix(a, 'elbow', 1.5); mix(a, 'swing', 0.25); mix(a, 'twist', 1.0); mix(a, 'down', this.armRest - 0.25); }
        pose.add('headRoll', 0.15 * gw); pose.add('headPitch', 0.08 * gw);
        break;
      }
      case 'cheer': {
        const bounce = Math.abs(Math.sin(t * 6));
        for (const a of [L, R]) { mix(a, 'down', -2.3 - bounce * 0.2); mix(a, 'elbow', 0.3 + bounce * 0.3); mix(a, 'swing', 0.2); }
        pose.add('hipsY', bounce * 0.04 * gw); pose.add('headPitch', -0.2 * gw);
        break;
      }
      case 'clap': {
        const c = Math.abs(Math.sin(t * 7));
        for (const a of [L, R]) { mix(a, 'down', this.armRest - 0.35 + c * 0.25); mix(a, 'swing', 0.9); mix(a, 'elbow', 1.45); mix(a, 'twist', 0.6); }
        break;
      }
      case 'dance': {
        const b = t * 4.2;
        pose.add('hipsY', (Math.abs(Math.sin(b)) * 0.06 - 0.04) * gw);
        pose.add('hipsX', Math.sin(b * 0.5) * 0.05 * gw);
        pose.add('hipsYaw', Math.sin(b * 0.5) * 0.35 * gw);
        pose.add('chestYaw', -Math.sin(b * 0.5) * 0.25 * gw);
        pose.add('headRoll', Math.sin(b) * 0.12 * gw);
        pose.add('spineRoll', Math.sin(b * 0.5) * 0.12 * gw);
        mix(L, 'down', -0.6 + Math.sin(b) * 1.2); mix(R, 'down', -0.6 - Math.sin(b) * 1.2);
        mix(L, 'elbow', 1.2 + Math.sin(b * 2) * 0.3); mix(R, 'elbow', 1.2 - Math.sin(b * 2) * 0.3);
        mix(L, 'swing', 0.4 + Math.cos(b) * 0.4); mix(R, 'swing', 0.4 - Math.cos(b) * 0.4);
        break;
      }
      case 'nod': pose.add('headPitch', Math.sin(t * 9) * 0.22 * gw); break;
      case 'headshake': pose.add('headYaw', Math.sin(t * 10) * 0.35 * gw); break;
      case 'bow': {
        const k = Math.sin(Math.min(1, t / Math.max(0.5, this.gestDur)) * Math.PI);
        pose.add('spinePitch', 0.55 * k * gw); pose.add('chestPitch', 0.2 * k * gw); pose.add('headPitch', 0.2 * k * gw);
        mix(L, 'swing', 0.1); mix(R, 'swing', 0.6 * k); mix(R, 'elbow', 1.3 * k);
        break;
      }
      case 'think': {
        mix(R, 'down', 0.1); mix(R, 'swing', 1.1); mix(R, 'elbow', 2.3); mix(R, 'twist', -0.9);
        mix(L, 'swing', 0.5); mix(L, 'elbow', 1.5); mix(L, 'twist', -0.6);
        pose.add('headPitch', 0.12 * gw); pose.add('headRoll', 0.1 * gw);
        break;
      }
      case 'thumbsup': {
        mix(R, 'down', 0.2); mix(R, 'swing', 0.9); mix(R, 'elbow', 1.6); mix(R, 'twist', 1.2);
        break;
      }
      case 'celebrate': {
        mix(R, 'down', -2.2); mix(R, 'elbow', 0.5 + Math.sin(t * 8) * 0.3);
        mix(L, 'down', -2.2); mix(L, 'elbow', 0.5 + Math.cos(t * 8) * 0.3);
        pose.add('hipsY', Math.abs(Math.sin(t * 8)) * 0.05 * gw);
        break;
      }
      case 'idleLook': {
        pose.add('headYaw', Math.sin(t * 1.2) * 0.6 * gw); pose.add('chestYaw', Math.sin(t * 1.2) * 0.15 * gw);
        break;
      }
      default: break;
    }
  }

  _legs(dt, st, q, hipsOff, mw, run, ph, aw, cw, sitW, sw, scale) {
    const J = this.J, rest = this.rest;
    const hipsQ = q[B.hips];
    const hipsPos = new THREE.Vector3().copy(J.hips).add(hipsOff);
    const stance = 0.62 - run * 0.24;
    const S = (1.35 + run * 1.3) * scale * stance * 0.95; // foot travel during stance
    const lift = (0.1 + run * 0.14) * scale;
    const cosA = Math.cos(this.dirAngle), sinA = Math.sin(this.dirAngle);
    const groundAt = st.groundAt;
    const sides = [['L', 1, ph], ['R', -1, (ph + 0.5) % 1]];
    let drop = 0;
    const plan = [];
    for (const [side, sgn, p] of sides) {
      const restAnkle = J['foot' + side];
      let fx = restAnkle.x, fy = restAnkle.y, fz = restAnkle.z;
      let pitch = 0;
      // Gait offset along the move direction.
      if (mw > 0.001) {
        let along, up = 0;
        if (p < stance) {
          const tt = p / stance;
          along = (0.5 - tt) * S;
          pitch = tt < 0.12 ? (0.12 - tt) / 0.12 * -0.3 : tt > 0.78 ? (tt - 0.78) / 0.22 * 0.55 : 0;
        } else {
          const tt = (p - stance) / (1 - stance);
          along = -0.5 * S + S * sstep(tt);
          up = Math.sin(tt * Math.PI) * lift;
          pitch = tt < 0.4 ? 0.5 * (1 - tt / 0.4) : -0.2 * Math.sin((tt - 0.4) / 0.6 * Math.PI);
        }
        fx += along * sinA * mw; fz += along * cosA * mw; fy += up * mw;
        pitch *= mw;
      }
      // Crouch: feet slightly wider & back.
      fx += sgn * cw * 0.04 * scale; fz -= cw * 0.02 * scale;
      // Air: tuck the feet up.
      fy += aw * 0.22 * scale * (side === 'L' ? 1 : 0.8); fz += aw * 0.05 * scale;
      if (aw > 0.01) pitch += aw * 0.4;
      // Sit: feet forward on the floor.
      if (sitW > 0.01) {
        const seatY = this.poseData && this.poseData.seatHeight !== undefined ? this.poseData.seatHeight : 0.46 * scale;
        fz = fz * (1 - sitW) + (J.hips.z + this.L1 * 0.95 + 0.02) * sitW;
        fy = fy * (1 - sitW) + restAnkle.y * sitW;
        fx = fx * (1 - sitW) + (restAnkle.x * 1.15) * sitW;
        if (seatY < 0.25 * scale) { fz += sitW * this.L2 * 0.7; fy += sitW * 0.02; }
      }
      // Swim: kicking.
      if (sw > 0.01) { fz -= sw * 0.25 * scale; fy += sw * (0.35 + Math.sin(this.time * 6 + (sgn > 0 ? 0 : Math.PI)) * 0.12) * scale; }
      // Ground adaptation.
      let gy = 0;
      if (groundAt && sitW < 0.5 && sw < 0.5) {
        gy = groundAt(fx, fz);
        if (!Number.isFinite(gy)) gy = 0;
        gy = clamp(gy, -0.5 * scale, 0.5 * scale) * (1 - aw);
      }
      fy += gy;
      const hip = this.hipRel[side].clone().applyQuaternion(hipsQ).add(hipsPos);
      const ank = new THREE.Vector3(fx, fy, fz);
      const reach = (this.L1 + this.L2) * 0.995;
      const dist = hip.distanceTo(ank);
      if (dist > reach) drop = Math.max(drop, Math.min(0.3 * scale, (dist - reach)));
      plan.push({ side, sgn, ank, pitch, gy });
    }
    // Lower the hips if a foot can't reach (slopes/stairs).
    if (drop > 0) { hipsOff.y -= drop; hipsPos.y -= drop; }
    for (const pl of plan) {
      const { side, sgn, ank, pitch } = pl;
      const hip = this.hipRel[side].clone().applyQuaternion(hipsQ).add(hipsPos);
      const L1 = this.L1, L2 = this.L2;
      const toA = new THREE.Vector3().subVectors(ank, hip);
      let d = toA.length();
      d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-4);
      toA.normalize();
      // Knee pole: forward (character facing), slightly outward, rotated with the hips yaw.
      const pole = new THREE.Vector3(sgn * 0.12, 0, 1).applyQuaternion(hipsQ);
      if (sitW > 0.5) pole.set(sgn * 0.1, 1, 0.3);
      const poleDir = pole.clone().addScaledVector(toA, -pole.dot(toA)).normalize();
      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const hgt = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const knee = hip.clone().addScaledVector(toA, a).addScaledVector(poleDir, hgt);
      const tDir = new THREE.Vector3().subVectors(knee, hip).normalize();
      const sDir = new THREE.Vector3().subVectors(ank, knee).normalize();
      const restT = rest.dir['thigh' + side], restS = rest.dir['shin' + side];
      const fwdT = poleDir.clone().addScaledVector(tDir, -poleDir.dot(tDir)).normalize();
      const fwdS = poleDir.clone().addScaledVector(sDir, -poleDir.dot(sDir)).normalize();
      const r0 = Z.clone().addScaledVector(restT, -Z.dot(restT)).normalize();
      const r0s = Z.clone().addScaledVector(restS, -Z.dot(restS)).normalize();
      const Qt = basisRotation(restT, r0, tDir, fwdT, new THREE.Quaternion());
      const Qs = basisRotation(restS, r0s, sDir, fwdS, new THREE.Quaternion());
      // Local rotations: thigh relative to hips, shin relative to thigh.
      const invH = hipsQ.clone().invert();
      q[B['thigh' + side]].copy(invH).multiply(Qt);
      q[B['shin' + side]].copy(Qt.clone().invert()).multiply(Qs);
      // Foot: face the body direction (hips yaw), pitch for heel/toe.
      const hipsYawOnly = new THREE.Euler().setFromQuaternion(hipsQ, 'YXZ').y;
      const Qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.8, hipsYawOnly * 0.6 + sgn * 0.08, 0, 'YXZ'));
      q[B['foot' + side]].copy(Qs.clone().invert()).multiply(Qf);
      // Toe bends back during push-off.
      q[B['toe' + side]].setFromAxisAngle(X, Math.max(0, pitch) * -0.9);
    }
  }
}
