import { EventEmitter } from 'node:events';
import type { Activity } from './activity.js';

/** Internal event bus between the opencode event router, group orchestrator and voice calls. */
export interface BusEvents {
  'session.idle': { sessionID: string; chatId: string; agentId?: string };
  'session.busy': { sessionID: string; chatId: string; agentId?: string };
  'session.error': { sessionID: string; chatId: string; agentId?: string; error: string };
  activity: { chatId: string; agentId?: string; sessionID: string; activity: Activity };
  'text.delta': { chatId: string; agentId?: string; sessionID: string; messageID: string; partID: string; delta: string };
  'text.part': { chatId: string; agentId?: string; sessionID: string; messageID: string; partID: string; text: string; done: boolean };
  'message.completed': { chatId: string; agentId?: string; sessionID: string; messageID: string; role: string; error?: string };
  permission: { chatId: string; agentId?: string; request: PendingPermission };
  'permission.replied': { chatId: string; requestID: string };
}

export interface PendingPermission {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  title: string;
  metadata: Record<string, unknown>;
  always: string[];
  tool?: { messageID: string; callID: string };
  createdAt: number;
  v2?: boolean;
}

class TypedBus extends EventEmitter {
  emitT<K extends keyof BusEvents>(k: K, v: BusEvents[K]): void {
    this.emit(k, v);
  }
  onT<K extends keyof BusEvents>(k: K, fn: (v: BusEvents[K]) => void): () => void {
    this.on(k, fn);
    return () => this.off(k, fn);
  }
}

export const bus = new TypedBus();
bus.setMaxListeners(100);
