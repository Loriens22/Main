import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { NavBar } from '@/components/NavBar';
import { Glass } from '@/glass/Glass';
import { autoGlassQuality, setGlassQuality, startGlassLighting } from '@/glass/quality';
import { applyStatusBar, initPlatform, setHapticsEnabled } from '@/lib/platform';
import { MascotBrain } from '@/mascot/Brain';
import { MascotLayer } from '@/mascot/MascotLayer';
import { Call } from '@/screens/Call';
import { ChatScreen } from '@/screens/Chat';
import { Home } from '@/screens/Home';
import { Pairing } from '@/screens/Pairing';
import { Settings } from '@/screens/Settings';
import { Sheets } from '@/screens/Sheets';
import { goBack, toast, useStore } from '@/state/store';

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

export function App() {
  const booted = useStore((s) => s.booted);
  const paired = useStore((s) => s.paired);
  const prefs = useStore((s) => s.prefs);
  const stack = useStore((s) => s.stack);
  const toasts = useStore((s) => s.toasts);
  const systemDark = useSystemDark();
  const theme: 'light' | 'dark' = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
  const reduced = prefs.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('reduce-motion', reduced);
    useStore.setState({ resolvedTheme: theme });
    void applyStatusBar(theme);
  }, [theme, reduced]);

  useEffect(() => {
    setGlassQuality(prefs.glass === 'auto' ? autoGlassQuality() : prefs.glass);
  }, [prefs.glass]);

  useEffect(() => setHapticsEnabled(prefs.haptics), [prefs.haptics]);
  useEffect(() => startGlassLighting(reduced), [reduced]);
  useEffect(() => initPlatform(goBack), []);

  // Copy buttons inside rendered code blocks.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest?.('[data-copy]') as HTMLElement | null;
      if (!btn) return;
      const text = decodeURIComponent(btn.dataset.copy ?? '');
      void navigator.clipboard
        ?.writeText(text)
        .then(() => {
          btn.textContent = 'Copied';
          setTimeout(() => (btn.textContent = 'Copy'), 1400);
        })
        .catch(() => toast('Copy failed', 'error'));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const route = stack[stack.length - 1];
  const showNav = paired && (route.name === 'home' || route.name === 'settings');

  return (
    <MascotLayer theme={theme} quality={prefs.mascotQuality} reducedMotion={reduced} enabled={prefs.mascots}>
      <div className="aurora" aria-hidden="true" />
      <div className="app">
        {!booted ? null : !paired ? (
          <Pairing />
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={route.name === 'chat' ? `chat:${route.chatId}` : route.name}
              className="screen"
              initial={route.name === 'chat' ? { x: '100%', opacity: 1 } : { opacity: 0, scale: 0.98 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={route.name === 'chat' ? { x: '35%', opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={reduced ? { duration: 0 } : { type: 'spring', damping: 32, stiffness: 300 }}
            >
              {route.name === 'home' && <Home />}
              {route.name === 'settings' && <Settings />}
              {route.name === 'chat' && <ChatScreen chatId={route.chatId} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      {showNav && <NavBar />}
      {paired && <Sheets />}
      {paired && <Call />}
      <MascotBrain />
      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: -16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}>
              <Glass className={`toast toast--${t.kind}`} radius={20} variant="strong" refract>
                <Icon name={t.kind === 'error' ? 'x' : t.kind === 'ok' ? 'check' : 'sparkle'} size={18} />
                {t.text}
              </Glass>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </MascotLayer>
  );
}
