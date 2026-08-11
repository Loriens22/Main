import { memo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { Thread, ThreadStatus } from '@ornight/protocol';
import { providerOf } from '@ornight/protocol/providers';
import { useLongPress } from '@ornight/glass';
import { PinIcon } from './icons';
import { changeSummary, oneLine, relativeTime } from './format';
import './ThreadRow.css';

type StatusTone = 'running' | 'permission' | 'error' | 'input' | 'archived';

interface StatusView {
  tone: StatusTone;
  label: string;
  pulse: boolean;
}

/**
 * Status priority and vocabulary mirror T3 Code's sidebar pills: a coloured dot
 * plus a single word, with the pulse reserved for states that are actually
 * moving. `idle` renders nothing so a quiet list stays quiet.
 */
function statusView(status: ThreadStatus): StatusView | null {
  switch (status) {
    case 'running':
      return { tone: 'running', label: 'Working', pulse: true };
    case 'awaiting-permission':
      return { tone: 'permission', label: 'Needs you', pulse: true };
    case 'error':
      return { tone: 'error', label: 'Error', pulse: false };
    case 'awaiting-input':
      return { tone: 'input', label: 'Waiting', pulse: false };
    case 'archived':
      return { tone: 'archived', label: 'Archived', pulse: false };
    case 'idle':
      return null;
  }
}

export interface ThreadRowProps {
  thread: Thread;
  active: boolean;
  onSelect: (id: string) => void;
  onContext: (thread: Thread) => void;
}

export const ThreadRow = memo(function ThreadRow({ thread, active, onSelect, onContext }: ThreadRowProps) {
  const provider = providerOf(thread.provider);
  const status = statusView(thread.status);
  const diff = changeSummary(thread.stats.insertions, thread.stats.deletions);
  const longPress = useLongPress(() => onContext(thread));
  const rowRef = useRef<HTMLDivElement | null>(null);

  const handleActivate = () => {
    // A long press that already opened the context sheet must not also navigate.
    if (longPress.consumed()) return;
    onSelect(thread.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(thread.id);
  };

  const accent = { '--on-row-accent': provider.accent } as CSSProperties;

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      className="on-shell-row"
      style={accent}
      data-active={active}
      data-pressed={longPress.pressed}
      data-status={thread.status}
      aria-current={active ? 'true' : undefined}
      aria-label={`${thread.title}. ${provider.label}. ${status?.label ?? 'Idle'}.`}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      onPointerDown={longPress.onPointerDown}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
      onContextMenu={longPress.onContextMenu}
    >
      <span className="on-shell-row-glyph" aria-hidden="true">
        {provider.glyph}
      </span>

      <span className="on-shell-row-main">
        <span className="on-shell-row-top">
          {thread.pinned ? (
            <span className="on-shell-row-pin" aria-label="Pinned">
              <PinIcon size={12} />
            </span>
          ) : null}
          <span className="on-shell-row-title">{thread.title || 'Untitled thread'}</span>
          <time className="on-shell-row-time" dateTime={new Date(thread.updatedAt).toISOString()}>
            {relativeTime(thread.updatedAt)}
          </time>
        </span>

        <span className="on-shell-row-bottom">
          {status ? (
            <span className="on-shell-status" data-tone={status.tone} data-pulse={status.pulse}>
              <span className="on-shell-status-dot" aria-hidden="true" />
              {status.label}
            </span>
          ) : null}
          <span className="on-shell-row-preview">
            {oneLine(thread.error ?? thread.preview) || provider.label}
          </span>
          {diff ? (
            <span className="on-shell-row-diff" aria-label={`${thread.stats.filesChanged} files changed`}>
              {thread.stats.insertions > 0 ? (
                <span className="on-shell-row-ins">{`+${thread.stats.insertions}`}</span>
              ) : null}
              {thread.stats.deletions > 0 ? (
                <span className="on-shell-row-del">{`−${thread.stats.deletions}`}</span>
              ) : null}
            </span>
          ) : null}
        </span>
      </span>

      {/* Long-press is the primary path; this keeps the same menu reachable
          with a plain tap and with a keyboard. */}
      <button
        type="button"
        className="on-shell-row-more"
        aria-label={`Actions for ${thread.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onContext(thread);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        ⋯
      </button>
    </div>
  );
});
