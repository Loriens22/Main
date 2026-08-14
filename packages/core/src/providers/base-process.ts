/**
 * BaseProcessAdapter — everything a spawn-based adapter shares.
 *
 * Concrete adapters supply two things: how to build the command line
 * (`plan`) and how to interpret one parsed JSON value from stdout
 * (`handle`). This class owns the rest: spawning with a clean environment and
 * an argument array, line buffering that survives chunk splits and
 * pretty-printed payloads, permission round-trips, usage accounting, and a
 * shutdown that escalates SIGINT → SIGKILL rather than leaking child processes.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type {
  PermissionDecision,
  PermissionMode,
  ProviderId,
  ProviderStatus,
} from '@ornight/protocol';
import { providerOf } from '@ornight/protocol/providers';
import type { AgentAdapter, AgentRun, AgentRunResult, SessionContext } from './adapter.js';
import { EventTranslator } from './translate.js';
import type { RuntimeEvent, RuntimePermissionRequest } from './runtime.js';
import { JsonLineStream, LineSplitter, type JsonValue } from '../util/lines.js';
import { agentEnv, resolveBinary, run } from '../util/exec.js';
import { newId } from '../util/ids.js';

/** How a turn is launched. Everything here is data — never a shell string. */
export interface SpawnPlan {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  /** Written to stdin then closed. Use for CLIs that read the prompt from stdin. */
  stdin?: string | null;
  /** Set when the process stays alive across turns (stdin-driven sessions). */
  acceptsTurns?: boolean;
  /** Serialiser for follow-up turns when `acceptsTurns` is true. */
  encodeTurn?: (text: string) => string;
}

/** What an adapter's `handle` implementation is given. */
export interface RunIO {
  emit(event: RuntimeEvent): void;
  /** Raises a permission request and resolves when the operator decides. */
  requestPermission(request: Omit<RuntimePermissionRequest, 'id'>): Promise<PermissionDecision>;
  readonly context: SessionContext;
  /** Writes a raw line to the child's stdin (live-session adapters). */
  write(text: string): void;
}

const KILL_GRACE_MS = 4000;

export abstract class BaseProcessAdapter implements AgentAdapter {
  abstract readonly id: ProviderId;

  /** Binary name; defaults to the protocol registry entry. */
  protected get command(): string {
    return providerOf(this.id).command;
  }

  /** Args used to probe installation. Overridable for CLIs without `--version`. */
  protected versionArgs(): string[] {
    return ['--version'];
  }

  protected abstract plan(context: SessionContext): SpawnPlan;
  protected abstract handle(value: JsonValue, io: RunIO): void;

  /** Non-JSON stdout/stderr. Default: surface stderr as a log event. */
  protected handleText(line: string, io: RunIO, stream: 'stdout' | 'stderr'): void {
    if (stream === 'stderr' && line.trim().length > 0) {
      io.emit({ kind: 'log', text: line });
    }
  }

  /**
   * Optional authentication probe. Returning null means "installed implies
   * usable" — the honest answer for CLIs with no machine-readable auth check.
   */
  protected async probeAuth(_binary: string): Promise<{ authenticated: boolean; detail: string | null } | null> {
    return null;
  }

  async probe(): Promise<ProviderStatus> {
    const binary = resolveBinary(this.command);
    if (!binary) {
      return {
        id: this.id,
        installed: false,
        authenticated: false,
        version: null,
        detail: `\`${this.command}\` is not on PATH`,
      };
    }
    const result = await run(binary, this.versionArgs(), { timeoutMs: 15_000, env: agentEnv() });
    const version = result.code === 0 ? firstLine(result.stdout) : null;
    const auth = await this.probeAuth(binary);
    return {
      id: this.id,
      installed: true,
      authenticated: auth ? auth.authenticated : true,
      version,
      detail: auth?.detail ?? (result.code === 0 ? null : firstLine(result.stderr) || 'version check failed'),
    };
  }

  start(context: SessionContext): AgentRun {
    const plan = this.plan(context);
    return new ProcessRun(this, plan, context);
  }

  /** @internal — invoked by ProcessRun. */
  dispatch(value: JsonValue, io: RunIO): void {
    this.handle(value, io);
  }

  /** @internal */
  dispatchText(line: string, io: RunIO, stream: 'stdout' | 'stderr'): void {
    this.handleText(line, io, stream);
  }
}

class ProcessRun implements AgentRun {
  readonly acceptsTurns: boolean;
  readonly done: Promise<AgentRunResult>;

  #child: ChildProcessWithoutNullStreams | null = null;
  #translator: EventTranslator;
  #pending = new Map<string, (decision: PermissionDecision) => void>();
  #resolve!: (result: AgentRunResult) => void;
  #settled = false;
  #killTimer: NodeJS.Timeout | null = null;
  #io: RunIO;

