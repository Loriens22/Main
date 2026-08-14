import { create } from 'zustand';
import type {
  ClientCommand,
  ConnectionState,
  GitState,
  Message,
  MessageId,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  ProviderDescriptor,
  ProviderId,
  ProviderStatus,
  ServerEvent,
  ShipProgress,
  ShipRequest,
  Thread,
  ThreadId,
  ToolCall,
  Transport,
  Workspace,
} from '@ornight/protocol';
import { PROVIDERS, PROVIDER_ORDER } from '@ornight/protocol/providers';

/**
 * The single client-side store. Every server event folds into this reducer and
 * every user gesture leaves through `dispatch`, so the UI never talks to a
 * socket directly and the demo transport is indistinguishable from a real one.
 */

/** Which secondary surface the tablet is showing next to (or over) the chat. */
export type TabletPanel = 'chat' | 'changes' | 'ship' | 'settings';

export interface OrnightState {
  /* connection ---------------------------------------------------------- */
  connection: ConnectionState;
  transport: Transport | null;
  protocolError: string | null;

  /* domain -------------------------------------------------------------- */
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  threads: Record<ThreadId, Thread>;
  threadOrder: ThreadId[];
  activeThreadId: ThreadId | null;
  messages: Record<ThreadId, Message[]>;
  git: Record<ThreadId, GitState>;
  shipProgress: Record<ThreadId, ShipProgress | null>;
  pendingPermissions: PermissionRequest[];
  providers: ProviderDescriptor[];
  providerStatus: Record<ProviderId, ProviderStatus>;

  /* ui ------------------------------------------------------------------ */
  panel: TabletPanel;
  sidebarOpen: boolean;
  drafts: Record<ThreadId, string>;
  /** Path currently open in the diff viewer, per thread. */
  focusedFile: Record<ThreadId, string | null>;
  showReasoning: boolean;
  reducedGlass: boolean;

  /* actions ------------------------------------------------------------- */
  attach(transport: Transport): void;
  detach(): void;
  ingest(event: ServerEvent): void;
  dispatch(command: ClientCommand): void;

  selectThread(id: ThreadId | null): void;
  setPanel(panel: TabletPanel): void;
  setSidebar(open: boolean): void;
  setDraft(threadId: ThreadId, text: string): void;
  focusFile(threadId: ThreadId, path: string | null): void;
  setShowReasoning(show: boolean): void;
  setReducedGlass(reduced: boolean): void;

  createThread(input: {
    provider: ProviderId;
    model: string;
    permissionMode: PermissionMode;
    prompt?: string;
    title?: string;
  }): void;
  sendMessage(threadId: ThreadId, text: string): void;
  interrupt(threadId: ThreadId): void;
  setPermissionMode(threadId: ThreadId, mode: PermissionMode): void;
  setModel(threadId: ThreadId, provider: ProviderId, model: string): void;
  decidePermission(requestId: string, decision: PermissionDecision): void;
  stageFiles(threadId: ThreadId, paths: string[], staged: boolean): void;
  revertFiles(threadId: ThreadId, paths: string[]): void;
  refreshGit(threadId: ThreadId): void;
  ship(request: ShipRequest): void;
  archiveThread(threadId: ThreadId, archived: boolean): void;
  pinThread(threadId: ThreadId, pinned: boolean): void;
  renameThread(threadId: ThreadId, title: string): void;
  deleteThread(threadId: ThreadId): void;
}

const defaultProviderStatus = (): Record<ProviderId, ProviderStatus> => {
  const out = {} as Record<ProviderId, ProviderStatus>;
  for (const id of PROVIDER_ORDER) {
    out[id] = { id, installed: false, authenticated: false, version: null, detail: null };
  }
  return out;
};

