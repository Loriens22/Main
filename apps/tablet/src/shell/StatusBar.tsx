import { useState } from 'react';
import type { PermissionMode, ProviderId } from '@ornight/protocol';
import {
  PERMISSION_MODES,
  PERMISSION_MODE_HINTS,
  PERMISSION_MODE_LABELS,
  threadIsBusy,
} from '@ornight/protocol';
import { PROVIDER_ORDER, providerOf } from '@ornight/protocol/providers';
import { GlassBadge, GlassIconButton, GlassSheet } from '@ornight/glass';
import type { LayoutMode } from '@/state/selectors';
import { useOrnight } from '@/state/store';
import { useThread } from '@/state/selectors';
import { BranchIcon, DiffIcon, MenuIcon, ShipIcon, StopIcon } from './icons';
import { shortBranch } from './format';
import { useShell } from './ShellContext';
import './StatusBar.css';

export interface StatusBarProps {
  threadId: string | null;
  mode: LayoutMode;
  changeCount: number;
}

/**
 * The persistent header over the conversation: what this thread is, which agent
 * is driving it, how much rope that agent has, and the two ways out — review
 * the diff, or ship it.
 *
 * Every control here is a tap target in its own right rather than a hover menu,
 * because on a tablet there is no hover.
 */
export function StatusBar({ threadId, mode, changeCount }: StatusBarProps) {
  const thread = useThread(threadId);
  const shell = useShell();
  const setSidebar = useOrnight((s) => s.setSidebar);
  const sidebarOpen = useOrnight((s) => s.sidebarOpen);
  const setPanel = useOrnight((s) => s.setPanel);
  const setPermissionMode = useOrnight((s) => s.setPermissionMode);
  const setModel = useOrnight((s) => s.setModel);
  const renameThread = useOrnight((s) => s.renameThread);
  const interrupt = useOrnight((s) => s.interrupt);

  const [sheet, setSheet] = useState<'none' | 'mode' | 'model' | 'rename'>('none');
  const [title, setTitle] = useState('');

  const overlay = mode === 'portrait' || mode === 'compact-portrait';
  const provider = providerOf(thread?.provider ?? 'mock');
  const busy = thread ? threadIsBusy(thread.status) : false;
  const compact = mode === 'compact-portrait';

  return (
    <header className="on-shell-status">
      {overlay && (
        <GlassIconButton
          label={sidebarOpen ? 'Close threads' : 'Open threads'}
          onClick={() => setSidebar(!sidebarOpen)}
        >
          <MenuIcon />
        </GlassIconButton>
      )}

      <div className="on-shell-status-main">
        <button
          type="button"
          className="on-shell-status-title"
          disabled={!thread}
          onClick={() => {
            setTitle(thread?.title ?? '');
            setSheet('rename');
          }}
        >
          {thread?.title ?? 'Ornight Plus'}
        </button>

        {thread && !compact && (
          <div className="on-shell-status-chips">
            <button
              type="button"
              className="on-shell-chip"
              style={{ ['--provider-accent' as string]: provider.accent }}
              onClick={() => setSheet('model')}
            >
              <span className="on-shell-chip-glyph" aria-hidden="true">
                {provider.glyph}
              </span>
              {provider.label}
            </button>

            <button type="button" className="on-shell-chip" onClick={() => setSheet('mode')}>
              {PERMISSION_MODE_LABELS[thread.permissionMode]}
            </button>

            {thread.worktree && (
              <span className="on-shell-chip on-shell-chip-static" title={thread.worktree.branch}>
                <BranchIcon />
                {shortBranch(thread.worktree.branch, 22)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="on-shell-status-actions">
        {busy && (
          <GlassIconButton label="Stop the agent" onClick={() => threadId && interrupt(threadId)}>
            <StopIcon />
          </GlassIconButton>
        )}

        {thread && mode !== 'wide' && (
          <GlassIconButton label="Review changes" onClick={() => setPanel('changes')}>
            <DiffIcon />
            {changeCount > 0 && <GlassBadge tone="accent" size="sm">{changeCount}</GlassBadge>}
          </GlassIconButton>
        )}

        {thread && (
          <GlassIconButton label="Ship changes" onClick={() => setPanel('ship')}>
            <ShipIcon />
          </GlassIconButton>
        )}
      </div>

      {/* ---- sheets ---- */}

      <GlassSheet
        open={sheet === 'mode'}
        onClose={() => setSheet('none')}
        title="How much rope?"
        side="bottom"
        size="md"
      >
        <ul className="on-shell-options">
          {PERMISSION_MODES.filter((m) => provider.permissionModes.includes(m)).map((m) => (
            <li key={m}>
              <button
                type="button"
                className="on-shell-option"
                data-on={thread?.permissionMode === m}
                onClick={() => {
                  if (threadId) setPermissionMode(threadId, m as PermissionMode);
                  setSheet('none');
                }}
              >
                <strong>{PERMISSION_MODE_LABELS[m]}</strong>
                <span>{PERMISSION_MODE_HINTS[m]}</span>
              </button>
            </li>
          ))}
        </ul>
      </GlassSheet>

      <GlassSheet
        open={sheet === 'model'}
        onClose={() => setSheet('none')}
        title="Agent and model"
        side="bottom"
        size="lg"
      >
        <ul className="on-shell-options">
          {PROVIDER_ORDER.flatMap((id) => {
            const p = providerOf(id as ProviderId);
            return p.models.map((model) => (
              <li key={`${id}:${model.id}`}>
                <button
                  type="button"
                  className="on-shell-option"
                  data-on={thread?.provider === id && thread?.model === model.id}
                  onClick={() => {
                    if (threadId) setModel(threadId, id as ProviderId, model.id);
                    setSheet('none');
                  }}
                >
                  <strong>
                    <span
                      className="on-shell-chip-glyph"
                      style={{ ['--provider-accent' as string]: p.accent }}
                      aria-hidden="true"
                    >
                      {p.glyph}
                    </span>
                    {p.label} · {model.label}
                  </strong>
                  {model.note && <span>{model.note}</span>}
                </button>
              </li>
            ));
          })}
        </ul>
      </GlassSheet>

      <GlassSheet
        open={sheet === 'rename'}
        onClose={() => setSheet('none')}
        title="Rename thread"
        side="bottom"
        size="sm"
      >
        <form
          className="on-shell-rename"
          onSubmit={(event) => {
            event.preventDefault();
            if (threadId && title.trim()) renameThread(threadId, title.trim());
            setSheet('none');
          }}
        >
          <input
            className="on-shell-rename-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Thread title"
            autoFocus
          />
          <button type="submit" className="on-shell-rename-save">
            Save
          </button>
        </form>
      </GlassSheet>
    </header>
  );
}
