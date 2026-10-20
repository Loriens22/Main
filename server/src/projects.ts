import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { getSecret } from './auth.js';
import { config } from './config.js';
import { db, now, uid, type ProjectRow } from './db.js';
import { logger } from './log.js';

const log = logger('projects');
const pexec = promisify(execFile);

const PALETTE = ['#3b82f6', '#a855f7', '#ec4899', '#f97316', '#22c55e', '#06b6d4', '#eab308', '#ef4444', '#14b8a6', '#8b5cf6'];

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'project';
}

function uniqueSlug(base: string): string {
  let slug = base;
  let i = 2;
  while (db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(slug) || existsSync(join(config.workspacesDir, slug))) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

async function git(cwd: string, args: string[], extraEnv: Record<string, string> = {}, timeout = 120_000) {
  return pexec('git', args, {
    cwd,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: config.opencodeHome,
      GIT_TERMINAL_PROMPT: '0',
      ...extraEnv,
    },
  });
}

export function listProjects(): ProjectRow[] {
  return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[];
}

export function getProject(id: string): ProjectRow {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  if (!p) throw new HttpError(404, 'Project not found');
  return p;
}

export function findProjectByName(name: string): ProjectRow | undefined {
  const all = listProjects();
  const n = name.trim().toLowerCase();
  return all.find((p) => p.name.toLowerCase() === n) ?? all.find((p) => p.slug === slugify(name)) ?? all.find((p) => p.name.toLowerCase().includes(n));
}

function parseRepo(input: string): { owner: string; repo: string } | null {
  const s = input.trim().replace(/\.git$/, '');
  const m = /^(?:https?:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/.exec(s);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export async function createProject(input: { name: string; repo?: string | null }): Promise<ProjectRow> {
  const name = (input.name || '').trim().slice(0, 60);
  if (!name && !input.repo) throw new HttpError(400, 'Project name is required');
  const repoRef = input.repo ? parseRepo(input.repo) : null;
  if (input.repo && !repoRef) throw new HttpError(400, 'GitHub repository must look like owner/name or a github.com URL');
  const displayName = name || repoRef!.repo;
  const slug = uniqueSlug(slugify(displayName));
  const path = join(config.workspacesDir, slug);
  const t = now();
  if (repoRef) {
    const token = getSecret('github_token');
    const url = `https://github.com/${repoRef.owner}/${repoRef.repo}.git`;
    log.info(`cloning ${url} into ${slug}`);
    try {
      // The credential helper in the agent HOME supplies the token, so it never lands in .git/config.
      await git(config.workspacesDir, ['clone', '--depth', '50', url, slug], token ? {} : { GIT_ASKPASS: 'true' }, 300_000);
    } catch (e) {
      rmSync(path, { recursive: true, force: true });
      const msg = (e as { stderr?: string }).stderr || (e as Error).message;
      throw new HttpError(400, `Could not clone ${repoRef.owner}/${repoRef.repo}: ${msg.split('\n').filter(Boolean).slice(-2).join(' ')}`);
    }
  } else {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'README.md'), `# ${displayName}\n\nCreated with Maverick Bot.\n`);
    writeFileSync(join(path, '.gitignore'), 'node_modules/\ndist/\nbuild/\n.env\n__pycache__/\n.venv/\n');
    await git(path, ['init', '-q']);
    await git(path, ['add', '-A']);
    await git(path, ['commit', '-q', '-m', 'Initial commit']).catch((e) => log.warn('initial commit failed', e.message));
  }
  const color = PALETTE[(db.prepare('SELECT COUNT(*) c FROM projects').get() as { c: number }).c % PALETTE.length];
  const row: ProjectRow = {
    id: uid('prj'),
    name: displayName,
    slug,
    path,
    repo: repoRef ? `${repoRef.owner}/${repoRef.repo}` : null,
    color,
    created_at: t,
    updated_at: t,
  };
  db.prepare('INSERT INTO projects(id,name,slug,path,repo,color,created_at,updated_at) VALUES(@id,@name,@slug,@path,@repo,@color,@created_at,@updated_at)').run(row);
  return row;
}

export function renameProject(id: string, name: string): ProjectRow {
  getProject(id);
  db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(name.trim().slice(0, 60), now(), id);
  return getProject(id);
}

export function deleteProject(id: string): void {
  const p = getProject(id);
  const resolved = resolve(p.path);
  if (!resolved.startsWith(resolve(config.workspacesDir) + sep)) throw new HttpError(400, 'Refusing to delete outside workspaces');
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  rmSync(resolved, { recursive: true, force: true });
}

