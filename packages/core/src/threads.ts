/**
 * ThreadStore — persistence.
 *
 * Layout choice: **one `threads.json` index plus one JSONL file per thread.**
 *
 * The index is small (a `Thread` is ~600 bytes) and is rewritten atomically on
 * every mutation, so a crash can never leave a half-written thread list — the
 * failure mode of a per-thread-file layout is a directory scan on every boot
 * plus partially-written files that have to be individually validated. The
 * conversation, which *is* large and append-heavy, gets the opposite treatment:
 * `messages/<threadId>.jsonl` is appended as events land, so a 400-message
 * thread never rewrites 400 messages to record the 401st, and a daemon killed
 * mid-turn loses at most the record it was writing.
 *
 * Records are last-write-wins by id on load, so a streaming message that is
 * appended once at completion and a tool call that is appended several times as
 * it progresses both reduce to their final state.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Message,
  MessagePart,
  Thread,
  ThreadId,
  ToolCall,
  Workspace,
} from '@ornight/protocol';
import { ornightPaths, ensurePaths, type OrnightPaths } from './paths.js';
import { appendLine, readJson, readLines, writeJsonAtomic } from './util/atomic.js';

interface MessageRecord {
  kind: 'message';
  message: Message;
}

interface ToolRecord {
  kind: 'tool';
  messageId: string;
  call: ToolCall;
}

type LogRecord = MessageRecord | ToolRecord;

export class ThreadStore {
  readonly paths: OrnightPaths;
  #threads = new Map<ThreadId, Thread>();
  #workspaces = new Map<string, Workspace>();
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(paths?: OrnightPaths) {
    this.paths = paths ?? ornightPaths();
  }

  async load(): Promise<void> {
    await ensurePaths(this.paths);
    const threads = await readJson<Thread[]>(this.paths.threadsFile, []);
    for (const thread of threads) {
      if (thread && typeof thread.id === 'string') this.#threads.set(thread.id, thread);
    }
    const workspaces = await readJson<Workspace[]>(this.paths.workspacesFile, []);
    for (const workspace of workspaces) {
      if (workspace && typeof workspace.id === 'string') this.#workspaces.set(workspace.id, workspace);
    }
  }

  /* -- threads ----------------------------------------------------------- */

  list(): Thread[] {
    return [...this.#threads.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: ThreadId): Thread | null {
    return this.#threads.get(id) ?? null;
  }

  upsert(thread: Thread): Thread {
    this.#threads.set(thread.id, thread);
    this.#persistThreads();
    return thread;
  }

  async delete(id: ThreadId): Promise<void> {
    this.#threads.delete(id);
    this.#persistThreads();
    await fs.rm(this.messagesFile(id), { force: true });
  }

  /* -- workspaces -------------------------------------------------------- */

  workspaces(): Workspace[] {
    return [...this.#workspaces.values()];
  }

  workspace(id: string): Workspace | null {
    return this.#workspaces.get(id) ?? null;
  }

  upsertWorkspace(workspace: Workspace): Workspace {
    this.#workspaces.set(workspace.id, workspace);
    this.#enqueue(() => writeJsonAtomic(this.paths.workspacesFile, this.workspaces()));
    return workspace;
  }

  /* -- conversation log --------------------------------------------------- */

  messagesFile(threadId: ThreadId): string {
    return path.join(this.paths.messagesDir, `${sanitise(threadId)}.jsonl`);
  }

  appendMessage(message: Message): void {
    this.#enqueue(() =>
      appendLine(this.messagesFile(message.threadId), { kind: 'message', message } satisfies MessageRecord),
    );
  }

  appendToolCall(threadId: ThreadId, messageId: string, call: ToolCall): void {
    this.#enqueue(() =>
      appendLine(this.messagesFile(threadId), { kind: 'tool', messageId, call } satisfies ToolRecord),
    );
  }

  /** Replays a thread's log into ordered messages with tool calls merged in. */
  async history(threadId: ThreadId): Promise<Message[]> {
    const lines = await readLines(this.messagesFile(threadId));
    const messages = new Map<string, Message>();
    const order: string[] = [];
    const toolsByMessage = new Map<string, Map<string, ToolCall>>();

    for (const line of lines) {
      let record: LogRecord;
      try {
        record = JSON.parse(line) as LogRecord;
      } catch {
        continue; // torn final line after a crash — skip it, keep the rest
      }
      if (record.kind === 'message') {
        const message = record.message;
        if (!message?.id) continue;
        if (!messages.has(message.id)) order.push(message.id);
        messages.set(message.id, { ...message, streaming: false });
      } else if (record.kind === 'tool') {
        const bucket = toolsByMessage.get(record.messageId) ?? new Map<string, ToolCall>();
        bucket.set(record.call.id, record.call);
        toolsByMessage.set(record.messageId, bucket);
      }
    }

    const out: Message[] = [];
    for (const id of order) {
      const message = messages.get(id);
      if (!message) continue;
      const tools = toolsByMessage.get(id);
      out.push(tools ? { ...message, parts: mergeToolParts(message.parts, tools) } : message);
    }
    return out;
  }

  /** Flushes queued writes. Called on shutdown and by tests. */
  async flush(): Promise<void> {
    await this.#writeQueue;
  }

  #persistThreads(): void {
    this.#enqueue(() => writeJsonAtomic(this.paths.threadsFile, this.list()));
  }

  /**
   * All writes go through one promise chain: appends stay ordered and two
   * atomic rewrites of the index can never interleave.
   */
  #enqueue(task: () => Promise<void>): void {
    this.#writeQueue = this.#writeQueue.then(task).catch(() => {
      /* Persistence is best-effort: a full disk must not take the daemon down. */
    });
  }
}

function mergeToolParts(parts: MessagePart[], tools: Map<string, ToolCall>): MessagePart[] {
  const merged = parts.map((part) =>
    part.kind === 'tool' && tools.has(part.call.id)
      ? ({ kind: 'tool', call: tools.get(part.call.id) as ToolCall } satisfies MessagePart)
      : part,
  );
  const seen = new Set(
    merged.filter((part) => part.kind === 'tool').map((part) => (part as { call: ToolCall }).call.id),
  );
  for (const [id, call] of tools) {
    if (!seen.has(id)) merged.push({ kind: 'tool', call });
  }
  return merged;
}

function sanitise(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
