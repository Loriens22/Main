// Persistent settings & save game (localStorage, guarded).
export const DEFAULTS = {
  lang: 'bg',
  quality: null, // auto-detected on first run
  renderScale: 1,
  showFps: false,
  volMaster: 0.9, volEngine: 0.8, volVoice: 1, volAmbience: 0.7, volSfx: 0.9,
  sensitivity: 1, invertY: false, gyro: false, controlsSize: 1,
  voiceName: '', voiceRate: 0.93,
  beepFreq: 1850, beepDur: 0.24,
  fleet: '3145', traffic: 'medium',
  // lines and dispatch: the line played, the bus per line ('random' = dispatched per service),
  // the share of the first vehicle type of each line when random, and an optional fixed seed
  line: '280',
  vehicle280: 'random', vehicle64: 'random',
  share280: 0.5, share64: 0.5,
  dispatchSeed: '',
};

const KEY = 'sofia280.settings.v1';
const SAVE = 'sofia280.save.v1';

export function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch (e) {
    s = {};
  }
  return { ...DEFAULTS, ...s };
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    /* private mode */
  }
}

export function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE) || 'null');
  } catch (e) {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE, JSON.stringify({ ...data, at: Date.now() }));
  } catch (e) {
    /* ignore */
  }
}

/** Rough device capability guess for the initial graphics preset. */
export function detectQuality() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return mem >= 6 && cores >= 8 ? 'high' : 'balanced';
  return cores >= 8 && mem >= 8 ? 'ultra' : 'high';
}
