import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export interface GlassProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 0–1. Clamped. Ignored when `indeterminate` is set. */
  value: number;
  indeterminate?: boolean;
}

/** A lit sapphire bar in a sunken trough. Used by the ship flow and uploads. */
export function GlassProgress({
  value,
  indeterminate = false,
  className,
  ...rest
}: GlassProgressProps) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={indeterminate ? undefined : clamped}
      className={cx('on-progress', indeterminate && 'on-progress--indeterminate', className)}
      {...rest}
    >
      <span
        className="on-progress__bar"
        style={indeterminate ? undefined : { width: `${clamped * 100}%` }}
      />
    </div>
  );
}
