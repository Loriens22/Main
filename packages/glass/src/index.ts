/**
 * @ornight/glass
 *
 * The Ornight Plus design system: a liquid-glass material over a nocturnal
 * sapphire palette, built for touch-first mini tablets.
 *
 * Import the stylesheet exactly once, from the app entry:
 *
 *   @import '@ornight/glass/tokens.css';
 *
 * Every colour, radius, blur and shadow in the app comes from a token defined
 * there. Components never hardcode a colour.
 */

/* Material ---------------------------------------------------------------- */
export { Glass } from './Glass';
export type { GlassProps, GlassTone, GlassBlur, GlassRadius } from './Glass';

/* Controls ---------------------------------------------------------------- */
export { GlassButton } from './GlassButton';
export type { GlassButtonProps, GlassButtonVariant, GlassButtonSize } from './GlassButton';

export { GlassIconButton } from './GlassIconButton';
export type { GlassIconButtonProps } from './GlassIconButton';

export { GlassSegmented } from './GlassSegmented';
export type { GlassSegmentedProps, SegmentedOption } from './GlassSegmented';

export { GlassField } from './GlassField';
export type { GlassFieldProps } from './GlassField';

/* Surfaces and feedback ---------------------------------------------------- */
export { GlassSheet } from './GlassSheet';
export type { GlassSheetProps, SheetSide, SheetSize } from './GlassSheet';

export { GlassBadge } from './GlassBadge';
export type { GlassBadgeProps } from './GlassBadge';

export { GlassScroll } from './GlassScroll';
export type { GlassScrollProps } from './GlassScroll';

export { GlassDivider } from './GlassDivider';
export type { GlassDividerProps } from './GlassDivider';

export { GlassSpinner } from './GlassSpinner';
export type { GlassSpinnerProps } from './GlassSpinner';

export { GlassProgress } from './GlassProgress';
export type { GlassProgressProps } from './GlassProgress';

export { GlassTooltip } from './GlassTooltip';
export type { GlassTooltipProps } from './GlassTooltip';

/* Branding ----------------------------------------------------------------- */
export { LiquidText } from './LiquidText';
export type { LiquidTextProps } from './LiquidText';

export { OrnightMark } from './OrnightMark';
export type { OrnightMarkProps } from './OrnightMark';

/* Motion ------------------------------------------------------------------- */
export { SPRING, LAYOUT_ID } from './motion';

/* Hooks -------------------------------------------------------------------- */
export { useReducedMotion, useLongPress, useUid } from './hooks';
export type { LongPressHandlers } from './hooks';

/* Utilities ---------------------------------------------------------------- */
export { cx } from './cx';
export type { ClassValue } from './cx';
