/**
 * A minimal line-based unified diff generator.
 *
 * Only the mock adapter needs to *produce* diffs (every real provider reports
 * patches, and the git service reads them from git itself), so this is
 * deliberately small: an LCS table over lines, then hunks with three lines of
 * context, formatted exactly like `git diff` so `splitMultiFileDiff` and the
 * tablet's parser treat it identically to a real patch.
 */

export interface UnifiedDiffOptions {
  context?: number;
  /** Emit `new file mode` headers and a `/dev/null` pre-image. */
  newFile?: boolean;
}

export function makeUnifiedDiff(
  filePath: string,
  before: string,
  after: string,
  options: UnifiedDiffOptions = {},
): string {
  const context = options.context ?? 3;
  const oldLines = before.length === 0 ? [] : before.replace(/\n$/, '').split('\n');
  const newLines = after.length === 0 ? [] : after.replace(/\n$/, '').split('\n');
  const ops = diffLines(oldLines, newLines);
  if (ops.every((op) => op.kind === 'ctx')) return '';

  const header =
    `diff --git a/${filePath} b/${filePath}\n` +
    (options.newFile ? 'new file mode 100644\n' : '') +
    `--- ${options.newFile ? '/dev/null' : `a/${filePath}`}\n` +
    `+++ b/${filePath}\n`;

  const hunks: string[] = [];
  let index = 0;
  while (index < ops.length) {
    if (ops[index]?.kind === 'ctx') {
      index++;
      continue;
    }
    let start = index;
    let leading = 0;
    while (start > 0 && ops[start - 1]?.kind === 'ctx' && leading < context) {
      start--;
      leading++;
    }
    let end = index;
    let trailing = 0;
    while (end < ops.length) {
      const op = ops[end];
      if (!op) break;
      if (op.kind === 'ctx') {
        trailing++;
        if (trailing > context) break;
      } else {
        trailing = 0;
      }
      end++;
    }
    const slice = ops.slice(start, Math.min(end, ops.length));
    let oldStart = 0;
    let newStart = 0;
    for (let i = 0; i < start; i++) {
      const op = ops[i];
      if (!op) continue;
      if (op.kind !== 'add') oldStart++;
      if (op.kind !== 'del') newStart++;
    }
    const oldCount = slice.filter((op) => op.kind !== 'add').length;
    const newCount = slice.filter((op) => op.kind !== 'del').length;
    const body = slice
      .map((op) => `${op.kind === 'add' ? '+' : op.kind === 'del' ? '-' : ' '}${op.text}`)
      .join('\n');
    hunks.push(
      `@@ -${oldCount === 0 ? 0 : oldStart + 1},${oldCount} +${newCount === 0 ? 0 : newStart + 1},${newCount} @@\n${body}\n`,
    );
    index = Math.max(end, index + 1);
  }

  return header + hunks.join('');
}

type DiffOp = { kind: 'ctx' | 'add' | 'del'; text: string };

function diffLines(oldLines: string[], newLines: string[]): DiffOp[] {
  const rows = oldLines.length;
  const cols = newLines.length;
  // LCS lengths. Fine at demo scale; the real diffs all come from git.
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      const row = table[i];
      const next = table[i + 1];
      if (!row || !next) continue;
      row[j] = oldLines[i] === newLines[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: 'ctx', text: oldLines[i] ?? '' });
      i++;
      j++;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      ops.push({ kind: 'del', text: oldLines[i] ?? '' });
      i++;
    } else {
      ops.push({ kind: 'add', text: newLines[j] ?? '' });
      j++;
    }
  }
  while (i < rows) ops.push({ kind: 'del', text: oldLines[i++] ?? '' });
  while (j < cols) ops.push({ kind: 'add', text: newLines[j++] ?? '' });
  return ops;
}
