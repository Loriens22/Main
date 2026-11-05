// QAOA MaxCut and VQE (H2) — exact statevector objectives + classical optimisers.

import { DensityMatrix } from './density';
import { matrix1 } from './gates';
import { Rng } from './rng';
import { StateVector } from './statevector';

export function nelderMead(f: (x: number[]) => number, x0: number[], opts: { iters?: number; step?: number; onIter?: (x: number[], fx: number, k: number) => void } = {}) {
  const n = x0.length, iters = opts.iters ?? 300, step = opts.step ?? 0.4;
  let simplex = [x0.slice(), ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step : v)))];
  let vals = simplex.map(f);
  for (let k = 0; k < iters; k++) {
    const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    simplex = order.map((i) => simplex[i]);
    vals = order.map((i) => vals[i]);
    opts.onIter?.(simplex[0], vals[0], k);
    const c = x0.map((_, j) => simplex.slice(0, n).reduce((a, s) => a + s[j], 0) / n);
    const refl = c.map((v, j) => v + (v - simplex[n][j]));
    const fr = f(refl);
    if (fr < vals[0]) {
      const exp = c.map((v, j) => v + 2 * (v - simplex[n][j]));
      const fe = f(exp);
      if (fe < fr) { simplex[n] = exp; vals[n] = fe; } else { simplex[n] = refl; vals[n] = fr; }
    } else if (fr < vals[n - 1]) { simplex[n] = refl; vals[n] = fr; }
    else {
      const con = c.map((v, j) => v + 0.5 * (simplex[n][j] - v));
      const fc = f(con);
      if (fc < vals[n]) { simplex[n] = con; vals[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); vals[i] = f(simplex[i]); }
      }
    }
    if (Math.abs(vals[n] - vals[0]) < 1e-10 && k > 20) break;
  }
  const i = vals.indexOf(Math.min(...vals));
  return { x: simplex[i], fx: vals[i] };
}

// --------------------------------------------------------------------- MaxCut
export interface Graph { n: number; edges: [number, number][] }

export function random3Regular(n: number, seed: number): Graph {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 500; attempt++) {
    const stubs: number[] = [];
    for (let v = 0; v < n; v++) for (let k = 0; k < 3; k++) stubs.push(v);
    for (let i = stubs.length - 1; i > 0; i--) { const j = rng.int(i + 1); [stubs[i], stubs[j]] = [stubs[j], stubs[i]]; }
    const edges: [number, number][] = [];
    const seen = new Set<string>();
    let ok = true;
    for (let i = 0; i < stubs.length; i += 2) {
      const a = Math.min(stubs[i], stubs[i + 1]), b = Math.max(stubs[i], stubs[i + 1]);
      if (a === b || seen.has(`${a}-${b}`)) { ok = false; break; }
      seen.add(`${a}-${b}`);
      edges.push([a, b]);
    }
    if (ok) return { n, edges };
  }
  throw new Error('could not sample a simple 3-regular graph');
}

export function cutValues(g: Graph): Float64Array {
  const N = 1 << g.n, c = new Float64Array(N);
  for (let i = 0; i < N; i++) for (const [u, v] of g.edges) c[i] += ((i >> u) ^ (i >> v)) & 1;
  return c;
}

export function qaoaState(g: Graph, cuts: Float64Array, params: number[], p: number): StateVector {
  const sv = new StateVector(g.n);
  const amp = 1 / Math.sqrt(sv.dim);
  sv.re.fill(amp);
  for (let k = 0; k < p; k++) {
    const gam = params[k], bet = params[p + k];
    for (let i = 0; i < sv.dim; i++) {
      const ph = -gam * cuts[i], c = Math.cos(ph), s = Math.sin(ph), r = sv.re[i], m = sv.im[i];
      sv.re[i] = r * c - m * s; sv.im[i] = r * s + m * c;
    }
    const U = matrix1('rx', [2 * bet]);
    for (let q = 0; q < g.n; q++) sv.apply1(q, U);
  }
  return sv;
}

export function qaoaExpect(g: Graph, cuts: Float64Array, params: number[], p: number): number {
  const pr = qaoaState(g, cuts, params, p).probabilities();
  let e = 0;
  for (let i = 0; i < pr.length; i++) e += pr[i] * cuts[i];
  return e;
}

