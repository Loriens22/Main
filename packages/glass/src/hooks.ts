import type * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * True when the operator has asked the system for less motion, or when the
 * app has been put into reduced-glass mode from settings. Both mean the same
 * thing to a component: cut the movement, keep the information.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => readReducedMotion());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(readReducedMotion());
    query.addEventListener('change', sync);

    // The reduced-glass flag lives on <html data-glass>, so watch it too.
    const root = document.documentElement;
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-glass'] });

    sync();
    return () => {
      query.removeEventListener('change', sync);
      observer.disconnect();
    };
  }, []);

  return reduced;
}

function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (document.documentElement.getAttribute('data-glass') === 'reduced') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface LongPressHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerLeave: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
  /** True while the press is being held — useful for a pressed-state visual. */
  pressed: boolean;
  /** Call from a click handler to know whether the long press already fired. */
  consumed: () => boolean;
}

/**
 * Long-press, the touch replacement for hover. Any affordance that would be a
 * hover reveal on a desktop gets one of these on a tablet.
 *
 * Cancels if the finger drifts more than ~10px, so it never fights a scroll.
 */
export function useLongPress(fn: () => void, ms = 480): LongPressHandlers {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(fn);
  const [pressed, setPressed] = useState(false);
  callback.current = fn;

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
    setPressed(false);
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      setPressed(true);
      const move = (moveEvent: PointerEvent) => {
        const start = origin.current;
        if (!start) return;
        if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) > 10) {
          window.removeEventListener('pointermove', move);
          clear();
        }
      };
      window.addEventListener('pointermove', move, { passive: true });
      timer.current = window.setTimeout(() => {
        window.removeEventListener('pointermove', move);
        fired.current = true;
        clear();
        callback.current();
      }, ms);
    },
    [clear, ms],
  );

  const onContextMenu = useCallback((event: React.MouseEvent) => {
    // Suppress the OS callout so the long press is ours.
    event.preventDefault();
  }, []);

  const consumed = useCallback(() => fired.current, []);

  return {
    onPointerDown,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu,
    pressed,
    consumed,
  };
}

/** Stable per-instance id, used for SVG gradient ids that must not collide. */
export function useUid(prefix: string): string {
  const ref = useRef<string | null>(null);
  if (ref.current === null) {
    uidCounter += 1;
    ref.current = `${prefix}-${uidCounter.toString(36)}`;
  }
  return ref.current;
}

let uidCounter = 0;
