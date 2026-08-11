/**
 * Subprocess helpers.
 *
 * Hard rule for the whole package: every process launch passes an argument
 * array. Nothing in this file ever builds a shell string, so a branch name, a
 * file path or a commit message can never be interpreted as shell syntax.
 */
import { execFile } from 'node:child_process';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  /** True when the binary could not be found at all. */
  missing: boolean;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

/** Node's exec error carries a numeric `code` for exits and a string for spawn failures. */
interface ExecError extends Error {
  code?: number | string;
  killed?: boolean;
}

export function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env ?? process.env,
        timeout: options.timeoutMs ?? 120_000,
        maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr, missing: false });
          return;
        }
        const err = error as ExecError;
        const missing = err.code === 'ENOENT';
        const code = typeof err.code === 'number' ? err.code : missing ? 127 : 1;
        resolve({
          code,
          stdout: stdout ?? '',
          stderr: stderr && stderr.length > 0 ? stderr : err.message,
          missing,
        });
      },
    );
    if (options.input !== undefined && child.stdin) {
      child.stdin.end(options.input);
    }
  });
}

/** Like `run`, but throws when the command fails. Use where failure is a bug. */
export async function runOrThrow(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<string> {
  const result = await run(command, args, options);
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  return result.stdout;
}

const EXTRA_BIN_DIRS = [
  path.join(os.homedir(), '.local', 'bin'),
  path.join(os.homedir(), '.bun', 'bin'),
  path.join(os.homedir(), '.deno', 'bin'),
  path.join(os.homedir(), '.cargo', 'bin'),
  path.join(os.homedir(), '.npm-global', 'bin'),
  '/usr/local/bin',
  '/opt/homebrew/bin',
];

/**
 * PATH lookup without shelling out. Agent CLIs are frequently installed into
 * `~/.local/bin` by their own installers, which a GUI-launched daemon does not
 * inherit, so those directories are probed explicitly too.
 */
export function resolveBinary(name: string): string | null {
  if (name.includes('/') || name.includes('\\')) {
    return isExecutable(name) ? name : null;
  }
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of [...pathEntries, ...EXTRA_BIN_DIRS]) {
    for (const ext of extensions) {
      const candidate = path.join(dir, name + ext.toLowerCase());
      if (isExecutable(candidate)) return candidate;
      const upper = path.join(dir, name + ext);
      if (ext && isExecutable(upper)) return upper;
    }
  }
  return null;
}

function isExecutable(file: string): boolean {
  try {
    const stat = fsSync.statSync(file);
    if (!stat.isFile()) return false;
    fsSync.accessSync(file, fsSync.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Environment for a spawned agent CLI: the operator's environment minus the
 * variables that reliably break child processes (npm lifecycle noise, the
 * daemon's own NODE_OPTIONS) plus colour suppression so stream parsing never
 * has to strip ANSI.
 */
export function agentEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith('npm_')) continue;
    if (key === 'NODE_OPTIONS' || key === 'NODE_ENV') continue;
    if (key.startsWith('ORNIGHT_')) continue;
    env[key] = value;
  }
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  env.TERM = 'dumb';
  return { ...env, ...extra };
}
