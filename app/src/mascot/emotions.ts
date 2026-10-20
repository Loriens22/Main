import type { Emotion, MascotAction } from './types';

/** Continuous expression parameters; each emotion maps to a target set, smoothed per frame. */
export interface ExprParams {
  energy: number; // overall motion energy 0..1
  bounceFreq: number; // Hz
  bounceAmp: number; // model units
  sway: number; // rad
  lean: number; // rad around X (forward +)
  tilt: number; // rad around Z (head tilt)
  armRaise: number; // -1 droop .. 1 up
  armWave: number; // 0..1
  armType: number; // 0..1 typing
  eyeOpen: number; // 0 closed .. 1.4 wide
  eyeHappy: number; // 0..1 arcs
  eyeTilt: number; // worried (+) / angry (-)
  lookBiasX: number;
  lookBiasY: number;
  mouthOpen: number; // 0..1
  smile: number; // -1 frown .. 1 smile
  beretTilt: number;
  tintR: number;
  tintG: number;
  tintB: number;
  saturation: number;
  brightness: number;
  // Sparky flame
  flameHeight: number;
  flameGold: number;
  flameBlue: number;
  flameFlicker: number;
  emberRate: number;
  smokeRate: number;
}

const BASE: ExprParams = {
  energy: 0.35,
  bounceFreq: 0.9,
  bounceAmp: 0.0,
  sway: 0.05,
  lean: 0,
  tilt: 0,
  armRaise: 0,
  armWave: 0,
  armType: 0,
  eyeOpen: 1,
  eyeHappy: 0,
  eyeTilt: 0,
  lookBiasX: 0,
  lookBiasY: 0,
  mouthOpen: 0,
  smile: 0,
  beretTilt: 0,
  tintR: 1,
  tintG: 1,
  tintB: 1,
  saturation: 1,
  brightness: 1,
  flameHeight: 1,
  flameGold: 0,
  flameBlue: 0,
  flameFlicker: 1,
  emberRate: 1.2,
  smokeRate: 0,
};

