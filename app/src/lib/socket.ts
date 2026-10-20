import { apiToken, wsUrl } from './api';

type Listener = (msg: any) => void;

/** Realtime event channel with automatic reconnect, auth handshake and heartbeat. */
class RealtimeSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: ConnState) => void>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private wanted = false;
  state: ConnState = 'offline';

  connect(): void {
    this.wanted = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const token = apiToken();
    if (!token) return;
    this.setState(this.retry === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl('/ws'));
    } catch {
      this.schedule();
      return;
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'hello') {
        this.retry = 0;
        this.setState('online');
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping', t: Date.now() })), 20_000);
      }
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = (ev) => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.ws = null;
      if (ev.code === 4003) {
        this.setState('unauthorized');
        return;
      }
      if (this.wanted) this.schedule();
      else this.setState('offline');
    };
    ws.onerror = () => ws.close();
  }

  private schedule(): void {
    this.setState('reconnecting');
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.min(15_000, 500 * 2 ** Math.min(this.retry++, 5)) + Math.random() * 400;
    this.timer = setTimeout(() => this.connect(), delay);
  }

  /** Reconnect immediately (e.g. when the app returns to the foreground). */
  nudge(): void {
    if (!this.wanted) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.retry = 0;
    if (this.timer) clearTimeout(this.timer);
    this.connect();
  }

  disconnect(): void {
    this.wanted = false;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.setState('offline');
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onState(l: (s: ConnState) => void): () => void {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }

  private setState(s: ConnState): void {
    if (this.state === s) return;
    this.state = s;
    for (const l of this.stateListeners) l(s);
  }
}

export type ConnState = 'offline' | 'connecting' | 'online' | 'reconnecting' | 'unauthorized';
export const realtime = new RealtimeSocket();
