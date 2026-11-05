import { useEffect, useRef, useState } from 'react';
import { BarChart, LineChart } from '../components/charts';
import { Badge, PageHead, Panel, Seg, Stat } from '../components/ui';
import { fmt, useData } from '../lib/data';
import { task } from '../lib/worker';

// ------------------------------------------------------------------ hybrid loop
function HybridLoop({ active, iter, evals, metric }: { active: boolean; iter: number; evals: number; metric: string }) {
  const nodes = ['Classical CPU / GPU', 'Circuit compiler', 'Simulator / QPU backend', 'Measurement processing', 'Classical optimiser', 'Updated circuit'];
  return (
    <figure>
      <svg viewBox="0 0 720 150" className="chart" style={{ maxWidth: 860 }} role="img" aria-label="Hybrid quantum-classical workflow">
        <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--line-2)" /></marker></defs>
        {nodes.map((n, i) => {
          const x = 8 + i * 119;
          return (
            <g key={n}>
              <rect x={x} y={40} width={104} height={56} rx={8} fill="var(--surface-2)" stroke={active && i === iter % 6 ? 'var(--accent)' : 'var(--line-2)'} strokeWidth={active && i === iter % 6 ? 2 : 1} />
              <foreignObject x={x + 4} y={44} width={96} height={48}><div style={{ font: '10.5px var(--f-body)', color: 'var(--fg-2)', textAlign: 'center', lineHeight: 1.25, display: 'grid', placeItems: 'center', height: '100%' }}>{n}</div></foreignObject>
              {i < 5 && <line x1={x + 104} x2={x + 118} y1={68} y2={68} stroke="var(--line-2)" markerEnd="url(#arr)" />}
            </g>
          );
        })}
        <path d="M 660 96 C 660 140, 60 140, 60 98" fill="none" stroke="var(--line-2)" strokeDasharray="4 4" markerEnd="url(#arr)" />
        <text x={360} y={136} textAnchor="middle">loop until converged</text>
        {active && <circle r={5} fill="var(--accent)"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 60 68 L 660 68 C 660 140, 60 140, 60 98 Z" /></circle>}
        <text x={8} y={24} style={{ fill: 'var(--fg-2)' }}>{active ? `running · iteration ${iter} · ${evals.toLocaleString()} circuit evaluations · ${metric}` : 'idle: start an experiment below to drive this loop'}</text>
      </svg>
    </figure>
  );
}

