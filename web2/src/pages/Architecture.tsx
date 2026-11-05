import { Badge, PageHead, Panel, TeX, type Grade } from '../components/ui';
import { useData } from '../lib/data';

const DECISIONS: { d: string; why: string; test: string; g: Grade }[] = [
  { d: 'Gross [[144,12,12]] code instead of the surface code', why: '12 logical qubits in 288 physical qubits, check weight 6.', test: 'Circuit-level memory, same schedule family, noise and decoder: at p = 0.3 % it beats surface d = 9 with 6.7× fewer qubits per logical qubit (R1, R2).', g: 'sim' },
  { d: 'Toroid placement: 4 of 6 couplings nearest-neighbour', why: 'Keeps the qubit die planar and every on-die coupler 0.8 mm long.', test: 'Layout engine: 540 die couplers, 0 crossings (R7).', g: 'sim' },
  { d: 'Long couplers in a 2-layer Manhattan interposer', why: 'Straight-line routing needs 13 layers (greedy colouring of 15,348 crossings).', test: 'Manhattan routing with greedy channel balancing: ≤ 11 tracks per 0.4 mm channel (36 µm pitch).', g: 'sim' },
  { d: 'Fixed-frequency transmons + tunable couplers (no dual-rail)', why: 'Degree 6 needs strong on/off coupling; dual-rail doubles the transmon count.', test: 'Equal-transmon trade study: dual-rail bb72 wins only if its raw error stays within 0.85–1.8× of transmons (R3b).', g: 'neg' },
  { d: 'Erasure heralding where the physics allows (leakage detection)', why: 'Heralded errors are cheap for BP-OSD.', test: 'Converting 50 % / 90 % / 97.5 % of CNOT errors to heralded erasures lowers gross-code error 6× / 49× / 150× at p = 0.5 % (R3).', g: 'sim' },
  { d: 'Cavity attenuators on every input at the MXC', why: 'Thermal photons dominate dephasing in a conventional chain.', test: 'Model: n̄ 1.3×10⁻³ → 2×10⁻⁴ (measured bound), T_φ,th 121 → 796 µs, T₂ 95 → 343 µs.', g: 'model' },
  { d: '4 K cryo-CMOS control, flex below 4 K, photonic drive', why: 'Coax + room-temperature control saturates the 4 K stage at ≈ 730 qubits.', test: 'Stage-by-stage heat model: ≈ 2,000 qubits on 6 W, ≈ 5,900 with 12 W dedicated 4 K cooling at 1 mW/qubit (R5).', g: 'model' },
  { d: 'Gap engineering, phonon traps, optional underground site', why: 'An unmitigated impact corrupts a whole die.', test: 'MTBF model: 20 unmitigated dies fail every ≈ 0.2 s. A one-day run needs p_fail ≲ 2×10⁻⁶ per impact at a surface site or ≲ 10⁻⁴ underground (R6). Open risk.', g: 'model' },
];

