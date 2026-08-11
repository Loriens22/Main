import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ProviderId } from '@ornight/protocol';
import { SPRING, useReducedMotion } from '@ornight/glass';
import { GlassSheet } from '@ornight/glass';
import { ChangesPanel, ShipSheet } from '@/review';
import { useOrnight } from '@/state/store';
import { useActiveThread, useGitState } from '@/state/selectors';
import { Conversation } from '@/chat/Conversation';
import { Composer } from '@/chat/Composer';
import { EmptyState } from '@/chat/EmptyState';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { NewThreadSheet } from './NewThreadSheet';
import { SettingsSheet } from './SettingsSheet';
import { ShellProvider, type ShellApi } from './ShellContext';
import { useViewport } from './useViewport';
import './AppShell.css';

/**
 * The root layout, mounted by the lead once the splash sequence completes.
 *
 * Two invariants drive the structure:
 *
 *  1. The sidebar is always in the tree, because `<OrnightBadge/>` at its top
 *     is the landing target for the splash → badge `layoutId` morph.
 *  2. The chat column occupies one fixed slot in the tree for every layout
 *     mode, so rotating the tablet reflows the shell without ever remounting
 *     the conversation — scroll position, draft and streaming state survive.
 */
export function AppShell() {
  const viewport = useViewport();
  const { mode, overlaySidebar } = viewport;
  const reducedMotion = useReducedMotion();

  const activeThread = useActiveThread();
  const threadId = activeThread?.id ?? null;

  const panel = useOrnight((s) => s.panel);
  const setPanel = useOrnight((s) => s.setPanel);
  const sidebarOpen = useOrnight((s) => s.sidebarOpen);
  const setSidebar = useOrnight((s) => s.setSidebar);

  const git = useGitState(threadId);
  const changeCount = git?.files.length ?? 0;

  const [newThread, setNewThread] = useState<{ open: boolean; provider: ProviderId | null }>({
    open: false,
    provider: null,
  });

  /*
   * Rotation resets the drawer: a persistent rail in landscape, a closed
   * overlay in portrait. Without this, rotating to portrait would leave a
   * full-height drawer sitting on top of the conversation.
   */
  const lastMode = useRef<string | null>(null);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    setSidebar(!overlaySidebar);
  }, [mode, overlaySidebar, setSidebar]);

  /* In `wide` the review column is always on screen, so the sheet panel is
   * meaningless — fold it back to chat rather than opening an empty sheet. */
  useEffect(() => {
    if (mode === 'wide' && panel === 'changes') setPanel('chat');
  }, [mode, panel, setPanel]);

  const shell = useMemo<ShellApi>(
    () => ({
      openNewThread(provider) {
        setNewThread({ open: true, provider: provider ?? null });
      },
      openSettings() {
        setPanel('settings');
      },
      dismissSidebar() {
        if (overlaySidebar) setSidebar(false);
      },
    }),
    [overlaySidebar, setPanel, setSidebar],
  );

  const closePanel = useCallback(() => setPanel('chat'), [setPanel]);
  const closeNewThread = useCallback(() => setNewThread({ open: false, provider: null }), []);

  const sidebarHidden = overlaySidebar && !sidebarOpen;
  const springy = reducedMotion ? { duration: 0 } : SPRING.glide;

  const changesOpen = mode !== 'wide' && panel === 'changes' && threadId !== null;
  const shipOpen = panel === 'ship' && threadId !== null;

  return (
    <ShellProvider value={shell}>
      <div className="on-shell-root" data-mode={mode} data-overlay={overlaySidebar ? 'true' : 'false'}>
        <div className="on-shell-body">
          <AnimatePresence initial={false}>
            {overlaySidebar && sidebarOpen ? (
              <motion.button
                type="button"
                className="on-shell-scrim"
                aria-label="Close navigation"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.66 }}
                exit={{ opacity: 0 }}
                transition={reducedMotion ? { duration: 0 } : SPRING.soft}
                onClick={() => setSidebar(false)}
              />
            ) : null}
          </AnimatePresence>

          <motion.aside
            className="on-shell-side"
            animate={{ x: sidebarHidden ? '-102%' : '0%' }}
            initial={false}
            transition={springy}
            aria-hidden={sidebarHidden}
            {...(sidebarHidden ? { inert: '' } : null)}
          >
            <Sidebar />
          </motion.aside>

          <main className="on-shell-chat">
            <StatusBar threadId={threadId} mode={mode} changeCount={changeCount} />
            {threadId ? (
              <>
                <Conversation key={threadId} threadId={threadId} />
                <Composer threadId={threadId} />
              </>
            ) : (
              <EmptyState />
            )}
          </main>

          {mode === 'wide' && threadId ? (
            <motion.aside
              className="on-shell-review"
              initial={reducedMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={springy}
            >
              <ChangesPanel threadId={threadId} />
            </motion.aside>
          ) : null}
        </div>

        {mode === 'compact-portrait' ? (
          <TabBar panel={panel} onSelect={setPanel} changeCount={changeCount} disabled={!threadId} />
        ) : null}
      </div>

      {threadId ? (
        <GlassSheet
          open={changesOpen}
          onClose={closePanel}
          title="Changes"
          side={mode === 'landscape' ? 'right' : 'bottom'}
          size={mode === 'compact-portrait' ? 'full' : 'lg'}
        >
          <div className="on-shell-sheet-body">
            <ChangesPanel threadId={threadId} />
          </div>
        </GlassSheet>
      ) : null}

      {threadId ? <ShipSheet threadId={threadId} open={shipOpen} onClose={closePanel} /> : null}

      <SettingsSheet open={panel === 'settings'} onClose={closePanel} />

      <NewThreadSheet
        open={newThread.open}
        onClose={closeNewThread}
        initialProvider={newThread.provider}
      />
    </ShellProvider>
  );
}
