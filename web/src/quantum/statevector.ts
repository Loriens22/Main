// Dense statevector simulator. Basis index i has qubit q in bit (i >> q) & 1 (Qiskit little-endian).

import { CONTROLLED, controlledTarget, matrix1, type M2 } from './gates';
import type { Op } from './types';
import type { Rng } from './rng';

export class StateVector {
  readonly n: number;
  readonly dim: number;
  re: Float64Array;
  im: Float64Array;

  constructor(n: number) {
    if (n > 24) throw new Error('statevector limited to 24 qubits in the browser (memory)');
    this.n = n;
    this.dim = 1 << n;
    this.re = new Float64Array(this.dim);
    this.im = new Float64Array(this.dim);
    this.re[0] = 1;
  }

  clone(): StateVector {
    const s = new StateVector(this.n);
    s.re.set(this.re);
    s.im.set(this.im);
    return s;
  }

  /** Apply an arbitrary (not necessarily unitary) 2x2 matrix on qubit q. */
  apply1(q: number, m: M2): void {
    const [ar, ai, br, bi, cr, ci, dr, di] = m;
    const step = 1 << q;
    const re = this.re, im = this.im, N = this.dim;
    for (let base = 0; base < N; base += step << 1) {
      for (let i = base; i < base + step; i++) {
        const j = i + step;
        const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
        re[i] = ar * xr - ai * xi + br * yr - bi * yi;
        im[i] = ar * xi + ai * xr + br * yi + bi * yr;
        re[j] = cr * xr - ci * xi + dr * yr - di * yi;
        im[j] = cr * xi + ci * xr + dr * yi + di * yr;
      }
    }
  }

  /** Controlled 2x2 on target t when all control bits are 1. */
  applyControlled(controls: number[], t: number, m: M2): void {
    const [ar, ai, br, bi, cr, ci, dr, di] = m;
    let cmask = 0;
    for (const c of controls) cmask |= 1 << c;
    const step = 1 << t;
    const re = this.re, im = this.im, N = this.dim;
    for (let base = 0; base < N; base += step << 1) {
      for (let i = base; i < base + step; i++) {
        if ((i & cmask) !== cmask) continue;
        const j = i + step;
        const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
        re[i] = ar * xr - ai * xi + br * yr - bi * yi;
        im[i] = ar * xi + ai * xr + br * yi + bi * yr;
        re[j] = cr * xr - ci * xi + dr * yr - di * yi;
        im[j] = cr * xi + ci * xr + dr * yi + di * yr;
      }
    }
  }

  /** Diagonal phase on |11> of (a, b): multiply by e^{i phi}. */
  private phase11(a: number, b: number, cos: number, sin: number) {
    const mask = (1 << a) | (1 << b);
    const re = this.re, im = this.im;
    for (let i = 0; i < this.dim; i++) {
      if ((i & mask) === mask) {
        const r = re[i], m = im[i];
        re[i] = r * cos - m * sin;
        im[i] = r * sin + m * cos;
      }
    }
  }

  /** Symmetric two-qubit gates built from pair rotations (rzz, rxx, ryy, swap, iswap). */
  applyTwo(name: string, a: number, b: number, theta = 0, conjugate = false): void {
    const re = this.re, im = this.im;
    const ma = 1 << a, mb = 1 << b;
    const sgn = conjugate ? -1 : 1;
    if (name === 'rzz') {
      const c = Math.cos(theta / 2), s = Math.sin(theta / 2) * sgn;
      for (let i = 0; i < this.dim; i++) {
        const odd = ((i >> a) ^ (i >> b)) & 1;
        const ss = odd ? s : -s; // e^{-i theta/2} for even parity
        const r = re[i], m = im[i];
        re[i] = r * c - m * ss;
        im[i] = r * ss + m * c;
      }
      return;
    }
    for (let i = 0; i < this.dim; i++) {
      if (i & ma || i & mb) continue;
      const i00 = i, i01 = i | ma, i10 = i | mb, i11 = i | ma | mb;
      if (name === 'swap') {
        const r = re[i01], m = im[i01];
        re[i01] = re[i10]; im[i01] = im[i10];
        re[i10] = r; im[i10] = m;
      } else if (name === 'iswap') {
        const r1 = re[i01], m1 = im[i01], r2 = re[i10], m2 = im[i10];
        // |01> -> i|10>, |10> -> i|01>
        re[i10] = -m1 * sgn; im[i10] = r1 * sgn;
        re[i01] = -m2 * sgn; im[i01] = r2 * sgn;
      } else if (name === 'rxx' || name === 'ryy') {
        const c = Math.cos(theta / 2), s = Math.sin(theta / 2) * sgn;
        const outer = name === 'rxx' ? -1 : 1; // coefficient of i*s for the 00<->11 pair
        const pair = (p: number, q: number, k: number) => {
          // new_p = c*p + k*i*s*q ; new_q = c*q + k*i*s*p
          const pr = re[p], pi = im[p], qr = re[q], qi = im[q];
          re[p] = c * pr - k * s * qi; im[p] = c * pi + k * s * qr;
          re[q] = c * qr - k * s * pi; im[q] = c * qi + k * s * pr;
        };
        pair(i00, i11, outer);
        pair(i01, i10, -1);
      }
    }
  }

