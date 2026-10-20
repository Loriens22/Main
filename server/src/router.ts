import { describeError, toolActivity, type Activity } from './activity.js';
import { bus, type PendingPermission } from './bus.js';
import { emitChat, setPreview } from './chats.js';
import { broadcast } from './hub.js';
import { logger } from './log.js';
import { opencode, type OcEvent } from './opencode.js';
import {
  addPermission,
  addQuestion,
  chatStatus,
  getSessionStatus,
  indexSession,
  lookupSession,
  removePermission,
  removeQuestion,
  retryInfo,
  setSessionStatus,
} from './state.js';

const log = logger('router');

const partType = new Map<string, string>(); // partID → part type
const partText = new Map<string, { messageID: string; text: string }>();
const messageRole = new Map<string, string>();
const toolState = new Map<string, string>(); // callID → last status
const completedMessages = new Set<string>();
const lastChatStatus = new Map<string, string>();

function trim<K, V>(m: Map<K, V>, max = 5000): void {
  if (m.size <= max) return;
  const drop = m.size - max;
  let i = 0;
  for (const k of m.keys()) {
    if (i++ >= drop) break;
    m.delete(k);
  }
}

function sessionOf(ev: OcEvent): string | undefined {
  const p = ev.properties ?? {};
  return p.sessionID ?? p.info?.sessionID ?? p.part?.sessionID ?? (ev.type.startsWith('session.') ? p.info?.id : undefined);
}

function emitActivity(chatId: string, agentId: string | undefined, sessionID: string, activity: Activity): void {
  broadcast({ type: 'activity', chatId, agentId, sessionID, activity, at: Date.now() });
  bus.emitT('activity', { chatId, agentId, sessionID, activity });
}

function refreshStatus(chatId: string): void {
  const s = chatStatus(chatId);
  if (lastChatStatus.get(chatId) === s) return;
  lastChatStatus.set(chatId, s);
  broadcast({ type: 'chat.status', chatId, status: s, retry: retryInfo(chatId) });
  emitChat(chatId);
}

export function startRouter(): void {
  opencode.on('event', (ev: OcEvent) => {
    try {
      route(ev);
    } catch (e) {
      log.error(`failed to route ${ev.type}`, e);
    }
  });
}

