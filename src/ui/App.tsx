import { DockHud } from './DockHud';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../core/Game';
import { bus } from '../core/events';
import { DEFAULT_BINDINGS, PRESETS, PresetName } from '../core/Settings';
import { panels, ui, useUI } from './store';
import './styles.css';

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} KM` : `${Math.round(m / 10) * 10} M`);

function Loading() {
  const l = useUI((s) => s.loading);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!l.active) { const t = setTimeout(() => setGone(true), 1300); return () => clearTimeout(t); }
    setGone(false);
  }, [l.active]);
  if (gone) return null;
  return (
    <div class={`layer loading ${l.active ? '' : 'hidden'}`}>
      <div class="box">
        <div class="label caps">{l.label}</div>
        <div class="bar"><i style={{ width: `${Math.round(l.f * 100)}%` }} /></div>
      </div>
    </div>
  );
}

function MainMenu({ game }: { game: Game }) {
  const ready = useUI((s) => s.menuReady);
  const [view, setView] = useState<'root' | 'play' | 'settings'>('root');
  if (view === 'settings') return <div class="layer shade interactive"><Sheet game={game} title="Settings" only="settings" onClose={() => setView('root')} /></div>;
  return (
    <div class={`layer menu ${ready ? 'show' : ''}`}>
      <h1>INTERSTELLAR<small>BEYOND ENDURANCE</small></h1>
      <nav>
        <button class="mbtn" onClick={() => { bus.emit('ui:click'); setView(view === 'play' ? 'root' : 'play'); }}>Play</button>
        {view === 'play' && <button class="mbtn sub" onClick={() => { bus.emit('ui:click'); bus.emit('ui:start', 'creative'); }}>Creative Mode</button>}
        <button class="mbtn" onClick={() => { bus.emit('ui:click'); setView('settings'); }}>Settings</button>
      </nav>
      <div class="foot">UNOFFICIAL FAN PROJECT — NOT AFFILIATED WITH THE FILM'S RIGHTS HOLDERS</div>
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div class="seg">{options.map(([v, label]) => <button class={v === value ? 'on' : ''} onClick={() => { bus.emit('ui:click'); onChange(v); }}>{label}</button>)}</div>;
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button class={`toggle ${on ? 'on' : ''}`} onClick={() => { bus.emit('ui:click'); onChange(!on); }}><i /></button>;
}
function Slider({ value, min, max, step, onChange, fmt }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return <><input type="range" min={min} max={max} step={step} value={value} onInput={(e) => onChange(parseFloat((e.target as HTMLInputElement).value))} /><span class="val">{fmt ? fmt(value) : value.toFixed(2)}</span></>;
}
function Row({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return <div class="row"><label>{label}{hint && <small>{hint}</small>}</label>{children}</div>;
}

const LVL3: [number, string][] = [[0, 'Low'], [1, 'Medium'], [2, 'High']];
const LVL3OFF: [number, string][] = [[0, 'Off'], [1, 'On'], [2, 'High']];

function SettingsBody({ game, tab }: { game: Game; tab: string }) {
  const [, force] = useState(0);
  const s = game.settings;
  const re = () => force((n) => n + 1);
  const g = s.g, a = s.a, c = s.c, cr = s.creative;
  const setG = (k: any, v: any) => { s.setGraphics(k, v); re(); };
  const [capturing, setCapturing] = useState<string | null>(null);
  if (tab === 'graphics') return (
    <>
      <h3>Preset</h3>
      <Row label="Quality preset" hint="Sets every option below. Lower presets reduce lighting, post-processing, vegetation and view distance.">
        <Seg value={g.preset as string} options={(Object.keys(PRESETS) as PresetName[]).map((p) => [p, p] as [string, string])} onChange={(p) => { s.applyPreset(p as PresetName); re(); }} />
      </Row>
      <h3>Image</h3>
      <Row label="Resolution scale"><Slider value={g.resolutionScale} min={0.4} max={1} step={0.05} onChange={(v) => setG('resolutionScale', v)} fmt={(v) => `${Math.round(v * 100)}%`} /></Row>
      <Row label="Anti-aliasing"><Seg value={g.antialiasing} options={[[0, 'Off'], [1, 'SMAA'], [2, 'SMAA High']]} onChange={(v) => setG('antialiasing', v)} /></Row>
      <Row label="Texture quality"><Seg value={g.textureQuality} options={LVL3} onChange={(v) => setG('textureQuality', v)} /></Row>
      <Row label="Frame-rate cap"><Seg value={g.fpsCap} options={[[0, 'Display'], [30, '30'], [60, '60'], [120, '120']]} onChange={(v) => setG('fpsCap', v)} /></Row>
      <h3>Lighting</h3>
      <Row label="Shadow quality"><Seg value={g.shadowQuality} options={[[0, 'Off'], [1, 'Low'], [2, 'Medium'], [3, 'High']]} onChange={(v) => setG('shadowQuality', v)} /></Row>
      <Row label="Reflections" hint="Environment lighting resolution and refresh rate"><Seg value={g.reflections} options={LVL3} onChange={(v) => setG('reflections', v)} /></Row>
      <Row label="Ambient occlusion"><Seg value={g.ambientOcclusion} options={LVL3OFF} onChange={(v) => setG('ambientOcclusion', v)} /></Row>
      <Row label="Bloom"><Toggle on={g.bloom} onChange={(v) => setG('bloom', v)} /></Row>
      <h3>World</h3>
      <Row label="Atmospheric quality" hint="Sky scattering samples"><Seg value={g.atmosphere} options={LVL3} onChange={(v) => setG('atmosphere', v)} /></Row>
      <Row label="Volumetric effects" hint="Dust, haze and spray density"><Seg value={g.volumetrics} options={LVL3OFF} onChange={(v) => setG('volumetrics', v)} /></Row>
      <Row label="Water quality"><Seg value={g.water} options={LVL3} onChange={(v) => setG('water', v)} /></Row>
      <Row label="View distance"><Slider value={g.viewDistance} min={0.5} max={1.5} step={0.05} onChange={(v) => setG('viewDistance', v)} fmt={(v) => `${Math.round(v * 100)}%`} /></Row>
      <Row label="Vegetation density"><Slider value={g.vegetation} min={0.3} max={1.5} step={0.05} onChange={(v) => setG('vegetation', v)} fmt={(v) => `${Math.round(v * 100)}%`} /></Row>
      <h3>Camera</h3>
      <Row label="Motion blur"><Toggle on={g.motionBlur} onChange={(v) => setG('motionBlur', v)} /></Row>
      <Row label="Film grain"><Toggle on={g.filmGrain} onChange={(v) => setG('filmGrain', v)} /></Row>
      <Row label="Lens effects" hint="Vignette and highlight halation"><Toggle on={g.lensEffects} onChange={(v) => setG('lensEffects', v)} /></Row>
    </>
  );
  if (tab === 'audio') {
    const set = (k: keyof typeof a, v: any) => { (a as any)[k] = v; s.changed('audio'); re(); };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    return (
      <>
        <h3>Volume</h3>
        <Row label="Master volume"><Slider value={a.master} min={0} max={1} step={0.01} onChange={(v) => set('master', v)} fmt={pct} /></Row>
        <Row label="Music"><Slider value={a.music} min={0} max={1} step={0.01} onChange={(v) => set('music', v)} fmt={pct} /></Row>
        <Row label="Sound effects"><Slider value={a.sfx} min={0} max={1} step={0.01} onChange={(v) => set('sfx', v)} fmt={pct} /></Row>
        <Row label="Dialogue"><Slider value={a.dialogue} min={0} max={1} step={0.01} onChange={(v) => set('dialogue', v)} fmt={pct} /></Row>
        <Row label="Ambience"><Slider value={a.ambience} min={0} max={1} step={0.01} onChange={(v) => set('ambience', v)} fmt={pct} /></Row>
        <h3>Speech</h3>
        <Row label="Spoken dialogue" hint="Uses the browser's built-in speech synthesis when available. Subtitles are always shown."><Toggle on={a.voice} onChange={(v) => set('voice', v)} /></Row>
      </>
    );
  }
  if (tab === 'controls') {
    const set = (k: keyof typeof c, v: any) => { (c as any)[k] = v; s.changed('controls'); re(); };
    const names: [string, string][] = [
      ['forward', 'Move forward / accelerate / pitch down'], ['back', 'Move back / brake / pitch up'], ['left', 'Move left / steer / yaw'], ['right', 'Move right / steer / yaw'],
      ['jump', 'Jump / float up / handbrake'], ['sprint', 'Run'], ['crouch', 'Crouch / float down'], ['interact', 'Interact'], ['exit', 'Leave seat or vehicle'],
      ['camera', 'Change camera'], ['computer', 'Mission computer'], ['creative', 'Creative Mode options'], ['crew', 'Crew commands'], ['headlights', 'Lights'],
      ['throttleUp', 'Throttle up'], ['throttleDown', 'Throttle down'], ['throttleCut', 'Cut throttle'], ['rollLeft', 'Roll left'], ['rollRight', 'Roll right'],
      ['transFwd', 'Translate forward'], ['transBack', 'Translate back'], ['transLeft', 'Translate left'], ['transRight', 'Translate right'], ['transUp', 'Translate up'], ['transDown', 'Translate down'],
      ['sas', 'Attitude stabilisation'], ['gear', 'Landing gear'], ['autopilot', 'Autopilot panel'], ['vtol', 'Vertical thrust'],
    ];
    return (
      <>
        <h3>Look</h3>
        <Row label="Mouse sensitivity"><Slider value={c.mouseSensitivity} min={0.2} max={3} step={0.05} onChange={(v) => set('mouseSensitivity', v)} /></Row>
        <Row label="Gamepad sensitivity"><Slider value={c.gamepadSensitivity} min={0.2} max={3} step={0.05} onChange={(v) => set('gamepadSensitivity', v)} /></Row>
        <Row label="Invert look Y"><Toggle on={c.invertY} onChange={(v) => set('invertY', v)} /></Row>
        <Row label="Invert flight pitch"><Toggle on={c.invertFlightPitch} onChange={(v) => set('invertFlightPitch', v)} /></Row>
        <Row label="Touch control size"><Slider value={c.touchScale} min={0.7} max={1.6} step={0.05} onChange={(v) => set('touchScale', v)} fmt={(v) => `${Math.round(v * 100)}%`} /></Row>
        <h3>Key bindings</h3>
        {names.map(([id, label]) => (
          <Row label={label}>
            <button class="btn" onClick={() => { setCapturing(id); game.input.captureKey((code) => { c.bindings[id] = [code]; s.changed('controls'); setCapturing(null); }); }}>
              {capturing === id ? 'Press a key…' : (c.bindings[id] || []).map((k) => k.replace(/^Key|^Digit/, '')).join(' / ') || '—'}
            </button>
          </Row>
        ))}
        <div class="btnrow"><button class="btn" onClick={() => { c.bindings = structuredClone(DEFAULT_BINDINGS); s.changed('controls'); re(); }}>Reset bindings</button></div>
      </>
    );
  }
  if (tab === 'creative') {
    const set = (k: Exclude<keyof typeof cr, 'science'>, v: boolean) => { cr[k] = v; s.changed('creative'); re(); };
    return (
      <>
        <h3>Creative Mode assistance</h3>
        <Row label="Unlimited resource assist" hint="Fuel, power and consumables never run out."><Toggle on={cr.unlimitedResources} onChange={(v) => set('unlimitedResources', v)} /></Row>
        <Row label="Automatic refuelling" hint="Allows the 10-second refuel command from spacecraft management."><Toggle on={cr.autoRefuel} onChange={(v) => set('autoRefuel', v)} /></Row>
        <Row label="Automatic repair" hint="Damaged systems are diagnosed and repaired without the crew."><Toggle on={cr.autoRepair} onChange={(v) => set('autoRepair', v)} /></Row>
        <Row label="Autopilot assistance" hint="Stability help in manual flight; autopilots available for launch, docking, landing and return."><Toggle on={cr.autopilotAssist} onChange={(v) => set('autopilotAssist', v)} /></Row>
        <Row label="Damage protection" hint="Hazards (waves, impacts, vacuum) cannot disable you or the vehicles."><Toggle on={cr.damageProtection} onChange={(v) => set('damageProtection', v)} /></Row>
        <Row label="Fast travel" hint="Enables return-to-base and destination shortcuts."><Toggle on={cr.fastTravel} onChange={(v) => set('fastTravel', v)} /></Row>
        <Row label="Free camera" hint="Detach the camera and fly it freely (movement keys, run to speed up)."><Toggle on={cr.freeCamera} onChange={(v) => set('freeCamera', v)} /></Row>
        <h3>Science presentation</h3>
        <Row label="Speculative biospheres" hint="On: the speculative-evolution life of Mars and Jupiter (original hypothetical species, labelled in the field codex). Off: scientific mode, as known today (no life found there); takes effect on the next landing."><Toggle on={cr.science !== 'conservative'} onChange={(v) => { cr.science = v ? 'speculative' : 'conservative'; s.changed('creative'); re(); }} /></Row>
        <h3>Recovery</h3>
        <div class="btnrow">
          <button class="btn" onClick={() => bus.emit('creative:recover')}>Recover spacecraft</button>
          <button class="btn" onClick={() => bus.emit('creative:returnBase')}>Return to base</button>
          <button class="btn warn" onClick={() => bus.emit('creative:reset')}>Mission reset</button>
        </div>
      </>
    );
  }
  return null;
}

function Sheet({ game, title, only, onClose }: { game: Game; title: string; only?: 'settings'; onClose: () => void }) {
  const [tab, setTab] = useState(only ? 'graphics' : 'root');
  const settingsTabs: [string, string][] = [['graphics', 'Graphics'], ['audio', 'Audio'], ['controls', 'Controls']];
  const item = (id: string, label: string, fn?: () => void) => <button class={`mbtn ${tab === id ? 'on' : ''}`} onClick={() => { bus.emit('ui:click'); fn ? fn() : setTab(id); }}>{label}</button>;
  return (
    <div class="sheet interactive">
      <aside>
        <h2>{title}</h2>
        {!only && item('resume', 'Resume game', onClose)}
        {!only && item('graphics', 'Settings')}
        {only && settingsTabs.map(([id, l]) => item(id, l))}
        {!only && item('computer', 'Mission computer', () => { onClose(); bus.emit('ui:panel', 'mission'); })}
        {!only && item('craft', 'Spacecraft management', () => { onClose(); bus.emit('ui:panel', 'craft'); })}
        {!only && item('creative', 'Creative Mode options')}
        {!only && item('save', 'Save game', () => bus.emit('ui:save'))}
        {!only && item('load', 'Load game', () => { bus.emit('ui:load'); onClose(); })}
        {!only && item('exit', 'Return to main menu', () => bus.emit('ui:mainmenu'))}
        {only && item('back', 'Back', onClose)}
      </aside>
      <main>
        {!only && ['graphics', 'audio', 'controls'].includes(tab) && <div class="btnrow" style={{ marginTop: 0, marginBottom: 18 }}>{settingsTabs.map(([id, l]) => <button class="btn" style={tab === id ? { background: 'var(--ink)', color: '#0b0c0d' } : {}} onClick={() => setTab(id)}>{l}</button>)}</div>}
        {tab === 'root' ? <Help /> : <SettingsBody game={game} tab={tab} />}
      </main>
    </div>
  );
}

function Help() {
  return (
    <>
      <h3>On foot</h3>
      <div class="kv"><span>Move / look</span><b>W A S D · mouse</b></div>
      <div class="kv"><span>Run · jump · crouch</span><b>Shift · Space · C</b></div>
      <div class="kv"><span>Interact · leave seat</span><b>E · F</b></div>
      <div class="kv"><span>Crew commands · mission computer</span><b>G · M</b></div>
      <h3>Road vehicles and farm machines</h3>
      <div class="kv"><span>Accelerate / brake · steer</span><b>W / S · A / D</b></div>
      <div class="kv"><span>Handbrake · lights · camera</span><b>Space · H · V</b></div>
      <h3>Spacecraft</h3>
      <div class="kv"><span>Pitch · yaw · roll</span><b>W / S · A / D · Q / E</b></div>
      <div class="kv"><span>Throttle up / down · cut</span><b>Shift / Ctrl · X</b></div>
      <div class="kv"><span>Translate (RCS)</span><b>I K J L U O</b></div>
      <div class="kv"><span>Vertical thrust · gear · stabilise</span><b>Space · N · R</b></div>
      <div class="kv"><span>Autopilot panel · camera</span><b>Y · V</b></div>
    </>
  );
}

/** a cracked visor: a starburst of fractures from an impact point, frost creeping in from the edges */
function Visor({ k }: { k: number }) {
  const cracks: string[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cx = 640, cy = 300;
  const run = (x: number, y: number, a: number, n: number, depth: number) => {
    let d = `M${x.toFixed(0)} ${y.toFixed(0)}`;
    for (let j = 0; j < n; j++) {
      a += (rnd() - 0.5) * 0.9;
      const L = 12 + rnd() * 38;
      x += Math.cos(a) * L; y += Math.sin(a) * L;
      d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
      // fractures fork as they run
      if (depth < 2 && rnd() < 0.28) run(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), 2 + Math.floor(rnd() * 4), depth + 1);
    }
    cracks.push(d);
  };
  for (let i = 0; i < 13; i++) run(cx, cy, (i / 13) * Math.PI * 2 + rnd() * 0.4, 5 + Math.floor(rnd() * 7), 0);
  // the ring fractures round the impact
  for (let r = 0; r < 2; r++) { let d = ''; const R = 18 + r * 22; for (let k = 0; k <= 14; k++) { const t = (k / 14) * Math.PI * 2; const q = R * (0.85 + rnd() * 0.3); d += `${k ? ' L' : 'M'}${(cx + Math.cos(t) * q).toFixed(0)} ${(cy + Math.sin(t) * q).toFixed(0)}`; } cracks.push(d); }
  return (
    <svg class="visor" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" style={{ opacity: Math.min(1, 0.35 + k) }}>
      <defs><radialGradient id="vfrost" cx="50%" cy="50%" r="70%"><stop offset="55%" stop-color="#cfe6ff" stop-opacity="0" /><stop offset="100%" stop-color="#e8f4ff" stop-opacity={0.25 + 0.5 * k} /></radialGradient></defs>
      <rect width="1000" height="600" fill="url(#vfrost)" />
      {cracks.map((d) => <path d={d} fill="none" stroke="#f4fbff" stroke-width="1.1" stroke-opacity="0.7" stroke-linejoin="bevel" />)}
      <circle cx={cx} cy={cy} r="9" fill="none" stroke="#f4fbff" stroke-opacity="0.8" stroke-width="2" />
    </svg>
  );
}

function Hud() {
  const s = useUI((x) => x);
  if (s.screen !== 'none') return null;
  const now = performance.now();
  return (
    <div class="layer hud">
      {s.visor > 0 && <Visor k={s.visor} />}
      {s.mode !== 'cinematic' && !s.panel && <div class="cross" />}
      {s.prompt && !s.panel && <div class="prompt">{!s.touch && <kbd>{s.promptKey}</kbd>}{s.prompt}</div>}
      {s.location && <div class="loc">{s.location}</div>}
      {s.clocks.length > 0 && <div class="clocks">{s.clocks.map((c) => <div><span>{c.label}</span>{c.value}</div>)}</div>}
      {s.gps && <div class="gps"><span>{s.gps.name}</span><b>{fmtDist(s.gps.dist)}</b></div>}
      {s.gauges.length > 0 && <div class="gauges">{s.gauges.map((g) => <div class={`gauge ${g.warn ? 'warn' : ''}`}><b>{g.value}</b><span>{g.label}</span></div>)}</div>}
      {s.hints.length > 0 && !s.touch && <div class="hints">{s.hints.map((h) => <div>{h}</div>)}</div>}
      {s.alert && <div class="alert">{s.alert}</div>}
      {s.subtitle && s.subtitle.until > now && <div class="subtitle">{s.subtitle.speaker && <b>{s.subtitle.speaker}</b>}{s.subtitle.text}</div>}
      <div class="toasts">{s.toasts.map((t) => <div class={`toast ${t.kind}`}>{t.text}</div>)}</div>
      <DockHud />
    </div>
  );
}

function PanelHost({ game }: { game: Game }) {
  const id = useUI((s) => s.panel);
  const props = useUI((s) => s.panelProps);
  useUI((s) => s.tick);
  if (!id) return null;
  const C = panels.get(id);
  if (!C) return null;
  return <div class="layer panel-wrap interactive"><C game={game} {...(props || {})} close={() => bus.emit('ui:closePanel')} /></div>;
}

export function PanelFrame({ title, sub, close, children, tabs, tab, setTab }: { title: string; sub?: string; close: () => void; children: any; tabs?: [string, string][]; tab?: string; setTab?: (t: string) => void }) {
  return (
    <div class="panel">
      <header><h2>{title}{sub && <small>{sub}</small>}</h2><button class="btn" onClick={close}>Close</button></header>
      {tabs && <div class="tabs">{tabs.map(([id, l]) => <button class={tab === id ? 'on' : ''} onClick={() => { bus.emit('ui:click'); setTab?.(id); }}>{l}</button>)}</div>}
      <div class="body">{children}</div>
    </div>
  );
}

function Touch({ game }: { game: Game }) {
  const mode = useUI((s) => s.mode);
  const screen = useUI((s) => s.screen);
  const panel = useUI((s) => s.panel);
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLElement>(null);
  const [sprint, setSprint] = useState(false);
  const inp = game.input;
  useEffect(() => {
    const el = stick.current;
    if (!el) return;
    let id = -1;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const r = el.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      inp.setVirtualAxis('moveX', x);
      inp.setVirtualAxis('moveY', -y);
      if (knob.current) knob.current.style.transform = `translate(${x * 38}px, ${y * 38}px)`;
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      inp.setVirtualAxis('moveX', 0);
      inp.setVirtualAxis('moveY', 0);
      if (knob.current) knob.current.style.transform = '';
    };
    const start = (e: PointerEvent) => { id = e.pointerId; el.setPointerCapture(id); move(e); };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return () => { el.removeEventListener('pointerdown', start); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); };
  }, [screen, panel]);
  const look = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = look.current;
    if (!el) return;
    let id = -1, lx = 0, ly = 0;
    const down = (e: PointerEvent) => { id = e.pointerId; lx = e.clientX; ly = e.clientY; el.setPointerCapture(id); };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      inp.addLook((e.clientX - lx) * 0.005 * game.settings.c.mouseSensitivity, (e.clientY - ly) * 0.005 * game.settings.c.mouseSensitivity);
      lx = e.clientX; ly = e.clientY;
    };
    const up = (e: PointerEvent) => { if (e.pointerId === id) id = -1; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  }, [screen, panel]);
  if (screen !== 'none' || panel) return null;
  const sc = game.settings.c.touchScale;
  const hold = (action: string, label: string) => (
    <button class="tb" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); inp.setVirtualDown(action, true); }} onPointerUp={() => inp.setVirtualDown(action, false)} onPointerCancel={() => inp.setVirtualDown(action, false)}>{label}</button>
  );
  const tap = (action: string, label: string) => <button class="tb" onPointerDown={() => inp.tapVirtual(action)}>{label}</button>;
  let buttons: any;
  if (mode === 'drive') buttons = <>{tap('camera', 'Cam')}{tap('headlights', 'Lights')}{tap('exit', 'Exit')}{hold('brake', 'Brake')}{tap('interact', 'Use')}{tap('computer', 'Menu')}</>;
  else if (mode === 'fly') buttons = <>{hold('throttleUp', 'Thr +')}{hold('rollLeft', 'Roll L')}{hold('rollRight', 'Roll R')}{hold('throttleDown', 'Thr −')}{hold('vtol', 'Lift')}{tap('autopilot', 'Auto')}{tap('camera', 'Cam')}{tap('gear', 'Gear')}{tap('exit', 'Seat')}</>;
  else buttons = <>{tap('crew', 'Crew')}{tap('computer', 'Comp')}{tap('exit', 'Exit')}<button class={`tb ${sprint ? 'on' : ''}`} onPointerDown={() => { const v = !sprint; setSprint(v); inp.setVirtualDown('sprint', v); }}>Run</button>{hold('crouch', 'Crouch')}{hold('jump', 'Jump')}<span />{tap('interact', 'Use')}<span /></>;
  return (
    <div class="layer touch" style={{ fontSize: `${sc}em` }}>
      <div class="look" ref={look} />
      <div class="stick" ref={stick} style={{ transform: `scale(${sc})`, transformOrigin: 'bottom left' }}><i ref={knob as any} /></div>
      <div class="tbtns" style={{ transform: `scale(${sc})`, transformOrigin: 'bottom right' }}>{buttons}</div>
      <button class="btn tmenu interactive" onClick={() => bus.emit('ui:pause')}>Menu</button>
    </div>
  );
}

function Root({ game }: { game: Game }) {
  const screen = useUI((s) => s.screen);
  const touch = useUI((s) => s.touch);
  return (
    <>
      <Hud />
      {touch && <Touch game={game} />}
      <PanelHost game={game} />
      {screen === 'menu' && <MainMenu game={game} />}
      {screen === 'pause' && <div class="layer shade interactive"><Sheet game={game} title="Paused" onClose={() => bus.emit('ui:resume')} /></div>}
      <Loading />
    </>
  );
}

export function mountUI(game: Game) {
  render(<Root game={game} />, document.getElementById('ui')!);
}
