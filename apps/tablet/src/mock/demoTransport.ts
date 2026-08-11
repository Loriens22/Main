import type {
  ClientCommand,
  ConnectionState,
  FilePatch,
  Message,
  PermissionRequest,
  ProviderStatus,
  ServerEvent,
  Thread,
  ThreadId,
  ToolCall,
  Transport,
} from '@ornight/protocol';
import { EMPTY_THREAD_STATS } from '@ornight/protocol';
import { PROVIDERS, PROVIDER_ORDER, providerOf } from '@ornight/protocol/providers';
import { DEMO_HISTORY, DEMO_PATCHES, DEMO_THREADS, DEMO_WORKSPACE, demoGitState } from './fixtures';

/**
 * An in-memory daemon.
 *
 * It implements the same `Transport` interface as the WebSocket client and
 * speaks the same protocol, so the UI genuinely cannot tell the difference —
 * which means the demo exercises the real code paths rather than a parallel
 * mock UI. It runs the app with no CLIs, no server and no network.
 */
export class DemoTransport implements Transport {
  state: ConnectionState = 'demo';

  private listeners = new Set<(event: ServerEvent) => void>();
  private stateListeners = new Set<(state: ConnectionState) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private threads = new Map<ThreadId, Thread>();
  private history = new Map<ThreadId, Message[]>();
  private patches = new Map<ThreadId, FilePatch[]>();
  private pending: PermissionRequest[] = [];
  private seq = 0;
  private closed = false;

  constructor() {
    for (const thread of DEMO_THREADS) {
      this.threads.set(thread.id, { ...thread });
      this.history.set(thread.id, [...(DEMO_HISTORY[thread.id] ?? [])]);
      this.patches.set(thread.id, [...(DEMO_PATCHES[thread.id] ?? [])]);
    }
  }

  /* ---------------------------------------------------------------- */

  send(command: ClientCommand): void {
    if (this.closed) return;
    // Everything is deferred by a tick so the demo behaves asynchronously, the
    // way a real socket does; synchronous replies would mask ordering bugs.
    this.later(() => this.handle(command), 0);
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.listeners.clear();
    this.stateListeners.clear();
  }

  /* ---------------------------------------------------------------- */

