import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MascotAnchor, MascotLayer, useMascot, useMascotBackend } from './MascotLayer';
import type { Emotion, MascotAction, MascotId, Quality, RoamMode, StageStats } from './types';

const EMOTIONS: Emotion[] = [
  'idle',
  'happy',
  'excited',
  'thinking',
  'working',
  'listening',
  'speaking',
  'confused',
  'sad',
  'error',
  'celebrate',
  'sleepy',
  'surprised',
  'love',
];
const ACTIONS: MascotAction[] = ['poke', 'wave', 'jump', 'spin', 'nod', 'shake', 'celebrate', 'flinch', 'peek'];
const ROAMS: RoamMode[] = ['off', 'gentle', 'explore'];

const params = new URLSearchParams(location.search);

function Controls({
  theme,
  setTheme,
  quality,
  setQuality,
  reduced,
  setReduced,
  sparkyAnchor,
  setSparkyAnchor,
  big,
  setBig,
}: {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  quality: Quality;
  setQuality: (q: Quality) => void;
  reduced: boolean;
  setReduced: (v: boolean) => void;
  sparkyAnchor: boolean;
  setSparkyAnchor: (v: boolean) => void;
  big: number;
  setBig: (v: number) => void;
}) {
  const api = useMascot();
  const backend = useMascotBackend();
  const [target, setTarget] = useState<MascotId | 'both'>('both');
  const [speak, setSpeak] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [stats, setStats] = useState<StageStats | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const ids: MascotId[] = target === 'both' ? ['maverick', 'sparky'] : [target];

  useEffect(() => {
    const iv = setInterval(() => setStats(api.getStats()), 500);
    const off = api.onInteract((id, kind) => setLog((l) => [`${id}: ${kind}`, ...l].slice(0, 6)));
    (window as unknown as { __mascot: typeof api }).__mascot = api;
    (window as unknown as { __beretCheck: () => Promise<unknown> }).__beretCheck = async () =>
      (await import('./debug')).beretClearanceReport();
    return () => {
      clearInterval(iv);
      off();
    };
  }, [api]);

  useEffect(() => {
    if (!autoSpeak && speak <= 0) return;
    let raf = 0;
    const loop = (t: number) => {
      const lvl = autoSpeak ? Math.max(0, Math.sin(t / 90) * 0.5 + Math.sin(t / 37) * 0.35 + 0.25) : speak;
      for (const id of ids) api.setSpeaking(id, lvl);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [autoSpeak, speak, target, api]);

  const fg = theme === 'dark' ? '#e8eefc' : '#121726';
  const btn: React.CSSProperties = {
    padding: '6px 10px',
    margin: 3,
    borderRadius: 10,
    border: `1px solid ${theme === 'dark' ? '#2a3348' : '#cfd6e6'}`,
    background: theme === 'dark' ? '#151b28' : '#ffffff',
    color: fg,
    font: '600 12px system-ui',
    cursor: 'pointer',
  };
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: 10, color: fg, font: '12px system-ui', zIndex: 60, background: theme === 'dark' ? 'rgba(8,10,16,0.82)' : 'rgba(255,255,255,0.86)', backdropFilter: 'blur(12px)' }}>
      <div>
        <b>Target</b>
        {(['both', 'maverick', 'sparky'] as const).map((t) => (
          <button key={t} style={{ ...btn, outline: target === t ? '2px solid #2f8cff' : 'none' }} onClick={() => setTarget(t)}>
            {t}
          </button>
        ))}
        <button style={btn} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          theme: {theme}
        </button>
        <select style={btn} value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
          {(['auto', 'high', 'medium', 'low'] as Quality[]).map((q) => (
            <option key={q}>{q}</option>
          ))}
        </select>
        <button style={btn} onClick={() => setReduced(!reduced)}>
          reduced: {String(reduced)}
        </button>
        <button style={btn} onClick={() => setSparkyAnchor(!sparkyAnchor)}>
          sparky: {sparkyAnchor ? 'own anchor' : 'companion'}
        </button>
        <button style={btn} onClick={() => setBig(big === 220 ? 110 : 220)}>
          size {big}
        </button>
      </div>
      <div>
        <b>Emotion</b>
        {EMOTIONS.map((e) => (
          <button key={e} data-emotion={e} style={btn} onClick={() => ids.forEach((id) => api.setEmotion(id, e))}>
            {e}
          </button>
        ))}
      </div>
      <div>
        <b>Action</b>
        {ACTIONS.map((a) => (
          <button key={a} style={btn} onClick={() => ids.forEach((id) => api.react(id, a))}>
            {a}
          </button>
        ))}
        <b style={{ marginLeft: 8 }}>Roam</b>
        {ROAMS.map((r) => (
          <button key={r} style={btn} onClick={() => ids.forEach((id) => api.roam(id, r))}>
            {r}
          </button>
        ))}
        <button style={btn} onClick={() => ids.forEach((id) => api.moveTo(id, { x: 80 + Math.random() * (innerWidth - 160), y: 140 + Math.random() * 200 }))}>
          moveTo random
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b>Speaking</b>
        <input type="range" min={0} max={1} step={0.01} value={speak} onChange={(e) => setSpeak(parseFloat(e.target.value))} />
        <button style={btn} onClick={() => setAutoSpeak(!autoSpeak)}>
          auto-speak: {String(autoSpeak)}
        </button>
        <span data-testid="stats">
          backend {backend} · {stats ? `${stats.fps} fps · ${stats.frameMs} ms · ${stats.drawCalls} calls · ${stats.triangles} tris · ${stats.quality} · dpr ${stats.dpr}` : '…'}
        </span>
        <span style={{ opacity: 0.7 }}>{log.join(' | ')}</span>
      </div>
    </div>
  );
}

