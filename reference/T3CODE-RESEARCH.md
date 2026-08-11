# T3 Code — Architecture & Feature Research

**Status: REAL SOURCE OBTAINED.** The repository was found, cloned, and read.
Everything below is derived from the actual source unless explicitly marked **UNVERIFIED**.

- Source on disk: `/home/user/Main/reference/t3code/`
- Cloned commit: `e5c82d79a09e010d1a87c715f405635f8c45f1f7` (shallow, `main`, pushed 2026-08-11)
- The clone's `.git` directory was deleted as instructed.

Companion doc: `/home/user/Main/reference/T3CODE-UI-SPEC.md` (visual/interaction spec).

---

## A. Repo identity

| Field | Value |
| --- | --- |
| URL | https://github.com/pingdotgg/t3code |
| Homepage | https://t3.codes (marketing), https://app.t3.codes (hosted web app) |
| Owner | `pingdotgg` (org) — **not** `t3dotgg`; `t3dotgg/t3code` does not exist |
| License | MIT, "Copyright (c) 2026 T3 Tools Inc." (`LICENSE`) |
| Stars / forks | 18,030 stars / 4,075 forks / 1,492 open issues (GitHub API, at research time) |
| Language | TypeScript |
| Created | 2026-02-08 |
| Default branch | `main` |
| Monorepo package | `@t3tools/monorepo` (private root) |
| Published version | `0.0.33` (`apps/server/package.json`, `apps/web`, `apps/desktop` all `0.0.33`) |
| Discord | https://discord.gg/jn4EGJjrvv |

The README's own one-liner: *"T3 Code is an 'agent harness control surface'. It enables control of
the agents on your machine with a best-in-class mobile app, web app and Electron-based desktop app."*
`AGENTS.md` calls it *"a minimal GUI for coding agents. A Node WebSocket server wraps provider CLIs
(Codex, Claude Code, Cursor, Grok, OpenCode) and serves web, desktop, and mobile clients."*

`AGENTS.md` claims "over 100,000 users".

### Tech stack

- **Language/runtime:** TypeScript (`typescript ~6.0.3`), Node `^24.13.1` for dev; the shipped server
  requires Node `^22.16 || ^23.11 || >=24.10`.
- **Effect-first backend.** `effect@4.0.0-beta.103` everywhere: `Effect.Schema` for contracts,
  `Effect RPC` for the client/server wire, `effect/unstable/sql` + SQLite for persistence,
  `effect/unstable/process` `ChildProcessSpawner` for provider CLIs.
- **Frontend:** React 19.2.6 + React Compiler (`babel-plugin-react-compiler`), TanStack Router,
  Tailwind CSS v4, `@base-ui/react` (Base UI, the successor to Radix by the MUI team),
  `lucide-react` icons, `@effect/atom-react` for state, `zustand` for local UI stores,
  `lexical` for the composer editor, `@pierre/diffs` + `@pierre/trees` for the diff viewer,
  `@legendapp/list` for virtualized lists, `@dnd-kit/*` for drag-reorder,
  `react-markdown` + `remark-gfm` + `rehype-raw`/`rehype-sanitize` for chat markdown.
- **Build tooling:** pnpm 11 workspaces driven by **Vite+ (`vp`)** (`vite-plus@0.2.2`,
  `vite: npm:@voidzero-dev/vite-plus-core`). Typecheck via `@typescript/native-preview` (`tsgo`).
  Lint via oxlint plus a repo-local plugin `oxlint-plugin-t3code`.
- **Desktop shell:** **Electron 41.5.0** + `electron-builder` 26.15.6 + `electron-updater`.
  Product name `T3 Code (Alpha)`. Renderer loads the web bundle over a custom `t3code://` protocol.
- **Mobile:** Expo / React Native (`apps/mobile`, ~59 MB of the repo).
- **Marketing site:** Astro (`apps/marketing`).
- **Native:** a Rust crate `native/resource-monitor` (built with cargo) for process/resource telemetry.
- **Terminals:** `node-pty` on the server; a WASM build of **libghostty** on the web side
  (`apps/web/scripts/build-libghostty-wasm.sh`), see `docs/architecture/terminal-renderers.md`.
- **Auth (cloud):** Clerk (`@clerk/react`, `@clerk/electron`, `@clerk/expo`) — used for T3 Connect,
  not for local server auth.

### Distribution

- **npm:** package name is plain **`t3`** (`apps/server/package.json`, `bin: { t3: ./dist/bin.mjs }`).
  `npx t3@latest` starts the backend + local web app. There is no `t3code` npm package involved.
- **Desktop:** GitHub Releases; `winget install T3Tools.T3Code`; `brew install --cask t3-code`;
  AUR `yay -S t3code-bin`. Build targets: mac dmg (arm64/x64), Linux AppImage x64, Windows nsis
  (arm64/x64) — see root `package.json` `dist:desktop:*` scripts.
- **Mobile:** App Store (`id6787819824`) and Google Play (`com.t3tools.t3code`).
- **Hosted web:** `https://app.t3.codes`, deployed to Vercel (`apps/web/vercel.ts`).

---

## B. Directory map

```
t3code/
├── apps/
│   ├── server/     # package `t3` — THE runtime. WS+HTTP, orchestration, providers,
│   │               # checkpointing, VCS, terminals, filesystem, auth, PRs. Also serves web build.
│   ├── web/        # @t3tools/web — React + Vite UI (the thing to mirror)
│   ├── desktop/    # @t3tools/desktop — Electron shell; supervises a desktop-scoped `t3` backend,
│   │               # owns SSH-managed remote environments
│   ├── mobile/     # @t3tools/mobile — Expo/React Native client
│   └── marketing/  # @t3tools/marketing — Astro site (contains the only screenshots in-repo)
├── packages/
│   ├── contracts/          # @t3tools/contracts — Effect Schema: RPC group, orchestration
│   │                       # commands/events/read model, auth scopes, settings. Source of truth.
│   ├── shared/             # framework-agnostic utils (DrainableWorker, git helpers, relay auth,
│   │                       # DPoP, semver, logging). Subpath exports only, no barrel.
│   ├── client-runtime/     # connection lifecycle, auth, RPC session, environment registry,
│   │                       # Atom domain state. Shared by web + mobile.
│   ├── effect-acp/         # Effect impl of the Agent Client Protocol (ACP)
│   ├── effect-codex-app-server/  # Effect client for `codex app-server` JSON-RPC
│   ├── ssh/                # SSH config parsing, tunnels, remote environment manager
│   └── tailscale/          # Tailscale CLI wrapper + `tailscale serve` lifecycle
├── infra/relay/            # `t3code-relay` — hosted T3 Connect relay (Alchemy-deployed).
│                           # Discovery + push notifications only; NOT in the traffic hot path.
├── native/resource-monitor # Rust resource monitor
├── oxlint-plugin-t3code/   # repo-specific lint rules
├── scripts/                # dev runner, desktop artifact builds, release helpers
├── assets/                 # brand/app icons per channel (dev / nightly / prod)
├── docs/                   # user/ internals/ operations/ architecture/ — very high quality
├── experiments/            # throwaway prototypes, not shipped
└── t3.json                 # per-project T3 Code config (schema https://t3.codes/schema/t3.json)
```

Notable server subtrees (`apps/server/src/`): `orchestration/`, `provider/`, `checkpointing/`,
`vcs/`, `git/`, `pullRequest/`, `terminal/`, `preview/`, `persistence/`, `auth/`, `relay/`,
`sourceControl/`, `review/`, `mcp/`, `textGeneration/`, `resourceTelemetry/`, `workspace/`,
`background/`, `observability/`.

