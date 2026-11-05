import { useMemo, useState } from 'react';
import { Badge, PageHead, Panel, Stat, TeX } from '../components/ui';
import { useData } from '../lib/data';
import { DURATIONS_NS } from '../lib/twin';
import { heavyHex, squareGrid, type Topology } from '../quantum/router';

function ChipDiagram() {
  const { data } = useData<any>('chip_layout');
  const [hover, setHover] = useState<number | null>(null);
  const [layers, setLayers] = useState({ couplers: true, feedlines: true, bumps: false });
  if (!data) return <p className="muted">Loading layout…</p>;
  const D = data.die, s = 30; // px per mm
  const X = (x: number) => (x + D / 2) * s, Y = (y: number) => (D / 2 - y) * s;
  const q = hover !== null ? data.qubits[hover] : null;
  const nb = q ? data.couplers.filter((c: any) => c.a === q.q || c.b === q.q).length : 0;
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(240px, 1fr)', alignItems: 'start' }}>
      <div className="stack" style={{ gap: '0.5rem' }}>
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10, background: '#0a0d14' }}>
          <svg viewBox={`0 0 ${D * s} ${D * s}`} style={{ width: '100%', minWidth: 420, display: 'block' }} role="img" aria-label="AURORA-Q T1 die layout" onMouseLeave={() => setHover(null)}>
            <rect x={4} y={4} width={D * s - 8} height={D * s - 8} fill="#11161f" stroke="#2a3546" />
            {layers.feedlines && data.feedlines.map((f: any) => <line key={f.row} x1={X(f.pts[0][0])} y1={Y(f.pts[0][1])} x2={X(f.pts[1][0])} y2={Y(f.pts[1][1])} stroke="#3fd2e0" strokeOpacity={0.6} strokeWidth={2} />)}
            {layers.couplers && data.couplers.map((c: any, i: number) => {
              const on = hover !== null && (c.a === hover || c.b === hover);
              return <g key={i}><line x1={X(c.p0[0])} y1={Y(c.p0[1])} x2={X(c.p1[0])} y2={Y(c.p1[1])} stroke={on ? '#b9a2ff' : '#3a4a66'} strokeWidth={on ? 3 : 1.6} /><rect x={X(c.squid[0]) - 3} y={Y(c.squid[1]) - 3} width={6} height={6} fill={on ? '#b9a2ff' : '#55657f'} /></g>;
            })}
            {layers.bumps && data.signal_bumps.map((b: any, i: number) => <circle key={i} cx={X(b.x)} cy={Y(b.y)} r={2.2} fill={b.kind === 'drive' ? '#7fb0ff' : b.kind === 'reset_pump' ? '#3ecf8e' : '#d9b26a'} />)}
            {data.qubits.map((qq: any) => (
              <g key={qq.q} onMouseEnter={() => setHover(qq.q)} style={{ cursor: 'pointer' }}>
                <rect x={X(qq.x) - 8} y={Y(qq.y) - 6} width={16} height={12} rx={2} fill={hover === qq.q ? '#4c8dff' : '#c9cdd6'} stroke="#05070b" />
              </g>
            ))}
          </svg>
        </div>
        <div className="row" style={{ gap: '0.35rem' }}>
          {(['couplers', 'feedlines', 'bumps'] as const).map((k) => <button key={k} className="btn sm" aria-pressed={layers[k]} onClick={() => setLayers({ ...layers, [k]: !layers[k] })}>{k === 'bumps' ? 'Signal bumps' : k[0].toUpperCase() + k.slice(1)}</button>)}
        </div>
      </div>
      <div className="stack">
        <Panel eyebrow="Hover a qubit" title={q ? `Qubit Q${q.q}` : 'T1 die · 20 × 20 mm'}>
          {q ? (
            <div className="stack small" style={{ gap: '0.4rem' }}>
              <span>Row {q.row}, column {q.col} · position ({q.x.toFixed(2)}, {q.y.toFixed(2)}) mm</span>
              <span>{nb} tunable couplers (degree {nb}) · feedline {q.row} · 1 readout resonator · 1 reset element · 1 drive bump</span>
              <span className="muted">Edge and corner qubits have degree 3 and 2, which matters for routing and for surface-code boundaries.</span>
            </div>
          ) : (
            <div className="legend" style={{ display: 'grid', gap: '0.35rem' }}>
              <span><i style={{ background: '#c9cdd6' }} />transmon (double-pad)</span>
              <span><i style={{ background: '#55657f' }} />tunable coupler + SQUID</span>
              <span><i style={{ background: '#3fd2e0' }} />readout feedline (10 qubits each)</span>
              <span><i style={{ background: '#7fb0ff' }} />drive bump</span><span><i style={{ background: '#d9b26a' }} />coupler-flux bump</span><span><i style={{ background: '#3ecf8e' }} />reset-pump bump</span>
            </div>
          )}
        </Panel>
        <p className="small muted">Drawn from <code>chip_layout.json</code>, the same file that generated the Blender die texture, its 3D features and the digital-twin overlay.</p>
      </div>
    </div>
  );
}

