import cors from '@fastify/cors';
import fstatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { bearer, getSecret, listDevices, pairDevice, PairError, putSecret, revokeDevice, verifyToken } from './auth.js';
import { getCatalog, ModelPolicyError, refreshCatalog } from './catalog.js';
import {
  abortChat,
  createChat,
  deleteChat,
  getChat,
  listChats,
  sendSingle,
  sessionMessages,
  sessionTodos,
  toDTO,
  updateChat,
} from './chats.js';
import { config } from './config.js';
import { db, getSetting, setSetting, type ApprovalMode } from './db.js';
import { abortGroup, groupTimeline, recoverRuns, sendGroup, updateAgents } from './groups.js';
import { addClient } from './hub.js';
import { logger } from './log.js';
import { opencode, OpenCodeError } from './opencode.js';
import { replyPermission, replyQuestion } from './permissions.js';
import {
  commitAndPush,
  createProject,
  deleteProject,
  getProject,
  gitDiff,
  githubRequest,
  gitStatus,
  HttpError,
  listProjects,
  renameProject,
  safePath,
  storageUsage,
} from './projects.js';
import { startRouter } from './router.js';
import { runSelfTest } from './selftest.js';
import { allPending, pendingForChat, questionsForChat, rebuildIndex, retryInfo, chatStatus } from './state.js';
import { engineFetch, getVoicePrefs, VoiceCall, voiceEngineHealth } from './voice.js';

const log = logger('server');
const internalToken = randomBytes(24).toString('hex');

const app = Fastify({ bodyLimit: 16 * 1024 * 1024, trustProxy: true, logger: false });
await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
await app.register(websocket, { options: { maxPayload: 2 * 1024 * 1024 } });

// ---------- errors ----------
app.setErrorHandler((err: any, _req, reply) => {
  const status =
    err instanceof HttpError || err instanceof PairError
      ? err.status
      : err instanceof ModelPolicyError
        ? 400
        : err instanceof OpenCodeError
          ? err.status >= 500
            ? 502
            : err.status
          : (err.statusCode ?? 500);
  if (status >= 500) log.error('request failed', err);
  reply.status(status).send({ error: err.message || 'Internal error' });
});

// ---------- auth ----------
declare module 'fastify' {
  interface FastifyRequest {
    deviceId?: string;
  }
}

app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/') || url === '/api/pair' || url === '/api/info') return;
  const dev = verifyToken(bearer(req.headers.authorization));
  if (!dev) return reply.status(401).send({ error: 'Not paired. Enter your access code.' });
  req.deviceId = dev.id;
});

// ---------- public ----------
let voiceHealth: { ok: boolean; detail?: string; at: number } = { ok: false, at: 0 };
async function cachedVoiceHealth() {
  if (Date.now() - voiceHealth.at > 15_000) voiceHealth = { ...(await voiceEngineHealth()), at: Date.now() };
  return voiceHealth;
}

app.get('/health', async () => ({
  ok: true,
  version: config.version,
  opencode: { ready: opencode.ready, version: opencode.version, error: opencode.ready ? undefined : opencode.lastError || undefined },
}));

app.get('/api/info', async () => ({ name: 'Maverick Bot', version: config.version, pairing: !!config.accessCode }));

app.get('/download', async (_req, reply) => reply.redirect(config.apkUrl));

app.post('/api/pair', async (req) => {
  const b = (req.body ?? {}) as { code?: string; deviceName?: string; platform?: string };
  const { token, deviceId } = pairDevice(req.ip, String(b.code ?? ''), String(b.deviceName ?? 'Phone'), String(b.platform ?? 'unknown'));
  return { token, deviceId, server: { version: config.version } };
});

// ---------- bootstrap ----------
app.get('/api/bootstrap', async () => {
  const catalog = await getCatalog();
  return {
    // Voice health is not probed here: it would wake the sleeping speech service on every app launch.
    server: { version: config.version, opencode: { ready: opencode.ready, version: opencode.version }, voiceConfigured: !!config.voiceUrl },
    chats: listChats(),
    projects: listProjects().map(projectDTO),
    catalog,
    settings: serverSettings(),
    pending: allPending(),
    github: githubStatus(),
  };
});