---

## C. Core domain model

### Vocabulary (from `docs/internals/glossary.md` + `AGENTS.md`)

- **environment** — one running T3 server plus the machine, filesystem, provider credentials and
  state it owns. Clients can be connected to several at once.
- **project** — an environment-local workspace record rooted at a directory. Has `workspaceRoot`
  and a title. **Projects do not contain threads**: `OrchestrationProject` and `OrchestrationThread`
  are separate arrays on the read model.
- **thread** — the durable unit of conversation + workspace history. Holds messages, activities,
  checkpoints, session state. Optionally has `worktreePath` and `branch`.
- **turn** — one user→assistant cycle. Ends when the session leaves `running` status
  (`settledTurnStateForSessionStatus` in `apps/server/src/orchestration/projector.ts` is authoritative).
  Checkpoint/diff work settling later does *not* redefine turn end.
- **activity** — a user-visible non-message log item (approvals, tool actions, failures).
- **session** — the live provider-backed runtime attached to a thread.
- **T3 home** — the base data directory (`~/.t3` by default).

### Event sourcing

The server never mutates app state directly (`docs/internals/overview.md`,
`apps/server/src/orchestration/Layers/OrchestrationEngine.ts`):

1. Client dispatches a typed **command** over RPC `orchestration.dispatchCommand`.
2. `OrchestrationEngine.dispatch` offers a `CommandEnvelope` onto `commandQueue`; **one worker
   fiber** takes envelopes one at a time → command processing is totally ordered.
3. `processEnvelope`: check durable command receipt (idempotent retries) → run the **pure decider**
   (`orchestration/decider.ts`, preconditions in `commandInvariants.ts`) → produce **events**.
4. In **one SQL transaction**: append events to the event store, apply to the in-memory read model
   via `projector.ts`, project into persisted tables, write the accepted receipt.
5. After commit: swap in the new read model, publish committed events to subscribers.

Because persistence and projection share a transaction, the read model cannot durably disagree with
the event log. On dispatch failure the engine rereads persisted events past the starting sequence
and reconciles.

### Command / event names (verbatim from `packages/contracts/src/orchestration.ts`)

Commands (imperative) and their resulting events (past tense):

```
project.create           → project.created
project.delete           → project.deleted
project.meta.update      → project.meta-updated

thread.create            → thread.created
thread.delete            → thread.deleted
thread.meta.update       → thread.meta-updated
thread.archive/unarchive → thread.archived / thread.unarchived
thread.pin/unpin         → thread.pinned / thread.unpinned
thread.pin.reorder       → thread.pin-reordered
thread.snooze/unsnooze   → thread.snoozed / thread.unsnoozed
thread.settle/unsettle   → thread.settled / thread.unsettled
thread.turn.start        → thread.turn-start-requested
thread.turn.interrupt    → thread.turn-interrupt-requested
thread.turn.diff.complete→ thread.turn-diff-completed
thread.approval.respond  → thread.approval-response-requested
thread.user-input.respond→ thread.user-input-response-requested
thread.checkpoint.revert → thread.checkpoint-revert-requested
thread.revert.complete   → thread.reverted
thread.session.set       → thread.session-set
thread.session.stop      → thread.session-stop-requested
thread.runtime-mode.set  → thread.runtime-mode-set
thread.interaction-mode.set → thread.interaction-mode-set
thread.message.assistant.delta / .complete → thread.message-sent
thread.activity.append   → thread.activity-appended
thread.proposed-plan.upsert → thread.proposed-plan-upserted
thread.title.regeneration.complete
```

Only a subset is **client-dispatchable**: `thread.create`, `thread.turn.start`,
`thread.turn.interrupt`, `thread.approval.respond`, `thread.user-input.respond`,
`thread.checkpoint.revert`, `thread.session.stop`, `thread.runtime-mode.set`,
`thread.interaction-mode.set` (plus project CRUD and thread meta/pin/snooze/archive).
The rest are internal, produced by server-side reactors.

### Persistence

**SQLite**, at `<T3 home>/userdata/state.sqlite` (dev: `<baseDir>/dev/state.sqlite`).
Path derivation — `apps/server/src/config.ts` `deriveServerPaths`:

```
baseDir            = ~/.t3            (override: --home-dir / T3CODE_HOME)
stateDir           = <baseDir>/userdata     (or <baseDir>/dev in dev mode)
dbPath             = <stateDir>/state.sqlite
keybindingsConfigPath = <stateDir>/keybindings.json
settingsPath       = <stateDir>/settings.json
secretsDir         = <stateDir>/secrets
attachmentsDir     = <stateDir>/attachments
logsDir            = <stateDir>/logs
  serverLogPath        = logs/server.log
  serverTracePath      = logs/server.trace.ndjson
  providerEventLogPath = logs/provider/events.log
  terminalLogsDir      = logs/terminals
anonymousIdPath    = <stateDir>/anonymous-id
environmentIdPath  = <stateDir>/environment-id
serverRuntimeStatePath = <stateDir>/server-runtime.json
worktreesDir       = <baseDir>/worktrees        (NOTE: baseDir, not stateDir)
providerStatusCacheDir = <baseDir>/caches
```

Default port: `DEFAULT_PORT = 3773`.

Migrations live in `apps/server/src/persistence/Migrations/` — 40+ numbered files. Core tables
(`001_OrchestrationEvents.ts`, `005_Projections.ts`):

```sql
orchestration_events(
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE,
  aggregate_kind, stream_id, stream_version, event_type, occurred_at,
  command_id, causation_event_id, correlation_id, actor_kind,
  payload_json, metadata_json)
  -- UNIQUE(aggregate_kind, stream_id, stream_version)

orchestration_command_receipts(...)      -- idempotency
checkpoint_diff_blobs(...)
provider_session_runtime(...)

projection_projects(project_id PK, title, workspace_root, default_model,
                    scripts_json, created_at, updated_at, deleted_at)
projection_threads(thread_id PK, project_id, title, model, branch, worktree_path,
                   latest_turn_id, created_at, updated_at, deleted_at)
                   -- later migrations add: runtime_mode, interaction_mode, archived_at,
                   -- settled, snoozed, pinned, pin_order_key, shell summary columns
projection_thread_messages(message_id PK, thread_id, turn_id, role, text,
                           is_streaming, created_at, updated_at)
projection_thread_activities(activity_id PK, thread_id, turn_id, tone, kind,
                             summary, payload_json, created_at)
projection_thread_sessions(thread_id PK, status, provider_name, provider_session_id,
                           provider_thread_id, active_turn_id, last_error, updated_at)
projection_turns(row_id PK, thread_id, turn_id, pending_message_id, assistant_message_id,
                 state, requested_at, started_at, completed_at,
                 checkpoint_turn_count, checkpoint_ref, checkpoint_status,
                 checkpoint_files_json)
projection_pending_approvals(request_id PK, thread_id, turn_id, status, decision,
                             created_at, resolved_at)
projection_state(projector PK, last_applied_sequence, updated_at)
auth_pairing_links(...), auth_sessions(...), projection_thread_proposed_plans(...)
```

IDs are branded schema types in `packages/contracts/src/baseSchemas.ts`: `ThreadId`, `ProjectId`,
`TurnId`, `EventId`, `RuntimeItemId`, `RuntimeRequestId`, `RuntimeTaskId`, `ProviderItemId`,
`ApprovalRequestId`, `CheckpointRef`, `ProviderInstanceId`, `EnvironmentId`.

