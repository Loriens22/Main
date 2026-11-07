// Line 84 buildings whose OSM massing is replaced by hand-built geometry (format of REPLACED in ../LandmarkData.js).
// The centre of line 84 (ул. Ген. Гурко – пл. Орлов мост – бул. Цариградско шосе – ж.к. Изток) is shared with line 280
// and the cathedral with line 9: the same OSM footprints have the same centroids in every world pack, so those entries
// (and their builders) are reused and each landmark stands once, in the same place, whichever line is played.
// LandmarkData.replacedFor('84') = line 280's entries matching SHARED_280 + REPLACED84.
import { REPLACED9 } from '../landmarks9/data.js';

/** Line 280 landmarks within sight of the line 84 path (Sofia University, the National Library, the CCB tower and
 *  Pliska blocks, the Aviation monument, Arena 8888, Sofiamed). */
export const SHARED_280 = /^(SU |NBKM|CCB|Pliska|Aviation monument|Arena 8888|Sofiamed)/;

export const REPLACED84 = [
  ...REPLACED9.filter((r) => r.hero === 'nevsky'),
];
