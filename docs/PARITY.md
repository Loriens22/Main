# Ornight Plus vs T3 Code — parity matrix

An honest scorecard. This document's only value is that it is trustworthy, so it errs toward
understating Ornight. Where T3 Code is better, it says so.

- **T3 Code** — [github.com/pingdotgg/t3code](https://github.com/pingdotgg/t3code), MIT, ~18k stars,
  studied at commit `e5c82d7`. A read-only copy lives in `reference/t3code/`.
- **Ornight Plus** — this repository, a reimplementation of its ideas for mini tablets.

### Status legend

| Mark | Meaning |
| --- | --- |
| ✅ | Built and working |
| 🟡 | Partially built, or designed and contracted but incomplete |
| 🔨 | Designed, contract fixed, **not yet implemented** |
| ❌ | Not present |
| ⛔ | **Deliberately dropped** — out of scope, not an oversight |

Ornight is early. Most rows below are 🔨 because the protocol fixes the design while the daemon is
still unwritten. That is the accurate picture; see the README status table.

---

## Providers

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Claude Code | ✅ via `@anthropic-ai/claude-agent-sdk` in-process | 🔨 declared, adapter unwritten | They do not parse the CLI; they use the SDK and point it at the user's `claude` binary. We should probably follow. |
| Codex | ✅ via `codex app-server` JSON-RPC | 🔨 declared | Their transport is a persistent JSON-RPC child process, not one-shot spawns. |
| Cursor | ✅ via ACP (`cursor-agent`) | 🔨 declared | Model catalogue comes from Cursor's `list_available_models` ACP extension. |
| Grok Build | ✅ via ACP | 🔨 declared | |
| OpenCode | ✅ via `@opencode-ai/sdk` | 🔨 declared | |
| **Gemini CLI** | ❌ not supported | 🔨 declared | **Ours.** Six declared providers to their five. Unproven until an adapter exists. |
| Demo/offline agent | ❌ | ✅ | **Ours.** Scripted, offline, exercises real code paths. |
| Multiple instances per provider | ✅ two Codex accounts with separate `CODEX_HOME`s, etc. | ❌ | Real gap, not a simplification. Their two-level registry (`ProviderInstanceRegistry` → `ProviderAdapterRegistry`) is what enables it. |
| Provider install/auth probing | ✅ live status + version advisories + self-update | 🔨 `ProviderStatus` in the protocol; no prober | They can run `cursor-agent update` and check npm/Homebrew for newer versions. We only plan to report installed/authenticated. |
| Per-provider text generation | ✅ commit messages, PR titles, branch names, thread titles | ❌ | Each of their adapters exposes a `textGeneration` capability. |
| Mixed transports per provider | ✅ SDK / JSON-RPC / ACP / spawn as appropriate | 🔨 assumes spawn-and-parse | Our uniform assumption is likely wrong for Claude and Codex. Expect the adapter interface to grow a transport notion. |

**Net:** they support five providers properly; we declare six and drive one (the demo agent).

---

## Permission model

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Number of modes | ✅ 4: `approval-required`, `auto-accept-edits`, `auto`, `full-access` | 🟡 4: `plan`, `ask`, `auto-edit`, `full-access` | Three map 1:1. Their `auto` delegates routine approvals to an AI reviewer; our `plan` is read-only instead. |
| Plan mode | ✅ separate axis, `interactionMode: 'default' \| 'plan'` | 🟡 folded into the permission enum | **We simplified.** Theirs is more correct: plan is orthogonal to permissiveness, and collapsing them means you cannot have "plan mode, but ask before reads". |
| Default mode | ✅ `full-access` | 🟡 per-provider `defaultPermissionMode`, mostly `auto-edit` | We default more conservatively. |
| Set per thread | ✅ | 🔨 `thread.setMode` in the protocol | |
| Inherited by child threads | ✅ | ❌ | |
| Provider declares supported modes | 🟡 implicit — unsupported modes degrade | ✅ explicit `permissionModes[]` per descriptor | **Ours is cleaner.** Cursor/Grok/Gemini omit `plan` and the picker never offers it, instead of offering it and silently degrading. |
| Codex mapping | ✅ `approvalPolicy` × `sandbox` × `approvalsReviewer` | 🔨 | Copy theirs verbatim, including always sending `approvalsReviewer` — omitting it on resume leaves the previous reviewer sticky after a mode switch. |
| Claude mapping | ✅ `acceptEdits` / `auto` / `bypassPermissions` + `allowDangerouslySkipPermissions` | 🔨 | Their approval-required case sets nothing and lets the SDK prompt. |
| OpenCode mapping | ✅ `PermissionRuleset`; no auto-edit equivalent, degrades to ask | 🔨 | Exactly why a provider must be able to omit a mode. |
| Inline approval UI | ✅ in the conversation | 🔨 `permission.requested` carries tool, detail, diff, risk | |
| Decision vocabulary | ✅ `accept`, `acceptForSession`, `decline`, `cancel` | 🟡 `allow`, `allow-always`, `deny` (+ reason) | We dropped `cancel`; we added a deny reason. |
| Risk classification | ❌ | ✅ `low \| medium \| high` on every request | **Ours.** Untested in practice. |

---

## Worktree isolation

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Thread-level git worktree | ✅ | 🔨 `WorktreeInfo` contracted; no manager | Same architecture. |
| Branch naming | ✅ `t3code/<8 hex>`, sanitiser, collision suffixes | 🔨 unspecified | **We should copy theirs** — `sanitizeBranchFragment`, `resolveAutoFeatureBranchName`. |
| Worktree location | ✅ `~/.t3/worktrees/<repo>/<branch-dashed>/` | 🔨 `~/.ornight/worktrees/<repo>/<id>` as fallback root | Ours is a fallback for read-only repos; primary location undecided. |
| Sets `gh-merge-base` on create | ✅ | ❌ | Small, free, real downstream value for `gh`. |
| Lazy creation | 🟡 on demand | 🔨 on first mutating turn | Contracted intent. |
| Per-project setup script on worktree create | ✅ `t3.json` `runOnWorktreeCreate` | ❌ | Genuinely useful — installs deps, symlinks `.env`. |
| Discard / cleanup | ✅ | 🔨 `worktree.discard` command exists | |
| Shell-injection safety | ✅ | ✅ `execFile('git', [...])`, no shell, ever | Both correct. |

---

## Diffs, review and checkpoints

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Diff source | ✅ **checkpoints as hidden git refs** | 🟡 plain `git diff` vs base | **Their biggest advantage.** `refs/t3/checkpoints/<b64url(threadId)>/turn/<n>`. |
| Per-turn diff | ✅ exact, independent of working-tree state | ❌ | We can only answer "what has this thread changed in total". |
| Full-thread diff | ✅ | 🟡 | |
| Revert to a mid-thread point | ✅ workspace **and** provider conversation, via adapter `rollbackThread(threadId, n)` | ❌ | Rolling back files without rolling back the agent's belief about them is worse than not offering it. |
| Untracked files in diff | 🟡 | ✅ `--no-index` path normalised into ordinary headers | |
| Binary handling | ✅ | ✅ stub patch | |
| Per-file staging | ✅ | 🔨 `git.stage` + `staged` on every `FilePatch` | |
| Revert per path | ✅ | 🔨 `git.revert` | |
| Diff renderer | ✅ `@pierre/diffs` + shiki, in a worker pool | 🟡 own parser (`@ornight/protocol/diff`); viewer in progress | Ours is smaller and has no syntax highlighting yet. |
| Ignore whitespace | ✅ default on | ❌ | |
| Changed-files tree with per-folder stats | ✅ | 🔨 | |

---

## Commit / push / pull request

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Stacked actions | ✅ `commit \| push \| create_pr \| commit_push \| commit_push_pr` | 🟡 `ShipRequest.steps[]` — same idea, as an array | Equivalent expressiveness. |
| Specific step outcomes | ✅ `skipped_no_changes`, `skipped_up_to_date`, `opened_existing` | ❌ `running \| done \| error` only | **Adopt theirs.** It is what stops a UI claiming it pushed when nothing was pushed. |
| Progress streaming | ✅ incl. **git hook stdout/stderr** | 🟡 `ship.progress` with a `detail` string | Hook output matters the moment a pre-commit hook fails. |
| GitHub | ✅ via `gh` CLI | 🔨 planned via `gh`; `parseGithubSlug` landed | |
| GitLab / Bitbucket / Azure DevOps | ✅ all three | ⛔ | **Deliberately dropped.** Out of scope for a tablet harness at this stage. |
| PR review inside the app | ✅ list, detail, activity, inline comments, submit review, resolve threads, request reviewers | ⛔ | Deliberately dropped. `PullRequestInfo` carries number/url/state/checks for display only. |
| Check out a PR branch locally | ✅ `local` or `worktree` mode | ❌ | |
| Clone / publish a repository | ✅ from four hosts or any Git URL | ❌ | `workspace.add` takes a local path only. |
| LLM-generated commit/PR text | ✅ with configurable writing style | ❌ | |
| Conflict resolution UI | ❌ (unverified in their source either) | 🟡 `GitState.hasConflicts` flag only | Neither project solves this. |

---

## Remote access

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Local network | ✅ | 🔨 pairing token over WebSocket | |
| Pairing flow | ✅ one-time token → durable session, QR code, hosted `/pair?host=…#token=` with the token in the URL **hash** so it never reaches their server | 🟡 rotating token at `~/.ornight/token` (0600); `?daemon=` once, then `localStorage` | Ours is much simpler and has no QR code. |
| Auth granularity | ✅ **per-RPC-method scopes** — 8 scopes across ~90 methods; admin links differ from standard links | 🟡 single connection-level token | **We simplified.** Defensible on a trusted LAN with one class of client; the first thing to revisit if that changes. |
| Reconnect / offline buffering | 🟡 connection supervisor with retry/backoff | ✅ backoff to 15 s, 20 s heartbeat, **commands buffered while down** | Ours is explicitly built for a tablet that sleeps mid-turn. |
| Tailscale integration | ✅ dedicated package, `tailscale serve` HTTPS lifecycle | ⛔ | Deliberately dropped. Use a tailnet yourself if you want one. |
| SSH-launched remote environments | ✅ desktop probes host, installs a launcher, port-forwards; handles nvm/mise/asdf/fnm | ⛔ | Deliberately dropped. Substantial engineering. |
| Hosted tunnel / relay | ✅ T3 Connect (`infra/relay`), not in the traffic hot path | ⛔ | Deliberately dropped. No third party in our path, by design. |
| Multiple environments at once | ✅ one client, many machines | ❌ | We assume one daemon. |
| Mobile push notifications | ✅ via relay | ❌ | |
| Server self-update | ✅ + version-skew warnings in-app | ❌ | |

---

## Clients

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Web app | ✅ hosted + locally served | 🟡 the tablet app is a PWA | Same artifact serves both roles. |
| Desktop | ✅ Electron 41, dmg/AppImage/nsis, winget/Homebrew/AUR | 🔨 `apps/desktop` empty | |
| Mobile | ✅ React Native, App Store + Play Store | ⛔ | Deliberately dropped — **the tablet app is the mobile client**. |
| **Mini-tablet layout (7–8.5")** | 🟡 phone and desktop layouts; tablets fall between | ✅ four explicit modes: `compact-portrait`, `portrait`, `landscape`, `wide` | **Ours.** Portrait *and* landscape as first-class, not a phone layout stretched. |
| Touch-first rules | 🟡 has a touch-target expander, `pointer-fine:hidden` | ✅ 44 px minimum / 52 px primary, no hover-only affordances, safe-area aware, enforced in `docs/CONTRACTS.md` | **Ours**, as a stated non-negotiable. |
| **Offline demo mode** | ❌ | ✅ `DemoTransport` implements the real `Transport`; single-file build runs with no network | **Ours.** The demo exercises real code paths, not a parallel mock UI. |
| Single-file build | ❌ | ✅ `npm run build:single`, every asset inlined | **Ours.** |
| Terminal | ✅ `node-pty` + libghostty WASM renderer | ⛔ | Deliberately dropped. Large surface, poor fit for a 7" screen. |
| In-app browser / preview | ✅ + preview automation | ⛔ | Deliberately dropped. |
| Theming | ✅ full token system, live theme editor with element inspect, VS Code theme import | 🟡 one nocturnal liquid-glass theme + a `data-glass="reduced"` performance mode | We chose one opinionated look. Their theme editor is genuinely impressive. |
| **Liquid-glass design system** | ❌ flat Tailwind + Base UI | ✅ 13 components, blur/specular/refraction token set | **Ours.** A different aesthetic, not a better one. |
| **Branded splash → badge morph** | ❌ plain splash | ✅ 2000 ms sequence morphing via shared element into the sidebar badge | **Ours.** |
| Accessibility | ✅ thorough — aria on every icon button, full combobox semantics | 🟡 `GlassIconButton` requires a `label`; not yet audited | They are ahead. |

---

## Threads and conversation

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Create / rename / delete | ✅ | 🔨 contracted | |
| Pin | ✅ + drag-reorder, order synced server-side across devices | 🟡 `thread.pin` boolean, no ordering | |
| Archive | ✅ | 🟡 `thread.archive` | |
| Snooze / unsnooze | ✅ | ⛔ | Dropped. Part of their inbox-zero model. |
| Settle / unsettle | ✅ + auto-settle after N days | ⛔ | Dropped. |
| Status vocabulary | ✅ 7 pills with a strict priority order (Pending Approval > Awaiting Input > Working > Plan Ready > Monitoring > Completed) | 🟡 6 states: `idle`, `running`, `awaiting-input`, `awaiting-permission`, `error`, `archived` | Comparable. Theirs distinguishes background "Monitoring" work. |
| Cheap list rendering | ✅ `subscribeShell` vs `subscribeThread` split | 🟡 `Thread.preview` + `stats` counters let the list render without messages, but there is one broadcast stream | Same instinct, less rigour. Will need their split at scale. |
| Cross-environment search over message bodies | ✅ threads, projects, branches, user messages, agent responses | ❌ | |
| Command palette | ✅ `⌘K`, the primary entry point for most actions | ❌ | Reasonable to drop on touch; the desktop build will want it. |
| Keyboard shortcuts | ✅ user-editable JSON with `when` expressions and precedence rules | ⛔ | Dropped for the tablet. Revisit for desktop. |
| Streaming deltas | ✅ + a buffered mode that spills at 24k chars | ✅ `message.delta` appends to the last text part | Theirs handles the "agent writes an essay" case explicitly. |
| Reasoning display | ✅ collapsed by default | ✅ `ReasoningPart.collapsed` | Equivalent. |
| Attachments | ✅ images, with a directory grant so the agent can read them without prompting | 🟡 `Attachment` in the protocol | That grant detail is worth copying. |
| `@` file mentions, `/` slash commands | ✅ Lexical editor with both | ❌ | |
| Draft persistence per thread | ✅ | ✅ `drafts` in the store | |
| Interrupt a running turn | ✅ | 🔨 `thread.interrupt` | |
| Sub-agent / task visibility | ✅ task and hook events | ❌ | |

---

## Tool-use visibility

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Normalised tool shape across providers | ✅ `CanonicalItemType`, 7 tool lifecycle types | ✅ `ToolCall` with an 8-value `ToolCategory` | Same idea, near-identical granularity. Both keep the provider-native name for display. |
| Canonical event union | ✅ **48 event types** | 🟡 ~20 `ServerEvent` variants | Theirs covers realtime audio, MCP status, hooks, rate limits, model rerouting, deprecation notices. |
| Tool status lifecycle | ✅ `inProgress \| completed \| failed \| declined` | ✅ `pending \| awaiting-permission \| running \| ok \| error \| denied` | Ours distinguishes awaiting-permission, which is useful. |
| Grouped tool-call cards | ✅ "TOOL CALLS (3)" collapse | 🔨 | Good pattern; keeps a long turn readable. |
| Inline patch on edit tools | ✅ | ✅ `ToolCall.patch: FilePatch \| null` | |
| Exit codes / output capture | ✅ | ✅ `exitCode`, `output` | |
| MCP | ✅ exposes an MCP server back to the agent | ⛔ | Deliberately dropped. |

---

## Engineering

| Capability | T3 Code | Ornight Plus | Notes |
| --- | --- | --- | --- |
| Server model | ✅ event-sourced: pure decider, single ordered command worker, persist+project in one transaction, durable command receipts, reconciliation | 🟡 append-only JSONL per thread + JSON indexes | **We simplified, and gave up real properties**: idempotent retries, replay, guaranteed read-model/log agreement. Ours is greppable at 3 a.m. |
| Persistence | ✅ SQLite, 40+ migrations | 🟡 `~/.ornight/{threads.json, workspaces.json, messages/<id>.jsonl}` | |
| Contract validation | ✅ Effect Schema decode on both ends | 🟡 TypeScript types + `JSON.parse` | No runtime validation. Fine while the daemon is trusted and local. |
| Type safety | ✅ strict, `any` is "the enemy" | ✅ strict, `any` needs a justifying comment | Equivalent discipline. |
| Tests | ✅ extensive, with `drain()` on every worker so tests await quiescence instead of sleeping | ❌ **none** | Their drainable-worker pattern is the right answer to async test flakiness. |
| Docs | ✅ `docs/{user,internals,operations,architecture}`, ~4.2k lines | 🟡 four documents | |
| Codebase size | ~16k files | ~50 source files | Different life stages. |
| Animation performance | ✅ duty-cycled stepped keyframes; ~14 vs ~288 compositor updates per cycle at 120 Hz | 🟡 spring physics, `transform`/`opacity` only, reduced-motion honoured, `data-glass="reduced"` escape hatch | We are aware of the problem; they have measured it. `backdrop-filter` makes this sharper for us, not softer. |

---

## Summary

**Where T3 Code is clearly ahead:** it exists and works end to end. Checkpoint-based per-turn diffs
with conversation rollback. Per-method authorization scopes. Event-sourced server with replay and
idempotency. Multi-instance providers. Four source-control hosts with full in-app PR review. SSH,
Tailscale and relay remote access. Terminal, preview, MCP, command palette, editable keybindings,
cross-environment search. A theme editor. Tests.

**Where Ornight goes further, or intends to:** a genuine mini-tablet layout system with portrait and
landscape as first-class citizens; touch rules enforced as contract rather than convention; the
liquid-glass design language and the splash → badge branding sequence; a `Transport` seam that makes
an offline demo run the real code paths; a single-file build; per-provider declared permission modes
so a mode is never faked; risk classification on permission requests; and a Gemini adapter, once
written.

**Where we deliberately diverged:** mobile-native, terminal, preview, MCP, keybindings, snooze/settle,
non-GitHub hosts, in-app PR review, and every form of remote access beyond a LAN socket are all out
of scope on purpose — not forgotten.

**The honest bottom line:** T3 Code is a mature product with over 100,000 users. Ornight Plus is a
protocol, a design system, a git engine, a client store and a working offline demo, with the daemon
still to be written. If you want to drive real agents today, use T3 Code.
