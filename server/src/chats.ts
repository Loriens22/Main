import { assertModelAllowed, getCatalog, splitModel } from './catalog.js';
import { db, now, uid, type AgentRow, type ApprovalMode, type ChatRow } from './db.js';
import { broadcast } from './hub.js';
import { logger } from './log.js';
import { opencode } from './opencode.js';
import { getProject, HttpError, touchProject } from './projects.js';
import { indexSession, unindexChat, chatStatus, pendingForChat } from './state.js';

const log = logger('chats');

export interface Attachment {
  mime: string;
  filename?: string;
  dataUrl: string;
}

const SAFE_BASH = [
  'ls',
  'ls *',
  'pwd',
  'cat *',
  'head *',
  'tail *',
  'wc *',
  'git status*',
  'git diff*',
  'git log*',
  'git show*',
  'git branch',
  'node --version',
  'node -v',
  'npm --version',
  'python3 --version',
  'which *',
];
const DANGEROUS_BASH = ['rm -rf /', 'rm -rf /*', 'rm -rf ~*', 'sudo *', 'shutdown*', 'reboot*', 'mkfs*', 'dd *of=/dev/*', ':(){*', 'chmod -R 777 /*'];

/** OpenCode permission ruleset per approval mode (later rules win). */
export function permissionRules(mode: ApprovalMode) {
  const r = (permission: string, pattern: string, action: 'allow' | 'ask' | 'deny') => ({ permission, pattern, action });
  const rules = [
    r('read', '*', 'allow'),
    r('glob', '*', 'allow'),
    r('grep', '*', 'allow'),
    r('list', '*', 'allow'),
    r('todowrite', '*', 'allow'),
    r('question', '*', 'allow'),
    r('task', '*', 'allow'),
    r('edit', '*', mode === 'ask' ? 'ask' : 'allow'),
    r('bash', '*', mode === 'full' ? 'allow' : 'ask'),
    r('webfetch', '*', mode === 'ask' ? 'ask' : 'allow'),
    r('websearch', '*', mode === 'ask' ? 'ask' : 'allow'),
    ...(mode === 'full' ? [] : SAFE_BASH.map((p) => r('bash', p, 'allow'))),
    r('external_directory', '*', 'deny'),
    ...DANGEROUS_BASH.map((p) => r('bash', p, 'deny')),
  ];
  return rules;
}

export interface ChatDTO {
  id: string;
  kind: 'single' | 'group';
  title: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  model: string;
  approvalMode: ApprovalMode;
  concurrency: number;
  pinned: boolean;
  archived: boolean;
  allowPaid: boolean;
  preview: string;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  status: string;
  pendingApprovals: number;
  agents?: AgentDTO[];
}

export interface AgentDTO {
  id: string;
  name: string;
  role: string;
  model: string;
  instructions: string;
  color: string;
  isLead: boolean;
  sessionId: string | null;
}

export function agentDTO(a: AgentRow): AgentDTO {
  return { id: a.id, name: a.name, role: a.role, model: a.model, instructions: a.instructions, color: a.color, isLead: !!a.is_lead, sessionId: a.session_id };
}

export function getAgents(chatId: string): AgentRow[] {
  return db.prepare('SELECT * FROM group_agents WHERE chat_id = ? ORDER BY sort').all(chatId) as AgentRow[];
}

export function toDTO(c: ChatRow): ChatDTO {
  const p = db.prepare('SELECT name, color FROM projects WHERE id = ?').get(c.project_id) as { name: string; color: string } | undefined;
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    projectId: c.project_id,
    projectName: p?.name ?? 'Unknown',
    projectColor: p?.color ?? '#3b82f6',
    model: c.model,
    approvalMode: c.approval_mode,
    concurrency: c.concurrency,
    pinned: !!c.pinned,
    archived: !!c.archived,
    allowPaid: !!c.allow_paid,
    preview: c.preview,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    lastActivityAt: c.last_activity_at,
    status: chatStatus(c.id),
    pendingApprovals: pendingForChat(c.id).length,
    agents: c.kind === 'group' ? getAgents(c.id).map(agentDTO) : undefined,
  };
}

