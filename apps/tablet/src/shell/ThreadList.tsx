import { useCallback, useMemo, useState } from 'react';
import type { Thread } from '@ornight/protocol';
import { GlassButton, GlassField, GlassScroll, GlassSheet } from '@ornight/glass';
import { useOrnight } from '@/state/store';
import { useThreadList } from '@/state/selectors';
import { ThreadRow } from './ThreadRow';
import { useShell } from './ShellContext';
import { ArchiveIcon, BranchIcon, PencilIcon, PinIcon, TrashIcon } from './icons';
import { dayGroupLabel } from './format';
import './ThreadList.css';

interface Group {
  key: string;
  label: string;
  threads: Thread[];
}

/** Pinned threads lead (the store already sorts them first), then day buckets. */
function groupThreads(threads: Thread[], now: number): Group[] {
  const groups: Group[] = [];
  const pinned = threads.filter((t) => t.pinned);
  if (pinned.length > 0) groups.push({ key: 'pinned', label: 'Pinned', threads: pinned });

  let current: Group | null = null;
  for (const thread of threads) {
    if (thread.pinned) continue;
    const label = dayGroupLabel(thread.updatedAt, now);
    if (!current || current.label !== label) {
      current = { key: `day:${label}`, label, threads: [] };
      groups.push(current);
    }
    current.threads.push(thread);
  }
  return groups;
}

function matches(thread: Thread, needle: string): boolean {
  if (!needle) return true;
  return (
    thread.title.toLowerCase().includes(needle) ||
    thread.preview.toLowerCase().includes(needle) ||
    thread.worktree?.branch.toLowerCase().includes(needle) === true
  );
}

type ContextMode = 'menu' | 'rename' | 'confirm-delete' | 'confirm-discard';

export interface ThreadListProps {
  query?: string;
}

/**
 * The grouped thread list. Rendering is plain rather than virtualised — a
 * harness holds tens of threads, not thousands, and a real list beats a
 * virtualised one for scroll-anchoring and find-in-page.
 */
export function ThreadList({ query = '' }: ThreadListProps) {
  const threads = useThreadList();
  const activeId = useOrnight((s) => s.activeThreadId);
  const selectThread = useOrnight((s) => s.selectThread);
  const shell = useShell();

  const [context, setContext] = useState<Thread | null>(null);
  const [mode, setMode] = useState<ContextMode>('menu');
  const [draftTitle, setDraftTitle] = useState('');

  const needle = query.trim().toLowerCase();
  const groups = useMemo(
    () => groupThreads(threads.filter((t) => matches(t, needle)), Date.now()),
    [threads, needle],
  );

  const handleSelect = useCallback(
    (id: string) => {
      selectThread(id);
      shell.dismissSidebar();
    },
    [selectThread, shell],
  );

  const openContext = useCallback((thread: Thread) => {
    setContext(thread);
    setMode('menu');
    setDraftTitle(thread.title);
  }, []);

  const closeContext = useCallback(() => setContext(null), []);

  const store = useOrnight.getState;
  const isEmpty = groups.length === 0;

  return (
    <>
      <GlassScroll className="on-shell-threads" fade>
        {isEmpty ? (
          <p className="on-shell-list-empty">
            {needle ? `Nothing matches “${query.trim()}”.` : 'No threads yet. Start one above.'}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="on-shell-group">{group.label}</h3>
              {group.threads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeId}
                  onSelect={handleSelect}
                  onContext={openContext}
                />
              ))}
            </section>
          ))
        )}
      </GlassScroll>

      <GlassSheet
        open={context !== null}
        onClose={closeContext}
        title={mode === 'rename' ? 'Rename thread' : 'Thread'}
        side="bottom"
        size="md"
      >
        {context ? (
          <div className="on-shell-context">
            <div className="on-shell-context-head">
              <div style={{ minWidth: 0 }}>
                <div className="on-shell-context-title">{context.title || 'Untitled thread'}</div>
                <div className="on-shell-context-sub">
                  {context.worktree ? context.worktree.branch : 'No worktree yet'}
                </div>
              </div>
            </div>

            {mode === 'menu' ? (
              <>
                <button
                  type="button"
                  className="on-shell-context-action"
                  onClick={() => setMode('rename')}
                >
                  <PencilIcon size={18} />
                  Rename
                </button>

                <button
                  type="button"
                  className="on-shell-context-action"
                  onClick={() => {
                    store().pinThread(context.id, !context.pinned);
                    closeContext();
                  }}
                >
                  <PinIcon size={18} />
                  {context.pinned ? 'Unpin' : 'Pin to top'}
                </button>

                <button
                  type="button"
                  className="on-shell-context-action"
                  onClick={() => {
                    store().archiveThread(context.id, !context.archived);
                    closeContext();
                  }}
                >
                  <ArchiveIcon size={18} />
                  {context.archived ? 'Unarchive' : 'Archive'}
                </button>

                <button
                  type="button"
                  className="on-shell-context-action"
                  data-tone="danger"
                  disabled={!context.worktree?.active}
                  onClick={() => setMode('confirm-discard')}
                >
                  <BranchIcon size={18} />
                  Discard worktree
                </button>

                <button
                  type="button"
                  className="on-shell-context-action"
                  data-tone="danger"
                  onClick={() => setMode('confirm-delete')}
                >
                  <TrashIcon size={18} />
                  Delete thread
                </button>
              </>
            ) : null}

            {mode === 'rename' ? (
              <div className="on-shell-context-rename">
                <GlassField
                  value={draftTitle}
                  onChange={setDraftTitle}
                  placeholder="Thread title"
                  autoFocus
                  aria-label="Thread title"
                />
                <div className="on-shell-context-rename-actions">
                  <GlassButton variant="ghost" block onClick={() => setMode('menu')}>
                    Cancel
                  </GlassButton>
                  <GlassButton
                    variant="primary"
                    block
                    disabled={draftTitle.trim().length === 0}
                    onClick={() => {
                      const next = draftTitle.trim();
                      if (next && next !== context.title) store().renameThread(context.id, next);
                      closeContext();
                    }}
                  >
                    Save
                  </GlassButton>
                </div>
              </div>
            ) : null}

            {mode === 'confirm-discard' ? (
              <div className="on-shell-context-rename">
                <p className="on-shell-list-empty">
                  Throw away the worktree at {context.worktree?.path ?? 'this thread'}? Uncommitted
                  work in it is lost.
                </p>
                <div className="on-shell-context-rename-actions">
                  <GlassButton variant="ghost" block onClick={() => setMode('menu')}>
                    Keep it
                  </GlassButton>
                  <GlassButton
                    variant="danger"
                    block
                    onClick={() => {
                      store().dispatch({ type: 'worktree.discard', threadId: context.id });
                      closeContext();
                    }}
                  >
                    Discard
                  </GlassButton>
                </div>
              </div>
            ) : null}

            {mode === 'confirm-delete' ? (
              <div className="on-shell-context-rename">
                <p className="on-shell-list-empty">
                  Delete “{context.title}” and its history? This cannot be undone.
                </p>
                <div className="on-shell-context-rename-actions">
                  <GlassButton variant="ghost" block onClick={() => setMode('menu')}>
                    Cancel
                  </GlassButton>
                  <GlassButton
                    variant="danger"
                    block
                    onClick={() => {
                      store().deleteThread(context.id);
                      closeContext();
                    }}
                  >
                    Delete
                  </GlassButton>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassSheet>
    </>
  );
}
