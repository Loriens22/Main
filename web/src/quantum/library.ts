// Executable example library. Every entry is run by the test-suite and its `check` must hold on the simulator.

import type { Circuit, Op, RunResult } from './types';

export interface Example {
  id: string;
  title: string;
  category: 'Foundations' | 'Algorithms' | 'Error correction' | 'Variational' | 'Scale';
  summary: string;
  expect: string;
  build: () => Circuit;
  check?: (r: RunResult) => boolean;
}

const total = (r: RunResult) => Object.values(r.counts).reduce((a, b) => a + b, 0);
const frac = (r: RunResult, pred: (k: string) => boolean) =>
  Object.entries(r.counts).filter(([k]) => pred(k)).reduce((a, [, v]) => a + v, 0) / total(r);

function qftOps(qs: number[]): Op[] {
  const ops: Op[] = [];
  const n = qs.length;
  for (let j = n - 1; j >= 0; j--) {
    ops.push({ name: 'h', qubits: [qs[j]] });
    for (let k = j - 1; k >= 0; k--) ops.push({ name: 'cp', qubits: [qs[k], qs[j]], params: [Math.PI / 2 ** (j - k)] });
  }
  for (let j = 0; j < Math.floor(n / 2); j++) ops.push({ name: 'swap', qubits: [qs[j], qs[n - 1 - j]] });
  return ops;
}

/** Snake path through the 10x12 AURORA-Q tile so consecutive logical qubits are physically adjacent. */
export function snake(rows = 12, cols = 10): number[] {
  const out: number[] = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) out.push(r * cols + (r % 2 ? cols - 1 - k : k));
  return out;
}