  private emit(event: ServerEvent): void {
    if (this.closed) return;
    for (const listener of this.listeners) listener(event);
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.closed) fn();
    }, ms);
    this.timers.add(timer);
  }

  private id(prefix: string): string {
    return `${prefix}-demo-${(this.seq += 1)}`;
  }

  private touch(threadId: ThreadId, patch: Partial<Thread>): Thread | null {
    const thread = this.threads.get(threadId);
    if (!thread) return null;
    const next: Thread = { ...thread, ...patch, updatedAt: Date.now() };
    this.threads.set(threadId, next);
    this.emit({ type: 'thread.updated', thread: next });
    return next;
  }

  private pushGit(threadId: ThreadId): void {
    const base = demoGitState(threadId);
    const files = this.patches.get(threadId) ?? [];
    this.emit({
      type: 'git.state',
      state: {
        ...base,
        files,
        insertions: files.reduce((n, f) => n + f.insertions, 0),
        deletions: files.reduce((n, f) => n + f.deletions, 0),
      },
    });
  }

  /* ---------------------------------------------------------------- */

  private handle(command: ClientCommand): void {
    switch (command.type) {
      case 'hello':
        this.emit({
          type: 'ready',
          snapshot: {
            protocolVersion: 1,
            workspaces: [DEMO_WORKSPACE],
            threads: [...this.threads.values()],
            providers: PROVIDER_ORDER.map((id) => PROVIDERS[id]),
            providerStatus: demoProviderStatus(),
            pendingPermissions: this.pending,
            remote: {
              localUrl: 'http://192.168.1.24:7817',
              tunnelUrl: null,
              pairingCode: 'DEMO-MODE',
              connectedClients: 1,
              protocolVersion: 1,
              daemonVersion: 'demo',
            },
          },
        });
        break;

      case 'subscribe': {
        const messages = this.history.get(command.threadId) ?? [];
        this.emit({ type: 'thread.history', threadId: command.threadId, messages });
        this.pushGit(command.threadId);
        break;
      }

      case 'git.refresh':
        this.pushGit(command.threadId);
        break;

      case 'thread.create': {
        const provider = providerOf(command.provider);
        const thread: Thread = {
          id: this.id('t'),
          workspaceId: command.workspaceId,
          title: command.title || titleFrom(command.prompt) || 'New thread',
          provider: command.provider,
          model: command.model,
          permissionMode: command.permissionMode,
          status: 'idle',
          worktree: {
            path: `~/code/ornight/.ornight/worktrees/${Math.random().toString(36).slice(2, 8)}`,
            branch: `ornight/${slug(command.title || titleFrom(command.prompt) || 'thread')}`,
            baseBranch: 'main',
            baseCommit: 'a3f91c2',
            createdAt: Date.now(),
            active: true,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          preview: `Ready · ${provider.label}`,
          stats: { ...EMPTY_THREAD_STATS },
          pinned: false,
          archived: false,
          externalSessionId: this.id('session'),
          error: null,
        };
        this.threads.set(thread.id, thread);
        this.history.set(thread.id, []);
        this.patches.set(thread.id, []);
        this.emit({ type: 'thread.created', thread });
        if (command.prompt) {
          this.later(() => this.handle({ type: 'thread.send', threadId: thread.id, text: command.prompt! }), 260);
        }
        break;
      }

      case 'thread.send':
        this.runTurn(command.threadId, command.text);
        break;

      case 'thread.interrupt': {
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
        this.touch(command.threadId, { status: 'idle', preview: 'Interrupted.' });
        break;
      }

      case 'thread.setMode':
        this.touch(command.threadId, { permissionMode: command.permissionMode });
        break;

      case 'thread.setModel':
        this.touch(command.threadId, { provider: command.provider, model: command.model });
        break;

      case 'thread.rename':
        this.touch(command.threadId, { title: command.title });
        break;

      case 'thread.pin':
        this.touch(command.threadId, { pinned: command.pinned });
        break;

      case 'thread.archive':
        this.touch(command.threadId, { archived: command.archived });
        break;

      case 'thread.delete':
        this.threads.delete(command.threadId);
        this.history.delete(command.threadId);
        this.emit({ type: 'thread.deleted', threadId: command.threadId });
        break;

      case 'permission.decide': {
        const request = this.pending.find((p) => p.id === command.requestId);
        this.pending = this.pending.filter((p) => p.id !== command.requestId);
        this.emit({ type: 'permission.resolved', requestId: command.requestId, decision: command.decision });
        if (request) this.resumeAfterPermission(request, command.decision.kind !== 'deny');
        break;
      }

      case 'git.stage': {
        const files = (this.patches.get(command.threadId) ?? []).map((f) =>
          command.paths.includes(f.path) ? { ...f, staged: command.staged } : f,
        );
        this.patches.set(command.threadId, files);
        this.pushGit(command.threadId);
        break;
      }

      case 'git.revert': {
        const files = (this.patches.get(command.threadId) ?? []).filter(
          (f) => !command.paths.includes(f.path),
        );
        this.patches.set(command.threadId, files);
        this.pushGit(command.threadId);
        break;
      }

      case 'ship':
        this.runShip(command.request.threadId, command.request.steps, command.request.prTitle);
        break;

      case 'worktree.discard':
        this.patches.set(command.threadId, []);
        this.pushGit(command.threadId);
        break;

      case 'ping':
        this.emit({ type: 'pong' });
        break;

      case 'unsubscribe':
      case 'workspace.add':
        break;
    }
  }

  /* ---------------------------------------------------------------- */
  /* A scripted agent turn                                             */
  /* ---------------------------------------------------------------- */

  private runTurn(threadId: ThreadId, prompt: string): void {
    const thread = this.threads.get(threadId);
    if (!thread) return;

    const userMessage: Message = {
      id: this.id('msg'),
      threadId,
      turnId: this.id('turn'),
      role: 'user',
      parts: [{ kind: 'text', text: prompt }],
      createdAt: Date.now(),
      streaming: false,
    };
    this.history.set(threadId, [...(this.history.get(threadId) ?? []), userMessage]);
    this.emit({ type: 'message.started', message: userMessage });
    this.emit({ type: 'message.completed', message: userMessage });
    this.touch(threadId, { status: 'running', preview: 'Working…' });

    const messageId = this.id('msg');
    const turnId = this.id('turn');
    const assistant: Message = {
      id: messageId,
      threadId,
      turnId,
      role: 'assistant',
      parts: [],
      createdAt: Date.now(),
      streaming: true,
    };

    let t = 420;
    this.later(() => this.emit({ type: 'message.started', message: assistant }), t);

    t += 260;
    for (const chunk of chunks(reasoningFor(prompt))) {
      this.later(() => this.emit({ type: 'message.reasoning', threadId, messageId, text: chunk }), t);
      t += 26;
    }

    t += 320;
    for (const chunk of chunks(openingFor(prompt))) {
      this.later(() => this.emit({ type: 'message.delta', threadId, messageId, text: chunk }), t);
      t += 24;
    }

    // A read, then a search — both resolve on their own.
    t += 420;
    const read = this.makeTool(threadId, {
      name: 'Read',
      category: 'read',
      title: 'Read src/server/routes.ts',
      target: 'src/server/routes.ts',
    });
    this.later(() => this.emit({ type: 'tool.started', threadId, messageId, call: read }), t);
    t += 700;
    this.later(
      () => this.emit({ type: 'tool.updated', threadId, call: { ...read, status: 'ok', output: '19 lines', endedAt: Date.now() } }),
      t,
    );

    t += 260;
    const grep = this.makeTool(threadId, {
      name: 'Grep',
      category: 'search',
      title: 'Search for existing middleware',
      target: 'middleware|throttle|limit',
    });
    this.later(() => this.emit({ type: 'tool.started', threadId, messageId, call: grep }), t);
    t += 620;
    this.later(
      () =>
        this.emit({
          type: 'tool.updated',
          threadId,
          call: { ...grep, status: 'ok', output: '3 matches in 2 files', endedAt: Date.now() },
        }),
      t,
    );

    // A shell command that needs approval, unless the thread is on full access.
    t += 500;
    const bash = this.makeTool(threadId, {
      name: 'Bash',
      category: 'shell',
      title: 'Run the test suite',
      target: 'npm test',
      status: thread.permissionMode === 'full-access' ? 'running' : 'awaiting-permission',
    });
    this.later(() => this.emit({ type: 'tool.started', threadId, messageId, call: bash }), t);

    if (thread.permissionMode === 'full-access' || thread.permissionMode === 'auto-edit') {
      t += 1400;
      this.later(() => this.finishTurn(threadId, messageId, bash, true), t);
    } else {
      t += 300;
      const request: PermissionRequest = {
        id: this.id('perm'),
        threadId,
        toolCallId: bash.id,
        tool: 'Bash',
        title: 'Run the test suite',
        detail: 'npm test',
        diff: null,
        risk: 'low',
        createdAt: Date.now(),
      };
      this.pendingCall.set(request.id, { messageId, call: bash });
      this.later(() => {
        this.pending.push(request);
        this.emit({ type: 'permission.requested', request });
        this.touch(threadId, { status: 'awaiting-permission', preview: 'Waiting for your approval…' });
      }, t);
    }
  }

  private pendingCall = new Map<string, { messageId: string; call: ToolCall }>();

  private resumeAfterPermission(request: PermissionRequest, allowed: boolean): void {
    const entry = this.pendingCall.get(request.id);
    this.pendingCall.delete(request.id);
    if (!entry) return;
    const { messageId, call } = entry;
    this.touch(request.threadId, { status: 'running', preview: allowed ? 'Running tests…' : 'Skipping that step.' });
    this.emit({
      type: 'tool.updated',
      threadId: request.threadId,
      call: { ...call, status: allowed ? 'running' : 'denied' },
    });
    this.later(() => this.finishTurn(request.threadId, messageId, call, allowed), allowed ? 1500 : 400);
  }

  private finishTurn(threadId: ThreadId, messageId: string, call: ToolCall, allowed: boolean): void {
    this.emit({
      type: 'tool.updated',
      threadId,
      call: {
        ...call,
        status: allowed ? 'ok' : 'denied',
        exitCode: allowed ? 0 : null,
        endedAt: Date.now(),
        output: allowed
          ? '\n> vitest run\n\n ✓ src/server/__tests__/rate-limit.test.ts (1 test) 6ms\n ✓ src/queue/__tests__/worker.test.ts (4 tests) 31ms\n\n Test Files  2 passed (2)\n      Tests  5 passed (5)\n   Duration  689ms\n'
          : 'Denied by operator.',
      },
    });

    const patch = DEMO_PATCHES['t-rate-limit']?.[0];
    if (allowed && patch) {
      const edit = this.makeTool(threadId, {
        name: 'Write',
        category: 'edit',
        title: 'Create src/server/rate-limit.ts',
        target: 'src/server/rate-limit.ts',
        patch,
        status: 'ok',
      });
      this.emit({ type: 'tool.started', threadId, messageId, call: edit });
      const files = this.patches.get(threadId) ?? [];
      if (!files.some((f) => f.path === patch.path)) {
        this.patches.set(threadId, [...files, patch]);
      }
    }

    let t = 260;
    const closing = allowed
      ? "\n\nAll green. The limiter is in place on the write routes and covered by a test.\n\nWorth knowing: the buckets are per-process, so multiple server instances each get their own allowance. That was the right trade here — moving to a shared store is a contained change if you scale out."
      : '\n\nUnderstood, I left the tests alone. The code change is still staged in the worktree if you want to review it before running anything.';
    for (const chunk of chunks(closing)) {
      this.later(() => this.emit({ type: 'message.delta', threadId, messageId, text: chunk }), t);
      t += 22;
    }

    this.later(() => {
      const messages = this.history.get(threadId) ?? [];
      const final = messages.find((m) => m.id === messageId);
      if (final) this.emit({ type: 'message.completed', message: { ...final, streaming: false } });
      const thread = this.threads.get(threadId);
      this.touch(threadId, {
        status: 'idle',
        preview: allowed ? 'Tests pass. Limiter wired into the write routes.' : 'Stopped at your request.',
        stats: {
          ...(thread?.stats ?? EMPTY_THREAD_STATS),
          messages: (thread?.stats.messages ?? 0) + 2,
          toolCalls: (thread?.stats.toolCalls ?? 0) + 4,
          tokensIn: (thread?.stats.tokensIn ?? 0) + 12_400,
          tokensOut: (thread?.stats.tokensOut ?? 0) + 1_850,
          costUsd: Number(((thread?.stats.costUsd ?? 0) + 0.11).toFixed(2)),
        },
      });
      this.pushGit(threadId);
    }, t + 200);
  }

  private makeTool(
    threadId: ThreadId,
    t: Partial<ToolCall> & Pick<ToolCall, 'name' | 'category' | 'title' | 'target'>,
  ): ToolCall {
    return {
      id: this.id('call'),
      threadId,
      input: {},
      output: null,
      status: 'running',
      patch: null,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      ...t,
    };
  }

  /* ---------------------------------------------------------------- */

  private runShip(threadId: ThreadId, steps: readonly string[], prTitle?: string): void {
    let t = 300;
    const stage = (step: 'commit' | 'push' | 'pull-request', detail: string, ms: number, extra?: object) => {
      if (!steps.includes(step)) return;
      this.later(
        () => this.emit({ type: 'ship.progress', progress: { threadId, step, state: 'running', detail: 'Working…' } }),
        t,
      );
      t += ms;
      this.later(
        () =>
          this.emit({
            type: 'ship.progress',
            progress: { threadId, step, state: 'done', detail, ...extra },
          }),
        t,
      );
      t += 200;
    };

    stage('commit', 'Committed 4 files to ornight/rate-limit', 900);
    stage('push', 'Pushed to origin/ornight/rate-limit', 1300);
    stage('pull-request', 'Opened pull request #128', 1500, {
      pullRequest: {
        number: 128,
        url: 'https://github.com/you/ornight/pull/128',
        title: prTitle || 'Add rate limiting to the write API',
        state: 'open' as const,
        checks: 'pending' as const,
      },
    });
  }
}

