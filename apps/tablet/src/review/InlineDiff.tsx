/**
 * review/InlineDiff.tsx
 *
 * The diff as it appears *inside the conversation* — attached to the tool card
 * that produced it. It answers "what did the agent just change?" in the two
 * seconds an operator gives it while scrolling, and hands off to the full
 * `DiffView` in a sheet the moment they want more.
 */

import { useMemo, useState } from 'react';
import type { FilePatch } from '@ornight/protocol';
import { GlassSheet, cx } from '@ornight/glass';
import { DiffBody } from './DiffRows';
import { DiffView } from './DiffView';
import { KindGlyph, PathLabel, StatPair } from './atoms';
import { detectLanguage, parsePatch } from './parse';
import { CHANGE_KIND_LABEL } from './util';
import './InlineDiff.css';

/** Rows the compact card shows before it defers to the full viewer. */
const COMPACT_ROWS = 12;
const FULL_ROWS = 200;

export interface InlineDiffProps {
  patch: FilePatch;
  compact?: boolean;
}

export function InlineDiff({ patch, compact }: InlineDiffProps) {
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const lang = useMemo(() => detectLanguage(patch.path), [patch.path]);

  const totalRows = useMemo(
    () => parsed.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0),
    [parsed],
  );
  const truncated = compact ? totalRows > COMPACT_ROWS : totalRows > FULL_ROWS;

  return (
    <div className={cx('on-rev-inline', compact && 'on-rev-inline--compact')}>
      <div className="on-rev-inline__head">
        <KindGlyph kind={patch.kind} />
        <PathLabel path={patch.path} className="on-rev-inline__path" />
        {patch.previousPath ? (
          <span className="on-rev-inline__from">from {patch.previousPath}</span>
        ) : null}
        <StatPair insertions={patch.insertions} deletions={patch.deletions} muted />
      </div>

      <DiffBody
        parsed={parsed}
        lang={lang}
        wrap={false}
        foldThreshold={compact ? 3 : 8}
        maxRows={compact ? COMPACT_ROWS : FULL_ROWS}
        showHunkHeaders={!compact}
        className="on-rev-inline__body"
        fallback={
          <div className="on-rev-empty">
            {CHANGE_KIND_LABEL[patch.kind]} — no textual diff available.
          </div>
        }
      />

      {truncated || !compact ? (
        <button type="button" className="on-rev-inline__more" onClick={() => setOpen(true)}>
          {truncated ? `Show full diff · ${totalRows} lines` : 'Open in diff viewer'}
        </button>
      ) : null}

      <GlassSheet
        open={open}
        onClose={() => setOpen(false)}
        side="bottom"
        size="full"
        title={<PathLabel path={patch.path} />}
      >
        <DiffView patch={patch} className="on-rev-inline__sheet" />
      </GlassSheet>
    </div>
  );
}