export function getChat(id: string): ChatRow {
  const c = db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as ChatRow | undefined;
  if (!c) throw new HttpError(404, 'Chat not found');
  return c;
}

export function listChats(): ChatDTO[] {
  const rows = db.prepare('SELECT * FROM chats WHERE archived = 0 ORDER BY pinned DESC, last_activity_at DESC').all() as ChatRow[];
  return rows.map(toDTO);
}

export function emitChat(id: string): void {
  try {
    broadcast({ type: 'chat.updated', chat: toDTO(getChat(id)) });
  } catch {
    /* deleted */
  }
}

export async function createSession(chat: ChatRow, title: string, agent?: AgentRow): Promise<string> {
  const project = getProject(chat.project_id);
  const s = await opencode.request<{ id: string }>('POST', '/session', {
    directory: project.path,
    body: { title: title.slice(0, 100), permission: permissionRules(chat.approval_mode) },
  });
  indexSession(s.id, chat.id, agent?.id);
  return s.id;
}

export async function ensureSession(chat: ChatRow): Promise<string> {
  if (chat.session_id) return chat.session_id;
  const sid = await createSession(chat, chat.title);
  db.prepare('UPDATE chats SET session_id = ? WHERE id = ?').run(sid, chat.id);
  chat.session_id = sid;
  return sid;
}

export interface NewAgentInput {
  name: string;
  role: string;
  model?: string;
  instructions?: string;
  color?: string;
  isLead?: boolean;
}

export async function createChat(input: {
  kind?: 'single' | 'group';
  title?: string;
  projectId: string;
  model?: string;
  approvalMode?: ApprovalMode;
  concurrency?: number;
  agents?: NewAgentInput[];
}): Promise<ChatDTO> {
  const project = getProject(input.projectId);
  const catalog = await getCatalog();
  const model = input.model || catalog.defaultModel;
  if (!model) throw new HttpError(503, 'No models are available yet. The server is still loading the model list.');
  const kind = input.kind === 'group' ? 'group' : 'single';
  const t = now();
  const row: ChatRow = {
    id: uid('cht'),
    kind,
    title: (input.title || (kind === 'group' ? 'New team' : 'New chat')).slice(0, 100),
    project_id: project.id,
    session_id: null,
    model,
    approval_mode: (['ask', 'auto-edit', 'full'] as const).includes(input.approvalMode as ApprovalMode) ? (input.approvalMode as ApprovalMode) : 'ask',
    concurrency: Math.max(1, Math.min(4, Math.round(input.concurrency ?? 2))),
    pinned: 0,
    archived: 0,
    allow_paid: 0,
    preview: '',
    created_at: t,
    updated_at: t,
    last_activity_at: t,
  };
  db.prepare(
    `INSERT INTO chats(id,kind,title,project_id,session_id,model,approval_mode,concurrency,pinned,archived,allow_paid,preview,created_at,updated_at,last_activity_at)
     VALUES(@id,@kind,@title,@project_id,@session_id,@model,@approval_mode,@concurrency,@pinned,@archived,@allow_paid,@preview,@created_at,@updated_at,@last_activity_at)`,
  ).run(row);
  if (kind === 'group') {
    const agents = (input.agents?.length ? input.agents : defaultTeam()).slice(0, 6);
    if (!agents.some((a) => a.isLead)) agents[0].isLead = true;
    agents.forEach((a, i) => {
      db.prepare('INSERT INTO group_agents(id,chat_id,name,role,model,instructions,color,is_lead,session_id,sort) VALUES(?,?,?,?,?,?,?,?,?,?)').run(
        uid('agt'),
        row.id,
        (a.name || `Agent ${i + 1}`).slice(0, 40),
        (a.role || 'Engineer').slice(0, 60),
        a.model || model,
        (a.instructions || '').slice(0, 2000),
        a.color || ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#06b6d4'][i % 6],
        a.isLead ? 1 : 0,
        null,
        i,
      );
    });
  } else {
    await ensureSession(row);
  }
  touchProject(project.id);
  const dto = toDTO(getChat(row.id));
  broadcast({ type: 'chat.updated', chat: dto });
  return dto;
}

