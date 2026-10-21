import { memo, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { clock, dayLabel } from '@/lib/format';
import { renderMarkdown } from '@/lib/markdown';
import { toneDot } from '@/lib/tone';
import type { Agent, GroupRun, GroupUserMessage, Msg } from '@/lib/types';
import type { Thread } from '@/state/store';
import { ToolCard } from './ToolCard';

const HIDDEN_PARTS = new Set(['step-start', 'step-finish', 'snapshot', 'compaction']);

const Markdown = memo(function Markdown({ text, streaming }: { text: string; streaming: boolean }) {
  const html = useMemo(() => renderMarkdown(text, streaming), [text, streaming]);
  return <div className={`selectable${streaming ? ' caret-host' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
});

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className="reasoning">
      <button onClick={() => setOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500, fontSize: 12, color: 'var(--t3)' }}>
        <Icon name="brain" size={13} /> {live ? 'Thinking…' : 'Thought process'} <Icon name={open ? 'chevronDown' : 'chevron'} size={12} />
      </button>
      {open && <div style={{ marginTop: 6 }}>{text}</div>}
    </div>
  );
}

function FileChip({ part }: { part: any }) {
  if (String(part.mime).startsWith('image/') && String(part.url).startsWith('data:')) {
    return <img src={part.url} alt={part.filename ?? 'image'} style={{ maxWidth: 200, maxHeight: 200, borderRadius: 14, display: 'block', margin: '3px 0' }} />;
  }
  return (
    <span className="composer__chip" style={{ margin: '4px 0' }}>
      <Icon name="file" size={12} /> <span>{part.filename ?? part.mime}</span>
    </span>
  );
}

function errorText(err: any): string {
  if (!err) return '';
  const msg = err.data?.message ?? err.message ?? err.name;
  if (err.name === 'MessageAbortedError') return 'Stopped.';
  if (err.data?.statusCode === 429 || /rate.?limit|too many/i.test(msg)) return 'This free model is rate-limited right now. Wait a moment or pick another free model.';
  return String(msg);
}

/** One OpenCode message rendered as bubbles + tool cards. */
export const MessageView = memo(function MessageView({
  msg,
  isLastAssistant,
  busy,
  agent,
  showAgentTag,
  seen,
  onRetry,
  onSwitchModel,
  hidePlanJson,
}: {
  msg: Msg;
  isLastAssistant: boolean;
  busy: boolean;
  agent?: Agent;
  showAgentTag?: boolean;
  seen?: 'sending' | 'sent' | 'seen';
  onRetry?: () => void;
  onSwitchModel?: () => void;
  /** Team chats: the lead's machine-readable plan is shown as the task board instead. */
  hidePlanJson?: boolean;
}) {
  const role = msg.info.role;
  const parts = msg.order.map((id) => msg.parts[id]).filter((p) => p && !HIDDEN_PARTS.has(p.type) && !p.synthetic && !p.ignored);
  const completed = !!msg.info.time?.completed;
  const live = isLastAssistant && busy && !completed;

  if (role === 'user') {
    const texts = parts.filter((p) => p.type === 'text');
    const files = parts.filter((p) => p.type === 'file');
    return (
      <div className="msg-row msg-row--me">
        {files.map((f) => (
          <FileChip key={f.id} part={f} />
        ))}
        {texts.length > 0 && (
          <div className="bubble bubble--me selectable" style={{ whiteSpace: 'pre-wrap' }}>
            {texts.map((t) => t.text).join('\n')}
          </div>
        )}
        {seen && <div className="msg-meta">{seen === 'sending' ? 'Sending…' : seen === 'seen' ? 'Seen' : 'Sent'}</div>}
      </div>
    );
  }

  const lastTextId = [...parts].reverse().find((p) => p.type === 'text')?.id;
  // A file-editing tool row already states what changed; the summary patch pill would repeat it.
  const editedByTool = parts.some((q) => q.type === 'tool' && ['write', 'edit', 'multiedit', 'patch', 'apply_patch'].includes(q.tool));
  return (
    <div className="msg-row msg-row--ai">
      {showAgentTag && agent && (
        <div className="agent-tag">
          <i style={{ background: toneDot(agent.color) }} />
          {agent.name} <span>{agent.role}</span>
        </div>
      )}
      {parts.map((p) => {
        switch (p.type) {
          case 'text': {
            const text = hidePlanJson ? String(p.text ?? '').replace(/```json\s*\{[\s\S]*?"tasks"[\s\S]*?(```|$)/g, '').trim() : (p.text ?? '');
            if (!text.trim() && !(live && p.id === lastTextId)) return null;
            return (
              <div key={p.id} className={`bubble bubble--ai${live && p.id === lastTextId ? ' caret' : ''}`}>
                <Markdown text={text} streaming={live && p.id === lastTextId} />
              </div>
            );
          }
          case 'reasoning':
            return <Reasoning key={p.id} text={p.text ?? ''} live={live && !p.time?.end} />;
          case 'tool':
            if (p.tool === 'todowrite' || p.tool === 'todoread' || p.tool === 'question') return null;
            return <ToolCard key={p.id} part={p} />;
          case 'file':
            return <FileChip key={p.id} part={p} />;
          case 'patch':
            if (editedByTool) return null;
            return (
              <div key={p.id} className="delegation" style={{ alignSelf: 'flex-start', margin: '4px 0' }}>
                <Icon name="git" size={12} /> Changed {p.files?.length ?? 0} file{p.files?.length === 1 ? '' : 's'}
              </div>
            );
          case 'retry':
            return (
              <div key={p.id} className="delegation" style={{ alignSelf: 'flex-start' }}>
                <Icon name="refresh" size={12} /> Retrying (attempt {p.attempt})
              </div>
            );
          case 'agent':
          case 'subtask':
            return (
              <div key={p.id} className="delegation" style={{ alignSelf: 'flex-start' }}>
                <Icon name="users" size={12} /> {p.description ?? p.name ?? 'Sub-agent'}
              </div>
            );
          default:
            return null;
        }
      })}
      {msg.info.error && msg.info.error.name !== 'MessageAbortedError' && (
        <div className="banner banner--err" style={{ marginLeft: 0 }}>
          <Icon name="x" size={14} />
          <span style={{ flex: 1 }}>{errorText(msg.info.error)}</span>
          {onRetry && (
            <button className="btn btn--sm" onClick={onRetry}>
              Retry
            </button>
          )}
          {onSwitchModel && (
            <button className="btn btn--sm" onClick={onSwitchModel}>
              Other model
            </button>
          )}
        </div>
      )}
      {msg.info.error?.name === 'MessageAbortedError' && <div className="msg-meta">Stopped</div>}
    </div>
  );
});

export interface TimelineItem {
  key: string;
  at: number;
  kind: 'msg' | 'group-user' | 'delegation' | 'run';
  msg?: Msg;
  user?: GroupUserMessage;
  text?: string;
  run?: GroupRun;
}

/** Builds the ordered list of things to render, with day separators handled by the caller. */
export function buildTimeline(thread: Thread): TimelineItem[] {
  const items: TimelineItem[] = [];
  if (thread.kind === 'group') {
    for (const u of thread.userMessages ?? []) items.push({ key: u.id, at: u.createdAt, kind: 'group-user', user: u });
    const tasks = new Map((thread.runs ?? []).flatMap((r) => r.tasks.map((t) => [t.id, t] as const)));
    for (const m of Object.values(thread.msgs)) {
      if (m.info.role === 'user') {
        const meta = Object.values(m.parts).find((p: any) => p?.metadata?.maverick)?.metadata?.maverick ? Object.values(m.parts).find((p: any) => p?.metadata?.maverick)?.metadata : null;
        if (meta?.maverick === 'delegation') {
          const t = tasks.get(meta.taskId);
          const agent = thread.agents?.find((a) => a.id === m.agentId);
          items.push({ key: m.info.id, at: m.info.time?.created ?? 0, kind: 'delegation', text: `${agent?.name ?? 'Agent'} picked up: ${t?.title ?? 'a task'}` });
        }
        continue;
      }
      items.push({ key: m.info.id, at: m.info.time?.created ?? 0, kind: 'msg', msg: m });
    }
  } else {
    for (const m of Object.values(thread.msgs)) items.push({ key: m.info.id, at: m.info.time?.created ?? 0, kind: 'msg', msg: m });
  }
  items.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  return items;
}

export function DaySeparator({ at }: { at: number }) {
  return (
    <div className="day-sep">
      <b>{dayLabel(at)}</b> {clock(at)}
    </div>
  );
}
