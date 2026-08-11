/**
 * @ornight/protocol
 *
 * The single source of truth shared by the harness core, the daemon, the
 * mini-tablet client and the desktop client. Every package in this repo codes
 * against these types; nothing here may import from another workspace package.
 *
 * Wire shape: newline-delimited JSON over WebSocket. Clients send `ClientCommand`,
 * the daemon replies with `ServerEvent`. Both directions are fully discriminated
 * on `type`, so a switch statement is exhaustive and the compiler enforces it.
 */

export const PROTOCOL_VERSION = 1 as const;

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                */
/* -------------------------------------------------------------------------- */

export type ThreadId = string;
export type TurnId = string;
export type MessageId = string;
export type ToolCallId = string;
export type WorkspaceId = string;

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The agent CLIs the harness can drive. Adding a provider means adding an id
 * here and an adapter in `@ornight/core`; nothing else in the stack changes.
 */
export type ProviderId =
  | 'claude-code'
  | 'codex'
  | 'cursor'
  | 'grok'
  | 'opencode'
  | 'gemini'
  | 'mock';

export interface ProviderModel {
  id: string;
  label: string;
  /** Short hint shown under the model name in the picker. */
  note?: string;
}

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  /** Binary the adapter spawns, e.g. `claude`. */
  command: string;
  /** Accent colour used for this provider's glass chrome, as `r g b`. */
  accent: string;
  /** Single-glyph mark rendered in dense UI (thread rows, tabs). */
  glyph: string;
  models: ProviderModel[];
  defaultModel: string;
  /** Permission modes this provider actually supports. */
  permissionModes: PermissionMode[];
  defaultPermissionMode: PermissionMode;
  /** Whether the adapter can resume a previous session in place. */
  supportsResume: boolean;
  /** Whether the provider streams token deltas (vs. whole messages). */
  supportsStreaming: boolean;
}

/** Availability of a provider on this machine, probed at daemon start. */
export interface ProviderStatus {
  id: ProviderId;
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  /** Human-readable reason when `installed` or `authenticated` is false. */
  detail: string | null;
}

/* -------------------------------------------------------------------------- */
/* Permission model                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Harness-level permission modes. Each adapter maps these onto whatever flag
 * its CLI actually understands; the UI only ever speaks in these four.
 */
export type PermissionMode =
  /** Agent may read and reason but must not mutate the worktree. */
  | 'plan'
  /** Every write / command asks the operator first. */
  | 'ask'
  /** File edits auto-approve; shell commands still ask. */
  | 'auto-edit'
  /** Everything auto-approves. Worktree isolation is the safety net. */
  | 'full-access';

export const PERMISSION_MODES: PermissionMode[] = ['plan', 'ask', 'auto-edit', 'full-access'];

export interface PermissionRequest {
  id: string;
  threadId: ThreadId;
  toolCallId: ToolCallId;
  /** e.g. `Bash`, `Edit`, `Write`. */
  tool: string;
  title: string;
  /** Command line or file path the agent wants to act on. */
  detail: string;
  /** Unified diff when the request is an edit, otherwise null. */
  diff: string | null;
  risk: 'low' | 'medium' | 'high';
  createdAt: number;
}

export type PermissionDecision =
  | { kind: 'allow' }
  | { kind: 'allow-always' }
  | { kind: 'deny'; reason?: string };

/* -------------------------------------------------------------------------- */
/* Workspaces and worktrees                                                   */
/* -------------------------------------------------------------------------- */

export interface Workspace {
  id: WorkspaceId;
  name: string;
  /** Absolute path of the primary checkout. */
  path: string;
  defaultBranch: string;
  remoteUrl: string | null;
  /** Owner/repo when the remote is GitHub, used for the PR flow. */
  githubSlug: string | null;
}

/**
 * Every thread runs inside its own git worktree so concurrent agents never
 * fight over the index. Created lazily on the thread's first mutating turn.
 */
export interface WorktreeInfo {
  path: string;
  branch: string;
  baseBranch: string;
  baseCommit: string;
  createdAt: number;
  /** False once the worktree has been merged back or discarded. */
  active: boolean;
}

/* -------------------------------------------------------------------------- */
/* Threads                                                                    */
/* -------------------------------------------------------------------------- */

export type ThreadStatus =
  | 'idle'
  | 'running'
  | 'awaiting-input'
  | 'awaiting-permission'
  | 'error'
  | 'archived';

export interface Thread {
  id: ThreadId;
  workspaceId: WorkspaceId;
  title: string;
  provider: ProviderId;
  model: string;
  permissionMode: PermissionMode;
  status: ThreadStatus;
  worktree: WorktreeInfo | null;
  createdAt: number;
  updatedAt: number;
  /** Rolling one-line summary of the last assistant turn, for the thread list. */
  preview: string;
  /** Cheap counters so the list can render badges without loading messages. */
  stats: ThreadStats;
  pinned: boolean;
  archived: boolean;
  /** Provider-native session id, used to resume. */
  externalSessionId: string | null;
  error: string | null;
}

