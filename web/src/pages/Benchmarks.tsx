import { BarChart, LineChart, type Series } from '../components/charts';
import { Badge, Hypothesis, PageHead, Panel } from '../components/ui';
import { useData } from '../lib/data';

const perRound = (P: number, r: number) => 0.5 * (1 - Math.pow(Math.max(0, 1 - 2 * Math.min(P, 0.4999)), 1 / r));

function Repro({ meta, cmd }: { meta: any; cmd: string }) {
  if (!meta) return null;
  const env = meta.environment ?? {};
  return (
    <details className="small muted">
      <summary style={{ cursor: 'pointer' }}>Reproducibility · generated {meta.generated_utc}</summary>
      <div className="stack" style={{ gap: '0.3rem', marginTop: '0.4rem' }}>
        <span>Command: <code>{cmd}</code></span>
        <span>Seeds: <code>{JSON.stringify(meta.seeds)}</code></span>
        <span>Parameters: <code>{JSON.stringify(meta.params)}</code></span>
        <span>Environment: <code>{Object.entries(env).map(([k, v]) => `${k} ${v}`).join(' · ')}</code></span>
        <span>{meta.nature_of_results}</span>
      </div>
    </details>
  );
}

function qecSeries(rows: any[], key = 'p', ds = [3, 5, 7]): Series[] {
  return ds.map((d) => ({
    name: `d = ${d}`,
    points: rows.filter((r) => r.d === d && r.rate > 0).map((r) => ({ x: r[key], y: r.per_round, lo: perRound(r.lo, r.rounds ?? d), hi: perRound(r.hi, r.rounds ?? d) })),
  }));
}

