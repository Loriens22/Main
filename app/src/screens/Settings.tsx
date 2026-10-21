import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { ModelPicker } from '@/components/ModelPicker';
import { Glass } from '@/glass/Glass';
import { api, apiBase } from '@/lib/api';
import { bytes } from '@/lib/format';
import { haptic } from '@/lib/platform';
import type { ApprovalMode } from '@/lib/types';
import { MascotAnchor } from '@/mascot/MascotLayer';
import { refreshAll, refreshCatalog, saveServerSettings, setPrefs, toast, unpair, useStore } from '@/state/store';

function Row({ icon, color, title, sub, right, onClick }: { icon: IconName; color: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return (
    <C className="setting" onClick={onClick}>
      <span className="setting__icon" data-tone={color}>
        <Icon name={icon} size={15} />
      </span>
      <div className="setting__main">
        <div className="setting__title">{title}</div>
        {sub && <div className="setting__sub">{sub}</div>}
      </div>
      {right ?? (onClick ? <Icon name="chevron" size={14} style={{ color: 'var(--t3)' }} /> : null)}
    </C>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className="toggle"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        haptic.tap();
        onChange(!on);
      }}
    />
  );
}

interface Voice {
  id: string;
  name: string;
  accent: string;
  gender: string;
  grade: string;
}

