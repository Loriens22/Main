import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export interface GlassDividerProps extends HTMLAttributes<HTMLDivElement> {
  vertical?: boolean;
}

/** A hairline that fades out at both ends, so it never looks like a hard cut. */
export function GlassDivider({ vertical = false, className, ...rest }: GlassDividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cx('on-divider', vertical && 'on-divider--v', className)}
      {...rest}
    />
  );
}
