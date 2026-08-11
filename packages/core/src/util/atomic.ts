import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Write-temp-then-rename. `rename(2)` is atomic within a filesystem, so a crash
 * mid-write leaves the previous file intact rather than a truncated JSON blob
 * the daemon would refuse to start from.
 */
export async function writeAtomic(file: string, data: string, mode?: number): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  const handle = await fs.open(tmp, 'w', mode ?? 0o644);
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
}

export async function writeJsonAtomic(file: string, value: unknown, mode?: number): Promise<void> {
  await writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`, mode);
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (raw.trim().length === 0) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function appendLine(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, 'utf8');
}

export async function readLines(file: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return raw.split('\n').filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function isWritableDir(target: string): Promise<boolean> {
  try {
    await fs.access(target, (await import('node:fs')).constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
