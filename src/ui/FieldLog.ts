import type { Game } from '../core/Game';
import { h } from './UI';
import { MissionClock } from '../core/MissionClock';
import { MILLER_SPECIES } from '../world/fauna/miller';
import { SPECIES_EXPANSION, MARS_EXPANSION, JUPITER_EXPANSION, type Certainty } from '../data/speciesExpansion';

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
  expansionSection(game, b, 'MARS — THE REFUGE CAVERN (SPECULATIVE EVOLUTION)', MARS_EXPANSION,
    'A sealed lava-tube cavern beside the landing site — a game alternate-history extension, not a known feature of Mars. Its lake, warmth and life are fictional conditions to investigate.');
  expansionSection(game, b, "JUPITER — THE NINE OF THE REFERENCE SHEET (SPECULATIVE EVOLUTION)", JUPITER_EXPANSION,
    'Concept-sheet species (jupiter_panel_01 … 09) re-scaled to what a mass, energy and buoyancy budget could carry; Creative Mode can show the poster sizes.');
}

const CERT_COLOR: Record<Certainty, string> = { OBSERVED: '#7fd07f', INFERRED: '#9fc4ff', HYPOTHETICAL: '#e8c76a', SPECULATIVE: '#e58f8f' };

/**
 * The Mars & Jupiter expansion codex: every statement carries its certainty label; what the player actually saw is
 * the OBSERVED-in-the-field record (flags bio:<id>:<key>); conservative science mode shows the entries as unverified
 * archive hypotheses only.
 */
function expansionSection(game: Game, b: HTMLElement, title: string, ids: string[], intro: string) {
  const flags = game.state.flags;
  const conservative = game.settings.life.science === 'conservative';
  const seen = ids.filter((id) => Object.keys(flags).some((k) => k.startsWith(`bio:${id}:`)));
  b.append(h('div', { class: 'card' }, h('h3', {}, title),
    h('div', { class: 'dim', style: { fontSize: '12px', lineHeight: '1.5' } },
      `${seen.length} of ${ids.length} recorded. ${intro} No life is known on Mars or Jupiter; nothing here has been photographed by a rover or probe. ` +
      (conservative ? 'Science mode: CONSERVATIVE — these are archive hypotheses; no complex animals are simulated.' : 'Science mode: SPECULATIVE EVOLUTION.')),
    h('div', { class: 'mono', style: { fontSize: '10px', marginTop: '6px' } },
      ...(['OBSERVED', 'INFERRED', 'HYPOTHETICAL', 'SPECULATIVE'] as Certainty[]).map((c) => h('span', { style: { color: CERT_COLOR[c], marginRight: '10px' } }, c)))));
  for (const id of ids) {
    const d = SPECIES_EXPANSION[id];
    const ev = Object.keys(flags).filter((k) => k.startsWith(`bio:${id}:`)).map((k) => {
      const [t, text] = String(flags[k]).split('|');
      return { t: Number(t), text: text ?? k };
    }).sort((a, c) => a.t - c.t);
    const card = h('div', { class: 'card' });
    const known = ev.length > 0;
    card.append(
      h('h3', { class: known ? '' : 'dim' }, `${known ? d.name.toUpperCase() : 'UNCONFIRMED — ' + d.name.toUpperCase()}`),
      h('div', { class: 'dim mono', style: { fontSize: '11px', marginBottom: '6px' } },
        `${d.latin}${d.panel ? ' · ' + d.panel : ''} · ${d.type}${conservative ? ' · ARCHIVE HYPOTHESIS' : ''}`),
    );
    const kv = h('div', { class: 'kv' });
    const rows: [string, string][] = [['Zone', d.zone], ['Envelope', d.envelope], ['Concept-art scale', d.artScale], ['Simulated body', d.simScale]];
    if (known) rows.push(['Diet / role', d.diet], ['Reproduction', d.reproduction], ['Senses', d.senses], ['Threat', d.threat], ['Avoid by', d.avoid], ['Sound', d.sound]);
    for (const [k, v] of rows) kv.append(h('span', {}, k), h('span', {}, v));
    card.append(kv, h('div', { class: 'mono', style: { fontSize: '11px', margin: '8px 0 4px' } }, 'STATEMENTS'));
    for (const [c, t] of d.facts) card.append(h('div', { style: { fontSize: '12px', margin: '2px 0 2px 8px' } }, h('span', { class: 'mono', style: { color: CERT_COLOR[c], fontSize: '10px', marginRight: '6px' } }, c), t));
    card.append(h('div', { class: 'mono', style: { fontSize: '11px', margin: '8px 0 4px' } }, 'FIELD RECORD'));
    if (known) for (const e of ev) card.append(h('div', { style: { fontSize: '12px', margin: '2px 0 2px 8px' } }, `${MissionClock.formatDate(e.t)} — ${e.text}`));
    else card.append(h('div', { class: 'dim', style: { fontSize: '12px', marginLeft: '8px' } }, 'No field record yet.'));
    const missing = Object.keys(d.evidence).filter((k) => !flags[`bio:${id}:${k}`]);
    if (known && missing.length) card.append(h('div', { class: 'dim', style: { fontSize: '11px', margin: '6px 0 0 8px' } }, `Still to observe: ${missing.length} behaviour${missing.length > 1 ? 's' : ''}.`));
    card.append(h('div', { class: 'dim', style: { fontSize: '11px', marginTop: '6px', fontStyle: 'italic' } }, d.note));
    b.append(card);
  }
}