export function Settings() {
  const prefs = useStore((s) => s.prefs);
  const settings = useStore((s) => s.settings);
  const catalog = useStore((s) => s.catalog);
  const github = useStore((s) => s.github);
  const conn = useStore((s) => s.conn);
  const [diag, setDiag] = useState<any>(null);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [voiceErr, setVoiceErr] = useState('');
  const [providers, setProviders] = useState<{ id: string; name: string; hint: string; connected: boolean }[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [modelPicker, setModelPicker] = useState(false);
  const [ghToken, setGhToken] = useState('');
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api('/api/diagnostics').then(setDiag).catch(() => undefined);
    api<any[]>('/api/providers').then(setProviders).catch(() => undefined);
    api<any[]>('/api/devices').then(setDevices).catch(() => undefined);
  }, []);

  const loadVoices = () => {
    setVoiceErr('');
    api<{ voices: Voice[] }>('/api/voice/voices', { timeoutMs: 90_000, retries: 2 })
      .then((r) => setVoices(r.voices))
      .catch((e) => setVoiceErr(e.message));
  };

  const preview = async (id: string) => {
    try {
      setPlaying(id);
      const res = await api<Response>('/api/voice/preview', { method: 'POST', body: { voice: id, speed: settings?.voice.speed }, raw: true, timeoutMs: 90_000 });
      const url = URL.createObjectURL(await res.blob());
      audio.current?.pause();
      audio.current = new Audio(url);
      audio.current.onended = () => setPlaying(null);
      await audio.current.play();
    } catch (e) {
      setPlaying(null);
      toast((e as Error).message, 'error');
    }
  };

  const defaultModel = catalog?.models.find((m) => m.id === (settings?.defaultModel ?? catalog?.defaultModel));
  const usage = diag?.storage;

  return (
    <div className="screen">
      <div className="scroll" style={{ paddingBottom: 'calc(var(--safe-bottom) + 100px)' }}>
        <div className="content-max" style={{ padding: '0 16px' }}>
          <header className="home-head" style={{ padding: 'calc(var(--safe-top) + 10px) 0 2px' }}>
            <h1 className="home-title">Settings</h1>
            <MascotAnchor id="sparky" size={52} />
          </header>

          <div className="label">Server</div>
          <div className="group">
            <Row icon="globe" color="#3b82f6" title={apiBase().replace(/^https?:\/\//, '')} sub={conn === 'online' ? 'Connected' : conn === 'unauthorized' ? 'Signed out' : 'Connecting…'} right={<span className={`conn-dot${conn === 'online' ? '' : ' conn-dot--off'}`} />} />
            <Row icon="bolt" color="#8b5cf6" title="OpenCode" sub={diag ? `v${diag.opencode.version || '?'} · ${diag.opencode.ready ? 'ready' : 'starting'}` : '…'} />
            <Row icon="mic" color="#ec4899" title="Voice engine" sub={diag ? (diag.voice.ok ? 'Ready' : `Sleeping or unavailable${diag.voice.detail ? ` (${diag.voice.detail})` : ''} — wakes on call`) : '…'} />
            {usage && (
              <div className="setting">
                <span className="setting__icon">
                  <Icon name="folder" size={15} />
                </span>
                <div className="setting__main">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span className="setting__title">Storage</span>
                    <span className="setting__value">
                      {bytes(usage.usedBytes)}
                      {usage.totalBytes ? ` of ${bytes(usage.totalBytes)}` : ''}
                    </span>
                  </div>
                  {!!usage.totalBytes && (
                    <div className="meter" style={{ marginTop: 6 }}>
                      <i style={{ width: `${Math.min(100, (usage.usedBytes / usage.totalBytes) * 100)}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )}
            <Row
              icon="refresh"
              color="#06b6d4"
              title="Refresh status"
              onClick={async () => {
                await refreshAll();
                await refreshCatalog(true).catch(() => undefined);
                setDiag(await api('/api/diagnostics').catch(() => diag));
                toast('Refreshed', 'ok');
              }}
            />
          </div>

          <div className="label">Models</div>
          <div className="group">
            <Row
              icon="sparkle"
              color="#22c55e"
              title="Default model"
              sub={defaultModel ? (defaultModel.free ? defaultModel.name : `${defaultModel.name} · Paid`) : 'Server default'}
              onClick={() => setModelPicker(true)}
            />
            <Row icon="list" color="#14b8a6" title="Free models" right={<span className="setting__value">{catalog?.models.filter((m) => m.free && m.available).length ?? 0}</span>} />
            {providers.map((p) => (
              <Row
                key={p.id}
                icon="key"
                color={p.connected ? '#f59e0b' : '#64748b'}
                title={p.name}
                right={
                  <>
                    <span className={`setting__value${p.connected ? ' setting__value--ok' : ''}`}>{p.connected ? 'Connected' : 'Add key'}</span>
                    <Icon name="chevron" size={14} style={{ color: 'var(--t3)' }} />
                  </>
                }
                onClick={() => {
                  setKeyFor(p.id);
                  setKeyValue('');
                }}
              />
            ))}
          </div>
          {keyFor && (
            <div className="card" style={{ width: '100%', marginTop: 8 }}>
              <div className="card__title">API key for {providers.find((p) => p.id === keyFor)?.name}</div>
              <div className="card__body">Stored by OpenCode on your server only. The server restarts OpenCode to load it (running tasks are interrupted).</div>
              <input className="field" style={{ marginTop: 10 }} type="password" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} placeholder={`Paste key (${providers.find((p) => p.id === keyFor)?.hint ?? ''})`} autoComplete="off" />
              <div className="card__actions">
                {providers.find((p) => p.id === keyFor)?.connected && (
                  <button
                    className="btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={async () => {
                      await api(`/api/providers/${keyFor}`, { method: 'DELETE', timeoutMs: 60_000 }).catch((e) => toast(e.message, 'error'));
                      setProviders(await api('/api/providers'));
                      await refreshCatalog(true).catch(() => undefined);
                      setKeyFor(null);
                    }}
                  >
                    Remove
                  </button>
                )}
                <button className="btn" onClick={() => setKeyFor(null)}>
                  Cancel
                </button>
                <Glass
                  as="button"
                  className="btn"
                  radius={999}
                  variant="primary"
                  interactive
                  disabled={!keyValue.trim()}
                  onClick={async () => {
                    try {
                      await api(`/api/providers/${keyFor}`, { method: 'PUT', body: { key: keyValue.trim() }, timeoutMs: 90_000 });
                      setProviders(await api('/api/providers'));
                      await refreshCatalog(true);
                      toast('Provider connected', 'ok');
                      setKeyFor(null);
                    } catch (e) {
                      toast((e as Error).message, 'error');
                    }
                  }}
                >
                  Save key
                </Glass>
              </div>
            </div>
          )}

          <div className="label">Coding</div>
          <div className="group">
            <div className="setting" style={{ display: 'block' }}>
              <div className="setting__title" style={{ marginBottom: 7 }}>
                Default approvals for new chats
              </div>
              <div className="segmented">
                {(['ask', 'auto-edit', 'full'] as ApprovalMode[]).map((m) => (
                  <button key={m} aria-pressed={settings?.defaultApprovalMode === m} onClick={() => saveServerSettings({ defaultApprovalMode: m }).catch((e) => toast(e.message, 'error'))}>
                    {m === 'ask' ? 'Ask first' : m === 'auto-edit' ? 'Auto-edit' : 'Full auto'}
                  </button>
                ))}
              </div>
            </div>
            {github.connected ? (
              <Row
                icon="github"
                color="#24292f"
                title={`GitHub · @${github.login}`}
                sub="Clone private repos, commit and push"
                right={
                  <button
                    className="btn btn--sm"
                    onClick={async () => {
                      await api('/api/github', { method: 'DELETE' });
                      await refreshAll();
                    }}
                  >
                    Disconnect
                  </button>
                }
              />
            ) : (
              <div className="setting" style={{ display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="setting__icon">
                    <Icon name="github" size={15} />
                  </span>
                  <div className="setting__main">
                    <div className="setting__title">Connect GitHub</div>
                    <div className="setting__sub">Fine-grained personal access token with Contents read/write</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input className="field" type="password" placeholder="github_pat_…" value={ghToken} onChange={(e) => setGhToken(e.target.value)} autoComplete="off" />
                  <Glass
                    as="button"
                    className="btn"
                    radius={999}
                    variant="primary"
                    interactive
                    disabled={!ghToken.trim()}
                    onClick={async () => {
                      try {
                        await api('/api/github', { method: 'PUT', body: { token: ghToken.trim() } });
                        setGhToken('');
                        await refreshAll();
                        toast('GitHub connected', 'ok');
                      } catch (e) {
                        toast((e as Error).message, 'error');
                      }
                    }}
                  >
                    Save
                  </Glass>
                </div>
              </div>
            )}
          </div>

          <div className="label">Voice</div>
          <div className="group">
            <div className="setting" style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="setting__title">Speaking speed</span>
                <span className="muted">{(settings?.voice.speed ?? 1.05).toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={0.8}
                max={1.3}
                step={0.05}
                value={settings?.voice.speed ?? 1.05}
                onChange={(e) => settings && saveServerSettings({ voice: { ...settings.voice, speed: Number(e.target.value) } }).catch(() => undefined)}
              />
            </div>
            {!voices ? (
              <Row icon="speaker" color="#ec4899" title={`Voice: ${settings?.voice.voice ?? 'af_heart'}`} sub={voiceErr ? `${voiceErr} — tap to retry` : 'Tap to choose a Kokoro voice (wakes the voice engine)'} onClick={loadVoices} />
            ) : (
              voices.map((v) => (
                <div key={v.id} className="setting">
                  <button className="setting__main" style={{ textAlign: 'left' }} onClick={() => settings && saveServerSettings({ voice: { ...settings.voice, voice: v.id } })}>
                    <div className="setting__title">
                      {v.name}{' '}
                      <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>
                        · {v.accent} {v.gender} · quality {v.grade}
                      </span>
                    </div>
                  </button>
                  <button className="icon-btn" onClick={() => preview(v.id)} aria-label={`Preview ${v.name}`}>
                    {playing === v.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Icon name="play" size={11} />}
                  </button>
                  {settings?.voice.voice === v.id && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
                </div>
              ))
            )}
          </div>

          <div className="label">Appearance</div>
          <div className="group">
            <div className="setting" style={{ display: 'block' }}>
              <div className="setting__title" style={{ marginBottom: 7 }}>
                Liquid Glass
              </div>
              <div className="segmented">
                {(['auto', 'high', 'balanced', 'low'] as const).map((t) => (
                  <button key={t} aria-pressed={prefs.glass === t} onClick={() => setPrefs({ glass: t })}>
                    {t === 'low' ? 'Battery' : t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <Row icon="sparkle" color="#3b82f6" title="3D mascots" sub="Maverick and Sparky react to real coding events" right={<Toggle label="3D mascots" on={prefs.mascots} onChange={(v) => setPrefs({ mascots: v })} />} />
            <Row icon="bolt" color="#f97316" title="Mascots roam the screen" right={<Toggle label="Roaming" on={prefs.roaming} onChange={(v) => setPrefs({ roaming: v })} />} />
            <div className="setting" style={{ display: 'block' }}>
              <div className="setting__title" style={{ marginBottom: 7 }}>
                Mascot rendering quality
              </div>
              <div className="segmented">
                {(['auto', 'high', 'medium', 'low'] as const).map((t) => (
                  <button key={t} aria-pressed={prefs.mascotQuality === t} onClick={() => setPrefs({ mascotQuality: t })}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <Row icon="moon" color="#6366f1" title="Reduce motion" right={<Toggle label="Reduce motion" on={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} />} />
            <Row icon="bolt" color="#22c55e" title="Haptics" right={<Toggle label="Haptics" on={prefs.haptics} onChange={(v) => setPrefs({ haptics: v })} />} />
          </div>

          <div className="label">Paired devices</div>
          <div className="group">
            {devices.map((d) => (
              <Row
                key={d.id}
                icon="shield"
                color="#64748b"
                title={`${d.name}${d.current ? ' (this device)' : ''}`}
                sub={`${d.platform} · last seen ${new Date(d.last_seen).toLocaleString()}`}
                right={
                  !d.current ? (
                    <button
                      className="btn btn--sm"
                      onClick={async () => {
                        await api(`/api/devices/${d.id}`, { method: 'DELETE' });
                        setDevices(await api('/api/devices'));
                      }}
                    >
                      Revoke
                    </button>
                  ) : undefined
                }
              />
            ))}
            <Row
              icon="x"
              color="#ef4444"
              title="Sign out this device"
              onClick={() => {
                if (confirm('Sign out? You will need the access code to pair again.')) void unpair(true);
              }}
            />
          </div>

          <div className="label">About</div>
          <div className="group">
            <Row icon="sparkle" color="#3b82f6" title="Maverick Bot 1.0.0" sub={`Server ${diag?.server ?? '…'} · OpenCode ${diag?.opencode?.version ?? '…'}`} />
            <div className="setting" style={{ display: 'block', fontSize: 12, color: 'var(--t3)', lineHeight: 1.5 }}>
              Built on OpenCode (MIT), sherpa-onnx (Apache-2.0), Kokoro-82M (Apache-2.0), NVIDIA NeMo FastConformer streaming ASR (CC-BY-4.0), three.js (MIT), Capacitor (MIT) and React (MIT).
            </div>
          </div>
        </div>
      </div>
      <ModelPicker
        open={modelPicker}
        onClose={() => setModelPicker(false)}
        value={settings?.defaultModel ?? catalog?.defaultModel ?? undefined}
        onPick={(m) => saveServerSettings({ defaultModel: m.id }).then(() => toast(`New chats will use ${m.name}`, 'ok'))}
      />
    </div>
  );
}
