// AURORA-CRYO analytical models. TypeScript port of backend/aurora/q2/cryo.py; parameters are read
// from the exported JSON so browser and Python share one source of truth (see cryo.test.ts).

const H = 6.62607015e-34, KB = 1.380649e-23, HBAR = H / (2 * Math.PI), EV = 1.602176634e-19;

export const nBose = (f: number, T: number) => {
  if (T <= 0) return 0;
  const x = (H * f) / (KB * T);
  return x > 700 ? 0 : 1 / Math.expm1(x);
};
export const pExcited = (f: number, T: number) => 1 / (1 + Math.exp(Math.min((H * f) / (KB * T), 700)));

export interface ChainStage { name: string; T: number; T_eff?: number; dB: number }
export function photonChain(f: number, stages: ChainStage[]) {
  let n = nBose(f, 300);
  const out = [{ name: '300 K source', n, dB: 0, T_eff: 300 }];
  for (const s of stages) {
    const A = 10 ** (s.dB / 10);
    n = n / A + (1 - 1 / A) * nBose(f, s.T_eff ?? s.T);
    out.push({ name: s.name, n, dB: s.dB, T_eff: s.T_eff ?? s.T });
  }
  return out;
}
export const dephasingRate = (n: number, kappa: number, chi: number) => (n * kappa * 4 * chi * chi) / (kappa * kappa + 4 * chi * chi);
export const gammaQP = (xqp: number, fq: number, deltaEV = 180e-6) => xqp * Math.sqrt((2 * 2 * Math.PI * fq * deltaEV * EV) / (Math.PI ** 2 * HBAR));

export interface Arch {
  label: string; readout_f: number; qubit_f: number; chain: ChainStage[]; out_line_n: number; n_floor?: number;
  T_eff_qubit: number; x_qp: number; T1_dielectric: number; T1_purcell: number; Tphi_other: number;
  p2_control: number; p_sep: number; p_reset: number; t_2q: number; t_layer: number; t_meas: number; t_reset: number;
}

export function coherenceBudget(a: Arch, kappa2piMHz: number, chi2piMHz: number) {
  const kappa = 2 * Math.PI * kappa2piMHz * 1e6, chi = 2 * Math.PI * chi2piMHz * 1e6;
  const chain = photonChain(a.readout_f, a.chain);
  const nLine = chain[chain.length - 1].n + a.out_line_n;
  const nRes = Math.max(nLine, a.n_floor ?? 0);
  const gPhiTh = dephasingRate(nRes, kappa, chi);
  const gQP = gammaQP(a.x_qp, a.qubit_f);
  const T1 = 1 / (1 / a.T1_dielectric + gQP + 1 / a.T1_purcell);
  const T2 = 1 / (1 / (2 * T1) + gPhiTh + 1 / a.Tphi_other);
  const pauli = (t: number) => t / (4 * T1) + t / (2 * T2);
  return {
    chain, nLine, nRes, Tphi_thermal: 1 / gPhiTh, T1_qp: 1 / gQP, T1, T2,
    P_excited: pExcited(a.qubit_f, a.T_eff_qubit),
    cycle_interleaved: 8 * a.t_layer + a.t_meas + a.t_reset,
    noise: {
      p2: a.p2_control + 2 * pauli(a.t_2q), p_idle: pauli(a.t_layer), p_idle_meas: pauli(a.t_meas + a.t_reset),
      p_meas: a.p_sep + a.t_meas / (2 * T1), p_reset: a.p_reset,
    },
  };
}

export type StageName = '50 K' | '4 K' | 'Still' | 'Cold plate' | 'MXC';
export const STAGE_ORDER: StageName[] = ['50 K', '4 K', 'Still', 'Cold plate', 'MXC'];

export interface HeatParams {
  CAPACITY: Record<StageName, number>;
  MARGIN: number;
  LINE_CAPACITY: number;
  WIRING: Record<string, Record<StageName, number>>;
  SYSTEMS: Record<string, { label: string; lines: [string, number][]; line_slots_per_qubit: number; density: number; active: Partial<Record<StageName, number>>; cmos_4k: number }>;
}

export function stageLoads(P: HeatParams, system: string, n: number, cmosW?: number) {
  const s = P.SYSTEMS[system];
  const loads = Object.fromEntries(STAGE_ORDER.map((k) => [k, 0])) as Record<StageName, number>;
  for (const [kind, perQ] of s.lines) for (const st of STAGE_ORDER) loads[st] += (P.WIRING[kind][st] ?? 0) * perQ * n;
  for (const st of STAGE_ORDER) loads[st] += (s.active[st] ?? 0) * n;
  loads['4 K'] += (cmosW ?? s.cmos_4k) * n;
  return loads;
}

export function maxQubits(P: HeatParams, system: string, opts: { cmosW?: number; extra4K?: number; margin?: number; density?: number } = {}) {
  const s = P.SYSTEMS[system];
  const per = stageLoads(P, system, 1, opts.cmosW);
  const margin = opts.margin ?? P.MARGIN;
  const lim: Record<string, number> = {};
  for (const st of STAGE_ORDER) {
    const cap = (P.CAPACITY[st] + (st === '4 K' ? opts.extra4K ?? 0 : 0)) * margin;
    lim[st] = per[st] > 0 ? Math.floor(cap / per[st]) : 1e9;
  }
  lim['Line count'] = Math.floor((P.LINE_CAPACITY * (opts.density ?? s.density)) / s.line_slots_per_qubit);
  const limiting = Object.keys(lim).reduce((a, b) => (lim[a] <= lim[b] ? a : b));
  return { limits: lim, max: lim[limiting], limiting, perQubit: per };
}

export const burstMTBF = (nDies: number, areaCm2: number, flux: number, pFail: number, rateFactor = 1) => {
  const r = flux * areaCm2 * nDies * rateFactor * pFail;
  return r === 0 ? Infinity : 1 / r;
};

export function fmtTime(s: number) {
  if (!isFinite(s)) return '∞';
  if (s < 1) return `${(s * 1e3).toPrecision(3)} ms`;
  if (s < 120) return `${s.toPrecision(3)} s`;
  if (s < 7200) return `${(s / 60).toPrecision(3)} min`;
  if (s < 172800) return `${(s / 3600).toPrecision(3)} h`;
  if (s < 3.15e7 * 2) return `${(s / 86400).toPrecision(3)} days`;
  return `${(s / 3.15e7).toPrecision(3)} years`;
}