export default function Benchmarks() {
  const eng = useData<any>('engine_connectivity').data;
  const qec = useData<any>('qec').data;
  const rst = useData<any>('reset').data;
  const mit = useData<any>('mitigation').data;
  const chem = useData<any>('chemistry').data;
  const sc = useData<any>('scalability').data;
  const DESIGNS: [string, string][] = [['heron_heavy_hex', 'Heavy-hex'], ['square', 'Square (T1)'], ['aurora_K12', '+12 diag'], ['aurora_K24', '+24 diag'], ['aurora_K48', '+48 diag'], ['checkerboard_99', 'Checkerboard']];
  return (
    <>
      <PageHead eyebrow="Benchmarks · reproducible, with confidence intervals and negative results" title="Experimental results">
        <p>Every chart reads the JSON written by <code>python -m aurora.run_all</code>. Intervals are 95 % (Student-t for means over seeds, Wilson for error rates). Hover any chart for exact values or open its table view.</p>
      </PageHead>
      <div className="wrap stack" style={{ gap: '1.5rem', paddingBottom: '3rem' }}>
        {eng && (
          <Panel eyebrow="Experiment B · connectivity (AURORA Research Engine)" title="Do diagonal couplers pay for themselves?">
            <div className="stack">
              <Hypothesis id="H-CONN" grade="neg" statement="Adding ≤ 11 % diagonal couplers to the 10 × 12 square lattice cuts the routed CZ count of held-out circuits by ≥ 10 %." verdict={`${eng.verdict}. Best ≤ 11 % design: ${(100 * (1 - eng.aggregate.aurora_K24.geomean_ratio_vs_square)).toFixed(1)} % fewer CZ gates; the dense checkerboard (+45 % couplers) reaches ${(100 * (1 - eng.aggregate.checkerboard_99.geomean_ratio_vs_square)).toFixed(1)} %.`} />
              <div className="grid-2" style={{ alignItems: 'start' }}>
                <BarChart yLabel="routed CZ / square (mean ratio)" height={250} yDomain={[0, 2.1]} refY={{ y: 0.9, label: 'H-CONN target' }}
                  groups={DESIGNS.map(([k, l]) => ({ label: l, values: [{ name: 'CZ ratio (mean, 95 % CI over 12 circuits)', v: eng.aggregate[k].ratio_ci.mean, lo: eng.aggregate[k].ratio_ci.lo, hi: eng.aggregate[k].ratio_ci.hi }] }))}
                  caption="Held-out suite: QAOA (40/64/96 nodes), quantum volume (16/20), QFT (20/32), sparse random (64/100), Bernstein–Vazirani (60), GHZ-100, 2D Ising 10 × 10. Qiskit preset level 2, 5 transpiler seeds." />
                <LineChart xLabel="fabrication frequency spread σ (MHz)" yLabel="collision-free yield" height={250} yDomain={[0, 1.02]}
                  series={DESIGNS.map(([k, l]) => ({ name: l, points: Object.entries(eng.collision_yield[k]).map(([s, v]) => ({ x: +s, y: v as number })) }))}
                  caption="Illustrative frequency-collision model (after Hertzberg et al. 2021): higher degree means more colours, tighter spacing and more spectator pairs." />
              </div>
              <div className="table-wrap"><table>
                <thead><tr><th>Diagonals K</th><th className="num">Couplers +%</th><th className="num">Train: optimised</th><th className="num">Train: random placement</th><th className="num">Held-out</th></tr></thead>
                <tbody>{eng.search.map((s: any) => (
                  <tr key={s.K}><td>{s.K}</td><td className="num">{s.coupler_increase_pct.toFixed(1)}</td><td className="num">{s.train_ratio_optimised.toFixed(3)}</td><td className="num">{s.train_ratio_random.mean.toFixed(3)} ± {(s.train_ratio_random.hi - s.train_ratio_random.mean).toFixed(3)}</td><td className="num">{eng.aggregate[`aurora_K${s.K}`].geomean_ratio_vs_square.toFixed(3)}</td></tr>
                ))}</tbody></table></div>
              <p className="small muted">The evolutionary search beats random placement on its training circuits, but most of that advantage disappears on held-out circuits, a generalisation gap that argues against workload-specific hardware connectivity. Decision rule (yield ÷ CZ ratio at σ = 8 MHz) selects: <strong>{eng.decision.winner}</strong>.</p>
              <Hypothesis id="H-LAYOUT" grade="sim" statement="Noise-aware placement (calibration-weighted layout) raises the estimated success probability (ESP) on the same device." verdict="Supported on synthetic log-normal error maps: ESP improved in 100 % of 20 devices for every circuit." />
              <BarChart yLabel="estimated success probability" height={240} yDomain={[0, 1]}
                groups={eng.noise_aware_layout.summary.map((s: any) => ({ label: s.circuit.replace(/_s\d+$/, ''), values: [
                  { name: 'default layout', v: s.esp_default.mean, lo: s.esp_default.lo, hi: s.esp_default.hi },
                  { name: 'noise-aware layout', v: s.esp_noise_aware.mean, lo: s.esp_noise_aware.lo, hi: s.esp_noise_aware.hi }] }))}
                caption={eng.noise_aware_layout.error_map} />
              <Repro meta={eng.meta} cmd="python -m aurora.run_all --only engine" />
            </div>
          </Panel>
        )}

        {qec && (
          <Panel eyebrow="Experiment D · quantum error correction (Stim + PyMatching)" title="Surface-code memory, reset and cycle time">
            <div className="stack">
              <div className="grid-2" style={{ alignItems: 'start' }}>
                <LineChart xLabel="physical error p (uniform circuit noise)" yLabel="logical error per round" logY height={260} series={qecSeries(qec.threshold.circuit_level)}
                  vLines={qec.threshold.estimated_threshold.circuit_level ? [{ x: qec.threshold.estimated_threshold.circuit_level, label: 'crossing' }] : []}
                  caption={`Pipeline validation. Crossing ≈ ${(100 * qec.threshold.estimated_threshold.circuit_level).toFixed(2)} %, in the range typically reported for uniform depolarising circuit noise with MWPM.`} />
                <LineChart xLabel="bit-flip = measurement-flip probability" yLabel="logical error per round" logY height={260}
                  series={[...qecSeries(qec.threshold.phenomenological), ...qecSeries(qec.phenomenological_large_d.rows, 'p', [11, 15]).map((s) => ({ ...s, dash: true }))]}
                  caption="Phenomenological noise: the crossing drifts downward with distance (finite-size effect) toward the asymptotic ≈2.9 % MWPM value." />
              </div>
              <Hypothesis id="H-RESET" grade="sim" statement="A dedicated, fast, low-error reset element lowers the logical error per QEC round." verdict="Supported: 4.5× lower per-round error at d = 7 under Heron-class noise, with a 1.85× shorter cycle." />
              <div className="grid-2" style={{ alignItems: 'start' }}>
                <LineChart xLabel="reset (initialisation) error" yLabel="logical error per round" logX logY height={260}
                  series={[3, 5, 7].map((d) => ({ name: `d = ${d}`, points: qec.reset_sensitivity.rows.filter((r: any) => r.d === d).map((r: any) => ({ x: r.p_reset, y: r.per_round, lo: perRound(r.lo, d), hi: perRound(r.hi, d) })) }))}
                  vLines={[{ x: 4e-4, label: 'dissipative' }, { x: 1e-2, label: 'readout-limited' }]}
                  caption="Other noise fixed (p₁ 2.5e-4, p₂ 1.5e-3, idle 1e-3, measurement 5e-3)." />
                <BarChart yLabel="logical error per round (d = 7)" logY height={260}
                  groups={['heron_class', 'aurora_q_target'].map((dev) => ({ label: dev === 'heron_class' ? 'Heron-class noise' : 'AURORA target noise', values: ['conditional_reset', 'dissipative_reset', 'aurora_overlapped'].map((s) => {
                    const r = qec.time_study.rows.find((x: any) => x.device === dev && x.strategy === s && x.d === 7);
                    return { name: qec.time_study.strategies[s].label, v: r.per_round, lo: perRound(r.lo, 7), hi: perRound(r.hi, 7) };
                  }) }))}
                  caption="Cycle times: conditional 2.83 µs, dissipative 1.53 µs, overlapped 1.33 µs (assumed gate and measurement durations)." />
              </div>
              <Hypothesis id="M1" grade="model" statement="At Majorana 2's reported τ_Z = 22 s, quasiparticle poisoning no longer limits a tetron-based code; measurement fidelity does." verdict="Poisoning flip probability per 10 µs cycle: 4.5 × 10⁻⁷ (Pb) vs 8.1 × 10⁻⁴ (Al). In the measurement-dominated model the threshold sits near 5 %; the reported Al X-loop error (16 %) is well above it, and no Pb X-loop error has been reported." />
              <LineChart xLabel="per-measurement error q (data error = q)" yLabel="logical error per round" logX logY height={260}
                series={qecSeries(qec.majorana.measurement_sweep, 'q')}
                vLines={[{ x: 0.005, label: 'Z loop 0.5 %' }, { x: 0.16, label: 'X loop 16 %' }]}
                caption="Crude phenomenological stand-in for measurement-based tetron codes (see report §12.4). Reported values from arXiv:2507.08795 (InAs–Al)." />
              <Repro meta={qec.meta} cmd="python -m aurora.run_all --only qec" />
            </div>
          </Panel>
        )}

        {rst && (
          <Panel eyebrow="Experiment C · reset optimisation" title="Throughput, reset physics and dynamic circuits">
            <div className="stack">
              <div className="grid-2" style={{ alignItems: 'start' }}>
                <LineChart xLabel="circuit duration (µs)" yLabel="circuits per second" logX logY height={260}
                  series={Object.entries(rst.throughput.strategies).map(([k, v]: [string, any]) => ({ name: v.label.split('(')[0].trim(), points: rst.throughput.rows.filter((r: any) => r.strategy === k).map((r: any) => ({ x: r.t_circuit_us, y: r.circuits_per_s })) }))}
                  hLines={[{ y: 4000, label: 'Heron ≈ 4,000/s (reported)' }, { y: 100000, label: 'Nighthawk r2 > 100,000/s (reported)' }]}
                  caption={rst.throughput.insight} />
                <LineChart xLabel="time after reset trigger (ns)" yLabel="population" logY height={260} markers={false} yDomain={[1e-8, 1.2]}
                  series={[
                    { name: 'P(e), passive T1', points: rst.physics.t_ns.map((t: number, i: number) => ({ x: t, y: Math.max(1e-8, rst.physics.cases.passive.from_e.Pe[i]) })) },
                    { name: 'P(e), reset element on', points: rst.physics.t_ns.map((t: number, i: number) => ({ x: t, y: Math.max(1e-8, rst.physics.cases.reset_ge.from_e.Pe[i]) })) },
                    { name: 'P(f) leakage, g–e reset only', points: rst.physics.t_ns.map((t: number, i: number) => ({ x: t, y: Math.max(1e-8, rst.physics.cases.reset_ge.from_f.Pf[i]) })) },
                    { name: 'P(f) leakage, + e–f tone', points: rst.physics.t_ns.map((t: number, i: number) => ({ x: t, y: Math.max(1e-8, rst.physics.cases.reset_ge_plus_ef.from_f.Pf[i]) })) },
                  ]}
                  caption={`QuTiP Lindblad model: effective T1 ${rst.physics.summary.effective_T1_ns.toFixed(1)} ns, 10⁻³ reached after ${rst.physics.summary['t_to_1e-3_from_e_ns']} ns, thermal floor ${rst.physics.summary.thermal_floor_Pe.toExponential(1)}. Illustrative parameters, not IBM's circuit.`} />
              </div>
              <Hypothesis id="H-LEAK" grade="neg" statement="A g–e dissipative reset also clears leakage into |f⟩." verdict={`Rejected: ${(100 * rst.physics.summary.residual_leakage_after_400ns_ge_only).toFixed(0)} % of |f⟩ population remains after 400 ns. An e–f tone reduces it to ${rst.physics.summary.residual_leakage_after_400ns_multilevel.toExponential(1)}. AURORA-Q therefore specifies multi-level reset.`} />
              <LineChart xLabel="reset error" yLabel="shots with ≥ 1 false syndrome" logX height={230}
                series={[{ name: 'false-syndrome rate', points: rst.ancilla_reuse.rows.map((r: any) => ({ x: r.reset_error, y: r.rate, lo: r.lo, hi: r.hi })) }]}
                caption={`Aer, 3-qubit repetition code, one ancilla reused with reset over ${rst.ancilla_reuse.rounds} rounds; 0.1 % CX depolarisation. ${rst.ancilla_reuse.description}`} />
              <Repro meta={rst.meta} cmd="python -m aurora.run_all --only reset" />
            </div>
          </Panel>
        )}

        {mit && (
          <Panel eyebrow="Experiment A · noise reduction" title="Readout mitigation and zero-noise extrapolation">
            <div className="stack">
              <Hypothesis id="H-ZNE" grade="sim" statement="ZNE with readout mitigation reduces the bias of a magnetisation estimate under realistic noise." verdict="Conditionally supported: ≈10× lower error for 10–30 CZ circuits, at the cost of ≈3× larger estimator spread. At 60 CZ the benefit is within noise." />
              <div className="grid-2" style={{ alignItems: 'start' }}>
                <LineChart xLabel="Trotter steps (10 CZ per step)" yLabel="|estimate − exact|" height={250}
                  series={(['raw', 'rem', 'zne', 'zne_rem'] as const).map((k) => ({ name: { raw: 'raw', rem: 'readout mitigated', zne: 'ZNE', zne_rem: 'ZNE + readout' }[k], points: mit.rows.map((r: any) => ({ x: r.steps, y: r[k].abs_error.mean, lo: Math.max(0, r[k].abs_error.lo), hi: r[k].abs_error.hi })) }))}
                  caption="6-qubit transverse-field Ising, 12 repetitions × 8,000 shots, p₂ = 1 %, readout 2 %." />
                <LineChart xLabel="Trotter steps" yLabel="estimator std. deviation" height={250}
                  series={(['raw', 'zne_rem'] as const).map((k) => ({ name: k === 'raw' ? 'raw' : 'ZNE + readout', points: mit.rows.map((r: any) => ({ x: r.steps, y: r[k].std })) }))}
                  caption="The price of extrapolation: variance amplification." />
              </div>
              <Repro meta={mit.meta} cmd="python -m aurora.run_all --only mitigation" />
            </div>
          </Panel>
        )}

        {chem && sc && (
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Panel eyebrow="Experiment E · scientific AI workload" title="H₂ VQE under gate noise" right={<Badge g="sim" />}>
              <LineChart xLabel="two-qubit depolarising p₂" yLabel="energy error (mHa)" logX logY height={240}
                series={[{ name: 'HEA energy error', points: chem.noise.filter((n: any) => n.p2 > 0).map((n: any) => ({ x: n.p2, y: n.error * 1000 })) }]}
                hLines={[{ y: 1.6, label: 'chemical accuracy' }]}
                caption={`Jordan–Wigner Hamiltonian equals FCI at all ${chem.rows.length} geometries: ${chem.all_jw_match_fci ? 'yes' : 'no'}.`} />
              <Repro meta={chem.meta} cmd="python -m aurora.run_all --only chemistry" />
            </Panel>
            <Panel eyebrow="Experiment F · scalability" title="Resources for 100 logical qubits" right={<Badge g="model" />}>
              <div className="table-wrap"><table>
                <thead><tr><th>Target ε per op</th><th className="num">d</th><th className="num">Physical (surface)</th><th className="num">T1 tiles</th><th className="num">Gross-code memory</th></tr></thead>
                <tbody>{sc.rows.filter((r: any) => r.logical_qubits === 100).map((r: any) => (
                  <tr key={r.target_eps_per_op}><td className="mono">{r.target_eps_per_op.toExponential(0)}</td><td className="num">{r.d}</td><td className="num">{r.total_physical_surface.toLocaleString()}</td><td className="num">{r.tiles_surface.toLocaleString()}</td><td className="num">{r.gross_code_physical.toLocaleString()}</td></tr>
                ))}</tbody></table></div>
              <p className="small muted" style={{ marginTop: '0.6rem' }}>Λ = {sc.fit.Lambda.toFixed(1)} fitted to {sc.fit.source}. {sc.gross_code_reference}</p>
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