export function touchProject(id: string): void {
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), id);
}

/** Resolves a user-supplied relative path inside a project, rejecting traversal. */
export function safePath(p: ProjectRow, rel: string): string {
  const full = resolve(p.path, rel || '.');
  if (full !== resolve(p.path) && !full.startsWith(resolve(p.path) + sep)) throw new HttpError(400, 'Path escapes the project');
  return full;
}

export async function gitStatus(p: ProjectRow) {
  if (!existsSync(join(p.path, '.git'))) return { isRepo: false };
  const [branch, status, log1, remote] = await Promise.all([
    git(p.path, ['rev-parse', '--abbrev-ref', 'HEAD']).then((r) => r.stdout.trim()).catch(() => ''),
    git(p.path, ['status', '--porcelain=v1']).then((r) => r.stdout).catch(() => ''),
    git(p.path, ['log', '-n', '8', '--pretty=format:%h%x09%s%x09%ar']).then((r) => r.stdout).catch(() => ''),
    git(p.path, ['remote', 'get-url', 'origin']).then((r) => r.stdout.trim()).catch(() => ''),
  ]);
  const files = status
    .split('\n')
    .filter(Boolean)
    .map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3) }));
  const commits = log1
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, subject, when] = l.split('\t');
      return { hash, subject, when };
    });
  let ahead = 0;
  if (remote) {
    ahead = await git(p.path, ['rev-list', '--count', '@{u}..HEAD'])
      .then((r) => Number(r.stdout.trim()) || 0)
      .catch(() => 0);
  }
  return { isRepo: true, branch, files, commits, remote: remote.replace(/\/\/[^@]+@/, '//'), ahead };
}

export async function gitDiff(p: ProjectRow): Promise<string> {
  const r = await git(p.path, ['diff', 'HEAD', '--stat', '--patch', '--no-color']).catch(() => ({ stdout: '' }));
  return r.stdout.slice(0, 400_000);
}

export async function commitAndPush(p: ProjectRow, message: string, push: boolean): Promise<{ committed: boolean; pushed: boolean; output: string }> {
  const out: string[] = [];
  await git(p.path, ['add', '-A']);
  const st = await git(p.path, ['status', '--porcelain']);
  let committed = false;
  if (st.stdout.trim()) {
    const r = await git(p.path, ['commit', '-m', message.trim().slice(0, 500) || 'Update from Maverick']);
    out.push(r.stdout.trim());
    committed = true;
  }
  let pushed = false;
  if (push) {
    if (!getSecret('github_token')) throw new HttpError(400, 'Connect GitHub in Settings before pushing.');
    const remote = await git(p.path, ['remote', 'get-url', 'origin']).then((r) => r.stdout.trim()).catch(() => '');
    if (!remote) throw new HttpError(400, 'This project has no GitHub remote. Create the project from a GitHub repo to push.');
    const branch = (await git(p.path, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
    try {
      const r = await git(p.path, ['push', '-u', 'origin', branch], {}, 180_000);
      out.push((r.stdout + r.stderr).trim());
      pushed = true;
    } catch (e) {
      const msg = (e as { stderr?: string }).stderr || (e as Error).message;
      throw new HttpError(400, `Push failed: ${msg.split('\n').filter(Boolean).slice(-3).join(' ')}`);
    }
  }
  touchProject(p.id);
  return { committed, pushed, output: out.join('\n') };
}

// ---------- GitHub ----------
export async function githubRequest<T = any>(path: string, token?: string | null): Promise<T> {
  const t = token ?? getSecret('github_token');
  if (!t) throw new HttpError(400, 'GitHub is not connected');
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${t}`, accept: 'application/vnd.github+json', 'user-agent': 'maverick-bot', 'x-github-api-version': '2022-11-28' },
  });
  if (!res.ok) throw new HttpError(res.status === 401 ? 400 : 502, `GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function storageUsage(): Promise<{ usedBytes: number; totalBytes: number | null }> {
  try {
    const r = await pexec('du', ['-sb', config.dataDir], { timeout: 20_000 });
    const used = Number(r.stdout.split(/\s+/)[0]) || 0;
    const df = await pexec('df', ['-B1', '--output=size', config.dataDir], { timeout: 5000 }).catch(() => null);
    const total = df ? Number(df.stdout.trim().split('\n').pop()) || null : null;
    return { usedBytes: used, totalBytes: total };
  } catch {
    return { usedBytes: 0, totalBytes: null };
  }
}

export function relPath(p: ProjectRow, full: string): string {
  return relative(p.path, full) || '.';
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
