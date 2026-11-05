// Portable circuit schema shared with the Python backend (backend/aurora/circuits.py).

export type GateName =
  | 'id' | 'x' | 'y' | 'z' | 'h' | 's' | 'sdg' | 't' | 'tdg' | 'sx' | 'sxdg'
  | 'rx' | 'ry' | 'rz' | 'p' | 'u'
  | 'cx' | 'cy' | 'cz' | 'ch' | 'swap' | 'iswap'
  | 'crx' | 'cry' | 'crz' | 'cp' | 'rzz' | 'rxx' | 'ryy'
  | 'ccx' | 'cswap'
  | 'measure' | 'reset' | 'barrier';

export interface Op {
  name: GateName;
  qubits: number[];
  params?: number[];
  clbits?: number[];
}

export interface Circuit {
  num_qubits: number;
  num_clbits?: number;
  ops: Op[];
}

export interface NoiseParams {
  p1: number; // single-qubit depolarising parameter (Qiskit definition)
  p2: number; // two-qubit depolarising parameter (Qiskit definition)
  readout: number; // symmetric readout flip probability
  reset_error: number; // probability of |1> after reset
  t1_us?: number | null;
  t2_us?: number | null;
  t_1q_ns: number;
  t_2q_ns: number;
  crosstalk_zz: number; // extra ZZ Pauli after each 2Q gate
}

export type Method = 'auto' | 'statevector' | 'density_matrix' | 'stabilizer' | 'trajectories';

export interface RunOptions {
  shots: number;
  method?: Method;
  noise?: NoiseParams | null;
  seed?: number;
  wantState?: boolean;
}

export interface RunResult {
  counts: Record<string, number>;
  shots: number;
  method: Exclude<Method, 'auto'>;
  elapsedMs: number;
  probabilities?: number[]; // exact distribution over clbits (when available)
  statevector?: [number, number][];
  bloch?: [number, number, number][];
  purity?: number;
  entropyHalf?: number; // von Neumann entropy (bits) of the first half of the qubits (pure states)
  stats: CircuitStats;
  notes: string[];
  seed: number;
  execution: string;
}

export interface CircuitStats {
  num_qubits: number;
  size: number;
  depth: number;
  two_qubit_gates: number;
  measurements: number;
  clifford: boolean;
}
