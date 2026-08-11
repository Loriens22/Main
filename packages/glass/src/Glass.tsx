import type { ElementType, HTMLAttributes, ReactNode, Ref } from 'react';
import { forwardRef } from 'react';
import { cx } from './cx';

export type GlassTone = 'panel' | 'raised' | 'sunken' | 'chrome' | 'accent';
export type GlassBlur = 'sm' | 'md' | 'lg' | 'xl';
export type GlassRadius = 'sm' | 'md' | 'lg' | 'xl' | 'pill';

export interface GlassProps extends HTMLAttributes<HTMLElement> {
  /** Render as a different element — `section`, `header`, `li`, `nav`… */
  as?: ElementType;
  tone?: GlassTone;
  blur?: GlassBlur;
  radius?: GlassRadius;
  /** The lit hairline edge. On by default; off for flush, seamless surfaces. */
  border?: boolean;
  /** Adds an accent bloom under the surface. */
  glow?: boolean;
  /** Press/hover response and a focus ring. */
  interactive?: boolean;
  children?: ReactNode;
}

/**
 * The material. Every panel, card, bar and pill in the app is one of these.
 *
 * The visual stack lives in `tokens.css` (`.on-glass` and friends) rather than
 * inline styles, so a surface costs one class list and the browser can share
 * the paint work across every instance.
 */
export const Glass = forwardRef<HTMLElement, GlassProps>(function Glass(
  {
    as,
    tone = 'panel',
    blur = 'md',
    radius = 'md',
    border = true,
    glow = false,
    interactive = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const Component = (as ?? 'div') as ElementType;
  return (
    <Component
      ref={ref as Ref<HTMLElement>}
      className={cx(
        'on-glass',
        `on-glass--${tone}`,
        `on-glass--blur-${blur}`,
        `on-r-${radius}`,
        border && 'on-glass--border',
        glow && 'on-glass--glow',
        interactive && 'on-glass--interactive',
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
});