---

## D. Provider / agent adapter layer

Read `docs/internals/providers.md` alongside `apps/server/src/provider/`.

### Five built-in drivers (`apps/server/src/provider/builtInDrivers.ts`)

```ts
export const BUILT_IN_DRIVERS: ReadonlyArray<AnyProviderDriver<BuiltInDriversEnv>> = [
  CodexDriver,   // driverKind "codex"       displayName "Codex"
  ClaudeDriver,  // driverKind "claudeAgent" displayName "Claude"
  CursorDriver,  // driverKind "cursor"      displayName "Cursor"
  GrokDriver,    // driverKind "grok"        displayName "Grok"
  OpenCodeDriver,// driverKind "opencode"
];
```

All five declare `supportsMultipleInstances: true` (so you can run e.g. `codex_personal` and
`codex_work` with separate `CODEX_HOME`s simultaneously).

There is **no Gemini driver** in this build. Adding a driver = write `Drivers/<X>Driver.ts` +
`Layers/<X>Adapter.ts` + append to `BUILT_IN_DRIVERS`. No orchestration/contract/client change.

### Two-level registry

- `ProviderInstanceRegistry` keys *configured* instances by `ProviderInstanceId`. Creating one looks
  up the driver by `driverKind`, decodes `entry.config` with that driver's Effect schema, opens a
  **child scope**, and calls `driver.create`. Closing the scope tears down child processes and
  refresh fibers.
- `ProviderAdapterRegistry` resolves an instance ID → its live adapter (`getByInstance`).
- `ProviderService` (`Layers/ProviderService.ts`) sits on top and combines the adapter registry with
  the provider **session directory**, so callers name a *thread*, never an agent.

### The adapter interface — VERBATIM

`apps/server/src/provider/Services/ProviderAdapter.ts`:

```ts
export type ProviderSessionModelSwitchMode = "in-session" | "unsupported";

export interface ProviderAdapterCapabilities {
  readonly sessionModelSwitch: ProviderSessionModelSwitchMode;
}

export interface ProviderThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<unknown>;
}
export interface ProviderThreadSnapshot {
  readonly threadId: ThreadId;
  readonly turns: ReadonlyArray<ProviderThreadTurnSnapshot>;
}

export interface ProviderAdapterShape<TError> {
  readonly provider: ProviderDriverKind;
  readonly capabilities: ProviderAdapterCapabilities;

  readonly startSession: (input: ProviderSessionStartInput)
    => Effect.Effect<ProviderSession, TError>;
  readonly sendTurn: (input: ProviderSendTurnInput)
    => Effect.Effect<ProviderTurnStartResult, TError>;
  readonly interruptTurn: (threadId: ThreadId, turnId?: TurnId) => Effect.Effect<void, TError>;
  readonly respondToRequest: (threadId: ThreadId, requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision) => Effect.Effect<void, TError>;
  readonly respondToUserInput: (threadId: ThreadId, requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers) => Effect.Effect<void, TError>;
  readonly stopSession: (threadId: ThreadId) => Effect.Effect<void, TError>;
  readonly listSessions: () => Effect.Effect<ReadonlyArray<ProviderSession>>;
  readonly hasSession: (threadId: ThreadId) => Effect.Effect<boolean>;
  readonly readThread: (threadId: ThreadId) => Effect.Effect<ProviderThreadSnapshot, TError>;
  readonly rollbackThread: (threadId: ThreadId, numTurns: number)
    => Effect.Effect<ProviderThreadSnapshot, TError>;
  readonly stopAll: () => Effect.Effect<void, TError>;

  /** Canonical runtime event stream emitted by this adapter. */
  readonly streamEvents: Stream.Stream<ProviderRuntimeEvent>;
}
```

A `ProviderDriver` additionally exposes `driverKind`, `metadata`, `configSchema`, `defaultConfig`,
and `create({instanceId, displayName, accentColor, environment, enabled, config})` returning a
`ProviderInstance` with `{ instanceId, driverKind, continuationIdentity, snapshot, adapter,
textGeneration }`. `textGeneration` is a *separate* per-provider capability used for
commit-message / PR-title / branch-name / thread-title generation (see
`apps/server/src/textGeneration/{Codex,Claude,Cursor,Grok,OpenCode}TextGeneration.ts`).

### Per-provider transport (NOT a uniform PTY spawn)

| Provider | Transport | Notes |
| --- | --- | --- |
| **Codex** | `codex app-server` child process speaking **JSON-RPC**, via `packages/effect-codex-app-server` | Args built in `Layers/codexLaunchArgs.ts`: `["app-server", ...tokenized launchArgs]`. Text generation uses `codex exec` with a filtered arg set. Multi-account via `CODEX_HOME` shadow homes (`Drivers/CodexHomeLayout.ts`). |
| **Claude** | **`@anthropic-ai/claude-agent-sdk`** (`^0.3.170`) in-process `createQuery({prompt, options})` — *not* a raw CLI parse | Still points at the user's `claude` binary via `pathToClaudeCodeExecutable`. Multi-account via a `CLAUDE_CONFIG_DIR`-style home (`Drivers/ClaudeHome.ts`). |
| **Cursor** | **ACP** (Agent Client Protocol) over JSON-RPC to the `cursor-agent` binary, via `packages/effect-acp` + `provider/acp/CursorAcpSupport.ts` | Model catalog comes from Cursor's `list_available_models` ACP extension method. Self-update via `cursor-agent update`. |
| **Grok** | **ACP** as well (`provider/acp/GrokAcpSupport.ts`, `XAiAcpExtension.ts`) | Maintenance is "manual only" — no npm package / auto-update path. |
| **OpenCode** | **`@opencode-ai/sdk`** (`^1.3.15`) against a managed `opencode` server (`provider/opencodeRuntime.ts`) | Permissions expressed as an OpenCode `PermissionRuleset`. |

Raw event provenance is tracked in the contract (`RuntimeEventRawSource`), which enumerates every
wire format the system ingests:

```ts
"codex.app-server.notification" | "codex.app-server.request" | "codex.eventmsg"
| "claude.sdk.message" | "claude.sdk.permission" | "codex.sdk.thread-event"
| "opencode.sdk.event" | "acp.jsonrpc" | `acp.${string}.extension`
```

### Per-provider quirks

- **Auth** is per-CLI and happens *on the server machine*: `codex login`, `claude auth login`,
  `agent login` (Cursor — note: NOT `cursor-agent login`), `grok login`, `opencode auth login`.
- **Binary discovery:** each CLI must be on the server's `PATH` or have an explicit
  Settings → provider instance → *Binary path*. Defaults: `codex`, `claude`, `cursor-agent`,
  `grok`, `opencode`.
- **Resume/continue:** Claude passes `resume: <sessionId>` + a generated `sessionId` into the SDK
  query, tracked as `resumeCursor { threadId, resume, resumeSessionAt, turnCount }` on the session.
  Codex resumes by `threadId` in its resume cursor. `rollbackThread(threadId, numTurns)` is the
  generic "undo N turns in the provider's own conversation" hook used by checkpoint revert.
- **Model switching mid-session:** declared per adapter via
  `capabilities.sessionModelSwitch: "in-session" | "unsupported"`.
- **Extra CLI args:** every provider config has `launchArgs` (tokenized), plus
  `T3CODE_CODEX_LAUNCH_ARGS` env override for Codex.
