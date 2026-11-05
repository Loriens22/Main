// Density-matrix simulator. rho is stored as a 2n-qubit vector |rho>> with index row*2^n + col:
// rows occupy virtual qubits [n, 2n), columns occupy [0, n). U rho U^dagger = (U on row qubits)(conj(U) on col qubits).

import { conj, matrix1, type M2 } from './gates';
import type { Op } from './types';
import { StateVector } from './statevector';

export class DensityMatrix {
  readonly n: number;
  readonly dim: number;
  v: StateVector;

  constructor(n: number) {
    if (n > 10) throw new Error('density-matrix simulation limited to 10 qubits in the browser');
    this.n = n;
    this.dim = 1 << n;
    this.v = new StateVector(2 * n);
  }

  clone(): DensityMatrix {
    const d = new DensityMatrix(this.n);
    d.v.re.set(this.v.re);
    d.v.im.set(this.v.im);
    return d;
  }

  applyOp(op: Op): void {
    const shift = (o: Op): Op => ({ ...o, qubits: o.qubits.map((q) => q + this.n) });
    this.v.applyOp(shift(op), false);
    this.v.applyOp(op, true);
  }

  /** Apply a single-qubit Kraus set: rho -> sum_k K rho K^dagger. */
  kraus1(q: number, ks: M2[]): void {
    const base = this.v;
    const acc = new Float64Array(base.re.length), acci = new Float64Array(base.im.length);
    for (const K of ks) {
      const t = base.clone();
      t.apply1(q + this.n, K);
      t.apply1(q, conj(K));
      for (let i = 0; i < acc.length; i++) {
        acc[i] += t.re[i];
        acci[i] += t.im[i];
      }
    }
    base.re = acc;
    base.im = acci;
  }

  /** Pauli channel on the listed qubits: probs indexed by base-4 digits (I,X,Y,Z) per qubit. */
  pauliChannel(qubits: number[], probs: number[]): void {
    const P: M2[] = [matrix1('id'), matrix1('x'), matrix1('y'), matrix1('z')];
    const base = this.v;
    const acc = new Float64Array(base.re.length), acci = new Float64Array(base.im.length);
    for (let k = 0; k < probs.length; k++) {
      const w = probs[k];
      if (w === 0) continue;
      const t = base.clone();
      let code = k;
      for (const q of qubits) {
        const which = code & 3;
        code >>= 2;
        if (which) {
          t.apply1(q + this.n, P[which]);
          t.apply1(q, conj(P[which]));
        }
      }
      for (let i = 0; i < acc.length; i++) {
        acc[i] += w * t.re[i];
        acci[i] += w * t.im[i];
      }
    }
    base.re = acc;
    base.im = acci;
  }

  /** Qiskit depolarizing_error(lambda, k): (1 - lambda) rho + lambda I/2^k  ==  uniform Pauli mixture incl. identity. */
  depolarize(qubits: number[], lambda: number): void {
    if (lambda <= 0) return;
    const m = 1 << (2 * qubits.length);
    const probs = new Array(m).fill(lambda / m);
    probs[0] += 1 - lambda;
    this.pauliChannel(qubits, probs);
  }

  /** Thermal relaxation (T1, T2 with zero excited-state population) over time t (same units). */
  thermal(q: number, t1: number, t2: number, t: number): void {
    if (t <= 0) return;
    const g = 1 - Math.exp(-t / t1);
    const ad: M2[] = [[1, 0, 0, 0, 0, 0, Math.sqrt(1 - g), 0], [0, 0, Math.sqrt(g), 0, 0, 0, 0, 0]];
    this.kraus1(q, ad);
    // pure dephasing so that off-diagonals decay as exp(-t/T2) overall
    const t2c = Math.min(t2, 2 * t1);
    const remaining = Math.exp(-t / t2c) / Math.exp(-t / (2 * t1));
    const pz = (1 - remaining) / 2;
    if (pz > 0) this.pauliChannel([q], [1 - pz, 0, 0, pz]);
  }

  /** Diagonal = probabilities over computational basis. */
  probabilities(): Float64Array {
    const p = new Float64Array(this.dim);
    for (let i = 0; i < this.dim; i++) p[i] = Math.max(0, this.v.re[i * this.dim + i]);
    return p;
  }

  trace(): number {
    let s = 0;
    for (let i = 0; i < this.dim; i++) s += this.v.re[i * this.dim + i];
    return s;
  }

  purity(): number {
    let s = 0;
    const re = this.v.re, im = this.v.im;
    for (let k = 0; k < re.length; k++) s += re[k] * re[k] + im[k] * im[k];
    return s;
  }

  /** Non-selective reset of qubit q (with optional error probability of ending in |1>). */
  reset(q: number, err = 0): void {
    // Kraus: |0><0|, |0><1|
    this.kraus1(q, [[1, 0, 0, 0, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0, 0, 0]]);
    if (err > 0) this.pauliChannel([q], [1 - err, err, 0, 0]);
  }

  /** Non-selective measurement (dephasing in Z) — used when the outcome is not conditioned on. */
  dephaseMeasure(q: number): void {
    this.kraus1(q, [[1, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 1, 0]]);
  }

  bloch(q: number): [number, number, number] {
    let r00 = 0, r11 = 0, r01r = 0, r01i = 0;
    const D = this.dim, m = 1 << q, re = this.v.re, im = this.v.im;
    for (let i = 0; i < D; i++) {
      if (i & m) continue;
      const j = i | m;
      r00 += re[i * D + i];
      r11 += re[j * D + j];
      r01r += re[i * D + j];
      r01i += im[i * D + j];
    }
    return [2 * r01r, -2 * r01i, r00 - r11];
  }
}
