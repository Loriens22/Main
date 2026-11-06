// Hand-built landmarks along trolleybus line 9 (ж.к. Борово – пл. Сточна гара). Each job is [name, (ctx) =>
// {x, z, meshes, tris} | [...] | null]; ctx as passed by Landmarks.build. Shared with the other lines: the NDK,
// Millennium Center and bTV tower heroes (line 7) and the Hygiene Centre complex (line 64).
import { buildNdk } from '../landmarks7/ndk.js';
import { buildMillennium } from '../landmarks7/millennium.js';
import { buildHygiene } from '../landmarks64/hygiene.js';
import { heroItem } from '../HeroBuildings.js';
import { buildVma, buildAleksandrovska, buildSatirical, buildSchool36 } from './institutions.js';

export const JOBS_9 = [
  // Blender hero models (tools/blender/hero): the cathedral is the line's flagship
  ['nevsky', (ctx) => heroItem(ctx.heroes, 'nevsky', ctx.M)],
  ['ndk', (ctx) => heroItem(ctx.heroes, 'ndk', ctx.M) || buildNdk(ctx)],
  ['millennium', (ctx) => heroItem(ctx.heroes, 'millennium', ctx.M) || buildMillennium(ctx)],
  ['btv', (ctx) => heroItem(ctx.heroes, 'btv', ctx.M)],
  ['hygiene', buildHygiene],
  ['vma', buildVma],
  ['aleksandrovska', buildAleksandrovska],
  ['satirical', buildSatirical],
  ['school36', buildSchool36],
];
