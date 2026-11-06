// Line 9 buildings whose OSM massing is replaced by hand-built geometry (format of REPLACED in ../LandmarkData.js):
// footprint centroid (vertex average) of the world9 pack building, match radius, note, height. The NDK, the
// Millennium Center, the bTV tower and the Hygiene Centre complex have the same footprints as in the line 7 /
// line 64 worlds (same centroids), so their entries and builders are shared.
import { REPLACED7 } from '../landmarks7/data.js';
import { REPLACED64 } from '../landmarks64/data.js';

// the cathedral's OSM building parts (pack ids 9302-9316): the Blender hero model replaces all of them
const NEVSKY = [
  [-1567.2, -2977.6, 9.0, 'outline'], [-1567.7, -2977.0, 15.0, 'main body'], [-1596.2, -2983.1, 20.0, 'nave'], [-1584.8, -2981.8, 31.0, 'nave upper'],
  [-1595.9, -2983.8, 41.5, 'bell tower'], [-1596.2, -2984.1, 50.5, 'bell tower dome'], [-1563.1, -2977.4, 40.0, 'central drum'],
  [-1556.5, -2975.5, 31.0, 'east semi-dome'], [-1562.2, -2984.7, 31.0, 'north semi-dome'], [-1565.8, -2971.4, 26.0, 'south semi-dome'],
  [-1549.0, -2974.1, 20.0, 'east apse'], [-1557.1, -2959.5, 19.0, 'south-east dome'], [-1551.5, -2990.9, 19.0, 'north-east dome'],
  [-1601.5, -2964.8, 11.0, 'south-west dome'], [-1594.8, -3002.2, 11.0, 'north-west dome'],
];

export const REPLACED9 = [
  // --- НДК, Millennium Center and the bTV tower (stops 1139 / 1136, бул. „Ген. Скобелев“)
  ...REPLACED7.filter((r) => /^(NDK|Millennium|bTV)/.test(r.note)),
  // --- Център по хигиена (stops 2342 / 2343): the institute complex and the Sv. Sofia lung hospital
  ...REPLACED64.filter((r) => /^(NCPHA|Lung hospital)/.test(r.note)),
  // --- Храм-паметник „Св. Александър Невски“ (stops 1264 / 1265), Blender hero model
  ...NEVSKY.map(([x, z, h, part]) => ({ x, z, r: 1.5, note: `Alexander Nevsky Cathedral ${part}`, h, hero: 'nevsky' })),
  // --- ВМА, бул. „Св. Георги Софийски“ 3 (stop 0419 / 0418): the hospital tower and its podium wings (Overture
  // place "Военномедицинска академия - ВМА" falls inside the tower's footprint)
  { x: -3950.4, z: -1671.2, r: 2, id: 3987, note: 'VMA tower', h: 55.4 },
  { x: -3948.0, z: -1655.5, r: 2, id: 3999, note: 'VMA wing north', h: 16.5 },
  { x: -3933.8, z: -1661.3, r: 2, id: 3986, note: 'VMA wing east', h: 16.5 },
  // --- УМБАЛ „Александровска“ (stop 1034 / 1035): the named internal-medicine block on the boulevard
  { x: -3600.3, z: -1824.8, r: 2, id: 6910, note: 'Aleksandrovska internal medicine', h: 9.6 },
  // --- Сатиричен театър „Алеко Константинов“, ул. „Стефан Караджа“ 26 (stop 1501 / 1502; the Overture place
  // falls inside both building parts)
  { x: -2108.5, z: -2502.4, r: 2, id: 8568, note: 'Satirical Theatre stage house', h: 22.3 },
  { x: -2110.0, z: -2501.8, r: 2, id: 8569, note: 'Satirical Theatre', h: 19.3 },
  // --- 36 СУ „Максим Горки“ (stop 0031 / 0032; the Overture place falls inside the school's footprint)
  { x: -5358.5, z: -486.4, r: 2, id: 1280, note: '36 SU Maxim Gorki', h: 10.6 },
];
