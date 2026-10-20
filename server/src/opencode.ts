import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { logger } from './log.js';

const log = logger('opencode');

export interface OcEvent {
  directory?: string;
  type: string;
  properties: any;
}

/** Providers the user explicitly enabled by adding a key. 'opencode' (free Zen models) is always on. */
let enabledProviders = new Set<string>(['opencode']);

class OpenCodeManager extends EventEmitter {
  private proc: ChildProcess | null = null;
  private password = randomBytes(24).toString('base64url');
  private restarts = 0;
  private stopping = false;
  private sseAbort: AbortController | null = null;
  ready = false;
  version = '';
  lastError = '';
  private readyWaiters: Array<() => void> = [];

  get baseUrl(): string {
    return `http://127.0.0.1:${config.opencodePort}`;
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`opencode:${this.password}`).toString('base64');
  }

  setEnabledProviders(ids: string[]): void {
    enabledProviders = new Set(['opencode', ...ids]);
  }

  /** Global opencode config: free models only unless the user added provider keys; safe permission defaults. */
  private buildConfig(): Record<string, unknown> {
    const cfg: Record<string, unknown> = {
      $schema: 'https://opencode.ai/config.json',
      autoupdate: false,
      share: 'disabled',
      enabled_providers: [...enabledProviders],
      permission: {
        edit: 'ask',
        bash: 'ask',
        webfetch: 'ask',
        external_directory: 'deny',
        doom_loop: 'ask',
      },
      watcher: { ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '.next/**', 'target/**'] },
    };
    if (config.testProviderUrl) {
      // Local integration tests only: a scripted OpenAI-compatible endpoint.
      cfg.provider = {
        mock: {
          npm: '@ai-sdk/openai-compatible',
          name: 'Mock (tests)',
          options: { baseURL: config.testProviderUrl, apiKey: 'test' },
          models: { 'mock-coder': { name: 'Mock Coder', tool_call: true, cost: { input: 0, output: 0 }, limit: { context: 64000, output: 8000 } } },
        },
      };
      cfg.enabled_providers = [...enabledProviders, 'mock'];
    }
    return cfg;
  }

  /** Writes the git credential helper so agent `git push` works only when the user connected GitHub. */
  private prepareHome(internalToken: string): void {
    const home = config.opencodeHome;
    mkdirSync(join(home, 'bin'), { recursive: true });
    const helper = join(home, 'bin', 'git-credential-maverick');
    writeFileSync(
      helper,
      `#!/bin/sh
# Supplies the GitHub token stored (encrypted) in Maverick when git asks for github.com credentials.
[ "$1" = "get" ] || exit 0
input=$(cat)
echo "$input" | grep -q "host=github.com" || exit 0
curl -fsS -H "x-internal-token: ${internalToken}" "http://127.0.0.1:${config.port}/internal/git-credential" 2>/dev/null
`,
    );
    chmodSync(helper, 0o755);
    writeFileSync(
      join(home, '.gitconfig'),
      `[user]\n\tname = Maverick Bot\n\temail = maverick-bot@users.noreply.github.com\n[init]\n\tdefaultBranch = main\n[credential "https://github.com"]\n\thelper = ${helper}\n[safe]\n\tdirectory = *\n[advice]\n\tdetachedHead = false\n`,
    );
  }

  start(internalToken: string): void {
    this.prepareHome(internalToken);
    this.spawnProc();
  }

  private spawnProc(): void {
    const home = config.opencodeHome;
    // Sandboxed environment: nothing from the gateway's env leaks in (no provider keys, no secrets).
    const env: Record<string, string> = {
      PATH: `${join(home, 'bin')}:${config.agentPath}`,
      HOME: home,
      LANG: 'C.UTF-8',
      TERM: 'xterm-256color',
      XDG_DATA_HOME: join(config.dataDir, 'opencode', 'data'),
      XDG_CONFIG_HOME: join(config.dataDir, 'opencode', 'config'),
      XDG_STATE_HOME: join(config.dataDir, 'opencode', 'state'),
      XDG_CACHE_HOME: join(config.cacheDir, 'opencode'),
      npm_config_cache: join(config.cacheDir, 'npm'),
      PIP_CACHE_DIR: join(config.cacheDir, 'pip'),
      OPENCODE_SERVER_PASSWORD: this.password,
      OPENCODE_DISABLE_AUTOUPDATE: '1',
      OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
      OPENCODE_DISABLE_EMBEDDED_WEB_UI: '1',
      OPENCODE_DISABLE_CLAUDE_CODE: '1',
      OPENCODE_DISABLE_PROJECT_CONFIG: '1',
      OPENCODE_DISABLE_DEFAULT_PLUGINS: '1',
      OPENCODE_ENABLE_QUESTION_TOOL: '1',
      OPENCODE_CONFIG_CONTENT: JSON.stringify(this.buildConfig()),
      BUN_JSC_forceRAMSize: String(384 * 1024 * 1024),
      CI: '1',
    };
    log.info(`starting opencode serve on 127.0.0.1:${config.opencodePort}`);
    const proc = spawn(config.opencodeBin, ['serve', '--hostname', '127.0.0.1', '--port', String(config.opencodePort)], {
      env,
      cwd: config.workspacesDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc = proc;
    const onOut = (b: Buffer) => {
      for (const line of b.toString().split('\n')) {
        if (!line.trim()) continue;
        if (/error/i.test(line)) log.warn(line.slice(0, 500));
        else log.debug(line.slice(0, 500));
      }
    };
    proc.stdout?.on('data', onOut);
    proc.stderr?.on('data', onOut);
    proc.on('exit', (code, sig) => {
      this.ready = false;
      this.proc = null;
      this.sseAbort?.abort();
      if (this.stopping) return;
      this.lastError = `opencode exited (code ${code}, signal ${sig})`;
      log.error(this.lastError);
      this.emit('status', { ready: false });
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.restarts++, 5));
      setTimeout(() => this.spawnProc(), delay);
    });
    void this.waitHealthy();
  }

  private async waitHealthy(): Promise<void> {
    for (let i = 0; i < 120; i++) {
      if (!this.proc) return;
      try {
        const r = await fetch(`${this.baseUrl}/global/health`, { headers: { authorization: this.authHeader() }, signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          const j = (await r.json().catch(() => ({}))) as { version?: string };
          this.version = j.version ?? '';
          this.ready = true;
          this.restarts = 0;
          log.info(`opencode ready ${this.version}`);
          this.emit('status', { ready: true });
          for (const w of this.readyWaiters.splice(0)) w();
          void this.consumeEvents();
          return;
        }
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    this.lastError = 'opencode did not become healthy in time';
    log.error(this.lastError);
  }

  whenReady(timeoutMs = 60_000): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('OpenCode server is not ready')), timeoutMs);
      this.readyWaiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  /** Restart with a fresh config (e.g. after enabling a provider). */
  async restart(): Promise<void> {
    if (!this.proc) return this.spawnProc();
    const p = this.proc;
    await new Promise<void>((resolve) => {
      p.once('exit', () => resolve());
      this.stopping = true;
      p.kill('SIGTERM');
      setTimeout(() => p.kill('SIGKILL'), 5000);
    });
    this.stopping = false;
    this.spawnProc();
    await this.whenReady();
  }

  stop(): void {
    this.stopping = true;
    this.sseAbort?.abort();
    this.proc?.kill('SIGTERM');
  }

  /** Subscribes to opencode's global SSE stream (events for every project directory). */
  private async consumeEvents(): Promise<void> {
    let backoff = 500;
    while (this.ready && this.proc) {
      const ac = new AbortController();
      this.sseAbort = ac;
      try {
        const res = await fetch(`${this.baseUrl}/global/event`, {
          headers: { authorization: this.authHeader(), accept: 'text/event-stream' },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`event stream HTTP ${res.status}`);
        backoff = 500;
        this.emit('connected');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const data = chunk
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
              .join('\n');
            if (!data) continue;
            try {
              const msg = JSON.parse(data) as { directory?: string; payload?: { type: string; properties: any } };
              if (msg.payload?.type) this.emit('event', { directory: msg.directory, type: msg.payload.type, properties: msg.payload.properties } as OcEvent);
            } catch (e) {
              log.warn('bad SSE payload', data.slice(0, 200));
            }
          }
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        log.warn(`event stream dropped: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 10_000);
    }
  }

  /** Low-level request against the opencode HTTP API. `directory` scopes the call to a project. */
  async request<T = any>(
    method: string,
    path: string,
    opts: { directory?: string; body?: unknown; query?: Record<string, string | number | undefined>; timeoutMs?: number } = {},
  ): Promise<T> {
    await this.whenReady();
    const url = new URL(this.baseUrl + path);
    if (opts.directory) url.searchParams.set('directory', opts.directory);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 60_000);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          authorization: this.authHeader(),
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ac.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          const j = JSON.parse(text);
          msg = j?.data?.message || j?.message || j?.error || text;
        } catch {
          /* raw */
        }
        throw new OpenCodeError(`${method} ${path} → ${res.status}: ${String(msg).slice(0, 400)}`, res.status);
      }
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

export class OpenCodeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const opencode = new OpenCodeManager();
