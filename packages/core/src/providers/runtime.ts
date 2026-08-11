/**
 * The canonical runtime event union.
 *
 * This is the single most valuable idea borrowed from T3 Code
 * (`packages/contracts/src/providerRuntime.ts`, ~48 members): every adapter
 * normalises its native wire format — Anthropic stream-json, Codex JSON-RPC,
 * ACP, an SDK callback — into *one* union, and exactly one translator turns
 * that union into the `ServerEvent`s the protocol defines. The payoff is that
 * neither the orchestrator nor any UI ever contains a provider conditional.
 *
 * Ours is deliberately smaller than T3's: their union carries realtime audio,
 * collab agents, task workflows and review mode, none of which exist in the
 * Ornight protocol. The shape of the members that *do* overlap is theirs:
 * session → thread → turn → item lifecycle, with approvals as requests and
 * token usage as periodic snapshots.
 */
import type { ToolCategory, ToolStatus } from '@ornight/protocol';

export interface RuntimeUsage {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface RuntimeToolStart {
  /** Provider-native call id; adapters must make it unique within a session. */
  id: string;
  /** Provider-native tool name, shown verbatim in the UI (`Bash`, `apply_patch`). */
  name: string;
  category: ToolCategory;
  title: string;
  /** The primary argument: a command, a path, a query. */
  target: string;
  input: Record<string, unknown>;
  /** Unified diff when this call is an edit. */
  patch?: string | null;
}

export interface RuntimeToolUpdate {
  id: string;
  status?: ToolStatus;
  output?: string | null;
  exitCode?: number | null;
  patch?: string | null;
  title?: string;
  target?: string;
}

export interface RuntimePermissionRequest {
  /** Adapter-local id; `respondToPermission` is called back with it. */
  id: string;
  toolCallId: string;
  tool: string;
  title: string;
  detail: string;
  diff: string | null;
  risk: 'low' | 'medium' | 'high';
}

/**
 * Canonical events. `item.*` mirrors T3's item lifecycle: assistant text and
 * reasoning are streamed as deltas against the current item, tools are items
 * with their own lifecycle, and a turn brackets them.
 */
export type RuntimeEvent =
  | { kind: 'session.started'; externalSessionId: string | null; model?: string }
  | { kind: 'turn.started' }
  | { kind: 'turn.completed'; usage?: RuntimeUsage }
  | { kind: 'turn.aborted'; reason: string }
  | { kind: 'item.text.delta'; text: string }
  | { kind: 'item.text.completed'; text: string }
  | { kind: 'item.reasoning.delta'; text: string }
  | { kind: 'item.boundary' }
  | { kind: 'tool.started'; call: RuntimeToolStart }
  | { kind: 'tool.updated'; update: RuntimeToolUpdate }
  | { kind: 'request.permission'; request: RuntimePermissionRequest }
  | { kind: 'usage'; usage: RuntimeUsage }
  | { kind: 'log'; text: string }
  | { kind: 'error'; message: string; fatal: boolean };

/* -------------------------------------------------------------------------- */
/* Shared normalisation helpers                                                */
/* -------------------------------------------------------------------------- */

const CATEGORY_BY_TOOL: Record<string, ToolCategory> = {
  read: 'read',
  view: 'read',
  readfile: 'read',
  read_file: 'read',
  image_view: 'read',
  notebookread: 'read',
  edit: 'edit',
  write: 'edit',
  create: 'edit',
  multiedit: 'edit',
  notebookedit: 'edit',
  apply_patch: 'edit',
  applypatch: 'edit',
  str_replace_editor: 'edit',
  file_change: 'edit',
  patch: 'edit',
  bash: 'shell',
  shell: 'shell',
  run: 'shell',
  exec: 'shell',
  terminal: 'shell',
  command_execution: 'shell',
  bashoutput: 'shell',
  killshell: 'shell',
  grep: 'search',
  glob: 'search',
  search: 'search',
  codesearch: 'search',
  ls: 'search',
  find: 'search',
  webfetch: 'web',
  web_search: 'web',
  websearch: 'web',
  fetch: 'web',
  task: 'task',
  agent: 'task',
  todowrite: 'todo',
  todo: 'todo',
  update_plan: 'todo',
  plan: 'todo',
};

/** Native tool name → the card the UI renders. Unknown names degrade to `other`. */
export function categoriseTool(name: string): ToolCategory {
  const key = name.trim().toLowerCase().replace(/[\s-]/g, '_');
  const direct = CATEGORY_BY_TOOL[key] ?? CATEGORY_BY_TOOL[key.replace(/_/g, '')];
  if (direct) return direct;
  if (key.startsWith('mcp__')) return 'other';
  if (key.includes('edit') || key.includes('write') || key.includes('patch')) return 'edit';
  if (key.includes('read') || key.includes('cat')) return 'read';
  if (key.includes('search') || key.includes('grep')) return 'search';
  if (key.includes('bash') || key.includes('shell') || key.includes('exec')) return 'shell';
  if (key.includes('web') || key.includes('fetch')) return 'web';
  return 'other';
}

/** Categories that can change the worktree — the set `plan` mode must block. */
export function isMutatingCategory(category: ToolCategory): boolean {
  return category === 'edit' || category === 'shell';
}

export function riskOf(category: ToolCategory, target: string): 'low' | 'medium' | 'high' {
  if (category === 'shell') {
    const dangerous = /\brm\s+-\w*[rf]|\bgit\s+push\b|\bsudo\b|\bcurl\b[^|]*\|\s*(ba)?sh|\bdd\b|>\s*\/dev\//;
    return dangerous.test(target) ? 'high' : 'medium';
  }
  if (category === 'edit') return 'medium';
  if (category === 'web') return 'low';
  return 'low';
}

/** One-line summary for a tool card header. */
export function toolTitle(name: string, category: ToolCategory, target: string): string {
  const trimmed = target.replace(/\s+/g, ' ').trim();
  const shortTarget = trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
  switch (category) {
    case 'read':
      return shortTarget ? `Read ${shortTarget}` : name;
    case 'edit':
      return shortTarget ? `Edit ${shortTarget}` : name;
    case 'shell':
      return shortTarget || name;
    case 'search':
      return shortTarget ? `${name} ${shortTarget}` : name;
    case 'web':
      return shortTarget ? `Fetch ${shortTarget}` : name;
    default:
      return shortTarget ? `${name} ${shortTarget}` : name;
  }
}

/**
 * Best-effort "what is this call acting on" from an arbitrary tool input blob.
 * Every CLI names this argument differently; the union of their spellings is
 * short enough to just enumerate.
 */
export function primaryTarget(input: Record<string, unknown>): string {
  const keys = [
    'command',
    'cmd',
    'file_path',
    'filePath',
    'path',
    'file',
    'pattern',
    'query',
    'url',
    'description',
    'prompt',
  ];
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value.join(' ');
  }
  return '';
}

export const EMPTY_USAGE: RuntimeUsage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