  applyOp(op: Op, conjugate = false): void {
    const q = op.qubits, p = op.params ?? [];
    const fix = (m: M2): M2 => (conjugate ? [m[0], -m[1], m[2], -m[3], m[4], -m[5], m[6], -m[7]] : m);
    switch (op.name) {
      case 'barrier': case 'id': return;
      case 'measure': case 'reset': throw new Error('non-unitary op must be handled by the engine');
      case 'cp': {
        const c = Math.cos(p[0]), s = Math.sin(p[0]) * (conjugate ? -1 : 1);
        this.phase11(q[0], q[1], c, s);
        return;
      }
      case 'swap': case 'iswap': case 'rzz': case 'rxx': case 'ryy':
        this.applyTwo(op.name, q[0], q[1], p[0] ?? 0, conjugate);
        return;
      case 'ccx':
        this.applyControlled([q[0], q[1]], q[2], matrix1('x'));
        return;
      case 'cswap': {
        // controlled swap = CX(t2,t1) CCX(c,t1,t2) CX(t2,t1)
        this.applyControlled([q[2]], q[1], matrix1('x'));
        this.applyControlled([q[0], q[1]], q[2], matrix1('x'));
        this.applyControlled([q[2]], q[1], matrix1('x'));
        return;
      }
      default:
        if (CONTROLLED.has(op.name)) {
          this.applyControlled([q[0]], q[1], fix(controlledTarget(op.name, p)));
        } else {
          this.apply1(q[0], fix(matrix1(op.name, p)));
        }
    }
  }

  prob1(q: number): number {
    let p = 0;
    const re = this.re, im = this.im;
    for (let i = 0; i < this.dim; i++) if ((i >> q) & 1) p += re[i] * re[i] + im[i] * im[i];
    return p;
  }

  /** Projective measurement with collapse. Returns outcome. */
  measure(q: number, rng: Rng): number {
    const p1 = this.prob1(q);
    const out = rng.random() < p1 ? 1 : 0;
    this.collapse(q, out, out ? p1 : 1 - p1);
    return out;
  }

  collapse(q: number, out: number, p: number): void {
    const norm = p > 0 ? 1 / Math.sqrt(p) : 0;
    const re = this.re, im = this.im;
    for (let i = 0; i < this.dim; i++) {
      if (((i >> q) & 1) === out) {
        re[i] *= norm;
        im[i] *= norm;
      } else {
        re[i] = 0;
        im[i] = 0;
      }
    }
  }

  reset(q: number, rng: Rng): void {
    if (this.measure(q, rng) === 1) this.apply1(q, matrix1('x'));
  }

  probabilities(): Float64Array {
    const p = new Float64Array(this.dim);
    for (let i = 0; i < this.dim; i++) p[i] = this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return p;
  }

  norm2(): number {
    let s = 0;
    for (let i = 0; i < this.dim; i++) s += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return s;
  }

  normalize(): void {
    const s = Math.sqrt(this.norm2());
    if (s === 0) return;
    for (let i = 0; i < this.dim; i++) {
      this.re[i] /= s;
      this.im[i] /= s;
    }
  }

