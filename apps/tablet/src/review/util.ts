/**
 * review/util.ts — small pure helpers shared by the review surfaces.
 * No React, no DOM assumptions beyond the clipboard helper.
 */

import type { FileChangeKind, FilePatch } from '@ornight/protocol';

/* -------------------------------------------------------------------------- */
/* Paths                                                                      */
/* -------------------------------------------------------------------------- */

export interface SplitPath {
  dir: string;
  name: string;
}

export function splitPath(path: string): SplitPath {
  const index = path.lastIndexOf('/');
  if (index === -1) return { dir: '', name: path };
  return { dir: path.slice(0, index + 1), name: path.slice(index + 1) };
}

/**
 * Middle-truncates a path so the filename always survives — on a 7" screen the
 * last segment is the only part the operator is actually scanning for.
 */
export function middleTruncate(path: string, max = 42): string {
  if (path.length <= max) return path;
  const { dir, name } = splitPath(path);
  if (name.length >= max - 1) return `…${name.slice(-(max - 1))}`;
  const room = max - name.length - 1;
  if (room <= 1) return `…/${name}`;
  const head = dir.slice(0, Math.max(1, Math.ceil(room / 2)));
  const tail = dir.slice(dir.length - Math.floor(room / 2));
  return `${head}…${tail}${name}`;
}

/** Longest shared directory prefix, used for commit-message subjects. */
export function commonDirectory(paths: string[]): string {
  const first = paths[0];
  if (!first || paths.length === 0) return '';
  let prefix = splitPath(first).dir;
  for (const path of paths.slice(1)) {
    const dir = splitPath(path).dir;
    let i = 0;
    while (i < prefix.length && i < dir.length && prefix[i] === dir[i]) i += 1;
    prefix = prefix.slice(0, i);
    const cut = prefix.lastIndexOf('/');
    prefix = cut === -1 ? '' : prefix.slice(0, cut + 1);
    if (!prefix) break;
  }
  return prefix.replace(/\/$/, '');
}

/* -------------------------------------------------------------------------- */
/* Change kinds                                                               */
/* -------------------------------------------------------------------------- */

export const CHANGE_KIND_GLYPH: Record<FileChangeKind, string> = {
  added: '+',
  modified: '~',
  deleted: '−',
  renamed: '→',
};

export const CHANGE_KIND_LABEL: Record<FileChangeKind, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
};

export type Tone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger';

export const CHANGE_KIND_TONE: Record<FileChangeKind, Tone> = {
  added: 'success',
  modified: 'accent',
  deleted: 'danger',
  renamed: 'warn',
};

/* -------------------------------------------------------------------------- */
/* Numbers and time                                                           */
/* -------------------------------------------------------------------------- */

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/* -------------------------------------------------------------------------- */
/* Clipboard                                                                  */
/* -------------------------------------------------------------------------- */

/** Best-effort copy. Resolves to whether the text made it to the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fall through to the legacy path below. */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Commit message generation                                                  */
/* -------------------------------------------------------------------------- */

export interface CommitDraft {
  subject: string;
  body: string;
}

/** Conventional-commit-ish subject length where most tools start eliding. */
export const SUBJECT_SOFT_LIMIT = 50;
export const SUBJECT_HARD_LIMIT = 72;

const KIND_VERB: Record<FileChangeKind, string> = {
  added: 'Add',
  modified: 'Update',
  deleted: 'Remove',
  renamed: 'Rename',
};

/**
 * A first draft of a commit message from the diff alone. It is deliberately
 * mechanical and always editable — the operator's judgement beats a heuristic,
 * but a pre-filled field beats an empty one every single time.
 */
export function generateCommitMessage(files: FilePatch[]): CommitDraft {
  if (files.length === 0) return { subject: '', body: '' };

  const first = files[0];
  const subject =
    files.length === 1 && first
      ? oneFileSubject(first)
      : manyFilesSubject(files);

  const bullets = files
    .slice(0, 20)
    .map((f) => {
      const stat = f.binary ? 'binary' : `+${f.insertions} −${f.deletions}`;
      const path = f.kind === 'renamed' && f.previousPath ? `${f.previousPath} → ${f.path}` : f.path;
      return `- ${KIND_VERB[f.kind].toLowerCase()} ${path} (${stat})`;
    })
    .join('\n');
  const overflow = files.length > 20 ? `\n- …and ${files.length - 20} more files` : '';

  return { subject: clampSubject(subject), body: `${bullets}${overflow}` };
}

function oneFileSubject(file: FilePatch): string {
  const { name } = splitPath(file.path);
  return `${KIND_VERB[file.kind]} ${name}`;
}

function manyFilesSubject(files: FilePatch[]): string {
  const kinds = new Set(files.map((f) => f.kind));
  const soleKind = kinds.size === 1 ? [...kinds][0] : undefined;
  const verb = soleKind ? KIND_VERB[soleKind] : 'Update';
  const dir = commonDirectory(files.map((f) => f.path));
  const where = dir ? ` in ${dir}` : '';
  return `${verb} ${files.length} files${where}`;
}

function clampSubject(subject: string): string {
  if (subject.length <= SUBJECT_HARD_LIMIT) return subject;
  return `${subject.slice(0, SUBJECT_HARD_LIMIT - 1).trimEnd()}…`;
}

/** Joins a draft back into the single string the protocol carries. */
export function joinCommitMessage(draft: CommitDraft): string {
  return draft.body ? `${draft.subject}\n\n${draft.body}` : draft.subject;
}

/** The subject line of a possibly multi-line commit message. */
export function subjectOf(message: string): string {
  return message.split('\n', 1)[0] ?? '';
}

/* -------------------------------------------------------------------------- */
/* PR draft                                                                   */
/* -------------------------------------------------------------------------- */

export function generatePrTitle(commit: CommitDraft, branch: string): string {
  if (commit.subject) return commit.subject;
  return branch.replace(/[-_/]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function generatePrBody(commit: CommitDraft, files: FilePatch[]): string {
  const stat = files.reduce(
    (acc, f) => ({ ins: acc.ins + f.insertions, del: acc.del + f.deletions }),
    { ins: 0, del: 0 },
  );
  const summary = `${files.length} file${files.length === 1 ? '' : 's'} changed, +${stat.ins} −${stat.del}.`;
  return commit.body ? `${summary}\n\n## Changes\n\n${commit.body}` : summary;
}