- **MCP:** the server exposes its own MCP endpoint to Claude as an HTTP MCP server named
  `"t3-code"` with an `Authorization` header (`McpProviderSession`, `apps/server/src/mcp/`).
- **Attachment grant:** Claude gets `additionalDirectories = [cwd, serverConfig.attachmentsDir]` so
  pasted images are readable without an approval prompt; sibling dirs (`secrets/`, `state.sqlite`)
  stay ungranted.

### The three queue-backed workers

Built on `packages/shared/src/DrainableWorker.ts` (`makeDrainableWorker`); each exposes `drain()`
which retries until an outstanding-item count hits zero — so tests await "queue empty and current
item finished" instead of sleeping.

1. `ProviderRuntimeIngestion` — normalizes provider runtime streams into orchestration commands.
2. `ProviderCommandReactor` — reacts to orchestration *intent* events, dispatches provider calls.
3. `CheckpointReactor` — captures baseline/completed checkpoints, projects diffs, performs reverts.

`RuntimeReceiptBus` receipts (`checkpoint.baseline.captured`, `checkpoint.diff.finalized`,
`turn.processing.quiesced`) are **test-only**: `RuntimeReceiptBusLive.publish` is a no-op.

### Buffered assistant delivery

`AssistantDeliveryMode` is `"streaming" | "buffered"`. Buffered is **not** held until turn end:
`MAX_BUFFERED_ASSISTANT_CHARS = 24_000` in `ProviderRuntimeIngestion.ts` — the append that would
exceed it spills the whole accumulated text as one delta. It also flushes at approval and
user-input boundaries via `flushBufferedAssistantMessagesForTurn`.

---

## E. Streaming / event protocol

Two distinct layers. **Do not conflate them.**

### 1. Client ↔ server: Effect RPC over one WebSocket

`packages/contracts/src/rpc.ts` declares `WS_METHODS` and assembles `WsRpcGroup`. Each member is
either unary or a server stream (`stream: true`). `apps/server/src/ws.ts` mounts `GET /ws`,
authenticates the upgrade via `EnvironmentAuth.authenticateWebSocketUpgrade`, then hands the socket
to `RpcServer.toHttpEffectWebsocket`. **Authorization is per method**: `RPC_REQUIRED_SCOPE` maps each
method to a scope; holding a socket is not authorization to call everything on it.

There is *no broadcast push bus* — clients subscribe to exactly what they need
(`orchestration.subscribeThread`, `orchestration.subscribeShell`, `subscribeServerConfig`,
`terminal.attach`, …) and the server pushes only on those subscriptions. This is a deliberate
performance rule in `AGENTS.md` ("sending too much data over websockets" is called out as a
regression source).

Method surface (verbatim keys from `WS_METHODS`, `packages/contracts/src/rpc.ts`):

```
projects.list/add/remove/listEntries/readFile/searchContents/searchEntries/writeFile
shell.openInEditor
filesystem.browse, assets.createUrl
vcs.pull/refreshStatus/listRefs/createWorktree/removeWorktree/createRef/switchRef/init
git.runStackedAction, git.resolvePullRequest, git.preparePullRequestThread
review.getDiffPreview, review.getDiffFileContents
terminal.open/attach/write/resize/clear/restart/close
preview.open/navigate/resize/refresh/close/list/reportStatus
previewAutomation.connect/respond/focusHost
server.probe/getConfig/refreshProviders/updateProvider/updateServer/
  updateServerWithProgress/upsertKeybinding/removeKeybinding/getSettings/updateSettings/
  discoverSourceControl/getTraceDiagnostics/getProcessDiagnostics/getProcessResourceHistory/
  getResourceTelemetryHistory/retryResourceTelemetry/signalProcess/reportClientActivity/
  reportHostPowerState/getBackgroundPolicy/getUsageSummary
cloud.getRelayClientStatus, cloud.installRelayClient
pullRequests.list/listStats/detail/activity/diffFileContents/runAction/comment/
  submitReview/replyToThread/setThreadResolution/invalidate/reviewerCandidates/requestReviewers
sourceControl.lookupRepository/cloneRepository/publishRepository
subscribeVcsStatus, subscribeTerminalEvents, subscribeTerminalMetadata, subscribePreviewEvents,
subscribeDiscoveredLocalServers, subscribeServerConfig, subscribeServerLifecycle,
subscribeAuthAccess, subscribeBackgroundPolicy, subscribeResourceTelemetry
```

Plus `ORCHESTRATION_WS_METHODS` (`packages/contracts/src/orchestration.ts`):

```ts
export const ORCHESTRATION_WS_METHODS = {
  dispatchCommand: "orchestration.dispatchCommand",
  getWorkflowScript: "orchestration.getWorkflowScript",
  getTurnDiff: "orchestration.getTurnDiff",
  getFullThreadDiff: "orchestration.getFullThreadDiff",
  searchThreads: "orchestration.searchThreads",
  getArchivedShellSnapshot: "orchestration.getArchivedShellSnapshot",
  subscribeShell: "orchestration.subscribeShell",
  subscribeThread: "orchestration.subscribeThread",
} as const;
```

Note the **shell vs thread split**: `subscribeShell` feeds the sidebar/summary view (cheap), and
`subscribeThread` feeds the open conversation (expensive). Mirror this — it is the main reason the
app stays fast with hundreds of threads.

### 2. Provider → server: the canonical `ProviderRuntimeEvent` union

`packages/contracts/src/providerRuntime.ts` (1,214 lines). Every adapter, whatever its wire format,
emits this. **This is the single most valuable thing to copy.** Verbatim type list:

```ts
const ProviderRuntimeEventType = Schema.Literals([
  "session.started", "session.configured", "session.state.changed", "session.exited",
  "thread.started", "thread.state.changed", "thread.metadata.updated",
  "thread.token-usage.updated",
  "thread.realtime.started", "thread.realtime.item-added", "thread.realtime.audio.delta",
  "thread.realtime.error", "thread.realtime.closed",
  "turn.started", "turn.completed", "turn.aborted", "turn.plan.updated",
  "turn.proposed.delta", "turn.proposed.completed", "turn.diff.updated",
  "item.started", "item.updated", "item.completed",
  "content.delta",
  "request.opened", "request.resolved",
  "user-input.requested", "user-input.resolved",
  "task.started", "task.progress", "task.updated", "task.completed",
  "hook.started", "hook.progress", "hook.completed",
  "tool.progress", "tool.summary",
  "auth.status", "account.updated", "account.rate-limits.updated",
  "mcp.status.updated", "mcp.oauth.completed",
  "model.rerouted", "config.warning", "deprecation.notice", "files.persisted",
  "runtime.warning", "runtime.error",
]);
```

Supporting enums (all verbatim):

