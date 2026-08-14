/**
 * review/DiffRows.tsx
 *
 * The row engine shared by `DiffView` and `InlineDiff`. Everything about how a
 * diff line looks lives here exactly once: gutters, tints, word-level
 * emphasis, context folding, unified vs split.
 *
 * It is deliberately presentational — no store, no protocol commands — so both
 * the full-screen viewer and the 12-line card in a chat bubble stay identical
 * in every detail that matters.
 */

import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { DiffHunk, DiffLine, ParsedPatch } from '@ornight/protocol';
import { cx } from '@ornight/glass';
import type { Language, Range, Segment } from './parse';
import { pairLines, segmentsFor } from './parse';
import './tokens.css';

/* -------------------------------------------------------------------------- */
/* Row model                                                                  */
/* -------------------------------------------------------------------------- */

type Block =
  | { kind: 'ctx'; lines: DiffLine[] }
  | { kind: 'change'; dels: DiffLine[]; adds: DiffLine[] }
  | { kind: 'meta'; lines: DiffLine[] };

/** A line plus the word-diff ranges that apply to it, if any. */
interface Cell {
  line: DiffLine;
  ranges: Range[] | null;
}

type Row =
  | { type: 'line'; key: string; left: Cell | null; right: Cell | null }
  | { type: 'fold'; key: string; lines: DiffLine[] };

function toBlocks(lines: DiffLine[]): Block[] {
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line) break;

    if (line.kind === 'ctx') {
      const run: DiffLine[] = [];
      while (index < lines.length && lines[index]?.kind === 'ctx') {
        run.push(lines[index] as DiffLine);
        index += 1;
      }
      blocks.push({ kind: 'ctx', lines: run });
      continue;
    }

    if (line.kind === 'meta') {
      const run: DiffLine[] = [];
      while (index < lines.length && lines[index]?.kind === 'meta') {
        run.push(lines[index] as DiffLine);
        index += 1;
      }
      blocks.push({ kind: 'meta', lines: run });
      continue;
    }

    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (index < lines.length && lines[index]?.kind === 'del') {
      dels.push(lines[index] as DiffLine);
      index += 1;
    }
    while (index < lines.length && lines[index]?.kind === 'add') {
      adds.push(lines[index] as DiffLine);
      index += 1;
    }
    if (dels.length === 0 && adds.length === 0) {
      index += 1;
      continue;
    }
    blocks.push({ kind: 'change', dels, adds });
  }

  return blocks;
}

/** Lines of context kept either side of a fold. Three is what git shows. */
const FOLD_EDGE = 3;

interface RowOptions {
  split: boolean;
  foldThreshold: number;
  expanded: ReadonlySet<string>;
  keyPrefix: string;
}

