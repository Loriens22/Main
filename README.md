# Ornight Plus

**A coding agent harness control surface, built for mini tablets.**

Ornight Plus drives the coding agents already installed on your machine — Claude Code, Codex,
Cursor, Grok, OpenCode, Gemini — from a 7–8.5" tablet you can hold in one hand. A small daemon runs
on the machine with your repositories and your agent CLIs. Everything else is a client: a
touch-first tablet app, and a desktop build alongside it.

It is a **liquid-glass reimagining of [T3 Code](https://github.com/pingdotgg/t3code)** — same
fundamental architecture, a very different surface. See [Credit](#credit) below; that project is the
reason this one exists.

---

## Status

Ornight Plus is **under active construction**. This table is the honest state of the tree as of the
last update to this file — not a roadmap, a status report. Read it before you clone.

| Area | Package | State |
| --- | --- | --- |
| Wire protocol & domain types | `packages/protocol` | **Landed.** Complete and frozen. |
| Liquid-glass design system | `packages/glass` | **Landed.** 13 components, full token set. |
| Git engine | `packages/core/src/git.ts` | **Landed.** Status, diff, stage, commit, push, revert. |
| Filesystem layout, exec, atomic writes | `packages/core/src/{paths,util}` | **Landed.** |
| Client store + transports | `apps/tablet/src/{state,mock}` | **Landed.** Store, selectors, WebSocket transport, demo transport. |
| Diff parsing & review helpers | `apps/tablet/src/review` | **Partial.** Parser landed; viewer in progress. |
| App shell, chat, brand sequence | `apps/tablet/src/{shell,chat,brand}` | **In progress.** |
| Provider adapters, thread store, worktrees | `packages/core` | **Not started.** |
| Daemon (HTTP + WebSocket + pairing) | `apps/server` | **Not started.** |
| Desktop build | `apps/desktop` | **Not started.** |

**What this means practically:** there is no daemon yet, so `npm run dev:server` does not work and
no real agent can be driven end to end. The tablet app in **demo mode** is the path that works, and
it is not a mock UI — see [Demo mode](#demo-mode).

---

## What it does

- **Drives agent CLIs you already pay for.** Ornight spawns and supervises the CLIs on your machine.
  It ships no model access and asks for no API key.
- **One thread, one git worktree.** Every thread gets an isolated checkout, so three agents can work
  in the same repository at once without fighting over the index — and so `full-access` mode has a
  real safety net instead of a promise.
- **A permission model the UI speaks natively.** Four modes — Plan, Ask, Auto-edit, Full access —
  mapped per-provider onto whatever flags that CLI actually understands.
- **Review before you ship.** Per-file diffs, stage/unstage, revert, then commit → push → pull
  request as one flow you can drive with a thumb.
- **Normalised tool visibility.** Every provider's tool calls are translated into one shape, so a
  `Bash` call from Claude and a `shell` call from Codex render as the same card.
- **Remote by construction.** The daemon is the only thing that touches your filesystem. Clients
  pair over your LAN with a rotating token; nothing is relayed through a third party.
- **Built for touch.** 44 px minimum targets, no hover-only affordances, safe-area aware, four
  responsive layouts from compact portrait to a wide three-column desktop.

### Providers

The registry lives in `packages/protocol/src/providers.ts`. Adding a provider is one entry there
plus one adapter — nothing else in the stack changes.

| Provider | CLI | Adapter status |
| --- | --- | --- |
| Claude Code | `claude` | Declared; adapter not built |
| Codex | `codex` | Declared; adapter not built |
| Cursor | `cursor-agent` | Declared; adapter not built |
| Grok Build | `grok` | Declared; adapter not built |
| OpenCode | `opencode` | Declared; adapter not built |
| Gemini CLI | `gemini` | Declared; adapter not built |
| Demo Agent | — | **Working**, offline, scripted |

Gemini is ours; T3 Code supports the other five and no Gemini. Every entry declares its own
supported permission modes, model list, resume capability and streaming behaviour, and the UI reads
those rather than assuming.

---

## Branding: the splash sequence

Cold launch opens on a full-screen **night field** — a deep, near-black blue with soft depth in it.

The Ornight mark enters: scale and fade together, a slow glow pulse under it, a gentle rotational
morph as it settles. Beneath the mark the word **"Ornight"** types itself out letter by letter in
liquid-glass type — frosted and embossed, lit from inside, refracting the field behind it.

The whole sequence holds for exactly **2000 ms**. Then it does not cut. The mark and the word
*shrink and travel together*, morphing into a compact rectangular glass pill that comes to rest in
the top-left corner above the thread list. In that minimised state the pill keeps a tiny crop of the
same night field inside its glass, now reading **"Ornight Plus"**.

It is one continuous shared-element transition, so the thing you launched into is visibly the same
object as the badge you work beside all day.

---

## Quickstart

Requires **Node ≥ 20**.

```bash
git clone <this-repo> ornight
cd ornight
npm install
```

### Run the tablet app

```bash
npm run dev
```

Vite serves on **port 5183** bound to `0.0.0.0`, so you can open it from a tablet on the same
network at `http://<your-machine-ip>:5183`. With no daemon reachable the app drops into
[demo mode](#demo-mode) automatically.

### Run the daemon

```bash
npm run dev:server
```

> **Not yet functional** — `apps/server` is empty. When it lands, the daemon serves the built client
> and the WebSocket on one origin, so pointing a tablet at the daemon's URL gets you both.

### Pair a tablet

The daemon mints a pairing token at `~/.ornight/token` (mode `0600`), rotated on every start. The
client resolves which daemon to talk to in this order (`apps/tablet/src/state/wsTransport.ts`):

1. an explicit `?daemon=<host>` query parameter — which it then persists;
2. a previously paired daemon in `localStorage`;
3. the origin that served the app, which is the ordinary case.

So pairing is: open `http://<machine>:<port>/?daemon=<machine>:<port>` once on the tablet. It
remembers. If nothing resolves, you get demo mode rather than an error screen.

### Other commands

```bash
npm run typecheck      # project-wide, tsc -b
npm run build          # protocol → core → tablet
npm run build:single   # one self-contained index.html, every asset inlined
npm run dev:desktop    # not yet functional — apps/desktop is empty
```

There is no test script yet.

### Demo mode

`apps/tablet/src/mock/demoTransport.ts` is an **in-memory daemon**. It implements the same
`Transport` interface as the WebSocket client and speaks the same protocol, event for event, with
replies deferred by a tick so ordering bugs cannot hide behind synchronous returns.

The point is that the UI genuinely cannot tell which one it is bound to. Demo mode exercises the
real store, the real reducer and the real components — it is not a parallel mock UI that drifts.
It runs with no CLIs, no server and no network, which also makes it the single-file build's
default state.

---

## Layout

```
packages/protocol   Shared types, wire protocol, provider registry, diff parser.
                    Imports nothing from the workspace. The contract.
packages/core       Harness engine: git, filesystem layout, process exec.
                    Provider adapters, thread store and worktrees land here.
packages/glass      The liquid-glass design system and its tokens.
apps/server         The daemon: HTTP + WebSocket + pairing + remote access.
apps/tablet         The mini-tablet client (React + Vite + zustand + framer-motion).
  src/state/          store, selectors, WebSocket transport
  src/mock/           demo transport and fixtures
  src/shell/          app shell, sidebar, thread list, layout
  src/chat/           conversation view, composer
  src/review/         diff viewer, git panel, permissions, ship flow
  src/brand/          splash sequence and badge
apps/desktop        Electron PC build.
packaging/          PWA manifest, service worker, icons, dist scripts.
reference/          T3 Code source and research notes (see below).
docs/               Contracts, architecture, parity, install, desktop.
```

Start with `packages/protocol/src/index.ts` and `apps/tablet/src/state/store.ts`. They are short and
they are the truth. `docs/ARCHITECTURE.md` explains why the seams sit where they do;
`docs/PARITY.md` is an honest scorecard against T3 Code.

---

## Limitations

Stated plainly, because a harness that oversells itself is a harness you cannot trust:

- **No daemon yet.** Nothing drives a real agent end to end today.
- **No provider adapters.** All seven registry entries except the demo agent are declarations.
- **No desktop build yet.**
- **No tests.** There is a typecheck gate and nothing else.
- **Pairing is LAN-only.** A rotating token over a plain WebSocket on a network you trust. There is
  no tunnel, no relay, no SSH launcher, no Tailscale integration — T3 Code has all four.
- **Diffs are plain `git diff`.** No per-turn checkpointing, so you cannot ask "what changed during
  *that* turn" or revert to a point mid-thread the way T3 Code can.
- **History is append-only JSONL**, not an event log with a projection. Simpler, and it gives up the
  replay and reconciliation properties that come with real event sourcing.
- **GitHub only** for the pull-request step. No GitLab, Bitbucket or Azure DevOps.
- **`backdrop-filter` is expensive.** Keep simultaneously-blurred layers under about six. There is a
  `data-glass="reduced"` escape hatch that drops blur radii to zero and swaps in solid fills.

---

## Credit

Ornight Plus is derived from **[T3 Code](https://github.com/pingdotgg/t3code)** by
[pingdotgg](https://github.com/pingdotgg) / T3 Tools Inc. — Theo, Julius and contributors.
MIT licensed, copyright © 2026 T3 Tools Inc.

T3 Code is the original: an open-source agent harness control surface with web, Electron desktop and
React Native mobile clients, driving Codex, Claude Code, Cursor, Grok and OpenCode. Ornight studied
its architecture closely and took the good ideas deliberately — the server as the sole execution
boundary, one normalised runtime-event vocabulary that every provider adapter emits into, thread-level
git worktree isolation, permission modes mapped per-provider, and pairing-token remote access.

Ornight is a **reimplementation, not a fork**: no T3 Code code is copied into `packages/` or `apps/`.
A read-only copy of their source lives in `reference/t3code/` for study, with research notes in
`reference/T3CODE-RESEARCH.md` and `reference/T3CODE-UI-SPEC.md`. That directory is theirs and
carries their MIT licence.

Where the two differ — and there is plenty, in both directions — `docs/PARITY.md` says so honestly.
If you want the mature, complete, battle-tested thing today, **use T3 Code**.

## Licence

MIT. See `reference/t3code/LICENSE` for the upstream licence that covers the referenced material.
