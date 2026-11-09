import type { Game } from '../core/Game';
import { h } from '../ui/UI';
import type { NPC } from './NPC';
import { CHARACTERS } from '../data/characters';

export type CrewCommandId =
  | 'follow' | 'wait' | 'return' | 'board_ranger' | 'board_lander' | 'analyze' | 'repair' | 'console' | 'rest' | 'prepare';

export const CREW_COMMANDS: { id: CrewCommandId; label: string }[] = [
  { id: 'follow', label: 'FOLLOW ME' },
  { id: 'wait', label: 'WAIT HERE' },
  { id: 'return', label: 'RETURN TO ENDURANCE' },
  { id: 'board_ranger', label: 'BOARD RANGER' },
  { id: 'board_lander', label: 'BOARD LANDER' },
  { id: 'analyze', label: 'ANALYZE ENVIRONMENT' },
  { id: 'repair', label: 'REPAIR SYSTEM' },
  { id: 'console', label: 'OPERATE CONSOLE' },
  { id: 'rest', label: 'BEGIN CREW REST' },
  { id: 'prepare', label: 'PREPARE FOR DEPARTURE' },
];

const ACK: Record<CrewCommandId, string[]> = {
  follow: ['Right behind you.', 'With you, Commander.', 'Lead the way.'],
  wait: ['Holding here.', 'I’ll wait.', 'Copy, standing by.'],
  return: ['Heading back to Endurance.', 'Returning to the ship.'],
  board_ranger: ['Boarding the Ranger.', 'On my way to the Ranger.'],
  board_lander: ['Boarding the Lander.', 'Heading for the Lander.'],
  analyze: ['Running a full environmental scan.', 'Sampling now — give me a minute.'],
  repair: ['I’ll take a look at it.', 'Pulling up the diagnostics.'],
  console: ['Taking the console.', 'On station.'],
  rest: ['Copy. Getting some rest.', 'I could use the sleep.'],
  prepare: ['Prepping for departure.', 'Stowing gear, checking suits.'],
};

/**
 * Crew command wheel (Q). `handler(cmd, npcs)` is provided by the active zone and returns
 * false when a command is not possible here (with a reason shown to the player).
 */
export function openCrewWheel(game: Game, crew: NPC[], handler: (cmd: CrewCommandId, npcs: NPC[]) => string | true, available?: (cmd: CrewCommandId) => boolean) {
  if (!crew.length) {
    game.notify('No crew nearby.', 'info', 2);
    return;
  }
  game.input.releaseLock();
  let target: NPC[] = crew;
  game.ui.openPanel('CREW COMMANDS', (b, p) => {
    const who = h('div', { class: 'row' }, h('label', {}, 'Crew member'));
    const sel = game.ui.select<string>('all', [['all', 'All nearby crew'], ...crew.map((n) => [n.state.id, CHARACTERS[n.state.id]?.name ?? n.state.id] as [string, string])], (v) => {
      target = v === 'all' ? crew : crew.filter((n) => n.state.id === v);
    });
    who.append(sel);
    b.append(who);
    const grid = h('div', { class: 'grid2', style: { marginTop: '10px' } });
    for (const c of CREW_COMMANDS) {
      if (available && !available(c.id)) continue;
      grid.append(game.ui.button(c.label, () => {
        const res = handler(c.id, target);
        if (res === true) {
          const n = target[0];
          const line = ACK[c.id][Math.floor(Math.random() * ACK[c.id].length)];
          if (n) {
            game.say(n.state.id, line, 3);
            n.talking = 1.5;
          }
          p.close();
          game.input.requestLock();
        } else game.notify(res, 'warn', 3);
      }, 'btn'));
    }
    b.append(grid);
  }, { narrow: true, onClose: () => game.input.requestLock() });
}
