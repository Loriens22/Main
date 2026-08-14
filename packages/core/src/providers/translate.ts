/**
 * RuntimeEvent → ServerEvent.
 *
 * The only place in the harness that knows how a canonical runtime event
 * becomes a protocol event. Every adapter funnels through it, which is what
 * keeps `mock` and `claude-code` indistinguishable to the client.
 *
 * It also owns the small amount of state a stream needs: which assistant
 * message is currently open, which tool calls are in flight, and the running
 * message/part contents so `message.completed` can carry the whole turn for
 * persistence.
 */
import type {
  Message,
  MessagePart,
  PermissionRequest,
  ServerEvent,
  ThreadId,
  ToolCall,
  TurnId,
} from '@ornight/protocol';
import { splitMultiFileDiff } from '@ornight/protocol/diff';
import type { RuntimeEvent, RuntimeUsage } from './runtime.js';
import { newId } from '../util/ids.js';

export interface TranslatorOptions {
  threadId: ThreadId;
  turnId: TurnId;
  emit(event: ServerEvent): void;
  onUsage?(usage: RuntimeUsage): void;
  onPermission?(request: PermissionRequest): void;
  onSessionId?(id: string): void;
}

export class EventTranslator {
  #message: Message | null = null;
  #tools = new Map<string, ToolCall>();
  #usage: RuntimeUsage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  #externalSessionId: string | null = null;

  constructor(private readonly options: TranslatorOptions) {}

  get externalSessionId(): string | null {
    return this.#externalSessionId;
  }

  get usage(): RuntimeUsage {
    return this.#usage;
  }

