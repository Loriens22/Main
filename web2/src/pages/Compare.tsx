import { Badge, PageHead, Panel, type Grade } from '../components/ui';
import { fmt, useData } from '../lib/data';

interface Row { p: string; mod: string; scale: string; qec: string; overhead: string; src: string; g: Grade }

const ROWS: Row[] = [
  { p: 'Google Willow', mod: 'Superconducting transmons, surface code', scale: '105 qubits', qec: 'd = 7 memory below threshold: 0.143 % ± 0.003 % logical error per cycle, Λ ≈ 2.14, 1.1 µs cycle, real-time decoding', overhead: '101 physical / 1 logical (d = 7)', src: 'Nature 638, 920 (2025)', g: 'lit' },
  { p: 'IBM Nighthawk / Loon', mod: 'Superconducting, square lattice; qLDPC test chip', scale: '120 qubits, 218 tunable couplers; Loon: c-couplers on multiple routing layers', qec: 'Loon demonstrates qLDPC building blocks; real-time qLDPC decoding < 480 ns', overhead: 'Starling target (2029): 200 logical, 10⁸ ops, ≈ 10,000 physical (company)', src: 'IBM newsroom, Nov 2025; roadmap Jun 2025', g: 'lit' },
  { p: 'Quantinuum Helios', mod: 'Trapped ions (¹³⁷Ba⁺), QCCD', scale: '98 qubits', qec: '2Q fidelity 99.921 %, 1Q 99.9975 %; 48 error-corrected / 94 error-detected logical qubits', overhead: '≈ 2 physical / logical (small high-rate codes, different regime)', src: 'Quantinuum, Nov 2025', g: 'lit' },
  { p: 'Harvard / MIT / QuEra', mod: 'Neutral atoms, reconfigurable', scale: 'up to 448 atoms; > 3,000 atoms continuous operation for > 2 h', qec: '2.14× below-threshold error suppression in a universal fault-tolerant architecture', overhead: 'surface/colour codes with transversal gates', src: 'Nature (2025), doi:10.1038/s41586-025-09848-5', g: 'lit' },
  { p: 'AWS Ocelot', mod: 'Bosonic cat qubits + transmon ancillas', scale: '5 cat + 4 transmon qubits', qec: 'Distance-5 repetition code over bit-flip-protected cats: 1.65 % per cycle (d = 5) vs 1.75 % (d = 3)', overhead: 'claimed up to 90 % QEC overhead reduction (company)', src: 'Nature (2025); Amazon Science', g: 'lit' },
  { p: 'Microsoft Majorana 2', mod: 'Topological (InAs–Pb tetron)', scale: 'single tetron device', qec: 'Z-parity lifetime ≈ 20 s (τ_Z = 22 ± 1 s); X measurements not yet shown; Majorana interpretation contested', overhead: 'not yet applicable', src: 'arXiv:2606.03884', g: 'cont' },
  { p: 'PsiQuantum Omega', mod: 'Photonic (fusion-based)', scale: 'chipset', qec: '99.98 % SPAM, 99.22 % fusion fidelity, 99.72 % chip-to-chip', overhead: 'fusion-based codes', src: 'psiquantum.com/omega', g: 'lit' },
];

