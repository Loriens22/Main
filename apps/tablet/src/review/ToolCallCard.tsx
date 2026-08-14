/**
 * review/ToolCallCard.tsx
 *
 * How agent tool use is made visible. A long agent turn can contain dozens of
 * these, so the governing constraint is *scannability*: every card is small
 * and closed by default, its status is legible at a glance without reading a
 * word, and the two kinds an operator always wants open — an edit and a
 * failure — open themselves.
 */

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { ToolCall, ToolStatus } from '@ornight/protocol';
import { Glass, GlassBadge, GlassSpinner, cx } from '@ornight/glass';
import { InlineDiff } from './InlineDiff';
import { PathLabel } from './atoms';
import { formatDuration } from './util';
import './ToolCallCard.css';

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

const STATUS_LABEL: Record<ToolStatus, string> = {
  pending: 'Queued',
  'awaiting-permission': 'Needs approval',
  running: 'Running',
  ok: 'Done',
  error: 'Failed',
  denied: 'Denied',
};

const STATUS_TONE: Record<ToolStatus, 'neutral' | 'accent' | 'success' | 'warn' | 'danger'> = {
  pending: 'neutral',
  'awaiting-permission': 'warn',
  running: 'accent',
  ok: 'success',
  error: 'danger',
  denied: 'neutral',
};

function StatusMark({ status }: { status: ToolStatus }) {
  if (status === 'running') return <GlassSpinner size={13} />;
  if (status === 'ok') return <span className="on-rev-tool__tick" aria-hidden="true">✓</span>;
  if (status === 'error') return <span className="on-rev-tool__bang" aria-hidden="true">!</span>;
  if (status === 'denied') return <span className="on-rev-tool__slash" aria-hidden="true">⊘</span>;
  if (status === 'awaiting-permission') {
    return <span className="on-rev-tool__wait on-rev-live" aria-hidden="true">●</span>;
  }
  return <span className="on-rev-tool__idle" aria-hidden="true">○</span>;
}

/* -------------------------------------------------------------------------- */
/* Input readers — defensive, because `input` is provider-shaped               */
/* -------------------------------------------------------------------------- */

