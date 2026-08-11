import type { ButtonHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cx } from './cx';

export interface GlassIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name. Icon buttons have no visible label, so this is required. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

/**
 * A bare square tap target for a single glyph. `sm` is 36px and is only for
 * dense secondary chrome sitting inside an already-tappable row; `md` is the
 * 44px floor and `lg` is the 52px primary size.
 */
export const GlassIconButton = forwardRef<HTMLButtonElement, GlassIconButtonProps>(
  function GlassIconButton(
    { label, size = 'md', active = false, className, children, type, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        aria-label={label}
        title={label}
        aria-pressed={active || undefined}
        className={cx(
          'on-iconbtn',
          `on-iconbtn--${size}`,
          active && 'on-iconbtn--active',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
