export type PresetName = 'cinematic' | 'ultra' | 'high' | 'medium' | 'performance' | 'phone';
/** presets from best to cheapest (automatic step-down walks this list) */
export const PRESET_ORDER: PresetName[] = ['cinematic', 'ultra', 'high', 'medium', 'performance', 'phone'];
export type Quality = 0 | 1 | 2 | 3; // off/low, medium, high, ultra

export interface GraphicsSettings {
  preset: PresetName | 'custom';
  resolutionScale: number; // 0.5..1.5
  textureQuality: Quality;
  shadowQuality: Quality;
  reflections: Quality;
  ambientOcclusion: Quality;
  volumetrics: Quality;
  atmosphere: Quality;
  water: Quality;
  viewDistance: Quality;
  antiAliasing: 'off' | 'fxaa' | 'smaa' | 'msaa';
  motionBlur: boolean;
  filmGrain: boolean;
  lensEffects: boolean;
  bloom: boolean;
  fpsCap: 0 | 30 | 60 | 120;
  fov: number;
  vegetationDensity: number; // 0.2..1.5
  /** lower the render resolution automatically when the frame rate drops (and raise it again when there is headroom) */
  dynamicResolution: boolean;
  /** device-pixel-ratio ceiling (high-DPI phones render 3× pixels otherwise) */
  pixelRatioCap: number;
  /** chosen by device detection rather than by the player: may be stepped down automatically if it cannot hold the frame rate */
  autoPreset?: boolean;
}

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  dialogue: number;
  ambience: number;
}

export interface ControlSettings {
  mouseSensitivity: number;
  gamepadSensitivity: number;
  invertY: boolean;
  invertFlightPitch: boolean;
  touchScale: number;
  bindings: Record<string, string[]>; // action -> key codes
  headBob: boolean;
  subtitles: boolean;
}

export interface Settings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  controls: ControlSettings;
}

export const PRESETS: Record<PresetName, Omit<GraphicsSettings, 'preset' | 'fov' | 'fpsCap' | 'autoPreset'>> = {
  cinematic: {
    resolutionScale: 1.0, textureQuality: 3, shadowQuality: 3, reflections: 3, ambientOcclusion: 3, volumetrics: 3,
    atmosphere: 3, water: 3, viewDistance: 3, antiAliasing: 'smaa', motionBlur: true, filmGrain: true, lensEffects: true,
    bloom: true, vegetationDensity: 1.3, dynamicResolution: false, pixelRatioCap: 2.5,
  },
  ultra: {
    resolutionScale: 1.0, textureQuality: 3, shadowQuality: 3, reflections: 2, ambientOcclusion: 2, volumetrics: 3,
    atmosphere: 3, water: 3, viewDistance: 3, antiAliasing: 'smaa', motionBlur: false, filmGrain: true, lensEffects: true,
    bloom: true, vegetationDensity: 1.1, dynamicResolution: false, pixelRatioCap: 2.5,
  },
  high: {
    resolutionScale: 1.0, textureQuality: 2, shadowQuality: 2, reflections: 2, ambientOcclusion: 1, volumetrics: 2,
    atmosphere: 2, water: 2, viewDistance: 2, antiAliasing: 'fxaa', motionBlur: false, filmGrain: true, lensEffects: true,
    bloom: true, vegetationDensity: 0.9, dynamicResolution: false, pixelRatioCap: 2,
  },
  medium: {
    resolutionScale: 0.85, textureQuality: 1, shadowQuality: 1, reflections: 1, ambientOcclusion: 0, volumetrics: 1,
    atmosphere: 1, water: 1, viewDistance: 1, antiAliasing: 'fxaa', motionBlur: false, filmGrain: false, lensEffects: false,
    bloom: true, vegetationDensity: 0.6, dynamicResolution: true, pixelRatioCap: 2,
  },
  performance: {
    resolutionScale: 0.7, textureQuality: 0, shadowQuality: 0, reflections: 0, ambientOcclusion: 0, volumetrics: 0,
    atmosphere: 0, water: 0, viewDistance: 0, antiAliasing: 'off', motionBlur: false, filmGrain: false, lensEffects: false,
    bloom: false, vegetationDensity: 0.35, dynamicResolution: true, pixelRatioCap: 1.5,
  },
  // weak phones: about a third of the pixels of 'performance' on a 3× screen, cheapest shader paths everywhere
  phone: {
    resolutionScale: 0.75, textureQuality: 0, shadowQuality: 0, reflections: 0, ambientOcclusion: 0, volumetrics: 0,
    atmosphere: 0, water: 0, viewDistance: 0, antiAliasing: 'off', motionBlur: false, filmGrain: false, lensEffects: false,
    bloom: false, vegetationDensity: 0.2, dynamicResolution: true, pixelRatioCap: 1,
  },
};

