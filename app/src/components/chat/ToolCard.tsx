import { memo, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { cleanDiff, stripAnsi } from '@/lib/format';

const ICONS: Record<string, IconName> = {
  bash: 'terminal',
  edit: 'edit',
  write: 'file',
  read: 'file',
  patch: 'edit',
  multiedit: 'edit',
  apply_patch: 'edit',
  glob: 'search',
  grep: 'search',
  list: 'folder',
  webfetch: 'globe',
  websearch: 'globe',
  task: 'users',
  todowrite: 'list',
  skill: 'sparkle',
};

function short(p?: string): string {
  if (!p) return '';
  const parts = String(p).split('/');
  return parts.slice(-2).join('/');
}

function describe(part: any): { title: string; sub?: string } {
  const input = part.state?.input ?? {};
  const st = part.state ?? {};
  switch (part.tool) {
    case 'bash':
      return { title: input.description || 'Run command', sub: input.command ? `$ ${input.command}` : undefined };
    case 'edit':
    case 'multiedit':
      return { title: `Edit ${short(input.filePath)}`, sub: st.title };
    case 'write':
      return { title: `Write ${short(input.filePath)}` };
    case 'read':
      return { title: `Read ${short(input.filePath)}` };
    case 'glob':
      return { title: `Find files`, sub: input.pattern };
    case 'grep':
      return { title: `Search code`, sub: input.pattern };
    case 'list':
      return { title: `List ${short(input.path) || 'folder'}` };
    case 'webfetch':
      return { title: 'Fetch web page', sub: input.url };
    case 'websearch':
      return { title: 'Search the web', sub: input.query };
    case 'task':
      return { title: input.description || 'Sub-agent task', sub: input.subagent_type };
    case 'patch':
    case 'apply_patch':
      return { title: 'Apply patch', sub: st.title };
    case 'skill':
      return { title: `Use skill ${input.name ?? ''}` };
    case 'invalid':
      return { title: 'Tried a tool that isn’t available here', sub: input.tool ? `${input.tool}` : undefined };
    default:
      return { title: part.tool, sub: st.title };
  }
}

function DiffView({ diff }: { diff: string }) {
  const lines = cleanDiff(diff).split('\n').slice(0, 400);
  return (
    <>
      {lines.map((l, i) => {
        const cls = l.startsWith('+++') || l.startsWith('---') ? 'diff-hunk' : l.startsWith('+') ? 'diff-add' : l.startsWith('-') ? 'diff-del' : l.startsWith('@@') ? 'diff-hunk' : undefined;
        return (
          <span key={i} className={cls} style={cls ? undefined : { display: 'block' }}>
            {l || ' '}
          </span>
        );
      })}
    </>
  );
}

export const ToolCard = memo(function ToolCard({ part }: { part: any }) {
  const [open, setOpen] = useState(false);
  const st = part.state ?? {};
  const status: string = st.status ?? 'pending';
  const { title, sub } = describe(part);
  const input = st.input ?? {};
  const md = st.metadata ?? {};
  const exit = md.exit;
  const failed = status === 'error' || (part.tool === 'bash' && status === 'completed' && exit != null && Number(exit) !== 0);

  let body: React.ReactNode = null;
  if (part.tool === 'bash') {
    const out = stripAnsi(String(md.output ?? st.output ?? ''));
    body = (
      <>
        <span style={{ color: 'var(--ink-3)' }}>$ {input.command}</span>
        {'\n'}
        {out || (status === 'running' ? '…' : '(no output)')}
        {exit != null && status === 'completed' && <span style={{ color: Number(exit) === 0 ? 'var(--ok)' : 'var(--danger)', display: 'block', marginTop: 6 }}>exit {exit}</span>}
      </>
    );
  } else if (md.diff) {
    body = <DiffView diff={String(md.diff)} />;
  } else if (part.tool === 'write' && input.content) {
    body = String(input.content).split('\n').slice(0, 120).join('\n');
  } else if (status === 'error') {
    body = String(st.error ?? 'Failed');
  } else if (st.output && !['read'].includes(part.tool)) {
    body = stripAnsi(String(st.output)).slice(0, 8000);
  } else if (Object.keys(input).length && part.tool !== 'read') {
    body = JSON.stringify(input, null, 2).slice(0, 4000);
  }

  const fd = md.filediff;
  return (
    <div className="tool">
      <button className="tool__head" onClick={() => body && setOpen((v) => !v)} aria-expanded={open}>
        <span className="tool__icon" style={failed ? { color: 'var(--danger)' } : undefined}>
          <Icon name={ICONS[part.tool] ?? 'bolt'} size={13} />
        </span>
        <span className="tool__title">
          {title}
          {sub && <small>{sub}</small>}
        </span>
        {fd && (fd.additions || fd.deletions) ? (
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--ok)' }}>+{fd.additions ?? 0}</span> <span style={{ color: 'var(--danger)' }}>−{fd.deletions ?? 0}</span>
          </span>
        ) : null}
        {/* Success is the default, so only running and failed steps carry a state mark. */}
        {status === 'running' || status === 'pending' ? (
          <span className="tool__state--run spinner" />
        ) : failed ? (
          <Icon name="x" size={14} className="tool__state--err" />
        ) : null}
        {body ? <Icon name={open ? 'chevronDown' : 'chevron'} size={13} style={{ color: 'var(--t3)' }} /> : null}
      </button>
      {open && body && <div className="tool__body">{body}</div>}
    </div>
  );
});
