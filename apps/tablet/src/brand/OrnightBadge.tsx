import { motion } from 'framer-motion';
import { LAYOUT_ID, LiquidText, OrnightMark, SPRING, useReducedMotion } from '@ornight/glass';
import nightFieldThumb from './night-field-thumb.png';
import './brand.css';

export interface OrnightBadgeProps {
  /** Drops the wordmark, leaving just the mark. Used when the rail is narrow. */
  compact?: boolean;
}

/**
 * The settled state of the splash.
 *
 * This carries `LAYOUT_ID.brand`, the same layoutId the splash puts on its
 * full-screen brand block. When the splash unmounts and this mounts in the same
 * commit, framer-motion animates the one into the other — so the badge is
 * literally the splash, shrunk into the corner, rather than a second element
 * that fades in where the first faded out.
 */
export function OrnightBadge({ compact = false }: OrnightBadgeProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      layoutId={LAYOUT_ID.brand}
      className="on-brand-badge"
      data-compact={compact ? 'true' : 'false'}
      transition={reducedMotion ? { duration: 0 } : SPRING.glide}
    >
      {/* A crop of the same night field that filled the splash, now living
          behind the glass of a 200px pill. */}
      <motion.div
        layout="position"
        className="on-brand-badge-field"
        style={{ backgroundImage: `url(${nightFieldThumb})` }}
        aria-hidden="true"
      />
      <div className="on-brand-badge-glass" aria-hidden="true" />

      <div className="on-brand-badge-content">
        <OrnightMark size={compact ? 26 : 24} />
        {!compact && (
          <LiquidText className="on-brand-badge-word" size={15} weight={600} glow={0.45}>
            Ornight Plus
          </LiquidText>
        )}
      </div>
    </motion.div>
  );
}