function projectDTO(p: ReturnType<typeof getProject>) {
  return { id: p.id, name: p.name, slug: p.slug, repo: p.repo, color: p.color, createdAt: p.created_at, updatedAt: p.updated_at };
}

// ---------- models ----------
app.get('/api/models', async (req) => {
  const q = req.query as { refresh?: string };
  if (q.refresh) await refreshCatalog();
  return getCatalog();
});

// ---------- projects ----------
app.get('/api/projects', async () => listProjects().map(projectDTO));
app.post('/api/projects', async (req) => {
  const b = (req.body ?? {}) as { name?: string; repo?: string };
  return projectDTO(await createProject({ name: String(b.name ?? ''), repo: b.repo || null }));
});
app.patch('/api/projects/:id', async (req) => {
  const { id } = req.params as { id: string };
  const b = (req.body ?? {}) as { name?: string };
  return projectDTO(renameProject(id, String(b.name ?? '')));
});
app.delete('/api/projects/:id', async (req) => {
  const { id } = req.params as { id: string };
  for (const c of listChats().filter((c) => c.projectId === id)) await deleteChat(c.id);
  deleteProject(id);
  return { ok: true };
});
app.get('/api/projects/:id/tree', async (req) => {
  const { id } = req.params as { id: string };
  const p = getProject(id);
  const rel = String((req.query as { path?: string }).path ?? '');
  const dir = safePath(p, rel);
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.name !== '.git' && e.name !== 'node_modules')
    .map((e) => {
      const full = join(dir, e.name);
      let size = 0;
      try {
        size = e.isFile() ? statSync(full).size : 0;
      } catch {
        /* ignore */
      }
      return { name: e.name, path: join(rel, e.name), dir: e.isDirectory(), size };
    })
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  return { path: rel, entries };
});
app.get('/api/projects/:id/file', async (req) => {
  const { id } = req.params as { id: string };
  const p = getProject(id);
  const rel = String((req.query as { path?: string }).path ?? '');
  const full = safePath(p, rel);
  const st = statSync(full);
  if (!st.isFile()) throw new HttpError(400, 'Not a file');
  if (st.size > 1024 * 1024) return { path: rel, size: st.size, truncated: true, content: readFileSync(full).subarray(0, 1024 * 1024).toString('utf8') };
  const buf = readFileSync(full);
  const binary = buf.subarray(0, 8000).includes(0);
  return { path: rel, size: st.size, binary, content: binary ? '' : buf.toString('utf8') };
});
app.get('/api/projects/:id/git', async (req) => gitStatus(getProject((req.params as { id: string }).id)));
app.get('/api/projects/:id/diff', async (req) => ({ diff: await gitDiff(getProject((req.params as { id: string }).id)) }));
app.post('/api/projects/:id/commit', async (req) => {
  const b = (req.body ?? {}) as { message?: string; push?: boolean };
  return commitAndPush(getProject((req.params as { id: string }).id), String(b.message ?? ''), !!b.push);
});

