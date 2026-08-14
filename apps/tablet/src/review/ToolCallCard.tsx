import { memo, useState } from 'react';
import type { ToolCall, ToolCategory, ToolStatus } from '@ornight/protocol';
import { GlassSpinner } from '@ornight/glass';
import { InlineDiff } from './InlineDiff';
import { formatDuration, middleTruncate } from './util';
import './ToolCallCard.css';

/** How many lines of shell output we show before folding the rest away. */
const OUTPUT_LINE_CAP = 200;
const COLLAPSED_OUTPUT_LINES = 12;

const CATEGORY_GLYPH: Record<ToolCategory, string> = {
  read: '◎',
  edit: '✎',
  shell: '›_',
  search: '⌕',
  web: '◍',
  task: '◈',
  todo: '☑',
  other: '•',
};

/**
 * One agent tool invocation, rendered so a glance answers "what did it do, did
 * it work, and do I need to look closer".
 *
 * Collapsed by default, because a long turn is mostly reads and searches that
 * nobody needs to see. The two exceptions are edits and failures — those are
 * the ones that change your repository or your plans, so they open themselves.
 */
export const ToolCallCard = memo(function ToolCallCard({ call }: { call: ToolCall }) {
  const opensItself = call.category === 'edit' || call.status === 'error';
  const [open, setOpen] = useState(opensItself);

  const duration =
    call.endedAt && call.startedAt ? formatDuration(call.endedAt - call.startedAt) : null;

  return (
    <div className="on-rev-tool" data-status={call.status} data-category={call.category}>
      <button
        type="button"
        className="on-rev-tool-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="on-rev-tool-glyph" aria-hidden="true">
          {CATEGORY_GLYPH[call.category]}
        </span>

        <span className="on-rev-tool-heading">
          <span className="on-rev-tool-title">{call.title}</span>
          <span className="on-rev-tool-target" title={call.target}>
            {middleTruncate(call.target, 54)}
          </span>
        </span>

        <StatusMark status={call.status} duration={duration} exitCode={call.exitCode} />
      </button>

      {open && <ToolBody call={call} />}
    </div>
  );
});

/* -------------------------------------------------------------------------- */

function StatusMark({
  status,
  duration,
  exitCode,
}: {
  status: ToolStatus;
  duration: string | null;
  exitCode: number | null;
}) {
  if (status === 'running') {
    return (
      <span className="on-rev-tool-status">
        <GlassSpinner size={14} />
      </span>
    );
  }

  if (status === 'awaiting-permission') {
    return (
      <span className="on-rev-tool-status on-rev-tool-status-warn">
        <span className="on-rev-tool-pulse" aria-hidden="true" />
        Needs you
      </span>
    );
  }

  if (status === 'denied') {
    return <span className="on-rev-tool-status on-rev-tool-status-muted">Denied</span>;
  }

  if (status === 'error') {
    return (
      <span className="on-rev-tool-status on-rev-tool-status-danger">
        {exitCode === null ? 'Failed' : `exit ${exitCode}`}
      </span>
    );
  }

  return (
    <span className="on-rev-tool-status on-rev-tool-status-ok">
      {duration ?? ''}
      <span className="on-rev-tool-tick" aria-hidden="true">
        ✓
      </span>
    </span>
  );
}

function ToolBody({ call }: { call: ToolCall }) {
  if (call.category === 'edit' && call.patch) {
    return (
      <div className="on-rev-tool-body">
        <InlineDiff patch={call.patch} compact />
      </div>
    );
  }

  if (call.category === 'todo') {
    const items = Array.isArray(call.input.todos) ? (call.input.todos as unknown[]) : null;
    if (items) {
      return (
        <div className="on-rev-tool-body">
          <ul className="on-rev-tool-todos">
            {items.map((item, index) => {
              const todo = item as { content?: string; status?: string };
              return (
                <li key={index} data-state={todo.status ?? 'pending'}>
                  <span aria-hidden="true">{todo.status === 'completed' ? '☑' : '☐'}</span>
                  {todo.content ?? String(item)}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
  }

  if (!call.output) {
    return (
      <div className="on-rev-tool-body">
        <p className="on-rev-tool-empty">
          {call.status === 'running' ? 'Running…' : 'No output.'}
        </p>
      </div>
    );
  }

  return (
    <div className="on-rev-tool-body">
      <Output text={call.output} shell={call.category === 'shell'} />
    </div>
  );
}

/**
 * Long output is capped in two stages: a soft cap you can expand past, and a
 * hard cap that keeps a runaway build log from putting tens of thousands of
 * nodes in the document.
 */
function Output({ text, shell }: { text: string; shell: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const lines = text.replace(/\s+$/, '').split('\n');
  const truncatedByHardCap = lines.length > OUTPUT_LINE_CAP;
  const capped = truncatedByHardCap ? lines.slice(-OUTPUT_LINE_CAP) : lines;
  const visible = expanded ? capped : capped.slice(0, COLLAPSED_OUTPUT_LINES);
  const hidden = capped.length - visible.length;

  return (
    <>
      {truncatedByHardCap && (
        <p className="on-rev-tool-note">
          Showing the last {OUTPUT_LINE_CAP} of {lines.length} lines.
        </p>
      )}
      <pre className={shell ? 'on-rev-tool-out on-rev-tool-out-shell' : 'on-rev-tool-out'}>
        {visible.join('\n')}
      </pre>
      {hidden > 0 && (
        <button type="button" className="on-rev-tool-more" onClick={() => setExpanded(true)}>
          Show {hidden} more {hidden === 1 ? 'line' : 'lines'}
        </button>
      )}
    </>
  );
}