// ------------------------------------------------------------------ classifier
function Classifier({ onLoop }: { onLoop: (s: { active: boolean; iter: number; evals: number; metric: string }) => void }) {
  const [dataset, setDataset] = useState<'moons' | 'circles'>('moons');
  const [layers, setLayers] = useState(3);
  const [epochs, setEpochs] = useState(12);
  const [lr, setLr] = useState(0.1);
  const [seed, setSeed] = useState(1);
  const [log, setLog] = useState<any[]>([]);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const py = useData('qml');
  const start = async () => {
    setBusy(true); setLog([]); setRes(null); setErr(null);
    try {
      const out = await task('vqc', { dataset, layers, epochs, lr, seed }, (p) => {
        setLog((l) => [...l, p]);
        onLoop({ active: true, iter: p.epoch, evals: p.evals, metric: `loss ${p.loss.toFixed(3)}` });
      });
      setRes(out);
    } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
    onLoop({ active: false, iter: 0, evals: 0, metric: '' });
  };
  useEffect(() => {
    const c = canvas.current;
    if (!c || !res) return;
    const ctx = c.getContext('2d')!;
    const W = c.width, H = c.height, G = res.grid.length;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const p = res.grid[j][i];
      const a = Math.abs(p - 0.5) * 2;
      ctx.fillStyle = p > 0.5 ? `rgba(217,89,38,${0.12 + 0.45 * a})` : `rgba(57,135,229,${0.12 + 0.45 * a})`;
      ctx.fillRect((i / G) * W, (j / G) * H, W / G + 1, H / G + 1);
    }
    const toPx = (x: number[]) => [((x[0] + 1) / 2) * W, ((1 - x[1]) / 2) * H];
    res.data.Xte.forEach((x: number[], k: number) => {
      const [u, v] = toPx(x);
      ctx.beginPath(); ctx.arc(u, v, 4.5, 0, 2 * Math.PI);
      ctx.fillStyle = res.data.yte[k] ? '#d95926' : '#3987e5'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#0b0f16'; ctx.stroke();
    });
  }, [res]);
  const last = log[log.length - 1];
  const summary = py.data?.vqc?.summary?.[dataset];
  return (
    <Panel eyebrow="Experiments 1, 2 and 5 · variational classifier vs classical baselines" title="Quantum neural network (data re-uploading classifier)" right={<Badge g="sim" />}>
      <div className="stack" style={{ gap: '1rem' }}>
        <p className="small muted">Two qubits; each layer encodes the features with RY(πx₁)·RZ(πx₂), applies trainable RY/RZ rotations and a CZ. The prediction is the parity ⟨Z₀Z₁⟩. Gradients use the exact parameter-shift rule (2 extra circuit evaluations per parameter per sample), and the optimiser is Adam. Data, initialisation and splits are seeded.</p>
        <div className="row">
          <Seg label="Dataset" value={dataset} onChange={setDataset} options={[{ v: 'moons', l: 'Two moons' }, { v: 'circles', l: 'Circles' }]} />
          <label className="field" style={{ width: 110 }}>Layers<input id="vqc-layers" type="number" min={1} max={6} value={layers} onChange={(e) => setLayers(Math.max(1, Math.min(6, +e.target.value)))} /></label>
          <label className="field" style={{ width: 110 }}>Epochs<input id="vqc-epochs" type="number" min={1} max={60} value={epochs} onChange={(e) => setEpochs(Math.max(1, Math.min(60, +e.target.value)))} /></label>
          <label className="field" style={{ width: 110 }}>Learning rate<input id="vqc-lr" type="number" step={0.01} min={0.005} max={1} value={lr} onChange={(e) => setLr(+e.target.value)} /></label>
          <label className="field" style={{ width: 90 }}>Seed<input id="vqc-seed" type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} /></label>
          <button className="btn primary" onClick={start} disabled={busy}>{busy ? `Training… epoch ${last?.epoch ?? 0}/${epochs}` : 'Train'}</button>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <LineChart xLabel="epoch" yLabel="value" height={250} yDomain={[0, 1]}
            series={[{ name: 'training loss (BCE)', points: log.map((l) => ({ x: l.epoch, y: Math.min(1, l.loss) })) }, { name: 'train accuracy', points: log.map((l) => ({ x: l.epoch, y: l.trainAcc })) }, { name: 'test accuracy', points: log.map((l) => ({ x: l.epoch, y: l.testAcc })) }]}
            caption={last ? `${last.evals.toLocaleString()} circuit evaluations in ${(last.ms / 1000).toFixed(1)} s` : 'Press Train to start; curves update every epoch.'} />
          <figure>
            <canvas ref={canvas} width={360} height={360} style={{ width: '100%', maxWidth: 360, aspectRatio: '1', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)' }} aria-label="Learned decision regions with test points" />
            <figcaption>Learned decision regions (blue: class 0, orange: class 1) with held-out test points.</figcaption>
          </figure>
        </div>
        {res && (
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Model (browser, same split)</th><th className="num">Test accuracy</th><th className="num">Train time</th><th className="num">Parameters</th></tr></thead>
                <tbody>
                  <tr><td>VQC ({layers} layers, 2 qubits)</td><td className="num">{fmt.pct(last.testAcc)}</td><td className="num">{(last.ms / 1000).toFixed(2)} s</td><td className="num">{layers * 4}</td></tr>
                  {res.baselines.map((b: any) => <tr key={b.name}><td>{b.name}</td><td className="num">{fmt.pct(b.acc)}</td><td className="num">{(b.ms / 1000).toFixed(3)} s</td><td className="num">{b.params}</td></tr>)}
                </tbody>
              </table>
            </div>
            <LineChart xLabel="two-qubit depolarising p₂ (p₁ = p₂/10)" yLabel="value" height={230} yDomain={[0, 1]}
              series={[{ name: 'test accuracy', points: res.noise.map((n: any) => ({ x: n.p2, y: n.acc })) }, { name: 'mean |P − ½| margin', points: res.noise.map((n: any) => ({ x: n.p2, y: n.margin })) }]}
              caption="Experiment 5: the trained model evaluated under noise (density matrix). Accuracy holds, but margins shrink, so each prediction needs ∝ 1/margin² more shots." />
          </div>
        )}
        {summary && (
          <div className="stack" style={{ gap: '0.5rem' }}>
            <span className="eyebrow">Reference run · Python backend · 3 seeds · 95 % CI</span>
            <BarChart yLabel="test accuracy" height={220} yDomain={[0, 1.05]}
              groups={Object.entries(summary).map(([m, v]: [string, any]) => ({ label: m.replace(' (2 qubits, 3 layers)', '').replace(' (16 hidden)', ''), values: [{ name: 'test accuracy', v: v.test_acc.mean, lo: Math.max(0, v.test_acc.lo), hi: Math.min(1, v.test_acc.hi) }] }))}
              caption={`VQC train time ≈ ${summary['VQC (2 qubits, 3 layers)'].train_time_s.mean.toFixed(0)} s vs < 0.4 s for every classical model. No quantum advantage on these tasks.`} />
          </div>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------- QAOA
function Qaoa({ onLoop }: { onLoop: (s: any) => void }) {
  const [n, setN] = useState(10);
  const [p, setP] = useState(2);
  const [seed, setSeed] = useState(3);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const py = useData('qml');
  const start = async () => {
    setBusy(true); setRes(null);
    onLoop({ active: true, iter: 1, evals: 0, metric: 'optimising γ, β' });
    try { setRes(await task('qaoa', { n, p, seed, restarts: 4 })); } finally { setBusy(false); onLoop({ active: false, iter: 0, evals: 0, metric: '' }); }
  };
  const R = 92, C = 110;
  const pos = res ? Array.from({ length: res.graph.n }, (_, i) => [C + R * Math.cos((2 * Math.PI * i) / res.graph.n - Math.PI / 2), C + R * Math.sin((2 * Math.PI * i) / res.graph.n - Math.PI / 2)]) : [];
  const side = (i: number) => (res.bestIdx >> i) & 1;
  const pyRows = py.data?.qaoa?.rows ?? [];
  return (
    <Panel eyebrow="Experiment 3 · combinatorial optimisation" title="QAOA for MaxCut vs classical heuristics" right={<Badge g="sim" />}>
      <div className="stack" style={{ gap: '1rem' }}>
        <p className="small muted">Random 3-regular graph, cost layer e^(−iγC), mixer e^(−iβΣX), p layers. Angles are optimised with Nelder–Mead from 4 random starts on the exact statevector. Baselines are the brute-force optimum, greedy + 1-flip local search (20 starts), and simulated annealing (5 runs).</p>
        <div className="row">
          <label className="field" style={{ width: 120 }}>Nodes (even)<input id="qaoa-n" type="number" min={6} max={14} step={2} value={n} onChange={(e) => setN(Math.max(6, Math.min(14, 2 * Math.round(+e.target.value / 2))))} /></label>
          <label className="field" style={{ width: 100 }}>Layers p<input id="qaoa-p" type="number" min={1} max={4} value={p} onChange={(e) => setP(Math.max(1, Math.min(4, +e.target.value)))} /></label>
          <label className="field" style={{ width: 90 }}>Graph seed<input id="qaoa-seed" type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} /></label>
          <button className="btn primary" onClick={start} disabled={busy}>{busy ? 'Optimising…' : 'Solve'}</button>
        </div>
        {res && (
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <figure>
              <svg viewBox="0 0 220 220" style={{ width: '100%', maxWidth: 300 }} role="img" aria-label="Graph with the most likely optimal cut">
                {res.graph.edges.map(([a, b]: number[], i: number) => <line key={i} x1={pos[a][0]} y1={pos[a][1]} x2={pos[b][0]} y2={pos[b][1]} stroke={side(a) !== side(b) ? 'var(--gold)' : 'var(--line-2)'} strokeWidth={side(a) !== side(b) ? 2.2 : 1.2} strokeDasharray={side(a) !== side(b) ? '5 3' : undefined} />)}
                {pos.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r={10} fill={side(i) ? 'var(--s2)' : 'var(--s1)'} stroke="var(--surface)" strokeWidth={2} /><text x={x} y={y + 3.5} textAnchor="middle" style={{ fill: '#fff', font: '600 9px var(--f-mono)' }}>{i}</text></g>)}
              </svg>
              <figcaption>Most probable optimal cut found by QAOA (dashed gold edges are cut; colour marks the partition).</figcaption>
            </figure>
            <div className="stack">
              <div className="grid-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                <Stat v={res.ratio.toFixed(3)} k={`QAOA ⟨C⟩/C_max (p = ${p})`} />
                <Stat v={fmt.pct(res.pOpt)} k="probability of sampling an optimal cut" />
                <Stat v={res.annealing.mean.toFixed(3)} k={`simulated annealing (${res.annealing.ms.toFixed(0)} ms)`} />
                <Stat v={res.greedy.mean.toFixed(3)} k={`greedy + local search (${res.greedy.ms.toFixed(0)} ms)`} />
              </div>
              <p className="small muted">Random assignment gives {res.random.toFixed(3)}. QAOA optimisation took {(res.tq / 1000).toFixed(2)} s of exact simulation. On hardware, every objective evaluation also costs thousands of shots.</p>
            </div>
          </div>
        )}
        {pyRows.length > 0 && (
          <BarChart yLabel="approximation ratio" height={230} yDomain={[0.5, 1.02]}
            groups={[8, 10, 12].map((nn) => {
              const rows = pyRows.filter((r: any) => r.n === nn);
              const mean = (f: (r: any) => number) => rows.reduce((a: number, r: any) => a + f(r), 0) / rows.length;
              return { label: `n = ${nn}`, values: [
                { name: 'QAOA p=1', v: mean((r) => r.p1.approx_ratio) }, { name: 'QAOA p=3', v: mean((r) => r.p3.approx_ratio) },
                { name: 'greedy+local', v: mean((r) => r.greedy_local.mean_ratio) }, { name: 'annealing', v: mean((r) => r.annealing.mean_ratio) }] };
            })}
            caption="Reference run (Python, 4 graphs per size): simulated annealing reaches the optimum on every instance; QAOA at p ≤ 3 does not." />
        )}
      </div>
    </Panel>
  );
}

// -------------------------------------------------------------------- VQE
function Vqe({ onLoop }: { onLoop: (s: any) => void }) {
  const chem = useData('chemistry');
  const [ri, setRi] = useState(4);
  const [ansatz, setAnsatz] = useState<'pc' | 'hea'>('pc');
  const [p2, setP2] = useState(0);
  const [res, setRes] = useState<any>(null);
  const [points, setPoints] = useState<{ R: number; E: number; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  if (!chem.data) return <Panel title="VQE"><p className="muted">Loading Hamiltonians…</p></Panel>;
  const rows = chem.data.rows;
  const row = rows[Math.min(ri, rows.length - 1)];
  const start = async () => {
    setBusy(true); setRes(null);
    onLoop({ active: true, iter: 1, evals: 0, metric: 'minimising ⟨H⟩' });
    try {
      const out = await task('vqe', { terms: row.pauli_terms, ansatz, p2: ansatz === 'hea' ? p2 : 0 });
      setRes(out);
      setPoints((ps) => [...ps, { R: row.R, E: out.E, label: ansatz === 'pc' ? 'VQE (particle-conserving)' : p2 > 0 ? `VQE (HEA, p₂=${p2})` : 'VQE (HEA)' }]);
    } finally { setBusy(false); onLoop({ active: false, iter: 0, evals: 0, metric: '' }); }
  };
  const groups = [...new Set(points.map((p) => p.label))];
  return (
    <Panel eyebrow="Experiment 4 · quantum chemistry and scientific AI" title="VQE for the H₂ ground state (STO-3G, 4 qubits)" right={<Badge g="sim" />}>
      <div className="stack" style={{ gap: '1rem' }}>
        <p className="small muted">The Hamiltonians are built by the backend: PySCF integrals → our Jordan–Wigner construction (verified against FCI at all {rows.length} geometries) → {row.pauli_terms.length} Pauli terms. The browser evaluates ⟨H⟩ exactly and minimises it with Nelder–Mead. With noise, the hardware-efficient circuit is evaluated as a density matrix.</p>
        <div className="row">
          <label className="field" style={{ minWidth: 220, flex: 1, maxWidth: 320 }}>Bond length R = {row.R.toFixed(2)} Å
            <input id="vqe-r" type="range" min={0} max={rows.length - 1} step={1} value={ri} onChange={(e) => setRi(+e.target.value)} />
          </label>
          <Seg label="Ansatz" value={ansatz} onChange={setAnsatz} options={[{ v: 'pc', l: 'Particle-conserving (1 param)' }, { v: 'hea', l: 'Hardware-efficient (12 params)' }]} />
          {ansatz === 'hea' && <label className="field" style={{ width: 170 }}>2Q depolarising p₂
            <select id="vqe-noise" value={p2} onChange={(e) => setP2(+e.target.value)}>{[0, 1e-4, 3e-4, 1e-3, 3e-3].map((v) => <option key={v} value={v}>{v === 0 ? 'none' : v}</option>)}</select>
          </label>}
          <button className="btn primary" onClick={start} disabled={busy}>{busy ? 'Minimising…' : 'Run VQE'}</button>
        </div>
        {res && (
          <div className="grid-4">
            <Stat v={`${res.E.toFixed(6)} Ha`} k="VQE energy" />
            <Stat v={`${row.E_fci.toFixed(6)} Ha`} k="exact (FCI, PySCF)" />
            <Stat v={`${((res.E - row.E_fci) * 1000).toFixed(3)} mHa`} k="error" sub={Math.abs(res.E - row.E_fci) < 1.6e-3 ? 'within chemical accuracy (1.6 mHa)' : 'outside chemical accuracy'} />
            <Stat v={`${res.ms.toFixed(0)} ms`} k="optimisation time" />
          </div>
        )}
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <LineChart xLabel="bond length R (Å)" yLabel="energy (Ha)" height={260}
            series={[
              { name: 'FCI (exact)', points: rows.map((r: any) => ({ x: r.R, y: r.E_fci })), dash: false },
              { name: 'Hartree–Fock', points: rows.map((r: any) => ({ x: r.R, y: r.E_hf })), dash: true },
              ...groups.map((g) => ({ name: g, points: points.filter((p) => p.label === g).sort((a, b) => a.R - b.R).map((p) => ({ x: p.R, y: p.E })) })),
            ]}
            caption="Your VQE runs are added to the potential-energy curve as you go." />
          {res ? (
            <LineChart xLabel="optimiser iteration" yLabel="energy (Ha)" height={260} markers={false}
              series={[{ name: 'VQE energy', points: res.trace.map((t: any, i: number) => ({ x: i, y: t.E })) }]} hLines={[{ y: row.E_fci, label: 'FCI' }]} caption="Convergence of the classical optimiser." />
          ) : (
            <LineChart xLabel="two-qubit depolarising p₂" yLabel="error (mHa)" logX height={260}
              series={[{ name: 'reference HEA error', points: chem.data.noise.filter((n: any) => n.p2 > 0).map((n: any) => ({ x: n.p2, y: n.error * 1000 })) }]} hLines={[{ y: 1.6, label: 'chemical accuracy' }]}
              caption="Reference run: chemical accuracy survives only for p₂ ≤ 10⁻⁴ even on this 2-layer, 4-qubit circuit." />
          )}
        </div>
      </div>
    </Panel>
  );
}

function Concentration() {
  const q = useData('qml');
  const rows = q.data?.concentration?.rows ?? [];
  const maps = [...new Set(rows.map((r: any) => r.map))] as string[];
  return (
    <Panel eyebrow="Precomputed · Python backend" title="Why quantum kernels stop learning: exponential concentration" right={<Badge g="sim" />}>
      {rows.length > 0 && (
        <LineChart xLabel="qubits" yLabel="variance of off-diagonal kernel values" logY height={250}
          series={maps.map((m) => ({ name: m, points: rows.filter((r: any) => r.map === m).map((r: any) => ({ x: r.n_qubits, y: r.var })) }))}
          caption="Fidelity-kernel values crowd around their mean exponentially fast in the qubit count (Thanasilp et al. 2024), so exponentially many shots are needed to tell data points apart. Bandwidth scaling (Shaydulin & Wild 2022) avoids this, but such well-behaved models are the ones suspected to be classically simulable (Cerezo et al. 2025)." />
      )}
    </Panel>
  );
}

export default function QuantumAI() {
  const [loop, setLoop] = useState({ active: false, iter: 0, evals: 0, metric: '' });
  return (
    <>
      <PageHead eyebrow="Quantum AI Laboratory · every model trains live in your browser" title="Can quantum computing help artificial intelligence?">
        <p>Every experiment here runs, and every quantum model faces a classical baseline on identical data. The short answer from these experiments matches the literature: <strong>at simulable scales, the quantum models do not beat classical ones</strong>. The value of this lab is in measuring exactly why: data loading, shot noise, gate noise and kernel concentration.</p>
      </PageHead>
      <div className="wrap stack" style={{ gap: '1.4rem', paddingBottom: '3rem' }}>
        <Panel eyebrow="Hybrid AI–QPU workflow · live" title="The loop every variational algorithm runs">
          <HybridLoop {...loop} />
        </Panel>
        <Classifier onLoop={setLoop} />
        <Qaoa onLoop={setLoop} />
        <Vqe onLoop={setLoop} />
        <Concentration />
        <Panel eyebrow="Research assessment" title="Could quantum processors accelerate large language models?">
          <div className="grid-2">
            <div className="prose small">
              <p><strong>Obstacles, in order of severity.</strong> (1) <em>Data loading:</em> writing N classical numbers into amplitudes costs Ω(N) operations in general, removing exponential speed-ups for data-heavy training. (2) <em>Read-out:</em> each shot yields one bit-string, so estimating m outputs to precision ε needs O(m/ε²) shots. (3) <em>Noise and error correction:</em> logical qubits cost 10²–10³ physical qubits plus a µs-scale decoding loop. (4) <em>Classical competition:</em> GPUs improve every year, and dequantisation results remove several proposed speed-ups.</p>
            </div>
            <div className="prose small">
              <p><strong>Credible roles.</strong> Generating high-value training data that classical simulation cannot produce: electronic structure of strongly correlated molecules and materials, and quantum dynamics. This feeds scientific foundation models; it does not train LLMs directly. Sampling problems with verified hardness are a second candidate. Both need fault-tolerant hardware. <Badge g="model">Assessment</Badge></p>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