export function greedyLocal(g: Graph, rng: Rng): number {
  const s = Array.from({ length: g.n }, () => rng.int(2));
  const nb: number[][] = Array.from({ length: g.n }, () => []);
  g.edges.forEach(([u, v]) => { nb[u].push(v); nb[v].push(u); });
  let improved = true;
  while (improved) {
    improved = false;
    for (let v = 0; v < g.n; v++) {
      const gain = nb[v].reduce((a, u) => a + (s[u] === s[v] ? 1 : -1), 0);
      if (gain > 0) { s[v] ^= 1; improved = true; }
    }
  }
  return g.edges.reduce((a, [u, v]) => a + (s[u] !== s[v] ? 1 : 0), 0);
}

export function annealing(g: Graph, rng: Rng, steps = 4000): number {
  const s = Array.from({ length: g.n }, () => rng.int(2));
  const nb: number[][] = Array.from({ length: g.n }, () => []);
  g.edges.forEach(([u, v]) => { nb[u].push(v); nb[v].push(u); });
  let cur = g.edges.reduce((a, [u, v]) => a + (s[u] !== s[v] ? 1 : 0), 0), best = cur;
  for (let t = 0; t < steps; t++) {
    const T = 2 * (1 - t / steps) + 1e-3, v = rng.int(g.n);
    const d = nb[v].reduce((a, u) => a + (s[u] === s[v] ? 1 : -1), 0);
    if (d >= 0 || rng.random() < Math.exp(d / T)) { s[v] ^= 1; cur += d; best = Math.max(best, cur); }
  }
  return best;
}

// ------------------------------------------------------------------------ VQE
export type PauliTerm = [string, number];

export function energySV(sv: StateVector, H: PauliTerm[]): number {
  return H.reduce((a, [lab, c]) => a + c * (/^I+$/.test(lab) ? 1 : sv.expectPauli(lab)), 0);
}

/** cos t |1010> + sin t |0101>: exact for H2/STO-3G in the N=2, S_z=0 sector. */
export function ansatzPC(theta: number): StateVector {
  const sv = new StateVector(4);
  sv.apply1(0, matrix1('ry', [2 * theta]));
  sv.applyOp({ name: 'cx', qubits: [0, 2] });
  sv.apply1(1, matrix1('x'));
  sv.apply1(3, matrix1('x'));
  sv.applyOp({ name: 'cx', qubits: [0, 1] });
  sv.applyOp({ name: 'cx', qubits: [0, 3] });
  return sv;
}

export function ansatzHEA(params: number[], layers = 2): StateVector {
  const sv = new StateVector(4);
  for (let l = 0; l <= layers; l++) {
    for (let q = 0; q < 4; q++) sv.apply1(q, matrix1('ry', [params[l * 4 + q]]));
    if (l < layers) for (let q = 0; q < 3; q++) sv.applyOp({ name: 'cz', qubits: [q, q + 1] });
  }
  return sv;
}

export function energyHEANoisy(params: number[], H: PauliTerm[], p1: number, p2: number, layers = 2): number {
  const dm = new DensityMatrix(4);
  for (let l = 0; l <= layers; l++) {
    for (let q = 0; q < 4; q++) { dm.applyOp({ name: 'ry', qubits: [q], params: [params[l * 4 + q]] }); dm.depolarize([q], p1); }
    if (l < layers) for (let q = 0; q < 3; q++) { dm.applyOp({ name: 'cz', qubits: [q, q + 1] }); dm.depolarize([q, q + 1], p2); }
  }
  // <H> = sum c Tr(rho P): evaluate via the vectorised density matrix
  let e = 0;
  const D = 16;
  for (const [lab, c] of H) {
    if (/^I+$/.test(lab)) { e += c; continue; }
    let xmask = 0, zmask = 0, ny = 0;
    for (let k = 0; k < 4; k++) {
      const q = 3 - k, ch = lab[k];
      if (ch === 'X' || ch === 'Y') xmask |= 1 << q;
      if (ch === 'Z' || ch === 'Y') zmask |= 1 << q;
      if (ch === 'Y') ny++;
    }
    // Tr(rho P) = sum_i <i|rho P|i> = sum_i rho[i][i^x] * phase(P maps |i^x> -> |i>)
    let sr = 0, si = 0;
    for (let i = 0; i < D; i++) {
      const j = i ^ xmask;
      const sign = popc(i & zmask) & 1 ? -1 : 1; // P|i> = i^ny (-1)^{popcount(i & z)} |i ^ x>
      const rr = dm.v.re[i * D + j], ri = dm.v.im[i * D + j];
      sr += sign * rr; si += sign * ri;
    }
    const k = ny & 3;
    e += c * (k === 0 ? sr : k === 1 ? -si : k === 2 ? -sr : si);
  }
  return e;
}

function popc(x: number) { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }
