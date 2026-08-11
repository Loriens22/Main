import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cx } from './cx';
import { SPRING } from './motion';
import { useReducedMotion } from './hooks';
import { GlassIconButton } from './GlassIconButton';

export type SheetSide = 'bottom' | 'right' | 'center';
export type SheetSize = 'sm' | 'md' | 'lg' | 'full';

/**
 * The drag and animation DOM handlers are dropped: framer-motion redefines
 * those names with its own gesture signatures, and a sheet has no use for the
 * native ones.
 */
type SheetDivProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  | 'title'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragExit'
  | 'onDragLeave'
  | 'onDragOver'
  | 'onDrop'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onTransitionEnd'
>;

export interface GlassSheetProps extends SheetDivProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: SheetSide;
  size?: SheetSize;
  children?: ReactNode;
}

const ENTER: Record<SheetSide, { from: Record<string, number>; to: Record<string, number> }> = {
  bottom: { from: { y: 44, opacity: 0 }, to: { y: 0, opacity: 1 } },
  right: { from: { x: 44, opacity: 0 }, to: { x: 0, opacity: 1 } },
  center: { from: { scale: 0.94, opacity: 0 }, to: { scale: 1, opacity: 1 } },
};

/**
 * The one modal surface in the app. On a mini tablet a sheet is almost always
 * better than a dialog: it comes from an edge, it keeps a thumb near it, and
 * it dismisses by tapping the scrim. `center` exists for short confirmations.
 */
export function GlassSheet({
  open,
  onClose,
  title,
  side = 'bottom',
  size = 'md',
  className,
  children,
  ...rest
}: GlassSheetProps) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const enter = ENTER[side];

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="scrim"
            className="on-sheet__scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            className={cx('on-sheet', `on-sheet--${side}`, `on-sheet--${size}`, className)}
            initial={reduced ? { opacity: 0 } : enter.from}
            animate={reduced ? { opacity: 1 } : enter.to}
            exit={reduced ? { opacity: 0 } : enter.from}
            transition={reduced ? { duration: 0.18 } : SPRING.soft}
            style={side === 'center' ? { translateX: '-50%', translateY: '-50%' } : undefined}
            {...rest}
          >
            <span className="on-sheet__edge" aria-hidden="true" />
            {side === 'bottom' ? <span className="on-sheet__grip" aria-hidden="true" /> : null}
            {title != null ? (
              <header className="on-sheet__head">
                <div className="on-sheet__title">{title}</div>
                <GlassIconButton label="Close" onClick={onClose}>
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <path
                      d="M4.5 4.5 13.5 13.5M13.5 4.5 4.5 13.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </GlassIconButton>
              </header>
            ) : null}
            <div className="on-sheet__body">{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
