import { bus } from './bus.js';
import {
  agentDTO,
  createSession,
  emitChat,
  getAgents,
  getChat,
  lastAssistantText,
  promptSession,
  sessionMessages,
  setPreview,
  toParts,
  type Attachment,
} from './chats.js';
import { db, now, uid, type AgentRow, type ChatRow, type RunRow, type TaskRow } from './db.js';
import { broadcast } from './hub.js';
import { logger } from './log.js';
import { opencode } from './opencode.js';
import { getProject, HttpError, touchProject } from './projects.js';
import { getSessionStatus, setGroupRunning } from './state.js';

const log = logger('groups');

/** Tools disabled while the lead plans or summarizes, so planning never edits the project. */
const READ_ONLY_TOOLS = { bash: false, edit: false, write: false, patch: false, multiedit: false, apply_patch: false, task: false };

interface Waiter {
  resolve: (v: { text: string; error?: string }) => void;
  chatId: string;
}
const waiters = new Map<string, Waiter>(); // sessionID → waiter for the current turn

function runRow(id: string): RunRow {
  return db.prepare('SELECT * FROM group_runs WHERE id = ?').get(id) as RunRow;
}

function tasksOf(runId: string): TaskRow[] {
  return db.prepare('SELECT * FROM group_tasks WHERE run_id = ? ORDER BY idx').all(runId) as TaskRow[];
}

function emitRun(chatId: string, runId: string): void {
  broadcast({ type: 'group.run', chatId, run: runDTO(runRow(runId)) });
}

export function runDTO(r: RunRow) {
  return {
    id: r.id,
    chatId: r.chat_id,
    userText: r.user_text,
    status: r.status,
    planSummary: r.plan_summary,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
    tasks: tasksOf(r.id).map(taskDTO),
  };
}

export function taskDTO(t: TaskRow) {
  return {
    id: t.id,
    runId: t.run_id,
    idx: t.idx,
    title: t.title,
    instructions: t.instructions,
    agentId: t.agent_id,
    dependsOn: JSON.parse(t.depends_on) as number[],
    status: t.status,
    result: t.result,
    createdAt: t.created_at,
    startedAt: t.started_at,
    finishedAt: t.finished_at,
  };
}

export function listRuns(chatId: string, limit = 20) {
  const rows = db.prepare('SELECT * FROM group_runs WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?').all(chatId, limit) as RunRow[];
  return rows.reverse().map(runDTO);
}

function setTask(id: string, patch: Partial<TaskRow>): void {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  db.prepare(`UPDATE group_tasks SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...patch, id });
}

function setRun(id: string, patch: Partial<RunRow>): void {
  const keys = Object.keys(patch);
  db.prepare(`UPDATE group_runs SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...patch, id });
}

async function agentSession(chat: ChatRow, agent: AgentRow): Promise<string> {
  if (agent.session_id) return agent.session_id;
  const sid = await createSession(chat, `${chat.title} · ${agent.name} (${agent.role})`, agent);
  db.prepare('UPDATE group_agents SET session_id = ? WHERE id = ?').run(sid, agent.id);
  agent.session_id = sid;
  emitChat(chat.id);
  return sid;
}

/** Sends a prompt and resolves when that agent's session goes idle again, with its final reply text. */
async function promptAndWait(
  chat: ChatRow,
  agent: AgentRow,
  parts: any[],
  opts: { system?: string; tools?: Record<string, boolean> } = {},
): Promise<{ text: string; error?: string }> {
  const sid = await agentSession(chat, agent);
  const done = new Promise<{ text: string; error?: string }>((resolve) => waiters.set(sid, { resolve, chatId: chat.id }));
  try {
    await promptSession(chat, sid, { parts, model: agent.model, allowPaid: !!chat.allow_paid, system: opts.system, tools: opts.tools });
  } catch (e) {
    waiters.delete(sid);
    throw e;
  }
  return done;
}

bus.onT('session.idle', ({ sessionID }) => {
  const w = waiters.get(sessionID);
  if (!w) return;
  waiters.delete(sessionID);
  const chat = getChat(w.chatId);
  lastAssistantText(chat, sessionID)
    .then(w.resolve)
    .catch((e) => w.resolve({ text: '', error: (e as Error).message }));
});

