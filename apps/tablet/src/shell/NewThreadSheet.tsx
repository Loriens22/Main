import { useEffect, useState } from 'react';
import type { PermissionMode, ProviderId } from '@ornight/protocol';
import { PERMISSION_MODE_HINTS, PERMISSION_MODE_LABELS } from '@ornight/protocol';
import { PROVIDER_ORDER, providerOf } from '@ornight/protocol/providers';
import { GlassButton, GlassSheet } from '@ornight/glass';
import { useOrnight } from '@/state/store';
import './NewThreadSheet.css';

export interface NewThreadSheetProps {
  open: boolean;
  onClose: () => void;
  initialProvider: ProviderId | null;
}

/**
 * Starting work.
 *
 * Three decisions, in the order they actually matter: who does it, with what
 * model, and how much it is allowed to do unsupervised. The first prompt comes
 * last because it is the only one you have to think about — everything above it
 * has a sane default already selected.
 */
export function NewThreadSheet({ open, onClose, initialProvider }: NewThreadSheetProps) {
  const createThread = useOrnight((s) => s.createThread);
  const status = useOrnight((s) => s.providerStatus);

  const [provider, setProvider] = useState<ProviderId>(initialProvider ?? 'claude-code');
  const [model, setModel] = useState(providerOf(initialProvider ?? 'claude-code').defaultModel);
  const [mode, setMode] = useState<PermissionMode>(
    providerOf(initialProvider ?? 'claude-code').defaultPermissionMode,
  );
  const [prompt, setPrompt] = useState('');

  const descriptor = providerOf(provider);

  // Re-seed on each open so the sheet never reopens holding a stale half-filled
  // form from last time.
  useEffect(() => {
    if (!open) return;
    const next = initialProvider ?? 'claude-code';
    const d = providerOf(next);
    setProvider(next);
    setModel(d.defaultModel);
    setMode(d.defaultPermissionMode);
    setPrompt('');
  }, [open, initialProvider]);

  const choose = (id: ProviderId) => {
    const d = providerOf(id);
    setProvider(id);
    setModel(d.defaultModel);
    setMode(d.defaultPermissionMode);
  };

  const start = () => {
    createThread({
      provider,
      model,
      permissionMode: mode,
      ...(prompt.trim() ? { prompt: prompt.trim() } : null),
    });
    onClose();
  };

  return (
    <GlassSheet open={open} onClose={onClose} title="New thread" side="bottom" size="full">
      <div className="on-shell-new">
        <p className="on-shell-new-label">Agent</p>
        <div className="on-shell-new-providers">
          {PROVIDER_ORDER.map((id) => {
            const d = providerOf(id);
            const state = status[id];
            const available = state?.installed !== false;
            return (
              <button
                key={id}
                type="button"
                className="on-shell-new-provider"
                data-on={provider === id}
                disabled={!available}
                onClick={() => choose(id)}
                style={{ ['--provider-accent' as string]: d.accent }}
              >
                <span className="on-shell-new-glyph" aria-hidden="true">
                  {d.glyph}
                </span>
                <span className="on-shell-new-name">{d.label}</span>
                <span className="on-shell-new-note">
                  {available ? (state?.version ?? 'ready') : (state?.detail ?? 'not installed')}
                </span>
              </button>
            );
          })}
        </div>

        <p className="on-shell-new-label">Model</p>
        <ul className="on-shell-options">
          {descriptor.models.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="on-shell-option"
                data-on={model === m.id}
                onClick={() => setModel(m.id)}
              >
                <strong>{m.label}</strong>
                {m.note && <span>{m.note}</span>}
              </button>
            </li>
          ))}
        </ul>

        <p className="on-shell-new-label">Permissions</p>
        <ul className="on-shell-options">
          {descriptor.permissionModes.map((m) => (
            <li key={m}>
              <button
                type="button"
                className="on-shell-option"
                data-on={mode === m}
                onClick={() => setMode(m)}
              >
                <strong>{PERMISSION_MODE_LABELS[m]}</strong>
                <span>{PERMISSION_MODE_HINTS[m]}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="on-shell-new-label">First message</p>
        <textarea
          className="on-shell-new-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="What should it work on? You can leave this empty and start the conversation later."
          rows={4}
        />

        <div className="on-shell-new-actions">
          <GlassButton variant="quiet" size="lg" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton variant="primary" size="lg" onClick={start}>
            Start thread
          </GlassButton>
        </div>
      </div>
    </GlassSheet>
  );
}
