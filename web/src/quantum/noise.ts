import type { NoiseParams } from './types';

export const DEFAULT_NOISE: NoiseParams = {
  p1: 2e-4, p2: 2e-3, readout: 1e-2, reset_error: 0, t1_us: null, t2_us: null,
  t_1q_ns: 25, t_2q_ns: 70, crosstalk_zz: 0,
};

/** Mirrors backend/aurora/noise.py PRESETS. All values are assumptions, not AURORA-Q measurements. */
export const NOISE_PRESETS: Record<string, { label: string; params: NoiseParams; note: string }> = {
  ideal: { label: 'Ideal (noise-free)', params: { ...DEFAULT_NOISE, p1: 0, p2: 0, readout: 0, reset_error: 0 }, note: 'Noise-free reference.' },
  heron_class: {
    label: 'Heron-class (illustrative)',
    params: { ...DEFAULT_NOISE, p1: 2.5e-4, p2: 2.5e-3, readout: 1.3e-2, reset_error: 1e-2, t1_us: 250, t2_us: 200 },
    note: 'Order-of-magnitude values from public dashboards; conditional reset limited by readout.',
  },
  nighthawk_r2_class: {
    label: 'Nighthawk r2-class (illustrative)',
    params: { ...DEFAULT_NOISE, p1: 2.5e-4, p2: 2.5e-3, readout: 1.3e-2, reset_error: 4e-4, t1_us: 250, t2_us: 200 },
    note: 'As Heron-class but with the ≈25× lower initialisation error IBM reports for dissipative reset.',
  },
  aurora_q_target: {
    label: 'AURORA-Q design target',
    params: { ...DEFAULT_NOISE, p1: 1e-4, p2: 1e-3, readout: 5e-3, reset_error: 4e-4, t1_us: 500, t2_us: 500 },
    note: 'A design TARGET requiring materials advances (e.g. Ta-on-Si transmons); not a measurement.',
  },
  stress: {
    label: 'Stress test (very noisy)',
    params: { ...DEFAULT_NOISE, p1: 5e-3, p2: 5e-2, readout: 5e-2, reset_error: 2e-2, t1_us: 30, t2_us: 20 },
    note: 'Exaggerated noise to make error effects obvious.',
  },
};

export function isNoisy(n?: NoiseParams | null): boolean {
  return !!n && (n.p1 > 0 || n.p2 > 0 || n.readout > 0 || n.reset_error > 0 || n.crosstalk_zz > 0 || (!!n.t1_us && !!n.t2_us));
}
