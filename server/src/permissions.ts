import { getChat } from './chats.js';
import { opencode } from './opencode.js';
import { getProject, HttpError } from './projects.js';
import { getPermission, removeQuestion, questionsForChat } from './state.js';

export type PermissionReply = 'once' | 'always' | 'reject';

/** Answers a pending tool approval. Works for both the classic and v2 permission event flavours. */
export async function replyPermission(requestID: string, reply: PermissionReply, message?: string): Promise<void> {
  const pending = getPermission(requestID);
  if (!pending) throw new HttpError(404, 'This approval request is no longer pending');
  const chat = getChat(pending.chatId);
  const project = getProject(chat.project_id);
  const body = { reply, ...(message ? { message } : {}) };
  if (pending.request.v2) {
    await opencode.request('POST', `/api/session/${pending.request.sessionID}/permission/${requestID}/reply`, { body });
  } else {
    await opencode.request('POST', `/permission/${requestID}/reply`, { directory: project.path, body });
  }
}

export async function replyQuestion(chatId: string, requestID: string, answers: string[][] | null): Promise<void> {
  const q = questionsForChat(chatId).find((x) => x.request.id === requestID);
  if (!q) throw new HttpError(404, 'This question is no longer pending');
  const chat = getChat(chatId);
  const project = getProject(chat.project_id);
  if (answers === null) await opencode.request('POST', `/question/${requestID}/reject`, { directory: project.path, body: {} });
  else await opencode.request('POST', `/question/${requestID}/reply`, { directory: project.path, body: { answers } });
  removeQuestion(requestID);
}
