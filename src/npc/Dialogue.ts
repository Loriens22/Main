import type { Game } from '../core/Game';
import { bus } from '../core/events';
import { story, Story } from '../core/Story';
import { ui } from '../ui/store';
import type { NPC } from './NPC';

export type Text = string | string[];

export interface DCtx {
  npc: NPC;
  game: Game;
  story: Story;
  /** how many times this NPC has already delivered a topic */
  n(topic: string): number;
  /** standing with the player, -100..100 */
  rel: number;
}

export interface Topic {
  id: string;
  label: string | ((c: DCtx) => string);
  when?: (c: DCtx) => boolean;
  /** successive answers: the first time, the second time, ... The last one is reused (with a recap lead-in) afterwards. */
  say: (Text | ((c: DCtx) => Text))[];
  effect?: (c: DCtx) => void;
  /** drop the topic from the list once it has been answered */
  once?: boolean;
  /** only offered after another topic has been answered */
  after?: string;
  /** the conversation ends after this answer */
  end?: boolean;
}

export interface DialogueDef {
  greet(c: DCtx): Text;
  topics: Topic[];
  bye?(c: DCtx): Text;
}

export interface Exchange { who: string; text: string; player?: boolean }

const RECAP = ['Like I said — ', 'Same as before: ', 'Nothing has changed since you asked. ', 'You have heard this already, but: ', 'Once more, then: '];

/** Runs one conversation at a time between the player and an NPC. */
export class Conversation {
  npc: NPC | null = null;
  log: Exchange[] = [];
  private ended = 0;

  constructor(private game: Game) {
    bus.on('npc:talk', (n: NPC) => this.start(n));
    ui.subscribe(() => { if (this.npc && ui.get().panel !== 'dialogue') this.finish(false); });
  }

  private ctx(npc: NPC): DCtx {
    return { npc, game: this.game, story, n: (t) => npc.state.said[t] ?? 0, rel: npc.state.relationship };
  }

  private push(who: string, t: Text, player = false) {
    for (const text of Array.isArray(t) ? t : [t]) if (text) this.log.push({ who, text, player });
    if (this.log.length > 60) this.log.splice(0, this.log.length - 60);
  }

  start(npc: NPC) {
    if (this.npc || !npc.dialogue || this.game.state !== 'playing') return;
    this.npc = npc;
    npc.talking = true;
    npc.state.conversation = 'player';
    npc.stop();
    this.log = [];
    const c = this.ctx(npc);
    this.push(npc.name, npc.dialogue.greet(c));
    npc.state.said.__greet = (npc.state.said.__greet ?? 0) + 1;
    if (npc.state.said.__greet === 1) npc.state.relationship = Math.min(100, npc.state.relationship + 2);
    this.game.openPanel('dialogue');
    bus.emit('npc:conversation', { npc, active: true });
  }

  topics(): { id: string; label: string }[] {
    const npc = this.npc;
    if (!npc?.dialogue) return [];
    const c = this.ctx(npc);
    const out: { id: string; label: string }[] = [];
    for (const t of npc.dialogue.topics) {
      if (t.once && c.n(t.id) > 0) continue;
      if (t.after && c.n(t.after) === 0) continue;
      if (t.when && !t.when(c)) continue;
      out.push({ id: t.id, label: typeof t.label === 'string' ? t.label : t.label(c) });
    }
    return out;
  }

  choose(id: string) {
    const npc = this.npc;
    const t = npc?.dialogue?.topics.find((x) => x.id === id);
    if (!npc || !t) return;
    const c = this.ctx(npc);
    const n = c.n(id);
    this.push('You', typeof t.label === 'string' ? t.label : t.label(c), true);
    const v = t.say[Math.min(n, t.say.length - 1)];
    let text = typeof v === 'function' ? v(c) : v;
    if (n >= t.say.length) {
      const lead = RECAP[(n - t.say.length) % RECAP.length];
      text = Array.isArray(text) ? [lead + lower(text[0]), ...text.slice(1)] : lead + lower(text);
    }
    this.push(npc.name, text);
    npc.state.said[id] = n + 1;
    t.effect?.(c);
    ui.refresh();
    if (t.end) setTimeout(() => this.finish(true), 1400);
  }

  /** End the conversation; `close` also closes the panel (false when the panel was already dismissed). */
  finish(close: boolean) {
    const npc = this.npc;
    if (!npc) return;
    this.npc = null;
    npc.talking = false;
    npc.state.conversation = null;
    const bye = npc.dialogue?.bye?.(this.ctx(npc));
    if (bye && performance.now() - this.ended > 500) npc.say(Array.isArray(bye) ? bye[0] : bye, true);
    this.ended = performance.now();
    if (close && ui.get().panel === 'dialogue') this.game.closePanel();
    bus.emit('npc:conversation', { npc, active: false });
  }
}

function lower(s: string) {
  // keep proper nouns / acronyms / "I" capitalised
  if (/^(I\b|[A-Z]{2,}|[A-Z][a-z]+ [A-Z])/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Pick by rotating index stored in the NPC's memory, so repeated greetings never repeat back-to-back. */
export function rotate(c: DCtx, key: string, options: string[]): string {
  const n = c.npc.state.said[key] ?? 0;
  c.npc.state.said[key] = n + 1;
  return options[n % options.length];
}

export function describeRelationship(r: number) {
  return r >= 60 ? 'Trusts you' : r >= 25 ? 'Friendly' : r >= 5 ? 'Warm' : r > -5 ? 'Neutral' : r > -40 ? 'Wary' : 'Hostile';
}