function Lab() {
  const [theme, setTheme] = useState<'light' | 'dark'>((params.get('theme') as 'light' | 'dark') ?? 'dark');
  const [quality, setQuality] = useState<Quality>((params.get('quality') as Quality) ?? 'auto');
  const [reduced, setReduced] = useState(params.get('reduced') === '1');
  const [sparkyAnchor, setSparkyAnchor] = useState(params.get('sparky') !== 'companion');
  const [big, setBig] = useState(parseInt(params.get('size') ?? '220', 10));
  const bg = theme === 'dark' ? '#0b0d12' : '#f4f6fb';
  useEffect(() => {
    document.body.style.background = bg;
  }, [bg]);
  return (
    <MascotLayer theme={theme} quality={quality} reducedMotion={reduced}>
      <div style={{ minHeight: '100vh', background: bg, color: theme === 'dark' ? '#fff' : '#111', fontFamily: 'system-ui' }}>
        <div style={{ padding: '18px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Mascot Lab</div>
          <button onClick={() => alert('UI click passed through')} style={{ padding: '6px 12px', borderRadius: 12 }} data-testid="ui-button">
            UI button
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40, gap: params.get('outline') ? 0 : 6 }}>
          <MascotAnchor id="maverick" size={big} style={params.get('outline') ? { outline: '1px dashed rgba(255,60,60,0.8)' } : undefined} />
          <div style={{ padding: '6px 16px', borderRadius: 999, background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', fontWeight: 700 }}>
            Maverick
          </div>
          {sparkyAnchor && (
            <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 12 }}>
              <MascotAnchor id="sparky" size={Math.round(big * 0.55)} />
              <span style={{ opacity: 0.7 }}>Sparky</span>
            </div>
          )}
        </div>
        <Controls
          theme={theme}
          setTheme={setTheme}
          quality={quality}
          setQuality={setQuality}
          reduced={reduced}
          setReduced={setReduced}
          sparkyAnchor={sparkyAnchor}
          setSparkyAnchor={setSparkyAnchor}
          big={big}
          setBig={setBig}
        />
      </div>
    </MascotLayer>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
