import type {
  FilePatch,
  GitState,
  Message,
  Thread,
  ThreadId,
  ToolCall,
  Workspace,
} from '@ornight/protocol';
import { EMPTY_THREAD_STATS } from '@ornight/protocol';
import { countChanges } from '@ornight/protocol/diff';

/**
 * Demo fixtures.
 *
 * These drive the app when no daemon is reachable — the published build, the
 * single-file build, and the first launch before pairing. They are written to
 * look like real work on a real repository, because for most people this is the
 * first and possibly only thing they will see.
 */

const HOUR = 3_600_000;
const now = Date.now();

export const DEMO_WORKSPACE: Workspace = {
  id: 'ws-ornight',
  name: 'ornight',
  path: '~/code/ornight',
  defaultBranch: 'main',
  remoteUrl: 'git@github.com:you/ornight.git',
  githubSlug: 'you/ornight',
};

/* -------------------------------------------------------------------------- */
/* Patches                                                                    */
/* -------------------------------------------------------------------------- */

function patch(
  path: string,
  kind: FilePatch['kind'],
  unified: string,
  staged = false,
): FilePatch {
  const { insertions, deletions } = countChanges(unified);
  return { path, previousPath: null, kind, insertions, deletions, unified, binary: false, staged };
}

const RATE_LIMIT_PATCH = patch(
  'src/server/rate-limit.ts',
  'added',
  `diff --git a/src/server/rate-limit.ts b/src/server/rate-limit.ts
new file mode 100644
--- /dev/null
+++ b/src/server/rate-limit.ts
@@ -0,0 +1,42 @@
+import type { Request, Response, NextFunction } from 'express';
+
+interface Bucket {
+  tokens: number;
+  updatedAt: number;
+}
+
+const buckets = new Map<string, Bucket>();
+
+/**
+ * Token-bucket limiter. Refills continuously rather than on a fixed window so
+ * a client that paces itself is never punished for a burst at a boundary.
+ */
+export function rateLimit(options: { capacity: number; refillPerSecond: number }) {
+  const { capacity, refillPerSecond } = options;
+
+  return function middleware(req: Request, res: Response, next: NextFunction) {
+    const key = req.ip ?? 'unknown';
+    const now = Date.now();
+    const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
+
+    const elapsed = (now - bucket.updatedAt) / 1000;
+    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond);
+    bucket.updatedAt = now;
+
+    if (bucket.tokens < 1) {
+      const retryAfter = Math.ceil((1 - bucket.tokens) / refillPerSecond);
+      res.setHeader('Retry-After', String(retryAfter));
+      buckets.set(key, bucket);
+      res.status(429).json({ error: 'rate_limited', retryAfter });
+      return;
+    }
+
+    bucket.tokens -= 1;
+    buckets.set(key, bucket);
+    next();
+  };
+}
+
+/** Exposed for tests; the middleware itself never needs this. */
+export function resetBuckets(): void {
+  buckets.clear();
+}
`,
  true,
);

const ROUTES_PATCH = patch(
  'src/server/routes.ts',
  'modified',
  `diff --git a/src/server/routes.ts b/src/server/routes.ts
--- a/src/server/routes.ts
+++ b/src/server/routes.ts
@@ -1,10 +1,12 @@
 import { Router } from 'express';
 import { createSession, listSessions } from './sessions.js';
+import { rateLimit } from './rate-limit.js';

 export const router = Router();

-router.post('/sessions', createSession);
+const writeLimit = rateLimit({ capacity: 20, refillPerSecond: 0.5 });
+
+router.post('/sessions', writeLimit, createSession);
 router.get('/sessions', listSessions);

 router.get('/health', (_req, res) => {
   res.json({ ok: true });
 });
@@ -14,6 +16,10 @@ router.get('/health', (_req, res) => {
 router.use((err: Error, _req: unknown, res: any, _next: unknown) => {
   console.error(err);
-  res.status(500).json({ error: 'internal' });
+  res.status(500).json({ error: 'internal', message: err.message });
 });
+
+router.get('/limits', (_req, res) => {
+  res.json({ writes: { capacity: 20, refillPerSecond: 0.5 } });
+});
`,
  true,
);

