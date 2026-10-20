import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Glass } from '@/glass/Glass';
import { haptic } from '@/lib/platform';
import type { Activity } from '@/lib/types';
import { onActivity, useStore } from '@/state/store';
import { useMascot } from './MascotLayer';
import type { Emotion, MascotAction, MascotId } from './types';

interface Bubble {
  id: number;
  who: MascotId;
  text: string;
}

/** Above the mascot when there is room, else beside it, else just below its name capsule. */
function bubblePlacement(pos: { x: number; y: number; size: number }): { left: number; top: number } {
  const w = 220;
  const vw = window.innerWidth;
  const above = pos.y - pos.size * 0.6 - 50;
  if (above > 44) return { left: Math.max(12, Math.min(vw - w - 12, pos.x - w / 2)), top: above };
  const right = pos.x + pos.size * 0.55 + 6;
  if (vw - right > w + 12) return { left: right, top: Math.max(44, pos.y - 24) };
  const left = pos.x - pos.size * 0.55 - w - 6;
  if (left > 70) return { left, top: Math.max(44, pos.y - 24) };
  return { left: Math.max(12, Math.min(vw - w - 12, pos.x - w / 2)), top: pos.y + pos.size * 0.62 + 46 };
}

const TAP_LINES = ['Ready when you are.', 'Got a bug for me?', 'Beret: securely fastened.', 'What are we building today?', 'Hey, that tickles.'];
const SPARKY_LINES = ['Fwoosh.', 'I keep the build warm.', 'Careful, I run hot.'];

/**
 * Turns real coding events into mascot emotions and short commentary.
 * Every line about work is derived from an actual OpenCode event; idle chatter never claims activity.
 */
