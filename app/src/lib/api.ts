import { Capacitor } from '@capacitor/core';

export const DEFAULT_SERVER =
  import.meta.env.VITE_DEFAULT_SERVER ||
  (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname) && !Capacitor.isNativePlatform()
    ? location.origin
    : 'https://maverick-core-production.up.railway.app');

let baseUrl = DEFAULT_SERVER;
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function configureApi(opts: { baseUrl?: string; token?: string | null; onUnauthorized?: () => void }): void {
  if (opts.baseUrl !== undefined) baseUrl = opts.baseUrl.replace(/\/+$/, '');
  if (opts.token !== undefined) token = opts.token;
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized;
}

export function apiBase(): string {
  return baseUrl;
}
export function apiToken(): string | null {
  return token;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * JSON request with auth and gentle retries for cold starts (Railway may be waking the server:
 * the first request can see a 502/503 or a dropped connection).
 */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; retries?: number; timeoutMs?: number; raw?: boolean } = {}): Promise<T> {
  const retries = opts.retries ?? (opts.method && opts.method !== 'GET' ? 1 : 3);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 30_000);
    try {
      const res = await fetch(baseUrl + path, {
        method: opts.method ?? 'GET',
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ac.signal,
      });
      clearTimeout(t);
      if (res.status === 401) {
        onUnauthorized?.();
        throw new ApiError('Not paired with this server', 401);
      }
      if ((res.status === 502 || res.status === 503) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      if (opts.raw) {
        if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
        return res as unknown as T;
      }
      const text = await res.text();
      const data = text ? safeJson(text) : undefined;
      if (!res.ok) throw new ApiError((data as { error?: string })?.error || `HTTP ${res.status}`, res.status);
      return data as T;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (e instanceof ApiError) throw e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  const msg = lastErr instanceof Error ? (lastErr.name === 'AbortError' ? 'The server took too long to respond' : lastErr.message) : 'Network error';
  throw new ApiError(/fetch|network/i.test(msg) ? "Can't reach the server. Check your connection." : msg, 0);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { error: s.slice(0, 200) };
  }
}

export function wsUrl(path: string): string {
  return baseUrl.replace(/^http/, 'ws') + path;
}
