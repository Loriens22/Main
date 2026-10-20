import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { db, now, uid } from './db.js';
import { logger } from './log.js';

const log = logger('auth');

// ---------- secret key for encrypting stored credentials ----------
function loadMasterSecret(): Buffer {
  if (config.serverSecret) return Buffer.from(config.serverSecret, 'utf8');
  const file = join(config.dataDir, 'server-secret.key');
  if (existsSync(file)) return readFileSync(file);
  const s = randomBytes(32);
  writeFileSync(file, s, { mode: 0o600 });
  log.warn('SERVER_SECRET not set; generated a persistent one on the volume');
  return s;
}
const encKey = Buffer.from(hkdfSync('sha256', loadMasterSecret(), 'maverick-salt', 'secrets-v1', 32));

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function decrypt(blob: string): string {
  const [v, iv, tag, body] = blob.split('.');
  if (v !== 'v1') throw new Error('unknown secret format');
  const d = createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
}

export function putSecret(key: string, value: string | null): void {
  if (value === null) {
    db.prepare('DELETE FROM secrets WHERE key = ?').run(key);
    return;
  }
  db.prepare(
    'INSERT INTO secrets(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).run(key, encrypt(value), now());
}

export function getSecret(key: string): string | null {
  const row = db.prepare('SELECT value FROM secrets WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return decrypt(row.value);
  } catch (e) {
    log.error(`failed to decrypt secret ${key}`, e);
    return null;
  }
}

// ---------- pairing + device tokens ----------
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function normalizeCode(c: string): string {
  return c.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const attempts = new Map<string, { count: number; first: number }>();
let globalFailures: number[] = [];

export class PairError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function pairDevice(ip: string, code: string, name: string, platform: string): { token: string; deviceId: string } {
  const t = now();
  globalFailures = globalFailures.filter((x) => t - x < 3600_000);
  if (globalFailures.length > 60) throw new PairError('Pairing temporarily locked. Try again later.', 429);
  const a = attempts.get(ip);
  if (a && t - a.first < 15 * 60_000 && a.count >= 8) throw new PairError('Too many attempts. Wait 15 minutes.', 429);
  if (!config.accessCode) throw new PairError('Server has no ACCESS_CODE configured.', 503);

  const expected = Buffer.from(normalizeCode(config.accessCode));
  const given = Buffer.from(normalizeCode(code || ''));
  const ok = expected.length === given.length && timingSafeEqual(expected, given);
  if (!ok) {
    const cur = a && t - a.first < 15 * 60_000 ? a : { count: 0, first: t };
    cur.count++;
    attempts.set(ip, cur);
    globalFailures.push(t);
    log.warn(`failed pairing attempt from ${ip}`);
    throw new PairError('That access code is not correct.', 401);
  }
  attempts.delete(ip);
  const token = randomBytes(32).toString('base64url');
  const deviceId = uid('dev');
  db.prepare('INSERT INTO devices(id, name, platform, token_hash, created_at, last_seen) VALUES(?,?,?,?,?,?)').run(
    deviceId,
    (name || 'Phone').slice(0, 60),
    (platform || 'unknown').slice(0, 20),
    sha(token),
    t,
    t,
  );
  log.info(`paired device ${deviceId} (${name}, ${platform})`);
  return { token, deviceId };
}

export interface DeviceRow {
  id: string;
  name: string;
  platform: string;
  created_at: number;
  last_seen: number;
}

const seenCache = new Map<string, number>();

export function verifyToken(token: string | undefined | null): DeviceRow | null {
  if (!token) return null;
  const row = db
    .prepare('SELECT id, name, platform, created_at, last_seen FROM devices WHERE token_hash = ?')
    .get(sha(token)) as DeviceRow | undefined;
  if (!row) return null;
  const t = now();
  if (t - (seenCache.get(row.id) ?? 0) > 60_000) {
    seenCache.set(row.id, t);
    db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(t, row.id);
  }
  return row;
}

export function listDevices(): DeviceRow[] {
  return db.prepare('SELECT id, name, platform, created_at, last_seen FROM devices ORDER BY last_seen DESC').all() as DeviceRow[];
}

export function revokeDevice(id: string): void {
  db.prepare('DELETE FROM devices WHERE id = ?').run(id);
}

export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1].trim() : null;
}
