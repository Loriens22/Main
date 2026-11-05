import { run } from '../quantum/engine';
import { NOISE_PRESETS } from '../quantum/noise';
import { route, squareGrid } from '../quantum/router';
import type { Circuit, Op } from '../quantum/types';
import type { TwinRun } from './store';

export const TILE = squareGrid(12, 10);

/** Assumed operation durations (ns) for schedule estimates — assumptions, documented on the Architecture page. */
export const DURATIONS_NS = { oneQ: 25, cz: 70, measure: 1000, reset: 200 };

export function opDuration(op: Op): number {
  if (op.name === 'barrier') return 0;
  if (op.name === 'measure') return DURATIONS_NS.measure;
  if (op.name === 'reset') return DURATIONS_NS.reset;
  if (op.qubits.length === 1) return op.name === 'rz' || op.name === 'p' || op.name === 'z' || op.name === 's' || op.name === 'sdg' || op.name === 't' || op.name === 'tdg' ? 0 : DURATIONS_NS.oneQ;
  if (op.name === 'swap') return 3 * DURATIONS_NS.cz + 2 * DURATIONS_NS.oneQ;
  if (op.name === 'cz') return DURATIONS_NS.cz;
  if (op.name === 'cx' || op.name === 'cy') return DURATIONS_NS.cz + 2 * DURATIONS_NS.oneQ;
  return 2 * DURATIONS_NS.cz + 3 * DURATIONS_NS.oneQ; // generic 2Q gate ~ 2 CZ + single-qubit layers
}

export function layerDurations(layers: Op[][]): number[] {
  return layers.map((l) => Math.max(0, ...l.map(opDuration)));
}

export function makeTwin(circuit: Circuit, presetKey: string, shots: number, seed = 1): TwinRun {
  const preset = NOISE_PRESETS[presetKey] ?? NOISE_PRESETS.ideal;
  const noise = presetKey === 'ideal' ? null : preset.params;
  const result = run(circuit, { shots, noise, seed });
  const r = route(circuit, TILE, seed);
  return { circuit, result, route: r, noiseLabel: preset.label, noise, at: Date.now() };
}

/** Marginal P(1) per classical bit from counts (keys are c[n-1]..c[0]). */
export function clbitMarginals(counts: Record<string, number>): number[] {
  const keys = Object.keys(counts);
  if (!keys.length) return [];
  const n = keys[0].length;
  const tot = Object.values(counts).reduce((a, b) => a + b, 0);
  const out = new Array(n).fill(0);
  for (const [k, v] of Object.entries(counts)) for (let i = 0; i < n; i++) if (k[n - 1 - i] === '1') out[i] += v;
  return out.map((x) => x / tot);
}
