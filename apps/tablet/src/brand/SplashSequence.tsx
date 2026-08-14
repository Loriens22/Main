import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LAYOUT_ID, LiquidText, OrnightMark, SPRING, useReducedMotion } from '@ornight/glass';
import nightField from './night-field.png';
import './brand.css';

/** The splash holds the screen for exactly this long, every cold launch. */
const SPLASH_MS = 2000;

/** Per-letter cadence of the wordmark reveal. Seven letters, deliberate pace. */
const LETTER_MS = 132;
const TYPE_START_MS = 620;

const WORD = 'Ornight';

export interface SplashSequenceProps {
  /**
   * Fired once, when the morph to the corner badge begins — not when it ends.
   * The shell mounts at that moment so its badge exists as the layout target.
   */
  onComplete: () => void;
}

/**
 * The cold-launch sequence.
 *
 * Timing is driven by one timer against a single mount timestamp rather than by
 * chaining animation callbacks, so the 2000 ms hold is exact regardless of how
 * long any individual animation takes or how slow the device is.
 */
export function SplashSequence({ onComplete }: SplashSequenceProps) {
  const reducedMotion = useReducedMotion();
  const [letters, setLetters] = useState(reducedMotion ? WORD.length : 0);

  // The hold. Exactly 2000 ms from mount, then hand off.
  useEffect(() => {
    const timer = setTimeout(onComplete, SPLASH_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  // The typewriter. Scheduled from a fixed origin so a slow frame cannot make
  // the letters drift past the point where the splash is due to leave.
  useEffect(() => {
    if (reducedMotion) return;
    const timers = WORD.split('').map((_, index) =>
      setTimeout(() => setLetters(index + 1), TYPE_START_MS + index * LETTER_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [reducedMotion]);

  const spring = reducedMotion ? { duration: 0 } : SPRING.glide;

  return (
    <motion.div
      className="on-splash"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      aria-label="Ornight Plus"
      role="img"
    >
      {/*
        The brand block is the morph source: it shares LAYOUT_ID.brand with the
        sidebar badge. Everything that must survive into the badge — the night
        field, the mark, the wordmark — lives inside it.
      */}
      <motion.div layoutId={LAYOUT_ID.brand} className="on-splash-brand" transition={spring}>
        <motion.div
          layout="position"
          className="on-splash-field"
          style={{ backgroundImage: `url(${nightField})` }}
          // A slow drift so the still image reads as a held breath rather than
          // a static wallpaper. One transform, no repaint.
          initial={reducedMotion ? false : { scale: 1.12, x: -14, y: 8 }}
          animate={reducedMotion ? {} : { scale: 1.02, x: 0, y: 0 }}
          transition={{ duration: SPLASH_MS / 1000 + 0.8, ease: 'easeOut' }}
          aria-hidden="true"
        />
        <div className="on-splash-vignette" aria-hidden="true" />

        <div className="on-splash-content">
          <motion.div
            className="on-splash-mark"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.62, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={reducedMotion ? { duration: 0.25 } : { ...SPRING.soft, delay: 0.1 }}
          >
            <OrnightMark size={116} animated={!reducedMotion} />
          </motion.div>

          <div className="on-splash-word">
            <LiquidText size={44} weight={650} glow={0.85}>
              {WORD.slice(0, letters)}
            </LiquidText>
            {!reducedMotion && letters < WORD.length && (
              <span className="on-splash-caret" aria-hidden="true" />
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
