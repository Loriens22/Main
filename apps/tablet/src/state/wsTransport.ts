import type { ClientCommand, ConnectionState, ServerEvent, Transport } from '@ornight/protocol';

/**
 * WebSocket transport to a live Ornight daemon.
 *
 * Reconnects with exponential backoff and buffers commands issued while the
 * socket is down, so a tablet that sleeps mid-turn wakes up and catches back up
 * rather than dropping the operator's input on the floor.
 */
export class WebSocketTransport implements Transport {
  private socket: WebSocket | null = null;
  private listeners = new Set<(event: ServerEvent) => void>();
  private stateListeners = new Set<(state: ConnectionState) => void>();
  private queue: ClientCommand[] = [];
  private attempt = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  state: ConnectionState = 'connecting';

  constructor(private readonly url: string) {
    this.open();
  }

  private open(): void {
    if (this.closed) return;
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setState('connected');
      for (const command of this.queue.splice(0)) this.rawSend(command);
      this.heartbeat = setInterval(() => this.rawSend({ type: 'ping' }), 20_000);
    };

    socket.onmessage = (raw) => {
      // The daemon may batch several events into one frame, newline-delimited.
      for (const line of String(raw.data).split('\n')) {
        if (!line.trim()) continue;
        let event: ServerEvent;
        try {
          event = JSON.parse(line) as ServerEvent;
        } catch {
          continue;
        }
        for (const listener of this.listeners) listener(event);
      }
    };

    socket.onclose = () => {
      this.clearHeartbeat();
      this.scheduleReconnect();
    };

    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    this.setState(this.attempt === 0 ? 'reconnecting' : 'offline');
    const delay = Math.min(500 * 2 ** this.attempt, 15_000);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private rawSend(command: ClientCommand): void {
    this.socket?.send(JSON.stringify(command));
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }

  send(command: ClientCommand): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.rawSend(command);
    else this.queue.push(command);
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.clearHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.listeners.clear();
    this.stateListeners.clear();
  }
}

/**
 * Resolves which daemon to talk to, in priority order: an explicit `?daemon=`
 * query parameter, a previously paired daemon in localStorage, then the origin
 * that served the app (the common case — the daemon serves the PWA itself).
 *
 * Returns null when the app is running standalone (published build, opened from
 * a file, or no daemon reachable), which puts the UI into demo mode.
 */
export function resolveDaemonUrl(): string | null {
  const params = new URLSearchParams(location.search);
  const explicit = params.get('daemon');
  if (explicit) {
    try {
      localStorage.setItem('ornight.daemon', explicit);
    } catch {
      /* private mode — fine, it just won't persist */
    }
    return toWs(explicit);
  }

  let stored: string | null = null;
  try {
    stored = localStorage.getItem('ornight.daemon');
  } catch {
    stored = null;
  }
  if (stored) return toWs(stored);

  // A single-file build has no daemon behind it by definition.
  if (__ORNIGHT_SINGLE_FILE__) return null;
  if (location.protocol === 'file:') return null;
  // Published artifact / static host: not a daemon, so stay in demo mode.
  if (!location.port && location.hostname.endsWith('claude.ai')) return null;

  return toWs(location.origin);
}

function toWs(origin: string): string {
  const url = new URL(origin.includes('://') ? origin : `http://${origin}`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  return url.toString();
}
