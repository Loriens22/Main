// Line 84 buildings whose OSM massing is replaced by hand-built geometry (format of REPLACED in ../LandmarkData.js).
// The centre of line 84 (ул. Ген. Гурко – пл. Орлов мост – бул. Цариградско шосе – ж.к. Изток) is shared with line 280
// and the cathedral with line 9: the same OSM footprints have the same centroids in every world pack, so those entries
// (and their builders) are reused and each landmark stands once, in the same place, whichever line is played.
// LandmarkData.replacedFor('84') = line 280's entries matching SHARED_280 + REPLACED84.
import { REPLACED9 } from '../landmarks9/data.js';

/** Line 280 landmarks within sight of the line 84 path (Sofia University, the National Library, the CCB tower and
 *  Pliska blocks, the Ministry of Foreign Affairs, the Aviation monument, Arena 8888, Sofiamed). */
export const SHARED_280 = /^(SU |NBKM|CCB|MFA|Pliska|Aviation monument|Arena 8888|Sofiamed)/;

// Летище София, Терминал 2 (stops 2454 / 2455): the terminal and its pier, the central hall parts, the curbside
// canopies, the control tower on its base, the car park in front and the metro station - one Blender hero model
const AIRPORT = [
  [5094.7, -2255.9, 17.0, 'terminal 2'], [5113.3, -2250.2, 28.0, 'terminal 2 central hall'], [5103.1, -2280.7, 19.5, 'terminal 2 core'],
  [5069.1, -2261.1, 12.0, 'terminal 2 core west'], [5143.7, -2286.0, 12.0, 'terminal 2 core east'], [5098.6, -2145.3, 14.6, 'terminal 2 canopy west'],
  [5187.8, -2176.5, 14.6, 'terminal 2 canopy east'], [4966.5, -2185.0, 55.0, 'control tower'], [4958.6, -2172.6, 9.2, 'control tower base'],
  [5212.4, -2114.8, 2.3, 'car park'], [5196.8, -2097.0, 3.6, 'car park pavilion'],
  // a strip mapped over the departures curb road beside the car park (the road runs through it): drawn by nobody, not solid
  [5235.2, -2095.3, 0.0, 'car park strip over the curb road'],
  [5263.1, -2156.0, 7.5, 'metro station'],
];

// The Mall, бул. „Цариградско шосе“ 115 (stops 1194 / 1196 / 2593): the mall, its west tower and the office
// towers along its south-east side - one Blender hero model
const THEMALL = [
  [2513.7, 969.2, 13.8, 'mall'], [2458.2, 904.6, 31.0, 'west tower'], [2645.6, 905.2, 21.6, 'tower 1'], [2606.3, 946.1, 24.6, 'tower 2'],
  [2567.8, 987.1, 27.6, 'tower 3'], [2529.0, 1027.4, 39.6, 'tower 4'], [2520.0, 1035.3, 48.6, 'tower 5'],
  // a strip mapped in front of the right wing that the photographs do not show (cars park there)
  [2505.5, 984.2, 0.0, 'front strip'],
];

export const REPLACED84 = [
  ...THEMALL.map(([x, z, h, part]) => ({ x, z, r: 1.5, note: `The Mall ${part}`, h, hero: 'themall', ...(h ? {} : { noCollide: true }) })),
  ...REPLACED9.filter((r) => r.hero === 'nevsky' || r.hero === 'bas'),
  ...AIRPORT.map(([x, z, h, part]) => ({ x, z, r: 1.5, note: `Sofia Airport ${part}`, h, hero: 'airport', ...(h ? {} : { noCollide: true }) })),
];
