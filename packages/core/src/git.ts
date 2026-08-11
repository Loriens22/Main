/**
 * GitService — a thin, predictable wrapper over the `git` binary.
 *
 * Design rules:
 *  - every invocation is `execFile('git', [...])`; no shell, ever, so branch
 *    names, paths and commit messages are inert data;
 *  - every call is scoped to one working directory, so a thread's worktree and
 *    the primary checkout can never be confused for each other;
 *  - nothing here throws for "the repo is in a state you didn't expect" — those
 *    are modelled as return values, because the daemon must not die when a
 *    worktree has no commits yet or `origin` is missing.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import type { FilePatch } from '@ornight/protocol';
import { splitMultiFileDiff } from '@ornight/protocol/diff';
import { run, type RunResult } from './util/exec.js';

export interface GitStatusEntry {
  path: string;
  previousPath: string | null;
  /** Porcelain index (staged) status letter. */
  index: string;
  /** Porcelain worktree (unstaged) status letter. */
  worktree: string;
  staged: boolean;
  untracked: boolean;
  conflicted: boolean;
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

/** Untracked files larger than this are reported as binary stubs, not inlined. */
const MAX_UNTRACKED_INLINE_BYTES = 512 * 1024;

export class GitService {
  constructor(readonly cwd: string) {}

  /** Same repository, different working directory (e.g. a thread worktree). */
  at(cwd: string): GitService {
    return new GitService(cwd);
  }

