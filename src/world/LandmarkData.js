// Buildings whose OSM massing is replaced by hand-built geometry in Landmarks.js.
// Each entry is a footprint centroid (vertex average, as Buildings.js computes it) in game
// coordinates (x east, z south, metres); Buildings.js skips every building or building part
// whose centroid lies within `r` metres. `id` is the pack building index at the time of
// writing (informative only). Sources: data/research/world/{west,east}/landmarks.json.
export const REPLACED = [
  // --- Sofia University: Rectorate central block, north wing (Shipka), south diagonal wing (Tsar Osvoboditel)
  { x: -1415.4, z: -2744.0, r: 2.5, id: 1900, note: 'SU Rectorate central block' },
  { x: -1413.0, z: -2723.7, r: 2.5, id: 1902, note: 'SU Rectorate central block' },
  { x: -1409.0, z: -2703.6, r: 2.5, id: 1896, note: 'SU Rectorate central block' },
  { x: -1402.6, z: -2723.2, r: 2.5, id: 1901, note: 'SU Rectorate central block' },
  { x: -1399.8, z: -2803.9, r: 2.5, id: 1899, note: 'SU north wing (Shipka), west end' },
  { x: -1357.8, z: -2789.2, r: 2.5, id: 1898, note: 'SU north wing (Shipka) 4-5 m behind pole 1697' },
  { x: -1317.7, z: -2780.7, r: 2.5, id: 1897, note: 'SU north wing (Shipka), east end' },
  { x: -1372.7, z: -2652.7, r: 2.5, id: 1894, note: 'SU south diagonal wing' },
  { x: -1372.0, z: -2665.1, r: 2.5, id: 1895, note: 'SU south diagonal wing' },
  // --- National Library St Cyril and Methodius (2 pack parts)
  { x: -1311.7, z: -2868.6, r: 2.5, id: 2594, note: 'NBKM main block' },
  { x: -1287.6, z: -2863.4, r: 2.5, id: 2593, note: 'NBKM east block' },
  // --- ex Hotel Pliska = CCB headquarters (curtain-wall tower + 2-storey podium)
  { x: 630.1, z: -714.7, r: 2.5, id: 6563, note: 'CCB tower (ex Hotel Pliska)' },
  { x: 645.4, z: -715.0, r: 2.5, id: 6564, note: 'CCB podium' },
  // --- Pliska underpass: stair canopies, shelters and CGM cabins (OSM polygons drawn as boxes in the pack)
  { x: 558.7, z: -679.1, r: 2.0, note: 'Pliska A canopy 1' },
  { x: 543.3, z: -694.2, r: 2.0, note: 'Pliska A canopy 2' },
  { x: 550.9, z: -684.8, r: 2.0, note: 'Pliska A shelter polygon (placed at the kerb by StopHardware)' },
  { x: 563.4, z: -670.0, r: 2.0, note: 'Pliska A CGM cabin' },
  { x: 595.4, z: -717.2, r: 2.0, id: 6562, note: 'Pliska B canopy 1' },
  { x: 580.7, z: -731.7, r: 2.0, id: 6559, note: 'Pliska B canopy 2' },
  { x: 588.4, z: -725.8, r: 2.0, id: 6560, note: 'Pliska B shelter polygon 1' },
  { x: 575.7, z: -743.9, r: 2.0, id: 6558, note: 'Pliska B shelter polygon 2' },
  { x: 596.6, z: -728.3, r: 2.0, id: 6561, note: 'Pliska B CGM cabin' },
  // --- Aviation monument: the two wing bodies (drawn as boxes in the pack)
  { x: 1393.1, z: -180.7, r: 2.5, id: 5529, note: 'Aviation monument wing 4.6 m' },
  { x: 1395.6, z: -141.9, r: 2.5, id: 5528, note: 'Aviation monument wing 3.0 m' },
  // --- Arena 8888 (real height about 30 m, the pack has 15 m)
  { x: 1424.7, z: -248.1, r: 3.0, id: 5530, note: 'Arena 8888 Sofia' },
  // --- metro G. M. Dimitrov concourse pavilions
  { x: 482.9, z: 705.8, r: 3.0, note: 'metro G. M. Dimitrov pavilion (beside pole 0764)' },
  { x: 408.5, z: 615.8, r: 3.0, id: 6023, note: 'metro G. M. Dimitrov pavilion 2' },
  // --- Studentski grad: Winter Palace (chamfered octagon), Hristo Botev hall (hexagon), chapel, OMV, kiosk modules
  { x: -727.6, z: 2776.3, r: 3.0, id: 372, note: 'Winter Palace of Sport' },
  { x: -978.4, z: 1948.3, r: 3.0, id: 4195, note: 'Hristo Botev sports hall' },
  { x: -318.1, z: 1859.4, r: 2.5, id: 4719, note: 'student chapel St John of Rila' },
  { x: 464.0, z: 1999.7, r: 3.0, note: 'OMV filling station canopy' },
  // --- terminal 1693: the 15.8 x 5.8 m dispatcher hut (Overture-only footprint, drawn as a 9 m box in the pack)
  { x: -435.6, z: 2475.8, r: 2.5, id: 410, note: 'Terminal 1693 dispatcher shelter' },
  { x: -430.8, z: 1685.1, r: 2.5, note: 'Yosifov kiosk modules, west row' },
  { x: -430.4, z: 1677.6, r: 2.5, note: 'Yosifov kiosk modules, west row' },
  { x: -430.0, z: 1670.1, r: 2.5, note: 'Yosifov kiosk modules, west row' },
  { x: -412.0, z: 1686.4, r: 2.5, note: 'Yosifov kiosk modules, east row' },
  { x: -411.6, z: 1679.0, r: 2.5, note: 'Yosifov kiosk modules, east row' },
  { x: -411.2, z: 1671.7, r: 2.5, note: 'Yosifov kiosk modules, east row' },
  // --- National Oncology Hospital (НСБАЛ по онкология): main L-shaped block, ward towers, pavilions, outpatient wing
  { x: 668.5, z: 934.1, r: 2.5, id: 4909, note: 'Oncology hospital main block' },
  { x: 613.0, z: 1008.2, r: 2.5, id: 4912, note: 'Oncology hospital ward tower (5 floors)' },
  { x: 691.8, z: 1046.0, r: 2.5, id: 4916, note: 'Oncology hospital ward tower (5 floors, south)' },
  { x: 646.5, z: 905.0, r: 2.5, id: 4911, note: 'Oncology hospital pavilion (3 floors)' },
  { x: 609.9, z: 882.2, r: 2.5, id: 4901, note: 'Oncology hospital pavilion (3 floors, north)' },
  { x: 613.9, z: 983.4, r: 2.5, id: 4913, note: 'Oncology hospital pavilion (service block)' },
  { x: 644.5, z: 889.6, r: 2.5, id: 4907, note: 'Oncology hospital outpatient wing (pitched roof)' },
  // --- UMBAL Sofiamed (Dr G. M. Dimitrov 16): Block 1, Block 2 and the medical centre beside the stop 0494 / 0492
  { x: 995.5, z: 209.8, r: 2.5, id: 5831, note: 'Sofiamed Block 1' },
  { x: 943.8, z: 187.5, r: 2.5, id: 5832, note: 'Sofiamed Block 2' },
  { x: 950.8, z: 251.0, r: 2.5, id: 5875, note: 'Sofiamed medical centre by the stop' },
  // --- Technical library / National Centre for Information and Documentation slab (Dr G. M. Dimitrov 52-52A)
  { x: 553.3, z: 484.8, r: 2.5, id: 5935, note: 'Technical library slab (NCID, DAMTN)' },
  // --- ХТМУ buildings A and B on the boulevard, TU Block 1 east slab closing ul. Prof. Bradistilov
  { x: 499.9, z: 1503.8, r: 2.5, id: 5028, note: 'HTMU building A' },
  { x: 477.0, z: 1159.8, r: 2.5, id: 4890, note: 'HTMU building B' },
  { x: 362.8, z: 1333.2, r: 2.5, id: 4863, note: 'TU Block 1 (Rectorate) east slab' },
  // --- National Sports Academy main complex
  { x: -244.1, z: 2485.5, r: 2.5, id: 408, note: 'NSA main complex' },
  // --- children's institutions of Studentski grad
  { x: -507.2, z: 1741.0, r: 2.5, id: 4658, note: 'Kindergarten behind the Detski dom stops' },
  { x: -785.7, z: 2329.6, r: 2.5, id: 521, note: 'Nursery complex behind the Detski yasli stops' },
];

