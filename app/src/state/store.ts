import { create } from 'zustand';
import { api, configureApi, DEFAULT_SERVER } from '@/lib/api';
import { realtime, type ConnState } from '@/lib/socket';
import { prefs, secure } from '@/lib/storage';
import type {
  Activity,
  Agent,
  Catalog,
  Chat,
  GroupRun,
  GroupUserMessage,
  Msg,
  PermissionRequest,
  Project,
  QuestionRequest,
  ServerSettings,
} from '@/lib/types';

export type Route = { name: 'home' } | { name: 'chat'; chatId: string } | { name: 'settings'; section?: string };
export type ThemePref = 'system' | 'light' | 'dark';

export interface Thread {
  loaded: boolean;
  loading: boolean;
  error?: string;
  kind: 'single' | 'group';
  msgs: Record<string, Msg>;
  todos: any[];
  status: string;
  retry?: { message?: string; next?: number };
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  activities: (Activity & { at: number; agentId?: string })[];
  agents?: Agent[];
  userMessages?: GroupUserMessage[];
  runs?: GroupRun[];
  agentStatus?: Record<string, string>;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
}

export interface UiPrefs {
  theme: ThemePref;
  glass: 'auto' | 'high' | 'balanced' | 'low';
  mascots: boolean;
  roaming: boolean;
  reduceMotion: boolean;
  sort: 'recent' | 'name' | 'project';
  projectFilter: string | null;
  haptics: boolean;
  mascotQuality: 'auto' | 'high' | 'medium' | 'low';
}

const defaultPrefs: UiPrefs = {
  theme: 'system',
  glass: 'auto',
  mascots: true,
  roaming: true,
  reduceMotion: false,
  sort: 'recent',
  projectFilter: null,
  haptics: true,
  mascotQuality: 'auto',
};

interface State {
  booted: boolean;
  paired: boolean;
  serverUrl: string;
  conn: ConnState;
  serverInfo: { version?: string; opencode?: { ready: boolean; version: string }; voiceConfigured?: boolean } | null;
  chats: Record<string, Chat>;
  projects: Project[];
  catalog: Catalog | null;
  settings: ServerSettings | null;
  github: { connected: boolean; login: string | null };
  threads: Record<string, Thread>;
  lastActivity: { chatId: string; activity: Activity; at: number; agentId?: string } | null;
  stack: Route[];
  prefs: UiPrefs;
  resolvedTheme: 'light' | 'dark';
  toasts: Toast[];
  callChatId: string | null;
  sheet: null | { name: string; props?: any };
}

export const useStore = create<State>(() => ({
  booted: false,
  paired: false,
  serverUrl: DEFAULT_SERVER,
  conn: 'offline',
  serverInfo: null,
  chats: {},
  projects: [],
  catalog: null,
  settings: null,
  github: { connected: false, login: null },
  threads: {},
  lastActivity: null,
  stack: [{ name: 'home' }],
  prefs: defaultPrefs,
  resolvedTheme: 'dark',
  toasts: [],
  callChatId: null,
  sheet: null,
}));

const set = useStore.setState;
const get = useStore.getState;

/* ------------------------------------------------------------------ */
/* toasts / navigation                                                 */
/* ------------------------------------------------------------------ */
let toastSeq = 0;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3600): void {
  const id = ++toastSeq;
  set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, kind }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function navigate(route: Route): void {
  set((s) => ({ stack: [...s.stack, route] }));
}
export function goBack(): boolean {
  const s = get();
  if (s.sheet) {
    set({ sheet: null });
    return true;
  }
  if (s.stack.length <= 1) return false;
  set({ stack: s.stack.slice(0, -1) });
  return true;
}
export function goHome(): void {
  set({ stack: [{ name: 'home' }] });
}
export function openSheet(name: string, props?: any): void {
  set({ sheet: { name, props } });
}
export function closeSheet(): void {
  set({ sheet: null });
}