function buildRows(hunk: DiffHunk, options: RowOptions): Row[] {
  const blocks = toBlocks(hunk.lines);
  const rows: Row[] = [];
  const { keyPrefix } = options;

  blocks.forEach((block, blockIndex) => {
    const foldKey = `${keyPrefix}:f${blockIndex}`;

    if (block.kind === 'meta') {
      block.lines.forEach((line, i) => {
        rows.push({
          type: 'line',
          key: `${keyPrefix}:m${blockIndex}:${i}`,
          left: { line, ranges: null },
          right: options.split ? { line, ranges: null } : null,
        });
      });
      return;
    }

    if (block.kind === 'ctx') {
      const total = block.lines.length;
      const foldable =
        options.foldThreshold > 0 &&
        total > options.foldThreshold &&
        !options.expanded.has(foldKey);

      if (!foldable) {
        block.lines.forEach((line, i) => pushLine(rows, options, `${keyPrefix}:c${blockIndex}:${i}`, line));
        return;
      }

      const first = blockIndex === 0;
      const last = blockIndex === blocks.length - 1;
      const head = first ? 0 : FOLD_EDGE;
      const tail = last ? 0 : FOLD_EDGE;
      const hidden = block.lines.slice(head, total - tail);

      block.lines
        .slice(0, head)
        .forEach((line, i) => pushLine(rows, options, `${keyPrefix}:c${blockIndex}:${i}`, line));
      rows.push({ type: 'fold', key: foldKey, lines: hidden });
      block.lines
        .slice(total - tail)
        .forEach((line, i) =>
          pushLine(rows, options, `${keyPrefix}:c${blockIndex}:t${i}`, line),
        );
      return;
    }

    const pairs = pairLines(
      block.dels.map((l) => l.content),
      block.adds.map((l) => l.content),
    );

    if (options.split) {
      const height = Math.max(block.dels.length, block.adds.length);
      for (let i = 0; i < height; i += 1) {
        const del = block.dels[i];
        const add = block.adds[i];
        const pair = pairs[i] ?? null;
        rows.push({
          type: 'line',
          key: `${keyPrefix}:p${blockIndex}:${i}`,
          left: del ? { line: del, ranges: pair?.del ?? null } : null,
          right: add ? { line: add, ranges: pair?.add ?? null } : null,
        });
      }
      return;
    }

    block.dels.forEach((line, i) => {
      rows.push({
        type: 'line',
        key: `${keyPrefix}:d${blockIndex}:${i}`,
        left: { line, ranges: pairs[i]?.del ?? null },
        right: null,
      });
    });
    block.adds.forEach((line, i) => {
      rows.push({
        type: 'line',
        key: `${keyPrefix}:a${blockIndex}:${i}`,
        left: { line, ranges: pairs[i]?.add ?? null },
        right: null,
      });
    });
  });

  return rows;
}

function pushLine(rows: Row[], options: RowOptions, key: string, line: DiffLine): void {
  rows.push({
    type: 'line',
    key,
    left: { line, ranges: null },
    right: options.split ? { line, ranges: null } : null,
  });
}

/* -------------------------------------------------------------------------- */
/* Line rendering                                                             */
/* -------------------------------------------------------------------------- */

const SIGN: Record<DiffLine['kind'], string> = { add: '+', del: '−', ctx: ' ', meta: ' ' };

