import { motion } from 'motion/react';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Glass } from '@/glass/Glass';
import { DEFAULT_SERVER } from '@/lib/api';
import { haptic } from '@/lib/platform';
import { MascotAnchor, useMascot } from '@/mascot/MascotLayer';
import { pair, useStore } from '@/state/store';

export function Pairing() {
  const saved = useStore((s) => s.serverUrl);
  const [server, setServer] = useState(saved || DEFAULT_SERVER);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const mascot = useMascot();

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setErr('');
    mascot.setEmotion('maverick', 'thinking');
    try {
      await pair(server, code);
      haptic.success();
      mascot.setEmotion('maverick', 'celebrate', { durationMs: 2500 });
      mascot.setEmotion('sparky', 'excited', { durationMs: 2500 });
    } catch (e) {
      haptic.error();
      setErr((e as Error).message);
      mascot.setEmotion('maverick', 'confused', { durationMs: 2500 });
      mascot.setEmotion('sparky', 'error', { durationMs: 2000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="scroll">
        <div className="pair content-max">
          <div className="pair__hero">
            <MascotAnchor id="maverick" size={168} />
            <motion.h1 className="pair__title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              Maverick
            </motion.h1>
            <motion.p className="muted" style={{ fontSize: 15, margin: 0, maxWidth: 300, lineHeight: 1.45 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
              Your AI coding companion. Real code, real tests, on your own OpenCode server.
            </motion.p>
          </div>
          <div className="pair__card">
            <div style={{ fontWeight: 600, fontSize: 16 }}>Connect your server</div>
            <div className="muted" style={{ fontSize: 12, marginTop: -6, lineHeight: 1.45 }}>
              Enter the access code from your Railway deployment (variable <code>ACCESS_CODE</code>).
            </div>
            <input
              className="field"
              placeholder="MAV-XXXX-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              aria-label="Access code"
              style={{ fontFamily: 'var(--mono)', letterSpacing: '0.06em', textAlign: 'center', fontSize: 16, height: 44 }}
            />
            {advanced && (
              <input className="field" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://your-server.up.railway.app" inputMode="url" autoCapitalize="off" autoCorrect="off" aria-label="Server URL" />
            )}
            {err && (
              <div className="banner banner--err" style={{ width: '100%', margin: 0 }}>
                <Icon name="x" size={14} /> {err}
              </div>
            )}
            <Glass as="button" className="btn btn--block" variant="primary" radius={999} interactive onClick={submit} disabled={busy || !code.trim()}>
              {busy && <span className="spinner" />}
              {busy ? 'Connecting…' : 'Pair this device'}
            </Glass>
            <button className="muted" style={{ fontSize: 12, padding: 4 }} onClick={() => setAdvanced((v) => !v)}>
              {advanced ? 'Hide server address' : `Server: ${server.replace(/^https?:\/\//, '')} · change`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
