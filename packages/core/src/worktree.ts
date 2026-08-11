/**
 * WorktreeManager — thread isolation.
 *
 * The core safety property of the harness: every thread gets its own
 * `git worktree`, so N agents editing N branches never contend for one index,
 * and discarding a thread's work is `worktree remove`, not a revert.
 *
 * Conventions mirror T3 Code (`reference/T3CODE-RESEARCH.md` §F), translated to
 * Ornight names:
 *
 *   branch     `ornight/<slug-of-title>-<8 hex>`   (T3: `t3code/<8 hex>`)
 *   directory  `~/.ornight/worktrees/<repo>/<branch-with-slashes-dashed>/`
 *
 * Living outside the repository is deliberate and matches T3: a worktree inside
 * `<repo>/.ornight` shows up in the operator's own `git status`, breaks tooling
 * that walks the tree (bundlers, linters, test globs), and is lost when the
 * repo is read-only. `ORNIGHT_HOME` relocates the whole root; if that root is
 * not writable we fall back to `os.tmpdir()/ornight-worktrees`, which is
 * correct-but-ephemeral and reported as such.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { ThreadId, Workspace, WorktreeInfo } from '@ornight/protocol';
import { GitService } from './git.js';
import { ornightPaths, type OrnightPaths } from './paths.js';
import { shortId, slugify } from './util/ids.js';
import { isWritableDir, pathExists } from './util/atomic.js';

export interface CreateWorktreeOptions {
  /** Thread title, used to make the branch name legible. */
  title?: string;
  /** Branch to fork from. Defaults to the workspace default branch. */
  baseBranch?: string;
  /** Prefer `origin/<base>` over the local ref (T3: `newWorktreesStartFromOrigin`). */
  fromOrigin?: boolean;
}

export interface ListedWorktree {
  path: string;
  branch: string | null;
  head: string | null;
  locked: boolean;
  prunable: boolean;
}

export class WorktreeManager {
  private readonly paths: OrnightPaths;

  constructor(paths?: OrnightPaths) {
    this.paths = paths ?? ornightPaths();
  }

  /**
   * Creates the branch and the worktree. Returns the `WorktreeInfo` the thread
   * carries for the rest of its life; `baseCommit` is recorded here because it
   * is the anchor every diff in the UI is computed against.
   */
  async create(
    threadId: ThreadId,
    workspace: Workspace,
    options: CreateWorktreeOptions = {},
  ): Promise<WorktreeInfo> {
    const git = new GitService(workspace.path);
    const baseBranch = options.baseBranch ?? workspace.defaultBranch;
    const startPoint = await this.resolveStartPoint(git, baseBranch, options.fromOrigin ?? false);

    const branch = await this.uniqueBranch(git, threadId, options.title);
    const dir = await this.worktreeDir(workspace.path, branch);
    await fs.mkdir(path.dirname(dir), { recursive: true });

    const created = await git.git(['worktree', 'add', '-b', branch, dir, startPoint]);
    if (created.code !== 0) {
      throw new Error(
        `Could not create a worktree for this thread: ${created.stderr.trim() || created.stdout.trim()}`,
      );
    }

    // Tell `gh` (and `git merge-base`) what this branch forked from, exactly as
    // T3 Code does — it makes PR bases correct without extra bookkeeping.
    await git.git(['config', `branch.${branch}.gh-merge-base`, baseBranch]);

    const worktreeGit = new GitService(dir);
    const baseCommit = (await worktreeGit.head()) ?? startPoint;

    return {
      path: dir,
      branch,
      baseBranch,
      baseCommit,
      createdAt: Date.now(),
      active: true,
    };
  }

  /** `git worktree list --porcelain`, parsed. */
  async list(workspacePath: string): Promise<ListedWorktree[]> {
    const git = new GitService(workspacePath);
    const result = await git.git(['worktree', 'list', '--porcelain']);
    if (result.code !== 0) return [];
    return parseWorktreeList(result.stdout);
  }

