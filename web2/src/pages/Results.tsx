import { BarChart, LineChart, SERIES, type Series } from '../components/charts';
import { Badge, PageHead, Panel, Stat } from '../components/ui';
import { fmtTime } from '../lib/cryo';
import { fmt, useData } from '../lib/data';

const NAME: Record<string, string> = {
  gross144: 'gross [[144,12,12]]', bb72: 'bb72 [[72,12,6]]', surface_d3: 'surface d=3', surface_d5: 'surface d=5', surface_d7: 'surface d=7', surface_d9: 'surface d=9',
};

export default function Results() {
  const { data: R, error } = useData<any>('q2_resources');
  const { data: L } = useData<any>('q2_layout');
  if (error) return <div className="wrap err" style={{ paddingBlock: '3rem' }}>{error}</div>;
  if (!R) return <div className="wrap" style={{ paddingBlock: '4rem' }}><span className="eyebrow">Loading results…</span></div>;
  const curves = R.memory_curves as Record<string, any[]>;
  const order = ['gross144', 'bb72', 'surface_d3', 'surface_d5', 'surface_d7', 'surface_d9'];
  const memSeries: Series[] = order.filter((c) => curves[c]).map((c, i) => ({
    name: NAME[c], color: SERIES[i], dash: c.startsWith('surface'),
    points: curves[c].filter((x) => x.errors > 0).map((x) => ({ x: x.p, y: x.ler, lo: x.lo, hi: x.hi })),
  }));
  const eq = (R.equal_error as any[]).filter((e) => e.code === 'gross144');
  const eqb = (R.equal_error as any[]).filter((e) => e.code === 'bb72');
  const er = R.erasure_curves as Record<string, any[]>;
  const erKeys = ['gross144|0.0', 'gross144|0.5', 'gross144|0.9', 'gross144|0.975', 'bb72|0.0', 'bb72|0.9', 'bb72|0.975'].filter((k) => er[k]);
  const erSeries: Series[] = erKeys.map((k, i) => {
    const [c, f] = k.split('|');
    return { name: `${c === 'gross144' ? 'gross' : 'bb72'} · ${Math.round(+f * 1000) / 10}% heralded`, color: SERIES[i], dash: c === 'bb72', points: er[k].filter((x) => x.errors > 0).map((x) => ({ x: x.p, y: x.ler, lo: x.lo, hi: x.hi })) };
  });
  const cq = (R.cryo_qec ?? {}) as Record<string, any[]>;
  const cqCodes = ['gross144', 'bb72', 'surface_d7', 'surface_d9'].filter((c) => cq[c]);
  const fridge = R.fridge as Record<string, any>;
  const rad = R.radiation as Record<string, any>;
  const g3 = eq.find((e) => e.p === 0.003);
  return (
    <>
      <PageHead eyebrow={<><b>Results</b> · simulated and modelled</>} title="What the simulations say">
        <p>Every memory experiment uses one circuit generator, one noise model and one decoder for all codes: Stim circuit-level simulation with SD6-style depolarising noise, decoded by BP-OSD (min-sum, OSD-CS order 7). Error bars are Wilson 95 % intervals. A number is <em>measured</em> when it was simulated directly and <em>extrapolated</em> when a fit carries it outside the simulated range.</p>
      </PageHead>
      <div className="wrap stack" style={{ gap: '1.5rem', paddingBottom: '3rem' }}>
        <div className="grid-4">
          {g3 && <Stat v={fmt.sci(g3.ler, 2)} k="gross code: logical error per qubit per round at p = 0.3 %" sub="measured, 6 rounds" />}
          {g3 && <Stat v={`${g3.advantage?.toFixed(0)}×`} k={`fewer physical qubits per logical qubit than surface d=${g3.surface_d_needed} at equal error`} sub="surface fit, p = 0.3 %" />}
          {fridge?.aurora_plus12W && <Stat v={fridge.aurora_plus12W.max_qubits.toLocaleString()} k="qubits per AURORA-CRYO refrigerator (model)" sub={`vs ${fridge.conventional.max_qubits} for coax + RT control`} />}
          {R.dualrail_tolerance?.length > 0 && <Stat v={`${Math.min(...R.dualrail_tolerance.map((t: any) => t.ratio)).toFixed(1)}–${Math.max(...R.dualrail_tolerance.map((t: any) => t.ratio)).toFixed(1)}×`} k="raw error a dual-rail bb72 can afford vs transmon gross (equal transmons)" sub="negative result: modest gain" />}
        </div>

        <Panel eyebrow="R1 · Quantum memory" title="Logical error per logical qubit per round" right={<Badge g="sim" />}>
          <LineChart series={memSeries} xLabel="physical error rate p (all circuit locations)" yLabel="logical error / qubit / round" logX logY markers width={1080} height={420}
            caption="Memory-Z experiments, 6 rounds for bivariate bicycle codes and d rounds for surface codes. Surface-code distance scaling collapses (Λ → 1) for p ≳ 0.5–0.6 %, which marks the threshold of this schedule and decoder. The gross code (24 physical qubits per logical qubit) sits below surface d = 9 (161 per logical qubit) everywhere below threshold." />
        </Panel>

        <div className="grid-2">
          <Panel eyebrow="R2 · Equal-error overhead" title="Surface code needed to match the BB codes" right={<Badge g="sim" />}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Code</th><th className="num">p</th><th className="num">BB error</th><th className="num">surface d</th><th className="num">qubits / logical</th><th className="num">advantage</th><th>basis</th></tr></thead>
                <tbody>{[...eq, ...eqb].map((e) => (
                  <tr key={e.code + e.p}><td>{e.code === 'gross144' ? 'gross' : 'bb72'}</td><td className="num">{e.p}</td><td className="num">{fmt.sci(e.ler, 2)}</td><td className="num">{e.surface_d_needed}</td>
                    <td className="num">{e.q_per_logical_bb} vs {e.q_per_logical_surface}</td><td className="num"><b>{e.advantage?.toFixed(1)}×</b></td><td className="small">{e.kind}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: '0.6rem' }}>Surface distance from a per-p exponential fit of LER vs d (d = 5–9) wherever the surface code is clearly below threshold (Λ ≥ 1.3). Rows marked measured have a simulated surface distance that matches or beats the BB code directly.</p>
          </Panel>
          <Panel eyebrow="R3 · Heralded erasures" title="What heralding is worth" right={<Badge g="sim" />}>
            <LineChart series={erSeries} xLabel="physical error rate p" yLabel="logical error / qubit / round" logX logY markers height={300}
              caption="A fraction f of every CNOT error is replaced by a heralded erasure; the decoder sets those mechanisms to prior 1/2 shot by shot." />
          </Panel>
        </div>

        {R.dualrail_tolerance?.length > 0 && (
          <Panel eyebrow="R3b · Equal-transmon trade study" title="Dual-rail bb72 (288 transmons) vs transmon gross (288 transmons)" right={<Badge g="neg">Negative result</Badge>}>
            <div className="grid-2">
              <div className="table-wrap">
                <table>
                  <thead><tr><th className="num">transmon p</th><th className="num">gross error</th><th className="num">dual-rail p for equal error</th><th className="num">affordable ratio</th><th>basis</th></tr></thead>
                  <tbody>{R.dualrail_tolerance.map((t: any) => <tr key={t.p_transmon}><td className="num">{t.p_transmon}</td><td className="num">{fmt.sci(t.ler, 2)}</td><td className="num">{fmt.sci(t.p_dualrail_equal, 2)}</td><td className="num"><b>{t.ratio.toFixed(2)}×</b></td><td className="small">{t.kind}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="prose small">
                <p>Dual-rail encoding turns most errors into heralded erasures (residual Pauli errors about 40× rarer, as reported by Levine et al.) but uses two transmons per qubit, so at equal transmon count it buys only the smaller bb72 code (d = 6 instead of 12).</p>
                <p>The simulations show this trade is close: a dual-rail machine wins only if its raw two-qubit error stays within about 0.85–1.8× of a plain transmon’s (it loses outright at p = 0.2 %). <strong>Toroid therefore keeps transmons as the baseline</strong> and treats dual-rail as an upgrade path, adopted only if dual-rail CNOTs reach that bar.</p>
              </div>
            </div>
          </Panel>
        )}

        {cqCodes.length > 0 && (
          <Panel eyebrow="R4 · Cooling → logical error" title="Noise budgets from the cryo model, run through the same QEC simulator" right={<Badge g="sim" />}>
            <BarChart logY width={1080} height={320} yLabel="logical error / qubit / round" groups={cqCodes.map((c) => ({
              label: NAME[c] ?? c,
              values: [
                ...cq[c].filter((x: any) => x.label === 'conventional').map((x: any) => ({ name: 'Conventional cryo', v: Math.max(x.ler, 1e-9), lo: x.lo, hi: x.hi })),
                ...cq[c].filter((x: any) => x.label === 'aurora_x1.0').map((x: any) => ({ name: 'AURORA-CRYO', v: Math.max(x.errors > 0 ? x.ler : (x.extrapolated ?? x.hi), 1e-9), lo: x.errors > 0 ? x.lo : undefined, hi: x.errors > 0 ? x.hi : undefined })),
              ],
            }))} caption="Both budgets come from the same coherence model (Cooling Lab, section 2). The gross code under AURORA-CRYO had only 4 failures; the table also gives a fit from runs with the whole budget scaled ×2 and ×3." />
            <div className="table-wrap" style={{ marginTop: '0.8rem' }}>
              <table>
                <thead><tr><th>Code</th><th>Budget</th><th className="num">shots</th><th className="num">failures</th><th className="num">error / qubit / round</th></tr></thead>
                <tbody>{cqCodes.flatMap((c) => cq[c].map((x: any) => (
                  <tr key={c + x.label}><td>{NAME[c] ?? c}</td><td className="mono small">{x.label}</td><td className="num">{x.shots}</td><td className="num">{x.errors}</td>
                    <td className="num">{x.errors > 0 ? fmt.sci(x.ler, 2) : `< ${fmt.sci(x.hi, 1)}`}{x.extrapolated ? ` · fit ${fmt.sci(x.extrapolated, 1)}` : ''}</td></tr>
                )))}</tbody>
              </table>
            </div>
          </Panel>
        )}

        <div className="grid-2">
          <Panel eyebrow="R5 · Refrigerator capacity" title="Qubits and logical memory per refrigerator" right={<Badge g="model" />}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Wiring architecture</th><th className="num">qubits</th><th>limit</th><th className="num">modules</th><th className="num">logical (memory)</th></tr></thead>
                <tbody>{[['conventional', 'Coax + room-temperature control'], ['flex', 'Flex + room-temperature control'], ['aurora', 'AURORA-CRYO (6 W at 4 K)'], ['aurora_plus12W', 'AURORA-CRYO + 12 W dedicated 4 K']].map(([k, l]) => fridge[k] && (
                  <tr key={k}><td>{l}</td><td className="num">{fridge[k].max_qubits.toLocaleString()}</td><td>{fridge[k].limiting}</td><td className="num">{fridge[k].modules}</td><td className="num">{fridge[k].logical_memory}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: '0.6rem' }}>The 4 K stage limits every architecture. AURORA-CRYO gains by moving control to 4 K at 1 mW/qubit, carrying drive on fibre and adding dedicated 4 K cooling. At the measured 23 mW/qubit (14 nm FinFET) it would hold only ≈ 130 qubits. Try it in the Cooling Lab.</p>
          </Panel>
          <Panel eyebrow="R6 · Radiation" title="Mean time between radiation-induced logical failures (20 dies)" right={<Badge g="model" />}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Scenario</th><th className="num">MTBF</th></tr></thead>
                <tbody>{Object.entries(rad).map(([k, v]: any) => <tr key={k}><td>{v.label}</td><td className="num">{fmtTime(v.mtbf_s_20dies)}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: '0.6rem' }}>Assumes 0.1 impacts per cm² per second and {R.radiation_params?.die_area_cm2?.toFixed(2)} cm² dies. Without mitigation, a 20-die machine loses a logical qubit every fraction of a second. This is the largest open risk in the design, and it is set by p_fail per impact, which no experiment has yet bounded at the 10⁻³ level.</p>
          </Panel>
        </div>

        {L && (
          <Panel eyebrow="R7 · Physical layout" title="Toroid embedding of the gross code" right={<Badge g="sim" />}>
            <div className="grid-2">
              <div className="grid-2">
                <Stat v={`${L.summary.couplers_die}`} k="nearest-neighbour couplers on the die (0 crossings)" />
                <Stat v={`${L.summary.couplers_interposer}`} k="couplers in the interposer (288 long-range + 36 wrap)" />
                <Stat v={`${L.summary.manhattan.max_tracks_V}`} k="max tracks per routing channel (2 layers, Manhattan)" />
                <Stat v={`${L.summary.interposer_layers_straight}`} k="layers straight-line routing would need (rejected)" />
                <Stat v={`${L.summary.long_len_mm.median.toFixed(2)} mm`} k="median long-range coupler length" sub={`max ${L.summary.long_len_mm.max.toFixed(1)} mm (wrap edges)`} />
                <Stat v={`${L.summary.die_mm[0].toFixed(1)} × ${L.summary.die_mm[1].toFixed(1)} mm`} k="die size at 0.8 mm pitch" />
              </div>
              <BarChart yLabel="couplers" height={260} groups={L.summary.interposer_length_hist.counts.map((c: number, i: number) => ({ label: `${L.summary.interposer_length_hist.edges_mm[i].toFixed(1)}`, values: [{ name: 'interposer couplers', v: c }] })).filter((g: any) => g.values[0].v > 0)}
                caption="Interposer coupler lengths (mm, bin start). Long couplers are about 5.4 mm, close to a quarter wavelength at 5 GHz on silicon, so they are designed as tunable transmission-line couplers." />
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
