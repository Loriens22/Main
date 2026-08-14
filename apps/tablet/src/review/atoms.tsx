/**
 * review/atoms.tsx — the three tiny presentational pieces every review surface
 * repeats: the change-kind glyph, the `+N −M` stat pair, and a file path that
 * always keeps its filename readable.
 */

import type { FileChangeKind } from '@ornight/protocol';
import { cx } from '@ornight/glass';
import { CHANGE_KIND_GLYPH, CHANGE_KIND_LABEL, splitPath } from './util';
import './tokens.css';

export function KindGlyph({ kind, className }: { kind: FileChangeKind; className?: string }) {
  return (
    <span
      className={cx('on-rev-kind', `on-rev-kind--${kind}`, className)}
      title={CHANGE_KIND_LABEL[kind]}
      aria-label={CHANGE_KIND_LABEL[kind]}
      role="img"
    >
      {CHANGE_KIND_GLYPH[kind]}
    </span>
  );
}

export function StatPair({
  insertions,
  deletions,
  muted,
  className,
}: {
  insertions: number;
  deletions: number;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx('on-rev-stat', muted && 'on-rev-stat--muted', className)}
      aria-label={`${insertions} added, ${deletions} removed`}
    >
      <span className="on-rev-stat__add">+{insertions}</span>
      <span className="on-rev-stat__del">−{deletions}</span>
    </span>
  );
}

/**
 * The directory half ellipsises from the left (`direction: rtl`) while the
 * filename is pinned — so a deep path degrades to `…/review/DiffView.tsx`
 * rather than to `apps/tablet/src/rev…`.
 */
export function PathLabel({ path, className }: { path: string; className?: string }) {
  const { dir, name } = splitPath(path);
  return (
    <span className={cx('on-rev-path', className)} title={path}>
      {dir ? (
        <bdi className="on-rev-path__dir">{dir}</bdi>
      ) : null}
      <span className="on-rev-path__name">{name}</span>
    </span>
  );
}