  /** Tool calls seen this turn, for stats and persistence. */
  get toolCalls(): ToolCall[] {
    return [...this.#tools.values()];
  }

  handle(event: RuntimeEvent): void {
    switch (event.kind) {
      case 'session.started': {
        if (event.externalSessionId) {
          this.#externalSessionId = event.externalSessionId;
          this.options.onSessionId?.(event.externalSessionId);
        }
        return;
      }
      case 'turn.started':
        return;
      case 'item.text.delta': {
        if (event.text.length === 0) return;
        const message = this.#ensureMessage();
        this.#appendText(message, event.text);
        this.options.emit({
          type: 'message.delta',
          threadId: this.options.threadId,
          messageId: message.id,
          text: event.text,
        });
        return;
      }
      case 'item.text.completed': {
        if (event.text.length === 0) return;
        const message = this.#ensureMessage();
        const existing = lastTextPart(message);
        // Non-streaming providers send the whole block; only emit what is new.
        const already = existing?.text ?? '';
        const delta = event.text.startsWith(already) ? event.text.slice(already.length) : event.text;
        if (delta.length === 0) return;
        this.#appendText(message, delta);
        this.options.emit({
          type: 'message.delta',
          threadId: this.options.threadId,
          messageId: message.id,
          text: delta,
        });
        return;
      }
      case 'item.reasoning.delta': {
        if (event.text.length === 0) return;
        const message = this.#ensureMessage();
        const part = message.parts.find((p) => p.kind === 'reasoning');
        if (part && part.kind === 'reasoning') part.text += event.text;
        else message.parts.push({ kind: 'reasoning', text: event.text, collapsed: true });
        this.options.emit({
          type: 'message.reasoning',
          threadId: this.options.threadId,
          messageId: message.id,
          text: event.text,
        });
        return;
      }
      case 'item.boundary': {
        this.completeMessage();
        return;
      }
      case 'tool.started': {
        const message = this.#ensureMessage();
        const call: ToolCall = {
          id: event.call.id,
          threadId: this.options.threadId,
          name: event.call.name,
          category: event.call.category,
          title: event.call.title,
          target: event.call.target,
          input: event.call.input,
          output: null,
          status: 'running',
          patch: event.call.patch ? firstPatch(event.call.patch) : null,
          startedAt: Date.now(),
          endedAt: null,
          exitCode: null,
        };
        this.#tools.set(call.id, call);
        message.parts.push({ kind: 'tool', call });
        this.options.emit({
          type: 'tool.started',
          threadId: this.options.threadId,
          messageId: message.id,
          call,
        });
        return;
      }
      case 'tool.updated': {
        const call = this.#tools.get(event.update.id);
        if (!call) return;
        if (event.update.status) call.status = event.update.status;
        if (event.update.output !== undefined) call.output = event.update.output;
        if (event.update.exitCode !== undefined) call.exitCode = event.update.exitCode;
        if (event.update.title) call.title = event.update.title;
        if (event.update.target) call.target = event.update.target;
        if (event.update.patch !== undefined && event.update.patch !== null) {
          call.patch = firstPatch(event.update.patch);
        }
        if (call.status === 'ok' || call.status === 'error' || call.status === 'denied') {
          call.endedAt = Date.now();
        }
        this.options.emit({ type: 'tool.updated', threadId: this.options.threadId, call });
        return;
      }
      case 'request.permission': {
        const call = this.#tools.get(event.request.toolCallId);
        if (call) {
          call.status = 'awaiting-permission';
          this.options.emit({ type: 'tool.updated', threadId: this.options.threadId, call });
        }
        const request: PermissionRequest = {
          id: event.request.id,
          threadId: this.options.threadId,
          toolCallId: event.request.toolCallId,
          tool: event.request.tool,
          title: event.request.title,
          detail: event.request.detail,
          diff: event.request.diff,
          risk: event.request.risk,
          createdAt: Date.now(),
        };
        this.options.onPermission?.(request);
        return;
      }
      case 'usage': {
        this.#mergeUsage(event.usage);
        return;
      }
      case 'turn.completed': {
        if (event.usage) this.#mergeUsage(event.usage);
        this.completeMessage();
        return;
      }
      case 'turn.aborted': {
        this.#failOpenTools('denied');
        this.completeMessage();
        return;
      }
      case 'log':
        return;
      case 'error': {
        this.#failOpenTools('error');
        this.options.emit({
          type: 'error',
          message: event.message,
          threadId: this.options.threadId,
        });
        if (event.fatal) this.completeMessage();
        return;
      }
    }
  }

  /** Flushes the open assistant message, if any. Idempotent. */
  completeMessage(): Message | null {
    const message = this.#message;
    if (!message) return null;
    this.#message = null;
    message.streaming = false;
    this.options.emit({ type: 'message.completed', message });
    return message;
  }

  #ensureMessage(): Message {
    if (this.#message) return this.#message;
    const message: Message = {
      id: newId('msg'),
      threadId: this.options.threadId,
      turnId: this.options.turnId,
      role: 'assistant',
      parts: [],
      createdAt: Date.now(),
      streaming: true,
    };
    this.#message = message;
    this.options.emit({ type: 'message.started', message });
    return message;
  }

  #appendText(message: Message, text: string): void {
    const part = lastTextPart(message);
    if (part) part.text += text;
    else message.parts.push({ kind: 'text', text });
  }

  #mergeUsage(usage: RuntimeUsage): void {
    // Providers report cumulative totals for the turn, so take the max rather
    // than summing — a mid-turn snapshot followed by a final one must not
    // double-count.
    this.#usage = {
      tokensIn: Math.max(this.#usage.tokensIn, usage.tokensIn),
      tokensOut: Math.max(this.#usage.tokensOut, usage.tokensOut),
      costUsd: Math.max(this.#usage.costUsd, usage.costUsd),
    };
    this.options.onUsage?.(this.#usage);
  }

  #failOpenTools(status: 'error' | 'denied'): void {
    for (const call of this.#tools.values()) {
      if (call.status === 'running' || call.status === 'pending' || call.status === 'awaiting-permission') {
        call.status = status;
        call.endedAt = Date.now();
        this.options.emit({ type: 'tool.updated', threadId: this.options.threadId, call });
      }
    }
  }
}

function lastTextPart(message: Message): { kind: 'text'; text: string } | null {
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part: MessagePart | undefined = message.parts[i];
    if (!part) continue;
    if (part.kind === 'text') return part;
    if (part.kind === 'tool') return null; // text after a tool starts a new part
  }
  return null;
}

/** Tool patches are single-file; reuse the shared splitter and take the first. */
function firstPatch(unified: string): ToolCall['patch'] {
  const patches = splitMultiFileDiff(unified);
  return patches[0] ?? null;
}
