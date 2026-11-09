import type { Game } from '../core/Game';
import { CHARACTERS } from '../data/characters';

export interface DlgOption {
  text: string;
  next?: string; // node id; undefined ends
  cond?: (g: Game) => boolean;
  effect?: (g: Game) => void;
}

export interface DlgNode {
  id: string;
  who: string; // speaker id
  text: string | ((g: Game) => string);
  options?: DlgOption[];
  effect?: (g: Game) => void;
}

export type DialogueTree = Record<string, DlgNode>;

/** Runs a dialogue tree with the UI dialogue box (+ speech synthesis). Remembers seen nodes in the save. */
export class DialogueRunner {
  active = false;
  private onEnd: (() => void) | null = null;

  constructor(private game: Game) {}

  start(tree: DialogueTree, start = 'start', onEnd: (() => void) | null = null) {
    this.active = true;
    this.onEnd = onEnd;
    this.game.input.releaseLock();
    this.show(tree, start);
  }

  private show(tree: DialogueTree, id: string) {
    const g = this.game;
    const node = tree[id];
    if (!node) return this.end();
    node.effect?.(g);
    const key = `${node.who}:${id}`;
    if (!g.state.dialogueSeen.includes(key)) g.state.dialogueSeen.push(key);
    const text = typeof node.text === 'function' ? node.text(g) : node.text;
    const who = CHARACTERS[node.who]?.name ?? node.who;
    g.audio.speak(text, CHARACTERS[node.who]?.voice ?? {});
    const opts = (node.options ?? [{ text: '[Leave]' }]).filter((o) => !o.cond || o.cond(g));
    g.ui.dialogue(who, text, opts.map((o) => ({
      text: o.text,
      action: () => {
        o.effect?.(g);
        if (o.next) this.show(tree, o.next);
        else this.end();
      },
    })));
  }

  end() {
    this.active = false;
    this.game.ui.closeDialogue();
    try {
      speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    if (!this.game.ui.panelOpen) this.game.input.requestLock();
    const cb = this.onEnd;
    this.onEnd = null;
    cb?.();
  }
}
