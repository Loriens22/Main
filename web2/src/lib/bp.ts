// Min-sum belief propagation + ordered-statistics post-processing (OSD-0) over GF(2).
// Same decoder family as the Python study (ldpc BpOsdDecoder: min-sum, scaling 0.625); the browser
// version uses OSD order 0 so the playground stays interactive.

import type { Bits } from './codes';

export interface Tanner { m: number; n: number; checks: Int32Array[]; vars: Int32Array[] }

export function tanner(H: Bits[]): Tanner {
  const m = H.length, n = H[0].length;
  const checks: Int32Array[] = [], vl: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < m; i++) {
    const c: number[] = [];
    for (let j = 0; j < n; j++) if (H[i][j]) { c.push(j); vl[j].push(i); }
    checks.push(Int32Array.from(c));
  }
  return { m, n, checks, vars: vl.map((v) => Int32Array.from(v)) };
}

export interface DecodeResult {
  correction: Bits;
  converged: boolean;
  iterations: number;
  osd: boolean;
  posterior: Float64Array;
  history?: Uint8Array[];
}

export function bpDecode(T: Tanner, s: Bits, p: number | Float64Array, maxIter = 60, alpha = 0.625, keepHistory = false): DecodeResult {
  const { m, n, checks, vars } = T;
  const prior = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const pj = typeof p === 'number' ? p : p[j];
    prior[j] = Math.log((1 - pj) / Math.max(pj, 1e-12));
  }
  // edge-indexed messages: for check i, slot k -> variable checks[i][k]
  const q = checks.map((c) => Float64Array.from(c, (j) => prior[j]));
  const r = checks.map((c) => new Float64Array(c.length));
  const post = new Float64Array(n);
  const e = new Uint8Array(n);
  const slot: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  checks.forEach((c, i) => c.forEach((j, k) => slot[j].set(i, k)));
  const history: Uint8Array[] = [];
  for (let it = 1; it <= maxIter; it++) {
    for (let i = 0; i < m; i++) {
      const qi = q[i], ri = r[i];
      let sgn = s[i] ? -1 : 1, min1 = Infinity, min2 = Infinity, arg = -1;
      for (let k = 0; k < qi.length; k++) {
        const v = qi[k];
        if (v < 0) sgn = -sgn;
        const a = Math.abs(v);
        if (a < min1) { min2 = min1; min1 = a; arg = k; } else if (a < min2) min2 = a;
      }
      for (let k = 0; k < qi.length; k++) {
        const own = qi[k] < 0 ? -1 : 1;
        ri[k] = alpha * sgn * own * (k === arg ? min2 : min1);
      }
    }
    for (let j = 0; j < n; j++) {
      let L = prior[j];
      for (const i of vars[j]) L += r[i][slot[j].get(i)!];
      post[j] = L;
      e[j] = L < 0 ? 1 : 0;
      for (const i of vars[j]) { const k = slot[j].get(i)!; q[i][k] = L - r[i][k]; }
    }
    if (keepHistory) history.push(e.slice());
    let ok = true;
    for (let i = 0; i < m && ok; i++) { let v = 0; for (const j of checks[i]) v ^= e[j]; if (v !== s[i]) ok = false; }
    if (ok) return { correction: e, converged: true, iterations: it, osd: false, posterior: post, history };
  }
  return { correction: osd0(T, s, post), converged: false, iterations: maxIter, osd: true, posterior: post, history };
}

/** OSD-0: order columns by reliability (most likely flipped first), solve H_S e_S = s on the first independent set. */
export function osd0(T: Tanner, s: Bits, post: Float64Array): Bits {
  const { m, n, checks } = T;
  const order = Array.from({ length: n }, (_, j) => j).sort((a, b) => post[a] - post[b]);
  const words = Math.ceil((n + 1) / 32);
  // rows as bitsets over the permuted columns + augmented syndrome bit at index n
  const rows: Uint32Array[] = [];
  const pos = new Int32Array(n);
  order.forEach((j, k) => (pos[j] = k));
  for (let i = 0; i < m; i++) {
    const w = new Uint32Array(words);
    for (const j of checks[i]) { const k = pos[j]; w[k >>> 5] |= 1 << (k & 31); }
    if (s[i]) w[n >>> 5] |= 1 << (n & 31);
    rows.push(w);
  }
  const pivCols: number[] = [];
  let r = 0;
  for (let k = 0; k < n && r < m; k++) {
    const wi = k >>> 5, bit = 1 << (k & 31);
    let p = -1;
    for (let i = r; i < m; i++) if (rows[i][wi] & bit) { p = i; break; }
    if (p < 0) continue;
    [rows[r], rows[p]] = [rows[p], rows[r]];
    for (let i = 0; i < m; i++) if (i !== r && rows[i][wi] & bit) { const a = rows[i], b = rows[r]; for (let t = 0; t < words; t++) a[t] ^= b[t]; }
    pivCols.push(k);
    r++;
  }
  const e = new Uint8Array(n);
  pivCols.forEach((k, i) => { if (rows[i][n >>> 5] & (1 << (n & 31))) e[order[k]] = 1; });
  return e;
}

export function wilson(k: number, n: number, z = 1.96) {
  if (n === 0) return { p: 0, lo: 0, hi: 1 };
  const p = k / n, den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const hw = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return { p, lo: Math.max(0, c - hw), hi: Math.min(1, c + hw) };
}
