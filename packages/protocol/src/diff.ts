import type { DiffHunk, DiffLine, FilePatch, ParsedPatch } from './index.js';

/**
 * Pure unified-diff parser shared by the daemon and both UIs.
 *
 * Kept dependency-free and browser-safe on purpose: the tablet parses patches
 * locally so the diff viewer stays responsive while offline, and the daemon
 * uses the same code so line numbering can never disagree between the two.
 */

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function parseUnifiedDiff(patch: FilePatch): ParsedPatch {
  return { ...patch, hunks: parseHunks(patch.unified) };
}

export function parseHunks(unified: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of unified.split('\n')) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      current = {
        header: (header[5] ?? '').trim(),
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
      };
      oldLine = current.oldStart;
      newLine = current.newStart;
      hunks.push(current);
      continue;
    }

    // Everything before the first @@ is file metadata (---, +++, index, mode).
    if (!current) continue;

    const marker = raw[0];
    const content = raw.slice(1);

    if (marker === '+') {
      current.lines.push(line('add', null, newLine++, content));
    } else if (marker === '-') {
      current.lines.push(line('del', oldLine++, null, content));
    } else if (marker === '\\') {
      // "\ No newline at end of file" — carries no line numbers.
      current.lines.push(line('meta', null, null, raw));
    } else if (marker === ' ' || raw === '') {
      current.lines.push(line('ctx', oldLine++, newLine++, content));
    }
  }

  return hunks;
}

function line(kind: DiffLine['kind'], oldLine: number | null, newLine: number | null, content: string): DiffLine {
  return { kind, oldLine, newLine, content };
}

/** Totals for a patch, recomputed from the body rather than trusted. */
export function countChanges(unified: string): { insertions: number; deletions: number } {
  let insertions = 0;
  let deletions = 0;
  for (const raw of unified.split('\n')) {
    if (raw.startsWith('+') && !raw.startsWith('+++')) insertions++;
    else if (raw.startsWith('-') && !raw.startsWith('---')) deletions++;
  }
  return { insertions, deletions };
}

/**
 * Splits a multi-file `git diff` into one `FilePatch` per file. Handles adds,
 * deletes, renames and binary files.
 */
export function splitMultiFileDiff(diff: string): FilePatch[] {
  const patches: FilePatch[] = [];
  const chunks = diff.split(/^diff --git /m).filter((c) => c.trim().length > 0);

  for (const chunk of chunks) {
    const body = `diff --git ${chunk}`;
    const lines = body.split('\n');
    const head = lines[0] ?? '';
    const paths = /^diff --git a\/(.+?) b\/(.+)$/.exec(head);
    if (!paths) continue;

    let path = paths[2] ?? '';
    let previousPath: string | null = null;
    let kind: FilePatch['kind'] = 'modified';
    let binary = false;

    for (const l of lines.slice(1, 12)) {
      if (l.startsWith('new file mode')) kind = 'added';
      else if (l.startsWith('deleted file mode')) kind = 'deleted';
      else if (l.startsWith('rename from ')) {
        kind = 'renamed';
        previousPath = l.slice('rename from '.length);
      } else if (l.startsWith('rename to ')) {
        path = l.slice('rename to '.length);
      } else if (l.startsWith('Binary files ') || l.startsWith('GIT binary patch')) {
        binary = true;
      }
      if (l.startsWith('@@')) break;
    }

    const { insertions, deletions } = countChanges(body);
    patches.push({
      path,
      previousPath,
      kind,
      insertions,
      deletions,
      unified: body,
      binary,
      staged: false,
    });
  }

  return patches;
}
