import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { ModelPicker } from '@/components/ModelPicker';
import { Sheet } from '@/components/Sheet';
import { Glass } from '@/glass/Glass';
import { api } from '@/lib/api';
import { bytes } from '@/lib/format';
import { haptic } from '@/lib/platform';
import type { ApprovalMode, ModelInfo, Project } from '@/lib/types';
import { closeSheet, createChat, createProject, deleteChat, goHome, navigate, patchChat, toast, useStore } from '@/state/store';

const APPROVAL: { id: ApprovalMode; title: string; sub: string }[] = [
  { id: 'ask', title: 'Ask first', sub: 'Approve every file edit and command' },
  { id: 'auto-edit', title: 'Auto-edit', sub: 'Edits are automatic, commands need approval' },
  { id: 'full', title: 'Full auto', sub: 'Runs everything (dangerous commands stay blocked)' },
];

export function Sheets() {
  const sheet = useStore((s) => s.sheet);
  return (
    <>
      <NewChatSheet open={sheet?.name === 'new-chat'} />
      <NewGroupSheet open={sheet?.name === 'new-group'} />
      <ChatMenuSheet open={sheet?.name === 'chat-menu'} chatId={sheet?.props?.chatId} />
      <RenameSheet open={sheet?.name === 'rename-chat'} chatId={sheet?.props?.chatId} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Project chooser shared by new chat / new team                      */
/* ------------------------------------------------------------------ */
function ProjectChooser({ value, onChange }: { value: string | null; onChange: (id: string | null, draft?: { name: string; repo: string }) => void }) {
  const projects = useStore((s) => s.projects);
  const github = useStore((s) => s.github);
  const [mode, setMode] = useState<'existing' | 'new' | 'github'>(projects.length ? 'existing' : 'new');
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');
  const [repos, setRepos] = useState<{ fullName: string; private: boolean; description: string | null }[] | null>(null);

  useEffect(() => {
    if (mode === 'existing') onChange(value ?? projects[0]?.id ?? null);
    else onChange(null, { name, repo: mode === 'github' ? repo : '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, name, repo]);

  useEffect(() => {
    if (mode === 'github' && github.connected && !repos) {
      api<any[]>('/api/github/repos')
        .then(setRepos)
        .catch(() => setRepos([]));
    }
  }, [mode, github.connected, repos]);

  return (
    <>
      <div className="segmented" style={{ background: 'var(--card)' }}>
        <button aria-pressed={mode === 'existing'} onClick={() => setMode('existing')} disabled={!projects.length}>
          Existing
        </button>
        <button aria-pressed={mode === 'new'} onClick={() => setMode('new')}>
          New project
        </button>
        <button aria-pressed={mode === 'github'} onClick={() => setMode('github')}>
          From GitHub
        </button>
      </div>
      {mode === 'existing' && (
        <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
          {projects.map((p: Project) => (
            <button key={p.id} className="option" aria-selected={value === p.id} onClick={() => onChange(p.id)}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: p.color, flex: 'none' }} />
              <div className="option__main">
                <div className="option__title">{p.name}</div>
                {p.repo && <div className="option__sub">github.com/{p.repo}</div>}
              </div>
              {value === p.id && <Icon name="check" size={18} style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      )}
      {mode === 'new' && <input className="field" style={{ marginTop: 10 }} placeholder="Project name, e.g. weather-app" value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
      {mode === 'github' && (
        <div style={{ marginTop: 10 }}>
          <input className="field" placeholder="owner/repository" value={repo} onChange={(e) => setRepo(e.target.value)} autoCapitalize="off" autoCorrect="off" />
          {!github.connected && <div className="muted" style={{ fontSize: 13, margin: '8px 6px' }}>Public repos work without login. Connect GitHub in Settings to clone private repos and push.</div>}
          {repos && repos.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
              {repos.slice(0, 50).map((r) => (
                <button key={r.fullName} className="option" aria-selected={repo === r.fullName} onClick={() => setRepo(r.fullName)}>
                  <Icon name="github" size={18} />
                  <div className="option__main">
                    <div className="option__title">
                      {r.fullName} {r.private && <span className="badge badge--muted">private</span>}
                    </div>
                    {r.description && <div className="option__sub">{r.description}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

async function resolveProject(projectId: string | null, draft?: { name: string; repo: string }): Promise<string> {
  if (projectId) return projectId;
  if (!draft || (!draft.name.trim() && !draft.repo.trim())) throw new Error('Pick a project or name a new one');
  const p = await createProject(draft.name.trim(), draft.repo.trim() || undefined);
  return p.id;
}

function ModelRow({ value, onClick }: { value: string | null; onClick: () => void }) {
  const catalog = useStore((s) => s.catalog);
  const m = catalog?.models.find((x) => x.id === value);
  return (
    <button className="option" onClick={onClick} style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
      <Icon name="sparkle" size={19} style={{ color: 'var(--accent)' }} />
      <div className="option__main">
        <div className="option__title">
          {m?.name ?? value ?? 'Loading models…'} {m && <span className={`badge ${m.free ? 'badge--free' : 'badge--paid'}`}>{m.free ? 'Free' : 'Paid'}</span>}
        </div>
        <div className="option__sub">{m ? `${m.providerName} · tap to change` : 'Free OpenCode models are discovered live'}</div>
      </div>
      <Icon name="chevron" size={16} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
function NewChatSheet({ open }: { open: boolean }) {
  const catalog = useStore((s) => s.catalog);
  const settings = useStore((s) => s.settings);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; repo: string } | undefined>();
  const [model, setModel] = useState<string | null>(null);
  const [allowPaid, setAllowPaid] = useState(false);
  const [approval, setApproval] = useState<ApprovalMode>('ask');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setModel(settings?.defaultModel ?? catalog?.defaultModel ?? null);
      setApproval(settings?.defaultApprovalMode ?? 'ask');
      setAllowPaid(false);
    }
  }, [open, settings, catalog]);

  const start = async () => {
    setBusy(true);
    try {
      const pid = await resolveProject(projectId, draft);
      const chat = await createChat({ projectId: pid, model: model ?? undefined, approvalMode: approval });
      if (allowPaid) await patchChat(chat.id, { allowPaid: true });
      haptic.success();
      closeSheet();
      goHome();
      navigate({ name: 'chat', chatId: chat.id });
    } catch (e) {
      haptic.error();
      toast((e as Error).message, 'error', 5000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={closeSheet} title="New chat">
      <div className="label" style={{ marginTop: 4 }}>
        Project
      </div>
      <ProjectChooser
        value={projectId}
        onChange={(id, d) => {
          setProjectId(id);
          setDraft(d);
        }}
      />
      <div className="label">Model</div>
      <ModelRow value={model} onClick={() => setPicker(true)} />
      <div className="label">Approvals</div>
      <div className="group">
        {APPROVAL.map((a) => (
          <button key={a.id} className="option" aria-selected={approval === a.id} onClick={() => setApproval(a.id)} style={{ borderRadius: 0 }}>
            <Icon name="shield" size={18} />
            <div className="option__main">
              <div className="option__title">{a.title}</div>
              <div className="option__sub">{a.sub}</div>
            </div>
          </button>
        ))}
      </div>
      <Glass as="button" className="btn btn--block" variant="accent" radius={999} interactive onClick={start} disabled={busy} style={{ marginTop: 18 }}>
        {busy ? <span className="spinner" /> : <Icon name="chats" size={19} />}
        {busy ? (draft?.repo ? 'Cloning…' : 'Creating…') : 'Start chat'}
      </Glass>
      <ModelPicker
        open={picker}
        onClose={() => setPicker(false)}
        value={model ?? undefined}
        onPick={(m: ModelInfo, paid) => {
          setModel(m.id);
          setAllowPaid(paid);
        }}
      />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
interface AgentDraft {
  name: string;
  role: string;
  instructions: string;
  model: string | null;
  color: string;
  isLead: boolean;
}
const ROLE_PRESETS = [
  { role: 'Tech Lead', instructions: 'Break work into clear tasks, delegate, and review results.' },
  { role: 'Frontend Developer', instructions: 'Build UI components with clean, accessible code and verify they render.' },
  { role: 'Backend Developer', instructions: 'Implement APIs and data logic; run the code to verify it works.' },
  { role: 'QA Engineer', instructions: 'Write and run tests, report failures precisely, fix small bugs you find.' },
  { role: 'Code Reviewer', instructions: 'Review changes for bugs, security and clarity; fix what you find.' },
  { role: 'DevOps Engineer', instructions: 'Handle build scripts, tooling, configuration and CI.' },
];
const COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#06b6d4'];
const NAMES = ['Maverick', 'Sparky', 'Nova', 'Pixel', 'Echo', 'Byte'];

function NewGroupSheet({ open }: { open: boolean }) {
  const catalog = useStore((s) => s.catalog);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; repo: string } | undefined>();
  const [title, setTitle] = useState('');
  const [agents, setAgents] = useState<AgentDraft[]>([]);
  const [concurrency, setConcurrency] = useState(2);
  const [approval, setApproval] = useState<ApprovalMode>('auto-edit');
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const settings = useStore((s) => s.settings);
  useEffect(() => {
    if (!open) return;
    const dm = settings?.defaultModel ?? catalog?.defaultModel ?? null;
    setAgents([
      { name: 'Maverick', ...ROLE_PRESETS[0], model: dm, color: COLORS[0], isLead: true },
      { name: 'Sparky', ...ROLE_PRESETS[2], model: dm, color: COLORS[1], isLead: false },
      { name: 'Nova', ...ROLE_PRESETS[3], model: dm, color: COLORS[2], isLead: false },
    ]);
    setTitle('');
  }, [open, catalog?.defaultModel, settings?.defaultModel]);

  const update = (i: number, patch: Partial<AgentDraft>) => setAgents((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : patch.isLead ? { ...x, isLead: false } : x)));

  const create = async () => {
    setBusy(true);
    try {
      const pid = await resolveProject(projectId, draft);
      const chat = await createChat({
        projectId: pid,
        kind: 'group',
        title: title.trim() || undefined,
        approvalMode: approval,
        concurrency,
        model: agents[0]?.model ?? undefined,
        agents: agents.map((a) => ({ name: a.name, role: a.role, instructions: a.instructions, model: a.model ?? undefined, color: a.color, isLead: a.isLead })),
      });
      haptic.success();
      closeSheet();
      goHome();
      navigate({ name: 'chat', chatId: chat.id });
    } catch (e) {
      haptic.error();
      toast((e as Error).message, 'error', 5000);
    } finally {
      setBusy(false);
    }
  };

  const modelName = (id: string | null) => catalog?.models.find((m) => m.id === id)?.name ?? id ?? '—';

  return (
    <Sheet open={open} onClose={closeSheet} title="New team" tall>
      <input className="field" placeholder="Team name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="label">Project</div>
      <ProjectChooser
        value={projectId}
        onChange={(id, d) => {
          setProjectId(id);
          setDraft(d);
        }}
      />
      <div className="label">Agents · {agents.length}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {agents.map((a, i) => (
          <div key={i} className="group" style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="avatar" style={{ width: 40, height: 40, background: a.color }} onClick={() => update(i, { color: COLORS[(COLORS.indexOf(a.color) + 1) % COLORS.length] })} aria-label="Change color">
                {a.name[0] ?? '?'}
              </button>
              <input className="field" style={{ height: 42, flex: 1 }} value={a.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Agent name" />
              {agents.length > 2 && (
                <button className="circle-btn circle-btn--sm" onClick={() => setAgents((x) => x.filter((_, j) => j !== i))} aria-label="Remove agent">
                  <Icon name="trash" size={18} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {ROLE_PRESETS.map((r) => (
                <button key={r.role} className="composer__chip" style={a.role === r.role ? { background: a.color, color: '#fff', borderColor: 'transparent' } : undefined} onClick={() => update(i, { role: r.role, instructions: r.instructions })}>
                  {r.role}
                </button>
              ))}
            </div>
            <textarea className="field" rows={2} style={{ marginTop: 10, fontSize: 14 }} value={a.instructions} onChange={(e) => update(i, { instructions: e.target.value })} placeholder="Custom instructions" />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button className="composer__chip" onClick={() => setPickFor(i)}>
                <Icon name="sparkle" size={13} /> <span>{modelName(a.model)}</span>
              </button>
              <button className="composer__chip" style={a.isLead ? { borderColor: 'var(--accent)', color: 'var(--ink)' } : undefined} onClick={() => update(i, { isLead: true })}>
                {a.isLead ? '★ Lead' : 'Make lead'}
              </button>
            </div>
          </div>
        ))}
        {agents.length < 6 && (
          <button
            className="option"
            style={{ justifyContent: 'center', border: '1px dashed var(--line-2)' }}
            onClick={() =>
              setAgents((x) => [...x, { name: NAMES[x.length] ?? `Agent ${x.length + 1}`, ...ROLE_PRESETS[Math.min(x.length, ROLE_PRESETS.length - 1)], model: settings?.defaultModel ?? catalog?.defaultModel ?? null, color: COLORS[x.length % COLORS.length], isLead: false }])
            }
          >
            <Icon name="plus" size={18} /> Add agent
          </button>
        )}
      </div>
      <div className="label">Parallel agents · {concurrency}</div>
      <input type="range" min={1} max={4} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} aria-label="Concurrency" />
      <div className="muted" style={{ fontSize: 12.5, margin: '4px 6px' }}>
        How many teammates may work at the same time. Tasks touching the same files are sequenced by the lead. Free models have rate limits, so 1–2 is usually best.
      </div>
      <div className="label">Approvals</div>
      <div className="segmented" style={{ background: 'var(--card)' }}>
        {APPROVAL.map((a) => (
          <button key={a.id} aria-pressed={approval === a.id} onClick={() => setApproval(a.id)}>
            {a.title}
          </button>
        ))}
      </div>
      <Glass as="button" className="btn btn--block" variant="accent" radius={999} interactive onClick={create} disabled={busy || agents.length < 2} style={{ marginTop: 18 }}>
        {busy ? <span className="spinner" /> : <Icon name="users" size={19} />}
        {busy ? 'Assembling…' : 'Create team'}
      </Glass>
      <ModelPicker
        open={pickFor !== null}
        onClose={() => setPickFor(null)}
        value={pickFor !== null ? (agents[pickFor]?.model ?? undefined) : undefined}
        onPick={(m) => pickFor !== null && update(pickFor, { model: m.id })}
      />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
function ChatMenuSheet({ open, chatId }: { open: boolean; chatId?: string }) {
  const chat = useStore((s) => (chatId ? s.chats[chatId] : undefined));
  const [tab, setTab] = useState<'files' | 'changes' | 'settings'>('changes');
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<{ name: string; path: string; dir: boolean; size: number }[]>([]);
  const [file, setFile] = useState<{ path: string; content: string; binary?: boolean } | null>(null);
  const [git, setGit] = useState<any>(null);
  const [diff, setDiff] = useState('');
  const [msg, setMsg] = useState('');
  const [working, setWorking] = useState(false);
  const github = useStore((s) => s.github);

  const projectId = chat?.projectId;
  useEffect(() => {
    if (!open || !projectId) return;
    setFile(null);
    if (tab === 'files')
      api<any>(`/api/projects/${projectId}/tree?path=${encodeURIComponent(path)}`)
        .then((r) => setEntries(r.entries))
        .catch((e) => toast(e.message, 'error'));
    if (tab === 'changes') {
      api<any>(`/api/projects/${projectId}/git`).then(setGit).catch(() => setGit(null));
      api<any>(`/api/projects/${projectId}/diff`)
        .then((r) => setDiff(r.diff))
        .catch(() => setDiff(''));
    }
  }, [open, projectId, tab, path]);

  const openFile = async (p: string) => {
    try {
      setFile(await api(`/api/projects/${projectId}/file?path=${encodeURIComponent(p)}`));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const commit = async (push: boolean) => {
    setWorking(true);
    try {
      const r = await api<any>(`/api/projects/${projectId}/commit`, { method: 'POST', body: { message: msg || `Update from Maverick: ${chat?.title}`, push }, timeoutMs: 200_000 });
      toast(r.pushed ? 'Committed and pushed to GitHub' : r.committed ? 'Committed' : 'Nothing to commit', 'ok');
      setMsg('');
      setGit(await api(`/api/projects/${projectId}/git`));
      setDiff((await api<any>(`/api/projects/${projectId}/diff`)).diff);
    } catch (e) {
      toast((e as Error).message, 'error', 6000);
    } finally {
      setWorking(false);
    }
  };

  const diffLines = useMemo(() => diff.split('\n').slice(0, 1500), [diff]);
  if (!chat) return <Sheet open={false} onClose={closeSheet}>{null}</Sheet>;

  return (
    <Sheet open={open} onClose={closeSheet} title={chat.projectName} tall>
      <div className="segmented" style={{ background: 'var(--card)', marginBottom: 12 }}>
        <button aria-pressed={tab === 'changes'} onClick={() => setTab('changes')}>
          Changes
        </button>
        <button aria-pressed={tab === 'files'} onClick={() => setTab('files')}>
          Files
        </button>
        <button aria-pressed={tab === 'settings'} onClick={() => setTab('settings')}>
          Chat
        </button>
      </div>

      {tab === 'files' &&
        (file ? (
          <>
            <button className="option" onClick={() => setFile(null)}>
              <Icon name="back" size={18} /> <div className="option__main option__title">{file.path}</div>
            </button>
            <pre className="tool__body selectable" style={{ maxHeight: '60vh', borderRadius: 16, background: 'var(--code-bg)', margin: 0 }}>
              {file.binary ? '(binary file)' : file.content}
            </pre>
          </>
        ) : (
          <>
            {path && (
              <button className="option" onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}>
                <Icon name="back" size={18} /> <div className="option__main option__title">{path}</div>
              </button>
            )}
            {entries.map((e) => (
              <button key={e.path} className="option" onClick={() => (e.dir ? setPath(e.path) : openFile(e.path))}>
                <Icon name={e.dir ? 'folder' : 'file'} size={19} style={{ color: e.dir ? 'var(--accent)' : 'var(--ink-3)' }} />
                <div className="option__main">
                  <div className="option__title">{e.name}</div>
                </div>
                {!e.dir && <span className="muted" style={{ fontSize: 12 }}>{bytes(e.size)}</span>}
              </button>
            ))}
            {!entries.length && <div className="muted" style={{ padding: 12 }}>Empty folder</div>}
          </>
        ))}

      {tab === 'changes' && (
        <>
          {git?.isRepo && (
            <div className="group" style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 650 }}>
                <Icon name="git" size={18} /> {git.branch || 'main'}
                {git.remote && <span className="muted" style={{ fontSize: 12.5, fontWeight: 500 }}>· {git.remote.replace(/^https:\/\/github.com\//, '')}</span>}
                {git.ahead > 0 && <span className="badge badge--warn">{git.ahead} to push</span>}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                {git.files.length ? `${git.files.length} changed file${git.files.length === 1 ? '' : 's'}` : 'Working tree clean'}
              </div>
              {git.files.slice(0, 30).map((f: any) => (
                <div key={f.path} style={{ fontFamily: 'var(--mono)', fontSize: 12.5, marginTop: 4 }}>
                  <span style={{ color: f.status.includes('D') ? 'var(--danger)' : f.status.includes('?') || f.status.includes('A') ? 'var(--ok)' : 'var(--warn)' }}>{f.status.padEnd(2)}</span> {f.path}
                </div>
              ))}
              {(git.files.length > 0 || git.ahead > 0) && (
                <>
                  <input className="field" style={{ marginTop: 12, height: 44 }} placeholder="Commit message" value={msg} onChange={(e) => setMsg(e.target.value)} />
                  <div className="card__actions">
                    <button className="btn" style={{ background: 'var(--card-2)' }} onClick={() => commit(false)} disabled={working || !git.files.length}>
                      Commit
                    </button>
                    {git.remote && (
                      <Glass as="button" className="btn" radius={999} variant="accent" interactive onClick={() => commit(true)} disabled={working || !github.connected}>
                        {working ? <span className="spinner" /> : <Icon name="github" size={16} />} Commit & push
                      </Glass>
                    )}
                  </div>
                  {git.remote && !github.connected && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Connect GitHub in Settings to push.</div>}
                </>
              )}
              {git.commits?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {git.commits.slice(0, 5).map((c: any) => (
                    <div key={c.hash} style={{ fontSize: 12.5, marginTop: 4 }}>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{c.hash}</span> {c.subject} <span className="muted">· {c.when}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {diff ? (
            <pre className="tool__body selectable" style={{ maxHeight: '55vh', borderRadius: 16, background: 'var(--code-bg)', margin: 0 }}>
              {diffLines.map((l, i) => (
                <span key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'diff-add' : l.startsWith('-') && !l.startsWith('---') ? 'diff-del' : l.startsWith('@@') ? 'diff-hunk' : undefined} style={{ display: 'block' }}>
                  {l || ' '}
                </span>
              ))}
            </pre>
          ) : (
            <div className="muted" style={{ padding: 12, textAlign: 'center' }}>No uncommitted changes.</div>
          )}
        </>
      )}

      {tab === 'settings' && (
        <>
          <div className="label" style={{ marginTop: 4 }}>
            Approvals
          </div>
          <div className="group">
            {APPROVAL.map((a) => (
              <button key={a.id} className="option" aria-selected={chat.approvalMode === a.id} style={{ borderRadius: 0 }} onClick={() => patchChat(chat.id, { approvalMode: a.id }).catch((e) => toast(e.message, 'error'))}>
                <Icon name="shield" size={18} />
                <div className="option__main">
                  <div className="option__title">{a.title}</div>
                  <div className="option__sub">{a.sub}</div>
                </div>
              </button>
            ))}
          </div>
          {chat.kind === 'group' && (
            <>
              <div className="label">Parallel agents · {chat.concurrency}</div>
              <input type="range" min={1} max={4} value={chat.concurrency} onChange={(e) => patchChat(chat.id, { concurrency: Number(e.target.value) }).catch(() => undefined)} />
            </>
          )}
          <div className="label">Chat</div>
          <div className="group">
            <button className="option" style={{ borderRadius: 0 }} onClick={() => patchChat(chat.id, { pinned: !chat.pinned })}>
              <Icon name="pin" size={18} /> <div className="option__main">{chat.pinned ? 'Unpin chat' : 'Pin chat'}</div>
            </button>
            <button className="option" style={{ borderRadius: 0 }} onClick={() => useStore.setState({ sheet: { name: 'rename-chat', props: { chatId: chat.id } } })}>
              <Icon name="edit" size={18} /> <div className="option__main">Rename</div>
            </button>
            {chat.allowPaid && (
              <button className="option" style={{ borderRadius: 0 }} onClick={() => patchChat(chat.id, { allowPaid: false }).then(() => toast('Paid models disabled for this chat', 'ok'))}>
                <Icon name="key" size={18} /> <div className="option__main">Revoke paid-model consent</div>
              </button>
            )}
            <button
              className="option"
              style={{ borderRadius: 0, color: 'var(--danger)' }}
              onClick={async () => {
                if (!confirm('Delete this chat? Project files stay on the server.')) return;
                await deleteChat(chat.id).catch((e) => toast(e.message, 'error'));
                closeSheet();
                goHome();
              }}
            >
              <Icon name="trash" size={18} /> <div className="option__main">Delete chat</div>
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function RenameSheet({ open, chatId }: { open: boolean; chatId?: string }) {
  const chat = useStore((s) => (chatId ? s.chats[chatId] : undefined));
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (open && chat) setTitle(chat.title);
  }, [open, chat]);
  return (
    <Sheet open={open} onClose={closeSheet} title="Rename chat">
      <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <Glass
        as="button"
        className="btn btn--block"
        variant="accent"
        radius={999}
        interactive
        style={{ marginTop: 14 }}
        onClick={async () => {
          if (chatId) await patchChat(chatId, { title }).catch((e) => toast(e.message, 'error'));
          closeSheet();
        }}
      >
        Save
      </Glass>
    </Sheet>
  );
}
