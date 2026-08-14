import { PROVIDER_ORDER, providerOf } from '@ornight/protocol/providers';
import { GlassSheet } from '@ornight/glass';
import { useOrnight } from '@/state/store';
import { useConnection } from '@/state/selectors';
import './SettingsSheet.css';

const CONNECTION_COPY: Record<string, string> = {
  connected: 'Connected to your daemon.',
  connecting: 'Connecting…',
  reconnecting: 'Lost the daemon — retrying.',
  offline: 'Offline. Nothing is lost; it will reconnect.',
  demo: 'Demo mode. Everything you see is simulated locally — no daemon, no network, no repository touched.',
};

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const connection = useConnection();
  const reducedGlass = useOrnight((s) => s.reducedGlass);
  const setReducedGlass = useOrnight((s) => s.setReducedGlass);
  const showReasoning = useOrnight((s) => s.showReasoning);
  const setShowReasoning = useOrnight((s) => s.setShowReasoning);
  const status = useOrnight((s) => s.providerStatus);

  const persistGlass = (value: boolean) => {
    setReducedGlass(value);
    try {
      localStorage.setItem('ornight.reducedGlass', String(value));
    } catch {
      /* private mode; the setting just won't survive a reload */
    }
  };

  return (
    <GlassSheet open={open} onClose={onClose} title="Settings" side="bottom" size="lg">
      <div className="on-shell-settings">
        <section>
          <h3>Connection</h3>
          <p className="on-shell-settings-copy" data-state={connection}>
            {CONNECTION_COPY[connection] ?? connection}
          </p>
          {connection === 'demo' && (
            <p className="on-shell-settings-copy">
              To drive real agents, run <code>ornight serve</code> on your machine and open the URL
              it prints, or append <code>?daemon=http://your-machine:7817</code> here.
            </p>
          )}
        </section>

        <section>
          <h3>Display</h3>
          <Toggle
            label="Reduce glass"
            hint="Drops the blur and translucency for solid fills. Easier on the battery and on older tablets."
            value={reducedGlass}
            onChange={persistGlass}
          />
          <Toggle
            label="Show reasoning"
            hint="Expands the agent's thinking inline instead of keeping it folded away."
            value={showReasoning}
            onChange={setShowReasoning}
          />
        </section>

        <section>
          <h3>Agents</h3>
          <ul className="on-shell-settings-providers">
            {PROVIDER_ORDER.map((id) => {
              const provider = providerOf(id);
              const state = status[id];
              return (
                <li key={id}>
                  <span
                    className="on-shell-settings-glyph"
                    style={{ ['--provider-accent' as string]: provider.accent }}
                    aria-hidden="true"
                  >
                    {provider.glyph}
                  </span>
                  <span className="on-shell-settings-name">{provider.label}</span>
                  <span
                    className="on-shell-settings-state"
                    data-ok={state?.installed && state?.authenticated}
                  >
                    {state?.installed
                      ? (state.authenticated ? (state.version ?? 'ready') : 'not signed in')
                      : 'not installed'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3>About</h3>
          <p className="on-shell-settings-copy">
            Ornight Plus {__ORNIGHT_VERSION__} — a liquid-glass agent harness for mini tablets,
            built after T3 Code.
          </p>
        </section>
      </div>
    </GlassSheet>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="on-shell-toggle"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <span className="on-shell-toggle-text">
        <strong>{label}</strong>
        <span>{hint}</span>
      </span>
      <span className="on-shell-toggle-track" data-on={value}>
        <span className="on-shell-toggle-thumb" />
      </span>
    </button>
  );
}