const TEST_PATCH = patch(
  'src/server/__tests__/rate-limit.test.ts',
  'added',
  `diff --git a/src/server/__tests__/rate-limit.test.ts b/src/server/__tests__/rate-limit.test.ts
new file mode 100644
--- /dev/null
+++ b/src/server/__tests__/rate-limit.test.ts
@@ -0,0 +1,28 @@
+import { describe, expect, it, beforeEach } from 'vitest';
+import { rateLimit, resetBuckets } from '../rate-limit.js';
+
+function call(mw: ReturnType<typeof rateLimit>, ip = '1.1.1.1') {
+  let status = 200;
+  let nexted = false;
+  const res = {
+    setHeader() {},
+    status(code: number) { status = code; return this; },
+    json() { return this; },
+  };
+  mw({ ip } as never, res as never, () => { nexted = true; });
+  return { status, nexted };
+}
+
+describe('rateLimit', () => {
+  beforeEach(resetBuckets);
+
+  it('allows requests up to capacity', () => {
+    const mw = rateLimit({ capacity: 3, refillPerSecond: 0 });
+    expect(call(mw).nexted).toBe(true);
+    expect(call(mw).nexted).toBe(true);
+    expect(call(mw).nexted).toBe(true);
+    expect(call(mw).status).toBe(429);
+  });
+});
`,
);

const README_PATCH = patch(
  'README.md',
  'modified',
  `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -18,6 +18,14 @@ npm run dev

 ## API

+### Rate limits
+
+Write endpoints are limited to a burst of 20 requests, refilling at one every
+two seconds per client IP. Exceeding it returns \`429\` with a \`Retry-After\`
+header.
+
 ### POST /sessions

 Creates a session and returns its id.
`,
);

export const DEMO_PATCHES: Record<ThreadId, FilePatch[]> = {
  't-rate-limit': [RATE_LIMIT_PATCH, ROUTES_PATCH, TEST_PATCH, README_PATCH],
  't-flaky-test': [
    patch(
      'src/queue/worker.ts',
      'modified',
      `diff --git a/src/queue/worker.ts b/src/queue/worker.ts
--- a/src/queue/worker.ts
+++ b/src/queue/worker.ts
@@ -42,9 +42,13 @@ export class Worker {
   private async drain(): Promise<void> {
-    while (this.queue.length) {
-      const job = this.queue.shift()!;
-      await this.run(job);
-    }
+    // Draining used to race with enqueue: a job pushed while the last await was
+    // in flight could be picked up by a second drain() started by the producer.
+    if (this.draining) return;
+    this.draining = true;
+    try {
+      while (this.queue.length) await this.run(this.queue.shift()!);
+    } finally {
+      this.draining = false;
+    }
   }
`,
    ),
  ],
};

/* -------------------------------------------------------------------------- */
/* Threads                                                                    */
/* -------------------------------------------------------------------------- */

function makeThread(t: Partial<Thread> & Pick<Thread, 'id' | 'title' | 'provider'>): Thread {
  return {
    workspaceId: DEMO_WORKSPACE.id,
    model: 'claude-opus-5',
    permissionMode: 'auto-edit',
    status: 'idle',
    worktree: {
      path: `~/code/ornight/.ornight/worktrees/${t.id.slice(2, 8)}`,
      branch: `ornight/${t.id.slice(2)}`,
      baseBranch: 'main',
      baseCommit: 'a3f91c2',
      createdAt: now - 2 * HOUR,
      active: true,
    },
    createdAt: now - 2 * HOUR,
    updatedAt: now - HOUR,
    preview: '',
    stats: { ...EMPTY_THREAD_STATS },
    pinned: false,
    archived: false,
    externalSessionId: null,
    error: null,
    ...t,
  } as Thread;
}

