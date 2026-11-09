import { SAVE_VERSION, type GameState } from './State';
import { newGameState } from '../data/newGame';

const PREFIX = 'ibe.save.';

export interface SaveInfo {
  slot: string;
  savedAt: number;
  location: string;
  earthTime: number;
  playSeconds: number;
  label: string;
}

/** Migrations from older save versions. Each step upgrades version n -> n+1. */
const MIGRATIONS: Record<number, (s: any) => any> = {
  1: (s) => ({ ...s, dialogueSeen: s.dialogueSeen ?? [], version: 2 }),
  2: (s) => ({ ...s, discoveries: s.discoveries ?? [], version: 3 }),
};

export function migrate(raw: any): GameState {
  let s = raw;
  let guard = 0;
  while (s.version < SAVE_VERSION && guard++ < 50) {
    const m = MIGRATIONS[s.version];
    if (!m) throw new Error(`No migration from save version ${s.version}`);
    s = m(s);
  }
  // fill any missing keys from a fresh state (forward compatibility for new subsystems)
  const fresh = newGameState();
  return deepFill(s, fresh) as GameState;
}

function deepFill(target: any, defaults: any): any {
  if (target === undefined || target === null) return defaults;
  if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) return target;
  const out: any = { ...target };
  for (const k of Object.keys(defaults)) {
    if (!(k in out)) out[k] = defaults[k];
    else if (typeof defaults[k] === 'object' && defaults[k] !== null && !Array.isArray(defaults[k]) && k !== 'vehicles' && k !== 'npcs' && k !== 'systems' && k !== 'flags') {
      out[k] = deepFill(out[k], defaults[k]);
    }
  }
  return out;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const raw = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null || typeof raw.version !== 'number') throw new Error('Invalid save data');
  return migrate(raw);
}

export function saveToSlot(slot: string, state: GameState, label = ''): boolean {
  state.savedAt = Date.now();
  try {
    localStorage.setItem(PREFIX + slot, serialize(state));
    const info: SaveInfo = {
      slot,
      savedAt: state.savedAt,
      location: state.location,
      earthTime: state.clock.earthTime,
      playSeconds: state.playSeconds,
      label: label || state.location,
    };
    localStorage.setItem(PREFIX + slot + '.info', JSON.stringify(info));
    return true;
  } catch (e) {
    console.warn('[save] failed', e);
    return false;
  }
}

export function loadFromSlot(slot: string): GameState | null {
  try {
    const raw = localStorage.getItem(PREFIX + slot);
    if (!raw) return null;
    return deserialize(raw);
  } catch (e) {
    console.warn('[save] load failed', e);
    return null;
  }
}

export function listSaves(): SaveInfo[] {
  const out: SaveInfo[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(PREFIX) && k.endsWith('.info')) {
        try {
          out.push(JSON.parse(localStorage.getItem(k)!));
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function deleteSave(slot: string) {
  try {
    localStorage.removeItem(PREFIX + slot);
    localStorage.removeItem(PREFIX + slot + '.info');
  } catch {
    /* ignore */
  }
}
