import { Badge, PageHead, Panel } from '../components/ui';

const PHASES = [
  { n: 'Phase 0', t: 'Research platform', s: 'ok' as const, l: 'Complete', items: ['Graded literature review (Majorana 2, Nighthawk r2, 5 other platforms)', 'Validated simulators (110 + 23 tests), experiment suite, digital twin, Blender assets', 'Pre-registered hypotheses, including negative results'], gate: 'Published and reproducible from source.' },
  { n: 'Phase 1', t: 'Materials and junction uniformity', s: 'prop' as const, l: 'Requires a fab', items: ['Ta-on-Si transmon test chips; T1/T2 distributions over many devices', 'Junction-resistance spread and post-fab trimming to σ ≤ 8 MHz', 'Dissipative-reset test structures: on/off ratio, residual excited population, e–f leakage removal'], gate: 'Median T1 ≥ 300 µs on ≥ 50 devices; reset to < 10⁻³ in ≤ 200 ns with idle-loss penalty < 5 %.' },
  { n: 'Phase 2', t: 'Single T1 tile prototype', s: 'prop' as const, l: 'Requires a fab + cryostat', items: ['120-qubit tile with flip-chip interposer and 120 reset elements', 'Calibration-aware compiler in the loop (noise-aware placement)', 'Throughput characterisation vs circuit length (tests the throughput model)'], gate: 'Median CZ error ≤ 2 × 10⁻³, readout ≤ 1 %, ≥ 90 % of qubits operable.' },
  { n: 'Phase 3', t: 'QEC memory demonstration', s: 'prop' as const, l: 'Requires Phase 2', items: ['Distance-3/5/7 surface-code memory with reset-overlapped schedule', 'FPGA real-time decoding within the cycle budget', 'Measured Λ and per-round error vs the simulated prediction'], gate: 'Λ ≥ 2 and agreement with simulation within the stated model error.' },
  { n: 'Phase 4', t: 'Modular tiles', s: 'prop' as const, l: 'Research track', items: ['Inter-tile couplers and lattice surgery across modules', 'Wiring: flex density, heat load per line measured per stage'], gate: 'Logical CNOT between tiles with error below single-tile memory error × 2.' },
  { n: 'Phase 5', t: 'Long-range couplers toward qLDPC', s: 'prop' as const, l: 'Open research', items: ['Degree-6 connectivity experiments for bivariate-bicycle codes', 'Yield and crosstalk cost of long-range couplers (extends our collision model)'], gate: 'Logical memory at ≥ 5× lower qubit overhead than the surface code at equal error.' },
];

export default function Roadmap() {
  return (
    <>
      <PageHead eyebrow="Development roadmap · go/no-go gates" title="From simulation to silicon">
        <p>Only Phase 0 exists today. Everything after it needs fabrication, cryogenic measurement or both. Each phase has an explicit gate, a measurable result that would justify going on or force a redesign.</p>
      </PageHead>
      <div className="wrap stack" style={{ gap: '1rem', paddingBottom: '3rem' }}>
        {PHASES.map((p) => (
          <Panel key={p.n} eyebrow={p.n} title={p.t} right={<Badge g={p.s}>{p.l}</Badge>}>
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem', color: 'var(--fg-2)' }}>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
              <div className="callout info small"><span className="eyebrow">Gate</span><br />{p.gate}</div>
            </div>
          </Panel>
        ))}
        <Panel eyebrow="Open questions this platform cannot settle" title="What remains theoretical">
          <div className="grid-2 small">
            <p><strong>Topological qubits:</strong> whether Majorana 2's zero modes are topological, its X-measurement fidelity, and whether measurement-based Cliffords and two-qubit operations work. These need independent experiments, such as DARPA's on-site evaluation.</p>
            <p><strong>AURORA-Q hardware:</strong> reset-element on/off isolation, interposer bump yield, real crosstalk, TLS defect density on Ta-on-Si at scale, and actual heat load per line. All of these are assumptions in our simulations.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