export const DEMO_THREADS: Thread[] = [
  makeThread({
    id: 't-rate-limit',
    title: 'Add rate limiting to the write API',
    provider: 'claude-code',
    model: 'claude-opus-5',
    status: 'idle',
    pinned: true,
    updatedAt: now - 6 * 60_000,
    preview: 'Added a token-bucket limiter, wired it into POST /sessions, tests pass.',
    stats: {
      ...EMPTY_THREAD_STATS,
      messages: 8,
      toolCalls: 11,
      filesChanged: 4,
      insertions: 96,
      deletions: 4,
      tokensIn: 48_210,
      tokensOut: 6_430,
      costUsd: 0.42,
    },
  }),
  makeThread({
    id: 't-flaky-test',
    title: 'Fix the flaky queue worker test',
    provider: 'codex',
    model: 'gpt-5-codex',
    status: 'running',
    updatedAt: now - 30_000,
    preview: 'Reproducing the race with a tightened loop…',
    permissionMode: 'ask',
    stats: {
      ...EMPTY_THREAD_STATS,
      messages: 5,
      toolCalls: 7,
      filesChanged: 1,
      insertions: 9,
      deletions: 4,
      tokensIn: 22_100,
      tokensOut: 3_050,
      costUsd: 0.18,
    },
  }),
  makeThread({
    id: 't-onboarding',
    title: 'Rewrite the onboarding empty states',
    provider: 'cursor',
    model: 'composer-1',
    status: 'idle',
    updatedAt: now - 3 * HOUR,
    preview: 'Three empty states drafted. Waiting on copy review before I touch the components.',
    stats: { ...EMPTY_THREAD_STATS, messages: 4, toolCalls: 3, tokensIn: 9_800, tokensOut: 2_100, costUsd: 0.07 },
  }),
  makeThread({
    id: 't-migrate-sqlite',
    title: 'Migrate session store to SQLite',
    provider: 'opencode',
    model: 'default',
    status: 'idle',
    updatedAt: now - 26 * HOUR,
    preview: 'Schema drafted, migration script written, not yet run against a real database.',
    stats: { ...EMPTY_THREAD_STATS, messages: 12, toolCalls: 19, tokensIn: 71_000, tokensOut: 9_900, costUsd: 0.61 },
  }),
  makeThread({
    id: 't-bump-deps',
    title: 'Bump dependencies and fix the fallout',
    provider: 'grok',
    model: 'grok-code',
    status: 'error',
    updatedAt: now - 49 * HOUR,
    error: 'Agent exited with code 1: the lockfile could not be resolved offline.',
    preview: 'Stopped: lockfile could not be resolved offline.',
    stats: { ...EMPTY_THREAD_STATS, messages: 3, toolCalls: 4, tokensIn: 5_400, tokensOut: 900, costUsd: 0.04 },
  }),
];

/* -------------------------------------------------------------------------- */
/* Git state                                                                  */
/* -------------------------------------------------------------------------- */