export default function Architecture() {
  const { data: L } = useData<any>('q2_layout');
  const { data: C } = useData<any>('q2_cryo_models');
  const S = L?.summary;
  const a = C?.architectures?.aurora;
  return (
    <>
      <PageHead eyebrow={<><b>Architecture</b> · AURORA-Q2</>} title="Toroid chip and AURORA-CRYO, layer by layer">
        <p>This page specifies the machine: code, chip, package, refrigerator and control system. Each decision is listed with the measurement or model that justified it. The 3D models in Explore are generated from the same numbers.</p>
      </PageHead>
      <div className="wrap stack" style={{ gap: '1.5rem', paddingBottom: '3rem' }}>
        <Panel eyebrow="Design decisions" title="What we chose, and the evidence for it">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Decision</th><th>Reason</th><th>Test</th><th>Grade</th></tr></thead>
              <tbody>{DECISIONS.map((x) => <tr key={x.d}><td style={{ color: 'var(--fg)', minWidth: 200 }}>{x.d}</td><td className="small">{x.why}</td><td className="small">{x.test}</td><td><Badge g={x.g} /></td></tr>)}</tbody>
            </table>
          </div>
        </Panel>

        <div className="grid-2">
          <Panel eyebrow="Code" title="Gross bivariate-bicycle code">
            <div className="prose small">
              <p>With cyclic shifts <TeX>{String.raw`x = S_{12}\otimes I_6`}</TeX> and <TeX>{String.raw`y = I_{12}\otimes S_6`}</TeX>, take</p>
              <TeX block>{String.raw`A = x^3 + y + y^2,\quad B = y^3 + x + x^2,\qquad H_X=[A\,|\,B],\quad H_Z=[B^{\mathsf T}\,|\,A^{\mathsf T}].`}</TeX>
              <p>The result is n = 144 data qubits, k = 12 logical qubits and distance d = 12, with 72 X checks and 72 Z checks of weight 6. Both the Python study and this website build the matrices from this definition, and unit tests confirm they agree.</p>
            </div>
          </Panel>
          <Panel eyebrow="Placement" title="Toroid embedding">
            <div className="prose small">
              <p>For <TeX>{String.raw`g=(i,j)`}</TeX>, place <TeX>{String.raw`X_g\to(2i,2j)`}</TeX>, <TeX>{String.raw`L_g\to(2i,2j-3)`}</TeX>, <TeX>{String.raw`R_g\to(2i-3,2j)`}</TeX>, <TeX>{String.raw`Z_g\to(2i-3,2j-3)`}</TeX> on a 24 × 12 torus. Then the y, y², x, x² terms are exactly nearest-neighbour and form the toroidal square grid. The x³ and y³ terms are the long-range couplers, each spanning (6, 3) sites (5.4 mm).</p>
              <p>Cutting the torus open keeps the die planar. Its 36 wrap-around edges join the long couplers in the interposer.</p>
            </div>
          </Panel>
        </div>

        <Panel eyebrow="Die stack" title="Cross-section (not to scale)">
          <div className="svg-scroll"><StackSVG /></div>
        </Panel>

        <div className="grid-2">
          <Panel eyebrow="Toroid chip" title="Specification">
            <div className="table-wrap"><table><tbody>
              {[
                ['Qubits', '288 fixed-frequency transmons (144 data, 72 X-check, 72 Z-check)'],
                ['Qubit shapes', 'X: cross · Z: ring · L/R data: double-pad (orthogonal)'],
                ['Materials', 'Ta on high-resistivity Si (ms-class T₁ reported); gap-engineered Al/AlOx junctions'],
                ['Pitch / die', S ? `${S.pitch_mm} mm · ${S.die_mm[0].toFixed(1)} × ${S.die_mm[1].toFixed(1)} mm` : '0.8 mm'],
                ['Couplers', S ? `${S.couplers_total} tunable: ${S.couplers_die} on die (NN), ${S.couplers_interposer} in interposer` : '864'],
                ['Interposer routing', S ? `2 layers (A: x-runs, B: y-runs), ≤ ${S.manhattan.max_tracks_V} tracks/channel, ${S.manhattan.vias} corner vias` : ''],
                ['Readout', '288 λ/4 resonators, 36 Purcell-filtered feedlines (8 qubits each)'],
                ['Reset', 'Multi-level reset with e–f tone (leakage), optional QCR-assisted resonator reset'],
                ['Syndrome cycle', a ? `≈ ${(a.cycle_time_interleaved * 1e6).toFixed(2)} µs interleaved (8 CNOT layers + measure + reset)` : ''],
              ].map(([k, v]) => <tr key={k}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{k}</td><td>{v}</td></tr>)}
            </tbody></table></div>
          </Panel>
          <Panel eyebrow="AURORA-CRYO" title="Stage plan">
            <div className="table-wrap"><table>
              <thead><tr><th>Stage</th><th>Hardware</th><th className="num">capacity</th></tr></thead>
              <tbody>
                {[
                  ['300 K', 'lasers + modulators, Relay-BP FPGA decoder, cryo-CMOS power', '—'],
                  ['50 K', 'pulse-tube first stages, shield', '≈ 90 W (model)'],
                  ['4 K', '24 cryo-CMOS boards: drive synthesis (8 qubits/line), 864 coupler DACs, readout ADCs', '6 W + 12 W dedicated'],
                  ['0.8 K still', '10 dB attenuation, flex clamps', '90 mW (assumed)'],
                  ['100 mK', '20 dB attenuation, flex clamps', '3 mW'],
                  ['10 mK MXC', '20 modules, 20 cavity-attenuator blocks, photodiode arrays, cryo-link ring', '> 90 µW @ 20 mK'],
                ].map(([s, h, c]) => <tr key={s}><td className="mono">{s}</td><td className="small">{h}</td><td className="num">{c}</td></tr>)}
              </tbody>
            </table></div>
          </Panel>
        </div>

        <Panel eyebrow="Signal chain" title="Where each signal travels">
          <div className="svg-scroll"><ChainSVG /></div>
        </Panel>

        <Panel eyebrow="System" title="Logical layer">
          <div className="grid-3">
            <div className="prose small"><h4>Memory modules</h4><p>16 Toroid modules × 12 logical qubits = 192 logical qubits of memory per refrigerator. The syndrome cycle runs continuously, and Relay-BP decodes 12-cycle windows on FPGAs (&lt; 240 ns estimated for the gross code).</p></div>
            <div className="prose small"><h4>Logic</h4><p>Following Tour de gross, each module gets a logical processing unit for selective logical measurements by qLDPC surgery. The 4 logic positions host those units and magic-state factories.</p></div>
            <div className="prose small"><h4>Non-Clifford gates</h4><p>T states come from magic-state cultivation inside a surface-code patch, reported at about the cost of a lattice-surgery CNOT. A cultivation patch sits next to each logic unit.</p></div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function StackSVG() {
  const layers = [
    { h: 26, t: 'Silicon interposer · TSVs to package', c: 'var(--surface-3)', s: 'var(--line-2)' },
    { h: 5, t: 'Nb ground plane', c: 'var(--fg-2)', s: 'none' },
    { h: 7, t: 'Routing layer B · y-runs', c: 'var(--gold)', s: 'none' },
    { h: 5, t: 'Nb ground plane', c: 'var(--fg-2)', s: 'none' },
    { h: 7, t: 'Routing layer A · x-runs (corner vias to B)', c: '#8fa3c0', s: 'none' },
    { h: 5, t: 'Nb ground plane', c: 'var(--fg-2)', s: 'none' },
    { h: 14, t: 'Indium bumps · signal (gold) and ground', c: 'none', s: 'none' },
    { h: 7, t: 'Superconducting circuit (Ta) · qubits, 540 NN couplers, resonators', c: 'var(--cyan)', s: 'none' },
    { h: 34, t: 'Qubit die · high-resistivity Si · backside phonon traps', c: 'var(--surface-2)', s: 'var(--line-2)' },
  ];
  let y = 16;
  const placed = layers.map((l) => { const o = { ...l, y }; y += l.h + 3; return o; });
  const H = y + 14;
  const ly = (i: number) => 18 + (i * (H - 36)) / (layers.length - 1);
  const bumps = placed[6];
  return (
    <svg width={880} height={H} viewBox={`0 0 880 ${H}`} role="img" aria-label="Toroid die stack cross-section">
      {placed.map((l, i) => (
        <g key={l.t}>
          {l.c !== 'none' && <rect x={20} y={l.y} width={420} height={l.h} rx={2} fill={l.c} stroke={l.s} opacity={l.c.includes('fg-2') ? 0.45 : 0.9} />}
          <polyline points={`448,${l.y + l.h / 2} 470,${l.y + l.h / 2} 492,${ly(i)} 500,${ly(i)}`} fill="none" stroke="var(--line-2)" />
          <text x={506} y={ly(i) + 4} fill="var(--fg-2)" fontSize={12}>{l.t}</text>
        </g>
      ))}
      {Array.from({ length: 21 }, (_, i) => <rect key={i} x={30 + i * 19.5} y={bumps.y + 1} width={9} height={bumps.h - 2} rx={4} fill={i % 3 === 0 ? 'var(--gold)' : '#9aa3b4'} />)}
      {Array.from({ length: 6 }, (_, i) => <rect key={i} x={60 + i * 66} y={placed[2].y} width={3} height={placed[4].y + placed[4].h - placed[2].y} fill="var(--gold)" />)}
      {Array.from({ length: 9 }, (_, i) => <rect key={i} x={40 + i * 46} y={placed[0].y} width={4} height={placed[0].h} fill="#c98a5b" />)}
    </svg>
  );
}

function ChainSVG() {
  const stages = ['300 K', '50 K', '4 K', '0.8 K', '100 mK', '10 mK'];
  const y = (i: number) => 26 + i * 44;
  const cols = [
    { x: 150, t: 'Qubit drive', path: 'fibre', note: ['lasers + modulators', '', '', '', '', 'photodiode → module'] },
    { x: 360, t: 'Coupler flux (864)', path: 'flex', note: ['power + serial', '', 'cryo-CMOS DACs', 'flex · clamp', 'flex · clamp', 'cavity attenuator → coupler'] },
    { x: 570, t: 'Readout', path: 'flex', note: ['FPGA Relay-BP', '', 'cryo-CMOS LNA/ADC', '', '', 'TWPA · feedline (8 q)'] },
  ];
  return (
    <svg width={800} height={y(5) + 40} viewBox={`0 0 800 ${y(5) + 40}`} role="img" aria-label="Signal chain from room temperature to the qubits">
      {stages.map((s, i) => (
        <g key={s}>
          <rect x={0} y={y(i) - 16} width={800} height={36} fill={i % 2 ? 'var(--surface)' : 'var(--bg-2)'} />
          <text x={12} y={y(i) + 6} fill="var(--muted)" fontSize={12} fontFamily="var(--f-mono)">{s}</text>
        </g>
      ))}
      {cols.map((c) => (
        <g key={c.t}>
          <text x={c.x} y={12} fill="var(--fg)" fontSize={12} textAnchor="middle" fontWeight={600}>{c.t}</text>
          <line x1={c.x} x2={c.x} y1={y(0)} y2={y(5)} stroke={c.path === 'fibre' ? 'var(--gold)' : 'var(--cyan)'} strokeWidth={c.path === 'fibre' ? 2 : 3} strokeDasharray={c.path === 'fibre' ? '6 4' : undefined} />
          {c.note.map((n, i) => n && (
            <g key={i}>
              <circle cx={c.x} cy={y(i)} r={4.5} fill="var(--bg)" stroke={c.path === 'fibre' ? 'var(--gold)' : 'var(--cyan)'} strokeWidth={2} />
              <text x={c.x + 10} y={y(i) + 4} fill="var(--fg-2)" fontSize={11}>{n}</text>
            </g>
          ))}
        </g>
      ))}
      <g transform={`translate(640, ${y(5) + 30})`}>
        <line x1={0} x2={24} y1={-4} y2={-4} stroke="var(--gold)" strokeWidth={2} strokeDasharray="6 4" /><text x={30} y={0} fill="var(--muted)" fontSize={11}>optical fibre</text>
        <line x1={-140} x2={-116} y1={-4} y2={-4} stroke="var(--cyan)" strokeWidth={3} /><text x={-110} y={0} fill="var(--muted)" fontSize={11}>superconducting flex</text>
      </g>
    </svg>
  );
}