export interface ThreadStats {
  messages: number;
  toolCalls: number;
  filesChanged: number;
  insertions: number;
  deletions: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export const EMPTY_THREAD_STATS: ThreadStats = {
  messages: 0,
  toolCalls: 0,
  filesChanged: 0,
  insertions: 0,
  deletions: 0,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0,
};

/* -------------------------------------------------------------------------- */
/* Messages and tool calls                                                    */
/* -------------------------------------------------------------------------- */

export type MessageRole = 'user' | 'assistant' | 'system';

export interface TextPart {
  kind: 'text';
  text: string;
}

export interface ReasoningPart {
  kind: 'reasoning';
  text: string;
  /** Reasoning arrives collapsed; the operator expands it deliberately. */
  collapsed: boolean;
}

export interface ToolCallPart {
  kind: 'tool';
  call: ToolCall;
}

export type MessagePart = TextPart | ReasoningPart | ToolCallPart;

export interface Message {
  id: MessageId;
  threadId: ThreadId;
  turnId: TurnId;
  role: MessageRole;
  parts: MessagePart[];
  createdAt: number;
  /** True while deltas are still arriving for this message. */
  streaming: boolean;
}

export type ToolStatus = 'pending' | 'awaiting-permission' | 'running' | 'ok' | 'error' | 'denied';

/**
 * Normalised view of a provider tool invocation. Adapters translate their
 * native shapes into this so the UI renders every provider identically.
 */
export interface ToolCall {
  id: ToolCallId;
  threadId: ThreadId;
  /** Provider-native tool name, e.g. `Bash`, `shell`, `apply_patch`. */
  name: string;
  /** Normalised category driving which card the UI renders. */
  category: ToolCategory;
  title: string;
  /** Primary argument: a command, a path, a query. */
  target: string;
  input: Record<string, unknown>;
  output: string | null;
  status: ToolStatus;
  /** Set when `category` is `edit`. */
  patch: FilePatch | null;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
}

export type ToolCategory =
  | 'read'
  | 'edit'
  | 'shell'
  | 'search'
  | 'web'
  | 'task'
  | 'todo'
  | 'other';

/* -------------------------------------------------------------------------- */
/* Diffs                                                                      */
/* -------------------------------------------------------------------------- */

export type FileChangeKind = 'added' | 'modified' | 'deleted' | 'renamed';

export interface FilePatch {
  path: string;
  previousPath: string | null;
  kind: FileChangeKind;
  insertions: number;
  deletions: number;
  /** Unified diff body for this single file. */
  unified: string;
  binary: boolean;
  /** Set when the operator has staged this file for the next commit. */
  staged: boolean;
}

export interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'meta';
  /** Line number in the pre-image, null for additions. */
  oldLine: number | null;
  /** Line number in the post-image, null for deletions. */
  newLine: number | null;
  content: string;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/** A parsed patch, ready to render. Produced by `parseUnifiedDiff` in core. */
export interface ParsedPatch extends FilePatch {
  hunks: DiffHunk[];
}

/* -------------------------------------------------------------------------- */
/* Git state and the ship flow                                                */
/* -------------------------------------------------------------------------- */

export interface GitState {
  threadId: ThreadId;
  branch: string;
  baseBranch: string;
  /** Commits on this branch not yet on the base branch. */
  ahead: number;
  behind: number;
  files: FilePatch[];
  insertions: number;
  deletions: number;
  hasConflicts: boolean;
  /** Populated once the branch has been pushed. */
  remoteBranch: string | null;
  pullRequest: PullRequestInfo | null;
  updatedAt: number;
}

export interface PullRequestInfo {
  number: number;
  url: string;
  title: string;
  state: 'open' | 'merged' | 'closed' | 'draft';
  checks: 'pending' | 'passing' | 'failing' | 'none';
}

export type ShipStep = 'commit' | 'push' | 'pull-request';

export interface ShipRequest {
  threadId: ThreadId;
  steps: ShipStep[];
  commitMessage: string;
  /** Paths to include; empty means every changed file. */
  paths: string[];
  prTitle?: string;
  prBody?: string;
  draft?: boolean;
}

export interface ShipProgress {
  threadId: ThreadId;
  step: ShipStep;
  state: 'running' | 'done' | 'error';
  detail: string;
  /** Set on the final successful step of a PR flow. */
  pullRequest?: PullRequestInfo;
}

/* -------------------------------------------------------------------------- */
/* Remote access                                                              */
/* -------------------------------------------------------------------------- */

export interface RemoteInfo {
  /** LAN URL the tablet connects to. */
  localUrl: string;
  /** Public tunnel URL when one is running. */
  tunnelUrl: string | null;
  /** Short code the tablet pairs with, rotated on every daemon start. */
  pairingCode: string;
  connectedClients: number;
  protocolVersion: number;
  daemonVersion: string;
}

/* -------------------------------------------------------------------------- */
/* Client -> server                                                           */
/* -------------------------------------------------------------------------- */

export type ClientCommand =
  | { type: 'hello'; token: string | null; client: 'tablet' | 'desktop' }
  | { type: 'subscribe'; threadId: ThreadId }
  | { type: 'unsubscribe'; threadId: ThreadId }
  | {
      type: 'thread.create';
      workspaceId: WorkspaceId;
      provider: ProviderId;
      model: string;
      permissionMode: PermissionMode;
      title?: string;
      /** First prompt, sent atomically with creation. */
      prompt?: string;
    }
  | { type: 'thread.send'; threadId: ThreadId; text: string; attachments?: Attachment[] }
  | { type: 'thread.interrupt'; threadId: ThreadId }
  | { type: 'thread.rename'; threadId: ThreadId; title: string }
  | { type: 'thread.archive'; threadId: ThreadId; archived: boolean }
  | { type: 'thread.pin'; threadId: ThreadId; pinned: boolean }
  | { type: 'thread.delete'; threadId: ThreadId }
  | { type: 'thread.setMode'; threadId: ThreadId; permissionMode: PermissionMode }
  | { type: 'thread.setModel'; threadId: ThreadId; provider: ProviderId; model: string }
  | { type: 'permission.decide'; requestId: string; decision: PermissionDecision }
  | { type: 'git.refresh'; threadId: ThreadId }
  | { type: 'git.stage'; threadId: ThreadId; paths: string[]; staged: boolean }
  | { type: 'git.revert'; threadId: ThreadId; paths: string[] }
  | { type: 'ship'; request: ShipRequest }
  | { type: 'worktree.discard'; threadId: ThreadId }
  | { type: 'workspace.add'; path: string }
  | { type: 'ping' };

export interface Attachment {
  name: string;
  mimeType: string;
  /** Base64 payload for images, plain text for files. */
  data: string;
}

/* -------------------------------------------------------------------------- */
/* Server -> client                                                           */
/* -------------------------------------------------------------------------- */

export type ServerEvent =
  | { type: 'ready'; snapshot: Snapshot }
  | { type: 'error'; message: string; threadId?: ThreadId }
  | { type: 'thread.created'; thread: Thread }
  | { type: 'thread.updated'; thread: Thread }
  | { type: 'thread.deleted'; threadId: ThreadId }
  | { type: 'thread.history'; threadId: ThreadId; messages: Message[] }
  | { type: 'message.started'; message: Message }
  /** Token delta appended to the last text part of `messageId`. */
  | { type: 'message.delta'; threadId: ThreadId; messageId: MessageId; text: string }
  | {
      type: 'message.reasoning';
      threadId: ThreadId;
      messageId: MessageId;
      text: string;
    }
  | { type: 'message.completed'; message: Message }
  | { type: 'tool.started'; threadId: ThreadId; messageId: MessageId; call: ToolCall }
  | { type: 'tool.updated'; threadId: ThreadId; call: ToolCall }
  | { type: 'permission.requested'; request: PermissionRequest }
  | { type: 'permission.resolved'; requestId: string; decision: PermissionDecision }
  | { type: 'git.state'; state: GitState }
  | { type: 'ship.progress'; progress: ShipProgress }
  | { type: 'provider.status'; statuses: ProviderStatus[] }
  | { type: 'remote.info'; info: RemoteInfo }
  | { type: 'pong' };

export interface Snapshot {
  protocolVersion: number;
  workspaces: Workspace[];
  threads: Thread[];
  providers: ProviderDescriptor[];
  providerStatus: ProviderStatus[];
  pendingPermissions: PermissionRequest[];
  remote: RemoteInfo;
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'demo';

/**
 * The one seam between the UI and the world. The tablet app binds to a
 * `Transport`; in demo mode that is an in-memory simulator, and against a real
 * daemon it is a WebSocket. Neither UI layer knows which it is talking to.
 */
export interface Transport {
  readonly state: ConnectionState;
  send(command: ClientCommand): void;
  subscribe(listener: (event: ServerEvent) => void): () => void;
  onStateChange(listener: (state: ConnectionState) => void): () => void;
  close(): void;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function isTerminalToolStatus(status: ToolStatus): boolean {
  return status === 'ok' || status === 'error' || status === 'denied';
}

export function threadIsBusy(status: ThreadStatus): boolean {
  return status === 'running' || status === 'awaiting-permission';
}

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  plan: 'Plan',
  ask: 'Ask',
  'auto-edit': 'Auto-edit',
  'full-access': 'Full access',
};

export const PERMISSION_MODE_HINTS: Record<PermissionMode, string> = {
  plan: 'Read and think. No writes.',
  ask: 'Confirm every edit and command.',
  'auto-edit': 'Edits apply. Commands ask.',
  'full-access': 'Nothing asks. Worktree isolates.',
};
