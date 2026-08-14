# Ornight Plus — architecture

For someone about to contribute. This explains where the seams are and *why* they are there.
`docs/CONTRACTS.md` fixes the interfaces between agents; this file explains the reasoning behind
them. `docs/PARITY.md` scores the result against T3 Code.

Throughout, comparisons cite real paths in `reference/t3code/`, which is a read-only copy of
[T3 Code](https://github.com/pingdotgg/t3code) kept for study. Ornight is a reimplementation of its
ideas, not a fork.

---

## The one-paragraph version

A daemon on your development machine owns everything real: agent processes, the filesystem, git.
Clients own nothing but pixels. Between them sits a single discriminated-union protocol carried as
newline-delimited JSON over one WebSocket. The client folds every inbound event into one zustand
store and sends every gesture back out as a command. Because that seam is an interface rather than a
socket, an in-memory simulator can stand in for the daemon and the UI cannot tell.

```
┌───────────────────────────────────────────────┐
│ apps/tablet · apps/desktop                    │
│   store (fold ServerEvent) → selectors → UI   │
│   UI → dispatch(ClientCommand) → transport    │
└───────────────────┬───────────────────────────┘
                    │  Transport  ← the seam
        ┌───────────┴───────────┐
   WebSocketTransport      DemoTransport
   (newline JSON /ws)      (in-memory, offline)
        │
┌───────▼───────────────────────────────────────┐
│ apps/server — the daemon                      │
│   pairing · thread store · worktrees · git    │
│   provider adapters (spawn + normalise)       │
└───────┬───────────────────────────────────────┘
        │ stdio / CLI flags
┌───────▼───────────────────────────────────────┐
│ claude · codex · cursor-agent · grok ·        │
│ opencode · gemini                             │
└───────────────────────────────────────────────┘
```

**Status:** the client half and the protocol are built. The daemon (`apps/server`) and the provider
adapters are not yet written. The README's status table is authoritative.

---

## 1. The protocol is the single contract

`packages/protocol/src/index.ts` (≈510 lines) defines every domain type, both message unions, and
the `Transport` interface. It **imports nothing from the workspace**. That constraint is what makes
it usable as a contract: five agents can build against it in parallel without a dependency cycle or
a merge conflict.

Two unions carry everything:

```ts
export type ClientCommand =
  | { type: 'hello'; token: string | null; client: 'tablet' | 'desktop' }
  | { type: 'thread.create'; workspaceId; provider; model; permissionMode; title?; prompt? }
  | { type: 'thread.send'; threadId; text; attachments? }
  | { type: 'permission.decide'; requestId; decision }
  | { type: 'ship'; request: ShipRequest }
  | ...

export type ServerEvent =
  | { type: 'ready'; snapshot: Snapshot }
  | { type: 'message.delta'; threadId; messageId; text }
  | { type: 'tool.updated'; threadId; call: ToolCall }
  | { type: 'permission.requested'; request: PermissionRequest }
  | { type: 'git.state'; state: GitState }
  | ...
```

Both are fully discriminated on `type`, so a `switch` over either is exhaustive and the compiler
enforces it. Add a variant and every incomplete handler in the repo becomes a type error. That is
the intended failure mode: the contract change surfaces at compile time, not at runtime on a tablet.

The wire format is deliberately dull — one JSON object per line, `\n`-delimited, so a frame can
carry a batch and a reader can resynchronise on any newline.

### Compared to T3 Code

T3 Code puts far more machinery here, and for good reasons at their scale:

| | T3 Code | Ornight |
| --- | --- | --- |
| Contract | Effect `Schema` (`reference/t3code/packages/contracts/`, ~18k lines) | Plain TypeScript unions (~770 lines) |
| Transport | Effect RPC over WebSocket, `RpcServer.toHttpEffectWebsocket` | Newline JSON over WebSocket |
| Authorization | **Per method.** `RPC_REQUIRED_SCOPE` maps each of ~90 methods to one of eight scopes (`orchestration:read`, `terminal:operate`, `access:write`, …), enforced per call | Single pairing token at `hello`. Connection-level, not method-level |
| Streaming | **Subscription-scoped.** Clients subscribe to what they need; `subscribeShell` feeds the cheap thread list, `subscribeThread` the expensive open conversation | One broadcast stream per connection |
| Validation | Schema decode on both ends | `JSON.parse` plus the type system |

What we gave up and why:

- **Per-method scopes.** T3 Code needs them because a pairing link can be minted with reduced
  authority — a phone that can drive threads but cannot manage connections. Ornight has one class of
  client on one trusted LAN, so a connection-level token is proportionate. This is the change most
  likely to need revisiting, and the place to start is `hello`.
- **Runtime schema validation.** We trust the daemon because we shipped it and it is on localhost.
  A malformed frame is skipped, not rejected loudly. If Ornight ever accepts connections it did not
  originate, this must change first.
- **Subscription scoping.** T3 Code's split exists because sending full thread contents to a sidebar
  showing 200 threads is exactly the kind of regression `reference/t3code/AGENTS.md` calls out by
  name. Ornight will hit the same wall; the fix is already shaped, because `Snapshot` carries
  `Thread` records with a `preview` string and a `stats` counter block precisely so the list can
  render without loading messages, and `thread.history` is a separate event.

---

## 2. The `Transport` seam

```ts
export interface Transport {
  readonly state: ConnectionState;   // connecting | connected | reconnecting | offline | demo
  send(command: ClientCommand): void;
  subscribe(listener: (event: ServerEvent) => void): () => void;
  onStateChange(listener: (state: ConnectionState) => void): () => void;
  close(): void;
}
```

Five methods. Two implementations.

**`WebSocketTransport`** (`apps/tablet/src/state/wsTransport.ts`) talks to a real daemon. It
reconnects with exponential backoff capped at 15 s, heartbeats every 20 s, and **buffers commands
issued while the socket is down** — a tablet that sleeps mid-turn wakes and catches up rather than
dropping your input. `resolveDaemonUrl()` picks the target: explicit `?daemon=` (persisted), then
`localStorage`, then the serving origin; `null` when none applies, which means demo mode.

**`DemoTransport`** (`apps/tablet/src/mock/demoTransport.ts`, ~580 lines) is an in-memory daemon. It
implements the same interface, emits the same events, and defers every reply by a tick so it
behaves asynchronously the way a socket does — synchronous replies would mask ordering bugs.

This is the highest-leverage decision in the codebase, so it is worth being precise about what it
buys:

1. **The demo runs the real code paths.** Not a mock UI with fake components — the real store, the
   real reducer, the real selectors, the real rendering. A parallel mock UI drifts from the product
   within a week; this cannot, because there is only one UI.
2. **The client is buildable before the daemon exists.** Which is the situation right now: four
   agents are building UI against a daemon that has not been written.
3. **The published artifact works.** `npm run build:single` inlines every asset into one HTML file
   with `__ORNIGHT_SINGLE_FILE__` true, so `resolveDaemonUrl()` returns `null` and the file opens
   into a working demo from a filesystem, with no network.
4. **It is a test harness.** Deterministic scripted event sequences against real UI.

The rule that keeps it honest: **no component may import `DemoTransport`, `WebSocketTransport`, or
anything with `mock` in the path.** UI reaches the world through the store, and the store holds a
`Transport`. Violating this is what turns a demo mode into a lie.

T3 Code has no equivalent seam — their client always talks to a real server, and they test with a
seeded SQLite database copied from live state (`reference/t3code/AGENTS.md`, "Test data"). That is a
reasonable trade when the server already exists; ours is better when it does not, and better for
publishing.

---

## 3. Event folding in the store

`apps/tablet/src/state/store.ts` is one zustand store with a strict shape: **every server event
folds in through `ingest`, every user gesture leaves through `dispatch`.** Components never touch a
socket.

```ts
attach(transport)   // bind, subscribe, mirror connection state
ingest(event)       // ServerEvent → new state
dispatch(command)   // ClientCommand → transport.send
```

State splits into three bands, and the split is load-bearing:

- **connection** — `connection`, `transport`, `protocolError`
- **domain** — `workspaces`, `threads` (keyed) + `threadOrder`, `messages` per thread, `git`, `ship`,
  `pendingPermissions`, `providers`, `providerStatus`
- **ui** — `panel`, `sidebarOpen`, `drafts`, `focusedFile`, `showReasoning`, `reducedGlass`

Domain state is only ever written by `ingest`. UI state is only ever written by UI actions. Nothing
in the domain band survives a reconnect on its own authority — `{ type: 'ready', snapshot }` replaces
it wholesale. That is what makes reconnection trivial: there is no merge, only a swap.

Threads are stored keyed with a separate `threadOrder` array so a reorder is one array write rather
than a re-sort of a record. Messages are per-thread arrays because `message.delta` appends to the
last text part of a known message id — an O(1) tail mutation, not a scan.

### Streaming

Three events cover a streamed assistant turn: `message.started` inserts a message with
`streaming: true`, `message.delta` appends text to its last text part, `message.completed` replaces
it with the final message and clears the flag. Reasoning arrives on its own channel
(`message.reasoning`) and lands in a `ReasoningPart` that is **collapsed by default** — the operator
expands it deliberately.

### Compared to T3 Code

They are event-sourced *on the server*, which we are not, and the difference is instructive.

`reference/t3code/apps/server/src/orchestration/Layers/OrchestrationEngine.ts`: clients dispatch
commands, a single worker fiber takes them one at a time (so command processing is totally ordered),
a **pure decider** (`orchestration/decider.ts`) turns command plus current state into events, and
then — inside one SQL transaction — events are appended to the log, applied to an in-memory read
model, projected into tables, and a command receipt is written. Only after commit does the new read
model swap in.

That buys them properties we do not have:

- **The read model cannot durably disagree with the log**, because persist and project share a
  transaction.
- **Idempotent retries**, via durable command receipts.
- **Reconciliation after a failed dispatch** — reread events past the starting sequence and rebuild.
- **Replay**, and therefore per-turn checkpoint diffs (§6).

Ornight persists **append-only JSONL**, one file per thread under `~/.ornight/messages/<id>.jsonl`,
with a thread index in `threads.json` (`packages/core/src/paths.ts`). Appending a line is atomic
enough for our purposes and the file is greppable by a human at 3 a.m., which has real value in a
young project. What we lose: no decider, so ordering guarantees live in the daemon's own discipline
rather than in the architecture; no receipts, so a retried command can double-apply; no replay.

`packages/core/src/util/atomic.ts` and `util/lines.ts` exist to make the JSONL path safe — atomic
whole-file writes for the indexes, line-oriented reads for the logs. If Ornight ever needs
multi-writer safety or replay, the honest move is to adopt their model rather than patch ours.

---

## 4. The adapter layer

An adapter's job: **spawn one agent CLI, translate its native output into the protocol's normalised
shapes, and translate our permission mode into its flags.** Nothing else. Everything above the
adapter is provider-agnostic; every provider-shaped conditional belongs below it.

The normalisation targets are already defined:

```ts
export interface ToolCall {
  id; threadId;
  name: string;        // provider-native, e.g. `Bash`, `shell`, `apply_patch`
  category: ToolCategory;   // read | edit | shell | search | web | task | todo | other
  title; target; input;
  output: string | null;
  status: ToolStatus;  // pending | awaiting-permission | running | ok | error | denied
  patch: FilePatch | null;   // set when category is 'edit'
  startedAt; endedAt; exitCode;
}
```

Because `category` is normalised, the UI picks a card from a closed set and renders Claude's `Bash`
and Codex's `shell` identically. `name` is retained so the card can still show what the agent
actually called.

The registry is **data, not code** (`packages/protocol/src/providers.ts`). Each descriptor declares
its command, accent colour, glyph, model list, `permissionModes` it genuinely supports,
`supportsResume` and `supportsStreaming`. UI reads those flags instead of assuming — Grok declares
`supportsResume: false` and Cursor omits `plan` from its modes, and the pickers honour both.

Adding a provider is one registry entry plus one adapter file.

### Compared to T3 Code

Same instinct, more rigour. Their `ProviderAdapterShape<TError>`
(`reference/t3code/apps/server/src/provider/Services/ProviderAdapter.ts`) is a 13-method interface
with a `capabilities` block, `readThread`, `rollbackThread(threadId, numTurns)` and a
`Stream.Stream<ProviderRuntimeEvent>`. Their canonical event union
(`packages/contracts/src/providerRuntime.ts`) has **48 event types** against our ~20, covering
realtime audio, MCP status, hooks, rate limits, model rerouting and deprecation notices.

They also do not use one transport. Codex is `codex app-server` JSON-RPC; Claude is the
`@anthropic-ai/claude-agent-sdk` in-process; Cursor and Grok speak ACP; OpenCode uses
`@opencode-ai/sdk`. Their `RuntimeEventRawSource` enumerates all of it. Ornight assumes
spawn-and-parse across the board, which is the simplest thing that can work and is very likely
wrong for at least Claude and Codex — expect the adapter interface to grow a transport notion.

Their two-level registry (configured `ProviderInstanceRegistry` → live `ProviderAdapterRegistry`) is
what lets a user run two Codex accounts at once with separate `CODEX_HOME`s. Ornight has one
instance per provider. That is a real feature gap, not a simplification we chose on merit.

---

## 5. Worktree isolation

Every thread runs in its own git worktree, created lazily on the thread's first mutating turn.

```ts
export interface WorktreeInfo {
  path: string;
  branch: string;
  baseBranch: string;
  baseCommit: string;
  createdAt: number;
  active: boolean;   // false once merged back or discarded
}
```

Three things follow from this, and the third is the important one:

1. Concurrent agents in one repository never contend for the index.
2. Every thread has a stable base commit, so "what did this thread change" is a well-defined
   question without any extra bookkeeping.
3. **`full-access` becomes defensible.** The mode's own hint says so:
   `'Nothing asks. Worktree isolates.'` Isolation is the safety net that makes the permissive
   default honest, rather than a shrug.

`packages/core/src/git.ts` is the whole git surface: `GitService` wraps `execFile('git', [...])`
with **no shell, ever** — so a branch name containing a semicolon is data, not a command — and every
call is scoped to one working directory via `cwd`, which is exactly what makes per-thread worktrees
safe to drive concurrently. `at(dir)` returns a service bound to a different working directory in
the same repository. Missing-remote and empty-repo cases return nulls rather than throwing.

Fallback worktree root is `~/.ornight/worktrees/<repo>/<id>` when the repository itself is not
writable.

### Compared to T3 Code

Same architecture, and we should adopt their naming discipline. Theirs
(`reference/t3code/packages/shared/src/git.ts`, `apps/server/src/vcs/GitVcsDriverCore.ts`):

- branch prefix `t3code/`, canonical auto-generated form `t3code/<8 hex>`;
- worktrees at `~/.t3/worktrees/<repoName>/<branch-with-slashes-turned-to-dashes>/`;
- `sanitizeBranchFragment` — lowercase, strip quotes, collapse separators, 64-char cap, fallback
  `"update"`;
- `resolveAutoFeatureBranchName` appends `-2`, `-3` on collision;
- and they set `git config branch.<new>.gh-merge-base <base>` at creation, so `gh` computes the
  right merge base later.

That last one is a small detail with real downstream value, and it is free.

---

## 6. Diffs: what we do, and what we gave up

Ornight computes diffs with `git diff` against the thread's base, in `GitService.diffFiles()`, and
splits the result per file via `splitMultiFileDiff` from `@ornight/protocol/diff`. Untracked files
are included through a `--no-index` path normalised back into ordinary patch headers; binaries get a
stub. The result is `FilePatch[]` — path, kind, insertion/deletion counts, unified body, `staged`
flag — which is what `GitState` carries and the review panel renders.

**T3 Code does something better.** Each turn is bracketed by workspace checkpoints stored as hidden
git refs (`reference/t3code/apps/server/src/checkpointing/`):

```
refs/t3/checkpoints/<base64url(threadId)>/turn/<turnCount>
```

`CheckpointStore` captures them, `CheckpointDiffQuery` answers per-turn and full-thread diff
requests, `CheckpointReactor` coordinates baseline capture, completion capture, and reverting **both
the workspace and the provider conversation** — the latter via the adapter's
`rollbackThread(threadId, numTurns)`.

What that gives them and we lack:

- a diff scoped to *one turn*, not the whole thread;
- revert to any mid-thread point, with the agent's own conversation rolled back in step, so the
  agent does not believe in files that no longer exist;
- exactness that does not depend on the working tree's current state.

This is the single largest capability gap. Closing it needs the hidden-ref scheme and an adapter
`rollbackThread` — both well-defined, neither cheap.

---

## 7. The permission model

Four modes, declared once, spoken by the whole UI:

```ts
export type PermissionMode = 'plan' | 'ask' | 'auto-edit' | 'full-access';
```

| Mode | Hint shown to the operator |
| --- | --- |
| `plan` | Read and think. No writes. |
| `ask` | Confirm every edit and command. |
| `auto-edit` | Edits apply. Commands ask. |
| `full-access` | Nothing asks. Worktree isolates. |

**The UI only ever speaks these four.** Each adapter maps them onto whatever its CLI understands,
and a provider that cannot express a mode omits it from its `permissionModes` array so the control
never offers it. Cursor, Grok and Gemini omit `plan`.

A request that needs a decision arrives as `permission.requested` carrying tool, title, detail, a
unified `diff` when it is an edit, and a `risk` of `low | medium | high`. The operator answers with
`allow`, `allow-always`, or `deny` with an optional reason. Requests live in `pendingPermissions` on
the store so they render both inline in the conversation and as a count on the thread row.

### Compared to T3 Code

Their four modes are `approval-required`, `auto-accept-edits`, `auto`, `full-access` — near-identical
except that their fourth axis is an *AI reviewer* rather than our read-only `plan`; plan/build lives
on a separate `interactionMode: 'default' | 'plan'` axis. Their default is `full-access`, same as
ours in spirit.

Their per-provider mappings are worth copying more or less verbatim
(`reference/t3code/apps/server/src/provider/Layers/CodexSessionRuntime.ts`, `ClaudeAdapter.ts`,
`provider/opencodeRuntime.ts`):

- **Codex** — `approvalPolicy` × `sandbox` × `approvalsReviewer`:
  `untrusted`/`read-only`/`user`, `on-request`/`workspace-write`/`user`,
  `on-request`/`workspace-write`/`auto_review`, `never`/`danger-full-access`/`user`.
  They always send `approvalsReviewer` explicitly, because omitting it on resume leaves the previous
  reviewer sticky after a mode switch — a bug we would otherwise rediscover ourselves.
- **Claude** — `acceptEdits`, `auto`, `bypassPermissions`, with `allowDangerouslySkipPermissions`
  paired to the last. Their approval-required case sets *nothing* and lets the SDK prompt.
- **OpenCode** — has no auto-accept-edits equivalent and degrades to asking, which is precisely why
  a provider must be allowed to omit a mode rather than fake it.

---

## 8. The ship flow

Review and shipping are one path with explicit steps:

```ts
export type ShipStep = 'commit' | 'push' | 'pull-request';

export interface ShipRequest {
  threadId; steps: ShipStep[];
  commitMessage: string;
  paths: string[];      // empty means every changed file
  prTitle?; prBody?; draft?;
}
```

The operator picks which steps to run, so "just commit" and "commit, push and open a draft PR" are
the same mechanism with a different array. Progress streams back as `ship.progress` events carrying
`{ step, state: 'running' | 'done' | 'error', detail }`, and the final PR step attaches a
`PullRequestInfo` with number, url, state and check status.

Staging is a first-class protocol operation (`git.stage`, and `staged` on every `FilePatch`), so the
review panel can build a partial commit by tapping files, and `git.revert` discards per path.

`GitService` already implements the primitives: `stage`, `unstage`, `commit(message, paths)`,
`push(branch, ...)`, `revertPaths`, `aheadBehind(branch, base)`, `logSubjects(range)` for message
generation, and `parseGithubSlug(remoteUrl)` for the PR target.

### Compared to T3 Code

Theirs is the same shape with more honesty in the return value. `GitStackedAction` is
`commit | push | create_pr | commit_push | commit_push_pr`, and each step reports a *specific*
status — `skipped_no_changes`, `skipped_up_to_date`, `opened_existing` — rather than a boolean. That
distinction is what stops a UI from claiming it pushed when there was nothing to push, and
`ShipProgress.detail` should carry the same information.

They stream **git hook stdout/stderr** into the progress feed, which matters the moment a pre-commit
hook fails. They also support GitLab, Bitbucket and Azure DevOps behind one provider interface and
generate commit messages and PR bodies with an LLM through a per-provider `textGeneration`
capability. Ornight is GitHub-only via `gh`, with no generation.

---

## 9. Rules that keep the architecture intact

Learned partly from `reference/t3code/AGENTS.md`, which is worth reading in full.

1. **The daemon is the only execution boundary.** No client shells out, reads a file, or spawns a
   process. This is what makes remote work at all.
2. **Complexity belongs at the adapter boundary.** Orchestration stays provider-agnostic; the UI
   stays dumb. A `switch (provider)` above the adapter layer is a design failure.
3. **No component imports a transport.** UI → store → transport, one direction.
4. **Every "way in" needs a "way out" and a "way to see it."** Archive needs unarchive. Pin needs
   unpin. A one-way door is a bug.
5. **Hit every surface.** A behaviour reachable from the chat view is usually also reachable from
   the sidebar, a sheet, and the desktop layout. Fixing one is not fixing the feature.
6. **Animate `transform` and `opacity` only.** `backdrop-filter` is expensive: keep simultaneously
   blurred layers under about six and never animate blur radius on a large surface. T3 Code
   duty-cycles every indicator animation with stepped keyframes for exactly this reason — on a
   120 Hz display it is the difference between ~14 and ~288 compositor updates per cycle. On a
   tablet that difference is battery.
7. **Touch is the primary input.** 44 px minimum targets, 52 px for primary actions, no hover-only
   affordances, `env(safe-area-inset-*)` respected on all fixed chrome.
8. **`packages/protocol` imports nothing from the workspace.** If it needs to, the design is wrong.

---

## 10. Where to start reading

| You want to | Read |
| --- | --- |
| Understand the domain | `packages/protocol/src/index.ts` |
| Understand client state | `apps/tablet/src/state/store.ts`, then `selectors.ts` |
| See the protocol exercised | `apps/tablet/src/mock/demoTransport.ts` |
| Work on git | `packages/core/src/git.ts` |
| Work on the design system | `packages/glass/src/tokens.css`, then `Glass.tsx` |
| Know who owns what file | `docs/CONTRACTS.md` |
| Know what is actually built | the status table in `README.md` |
| Compare against T3 Code | `docs/PARITY.md`, `reference/T3CODE-RESEARCH.md` |