```ts
RuntimeSessionState  = "starting" | "ready" | "running" | "waiting" | "stopped" | "error"
RuntimeThreadState   = "active" | "idle" | "archived" | "closed" | "compacted" | "error"
RuntimeTurnState     = "completed" | "failed" | "interrupted" | "cancelled"
RuntimePlanStepStatus= "pending" | "inProgress" | "completed"
RuntimeItemStatus    = "inProgress" | "completed" | "failed" | "declined"
RuntimeSessionExitKind = "graceful" | "error"
RuntimeErrorClass    = "provider_error" | "transport_error" | "permission_error"
                     | "validation_error" | "unknown"

RuntimeContentStreamKind = "assistant_text" | "reasoning_text" | "reasoning_summary_text"
                         | "plan_text" | "command_output" | "file_change_output" | "unknown"

TOOL_LIFECYCLE_ITEM_TYPES = ["command_execution", "file_change", "mcp_tool_call",
  "dynamic_tool_call", "collab_agent_tool_call", "web_search", "image_view"]

CanonicalItemType = "user_message" | "assistant_message" | "reasoning" | "plan"
  | ...TOOL_LIFECYCLE_ITEM_TYPES
  | "review_entered" | "review_exited" | "context_compaction" | "error" | "unknown"

CanonicalRequestType = "command_execution_approval" | "file_read_approval"
  | "file_change_approval" | "apply_patch_approval" | "exec_command_approval"
  | "tool_user_input" | "dynamic_tool_call" | "auth_tokens_refresh" | "unknown"
```

Every event carries `ProviderRuntimeEventBase`:
`{ eventId, provider, providerInstanceId?, threadId, createdAt, turnId?, itemId?, ... }`
plus `providerRefs: { providerTurnId?, providerItemId?, providerRequestId? }` and an optional
`raw: RuntimeEventRaw { source, method?, messageType?, payload }` for debugging/replay.

---

## F. Git worktree isolation

Implementation: `apps/server/src/vcs/GitVcsDriverCore.ts`, contract in `vcs/VcsDriver.ts`.

**Branch naming** (`packages/shared/src/git.ts`):

```ts
export const WORKTREE_BRANCH_PREFIX = "t3code";
// Canonical auto-generated form: `t3code/<8 hex>`
// Legacy (older mobile builds): `t3code/<uuid v4>` — still matched for regeneration eligibility
```

Named/feature branches go through `sanitizeBranchFragment` (lowercase, strip quotes, collapse
separators, `[^a-z0-9/_-]` → `-`, max 64 chars, fallback `"update"`) and
`sanitizeFeatureBranchName` (prefixes `feature/` unless the name already has a namespace).
`resolveAutoFeatureBranchName` appends `-2`, `-3`, … on collision. Fallback:
`AUTO_FEATURE_BRANCH_FALLBACK = "feature/update"`.

**Worktree location and creation** (`createWorktree`, `GitVcsDriverCore.ts` ~line 2740):

```ts
const targetBranch    = input.newRefName ?? input.refName;
const sanitizedBranch = targetBranch.replace(/\//g, "-");     // slashes → dashes for the dir name
const repoName        = path.basename(input.cwd);
const worktreePath    = input.path ?? path.join(worktreesDir, repoName, sanitizedBranch);
const args = input.newRefName
  ? ["worktree", "add", "-b", input.newRefName, worktreePath, input.refName]
  : ["worktree", "add", worktreePath, input.refName];
```

So worktrees land at **`~/.t3/worktrees/<repoName>/<branch-with-dashes>/`**.

If a base ref is supplied, it also runs
`git config branch.<newRef>.gh-merge-base <baseBranch>` so `gh` knows the merge base.

Setting `newWorktreesStartFromOrigin` (server settings) controls whether new worktrees branch from
`origin/<default>` rather than the local ref.

**Per-project worktree bootstrap** — `t3.json` at the project root, e.g. this repo's own:

```json
{
  "$schema": "https://t3.codes/schema/t3.json",
  "iconPath": "assets/dev/blueprint-web-apple-touch-180.png",
  "scripts": [
    { "name": "Setup Worktree",
      "command": "vp i && ln -sf $T3CODE_PROJECT_ROOT/.env .env && ...",
      "icon": "configure",
      "runOnWorktreeCreate": true }
  ]
}
```

`$T3CODE_PROJECT_ROOT` is injected. `runOnWorktreeCreate: true` fires the script on worktree
creation. Scripts are also addressable as keybinding commands `script.{id}.run`.

Cleanup: RPC `vcs.removeWorktree`; UI helper `apps/web/src/worktreeCleanup.ts`
(`formatWorktreePathForDisplay`). A thread's effective cwd is
`thread.worktreePath ?? project.workspaceRoot` (`checkpointing/Utils.ts:resolveThreadWorkspaceCwd`).

**Checkpoints** are hidden git refs, not worktrees (`checkpointing/Utils.ts`):

```ts
export const CHECKPOINT_REFS_PREFIX = "refs/t3/checkpoints";
checkpointRefForThreadTurn(threadId, turnCount)
  => `refs/t3/checkpoints/${base64url(threadId)}/turn/${turnCount}`
```

There is also a `refs/t3code/pre-refresh` safety ref written before destructive refreshes.

---

## G. Git flow

### Stacked actions

`packages/contracts/src/git.ts`:

```ts
export const GitStackedAction = Schema.Literals([
  "commit", "push", "create_pr", "commit_push", "commit_push_pr",
]);
export const GitActionProgressPhase = Schema.Literals(["branch", "commit", "push", "pr"]);
export const GitActionProgressKind = Schema.Literals([
  "action_started", "phase_started", "hook_started", "hook_output",
  "hook_finished", "action_finished", "action_failed",
]);
```

Per-step statuses are explicit, which is what makes the UI honest:

```ts
GitCommitStepStatus = "created" | "skipped_no_changes" | "skipped_not_requested"
GitPushStepStatus   = "pushed"  | "skipped_not_requested" | "skipped_up_to_date"
GitBranchStepStatus = "created" | "skipped_not_requested"
GitPrStepStatus     = "created" | "opened_existing" | "skipped_not_requested"
```

Run via RPC `git.runStackedAction`; progress streams as `GitActionProgress` events including
**git hook stdout/stderr** (`hook_output`, `GitActionProgressStream = "stdout" | "stderr"`).
The result carries a `toast` with a CTA that can be `none` or `open_pr {label, url}`.

The UI's single primary button (`apps/web/src/components/GitActionsControl.logic.ts`) resolves
contextually to one of: `Commit`, `Commit & push`, `Push`, `Pull`, `Sync ref`,
`Publish repository`, or a disabled state with hint `"Git action in progress."`.

### Diff generation and review

- Diffs come from **checkpoints**, not from `git diff HEAD`: `CheckpointDiffQuery.ts` answers
  per-turn and full-thread diff requests; `Diffs.ts` parses patches; blobs cached in
  `checkpoint_diff_blobs`. RPC: `orchestration.getTurnDiff`, `orchestration.getFullThreadDiff`.
- Reviewing PR diffs uses `review.getDiffPreview` / `review.getDiffFileContents` and, for GitHub,
  `gh api graphql`.
- Rendering uses `@pierre/diffs` (patched) + shiki transformers.
- `diffIgnoreWhitespace` defaults to `true` in settings.

### Hosting providers (`apps/server/src/pullRequest/`)

| Provider | Mechanism | Auth |
| --- | --- | --- |
| GitHub | **`gh` CLI** (`GitHubPullRequestCli.ts`) — `gh pr list`, `gh repo view`, `gh api graphql --hostname <host> --input -`, `gh api user --jq .login` | `gh auth login` |
| GitLab | **`glab` CLI** (`GitLabPullRequestCli.ts`) | `glab auth login` |
| Bitbucket | **REST API** (`BitbucketPullRequestApi.ts`) | env: `T3CODE_BITBUCKET_ACCESS_TOKEN`, or `T3CODE_BITBUCKET_EMAIL` + `T3CODE_BITBUCKET_API_TOKEN` (access token wins) |
| Azure DevOps | **`az` CLI + azure-devops extension** (`AzureDevOpsPullRequestCli.ts`) | `az login` |

