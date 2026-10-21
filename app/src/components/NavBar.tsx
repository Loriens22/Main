import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Glass } from '@/glass/Glass';
import { haptic } from '@/lib/platform';
import { goHome, navigate, openSheet, useStore } from '@/state/store';
import { Icon } from './Icon';

/** Floating Liquid Glass navigation: Chats · (+) · Settings. The (+) opens a compact glass menu. */
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
              {/* No refraction here: the scale-in would size the SVG displacement map wrong. */}
              <motion.div
                style={{ transformOrigin: '50% 100%' }}
                initial={{ opacity: 0, y: 10, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              >
                <Glass className="plus-menu" radius={16} blur={20} role="menu">
                  <button className="plus-item" role="menuitem" onClick={() => pick('single')}>
                    <Icon name="chats" size={18} />
                    New chat
                  </button>
                  <button className="plus-item" role="menuitem" onClick={() => pick('group')}>
                    <Icon name="users" size={18} />
                    New team
                  </button>
                </Glass>
              </motion.div>
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