const Code = memo(function Code({
  content,
  lang,
  ranges,
}: {
  content: string;
  lang: Language;
  ranges: Range[] | null;
}) {
  const segments: Segment[] = useMemo(() => segmentsFor(content, lang, ranges), [content, lang, ranges]);
  return (
    <>
      {segments.map((segment, i) => (
        <span
          // Segments are positional slices of one immutable line; the index is
          // the only stable identity they have and the list never reorders.
          key={i}
          className={cx(`on-rev-t-${segment.kind}`, segment.changed && 'on-rev-word')}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
});

function rowClass(line: DiffLine | null): string {
  if (!line) return 'on-rev-row--empty';
  if (line.kind === 'add') return 'on-rev-row--add';
  if (line.kind === 'del') return 'on-rev-row--del';
  if (line.kind === 'meta') return 'on-rev-row--meta';
  return '';
}

function LineRow({ row, lang, split }: { row: Row & { type: 'line' }; lang: Language; split: boolean }) {
  if (!split) {
    const cell = row.left;
    const line = cell?.line ?? null;
    return (
      <div className={cx('on-rev-row', rowClass(line))}>
        <span className="on-rev-cell on-rev-num">{line?.oldLine ?? ''}</span>
        <span className="on-rev-cell on-rev-num on-rev-num--new">{line?.newLine ?? ''}</span>
        <span className="on-rev-cell on-rev-src">
          <span className="on-rev-sign">{line ? SIGN[line.kind] : ' '}</span>
          {line ? <Code content={line.content} lang={lang} ranges={cell?.ranges ?? null} /> : null}
        </span>
      </div>
    );
  }

  const left = row.left;
  const right = row.right;
  return (
    <div className="on-rev-row">
      <span className={cx('on-rev-cell on-rev-num', rowClass(left?.line ?? null))}>
        {left?.line.oldLine ?? ''}
      </span>
      <span className={cx('on-rev-cell on-rev-src', rowClass(left?.line ?? null))}>
        {left ? <Code content={left.line.content} lang={lang} ranges={left.ranges} /> : null}
      </span>
      <span className={cx('on-rev-cell on-rev-num on-rev-num--new', rowClass(right?.line ?? null))}>
        {right?.line.newLine ?? ''}
      </span>
      <span className={cx('on-rev-cell on-rev-src', rowClass(right?.line ?? null))}>
        {right ? <Code content={right.line.content} lang={lang} ranges={right.ranges} /> : null}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hunk                                                                       */
/* -------------------------------------------------------------------------- */

export interface HunkRowsProps {
  hunk: DiffHunk;
  hunkIndex: number;
  lang: Language;
  split?: boolean;
  wrap?: boolean;
  /** Context runs longer than this collapse. 0 disables folding entirely. */
  foldThreshold?: number;
  /** Cap on rendered rows; the rest sit behind a "show more" affordance. */
  maxRows?: number;
  showHeader?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const CHUNK_ROWS = 600;

export function HunkRows({
  hunk,
  hunkIndex,
  lang,
  split = false,
  wrap = false,
  foldThreshold = 12,
  maxRows,
  showHeader = true,
  collapsed = false,
  onToggleCollapse,
}: HunkRowsProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [budget, setBudget] = useState(CHUNK_ROWS);

  const rows = useMemo(
    () =>
      buildRows(hunk, {
        split,
        foldThreshold,
        expanded,
        keyPrefix: `h${hunkIndex}`,
      }),
    [hunk, split, foldThreshold, expanded, hunkIndex],
  );

  const unfold = useCallback((key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      next.add(key);
      return next;
    });
  }, []);

  const limit = Math.min(maxRows ?? rows.length, budget);
  const visible = rows.slice(0, limit);
  const remaining = rows.length - visible.length;

  const stat = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const line of hunk.lines) {
      if (line.kind === 'add') add += 1;
      else if (line.kind === 'del') del += 1;
    }
    return { add, del };
  }, [hunk]);

  const doubleTap = useDoubleTap(onToggleCollapse);

  return (
    <div
      className={cx('on-rev-rows', wrap && 'on-rev-rows--wrap', split && 'on-rev-rows--split')}
      {...doubleTap}
    >
      {showHeader ? (
        <div className="on-rev-hunk-head">
          <button
            type="button"
            className="on-rev-hunk-head__inner on-rev-hunk-btn"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
          >
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
            <span>
              @@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            </span>
            <span className="on-rev-stat on-rev-stat--muted">
              <span className="on-rev-stat__add">+{stat.add}</span>
              <span className="on-rev-stat__del">−{stat.del}</span>
            </span>
            {hunk.header ? <span className="on-rev-hunk-head__label">{hunk.header}</span> : null}
          </button>
        </div>
      ) : null}

      {collapsed
        ? null
        : visible.map((row) =>
            row.type === 'fold' ? (
              <div className="on-rev-fold" key={row.key}>
                <button type="button" className="on-rev-fold__btn" onClick={() => unfold(row.key)}>
                  <span aria-hidden="true">⋯</span>
                  <span>
                    {row.lines.length} unchanged line{row.lines.length === 1 ? '' : 's'}
                  </span>
                </button>
              </div>
            ) : (
              <LineRow key={row.key} row={row} lang={lang} split={split} />
            ),
          )}

      {!collapsed && remaining > 0 && maxRows === undefined ? (
        <div className="on-rev-fold">
          <button
            type="button"
            className="on-rev-fold__btn"
            onClick={() => setBudget((b) => b + CHUNK_ROWS)}
          >
            <span aria-hidden="true">↓</span>
            <span>Show {Math.min(remaining, CHUNK_ROWS)} more lines</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Double-tap                                                                 */
/* -------------------------------------------------------------------------- */

const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 26;

/**
 * `dblclick` is unreliable on touch, so the gesture is measured directly.
 * A drift threshold keeps it from firing at the end of a flick-scroll.
 */
function useDoubleTap(fn: (() => void) | undefined) {
  const last = useRef<{ t: number; x: number; y: number } | null>(null);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (!fn) return;
      const now = Date.now();
      const previous = last.current;
      last.current = { t: now, x: event.clientX, y: event.clientY };
      if (!previous) return;
      if (now - previous.t > DOUBLE_TAP_MS) return;
      if (Math.abs(event.clientX - previous.x) > DOUBLE_TAP_SLOP) return;
      if (Math.abs(event.clientY - previous.y) > DOUBLE_TAP_SLOP) return;
      // Never steal a tap that landed on a control inside the hunk.
      if ((event.target as HTMLElement | null)?.closest('button')) return;
      last.current = null;
      fn();
    },
    [fn],
  );

  return fn ? { onPointerUp } : {};
}

/* -------------------------------------------------------------------------- */
/* Body                                                                       */
/* -------------------------------------------------------------------------- */

export interface DiffBodyProps {
  parsed: ParsedPatch;
  lang: Language;
  split?: boolean;
  wrap?: boolean;
  foldThreshold?: number;
  /** Total rows to render across all hunks — used by the compact card. */
  maxRows?: number;
  showHunkHeaders?: boolean;
  /** Rendered when the patch carries no hunks (binary, empty, unparsable). */
  fallback?: ReactNode;
  className?: string;
  /** Hunks are mounted only as they approach the viewport when set. */
  lazy?: boolean;
}

export function DiffBody({
  parsed,
  lang,
  split = false,
  wrap = false,
  foldThreshold = 12,
  maxRows,
  showHunkHeaders = true,
  fallback,
  className,
  lazy = false,
}: DiffBodyProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set<number>());

  const toggle = useCallback((index: number) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  if (parsed.binary) {
    return <div className="on-rev-empty">Binary file — no textual diff.</div>;
  }
  if (parsed.hunks.length === 0) {
    return <>{fallback ?? <div className="on-rev-empty">No changes in this file.</div>}</>;
  }

  // The compact card spends its whole row budget on the first hunks.
  let spent = 0;

  return (
    <div className={cx('on-rev-scroller', 'on-rev-code', wrap && 'on-rev-scroller--wrap', className)}>
      {parsed.hunks.map((hunk, index) => {
        if (maxRows !== undefined && spent >= maxRows) return null;
        const budget = maxRows === undefined ? undefined : maxRows - spent;
        spent += hunk.lines.length;

        const rows = (
          <HunkRows
            hunk={hunk}
            hunkIndex={index}
            lang={lang}
            split={split}
            wrap={wrap}
            foldThreshold={foldThreshold}
            {...(budget === undefined ? {} : { maxRows: budget })}
            showHeader={showHunkHeaders}
            collapsed={collapsed.has(index)}
            onToggleCollapse={() => toggle(index)}
          />
        );

        return lazy ? (
          <LazyHunk key={index} lines={hunk.lines.length} hasHeader={showHunkHeaders}>
            {rows}
          </LazyHunk>
        ) : (
          <div key={index} style={{ display: 'contents' }}>
            {rows}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Lazy hunk mounting                                                         */
/* -------------------------------------------------------------------------- */

/** Approximate row height at the default code size, for the placeholder. */
const ROW_PX = 20;

/**
 * A 5000-line diff is thousands of DOM nodes; mounting them all is what makes
 * a diff viewer feel broken on a tablet. Each hunk stays a sized placeholder
 * until it comes within a screen of the viewport, then mounts — and stays
 * mounted, because unmounting behind the scroll position causes jumps.
 */
function LazyHunk({
  lines,
  hasHeader,
  children,
}: {
  lines: number;
  hasHeader: boolean;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const attach = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(node);
  }, []);

  if (shown) return <div style={{ display: 'contents' }}>{children}</div>;

  return (
    <div
      ref={attach}
      className="on-rev-hunk-placeholder"
      style={{ height: lines * ROW_PX + (hasHeader ? 30 : 0) }}
      aria-hidden="true"
    />
  );
}
