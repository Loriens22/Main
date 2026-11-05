import { create } from 'zustand';

export type Quality = 'low' | 'medium' | 'high';

function initialQuality(): Quality {
  try {
    const q = localStorage.getItem('aurora2.quality') as Quality | null;
    if (q === 'low' || q === 'medium' || q === 'high') return q;
  } catch { /* storage unavailable */ }
  if (typeof window !== 'undefined' && (window.innerWidth < 700 || (navigator.hardwareConcurrency ?? 8) <= 4)) return 'low';
  return 'medium';
}

interface State {
  quality: Quality;
  setQuality: (q: Quality) => void;
}

export const useStore = create<State>((set) => ({
  quality: initialQuality(),
  setQuality: (quality) => {
    try { localStorage.setItem('aurora2.quality', quality); } catch { /* ignore */ }
    set({ quality });
  },
}));
