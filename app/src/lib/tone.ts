/**
 * Agent and project colors are stored as saturated Tailwind-500 hues. On the black UI they read as
 * neon, so the app maps each one to a muted pair: a fill for avatars (white initials stay readable)
 * and a lighter dot for small markers. Unknown colors pass through unchanged.
 */
const T: Record<string, [string, string]> = {
  '#3b82f6': ['#3d5f9e', '#7f9ee0'],
  '#f97316': ['#9a5530', '#e0915c'],
  '#22c55e': ['#2e7a52', '#5fbf8a'],
  '#a855f7': ['#6c52a6', '#a98be0'],
  '#ec4899': ['#984670', '#d77fa8'],
  '#06b6d4': ['#28717f', '#5bb6c8'],
  '#eab308': ['#7d6a24', '#d9b85a'],
  '#ef4444': ['#9a3c3c', '#e07a7a'],
  '#14b8a6': ['#27766c', '#5bbfb1'],
  '#8b5cf6': ['#5f55a8', '#9d93e6'],
};

export const toneFill = (c?: string) => T[c?.toLowerCase() ?? '']?.[0] ?? c;
export const toneDot = (c?: string) => T[c?.toLowerCase() ?? '']?.[1] ?? c;
