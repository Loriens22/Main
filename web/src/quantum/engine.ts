// AURORA-Q browser execution engine. Chooses an exact method that fits the circuit and the browser's memory,
// and reports clearly which method ran and what approximations (if any) were made.

import { hasMidCircuitOps, LIMITS, stats, validate } from './circuit';
import { DensityMatrix } from './density';
import { isClifford, matrix1, type M2 } from './gates';
import { isNoisy } from './noise';
import { Rng } from './rng';
import { Tableau } from './stabilizer';
import { StateVector } from './statevector';
import type { Circuit, Method, NoiseParams, Op, RunOptions, RunResult } from './types';

const EXEC = 'Simulated in your browser by the AURORA-Q engine — not physical QPU execution.';

export function chooseMethod(c: Circuit, noise?: NoiseParams | null): Exclude<Method, 'auto'> {
  const st = stats(c);
  const noisy = isNoisy(noise);
  const mid = hasMidCircuitOps(c);
  if (!noisy) {
    if (c.num_qubits <= LIMITS.statevector) return 'statevector';
    if (st.clifford) return 'stabilizer';
    throw new Error(`A ${c.num_qubits}-qubit non-Clifford circuit needs 2^${c.num_qubits} amplitudes — beyond exact simulation in a browser. Use ≤ ${LIMITS.statevector} qubits, or Clifford gates only (stabilizer method scales to ${LIMITS.stabilizer} qubits).`);
  }
  if (c.num_qubits <= LIMITS.density && !mid) return 'density_matrix';
  if (st.clifford && c.num_qubits > LIMITS.trajectories) return 'stabilizer';
  if (c.num_qubits <= LIMITS.trajectories) return 'trajectories';
  if (st.clifford) return 'stabilizer';
  throw new Error(`Noisy ${c.num_qubits}-qubit non-Clifford simulation exceeds browser limits (trajectories ≤ ${LIMITS.trajectories} qubits).`);
}

function clbitMap(c: Circuit): { map: Map<number, number>; implicit: boolean } {
  const map = new Map<number, number>();
  let any = false;
  for (const op of c.ops) {
    if (op.name !== 'measure') continue;
    any = true;
    const cb = op.clbits ?? op.qubits;
    op.qubits.forEach((q, i) => map.set(q, cb[i]));
  }
  if (!any) for (let q = 0; q < c.num_qubits; q++) map.set(q, q);
  return { map, implicit: !any };
}

function key(bits: number, nc: number): string {
  let s = '';
  for (let k = nc - 1; k >= 0; k--) s += (bits >> k) & 1 ? '1' : '0';
  return s;
}

/** Marginalise a qubit-basis distribution onto classical bits. */
function toClbitDist(p: Float64Array, map: Map<number, number>, nc: number): Float64Array {
  const out = new Float64Array(1 << nc);
  const pairs = [...map.entries()];
  for (let i = 0; i < p.length; i++) {
    if (p[i] === 0) continue;
    let b = 0;
    for (const [q, cb] of pairs) if ((i >> q) & 1) b |= 1 << cb;
    out[b] += p[i];
  }
  return out;
}

function applyReadout(dist: Float64Array, nc: number, e: number, bitsMeasured: number[]): Float64Array {
  if (e <= 0) return dist;
  let d = dist;
  for (const k of bitsMeasured) {
    const nd = new Float64Array(d.length);
    for (let b = 0; b < d.length; b++) nd[b] = (1 - e) * d[b] + e * d[b ^ (1 << k)];
    d = nd;
  }
  return d;
}

