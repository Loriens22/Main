/**
 * The demo adapter.
 *
 * No CLI, no network, no API key — and yet the whole stack behaves exactly as
 * it does against a real agent, because it speaks the same canonical
 * `RuntimeEvent` union every other adapter speaks. This is what an operator
 * sees the first time they open Ornight, so it is scripted to look like real
 * work: streamed prose, a file read that returns the repository's *actual*
 * contents, a search, two edits that really land on disk with real unified
 * diffs, a permission request, and a test run.
 *
 * Because the edits are real, the changes panel, the diff viewer and the ship
 * flow all have genuine content to work with in demo mode. Everything is
 * written under `ornight-demo/` inside the thread's own worktree, so it is
 * trivially discardable and can never collide with the operator's files.
 *
 * `ORNIGHT_MOCK_SPEED` (default 1) scales every delay; the smoke test runs it
 * at 40 so a full session completes in a fraction of a second.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PermissionDecision, ProviderId, ProviderStatus } from '@ornight/protocol';
import type { AgentAdapter, AgentRun, AgentRunResult, SessionContext } from './adapter.js';
import { EventTranslator } from './translate.js';
import { categoriseTool, riskOf, toolTitle } from './runtime.js';
import { makeUnifiedDiff } from '../util/diff.js';
import { newId } from '../util/ids.js';

const DEMO_DIR = 'ornight-demo';
const LIMITER_PATH = `${DEMO_DIR}/rate-limiter.ts`;
const TEST_PATH = `${DEMO_DIR}/rate-limiter.test.ts`;

const LIMITER_V1 = `export interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsed = (now - bucket.updatedAt) / 1000;
    bucket.tokens = bucket.tokens + elapsed * this.refillPerSecond;
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
`;

const LIMITER_V2 = `export interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsed = Math.max(0, now - bucket.updatedAt) / 1000;
    // Refill is capped at the bucket capacity: without this an idle key
    // accumulates unbounded credit and the first burst after a quiet period
    // sails straight past the limit.
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
`;

const TEST_FILE = `import { RateLimiter } from './rate-limiter.ts';

test('does not bank credit while idle', () => {
  const limiter = new RateLimiter(5, 1);
  const start = 1_000_000;

  for (let i = 0; i < 5; i++) expect(limiter.take('a', start)).toBe(true);
  expect(limiter.take('a', start)).toBe(false);

  // An hour later the bucket should hold at most \`capacity\` tokens.
  const later = start + 3_600_000;
  for (let i = 0; i < 5; i++) expect(limiter.take('a', later)).toBe(true);
  expect(limiter.take('a', later)).toBe(false);
});
`;

const GREP_OUTPUT = `src/server/middleware.ts:14:import { RateLimiter } from '../limits/rate-limiter.ts';
src/server/middleware.ts:22:const limiter = new RateLimiter(60, 1);
src/server/middleware.ts:39:  if (!limiter.take(request.ip)) return tooManyRequests();
src/limits/index.ts:3:export { RateLimiter } from './rate-limiter.ts';`;

const TEST_OUTPUT = `> vitest run ornight-demo

 ✓ ornight-demo/rate-limiter.test.ts (1 test) 7ms
   ✓ does not bank credit while idle

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  09:41:02
   Duration  412ms`;

export class MockAdapter implements AgentAdapter {
  readonly id: ProviderId = 'mock';

  async probe(): Promise<ProviderStatus> {
    return {
      id: 'mock',
      installed: true,
      authenticated: true,
      version: 'scripted',
      detail: 'Offline demo agent — always available.',
    };
  }

  start(context: SessionContext): AgentRun {
    return new MockRun(context);
  }
}

class MockRun implements AgentRun {
  readonly acceptsTurns = false;
  readonly done: Promise<AgentRunResult>;

  #translator: EventTranslator;
  #pending = new Map<string, (decision: PermissionDecision) => void>();
  #aborted = false;
  #sessionId: string;
  #speed: number;

  constructor(private readonly context: SessionContext) {
    this.#sessionId = context.resumeId ?? `mock-${newId('s').slice(2, 12)}`;
    this.#speed = Math.max(1, Number(process.env.ORNIGHT_MOCK_SPEED ?? '1') || 1);
    this.#translator = new EventTranslator({
      threadId: context.threadId,
      turnId: newId('turn'),
      emit: (event) => context.emit(event),
      onUsage: (usage) => context.onUsage?.(usage),
      onPermission: (request) => context.emit({ type: 'permission.requested', request }),
    });
    this.done = this.#script()
      .catch((error) => {
        this.#translator.handle({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
          fatal: true,
        });
      })
      .then(() => {
        this.#translator.completeMessage();
        return { exitCode: this.#aborted ? 130 : 0, externalSessionId: this.#sessionId };
      });
  }

  send(_text: string): void {
    /* One turn per run: the orchestrator starts a fresh run with `resumeId`. */
  }

  interrupt(): void {
    this.#aborted = true;
    for (const [, resolve] of this.#pending) resolve({ kind: 'deny', reason: 'Interrupted' });
    this.#pending.clear();
  }

  respondToPermission(id: string, decision: PermissionDecision): void {
    const resolve = this.#pending.get(id);
    if (!resolve) return;
    this.#pending.delete(id);
    resolve(decision);
  }

  /* ---------------------------------------------------------------------- */

  async #script(): Promise<void> {
    const resumed = this.context.resumeId !== null;
    this.#emit({ kind: 'session.started', externalSessionId: this.#sessionId, model: this.context.model });
    this.#emit({ kind: 'turn.started' });

    if (resumed) await this.#followUpTurn();
    else await this.#openingTurn();

    if (this.#aborted) return;
    this.#emit({
      kind: 'turn.completed',
      usage: resumed
        ? { tokensIn: 9_412, tokensOut: 780, costUsd: 0.0231 }
        : { tokensIn: 18_204, tokensOut: 2_140, costUsd: 0.0642 },
    });
  }

  async #openingTurn(): Promise<void> {
    await this.#reason(
      'The report says the limiter lets a burst through after an idle period. ' +
        'That smells like unbounded refill — the bucket keeps accruing tokens while nobody is asking for any.',
    );
    if (this.#aborted) return;

    await this.#say(
      "I'll start by reading the project manifest so I know what test runner this repo uses, then find every caller of the limiter.",
    );
    if (this.#aborted) return;

    await this.#readManifest();
    if (this.#aborted) return;

    await this.#grep();
    if (this.#aborted) return;

    await this.#say(
      '\n\nTwo call sites, both constructing the limiter with a capacity. ' +
        "Let me put the current implementation in place under `ornight-demo/` so the fix is reviewable in isolation.",
    );
    if (this.#aborted) return;

    const created = await this.#edit(LIMITER_PATH, null, LIMITER_V1, 'Create the limiter under review');
    if (this.#aborted || !created) return;

    await this.#say(
      "\n\nThere it is — `bucket.tokens + elapsed * refillPerSecond` with no ceiling. " +
        'After an hour idle a key holds thousands of tokens. Clamping the refill to `capacity` fixes it.',
    );
    if (this.#aborted) return;

    const fixed = await this.#edit(LIMITER_PATH, LIMITER_V1, LIMITER_V2, 'Clamp refill to bucket capacity');
    if (this.#aborted || !fixed) return;

    await this.#edit(TEST_PATH, null, TEST_FILE, 'Add a regression test for the idle burst');
    if (this.#aborted) return;

    await this.#bash('npx vitest run ornight-demo', TEST_OUTPUT);
    if (this.#aborted) return;

    await this.#say(
      '\n\nGreen. The regression test fails against the old implementation and passes against the clamped one.\n\n' +
        '**What changed**\n' +
        '- `ornight-demo/rate-limiter.ts` — refill is now `Math.min(capacity, …)`, and elapsed time is floored at zero so a clock step backwards cannot mint tokens.\n' +
        '- `ornight-demo/rate-limiter.test.ts` — asserts a key idle for an hour still only gets `capacity` requests.\n\n' +
        'Ready to ship whenever you are.',
    );
  }

  async #followUpTurn(): Promise<void> {
    await this.#reason('Following up on the limiter change — the operator wants another pass.');
    if (this.#aborted) return;
    await this.#say(
      'Picking up where we left off. The clamp is in place; let me re-run the suite to confirm nothing else moved.',
    );
    if (this.#aborted) return;
    await this.#bash('npx vitest run ornight-demo', TEST_OUTPUT);
    if (this.#aborted) return;
    await this.#say('\n\nStill green — one test file, one test, no regressions.');
  }

  /* -- step primitives ---------------------------------------------------- */

  async #readManifest(): Promise<void> {
    const id = newId('tool');
    const target = 'package.json';
    this.#emit({
      kind: 'tool.started',
      call: {
        id,
        name: 'Read',
        category: categoriseTool('Read'),
        title: toolTitle('Read', 'read', target),
        target,
        input: { file_path: target },
      },
    });
    await this.#sleep(420);
    // Real content when the worktree actually has a manifest — small touch,
    // but it makes the demo feel like it is looking at *your* repository.
    let output: string;
    try {
      const raw = await fs.readFile(path.join(this.context.cwd, target), 'utf8');
      output = raw.split('\n').slice(0, 32).join('\n');
    } catch {
      output = '{\n  "name": "demo-service",\n  "scripts": { "test": "vitest run" }\n}';
    }
    this.#emit({ kind: 'tool.updated', update: { id, status: 'ok', output, exitCode: 0 } });
  }

  async #grep(): Promise<void> {
    const id = newId('tool');
    const target = 'RateLimiter';
    this.#emit({
      kind: 'tool.started',
      call: {
        id,
        name: 'Grep',
        category: categoriseTool('Grep'),
        title: toolTitle('Grep', 'search', target),
        target,
        input: { pattern: target, output_mode: 'content', '-n': true },
      },
    });
    await this.#sleep(360);
    this.#emit({ kind: 'tool.updated', update: { id, status: 'ok', output: GREP_OUTPUT, exitCode: 0 } });
  }

  /**
   * A real edit: asks permission, writes the file, and reports the diff that
   * actually landed. Returns false when the operator denied it.
   */
  async #edit(
    relativePath: string,
    before: string | null,
    after: string,
    summary: string,
  ): Promise<boolean> {
    const id = newId('tool');
    const isNew = before === null;
    const patch = makeUnifiedDiff(relativePath, before ?? '', after, { newFile: isNew });
    this.#emit({
      kind: 'tool.started',
      call: {
        id,
        name: isNew ? 'Write' : 'Edit',
        category: 'edit',
        title: summary,
        target: relativePath,
        input: { file_path: relativePath },
        patch,
      },
    });
    await this.#sleep(260);

    const decision = await this.#ask({
      toolCallId: id,
      tool: isNew ? 'Write' : 'Edit',
      title: summary,
      detail: relativePath,
      diff: patch,
      risk: riskOf('edit', relativePath),
    });
    if (decision.kind === 'deny') {
      this.#emit({
        kind: 'tool.updated',
        update: { id, status: 'denied', output: decision.reason ?? 'Denied by operator' },
      });
      await this.#say(`\n\nUnderstood — leaving \`${relativePath}\` alone.`);
      return false;
    }

    const absolute = path.join(this.context.cwd, relativePath);
    let output = `Updated ${relativePath}`;
    try {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, after, 'utf8');
    } catch (error) {
      // A read-only cwd is not a demo failure; the diff still renders.
      output = `Previewed ${relativePath} (not written: ${error instanceof Error ? error.message : 'unwritable'})`;
    }
    await this.#sleep(240);
    this.#emit({ kind: 'tool.updated', update: { id, status: 'ok', output, exitCode: 0, patch } });
    return true;
  }

  async #bash(command: string, output: string): Promise<void> {
    const id = newId('tool');
    this.#emit({
      kind: 'tool.started',
      call: {
        id,
        name: 'Bash',
        category: 'shell',
        title: toolTitle('Bash', 'shell', command),
        target: command,
        input: { command, description: 'Run the demo test suite' },
      },
    });
    await this.#sleep(200);

    const decision = await this.#ask({
      toolCallId: id,
      tool: 'Bash',
      title: 'Run the demo test suite',
      detail: command,
      diff: null,
      risk: riskOf('shell', command),
    });
    if (decision.kind === 'deny') {
      this.#emit({
        kind: 'tool.updated',
        update: { id, status: 'denied', output: decision.reason ?? 'Denied by operator' },
      });
      await this.#say('\n\nSkipping the test run.');
      return;
    }

    await this.#sleep(900);
    this.#emit({ kind: 'tool.updated', update: { id, status: 'ok', output, exitCode: 0 } });
  }

  #ask(request: {
    toolCallId: string;
    tool: string;
    title: string;
    detail: string;
    diff: string | null;
    risk: 'low' | 'medium' | 'high';
  }): Promise<PermissionDecision> {
    if (this.#aborted) return Promise.resolve({ kind: 'deny', reason: 'Interrupted' });
    const id = newId('perm');
    return new Promise<PermissionDecision>((resolve) => {
      this.#pending.set(id, resolve);
      this.#emit({ kind: 'request.permission', request: { ...request, id } });
    });
  }

  async #say(text: string): Promise<void> {
    for (const chunk of chunkProse(text)) {
      if (this.#aborted) return;
      this.#emit({ kind: 'item.text.delta', text: chunk });
      await this.#sleep(26);
    }
  }

  async #reason(text: string): Promise<void> {
    for (const chunk of chunkProse(text)) {
      if (this.#aborted) return;
      this.#emit({ kind: 'item.reasoning.delta', text: chunk });
      await this.#sleep(14);
    }
    await this.#sleep(200);
  }

  #emit(event: Parameters<EventTranslator['handle']>[0]): void {
    this.#translator.handle(event);
  }

  #sleep(ms: number): Promise<void> {
    const scaled = Math.max(0, Math.round(ms / this.#speed));
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, scaled);
      timer.unref?.();
    });
  }
}

/** Word-ish chunks, so streaming looks like a model typing rather than a paste. */
function chunkProse(text: string): string[] {
  return text.match(/\s*\S+/g) ?? [text];
}