function str(input: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function num(input: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

interface TodoItem {
  text: string;
  done: boolean;
  active: boolean;
}

/**
 * Todo payloads differ per provider — `todos`, `items`, or the bare array —
 * and each names the "done" flag differently. Anything unrecognisable simply
 * yields no list, and the card falls back to its generic treatment.
 */
function readTodos(input: Record<string, unknown>): TodoItem[] {
  const source = input['todos'] ?? input['items'] ?? input['list'] ?? input['tasks'];
  if (!Array.isArray(source)) return [];
  const out: TodoItem[] = [];
  for (const raw of source.slice(0, 60)) {
    if (typeof raw === 'string') {
      out.push({ text: raw, done: false, active: false });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const text = str(item, 'content', 'text', 'title', 'task', 'name');
    if (!text) continue;
    const status = str(item, 'status', 'state')?.toLowerCase() ?? '';
    const done = item['completed'] === true || status === 'completed' || status === 'done';
    const active = status === 'in_progress' || status === 'in-progress' || status === 'active';
    out.push({ text, done, active });
  }
  return out;
}

function readRange(input: Record<string, unknown>): string | null {
  const start = num(input, 'offset', 'start_line', 'startLine', 'start', 'from');
  const limit = num(input, 'limit', 'count');
  const end = num(input, 'end_line', 'endLine', 'end', 'to');
  if (start === null && end === null) return null;
  if (start !== null && end !== null) return `lines ${start}–${end}`;
  if (start !== null && limit !== null) return `lines ${start}–${start + limit}`;
  if (start !== null) return `from line ${start}`;
  return `to line ${end}`;
}

/** Output line count is the cheapest honest proxy for "how many matches". */
function countLines(output: string | null): number {
  if (!output) return 0;
  let lines = 0;
  for (const line of output.split('\n')) if (line.trim()) lines += 1;
  return lines;
}

/* -------------------------------------------------------------------------- */
/* Output block                                                               */
/* -------------------------------------------------------------------------- */

const OUTPUT_CAP = 200;
const OUTPUT_HARD_CAP = 4000;

function OutputBlock({ output, tone }: { output: string; tone?: 'terminal' | 'quiet' }) {
  const [expanded, setExpanded] = useState(false);
  const lines = useMemo(() => output.replace(/\s+$/, '').split('\n'), [output]);
  const hidden = Math.max(0, lines.length - OUTPUT_CAP);
  const shown = expanded ? lines.slice(0, OUTPUT_HARD_CAP) : lines.slice(0, OUTPUT_CAP);

  return (
    <div className={cx('on-rev-out', tone === 'terminal' && 'on-rev-out--terminal')}>
      <pre className="on-rev-out__pre">{shown.join('\n')}</pre>
      {hidden > 0 ? (
        <button type="button" className="on-rev-out__more" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Collapse output' : `Show ${hidden} more line${hidden === 1 ? '' : 's'}`}
        </button>
      ) : null}
      {expanded && lines.length > OUTPUT_HARD_CAP ? (
        <div className="on-rev-out__truncated">
          Output truncated at {OUTPUT_HARD_CAP} lines.
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export interface ToolCallCardProps {
  call: ToolCall;
}

export function ToolCallCard({ call }: ToolCallCardProps) {
  const openByDefault = call.category === 'edit' || call.status === 'error';
  const [open, setOpen] = useState(openByDefault);

  const duration =
    call.endedAt !== null && call.endedAt > call.startedAt
      ? formatDuration(call.endedAt - call.startedAt)
      : '';

  const summary = summarise(call);

  return (
    <Glass
      as="section"
      tone={call.status === 'error' ? 'accent' : 'panel'}
      radius="sm"
      border
      className={cx(
        'on-rev-tool',
        `on-rev-tool--${call.category}`,
        `on-rev-tool--is-${call.status}`,
        call.status === 'running' && 'on-rev-shimmer',
      )}
    >
      <button
        type="button"
        className="on-rev-tool__head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="on-rev-tool__mark">
          <StatusMark status={call.status} />
        </span>

        <span className="on-rev-tool__title">
          <span className="on-rev-tool__name">{call.title || call.name}</span>
          <span className="on-rev-tool__target">{summary}</span>
        </span>

        {call.status === 'shell' ? null : null}
        {duration ? <span className="on-rev-tool__time">{duration}</span> : null}
        {call.status !== 'ok' ? (
          <GlassBadge tone={STATUS_TONE[call.status]} size="sm">
            {STATUS_LABEL[call.status]}
          </GlassBadge>
        ) : null}
        <span className={cx('on-rev-tool__chev', open && 'on-rev-tool__chev--open')} aria-hidden="true">
          ▸
        </span>
      </button>

      {open ? <div className="on-rev-tool__body">{renderBody(call)}</div> : null}
    </Glass>
  );
}

/** The one line under the tool name when the card is closed. */
function summarise(call: ToolCall): string {
  if (call.category === 'search') {
    const query = str(call.input, 'pattern', 'query', 'q', 'search') ?? call.target;
    const matches = countLines(call.output);
    return matches > 0 ? `${query} · ${matches} match${matches === 1 ? '' : 'es'}` : query;
  }
  if (call.category === 'read') {
    const range = readRange(call.input);
    return range ? `${call.target} · ${range}` : call.target;
  }
  if (call.category === 'todo') {
    const todos = readTodos(call.input);
    if (todos.length === 0) return call.target;
    const done = todos.filter((t) => t.done).length;
    return `${done}/${todos.length} complete`;
  }
  if (call.category === 'edit' && call.patch) {
    return `+${call.patch.insertions} −${call.patch.deletions}`;
  }
  return call.target;
}

function renderBody(call: ToolCall): ReactNode {
  const failure =
    call.status === 'error' && call.output ? (
      <div className="on-rev-tool__error">{call.output}</div>
    ) : null;

  switch (call.category) {
    case 'shell':
      return (
        <>
          <div className="on-rev-tool__cmd">
            <span className="on-rev-tool__prompt" aria-hidden="true">
              $
            </span>
            <code>{call.target}</code>
          </div>
          {call.output ? <OutputBlock output={call.output} tone="terminal" /> : null}
          {call.exitCode !== null ? (
            <div className="on-rev-tool__foot">
              <GlassBadge tone={call.exitCode === 0 ? 'success' : 'danger'} size="sm">
                exit {call.exitCode}
              </GlassBadge>
            </div>
          ) : null}
        </>
      );

    case 'edit':
      return call.patch ? (
        <InlineDiff patch={call.patch} compact />
      ) : (
        <>
          <div className="on-rev-tool__row">
            <PathLabel path={call.target} />
          </div>
          {failure}
        </>
      );

    case 'read': {
      const range = readRange(call.input);
      return (
        <>
          <div className="on-rev-tool__row">
            <PathLabel path={call.target} />
            {range ? <span className="on-rev-tool__dim">{range}</span> : null}
          </div>
          {failure}
        </>
      );
    }

    case 'search': {
      const query = str(call.input, 'pattern', 'query', 'q', 'search') ?? call.target;
      const path = str(call.input, 'path', 'dir', 'directory', 'glob', 'include');
      return (
        <>
          <div className="on-rev-tool__row">
            <code className="on-rev-tool__query">{query}</code>
            {path ? <span className="on-rev-tool__dim">in {path}</span> : null}
          </div>
          {call.output ? <OutputBlock output={call.output} /> : null}
          {failure}
        </>
      );
    }

    case 'web': {
      const url = str(call.input, 'url', 'href') ?? call.target;
      const isLink = /^https?:\/\//i.test(url);
      return (
        <>
          <div className="on-rev-tool__row">
            {isLink ? (
              <a className="on-rev-tool__link" href={url} target="_blank" rel="noreferrer noopener">
                {url}
              </a>
            ) : (
              <span className="on-rev-tool__dim">{url}</span>
            )}
          </div>
          {call.output ? <OutputBlock output={call.output} /> : null}
          {failure}
        </>
      );
    }

    case 'todo': {
      const todos = readTodos(call.input);
      if (todos.length === 0) return call.output ? <OutputBlock output={call.output} /> : failure;
      return (
        <ul className="on-rev-todo">
          {todos.map((todo, index) => (
            <li
              key={`${index}:${todo.text}`}
              className={cx(
                'on-rev-todo__item',
                todo.done && 'on-rev-todo__item--done',
                todo.active && 'on-rev-todo__item--active',
              )}
            >
              <span className="on-rev-todo__box" aria-hidden="true">
                {todo.done ? '✓' : todo.active ? '▸' : ''}
              </span>
              <span className="on-rev-todo__text">{todo.text}</span>
            </li>
          ))}
        </ul>
      );
    }

    case 'task':
      return (
        <>
          <div className="on-rev-tool__row">
            <span className="on-rev-tool__dim">{call.target}</span>
          </div>
          {call.output ? <OutputBlock output={call.output} /> : null}
          {failure}
        </>
      );

    case 'other':
    default:
      return (
        <>
          {call.target ? (
            <div className="on-rev-tool__row">
              <span className="on-rev-tool__dim">{call.target}</span>
            </div>
          ) : null}
          {call.output ? <OutputBlock output={call.output} /> : null}
          {failure}
        </>
      );
  }
}
