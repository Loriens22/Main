// Generator registry: maps the lexicon's generator keys to implementations.

import { humanGen } from './human.js';
import { buildingGen } from './buildings.js';
import { furnitureGen } from './furniture.js';
import { abstractGen, FALLBACK } from './abstract.js';

// Generators not yet specialised fall back to a labelled sculpture of the concept.
const labelled = {
  ...FALLBACK,
  *build(ctx, item, rng, env) {
    return yield* FALLBACK.build(ctx, { ...item, attrs: { ...item.attrs, unknownNoun: item.concept } }, rng, env);
  },
};

export const GENERATORS = {
  human: humanGen,
  building: buildingGen,
  furniture: furnitureGen,
  abstract: abstractGen,
  prop: labelled, vehicle: labelled, nature: labelled, terrain: labelled, creature: labelled, bird: labelled, fish: labelled,
  snake: labelled, blob: labelled, robot: labelled, structure: labelled, text: labelled, portal: labelled, scene: labelled,
};

export { FALLBACK };