export default function Compare() {
  const { data: R } = useData<any>('q2_resources');
  const g3 = R?.equal_error?.find((e: any) => e.code === 'gross144' && e.p === 0.003);
  const g2 = R?.memory_curves?.gross144?.find((x: any) => x.p === 0.002);
  const fr = R?.fridge?.aurora_plus12W;
  const cq = R?.cryo_qec?.gross144?.find((x: any) => x.label === 'aurora_x1.0');
  const auroraLER = cq ? (cq.errors > 0 ? cq.ler : cq.extrapolated) : null;
  return (
    <>
      <PageHead eyebrow={<><b>Comparison</b> · reported vs projected</>} title="How AURORA-Q2 compares with today’s machines">
        <p>Other platforms report <strong>measured hardware results</strong>. AURORA-Q2 reports <strong>simulated and modelled projections</strong> of a design that has not been built. The table keeps the two apart, and the honest comparison is with design targets such as IBM’s Starling, not with measured chips.</p>
      </PageHead>
      <div className="wrap stack" style={{ gap: '1.5rem', paddingBottom: '3rem' }}>
        <Panel eyebrow="Platforms" title="Reported results (latest verified sources)">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Platform</th><th>Modality</th><th>Scale</th><th>Error correction</th><th>Overhead</th><th>Source</th><th>Grade</th></tr></thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.p}><td style={{ color: 'var(--fg)', whiteSpace: 'nowrap' }}>{r.p}</td><td className="small">{r.mod}</td><td className="small">{r.scale}</td><td className="small">{r.qec}</td><td className="small">{r.overhead}</td><td className="small muted">{r.src}</td><td><Badge g={r.g} /></td></tr>
                ))}
                <tr className="row-hi">
                  <td style={{ color: 'var(--fg)', whiteSpace: 'nowrap' }}><b>AURORA-Q2</b> (this work)</td>
                  <td className="small">Superconducting transmons, gross qLDPC code, Toroid two-tier stack, AURORA-CRYO</td>
                  <td className="small">288 qubits per module; {fr ? fr.max_qubits.toLocaleString() : '≈ 5,900'} qubits per refrigerator (model), 20 module positions</td>
                  <td className="small">Simulated memory: {g3 ? fmt.sci(g3.ler, 2) : '…'} per logical qubit per round at p = 0.3 %{g2 && g2.errors > 0 ? `, ${fmt.sci(g2.ler, 2)} at p = 0.2 %` : ''}{auroraLER ? `; ${fmt.sci(auroraLER, 1)} under the AURORA-CRYO noise budget` : ''}</td>
                  <td className="small">24 physical / logical (memory); {g3 ? `${g3.advantage.toFixed(0)}× fewer than surface at equal error` : ''}</td>
                  <td className="small muted">this study (simulation + model)</td>
                  <td><Badge g="sim" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="grid-2">
          <Panel eyebrow="Like for like" title="Physical qubits per logical memory qubit">
            <div className="bars">
              {[
                { k: 'Willow surface d = 7 (measured)', v: 101, g: 'lit' as Grade },
                { k: 'Surface code at gross-equal error, p = 0.3 % (simulated)', v: g3?.q_per_logical_surface ?? 337, g: 'sim' as Grade },
                { k: 'IBM Starling target, system-level (company)', v: 50, g: 'lit' as Grade },
                { k: 'AURORA-Q2 system, 5,760 qubits / 192 logical (projected)', v: 30, g: 'prop' as Grade },
                { k: 'AURORA-Q2 gross memory module (simulated)', v: 24, g: 'sim' as Grade },
              ].map((b) => (
                <div key={b.k} className="bar-row">
                  <span className="small">{b.k}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (b.v / 340) * 100)}%`, background: b.g === 'sim' || b.g === 'prop' ? 'var(--cyan)' : 'var(--s1)' }} /></div>
                  <span className="mono small">{b.v}</span>
                </div>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: '0.6rem' }}>These numbers measure different things. Willow’s is a measured experiment, Starling’s a company target that includes logic and factories, and ours are simulations of memory only (the system row adds the 4 logic positions). The logical error each machine reaches also differs.</p>
          </Panel>
          <Panel eyebrow="Where AURORA-Q2 is weaker" title="Open risks we did not solve">
            <ul className="risk-list">
              <li><b>Radiation.</b> A 20-die machine needs a per-impact logical failure probability ≲ 10⁻⁶ for day-long runs at a surface site (≲ 10⁻⁴ underground). No experiment has yet bounded this.</li>
              <li><b>Cryo-CMOS power.</b> The 5,900-qubit figure assumes 1 mW/qubit. Measured controllers draw 2–23 mW/qubit; at 23 mW one refrigerator holds about 130 qubits.</li>
              <li><b>Long couplers.</b> 5.4 mm couplers are about a quarter wavelength at 5 GHz; their spurious modes and crosstalk at 36 µm pitch are not modelled here.</li>
              <li><b>Schedule.</b> Our simulated syndrome cycle (12 CNOT layers + 2 measurements) is deeper than IBM’s depth-7 cycle, so absolute errors are conservative. A shorter cycle is a design target.</li>
              <li><b>Logic.</b> Logical processing units and cultivation factories are taken from the literature, not simulated here.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