/* ------------------------------------------------------------------ */
/* preferences                                                         */
/* ------------------------------------------------------------------ */
export function setPrefs(p: Partial<UiPrefs>): void {
  const next = { ...get().prefs, ...p };
  set({ prefs: next });
  void prefs.set('ui', next);
}

/* ------------------------------------------------------------------ */
/* boot / pairing                                                      */
/* ------------------------------------------------------------------ */
export async function boot(): Promise<void> {
  const ui = await prefs.get<UiPrefs>('ui', defaultPrefs);
  const serverUrl = (await prefs.get<string>('serverUrl', DEFAULT_SERVER)) || DEFAULT_SERVER;
  const token = await secure.get('deviceToken');
  configureApi({ baseUrl: serverUrl, token, onUnauthorized: () => unpair(false) });
  const cachedChats = await prefs.get<Chat[]>('cache.chats', []);
  const cachedProjects = await prefs.get<Project[]>('cache.projects', []);
  set({
    prefs: { ...defaultPrefs, ...ui },
    serverUrl,
    paired: !!token,
    chats: Object.fromEntries(cachedChats.map((c) => [c.id, c])),
    projects: cachedProjects,
    booted: true,
  });
  if (token) {
    realtime.connect();
    void refreshAll();
  }
}

export async function pair(serverUrl: string, code: string): Promise<void> {
  const url = serverUrl.trim().replace(/\/+$/, '') || DEFAULT_SERVER;
  configureApi({ baseUrl: url, token: null });
  const platform = /Android/i.test(navigator.userAgent) ? 'android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'ios' : 'web';
  const model = /Android[^;]*;\s*([^;)]+)/.exec(navigator.userAgent)?.[1]?.trim();
  const res = await api<{ token: string }>('/api/pair', { method: 'POST', body: { code, deviceName: model || (platform === 'ios' ? 'iPhone' : 'Phone'), platform }, retries: 2 });
  await secure.set('deviceToken', res.token);
  await prefs.set('serverUrl', url);
  configureApi({ token: res.token });
  set({ paired: true, serverUrl: url });
  realtime.connect();
  await refreshAll();
}

export async function unpair(explicit = true): Promise<void> {
  realtime.disconnect();
  await secure.set('deviceToken', null);
  configureApi({ token: null });
  set({ paired: false, chats: {}, projects: [], threads: {}, stack: [{ name: 'home' }] });
  if (!explicit) toast('This device was signed out. Pair again with your access code.', 'error', 6000);
}

export async function refreshAll(): Promise<void> {
  try {
    const b = await api<any>('/api/bootstrap', { timeoutMs: 45_000 });
    const chats: Chat[] = b.chats;
    set({
      serverInfo: b.server,
      chats: Object.fromEntries(chats.map((c) => [c.id, c])),
      projects: b.projects,
      catalog: b.catalog,
      settings: b.settings,
      github: b.github,
    });
    void prefs.set('cache.chats', chats);
    void prefs.set('cache.projects', b.projects);
    // Seed pending approvals so badges are right before threads load.
    for (const p of b.pending?.permissions ?? []) upsertPermission(p.chatId, { ...p.request, agentId: p.agentId });
  } catch (e) {
    if ((e as { status?: number }).status !== 401) toast((e as Error).message, 'error');
  }
}

export async function refreshCatalog(force = false): Promise<void> {
  const catalog = await api<Catalog>(`/api/models${force ? '?refresh=1' : ''}`);
  set({ catalog });
}

/* ------------------------------------------------------------------ */
/* threads                                                             */
/* ------------------------------------------------------------------ */
function emptyThread(kind: 'single' | 'group' = 'single'): Thread {
  return { loaded: false, loading: false, kind, msgs: {}, todos: [], status: 'idle', permissions: [], questions: [], activities: [] };
}

function patchThread(chatId: string, fn: (t: Thread) => Thread): void {
  set((s) => {
    const cur = s.threads[chatId] ?? emptyThread(s.chats[chatId]?.kind);
    return { threads: { ...s.threads, [chatId]: fn(cur) } };
  });
}

