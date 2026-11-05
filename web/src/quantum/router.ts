// Qubit mapping + SWAP routing onto processor coupling graphs (SABRE-style heuristic, Li, Ding & Xie 2019).
// Produces the physical circuit, layouts and an ASAP layer schedule for the digital-twin animation.

import { layers } from './circuit';
import type { Circuit, Op } from './types';

export interface Topology {
  name: string;
  n: number;
  edges: [number, number][];
  coords: [number, number][];
}

export function squareGrid(rows = 12, cols = 10): Topology {
  const edges: [number, number][] = [];
  const coords: [number, number][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const q = r * cols + c;
      coords.push([c, r]);
      if (c + 1 < cols) edges.push([q, q + 1]);
      if (r + 1 < rows) edges.push([q, q + cols]);
    }
  return { name: `square_${rows}x${cols}`, n: rows * cols, edges, coords };
}

/** Heron-class heavy-hex (156 qubits, 176 couplers) — identical to backend topologies.heron_heavy_hex(). */
export function heavyHex(): Topology {
  const edges: [number, number][] = [];
  const coords: [number, number][] = [];
  let q = 0;
  for (let r = 0; r < 8; r++) {
    const row = q;
    for (let c = 0; c < 16; c++) {
      coords.push([c, 2 * r]);
      if (c > 0) edges.push([q - 1, q]);
      q++;
    }
    if (r < 7) {
      const cols = r % 2 === 0 ? [3, 7, 11, 15] : [1, 5, 9, 13];
      const next = q + cols.length;
      for (const c of cols) {
        coords.push([c, 2 * r + 1]);
        edges.push([row + c, q]);
        edges.push([q, next + c]);
        q++;
      }
    }
  }
  return { name: 'heron_heavy_hex_156', n: q, edges, coords };
}

export function distances(t: Topology): Int16Array {
  const adj: number[][] = Array.from({ length: t.n }, () => []);
  for (const [a, b] of t.edges) { adj[a].push(b); adj[b].push(a); }
  const D = new Int16Array(t.n * t.n).fill(-1);
  for (let s = 0; s < t.n; s++) {
    const queue = [s];
    D[s * t.n + s] = 0;
    for (let h = 0; h < queue.length; h++) {
      const u = queue[h];
      for (const v of adj[u]) if (D[s * t.n + v] < 0) { D[s * t.n + v] = D[s * t.n + u] + 1; queue.push(v); }
    }
  }
  return D;
}

function decompose3(c: Circuit): Circuit {
  const ops: Op[] = [];
  const ccx = (a: number, b: number, t: number) => {
    ops.push({ name: 'h', qubits: [t] }, { name: 'cx', qubits: [b, t] }, { name: 'tdg', qubits: [t] }, { name: 'cx', qubits: [a, t] },
      { name: 't', qubits: [t] }, { name: 'cx', qubits: [b, t] }, { name: 'tdg', qubits: [t] }, { name: 'cx', qubits: [a, t] },
      { name: 't', qubits: [b] }, { name: 't', qubits: [t] }, { name: 'h', qubits: [t] }, { name: 'cx', qubits: [a, b] },
      { name: 't', qubits: [a] }, { name: 'tdg', qubits: [b] }, { name: 'cx', qubits: [a, b] });
  };
  for (const op of c.ops) {
    if (op.name === 'ccx') ccx(op.qubits[0], op.qubits[1], op.qubits[2]);
    else if (op.name === 'cswap') {
      const [a, b, t] = op.qubits;
      ops.push({ name: 'cx', qubits: [t, b] });
      ccx(a, b, t);
      ops.push({ name: 'cx', qubits: [t, b] });
    } else ops.push(op);
  }
  return { ...c, ops };
}

export interface RouteResult {
  physical: Circuit;
  initialLayout: number[]; // logical -> physical
  finalLayout: number[];
  swaps: number;
  logical2q: number;
  physical2q: number; // counting SWAP as 3 CX
  layers: Op[][];
  usedPhysical: number[];
}

