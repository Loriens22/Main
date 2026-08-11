import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export interface GlassBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'danger';
  size?: 'sm' | 'md';
}

/** A small status pill: provider names, diff counts, run state. */
export function GlassBadge({
  tone = 'neutral',
  size = 'sm',
  className,
  children,
  ...rest
}: GlassBadgeProps) {
  return (
    <span
      className={cx(
        'on-badge',
        tone !== 'neutral' && `on-badge--${tone}`,
        `on-badge--${size}`,
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