// ---------- chats ----------
app.get('/api/chats', async () => listChats());
app.post('/api/chats', async (req) => {
  const b = (req.body ?? {}) as any;
  return createChat({
    kind: b.kind,
    title: b.title,
    projectId: String(b.projectId ?? ''),
    model: b.model,
    approvalMode: b.approvalMode ?? serverSettings().defaultApprovalMode,
    concurrency: b.concurrency,
    agents: b.agents,
  });
});
app.get('/api/chats/:id', async (req) => toDTO(getChat((req.params as { id: string }).id)));
app.patch('/api/chats/:id', async (req) => updateChat((req.params as { id: string }).id, (req.body ?? {}) as any));
app.delete('/api/chats/:id', async (req) => {
  await deleteChat((req.params as { id: string }).id);
  return { ok: true };
});
app.get('/api/chats/:id/messages', async (req) => {
  const { id } = req.params as { id: string };
  const chat = getChat(id);
  const pending = { permissions: pendingForChat(id).map((p) => ({ ...p.request, agentId: p.agentId })), questions: questionsForChat(id).map((q) => q.request) };
  const status = { status: chatStatus(id), retry: retryInfo(id) };
  if (chat.kind === 'group') return { kind: 'group', ...(await groupTimeline(id)), pending, ...status };
  const messages = chat.session_id ? await sessionMessages(chat, chat.session_id) : [];
  const todos = chat.session_id ? await sessionTodos(chat, chat.session_id) : [];
  return { kind: 'single', sessionId: chat.session_id, messages, todos, pending, ...status };
});
app.post('/api/chats/:id/messages', async (req, reply) => {
  const { id } = req.params as { id: string };
  const b = (req.body ?? {}) as any;
  const chat = getChat(id);
  const text = String(b.text ?? '');
  if (chat.kind === 'group') {
    const r = await sendGroup(id, { text, attachments: b.attachments, targetAgentId: b.targetAgentId });
    return reply.status(202).send(r);
  }
  await sendSingle(id, { text, attachments: b.attachments, model: b.model, allowPaid: b.allowPaid, agent: b.agent });
  return reply.status(202).send({ ok: true });
});
app.post('/api/chats/:id/abort', async (req) => {
  const { id } = req.params as { id: string };
  if (getChat(id).kind === 'group') await abortGroup(id);
  else await abortChat(id);
  return { ok: true };
});
app.put('/api/chats/:id/agents', async (req) => {
  const { id } = req.params as { id: string };
  updateAgents(id, ((req.body ?? {}) as any).agents ?? []);
  return toDTO(getChat(id));
});
app.post('/api/permissions/:rid', async (req) => {
  const { rid } = req.params as { rid: string };
  const b = (req.body ?? {}) as { reply?: string; message?: string };
  const reply = b.reply === 'always' || b.reply === 'reject' ? b.reply : 'once';
  await replyPermission(rid, reply, b.message);
  return { ok: true };
});
app.post('/api/chats/:id/questions/:qid', async (req) => {
  const { id, qid } = req.params as { id: string; qid: string };
  const b = (req.body ?? {}) as { answers?: string[][]; reject?: boolean };
  await replyQuestion(id, qid, b.reject ? null : (b.answers ?? []));
  return { ok: true };
});

// ---------- settings ----------
interface ServerSettings {
  defaultModel: string | null;
  defaultApprovalMode: ApprovalMode;
  voice: { voice: string; speed: number };
  enabledProviders: string[];
}
function serverSettings(): ServerSettings {
  return {
    defaultModel: getSetting<string | null>('defaultModel', null),
    defaultApprovalMode: getSetting<ApprovalMode>('defaultApprovalMode', 'ask'),
    voice: getVoicePrefs(),
    enabledProviders: getSetting<string[]>('enabledProviders', []),
  };
}
app.get('/api/settings', async () => serverSettings());
app.put('/api/settings', async (req) => {
  const b = (req.body ?? {}) as Partial<ServerSettings>;
  if (b.defaultModel !== undefined) setSetting('defaultModel', b.defaultModel);
  if (b.defaultApprovalMode && ['ask', 'auto-edit', 'full'].includes(b.defaultApprovalMode)) setSetting('defaultApprovalMode', b.defaultApprovalMode);
  if (b.voice) setSetting('voice', { voice: String(b.voice.voice ?? 'af_heart'), speed: Math.max(0.7, Math.min(1.4, Number(b.voice.speed ?? 1.05))) });
  return serverSettings();
});

// ---------- GitHub ----------
function githubStatus() {
  return { connected: !!getSecret('github_token'), login: getSetting<string | null>('githubLogin', null) };
}
app.get('/api/github', async () => githubStatus());
app.put('/api/github', async (req) => {
  const token = String(((req.body ?? {}) as { token?: string }).token ?? '').trim();
  if (!token) throw new HttpError(400, 'Token required');
  const me = await githubRequest<{ login: string }>('/user', token);
  putSecret('github_token', token);
  setSetting('githubLogin', me.login);
  return githubStatus();
});
app.delete('/api/github', async () => {
  putSecret('github_token', null);
  setSetting('githubLogin', null);
  return githubStatus();
});
app.get('/api/github/repos', async () => {
  const repos = await githubRequest<any[]>('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member');
  return repos.map((r) => ({ fullName: r.full_name, private: r.private, description: r.description, updatedAt: r.updated_at, language: r.language }));
});