  /** Bloch vector of qubit q from the reduced density matrix. */
  bloch(q: number): [number, number, number] {
    let r00 = 0, r11 = 0, r01r = 0, r01i = 0;
    const re = this.re, im = this.im, m = 1 << q;
    for (let i = 0; i < this.dim; i++) {
      if (i & m) continue;
      const j = i | m;
      r00 += re[i] * re[i] + im[i] * im[i];
      r11 += re[j] * re[j] + im[j] * im[j];
      // rho_01 = sum psi_i conj(psi_j)
      r01r += re[i] * re[j] + im[i] * im[j];
      r01i += im[i] * re[j] - re[i] * im[j];
    }
    return [2 * r01r, -2 * r01i, r00 - r11];
  }

  /** <P> for a Pauli string in Qiskit order (rightmost char = qubit 0). */
  expectPauli(label: string): number {
    const n = this.n;
    let xmask = 0, zmask = 0, ny = 0;
    for (let k = 0; k < label.length; k++) {
      const q = label.length - 1 - k;
      const ch = label[k];
      if (ch === 'X' || ch === 'Y') xmask |= 1 << q;
      if (ch === 'Z' || ch === 'Y') zmask |= 1 << q;
      if (ch === 'Y') ny++;
    }
    if (n < label.length) throw new Error('label longer than register');
    // P|i> = i^{ny} (-1)^{popcount(i & zmask)} |i ^ xmask>, with Y = iXZ
    let sr = 0, si = 0;
    const re = this.re, im = this.im;
    for (let i = 0; i < this.dim; i++) {
      const j = i ^ xmask;
      const sign = popcount(i & zmask) & 1 ? -1 : 1;
      // contribution conj(psi_j) * sign * psi_i
      const ar = re[j], ai = -im[j];
      const br = re[i] * sign, bi = im[i] * sign;
      sr += ar * br - ai * bi;
      si += ar * bi + ai * br;
    }
    // multiply by i^{ny}
    const k = ny & 3;
    if (k === 0) return sr;
    if (k === 1) return -si;
    if (k === 2) return -sr;
    return si;
  }

  /** Von Neumann entropy (bits) of qubits [0, k) for a pure state, via Schmidt decomposition (k <= 6). */
  entropyFirst(k: number): number {
    const dA = 1 << k, dB = this.dim >> k;
    // reduced rho_A = M M^dagger where M[a][b] = psi[b * dA + a]
    const R = new Float64Array(dA * dA), I = new Float64Array(dA * dA);
    for (let a = 0; a < dA; a++) {
      for (let c = 0; c < dA; c++) {
        let sr = 0, si = 0;
        for (let b = 0; b < dB; b++) {
          const x = b * dA + a, y = b * dA + c;
          sr += this.re[x] * this.re[y] + this.im[x] * this.im[y];
          si += this.im[x] * this.re[y] - this.re[x] * this.im[y];
        }
        R[a * dA + c] = sr;
        I[a * dA + c] = si;
      }
    }
    const ev = hermitianEigenvalues(R, I, dA);
    let S = 0;
    for (const l of ev) if (l > 1e-12) S -= l * Math.log2(l);
    return S;
  }
}

export function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Eigenvalues of a small Hermitian matrix via the real-symmetric 2d embedding + Jacobi rotations. */
export function hermitianEigenvalues(R: Float64Array, I: Float64Array, d: number): number[] {
  const D = 2 * d;
  const A = new Float64Array(D * D);
  for (let i = 0; i < d; i++)
    for (let j = 0; j < d; j++) {
      const r = R[i * d + j], m = I[i * d + j];
      A[i * D + j] = r; A[(i + d) * D + (j + d)] = r;
      A[i * D + (j + d)] = -m; A[(i + d) * D + j] = m;
    }
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < D; p++) for (let q = p + 1; q < D; q++) off += A[p * D + q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < D; p++)
      for (let q = p + 1; q < D; q++) {
        const apq = A[p * D + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q * D + q] - A[p * D + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < D; k++) {
          const akp = A[k * D + p], akq = A[k * D + q];
          A[k * D + p] = c * akp - s * akq;
          A[k * D + q] = s * akp + c * akq;
        }
        for (let k = 0; k < D; k++) {
          const apk = A[p * D + k], aqk = A[q * D + k];
          A[p * D + k] = c * apk - s * aqk;
          A[q * D + k] = s * apk + c * aqk;
        }
      }
  }
  const ev: number[] = [];
  for (let i = 0; i < D; i++) ev.push(A[i * D + i]);
  ev.sort((a, b) => b - a);
  // each eigenvalue appears twice in the embedding
  return ev.filter((_, i) => i % 2 === 0);
}