Capabilities beyond creation: list with stats, detail, activity feed, inline comments, submit
review, reply to review threads, resolve/unresolve threads, request reviewers (with candidate
lookup), and `git.preparePullRequestThread` which checks out a PR branch — mode `"local" | "worktree"`
— for local review. Fetching a PR head:
`git fetch --quiet --no-tags <remote> +refs/pull/<n>/head:refs/heads/<branch>`.

Also: **clone** any GitHub/GitLab/Bitbucket/Azure repo or raw Git URL from the command palette
("Add Project"), and **Publish Repository** (create remote + set origin + push) for a local repo
with no remote. If the local repo has no commits, publish wires the remote but does not push.

Commit messages, PR titles/descriptions, branch names and thread titles are **LLM-generated** via
the per-provider `textGeneration` capability, configurable through
`sourceControlWritingStyle { mode, customInstructions, followChangeRequestTemplates }` and
`sourceControlWriterModelSelection`.

**Conflict handling: UNVERIFIED.** I did not locate an explicit merge-conflict resolution UI;
`vcs.pull` and `git.runStackedAction` surface failures as typed errors/toasts.

---

## H. Permission modes

Four **runtime modes**, one **interaction mode** axis. `packages/contracts/src/orchestration.ts`:

```ts
export const RuntimeMode = Schema.Literals([
  "approval-required", "auto-accept-edits", "auto", "full-access",
]);
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";

export const ProviderInteractionMode = Schema.Literals(["default", "plan"]);
export const DEFAULT_PROVIDER_INTERACTION_MODE: ProviderInteractionMode = "default";
```

UI labels and copy (`apps/web/src/components/chat/ChatComposer.tsx`, `runtimeModeConfig`):

| Mode id | Label | Description | Icon (lucide) |
| --- | --- | --- | --- |
| `approval-required` | **Supervised** (mobile: "Approve actions") | "Ask before commands and file changes." | `LockIcon` |
| `auto-accept-edits` | **Auto-accept edits** | "Auto-approve edits, ask before other actions." | `PenLineIcon` |
| `auto` | **Auto** | "Supported providers approve routine actions; others still ask." | `SparklesIcon` |
| `full-access` | **Full access** (default) | "Allow commands and edits without prompts." | `LockOpenIcon` |

Mode is **per thread**, set from the composer. A thread created from inside another thread inherits
that thread's mode; otherwise new threads start in **Full access**.

### Per-provider mapping — verbatim

**Codex** (`apps/server/src/provider/Layers/CodexSessionRuntime.ts`, `runtimeModeToThreadConfig`):

```ts
"approval-required" → { approvalPolicy: "untrusted",  sandbox: "read-only",          approvalsReviewer: "user" }
"auto-accept-edits" → { approvalPolicy: "on-request", sandbox: "workspace-write",    approvalsReviewer: "user" }
"auto"              → { approvalPolicy: "on-request", sandbox: "workspace-write",    approvalsReviewer: "auto_review" }
"full-access"       → { approvalPolicy: "never",      sandbox: "danger-full-access", approvalsReviewer: "user" }
```
`approvalsReviewer` is **always sent explicitly** — omitting it on resume keeps the previous
reviewer, leaving `auto_review` sticky after a mode switch. Per-turn sandbox policy mirrors this:
`readOnly` / `workspaceWrite` / `workspaceWrite` / `dangerFullAccess`.

**Claude** (`Layers/ClaudeAdapter.ts` ~line 4081):

```ts
const runtimeModeToPermission: Record<string, PermissionMode> = {
  "auto-accept-edits": "acceptEdits",
  auto: "auto",
  "full-access": "bypassPermissions",
};
// note: "approval-required" is deliberately absent → no permissionMode set → SDK default prompting
// and when permissionMode === "bypassPermissions": allowDangerouslySkipPermissions: true
```

**Cursor / Grok (ACP):** the mode is mapped onto the agent's own ACP session modes by alias
matching (`ACP_PLAN_MODE_ALIASES`, `ACP_APPROVAL_MODE_ALIASES`, `ACP_IMPLEMENT_MODE_ALIASES`) via
`session/set_mode`. `interactionMode === "plan"` always wins and selects the plan-ish mode;
`approval-required` prefers an approval mode, falling back to implement, then any non-plan mode,
then the current mode.

**OpenCode** (`provider/opencodeRuntime.ts`, `buildOpenCodePermissionRules`):

```ts
full-access → [{ permission: "*", pattern: "*", action: "allow" }]
otherwise   → everything "ask": *, bash, edit, webfetch, websearch, codesearch,
              external_directory, doom_loop; except question → "allow"
```
i.e. OpenCode has no auto-accept-edits equivalent — it degrades to Supervised.

Approval decisions (`ProviderApprovalDecision`): `accept | acceptForSession | decline | cancel`.
OpenCode maps them to `once | always | reject | reject`.

Approvals render **inline in the conversation**; approve/reject and the agent continues.

---

## I. Remote access

Three axes: local, LAN/Tailscale direct, and the T3 Connect relay. Docs:
`docs/user/remote-access.md`, `docs/internals/remote.md`, `docs/internals/t3-connect.md`,
`docs/internals/environment-auth.md`, `docs/internals/connection-runtime.md`.

### Server surface

- One HTTP server, default port **3773**, `--host` selects the bind address.
- `GET /ws` — the single authenticated Effect RPC WebSocket.
- Also serves `/api`, `/oauth`, `/.well-known`, and the built web app.
- Dev is **single-origin**; Vite proxies `/api`, `/ws`, `/oauth`, `/.well-known`. `AGENTS.md`
  explicitly forbids baking `VITE_HTTP_URL` / `VITE_WS_URL`.

### Pairing (the auth model)

1. `t3 serve` (or `t3 pair` against a running server) issues a **one-time owner pairing token**.
2. The remote device exchanges the token with the server.
3. The server creates an **authenticated session** for that device; future access is session-based.

The CLI prints a connection string, pairing token, pairing URL, **and a QR code**. Hosted pairing
URL format:

```
https://app.t3.codes/pair?host=https://backend.example.com:3773#token=PAIRCODE
```

The token lives in the URL **hash** so it is never sent to the hosted app server; the browser then
connects **directly** to the backend. Hosted pairing does not proxy traffic. Plain-HTTP LAN URLs
cannot be used from the HTTPS hosted app (mixed content).

CLI: `t3 pair [--tailscale] [--tailscale-serve-port N] [--ttl …] [--base-dir …]`,
`t3 auth pairing create|list|revoke`, `t3 auth session issue|list|revoke`,
`t3 serve [--host] [--tailscale-serve]`, `t3 start`, `t3 project add|remove|rename`,
`t3 service install|update|uninstall|status` (Linux background service),
`t3 connect login|link|status|publish|unlink|logout`.

### Scopes (`packages/contracts/src/auth.ts`) — per-RPC-method enforcement

```ts
"orchestration:read" | "orchestration:operate" | "terminal:operate" | "review:write"
| "access:read" | "access:write" | "relay:read" | "relay:write"
```
Standard pairing links carry the first group; the startup URL carries **admin** scopes
(`access:read`, `access:write`, `relay:write`) needed for Settings → Connections management.
Pairing links use a **DPoP-style proof key thumbprint** (migration `032_AuthPairingProofKeyThumbprint`,
DPoP helpers in `packages/shared`).

### Transports