export function MascotBrain() {
  const mascot = useMascot();
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; size: number } | null>(null);
  const seq = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaid = useRef(0);
  const lastTouch = useRef(Date.now());
  const sleeping = useRef(false);
  const prevStatus = useRef<Record<string, string>>({});
  const prefs = useStore((s) => s.prefs);
  const route = useStore((s) => s.stack[s.stack.length - 1]);
  const callActive = useStore((s) => !!s.callChatId);

  const say = (who: MascotId, text: string, ms = 3400, force = false) => {
    const now = Date.now();
    if (!force && now - lastSaid.current < 1500) return;
    lastSaid.current = now;
    const id = ++seq.current;
    setBubble({ id, who, text });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBubble((b) => (b?.id === id ? null : b)), ms);
  };

  const feel = (m: Emotion, s: Emotion, ms = 2600, action?: MascotAction) => {
    mascot.setEmotion('maverick', m, { durationMs: ms });
    mascot.setEmotion('sparky', s, { durationMs: ms });
    if (action) mascot.react('maverick', action);
  };

  // Keep the bubble attached to its mascot as it moves.
  useEffect(() => {
    if (!bubble) return;
    let raf = 0;
    const tick = () => {
      const p = (mascot as any).getPosition?.(bubble.who);
      if (p && p.visible !== false) setPos((cur) => (cur && Math.abs(cur.x - p.x) < 0.5 && Math.abs(cur.y - p.y) < 0.5 ? cur : { x: p.x, y: p.y, size: p.size }));
      else setPos(null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bubble, mascot]);

  // Real activity → emotions + commentary.
  useEffect(() => {
    return onActivity((chatId, a: Activity) => {
      const s = useStore.getState();
      const top = s.stack[s.stack.length - 1];
      const visibleChat = top.name === 'chat' ? top.chatId : null;
      const relevant = !visibleChat || visibleChat === chatId || s.callChatId === chatId;
      if (!relevant) return;
      const prefix = !visibleChat && top.name === 'home' ? `${s.chats[chatId]?.title?.slice(0, 22) ?? 'Chat'}: ` : '';
      sleeping.current = false;
      switch (a.kind) {
        case 'thinking':
          feel('thinking', 'thinking', 4000);
          break;
        case 'reading':
        case 'searching':
          feel('thinking', 'idle', 3000);
          say('maverick', prefix + a.label);
          break;
        case 'editing':
        case 'command':
        case 'installing':
        case 'git':
        case 'building':
          feel('working', 'working', 5000);
          say('maverick', prefix + a.label.replace(/`/g, ''));
          break;
        case 'testing':
          feel('thinking', 'working', 6000);
          say('sparky', prefix + 'Running the tests…');
          break;
        case 'test-result':
          if (a.ok) {
            feel('celebrate', 'celebrate', 3200, 'celebrate');
            haptic.success();
            say('maverick', `${prefix}${a.label}`, 4000, true);
          } else {
            feel('sad', 'error', 3200, 'shake');
            haptic.error();
            say('maverick', `${prefix}${a.label}. Digging in.`, 4200, true);
          }
          break;
        case 'build-result':
          if (a.ok) {
            feel('happy', 'excited', 2800, 'jump');
            say('sparky', `${prefix}${a.label}!`, 3200, true);
          } else {
            feel('error', 'error', 3200, 'shake');
            haptic.error();
            say('maverick', `${prefix}${a.label}`, 4000, true);
          }
          break;
        case 'edit-result':
          mascot.react('maverick', 'nod');
          if (a.additions || a.deletions) say('maverick', `${prefix}${a.label} (+${a.additions ?? 0} −${a.deletions ?? 0})`);
          break;
        case 'command-result':
          if (a.ok === false) {
            feel('confused', 'error', 2600, 'flinch');
            say('maverick', `${prefix}${a.label}`);
          }
          break;
        case 'tool-error':
          feel('confused', 'idle', 2400, 'flinch');
          say('maverick', `${prefix}${a.label}`);
          break;
        case 'permission':
          feel('surprised', 'excited', 3000, 'peek');
          haptic.medium();
          say('maverick', `${prefix}Need your OK: ${a.label.replace(/`/g, '')}`, 5000, true);
          break;
        case 'question':
          feel('surprised', 'idle', 3000, 'peek');
          say('maverick', `${prefix}Quick question for you`, 4000, true);
          break;
        case 'delegating':
          feel('excited', 'excited', 2400, 'wave');
          say('maverick', `${prefix}${a.label}`);
          break;
        case 'retry':
          feel('sleepy', 'idle', 3000);
          say('sparky', `${prefix}The free model is busy, retrying…`, 3600, true);
          break;
        case 'error':
          feel('error', 'error', 3400, 'shake');
          haptic.error();
          say('maverick', `${prefix}${a.label}`, 4500, true);
          break;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mascot]);

  // Busy → idle transitions mean a turn finished.
  useEffect(() => {
    return useStore.subscribe((s) => {
      for (const c of Object.values(s.chats)) {
        const prev = prevStatus.current[c.id];
        prevStatus.current[c.id] = c.status;
        if (prev === 'busy' && c.status === 'idle') {
          const top = s.stack[s.stack.length - 1];
          if (top.name === 'chat' && top.chatId !== c.id) continue;
          feel('happy', 'happy', 2600, 'wave');
          say('maverick', top.name === 'chat' ? 'Done! Take a look.' : `“${c.title.slice(0, 26)}” is done`, 3400, true);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mascot]);

  // Touch reactions.
  useEffect(() => {
    return mascot.onInteract((id, kind) => {
      lastTouch.current = Date.now();
      sleeping.current = false;
      if (useStore.getState().callChatId && id === 'maverick' && kind === 'tap') return; // the call screen handles taps (interrupt)
      if (kind === 'tap') {
        haptic.tap();
        mascot.react(id, 'poke');
        mascot.setEmotion(id, 'happy', { durationMs: 1800 });
        const lines = id === 'maverick' ? TAP_LINES : SPARKY_LINES;
        say(id, lines[Math.floor(Math.random() * lines.length)], 2200, true);
      } else if (kind === 'doubletap') {
        haptic.medium();
        mascot.react(id, 'spin');
      } else if (kind === 'longpress') {
        haptic.success();
        mascot.setEmotion(id, 'love', { durationMs: 2600 });
        say(id, id === 'maverick' ? 'Aww, thanks.' : 'Warm and fuzzy.', 2400, true);
      } else if (kind === 'drag-start') {
        mascot.setEmotion(id, 'surprised', { durationMs: 1200 });
      } else if (kind === 'drag-end') {
        say(id, id === 'maverick' ? 'Whee.' : 'Zoom.', 1600, true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mascot]);

  // Roaming & sleepiness.
  useEffect(() => {
    const roam = prefs.roaming && !prefs.reduceMotion && !callActive;
    mascot.roam('sparky', roam ? 'gentle' : 'off');
    // Maverick stays put in headers (gentle hops would clip at the top edge); Sparky wanders.
    mascot.roam('maverick', 'off');
  }, [prefs.roaming, prefs.reduceMotion, route.name, callActive, mascot]);

  useEffect(() => {
    const t = setInterval(() => {
      const s = useStore.getState();
      const busy = Object.values(s.chats).some((c) => c.status === 'busy');
      if (!busy && !s.callChatId && Date.now() - lastTouch.current > 120_000 && !sleeping.current && Date.now() - lastSaid.current > 120_000) {
        sleeping.current = true;
        mascot.setEmotion('maverick', 'sleepy', { durationMs: 600_000 });
        mascot.setEmotion('sparky', 'sleepy', { durationMs: 600_000 });
      }
    }, 10_000);
    const wake = () => {
      lastTouch.current = Date.now();
      if (sleeping.current) {
        sleeping.current = false;
        mascot.setEmotion('maverick', 'happy', { durationMs: 1500 });
        mascot.setEmotion('sparky', 'idle');
      }
    };
    window.addEventListener('pointerdown', wake, { passive: true });
    return () => {
      clearInterval(t);
      window.removeEventListener('pointerdown', wake);
    };
  }, [mascot]);

  // Greeting.
  useEffect(() => {
    const t = setTimeout(() => {
      const h = new Date().getHours();
      mascot.react('maverick', 'wave');
      say('maverick', h < 5 ? 'Late-night coding? I’m in.' : h < 12 ? 'Good morning! What are we building?' : h < 18 ? 'Hey there! Ready to code?' : 'Good evening! Let’s ship something.', 3600, true);
    }, 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!prefs.mascots) return null;
  return (
    <AnimatePresence>
      {bubble && pos && (
        <motion.div
          key={bubble.id}
          className="speech-host"
          initial={{ opacity: 0, scale: 0.6, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', damping: 16, stiffness: 260 }}
          style={{ position: 'fixed', zIndex: 45, pointerEvents: 'none', ...bubblePlacement(pos) }}
        >
          <Glass className="speech" radius={14} variant="strong" style={{ position: 'relative' }}>
            {bubble.text}
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
