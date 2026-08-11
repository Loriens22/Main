import type { CSSProperties, ElementType, HTMLAttributes } from 'react';
import { cx } from './cx';

export interface LiquidTextProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Plain text only — the treatment stacks three copies of the same string. */
  children: string;
  size?: number | string;
  weight?: number;
  /**
   * 0–1. Drives the accent bloom. At 0.8 and above it also enables the shimmer
   * sweep, which is deliberately hard to switch on: a `background-position`
   * animation clipped to text repaints every frame, so it belongs on the
   * splash and nowhere else.
   */
  glow?: number;
  as?: ElementType;
}

/**
 * The branding typography treatment: text that reads as a piece of bevelled,
 * internally-lit glass.
 *
 * Five layers, all clipped to the same glyphs:
 *
 *   1. a near-white base fill — the only opaque layer, so the type stays crisp
 *   2. a vertical light falloff via `background-clip: text`, screened on top
 *   3. an accent bloom in the text shadow
 *   4. a 1px dark emboss below and a lighter lift above, which is what makes
 *      the glyph read as a raised bevel rather than a glowing outline
 *   5. an optional slow shimmer sweep
 *
 * Because layer 1 stays underneath, none of the gradient work can make the
 * letterforms mushy — the gradients only ever add light.
 */
export function LiquidText({
  children,
  size,
  weight = 600,
  glow = 0.55,
  as,
  className,
  style,
  ...rest
}: LiquidTextProps) {
  const Component = (as ?? 'span') as ElementType;
  const clampedGlow = Math.min(1, Math.max(0, glow));

  const vars = {
    '--on-liquid-glow': clampedGlow,
    fontSize: typeof size === 'number' ? `${size}px` : size,
    fontWeight: weight,
    ...style,
  } as CSSProperties;

  return (
    <Component className={cx('on-liquid', className)} style={vars} {...rest}>
      {children}
      <span className="on-liquid__face" aria-hidden="true">
        {children}
      </span>
      {clampedGlow >= 0.8 ? (
        <span className="on-liquid__shimmer" aria-hidden="true">
          {children}
        </span>
      ) : null}
    </Component>
  );
}