export const EMOTIONS: Record<Emotion, Partial<ExprParams>> = {
  idle: {},
  happy: {
    energy: 0.6,
    bounceFreq: 1.6,
    bounceAmp: 0.05,
    sway: 0.1,
    armRaise: 0.25,
    eyeHappy: 1,
    smile: 1,
    brightness: 1.05,
    flameHeight: 1.2,
    flameGold: 0.4,
    emberRate: 3,
  },
  excited: {
    energy: 1,
    bounceFreq: 2.6,
    bounceAmp: 0.11,
    sway: 0.14,
    armRaise: 0.55,
    armWave: 0.6,
    eyeHappy: 0.85,
    eyeOpen: 1.15,
    mouthOpen: 0.55,
    smile: 1,
    brightness: 1.1,
    saturation: 1.12,
    flameHeight: 1.55,
    flameGold: 0.8,
    flameFlicker: 1.6,
    emberRate: 8,
  },
  thinking: {
    energy: 0.2,
    bounceFreq: 0.5,
    sway: 0.08,
    tilt: 0.16,
    armRaise: 0.05,
    lookBiasX: 0.75,
    lookBiasY: -0.8,
    eyeOpen: 0.95,
    smile: -0.05,
    beretTilt: 0.18,
    flameHeight: 0.85,
    flameFlicker: 0.55,
    emberRate: 0.6,
  },
  working: {
    energy: 0.55,
    bounceFreq: 3,
    bounceAmp: 0.025,
    sway: 0.03,
    lean: 0.1,
    armType: 1,
    lookBiasY: 0.55,
    eyeOpen: 0.8,
    beretTilt: 0.04,
    flameHeight: 1.15,
    flameFlicker: 2.2,
    emberRate: 4,
  },
  listening: {
    energy: 0.3,
    bounceFreq: 0.7,
    lean: 0.22,
    tilt: -0.12,
    eyeOpen: 1.18,
    armRaise: 0.1,
    smile: 0.25,
    flameHeight: 1.05,
    emberRate: 1.5,
  },
  speaking: {
    energy: 0.55,
    bounceFreq: 1.2,
    bounceAmp: 0.02,
    sway: 0.09,
    armRaise: 0.15,
    armWave: 0.15,
    eyeOpen: 1.05,
    smile: 0.4,
    flameHeight: 1.15,
    flameFlicker: 1.3,
    emberRate: 2.5,
  },
  confused: {
    energy: 0.3,
    sway: 0.06,
    tilt: 0.25,
    eyeOpen: 1.05,
    eyeTilt: 0.25,
    smile: -0.3,
    lookBiasX: -0.4,
    beretTilt: 0.2,
    flameHeight: 0.9,
    flameFlicker: 0.8,
  },
  sad: {
    energy: 0.12,
    bounceFreq: 0.4,
    sway: 0.03,
    lean: 0.08,
    armRaise: -0.7,
    eyeOpen: 0.75,
    eyeTilt: 0.45,
    lookBiasY: 0.7,
    smile: -0.8,
    beretTilt: 0.12,
    saturation: 0.72,
    brightness: 0.86,
    tintB: 1.04,
    flameHeight: 0.55,
    flameBlue: 0.5,
    flameFlicker: 0.5,
    emberRate: 0.2,
  },
  error: {
    energy: 0.4,
    sway: 0.02,
    armRaise: -0.4,
    eyeOpen: 0.6,
    eyeTilt: 0.55,
    smile: -0.7,
    saturation: 0.55,
    brightness: 0.82,
    tintR: 0.9,
    tintG: 0.95,
    tintB: 1.08,
    flameHeight: 0.45,
    flameBlue: 1,
    flameFlicker: 2.6,
    emberRate: 0,
    smokeRate: 2.5,
  },
  celebrate: {
    energy: 1,
    bounceFreq: 2.4,
    bounceAmp: 0.12,
    sway: 0.18,
    armRaise: 1,
    armWave: 1,
    eyeHappy: 1,
    mouthOpen: 0.7,
    smile: 1,
    brightness: 1.12,
    saturation: 1.15,
    flameHeight: 1.9,
    flameGold: 1,
    flameFlicker: 1.8,
    emberRate: 14,
  },
  sleepy: {
    energy: 0.08,
    bounceFreq: 0.3,
    sway: 0.04,
    lean: 0.06,
    tilt: 0.18,
    armRaise: -0.35,
    eyeOpen: 0.12,
    smile: 0.1,
    beretTilt: 0.22,
    brightness: 0.92,
    saturation: 0.9,
    flameHeight: 0.5,
    flameFlicker: 0.35,
    emberRate: 0.2,
  },
  surprised: {
    energy: 0.7,
    lean: -0.15,
    armRaise: 0.7,
    eyeOpen: 1.42,
    mouthOpen: 0.6,
    smile: 0,
    flameHeight: 1.6,
    flameGold: 0.3,
    flameFlicker: 2,
    emberRate: 6,
  },
  love: {
    energy: 0.5,
    bounceFreq: 1.1,
    bounceAmp: 0.04,
    sway: 0.16,
    tilt: 0.1,
    armRaise: 0.3,
    eyeHappy: 1,
    smile: 1,
    tintR: 1.08,
    tintG: 0.95,
    tintB: 1.02,
    brightness: 1.06,
    flameHeight: 1.25,
    flameGold: 0.25,
    emberRate: 3,
  },
};

export function targetParams(e: Emotion, intensity: number, out: ExprParams): ExprParams {
  const t = EMOTIONS[e] ?? {};
  for (const k in BASE) {
    const key = k as keyof ExprParams;
    const b = BASE[key];
    const v = t[key];
    out[key] = v === undefined ? b : b + (v - b) * intensity;
  }
  return out;
}

export function makeParams(): ExprParams {
  return { ...BASE };
}

/** One-shot actions automatically fired when entering an emotion. */
export const ENTER_ACTION: Partial<Record<Emotion, MascotAction>> = {
  error: 'flinch',
  celebrate: 'celebrate',
  surprised: 'flinch',
  excited: 'jump',
  happy: 'nod',
};

export const ACTION_DURATION: Record<MascotAction, number> = {
  poke: 0.65,
  wave: 1.5,
  jump: 0.95,
  spin: 1.05,
  nod: 0.8,
  shake: 0.85,
  celebrate: 1.7,
  flinch: 0.7,
  peek: 1.5,
};
