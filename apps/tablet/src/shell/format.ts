/**
 * Small presentation helpers shared by the shell and the chat surface.
 * Pure functions only — no React, no store access.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative stamp for dense rows: `now`, `4m`, `3h`, `2d`, `14 Mar`. */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - timestamp);
  if (delta < MINUTE) return 'now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Full stamp used in tooltips and detail rows. */
export function absoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Section heading for the thread list: `Today`, `Yesterday`, `14 Mar`, `14 Mar 2024`. */
export function dayGroupLabel(timestamp: number, now: number = Date.now()): string {
  const today = startOfDay(now);
  const day = startOfDay(timestamp);
  if (day === today) return 'Today';
  if (day === today - DAY) return 'Yesterday';
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return new Date(timestamp).toLocaleDateString(
    undefined,
    sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' },
  );
}

/** `+12 −3`, or null when the thread has touched nothing. */
export function changeSummary(insertions: number, deletions: number): string | null {
  if (insertions <= 0 && deletions <= 0) return null;
  const parts: string[] = [];
  if (insertions > 0) parts.push(`+${insertions}`);
  if (deletions > 0) parts.push(`−${deletions}`);
  return parts.join(' ');
}

/** Trim a preview to one clean line — model output arrives with newlines in it. */
export function oneLine(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** `feature/thing` → `feature/thing`; long branches middle-truncate. */
export function shortBranch(branch: string, max = 28): string {
  if (branch.length <= max) return branch;
  const head = branch.slice(0, Math.ceil(max / 2) - 1);
  const tail = branch.slice(-Math.floor(max / 2));
  return `${head}…${tail}`;
}

/** Last path segment, for tool targets and file chips. */
export function baseName(path: string): string {
  const cleaned = path.replace(/\/+$/, '');
  const index = cleaned.lastIndexOf('/');
  return index === -1 ? cleaned : cleaned.slice(index + 1);
}