function toMsg(raw: { info: any; parts: any[] }, agentId?: string): Msg {
  const parts: Record<string, any> = {};
  const order: string[] = [];
  for (const p of raw.parts ?? []) {
    parts[p.id] = p;
    order.push(p.id);
  }
  return { info: raw.info, parts, order, agentId };
}

export async function loadThread(chatId: string): Promise<void> {
  patchThread(chatId, (t) => ({ ...t, loading: true, error: undefined }));
  try {
    const r = await api<any>(`/api/chats/${chatId}/messages`, { timeoutMs: 45_000 });
    const msgs: Record<string, Msg> = {};
    if (r.kind === 'group') {
      for (const [agentId, list] of Object.entries<any[]>(r.agentMessages ?? {})) for (const m of list) msgs[m.info.id] = toMsg(m, agentId);
    } else {
      for (const m of r.messages ?? []) msgs[m.info.id] = toMsg(m);
    }
    patchThread(chatId, (t) => ({
      ...t,
      loaded: true,
      loading: false,
      kind: r.kind,
      msgs,
      todos: r.todos ?? [],
      status: r.status ?? 'idle',
      retry: r.retry,
      permissions: (r.pending?.permissions ?? []) as PermissionRequest[],
      questions: (r.pending?.questions ?? []) as QuestionRequest[],
      agents: r.agents,
      userMessages: r.userMessages,
      runs: r.runs,
      agentStatus: r.statuses,
    }));
  } catch (e) {
    patchThread(chatId, (t) => ({ ...t, loading: false, error: (e as Error).message }));
  }
}

function upsertPermission(chatId: string, req: PermissionRequest): void {
  patchThread(chatId, (t) => ({ ...t, permissions: [...t.permissions.filter((p) => p.id !== req.id), req] }));
}

/* ------------------------------------------------------------------ */
/* realtime events                                                     */
/* ------------------------------------------------------------------ */
const activityListeners = new Set<(chatId: string, a: Activity, agentId?: string) => void>();
export function onActivity(fn: (chatId: string, a: Activity, agentId?: string) => void): () => void {
  activityListeners.add(fn);
  return () => activityListeners.delete(fn);
}

function applyOc(chatId: string, agentId: string | undefined, child: boolean, ev: { type: string; properties: any }): void {
  const p = ev.properties ?? {};
  if (child) return; // sub-agent sessions surface through their parent's task tool card
  switch (ev.type) {
    case 'message.updated': {
      const info = p.info;
      patchThread(chatId, (t) => {
        const cur = t.msgs[info.id] ?? { info, parts: {}, order: [], agentId };
        return { ...t, msgs: { ...t.msgs, [info.id]: { ...cur, info, agentId: cur.agentId ?? agentId } } };
      });
      break;
    }
    case 'message.removed':
      patchThread(chatId, (t) => {
        const msgs = { ...t.msgs };
        delete msgs[p.messageID];
        return { ...t, msgs };
      });
      break;
    case 'message.part.updated': {
      const part = p.part;
      patchThread(chatId, (t) => {
        const cur = t.msgs[part.messageID] ?? { info: { id: part.messageID, sessionID: part.sessionID, role: 'assistant', time: { created: Date.now() } }, parts: {}, order: [], agentId };
        const order = cur.parts[part.id] ? cur.order : [...cur.order, part.id];
        return { ...t, msgs: { ...t.msgs, [part.messageID]: { ...cur, parts: { ...cur.parts, [part.id]: part }, order } } };
      });
      break;
    }
    case 'message.part.delta': {
      patchThread(chatId, (t) => {
        const cur = t.msgs[p.messageID];
        if (!cur) return t;
        const part = cur.parts[p.partID] ?? { id: p.partID, messageID: p.messageID, type: 'text', text: '' };
        const order = cur.parts[p.partID] ? cur.order : [...cur.order, p.partID];
        const next = { ...part, [p.field]: (part[p.field] ?? '') + (p.delta ?? '') };
        return { ...t, msgs: { ...t.msgs, [p.messageID]: { ...cur, parts: { ...cur.parts, [p.partID]: next }, order } } };
      });
      break;
    }
    case 'message.part.removed':
      patchThread(chatId, (t) => {
        const cur = t.msgs[p.messageID];
        if (!cur) return t;
        const parts = { ...cur.parts };
        delete parts[p.partID];
        return { ...t, msgs: { ...t.msgs, [p.messageID]: { ...cur, parts, order: cur.order.filter((x) => x !== p.partID) } } };
      });
      break;
    case 'todo.updated':
      if (!agentId) patchThread(chatId, (t) => ({ ...t, todos: p.todos ?? [] }));
      break;
    case 'session.status':
      if (agentId) patchThread(chatId, (t) => ({ ...t, agentStatus: { ...(t.agentStatus ?? {}), [agentId]: p.status?.type ?? 'idle' } }));
      break;
  }
}

