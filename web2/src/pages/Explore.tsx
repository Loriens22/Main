import { Suspense, useEffect, useMemo, useState } from 'react';
import { Badge, PageHead, Panel, Seg } from '../components/ui';
import { COMP } from '../lib/components';
import { useData } from '../lib/data';
import { useStore, type Quality } from '../lib/store';
import { ChipOverlay, qubitRole, TYPE_COLOR, type Layout } from '../three/ChipOverlay';
import { ModelViewer, type Focus } from '../three/ModelViewer';
import { Stage } from '../three/Stage';

type Mode = 'system' | 'module' | 'chip';

const MODELS: Record<Mode, { url: string; foci: Record<string, Focus>; label: string; near: number; far: number; min: number; max: number; floor: { y: number; r: number } | null; explodeMax: number }> = {
  system: {
    url: 'models/q2_cryo.glb', label: 'AURORA-CRYO system', near: 0.02, far: 80, min: 0.3, max: 14, floor: { y: 0, r: 7 }, explodeMax: 1,
    foci: {
      all: { cam: [3.4, 2.5, 4.5], target: [0.4, 1.9, 0.2] },
      payload: { cam: [1.25, 1.45, 1.35], target: [0, 1.55, 0] },
      deck: { cam: [1.05, 2.95, 1.05], target: [0.2, 2.42, 0] },
      top: { cam: [1.6, 4.1, 1.9], target: [0, 3.0, 0] },
    },
  },
  module: {
    url: 'models/q2_module.glb', label: 'Toroid module package', near: 0.5, far: 2000, min: 8, max: 400, floor: { y: -0.05, r: 200 }, explodeMax: 1,
    foci: {
      all: { cam: [70, 62, 88], target: [0, 6, 0] },
      stack: { cam: [18, 24, 26], target: [0, 3, 0] },
      side: { cam: [96, 18, 6], target: [10, 6, 0] },
    },
  },
  chip: {
    url: 'models/q2_chip.glb', label: 'Toroid die stack', near: 0.05, far: 400, min: 1, max: 80, floor: null, explodeMax: 1.2,
    foci: {
      all: { cam: [15, 13, 19], target: [0, 1.5, 0] },
      top: { cam: [0, 26, 0.01], target: [0, 0, 0] },
      macro: { cam: [4.6, 3.2, 4.2], target: [1.2, 0.4, 0.4] },
    },
  },
};

