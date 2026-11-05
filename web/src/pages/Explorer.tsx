import { useEffect, useMemo, useState } from 'react';
import { COMPONENTS, type ComponentInfo } from '../data/components';
import { useData } from '../lib/data';
import { useStore, type Quality } from '../lib/store';
import { layerDurations, makeTwin } from '../lib/twin';
import { LIBRARY } from '../quantum/library';
import { Badge, PageHead, Panel, Seg, Stat } from '../components/ui';
import { ChipTwinModel, QubitTag, type ChipLayout } from '../three/ChipTwin';
import { InstallationModel, type Focus } from '../three/Installation';
import { PackageModel } from '../three/PackageView';
import { Stage } from '../three/Stage';

const STATUS: Record<ComponentInfo['status'], { g: 'ok' | 'prop' | 'model'; l: string }> = {
  standard: { g: 'ok', l: 'Standard practice' }, proposal: { g: 'prop', l: 'AURORA-Q proposal' }, illustrative: { g: 'model', l: 'Illustrative' },
};

function InfoPanel({ id, onOpen }: { id: string | null; onOpen?: (m: 'module' | 'chip') => void }) {
  if (!id || !COMPONENTS[id]) {
    return (
      <Panel eyebrow="Component inspector" title="Select a component">
        <p className="muted small">Click any part of the model, or choose it from the list. The inspector explains what it does physically, its temperature stage and its materials, and says whether it is standard practice or an AURORA-Q proposal.</p>
      </Panel>
    );
  }
  const c = COMPONENTS[id];
  return (
    <Panel eyebrow={`${c.group} · ${c.stage}`} title={c.title} right={<Badge g={STATUS[c.status].g}>{STATUS[c.status].l}</Badge>}>
      <div className="stack" style={{ gap: '0.7rem' }}>
        <p style={{ color: 'var(--fg)' }}>{c.role}</p>
        <p className="small" style={{ color: 'var(--fg-2)' }}>{c.physics}</p>
        <p className="small muted"><span className="eyebrow">Materials</span><br />{c.materials}</p>
        {id === 'qpu_module' && onOpen && <div className="row"><button className="btn sm primary" onClick={() => onOpen('module')}>Open module close-up</button><button className="btn sm" onClick={() => onOpen('chip')}>Open chip twin</button></div>}
        {id === 'pkg_die' && onOpen && <button className="btn sm primary" onClick={() => onOpen('chip')}>Open chip twin</button>}
      </div>
    </Panel>
  );
}

