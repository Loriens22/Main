// CSS codes for the in-browser decoder lab: bivariate bicycle (Bravyi et al. 2024) and rotated surface codes.
// Mirrors backend/aurora/q2/codes.py exactly (same conventions, same parity-check matrices).

export type Bits = Uint8Array;

export interface CSSCode {
  name: string;
  label: string;
  n: number;
  HX: Bits[];
  HZ: Bits[];
  d: number;
  family: 'bb' | 'surface';
  l?: number;
  m?: number;
  A?: [number, number][];
  B?: [number, number][];
}

export const BB: Record<string, { l: number; m: number; A: [number, number][]; B: [number, number][]; d: number; label: string }> = {
  bb72: { l: 6, m: 6, A: [[3, 0], [0, 1], [0, 2]], B: [[0, 3], [1, 0], [2, 0]], d: 6, label: '[[72,12,6]]' },
  bb90: { l: 15, m: 3, A: [[9, 0], [0, 1], [0, 2]], B: [[0, 0], [2, 0], [7, 0]], d: 10, label: '[[90,8,10]]' },
  bb108: { l: 9, m: 6, A: [[3, 0], [0, 1], [0, 2]], B: [[0, 3], [1, 0], [2, 0]], d: 10, label: '[[108,8,10]]' },
  gross144: { l: 12, m: 6, A: [[3, 0], [0, 1], [0, 2]], B: [[0, 3], [1, 0], [2, 0]], d: 12, label: '[[144,12,12]] gross' },
  bb288: { l: 12, m: 12, A: [[3, 0], [0, 2], [0, 7]], B: [[0, 3], [1, 0], [2, 0]], d: 18, label: '[[288,12,18]] two-gross' },
};

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** H_X = [A | B], H_Z = [B^T | A^T] with A, B sums of monomials x^i y^j, x = S_l (x) I_m, y = I_l (x) S_m. */
export function bbCode(name: string): CSSCode {
  const { l, m, A, B, d, label } = BB[name];
  const lm = l * m;
  const g = (i: number, j: number) => mod(i, l) * m + mod(j, m);
  const HX: Bits[] = [], HZ: Bits[] = [];
  for (let i = 0; i < l; i++) for (let j = 0; j < m; j++) {
    const rx = new Uint8Array(2 * lm), rz = new Uint8Array(2 * lm);
    // row g of A has a 1 at column g + a (monomial x^a1 y^a2 shifts by +a)
    for (const [a1, a2] of A) { rx[g(i + a1, j + a2)] ^= 1; rz[lm + g(i - a1, j - a2)] ^= 1; }
    for (const [b1, b2] of B) { rx[lm + g(i + b1, j + b2)] ^= 1; rz[g(i - b1, j - b2)] ^= 1; }
    HX.push(rx); HZ.push(rz);
  }
  return { name, label, n: 2 * lm, HX, HZ, d, family: 'bb', l, m, A, B };
}

export function surfaceCode(d: number): CSSCode {
  const idx = (r: number, c: number) => r * d + c;
  const xs: number[][] = [], zs: number[][] = [];
  for (let r = -1; r < d; r++) for (let c = -1; c < d; c++) {
    const qs: number[] = [];
    for (const rr of [r, r + 1]) for (const cc of [c, c + 1]) if (rr >= 0 && rr < d && cc >= 0 && cc < d) qs.push(idx(rr, cc));
    const isX = mod(r + c, 2) === 0;
    if (qs.length === 4) (isX ? xs : zs).push(qs);
    else if (qs.length === 2) {
      if (isX && (r === -1 || r === d - 1)) xs.push(qs);
      if (!isX && (c === -1 || c === d - 1)) zs.push(qs);
    }
  }
  const mat = (cs: number[][]) => cs.map((qs) => { const v = new Uint8Array(d * d); qs.forEach((q) => (v[q] = 1)); return v; });
  return { name: `surface_d${d}`, label: `surface d=${d} [[${d * d},1,${d}]]`, n: d * d, HX: mat(xs), HZ: mat(zs), d, family: 'surface' };
}

export function getCode(name: string): CSSCode {
  return name.startsWith('surface_d') ? surfaceCode(+name.slice(9)) : bbCode(name);
}

// ------------------------------------------------------------------ GF(2)
export function rref(rows: Bits[], ncols: number): { R: Bits[]; pivots: number[] } {
  const A = rows.map((r) => r.slice());
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < ncols && r < A.length; c++) {
    let p = -1;
    for (let i = r; i < A.length; i++) if (A[i][c]) { p = i; break; }
    if (p < 0) continue;
    [A[r], A[p]] = [A[p], A[r]];
    for (let i = 0; i < A.length; i++) if (i !== r && A[i][c]) xorInto(A[i], A[r]);
    pivots.push(c);
    r++;
  }
  return { R: A.slice(0, r), pivots };
}

export function xorInto(a: Bits, b: Bits) { for (let k = 0; k < a.length; k++) a[k] ^= b[k]; }
export const rank = (rows: Bits[], n: number) => rref(rows, n).pivots.length;

export function nullspace(rows: Bits[], n: number): Bits[] {
  const { R, pivots } = rref(rows, n);
  const piv = new Set(pivots);
  const out: Bits[] = [];
  for (let f = 0; f < n; f++) {
    if (piv.has(f)) continue;
    const v = new Uint8Array(n);
    v[f] = 1;
    pivots.forEach((p, i) => { if (R[i][f]) v[p] = 1; });
    out.push(v);
  }
  return out;
}

/** Logical Z operators: ker(H_X) modulo rowspace(H_Z). Detect X-type residuals that act non-trivially. */
export function logicalZ(code: CSSCode): Bits[] {
  const basis: Bits[] = code.HZ.map((r) => r.slice());
  let r0 = rank(basis, code.n);
  const out: Bits[] = [];
  for (const v of nullspace(code.HX, code.n)) {
    basis.push(v);
    const r = rank(basis, code.n);
    if (r > r0) { out.push(v); r0 = r; } else basis.pop();
  }
  return out;
}

export function kOf(code: CSSCode) {
  return code.n - rank(code.HX, code.n) - rank(code.HZ, code.n);
}

export function syndrome(H: Bits[], e: Bits): Bits {
  const s = new Uint8Array(H.length);
  for (let i = 0; i < H.length; i++) { let v = 0; const h = H[i]; for (let j = 0; j < e.length; j++) v ^= h[j] & e[j]; s[i] = v; }
  return s;
}

/** Positions on the Toroid grid (same placement as backend/aurora/q2/layout.py). */
export function toroidPlacement(code: CSSCode) {
  const l = code.l!, m = code.m!;
  const R = 2 * l, C = 2 * m;
  const pos: { id: string; type: 'X' | 'Z' | 'L' | 'R'; idx: number; r: number; c: number }[] = [];
  for (let i = 0; i < l; i++) for (let j = 0; j < m; j++) {
    const g = i * m + j;
    pos.push({ id: `X${g}`, type: 'X', idx: g, r: mod(2 * i, R), c: mod(2 * j, C) });
    pos.push({ id: `L${g}`, type: 'L', idx: g, r: mod(2 * i, R), c: mod(2 * j - 3, C) });
    pos.push({ id: `R${g}`, type: 'R', idx: g, r: mod(2 * i - 3, R), c: mod(2 * j, C) });
    pos.push({ id: `Z${g}`, type: 'Z', idx: g, r: mod(2 * i - 3, R), c: mod(2 * j - 3, C) });
  }
  return { R, C, pos };
}
