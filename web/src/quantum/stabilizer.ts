// Bit-packed CHP stabilizer tableau (Aaronson & Gottesman, PRA 70, 052328 (2004)).
// Rows 0..n-1 destabilisers, n..2n-1 stabilisers, row 2n scratch. Polynomial cost: exact for Clifford circuits
// of hundreds of qubits — this is what lets the browser run 120-qubit Clifford experiments honestly.

import type { Rng } from './rng';
import { popcount } from './statevector';

export class Tableau {
  readonly n: number;
  readonly W: number; // 32-bit words per row
  x: Uint32Array;
  z: Uint32Array;
  r: Uint8Array;

  constructor(n: number) {
    this.n = n;
    this.W = (n + 31) >>> 5;
    const rows = 2 * n + 1;
    this.x = new Uint32Array(rows * this.W);
    this.z = new Uint32Array(rows * this.W);
    this.r = new Uint8Array(rows);
    for (let i = 0; i < n; i++) {
      this.setX(i, i, 1); // destabiliser X_i
      this.setZ(n + i, i, 1); // stabiliser Z_i
    }
  }

  private getX(row: number, q: number) { return (this.x[row * this.W + (q >>> 5)] >>> (q & 31)) & 1; }
  private getZ(row: number, q: number) { return (this.z[row * this.W + (q >>> 5)] >>> (q & 31)) & 1; }
  private setX(row: number, q: number, v: number) {
    const k = row * this.W + (q >>> 5), b = 1 << (q & 31);
    this.x[k] = v ? this.x[k] | b : this.x[k] & ~b;
  }
  private setZ(row: number, q: number, v: number) {
    const k = row * this.W + (q >>> 5), b = 1 << (q & 31);
    this.z[k] = v ? this.z[k] | b : this.z[k] & ~b;
  }

  h(a: number) {
    const w = a >>> 5, b = 1 << (a & 31);
    for (let i = 0; i < 2 * this.n; i++) {
      const k = i * this.W + w;
      const xa = this.x[k] & b, za = this.z[k] & b;
      if (xa && za) this.r[i] ^= 1;
      if (!!xa !== !!za) {
        this.x[k] ^= b;
        this.z[k] ^= b;
      }
    }
  }

  s(a: number) {
    const w = a >>> 5, b = 1 << (a & 31);
    for (let i = 0; i < 2 * this.n; i++) {
      const k = i * this.W + w;
      const xa = this.x[k] & b;
      if (xa && this.z[k] & b) this.r[i] ^= 1;
      if (xa) this.z[k] ^= b;
    }
  }

  cx(a: number, t: number) {
    const wa = a >>> 5, ba = 1 << (a & 31), wt = t >>> 5, bt = 1 << (t & 31);
    for (let i = 0; i < 2 * this.n; i++) {
      const ka = i * this.W + wa, kt = i * this.W + wt;
      const xa = (this.x[ka] & ba) ? 1 : 0, za = (this.z[ka] & ba) ? 1 : 0;
      const xt = (this.x[kt] & bt) ? 1 : 0, zt = (this.z[kt] & bt) ? 1 : 0;
      if (xa & zt & (xt ^ za ^ 1)) this.r[i] ^= 1;
      if (xa) this.x[kt] ^= bt;
      if (zt) this.z[ka] ^= ba;
    }
  }

  // Pauli frame flips (used for noise injection)
  pauliX(a: number) { for (let i = 0; i < 2 * this.n; i++) if (this.getZ(i, a)) this.r[i] ^= 1; }
  pauliZ(a: number) { for (let i = 0; i < 2 * this.n; i++) if (this.getX(i, a)) this.r[i] ^= 1; }
  pauliY(a: number) { for (let i = 0; i < 2 * this.n; i++) if (this.getX(i, a) ^ this.getZ(i, a)) this.r[i] ^= 1; }

  sdg(a: number) { this.s(a); this.s(a); this.s(a); }
  cz(a: number, b: number) { this.h(b); this.cx(a, b); this.h(b); }
  swap(a: number, b: number) { this.cx(a, b); this.cx(b, a); this.cx(a, b); }

  /** rowsum(h, i): row h <- row i * row h with phase tracking (bitwise phase-exponent formula). */
  private rowsum(h: number, i: number) {
    const W = this.W;
    let sum = 2 * this.r[h] + 2 * this.r[i];
    for (let w = 0; w < W; w++) {
      const x1 = this.x[i * W + w], z1 = this.z[i * W + w];
      const x2 = this.x[h * W + w], z2 = this.z[h * W + w];
      const plus = (x1 & z1 & z2 & ~x2) | (x1 & ~z1 & z2 & x2) | (~x1 & z1 & x2 & ~z2);
      const minus = (x1 & z1 & x2 & ~z2) | (x1 & ~z1 & z2 & ~x2) | (~x1 & z1 & x2 & z2);
      sum += popcount(plus >>> 0) - popcount(minus >>> 0);
      this.x[h * W + w] = x2 ^ x1;
      this.z[h * W + w] = z2 ^ z1;
    }
    this.r[h] = (((sum % 4) + 4) % 4) === 0 ? 0 : 1;
  }

  private copyRow(dst: number, src: number) {
    const W = this.W;
    this.x.copyWithin(dst * W, src * W, src * W + W);
    this.z.copyWithin(dst * W, src * W, src * W + W);
    this.r[dst] = this.r[src];
  }

  private zeroRow(row: number) {
    const W = this.W;
    this.x.fill(0, row * W, row * W + W);
    this.z.fill(0, row * W, row * W + W);
    this.r[row] = 0;
  }

  /** Z-basis measurement of qubit a. */
  measure(a: number, rng: Rng): number {
    const n = this.n;
    let p = -1;
    for (let i = n; i < 2 * n; i++) if (this.getX(i, a)) { p = i; break; }
    if (p >= 0) {
      for (let i = 0; i < 2 * n; i++) if (i !== p && this.getX(i, a)) this.rowsum(i, p);
      this.copyRow(p - n, p);
      this.zeroRow(p);
      const out = rng.random() < 0.5 ? 1 : 0;
      this.r[p] = out;
      this.setZ(p, a, 1);
      return out;
    }
    const s = 2 * n;
    this.zeroRow(s);
    for (let i = 0; i < n; i++) if (this.getX(i, a)) this.rowsum(s, i + n);
    return this.r[s];
  }

  /** Whether measuring qubit a now would be deterministic (expectation ±1). */
  isDeterministic(a: number): boolean {
    for (let i = this.n; i < 2 * this.n; i++) if (this.getX(i, a)) return false;
    return true;
  }

  reset(a: number, rng: Rng) {
    if (this.measure(a, rng)) this.pauliX(a);
  }
}
