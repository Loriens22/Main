/**
 * Motion constants. Every animation in Ornight Plus uses one of these four
 * springs so the whole product moves like one physical object.
 *
 * They are tuned by feel, not by formula:
 *
 *   snappy — chrome and controls. Arrives fast, settles instantly, no wobble.
 *   soft   — panels, sheets, list reflow. A single gentle overshoot.
 *   glide  — the splash → badge morph and other long travels. Heavier mass so
 *            a big object crossing the screen reads as having weight.
 *   press  — tap feedback. Very stiff and slightly under-damped so a press
 *            feels like a real button rebounding under a finger.
 */
export const SPRING: {
  snappy: { type: 'spring'; stiffness: number; damping: number; mass: number };
  soft: { type: 'spring'; stiffness: number; damping: number; mass: number };
  glide: { type: 'spring'; stiffness: number; damping: number; mass: number };
  press: { type: 'spring'; stiffness: number; damping: number; mass: number };
} = {
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.9 },
  soft: { type: 'spring', stiffness: 210, damping: 26, mass: 1 },
  glide: { type: 'spring', stiffness: 120, damping: 22, mass: 1.1 },
  press: { type: 'spring', stiffness: 620, damping: 24, mass: 0.6 },
};

/**
 * Shared `layoutId` values. The splash screen and the sidebar badge both put
 * `LAYOUT_ID.brand` on their outermost element, which is what lets framer-motion
 * treat them as one continuous object across the unmount boundary.
 */
export const LAYOUT_ID: { brand: 'ornight-brand' } = { brand: 'ornight-brand' };