  async git(args: string[], options: { cwd?: string; input?: string } = {}): Promise<RunResult> {
    return run('git', ['--no-pager', ...args], {
      cwd: options.cwd ?? this.cwd,
      input: options.input,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM ?? '0',
        LC_ALL: 'C',
      },
    });
  }

  private async text(args: string[]): Promise<string> {
    const result = await this.git(args);
    return result.code === 0 ? result.stdout.trim() : '';
  }

  static async repoRoot(from: string): Promise<string | null> {
    const result = await run('git', ['rev-parse', '--show-toplevel'], { cwd: from });
    if (result.code !== 0) return null;
    const root = result.stdout.trim();
    return root.length > 0 ? root : null;
  }

  async repoRoot(): Promise<string | null> {
    return GitService.repoRoot(this.cwd);
  }

  async isRepo(): Promise<boolean> {
    return (await this.repoRoot()) !== null;
  }

  async currentBranch(): Promise<string> {
    const branch = await this.text(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch && branch !== 'HEAD') return branch;
    // Detached head, or a fresh repo with no commits: report the symbolic ref.
    const symbolic = await this.text(['symbolic-ref', '--short', '-q', 'HEAD']);
    return symbolic || branch || 'HEAD';
  }

  async head(): Promise<string | null> {
    const sha = await this.text(['rev-parse', 'HEAD']);
    return sha.length > 0 ? sha : null;
  }

  /**
   * Default branch resolution, cheapest first and never hitting the network:
   * `origin/HEAD` → a local `main`/`master`/`trunk`/`develop` → current branch.
   */
  async defaultBranch(): Promise<string> {
    const originHead = await this.text(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
    if (originHead.startsWith('refs/remotes/origin/')) {
      return originHead.slice('refs/remotes/origin/'.length);
    }
    for (const candidate of ['main', 'master', 'trunk', 'develop']) {
      const exists = await this.git(['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`]);
      if (exists.code === 0) return candidate;
      const remote = await this.git([
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/remotes/origin/${candidate}`,
      ]);
      if (remote.code === 0) return candidate;
    }
    return this.currentBranch();
  }

  async remoteUrl(remote = 'origin'): Promise<string | null> {
    const url = await this.text(['remote', 'get-url', remote]);
    return url.length > 0 ? url : null;
  }

  async githubSlug(remote = 'origin'): Promise<string | null> {
    const url = await this.remoteUrl(remote);
    return url ? parseGithubSlug(url) : null;
  }

  /** Parsed `git status --porcelain=v1 -z`. NUL framing keeps odd paths intact. */
  async status(): Promise<GitStatusEntry[]> {
    const result = await this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    if (result.code !== 0) return [];
    return parsePorcelainZ(result.stdout);
  }

  async hasConflicts(): Promise<boolean> {
    return (await this.status()).some((entry) => entry.conflicted);
  }

  /**
   * Raw unified diff. With no range this is "everything different from HEAD",
   * including untracked files, which is what an operator means by "my changes".
   * With a range (`<base>`, `a..b`) it is exactly what git would print.
   */
  async diff(range?: string, options: { includeUntracked?: boolean } = {}): Promise<string> {
    const includeUntracked = options.includeUntracked ?? true;
    const args = ['diff', '--no-color', '--no-ext-diff', '-M', '--find-renames'];
    const result = await this.git(range ? [...args, range] : [...args, 'HEAD']);
    let out = result.code === 0 ? result.stdout : '';
    if (result.code !== 0 && !range) {
      // No commits yet: HEAD does not resolve. Everything is untracked then.
      out = '';
    }
    if (!includeUntracked) return out;
    const untracked = await this.untrackedDiff();
    return untracked.length > 0 ? `${out}${out.endsWith('\n') || out === '' ? '' : '\n'}${untracked}` : out;
  }

  async diffFiles(range?: string, options: { includeUntracked?: boolean } = {}): Promise<FilePatch[]> {
    const raw = await this.diff(range, options);
    if (raw.trim().length === 0) return [];
    const patches = splitMultiFileDiff(raw);
    const staged = new Set(
      (await this.status()).filter((entry) => entry.staged).map((entry) => entry.path),
    );
    return patches.map((patch) => ({ ...patch, staged: staged.has(patch.path) }));
  }

  /** Synthesises `new file` patches for untracked paths so they render like edits. */
  private async untrackedDiff(): Promise<string> {
    const entries = (await this.status()).filter((entry) => entry.untracked);
    const parts: string[] = [];
    for (const entry of entries) {
      const absolute = path.join(this.cwd, entry.path);
      let size = 0;
      try {
        const stat = await fs.stat(absolute);
        if (!stat.isFile()) continue;
        size = stat.size;
      } catch {
        continue;
      }
      if (size > MAX_UNTRACKED_INLINE_BYTES) {
        parts.push(binaryStubPatch(entry.path));
        continue;
      }
      const result = await this.git([
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-index',
        '--',
        '/dev/null',
        entry.path,
      ]);
      // `--no-index` exits 1 when files differ, which is the normal case here.
      const body = result.stdout;
      if (body.trim().length === 0) continue;
      parts.push(normaliseNoIndexPatch(body, entry.path));
    }
    return parts.join('');
  }

  async stage(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.git(['add', '--', ...paths]);
  }

  async unstage(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const head = await this.head();
    if (head) await this.git(['restore', '--staged', '--', ...paths]);
    else await this.git(['rm', '--cached', '-r', '--', ...paths]);
  }

  /**
   * Stages `paths` (or everything when empty) and commits.
   * Returns the new commit sha, or null when there was nothing to commit.
   */
  async commit(message: string, paths: string[] = []): Promise<string | null> {
    if (paths.length > 0) await this.git(['add', '--', ...paths]);
    else await this.git(['add', '-A']);

    const staged = await this.git(['diff', '--cached', '--quiet']);
    if (staged.code === 0) return null; // exit 0 => no staged differences

    const identity = await this.identityArgs();
    const result = await this.git([...identity, 'commit', '--no-verify', '-m', message]);
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || 'git commit failed');
    }
    return this.head();
  }

  /** Commits from an unconfigured machine still need an author; supply one. */
  private async identityArgs(): Promise<string[]> {
    const email = await this.text(['config', '--get', 'user.email']);
    const name = await this.text(['config', '--get', 'user.name']);
    const args: string[] = [];
    if (!name) args.push('-c', 'user.name=Ornight');
    if (!email) args.push('-c', 'user.email=ornight@localhost');
    return args;
  }

  async push(
    branch: string,
    options: { setUpstream?: boolean; remote?: string; force?: boolean } = {},
  ): Promise<RunResult> {
    const remote = options.remote ?? 'origin';
    const args = ['push'];
    if (options.setUpstream) args.push('--set-upstream');
    if (options.force) args.push('--force-with-lease');
    args.push(remote, `${branch}:${branch}`);
    return this.git(args);
  }

  async upstreamOf(branch: string): Promise<string | null> {
    const upstream = await this.text([
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      `${branch}@{upstream}`,
    ]);
    return upstream.length > 0 ? upstream : null;
  }

  /** `ahead` = commits on `branch` missing from `base`, and vice versa. */
  async aheadBehind(branch: string, base: string): Promise<AheadBehind> {
    const result = await this.git(['rev-list', '--left-right', '--count', `${base}...${branch}`]);
    if (result.code !== 0) return { ahead: 0, behind: 0 };
    const [behind, ahead] = result.stdout.trim().split(/\s+/).map((n) => Number(n) || 0);
    return { ahead: ahead ?? 0, behind: behind ?? 0 };
  }

  /**
   * Restores tracked paths to HEAD and deletes untracked ones. This is the
   * "discard my changes to these files" button; it is destructive by design and
   * the orchestrator only calls it on explicit operator command.
   */
  async revertPaths(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const status = await this.status();
    const untracked = new Set(status.filter((entry) => entry.untracked).map((entry) => entry.path));
    const tracked = paths.filter((p) => !untracked.has(p));
    const toDelete = paths.filter((p) => untracked.has(p));

    if (tracked.length > 0) {
      const head = await this.head();
      if (head) {
        const restored = await this.git([
          'restore',
          '--source=HEAD',
          '--staged',
          '--worktree',
          '--',
          ...tracked,
        ]);
        if (restored.code !== 0) {
          await this.git(['checkout', 'HEAD', '--', ...tracked]);
        }
      }
    }
    for (const relative of toDelete) {
      await fs.rm(path.join(this.cwd, relative), { force: true, recursive: true });
    }
  }

  async lastCommitMessage(): Promise<string | null> {
    const message = await this.text(['log', '-1', '--pretty=%B']);
    return message.length > 0 ? message : null;
  }

  async logSubjects(range: string, limit = 20): Promise<string[]> {
    const result = await this.git(['log', `--max-count=${limit}`, '--pretty=%s', range]);
    if (result.code !== 0) return [];
    return result.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  }
}

/* -------------------------------------------------------------------------- */
/* Parsing helpers (exported for tests)                                        */
/* -------------------------------------------------------------------------- */

export function parseGithubSlug(remoteUrl: string): string | null {
  const url = remoteUrl.trim().replace(/\.git$/, '');
  // git@github.com:owner/repo
  const scp = /^(?:[^@]+@)?([^:/]+):(.+)$/.exec(url);
  if (scp && !url.includes('://')) {
    const host = scp[1] ?? '';
    const repoPath = scp[2] ?? '';
    return host.includes('github.') && repoPath.split('/').length >= 2
      ? repoPath.split('/').slice(-2).join('/')
      : null;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('github.')) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    return segments.slice(-2).join('/');
  } catch {
    return null;
  }
}

export function parsePorcelainZ(raw: string): GitStatusEntry[] {
  const tokens = raw.split('\0').filter((token) => token.length > 0);
  const entries: GitStatusEntry[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token || token.length < 3) continue;
    const index = token[0] ?? ' ';
    const worktree = token[1] ?? ' ';
    let filePath = token.slice(3);
    let previousPath: string | null = null;
    if (index === 'R' || index === 'C') {
      // Rename/copy: the next NUL-separated token is the source path.
      previousPath = tokens[i + 1] ?? null;
      i += 1;
    }
    const untracked = index === '?' && worktree === '?';
    const conflicted =
      index === 'U' ||
      worktree === 'U' ||
      (index === 'A' && worktree === 'A') ||
      (index === 'D' && worktree === 'D');
    entries.push({
      path: filePath,
      previousPath,
      index,
      worktree,
      staged: !untracked && index !== ' ' && index !== '?',
      untracked,
      conflicted,
    });
  }
  return entries;
}

/**
 * `git diff --no-index -- /dev/null path` produces a valid patch but with the
 * wrong `diff --git` header and no `new file mode` line, so the shared parser
 * would classify it as `modified`. Rewrite the preamble.
 */
function normaliseNoIndexPatch(body: string, relativePath: string): string {
  const lines = body.split('\n');
  const out: string[] = [`diff --git a/${relativePath} b/${relativePath}`, 'new file mode 100644'];
  let started = false;
  for (const line of lines) {
    if (!started) {
      if (line.startsWith('diff --git') || line.startsWith('new file mode') || line.startsWith('index ')) {
        continue;
      }
      started = true;
    }
    if (line.startsWith('--- ')) out.push('--- /dev/null');
    else if (line.startsWith('+++ ')) out.push(`+++ b/${relativePath}`);
    else out.push(line);
  }
  const text = out.join('\n');
  return text.endsWith('\n') ? text : `${text}\n`;
}

function binaryStubPatch(relativePath: string): string {
  return (
    `diff --git a/${relativePath} b/${relativePath}\n` +
    `new file mode 100644\n` +
    `Binary files /dev/null and b/${relativePath} differ\n`
  );
}
