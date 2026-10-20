import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Glass } from '@/glass/Glass';
import { haptic } from '@/lib/platform';
import { goHome, navigate, openSheet, useStore } from '@/state/store';
import { Icon } from './Icon';

/** Floating Liquid Glass navigation: Chats · (+) · Settings. The (+) blooms into two glass bubbles. */
export function NavBar() {
  const route = useStore((s) => s.stack[s.stack.length - 1]);
  const [open, setOpen] = useState(false);
  const toggle = () => {
    haptic.medium();
    setOpen((v) => !v);
  };
  const pick = (kind: 'single' | 'group') => {
    haptic.tap();
    setOpen(false);
    openSheet(kind === 'single' ? 'new-chat' : 'new-group');
  };
  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="plus-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <div className="plus-bubbles">
              {(
                [
                  { kind: 'single', label: 'New Chat', icon: 'chats', x: -24, delay: 0 },
                  { kind: 'group', label: 'New Group Chat', icon: 'users', x: 24, delay: 0.06 },
                ] as const
              ).map((b) => (
                <motion.div
                  key={b.kind}
                  initial={{ opacity: 0, y: 90, x: -b.x * 3, scale: 0.3 }}
                  animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 70, x: -b.x * 3, scale: 0.3, transition: { duration: 0.18 } }}
                  transition={{ type: 'spring', damping: 14, stiffness: 220, delay: b.delay }}
                >
                  <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 3.2 + b.delay * 10, repeat: Infinity, ease: 'easeInOut' }}>
                    <Glass as="button" className="plus-bubble" radius={999} refract interactive variant="regular" onClick={() => pick(b.kind)} aria-label={b.label}>
                      <span className="plus-bubble__icon">
                        <Icon name={b.icon} size={18} />
                      </span>
                      <span>{b.label}</span>
                    </Glass>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </AnimatePresence>
      <div className="nav-wrap">
        <Glass as="nav" className="navbar" radius={999} refract blur={22} aria-label="Main">
          <button
            className="navbar__tab"
            aria-current={route.name === 'home' ? 'page' : undefined}
            onClick={() => {
              haptic.tap();
              setOpen(false);
              goHome();
            }}
          >
            <Icon name="chats" size={19} />
            Chats
          </button>
          <Glass as="button" className="navbar__plus" variant="primary" radius={999} interactive aria-label="New" aria-expanded={open} onClick={toggle}>
            <Icon name="plus" size={20} stroke={2.4} />
          </Glass>
          <button
            className="navbar__tab"
            aria-current={route.name === 'settings' ? 'page' : undefined}
            onClick={() => {
              haptic.tap();
              setOpen(false);
              if (route.name !== 'settings') navigate({ name: 'settings' });
            }}
          >
            <Icon name="settings" size={19} />
            Settings
          </button>
        </Glass>
      </div>
    </>
  );
}
