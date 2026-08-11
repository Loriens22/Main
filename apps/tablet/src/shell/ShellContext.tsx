import { createContext, useContext } from 'react';
import type { ProviderId } from '@ornight/protocol';

/**
 * The few shell-level gestures that surfaces deeper in the tree need to reach:
 * opening the creation sheet from the empty state, opening settings from the
 * sidebar footer, dismissing the overlay drawer after a navigation. Keeping
 * them on a context avoids threading callbacks through four component layers.
 */
export interface ShellApi {
  /** Open the creation sheet, optionally with a provider pre-selected. */
  openNewThread(provider?: ProviderId): void;
  openSettings(): void;
  /** Close the overlay sidebar; a no-op in the persistent layouts. */
  dismissSidebar(): void;
}

const ShellContext = createContext<ShellApi | null>(null);

export const ShellProvider = ShellContext.Provider;

export function useShell(): ShellApi {
  const api = useContext(ShellContext);
  if (!api) throw new Error('useShell() must be called inside <AppShell>.');
  return api;
}