1. **Desktop app as host** — Settings → Connections → *Network access* toggle restarts the backend
   bound to all interfaces; endpoint list shows loopback / LAN / private / HTTPS / Tailnet options
   with a `+N` expander; "Create Link" mints a pairing link. Default endpoint preference is stored
   **by endpoint type** so it survives IP changes.
2. **Tailscale** (`packages/tailscale`) — adds `100.x.y.z`, MagicDNS, and (opt-in)
   `tailscale serve` HTTPS at `https://machine.tailnet.ts.net/` (default port 443, configurable).
   Server-side lifecycle: `ensureTailscaleServe` / `disableTailscaleServe`.
3. **Headless CLI** — `npx t3 serve --host "$(tailscale ip -4)"`.
4. **Desktop-managed SSH launch** (`packages/ssh`) — desktop probes the host over a
   non-interactive `sh` session, writes a launcher under `~/.t3/ssh-launch/<host-key>/`, starts or
   reuses a remote `t3` server, and opens a **local port forward**; the renderer then talks to the
   forwarded loopback endpoint. Handles Volta/asdf/mise/fnm/nodenv/nvm discovery for `node`.
5. **T3 Connect** (`infra/relay`, `t3code-relay`, deployed with Alchemy) — the hosted tunnel.
   Handles environment discovery, cloud-side records, and **mobile push notifications**. Explicitly
   **not in the hot path**: after connect, client traffic goes directly to the environment.

Version skew between client and server is detected and surfaced both above the composer and in
Settings → Connections, with a "Update server" / "Update the desktop app" / "Copy update command"
action (`apps/web/src/versionSkew.ts`, `docs/internals/server-updates.md`).

---

## J. UI/UX patterns worth mirroring

Full detail is in `T3CODE-UI-SPEC.md`. Summary of the load-bearing ideas:

- **Three regions:** left thread sidebar (resizable, 208–?px, default 256px), center chat column,
  optional right panel (tabbed: Diff, Files, Terminal, Browser/Preview, Pull Request, Agents).
- **Sidebar is project-grouped, thread-flat.** Projects are collapsible headers with a favicon;
  threads are rows with a colored status dot + status word + truncated title + relative timestamp.
  Pinned threads float to a section above, drag-reorderable, order synced server-side.
- **Status pills** (`Sidebar.logic.ts`) with an explicit priority ordering — see spec.
- **Inbox-zero semantics:** threads can be *settled*, *snoozed* (with unsnooze), *archived*,
  *pinned*. `AGENTS.md` rule: "If you added a way in, add the way out and the way to see it.
  A one-way door is a bug."
- **Composer as the control surface.** Model picker, reasoning-effort picker, interaction mode
  (Build/Plan), permission mode, attachments, `@` file mentions, `/` slash commands, prompt stash,
  a context-window meter ring, and send/stop as one morphing button.
- **Tool calls collapse into grouped cards** ("TOOL CALLS (3)") rather than streaming raw output.
- **Changed-files card per turn**, inline in the timeline: "N changed files +31/−17", expandable
  tree with per-file/per-folder stats and a "View diff" affordance that opens the right panel.
- **Command palette** (`⌘K`) searches thread titles, projects, branches, user messages and final
  agent responses **across connected environments**, with a labeled excerpt per message match.
- **No continuously repainting animations.** All indicator animations are *duty-cycled* with
  stepped keyframes (`--animate-status-pulse: status-pulse 2s infinite`, `ghost-pulse 2.4s`,
  `skeleton 2s linear` transform-only) precisely so a 120 Hz display gets ~14 frames per cycle
  instead of ~288. This is an explicit product rule in `AGENTS.md`.

### Visual design

Tailwind v4, token-driven, both themes defined in `apps/web/src/index.css` (2,155 lines).

- Light canvas is `--color-zinc-25` (`oklch(99.2% 0 0)`), text `zinc-800`, cards white, borders
  `zinc-200`. Dark canvas is `neutral-950`, text `neutral-100`, surfaces lifted by mixing white
  into the base (`card = mix(bg 97%, white)`, `popover = mix(bg 94%, white)`), borders
  `white/6%`, inputs `white/8%`.
- **The sidebar has its own palette scope** (`[data-app-sidebar]`) — in dark mode it goes to pure
  `#000` with `--accent: #191a1d`, so the sidebar reads *darker* than the chat canvas.
- Primary accent is blue: `oklch(0.488 0.217 264)` light / `oklch(0.571 0.21 264)` dark.
- Semantic roles: error(red-500), warning(amber-500), success(emerald-500), info(blue-500),
  update(primary), each with a `-foreground` and an 8%/16% `-surface` tint.
- Radius scale from `--radius: 0.625rem` (10px): sm 6, md 8, lg 10, xl 14, 2xl 18, 3xl 22, 4xl 26.
  Compact controls use `--control-radius: 0.5rem`; the composer shell is `rounded-[22px]`.
- Glass/blur tokens: `--glass-blur: 12px` light / `16px` dark, `--glass-opacity: 80%`,
  `--glass-saturation: 1.14 / 1.08`. Used for the composer and floating chips.
- Typography: system stacks. Sans `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
  sans-serif`; mono `"SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace`
  (concrete names first — `ui-monospace` aliases to a proportional font on some engines).
  Defaults: interface 16px (12–?), prompt 14px (12–20), code 13px (10–18), terminal 12px (8–20).
- Icons: **lucide-react** throughout, plus a JetBrains icon set and Pierre icons for diff/file types.
- Density is compact: sidebar rows ~28–32px, icon buttons `size-icon-xs` (~22px),
  `--sidebar-content-inset: 0.5rem`, `--sidebar-row-content-inset: 0.625rem`,
  `--workspace-topbar-height: 52px`.
- Full theme customization: `themePalette.ts` (1,803 lines) defines theme files in app color roles;
  there is a **live theme editor** (`themeEditor.toggle`, default `mod+alt+shift+t`) with an
  element **Inspect** picker that reveals the color token behind any element, and a
  **VS Code theme importer** (`vscodeThemeImport.ts`).

---

## K. Config / settings

Three separate stores.

**1. Server settings** — `~/.t3/userdata/settings.json`, schema `packages/contracts/src/settings.ts`
(806 lines), read/written over RPC `server.getSettings` / `server.updateSettings` (patch-based).
Selected fields:

- Appearance: `glassOpacity` (default 80), `fontSizeInterface` 16, `fontSizePrompt` 14,
  `fontSizeCode` 13, `fontSizeTerminal` 12, `fontFamily{Sans,Code,Composer,Terminal}`,
  `fontSmoothing` true, `timestampFormat`, `wordWrap` true, `environmentIdentificationMode`
  (`artwork | pill | none`, default `artwork`).
- Sidebar: `legacySidebarEnabled`, `sidebarProjectGroupingMode` + `…Overrides`,
  `sidebarProjectSortOrder`, `sidebarThreadSortOrder`, `sidebarThreadPreviewCount`,
  `sidebarAutoSettleAfterDays`.
- Behavior: `confirmThreadArchive` (false), `confirmThreadDelete` (true), `diffIgnoreWhitespace`
  (true), `planModeEnabled` (false), `defaultThreadEnvMode`, `newWorktreesStartFromOrigin`,
  `addProjectBaseDirectory`, `favorites`, `providerModelPreferences`.
- Generation: `textGenerationModelSelection`, `sourceControlWriterModelSelection`,
  `sourceControlWritingStyle { mode, customInstructions, followChangeRequestTemplates }`.
