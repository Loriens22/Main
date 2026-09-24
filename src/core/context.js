// Global game context and persistent settings.
//
// A single mutable object `G` holds references to the engine subsystems
// (renderer, worlds, player, UI, generation pipeline...). Modules import it
// instead of threading a dozen constructor parameters everywhere.

export const G = {
  renderer: null,
  camera: null,
  post: null,
  atmosphere: null,
  baker: null,
  materials: null,
  overworld: null,
  world: null,        // currently active World (overworld or a portal dimension)
  worlds: new Map(),
  player: null,
  input: null,
  ui: null,
  audio: null,
  registry: null,
  pipeline: null,
  jobs: null,
  lights: null,
  time: 0,            // seconds since start (game time, pauses with the game)
  dt: 0,
  paused: true,
  started: false,
  isTouch: false,
  frame: 0,
  fps: 60,
  quality: null,      // resolved graphics preset object
};

const SETTINGS_KEY = 'genesis.settings.v1';

export const DEFAULT_SETTINGS = {
  graphics: 'auto',       // auto | low | medium | high | ultra
  renderScale: 1,
  fov: 75,
  sensitivity: 1,
  invertY: false,
  genQuality: 'balanced', // fast | balanced | highest
  maxGenSeconds: 300,     // hard cap for one generation (spec: <= 5 minutes)
  shadows: true,
  ao: true,
  bloom: true,
  grassDensity: 1,
  drawDistance: 1,
  dayCycle: true,
  dayLengthMin: 30,
  tts: false,
  volume: 0.7,
  showFps: false,
  touchControls: 'auto',  // auto | on | off
  thirdPerson: false,
  headBob: true,
};

export const settings = { ...DEFAULT_SETTINGS };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* storage unavailable */ }
  return settings;
}

export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

// Graphics presets. `auto` resolves to one of these at boot based on device.
export const GRAPHICS_PRESETS = {
  low: {
    name: 'low', pixelRatio: 0.8, shadowMap: 1024, shadowRange: 35, ao: false, bloom: false, msaa: 0, fxaa: true,
    grassCount: 26000, grassRadius: 26, treeDensity: 0.35, texSize: 512, terrainLodBias: 0.6, portalScale: 0.4,
    maxPointLights: 2, anisotropy: 2, envRes: 128, farDistance: 1400,
  },
  medium: {
    name: 'medium', pixelRatio: 1, shadowMap: 2048, shadowRange: 50, ao: false, bloom: true, msaa: 0, fxaa: true,
    grassCount: 70000, grassRadius: 38, treeDensity: 0.65, texSize: 512, terrainLodBias: 1, portalScale: 0.5,
    maxPointLights: 4, anisotropy: 4, envRes: 256, farDistance: 2200,
  },
  high: {
    name: 'high', pixelRatio: 1.25, shadowMap: 4096, shadowRange: 60, ao: true, bloom: true, msaa: 4, fxaa: false,
    grassCount: 160000, grassRadius: 50, treeDensity: 1, texSize: 1024, terrainLodBias: 1.4, portalScale: 0.7,
    maxPointLights: 6, anisotropy: 8, envRes: 256, farDistance: 3000,
  },
  ultra: {
    name: 'ultra', pixelRatio: 2, shadowMap: 4096, shadowRange: 75, ao: true, bloom: true, msaa: 4, fxaa: false,
    grassCount: 260000, grassRadius: 62, treeDensity: 1.25, texSize: 1024, terrainLodBias: 2, portalScale: 1,
    maxPointLights: 8, anisotropy: 16, envRes: 512, farDistance: 3500,
  },
};

// Generation quality presets: voxel sizes for SDF meshing, texture resolution, detail flags.
export const GEN_PRESETS = {
  fast: { name: 'fast', bodyVoxel: 0.016, headVoxel: 0.0045, handVoxel: 0.005, texScale: 0.5, detail: 0.45, hairStrands: 0.3, interiors: false, estimateMul: 0.5 },
  balanced: { name: 'balanced', bodyVoxel: 0.011, headVoxel: 0.0032, handVoxel: 0.0038, texScale: 1, detail: 0.75, hairStrands: 0.7, interiors: true, estimateMul: 1 },
  highest: { name: 'highest', bodyVoxel: 0.0075, headVoxel: 0.0024, handVoxel: 0.0028, texScale: 2, detail: 1, hairStrands: 1, interiors: true, estimateMul: 2.2 },
};

export function genPreset() { return GEN_PRESETS[settings.genQuality] || GEN_PRESETS.balanced; }