/* -------------------------------------------------------------------------- */

function demoProviderStatus(): ProviderStatus[] {
  return PROVIDER_ORDER.map((id) => {
    if (id === 'mock') {
      return { id, installed: true, authenticated: true, version: 'demo', detail: 'Scripted, offline' };
    }
    const installed = id === 'claude-code' || id === 'codex' || id === 'cursor' || id === 'opencode';
    return {
      id,
      installed,
      authenticated: installed,
      version: installed ? '1.0.0' : null,
      detail: installed ? null : `${providerOf(id).command} not found on PATH`,
    };
  });
}

/** Splits text into small chunks so streaming looks like real token output. */
function chunks(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const size = 2 + Math.floor(Math.random() * 5);
    out.push(text.slice(i, i + size));
    i += size;
  }
  return out;
}

function reasoningFor(prompt: string): string {
  return `The ask is: ${truncate(prompt, 90)}. Before editing anything I want to see how the relevant code is wired today, so the change fits the existing shape rather than fighting it. I'll read the entry point, search for anything that already does part of this, then make the smallest change that actually solves it and cover it with a test.`;
}

function openingFor(prompt: string): string {
  return `Let me look at the current code before changing anything.\n\nTaking this as: **${truncate(prompt, 120)}**\n`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function titleFrom(prompt: string | undefined): string {
  if (!prompt) return '';
  const clean = prompt.replace(/\s+/g, ' ').trim();
  const firstSentence = clean.split(/[.!?\n]/)[0] ?? clean;
  return truncate(firstSentence, 52);
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'thread'
  );
}
