// Hand-built landmarks along tram line 12 (кв. Илиянци - пл. Журналист). Each job is
// [name, (ctx) => {x, z, meshes, tris} | [...] | null]; ctx as passed by Landmarks.build.
import { buildCentralStation } from './station.js';
import { buildSlaveykov } from './slaveykov.js';
import { buildSevenSaints } from './church.js';
import { buildUasg } from './uasg.js';

export const JOBS_12 = [
  ['centralStation', buildCentralStation],
  ['slaveykov', buildSlaveykov],
  ['sevenSaints', buildSevenSaints],
  ['uasg', buildUasg],
];