export const DEFAULT_BINDINGS: Record<string, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['KeyC', 'ControlLeft'],
  sprint: ['ShiftLeft'],
  interact: ['KeyE'],
  vehicle: ['KeyF'],
  view: ['KeyV'],
  menu: ['Escape', 'KeyP'],
  computer: ['KeyM'],
  crew: ['KeyQ'],
  flashlight: ['KeyL'],
  helmet: ['KeyH'],
  cockpitMode: ['Tab'],
  quickSave: ['F5'],
  quickLoad: ['F9'],
  creative: ['KeyK'],
  // flight
  throttleUp: ['ShiftLeft'],
  throttleDown: ['ControlLeft'],
  throttleMax: ['KeyZ'],
  throttleCut: ['KeyX'],
  pitchDown: ['KeyW'],
  pitchUp: ['KeyS'],
  yawLeft: ['KeyA'],
  yawRight: ['KeyD'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  transUp: ['KeyI'],
  transDown: ['KeyK'],
  transLeft: ['KeyJ'],
  transRight: ['KeyL'],
  transFwd: ['KeyU'],
  transBack: ['KeyO'],
  sas: ['KeyT'],
  rcs: ['KeyR'],
  gear: ['KeyG'],
  brake: ['Space'],
  autopilot: ['KeyY'],
  camera: ['KeyC'],
  timeWarpUp: ['Period'],
  timeWarpDown: ['Comma'],
};

/**
 * First-run preset from what the browser reveals: phones get 'performance', and 'phone' when they also report few
 * cores or little memory; desktops 'high'. Marked automatic, so a device that still cannot hold its frame rate is
 * stepped down further at run time (Game.adaptQuality).
 */
export function detectPreset(): PresetName {
  if (typeof navigator === 'undefined') return 'high';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) || (nav.maxTouchPoints > 1 && /Macintosh/.test(nav.userAgent));
  if (!mobile) return (nav.hardwareConcurrency ?? 8) <= 2 ? 'medium' : 'high';
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3;
  return weak ? 'phone' : 'performance';
}

export function defaultSettings(): Settings {
  const preset = detectPreset();
  return {
    graphics: { preset, ...PRESETS[preset], fpsCap: 0, fov: 70, autoPreset: true },
    audio: { master: 0.8, music: 0.55, sfx: 0.85, dialogue: 1.0, ambience: 0.8 },
    controls: {
      mouseSensitivity: 1.0,
      gamepadSensitivity: 1.0,
      invertY: false,
      invertFlightPitch: false,
      touchScale: 1.0,
      bindings: structuredClone(DEFAULT_BINDINGS),
      headBob: true,
      subtitles: true,
    },
  };
}

const KEY = 'ibe.settings.v1';

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      graphics: { ...d.graphics, ...(s.graphics ?? {}) },
      audio: { ...d.audio, ...(s.audio ?? {}) },
      controls: {
        ...d.controls,
        ...(s.controls ?? {}),
        bindings: { ...d.controls.bindings, ...(s.controls?.bindings ?? {}) },
      },
    };
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function applyPreset(g: GraphicsSettings, p: PresetName) {
  Object.assign(g, PRESETS[p]);
  g.preset = p;
}

/** Shader-side detail per quality level (shared uniforms read by the atmosphere, black-hole and terrain shaders). */
export function shaderDetail(g: GraphicsSettings) {
  return {
    atmo: [0.5, 0.75, 1, 1][g.atmosphere] ?? 1,
    garg: [0.5, 0.7, 1, 1][g.volumetrics] ?? 1,
    detail: [0.45, 0.75, 1, 1][g.textureQuality] ?? 1,
    /** environment-map refresh interval multiplier */
    env: g.preset === 'phone' ? 3 : g.atmosphere === 0 ? 2 : 1,
  };
}
