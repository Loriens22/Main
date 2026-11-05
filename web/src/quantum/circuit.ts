import { GATE_INFO, isClifford } from './gates';
import type { Circuit, CircuitStats, Op } from './types';

export const LIMITS = { maxQubitsEditor: 24, statevector: 22, density: 8, trajectories: 16, stabilizer: 2048, shots: 100000 };

export function validate(c: Circuit, maxQubits = LIMITS.stabilizer): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(c.num_qubits) || c.num_qubits < 1 || c.num_qubits > maxQubits) errs.push(`num_qubits must be 1..${maxQubits}`);
  const nc = c.num_clbits ?? c.num_qubits;
  c.ops.forEach((op, i) => {
    const info = GATE_INFO[op.name];
    if (!info) { errs.push(`op ${i}: unknown gate ${op.name}`); return; }
    if (info.arity > 0 && op.qubits.length !== info.arity) errs.push(`op ${i}: ${op.name} needs ${info.arity} qubit(s)`);
    if (new Set(op.qubits).size !== op.qubits.length) errs.push(`op ${i}: repeated qubit`);
    if (op.qubits.some((q) => q < 0 || q >= c.num_qubits)) errs.push(`op ${i}: qubit out of range`);
    if ((op.params?.length ?? 0) !== info.params) errs.push(`op ${i}: ${op.name} needs ${info.params} parameter(s)`);
    if (op.name === 'measure') {
      const cb = op.clbits ?? op.qubits;
      if (cb.some((b) => b < 0 || b >= nc)) errs.push(`op ${i}: clbit out of range`);
    }
  });
  return errs;
}

export function stats(c: Circuit): CircuitStats {
  const level = new Array(c.num_qubits).fill(0);
  let two = 0, meas = 0, size = 0;
  let clifford = true;
  for (const op of c.ops) {
    if (op.name === 'barrier') continue;
    size++;
    if (op.qubits.length === 2) two++;
    if (op.name === 'measure') meas++;
    if (!isClifford(op)) clifford = false;
    const l = Math.max(...op.qubits.map((q) => level[q])) + 1;
    for (const q of op.qubits) level[q] = l;
  }
  return { num_qubits: c.num_qubits, size, depth: Math.max(0, ...level), two_qubit_gates: two, measurements: meas, clifford };
}

/** ASAP layering (used by the digital twin to animate execution). */
export function layers(c: Circuit): Op[][] {
  const level = new Array(c.num_qubits).fill(0);
  const out: Op[][] = [];
  for (const op of c.ops) {
    if (op.name === 'barrier') {
      const m = Math.max(...op.qubits.map((q) => level[q]));
      for (const q of op.qubits) level[q] = m;
      continue;
    }
    const l = Math.max(...op.qubits.map((q) => level[q]));
    (out[l] ??= []).push(op);
    for (const q of op.qubits) level[q] = l + 1;
  }
  return out;
}

export function toQasm3(c: Circuit): string {
  const nc = c.num_clbits ?? c.num_qubits;
  const lines = ['OPENQASM 3.0;', 'include "stdgates.inc";', `qubit[${c.num_qubits}] q;`, `bit[${nc}] c;`];
  const name: Record<string, string> = { sxdg: 'sxdg', iswap: 'iswap' };
  for (const op of c.ops) {
    const qs = op.qubits.map((q) => `q[${q}]`).join(', ');
    if (op.name === 'measure') {
      const cb = op.clbits ?? op.qubits;
      op.qubits.forEach((q, i) => lines.push(`c[${cb[i]}] = measure q[${q}];`));
    } else if (op.name === 'reset') lines.push(`reset ${qs};`);
    else if (op.name === 'barrier') lines.push(`barrier ${qs};`);
    else {
      const ps = op.params?.length ? `(${op.params.map((p) => +p.toFixed(12)).join(', ')})` : '';
      lines.push(`${name[op.name] ?? op.name}${ps} ${qs};`);
    }
  }
  return lines.join('\n') + '\n';
}

export function hasMidCircuitOps(c: Circuit): boolean {
  // true if any measurement is followed by another op on the same qubit, or any reset exists
  const measured = new Set<number>();
  for (const op of c.ops) {
    if (op.name === 'reset') return true;
    if (op.name === 'barrier') continue;
    if (op.qubits.some((q) => measured.has(q))) return true;
    if (op.name === 'measure') op.qubits.forEach((q) => measured.add(q));
  }
  return false;
}
