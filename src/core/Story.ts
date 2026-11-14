import { bus } from './events';

/**
 * Persistent world facts shared by every system: what has happened, what the player has been told,
 * which decisions were taken. Dialogue, NPC behaviour and mission logic all read and write it.
 */
export class Story {
  private facts = new Map<string, number | string | boolean>();

  get<T extends number | string | boolean = boolean>(k: string, d?: T): T { return (this.facts.has(k) ? this.facts.get(k) : d ?? false) as T; }
  has(k: string) { return !!this.facts.get(k); }
  num(k: string) { return Number(this.facts.get(k) ?? 0); }
  set(k: string, v: number | string | boolean = true) {
    if (this.facts.get(k) === v) return;
    this.facts.set(k, v);
    bus.emit('story', { key: k, value: v });
    bus.emit(`story:${k}`, v);
  }
  add(k: string, d = 1) { this.set(k, this.num(k) + d); }
  serialize() { return Object.fromEntries(this.facts); }
  deserialize(d: any) { this.facts.clear(); if (d) for (const k in d) this.facts.set(k, d[k]); }
  reset() { this.facts.clear(); }
}

export const story = new Story();