export function handleRealtime(msg: any): void {
  switch (msg.type) {
    case 'hello':
      void refreshAll();
      for (const id of Object.keys(get().threads)) if (get().threads[id].loaded) void loadThread(id);
      break;
    case 'chat.updated': {
      const c: Chat = msg.chat;
      set((s) => ({ chats: { ...s.chats, [c.id]: c } }));
      if (c.agents) patchThread(c.id, (t) => ({ ...t, agents: c.agents }));
      break;
    }
    case 'chat.deleted':
      set((s) => {
        const chats = { ...s.chats };
        delete chats[msg.chatId];
        return { chats };
      });
      break;
    case 'chat.status':
      patchThread(msg.chatId, (t) => ({ ...t, status: msg.status, retry: msg.retry }));
      set((s) => (s.chats[msg.chatId] ? { chats: { ...s.chats, [msg.chatId]: { ...s.chats[msg.chatId], status: msg.status } } } : {}));
      break;
    case 'oc':
      applyOc(msg.chatId, msg.agentId, msg.child, msg.event);
      break;
    case 'permission':
      upsertPermission(msg.chatId, { ...msg.request, agentId: msg.agentId });
      break;
    case 'permission.resolved':
      patchThread(msg.chatId, (t) => ({ ...t, permissions: t.permissions.filter((p) => p.id !== msg.requestID) }));
      break;
    case 'question':
      patchThread(msg.chatId, (t) => ({ ...t, questions: [...t.questions.filter((q) => q.id !== msg.request.id), msg.request] }));
      break;
    case 'question.resolved':
      patchThread(msg.chatId, (t) => ({ ...t, questions: t.questions.filter((q) => q.id !== msg.requestID) }));
      break;
    case 'activity': {
      const a: Activity = msg.activity;
      patchThread(msg.chatId, (t) => ({ ...t, activities: [...t.activities.slice(-40), { ...a, at: msg.at ?? Date.now(), agentId: msg.agentId }] }));
      set({ lastActivity: { chatId: msg.chatId, activity: a, at: Date.now(), agentId: msg.agentId } });
      for (const l of activityListeners) l(msg.chatId, a, msg.agentId);
      break;
    }
    case 'group.run':
      patchThread(msg.chatId, (t) => {
        const runs = [...(t.runs ?? []).filter((r) => r.id !== msg.run.id), msg.run].sort((a, b) => a.createdAt - b.createdAt);
        return { ...t, runs };
      });
      break;
    case 'group.message':
      patchThread(msg.chatId, (t) => ({ ...t, userMessages: [...(t.userMessages ?? []).filter((m) => m.id !== msg.message.id), msg.message] }));
      break;
  }
}

