import { randomBytes, randomUUID } from 'node:crypto';

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/** Stable short handle for a thread: used in branch names and worktree dirs. */
export function shortId(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, '');
  return tail.slice(-8).toLowerCase() || randomBytes(4).toString('hex');
}

export function randomCode(length = 6): string {
  // Crockford-ish alphabet: no 0/O/1/I, so a code read off a screen and typed
  // into a tablet cannot be transcribed wrong.
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  }
  return out;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Branch-safe slug. Mirrors T3 Code's `sanitizeBranchFragment`: lowercase,
 * collapse separators, everything outside `[a-z0-9-]` becomes a dash, capped so
 * the final ref stays comfortably under filesystem limits.
 */
export function slugify(text: string, maxLength = 40): string {
  const slug = text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength)
    .replace(/-$/, '');
  return slug.length > 0 ? slug : 'thread';
}

export function now(): number {
  return Date.now();
}