export function defaultTeam(): NewAgentInput[] {
  return [
    { name: 'Maverick', role: 'Tech Lead', instructions: 'Break work into clear tasks, delegate, and review results.', isLead: true },
    { name: 'Sparky', role: 'Developer', instructions: 'Implement features with clean, working code. Run the code to verify it.' },
    { name: 'Nova', role: 'QA Engineer', instructions: 'Write and run tests, report failures precisely, fix small bugs you find.' },
  ];
}

export async function updateChat(
  id: string,
  patch: Partial<{ title: string; pinned: boolean; archived: boolean; model: string; approvalMode: ApprovalMode; allowPaid: boolean; concurrency: number }>,
): Promise<ChatDTO> {
  const c = getChat(id);
  const t = now();
  if (patch.title !== undefined) db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(patch.title.trim().slice(0, 100) || c.title, id);
  if (patch.pinned !== undefined) db.prepare('UPDATE chats SET pinned = ? WHERE id = ?').run(patch.pinned ? 1 : 0, id);
  if (patch.archived !== undefined) db.prepare('UPDATE chats SET archived = ? WHERE id = ?').run(patch.archived ? 1 : 0, id);
  if (patch.allowPaid !== undefined) db.prepare('UPDATE chats SET allow_paid = ? WHERE id = ?').run(patch.allowPaid ? 1 : 0, id);
  if (patch.concurrency !== undefined) db.prepare('UPDATE chats SET concurrency = ? WHERE id = ?').run(Math.max(1, Math.min(4, Math.round(patch.concurrency))), id);
  if (patch.model !== undefined) {
    const m = await assertModelAllowed(patch.model, patch.allowPaid ?? !!c.allow_paid);
    db.prepare('UPDATE chats SET model = ? WHERE id = ?').run(m.id, id);
  }
  if (patch.approvalMode !== undefined && ['ask', 'auto-edit', 'full'].includes(patch.approvalMode)) {
    db.prepare('UPDATE chats SET approval_mode = ? WHERE id = ?').run(patch.approvalMode, id);
    const project = getProject(c.project_id);
    const sessions = [c.session_id, ...getAgents(id).map((a) => a.session_id)].filter(Boolean) as string[];
    for (const sid of sessions) {
      await opencode
        .request('PATCH', `/session/${sid}`, { directory: project.path, body: { permission: permissionRules(patch.approvalMode) } })
        .catch((e) => log.warn('failed to update session permissions', e.message));
    }
  }
  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(t, id);
  emitChat(id);
  return toDTO(getChat(id));
}

export async function deleteChat(id: string): Promise<void> {
  const c = getChat(id);
  const project = getProject(c.project_id);
  const sessions = [c.session_id, ...getAgents(id).map((a) => a.session_id)].filter(Boolean) as string[];
  for (const sid of sessions) {
    await opencode.request('POST', `/session/${sid}/abort`, { directory: project.path }).catch(() => undefined);
    await opencode.request('DELETE', `/session/${sid}`, { directory: project.path }).catch(() => undefined);
  }
  unindexChat(id);
  db.prepare('DELETE FROM chats WHERE id = ?').run(id);
  broadcast({ type: 'chat.deleted', chatId: id });
}

export function setPreview(chatId: string, text: string, bumpActivity = true): void {
  const preview = text.replace(/```[\s\S]*?```/g, '[code]').replace(/\s+/g, ' ').trim().slice(0, 160);
  const t = now();
  if (bumpActivity) db.prepare('UPDATE chats SET preview = ?, last_activity_at = ?, updated_at = ? WHERE id = ?').run(preview, t, t, chatId);
  else db.prepare('UPDATE chats SET preview = ? WHERE id = ?').run(preview, chatId);
  emitChat(chatId);
}

export function toParts(text: string, attachments: Attachment[] = [], meta?: Record<string, unknown>) {
  const parts: any[] = [];
  if (text.trim()) parts.push({ type: 'text', text, ...(meta ? { metadata: meta } : {}) });
  let total = 0;
  for (const a of attachments.slice(0, 8)) {
    if (!/^data:[^;]+;base64,/.test(a.dataUrl)) throw new HttpError(400, 'Attachments must be base64 data URLs');
    total += a.dataUrl.length;
    if (total > 12 * 1024 * 1024) throw new HttpError(413, 'Attachments are too large (max ~9 MB total)');
    parts.push({ type: 'file', mime: a.mime || 'application/octet-stream', filename: (a.filename || 'attachment').slice(0, 120), url: a.dataUrl });
  }
  if (!parts.length) throw new HttpError(400, 'Message is empty');
  return parts;
}

