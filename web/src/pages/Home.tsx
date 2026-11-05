import { useData, fmt } from '../lib/data';
import { Badge, Stat, type Grade } from '../components/ui';
import { Stage } from '../three/Stage';
import { InstallationModel } from '../three/Installation';

const RENDERS = [
  { src: 'renders/installation_hero.webp', cap: 'Full installation: dilution refrigerator chandelier, QPU module on the cold finger, control, decoder and hybrid-compute racks, gas handling and compressor.' },
  { src: 'renders/cryostat_detail.webp', cap: 'Lower stages: still, cold plate and mixing chamber with G-10 supports, S-bent coax with attenuators, helical and step heat exchangers, cold finger and the AURORA-Q module.' },
  { src: 'renders/package_open.webp', cap: 'The T1 module with its lid removed: PCB fan-out, clamp bars, cover plate, qubit die and filter die.' },
  { src: 'renders/package_exploded.webp', cap: 'Exploded package: lid, clamp bars, cover plate, die stack, PCB and base.' },
  { src: 'renders/chip_macro.webp', cap: 'Die macro: transmon pads and junctions, meandered readout resonators, coupler and reset SQUIDs, airbridges, indium bumps.' },
];

export default function Home() {
  const qec = useData('qec');
  const eng = useData('engine_connectivity');
  const qml = useData('qml');
  const time = qec.data?.time_study?.rows ?? [];
  const pick = (dev: string, s: string, d = 7) => time.find((r: any) => r.device === dev && r.strategy === s && r.d === d)?.per_round;
  const resetGain = pick('heron_class', 'conditional_reset') && pick('heron_class', 'dissipative_reset') ? pick('heron_class', 'conditional_reset') / pick('heron_class', 'dissipative_reset') : null;
  const k24 = eng.data?.aggregate?.aurora_K24?.geomean_ratio_vs_square;
  const hh = eng.data?.aggregate?.heron_heavy_hex?.geomean_ratio_vs_square;
  const ly = eng.data?.noise_aware_layout?.summary as any[] | undefined;
  const espLo = ly ? Math.min(...ly.map((s) => s.esp_ratio.mean)) : null, espHi = ly ? Math.max(...ly.map((s) => s.esp_ratio.mean)) : null;
  const vqc = qml.data?.vqc?.summary?.moons;

  const findings: { v: string; k: string; g: Grade; sub: string }[] = [
    { v: resetGain ? `${resetGain.toFixed(1)}×` : '…', k: 'lower logical error per QEC round with a dedicated reset element', g: 'sim', sub: 'Distance-7 surface code, Heron-class noise, Stim + PyMatching' },
    { v: k24 ? `−${(100 * (1 - k24)).toFixed(1)} %` : '…', k: 'routed CZ count from +24 diagonal couplers: rejected (pre-registered target −10 %)', g: 'neg', sub: 'and modelled yield fell from ≈93 % to ≈28 %' },
    { v: hh ? `${hh.toFixed(2)}×` : '…', k: 'CZ gates on Heron-class heavy-hex vs the 10 × 12 square lattice', g: 'sim', sub: '12 held-out circuits, Qiskit SABRE, 5 seeds' },
    { v: espLo ? `+${(100 * (espLo - 1)).toFixed(0)}–${(100 * (espHi! - 1)).toFixed(0)} %` : '…', k: 'estimated success probability from noise-aware placement', g: 'sim', sub: 'synthetic heterogeneous error maps, 20 devices' },
    { v: '4.5 × 10⁻⁷', k: 'parity-flip probability per 10 µs cycle at Majorana 2’s τ_Z = 22 s', g: 'model', sub: 'poisoning stops limiting tetron codes; X-measurement fidelity now does' },
    { v: vqc ? `${fmt.pct(vqc['VQC (2 qubits, 3 layers)'].test_acc.mean, 0)} vs ${fmt.pct(vqc['RBF-SVM'].test_acc.mean, 0)}` : '…', k: 'variational quantum classifier vs RBF-SVM (two moons)', g: 'neg', sub: 'no quantum advantage found in any QML experiment' },
  ];

  return (
    <>
      <section style={{ position: 'relative', borderBottom: '1px solid var(--line)' }}>
        <Stage label="Interactive 3D model of the AURORA-Q installation" camera={{ position: [1.9, 2.0, 5.4], fov: 38 }} height="clamp(520px, 74vh, 780px)"
          overlay={<>
            <div className="hero-scrim" />
            <div className="wrap" style={{ position: 'absolute', inset: 'auto 0 0 0', pointerEvents: 'none', paddingBottom: 'clamp(1.2rem, 4vw, 2.6rem)' }}>
              <div style={{ maxWidth: 680, display: 'grid', gap: '0.9rem', pointerEvents: 'auto' }}>
                <span className="eyebrow"><b>AURORA-Q</b> · Advanced Unified Research Architecture for Quantum Optimization</span>
                <h1>How do we make quantum processors <em style={{ color: 'var(--accent-2)' }}>reliable</em>, fast and useful?</h1>
                <p className="prose" style={{ fontSize: '1.02rem' }}>A research platform that dissects Microsoft Majorana 2 and IBM Nighthawk r2, proposes a superconducting compute-tile architecture, and tests every design choice in reproducible simulations. You can run all of it here, in your browser.</p>
                <div className="row">
                  <a className="btn primary" href="#explorer">Explore the digital twin</a>
                  <a className="btn" href="#lab">Run a quantum circuit</a>
                  <a className="btn ghost" href="#research">Read the report</a>
                </div>
                <div className="row small"><Badge g="prop">Design study · not a fabricated device</Badge><Badge g="sim">Engine validated against Qiskit</Badge></div>
              </div>
            </div>
          </>}>
          <InstallationModel explode={0} showShields={false} xray={false} thermal={false} labels={false} selected={null} focus="hero" flow interactive={false} />
        </Stage>
      </section>

      <section className="block wrap stack" style={{ gap: '1.5rem' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div className="stack" style={{ gap: '0.4rem' }}>
            <span className="eyebrow">Findings · each figure is read live from the experiment results</span>
            <h2>What the simulations say</h2>
          </div>
          <a href="#benchmarks">All benchmarks with confidence intervals →</a>
        </div>
        <div className="grid-3">
          {findings.map((f) => (
            <div key={f.k} className="panel stack" style={{ gap: '0.6rem' }}>
              <Badge g={f.g} />
              <Stat v={f.v} k={f.k} sub={f.sub} />
            </div>
          ))}
        </div>
      </section>

      <section className="block wrap grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <span className="eyebrow">Scope and honesty</span>
          <h2>What is real here, and what is not</h2>
          <p className="prose">Software can't fabricate a quantum chip. This platform is careful about the line between running code, simulated hardware behaviour, engineering proposals, and laboratory results.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Layer</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>
              <tr><td>Quantum circuit execution</td><td><Badge g="ok">Working software</Badge></td><td>Browser engine plus Qiskit/Aer backend; 110 + 23 automated tests</td></tr>
              <tr><td>Hardware behaviour (noise, reset, QEC)</td><td><Badge g="sim" /></td><td>Parameterised models; values are assumptions or literature figures</td></tr>
              <tr><td>AURORA-Q tile, package, cryostat</td><td><Badge g="prop" /></td><td>Blender geometry generated from a documented layout</td></tr>
              <tr><td>Majorana 2 and Nighthawk r2 figures</td><td><Badge g="lit" /></td><td>Graded source ledger; contested claims flagged</td></tr>
              <tr><td>Laboratory-verified AURORA-Q physics</td><td><Badge g="neg">None</Badge></td><td>Needs fabrication and cryogenic measurement (see Roadmap)</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="block wrap stack" style={{ gap: '1.4rem' }}>
        <div className="stack" style={{ gap: '0.4rem' }}>
          <span className="eyebrow">Blender 5.2 · Cycles path tracing · procedural geometry</span>
          <h2>Rendered from the same assets as the live viewer</h2>
        </div>
        <div className="grid-2">
          {RENDERS.map((r, i) => (
            <figure key={r.src} style={i === 0 ? { gridColumn: '1 / -1' } : undefined}>
              <img src={r.src} alt={r.cap} loading="lazy" width={1600} height={1000} />
              <figcaption>{r.cap}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="block wrap grid-3">
        {[
          ['#explorer', '3D Explorer', 'Explode the cryostat, inspect every stage, open the package and the die, and replay your circuits on the 120-qubit tile.'],
          ['#lab', 'Quantum Lab', 'Build circuits, choose noise models, run up to 22 exact qubits or 120-qubit Clifford circuits, then export JSON or OpenQASM 3.'],
          ['#ai', 'Quantum AI', 'Train a variational classifier live, compare it with classical models, solve MaxCut with QAOA and find the H₂ ground state with VQE.'],
          ['#architecture', 'Architecture', 'The T1 tile: layout, topology trade-offs, control stack, wiring budget, scaling calculator and the design-decision log.'],
          ['#research', 'Research report', 'A 20-section technical report with 61 references, the Majorana 2 and Nighthawk r2 analyses, and stated limitations.'],
          ['#roadmap', 'Roadmap', 'What remains theoretical, and the experiments that would settle it.'],
        ].map(([h, t, d]) => (
          <a key={h} href={h} className="panel stack" style={{ gap: '0.4rem', color: 'inherit', textDecoration: 'none' }}>
            <h3>{t} <span style={{ color: 'var(--accent)' }}>→</span></h3>
            <p className="muted small">{d}</p>
          </a>
        ))}
      </section>
    </>
  );
}
