import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cx } from './cx';
import { GlassSpinner } from './GlassSpinner';

export type GlassButtonVariant = 'primary' | 'ghost' | 'quiet' | 'danger';
export type GlassButtonSize = 'sm' | 'md' | 'lg';

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GlassButtonVariant;
  size?: GlassButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

/**
 * `primary` is a lit sapphire slab with a bright top bevel and a dark bottom
 * one; `ghost` is glass; `quiet` is bare text; `danger` is the same slab in
 * red. All of them clear the 44px touch floor, and `lg` clears 52px.
 */
export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  {
    variant = 'ghost',
    size = 'md',
    icon,
    loading = false,
    block = false,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'on-btn',
        `on-btn--${variant}`,
        `on-btn--${size}`,
        block && 'on-btn--block',
        loading && 'on-btn--loading',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="on-btn__icon">
          <GlassSpinner size={size === 'sm' ? 14 : 16} />
        </span>
      ) : icon ? (
        <span className="on-btn__icon">{icon}</span>
      ) : null}
      {children != null && children !== false ? (
        <span className="on-btn__label">{children}</span>
      ) : null}
    </button>
  );
});
