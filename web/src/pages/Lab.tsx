import { useEffect, useMemo, useState } from 'react';
import { go } from '../App';
import { Bloch } from '../components/Bloch';
import { Histogram } from '../components/charts';
import { CircuitDiagram, parseAngle } from '../components/CircuitDiagram';
import { Badge, CopyBox, PageHead, Panel, Stat } from '../components/ui';
import { useStore } from '../lib/store';
import { layerDurations, TILE } from '../lib/twin';
import { task, cancelAll } from '../lib/worker';
import { LIMITS, stats, toQasm3, validate } from '../quantum/circuit';
import { GATE_INFO } from '../quantum/gates';
import { LIBRARY } from '../quantum/library';
import { DEFAULT_NOISE, NOISE_PRESETS } from '../quantum/noise';
import { heavyHex, route, type RouteResult } from '../quantum/router';
import type { Circuit, GateName, Method, NoiseParams, RunResult } from '../quantum/types';

const TOOLS: GateName[] = ['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'sx', 'rx', 'ry', 'rz', 'p', 'cx', 'cz', 'cy', 'ch', 'swap', 'iswap', 'cp', 'crx', 'cry', 'crz', 'rzz', 'rxx', 'ryy', 'ccx', 'cswap', 'measure', 'reset', 'barrier'];
const HEAVY = heavyHex();

export default function Lab() {
  const { setTwin, setExplorerMode, labCircuit, setLabCircuit } = useStore();
  const [circuit, setCircuit] = useState<Circuit>(labCircuit ?? LIBRARY[0].build());
  const [title, setTitle] = useState<string>(labCircuit ? 'Custom circuit' : LIBRARY[0].title);
  const [tool, setTool] = useState<GateName | 'erase'>('h');
  const [pending, setPending] = useState<number[]>([]);
  const [angle, setAngle] = useState('pi/2');
  const [presetKey, setPresetKey] = useState('ideal');
  const [custom, setCustom] = useState<NoiseParams>({ ...DEFAULT_NOISE, t1_us: 250, t2_us: 200 });
  const [shots, setShots] = useState(2048);
  const [seed, setSeed] = useState(7);
  const [method, setMethod] = useState<Method>('auto');
  const [result, setResult] = useState<RunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [routes, setRoutes] = useState<{ tile: RouteResult; hh: RouteResult } | null>(null);
  const [importText, setImportText] = useState('');
  useEffect(() => { setLabCircuit(circuit); setRoutes(null); }, [circuit, setLabCircuit]);
  const noise = presetKey === 'custom' ? custom : presetKey === 'ideal' ? null : NOISE_PRESETS[presetKey].params;
  const st = useMemo(() => stats(circuit), [circuit]);
  const example = LIBRARY.find((e) => e.title === title);

  const arity = tool === 'erase' ? 0 : GATE_INFO[tool].arity;
  const onWire = (q: number) => {
    setErr(null);
    if (tool === 'erase') return;
    if (tool === 'measure') return push({ name: 'measure', qubits: [q], clbits: [q] });
    if (tool === 'reset') return push({ name: 'reset', qubits: [q] });
    if (tool === 'barrier') return push({ name: 'barrier', qubits: Array.from({ length: circuit.num_qubits }, (_, i) => i) });
    const need = arity;
    const next = [...pending, q];
    if (new Set(next).size !== next.length) { setPending([]); return; }
    if (next.length < need) { setPending(next); return; }
    setPending([]);
    let params: number[] | undefined;
    const np = GATE_INFO[tool].params;
    if (np > 0) {
      try { params = Array.from({ length: np }, () => parseAngle(angle)); } catch (e) { setErr(String((e as Error).message)); return; }
    }
    push({ name: tool, qubits: next, ...(params ? { params } : {}) });
  };
  const push = (op: Circuit['ops'][number]) => { setCircuit((c) => ({ ...c, ops: [...c.ops, op] })); setTitle('Custom circuit'); setResult(null); };
  const onOp = (i: number) => { if (tool === 'erase') { setCircuit((c) => ({ ...c, ops: c.ops.filter((_, k) => k !== i) })); setResult(null); } };
  const setQubits = (n: number) => {
    n = Math.max(1, Math.min(LIMITS.maxQubitsEditor, n));
    setCircuit((c) => ({ num_qubits: n, num_clbits: n, ops: c.ops.filter((o) => o.qubits.every((q) => q < n)).map((o) => o.name === 'barrier' ? { ...o, qubits: o.qubits.filter((q) => q < n) } : o).filter((o) => o.qubits.length && (o.clbits ?? []).every((b) => b < n)) }));
    setPending([]); setResult(null);
  };

  const runNow = async () => {
    const v = validate(circuit);
    if (v.length) { setErr(v.join('; ')); return; }
    setRunning(true); setErr(null);
    try {
      const r = await task<RunResult>('run', { circuit, opts: { shots, seed, noise, method } });
      setResult(r);
      return r;
    } catch (e) { setErr(String((e as Error).message)); } finally { setRunning(false); }
  };
  const compile = () => {
    try {
      setRoutes({ tile: route(circuit, TILE, seed), hh: route(circuit, HEAVY, seed) });
    } catch (e) { setErr(String((e as Error).message)); }
  };
  const openTwin = async () => {
    const r = result ?? (await runNow());
    if (!r) return;
    const rt = routes?.tile ?? route(circuit, TILE, seed);
    setTwin({ circuit, result: r, route: rt, noiseLabel: presetKey === 'custom' ? 'Custom noise' : NOISE_PRESETS[presetKey].label, noise, at: Date.now() });
    setExplorerMode('chip');
    go('explorer');
  };
  const doImport = () => {
    try {
      const c = JSON.parse(importText) as Circuit;
      const v = validate(c);
      if (v.length) throw new Error(v.join('; '));
      setCircuit(c); setTitle('Imported circuit'); setResult(null); setErr(null);
    } catch (e) { setErr(`Import failed: ${(e as Error).message}`); }
  };

  const nbits = circuit.num_clbits ?? circuit.num_qubits;
  const amps = result?.statevector ? result.statevector.map(([re, im], i) => ({ i, re, im, p: re * re + im * im })).sort((a, b) => b.p - a.p).slice(0, 16) : null;

  return (
    <>
      <PageHead eyebrow="Quantum Lab · exact simulation in your browser" title="Build, run and compile quantum circuits">
        <p>Pick a gate and click a qubit wire to place it. Two- and three-qubit gates take their control first, then their target. Choose <strong>Erase</strong> and click a gate to remove it. Runs execute in a background worker using the engine method that fits: statevector, density matrix, trajectories, or stabilizer for large Clifford circuits.</p>
      </PageHead>
      <div className="wrap stack" style={{ gap: '1.25rem', paddingBottom: '3rem' }}>
        <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', alignItems: 'start' }}>
          <div className="stack">
            <Panel eyebrow={`${circuit.num_qubits} qubits · ${st.size} operations · depth ${st.depth} · ${st.two_qubit_gates} two-qubit${st.clifford ? ' · Clifford' : ''}`} title={title}
              right={<div className="row" style={{ gap: '0.35rem' }}>
                <button className="btn sm" onClick={() => setQubits(circuit.num_qubits - 1)} disabled={circuit.num_qubits <= 1}>− qubit</button>
                <button className="btn sm" onClick={() => setQubits(circuit.num_qubits + 1)} disabled={circuit.num_qubits >= LIMITS.maxQubitsEditor}>+ qubit</button>
                <button className="btn sm" onClick={() => { setCircuit((c) => ({ ...c, ops: c.ops.slice(0, -1) })); setResult(null); }} disabled={!circuit.ops.length}>Undo</button>
                <button className="btn sm" onClick={() => { setCircuit((c) => ({ ...c, ops: [] })); setResult(null); setTitle('Custom circuit'); }}>Clear</button>
              </div>}>
              <div className="stack" style={{ gap: '0.8rem' }}>
                <div className="palette" role="toolbar" aria-label="Gate palette">
                  {TOOLS.map((g) => (
                    <button key={g} className={`gate-btn ${GATE_INFO[g].arity > 1 ? 'g2' : ['measure', 'reset', 'barrier'].includes(g) ? 'gm' : ''}`} aria-pressed={tool === g} title={GATE_INFO[g].doc} onClick={() => { setTool(g); setPending([]); }}>{GATE_INFO[g].label}</button>
                  ))}
                  <button className="gate-btn" aria-pressed={tool === 'erase'} onClick={() => { setTool('erase'); setPending([]); }}>Erase</button>
                </div>
                <div className="row small muted" style={{ gap: '1rem' }}>
                  <span>{tool === 'erase' ? 'Click a gate to delete it.' : `${GATE_INFO[tool].doc}${arity > 1 ? ` Click ${arity} wires (${pending.length} selected).` : ''}`}</span>
                  {tool !== 'erase' && GATE_INFO[tool].params > 0 && (
                    <label className="field" style={{ flexDirection: 'row', display: 'flex', alignItems: 'center', gap: 6 }}>angle
                      <input id="angle" type="text" value={angle} onChange={(e) => setAngle(e.target.value)} style={{ width: 120 }} aria-label="Rotation angle expression" />
                    </label>
                  )}
                </div>
                {circuit.num_qubits <= 16 ? (
                  <CircuitDiagram circuit={circuit} onWire={onWire} onOp={onOp} pending={pending} />
                ) : (
                  <div className="callout info">This {circuit.num_qubits}-qubit circuit is too tall to draw. It has {st.size} operations ({st.two_qubit_gates} two-qubit){st.clifford ? ' and is Clifford, so it runs on the stabilizer engine' : ''}. Open it in the 3D twin to watch its schedule on the tile.</div>
                )}
                {example && <p className="small"><strong>Expected:</strong> <span className="muted">{example.expect}</span></p>}
              </div>
            </Panel>
            <Panel eyebrow="Execution" title="Run on the simulator" right={<Badge g="sim">Simulation, not QPU</Badge>}>
              <div className="stack">
                <div className="grid-4">
                  <label className="field">Noise model
                    <select id="noise" value={presetKey} onChange={(e) => { setPresetKey(e.target.value); setResult(null); }}>
                      {Object.entries(NOISE_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      <option value="custom">Custom…</option>
                    </select>
                  </label>
                  <label className="field">Method
                    <select id="method" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                      <option value="auto">Automatic</option><option value="statevector">Statevector</option><option value="density_matrix">Density matrix</option><option value="trajectories">Trajectories</option><option value="stabilizer">Stabilizer</option>
                    </select>
                  </label>
                  <label className="field">Shots<input id="shots" type="number" min={1} max={100000} value={shots} onChange={(e) => setShots(Math.max(1, Math.min(100000, +e.target.value || 1)))} /></label>
                  <label className="field">Seed<input id="seed" type="number" value={seed} onChange={(e) => setSeed(+e.target.value || 0)} /></label>
                </div>
                {presetKey !== 'custom' && presetKey !== 'ideal' && <p className="small muted">{NOISE_PRESETS[presetKey].note}</p>}
                {presetKey === 'custom' && (
                  <div className="grid-4">
                    {([['p1', '1Q depolarising', 0, 0.02, 0.0001], ['p2', '2Q depolarising', 0, 0.1, 0.0005], ['readout', 'Readout error', 0, 0.1, 0.001], ['reset_error', 'Reset error', 0, 0.05, 0.0005], ['crosstalk_zz', 'ZZ crosstalk', 0, 0.05, 0.001], ['t1_us', 'T1 (µs)', 5, 1000, 5], ['t2_us', 'T2 (µs)', 5, 1000, 5]] as const).map(([k, l, mn, mx, stp]) => (
                      <label key={k} className="field">{l} · {String((custom as any)[k])}
                        <input id={`noise-${k}`} type="range" min={mn} max={mx} step={stp} value={(custom as any)[k] ?? 0} onChange={(e) => { setCustom({ ...custom, [k]: +e.target.value }); setResult(null); }} />
                      </label>
                    ))}
                  </div>
                )}
                <div className="row">
                  <button className="btn primary" onClick={runNow} disabled={running}>{running ? 'Running…' : 'Run'}</button>
                  {running && <button className="btn" onClick={() => { cancelAll(); setRunning(false); setErr('Cancelled.'); }}>Cancel</button>}
                  <button className="btn" onClick={compile}>Compile to AURORA-Q tile</button>
                  <button className="btn" onClick={openTwin} disabled={running}>Open in 3D twin</button>
                </div>
                {err && <p className="err" role="alert">{err}</p>}
              </div>
            </Panel>
          </div>
          <div className="stack">
            <Panel eyebrow="Examples · each verified by the test-suite" title="Algorithm library">
              <div className="stack" style={{ gap: '0.5rem' }}>
                {LIBRARY.map((e) => (
                  <button key={e.id} className="btn" style={{ justifyContent: 'space-between', whiteSpace: 'normal', textAlign: 'left' }} aria-pressed={title === e.title}
                    onClick={() => { setCircuit(e.build()); setTitle(e.title); setResult(null); setErr(null); setPending([]); }}>
                    <span><strong>{e.title}</strong><br /><span className="small muted">{e.summary}</span></span>
                    <span className="eyebrow">{e.category}</span>
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        {result && (
          <Panel eyebrow={result.execution} title="Results" right={<div className="row"><Badge g="sim">{result.method.replace('_', ' ')}</Badge><span className="mono small muted">seed {result.seed}</span></div>}>
            <div className="stack" style={{ gap: '1.2rem' }}>
              <div className="grid-4">
                <Stat v={result.shots.toLocaleString()} k="shots" />
                <Stat v={`${result.elapsedMs.toFixed(result.elapsedMs < 10 ? 2 : 0)} ms`} k="execution time (browser)" />
                <Stat v={result.purity !== undefined ? result.purity.toFixed(4) : '—'} k="purity Tr ρ²" />
                <Stat v={result.entropyHalf !== undefined ? `${result.entropyHalf.toFixed(3)} bit` : '—'} k="entanglement entropy (first half)" />
              </div>
              {result.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
              <Histogram counts={result.counts} probs={result.probabilities} nbits={nbits} />
              {result.bloch && (
                <div className="stack" style={{ gap: '0.5rem' }}>
                  <span className="eyebrow">Single-qubit reduced states</span>
                  <div className="row" style={{ gap: '0.6rem' }}>{result.bloch.slice(0, 12).map((b, q) => <Bloch key={q} v={b} label={`q${q}`} />)}</div>
                </div>
              )}
              {amps && (
                <div className="table-wrap" style={{ maxHeight: 340 }}>
                  <table>
                    <thead><tr><th>Basis state</th><th className="num">Re</th><th className="num">Im</th><th className="num">|a|²</th><th className="num">Phase</th></tr></thead>
                    <tbody>{amps.map((a) => (
                      <tr key={a.i}><td className="mono">|{a.i.toString(2).padStart(circuit.num_qubits, '0')}⟩</td><td className="num">{a.re.toFixed(5)}</td><td className="num">{a.im.toFixed(5)}</td><td className="num">{a.p.toFixed(5)}</td><td className="num">{a.p > 1e-12 ? `${(Math.atan2(a.im, a.re) / Math.PI).toFixed(3)}π` : '—'}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </Panel>
        )}

        {routes && (
          <Panel eyebrow="Compilation · interaction-weighted placement + SABRE-style routing" title="Mapping onto processor topologies">
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Metric</th><th className="num">AURORA-Q tile (10×12 square)</th><th className="num">Heron-class heavy-hex</th></tr></thead>
                  <tbody>
                    <tr><td>Two-qubit gates (logical)</td><td className="num">{routes.tile.logical2q}</td><td className="num">{routes.hh.logical2q}</td></tr>
                    <tr><td>SWAPs inserted</td><td className="num">{routes.tile.swaps}</td><td className="num">{routes.hh.swaps}</td></tr>
                    <tr><td>Two-qubit gates after routing</td><td className="num">{routes.tile.physical2q}</td><td className="num">{routes.hh.physical2q}</td></tr>
                    <tr><td>Schedule layers</td><td className="num">{routes.tile.layers.length}</td><td className="num">{routes.hh.layers.length}</td></tr>
                    <tr><td>Estimated duration (assumed gate times)</td><td className="num">{(layerDurations(routes.tile.layers).reduce((a, b) => a + b, 0) / 1000).toFixed(2)} µs</td><td className="num">{(layerDurations(routes.hh.layers).reduce((a, b) => a + b, 0) / 1000).toFixed(2)} µs</td></tr>
                  </tbody>
                </table>
              </div>
              <TileMap route={routes.tile} />
            </div>
          </Panel>
        )}

        <div className="grid-2">
          <Panel eyebrow="Export" title="Circuit formats">
            <div className="stack">
              <CopyBox id="export-json" label="JSON (AURORA-Q / backend API schema)" text={JSON.stringify(circuit, null, 1)} rows={8} />
              <CopyBox id="export-qasm" label="OpenQASM 3.0" text={toQasm3(circuit)} rows={8} />
              {result && <CopyBox id="export-counts" label="Results (counts + metadata)" text={JSON.stringify({ counts: result.counts, shots: result.shots, method: result.method, seed: result.seed, noise, elapsed_ms: result.elapsedMs }, null, 1)} rows={6} />}
            </div>
          </Panel>
          <Panel eyebrow="Import" title="Load a circuit from JSON">
            <div className="stack">
              <textarea id="import-json" rows={10} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"num_qubits": 2, "ops": [{"name": "h", "qubits": [0]}, {"name": "cx", "qubits": [0, 1]}]}' aria-label="Circuit JSON to import" />
              <div className="row"><button className="btn" onClick={doImport} disabled={!importText.trim()}>Load circuit</button><span className="small muted">Validated against the same schema the Python API uses.</span></div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function TileMap({ route: r }: { route: RouteResult }) {
  const used = new Set(r.usedPhysical);
  const logical = new Map(r.initialLayout.map((p, l) => [p, l]));
  const s = 26;
  return (
    <figure>
      <svg viewBox={`0 0 ${10 * s + 10} ${12 * s + 10}`} style={{ width: '100%', maxWidth: 300 }} role="img" aria-label="Initial placement on the 10 by 12 AURORA-Q tile">
        {TILE.edges.map(([a, b], i) => {
          const [x1, y1] = TILE.coords[a], [x2, y2] = TILE.coords[b];
          return <line key={i} x1={5 + x1 * s + s / 2} y1={5 + y1 * s + s / 2} x2={5 + x2 * s + s / 2} y2={5 + y2 * s + s / 2} stroke={used.has(a) && used.has(b) ? 'var(--accent)' : 'var(--line)'} strokeWidth={used.has(a) && used.has(b) ? 2 : 1} />;
        })}
        {TILE.coords.map(([x, y], q) => (
          <g key={q}>
            <circle cx={5 + x * s + s / 2} cy={5 + y * s + s / 2} r={7.5} fill={logical.has(q) ? 'var(--accent)' : used.has(q) ? 'var(--surface-3)' : 'var(--surface-2)'} stroke={used.has(q) ? 'var(--accent-2)' : 'var(--line-2)'} />
            {logical.has(q) && <text x={5 + x * s + s / 2} y={5 + y * s + s / 2 + 3} textAnchor="middle" style={{ fill: '#031026', font: '600 8px var(--f-mono)' }}>{logical.get(q)}</text>}
          </g>
        ))}
      </svg>
      <figcaption>Logical qubits (numbered) placed on the tile; outlined qubits are also touched by routing SWAPs.</figcaption>
    </figure>
  );
}
