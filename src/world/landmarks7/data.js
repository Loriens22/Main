// Line 7 buildings whose OSM massing is replaced by hand-built geometry (format of REPLACED in
// ../LandmarkData.js): footprint centroid (vertex average) of the pack building, match radius, note, height.
import { REPLACED12 } from '../landmarks12/data.js';

export const REPLACED7 = [
  // --- Sofia Central Station (shared with line 12; the same OSM footprint in both worlds), stops 1330 / 1331
  ...REPLACED12.filter((r) => /^Central Station/.test(r.note)),
  // --- НДК (stops 1135 / 1134): the OSM building parts
  { x: -2711.3, z: -1760.0, r: 2, id: 6625, note: 'NDK main body', h: 41 },
  { x: -2717.7, z: -1696.6, r: 2, id: 6627, note: 'NDK south block', h: 12 },
  { x: -2655.8, z: -1805.3, r: 2, id: 6622, note: 'NDK terrace east', h: 4.5 },
  { x: -2748.1, z: -1817.0, r: 2, id: 6623, note: 'NDK terrace west', h: 4.5 },
  { x: -2767.9, z: -1729.3, r: 2, id: 6624, note: 'NDK wing west', h: 10 },
  { x: -2662.1, z: -1711.0, r: 2, id: 6626, note: 'NDK wing east', h: 10 },
  // --- Millennium Center, Vitosha 89B (stop 0357 / 0356): towers and the base parts
  { x: -3056.3, z: -1463.0, r: 2, id: 6653, note: 'Millennium hotel tower', h: 112 },
  { x: -3024.1, z: -1513.3, r: 2, id: 6656, note: 'Millennium office tower', h: 85 },
  { x: -3105.9, z: -1439.0, r: 2, id: 6648, note: 'Millennium residential tower', h: 74.6 },
  { x: -3064.5, z: -1476.7, r: 2, id: 6651, note: 'Millennium base main', h: 20.2 },
  { x: -3081.7, z: -1435.5, r: 2, id: 6649, note: 'Millennium base', h: 8.9 },
  { x: -3076.8, z: -1442.4, r: 2, id: 6650, note: 'Millennium base', h: 13.8 },
  { x: -3072.8, z: -1454.9, r: 2, id: 6652, note: 'Millennium base', h: 17 },
  { x: -3052.8, z: -1480.9, r: 2, id: 6654, note: 'Millennium base', h: 17 },
  { x: -3036.4, z: -1497.1, r: 2, id: 6655, note: 'Millennium base', h: 17 },
  // --- МБАЛ „Княгиня Клементина“ (former Fifth City Hospital), stops 1254 / 1255
  { x: -3284.6, z: -4920.1, r: 2, id: 11342, note: 'Fifth City Hospital ward slab main', h: 23.4 },
  { x: -3221.2, z: -4941.8, r: 2, id: 11343, note: 'Fifth City Hospital treatment block', h: 13.8 },
  { x: -3259.6, z: -4966.8, r: 2, id: 11344, note: 'Fifth City Hospital south slab', h: 23.4 },
];
