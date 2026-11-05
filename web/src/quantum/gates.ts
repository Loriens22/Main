// Gate catalogue (Qiskit conventions) and 2x2 complex matrices as [ar, ai, br, bi, cr, ci, dr, di] for [[a, b], [c, d]].

import type { GateName, Op } from './types';

export type M2 = [number, number, number, number, number, number, number, number];

const S2 = Math.SQRT1_2;

export const GATE_INFO: Record<GateName, { arity: number; params: number; label: string; clifford: boolean; group: string; doc: string }> = {
  id: { arity: 1, params: 0, label: 'I', clifford: true, group: 'Pauli', doc: 'Identity (idle).' },
  x: { arity: 1, params: 0, label: 'X', clifford: true, group: 'Pauli', doc: 'Bit flip: |0⟩↔|1⟩ (π rotation about X).' },
  y: { arity: 1, params: 0, label: 'Y', clifford: true, group: 'Pauli', doc: 'π rotation about Y.' },
  z: { arity: 1, params: 0, label: 'Z', clifford: true, group: 'Pauli', doc: 'Phase flip: |1⟩ → −|1⟩.' },
  h: { arity: 1, params: 0, label: 'H', clifford: true, group: 'Clifford', doc: 'Hadamard: creates equal superposition.' },
  s: { arity: 1, params: 0, label: 'S', clifford: true, group: 'Clifford', doc: 'Phase gate √Z.' },
  sdg: { arity: 1, params: 0, label: 'S†', clifford: true, group: 'Clifford', doc: 'Inverse phase gate.' },
  t: { arity: 1, params: 0, label: 'T', clifford: false, group: 'Non-Clifford', doc: 'π/8 gate — the non-Clifford resource for universality.' },
  tdg: { arity: 1, params: 0, label: 'T†', clifford: false, group: 'Non-Clifford', doc: 'Inverse T.' },
  sx: { arity: 1, params: 0, label: '√X', clifford: true, group: 'Clifford', doc: '√X — native on IBM-class hardware.' },
  sxdg: { arity: 1, params: 0, label: '√X†', clifford: true, group: 'Clifford', doc: 'Inverse √X.' },
  rx: { arity: 1, params: 1, label: 'RX', clifford: false, group: 'Rotation', doc: 'Rotation exp(−iθX/2).' },
  ry: { arity: 1, params: 1, label: 'RY', clifford: false, group: 'Rotation', doc: 'Rotation exp(−iθY/2).' },
  rz: { arity: 1, params: 1, label: 'RZ', clifford: false, group: 'Rotation', doc: 'Rotation exp(−iθZ/2) (virtual-Z on hardware).' },
  p: { arity: 1, params: 1, label: 'P', clifford: false, group: 'Rotation', doc: 'Phase diag(1, e^{iλ}).' },
  u: { arity: 1, params: 3, label: 'U', clifford: false, group: 'Rotation', doc: 'General single-qubit U(θ, φ, λ).' },
  cx: { arity: 2, params: 0, label: 'CX', clifford: true, group: 'Two-qubit', doc: 'Controlled-NOT (control, target).' },
  cy: { arity: 2, params: 0, label: 'CY', clifford: true, group: 'Two-qubit', doc: 'Controlled-Y.' },
  cz: { arity: 2, params: 0, label: 'CZ', clifford: true, group: 'Two-qubit', doc: 'Controlled-Z — the native entangler on tunable-coupler hardware.' },
  ch: { arity: 2, params: 0, label: 'CH', clifford: false, group: 'Two-qubit', doc: 'Controlled-Hadamard.' },
  swap: { arity: 2, params: 0, label: 'SWAP', clifford: true, group: 'Two-qubit', doc: 'Exchange two qubits (3 CX on hardware).' },
  iswap: { arity: 2, params: 0, label: 'iSWAP', clifford: true, group: 'Two-qubit', doc: 'iSWAP: |01⟩→i|10⟩, |10⟩→i|01⟩.' },
  crx: { arity: 2, params: 1, label: 'CRX', clifford: false, group: 'Two-qubit', doc: 'Controlled RX.' },
  cry: { arity: 2, params: 1, label: 'CRY', clifford: false, group: 'Two-qubit', doc: 'Controlled RY.' },
  crz: { arity: 2, params: 1, label: 'CRZ', clifford: false, group: 'Two-qubit', doc: 'Controlled RZ.' },
  cp: { arity: 2, params: 1, label: 'CP', clifford: false, group: 'Two-qubit', doc: 'Controlled phase diag(1,1,1,e^{iλ}).' },
  rzz: { arity: 2, params: 1, label: 'RZZ', clifford: false, group: 'Two-qubit', doc: 'exp(−iθ Z⊗Z/2) — Ising coupling.' },
  rxx: { arity: 2, params: 1, label: 'RXX', clifford: false, group: 'Two-qubit', doc: 'exp(−iθ X⊗X/2).' },
  ryy: { arity: 2, params: 1, label: 'RYY', clifford: false, group: 'Two-qubit', doc: 'exp(−iθ Y⊗Y/2).' },
  ccx: { arity: 3, params: 0, label: 'CCX', clifford: false, group: 'Three-qubit', doc: 'Toffoli.' },
  cswap: { arity: 3, params: 0, label: 'CSWAP', clifford: false, group: 'Three-qubit', doc: 'Fredkin (controlled swap).' },
  measure: { arity: -1, params: 0, label: 'M', clifford: true, group: 'Non-unitary', doc: 'Projective Z-basis measurement into a classical bit.' },
  reset: { arity: -1, params: 0, label: '|0⟩', clifford: true, group: 'Non-unitary', doc: 'Reset to |0⟩ (dedicated reset element on AURORA-Q).' },
  barrier: { arity: -1, params: 0, label: '‖', clifford: true, group: 'Directive', doc: 'Scheduling barrier (no physical operation).' },
};

