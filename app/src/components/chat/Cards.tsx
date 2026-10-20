import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Glass } from '@/glass/Glass';
import { haptic } from '@/lib/platform';
import { cleanDiff } from '@/lib/format';
import type { Agent, GroupRun, PermissionRequest, QuestionRequest } from '@/lib/types';
import { answerPermission, answerQuestion, toast } from '@/state/store';

export function PermissionCard({ chatId, req, agent }: { chatId: string; req: PermissionRequest; agent?: Agent }) {
  const [busy, setBusy] = useState(false);
  const reply = async (r: 'once' | 'always' | 'reject') => {
    setBusy(true);
    r === 'reject' ? haptic.medium() : haptic.success();
    try {
      await answerPermission(chatId, req.id, r);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };
  const md = req.metadata ?? {};
  const detail = req.permission === 'bash' ? (md.command ?? req.patterns.join('\n')) : md.diff ? cleanDiff(String(md.diff)).slice(0, 2000) : req.patterns.join('\n');
  const who = agent?.name ?? 'Maverick';
  return (
    <Glass className="card" radius={22} refract variant="strong" style={{ alignSelf: 'flex-start', border: '1px solid rgba(255,138,61,0.35)' }}>
      <div className="card__title">
        <span className="tool__icon" style={{ background: 'rgba(255,138,61,0.18)', color: 'var(--flame)' }}>
          <Icon name="shield" size={17} />
        </span>
        <span style={{ flex: 1 }}>{who} needs your approval</span>
      </div>
      <div className="card__body">{req.title.replace(/`/g, '')}</div>
      {detail && <div className="perm-cmd selectable">{detail}</div>}
      <div className="card__actions">
        <Glass as="button" className="btn" radius={999} interactive variant="clear" onClick={() => reply('reject')} disabled={busy}>
          Deny
        </Glass>
        <Glass as="button" className="btn" radius={999} interactive variant="accent" onClick={() => reply('once')} disabled={busy}>
          Allow once
        </Glass>
        {req.always?.length > 0 && (
          <Glass as="button" className="btn" radius={999} interactive variant="strong" onClick={() => reply('always')} disabled={busy} style={{ flexBasis: '100%' }}>
            Always allow {req.always.length === 1 && req.always[0] !== '*' ? `“${req.always[0].slice(0, 40)}”` : 'this kind of action'}
          </Glass>
        )}
      </div>
    </Glass>
  );
}

export function QuestionCard({ chatId, req }: { chatId: string; req: QuestionRequest }) {
  const [sel, setSel] = useState<string[][]>(req.questions.map(() => []));
  const [custom, setCustom] = useState<string[]>(req.questions.map(() => ''));
  const toggle = (qi: number, label: string, multiple?: boolean) => {
    haptic.tap();
    setSel((s) => s.map((a, i) => (i !== qi ? a : multiple ? (a.includes(label) ? a.filter((x) => x !== label) : [...a, label]) : [label])));
  };
  const submit = async () => {
    const answers = sel.map((a, i) => (custom[i].trim() ? [...a, custom[i].trim()] : a));
    await answerQuestion(chatId, req.id, answers).catch((e) => toast(e.message, 'error'));
  };
  return (
    <Glass className="card" radius={22} refract variant="strong" style={{ alignSelf: 'flex-start' }}>
      {req.questions.map((q, qi) => (
        <div key={qi} style={{ marginBottom: 12 }}>
          <div className="card__title">
            <Icon name="sparkle" size={17} /> {q.header}
          </div>
          <div className="card__body">{q.question}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {q.options.map((o) => (
              <button key={o.label} className="composer__chip" style={sel[qi].includes(o.label) ? { background: 'var(--accent)', color: '#fff', borderColor: 'transparent' } : undefined} onClick={() => toggle(qi, o.label, q.multiple)} title={o.description}>
                {o.label}
              </button>
            ))}
          </div>
          {q.custom !== false && (
            <input className="field" style={{ marginTop: 10, height: 44 }} placeholder="Or type your own answer" value={custom[qi]} onChange={(e) => setCustom((c) => c.map((x, i) => (i === qi ? e.target.value : x)))} />
          )}
        </div>
      ))}
      <div className="card__actions">
        <Glass as="button" className="btn" radius={999} interactive variant="clear" onClick={() => answerQuestion(chatId, req.id, null)}>
          Skip
        </Glass>
        <Glass as="button" className="btn" radius={999} interactive variant="accent" onClick={submit} disabled={sel.every((a, i) => !a.length && !custom[i].trim())}>
          Answer
        </Glass>
      </div>
    </Glass>
  );
}

export function TodoCard({ todos }: { todos: { content: string; status: string; priority?: string }[] }) {
  const [open, setOpen] = useState(true);
  if (!todos.length) return null;
  const done = todos.filter((t) => t.status === 'completed').length;
  return (
    <div className="tool" style={{ alignSelf: 'flex-start' }}>
      <button className="tool__head" onClick={() => setOpen((v) => !v)}>
        <span className="tool__icon">
          <Icon name="list" size={17} />
        </span>
        <span className="tool__title">
          Plan
          <small>
            {done}/{todos.length} done
          </small>
        </span>
        <Icon name={open ? 'chevronDown' : 'chevron'} size={16} style={{ color: 'var(--ink-3)' }} />
      </button>
      {open && (
        <div style={{ padding: '4px 14px 12px', borderTop: '1px solid var(--line)' }}>
          {todos.map((t, i) => (
            <div key={i} className={`todo${t.status === 'completed' ? ' todo--done' : t.status === 'in_progress' ? ' todo--active' : ''}`}>
              <span className="todo__box">{t.status === 'completed' && <Icon name="check" size={13} stroke={3} />}</span>
              <span>{t.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  running: 'Working',
  summarizing: 'Wrapping up',
  done: 'Done',
  failed: 'Finished with issues',
  cancelled: 'Stopped',
};

export function TaskBoard({ run, agents }: { run: GroupRun; agents: Agent[] }) {
  const [open, setOpen] = useState(true);
  const done = run.tasks.filter((t) => t.status === 'done').length;
  const active = ['planning', 'running', 'summarizing'].includes(run.status);
  return (
    <Glass className="taskboard" radius={22} refract variant="strong">
      <button className="taskboard__head" onClick={() => setOpen((v) => !v)}>
        {active ? <span className="spinner" style={{ color: 'var(--accent)' }} /> : <Icon name={run.status === 'done' ? 'check' : 'list'} size={18} />}
        <span style={{ flex: 1 }}>
          {STATUS_LABEL[run.status]}
          {run.tasks.length > 0 && (
            <span className="muted" style={{ fontWeight: 600 }}>
              {' '}
              · {done}/{run.tasks.length} tasks
            </span>
          )}
        </span>
        <Icon name={open ? 'chevronDown' : 'chevron'} size={16} style={{ color: 'var(--ink-3)' }} />
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {run.status === 'planning' && <div className="muted" style={{ fontSize: 13.5, padding: '4px 0' }}>The lead is reading the project and splitting the work…</div>}
          {run.tasks.map((t) => {
            const a = agents.find((x) => x.id === t.agentId);
            return (
              <div className="task" key={t.id}>
                <span className="avatar" style={{ width: 26, height: 26, fontSize: 11, background: a?.color ?? 'var(--card-2)' }}>
                  {a?.name[0] ?? '?'}
                </span>
                <div className="task__title">
                  {t.title}
                  <small>
                    {a?.name ?? 'Agent'} · {a?.role ?? ''}
                    {t.dependsOn.length ? ` · after #${t.dependsOn.map((d) => d + 1).join(', #')}` : ''}
                  </small>
                </div>
                <span className={`status-pill status-pill--${t.status}`}>
                  {t.status === 'running' && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />}
                  {t.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Glass>
  );
}
