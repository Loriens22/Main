/**
 * The adapter contract.
 *
 * An adapter knows one agent CLI and nothing else: how to probe for it, how to
 * launch a turn, and how to translate its native events into the canonical
 * `RuntimeEvent` union. It never touches threads, worktrees, persistence or the
 * WebSocket — the orchestrator owns all of that.
 */
import type {
  PermissionDecision,
  PermissionMode,
  ProviderId,
  ProviderStatus,
  ServerEvent,
  ThreadId,
} from '@ornight/protocol';
import type { RuntimeUsage } from './runtime.js';

export interface SessionContext {
  threadId: ThreadId;
  /** Working directory for the turn: the thread's worktree, or the workspace. */
  cwd: string;
  model: string;
  permissionMode: PermissionMode;
  /** Provider-native session id to resume, or null for a fresh session. */
  resumeId: string | null;
  prompt: string;
  emit(event: ServerEvent): void;
  /**
   * Extension beyond the brief's minimum: token/cost accounting has to reach
   * `ThreadStats`, and `ServerEvent` has no member for it, so the orchestrator
   * passes a sink. Optional so a bare `SessionContext` still type-checks.
   */
  onUsage?(usage: RuntimeUsage): void;
  /** Optional signal that aborts the turn (daemon shutdown). */
  signal?: AbortSignal;
}

export interface AgentRun {
  /** Follow-up turn on a live session. Only valid when `acceptsTurns` is true. */
  send(text: string): void;
  interrupt(): void;
  respondToPermission(id: string, decision: PermissionDecision): void;
  /**
   * Extension: most CLIs run one turn per process (`--print` style), so the
   * orchestrator starts a fresh run with `resumeId` for the next turn instead of
   * writing to a dead stdin. Adapters that hold a live session set this true.
   */
  readonly acceptsTurns: boolean;
  readonly done: Promise<AgentRunResult>;
}

export interface AgentRunResult {
  exitCode: number;
  externalSessionId: string | null;
}

export interface AgentAdapter {
  readonly id: ProviderId;
  probe(): Promise<ProviderStatus>;
  start(session: SessionContext): AgentRun;
}