export default function Explore() {
  const initial = (location.hash.split('-')[1] as Mode) || 'system';
  const [mode, setMode] = useState<Mode>(['system', 'module', 'chip'].includes(initial) ? initial : 'system');
  const [focus, setFocus] = useState('all');
  const [explode, setExplode] = useState(0);
  const [shields, setShields] = useState(false);
  const [xray, setXray] = useState(false);
  const [thermal, setThermal] = useState(false);
  const [labels, setLabels] = useState(true);
  const [rotate, setRotate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [comps, setComps] = useState<{ id: string; label: string; shield: boolean }[]>([]);
  const [overlay, setOverlay] = useState<'all' | 'long' | 'none'>('all');
  const [qubit, setQubit] = useState<string | null>('L37');
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const { data: layout } = useData<Layout>('q2_layout');
  const M = MODELS[mode];

  useEffect(() => { setFocus('all'); setSelected(null); setExplode(0); setComps([]); }, [mode]);
  useEffect(() => {
    const on = () => { const m = location.hash.split('-')[1] as Mode; if (m && ['system', 'module', 'chip'].includes(m)) setMode(m); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const qInfo = useMemo(() => {
    if (!layout || !qubit) return null;
    const q = layout.qubits.find((x) => x.id === qubit);
    if (!q) return null;
    const edges = layout.edges.filter((e) => e.a === qubit || e.b === qubit).map((e) => ({ other: e.a === qubit ? e.b : e.a, term: e.term, layer: e.layer, len: e.len_mm, wrap: e.wrap }));
    return { q, edges };
  }, [layout, qubit]);

  const info = selected ? COMP[selected] : null;
  return (
    <>
      <PageHead eyebrow={<><b>Explore</b> · Blender-built digital twin</>} title="Walk through the machine, from fridge to qubit">
        <p>Three linked models, generated procedurally in Blender from the same layout engine and parameters as the simulations. Click any part to see what it is, why it is there, and where its numbers come from. In the chip view, click a qubit to trace its six couplings.</p>
      </PageHead>
      <div className="wrap stack" style={{ paddingBottom: '3rem' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Seg label="Model" value={mode} onChange={(v) => { setMode(v); history.replaceState(null, '', `#explore-${v}`); }} options={[{ v: 'system', l: 'AURORA-CRYO system' }, { v: 'module', l: 'Toroid module' }, { v: 'chip', l: 'Toroid chip' }]} />
          <Seg label="Render quality" value={quality} onChange={(v) => setQuality(v as Quality)} options={[{ v: 'low', l: 'Low' }, { v: 'medium', l: 'Medium' }, { v: 'high', l: 'High' }]} />
        </div>
        <div className="explore-grid">
          <div className="stack" style={{ gap: '0.6rem', minWidth: 0 }}>
            <Stage key={mode} label={`${M.label} 3D view`} height="min(72vh, 680px)" camera={{ position: M.foci.all.cam, fov: 38, near: M.near, far: M.far }}
              overlay={<div className="hud" style={{ left: 12, bottom: 10 }}><span className="chip-label">{M.label} · drag to orbit · scroll to zoom · click to inspect</span></div>}>
              <Suspense fallback={null}>
                <ModelViewer url={M.url} foci={M.foci} focus={focus} explode={explode * M.explodeMax} showShields={shields} xray={xray}
                  thermal={mode === 'system' && thermal} labels={mode === 'system' && labels} selected={selected} onSelect={setSelected}
                  onIndex={setComps} autoRotate={rotate} minDistance={M.min} maxDistance={M.max} floor={M.floor}>
                  {mode === 'chip' && layout && overlay !== 'none' && (
                    <ChipOverlay layout={layout} selected={qubit} onSelect={setQubit} show={overlay} lift={explode * 1.2 * 0.8} />
                  )}
                </ModelViewer>
              </Suspense>
            </Stage>
            <div className="panel tight controls-bar">
              <label className="field" style={{ minWidth: 180, flex: '1 1 180px' }}>Exploded view
                <input id="explode" type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(+e.target.value)} />
              </label>
              <div className="row" style={{ gap: '0.4rem' }}>
                {Object.keys(M.foci).map((f) => <button key={f} type="button" className="btn sm" aria-pressed={focus === f} onClick={() => setFocus(f)}>{f}</button>)}
              </div>
              <div className="row" style={{ gap: '0.4rem' }}>
                {mode !== 'chip' && <button type="button" className="btn sm" aria-pressed={shields} onClick={() => setShields(!shields)}>Shields</button>}
                {mode !== 'chip' && <button type="button" className="btn sm" aria-pressed={xray} onClick={() => setXray(!xray)}>X-ray</button>}
                {mode === 'system' && <button type="button" className="btn sm" aria-pressed={thermal} onClick={() => setThermal(!thermal)}>Thermal stages</button>}
                {mode === 'system' && <button type="button" className="btn sm" aria-pressed={labels} onClick={() => setLabels(!labels)}>Labels</button>}
                {mode === 'chip' && <Seg label="Coupling overlay" value={overlay} onChange={setOverlay} options={[{ v: 'all', l: 'All couplers' }, { v: 'long', l: 'Long-range' }, { v: 'none', l: 'Off' }]} />}
                <button type="button" className="btn sm" aria-pressed={rotate} onClick={() => setRotate(!rotate)}>Auto-rotate</button>
              </div>
            </div>
          </div>
          <aside className="stack" style={{ gap: '0.8rem', minWidth: 0 }}>
            {mode === 'chip' && qInfo && (
              <Panel eyebrow="Selected qubit" title={<span className="mono">{qInfo.q.id}</span>} right={<span className="qdot" style={{ background: TYPE_COLOR[qInfo.q.type] }} />}>
                <p className="small muted">{qubitRole(qInfo.q.type)} · grid ({qInfo.q.r}, {qInfo.q.c}) · feedline {qInfo.q.feedline}</p>
                <div className="table-wrap" style={{ marginTop: '0.6rem' }}>
                  <table>
                    <thead><tr><th>To</th><th>Term</th><th>Layer</th><th className="num">mm</th></tr></thead>
                    <tbody>{qInfo.edges.map((e) => (
                      <tr key={e.other + e.term}><td className="mono"><button type="button" className="linkish" onClick={() => setQubit(e.other)}>{e.other}</button></td><td className="mono">{e.term}</td>
                        <td>{e.layer === 'die' ? 'die (NN)' : e.wrap ? 'interposer · wrap' : 'interposer'}</td><td className="num">{e.len.toFixed(2)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="small muted" style={{ marginTop: '0.5rem' }}>White lines show this qubit’s six couplings. Gold: long-range x³/y³ couplers; violet: torus wrap-around edges (both routed in the interposer).</p>
              </Panel>
            )}
            <Panel eyebrow={info ? 'Selected component' : 'Inspector'} title={info ? info.title : 'Click a part of the model'} right={info && <Badge g={info.grade} />}>
              {info ? (
                <div className="stack" style={{ gap: '0.6rem' }}>
                  <p className="small" style={{ color: 'var(--fg-2)' }}>{info.what}</p>
                  {info.why && <p className="small muted">{info.why}</p>}
                  {info.facts.length > 0 && <dl className="facts">{info.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
                  {info.src && <p className="small muted">Source: {info.src}</p>}
                </div>
              ) : <p className="small muted">Every component carries its role, the reason for including it, key numbers, and an evidence grade: reported literature, simulated here, analytical model, or engineering proposal.</p>}
            </Panel>
            <Panel eyebrow="Components" title={`${comps.length} parts`}>
              <div className="comp-list">
                {comps.map((c) => (
                  <button key={c.id} type="button" className="comp-item" aria-pressed={selected === c.id} onClick={() => setSelected(selected === c.id ? null : c.id)}>
                    <span>{COMP[c.id]?.title ?? c.label}</span>{c.shield && <span className="muted small">shield</span>}
                  </button>
                ))}
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </>
  );
}
