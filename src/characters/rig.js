// ---------------------------------------------------------------------------
// Humanoid rig: anthropometric proportions -> joint positions -> THREE.Bone
// hierarchy. All bones have identity rest rotation (world-aligned frames), so
// procedural animation can reason in simple axes. The bind pose is an A-pose
// (arms 42 degrees from the body, legs slightly apart) which keeps limbs apart
// for SDF meshing.
//
// Character space: feet at y = 0, facing +Z, character's left = +X.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

export const BONE_NAMES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'clavL', 'armL', 'foreL', 'handL',
  'clavR', 'armR', 'foreR', 'handR',
  'thighL', 'shinL', 'footL', 'toeL',
  'thighR', 'shinR', 'footR', 'toeR',
];
export const B = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
const PARENT = {
  hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  clavL: 'chest', armL: 'clavL', foreL: 'armL', handL: 'foreL',
  clavR: 'chest', armR: 'clavR', foreR: 'armR', handR: 'foreR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', toeL: 'footL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR', toeR: 'footR',
};
export const A_POSE = THREE.MathUtils.degToRad(42);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Derive body proportions from a character spec.
export function computeProportions(spec) {
  const H = spec.height;
  const age = spec.age ?? 30;
  const child = clamp01((17 - age) / 13);         // 1 = small child, 0 = adult
  const elder = clamp01((age - 58) / 30);
  const female = spec.sex === 'female' ? 1 : spec.sex === 'neutral' ? 0.5 : 0;
  const fat = clamp01(spec.fat ?? 0.3);
  const muscle = clamp01(spec.muscle ?? 0.35);
  const s = H / 1.75 * lerp(1, 1.18, child);        // girth scale (kids are not just tiny adults)
  const headH = H * lerp(0.13, 0.185, child) * lerp(1, 1.02, female) * (spec.headScale || 1);
  return {
    H, age, child, elder, female, fat, muscle, s,
    headH,
    legRatio: lerp(0.505, 0.455, child) * (spec.legScale || 1),
    shoulderW: H * lerp(0.232, 0.212, female) * (1 + muscle * 0.07 + fat * 0.03) * lerp(1, 0.94, child),
    hipW: H * lerp(0.098, 0.112, female) * (1 + fat * 0.12),
    upperArm: H * 0.186 * lerp(1, 0.93, child),
    foreArm: H * 0.146 * lerp(1, 0.93, child),
    hand: H * 0.106 * lerp(1, 0.9, child) * lerp(1, 0.93, female),
    foot: H * 0.152 * lerp(1, 0.94, female),
    bust: female * (spec.bust ?? 0.9),
    stoop: elder * 0.5,
  };
}

// Joint positions in character space (bind pose).
export function computeJoints(P) {
  const H = P.H;
  const J = {};
  const hipY = P.legRatio * H;
  const kneeY = H * 0.285 * (P.legRatio / 0.505);
  const ankleY = H * 0.046;
  const chinY = H - P.headH;
  const shoulderY = chinY - H * 0.042;
  J.root = new THREE.Vector3(0, 0, 0);
  J.hips = new THREE.Vector3(0, hipY + H * 0.03, 0);
  J.spine = new THREE.Vector3(0, hipY + H * 0.1, 0.004 * H);
  J.chest = new THREE.Vector3(0, hipY + (shoulderY - hipY) * 0.62, -0.002 * H);
  J.neck = new THREE.Vector3(0, shoulderY + H * 0.008, -0.012 * H);
  J.head = new THREE.Vector3(0, chinY + P.headH * 0.36, -0.004 * H);
  const shX = P.shoulderW / 2 - H * 0.016;
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    J['clav' + S] = new THREE.Vector3(side * H * 0.012, shoulderY - H * 0.012, 0.004 * H);
    const sh = new THREE.Vector3(side * shX, shoulderY - H * 0.008, -0.004 * H);
    J['arm' + S] = sh;
    const dir = new THREE.Vector3(side * Math.sin(A_POSE), -Math.cos(A_POSE), 0);
    J['fore' + S] = sh.clone().addScaledVector(dir, P.upperArm);
    J['hand' + S] = J['fore' + S].clone().addScaledVector(dir, P.foreArm);
    J['handTip' + S] = J['hand' + S].clone().addScaledVector(dir, P.hand);
    const hx = side * P.hipW / 2;
    J['thigh' + S] = new THREE.Vector3(hx, hipY, 0);
    J['shin' + S] = new THREE.Vector3(hx * 0.97, kneeY, 0.008 * H);
    J['foot' + S] = new THREE.Vector3(hx * 0.95, ankleY, -0.012 * H);
    J['toe' + S] = new THREE.Vector3(hx * 0.97 + side * 0.004 * H, H * 0.012, J['foot' + S].z + P.foot * 0.6);
    J['toeTip' + S] = new THREE.Vector3(hx * 0.99 + side * 0.006 * H, H * 0.012, J['foot' + S].z + P.foot * 0.78);
    J['heel' + S] = new THREE.Vector3(hx * 0.95, H * 0.018, J['foot' + S].z - P.foot * 0.2);
  }
  J.chin = new THREE.Vector3(0, chinY, 0.02 * H);
  J.crown = new THREE.Vector3(0, H, 0);
  J.eyes = new THREE.Vector3(0, H - P.headH * 0.47, 0);
  return J;
}

// Build the THREE.Bone hierarchy (identity rotations, positions relative to parent).
export function buildSkeleton(J) {
  const bones = BONE_NAMES.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
  for (const name of BONE_NAMES) {
    const b = bones[B[name]];
    const parent = PARENT[name];
    if (parent) {
      bones[B[parent]].add(b);
      b.position.copy(J[name]).sub(J[parent]);
    } else b.position.copy(J[name]);
  }
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  // Rest data for animation.
  const rest = {
    pos: bones.map((b) => b.position.clone()),
    world: BONE_NAMES.map((n) => J[n].clone()),
    // Direction from each bone to its main child joint (character space).
    dir: {},
    len: {},
  };
  const chainChild = { armL: 'foreL', foreL: 'handL', armR: 'foreR', foreR: 'handR', thighL: 'shinL', shinL: 'footL', thighR: 'shinR', shinR: 'footR', footL: 'toeL', footR: 'toeR', hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head' };
  for (const k in chainChild) {
    const d = J[chainChild[k]].clone().sub(J[k]);
    rest.len[k] = d.length();
    rest.dir[k] = d.normalize();
  }
  rest.dir.handL = J.handTipL.clone().sub(J.handL).normalize();
  rest.dir.handR = J.handTipR.clone().sub(J.handR).normalize();
  return { bones, skeleton, rest };
}

// Point along a bone segment.
export function along(J, a, b, t) { return J[a].clone().lerp(J[b], t); }