/** Sends a prompt to an OpenCode session. Always passes an explicit model, so OpenCode never falls back to another one. */
export async function promptSession(
  chat: ChatRow,
  sessionID: string,
  opts: { parts: any[]; model: string; allowPaid: boolean; system?: string; agent?: string; tools?: Record<string, boolean> },
): Promise<void> {
  const m = await assertModelAllowed(opts.model, opts.allowPaid);
  const project = getProject(chat.project_id);
  const { providerID, modelID } = splitModel(m.id);
  await opencode.request('POST', `/session/${sessionID}/prompt_async`, {
    directory: project.path,
    body: {
      model: { providerID, modelID },
      parts: opts.parts,
      ...(opts.system ? { system: opts.system } : {}),
      ...(opts.agent ? { agent: opts.agent } : {}),
      ...(opts.tools ? { tools: opts.tools } : {}),
    },
  });
}

export async function sendSingle(
  chatId: string,
  input: { text: string; attachments?: Attachment[]; model?: string; allowPaid?: boolean; agent?: 'build' | 'plan'; system?: string },
): Promise<void> {
  const chat = getChat(chatId);
  if (chat.kind !== 'single') throw new HttpError(400, 'Not a single chat');
  const sid = await ensureSession(chat);
  const allowPaid = input.allowPaid ?? !!chat.allow_paid;
  const model = input.model || chat.model;
  if (input.model && input.model !== chat.model) {
    await assertModelAllowed(model, allowPaid);
    db.prepare('UPDATE chats SET model = ? WHERE id = ?').run(model, chatId);
  }
  if (input.allowPaid && !chat.allow_paid) db.prepare('UPDATE chats SET allow_paid = 1 WHERE id = ?').run(chatId);
  await promptSession(chat, sid, {
    parts: toParts(input.text, input.attachments),
    model,
    allowPaid,
    agent: input.agent === 'plan' ? 'plan' : 'build',
    system: input.system,
  });
  if (chat.title === 'New chat' && input.text.trim()) {
    const title = input.text.trim().replace(/\s+/g, ' ').split(' ').slice(0, 7).join(' ').slice(0, 60);
    db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(title, chatId);
  }
  touchProject(chat.project_id);
  setPreview(chatId, `You: ${input.text || '[attachment]'}`);
}

export async function abortChat(chatId: string): Promise<void> {
  const chat = getChat(chatId);
  const project = getProject(chat.project_id);
  const sessions = [chat.session_id, ...getAgents(chatId).map((a) => a.session_id)].filter(Boolean) as string[];
  await Promise.all(sessions.map((sid) => opencode.request('POST', `/session/${sid}/abort`, { directory: project.path }).catch(() => undefined)));
}

export async function sessionMessages(chat: ChatRow, sessionID: string, limit = 200): Promise<any[]> {
  const project = getProject(chat.project_id);
  return opencode.request<any[]>('GET', `/session/${sessionID}/message`, { directory: project.path, query: { limit } });
}

export async function sessionTodos(chat: ChatRow, sessionID: string): Promise<any[]> {
  const project = getProject(chat.project_id);
  return opencode.request<any[]>('GET', `/session/${sessionID}/todo`, { directory: project.path }).catch(() => []);
}

export async function lastAssistantText(chat: ChatRow, sessionID: string): Promise<{ text: string; error?: string }> {
  const msgs = await sessionMessages(chat, sessionID, 30);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.info?.role !== 'assistant') continue;
    const text = (m.parts ?? [])
      .filter((p: any) => p.type === 'text' && !p.synthetic)
      .map((p: any) => p.text)
      .join('\n')
      .trim();
    const err = m.info?.error ? (m.info.error.data?.message ?? m.info.error.name) : undefined;
    if (text || err) return { text, error: err };
  }
  return { text: '' };
}
