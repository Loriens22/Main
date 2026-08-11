/**
 * The smallest useful class-name joiner. `@ornight/glass` has no runtime
 * dependencies beyond its React peer, so it ships its own instead of pulling
 * in `clsx`.
 */
export type ClassValue = string | number | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  let out = '';
  for (const value of values) {
    if (!value && value !== 0) continue;
    out = out ? `${out} ${value}` : String(value);
  }
  return out;
}
