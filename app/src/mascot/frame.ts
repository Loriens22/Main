import type { Emotion, MascotAction } from './types';
import type { ExprParams } from './emotions';
import { easeInOut, smoothstep } from './util';

export interface ActiveAction {
  kind: MascotAction;
  t0: number;
  dur: number;
  p: number; // 0..1 progress
}

/** Everything a character rig needs to pose itself for one frame. */
export interface FrameState {
  t: number;
  dt: number;
  p: ExprParams;
  emotion: Emotion;
  actions: ActiveAction[];
  speak: number; // 0..1 smoothed speech level
  lookX: number; // -1..1, +x = screen right
  lookY: number; // -1..1, +y = screen down
  velX: number; // sizes / s (screen space)
  velY: number;
  dragging: boolean;
  travelHop: number; // 0..1 hop height from travelling
  blink: number; // 0..1 closedness
  reduced: boolean;
}

export interface ActionOffsets {
  lift: number; // model units, up
  squash: number; // negative = squash down, positive = stretch
  rotX: number;
  rotY: number;
  rotZ: number;
  offX: number;
  armUp: number;
  wave: number; // 0..1 waving arm amount
  eyeWide: number;
  happy: number;
  burst: number; // 0..1 flame/energy burst
}

export function evalActions(actions: ActiveAction[], o: ActionOffsets): ActionOffsets {
  o.lift = o.squash = o.rotX = o.rotY = o.rotZ = o.offX = o.armUp = o.wave = o.eyeWide = o.happy = o.burst = 0;
  for (const a of actions) {
    const p = a.p;
    const env = Math.sin(Math.PI * p);
    switch (a.kind) {
      case 'poke': {
        const decay = 1 - p;
        o.squash += -0.24 * Math.sin(Math.min(1, p * 2.2) * Math.PI) * decay;
        o.rotZ += Math.sin(p * 34) * 0.1 * decay;
        o.happy = Math.max(o.happy, env);
        o.lift += 0.08 * Math.max(0, Math.sin(p * Math.PI * 2)) * decay;
        break;
      }
      case 'wave':
        o.wave = Math.max(o.wave, smoothstep(0, 0.15, p) * (1 - smoothstep(0.85, 1, p)));
        o.rotZ += 0.06 * env;
        break;
      case 'jump': {
        if (p < 0.22) o.squash += -0.2 * Math.sin((p / 0.22) * Math.PI * 0.5);
        else if (p < 0.78) {
          const q = (p - 0.22) / 0.56;
          o.lift += Math.sin(q * Math.PI) * 0.75;
          o.squash += 0.14 * Math.cos(q * Math.PI);
        } else o.squash += -0.16 * Math.sin(((p - 0.78) / 0.22) * Math.PI);
        o.armUp += 0.5 * env;
        break;
      }
      case 'spin':
        o.rotY += easeInOut(p) * Math.PI * 2;
        o.lift += 0.3 * env;
        o.armUp += 0.4 * env;
        break;
      case 'nod':
        o.rotX += Math.sin(p * Math.PI * 4) * 0.16 * (1 - p);
        break;
      case 'shake':
        o.rotY += Math.sin(p * Math.PI * 6) * 0.32 * (1 - p);
        o.rotZ += Math.sin(p * Math.PI * 6 + 1) * 0.05 * (1 - p);
        break;
      case 'celebrate': {
        if (p < 0.15) o.squash += -0.22 * Math.sin((p / 0.15) * Math.PI * 0.5);
        else if (p < 0.75) {
          const q = (p - 0.15) / 0.6;
          o.lift += Math.sin(q * Math.PI) * 1.1;
          o.squash += 0.16 * Math.cos(q * Math.PI);
          o.rotY += easeInOut(q) * Math.PI * 2;
        } else o.squash += -0.18 * Math.sin(((p - 0.75) / 0.25) * Math.PI);
        o.armUp += 1 * env;
        o.wave = Math.max(o.wave, env);
        o.happy = Math.max(o.happy, 1);
        o.burst = Math.max(o.burst, env);
        break;
      }
      case 'flinch':
        o.rotX += -0.38 * Math.sin(Math.min(1, p * 1.6) * Math.PI) * (1 - p * 0.5);
        o.squash += -0.15 * Math.sin(Math.min(1, p * 3) * Math.PI);
        o.eyeWide += 0.45 * env;
        o.armUp += 0.6 * env;
        o.rotZ += Math.sin(p * 40) * 0.05 * (1 - p);
        break;
      case 'peek':
        o.rotZ += 0.42 * env;
        o.offX += -0.35 * env;
        o.eyeWide += 0.15 * env;
        break;
    }
  }
  return o;
}

export function makeOffsets(): ActionOffsets {
  return { lift: 0, squash: 0, rotX: 0, rotY: 0, rotZ: 0, offX: 0, armUp: 0, wave: 0, eyeWide: 0, happy: 0, burst: 0 };
}
