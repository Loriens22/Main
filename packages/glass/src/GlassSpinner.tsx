import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import { useUid } from './hooks';

export interface GlassSpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  size?: number;
}

/** A thin sapphire arc over a faint track. Rotation only — no layout cost. */
export function GlassSpinner({ size = 18, className, style, ...rest }: GlassSpinnerProps) {
  const uid = useUid('on-spin');
  const stroke = Math.max(1.5, size / 9);
  const r = (size - stroke) / 2;

  return (
    <span
      className={cx('on-spinner', className)}
      style={{ width: size, height: size, ...style }}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--on-accent-2))" stopOpacity="1" />
            <stop offset="100%" stopColor="rgb(var(--on-accent))" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--on-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${uid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * r * 0.72} ${2 * Math.PI * r}`}
        />
      </svg>
    </span>
  );
}
