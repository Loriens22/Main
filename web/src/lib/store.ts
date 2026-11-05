import { create } from 'zustand';
import type { RouteResult } from '../quantum/router';
import type { Circuit, NoiseParams, RunResult } from '../quantum/types';

export type Quality = 'low' | 'medium' | 'high';

function initialQuality(): Quality {
  try {
    const q = localStorage.getItem('aurora.quality') as Quality | null;
    if (q === 'low' || q === 'medium' || q === 'high') return q;
  } catch { /* storage unavailable */ }
  if (typeof window !== 'undefined' && (window.innerWidth < 700 || (navigator.hardwareConcurrency ?? 8) <= 4)) return 'low';
  return 'medium';
}

export interface TwinRun {
  circuit: Circuit;
  result: RunResult;
  route: RouteResult;
  noiseLabel: string;
  noise: NoiseParams | null;
  at: number;
}

interface State {
  quality: Quality;
  setQuality: (q: Quality) => void;
  twin: TwinRun | null;
  setTwin: (t: TwinRun) => void;
  labCircuit: Circuit | null;
  setLabCircuit: (c: Circuit | null) => void;
  explorerMode: 'installation' | 'module' | 'chip';
  setExplorerMode: (m: 'installation' | 'module' | 'chip') => void;
}

export const useStore = create<State>((set) => ({
  quality: initialQuality(),
  setQuality: (quality) => {
    try { localStorage.setItem('aurora.quality', quality); } catch { /* ignore */ }
    set({ quality });
  },
  twin: null,
  setTwin: (twin) => set({ twin }),
  labCircuit: null,
  setLabCircuit: (labCircuit) => set({ labCircuit }),
  explorerMode: 'installation',
  setExplorerMode: (explorerMode) => set({ explorerMode }),
}));
