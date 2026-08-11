import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react';
import { LayoutGroup } from 'framer-motion';
import type { Transport } from '@ornight/protocol';
import { SplashSequence } from '@/brand';
import { AppShell } from '@/shell';
import { DemoTransport } from '@/mock/demoTransport';
import { useOrnight } from '@/state/store';
import { WebSocketTransport, resolveDaemonUrl } from '@/state/wsTransport';

/**
 * The application root.
 *
 * Two jobs, and deliberately nothing else: pick the transport, and run the
 * splash → shell handoff. Everything past that point is the shell's problem.
 */
export function App() {
  const [showSplash, setShowSplash] = useState(true);
  const attach = useOrnight((s) => s.attach);
  const detach = useOrnight((s) => s.detach);
  const setReducedGlass = useOrnight((s) => s.setReducedGlass);

  useEffect(() => {
    const url = resolveDaemonUrl();
    const transport: Transport = url ? new WebSocketTransport(url) : new DemoTransport();
    attach(transport);
    return () => detach();
  }, [attach, detach]);

  // Restore the operator's glass preference before first paint of the shell, so
  // a device that was set to reduced glass never flashes the expensive version.
  useEffect(() => {
    try {
      if (localStorage.getItem('ornight.reducedGlass') === 'true') setReducedGlass(true);
    } catch {
      /* private mode; the default is fine */
    }
  }, [setReducedGlass]);

  return (
    <ErrorBoundary>
      {/*
        LayoutGroup is what lets the splash brand and the sidebar badge be the
        same object: they share `LAYOUT_ID.brand`, so when the splash unmounts
        and the shell mounts in the same commit, framer-motion animates one
        into the other instead of crossfading two unrelated elements.
      */}
      <LayoutGroup>
        <div className="on-app">
          {!showSplash && <AppShell />}
          {showSplash && <SplashSequence onComplete={() => setShowSplash(false)} />}
        </div>
      </LayoutGroup>
    </ErrorBoundary>
  );
}

/* -------------------------------------------------------------------------- */

interface BoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Ornight crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="on-crash">
        <h1>Ornight hit an error</h1>
        <p>
          The interface stopped rather than showing you something wrong. Your threads and worktrees
          are untouched — reloading is safe.
        </p>
        <pre>{error.message}</pre>
        <button type="button" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
