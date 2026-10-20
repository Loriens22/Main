import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { config, ensureDirs } from './config.js';

ensureDirs();
export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  repo TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'single',
  title TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT,
  model TEXT NOT NULL,
  approval_mode TEXT NOT NULL DEFAULT 'ask',
  concurrency INTEGER NOT NULL DEFAULT 2,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  allow_paid INTEGER NOT NULL DEFAULT 0,
  preview TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chats_session ON chats(session_id);
CREATE TABLE IF NOT EXISTS group_agents (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  model TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_lead INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS agents_session ON group_agents(session_id);
CREATE TABLE IF NOT EXISTS group_runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_text TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_summary TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS group_tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES group_runs(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  depends_on TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS group_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  run_id TEXT,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  target_agent_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

export const uid = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
export const now = () => Date.now();

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  path: string;
  repo: string | null;
  color: string;
  created_at: number;
  updated_at: number;
}

export interface ChatRow {
  id: string;
  kind: 'single' | 'group';
  title: string;
  project_id: string;
  session_id: string | null;
  model: string;
  approval_mode: ApprovalMode;
  concurrency: number;
  pinned: number;
  archived: number;
  allow_paid: number;
  preview: string;
  created_at: number;
  updated_at: number;
  last_activity_at: number;
}

export type ApprovalMode = 'ask' | 'auto-edit' | 'full';

export interface AgentRow {
  id: string;
  chat_id: string;
  name: string;
  role: string;
  model: string;
  instructions: string;
  color: string;
  is_lead: number;
  session_id: string | null;
  sort: number;
}

export interface TaskRow {
  id: string;
  run_id: string;
  chat_id: string;
  idx: number;
  title: string;
  instructions: string;
  agent_id: string;
  depends_on: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'blocked' | 'cancelled';
  result: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface RunRow {
  id: string;
  chat_id: string;
  user_text: string;
  status: 'planning' | 'running' | 'summarizing' | 'done' | 'failed' | 'cancelled';
  plan_summary: string;
  created_at: number;
  finished_at: number | null;
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown): void {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  );
}
