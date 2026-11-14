import type { Game } from '../../core/Game';

/**
 * The staged research programmes of the Mars & Jupiter expansion (the directive's mission sequences). Each stage is a
 * piece of evidence, not a scripted scene: it completes when its flags exist (codex sightings bio:<id>:<key>, samples
 * sample:<key>, flight records). Stages complete in order; evidence gathered early is credited when its stage comes up.
 * Progress is stored in prog:<body> (the number of completed stages) and survives saves.
 */
export interface Stage {
  title: string;
  /** what to do (shown in the codex and on completion of the previous stage) */
  goal: string;
  done: (has: (prefix: string) => boolean) => boolean;
}

const seen = (id: string) => (has: (p: string) => boolean) => has(`bio:${id}:`);

export const PROGRAMMES: Record<'mars' | 'jupiter', { name: string; stages: Stage[] }> = {
  mars: {
    name: 'Mars subsurface programme',
    stages: [
      { title: 'Spectral traces', goal: 'Sample the regolith or the dark basalt (N): look for anything the minerals alone do not explain.',
        done: (has) => has('sample:mars:regolith') || has('sample:mars:mineral') || has('sample:mars:ice') || has('sample:mars:icebloom') },
      { title: 'Shielded ice', goal: 'Drill the ice plug over the refuge (N at the skylight) and record the Crimson Icebloom beneath it.',
        done: (has) => (has('sample:mars:ice') || has('sample:mars:icebloom')) && has('bio:icebloom:') },
      { title: 'The mineral grove', goal: 'Enter the cavern. Record the Ferric Cathedral, the Glass Ribbons grazing it, and a Prism Architect nest — without disturbing them.',
        done: (has) => has('bio:ferric:') && has('bio:ribbon:') && has('bio:prism:') },
      { title: 'Warning signals', goal: 'Film prey near the mineral columns until the Ghost of Valles shows itself. Learn its stalk-pause-lunge.',
        done: seen('ghost') },
      { title: 'A wrong signature', goal: 'Find the Basalt Mimic by the bio-signature that does not match the rock. Do not startle it; stay out of its brood niche.',
        done: seen('bmimic') },
      { title: 'The warm channel', goal: 'Survey the geothermal channel and its Thermal Rift Serpent. Map the flow; give way rather than push through.',
        done: seen('serpent') },
      { title: 'A surface crossing', goal: 'Watch the fissure north of the mesa in mild light for a brief Red Dune Hermit crossing.',
        done: seen('hermit') },
      { title: 'The deep basin', goal: 'Follow the evidence under the ice shelf into the deep basin (drone/ROV or dive). A rare Subglacial Monarch encounter.',
        done: seen('monarch') },
    ],
  },
  jupiter: {
    name: 'Jupiter atmospheric programme',
    stages: [
      { title: 'Profiles', goal: 'Fly Ranger 1 in the cloud layer while its instruments log pressure, temperature and wind; record the Aeromite Swarm (sample N near a swarm).',
        done: (has) => has('jupiter:profile') && (has('bio:aeromite:') || has('sample:jupiter:aerosol')) },
      { title: 'Silhouettes', goal: 'Find the faint Skyjelly silhouettes drifting in the layer.', done: seen('skyjelly') },
      { title: 'A community, not a body', goal: 'Pass near a Floating Colony and sample it (N within its stand).',
        done: (has) => has('bio:colony:') && has('sample:jupiter:colony') },
      { title: 'Ecological scale', goal: 'Sight Stormskimmers crossing the shear lanes and Gasgrazers following the food fronts.',
        done: (has) => has('bio:stormskimmer:') && has('bio:gasgrazer:') },
      { title: 'Field sensing', goal: 'Record a Voltdrifter near a storm cell — without claiming it eats lightning.', done: seen('voltdrifter') },
      { title: 'The lower corridor', goal: 'Descend about 500 m below your flight level into the higher-pressure corridor and meet the Deepdivers.',
        done: (has) => has('jupiter:lower') && has('bio:deepdiver:') },
      { title: 'Disturbed prey', goal: 'Follow a broken Aeromite swarm to a Stormhunter. Watch its warning (fins fold, head pitches) and change altitude to break off.',
        done: seen('stormhunter') },
      { title: 'The storm wall', goal: 'A very rare event: a Stormbeast at the edge of a great storm. Keep watching the storm walls.', done: seen('stormbeast') },
    ],
  },
};

export function progress(game: Game, body: 'mars' | 'jupiter') {
  return Number(game.flag(`prog:${body}`) ?? 0) || 0;
}

/** credit any newly met stages (in order); announces each one and the next goal */
export function checkProgramme(game: Game, body: string) {
  if (body !== 'mars' && body !== 'jupiter') return;
  if (game.settings.life.science === 'conservative') return;
  const P = PROGRAMMES[body];
  const flags = game.state.flags;
  const keys = Object.keys(flags);
  const has = (p: string) => (p.endsWith(':') ? keys.some((k) => k.startsWith(p)) : !!flags[p]);
  let n = progress(game, body);
  const start = n;
  while (n < P.stages.length && P.stages[n].done(has)) {
    n++;
    game.flag(`prog:${body}:${n}`, `${Math.round(game.state.clock.earthTime)}|${P.stages[n - 1].title}`);
  }
  if (n === start) {
    // first arrival: announce the programme once
    if (n === 0 && !flags[`prog:${body}:intro`]) {
      game.flag(`prog:${body}:intro`, 1);
      game.notify(`${P.name} — stage 1: ${P.stages[0].goal}`, 'info', 10);
    }
    return;
  }
  game.flag(`prog:${body}`, n);
  const last = P.stages[n - 1];
  game.notify(n < P.stages.length
    ? `${P.name}: stage ${n} complete — ${last.title}. Next: ${P.stages[n].goal}`
    : `${P.name}: all ${n} stages complete.`, 'ok', 10);
  game.log?.('mission', 'computer', `${P.name}: stage ${n} — ${last.title}`);
}