// ---------- providers (optional paid models) ----------
const KNOWN_PROVIDERS = [
  { id: 'opencode', name: 'OpenCode Zen (paid models)', hint: 'opencode.ai/zen API key' },
  { id: 'anthropic', name: 'Anthropic', hint: 'sk-ant-…' },
  { id: 'openai', name: 'OpenAI', hint: 'sk-…' },
  { id: 'google', name: 'Google Gemini', hint: 'AI Studio key' },
  { id: 'openrouter', name: 'OpenRouter', hint: 'sk-or-…' },
  { id: 'groq', name: 'Groq', hint: 'gsk_…' },
  { id: 'deepseek', name: 'DeepSeek', hint: 'sk-…' },
  { id: 'xai', name: 'xAI', hint: 'xai-…' },
  { id: 'mistral', name: 'Mistral', hint: 'API key' },
];
app.get('/api/providers', async () => {
  const enabled = new Set(getSetting<string[]>('enabledProviders', []));
  const keyed = new Set(getSetting<string[]>('keyedProviders', []));
  return KNOWN_PROVIDERS.map((p) => ({ ...p, connected: keyed.has(p.id) || (p.id !== 'opencode' && enabled.has(p.id)) }));
});
app.put('/api/providers/:id', async (req) => {
  const { id } = req.params as { id: string };
  const key = String(((req.body ?? {}) as { key?: string }).key ?? '').trim();
  if (!/^[a-z0-9-]{2,40}$/.test(id) || !key) throw new HttpError(400, 'Provider id and key are required');
  await opencode.request('PUT', `/auth/${id}`, { body: { type: 'api', key } });
  const enabled = new Set(getSetting<string[]>('enabledProviders', []));
  if (id !== 'opencode') enabled.add(id);
  setSetting('enabledProviders', [...enabled]);
  setSetting('keyedProviders', [...new Set([...getSetting<string[]>('keyedProviders', []), id])]);
  opencode.setEnabledProviders([...enabled]);
  await opencode.restart();
  await refreshCatalog().catch(() => undefined);
  return { ok: true };
});
app.delete('/api/providers/:id', async (req) => {
  const { id } = req.params as { id: string };
  await opencode.request('DELETE', `/auth/${id}`).catch(() => undefined);
  const enabled = getSetting<string[]>('enabledProviders', []).filter((p) => p !== id);
  setSetting('enabledProviders', enabled);
  setSetting('keyedProviders', getSetting<string[]>('keyedProviders', []).filter((p) => p !== id));
  opencode.setEnabledProviders(enabled);
  await opencode.restart();
  await refreshCatalog().catch(() => undefined);
  return { ok: true };
});

// ---------- devices / storage / diagnostics ----------
app.get('/api/devices', async (req) => listDevices().map((d) => ({ ...d, current: d.id === req.deviceId })));
app.delete('/api/devices/:id', async (req) => {
  revokeDevice((req.params as { id: string }).id);
  return { ok: true };
});
app.get('/api/storage', async () => storageUsage());
app.get('/api/diagnostics', async () => ({
  server: config.version,
  opencode: { ready: opencode.ready, version: opencode.version, lastError: opencode.lastError },
  voice: await cachedVoiceHealth(),
  memoryMB: Math.round(process.memoryUsage().rss / 1e6),
  uptimeS: Math.round(process.uptime()),
  chats: (db.prepare('SELECT COUNT(*) c FROM chats').get() as { c: number }).c,
  projects: (db.prepare('SELECT COUNT(*) c FROM projects').get() as { c: number }).c,
  storage: await storageUsage(),
}));

// ---------- voice ----------
app.get('/api/voice/voices', async () => {
  const r = await engineFetch('/voices');
  if (!r.ok) throw new HttpError(502, 'Voice engine unavailable');
  return r.json();
});
app.get('/api/voice/health', async () => cachedVoiceHealth());
app.post('/api/voice/preview', async (req, reply) => {
  const b = (req.body ?? {}) as { voice?: string; text?: string; speed?: number };
  const r = await engineFetch('/tts', {
    method: 'POST',
    body: JSON.stringify({ voice: b.voice, speed: b.speed, text: (b.text || "Hi! I'm Maverick. Ready to write some code?").slice(0, 300) }),
  });
  if (!r.ok) throw new HttpError(502, 'Voice engine unavailable');
  reply.header('content-type', 'audio/wav');
  return reply.send(Buffer.from(await r.arrayBuffer()));
});