function roster(agents: AgentRow[]): string {
  return agents
    .map((a) => `- ${a.name} — ${a.role}${a.is_lead ? ' (lead, that is you)' : ''}${a.instructions ? `: ${a.instructions}` : ''}`)
    .join('\n');
}

function extractPlan(text: string, agents: AgentRow[]): { summary: string; tasks: { title: string; assignee: AgentRow; instructions: string; dependsOn: number[] }[] } | null {
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text))) candidates.push(m[1]);
  const brace = text.indexOf('{');
  if (brace >= 0) candidates.push(text.slice(brace, text.lastIndexOf('}') + 1));
  for (const c of candidates) {
    try {
      const j = JSON.parse(c.trim());
      const rawTasks: any[] = Array.isArray(j) ? j : j.tasks;
      if (!Array.isArray(rawTasks) || !rawTasks.length) continue;
      const byName = (n: string) => {
        const s = String(n ?? '').toLowerCase();
        return agents.find((a) => a.name.toLowerCase() === s) ?? agents.find((a) => a.role.toLowerCase() === s) ?? agents.find((a) => s.includes(a.name.toLowerCase()));
      };
      const workers = agents.filter((a) => !a.is_lead);
      const tasks = rawTasks.slice(0, 8).map((t, i) => ({
        title: String(t.title ?? t.name ?? `Task ${i + 1}`).slice(0, 120),
        assignee: byName(t.assignee ?? t.agent ?? t.owner) ?? workers[i % Math.max(1, workers.length)] ?? agents[0],
        instructions: String(t.instructions ?? t.description ?? t.details ?? t.title ?? '').slice(0, 4000),
        dependsOn: (Array.isArray(t.dependsOn ?? t.depends_on) ? (t.dependsOn ?? t.depends_on) : [])
          .map((d: any) => (typeof d === 'number' ? d - (d >= 1 ? 1 : 0) : rawTasks.findIndex((x) => x.title === d)))
          .filter((d: number) => Number.isInteger(d) && d >= 0 && d < i),
      }));
      return { summary: String(j.summary ?? j.message ?? '').slice(0, 1000), tasks };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Entry point for a user message in a group chat. Direct @mentions skip orchestration. */
export async function sendGroup(chatId: string, input: { text: string; attachments?: Attachment[]; targetAgentId?: string }): Promise<{ runId?: string }> {
  const chat = getChat(chatId);
  if (chat.kind !== 'group') throw new HttpError(400, 'Not a group chat');
  const agents = getAgents(chatId);
  if (!agents.length) throw new HttpError(400, 'This team has no agents');
  const text = input.text.trim();
  let target = input.targetAgentId ? agents.find((a) => a.id === input.targetAgentId) : undefined;
  const mention = /^@([\w-]+)/.exec(text);
  if (!target && mention) target = agents.find((a) => a.name.toLowerCase() === mention[1].toLowerCase());

  const t = now();
  const msgId = uid('gmsg');
  db.prepare('INSERT INTO group_messages(id, chat_id, run_id, role, text, attachments, target_agent_id, created_at) VALUES(?,?,?,?,?,?,?,?)').run(
    msgId,
    chatId,
    null,
    'user',
    text,
    JSON.stringify((input.attachments ?? []).map((a) => ({ mime: a.mime, filename: a.filename }))),
    target?.id ?? null,
    t,
  );
  broadcast({ type: 'group.message', chatId, message: { id: msgId, role: 'user', text, targetAgentId: target?.id ?? null, createdAt: t } });
  if (chat.title === 'New team' && text) {
    db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(text.replace(/^@\S+\s*/, '').split(/\s+/).slice(0, 6).join(' ').slice(0, 60) || 'Team chat', chatId);
  }
  setPreview(chatId, `You: ${text}`);
  touchProject(chat.project_id);

  if (target) {
    const sid = await agentSession(chat, target);
    await promptSession(chat, sid, {
      parts: toParts(text.replace(/^@\S+\s*/, '') || text, input.attachments),
      model: target.model,
      allowPaid: !!chat.allow_paid,
      system: `You are ${target.name}, the ${target.role} on a small AI coding team working in this project. ${target.instructions}`,
    });
    return {};
  }

  const runId = uid('run');
  db.prepare('INSERT INTO group_runs(id, chat_id, user_text, status, plan_summary, created_at, finished_at) VALUES(?,?,?,?,?,?,?)').run(
    runId,
    chatId,
    text,
    'planning',
    '',
    t,
    null,
  );
  db.prepare('UPDATE group_messages SET run_id = ? WHERE id = ?').run(runId, msgId);
  setGroupRunning(chatId, true);
  emitRun(chatId, runId);
  emitChat(chatId);
  void orchestrate(chatId, runId, input.attachments ?? []).catch((e) => {
    log.error('orchestration failed', e);
    setRun(runId, { status: 'failed', finished_at: now(), plan_summary: `Orchestration failed: ${(e as Error).message}` });
    setGroupRunning(chatId, false);
    emitRun(chatId, runId);
    emitChat(chatId);
  });
  return { runId };
}

const cancelled = new Set<string>();

export async function cancelRun(chatId: string): Promise<void> {
  const runs = db.prepare("SELECT id FROM group_runs WHERE chat_id = ? AND status IN ('planning','running','summarizing')").all(chatId) as { id: string }[];
  for (const r of runs) {
    cancelled.add(r.id);
    db.prepare("UPDATE group_tasks SET status = 'cancelled', finished_at = ? WHERE run_id = ? AND status IN ('queued','running')").run(now(), r.id);
    setRun(r.id, { status: 'cancelled', finished_at: now() });
    emitRun(chatId, r.id);
  }
  for (const [sid, w] of waiters) {
    if (w.chatId === chatId) {
      waiters.delete(sid);
      w.resolve({ text: '', error: 'cancelled' });
    }
  }
  setGroupRunning(chatId, false);
  emitChat(chatId);
}

async function orchestrate(chatId: string, runId: string, attachments: Attachment[]): Promise<void> {
  const chat = getChat(chatId);
  const agents = getAgents(chatId);
  const lead = agents.find((a) => a.is_lead) ?? agents[0];
  const run = runRow(runId);
  const workers = agents.filter((a) => a.id !== lead.id);

  // 1) Plan with the lead (read-only tools).
  const planPrompt = `${run.user_text}

---
You are ${lead.name}, the ${lead.role} leading this AI coding team:
${roster(agents)}

Inspect the project if useful, then reply with a short message to the user followed by a JSON plan in a \`\`\`json fenced block:
{"summary": "one or two sentences", "tasks": [{"title": "...", "assignee": "<agent name>", "instructions": "precise, self-contained instructions including file names and acceptance criteria", "dependsOn": [<1-based indexes of earlier tasks>]}]}
Rules: 1–6 tasks; assign each task to the best-suited teammate${workers.length ? ` (prefer ${workers.map((w) => w.name).join(', ')} for implementation and testing)` : ''}; tasks that touch the same files must depend on each other; do not edit files yourself in this step.`;
  const plan = await promptAndWait(chat, lead, toParts(planPrompt, attachments, { maverick: 'plan', runId }), { tools: READ_ONLY_TOOLS });
  if (cancelled.has(runId)) return;
  if (plan.error && !plan.text) throw new Error(`Lead could not plan: ${plan.error}`);
  let parsed = extractPlan(plan.text, agents);
  if (!parsed) {
    log.warn('lead did not return a parseable plan; falling back to a single delegated task');
    parsed = { summary: '', tasks: [{ title: run.user_text.slice(0, 100), assignee: workers[0] ?? lead, instructions: run.user_text, dependsOn: [] }] };
  }
  const t = now();
  parsed.tasks.forEach((task, i) => {
    db.prepare(
      'INSERT INTO group_tasks(id, run_id, chat_id, idx, title, instructions, agent_id, depends_on, status, result, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    ).run(uid('tsk'), runId, chatId, i, task.title, task.instructions, task.assignee.id, JSON.stringify(task.dependsOn), 'queued', '', t);
  });
  setRun(runId, { status: 'running', plan_summary: parsed.summary || plan.text.replace(/```[\s\S]*?```/g, '').trim().slice(0, 600) });
  emitRun(chatId, runId);

  // 2) Execute tasks respecting dependencies, per-agent exclusivity and the chat's concurrency limit.
  await new Promise<void>((resolveAll) => {
    const busyAgents = new Set<string>();
    let active = 0;
    const pump = () => {
      if (cancelled.has(runId)) return resolveAll();
      const tasks = tasksOf(runId);
      // Tasks whose dependencies failed can never run.
      for (const task of tasks) {
        if (task.status !== 'queued') continue;
        const deps = JSON.parse(task.depends_on) as number[];
        if (deps.some((d) => ['failed', 'blocked', 'cancelled'].includes(tasks[d]?.status))) {
          setTask(task.id, { status: 'blocked', finished_at: now(), result: 'Skipped because a task it depends on failed.' });
        }
      }
      const fresh = tasksOf(runId);
      const limit = Math.max(1, getChat(chatId).concurrency);
      for (const task of fresh) {
        if (active >= limit) break;
        if (task.status !== 'queued' || busyAgents.has(task.agent_id)) continue;
        const deps = JSON.parse(task.depends_on) as number[];
        if (!deps.every((d) => fresh[d]?.status === 'done')) continue;
        const agent = agents.find((a) => a.id === task.agent_id) ?? lead;
        busyAgents.add(agent.id);
        active++;
        setTask(task.id, { status: 'running', started_at: now() });
        emitRun(chatId, runId);
        const context = fresh
          .filter((x) => x.status === 'done' && x.result)
          .map((x) => `- ${x.title} (${agents.find((a) => a.id === x.agent_id)?.name}): ${x.result.slice(0, 600)}`)
          .join('\n');
        const prompt = `Task ${task.idx + 1}: ${task.title}

${task.instructions}

Team goal: ${run.user_text}
${context ? `\nCompleted by teammates so far:\n${context}\n` : ''}
Do the work in the project now using your tools, verify it (run it or its tests when possible), then reply with a concise report: what you changed (files), how you verified it, and anything left open.`;
        promptAndWait(chat, agent, toParts(prompt, [], { maverick: 'delegation', runId, taskId: task.id }), {
          system: `You are ${agent.name}, the ${agent.role} on an AI coding team led by ${lead.name}. ${agent.instructions}`,
        })
          .then((res) => {
            if (cancelled.has(runId)) return;
            const failed = !!res.error && !res.text;
            setTask(task.id, { status: failed ? 'failed' : 'done', result: (res.text || res.error || '').slice(0, 4000), finished_at: now() });
          })
          .catch((e) => setTask(task.id, { status: 'failed', result: (e as Error).message, finished_at: now() }))
          .finally(() => {
            busyAgents.delete(agent.id);
            active--;
            emitRun(chatId, runId);
            pump();
          });
      }
      const after = tasksOf(runId);
      if (active === 0 && after.every((x) => x.status !== 'queued' && x.status !== 'running')) resolveAll();
    };
    pump();
  });
  if (cancelled.has(runId)) return;

  // 3) Lead summarizes the team's results for the user.
  setRun(runId, { status: 'summarizing' });
  emitRun(chatId, runId);
  const results = tasksOf(runId)
    .map((x) => `${x.idx + 1}. [${x.status}] ${x.title} — ${agents.find((a) => a.id === x.agent_id)?.name}: ${x.result.slice(0, 1200)}`)
    .join('\n');
  const summary = await promptAndWait(
    chat,
    lead,
    toParts(
      `Your team finished working on: "${run.user_text}"\n\nTask results:\n${results}\n\nYou may inspect the project to double-check. Then write the final update for the user: what was done, how it was verified, what failed or remains, and a suggested next step. Be concise.`,
      [],
      { maverick: 'summary', runId },
    ),
    { tools: READ_ONLY_TOOLS },
  );
  const anyFailed = tasksOf(runId).some((x) => x.status === 'failed' || x.status === 'blocked');
  setRun(runId, { status: anyFailed ? 'failed' : 'done', finished_at: now() });
  if (summary.text) setPreview(chatId, `${lead.name}: ${summary.text}`);
  setGroupRunning(chatId, false);
  emitRun(chatId, runId);
  emitChat(chatId);
}

/** Timeline for a group chat: user messages, each agent's visible messages, and runs with tasks. */
export async function groupTimeline(chatId: string) {
  const chat = getChat(chatId);
  const agents = getAgents(chatId);
  const userMessages = db.prepare('SELECT * FROM group_messages WHERE chat_id = ? ORDER BY created_at').all(chatId) as any[];
  const agentMessages: Record<string, any[]> = {};
  await Promise.all(
    agents.map(async (a) => {
      if (!a.session_id) return;
      agentMessages[a.id] = await sessionMessages(chat, a.session_id, 200).catch(() => []);
    }),
  );
  return {
    agents: agents.map(agentDTO),
    userMessages: userMessages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      runId: m.run_id,
      targetAgentId: m.target_agent_id,
      attachments: JSON.parse(m.attachments),
      createdAt: m.created_at,
    })),
    agentMessages,
    runs: listRuns(chatId),
    statuses: Object.fromEntries(agents.filter((a) => a.session_id).map((a) => [a.id, getSessionStatus(a.session_id!)])),
  };
}