function route(ev: OcEvent): void {
  const p = ev.properties ?? {};

  // Sub-agent sessions spawned by the task tool inherit their parent's chat.
  if (ev.type === 'session.created' && p.info?.parentID) {
    const parent = lookupSession(p.info.parentID);
    if (parent) indexSession(p.info.id, parent.chatId, parent.agentId, true);
  }

  const sessionID = sessionOf(ev);
  const owner = lookupSession(sessionID);
  if (!owner || !sessionID) return;
  const { chatId, agentId, child } = owner;

  // Forward the raw event so the client can render live message/part updates.
  broadcast({ type: 'oc', chatId, agentId, sessionID, child: !!child, event: { type: ev.type, properties: p } });

  switch (ev.type) {
    case 'session.status':
    case 'session.idle': {
      const st = ev.type === 'session.idle' ? { type: 'idle' } : (p.status ?? { type: 'idle' });
      const prev = getSessionStatus(sessionID);
      setSessionStatus(sessionID, st);
      if (st.type === 'busy' && prev !== 'busy') bus.emitT('session.busy', { sessionID, chatId, agentId });
      if (st.type === 'retry') emitActivity(chatId, agentId, sessionID, { kind: 'retry', label: `Retrying: ${String(st.message ?? 'provider error').slice(0, 100)}` });
      if (st.type === 'idle' && prev !== 'idle' && !child) bus.emitT('session.idle', { sessionID, chatId, agentId });
      refreshStatus(chatId);
      break;
    }
    case 'session.error': {
      const msg = describeError(p.error);
      if (p.error?.name !== 'MessageAbortedError') {
        emitActivity(chatId, agentId, sessionID, { kind: 'error', label: msg, ok: false });
        bus.emitT('session.error', { sessionID, chatId, agentId, error: msg });
      }
      break;
    }
    case 'message.updated': {
      const info = p.info ?? {};
      messageRole.set(info.id, info.role);
      trim(messageRole);
      if (info.role === 'assistant' && info.time?.completed && !completedMessages.has(info.id)) {
        completedMessages.add(info.id);
        if (completedMessages.size > 5000) completedMessages.clear();
        const texts = [...partText.values()].filter((t) => t.messageID === info.id).map((t) => t.text);
        const text = texts.join('\n').trim();
        const err = info.error && info.error.name !== 'MessageAbortedError' ? describeError(info.error) : undefined;
        if (!child) {
          if (text) setPreview(chatId, text);
          else if (err) setPreview(chatId, `⚠ ${err}`);
          bus.emitT('message.completed', { chatId, agentId, sessionID, messageID: info.id, role: 'assistant', error: err });
        }
        if (err) emitActivity(chatId, agentId, sessionID, { kind: 'error', label: err, ok: false });
      }
      break;
    }
    case 'message.part.updated': {
      const part = p.part ?? {};
      partType.set(part.id, part.type);
      trim(partType);
      if (part.type === 'text' && !part.synthetic) {
        partText.set(part.id, { messageID: part.messageID, text: part.text ?? '' });
        trim(partText, 2000);
        if (messageRole.get(part.messageID) !== 'user')
          bus.emitT('text.part', { chatId, agentId, sessionID, messageID: part.messageID, partID: part.id, text: part.text ?? '', done: !!part.time?.end });
      } else if (part.type === 'reasoning' && !toolState.has(part.id)) {
        toolState.set(part.id, 'thinking');
        emitActivity(chatId, agentId, sessionID, { kind: 'thinking', label: 'Thinking' });
      } else if (part.type === 'tool') {
        const status = part.state?.status;
        const key = part.callID ?? part.id;
        const prev = toolState.get(key);
        // pending → running can repeat with growing input; report each phase once.
        const phase = status === 'pending' ? 'running' : status;
        if (prev !== phase) {
          const a = toolActivity(part);
          if (a) {
            toolState.set(key, phase);
            emitActivity(chatId, agentId, sessionID, a);
          }
        }
        trim(toolState);
      }
      break;
    }
    case 'message.part.delta': {
      if (p.field === 'text' && partType.get(p.partID) === 'text' && messageRole.get(p.messageID) !== 'user') {
        const cur = partText.get(p.partID);
        partText.set(p.partID, { messageID: p.messageID, text: (cur?.text ?? '') + (p.delta ?? '') });
        bus.emitT('text.delta', { chatId, agentId, sessionID, messageID: p.messageID, partID: p.partID, delta: p.delta ?? '' });
      }
      break;
    }
    case 'permission.asked':
    case 'permission.v2.asked': {
      const req: PendingPermission = {
        id: p.id,
        sessionID,
        permission: p.permission ?? p.action ?? 'action',
        patterns: p.patterns ?? (Array.isArray(p.resources) ? p.resources.map(String) : []),
        title: permissionTitle(p),
        metadata: p.metadata ?? {},
        always: p.always ?? [],
        tool: p.tool,
        createdAt: Date.now(),
        v2: ev.type === 'permission.v2.asked',
      };
      addPermission(chatId, agentId, req);
      broadcast({ type: 'permission', chatId, agentId, request: req });
      bus.emitT('permission', { chatId, agentId, request: req });
      emitActivity(chatId, agentId, sessionID, { kind: 'permission', label: req.title });
      refreshStatus(chatId);
      emitChat(chatId);
      break;
    }
    case 'permission.replied':
    case 'permission.v2.replied': {
      const id = p.requestID ?? p.permissionID;
      removePermission(id);
      broadcast({ type: 'permission.resolved', chatId, requestID: id, reply: p.reply ?? p.response });
      bus.emitT('permission.replied', { chatId, requestID: id });
      refreshStatus(chatId);
      emitChat(chatId);
      break;
    }
    case 'question.asked':
    case 'question.v2.asked': {
      addQuestion(chatId, agentId, { ...p, sessionID });
      broadcast({ type: 'question', chatId, agentId, request: { ...p, sessionID } });
      emitActivity(chatId, agentId, sessionID, { kind: 'question', label: p.questions?.[0]?.header ?? 'Has a question' });
      break;
    }
    case 'question.replied':
    case 'question.rejected':
    case 'question.v2.replied':
    case 'question.v2.rejected': {
      removeQuestion(p.requestID);
      broadcast({ type: 'question.resolved', chatId, requestID: p.requestID });
      break;
    }
    case 'session.updated': {
      emitChat(chatId);
      break;
    }
    default:
      break;
  }
}

function permissionTitle(p: any): string {
  const kind = p.permission ?? p.action ?? '';
  const md = p.metadata ?? {};
  const pat = (p.patterns ?? p.resources ?? [])[0];
  if (kind === 'bash') return `Run \`${String(md.command ?? pat ?? 'a command').slice(0, 80)}\``;
  if (kind === 'edit' || kind === 'write') return `Edit ${String(md.filepath ?? md.filePath ?? pat ?? 'a file').split('/').pop()}`;
  if (kind === 'webfetch') return `Fetch ${String(md.url ?? pat ?? 'a web page').slice(0, 60)}`;
  if (kind === 'external_directory') return `Access ${String(pat ?? 'a folder outside the project')}`;
  if (kind === 'doom_loop') return 'Keep repeating the same action';
  return `${kind || 'Action'} ${pat ? String(pat).slice(0, 60) : ''}`.trim();
}
