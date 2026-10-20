import * as THREE from 'three';
import { MaverickRig, BERET_PROFILE } from './Maverick';
import { makeStrandTexture } from './textures';
import { makeParams, targetParams } from './emotions';
import type { ActiveAction, FrameState } from './frame';
import type { Emotion, MascotAction } from './types';

/**
 * Dev-only geometry check (used by the mascot lab): CPU-skins Maverick in many poses and
 * reports whether any fur tip pokes through the beret's crown, plus the model's bounds.
 */

function crownTop(r: number): number | null {
  // Upper branch of the profile: from the widest point to the centre.
  let widest = 0;
  for (let i = 1; i < BERET_PROFILE.length; i++) if (BERET_PROFILE[i][0] > BERET_PROFILE[widest][0]) widest = i;
  const upper = BERET_PROFILE.slice(widest);
  if (r > upper[0][0]) return null;
  for (let i = 0; i < upper.length - 1; i++) {
    const [r0, y0] = upper[i];
    const [r1, y1] = upper[i + 1];
    if (r <= r0 && r >= r1) {
      const k = (r0 - r) / Math.max(1e-6, r0 - r1);
      return y0 + (y1 - y0) * k;
    }
  }
  return upper[upper.length - 1][1];
}

interface PoseSpec {
  name: string;
  emotion: Emotion;
  action?: MascotAction;
  dragging?: boolean;
  speak?: number;
  lookX?: number;
  velX?: number;
}

export function beretClearanceReport() {
  const rig = new MaverickRig({ strandTex: makeStrandTexture(32, 4) }, 30, 12);
  const root = new THREE.Group();
  root.add(rig.group);
  const mesh = rig.baseMesh;
  const geo = mesh.geometry;
  const posA = geo.attributes.position as THREE.BufferAttribute;
  const norA = geo.attributes.normal as THREE.BufferAttribute;
  const furA = geo.attributes.furLen as THREE.BufferAttribute;
  const furLength = rig.furU.uFurLength.value;
  const poses: PoseSpec[] = [
    { name: 'idle', emotion: 'idle' },
    { name: 'thinking', emotion: 'thinking', lookX: 1 },
    { name: 'confused', emotion: 'confused' },
    { name: 'sleepy', emotion: 'sleepy' },
    { name: 'sad', emotion: 'sad' },
    { name: 'error+flinch', emotion: 'error', action: 'flinch' },
    { name: 'happy+nod', emotion: 'happy', action: 'nod' },
    { name: 'excited+jump', emotion: 'excited', action: 'jump' },
    { name: 'celebrate', emotion: 'celebrate', action: 'celebrate' },
    { name: 'wave', emotion: 'idle', action: 'wave' },
    { name: 'spin', emotion: 'happy', action: 'spin' },
    { name: 'poke', emotion: 'idle', action: 'poke' },
    { name: 'peek', emotion: 'idle', action: 'peek' },
    { name: 'shake', emotion: 'idle', action: 'shake' },
    { name: 'speaking', emotion: 'speaking', speak: 1 },
    { name: 'working', emotion: 'working' },
    { name: 'drag', emotion: 'surprised', dragging: true, velX: 4 },
    { name: 'drag-left', emotion: 'surprised', dragging: true, velX: -4 },
  ];
  const p = makeParams();
  const v = new THREE.Vector3();
  const vn = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const results: { pose: string; worst: number; hits: number; at: number[] }[] = [];
  const wv = new THREE.Vector3();
  const bbox = new THREE.Box3();
  for (const pose of poses) {
    targetParams(pose.emotion, 1, p);
    let worst = -1;
    let hits = 0;
    let at: number[] = [];
    const progresses = pose.action ? [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95] : [0];
    for (const prog of progresses) {
      for (let ti = 0; ti < 12; ti++) {
        const t = ti * 0.37 + 0.11;
        const actions: ActiveAction[] = pose.action ? [{ kind: pose.action, t0: 0, dur: 1, p: prog }] : [];
        const fs: FrameState = {
          t,
          dt: 0.5,
          p,
          emotion: pose.emotion,
          actions,
          speak: pose.speak ?? 0,
          lookX: pose.lookX ?? 0,
          lookY: 0,
          velX: pose.velX ?? 0,
          velY: 0,
          dragging: !!pose.dragging,
          travelHop: 0,
          blink: 0,
          reduced: false,
        };
        rig.update(fs);
        root.updateMatrixWorld(true);
        inv.copy(rig.beretBase.matrixWorld).invert();
        for (let i = 0; i < posA.count; i += 2) {
          v.fromBufferAttribute(posA, i);
          vn.fromBufferAttribute(norA, i).multiplyScalar(0.01).add(v);
          mesh.applyBoneTransform(i, v);
          mesh.applyBoneTransform(i, vn);
          vn.sub(v).normalize();
          v.addScaledVector(vn, furLength * furA.getX(i));
          v.applyMatrix4(mesh.matrixWorld);
          wv.copy(v);
          if (pose.name === 'idle' && ti === 0) bbox.expandByPoint(v);
          v.applyMatrix4(inv);
          const r = Math.hypot(v.x, v.z);
          // Only the crown interior counts: tips beside the side wall are 'peeking out', not poking through.
          const top = r < 0.5 ? crownTop(r) : null;
          if (top === null || v.y < BERET_PROFILE[0][1] - 0.2) continue;
          const pen = v.y - (top + 0.03);
          if (pen > worst) {
            worst = pen;
            at = [wv.x, wv.y, wv.z, r, v.y].map((q) => +q.toFixed(2));
          }
          if (pen > 0) hits++;
        }
      }
    }
    results.push({ pose: pose.name, worst: Math.round(worst * 1000) / 1000, hits, at });
  }
  // Include the beret + nub in the idle bounds.
  targetParams('idle', 1, p);
  rig.update({ t: 0.11, dt: 0.5, p, emotion: 'idle', actions: [], speak: 0, lookX: 0, lookY: 0, velX: 0, velY: 0, dragging: false, travelHop: 0, blink: 0, reduced: false });
  root.updateMatrixWorld(true);
  const beretBox = new THREE.Box3().setFromObject(rig.beretBase.parent!, true);
  bbox.union(beretBox);
  rig.dispose();
  return {
    results,
    bounds: { min: bbox.min.toArray().map((x) => +x.toFixed(3)), max: bbox.max.toArray().map((x) => +x.toFixed(3)) },
  };
}
