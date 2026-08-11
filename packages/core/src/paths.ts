/**
 * Filesystem layout for the harness.
 *
 * Everything the daemon owns lives under `~/.ornight` (override with
 * `ORNIGHT_HOME`, which the test harness and the smoke script use so a run
 * never touches the operator's real state).
 *
 *   ~/.ornight/
 *     threads.json            thread index (see threads.ts for why one file)
 *     workspaces.json         registered repositories
 *     messages/<id>.jsonl     append-only conversation log, one thread per file
 *     token                   pairing token, 0600
 *     worktrees/<repo>/<id>   fallback worktree root when the repo is read-only
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface OrnightPaths {
  home: string;
  threadsFile: string;
  workspacesFile: string;
  messagesDir: string;
  tokenFile: string;
  worktreesDir: string;
  logsDir: string;
}

export function ornightPaths(home?: string): OrnightPaths {
  const root = home ?? process.env.ORNIGHT_HOME ?? path.join(os.homedir(), '.ornight');
  return {
    home: root,
    threadsFile: path.join(root, 'threads.json'),
    workspacesFile: path.join(root, 'workspaces.json'),
    messagesDir: path.join(root, 'messages'),
    tokenFile: path.join(root, 'token'),
    worktreesDir: path.join(root, 'worktrees'),
    logsDir: path.join(root, 'logs'),
  };
}

export async function ensurePaths(paths: OrnightPaths): Promise<void> {
  await fs.mkdir(paths.home, { recursive: true });
  await fs.mkdir(paths.messagesDir, { recursive: true });
  await fs.mkdir(paths.worktreesDir, { recursive: true });
}
