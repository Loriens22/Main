import { useMemo, useState } from 'react';
import type { FilePatch } from '@ornight/protocol';
import { GlassButton, GlassIconButton, GlassSheet } from '@ornight/glass';
import { useOrnight } from '@/state/store';
import { useGitState } from '@/state/selectors';
import { DiffView } from './DiffView';
import { KindGlyph, PathLabel, StatPair } from './atoms';
import './ChangesPanel.css';

/**
 * The working state of a thread's worktree: what changed, what is staged, and
 * the way out to shipping it.
 *
 * On a wide screen this lives in a persistent right column; everywhere else the
 * shell mounts it inside a sheet. It does not know which, by design.
 */
export function ChangesPanel({ threadId }: { threadId: string }) {
  const git = useGitState(threadId);
  const stageFiles = useOrnight((s) => s.stageFiles);
  const revertFiles = useOrnight((s) => s.revertFiles);
  const refreshGit = useOrnight((s) => s.refreshGit);
  const setPanel = useOrnight((s) => s.setPanel);
  const focusFile = useOrnight((s) => s.focusFile);
  const focused = useOrnight((s) => s.focusedFile[threadId] ?? null);

  const [confirmRevert, setConfirmRevert] = useState<string | null>(null);

  const files = git?.files ?? [];
  const allStaged = files.length > 0 && files.every((f) => f.staged);
  const openFile = useMemo(() => files.find((f) => f.path === focused) ?? null, [files, focused]);

  if (!git) {
    return (
      <div className="on-rev-changes">
        <p className="on-rev-changes-empty">Loading changes…</p>
      </div>
    );
  }

  return (
    <div className="on-rev-changes">
      <header className="on-rev-changes-head">
        <div className="on-rev-changes-branch">
          <span className="on-rev-changes-branch-name" title={git.branch}>
            {git.branch}
          </span>
          <span className="on-rev-changes-base">
            from {git.baseBranch}
            {git.ahead > 0 ? ` · ${git.ahead} ahead` : ''}
            {git.behind > 0 ? ` · ${git.behind} behind` : ''}
          </span>
        </div>
        <div className="on-rev-changes-head-right">
          <StatPair insertions={git.insertions} deletions={git.deletions} />
          <GlassIconButton label="Refresh changes" onClick={() => refreshGit(threadId)}>
            ↻
          </GlassIconButton>
        </div>
      </header>

      {git.hasConflicts && (
        <div className="on-rev-changes-conflict">
          <strong>This worktree has conflicts.</strong>
          <p>
            The base branch moved under this thread. Resolve the conflicted files below, then commit
            as usual — nothing is lost while they sit unresolved.
          </p>
        </div>
      )}

      {files.length === 0 ? (
        <div className="on-rev-changes-empty-state">
          <p className="on-rev-changes-empty">No changes yet.</p>
          <p className="on-rev-changes-hint">
            Edits the agent makes land in this thread&apos;s own worktree and show up here to review
            before anything reaches your branch.
          </p>
          <code className="on-rev-changes-path">{git.branch}</code>
        </div>
      ) : (
        <>
          <div className="on-rev-changes-tools">
            <button
              type="button"
              className="on-rev-changes-selectall"
              onClick={() =>
                stageFiles(
                  threadId,
                  files.map((f) => f.path),
                  !allStaged,
                )
              }
            >
              {allStaged ? 'Unstage all' : 'Stage all'}
            </button>
            <span className="on-rev-changes-count">
              {files.filter((f) => f.staged).length} of {files.length} staged
            </span>
          </div>

          <ul className="on-rev-changes-list">
            {files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                onToggle={() => stageFiles(threadId, [file.path], !file.staged)}
                onOpen={() => focusFile(threadId, file.path)}
                onRevert={() => setConfirmRevert(file.path)}
              />
            ))}
          </ul>
        </>
      )}

      <footer className="on-rev-changes-foot">
        <GlassButton
          variant="primary"
          size="lg"
          block
          disabled={files.length === 0}
          onClick={() => setPanel('ship')}
        >
          Ship these changes
        </GlassButton>
      </footer>

      {/* The diff opens over the panel rather than replacing it, so dismissing
          returns you exactly where you were in the file list. */}
      <GlassSheet
        open={openFile !== null}
        onClose={() => focusFile(threadId, null)}
        title={openFile ? openFile.path.split('/').pop() : ''}
        side="bottom"
        size="full"
      >
        {openFile && <DiffView patch={openFile} onClose={() => focusFile(threadId, null)} />}
      </GlassSheet>

      <GlassSheet
        open={confirmRevert !== null}
        onClose={() => setConfirmRevert(null)}
        title="Discard this file?"
        side="bottom"
        size="sm"
      >
        <div className="on-rev-changes-confirm">
          <p>
            <code>{confirmRevert}</code> goes back to how it was before this thread touched it. The
            agent&apos;s work on that file is gone and cannot be recovered.
          </p>
          <div className="on-rev-changes-confirm-actions">
            <GlassButton variant="quiet" size="lg" onClick={() => setConfirmRevert(null)}>
              Keep it
            </GlassButton>
            <GlassButton
              variant="danger"
              size="lg"
              onClick={() => {
                if (confirmRevert) revertFiles(threadId, [confirmRevert]);
                setConfirmRevert(null);
              }}
            >
              Discard
            </GlassButton>
          </div>
        </div>
      </GlassSheet>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FileRow({
  file,
  onToggle,
  onOpen,
  onRevert,
}: {
  file: FilePatch;
  onToggle: () => void;
  onOpen: () => void;
  onRevert: () => void;
}) {
  return (
    <li className="on-rev-file">
      <button
        type="button"
        className="on-rev-file-check"
        role="checkbox"
        aria-checked={file.staged}
        aria-label={file.staged ? `Unstage ${file.path}` : `Stage ${file.path}`}
        onClick={onToggle}
      >
        <span aria-hidden="true">{file.staged ? '☑' : '☐'}</span>
      </button>

      <button type="button" className="on-rev-file-main" onClick={onOpen}>
        <KindGlyph kind={file.kind} />
        <PathLabel path={file.path} />
        <StatPair insertions={file.insertions} deletions={file.deletions} />
      </button>

      <GlassIconButton label={`Discard changes to ${file.path}`} onClick={onRevert}>
        ⟲
      </GlassIconButton>
    </li>
  );
}
