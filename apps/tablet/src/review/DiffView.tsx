/**
 * review/DiffView.tsx
 *
 * The diff viewer. On a 7–8.5" screen a desktop side-by-side diff is unusable,
 * so the default here is unified, word-level intra-line emphasis carries the
 * detail that columns would otherwise carry, and split view only offers itself
 * when there is genuinely room for it (≥1024px of *container*, not window).
 *
 * The three controls that matter on a tablet, in order of how often they get
 * used: font size, wrap, split.
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FilePatch } from '@ornight/protocol';
import { GlassIconButton, GlassSegmented, cx } from '@ornight/glass';
import { DiffBody } from './DiffRows';
import { KindGlyph, PathLabel, StatPair } from './atoms';
import { LANGUAGE_LABEL, detectLanguage, parsePatch } from './parse';
import { CHANGE_KIND_LABEL } from './util';
import './DiffView.css';

/** Below this container width a second column costs more than it gives. */
const SPLIT_MIN_WIDTH = 1024;

const FONT_MIN = 10;
const FONT_MAX = 19;
const FONT_DEFAULT = 12.5;
const FONT_KEY = 'ornight.review.fontSize';
const WRAP_KEY = 'ornight.review.wrap';

export interface DiffViewProps {
  patch: FilePatch;
  /** Extra header controls — the changes panel puts revert / copy path here. */
  actions?: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function DiffView({ patch, actions, onClose, className }: DiffViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const width = useContainerWidth(rootRef);

  const [fontSize, setFontSize] = usePersisted<number>(FONT_KEY, FONT_DEFAULT);
  const [wrap, setWrap] = usePersisted<boolean>(WRAP_KEY, false);
  const [mode, setMode] = useState<'unified' | 'split'>('unified');

  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const lang = useMemo(() => detectLanguage(patch.path), [patch.path]);

  const canSplit = width >= SPLIT_MIN_WIDTH;
  const split = canSplit && mode === 'split';

  const step = useCallback(
    (delta: number) => {
      setFontSize((current) => clamp(Math.round((current + delta) * 2) / 2, FONT_MIN, FONT_MAX));
    },
    [setFontSize],
  );

  return (
    <div
      ref={rootRef}
      className={cx('on-rev-diff', className)}
      style={{ ['--on-rev-code-size' as string]: `${fontSize}px` }}
    >
      <header className="on-rev-diff__head">
        <div className="on-rev-diff__id">
          <KindGlyph kind={patch.kind} />
          <PathLabel path={patch.path} className="on-rev-diff__path" />
          <StatPair insertions={patch.insertions} deletions={patch.deletions} />
        </div>

        <div className="on-rev-diff__meta">
          <span>{CHANGE_KIND_LABEL[patch.kind]}</span>
          <span aria-hidden="true">·</span>
          <span>{LANGUAGE_LABEL[lang]}</span>
          {patch.previousPath ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="on-rev-diff__from">was {patch.previousPath}</span>
            </>
          ) : null}
        </div>

        <div className="on-rev-diff__tools">
          {canSplit ? (
            <GlassSegmented
              size="sm"
              value={mode}
              onChange={(value) => setMode(value === 'split' ? 'split' : 'unified')}
              options={[
                { value: 'unified', label: 'Unified' },
                { value: 'split', label: 'Split' },
              ]}
            />
          ) : null}

          <div className="on-rev-diff__stepper" role="group" aria-label="Code size">
            <GlassIconButton
              label="Smaller code"
              size="sm"
              onClick={() => step(-1)}
              disabled={fontSize <= FONT_MIN}
            >
              A−
            </GlassIconButton>
            <span className="on-rev-diff__size" aria-live="polite">
              {fontSize}
            </span>
            <GlassIconButton
              label="Larger code"
              size="sm"
              onClick={() => step(1)}
              disabled={fontSize >= FONT_MAX}
            >
              A+
            </GlassIconButton>
          </div>

          <GlassIconButton
            label={wrap ? 'Disable line wrapping' : 'Enable line wrapping'}
            size="sm"
            active={wrap}
            onClick={() => setWrap((w) => !w)}
          >
            ⏎
          </GlassIconButton>

          {actions}

          {onClose ? (
            <GlassIconButton label="Close diff" size="sm" onClick={onClose}>
              ✕
            </GlassIconButton>
          ) : null}
        </div>
      </header>

      <div className="on-rev-diff__scroll">
        <DiffBody
          parsed={parsed}
          lang={lang}
          split={split}
          wrap={wrap}
          lazy
          foldThreshold={12}
          fallback={
            <div className="on-rev-empty">
              {patch.binary
                ? 'Binary file — no textual diff.'
                : `${CHANGE_KIND_LABEL[patch.kind]} with no diff body.`}
            </div>
          }
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Container width, not window width: the viewer lives in a right column on a
 * wide layout and in a full sheet on a narrow one, and only its own box knows
 * whether a second column fits.
 */
function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof ResizeObserver === 'undefined') {
      setWidth(node.getBoundingClientRect().width);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

type Setter<T> = (next: T | ((current: T) => T)) => void;

/** Preferences that should survive a reload but are not worth a store slice. */
function usePersisted<T extends string | number | boolean>(key: string, initial: T): [T, Setter<T>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === typeof initial ? (parsed as T) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback<Setter<T>>(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* Private mode / quota — the preference is simply not remembered. */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
