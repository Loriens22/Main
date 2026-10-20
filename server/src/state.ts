import type { PendingPermission } from './bus.js';
import { db } from './db.js';

/** sessionID → owning chat (and group agent). Child sessions created by the task tool map to their root chat. */
const sessionIndex = new Map<string, { chatId: string; agentId?: string; child?: boolean }>();
const sessionStatus = new Map<string, { type: string; message?: string; next?: number }>();
const pendingPermissions = new Map<string, { chatId: string; agentId?: string; request: PendingPermission }>();
const pendingQuestions = new Map<string, { chatId: string; agentId?: string; request: any }>();
const groupRunning = new Set<string>();

export function rebuildIndex(): void {
  sessionIndex.clear();
  for (const r of db.prepare('SELECT id, session_id FROM chats WHERE session_id IS NOT NULL').all() as { id: string; session_id: string }[]) {
    sessionIndex.set(r.session_id, { chatId: r.id });
  }
  for (const r of db.prepare('SELECT id, chat_id, session_id FROM group_agents WHERE session_id IS NOT NULL').all() as {
    id: string;
    chat_id: string;
    session_id: string;
  }[]) {
    sessionIndex.set(r.session_id, { chatId: r.chat_id, agentId: r.id });
  }
}

export function indexSession(sessionID: string, chatId: string, agentId?: string, child = false): void {
  sessionIndex.set(sessionID, { chatId, agentId, child });
}

export function lookupSession(sessionID: string | undefined) {
  return sessionID ? sessionIndex.get(sessionID) : undefined;
}

export function unindexChat(chatId: string): void {
  for (const [sid, v] of sessionIndex) if (v.chatId === chatId) sessionIndex.delete(sid);
  for (const [id, v] of pendingPermissions) if (v.chatId === chatId) pendingPermissions.delete(id);
  for (const [id, v] of pendingQuestions) if (v.chatId === chatId) pendingQuestions.delete(id);
  groupRunning.delete(chatId);
}

export function setSessionStatus(sessionID: string, status: { type: string; message?: string; next?: number }): void {
  sessionStatus.set(sessionID, status);
}

export function getSessionStatus(sessionID: string) {
  return sessionStatus.get(sessionID)?.type ?? 'idle';
}

export function setGroupRunning(chatId: string, running: boolean): void {
  if (running) groupRunning.add(chatId);
  else groupRunning.delete(chatId);
}

export function isGroupRunning(chatId: string): boolean {
  return groupRunning.has(chatId);
}

/** Aggregate status of every session that belongs to a chat. */
export function chatStatus(chatId: string): string {
  let status = groupRunning.has(chatId) ? 'busy' : 'idle';
  for (const [sid, v] of sessionIndex) {
    if (v.chatId !== chatId) continue;
    const s = sessionStatus.get(sid)?.type;
    if (s === 'retry') return 'retry';
    if (s === 'busy') status = 'busy';
  }
  if (status === 'idle' && pendingForChat(chatId).length) return 'waiting';
  return status;
}

export function retryInfo(chatId: string): { message?: string; next?: number } | undefined {
  for (const [sid, v] of sessionIndex) {
    if (v.chatId !== chatId) continue;
    const s = sessionStatus.get(sid);
    if (s?.type === 'retry') return { message: s.message, next: s.next };
  }
  return undefined;
}

export function addPermission(chatId: string, agentId: string | undefined, request: PendingPermission): void {
  pendingPermissions.set(request.id, { chatId, agentId, request });
}

export function removePermission(id: string) {
  const v = pendingPermissions.get(id);
  pendingPermissions.delete(id);
  return v;
}

export function getPermission(id: string) {
  return pendingPermissions.get(id);
}

export function pendingForChat(chatId: string) {
  return [...pendingPermissions.values()].filter((p) => p.chatId === chatId);
}

export function addQuestion(chatId: string, agentId: string | undefined, request: any): void {
  pendingQuestions.set(request.id, { chatId, agentId, request });
}

export function removeQuestion(id: string) {
  const v = pendingQuestions.get(id);
  pendingQuestions.delete(id);
  return v;
}

export function questionsForChat(chatId: string) {
  return [...pendingQuestions.values()].filter((q) => q.chatId === chatId);
}

export function allPending() {
  return {
    permissions: [...pendingPermissions.values()],
    questions: [...pendingQuestions.values()],
  };
}
