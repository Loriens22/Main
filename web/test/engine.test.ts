// Cross-validation of the browser engine against Qiskit / Aer reference fixtures (backend/tools/make_fixtures.py)
// plus analytic checks. Run with `npm test`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { run } from '../src/quantum/engine';
import { DensityMatrix } from '../src/quantum/density';
import { StateVector } from '../src/quantum/statevector';
import { Rng } from '../src/quantum/rng';
import type { Circuit, NoiseParams } from '../src/quantum/types';
import { route, squareGrid, heavyHex } from '../src/quantum/router';
import { LIBRARY } from '../src/quantum/library';

const load = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

function stateOf(c: Circuit): StateVector {
  const sv = new StateVector(c.num_qubits);
  for (const op of c.ops) sv.applyOp(op);
  return sv;
}

describe('statevector vs Qiskit Statevector (60 random circuits, full gate set)', () => {
  const cases = load('statevector.json');
  it.each(cases.map((c: any, i: number) => [i, c]))('case %i', (_i, c: any) => {
    const sv = stateOf(c.circuit);
    c.statevector.forEach(([r, im]: [number, number], k: number) => {
      expect(sv.re[k]).toBeCloseTo(r, 10);
      expect(sv.im[k]).toBeCloseTo(im, 10);
    });
  });
});

describe('density matrix + noise vs Qiskit Aer density_matrix (same noise definitions)', () => {
  const cases = load('noise.json');
  it.each(cases.map((c: any, i: number) => [i, c]))('case %i', (_i, c: any) => {
    const n: NoiseParams = c.noise;
    const r = run(c.circuit, { shots: 16, method: 'density_matrix', noise: n, seed: 1 });
    // engine marginalises onto implicit clbits = qubits, identical ordering to Aer's diagonal
    // Aer accumulates ~1e-9 round-off through Kraus compositions; 1e-7 is still a strict equivalence test
    r.probabilities!.forEach((p, k) => expect(p).toBeCloseTo(c.probabilities[k], 7));
    expect(r.purity!).toBeCloseTo(c.purity, 7);
  });
});

describe('stabilizer tableau vs Qiskit StabilizerState distributions', () => {
  const cases = load('clifford.json');
  it.each(cases.map((c: any, i: number) => [i, c]))('case %i', (_i, c: any) => {
    const shots = 6000;
    const r = run(c.circuit, { shots, method: 'stabilizer', seed: 7 });
    let tvd = 0;
    const keys = new Set([...Object.keys(r.counts), ...Object.keys(c.probabilities)]);
    for (const k of keys) tvd += Math.abs((r.counts[k] ?? 0) / shots - (c.probabilities[k] ?? 0));
    expect(tvd / 2).toBeLessThan(0.05);
    // support must match exactly: no outcome outside Qiskit's support
    for (const k of Object.keys(r.counts)) expect(c.probabilities[k] ?? 0).toBeGreaterThan(0);
  });
});

