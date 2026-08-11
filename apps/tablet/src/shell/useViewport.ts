import { useSyncExternalStore } from 'react';
import { layoutFor, type LayoutMode } from '@/state/selectors';

export interface Viewport {
  width: number;
  height: number;
  portrait: boolean;
  mode: LayoutMode;
  /** True for the two modes where the sidebar is an overlay drawer. */
  overlaySidebar: boolean;
}

/**
 * One module-level viewport snapshot shared by every consumer. `useSyncExternalStore`
 * needs a stable object identity between resizes or React tears on every render, so
 * the snapshot is only rebuilt when the dimensions actually change.
 */
function compute(width: number, height: number): Viewport {
  const mode = layoutFor(width, height);
  return {
    width,
    height,
    portrait: height >= width,
    mode,
    overlaySidebar: mode === 'portrait' || mode === 'compact-portrait',
  };
}

const SERVER_SNAPSHOT: Viewport = compute(1024, 768);

let current: Viewport =
  typeof window === 'undefined' ? SERVER_SNAPSHOT : compute(window.innerWidth, window.innerHeight);

const listeners = new Set<() => void>();

function refresh(): void {
  const next = compute(window.innerWidth, window.innerHeight);
  if (next.width === current.width && next.height === current.height) return;
  current = next;
  for (const listener of listeners) listener();
}

/** `orientationchange` fires before the metrics settle on some tablets, so re-read after a frame. */
function onOrientationChange(): void {
  refresh();
  requestAnimationFrame(refresh);
  window.setTimeout(refresh, 200);
}

function subscribe(onStoreChange: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('orientationchange', onOrientationChange, { passive: true });
  }
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', onOrientationChange);
    }
  };
}

function getSnapshot(): Viewport {
  return current;
}

function getServerSnapshot(): Viewport {
  return SERVER_SNAPSHOT;
}

/** Live viewport size plus the derived layout mode from `@/state/selectors`. */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type { LayoutMode };