export const useOrnight = create<OrnightState>((set, get) => ({
  connection: 'connecting',
  transport: null,
  protocolError: null,

  workspaces: [],
  activeWorkspaceId: null,
  threads: {},
  threadOrder: [],
  activeThreadId: null,
  messages: {},
  git: {},
  shipProgress: {},
  pendingPermissions: [],
  providers: PROVIDER_ORDER.map((id) => PROVIDERS[id]),
  providerStatus: defaultProviderStatus(),

  panel: 'chat',
  sidebarOpen: true,
  drafts: {},
  focusedFile: {},
  showReasoning: false,
  reducedGlass: false,

  /* ------------------------------------------------------------------ */

  attach(transport) {
    get().detach();
    const offEvent = transport.subscribe((event) => get().ingest(event));
    const offState = transport.onStateChange((connection) => set({ connection }));
    set({ transport, connection: transport.state });
    transport.send({ type: 'hello', token: readToken(), client: 'tablet' });
    // Store the teardown on the transport itself so `detach` stays simple.
    (transport as Transport & { __off?: () => void }).__off = () => {
      offEvent();
      offState();
    };
  },

  detach() {
    const current = get().transport as (Transport & { __off?: () => void }) | null;
    current?.__off?.();
    current?.close();
    set({ transport: null });
  },

  dispatch(command) {
    get().transport?.send(command);
  },

  /* ------------------------------------------------------------------ */
  /* Event folding                                                       */
  /* ------------------------------------------------------------------ */

  ingest(event) {
    switch (event.type) {
      case 'ready': {
        const { snapshot } = event;
        const threads: Record<ThreadId, Thread> = {};
        for (const t of snapshot.threads) threads[t.id] = t;
        const status = defaultProviderStatus();
        for (const s of snapshot.providerStatus) status[s.id] = s;
        set((s) => ({
          workspaces: snapshot.workspaces,
          activeWorkspaceId: s.activeWorkspaceId ?? snapshot.workspaces[0]?.id ?? null,
          threads,
          threadOrder: sortThreads(snapshot.threads),
          providers: snapshot.providers.length ? snapshot.providers : s.providers,
          providerStatus: status,
          pendingPermissions: snapshot.pendingPermissions,
          activeThreadId: s.activeThreadId ?? sortThreads(snapshot.threads)[0] ?? null,
          protocolError: null,
        }));
        const active = get().activeThreadId;
        if (active) get().dispatch({ type: 'subscribe', threadId: active });
        break;
      }

      case 'error':
        set({ protocolError: event.message });
        break;

      case 'thread.created':
      case 'thread.updated': {
        const thread = event.thread;
        set((s) => {
          const threads = { ...s.threads, [thread.id]: thread };
          return { threads, threadOrder: sortThreads(Object.values(threads)) };
        });
        break;
      }

      case 'thread.deleted': {
        set((s) => {
          const threads = { ...s.threads };
          delete threads[event.threadId];
          const messages = { ...s.messages };
          delete messages[event.threadId];
          const order = sortThreads(Object.values(threads));
          return {
            threads,
            messages,
            threadOrder: order,
            activeThreadId: s.activeThreadId === event.threadId ? (order[0] ?? null) : s.activeThreadId,
          };
        });
        break;
      }

      case 'thread.history':
        set((s) => ({ messages: { ...s.messages, [event.threadId]: event.messages } }));
        break;

      case 'message.started':
        set((s) => ({
          messages: {
            ...s.messages,
            [event.message.threadId]: [...(s.messages[event.message.threadId] ?? []), event.message],
          },
        }));
        break;

      case 'message.delta':
        set((s) => ({
          messages: {
            ...s.messages,
            [event.threadId]: appendText(s.messages[event.threadId] ?? [], event.messageId, event.text),
          },
        }));
        break;

      case 'message.reasoning':
        set((s) => ({
          messages: {
            ...s.messages,
            [event.threadId]: appendReasoning(s.messages[event.threadId] ?? [], event.messageId, event.text),
          },
        }));
        break;

      case 'message.completed':
        set((s) => ({
          messages: {
            ...s.messages,
            [event.message.threadId]: replaceMessage(
              s.messages[event.message.threadId] ?? [],
              event.message,
            ),
          },
        }));
        break;

      case 'tool.started':
        set((s) => ({
          messages: {
            ...s.messages,
            [event.threadId]: attachTool(s.messages[event.threadId] ?? [], event.messageId, event.call),
          },
        }));
        break;

      case 'tool.updated':
        set((s) => ({
          messages: {
            ...s.messages,
            [event.threadId]: updateTool(s.messages[event.threadId] ?? [], event.call),
          },
        }));
        break;

      case 'permission.requested':
        set((s) => ({ pendingPermissions: [...s.pendingPermissions, event.request] }));
        break;

      case 'permission.resolved':
        set((s) => ({
          pendingPermissions: s.pendingPermissions.filter((p) => p.id !== event.requestId),
        }));
        break;

      case 'git.state':
        set((s) => ({ git: { ...s.git, [event.state.threadId]: event.state } }));
        break;

      case 'ship.progress':
        set((s) => ({ shipProgress: { ...s.shipProgress, [event.progress.threadId]: event.progress } }));
        break;

      case 'provider.status': {
        const status = { ...get().providerStatus };
        for (const s of event.statuses) status[s.id] = s;
        set({ providerStatus: status });
        break;
      }

      case 'remote.info':
      case 'pong':
        break;
    }
  },

  /* ------------------------------------------------------------------ */
  /* UI actions                                                          */
  /* ------------------------------------------------------------------ */

  selectThread(id) {
    const previous = get().activeThreadId;
    if (previous === id) return;
    if (previous) get().dispatch({ type: 'unsubscribe', threadId: previous });
    set({ activeThreadId: id, panel: 'chat' });
    if (id) {
      get().dispatch({ type: 'subscribe', threadId: id });
      get().dispatch({ type: 'git.refresh', threadId: id });
    }
  },

  setPanel: (panel) => set({ panel }),
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  setDraft: (threadId, text) => set((s) => ({ drafts: { ...s.drafts, [threadId]: text } })),
  focusFile: (threadId, path) => set((s) => ({ focusedFile: { ...s.focusedFile, [threadId]: path } })),
  setShowReasoning: (showReasoning) => set({ showReasoning }),
  setReducedGlass: (reducedGlass) => {
    document.documentElement.dataset.glass = reducedGlass ? 'reduced' : 'full';
    set({ reducedGlass });
  },

  /* ------------------------------------------------------------------ */
  /* Command actions                                                     */
  /* ------------------------------------------------------------------ */

  createThread({ provider, model, permissionMode, prompt, title }) {
    const workspaceId = get().activeWorkspaceId ?? get().workspaces[0]?.id;
    if (!workspaceId) return;
    get().dispatch({ type: 'thread.create', workspaceId, provider, model, permissionMode, prompt, title });
  },

  sendMessage(threadId, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    get().dispatch({ type: 'thread.send', threadId, text: trimmed });
    set((s) => ({ drafts: { ...s.drafts, [threadId]: '' } }));
  },

  interrupt: (threadId) => get().dispatch({ type: 'thread.interrupt', threadId }),
  setPermissionMode: (threadId, permissionMode) =>
    get().dispatch({ type: 'thread.setMode', threadId, permissionMode }),
  setModel: (threadId, provider, model) =>
    get().dispatch({ type: 'thread.setModel', threadId, provider, model }),
  decidePermission: (requestId, decision) =>
    get().dispatch({ type: 'permission.decide', requestId, decision }),
  stageFiles: (threadId, paths, staged) => get().dispatch({ type: 'git.stage', threadId, paths, staged }),
  revertFiles: (threadId, paths) => get().dispatch({ type: 'git.revert', threadId, paths }),
  refreshGit: (threadId) => get().dispatch({ type: 'git.refresh', threadId }),
  ship: (request) => get().dispatch({ type: 'ship', request }),
  archiveThread: (threadId, archived) => get().dispatch({ type: 'thread.archive', threadId, archived }),
  pinThread: (threadId, pinned) => get().dispatch({ type: 'thread.pin', threadId, pinned }),
  renameThread: (threadId, title) => get().dispatch({ type: 'thread.rename', threadId, title }),
  deleteThread: (threadId) => get().dispatch({ type: 'thread.delete', threadId }),
}));