// ---------- internal (agent git credential helper; localhost only) ----------
app.get('/internal/git-credential', async (req, reply) => {
  const ip = req.socket.remoteAddress ?? '';
  if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ip) || req.headers['x-internal-token'] !== internalToken) return reply.status(403).send('');
  const token = getSecret('github_token');
  if (!token) return reply.status(404).send('');
  reply.header('content-type', 'text/plain');
  return `username=x-access-token\npassword=${token}\n`;
});

// ---------- websockets ----------
app.register(async (f) => {
  f.get('/ws', { websocket: true }, (socket, req) => {
    let authed = false;
    const timer = setTimeout(() => !authed && socket.close(4001, 'auth timeout'), 8000);
    socket.on('message', (data: Buffer) => {
      if (authed) {
        try {
          const m = JSON.parse(String(data));
          if (m.type === 'ping') socket.send(JSON.stringify({ type: 'pong', t: m.t }));
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        const m = JSON.parse(String(data));
        const dev = m.type === 'auth' ? verifyToken(m.token) : null;
        if (!dev) {
          socket.send(JSON.stringify({ type: 'auth.error', error: 'Not paired' }));
          return socket.close(4003, 'unauthorized');
        }
        authed = true;
        clearTimeout(timer);
        addClient(socket, dev.id);
        socket.send(JSON.stringify({ type: 'hello', server: config.version, opencode: opencode.ready, pending: allPending() }));
      } catch {
        socket.close(4002, 'bad auth');
      }
    });
    void req;
  });

  f.get('/ws/voice', { websocket: true }, (socket) => {
    let call: VoiceCall | null = null;
    let authed = false;
    const timer = setTimeout(() => !authed && socket.close(4001, 'auth timeout'), 8000);
    socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        call?.onAppAudio(data);
        return;
      }
      let m: any;
      try {
        m = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!authed) {
        if (m.type !== 'auth' || !verifyToken(m.token)) return socket.close(4003, 'unauthorized');
        authed = true;
        clearTimeout(timer);
        return;
      }
      if (m.type === 'start' && !call) {
        try {
          call = new VoiceCall(socket, String(m.chatId), { voice: m.voice, speed: m.speed });
          void call.start();
        } catch (e) {
          socket.send(JSON.stringify({ type: 'error', fatal: true, message: (e as Error).message }));
        }
        return;
      }
      if (m.type === 'end') return socket.close(1000, 'bye');
      call?.onAppMessage(m);
    });
    socket.on('close', () => call?.close());
  });
});

// ---------- PWA ----------
if (existsSync(join(config.webDir, 'index.html'))) {
  await app.register(fstatic, { root: config.webDir, prefix: '/', wildcard: false, index: ['index.html'] });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/ws')) return reply.sendFile('index.html');
    reply.status(404).send({ error: 'Not found' });
  });
}

// ---------- boot ----------
rebuildIndex();
recoverRuns();
startRouter();
opencode.setEnabledProviders(getSetting<string[]>('enabledProviders', []));
opencode.start(internalToken);
opencode.on('status', (s: { ready: boolean }) => {
  if (s.ready) {
    void refreshCatalog().catch((e) => log.warn('initial catalog load failed', e.message));
  }
});

const listen = async () => {
  try {
    await app.listen({ port: config.port, host: '::' });
  } catch (e: any) {
    if (e.code !== 'EAFNOSUPPORT') throw e;
    await app.listen({ port: config.port, host: '0.0.0.0' });
  }
  log.info(`Maverick core ${config.version} listening on :${config.port}`);
  if (!config.accessCode) log.warn('ACCESS_CODE is not set — phones cannot pair until it is configured');
};
await listen();

if (config.selfTest) {
  opencode
    .whenReady(180_000)
    .then(() => new Promise((r) => setTimeout(r, 4000)))
    .then(() => runSelfTest())
    .catch((e) => log.error('SELFTEST crashed', e));
}

const shutdown = () => {
  log.info('shutting down');
  opencode.stop();
  void app.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
