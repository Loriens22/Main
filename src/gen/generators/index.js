// Generator registry: maps the lexicon's generator keys to implementations.

import { humanGen } from './human.js';
import { buildingGen } from './buildings.js';
import { furnitureGen } from './furniture.js';
import { abstractGen, FALLBACK } from './abstract.js';
import { propGen } from './props.js';
import { natureGen } from './nature.js';
import { terrainGen } from './terrainfx.js';
import { vehicleGen } from './vehicles.js';
import { creatureGen } from './creatures.js';
import { birdGen, fishGen, snakeGen, blobGen } from './fauna.js';
import { robotGen } from './robots.js';
import { structureGen } from './structures.js';
import { textGen } from './text.js';
import { sceneGen } from './scenes.js';
import { portalGen, dimensionService } from './portal.js';
import { gadgetGen, RECIPES } from './gadgets.js';
import { rideGen, RIDES } from './rides.js';
import { civicGen, CIVIC_KINDS } from './buildings3.js';
import { landmarkGen, LANDMARKS } from './landmarks.js';
import { G } from '../../core/context.js';
import * as THREE from 'three';
import { RNG } from '../../core/rng.js';
import { parseCommand } from '../nlp.js';

G.dimensions = dimensionService;

export const GENERATORS = {
  human: humanGen,
  building: buildingGen,
  furniture: furnitureGen,
  abstract: abstractGen,
  prop: propGen, nature: natureGen, terrain: terrainGen,
  vehicle: vehicleGen, creature: creatureGen, bird: birdGen, fish: fishGen,
  snake: snakeGen, blob: blobGen, robot: robotGen, structure: structureGen, text: textGen, portal: portalGen, scene: sceneGen,
  gadget: gadgetGen, ride: rideGen, civic: civicGen, landmark: landmarkGen,
};

// Test hook: lets headless tests exercise generators directly.
G.debugGen = { GENERATORS, RECIPES, RIDES, CIVIC: CIVIC_KINDS, LANDMARKS: Object.keys(LANDMARKS), THREE, RNG, parse: (t) => parseCommand(t, {}) };

export { FALLBACK };