function MiniGraph({ t, extra = [] as number[][], highlight }: { t: Topology; extra?: number[][]; highlight?: string }) {
  const xs = t.coords.map((c) => c[0]), ys = t.coords.map((c) => c[1]);
  const w = Math.max(...xs) + 1, h = Math.max(...ys) + 1, s = 14;
  const P = (q: number) => [8 + t.coords[q][0] * s, 8 + t.coords[q][1] * s];
  return (
    <svg viewBox={`0 0 ${w * s + 2} ${h * s + 2}`} style={{ width: '100%', maxHeight: 210 }} role="img" aria-label={`${t.name} coupling graph`}>
      {t.edges.map(([a, b], i) => { const [x1, y1] = P(a), [x2, y2] = P(b); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line-2)" strokeWidth={1.4} />; })}
      {extra.map(([a, b], i) => { const [x1, y1] = P(a), [x2, y2] = P(b); return <line key={`d${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={highlight ?? 'var(--violet)'} strokeWidth={1.8} />; })}
      {t.coords.map((_, q) => { const [x, y] = P(q); return <circle key={q} cx={x} cy={y} r={3.2} fill="var(--fg-2)" />; })}
    </svg>
  );
}

function Topologies() {
  const eng = useData<any>('engine_connectivity');
  const sq = useMemo(() => squareGrid(12, 10), []), hh = useMemo(() => heavyHex(), []);
  const rej = eng.data?.decision?.rejected_candidate?.diagonals ?? [];
  const agg = eng.data?.aggregate, y = eng.data?.collision_yield;
  const cards = [
    { t: hh, name: 'Heron-class heavy-hex', key: 'heron_heavy_hex', extra: [], badge: <Badge g="lit">Reference</Badge> },
    { t: sq, name: 'AURORA-Q T1 / Nighthawk-class square', key: 'square', extra: [], badge: <Badge g="ok">Selected</Badge> },
    { t: sq, name: 'Square-X (+24 diagonals)', key: 'aurora_K24', extra: rej, badge: <Badge g="neg">Rejected</Badge> },
  ];
  return (
    <div className="grid-3">
      {cards.map((c) => (
        <div key={c.key} className="panel stack" style={{ gap: '0.6rem' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><h4>{c.name}</h4>{c.badge}</div>
          <MiniGraph t={c.t} extra={c.extra} />
          {agg && y && (
            <div className="grid-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0.6rem' }}>
              <Stat v={`${c.t.n} / ${agg[c.key].couplers}`} k="qubits / couplers" />
              <Stat v={agg[c.key].max_degree} k="max degree" />
              <Stat v={`${agg[c.key].geomean_ratio_vs_square.toFixed(3)}×`} k="routed CZ vs square" />
              <Stat v={`${(100 * y[c.key]['8']).toFixed(0)} %`} k="collision-free yield (σ = 8 MHz, model)" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ControlStack() {
  const box = (x: number, y: number, w: number, h: number, t: string, sub: string, c = 'var(--line-2)') => (
    <g><rect x={x} y={y} width={w} height={h} rx={8} fill="var(--surface-2)" stroke={c} /><text x={x + w / 2} y={y + 20} textAnchor="middle" style={{ fill: 'var(--fg)', font: '600 11px var(--f-body)' }}>{t}</text><text x={x + w / 2} y={y + 36} textAnchor="middle">{sub}</text></g>
  );
  const ln = (x1: number, y1: number, x2: number, y2: number, c = 'var(--accent)') => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={1.6} markerEnd="url(#a2)" />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox="0 0 900 330" className="chart" style={{ minWidth: 700 }} role="img" aria-label="AURORA-Q control architecture">
        <defs><marker id="a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" /></marker></defs>
        <text x={10} y={18} style={{ fill: 'var(--muted)' }}>300 K · room temperature</text>
        {box(10, 30, 160, 50, 'Compiler + scheduler', 'routing, reset overlap')}
        {box(190, 30, 150, 50, 'AWG / RF synthesis', '120 XY drive lines')}
        {box(360, 30, 150, 50, 'Flux & pump DACs', '218 coupler + 30 reset')}
        {box(530, 30, 170, 50, 'Readout digitisers', '12 feedlines, demod.')}
        {box(720, 30, 170, 50, 'Real-time decoder', 'FPGA, µs budget', 'var(--violet)')}
        {box(10, 100, 160, 44, 'HPC / AI optimiser', 'VQE · QAOA · QML')}
        {ln(170, 55, 190, 55)}{ln(700, 55, 720, 55, 'var(--violet)')}
        <path d="M 805 80 C 805 120, 90 120, 90 100" fill="none" stroke="var(--violet)" strokeDasharray="4 3" />
        <text x={450} y={116} textAnchor="middle">feed-forward / corrections (dynamic circuits)</text>
        <line x1={0} x2={900} y1={160} y2={160} stroke="var(--line)" strokeDasharray="6 4" />
        <text x={10} y={178} style={{ fill: 'var(--muted)' }}>cryostat · 4 K → 10 mK</text>
        {box(190, 190, 150, 50, 'Attenuators + filters', '20/10/10/20 dB, IR')}
        {box(360, 190, 150, 50, 'Flex wiring', 'DC/LF flux + pumps')}
        {box(530, 190, 170, 50, 'TWPA → HEMT', 'circulators, 4 K amp')}
        {ln(265, 80, 265, 190)}{ln(435, 80, 435, 190)}{ln(615, 190, 615, 80, 'var(--cyan)')}
        {box(190, 268, 510, 52, 'AURORA-Q T1 tile · 10 mK', '120 transmons · 218 couplers · 120 dissipative reset elements · 12 feedlines', 'var(--gold)')}
        {ln(265, 240, 265, 268)}{ln(435, 240, 435, 268)}{ln(615, 268, 615, 240, 'var(--cyan)')}
      </svg>
    </div>
  );
}

function Calculator() {
  const sc = useData<any>('scalability');
  const [target, setTarget] = useState(1e-9);
  const [nl, setNl] = useState(100);
  const [overhead, setOverhead] = useState(2);
  if (!sc.data) return null;
  const { A, Lambda } = sc.data.fit;
  let d = 3;
  while (d * A * Lambda ** (-(d + 1) / 2) > target && d < 101) d += 2;
  const perLogical = 2 * d * d - 1;
  const phys = Math.ceil(nl * perLogical * overhead);
  const tiles = Math.ceil(phys / 120);
  const lines = tiles * sc.data.lines_per_tile;
  const gross = Math.ceil(nl / 12) * 288 * overhead;
  return (
    <div className="stack">
      <p className="small muted">Fitted to our Stim results for the AURORA-target noise model with the reset-overlapped schedule: <TeX>{`\\varepsilon_L(d) = ${A.toFixed(3)}\\,\\Lambda^{-(d+1)/2},\\ \\Lambda = ${Lambda.toFixed(1)}`}</TeX>. A logical operation is taken as d rounds. Outputs are projections from an assumed noise model, not hardware facts.</p>
      <div className="grid-4">
        <label className="field">Target error per logical operation
          <select id="calc-target" value={target} onChange={(e) => setTarget(+e.target.value)}>{[1e-6, 1e-9, 1e-12, 1e-15].map((t) => <option key={t} value={t}>{t.toExponential(0)}</option>)}</select>
        </label>
        <label className="field">Logical qubits · {nl}<input id="calc-nl" type="range" min={1} max={2000} value={nl} onChange={(e) => setNl(+e.target.value)} /></label>
        <label className="field">Routing / factory allowance · ×{overhead.toFixed(1)}<input id="calc-oh" type="range" min={1} max={5} step={0.1} value={overhead} onChange={(e) => setOverhead(+e.target.value)} /></label>
      </div>
      <div className="grid-4">
        <Stat v={d} k="code distance d (surface code)" />
        <Stat v={phys.toLocaleString()} k="physical qubits" sub={`${perLogical} per logical patch`} />
        <Stat v={tiles.toLocaleString()} k="120-qubit T1 tiles" />
        <Stat v={lines.toLocaleString()} k="cryogenic lines (392 per tile)" />
      </div>
      <p className="small muted">For comparison, a [[144,12,12]] gross-code memory would use about {gross.toLocaleString()} physical qubits for the same number of logical qubits (Bravyi et al. 2024). It needs degree-6 connectivity, which the square tile does not have.</p>
    </div>
  );
}

export default function Architecture() {
  return (
    <>
      <PageHead eyebrow="AURORA-Q architecture · engineering proposal" title="The T1 compute tile">
        <p>The primary AURORA-Q candidate is a superconducting tile that keeps what Nighthawk r2 got right (square-lattice connectivity, one dedicated reset element per qubit), changes the control stack where our simulations show gains, and states every assumption. It is a design, not a device.</p>
      </PageHead>
      <div className="wrap stack" style={{ gap: '1.4rem', paddingBottom: '3rem' }}>
        <div className="grid-4">
          <Stat v="120" k="computational transmons (10 × 12)" />
          <Stat v="218" k="tunable couplers, max degree 4" />
          <Stat v="120" k="dissipative reset elements (multi-level)" />
          <Stat v="458" k="signal bumps: 120 drive · 218 flux · 120 pump" />
        </div>
        <Panel eyebrow="Interactive layout" title="Die floorplan"><ChipDiagram /></Panel>
        <Panel eyebrow="Connectivity study · from engine_connectivity.json" title="Topology trade-off: gates saved vs yield lost"><Topologies /></Panel>
        <Panel eyebrow="Signal chain" title="Control and readout architecture"><ControlStack /></Panel>
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <Panel eyebrow="Cryogenic structure" title="Stages and what lives on them">
            <div className="table-wrap"><table>
              <thead><tr><th>Stage</th><th>T</th><th>Hardware (per tile)</th></tr></thead>
              <tbody>
                <tr><td>Top plate</td><td>300 K</td><td>hermetic feedthroughs, still pumping line, pulse-tube head</td></tr>
                <tr><td>PT stage 1</td><td>≈ 50 K</td><td>radiation shield, cable heat sinking</td></tr>
                <tr><td>PT stage 2</td><td>≈ 4 K</td><td>HEMT amplifiers, 20 dB drive attenuators</td></tr>
                <tr><td>Still</td><td>≈ 0.8 K</td><td>10 dB attenuators, still pot</td></tr>
                <tr><td>Cold plate</td><td>≈ 100 mK</td><td>10 dB attenuators, heat exchanger, TWPA</td></tr>
                <tr><td>Mixing chamber</td><td>≈ 10 mK</td><td>20 dB attenuators, IR filters, circulators, T1 module in Cryoperm shield</td></tr>
              </tbody></table></div>
          </Panel>
          <Panel eyebrow="Wiring budget (counting rule, not a heat-load claim)" title="Lines per 120-qubit tile">
            <div className="table-wrap"><table>
              <thead><tr><th>Function</th><th className="num">Lines</th><th>Medium</th></tr></thead>
              <tbody>
                <tr><td>XY drive</td><td className="num">120</td><td>CuNi → NbTi coax</td></tr>
                <tr><td>Coupler flux</td><td className="num">218</td><td>flex (proposal)</td></tr>
                <tr><td>Reset pumps (4:1 multiplexed, assumption)</td><td className="num">30</td><td>flex (proposal)</td></tr>
                <tr><td>Readout in + out (12 feedlines)</td><td className="num">24</td><td>coax, NbTi output</td></tr>
                <tr><td><strong>Total</strong></td><td className="num"><strong>392</strong></td><td>≈ 3.3 lines per qubit</td></tr>
              </tbody></table></div>
          </Panel>
        </div>
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <Panel eyebrow="Assumptions used in every simulation" title="Hardware parameters" right={<Badge g="prop">Targets</Badge>}>
            <div className="table-wrap"><table>
              <thead><tr><th>Parameter</th><th>Value</th><th>Basis</th></tr></thead>
              <tbody>
                <tr><td>Single-qubit / CZ duration</td><td className="mono">{DURATIONS_NS.oneQ} ns / {DURATIONS_NS.cz} ns</td><td>typical tunable-coupler values</td></tr>
                <tr><td>Measurement / reset window</td><td className="mono">{DURATIONS_NS.measure} ns / {DURATIONS_NS.reset} ns</td><td>reset sized from the Lindblad model (87.5 ns to 10⁻³)</td></tr>
                <tr><td>2Q error, readout error (target)</td><td className="mono">1 × 10⁻³, 5 × 10⁻³</td><td>below Heron-class dashboards; a target</td></tr>
                <tr><td>T1, T2 (target)</td><td className="mono">500 µs, 500 µs</td><td>below the 1.68 ms best single device (Ta on Si)</td></tr>
                <tr><td>Reset error</td><td className="mono">4 × 10⁻⁴</td><td>25× below readout-limited reset (IBM report)</td></tr>
                <tr><td>Frequency spread after trim</td><td className="mono">≤ 8 MHz</td><td>needed for ≈93 % collision-free yield in our model</td></tr>
              </tbody></table></div>
          </Panel>
          <Panel eyebrow="Decision log" title="Design decisions and the evidence behind them">
            <ol className="stack small" style={{ paddingLeft: '1.1rem', margin: 0, gap: '0.55rem' }}>
              <li><strong>Superconducting tile as primary candidate.</strong> Every ingredient has been demonstrated individually; topological qubits remain contested (report §5).</li>
              <li><strong>Square lattice, not Square-X.</strong> Diagonals saved 3.7 % of CZ gates but cut modelled yield from ≈93 % to ≈28 %. Rejected (H-CONN).</li>
              <li><strong>One dissipative reset element per qubit.</strong> 4.5× lower logical error per round at d = 7 in simulation (H-RESET).</li>
              <li><strong>Multi-level reset tone.</strong> A g–e reset leaves 79 % of leakage population; adding an e–f tone removes it (H-LEAK).</li>
              <li><strong>Reset-overlapped scheduling.</strong> A modest gain (−15 % error per round, −13 % cycle), at no hardware cost.</li>
              <li><strong>Noise-aware placement from live calibrations.</strong> +21–45 % ESP (H-LAYOUT).</li>
              <li><strong>Deferred: long-range couplers for qLDPC.</strong> High value but a separate research track; not in T1.</li>
            </ol>
          </Panel>
        </div>
        <Panel eyebrow="Engineering trade-offs" title="What each choice costs">
          <div className="grid-3 small">
            <p><strong>Reset elements</strong> add 120 structures and 30+ lines per tile and a possible extra loss channel when idle. The switch must isolate the damped mode well when off (on/off ratio is a key specification).</p>
            <p><strong>Flip-chip interposer</strong> moves wiring off the qubit layer and reduces crosstalk, at the price of bump yield, thermal contact through indium, and alignment tolerance.</p>
            <p><strong>Fixed-frequency qubits</strong> avoid flux noise on the qubits themselves but require precise junction trimming; the yield model shows how fast tolerance shrinks with connectivity.</p>
          </div>
        </Panel>
        <Panel eyebrow="Scalability calculator · model projection" title="From logical qubits to tiles and wires"><Calculator /></Panel>
        <div className="grid-2">
          <figure><img src="renders/package_open.webp" alt="AURORA-Q T1 module with lid removed" loading="lazy" /><figcaption>Cycles render of the T1 module (lid removed).</figcaption></figure>
          <figure><img src="renders/chip_macro.webp" alt="Macro render of the T1 die" loading="lazy" /><figcaption>Die macro: transmons, resonators, coupler and reset SQUIDs, airbridges, bumps.</figcaption></figure>
        </div>
      </div>
    </>
  );
}
