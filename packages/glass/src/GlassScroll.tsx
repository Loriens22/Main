import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cx } from './cx';

export interface GlassScrollProps extends HTMLAttributes<HTMLDivElement> {
  /** Mask the leading and trailing edges so content dissolves rather than cuts. */
  fade?: boolean;
  /** Horizontal scroller — moves the fade mask onto the x axis. */
  horizontal?: boolean;
}

/**
 * Momentum scrolling with contained overscroll, so a list inside a sheet never
 * drags the page behind it. Every scroller in the app is one of these.
 */
export const GlassScroll = forwardRef<HTMLDivElement, GlassScrollProps>(function GlassScroll(
  { fade = false, horizontal = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        'on-scroll',
        fade && 'on-scroll--fade',
        horizontal && 'on-scroll--x',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
