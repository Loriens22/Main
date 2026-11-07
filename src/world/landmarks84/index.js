// Hand-built landmarks along bus line 84 (ул. Ген. Гурко – Летище София Терминал 2). Each job is [name, (ctx) =>
// {x, z, meshes, tris} | [...] | null]; ctx as passed by Landmarks.build. The city-centre landmarks are line 280's
// (same footprints, same builders) and the cathedral is line 9's Blender hero model.
import { buildRectorate, buildNbkm, buildEagleBridge, buildKlimentMonument, buildHavelHeart } from '../LandmarkCity.js';
import { buildPliska, buildAviation, buildArena, buildPliskaCanopies, buildGuardFences } from '../LandmarkRoad.js';
import { buildSofiamed } from '../LandmarkInstitutionsMed.js';
import { heroItem } from '../HeroBuildings.js';

export const JOBS_84 = [
  ['nevsky', (ctx) => heroItem(ctx.heroes, 'nevsky', ctx.M)],
  ['airport', (ctx) => heroItem(ctx.heroes, 'airport', ctx.M)],
  ['rectorate', buildRectorate], ['nbkm', (c) => buildNbkm({ ...c, parts: c.partsOf(/^NBKM/) })],
  ['eagles', buildEagleBridge], ['kliment', buildKlimentMonument], ['havel', buildHavelHeart],
  ['pliska', buildPliska], ['pliskaCanopies', buildPliskaCanopies], ['aviation', buildAviation], ['arena', buildArena],
  // the W-beam fence of бул. Цариградско шосе between Pliska and Iztok: the stretch of line 280's fence on line 84's path
  ['guardFences', (c) => buildGuardFences({ ...c, guardRange: [2664, 3914] })],
  ['sofiamed', buildSofiamed],
];
