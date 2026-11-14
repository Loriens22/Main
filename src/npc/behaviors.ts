import * as THREE from 'three';
import { act, BT, seq, task } from './bt';
import type { NPC } from './NPC';
import type { PoseName } from './Humanoid';

type Pt = THREE.Vector3Like;
type PtFn = Pt | ((n: NPC) => Pt | null);
const pt = (p: PtFn, n: NPC) => (typeof p === 'function' ? p(n) : p);

/** Walk to a point; succeeds on arrival, fails when no route exists or the agent gets stuck. */
export function goTo(target: PtFn, opts: { speed?: number; radius?: number; label?: string; dest?: string; direct?: boolean } = {}): BT<NPC> {
  let started = false;
  return {
    tick(n) {
      if (!started) {
        const t = pt(target, n);
        if (!t) return 'fail';
        started = true;
        n.idlePose = 'stand';
        n.face(null);
        n.state.task = opts.label ?? 'walking';
        n.state.destination = opts.dest ?? '';
        if (n.distanceTo(t) <= (opts.radius ?? 0.35) + 0.2) { started = false; return 'ok'; }
        if (!n.moveTo(t, opts)) { started = false; return 'fail'; }
      }
      if (n.moving) return 'run';
      started = false;
      n.state.destination = '';
      return n.blocked ? 'fail' : 'ok';
    },
    reset() { started = false; },
  };
}

/** Follow a list of points in order (road walks, patrols). */
export function follow(points: (n: NPC) => Pt[], opts: { speed?: number; label?: string; dest?: string } = {}): BT<NPC> {
  let list: Pt[] | null = null, i = 0;
  return {
    tick(n) {
      if (!list) {
        list = points(n); i = 0;
        // start from the closest point so an interrupted walk resumes sensibly
        let bd = Infinity;
        for (let k = 0; k < list.length; k++) { const d = n.distanceTo(list[k]); if (d < bd) { bd = d; i = k; } }
        n.idlePose = 'stand'; n.face(null);
        n.state.task = opts.label ?? 'walking'; n.state.destination = opts.dest ?? '';
        if (list.length) n.moveTo(list[i], { speed: opts.speed, radius: 1.2, direct: true });
      }
      if (n.moving) return 'run';
      if (n.blocked) { list = null; return 'fail'; }
      i++;
      if (i >= list.length) { list = null; n.state.destination = ''; return 'ok'; }
      n.moveTo(list[i], { speed: opts.speed, radius: i === list.length - 1 ? 0.5 : 1.2, direct: true });
      return 'run';
    },
    reset() { list = null; },
  };
}

/** Hold a pose for a while (working at something). */
export function hold(pose: PoseName, seconds: number | [number, number], label: string, face?: PtFn): BT<NPC> {
  let t = -1;
  return {
    tick(n, dt) {
      if (t < 0) {
        t = typeof seconds === 'number' ? seconds : seconds[0] + Math.random() * (seconds[1] - seconds[0]);
        n.idlePose = pose;
        n.state.task = label;
        n.face(face ? pt(face, n) : null);
      }
      t -= dt;
      if (t > 0) return 'run';
      t = -1;
      n.idlePose = 'stand';
      return 'ok';
    },
    reset() { t = -1; },
  };
}

/** Ambient remark when the player is in earshot (never blocks). */
export function remark(lines: string[] | ((n: NPC) => string[]), key: string, cooldown = 45): BT<NPC> {
  return act((n) => { n.bark(typeof lines === 'function' ? lines(n) : lines, key, cooldown); });
}

export function setState(f: (n: NPC) => void): BT<NPC> { return act((n) => { f(n); }); }

/** Convenience: walk somewhere, then work there. */
export function workAt(target: PtFn, pose: PoseName, seconds: number | [number, number], label: string, face?: PtFn, opts: { speed?: number; radius?: number } = {}): BT<NPC> {
  return seq(goTo(target, { ...opts, label: `walking to ${label}` }), hold(pose, seconds, label, face));
}

export { task };