function ComponentList({ ids, selected, onSelect }: { ids: string[]; selected: string | null; onSelect: (id: string) => void }) {
  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    ids.forEach((id) => { const k = COMPONENTS[id]?.group ?? 'Other'; g.set(k, [...(g.get(k) ?? []), id]); });
    return [...g.entries()];
  }, [ids]);
  return (
    <div className="stack" style={{ gap: '0.6rem' }}>
      {groups.map(([g, list]) => (
        <div key={g} className="stack" style={{ gap: '0.25rem' }}>
          <span className="eyebrow">{g}</span>
          <div className="row" style={{ gap: '0.3rem' }}>
            {list.map((id) => <button key={id} className="btn sm" aria-pressed={selected === id} onClick={() => onSelect(id)}>{COMPONENTS[id]?.title ?? id}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

const INSTALL_IDS = ['plate_300k', 'plate_50k', 'plate_4k', 'plate_still', 'plate_cold', 'plate_mxc', 'pulse_tube', 'coax_lines', 'attenuators', 'flex_lines', 'readout_chain', 'qpu_module', 'shield_mag', 'shield_still', 'shield_4k', 'shield_50k', 'ovc', 'frame', 'rack_control', 'rack_decoder', 'rack_hpc', 'ghs', 'compressor', 'cable_tray'];
const PKG_IDS = ['pkg_lid', 'pkg_clamps', 'pkg_cover', 'pkg_wirebonds', 'pkg_die', 'pkg_filter_die', 'pkg_interposer', 'pkg_pcb', 'pkg_connectors', 'pkg_base'];

function QualityPicker() {
  const { quality, setQuality } = useStore();
  return <Seg<Quality> label="Rendering quality" value={quality} onChange={setQuality} options={[{ v: 'low', l: 'Low' }, { v: 'medium', l: 'Medium' }, { v: 'high', l: 'High' }]} />;
}

function InstallationMode({ onOpen }: { onOpen: (m: 'module' | 'chip') => void }) {
  const [explode, setExplode] = useState(0);
  const [shields, setShields] = useState(false);
  const [xray, setXray] = useState(false);
  const [thermal, setThermal] = useState(false);
  const [labels, setLabels] = useState(true);
  const [flow, setFlow] = useState(false);
  const [focus, setFocus] = useState<Focus>('all');
  const [sel, setSel] = useState<string | null>(null);
  const select = (id: string | null) => {
    setSel(id);
    if (id === 'qpu_module') setFocus('module');
    else if (id && id.startsWith('plate_')) setFocus('cryostat');
  };
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 2.2fr) minmax(280px, 1fr)', alignItems: 'start' }}>
      <div className="stack">
        <Stage label="AURORA-Q installation 3D viewer" camera={{ position: [3.3, 2.2, 4.7], fov: 38 }} height="min(70vh, 680px)"
          overlay={<div className="hud" style={{ left: 12, bottom: 10 }}>Drag to orbit · scroll to zoom · click to inspect{thermal && ' · thermal tint is a conceptual visualisation of nominal stage temperatures'}{flow && ' · signal pulses are conceptual'}</div>}>
          <InstallationModel explode={explode} showShields={shields} xray={xray} thermal={thermal} labels={labels} selected={sel} onSelect={select} focus={focus} flow={flow} />
        </Stage>
        <div className="panel row" style={{ justifyContent: 'space-between' }}>
          <Seg<Focus> label="Camera focus" value={focus} onChange={setFocus} options={[{ v: 'all', l: 'Installation' }, { v: 'cryostat', l: 'Cryostat' }, { v: 'module', l: 'QPU module' }, { v: 'top', l: 'Top plate' }]} />
          <label className="field" style={{ minWidth: 200, flex: 1, maxWidth: 320 }}>Exploded view · {(explode * 100).toFixed(0)} %
            <input id="explode" type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(+e.target.value)} />
          </label>
          <div className="row" style={{ gap: '0.35rem' }}>
            <button className="btn sm" aria-pressed={shields} onClick={() => setShields(!shields)}>Shields</button>
            <button className="btn sm" aria-pressed={xray} onClick={() => setXray(!xray)}>X-ray</button>
            <button className="btn sm" aria-pressed={labels} onClick={() => setLabels(!labels)}>Stage temps</button>
            <button className="btn sm" aria-pressed={thermal} onClick={() => setThermal(!thermal)}>Thermal tint</button>
            <button className="btn sm" aria-pressed={flow} onClick={() => setFlow(!flow)}>Signal flow</button>
          </div>
          <QualityPicker />
        </div>
      </div>
      <div className="stack">
        <InfoPanel id={sel} onOpen={onOpen} />
        <Panel eyebrow="Components" title="Inspect by name"><ComponentList ids={INSTALL_IDS} selected={sel} onSelect={select} /></Panel>
      </div>
    </div>
  );
}

function ModuleMode({ onOpen }: { onOpen: (m: 'chip') => void }) {
  const [explode, setExplode] = useState(0.6);
  const [hideLid, setHideLid] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 2.2fr) minmax(280px, 1fr)', alignItems: 'start' }}>
      <div className="stack">
        <Stage label="AURORA-Q T1 module close-up" camera={{ position: [3.1, 3.3, 4.3], fov: 35 }} height="min(70vh, 640px)" envIntensity={1.0}
          overlay={<div className="hud" style={{ left: 12, bottom: 10 }}>Package 110 × 120 mm · drag to orbit · click a layer</div>}>
          <PackageModel explode={explode} selected={sel} onSelect={setSel} hideLid={hideLid} />
        </Stage>
        <div className="panel row" style={{ justifyContent: 'space-between' }}>
          <label className="field" style={{ minWidth: 220, flex: 1, maxWidth: 360 }}>Exploded layers · {(explode * 100).toFixed(0)} %
            <input id="pkg-explode" type="range" min={0} max={1.2} step={0.01} value={explode} onChange={(e) => setExplode(+e.target.value)} />
          </label>
          <button className="btn sm" aria-pressed={hideLid} onClick={() => setHideLid(!hideLid)}>Hide lid</button>
          <QualityPicker />
        </div>
      </div>
      <div className="stack">
        <InfoPanel id={sel} onOpen={(m) => m === 'chip' && onOpen('chip')} />
        <Panel eyebrow="Layers" title="Package stack"><ComponentList ids={PKG_IDS} selected={sel} onSelect={setSel} /></Panel>
      </div>
    </div>
  );
}

function ChipMode() {
  const layout = useData<ChipLayout>('chip_layout');
  const { twin, setTwin } = useStore();
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.5);
  const [explode, setExplode] = useState(0);
  const [interposer, setInterposer] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!twin) loadDemo('ghz120');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTime(0); setPlaying(true); }, [twin]);
  const L = twin?.route.layers.length ?? 0;
  useEffect(() => {
    if (!playing || !twin) return;
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000; last = t;
      setTime((x) => { const n = x + dt * speed * Math.max(1, L / 40); if (n >= L + 0.999) { setPlaying(false); return L + 0.999; } return n; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, L, twin]);
  function loadDemo(id: string) {
    const ex = LIBRARY.find((e) => e.id === id)!;
    setBusy(true);
    setTimeout(() => { setTwin(makeTwin(ex.build(), id === 'ghz120' ? 'ideal' : 'nighthawk_r2_class', id === 'ghz120' ? 400 : 4000)); setBusy(false); }, 30);
  }
  const durs = useMemo(() => (twin ? layerDurations(twin.route.layers) : []), [twin]);
  const total = durs.reduce((a, b) => a + b, 0);
  const elapsed = durs.slice(0, Math.min(L, Math.floor(time))).reduce((a, b) => a + b, 0);
  const layer = twin && Math.floor(time) < L ? twin.route.layers[Math.floor(time)] : [];
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 2.2fr) minmax(280px, 1fr)', alignItems: 'start' }}>
      <div className="stack">
        {layout.data ? (
          <Stage label="AURORA-Q T1 die digital twin" camera={{ position: [0.9, 1.6, 1.7], fov: 38, near: 0.05, far: 50 }} height="min(70vh, 660px)" envIntensity={0.75}
            overlay={<div className="hud" style={{ left: 12, bottom: 10, right: 12 }}>Glow encodes the routed schedule and measured statistics; it is a conceptual visualisation, not an image of a quantum state. Die 20 × 20 mm, heights exaggerated.</div>}>
            <ChipTwinModel layout={layout.data} twin={twin} time={time} explode={explode} onHover={setHover} showInterposer={interposer} />
            {hover !== null && <QubitTag layout={layout.data} q={hover} />}
          </Stage>
        ) : <div className="canvas-frame" style={{ height: 480 }}><div className="loader">Loading chip layout…</div></div>}
        <div className="panel row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: '0.35rem' }}>
            <button className="btn sm primary" onClick={() => { if (time >= L) setTime(0); setPlaying(!playing); }} disabled={!twin}>{playing ? 'Pause' : time >= L ? 'Replay' : 'Play'}</button>
            <button className="btn sm" onClick={() => { setPlaying(false); setTime((t) => Math.min(L + 0.999, Math.floor(t) + 1)); }} disabled={!twin}>Step layer</button>
            <button className="btn sm" onClick={() => { setPlaying(false); setTime(L + 0.999); }} disabled={!twin}>Show results</button>
          </div>
          <label className="field" style={{ minWidth: 160, flex: 1, maxWidth: 260 }}>Playback speed · {speed.toFixed(1)}×
            <input id="speed" type="range" min={0.3} max={6} step={0.1} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
          </label>
          <label className="field" style={{ minWidth: 160, flex: 1, maxWidth: 260 }}>Lift layers · {(explode * 100).toFixed(0)} %
            <input id="chip-explode" type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(+e.target.value)} />
          </label>
          <button className="btn sm" aria-pressed={interposer} onClick={() => setInterposer(!interposer)}>Interposer</button>
          <QualityPicker />
        </div>
        <div className="panel stack" style={{ gap: '0.5rem' }}>
          <span className="eyebrow">Load a circuit into the twin</span>
          <div className="row" style={{ gap: '0.35rem' }}>
            {['ghz120', 'bell', 'grover3', 'qft_period', 'qaoa_ring', 'rep_code', 'random8'].map((id) => (
              <button key={id} className="btn sm" disabled={busy} onClick={() => loadDemo(id)}>{LIBRARY.find((e) => e.id === id)!.title}</button>
            ))}
            <a className="btn sm ghost" href="#lab">Build your own in the Lab →</a>
          </div>
        </div>
      </div>
      <div className="stack">
        <Panel eyebrow={twin ? `${twin.noiseLabel} · ${twin.result.method}` : 'No run loaded'} title="Execution telemetry">
          {twin ? (
            <div className="stack" style={{ gap: '0.9rem' }}>
              <div className="grid-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <Stat v={twin.circuit.num_qubits} k="logical qubits" />
                <Stat v={twin.route.usedPhysical.length} k="physical qubits touched" />
                <Stat v={twin.route.logical2q} k="2Q gates (logical)" />
                <Stat v={twin.route.physical2q} k="2Q gates after routing" sub={`${twin.route.swaps} SWAPs inserted`} />
                <Stat v={`${Math.min(L, Math.floor(time))} / ${L}`} k="schedule layer" />
                <Stat v={`${(elapsed / 1000).toFixed(2)} / ${(total / 1000).toFixed(2)} µs`} k="estimated QPU time" sub="assumed durations" />
                <Stat v={twin.result.shots.toLocaleString()} k="shots" />
                <Stat v={`${twin.result.elapsedMs.toFixed(0)} ms`} k="browser execution" />
              </div>
              <div className="stack" style={{ gap: '0.3rem' }}>
                <span className="eyebrow">Current layer</span>
                <div className="mono small" style={{ maxHeight: 96, overflow: 'auto', color: 'var(--fg-2)' }}>
                  {layer.length ? layer.slice(0, 40).map((o, i) => <span key={i}>{o.name}({o.qubits.map((q) => 'Q' + q).join(',')}) </span>) : time >= L ? 'Schedule complete: qubits glow with measured P(1).' : '—'}
                </div>
              </div>
              <div className="legend">
                <span><i style={{ background: '#7fb0ff' }} />1Q gate</span><span><i style={{ background: '#b9a2ff' }} />2Q gate</span>
                <span><i style={{ background: '#ff8f6b' }} />SWAP</span><span><i style={{ background: '#e8c27a' }} />measure</span><span><i style={{ background: '#3ecf8e' }} />reset</span>
              </div>
              {twin.result.notes.length > 0 && <p className="small muted">{twin.result.notes.join(' ')}</p>}
            </div>
          ) : <p className="muted">{busy ? 'Running…' : 'Loading the GHZ-120 demonstration…'}</p>}
        </Panel>
        <InfoPanel id={hover !== null ? 'chip_features' : 'chip_die'} />
      </div>
    </div>
  );
}

export default function Explorer() {
  const { explorerMode, setExplorerMode } = useStore();
  return (
    <>
      <PageHead eyebrow="Interactive 3D explorer · Blender-generated GLB assets" title="Digital twin of the AURORA-Q installation">
        <p>Three linked scales: the full cryogenic installation, the gold-plated T1 module, and the 120-qubit die. The die view replays the routed schedule of circuits executed by the engine, so what lights up is what your circuit actually did.</p>
      </PageHead>
      <div className="wrap stack" style={{ paddingBottom: '3rem' }}>
        <Seg label="Explorer scale" value={explorerMode} onChange={setExplorerMode} options={[{ v: 'installation', l: 'Installation (1 : 1, metres)' }, { v: 'module', l: 'QPU module' }, { v: 'chip', l: 'Chip twin (120 qubits)' }]} />
        {explorerMode === 'installation' && <InstallationMode onOpen={setExplorerMode} />}
        {explorerMode === 'module' && <ModuleMode onOpen={setExplorerMode} />}
        {explorerMode === 'chip' && <ChipMode />}
      </div>
    </>
  );
}