export const LIBRARY: Example[] = [
  {
    id: 'bell', title: 'Bell state', category: 'Foundations',
    summary: 'H on q0 then CNOT creates (|00⟩ + |11⟩)/√2 — maximal two-qubit entanglement.',
    expect: 'Only 00 and 11, each ≈ 50 %. Reduced Bloch vectors have zero length; entanglement entropy = 1 bit.',
    build: () => ({ num_qubits: 2, ops: [{ name: 'h', qubits: [0] }, { name: 'cx', qubits: [0, 1] }] }),
    check: (r) => frac(r, (k) => k === '00' || k === '11') === 1 && Math.abs(frac(r, (k) => k === '00') - 0.5) < 0.04,
  },
  {
    id: 'ghz5', title: 'GHZ-5', category: 'Foundations',
    summary: 'A chain of CNOTs spreads the superposition: (|00000⟩ + |11111⟩)/√2.',
    expect: 'Only 00000 and 11111. Under noise, other strings appear — a quick fidelity diagnostic.',
    build: () => ({ num_qubits: 5, ops: [{ name: 'h', qubits: [0] }, ...[0, 1, 2, 3].map((q) => ({ name: 'cx' as const, qubits: [q, q + 1] }))] }),
    check: (r) => frac(r, (k) => k === '00000' || k === '11111') === 1,
  },
  {
    id: 'teleport', title: 'Quantum teleportation', category: 'Foundations',
    summary: 'Teleports RY(0.8)|0⟩ from q0 to q2 through a Bell pair. Classical feed-forward is implemented by the deferred-measurement principle (controlled corrections), then all qubits are measured.',
    expect: 'q2 reads 1 with probability sin²(0.4) ≈ 15.2 % independent of the (uniform) Bell-measurement bits on q0, q1.',
    build: () => ({ num_qubits: 3, ops: [
      { name: 'ry', qubits: [0], params: [0.8] },
      { name: 'h', qubits: [1] }, { name: 'cx', qubits: [1, 2] },
      { name: 'cx', qubits: [0, 1] }, { name: 'h', qubits: [0] },
      { name: 'cx', qubits: [1, 2] }, { name: 'cz', qubits: [0, 2] },
      { name: 'measure', qubits: [0, 1, 2], clbits: [0, 1, 2] }] }),
    check: (r) => Math.abs(frac(r, (k) => k[0] === '1') - Math.sin(0.4) ** 2) < 0.03,
  },
  {
    id: 'deutsch_jozsa', title: 'Deutsch–Jozsa (balanced oracle)', category: 'Algorithms',
    summary: 'Decides constant vs balanced with ONE oracle query. Oracle: f(x) = x0 ⊕ x1 ⊕ x2 ⊕ x3 (balanced).',
    expect: 'Input register never reads 0000 (balanced). It reads 1111 deterministically for this parity oracle.',
    build: () => {
      const ops: Op[] = [{ name: 'x', qubits: [4] }];
      for (let q = 0; q < 5; q++) ops.push({ name: 'h', qubits: [q] });
      for (let q = 0; q < 4; q++) ops.push({ name: 'cx', qubits: [q, 4] });
      for (let q = 0; q < 4; q++) ops.push({ name: 'h', qubits: [q] });
      ops.push({ name: 'measure', qubits: [0, 1, 2, 3], clbits: [0, 1, 2, 3] });
      return { num_qubits: 5, num_clbits: 4, ops };
    },
    check: (r) => frac(r, (k) => k === '1111') === 1,
  },
  {
    id: 'bv', title: 'Bernstein–Vazirani (secret 1011)', category: 'Algorithms',
    summary: 'Recovers a hidden bit-string s from one query of f(x) = s·x mod 2.',
    expect: 'Deterministic outcome 1011.',
    build: () => {
      const s = [1, 1, 0, 1]; // s0..s3 -> string "1011" (c3 c2 c1 c0)
      const ops: Op[] = [{ name: 'x', qubits: [4] }];
      for (let q = 0; q < 5; q++) ops.push({ name: 'h', qubits: [q] });
      s.forEach((b, q) => b && ops.push({ name: 'cx', qubits: [q, 4] }));
      for (let q = 0; q < 4; q++) ops.push({ name: 'h', qubits: [q] });
      ops.push({ name: 'measure', qubits: [0, 1, 2, 3], clbits: [0, 1, 2, 3] });
      return { num_qubits: 5, num_clbits: 4, ops };
    },
    check: (r) => frac(r, (k) => k === '1011') === 1,
  },
  {
    id: 'grover3', title: 'Grover search (3 qubits, target 101)', category: 'Algorithms',
    summary: 'Two Grover iterations (oracle + diffusion) amplify the marked state among 8.',
    expect: 'P(101) ≈ 94.5 % — the optimum for N = 8 after ⌊π/4·√8⌋ = 2 iterations.',
    build: () => {
      const ops: Op[] = [0, 1, 2].map((q) => ({ name: 'h' as const, qubits: [q] }));
      const ccz = (): Op[] => [{ name: 'h', qubits: [2] }, { name: 'ccx', qubits: [0, 1, 2] }, { name: 'h', qubits: [2] }];
      for (let it = 0; it < 2; it++) {
        ops.push({ name: 'x', qubits: [1] }, ...ccz(), { name: 'x', qubits: [1] }); // oracle marks |101>
        ops.push(...[0, 1, 2].map((q) => ({ name: 'h' as const, qubits: [q] })), ...[0, 1, 2].map((q) => ({ name: 'x' as const, qubits: [q] })));
        ops.push(...ccz());
        ops.push(...[0, 1, 2].map((q) => ({ name: 'x' as const, qubits: [q] })), ...[0, 1, 2].map((q) => ({ name: 'h' as const, qubits: [q] })));
      }
      return { num_qubits: 3, ops };
    },
    check: (r) => frac(r, (k) => k === '101') > 0.9,
  },
  {
    id: 'qft_period', title: 'QFT period finding', category: 'Algorithms',
    summary: 'Prepares a periodic state (|0⟩+|4⟩+|8⟩+|12⟩)/2 on 4 qubits and applies the quantum Fourier transform — the core of Shor’s algorithm.',
    expect: 'Peaks only at multiples of N/r = 16/4: outcomes 0000, 0100, 1000, 1100.',
    build: () => ({ num_qubits: 4, ops: [{ name: 'h', qubits: [2] }, { name: 'h', qubits: [3] }, ...qftOps([0, 1, 2, 3])] }),
    check: (r) => frac(r, (k) => ['0000', '0100', '1000', '1100'].includes(k)) > 0.999,
  },
  {
    id: 'vqe_h2', title: 'H₂ ground state (VQE ansatz)', category: 'Variational',
    summary: 'Particle-conserving ansatz cos θ|1010⟩ + sin θ|0101⟩ at the optimum for R = 0.74 Å (Jordan–Wigner, STO-3G). |0101⟩ is the Hartree–Fock state.',
    expect: 'Only 0101 (≈ 98.7 %) and 1010 (≈ 1.3 %). Energy evaluation lives in the Quantum AI lab.',
    build: () => ({ num_qubits: 4, ops: [
      { name: 'ry', qubits: [0], params: [2 * 1.4583] }, { name: 'cx', qubits: [0, 2] }, { name: 'x', qubits: [1] }, { name: 'x', qubits: [3] },
      { name: 'cx', qubits: [0, 1] }, { name: 'cx', qubits: [0, 3] }] }),
    check: (r) => frac(r, (k) => k === '0101' || k === '1010') === 1 && frac(r, (k) => k === '0101') > 0.95,
  },
  {
    id: 'qaoa_ring', title: 'QAOA MaxCut (4-node ring, p = 1)', category: 'Variational',
    summary: 'Cost layer RZZ(2γ) on ring edges and mixer RX(2β) with γ = 3π/8, β = π/8 — the p = 1 optimum for the 4-cycle in this gate convention (found numerically; ⟨C⟩ = 3 of a maximum cut of 4).',
    expect: 'Optimal cuts 0101 and 1010 are the most likely strings; ⟨C⟩/C_max = 0.75, well above the 0.5 of random guessing.',
    build: () => {
      const ops: Op[] = [0, 1, 2, 3].map((q) => ({ name: 'h' as const, qubits: [q] }));
      const g = (3 * Math.PI) / 8, b = Math.PI / 8;
      for (const [u, v] of [[0, 1], [1, 2], [2, 3], [3, 0]]) ops.push({ name: 'rzz', qubits: [u, v], params: [2 * g] });
      for (let q = 0; q < 4; q++) ops.push({ name: 'rx', qubits: [q], params: [2 * b] });
      return { num_qubits: 4, ops };
    },
    check: (r) => {
      let e = 0;
      for (const [k, v] of Object.entries(r.counts)) {
        const bit = (q: number) => k[3 - q];
        e += v * [[0, 1], [1, 2], [2, 3], [3, 0]].reduce((s, [u, w]) => s + (bit(u) !== bit(w) ? 1 : 0), 0);
      }
      return e / total(r) / 4 > 0.7;
    },
  },
  {
    id: 'rep_code', title: 'Repetition code: syndrome extraction', category: 'Error correction',
    summary: '3 data qubits (q0–q2) encode |000⟩; ancillas q3, q4 measure Z0Z1 and Z1Z2. An X error is deliberately injected on q1.',
    expect: 'Syndrome bits (c4 c3) = 11 every shot → the decoder flips q1. Turn on noise to see false syndromes.',
    build: () => ({ num_qubits: 5, ops: [
      { name: 'x', qubits: [1] },
      { name: 'cx', qubits: [0, 3] }, { name: 'cx', qubits: [1, 3] }, { name: 'cx', qubits: [1, 4] }, { name: 'cx', qubits: [2, 4] },
      { name: 'measure', qubits: [3, 4], clbits: [3, 4] }, { name: 'measure', qubits: [0, 1, 2], clbits: [0, 1, 2] }] }),
    check: (r) => frac(r, (k) => k.slice(0, 2) === '11') === 1,
  },
  {
    id: 'ancilla_reuse', title: 'Ancilla reuse with reset', category: 'Error correction',
    summary: 'One ancilla (q3) measures Z0Z1, is RESET, then measures Z1Z2, three rounds — the dynamic-circuit pattern that dedicated reset elements accelerate.',
    expect: 'All six syndrome bits are 0 (no errors). With noise, reset errors show up directly as false syndromes.',
    build: () => {
      const ops: Op[] = [];
      let k = 0;
      for (let r = 0; r < 3; r++)
        for (const [a, b] of [[0, 1], [1, 2]]) {
          ops.push({ name: 'cx', qubits: [a, 3] }, { name: 'cx', qubits: [b, 3] }, { name: 'measure', qubits: [3], clbits: [k++] }, { name: 'reset', qubits: [3] });
        }
      return { num_qubits: 4, num_clbits: 6, ops };
    },
    check: (r) => frac(r, (k) => k === '000000') === 1,
  },
  {
    id: 'ghz120', title: 'GHZ-120 across the whole tile', category: 'Scale',
    summary: 'A 120-qubit GHZ state laid along a snake path of the 10 × 12 AURORA-Q lattice. Runs on the stabilizer engine (polynomial cost) — no 2¹²⁰-amplitude statevector is ever built.',
    expect: 'Only all-zeros and all-ones. Enable noise to watch the GHZ fidelity collapse with 119 two-qubit gates.',
    build: () => {
      const p = snake();
      const ops: Op[] = [{ name: 'h', qubits: [p[0]] }];
      for (let i = 0; i < 119; i++) ops.push({ name: 'cx', qubits: [p[i], p[i + 1]] });
      return { num_qubits: 120, ops };
    },
    check: (r) => Object.keys(r.counts).every((k) => /^0+$|^1+$/.test(k)),
  },
  {
    id: 'random8', title: 'Random brickwork (8 qubits)', category: 'Scale',
    summary: 'Six layers of random SU(2) rotations and alternating CZ bricks — the structure behind random-circuit-sampling benchmarks.',
    expect: 'A speckled, Porter–Thomas-like distribution. Noise flattens it toward uniform.',
    build: () => {
      let s = 7;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 * Math.PI;
      const ops: Op[] = [];
      for (let l = 0; l < 6; l++) {
        for (let q = 0; q < 8; q++) ops.push({ name: 'u', qubits: [q], params: [r() / 2, r(), r()] });
        for (let q = l % 2; q + 1 < 8; q += 2) ops.push({ name: 'cz', qubits: [q, q + 1] });
      }
      return { num_qubits: 8, ops };
    },
  },
];