realtime.on(handleRealtime);
realtime.onState((conn) => {
  set({ conn });
  if (conn === 'unauthorized') void unpair(false);
});

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */
export async function createProject(name: string, repo?: string): Promise<Project> {
  const p = await api<Project>('/api/projects', { method: 'POST', body: { name, repo }, timeoutMs: 320_000 });
  set((s) => ({ projects: [p, ...s.projects.filter((x) => x.id !== p.id)] }));
  return p;
}

export async function createChat(body: { projectId: string; kind?: 'single' | 'group'; model?: string; title?: string; approvalMode?: string; concurrency?: number; agents?: any[] }): Promise<Chat> {
  const c = await api<Chat>('/api/chats', { method: 'POST', body });
  set((s) => ({ chats: { ...s.chats, [c.id]: c } }));
  return c;
}

export async function patchChat(id: string, patch: Partial<{ title: string; pinned: boolean; archived: boolean; model: string; approvalMode: string; allowPaid: boolean; concurrency: number }>): Promise<void> {
  const prev = get().chats[id];
  if (prev) set((s) => ({ chats: { ...s.chats, [id]: { ...prev, ...(patch as any) } } }));
  try {
    const c = await api<Chat>(`/api/chats/${id}`, { method: 'PATCH', body: patch });
    set((s) => ({ chats: { ...s.chats, [id]: c } }));
  } catch (e) {
    if (prev) set((s) => ({ chats: { ...s.chats, [id]: prev } }));
    throw e;
  }
}

export async function deleteChat(id: string): Promise<void> {
  await api(`/api/chats/${id}`, { method: 'DELETE' });
  set((s) => {
    const chats = { ...s.chats };
    delete chats[id];
    return { chats };
  });
}

export async function sendMessage(chatId: string, body: { text: string; attachments?: any[]; model?: string; allowPaid?: boolean; agent?: string; targetAgentId?: string }): Promise<void> {
  // Optimistic user bubble for single chats; the server echo replaces it.
  const chat = get().chats[chatId];
  const tempId = `local_${Date.now()}`;
  if (chat?.kind === 'single') {
    patchThread(chatId, (t) => ({
      ...t,
      status: 'busy',
      msgs: {
        ...t.msgs,
        [tempId]: {
          info: { id: tempId, role: 'user', time: { created: Date.now() }, pending: true },
          parts: { [`${tempId}_t`]: { id: `${tempId}_t`, type: 'text', text: body.text } },
          order: [`${tempId}_t`],
        },
      },
    }));
  }
  try {
    await api(`/api/chats/${chatId}/messages`, { method: 'POST', body, timeoutMs: 60_000 });
  } catch (e) {
    patchThread(chatId, (t) => ({ ...t, status: 'idle' }));
    throw e;
  } finally {
    patchThread(chatId, (t) => {
      const msgs = { ...t.msgs };
      delete msgs[tempId];
      return { ...t, msgs };
    });
  }
}

export async function abortChat(chatId: string): Promise<void> {
  await api(`/api/chats/${chatId}/abort`, { method: 'POST', body: {} });
}

export async function answerPermission(chatId: string, id: string, reply: 'once' | 'always' | 'reject'): Promise<void> {
  patchThread(chatId, (t) => ({ ...t, permissions: t.permissions.filter((p) => p.id !== id) }));
  await api(`/api/permissions/${id}`, { method: 'POST', body: { reply } });
}

export async function answerQuestion(chatId: string, id: string, answers: string[][] | null): Promise<void> {
  patchThread(chatId, (t) => ({ ...t, questions: t.questions.filter((q) => q.id !== id) }));
  await api(`/api/chats/${chatId}/questions/${id}`, { method: 'POST', body: answers === null ? { reject: true } : { answers } });
}

export async function saveServerSettings(patch: Partial<ServerSettings>): Promise<void> {
  const s = await api<ServerSettings>('/api/settings', { method: 'PUT', body: patch });
  set({ settings: s });
}

export function setCallChat(chatId: string | null): void {
  set({ callChatId: chatId });
}
