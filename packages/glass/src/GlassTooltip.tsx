import type { HTMLAttributes, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cx } from './cx';
import { SPRING } from './motion';
import { useLongPress, useReducedMotion } from './hooks';

export interface GlassTooltipProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  children?: ReactNode;
}

/**
 * Hover on a pointer device, long-press on a touch device — the contract says
 * no hover-only affordances, and a tooltip is the most common way that rule
 * gets broken. The long-press variant auto-dismisses after 2.2s.
 */
export function GlassTooltip({ label, className, children, ...rest }: GlassTooltipProps) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const dismiss = useRef<number | null>(null);

  const show = useCallback(() => {
    setOpen(true);
    if (dismiss.current !== null) window.clearTimeout(dismiss.current);
    dismiss.current = window.setTimeout(() => setOpen(false), 2200);
  }, []);

  const press = useLongPress(show, 420);

  useEffect(
    () => () => {
      if (dismiss.current !== null) window.clearTimeout(dismiss.current);
    },
    [],
  );

  return (
    <span
      className={cx('on-tip', className)}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={(event) => {
        press.onPointerLeave(event);
        setOpen(false);
      }}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      {...rest}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span
            role="tooltip"
            className="on-tip__bubble"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0.12 } : SPRING.snappy}
            style={{ x: '-50%' }}
          >
            {label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