- Ops: `automaticGitFetchInterval`, `providerHealthRefreshInterval`, `enableProviderUpdateChecks`,
  `enableLegacyTokenStreaming`, `observability { otlpTracesUrl, otlpMetricsUrl }`,
  `backgroundActivity { profile, overrides: { pauseWhenHostLocked, pauseWhenOnBattery,
  pauseWhenClientLowPower, idleClientTtl, … } }`.
- Providers: `providers { … }` plus `providerInstances: Record<ProviderInstanceId,
  ProviderInstanceConfig>`. Per-instance config fields vary by driver but commonly include
  `enabled`, `binaryPath`, `homePath`, `shadowHomePath`, `launchArgs`, `customModels`,
  `apiEndpoint`, plus `displayName`, `accentColor`, `environment` (env var overrides).

**2. Keybindings** — `~/.t3/userdata/keybindings.json`, a JSON array of rules:

```json
[
  { "key": "mod+g", "command": "terminal.toggle" },
  { "key": "mod+shift+g", "command": "terminal.new", "when": "terminalFocus" }
]
```
`key` supports `mod` (cmd on macOS, ctrl elsewhere), `cmd`/`meta`, `ctrl`/`control`, `shift`,
`alt`/`option`. `when` is a boolean expression over context keys — currently `terminalFocus`,
`terminalOpen`, `previewFocus`, `previewOpen`, `modelPickerOpen` (open set; unknown keys are false)
— with `!`, `&&`, `||`, parentheses. **Precedence: last matching rule wins, across commands**, so a
later rule for a different command can steal a key. Invalid rules are ignored; an invalid file is
ignored entirely with a logged warning. Defaults are written on first run and new defaults merged
on later startups unless a user rule already claims the command or the shortcut.

Known command IDs / defaults (from `docs/user/keybindings.md`): `terminal.toggle` (`mod+g`),
`terminal.new`, `commandPalette.toggle`, `preview.refresh`, `chat.new`, `chat.newLocal`,
`sidebar.toggle`, `filePicker.toggle` (`mod+p`), `projectSearch.toggle` (`mod+shift+f`),
`themeEditor.toggle` (`mod+alt+shift+t`), `preview.toggle/focusUrl/zoomIn/zoomOut/resetZoom`,
`script.{id}.run`. **The authoritative list is Settings → Keybindings**, which always matches the
running build. Command palette default is `⌘K` / `Ctrl+K`.

**3. Per-project `t3.json`** — checked into the repo, schema `https://t3.codes/schema/t3.json`:
`iconPath` (project favicon) and `scripts[] { name, command, icon, runOnWorktreeCreate }`.

**Env vars observed:** `T3CODE_HOME`, `T3CODE_PROJECT_ROOT`, `T3CODE_CODEX_LAUNCH_ARGS`,
`T3CODE_BITBUCKET_ACCESS_TOKEN`, `T3CODE_BITBUCKET_EMAIL`, `T3CODE_BITBUCKET_API_TOKEN`.

---

## L. Prioritized "what to mirror"

### MUST-HAVE core (in build order)

1. **Server-owns-everything boundary.** Every provider process, terminal, git op and filesystem read
   happens on the server; the client only renders. Do not let the UI shell out. This is what makes
   remote/mobile work at all — and Ornight Plus is explicitly a mini-tablet target.
2. **A single typed RPC WebSocket with per-method authorization**, and **subscription-scoped
   streams** rather than a broadcast bus. Copy the shell-vs-thread subscription split
   (`subscribeShell` cheap for the list, `subscribeThread` expensive for the open conversation).
3. **The canonical `ProviderRuntimeEvent` union** (section E). Normalize every provider into it at
   the adapter boundary. This single decision is why the UI code has no provider conditionals.
4. **The `ProviderAdapterShape` interface** (section D, verbatim) with a driver/instance registry
   split. Start with one or two providers; the shape is what matters.
5. **Thread / turn / project domain model** with SQLite persistence. Event sourcing with a pure
   decider is ideal but the *minimum* is: totally-ordered command processing, a single transaction
   covering persist+project, and idempotent command receipts.
6. **Four runtime modes + plan/default interaction mode**, with the per-provider mapping tables from
   section H copied verbatim. Default to `full-access`.
7. **Git worktree isolation**: `t3code/<8hex>` branches, worktrees at
   `<home>/worktrees/<repo>/<branch-dashed>/`, thread cwd = `worktreePath ?? workspaceRoot`.
8. **Checkpoint-per-turn as hidden git refs** (`refs/t3/checkpoints/<b64url(threadId)>/turn/<n>`) →
   exact per-turn diffs and revert. This is strictly better than diffing HEAD and is the backbone of
   the changed-files card and the revert affordance.
9. **Inline approvals** in the timeline with accept / acceptForSession / decline / cancel.
10. **Pairing-token → session auth** with the token in a URL hash plus a QR code. Scopes per method.
11. **The three-region layout, composer control cluster, and status-pill vocabulary** (see UI spec).
12. **Interrupt.** `thread.turn.interrupt` and a send-button that morphs into a stop button.

### HIGH VALUE, second wave

13. Command palette with cross-environment search over threads, projects, branches, **and message
    bodies** (SQLite ASCII case-insensitive, min 2 chars).
14. Right panel as tabs (Diff / Files / Terminal / Preview / PR / Agents) with per-thread state.
15. Stacked git actions (`commit_push_pr`) with phase progress and hook output streaming, plus
    LLM-generated commit/PR/branch/title text.
16. Keybindings file with `when` expressions and a Settings page that is the source of truth.
17. Pin / snooze / settle / archive with symmetric reverse actions, order synced server-side.
18. Terminal panel (`node-pty` server-side, streamed over the same socket).
19. Multi-instance providers (two Codex accounts, two Claude accounts).
20. Theming: full token system, theme editor with element inspect, VS Code theme import.

### NICE TO HAVE

21. T3 Connect relay / Tailscale integration / SSH-launched remote environments.
22. Preview (in-app browser) + preview automation.
23. Resource telemetry (Rust monitor), observability/OTLP export.
24. Project scripts with `runOnWorktreeCreate`.
25. MCP server exposed back to the agent.
26. Mobile app, marketing site, background service installer, self-update.

### Explicitly worth copying as *rules*, not features

- No continuously repainting animations; duty-cycle every indicator.
- Every feature must be reachable from chat view **and** Settings **and** the command palette
  **and** a keybinding — "fixing one is not fixing the feature".
- Every "way in" needs a "way out" and a "way to see it".
- Complexity belongs at the adapter boundary; orchestration stays pure; UI stays dumb.

---

## Gaps / UNVERIFIED

- **Gemini is not supported** in this build. Only Codex, Claude, Cursor, Grok, OpenCode.
- Release tags/versions: the shallow clone carried no tags; the version in `package.json` is
  `0.0.33`. The GitHub Releases list was not retrievable from this session (repo not authorized for
  the GitHub MCP tool). **Latest release tag: UNVERIFIED.**
- Merge-conflict resolution UX: **UNVERIFIED**.
- The complete default keybinding table: **UNVERIFIED** — `DEFAULT_KEYBINDINGS` is imported by
  `apps/server/src/keybindings.ts` from `@t3tools/contracts`, but I did not enumerate every entry.
  Treat Settings → Keybindings as authoritative; the defaults named in `docs/user/keybindings.md`
  are confirmed.
- Exact pixel metrics for regions not covered by a constant were measured off the two in-repo
  screenshots and are marked *approximate* in the UI spec.
