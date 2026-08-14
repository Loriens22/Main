import { OrnightMark } from '@ornight/glass';
import { PROVIDER_ORDER, providerOf } from '@ornight/protocol/providers';
import { useOrnight } from '@/state/store';
import { useShell } from '../shell/ShellContext';
import './EmptyState.css';

/**
 * What you see before there is anything to see.
 *
 * It names what a thread is rather than describing the absence of one, and it
 * offers the actual next step — start work with a specific agent — instead of a
 * generic button. Providers that are not installed are shown but disabled, with
 * the reason, because "why is Grok greyed out" is a better question to be able
 * to answer than "why is Grok missing".
 */
export function EmptyState() {
  const shell = useShell();
  const status = useOrnight((s) => s.providerStatus);

  return (
    <div className="on-chat-empty">
      <div className="on-chat-empty-mark">
        <OrnightMark size={76} />
      </div>

      <h1 className="on-chat-empty-title">Nothing running</h1>
      <p className="on-chat-empty-copy">
        Start a thread and Ornight gives it its own git worktree, so an agent can
        work without touching your checkout. Review the diff here, ship it when
        you like it.
      </p>

      <div className="on-chat-empty-providers">
        {PROVIDER_ORDER.map((id) => {
          const provider = providerOf(id);
          const state = status[id];
          const available = state?.installed !== false;

          return (
            <button
              key={id}
              type="button"
              className="on-chat-empty-provider"
              disabled={!available}
              title={state?.detail ?? undefined}
              onClick={() => shell.openNewThread(id)}
              style={{ ['--provider-accent' as string]: provider.accent }}
            >
              <span className="on-chat-empty-glyph" aria-hidden="true">
                {provider.glyph}
              </span>
              <span className="on-chat-empty-name">{provider.label}</span>
              {!available && <span className="on-chat-empty-note">not installed</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
