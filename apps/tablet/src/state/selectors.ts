import { useMemo } from 'react';
import type {
  GitState,
  Message,
  PermissionRequest,
  ProviderDescriptor,
  Thread,
  ThreadId,
} from '@ornight/protocol';
import { providerOf } from '@ornight/protocol/providers';
import { useOrnight } from './store';

/**
 * Read-side API for the UI. Components use these hooks rather than reaching
 * into the store shape, so the store can change without a UI rewrite.
 */

export function useActiveThread(): Thread | null {
  return useOrnight((s) => (s.activeThreadId ? (s.threads[s.activeThreadId] ?? null) : null));
}

export function useThread(id: ThreadId | null | undefined): Thread | null {
  return useOrnight((s) => (id ? (s.threads[id] ?? null) : null));
}

/** Thread list for the sidebar: pinned first, archived excluded. */
export function useThreadList(includeArchived = false): Thread[] {
  const order = useOrnight((s) => s.threadOrder);
  const threads = useOrnight((s) => s.threads);
  return useMemo(() => {
    const list = order.map((id) => threads[id]).filter((t): t is Thread => Boolean(t));
    return includeArchived ? list : list.filter((t) => !t.archived);
  }, [order, threads, includeArchived]);
}

export function useMessages(id: ThreadId | null | undefined): Message[] {
  const empty = useMemo<Message[]>(() => [], []);
  return useOrnight((s) => (id ? (s.messages[id] ?? empty) : empty));
}

export function useGitState(id: ThreadId | null | undefined): GitState | null {
  return useOrnight((s) => (id ? (s.git[id] ?? null) : null));
}

/** Permission requests for one thread, oldest first. */
export function usePendingPermissions(id: ThreadId | null | undefined): PermissionRequest[] {
  const all = useOrnight((s) => s.pendingPermissions);
  return useMemo(() => (id ? all.filter((p) => p.threadId === id) : all), [all, id]);
}

export function useProvider(thread: Thread | null): ProviderDescriptor {
  return useMemo(() => providerOf(thread?.provider ?? 'mock'), [thread?.provider]);
}

/** Total changed-file count across all live threads, for the sidebar badge. */
export function useTotalChanges(): number {
  const git = useOrnight((s) => s.git);
  return useMemo(
    () => Object.values(git).reduce((total, g) => total + (g?.files.length ?? 0), 0),
    [git],
  );
}

export function useConnection() {
  return useOrnight((s) => s.connection);
}

/**
 * Layout mode for the current viewport. Mini tablets are ~7–8.5", so the
 * breakpoints are tuned lower than a desktop app's: portrait gets one column
 * with an overlay sidebar, landscape gets a persistent rail plus a side panel.
 */
export type LayoutMode = 'compact-portrait' | 'portrait' | 'landscape' | 'wide';

export function layoutFor(width: number, height: number): LayoutMode {
  const portrait = height >= width;
  if (portrait) return width < 620 ? 'compact-portrait' : 'portrait';
  return width >= 1180 ? 'wide' : 'landscape';
}
