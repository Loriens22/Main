// Hand-built landmarks along tram line 7 (кв. Манастирски ливади – запад - Метростанция „Хан Кубрат“). Each job
// is [name, (ctx) => {x, z, meshes, tris} | [...] | null]; ctx as passed by Landmarks.build. The corridor from
// пл. Македония to Триъгълника is shared with line 12 and uses the same builders.
import { buildCentralStation } from '../landmarks12/station.js';
import { buildNdk } from './ndk.js';
import { buildMillennium } from './millennium.js';
import { buildFifthHospital } from './hospital.js';
import { buildMetroEntrances } from './metro.js';
import { buildBulgariaMall } from './mall.js';
import { heroItem } from '../HeroBuildings.js';

export const JOBS_7 = [
  ['centralStation', buildCentralStation],
  ['ndk', (ctx) => heroItem(ctx.heroes, 'ndk', ctx.M) || buildNdk(ctx)],
  ['millennium', (ctx) => heroItem(ctx.heroes, 'millennium', ctx.M) || buildMillennium(ctx)],
  ['btv', (ctx) => heroItem(ctx.heroes, 'btv', ctx.M)],
  ['fifthHospital', buildFifthHospital],
  ['metro', buildMetroEntrances],
  // Blender hero models (tools/blender/hero), the procedural builders as fallback
  ['bulgariaMall', (ctx) => heroItem(ctx.heroes, 'mall', ctx.M) || buildBulgariaMall(ctx)],
  ['billa', (ctx) => heroItem(ctx.heroes, 'billa', ctx.M)],
];
