import type { HTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cx } from './cx';
import { SPRING } from './motion';
import { useReducedMotion, useUid } from './hooks';

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  hint?: string;
}

export interface GlassSegmentedProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string;
  onChange: (v: string) => void;
  options: SegmentedOption[];
  size?: 'sm' | 'md';
}

/**
 * A sunken glass trough with a raised lit thumb that slides between options.
 * The thumb is a shared `layoutId`, so switching options is one continuous
 * movement rather than two opacity changes.
 */
export function GlassSegmented({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ...rest
}: GlassSegmentedProps) {
  const uid = useUid('on-seg');
  const reduced = useReducedMotion();

  return (
    <div className={cx('on-seg', `on-seg--${size}`, className)} role="radiogroup" {...rest}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className="on-seg__opt"
            onClick={() => onChange(option.value)}
          >
            {selected ? (
              <motion.span
                layoutId={uid}
                className="on-seg__thumb"
                style={{ inset: 0 }}
                transition={reduced ? { duration: 0 } : SPRING.snappy}
              />
            ) : null}
            <span className="on-seg__label">{option.label}</span>
            {option.hint ? <span className="on-seg__hint">{option.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