export function matrix1(name: GateName, p: number[] = []): M2 {
  switch (name) {
    case 'id': return [1, 0, 0, 0, 0, 0, 1, 0];
    case 'x': return [0, 0, 1, 0, 1, 0, 0, 0];
    case 'y': return [0, 0, 0, -1, 0, 1, 0, 0];
    case 'z': return [1, 0, 0, 0, 0, 0, -1, 0];
    case 'h': return [S2, 0, S2, 0, S2, 0, -S2, 0];
    case 's': return [1, 0, 0, 0, 0, 0, 0, 1];
    case 'sdg': return [1, 0, 0, 0, 0, 0, 0, -1];
    case 't': return [1, 0, 0, 0, 0, 0, S2, S2];
    case 'tdg': return [1, 0, 0, 0, 0, 0, S2, -S2];
    case 'sx': return [0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5];
    case 'sxdg': return [0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5];
    case 'rx': { const c = Math.cos(p[0] / 2), s = Math.sin(p[0] / 2); return [c, 0, 0, -s, 0, -s, c, 0]; }
    case 'ry': { const c = Math.cos(p[0] / 2), s = Math.sin(p[0] / 2); return [c, 0, -s, 0, s, 0, c, 0]; }
    case 'rz': { const c = Math.cos(p[0] / 2), s = Math.sin(p[0] / 2); return [c, -s, 0, 0, 0, 0, c, s]; }
    case 'p': return [1, 0, 0, 0, 0, 0, Math.cos(p[0]), Math.sin(p[0])];
    case 'u': {
      const [th, ph, la] = p;
      const c = Math.cos(th / 2), s = Math.sin(th / 2);
      return [c, 0, -Math.cos(la) * s, -Math.sin(la) * s, Math.cos(ph) * s, Math.sin(ph) * s, Math.cos(ph + la) * c, Math.sin(ph + la) * c];
    }
    default: throw new Error(`not a single-qubit gate: ${name}`);
  }
}

export function conj(m: M2): M2 {
  return [m[0], -m[1], m[2], -m[3], m[4], -m[5], m[6], -m[7]];
}

export function dagger(m: M2): M2 {
  return [m[0], -m[1], m[4], -m[5], m[2], -m[3], m[6], -m[7]];
}

/** Controlled-gate target matrix for crx/cry/crz/cp/cx/cy/cz/ch. */
export function controlledTarget(name: GateName, p: number[] = []): M2 {
  switch (name) {
    case 'cx': return matrix1('x');
    case 'cy': return matrix1('y');
    case 'cz': return matrix1('z');
    case 'ch': return matrix1('h');
    case 'crx': return matrix1('rx', p);
    case 'cry': return matrix1('ry', p);
    case 'crz': return matrix1('rz', p);
    case 'cp': return matrix1('p', p);
    default: throw new Error(`not a controlled gate: ${name}`);
  }
}

export const CONTROLLED = new Set<GateName>(['cx', 'cy', 'cz', 'ch', 'crx', 'cry', 'crz', 'cp']);

export function isClifford(op: Op): boolean {
  const info = GATE_INFO[op.name];
  if (info.clifford) return true;
  // rotations by multiples of pi/2 are Clifford
  if (['rx', 'ry', 'rz', 'p'].includes(op.name) && op.params) {
    const k = op.params[0] / (Math.PI / 2);
    return Math.abs(k - Math.round(k)) < 1e-12;
  }
  return false;
}