import { REPLACED64, LINE_MASKS64 } from './landmarks64/data.js';
import { REPLACED12 } from './landmarks12/data.js';

/** Replaced buildings of a line's world. */
export function replacedFor(line) {
  return String(line) === '64' ? REPLACED64 : String(line) === '12' ? REPLACED12 : REPLACED;
}

/** Where a hand-built landmark redraws the OSM fences / walls: circles {x, z, r} or polylines {pts, d}. */
export function lineMasksFor(line) {
  return String(line) === '64' ? LINE_MASKS64 : [];
}

const cx = (p) => { let s = 0; for (let i = 0; i < p.length; i += 2) s += p[i]; return s / (p.length / 2); };
const cz = (p) => { let s = 0; for (let i = 1; i < p.length; i += 2) s += p[i]; return s / (p.length / 2); };

/** Pack buildings (world.data.buildings) that REPLACED removes from the OSM massing; with the matching entry. */
export function replacedBuildings(world) {
  const out = [];
  const REPLACED = replacedFor(world.line);
  for (const b of world.data.buildings) {
    if (!b.pts || b.pts.length < 6) continue;
    const x = cx(b.pts), z = cz(b.pts);
    const e = REPLACED.find((r) => Math.hypot(r.x - x, r.z - z) < (r.r || 4));
    if (e) out.push({ b, entry: e, cx: x, cz: z });
  }
  return out;
}

/**
 * Registers the footprints of replaced buildings in world.bgrid (collision, tree and pedestrian
 * placement), because Buildings.js never creates them. Idempotent; called before vegetation.
 */
export function ensureFootprints(world) {
  if (world._landmarkFootprints) return world._landmarkFootprints;
  const list = replacedBuildings(world);
  for (const { b, entry } of list) {
    if (entry.noCollide || b.minH > 0) continue;
    let sum = 0;
    const n = b.pts.length / 2;
    for (let i = 0; i < b.pts.length; i += 2) sum += world.hf.heightAt(b.pts[i], b.pts[i + 1]);
    const base = sum / n;
    world.bgrid.addPolygon(Float32Array.from(b.pts), { pts: b.pts, top: base + (entry.h || b.h), bottom: base - 0.6, id: b.id, landmark: b.landmark, replaced: true });
  }
  world._landmarkFootprints = list;
  return list;
}
