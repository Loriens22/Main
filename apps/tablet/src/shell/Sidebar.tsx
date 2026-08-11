import { useState } from 'react';
import type { ConnectionState } from '@ornight/protocol';
import { GlassButton, GlassField, GlassIconButton, GlassSheet } from '@ornight/glass';
import { OrnightBadge } from '@/brand';
import { useOrnight } from '@/state/store';
import { useConnection } from '@/state/selectors';
import { FolderIcon, PlusIcon, SearchIcon, SettingsIcon } from './icons';
import { ThreadList } from './ThreadList';
import { useShell } from './ShellContext';
import './Sidebar.css';

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
  demo: 'Demo',
};

function ConnectionIndicator() {
  const connection = useConnection();
  return (
    <span className="on-shell-conn" data-state={connection} title={`Daemon: ${CONNECTION_LABEL[connection]}`}>
      <span className="on-shell-conn-dot" aria-hidden="true" />
      {CONNECTION_LABEL[connection]}
    </span>
  );
}

function WorkspaceSwitcher() {
  const workspaces = useOrnight((s) => s.workspaces);
  const activeId = useOrnight((s) => s.activeWorkspaceId);
  const [open, setOpen] = useState(false);
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null;

  return (
    <>
      <button
        type="button"
        className="on-shell-workspace"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        disabled={workspaces.length === 0}
      >
        <FolderIcon size={16} aria-hidden="true" />
        <span className="on-shell-workspace-name">{active?.name ?? 'No workspace'}</span>
      </button>

      <GlassSheet open={open} onClose={() => setOpen(false)} title="Workspace" side="bottom" size="md">
        <div className="on-shell-picker">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className="on-shell-picker-row"
              data-active={workspace.id === active?.id}
              onClick={() => {
                // The store exposes `activeWorkspaceId` as state but ships no
                // setter, so this goes through zustand's public setState rather
                // than editing the lead-owned store. Flagged in the report.
                useOrnight.setState({ activeWorkspaceId: workspace.id });
                setOpen(false);
              }}
            >
              <span>{workspace.name}</span>
              <span className="on-shell-picker-sub">{workspace.path}</span>
            </button>
          ))}
          {workspaces.length === 0 ? (
            <p className="on-shell-empty-note">No workspaces yet. Add one from the daemon.</p>
          ) : null}
        </div>
      </GlassSheet>
    </>
  );
}

/**
 * Sidebar, top to bottom: the morphed splash badge, connection state, the
 * primary "New thread" action, a search field, the grouped thread list, and a
 * footer holding the workspace switcher and settings.
 *
 * `<OrnightBadge/>` must be the first child and must be mounted before the
 * splash sequence finishes — it carries the shared `layoutId` the splash
 * morphs into.
 */
export function Sidebar() {
  const [query, setQuery] = useState('');
  const shell = useShell();

  return (
    <div className="on-shell-sidebar">
      <div className="on-shell-sidebar-head">
        <OrnightBadge />
        <ConnectionIndicator />
      </div>

      <div className="on-shell-sidebar-actions">
        <GlassButton
          variant="primary"
          size="lg"
          block
          icon={<PlusIcon size={18} />}
          onClick={() => shell.openNewThread()}
        >
          New thread
        </GlassButton>
      </div>

      <div className="on-shell-sidebar-search">
        <GlassField
          value={query}
          onChange={setQuery}
          placeholder="Search threads"
          icon={<SearchIcon size={16} />}
          inputMode="search"
          aria-label="Search threads"
        />
      </div>

      <div className="on-shell-sidebar-list">
        <ThreadList query={query} />
      </div>

      <div className="on-shell-sidebar-foot">
        <WorkspaceSwitcher />
        <GlassIconButton label="Settings" onClick={shell.openSettings}>
          <SettingsIcon size={18} />
        </GlassIconButton>
      </div>
    </div>
  );
}
