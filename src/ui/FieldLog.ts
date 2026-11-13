import type { Game } from '../core/Game';
import { h } from './UI';
import { MissionClock } from '../core/MissionClock';
import { MILLER_SPECIES } from '../world/fauna/miller';

/**
 * EXOBIOLOGY — the field database (Mission computer). Every entry separates what was OBSERVED (dated evidence the
 * player actually witnessed: flags bio:<species>:<key>), the WORKING HYPOTHESIS (inferences unlocked as evidence
 * accumulates) and what remains UNKNOWN. These are speculative alien taxa invented for the game.
 */
export function exobiologyTab(game: Game, b: HTMLElement) {
  const flags = game.state.flags;
  const ids = Object.keys(MILLER_SPECIES);
  const seen = ids.filter((id) => Object.keys(flags).some((k) => k.startsWith(`bio:${id}:`)));
  b.append(
    h('div', { class: 'card' }, h('h3', {}, "MILLER'S PLANET — FIELD DATABASE"),
      h('div', { class: 'dim', style: { fontSize: '12px', lineHeight: '1.5' } },
        `${seen.length} of ${ids.length} life forms recorded. Speculative alien taxa: names, sizes and roles are field working estimates, not established science. ` +
        'Watch closely and from a safe distance — evidence comes from what you actually see them do.')),
  );
  for (const id of ids) {
    const info = MILLER_SPECIES[id];
    const ev = Object.keys(flags).filter((k) => k.startsWith(`bio:${id}:`)).map((k) => {
      const [t, text] = String(flags[k]).split('|');
      return { key: k.split(':')[2], t: Number(t), text: text ?? k };
    }).sort((a, c) => a.t - c.t);
    const card = h('div', { class: 'card' });
    if (!ev.length) {
      card.append(h('h3', { class: 'dim' }, 'UNIDENTIFIED'), h('div', { class: 'dim' }, 'No confirmed record.'));
      b.append(card);
      continue;
    }
    const level = ev.length >= 3 ? 3 : ev.length >= 2 ? 2 : 1;
    card.append(
      h('h3', {}, info.name.toUpperCase()),
      h('div', { class: 'dim mono', style: { fontSize: '11px', marginBottom: '6px' } }, `${info.latin} · speculative taxon · confidence ${['', 'SIGHTED', 'BEHAVIOUR NOTED', 'STUDIED'][level]}`),
      h('div', { class: 'mono', style: { fontSize: '11px', margin: '4px 0' } }, 'OBSERVED'),
      ...ev.map((e) => h('div', { style: { fontSize: '12px', margin: '2px 0 2px 8px' } }, `${MissionClock.formatDate(e.t)} — ${e.text}`)),
      h('div', { class: 'mono', style: { fontSize: '11px', margin: '8px 0 4px' } }, 'WORKING HYPOTHESIS'),
    );
    const hyp: [string, string, number][] = [
      ['Size', info.size, 1], ['Habitat', info.habitat, 1], ['Diet / role', info.diet, 2], ['Senses', info.senses, 2], ['Tide response', info.tide, 3], ['Threat (conditional)', info.threat, 3],
    ];
    const kv = h('div', { class: 'kv' });
    const unknown: string[] = [];
    for (const [k, v, need] of hyp) {
      if (level >= need) kv.append(h('span', {}, k), h('span', {}, v));
      else unknown.push(k.toLowerCase());
    }
    card.append(kv);
    if (unknown.length) card.append(h('div', { class: 'mono', style: { fontSize: '11px', margin: '8px 0 4px' } }, 'UNKNOWN'), h('div', { class: 'dim', style: { fontSize: '12px' } }, `Not yet determined: ${unknown.join(', ')}.`));
    b.append(card);
  }
}
