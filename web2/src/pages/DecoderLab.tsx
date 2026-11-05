import { useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, SERIES, type Series } from '../components/charts';
import { Badge, PageHead, Panel, Seg } from '../components/ui';
import { bpDecode, tanner, type DecodeResult } from '../lib/bp';
import { getCode, kOf, logicalZ, syndrome, toroidPlacement, type CSSCode } from '../lib/codes';
import { mulberry32 } from '../lib/rng';

const CODES = [
  { v: 'bb72', l: 'bb72 [[72,12,6]]' },
  { v: 'gross144', l: 'gross [[144,12,12]]' },
  { v: 'bb288', l: 'two-gross [[288,12,18]]' },
  { v: 'surface_d5', l: 'surface d=5' },
  { v: 'surface_d9', l: 'surface d=9' },
];

interface Node { x: number; y: number; kind: 'data' | 'zc' | 'xc'; idx: number }

function geometry(code: CSSCode) {
  const nodes: Node[] = [];
  if (code.family === 'bb') {
    const { R, C, pos } = toroidPlacement(code);
    const lm = code.l! * code.m!;
    for (const q of pos) {
      const kind = q.type === 'L' || q.type === 'R' ? 'data' : q.type === 'Z' ? 'zc' : 'xc';
      const idx = q.type === 'L' ? q.idx : q.type === 'R' ? lm + q.idx : q.idx;
      nodes.push({ x: q.r, y: q.c, kind, idx });
    }
    return { nodes, W: R, H: C, torus: true };
  }
  const d = code.d;
  for (let r = 0; r < d; r++) for (let c = 0; c < d; c++) nodes.push({ x: 2 * c + 1, y: 2 * r + 1, kind: 'data', idx: r * d + c });
  const place = (H: Uint8Array[], kind: 'zc' | 'xc') => H.forEach((row, i) => {
    const qs = [...row].flatMap((v, j) => (v ? [j] : []));
    let x = qs.reduce((a, j) => a + 2 * (j % d) + 1, 0) / qs.length;
    let y = qs.reduce((a, j) => a + 2 * Math.floor(j / d) + 1, 0) / qs.length;
    if (qs.length === 2) {
      if (Math.abs(x - d) > Math.abs(y - d)) x += x < d ? -1 : 1; else y += y < d ? -1 : 1;
    }
    nodes.push({ x, y, kind, idx: i });
  });
  place(code.HZ, 'zc');
  place(code.HX, 'xc');
  return { nodes, W: 2 * d + 1, H: 2 * d + 1, torus: false };
}

