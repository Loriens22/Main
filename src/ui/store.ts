import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';

export interface Toast { id: number; text: string; kind: 'info' | 'warn' | 'good'; until: number }
export interface Subtitle { speaker: string; text: string; until: number }
export interface HudGauge { label: string; value: string; warn?: boolean }

export interface UIState {
  loading: { active: boolean; label: string; f: number };
  /** full-screen layer: main menu, pause, or none */
  screen: 'boot' | 'menu' | 'pause' | 'none';
  menuReady: boolean;
  /** id of the open in-world panel (terminal, farm control, dialogue...) or null */
  panel: string | null;
  panelProps: any;
  prompt: string;
  promptKey: string;
  hints: string[];
  subtitle: Subtitle | null;
  toasts: Toast[];
  location: string;
  mode: 'foot' | 'drive' | 'fly' | 'seat' | 'float' | 'sub' | 'cinematic';
  gauges: HudGauge[];
  gps: { name: string; dist: number } | null;
  clocks: { label: string; value: string }[];
  alert: string;
  touch: boolean;
  /** bumps whenever non-reactive data a panel reads has changed */
  tick: number;
  /** special full-screen view overlays: 'dockcam' */
  view: string;
  /** docking display (null when no docking target) */
  dock: DockHud | null;
  /** cracked helmet visor 0..1 (a suit breach) */
  visor: number;
}

export interface DockHud {
  target: string; port: string; range: number; axial: number; lx: number; ly: number; vx: number; vy: number; closing: number;
  align: number; tiltX: number; tiltY: number; roll: number; rollRate: number; fuel: number; rcs: string; clearance: string;
  state: string; issues: string[]; auto: string; spin: number; time: number;
}

let state: UIState = {
  loading: { active: true, label: 'Initialising', f: 0 },
  screen: 'boot', menuReady: false, panel: null, panelProps: null, prompt: '', promptKey: 'E', hints: [], subtitle: null, toasts: [],
  location: '', mode: 'cinematic', gauges: [], gps: null, clocks: [], alert: '', touch: false, tick: 0, view: '', dock: null, visor: 0,
};

const subs = new Set<() => void>();
let toastId = 1;

export const ui = {
  get: () => state,
  set(patch: Partial<UIState>) {
    let changed = false;
    for (const k in patch) {
      const key = k as keyof UIState;
      const a = (state as any)[key], b = (patch as any)[key];
      if (a === b) continue;
      // cheap structural check so per-frame HUD updates with identical content do not re-render
      if (typeof a === 'object' && typeof b === 'object' && a && b && JSON.stringify(a) === JSON.stringify(b)) continue;
      changed = true;
      break;
    }
    if (!changed) return;
    // a fresh object each time so selectors that return the whole state see a new reference
    state = { ...state, ...patch };
    for (const s of subs) s();
  },
  toast(text: string, kind: Toast['kind'] = 'info', seconds = 4) {
    const t: Toast = { id: toastId++, text, kind, until: performance.now() + seconds * 1000 };
    ui.set({ toasts: [...state.toasts.filter((x) => x.until > performance.now()).slice(-4), t] });
    setTimeout(() => ui.set({ toasts: state.toasts.filter((x) => x.id !== t.id) }), seconds * 1000 + 50);
  },
  say(speaker: string, text: string, seconds?: number) {
    const dur = seconds ?? Math.max(2.5, text.length * 0.06);
    const s: Subtitle = { speaker, text, until: performance.now() + dur * 1000 };
    ui.set({ subtitle: s });
    setTimeout(() => { if (state.subtitle === s) ui.set({ subtitle: null }); }, dur * 1000 + 30);
    return dur;
  },
  openPanel(id: string, props: any = null) { ui.set({ panel: id, panelProps: props }); },
  closePanel() { ui.set({ panel: null, panelProps: null }); },
  refresh() { ui.set({ tick: state.tick + 1 }); },
  subscribe(fn: () => void) { subs.add(fn); return () => subs.delete(fn); },
};

/** Re-render a component when the selected slice of UI state changes. */
export function useUI<T>(sel: (s: UIState) => T): T {
  const [v, setV] = useState(() => sel(state));
  useEffect(() => {
    const fn = () => setV(() => sel(state));
    fn();
    return ui.subscribe(fn) as () => void;
  }, []);
  return v;
}

/** Panels are registered by the gameplay modules that own them. */
export const panels = new Map<string, ComponentType<any>>();
export function registerPanel(id: string, c: ComponentType<any>) { panels.set(id, c); }
