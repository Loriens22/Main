import { useEffect, useRef } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { useUI } from '../store';
import { Conversation, describeRelationship } from '../../npc/Dialogue';

/** Conversation with an NPC: a running transcript and the subjects that make sense to raise right now. */
export function DialoguePanel({ game, close }: { game: Game; close: () => void }) {
  useUI((s) => s.tick);
  const conv: Conversation = game.services.dialogue;
  const npc = conv.npc;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; });
  if (!npc) return null;
  const topics = conv.topics();
  return (
    <div class="panel dialogue">
      <header>
        <h2>{npc.name}<small>{npc.state.role}</small></h2>
        <span class="mood">{describeRelationship(npc.state.relationship)} · {npc.state.emotion}</span>
      </header>
      <div class="body">
        <div class="talk" ref={box}>
          {conv.log.map((e, i) => (
            <p class={e.player ? 'me' : i === conv.log.length - 1 || !conv.log.slice(i + 1).some((x) => x.player) ? 'them now' : 'them'}>
              {!e.player && <b>{e.who}</b>}{e.text}
            </p>
          ))}
        </div>
        <div class="topics">
          {topics.map((t) => <button class="topic" onClick={() => { bus.emit('ui:click'); conv.choose(t.id); }}>{t.label}</button>)}
          <button class="topic leave" onClick={() => { bus.emit('ui:click'); close(); }}>Leave</button>
        </div>
      </div>
    </div>
  );
}