/* -------------------------------------------------------------------------- */
/* Message folding helpers — pure, so they stay easy to reason about           */
/* -------------------------------------------------------------------------- */

function appendText(messages: Message[], id: MessageId, text: string): Message[] {
  return messages.map((m) => {
    if (m.id !== id) return m;
    const parts = [...m.parts];
    const last = parts[parts.length - 1];
    if (last && last.kind === 'text') {
      parts[parts.length - 1] = { ...last, text: last.text + text };
    } else {
      parts.push({ kind: 'text', text });
    }
    return { ...m, parts, streaming: true };
  });
}

function appendReasoning(messages: Message[], id: MessageId, text: string): Message[] {
  return messages.map((m) => {
    if (m.id !== id) return m;
    const parts = [...m.parts];
    const last = parts[parts.length - 1];
    if (last && last.kind === 'reasoning') {
      parts[parts.length - 1] = { ...last, text: last.text + text };
    } else {
      parts.push({ kind: 'reasoning', text, collapsed: true });
    }
    return { ...m, parts };
  });
}

function replaceMessage(messages: Message[], next: Message): Message[] {
  const index = messages.findIndex((m) => m.id === next.id);
  if (index === -1) return [...messages, next];
  const copy = [...messages];
  copy[index] = next;
  return copy;
}

function attachTool(messages: Message[], id: MessageId, call: ToolCall): Message[] {
  return messages.map((m) => (m.id === id ? { ...m, parts: [...m.parts, { kind: 'tool', call }] } : m));
}

function updateTool(messages: Message[], call: ToolCall): Message[] {
  return messages.map((m) => {
    if (!m.parts.some((p) => p.kind === 'tool' && p.call.id === call.id)) return m;
    return {
      ...m,
      parts: m.parts.map((p) => (p.kind === 'tool' && p.call.id === call.id ? { kind: 'tool', call } : p)),
    };
  });
}

/** Pinned first, then most recently touched. */
function sortThreads(threads: Thread[]): ThreadId[] {
  return [...threads]
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    })
    .map((t) => t.id);
}

function readToken(): string | null {
  try {
    return localStorage.getItem('ornight.token');
  } catch {
    return null;
  }
}