export function demoGitState(threadId: ThreadId): GitState {
  const files = DEMO_PATCHES[threadId] ?? [];
  const thread = DEMO_THREADS.find((t) => t.id === threadId);
  return {
    threadId,
    branch: thread?.worktree?.branch ?? 'ornight/demo',
    baseBranch: 'main',
    ahead: files.length ? 1 : 0,
    behind: 0,
    files,
    insertions: files.reduce((n, f) => n + f.insertions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
    hasConflicts: false,
    remoteBranch: null,
    pullRequest: null,
    updatedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/* Conversation history                                                       */
/* -------------------------------------------------------------------------- */

let seq = 0;
const id = (prefix: string) => `${prefix}-${(seq += 1)}`;

function tool(threadId: ThreadId, t: Partial<ToolCall> & Pick<ToolCall, 'name' | 'category' | 'title' | 'target'>): ToolCall {
  return {
    id: id('call'),
    threadId,
    input: {},
    output: null,
    status: 'ok',
    patch: null,
    startedAt: now - HOUR,
    endedAt: now - HOUR + 1200,
    exitCode: 0,
    ...t,
  };
}

function message(t: Partial<Message> & Pick<Message, 'threadId' | 'role' | 'parts'>): Message {
  return {
    id: id('msg'),
    turnId: id('turn'),
    createdAt: now - HOUR,
    streaming: false,
    ...t,
  };
}

export const DEMO_HISTORY: Record<ThreadId, Message[]> = {
  't-rate-limit': [
    message({
      threadId: 't-rate-limit',
      role: 'user',
      parts: [
        {
          kind: 'text',
          text: 'Our write endpoints have no rate limiting and someone hammered POST /sessions last night. Add a token bucket limiter, wire it into the write routes, and cover it with a test.',
        },
      ],
    }),
    message({
      threadId: 't-rate-limit',
      role: 'assistant',
      parts: [
        {
          kind: 'reasoning',
          collapsed: true,
          text: 'A fixed window would let a client burst at the boundary and double the intended rate. A token bucket refilling continuously avoids that and is barely more code. In-memory is fine for a single process; note the multi-process caveat rather than pulling in Redis unasked.',
        },
        {
          kind: 'text',
          text: "Let me look at how the routes are wired first.",
        },
        {
          kind: 'tool',
          call: tool('t-rate-limit', {
            name: 'Read',
            category: 'read',
            title: 'Read src/server/routes.ts',
            target: 'src/server/routes.ts',
            output: '19 lines',
          }),
        },
        {
          kind: 'tool',
          call: tool('t-rate-limit', {
            name: 'Grep',
            category: 'search',
            title: 'Search for existing middleware',
            target: 'middleware|rateLimit|throttle',
            output: 'No matches in src/server/',
          }),
        },
        {
          kind: 'text',
          text: "Nothing exists yet, so I'll add a small self-contained limiter rather than a dependency.\n\nI'm going with a **token bucket** rather than a fixed window: a fixed window lets a client fire its full quota at the end of one window and again at the start of the next, briefly doubling the intended rate. The bucket refills continuously, so a client that paces itself is never punished for a burst at a boundary.",
        },
        {
          kind: 'tool',
          call: tool('t-rate-limit', {
            name: 'Write',
            category: 'edit',
            title: 'Create src/server/rate-limit.ts',
            target: 'src/server/rate-limit.ts',
            patch: RATE_LIMIT_PATCH,
          }),
        },
        {
          kind: 'tool',
          call: tool('t-rate-limit', {
            name: 'Edit',
            category: 'edit',
            title: 'Wire the limiter into the write routes',
            target: 'src/server/routes.ts',
            patch: ROUTES_PATCH,
          }),
        },
        {
          kind: 'tool',
          call: tool('t-rate-limit', {
            name: 'Write',
            category: 'edit',
            title: 'Add coverage',
            target: 'src/server/__tests__/rate-limit.test.ts',
            patch: TEST_PATCH,
          }),
        },
        {
          kind: 'tool',
          call: tool('t-rate-limit', {
            name: 'Bash',
            category: 'shell',
            title: 'npm test -- rate-limit',
            target: 'npm test -- rate-limit',
            output:
              '\n> vitest run rate-limit\n\n ✓ src/server/__tests__/rate-limit.test.ts (1 test) 6ms\n   ✓ rateLimit > allows requests up to capacity\n\n Test Files  1 passed (1)\n      Tests  1 passed (1)\n   Duration  412ms\n',
            exitCode: 0,
          }),
        },
        {
          kind: 'tool',
          call: tool('t-rate-limit', {
            name: 'Edit',
            category: 'edit',
            title: 'Document the limits',
            target: 'README.md',
            patch: README_PATCH,
          }),
        },
        {
          kind: 'text',
          text: "Done — tests pass.\n\n**What changed**\n\n- `src/server/rate-limit.ts` — token-bucket middleware, 20 request burst refilling at one per two seconds per IP. Returns `429` with a `Retry-After` header.\n- `src/server/routes.ts` — applied to `POST /sessions`; added `GET /limits` so clients can discover the policy.\n- Tests and README updated.\n\n**One thing worth knowing:** the buckets live in process memory, so if you run more than one server instance each gets its own allowance. That was the right trade for now — moving it to Redis is a contained change if you scale out.",
        },
      ],
    }),
  ],
  't-flaky-test': [
    message({
      threadId: 't-flaky-test',
      role: 'user',
      parts: [
        {
          kind: 'text',
          text: 'queue worker test fails maybe 1 in 20 runs on CI. can you find the actual race instead of adding a sleep',
        },
      ],
    }),
    message({
      threadId: 't-flaky-test',
      role: 'assistant',
      streaming: true,
      parts: [
        {
          kind: 'text',
          text: "Agreed — a sleep would hide it. Let me reproduce it under load first so I can see the interleaving rather than guess at it.",
        },
        {
          kind: 'tool',
          call: tool('t-flaky-test', {
            name: 'Bash',
            category: 'shell',
            title: 'Run the test 200 times',
            target: 'npx vitest run queue --repeat 200',
            status: 'running',
            endedAt: null,
            exitCode: null,
            output: 'run 41/200 · 2 failures so far\n',
          }),
        },
      ],
    }),
  ],
  't-onboarding': [
    message({
      threadId: 't-onboarding',
      role: 'user',
      parts: [{ kind: 'text', text: 'The empty states are all "No data". Write real ones for the three main screens.' }],
    }),
    message({
      threadId: 't-onboarding',
      role: 'assistant',
      parts: [
        {
          kind: 'text',
          text: "Drafted three. Each one names what goes here and gives one action, rather than describing the absence:\n\n1. **Threads** — “Nothing running. Start a thread and Ornight will give it its own worktree.” → *New thread*\n2. **Changes** — “No changes yet. Edits your agent makes will show up here to review before you ship.” → *Open the worktree*\n3. **Pull requests** — “No open PRs from this workspace.” → *Ship current changes*\n\nI haven't touched the components yet — you said copy review first. Say the word and I'll wire them in.",
        },
      ],
    }),
  ],
  't-migrate-sqlite': [
    message({
      threadId: 't-migrate-sqlite',
      role: 'user',
      parts: [{ kind: 'text', text: 'Move the session store from JSON files to SQLite. Keep the existing interface.' }],
    }),
    message({
      threadId: 't-migrate-sqlite',
      role: 'assistant',
      parts: [
        {
          kind: 'text',
          text: 'Schema and migration are drafted behind the existing `SessionStore` interface, so nothing calling it changes.\n\nI stopped short of running the migration against your real database — that is destructive and I would rather you take that step deliberately. The script is idempotent and takes a backup first; run it with `npm run migrate -- --dry-run` to see the plan.',
        },
      ],
    }),
  ],
  't-bump-deps': [
    message({
      threadId: 't-bump-deps',
      role: 'user',
      parts: [{ kind: 'text', text: 'bump everything to latest and fix whatever breaks' }],
    }),
    message({
      threadId: 't-bump-deps',
      role: 'assistant',
      parts: [
        {
          kind: 'tool',
          call: tool('t-bump-deps', {
            name: 'Bash',
            category: 'shell',
            title: 'npm update --save',
            target: 'npm update --save',
            status: 'error',
            exitCode: 1,
            output: 'npm error code ENOTCACHED\nnpm error request to https://registry.npmjs.org/ failed: cache mode is "only-if-cached" but no cached response is available.',
          }),
        },
        {
          kind: 'text',
          text: 'I can\'t reach the registry from this sandbox, so I stopped rather than hand-editing version ranges I can\'t verify resolve. Re-run me with network access and this should go through.',
        },
      ],
    }),
  ],
};
