import type { WebSocket } from 'ws';
import { logger } from './log.js';

const log = logger('hub');

export interface ClientMsg {
  type: string;
  [k: string]: unknown;
}

interface Client {
  ws: WebSocket;
  deviceId: string;
  alive: boolean;
}

const clients = new Set<Client>();

export function addClient(ws: WebSocket, deviceId: string): void {
  const c: Client = { ws, deviceId, alive: true };
  clients.add(c);
  ws.on('pong', () => (c.alive = true));
  ws.on('close', () => clients.delete(c));
  ws.on('error', () => clients.delete(c));
  log.debug(`client connected (${clients.size})`);
}

export function broadcast(msg: ClientMsg): void {
  if (clients.size === 0) return;
  const data = JSON.stringify(msg);
  for (const c of clients) {
    if (c.ws.readyState === 1) {
      // Drop frames for very slow clients instead of buffering unbounded memory.
      if (c.ws.bufferedAmount > 8 * 1024 * 1024) continue;
      c.ws.send(data);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}

setInterval(() => {
  for (const c of clients) {
    if (!c.alive) {
      c.ws.terminate();
      clients.delete(c);
      continue;
    }
    c.alive = false;
    try {
      c.ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 25_000).unref();