export default function DecoderLab() {
  const [name, setName] = useState('gross144');
  const [p, setP] = useState(0.04);
  const [seed, setSeed] = useState(11);
  const code = useMemo(() => getCode(name), [name]);
  const T = useMemo(() => tanner(code.HZ), [code]);
  const Lz = useMemo(() => logicalZ(code), [code]);
  const k = useMemo(() => kOf(code), [code]);
  const geo = useMemo(() => geometry(code), [code]);
  const [err, setErr] = useState<Uint8Array>(() => new Uint8Array(code.n));
  const [res, setRes] = useState<DecodeResult | null>(null);
  const [step, setStep] = useState(-1);

  const randomize = (sd = seed) => {
    const rng = mulberry32(sd);
    const e = new Uint8Array(code.n);
    for (let j = 0; j < code.n; j++) if (rng() < p) e[j] = 1;
    setErr(e); setRes(null); setStep(-1);
  };
  useEffect(() => { randomize(seed); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const syn = useMemo(() => syndrome(code.HZ, err), [code, err]);
  const decode = () => {
    const r = bpDecode(T, syn, Math.max(p, 1e-3), 60, 0.625, true);
    setRes(r);
    setStep((r.history?.length ?? 1) - 1);
  };
  const shown = res ? (step >= 0 && res.history && step < res.history.length && !(res.osd && step === res.history.length - 1) ? res.history[step] : res.correction) : null;
  const residual = res ? err.map((v, j) => v ^ res.correction[j]) : null;
  const logicalFail = residual ? Lz.some((z) => z.reduce((a, v, j) => a ^ (v & residual[j]), 0)) : false;
  const synAfter = residual ? syndrome(code.HZ, residual).some((v) => v) : false;
  const weight = err.reduce((a, v) => a + v, 0);

  const cell = code.family === 'bb' ? (code.n > 200 ? 20 : 24) : code.d > 7 ? 22 : 30;
  const pad = 14;
  const toggle = (j: number) => { const e = err.slice(); e[j] ^= 1; setErr(e); setRes(null); setStep(-1); };

  return (
    <>
      <PageHead eyebrow={<><b>Decoder Lab</b> · runs in your browser</>} title="Break the code, then watch BP-OSD repair it">
        <p>Click data qubits to place X errors, or draw them at random. The highlighted Z checks are the syndrome the decoder sees. Belief propagation (min-sum, scaling 0.625) runs on the Tanner graph; if it does not converge, OSD-0 solves the remaining linear system. This is the same decoder family as our circuit-level study, here in the code-capacity setting (perfect syndrome measurement).</p>
      </PageHead>
      <div className="wrap stack" style={{ paddingBottom: '3rem' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Seg label="Code" value={name} onChange={setName} options={CODES} />
          <span className="mono small muted">n = {code.n} · k = {k} · d = {code.d} · {code.HZ.length} Z checks (weight {code.family === 'bb' ? 6 : '2–4'})</span>
        </div>
        <div className="decoder-grid">
          <Panel eyebrow={geo.torus ? 'Toroid placement · edges wrap around (torus)' : 'Rotated surface code'} title={code.label}>
            <div className="svg-scroll">
              <svg className="tanner" width={geo.W * cell + 2 * pad} height={geo.H * cell + 2 * pad} viewBox={`0 0 ${geo.W * cell + 2 * pad} ${geo.H * cell + 2 * pad}`} role="img" aria-label="Qubits and checks of the selected code">
                <rect x={0} y={0} width={geo.W * cell + 2 * pad} height={geo.H * cell + 2 * pad} fill="var(--bg-2)" rx={8} />
                {geo.nodes.map((nd, i) => {
                  const cx = pad + nd.x * cell + cell / 2, cy = pad + nd.y * cell + cell / 2;
                  if (nd.kind === 'xc') return <rect key={i} x={cx - 3} y={cy - 3} width={6} height={6} fill="var(--line-2)" />;
                  if (nd.kind === 'zc') {
                    const lit = syn[nd.idx] === 1;
                    return <rect key={i} x={cx - cell * 0.3} y={cy - cell * 0.3} width={cell * 0.6} height={cell * 0.6} rx={2} fill={lit ? 'var(--warn)' : 'var(--surface-3)'} stroke={lit ? 'var(--warn)' : 'var(--line-2)'} />;
                  }
                  const e = err[nd.idx] === 1, c = shown?.[nd.idx] === 1;
                  return (
                    <g key={i} onClick={() => toggle(nd.idx)} style={{ cursor: 'pointer' }}>
                      <circle cx={cx} cy={cy} r={cell * 0.34} fill={e ? 'var(--bad)' : 'var(--surface-2)'} stroke={e ? 'var(--bad)' : 'var(--line-2)'} />
                      {c && <circle cx={cx} cy={cy} r={cell * 0.44} fill="none" stroke="var(--cyan)" strokeWidth={2.2} />}
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="legend" style={{ marginTop: '0.6rem' }}>
              <span><i style={{ background: 'var(--bad)' }} />X error</span>
              <span><i style={{ background: 'var(--warn)' }} />violated Z check</span>
              <span><i style={{ background: 'var(--cyan)' }} />decoder correction</span>
              <span><i style={{ background: 'var(--line-2)' }} />X check (not used for X errors)</span>
            </div>
          </Panel>
          <div className="stack" style={{ gap: '0.8rem', minWidth: 0 }}>
            <Panel eyebrow="Inject errors" title={`${weight} X error${weight === 1 ? '' : 's'}`}>
              <div className="stack" style={{ gap: '0.6rem' }}>
                <label className="field">Physical error rate p = {p.toFixed(3)}
                  <input id="p-slider" type="range" min={0.002} max={0.15} step={0.001} value={p} onChange={(e) => setP(+e.target.value)} />
                </label>
                <div className="row">
                  <button type="button" className="btn" onClick={() => { const s = seed + 1; setSeed(s); randomize(s); }}>Random errors</button>
                  <button type="button" className="btn ghost" onClick={() => { setErr(new Uint8Array(code.n)); setRes(null); }}>Clear</button>
                  <button type="button" className="btn primary" onClick={decode} disabled={!syn.some((v) => v)}>Decode</button>
                </div>
              </div>
            </Panel>
            <Panel eyebrow="Decoder" title={res ? (logicalFail ? 'Logical error' : 'Corrected') : 'Waiting'} right={res && <Badge g={logicalFail ? 'neg' : 'ok'}>{logicalFail ? 'logical flip' : 'success'}</Badge>}>
              {res ? (
                <div className="stack" style={{ gap: '0.6rem' }}>
                  <dl className="facts">
                    <div><dt>BP</dt><dd>{res.converged ? `converged in ${res.iterations} iterations` : `no convergence in ${res.iterations} → OSD-0`}</dd></div>
                    <div><dt>Correction weight</dt><dd>{res.correction.reduce((a, v) => a + v, 0)}</dd></div>
                    <div><dt>Residual syndrome</dt><dd>{synAfter ? 'non-zero (bug)' : 'zero'}</dd></div>
                    <div><dt>Residual</dt><dd>{logicalFail ? 'anticommutes with a logical Z (failure)' : 'a stabiliser (success)'}</dd></div>
                  </dl>
                  {res.history && res.history.length > 1 && (
                    <label className="field">BP iteration {Math.min(step + 1, res.history.length)} / {res.history.length}{res.osd ? ' (final: OSD)' : ''}
                      <input id="bp-step" type="range" min={0} max={res.history.length - 1} value={step} onChange={(e) => setStep(+e.target.value)} />
                    </label>
                  )}
                </div>
              ) : <p className="small muted">Press Decode. The cyan rings show the decoder’s estimate. Step through BP iterations to watch messages settle on the torus.</p>}
            </Panel>
          </div>
        </div>
        <MonteCarlo />
      </div>
    </>
  );
}

function MonteCarlo() {
  const [codes, setCodes] = useState<string[]>(['bb72', 'gross144', 'surface_d5', 'surface_d9']);
  const [trials, setTrials] = useState(600);
  const [points, setPoints] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [norm, setNorm] = useState<'block' | 'perq'>('perq');
  const w = useRef<Worker | null>(null);
  const ps = [0.02, 0.035, 0.05, 0.065, 0.08, 0.1];
  const run = () => {
    w.current?.terminate();
    const wk = new Worker(new URL('../workers/decoder.worker.ts', import.meta.url), { type: 'module' });
    w.current = wk;
    setPoints([]); setRunning(true);
    wk.onmessage = (e) => {
      if (e.data.type === 'point') setPoints((p) => [...p, e.data]);
      else { setRunning(false); wk.terminate(); }
    };
    wk.onerror = () => setRunning(false);
    wk.postMessage({ id: 1, codes, ps, trials, seed: 2026 });
  };
  useEffect(() => () => w.current?.terminate(), []);
  const perQ = (x: number, k: number) => 1 - Math.pow(1 - x, 1 / k);
  const series: Series[] = codes.map((c, i) => ({
    name: CODES.find((x) => x.v === c)?.l ?? c,
    color: SERIES[i],
    points: points.filter((q) => q.code === c && q.fails > 0).map((q) => norm === 'block'
      ? { x: q.p, y: q.rate, lo: q.lo, hi: q.hi }
      : { x: q.p, y: q.perQubit, lo: perQ(q.lo, q.k), hi: perQ(q.hi, q.k) }),
  }));
  return (
    <Panel eyebrow="Monte-Carlo · code capacity · Web Worker" title="Logical failure rate vs physical error rate"
      right={<div className="row"><Seg label="Normalisation" value={norm} onChange={setNorm} options={[{ v: 'perq', l: 'per logical qubit' }, { v: 'block', l: 'per code block' }]} /><button type="button" className="btn primary" onClick={run} disabled={running}>{running ? `Running… ${points.length}/${codes.length * ps.length}` : 'Run simulation'}</button></div>}>
      <div className="row" style={{ marginBottom: '0.8rem' }}>
        {CODES.map((c) => (
          <label key={c.v} className="check"><input type="checkbox" id={`mc-${c.v}`} checked={codes.includes(c.v)} onChange={(e) => setCodes(e.target.checked ? [...codes, c.v] : codes.filter((x) => x !== c.v))} />{c.l}</label>
        ))}
        <label className="field" style={{ width: 150 }}>Trials per point
          <select id="mc-trials" value={trials} onChange={(e) => setTrials(+e.target.value)}>{[200, 600, 2000, 5000].map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </label>
      </div>
      {points.length ? (
        <LineChart series={series} xLabel="physical X-error rate p" yLabel={norm === 'perq' ? 'failure per logical qubit' : 'block failure'} logX logY markers
          caption="Wilson 95 % intervals. Code capacity (perfect syndromes) overstates every threshold; the circuit-level numbers are on the Results page." />
      ) : <p className="small muted">Press Run to sample fresh errors in a background thread. Normalised per logical qubit, the 12-logical-qubit bivariate bicycle codes can be compared fairly with the 1-logical-qubit surface code.</p>}
    </Panel>
  );
}