function sample(dist: Float64Array, shots: number, rng: Rng, nc: number): Record<string, number> {
  const cdf = new Float64Array(dist.length);
  let acc = 0;
  for (let i = 0; i < dist.length; i++) { acc += dist[i]; cdf[i] = acc; }
  const counts: Record<string, number> = {};
  for (let s = 0; s < shots; s++) {
    const r = rng.random() * acc;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
    const k = key(lo, nc);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

const PAULI: M2[] = [matrix1('id'), matrix1('x'), matrix1('y'), matrix1('z')];

export function run(c: Circuit, opts: RunOptions): RunResult {
  const errs = validate(c);
  if (errs.length) throw new Error(errs.join('; '));
  const t0 = performance.now();
  const shots = Math.max(1, Math.min(opts.shots, LIMITS.shots));
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = new Rng(seed);
  const noise = isNoisy(opts.noise) ? opts.noise! : null;
  const method = !opts.method || opts.method === 'auto' ? chooseMethod(c, noise) : opts.method;
  const nc = c.num_clbits ?? c.num_qubits;
  const notes: string[] = [];
  const st = stats(c);
  const base = { shots, method, stats: st, notes, seed, execution: EXEC } as const;

  if (method === 'statevector') {
    if (c.num_qubits > LIMITS.statevector) throw new Error(`statevector limited to ${LIMITS.statevector} qubits`);
    if (noise) notes.push('Noise ignored by the noise-free statevector method; choose density matrix or trajectories.');
    if (!hasMidCircuitOps(c)) {
      const sv = new StateVector(c.num_qubits);
      for (const op of c.ops) if (op.name !== 'measure' && op.name !== 'reset') sv.applyOp(op);
      const { map } = clbitMap(c);
      const dist = toClbitDist(sv.probabilities(), map, nc);
      const res: RunResult = { ...base, counts: sample(dist, shots, rng, nc), elapsedMs: 0, probabilities: Array.from(dist) };
      if (c.num_qubits <= 12) {
        res.statevector = Array.from(sv.re, (r, i) => [r, sv.im[i]] as [number, number]);
        res.bloch = Array.from({ length: c.num_qubits }, (_, q) => sv.bloch(q));
        res.purity = 1;
        if (c.num_qubits >= 2) res.entropyHalf = sv.entropyFirst(Math.min(4, Math.floor(c.num_qubits / 2)));
      }
      res.elapsedMs = performance.now() - t0;
      return res;
    }
    notes.push('Mid-circuit measurement/reset: each shot simulated as an independent trajectory with wavefunction collapse.');
    const counts = trajectories(c, shots, rng, null, nc);
    return { ...base, counts, elapsedMs: performance.now() - t0 };
  }

  if (method === 'density_matrix') {
    if (c.num_qubits > LIMITS.density) throw new Error(`density matrix limited to ${LIMITS.density} qubits`);
    if (hasMidCircuitOps(c)) throw new Error('density-matrix method here supports terminal measurements only; use trajectories');
    const dm = new DensityMatrix(c.num_qubits);
    for (const op of c.ops) {
      if (op.name === 'measure' || op.name === 'barrier') continue;
      dm.applyOp(op);
      if (noise) noiseAfterDM(dm, op, noise);
    }
    const { map } = clbitMap(c);
    let dist = toClbitDist(dm.probabilities(), map, nc);
    dist = applyReadout(dist, nc, noise?.readout ?? 0, [...map.values()]);
    return {
      ...base, counts: sample(dist, shots, rng, nc), elapsedMs: performance.now() - t0, probabilities: Array.from(dist),
      bloch: Array.from({ length: c.num_qubits }, (_, q) => dm.bloch(q)), purity: dm.purity(),
    };
  }

  if (method === 'trajectories') {
    if (c.num_qubits > LIMITS.trajectories) throw new Error(`trajectories limited to ${LIMITS.trajectories} qubits`);
    const budget = 3e8;
    const cost = c.ops.length * (1 << c.num_qubits);
    const maxShots = Math.max(64, Math.floor(budget / Math.max(1, cost)));
    const used = Math.min(shots, maxShots);
    if (used < shots) notes.push(`Trajectory budget: ran ${used} of ${shots} requested shots to keep the browser responsive.`);
    notes.push('Noise unravelled as stochastic Pauli insertions and amplitude-damping quantum jumps (Monte-Carlo wavefunction).');
    const counts = trajectories(c, used, rng, noise, nc);
    return { ...base, shots: used, counts, elapsedMs: performance.now() - t0 };
  }

  // stabilizer
  if (!st.clifford) throw new Error('stabilizer method requires Clifford gates (H, S, CX, CZ, Paulis, multiples of π/2 rotations)');
  if (noise?.t1_us && noise?.t2_us) notes.push('Thermal relaxation applied as its Pauli-twirled approximation (stabilizer method).');
  const counts = stabilizerRun(c, shots, rng, noise, nc);
  return { ...base, counts, elapsedMs: performance.now() - t0 };
}

function noiseAfterDM(dm: DensityMatrix, op: Op, n: NoiseParams) {
  const k = op.qubits.length;
  if (op.name === 'reset') {
    for (const q of op.qubits) dm.reset(q, n.reset_error);
    return;
  }
  if (k === 1) {
    dm.depolarize(op.qubits, n.p1);
    if (n.t1_us && n.t2_us) dm.thermal(op.qubits[0], n.t1_us * 1000, n.t2_us * 1000, n.t_1q_ns);
  } else if (k === 2) {
    dm.depolarize(op.qubits, n.p2);
    if (n.t1_us && n.t2_us) for (const q of op.qubits) dm.thermal(q, n.t1_us * 1000, n.t2_us * 1000, n.t_2q_ns);
    if (n.crosstalk_zz > 0) {
      const probs = new Array(16).fill(0);
      probs[0] = 1 - n.crosstalk_zz;
      probs[3 + 4 * 3] = n.crosstalk_zz; // Z on first, Z on second
      dm.pauliChannel(op.qubits, probs);
    }
  } else if (k === 3) {
    dm.depolarize(op.qubits, n.p2 * 3);
  }
}

function randomPauliSV(sv: StateVector, qubits: number[], lambda: number, rng: Rng) {
  if (lambda <= 0 || rng.random() >= lambda) return;
  for (const q of qubits) {
    const p = rng.int(4);
    if (p) sv.apply1(q, PAULI[p]);
  }
}

function thermalSV(sv: StateVector, q: number, n: NoiseParams, tns: number, rng: Rng) {
  if (!(n.t1_us && n.t2_us) || tns <= 0) return;
  const t1 = n.t1_us * 1000, t2 = Math.min(n.t2_us, 2 * n.t1_us) * 1000;
  const g = 1 - Math.exp(-tns / t1);
  const p1 = sv.prob1(q);
  if (rng.random() < g * p1) {
    sv.apply1(q, [0, 0, 1, 0, 0, 0, 0, 0]); // |0><1|
  } else {
    sv.apply1(q, [1, 0, 0, 0, 0, 0, Math.sqrt(1 - g), 0]);
  }
  sv.normalize();
  const remaining = Math.exp(-tns / t2) / Math.exp(-tns / (2 * t1));
  if (rng.random() < (1 - remaining) / 2) sv.apply1(q, PAULI[3]);
}

function trajectories(c: Circuit, shots: number, rng: Rng, n: NoiseParams | null, nc: number): Record<string, number> {
  const counts: Record<string, number> = {};
  const { map, implicit } = clbitMap(c);
  for (let s = 0; s < shots; s++) {
    const sv = new StateVector(c.num_qubits);
    let bits = 0;
    for (const op of c.ops) {
      if (op.name === 'barrier') continue;
      if (op.name === 'measure') {
        const cb = op.clbits ?? op.qubits;
        op.qubits.forEach((q, i) => {
          let o = sv.measure(q, rng);
          if (n && rng.random() < n.readout) o ^= 1;
          bits = o ? bits | (1 << cb[i]) : bits & ~(1 << cb[i]);
        });
        continue;
      }
      if (op.name === 'reset') {
        for (const q of op.qubits) {
          sv.reset(q, rng);
          if (n && rng.random() < n.reset_error) sv.apply1(q, PAULI[1]);
        }
        continue;
      }
      sv.applyOp(op);
      if (n) {
        if (op.qubits.length === 1) {
          randomPauliSV(sv, op.qubits, n.p1, rng);
          thermalSV(sv, op.qubits[0], n, n.t_1q_ns, rng);
        } else {
          randomPauliSV(sv, op.qubits, n.p2, rng);
          for (const q of op.qubits) thermalSV(sv, q, n, n.t_2q_ns, rng);
          if (n.crosstalk_zz > 0 && rng.random() < n.crosstalk_zz) { sv.apply1(op.qubits[0], PAULI[3]); sv.apply1(op.qubits[1], PAULI[3]); }
        }
      }
    }
    if (implicit) {
      for (const [q, cb] of map) {
        let o = sv.measure(q, rng);
        if (n && rng.random() < n.readout) o ^= 1;
        if (o) bits |= 1 << cb;
      }
    }
    const k = key(bits, nc);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function stabOp(t: Tableau, op: Op) {
  const [a, b] = op.qubits;
  const quarter = (th: number) => (((Math.round(th / (Math.PI / 2)) % 4) + 4) % 4);
  switch (op.name) {
    case 'id': case 'barrier': return;
    case 'x': t.pauliX(a); return;
    case 'y': t.pauliY(a); return;
    case 'z': t.pauliZ(a); return;
    case 'h': t.h(a); return;
    case 's': t.s(a); return;
    case 'sdg': t.sdg(a); return;
    case 'sx': t.h(a); t.s(a); t.h(a); return;
    case 'sxdg': t.h(a); t.sdg(a); t.h(a); return;
    case 'rz': case 'p': { const k = quarter(op.params![0]); for (let i = 0; i < k; i++) t.s(a); return; }
    case 'rx': { const k = quarter(op.params![0]); t.h(a); for (let i = 0; i < k; i++) t.s(a); t.h(a); return; }
    case 'ry': { const k = quarter(op.params![0]); t.sdg(a); t.h(a); for (let i = 0; i < k; i++) t.s(a); t.h(a); t.s(a); return; }
    case 'cx': t.cx(a, b); return;
    case 'cz': t.cz(a, b); return;
    case 'cy': t.sdg(b); t.cx(a, b); t.s(b); return;
    case 'swap': t.swap(a, b); return;
    case 'iswap': t.s(a); t.s(b); t.cz(a, b); t.swap(a, b); return;
    default: throw new Error(`gate ${op.name} is not supported by the stabilizer method`);
  }
}

function stabPauli(t: Tableau, q: number, rng: Rng) {
  const p = rng.int(4);
  if (p === 1) t.pauliX(q); else if (p === 2) t.pauliY(q); else if (p === 3) t.pauliZ(q);
}

function stabilizerRun(c: Circuit, shots: number, rng: Rng, n: NoiseParams | null, nc: number): Record<string, number> {
  const counts: Record<string, number> = {};
  const { map, implicit } = clbitMap(c);
  const twirl = (tns: number) => {
    if (!n?.t1_us || !n?.t2_us) return [0, 0, 0];
    const t1 = n.t1_us * 1000, t2 = Math.min(n.t2_us, 2 * n.t1_us) * 1000;
    const px = (1 - Math.exp(-tns / t1)) / 4;
    const pz = Math.max(0, (1 - Math.exp(-tns / t2)) / 2 - px);
    return [px, px, pz];
  };
  const tw1 = twirl(n?.t_1q_ns ?? 0), tw2 = twirl(n?.t_2q_ns ?? 0);
  const applyTwirl = (t: Tableau, q: number, tw: number[]) => {
    const r = rng.random();
    if (r < tw[0]) t.pauliX(q); else if (r < tw[0] + tw[1]) t.pauliY(q); else if (r < tw[0] + tw[1] + tw[2]) t.pauliZ(q);
  };
  const bits = new Uint8Array(nc);
  for (let s = 0; s < shots; s++) {
    const t = new Tableau(c.num_qubits);
    bits.fill(0);
    for (const op of c.ops) {
      if (op.name === 'measure') {
        const cb = op.clbits ?? op.qubits;
        op.qubits.forEach((q, i) => {
          let o = t.measure(q, rng);
          if (n && rng.random() < n.readout) o ^= 1;
          bits[cb[i]] = o;
        });
        continue;
      }
      if (op.name === 'reset') {
        for (const q of op.qubits) {
          t.reset(q, rng);
          if (n && rng.random() < n.reset_error) t.pauliX(q);
        }
        continue;
      }
      stabOp(t, op);
      if (n && op.name !== 'barrier') {
        const k = op.qubits.length;
        if (rng.random() < (k === 1 ? n.p1 : n.p2)) for (const q of op.qubits) stabPauli(t, q, rng);
        for (const q of op.qubits) applyTwirl(t, q, k === 1 ? tw1 : tw2);
        if (k === 2 && n.crosstalk_zz > 0 && rng.random() < n.crosstalk_zz) { t.pauliZ(op.qubits[0]); t.pauliZ(op.qubits[1]); }
      }
    }
    if (implicit) {
      for (const [q, cb] of map) {
        let o = t.measure(q, rng);
        if (n && rng.random() < n.readout) o ^= 1;
        bits[cb] = o;
      }
    }
    let k = '';
    for (let i = nc - 1; i >= 0; i--) k += bits[i] ? '1' : '0';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export { isClifford };