/** On restart, runs that were mid-flight cannot resume their waiters; mark them interrupted. */
export function recoverRuns(): void {
  const stale = db.prepare("SELECT id, chat_id FROM group_runs WHERE status IN ('planning','running','summarizing')").all() as { id: string; chat_id: string }[];
  for (const r of stale) {
    db.prepare("UPDATE group_tasks SET status = 'cancelled', result = 'Interrupted by a server restart', finished_at = ? WHERE run_id = ? AND status IN ('queued','running')").run(now(), r.id);
    setRun(r.id, { status: 'failed', finished_at: now(), plan_summary: 'Interrupted by a server restart.' });
  }
  if (stale.length) log.warn(`marked ${stale.length} interrupted group runs`);
}

export async function abortGroup(chatId: string): Promise<void> {
  await cancelRun(chatId);
  const chat = getChat(chatId);
  const project = getProject(chat.project_id);
  for (const a of getAgents(chatId)) {
    if (a.session_id) await opencode.request('POST', `/session/${a.session_id}/abort`, { directory: project.path }).catch(() => undefined);
  }
}

export function updateAgents(chatId: string, agents: { id?: string; name: string; role: string; model: string; instructions?: string; color?: string; isLead?: boolean }[]): void {
  const chat = getChat(chatId);
  if (chat.kind !== 'group') throw new HttpError(400, 'Not a group chat');
  const existing = getAgents(chatId);
  const keep = new Set<string>();
  agents.slice(0, 6).forEach((a, i) => {
    const cur = a.id ? existing.find((e) => e.id === a.id) : undefined;
    if (cur) {
      keep.add(cur.id);
      db.prepare('UPDATE group_agents SET name=?, role=?, model=?, instructions=?, color=?, is_lead=?, sort=? WHERE id=?').run(
        a.name.slice(0, 40),
        a.role.slice(0, 60),
        a.model,
        (a.instructions ?? '').slice(0, 2000),
        a.color ?? cur.color,
        a.isLead ? 1 : 0,
        i,
        cur.id,
      );
    } else {
      const id = uid('agt');
      keep.add(id);
      db.prepare('INSERT INTO group_agents(id,chat_id,name,role,model,instructions,color,is_lead,session_id,sort) VALUES(?,?,?,?,?,?,?,?,?,?)').run(
        id,
        chatId,
        a.name.slice(0, 40),
        a.role.slice(0, 60),
        a.model,
        (a.instructions ?? '').slice(0, 2000),
        a.color ?? '#3b82f6',
        a.isLead ? 1 : 0,
        null,
        i,
      );
    }
  });
  for (const e of existing) if (!keep.has(e.id)) db.prepare('DELETE FROM group_agents WHERE id = ?').run(e.id);
  emitChat(chatId);
}