  /**
   * Removes a thread's worktree and deletes its branch when it is fully merged.
   * Refuses to destroy uncommitted work unless `force` is set — the operator has
   * to say "discard" twice for anything to be lost.
   */
  async remove(
    workspacePath: string,
    info: WorktreeInfo,
    options: { force?: boolean; deleteBranch?: boolean } = {},
  ): Promise<void> {
    const git = new GitService(workspacePath);
    const exists = await pathExists(info.path);

    if (exists && !options.force) {
      const dirty = await new GitService(info.path).status();
      if (dirty.length > 0) {
        throw new Error(
          `Worktree has ${dirty.length} uncommitted change${dirty.length === 1 ? '' : 's'}. Discard again to force.`,
        );
      }
    }

    if (exists) {
      const args = ['worktree', 'remove'];
      if (options.force) args.push('--force');
      args.push(info.path);
      const removed = await git.git(args);
      if (removed.code !== 0 && options.force) {
        // `worktree remove` can refuse on a corrupt entry; drop the directory
        // and let prune reconcile the administrative files.
        await fs.rm(info.path, { recursive: true, force: true });
      } else if (removed.code !== 0) {
        throw new Error(removed.stderr.trim() || 'git worktree remove failed');
      }
    }

    await git.git(['worktree', 'prune']);

    if (options.deleteBranch !== false) {
      // `-d` only deletes when merged; that is the behaviour we want, and a
      // failure here is not an error the operator needs to see.
      await git.git(['branch', '-d', info.branch]);
    }
  }

  /**
   * Daemon restart reconciliation: a worktree directory can vanish while the
   * daemon is down (operator cleanup, `git worktree prune`, a wiped tmpdir).
   * Returns the info with `active` corrected, so threads reload as read-only
   * history instead of exploding on the next turn.
   */
  async reconcile(workspacePath: string, info: WorktreeInfo): Promise<WorktreeInfo> {
    if (!info.active) return info;
    const onDisk = await pathExists(path.join(info.path, '.git'));
    if (onDisk) return info;
    const git = new GitService(workspacePath);
    await git.git(['worktree', 'prune']);
    return { ...info, active: false };
  }

  /** Are there uncommitted changes in this worktree? */
  async isDirty(info: WorktreeInfo): Promise<boolean> {
    if (!(await pathExists(info.path))) return false;
    return (await new GitService(info.path).status()).length > 0;
  }

  private async resolveStartPoint(
    git: GitService,
    baseBranch: string,
    fromOrigin: boolean,
  ): Promise<string> {
    const candidates = fromOrigin
      ? [`origin/${baseBranch}`, baseBranch, 'HEAD']
      : [baseBranch, `origin/${baseBranch}`, 'HEAD'];
    for (const candidate of candidates) {
      const result = await git.git(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`]);
      if (result.code === 0) return candidate;
    }
    return 'HEAD';
  }

  private async uniqueBranch(
    git: GitService,
    threadId: ThreadId,
    title: string | undefined,
  ): Promise<string> {
    const suffix = shortId(threadId);
    const slug = title ? slugify(title, 32) : '';
    const base = slug && slug !== 'thread' ? `ornight/${slug}-${suffix}` : `ornight/${suffix}`;
    let candidate = base;
    for (let attempt = 2; attempt < 50; attempt++) {
      const exists = await git.git(['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`]);
      if (exists.code !== 0) return candidate;
      candidate = `${base}-${attempt}`;
    }
    return `${base}-${Date.now()}`;
  }

  private async worktreeDir(workspacePath: string, branch: string): Promise<string> {
    const repoName = path.basename(workspacePath) || 'repo';
    const dirName = branch.replace(/\//g, '-');
    const root = this.paths.worktreesDir;
    await fs.mkdir(root, { recursive: true }).catch(() => {});
    const usable = await isWritableDir(root);
    const base = usable ? root : path.join(os.tmpdir(), 'ornight-worktrees');
    if (!usable) await fs.mkdir(base, { recursive: true });
    return path.join(base, repoName, dirName);
  }
}

export function parseWorktreeList(raw: string): ListedWorktree[] {
  const out: ListedWorktree[] = [];
  let current: ListedWorktree | null = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) out.push(current);
      current = {
        path: line.slice('worktree '.length).trim(),
        branch: null,
        head: null,
        locked: false,
        prunable: false,
      };
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
    } else if (line.startsWith('locked')) {
      current.locked = true;
    } else if (line.startsWith('prunable')) {
      current.prunable = true;
    }
  }
  if (current) out.push(current);
  return out;
}
