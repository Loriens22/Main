// Hand-built landmarks along line 64 (Зоопарка - Център по хигиена). Each job is
// [name, (ctx) => {x, z, meshes, tris} | [...] | null]; ctx is the one Landmarks.build passes
// (world, M = LandmarkMaterials, route, y(x, z), quality, replaced, partsOf).
import { buildMetroVitosha } from './metro.js';
import { buildParadise } from './mall.js';
import { buildHygiene } from './hygiene.js';
import { buildZooEntrance } from './zoo.js';

export const JOBS_64 = [
  ['metroVitosha', buildMetroVitosha],
  ['paradise', buildParadise],
  ['hygiene', buildHygiene],
  ['zooEntrance', buildZooEntrance],
];
