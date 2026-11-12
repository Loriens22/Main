import { bus } from './events';

export type PresetName = 'cinematic' | 'ultra' | 'high' | 'medium' | 'performance';

export interface GraphicsSettings {
  preset: PresetName | 'custom';
  resolutionScale: number; // multiplier on device pixel ratio (capped)
  textureQuality: 0 | 1 | 2; // anisotropy / mip bias tier
  shadowQuality: 0 | 1 | 2 | 3; // 0 = off
  reflections: 0 | 1 | 2; // env map refresh + resolution
  ambientOcclusion: 0 | 1 | 2;
  volumetrics: 0 | 1 | 2; // haze layers, dust volumes, god-ray quality
  atmosphere: 0 | 1 | 2; // sky scattering samples
  water: 0 | 1 | 2;
  viewDistance: number; // 0.5 .. 1.5 multiplier
  vegetation: number; // 0.3 .. 1.5 density multiplier
  antialiasing: 0 | 1 | 2; // off / SMAA / SMAA high
  bloom: boolean;
  motionBlur: boolean;
  filmGrain: boolean;
  lensEffects: boolean;
  fpsCap: number; // 0 = uncapped (display refresh)
}

export const PRESETS: Record<PresetName, Omit<GraphicsSettings, 'preset'>> = {
  cinematic: { resolutionScale: 1.0, textureQuality: 2, shadowQuality: 3, reflections: 2, ambientOcclusion: 2, volumetrics: 2, atmosphere: 2, water: 2, viewDistance: 1.4, vegetation: 1.4, antialiasing: 2, bloom: true, motionBlur: true, filmGrain: true, lensEffects: true, fpsCap: 0 },
  ultra:     { resolutionScale: 1.0, textureQuality: 2, shadowQuality: 3, reflections: 2, ambientOcclusion: 2, volumetrics: 2, atmosphere: 2, water: 2, viewDistance: 1.2, vegetation: 1.2, antialiasing: 2, bloom: true, motionBlur: false, filmGrain: true, lensEffects: true, fpsCap: 0 },
  high:      { resolutionScale: 1.0, textureQuality: 2, shadowQuality: 2, reflections: 1, ambientOcclusion: 1, volumetrics: 1, atmosphere: 1, water: 1, viewDistance: 1.0, vegetation: 1.0, antialiasing: 1, bloom: true, motionBlur: false, filmGrain: true, lensEffects: true, fpsCap: 0 },
  medium:    { resolutionScale: 0.85, textureQuality: 1, shadowQuality: 1, reflections: 1, ambientOcclusion: 0, volumetrics: 1, atmosphere: 1, water: 1, viewDistance: 0.8, vegetation: 0.7, antialiasing: 1, bloom: true, motionBlur: false, filmGrain: false, lensEffects: false, fpsCap: 0 },
  performance: { resolutionScale: 0.6, textureQuality: 0, shadowQuality: 0, reflections: 0, ambientOcclusion: 0, volumetrics: 0, atmosphere: 0, water: 0, viewDistance: 0.6, vegetation: 0.4, antialiasing: 0, bloom: false, motionBlur: false, filmGrain: false, lensEffects: false, fpsCap: 0 },
};

export interface AudioSettings { master: number; music: number; sfx: number; dialogue: number; ambience: number; voice: boolean }

export interface ControlSettings {
  mouseSensitivity: number;
  gamepadSensitivity: number;
  invertY: boolean;
  invertFlightPitch: boolean;
  touchScale: number;
  bindings: Record<string, string[]>; // action -> KeyboardEvent.code list
}

export interface CreativeSettings {
  unlimitedResources: boolean;
  autoRefuel: boolean;
  autoRepair: boolean;
  autopilotAssist: boolean;
  damageProtection: boolean;
  fastTravel: boolean;
  freeCamera: boolean;
}

export interface AllSettings {
  version: number;
  graphics: GraphicsSettings;
  audio: AudioSettings;
  controls: ControlSettings;
  creative: CreativeSettings;
}

export const DEFAULT_BINDINGS: Record<string, string[]> = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'],
  interact: ['KeyE'], exit: ['KeyF'], camera: ['KeyV'], menu: ['Escape'], computer: ['KeyM'], creative: ['KeyP'],
  flashlight: ['KeyL'], crew: ['KeyG'], thirdPerson: ['KeyT'],
  // vehicles
  brake: ['Space'], headlights: ['KeyH'], horn: ['KeyB'],
  // spacecraft
  throttleUp: ['ShiftLeft'], throttleDown: ['ControlLeft'], throttleCut: ['KeyX'], throttleMax: ['KeyZ'],
  rollLeft: ['KeyQ'], rollRight: ['KeyE'],
  transFwd: ['KeyI'], transBack: ['KeyK'], transLeft: ['KeyJ'], transRight: ['KeyL'], transUp: ['KeyU'], transDown: ['KeyO'],
  sas: ['KeyR'], gear: ['KeyN'], autopilot: ['KeyY'], vtol: ['Space'],
};

function detectPreset(): PresetName {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  if (mobile) return 'medium';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as any).deviceMemory || 8;
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

const KEY = 'ibe.settings.v1';

export class Settings {
  data: AllSettings;

  constructor() {
    const preset = detectPreset();
    this.data = {
      version: 1,
      graphics: { preset, ...PRESETS[preset] },
      audio: { master: 0.8, music: 0.55, sfx: 0.8, dialogue: 0.9, ambience: 0.7, voice: false },
      controls: { mouseSensitivity: 1.0, gamepadSensitivity: 1.0, invertY: false, invertFlightPitch: false, touchScale: 1.0, bindings: structuredClone(DEFAULT_BINDINGS) },
      creative: { unlimitedResources: false, autoRefuel: true, autoRepair: true, autopilotAssist: true, damageProtection: true, fastTravel: true, freeCamera: false },
    };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 1) {
          Object.assign(this.data.graphics, s.graphics);
          Object.assign(this.data.audio, s.audio);
          Object.assign(this.data.controls, s.controls, { bindings: { ...DEFAULT_BINDINGS, ...(s.controls?.bindings || {}) } });
          Object.assign(this.data.creative, s.creative);
        }
      }
    } catch { /* corrupted settings fall back to defaults */ }
  }

  get g() { return this.data.graphics; }
  get a() { return this.data.audio; }
  get c() { return this.data.controls; }
  get creative() { return this.data.creative; }

  applyPreset(p: PresetName) {
    this.data.graphics = { preset: p, ...PRESETS[p] };
    this.changed('graphics');
  }

  setGraphics<K extends keyof GraphicsSettings>(k: K, v: GraphicsSettings[K]) {
    this.data.graphics[k] = v;
    if (k !== 'preset') this.data.graphics.preset = 'custom';
    this.changed('graphics');
  }

  changed(section: 'graphics' | 'audio' | 'controls' | 'creative') {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
    bus.emit('settings:' + section, this.data[section]);
    bus.emit('settings', this.data);
  }
}