export function route(input: Circuit, topo: Topology, seed = 1): RouteResult {
  const c = decompose3(input);
  const n = c.num_qubits;
  if (n > topo.n) throw new Error(`circuit needs ${n} qubits; ${topo.name} has ${topo.n}`);
  const D = distances(topo);
  const dist = (a: number, b: number) => D[a * topo.n + b];
  // ---------------- initial layout: interaction-weighted greedy placement around the centre
  const w = Array.from({ length: n }, () => new Float64Array(n));
  c.ops.forEach((op, i) => {
    if (op.qubits.length === 2) {
      const [a, b] = op.qubits;
      const decay = 1 / (1 + i / Math.max(1, c.ops.length));
      w[a][b] += decay; w[b][a] += decay;
    }
  });
  const cx = topo.coords.reduce((s, p) => s + p[0], 0) / topo.n, cy = topo.coords.reduce((s, p) => s + p[1], 0) / topo.n;
  const centre = topo.coords.map((p, i) => [Math.hypot(p[0] - cx, p[1] - cy), i]).sort((a, b) => a[0] - b[0])[0][1];
  const layout = new Array<number>(n).fill(-1);
  const used = new Uint8Array(topo.n);
  const order: number[] = [];
  const placedSet = new Set<number>();
  const strength = (q: number) => w[q].reduce((s, v) => s + v, 0);
  let first = 0;
  for (let q = 1; q < n; q++) if (strength(q) > strength(first)) first = q;
  order.push(first); placedSet.add(first);
  while (order.length < n) {
    let best = -1, bestS = -1;
    for (let q = 0; q < n; q++) {
      if (placedSet.has(q)) continue;
      let s = 0;
      for (const p of placedSet) s += w[q][p];
      s = s * 1000 + strength(q);
      if (s > bestS) { bestS = s; best = q; }
    }
    order.push(best); placedSet.add(best);
  }
  for (const q of order) {
    let best = -1, bestCost = Infinity;
    for (let p = 0; p < topo.n; p++) {
      if (used[p]) continue;
      let cost = 0.05 * dist(p, centre);
      for (let l = 0; l < n; l++) if (layout[l] >= 0 && w[q][l] > 0) cost += w[q][l] * dist(p, layout[l]);
      if (cost < bestCost) { bestCost = cost; best = p; }
    }
    layout[q] = best;
    used[best] = 1;
  }
  const initialLayout = layout.slice();
  const phys2log = new Array<number>(topo.n).fill(-1);
  layout.forEach((p, l) => (phys2log[p] = l));
  // ---------------- dependency DAG
  const preds: number[] = new Array(c.ops.length).fill(0);
  const succ: number[][] = c.ops.map(() => []);
  const last = new Array<number>(n).fill(-1);
  c.ops.forEach((op, i) => {
    const ps = new Set<number>();
    for (const q of op.qubits) if (last[q] >= 0) ps.add(last[q]);
    for (const p of ps) { succ[p].push(i); preds[i]++; }
    for (const q of op.qubits) last[q] = i;
  });
  let front = c.ops.map((_, i) => i).filter((i) => preds[i] === 0);
  const out: Op[] = [];
  let swaps = 0;
  const decay = new Float64Array(topo.n).fill(1);
  const adj: number[][] = Array.from({ length: topo.n }, () => []);
  for (const [a, b] of topo.edges) { adj[a].push(b); adj[b].push(a); }
  let stall = 0;
  let rngState = seed;
  const rnd = () => ((rngState = (rngState * 1103515245 + 12345) >>> 0) / 2 ** 32);
  while (front.length) {
    const next: number[] = [];
    let progressed = false;
    for (const i of front) {
      const op = c.ops[i];
      const ph = op.qubits.map((q) => layout[q]);
      if (op.qubits.length === 2 && dist(ph[0], ph[1]) !== 1) { next.push(i); continue; }
      out.push({ ...op, qubits: ph });
      progressed = true;
      for (const s of succ[i]) if (--preds[s] === 0) next.push(s);
    }
    front = next;
    if (progressed) { decay.fill(1); stall = 0; continue; }
    // ---------------- choose a SWAP
    const frontGates = front.filter((i) => c.ops[i].qubits.length === 2);
    const ext: number[] = [];
    const seen = new Set(front);
    const queue = [...front];
    while (queue.length && ext.length < 20) {
      const i = queue.shift()!;
      for (const s of succ[i]) if (!seen.has(s)) { seen.add(s); queue.push(s); if (c.ops[s].qubits.length === 2) ext.push(s); }
    }
    const cand = new Set<string>();
    for (const i of frontGates) for (const q of c.ops[i].qubits) for (const nb of adj[layout[q]]) cand.add(`${Math.min(layout[q], nb)}-${Math.max(layout[q], nb)}`);
    let bestSwap: [number, number] | null = null, bestScore = Infinity;
    const score = (pa: number, pb: number) => {
      const la = phys2log[pa], lb = phys2log[pb];
      const pos = (l: number) => (l === la ? pb : l === lb ? pa : layout[l]);
      let f = 0;
      for (const i of frontGates) { const [a, b] = c.ops[i].qubits; f += dist(pos(a), pos(b)); }
      let e = 0;
      for (const i of ext) { const [a, b] = c.ops[i].qubits; e += dist(pos(a), pos(b)); }
      return Math.max(decay[pa], decay[pb]) * (f / Math.max(1, frontGates.length) + (ext.length ? 0.5 * e / ext.length : 0));
    };
    for (const k of cand) {
      const [a, b] = k.split('-').map(Number);
      const s = score(a, b) + 1e-9 * rnd();
      if (s < bestScore) { bestScore = s; bestSwap = [a, b]; }
    }
    stall++;
    if (!bestSwap || stall > 4 * topo.n) {
      // release valve: walk the first front gate's first qubit one step along a shortest path
      const [a, b] = c.ops[frontGates[0]].qubits;
      const pa = layout[a], pb = layout[b];
      const step = adj[pa].find((nb) => dist(nb, pb) < dist(pa, pb))!;
      bestSwap = [pa, step];
      stall = 0;
    }
    const [pa, pb] = bestSwap;
    out.push({ name: 'swap', qubits: [pa, pb] });
    swaps++;
    const la = phys2log[pa], lb = phys2log[pb];
    phys2log[pa] = lb; phys2log[pb] = la;
    if (la >= 0) layout[la] = pb;
    if (lb >= 0) layout[lb] = pa;
    decay[pa] += 0.001; decay[pb] += 0.001;
  }
  const physical: Circuit = { num_qubits: topo.n, num_clbits: input.num_clbits ?? input.num_qubits, ops: out };
  const logical2q = input.ops.filter((o) => o.qubits.length === 2).length + 6 * input.ops.filter((o) => o.qubits.length === 3).length;
  const physical2q = out.reduce((s, o) => s + (o.qubits.length === 2 ? (o.name === 'swap' ? 3 : 1) : 0), 0);
  const usedPhysical = [...new Set(out.flatMap((o) => o.qubits).concat(initialLayout))].sort((a, b) => a - b);
  return { physical, initialLayout, finalLayout: layout, swaps, logical2q, physical2q, layers: layers(physical), usedPhysical };
}