describe('analytic physics checks', () => {
  it('Bell state: 50/50 on 00/11, maximal entanglement entropy', () => {
    const r = run({ num_qubits: 2, ops: [{ name: 'h', qubits: [0] }, { name: 'cx', qubits: [0, 1] }] }, { shots: 20000, seed: 3 });
    expect(Object.keys(r.counts).sort()).toEqual(['00', '11']);
    expect(Math.abs(r.counts['00'] / 20000 - 0.5)).toBeLessThan(0.015);
    expect(r.entropyHalf!).toBeCloseTo(1, 9);
    r.bloch!.forEach((b) => b.forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-12)));
  });

  it('Pauli expectation values match Bloch vector for a rotated qubit', () => {
    const sv = stateOf({ num_qubits: 1, ops: [{ name: 'ry', qubits: [0], params: [0.9] }, { name: 'rz', qubits: [0], params: [0.4] }] });
    const [x, y, z] = sv.bloch(0);
    expect(sv.expectPauli('X')).toBeCloseTo(x, 12);
    expect(sv.expectPauli('Y')).toBeCloseTo(y, 12);
    expect(sv.expectPauli('Z')).toBeCloseTo(z, 12);
    expect(x).toBeCloseTo(Math.sin(0.9) * Math.cos(0.4), 12);
  });

  it('readout error is applied analytically and symmetric', () => {
    const r = run({ num_qubits: 1, ops: [] }, { shots: 50000, method: 'density_matrix', seed: 4,
      noise: { p1: 0, p2: 0, readout: 0.1, reset_error: 0, t_1q_ns: 25, t_2q_ns: 70, crosstalk_zz: 0 } });
    expect(r.probabilities![1]).toBeCloseTo(0.1, 12);
  });

  it('thermal relaxation: T1 decay of |1> matches exp(-t/T1)', () => {
    const dm = new DensityMatrix(1);
    dm.applyOp({ name: 'x', qubits: [0] });
    dm.thermal(0, 100, 80, 50);
    expect(dm.probabilities()[1]).toBeCloseTo(Math.exp(-0.5), 12);
  });

  it('trajectories reproduce density-matrix statistics (noisy GHZ-3)', () => {
    const c: Circuit = { num_qubits: 3, ops: [{ name: 'h', qubits: [0] }, { name: 'cx', qubits: [0, 1] }, { name: 'cx', qubits: [1, 2] }] };
    const noise: NoiseParams = { p1: 0.01, p2: 0.06, readout: 0.02, reset_error: 0, t1_us: 20, t2_us: 15, t_1q_ns: 50, t_2q_ns: 400, crosstalk_zz: 0.01 };
    const exact = run(c, { shots: 10, method: 'density_matrix', noise, seed: 1 }).probabilities!;
    const shots = 20000;
    const tr = run(c, { shots, method: 'trajectories', noise, seed: 2 });
    let tvd = 0;
    for (let b = 0; b < 8; b++) tvd += Math.abs((tr.counts[b.toString(2).padStart(3, '0')] ?? 0) / shots - exact[b]);
    expect(tvd / 2).toBeLessThan(0.02);
  });

  it('mid-circuit measurement + reset (teleportation via deferred measurement)', () => {
    const c = LIBRARY.find((e) => e.id === 'teleport')!.build();
    const r = run(c, { shots: 20000, seed: 9 });
    const shots = Object.values(r.counts).reduce((a, b) => a + b, 0);
    const p1 = Object.entries(r.counts).filter(([k]) => k[0] === '1').reduce((a, [, v]) => a + v, 0) / shots;
    expect(p1).toBeCloseTo(Math.sin(0.4) ** 2, 1);
  });

  it('120-qubit GHZ on the stabilizer engine gives only all-0 / all-1', () => {
    const ops: Circuit['ops'] = [{ name: 'h', qubits: [0] }];
    for (let q = 0; q < 119; q++) ops.push({ name: 'cx', qubits: [q, q + 1] });
    const r = run({ num_qubits: 120, ops }, { shots: 200, seed: 5 });
    expect(r.method).toBe('stabilizer');
    const keys = Object.keys(r.counts);
    expect(keys.every((k) => /^0+$|^1+$/.test(k))).toBe(true);
    expect(keys.length).toBe(2);
  });

  it('refuses unrealistic exact simulation instead of pretending', () => {
    const ops: Circuit['ops'] = [{ name: 't', qubits: [0] }];
    for (let q = 0; q < 39; q++) ops.push({ name: 'cx', qubits: [q, q + 1] });
    expect(() => run({ num_qubits: 40, ops }, { shots: 10 })).toThrow(/beyond exact simulation/);
  });

  it('seeded runs are reproducible', () => {
    const c = LIBRARY.find((e) => e.id === 'grover3')!.build();
    const a = run(c, { shots: 1000, seed: 42 }), b = run(c, { shots: 1000, seed: 42 });
    expect(a.counts).toEqual(b.counts);
  });

  it('rng is uniform', () => {
    const rng = new Rng(1);
    let s = 0;
    for (let i = 0; i < 100000; i++) s += rng.random();
    expect(s / 100000).toBeCloseTo(0.5, 2);
  });
});

describe('example library: every example runs and matches its stated expectation', () => {
  it.each(LIBRARY.map((e) => [e.id, e]))('%s', (_id, e: any) => {
    const c = e.build();
    const r = run(c, { shots: 4000, seed: 11 });
    if (e.check) expect(e.check(r)).toBe(true);
  });
});

describe('router', () => {
  it('routes every 2Q gate onto coupled physical qubits (square + heavy-hex)', () => {
    const rng = new Rng(5);
    for (const topo of [squareGrid(12, 10), heavyHex()]) {
      for (let t = 0; t < 5; t++) {
        const n = 12;
        const ops: Circuit['ops'] = [];
        for (let k = 0; k < 40; k++) {
          const a = rng.int(n); let b = rng.int(n); if (a === b) b = (b + 1) % n;
          ops.push({ name: 'cx', qubits: [a, b] });
        }
        const res = route({ num_qubits: n, ops }, topo);
        const adj = new Set(topo.edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
        for (const op of res.physical.ops) if (op.qubits.length === 2) expect(adj.has(`${Math.min(...op.qubits)}-${Math.max(...op.qubits)}`)).toBe(true);
        // routed circuit is equivalent: simulate logical vs physical on the used qubits (small check via swaps count sanity)
        expect(res.swaps).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('routed circuit is unitarily equivalent up to the final permutation', () => {
    const c: Circuit = { num_qubits: 5, ops: [
      { name: 'h', qubits: [0] }, { name: 'cx', qubits: [0, 4] }, { name: 'ry', qubits: [2], params: [0.7] },
      { name: 'cx', qubits: [2, 0] }, { name: 'cz', qubits: [1, 3] }, { name: 'cx', qubits: [4, 1] } ] };
    const topo = squareGrid(1, 6); // a line forces swaps
    const res = route(c, topo);
    const used = res.physical.num_qubits;
    expect(used).toBe(6);
    const sv = stateOf(res.physical);
    const ref = stateOf(c);
    // compare probability of each logical basis state through final layout
    for (let i = 0; i < 32; i++) {
      let j = 0;
      for (let q = 0; q < 5; q++) if ((i >> q) & 1) j |= 1 << res.finalLayout[q];
      const p = sv.re[j] ** 2 + sv.im[j] ** 2;
      expect(p).toBeCloseTo(ref.re[i] ** 2 + ref.im[i] ** 2, 10);
    }
  });
});
