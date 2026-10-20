import WebSocket from 'ws';
import type { WebSocket as WsType } from 'ws';
import { bus } from './bus.js';
import { abortChat, createChat, getAgents, getChat, listChats, sendSingle } from './chats.js';
import { config } from './config.js';
import { getSetting } from './db.js';
import { sendGroup, abortGroup } from './groups.js';
import { logger } from './log.js';
import { createProject, findProjectByName } from './projects.js';
import { replyPermission } from './permissions.js';
import { chatStatus, pendingForChat } from './state.js';

const log = logger('voice');

const VOICE_SYSTEM = `The user is talking to you live by voice through Maverick Bot's call mode; your text replies are spoken aloud.
- Start with one short spoken sentence acknowledging the request, then do the actual work with your tools.
- Keep spoken replies brief and natural (1–3 short sentences). No markdown tables or bullet lists.
- Never read code, file contents or long paths aloud; say what you changed instead (code still appears in the chat).
- When you finish, say in one or two sentences what you did and how you verified it.`;

export interface VoicePrefs {
  voice: string;
  speed: number;
}

export function getVoicePrefs(): VoicePrefs {
  return getSetting<VoicePrefs>('voice', { voice: 'af_heart', speed: 1.05 });
}

const YES = /^(yes|yeah|yep|yup|sure|ok(ay)?|go ahead|do it|approve(d)?|allow( it)?|run it|please do|sounds good|go for it)\b/i;
const ALWAYS = /\balways\b/i;
const NO = /^(no|nope|nah|don'?t|do not|deny|reject|cancel that|skip( it)?)\b/i;
const STOP = /^(stop|cancel|abort|never ?mind|hold on|wait,? stop)\b/i;

/** Strips markdown so text sounds natural when synthesized. */
export function speechText(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/`([^`]{1,40})`/g, '$1')
    .replace(/`[^`]*`/g, 'that')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/[|>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pulls complete, speakable sentences from streaming markdown, skipping fenced code. */
export function extractSentences(raw: string, from: number, final: boolean): { sentences: string[]; next: number; skippedCode: boolean } {
  const sentences: string[] = [];
  let i = from;
  let skippedCode = false;
  while (i < raw.length) {
    const rest = raw.slice(i);
    const lead = rest.match(/^\s+/)?.[0].length ?? 0;
    if (rest.slice(lead).startsWith('```')) {
      const close = raw.indexOf('```', i + lead + 3);
      if (close < 0) {
        if (!final) break;
        skippedCode = true;
        i = raw.length;
        break;
      }
      skippedCode = true;
      i = close + 3;
      continue;
    }
    const fence = rest.indexOf('```', lead);
    const window = fence >= 0 ? rest.slice(0, fence) : rest;
    const m = /([.!?]+["')\]]*)(\s+|$)|\n\s*\n|\n(?=\s*[-*+]\s|\s*\d+[.)]\s)/.exec(window);
    let end = -1;
    if (m && (m.index + m[0].length < window.length || final || fence >= 0)) end = m.index + m[0].length;
    else if (window.length > 240) {
      const cut = window.slice(0, 240).search(/[,;:]\s[^,;:]*$/);
      if (cut > 60) end = cut + 1;
    }
    if (end < 0) {
      if (fence >= 0 && fence > 0) end = fence;
      else if (final) end = window.length;
      else break;
    }
    const piece = speechText(raw.slice(i, i + end));
    if (piece && /[a-z0-9]/i.test(piece)) sentences.push(piece);
    i += end;
    if (end === 0) break;
  }
  return { sentences, next: i, skippedCode };
}

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
}

/** One live voice call: phone ⇄ gateway ⇄ speech engine, driving the same OpenCode sessions as text chat. */
export class VoiceCall {
  private engine: WebSocket | null = null;
  private seq = 0;
  private prefs = getVoicePrefs();
  private chatId: string;
  private appPlaying = false;
  private queued = 0; // TTS jobs sent but not finished
  private recentSpoken: string[] = [];
  private parts = new Map<string, { raw: string; spoken: number; count: number; codeNoted: boolean }>();
  private unsub: Array<() => void> = [];
  private lastNarration = 0;
  private narratedEditThisTurn = false;
  private closed = false;
  private turnActive = false;

  constructor(
    private app: WsType,
    chatId: string,
    opts: Partial<VoicePrefs>,
  ) {
    this.chatId = chatId;
    if (opts.voice) this.prefs.voice = opts.voice;
    if (opts.speed) this.prefs.speed = Math.max(0.7, Math.min(1.4, opts.speed));
  }

  private send(msg: Record<string, unknown>): void {
    if (this.app.readyState === 1) this.app.send(JSON.stringify(msg));
  }

  private setState(state: string, detail?: string): void {
    this.send({ type: 'state', state, detail });
  }

  async start(): Promise<void> {
    getChat(this.chatId);
    this.subscribe();
    if (!config.voiceUrl) {
      this.send({ type: 'error', fatal: true, message: 'The voice engine is not configured on this server (VOICE_URL).' });
      return;
    }
    this.setState('connecting', 'Waking up the voice engine…');
    const deadline = Date.now() + 120_000;
    while (!this.closed && Date.now() < deadline) {
      try {
        await this.connectEngine();
        this.setState('listening');
        this.send({ type: 'ready', chatId: this.chatId, voice: this.prefs.voice });
        return;
      } catch (e) {
        log.warn(`voice engine not reachable yet: ${(e as Error).message}`);
        this.setState('connecting', 'Waking up the voice engine…');
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    if (!this.closed) this.send({ type: 'error', fatal: true, message: 'The voice engine did not respond. Try again in a minute.' });
  }

  private connectEngine(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = config.voiceUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/stream';
      const ws = new WebSocket(url, { headers: { 'x-voice-secret': config.voiceSecret }, handshakeTimeout: 10_000 });
      let opened = false;
      ws.on('open', () => {
        opened = true;
        this.engine = ws;
        resolve();
      });
      ws.on('error', (e) => {
        if (!opened) reject(e);
      });
      ws.on('close', () => {
        this.engine = null;
        if (opened && !this.closed) {
          this.send({ type: 'error', message: 'Voice engine disconnected, reconnecting…' });
          void this.connectEngine().catch(() => this.send({ type: 'error', fatal: true, message: 'Lost the voice engine.' }));
        }
      });
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          const buf = data as Buffer;
          if (buf.readUInt8(0) === 2 && this.app.readyState === 1) {
            // Re-frame for the app: [0x01][seq u32][pcm16 @24kHz]
            buf.writeUInt8(1, 0);
            this.app.send(buf, { binary: true });
          }
          return;
        }
        this.onEngine(JSON.parse(String(data)));
      });
    });
  }

  private onEngine(msg: any): void {
    switch (msg.type) {
      case 'asr.partial': {
        if (this.isEcho(msg.text)) return;
        this.send({ type: 'partial', text: msg.text });
        if ((this.appPlaying || this.queued > 0) && (words(msg.text).length >= 2 || msg.text.length >= 8)) this.bargeIn();
        break;
      }
      case 'asr.final': {
        if (this.isEcho(msg.text)) return;
        this.send({ type: 'final', text: msg.text });
        void this.onUtterance(msg.text).catch((e) => {
          log.error('utterance failed', e);
          this.say(`Sorry, that failed: ${(e as Error).message}`.slice(0, 200));
        });
        break;
      }
      case 'tts.first':
        this.send({ type: 'tts.start', seq: msg.seq, latencyMs: msg.ms });
        break;
      case 'tts.done':
      case 'tts.error':
        this.queued = Math.max(0, this.queued - 1);
        this.send({ type: 'tts.end', seq: msg.seq });
        break;
    }
  }

  /** Heuristic echo guard (on top of the phone's echo cancellation): ignore ASR text that matches what we just said. */
  private isEcho(text: string): boolean {
    if (!this.appPlaying && this.queued === 0) return false;
    const w = words(text);
    if (!w.length) return true;
    const spoken = new Set(words(this.recentSpoken.join(' ')));
    const overlap = w.filter((x) => spoken.has(x)).length / w.length;
    return overlap >= 0.7;
  }

  private bargeIn(): void {
    this.engine?.send(JSON.stringify({ type: 'tts.cancel' }));
    this.queued = 0;
    this.send({ type: 'barge_in' });
    // Do not speak the rest of the interrupted reply.
    for (const p of this.parts.values()) p.spoken = p.raw.length;
  }

  say(text: string): void {
    const clean = speechText(text);
    if (!clean || !this.engine) return;
    const seq = ++this.seq;
    this.queued++;
    this.recentSpoken.push(clean);
    if (this.recentSpoken.length > 4) this.recentSpoken.shift();
    this.engine.send(JSON.stringify({ type: 'tts', seq, text: clean, voice: this.prefs.voice, speed: this.prefs.speed }));
    this.send({ type: 'assistant', seq, text: clean });
  }

  onAppAudio(buf: Buffer): void {
    if (!this.engine || this.engine.readyState !== 1) return;
    const out = Buffer.allocUnsafe(buf.length + 1);
    out.writeUInt8(1, 0);
    buf.copy(out, 1);
    this.engine.send(out, { binary: true });
  }

  onAppMessage(msg: any): void {
    switch (msg.type) {
      case 'playback':
        this.appPlaying = !!msg.playing;
        if (!this.appPlaying && this.queued === 0) this.setState(chatStatus(this.chatId) === 'busy' ? 'working' : 'listening');
        break;
      case 'interrupt':
        this.bargeIn();
        break;
      case 'text':
        if (typeof msg.text === 'string' && msg.text.trim()) void this.onUtterance(msg.text.trim());
        break;
      case 'prefs':
        if (msg.voice) this.prefs.voice = String(msg.voice);
        if (msg.speed) this.prefs.speed = Math.max(0.7, Math.min(1.4, Number(msg.speed)));
        break;
    }
  }

  private leadSessionAgentId(): string | undefined {
    const chat = getChat(this.chatId);
    if (chat.kind !== 'group') return undefined;
    const agents = getAgents(this.chatId);
    return (agents.find((a) => a.is_lead) ?? agents[0])?.id;
  }

  private subscribe(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.parts.clear();
    const isMine = (chatId: string, agentId?: string) => chatId === this.chatId && (agentId === undefined || agentId === this.leadSessionAgentId());

    this.unsub.push(
      bus.onT('text.delta', (e) => {
        if (!isMine(e.chatId, e.agentId)) return;
        const p = this.parts.get(e.partID) ?? { raw: '', spoken: 0, count: 0, codeNoted: false };
        p.raw += e.delta;
        this.parts.set(e.partID, p);
        this.flush(e.partID, false);
      }),
      bus.onT('text.part', (e) => {
        if (!isMine(e.chatId, e.agentId)) return;
        const p = this.parts.get(e.partID) ?? { raw: '', spoken: 0, count: 0, codeNoted: false };
        if (e.text.length >= p.raw.length) p.raw = e.text;
        this.parts.set(e.partID, p);
        this.flush(e.partID, e.done);
      }),
      bus.onT('activity', (e) => {
        if (e.chatId !== this.chatId) return;
        this.send({ type: 'activity', activity: e.activity, agentId: e.agentId });
        this.narrate(e.activity);
      }),
      bus.onT('permission', (e) => {
        if (e.chatId !== this.chatId) return;
        this.say(`I need your permission to ${e.request.title.replace(/`/g, '').replace(/^Run /, 'run ').replace(/^Edit /, 'edit ')}. Should I go ahead?`);
      }),
      bus.onT('session.busy', (e) => {
        if (e.chatId === this.chatId && !this.appPlaying) this.setState('working');
      }),
      bus.onT('session.idle', (e) => {
        if (e.chatId !== this.chatId) return;
        this.turnActive = false;
        if (!this.appPlaying && this.queued === 0) this.setState('listening');
      }),
    );
  }

  private flush(partID: string, final: boolean): void {
    const p = this.parts.get(partID)!;
    const { sentences, next, skippedCode } = extractSentences(p.raw, p.spoken, final);
    p.spoken = next;
    if (skippedCode && !p.codeNoted) {
      p.codeNoted = true;
      sentences.push("I've put the code in the chat.");
    }
    for (const s of sentences) {
      if (p.count === 8) this.say('The rest is in the chat.');
      if (p.count++ >= 8) continue;
      this.say(s);
    }
  }

  /** Brief, factual progress updates while the agent works, rate-limited so it never rambles. */
  private narrate(a: { kind: string; label: string; ok?: boolean }): void {
    const t = Date.now();
    const important = ['test-result', 'build-result', 'error', 'tool-error'].includes(a.kind);
    if (a.kind === 'editing' && !this.narratedEditThisTurn && this.turnActive) {
      this.narratedEditThisTurn = true;
    } else if (!important) return;
    if (!important && (this.queued > 0 || this.appPlaying)) return;
    if (!important && t - this.lastNarration < 8000) return;
    if (a.kind === 'tool-error' && this.queued > 0) return;
    this.lastNarration = t;
    this.say(a.label.replace(/`/g, '') + '.');
  }

  private async switchChat(chatId: string): Promise<void> {
    this.chatId = chatId;
    this.subscribe();
    this.send({ type: 'chat', chatId });
  }

  private async onUtterance(text: string): Promise<void> {
    const pending = pendingForChat(this.chatId);
    const busy = chatStatus(this.chatId) === 'busy';
    if (pending.length) {
      const req = pending[0];
      if (YES.test(text)) {
        await replyPermission(req.request.id, ALWAYS.test(text) ? 'always' : 'once');
        this.say(ALWAYS.test(text) ? 'Okay, I will always allow that.' : 'Okay, going ahead.');
        return;
      }
      if (NO.test(text)) {
        await replyPermission(req.request.id, 'reject');
        this.say("Okay, I won't do that.");
        return;
      }
    }
    if (STOP.test(text) && (busy || pending.length)) {
      const chat = getChat(this.chatId);
      if (chat.kind === 'group') await abortGroup(this.chatId);
      else await abortChat(this.chatId);
      this.say('Stopped.');
      return;
    }
    const create = /\b(?:create|make|start|set up)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named)\s+(.{1,60}?)[.!?]?$/i.exec(text);
    if (create) {
      const name = create[1].replace(/\s+(please|for me|now)$/i, '').trim();
      const project = await createProject({ name });
      const chat = await createChat({ projectId: project.id, title: `${project.name} (voice)` });
      await this.switchChat(chat.id);
      this.say(`Created the project ${project.name}. What should we build?`);
      return;
    }
    const sw = /\b(?:switch|go|change|move)\s+(?:over\s+)?to\s+(?:the\s+)?(?:project\s+)?(.{1,60}?)(?:\s+project)?[.!?]?$/i.exec(text);
    if (sw && /project/i.test(text)) {
      const project = findProjectByName(sw[1]);
      if (!project) {
        this.say(`I couldn't find a project called ${sw[1]}.`);
        return;
      }
      const existing = listChats().find((c) => c.projectId === project.id && c.kind === 'single');
      const chat = existing ?? (await createChat({ projectId: project.id, title: `${project.name} (voice)` }));
      await this.switchChat(chat.id);
      this.say(`Switched to ${project.name}.`);
      return;
    }
    this.setState('thinking');
    this.turnActive = true;
    this.narratedEditThisTurn = false;
    const chat = getChat(this.chatId);
    if (chat.kind === 'group') await sendGroup(this.chatId, { text });
    else await sendSingle(this.chatId, { text, system: VOICE_SYSTEM });
  }

  close(): void {
    this.closed = true;
    for (const u of this.unsub) u();
    this.engine?.close();
  }
}

export async function voiceEngineHealth(): Promise<{ ok: boolean; detail?: string }> {
  if (!config.voiceUrl) return { ok: false, detail: 'not configured' };
  try {
    const r = await fetch(config.voiceUrl.replace(/\/$/, '') + '/health', { signal: AbortSignal.timeout(4000) });
    return { ok: r.ok, detail: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export async function engineFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!config.voiceUrl) throw new Error('Voice engine not configured');
  return fetch(config.voiceUrl.replace(/\/$/, '') + path, {
    ...init,
    headers: { ...(init.headers ?? {}), 'x-voice-secret': config.voiceSecret },
    signal: AbortSignal.timeout(60_000),
  });
}