  constructor(
    private readonly adapter: BaseProcessAdapter,
    private readonly plan: SpawnPlan,
    private readonly context: SessionContext,
  ) {
    this.acceptsTurns = plan.acceptsTurns ?? false;
    this.#translator = new EventTranslator({
      threadId: context.threadId,
      turnId: newId('turn'),
      emit: (event) => context.emit(event),
      onUsage: (usage) => context.onUsage?.(usage),
      onPermission: (request) => context.emit({ type: 'permission.requested', request }),
    });
    this.#io = {
      context,
      emit: (event) => this.#translator.handle(event),
      requestPermission: (request) => this.#requestPermission(request),
      write: (text) => this.#write(text),
    };
    this.done = new Promise<AgentRunResult>((resolve) => {
      this.#resolve = resolve;
    });
    this.#launch();
  }

  #launch(): void {
    const binary = resolveBinary(this.plan.command);
    if (!binary) {
      this.#translator.handle({
        kind: 'error',
        message: `\`${this.plan.command}\` is not installed or not on PATH.`,
        fatal: true,
      });
      this.#finish(127);
      return;
    }

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(binary, this.plan.args, {
        cwd: this.context.cwd,
        env: agentEnv(this.plan.env),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      this.#translator.handle({ kind: 'error', message: describe(error), fatal: true });
      this.#finish(1);
      return;
    }
    this.#child = child;

    const stdout = new JsonLineStream(
      (value) => this.#safe(() => this.adapter.dispatch(value, this.#io)),
      (line) => this.#safe(() => this.adapter.dispatchText(line, this.#io, 'stdout')),
    );
    const stderr = new LineSplitter();

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) =>
      stderr.push(chunk, (line) => this.#safe(() => this.adapter.dispatchText(line, this.#io, 'stderr'))),
    );

    child.on('error', (error) => {
      this.#translator.handle({ kind: 'error', message: describe(error), fatal: true });
      this.#finish(1);
    });

    child.on('close', (code) => {
      stdout.end();
      stderr.flush((line) => this.#safe(() => this.adapter.dispatchText(line, this.#io, 'stderr')));
      if (code !== 0 && code !== null) {
        this.#translator.handle({
          kind: 'error',
          message: `${this.plan.command} exited with code ${code}.`,
          fatal: true,
        });
      }
      this.#finish(code ?? 0);
    });

    if (this.context.signal) {
      this.context.signal.addEventListener('abort', () => this.interrupt(), { once: true });
    }

    if (this.plan.stdin !== undefined && this.plan.stdin !== null) {
      child.stdin.end(this.plan.stdin);
    } else if (!this.acceptsTurns) {
      child.stdin.end();
    }
  }

  send(text: string): void {
    if (!this.acceptsTurns) return;
    this.#write(this.plan.encodeTurn ? this.plan.encodeTurn(text) : `${text}\n`);
  }

  interrupt(): void {
    const child = this.#child;
    if (!child || this.#settled) return;
    this.#translator.handle({ kind: 'turn.aborted', reason: 'Interrupted by operator' });
    try {
      child.kill('SIGINT');
    } catch {
      /* already gone */
    }
    this.#killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, KILL_GRACE_MS);
    this.#killTimer.unref?.();
  }

  respondToPermission(id: string, decision: PermissionDecision): void {
    const resolve = this.#pending.get(id);
    if (!resolve) return;
    this.#pending.delete(id);
    resolve(decision);
  }

  #requestPermission(request: Omit<RuntimePermissionRequest, 'id'>): Promise<PermissionDecision> {
    const id = newId('perm');
    return new Promise<PermissionDecision>((resolve) => {
      this.#pending.set(id, resolve);
      this.#translator.handle({ kind: 'request.permission', request: { ...request, id } });
    });
  }

  #write(text: string): void {
    const child = this.#child;
    if (!child || child.stdin.destroyed) return;
    child.stdin.write(text);
  }

  #safe(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      this.#translator.handle({ kind: 'error', message: describe(error), fatal: false });
    }
  }

  #finish(exitCode: number): void {
    if (this.#settled) return;
    this.#settled = true;
    if (this.#killTimer) clearTimeout(this.#killTimer);
    for (const [, resolve] of this.#pending) resolve({ kind: 'deny', reason: 'Session ended' });
    this.#pending.clear();
    this.#translator.completeMessage();
    this.#resolve({ exitCode, externalSessionId: this.#translator.externalSessionId });
  }
}

export function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function firstLine(text: string): string {
  return text.split('\n')[0]?.trim() ?? '';
}

/**
 * Shared permission-mode vocabulary check. Adapters use it to avoid emitting a
 * flag a provider does not support (the protocol registry is the source of
 * truth for which modes each provider advertises).
 */
export function supportsMode(id: ProviderId, mode: PermissionMode): boolean {
  return providerOf(id).permissionModes.includes(mode);
}
