// Hand-built landmarks along tram line 12 (кв. Илиянци - пл. Журналист). Each job is
// [name, (ctx) => {x, z, meshes, tris} | [...] | null]; ctx as passed by Landmarks.build.
import { buildCentralStation } from './station.js';

export const JOBS_12 = [
  ['centralStation', buildCentralStation],
];
