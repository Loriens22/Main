// Line 64 buildings whose OSM massing is replaced by hand-built geometry (same format as
// REPLACED in ../LandmarkData.js): footprint centroid (vertex average of the pack footprint) in
// game coordinates, match radius, note. The builders find their footprints by the note prefix.
export const REPLACED64 = [
  // --- Paradise Center (pack building 11848)
  { x: -3081.6, z: 1242.7, r: 3.0, id: 11848, note: 'Paradise Center' },
  // --- National Centre of Public Health and Analyses (bul. Akad. Ivan Geshov 15): the institute
  // complex behind terminus stop 2342, OSM building parts of 9.9 m and the 13.2 m laboratory block
  { x: -4083.4, z: -1492.2, r: 2.5, id: 13480, note: 'NCPHA main wing' },
  { x: -4059.3, z: -1504.8, r: 2.5, id: 13481, note: 'NCPHA north wing' },
  { x: -4037.2, z: -1556.5, r: 2.5, id: 13477, note: 'NCPHA east wing' },
  { x: -4057.3, z: -1576.0, r: 2.5, id: 13476, note: 'NCPHA south wing' },
  { x: -4085.9, z: -1604.8, r: 2.5, id: 13478, note: 'NCPHA south-west wing' },
  { x: -4054.5, z: -1621.4, r: 2.5, id: 13479, note: 'NCPHA south block' },
  { x: -4012.2, z: -1492.6, r: 2.5, id: 13515, note: 'NCPHA laboratory block' },
  // --- "Sv. Sofia" lung hospital (OSM name), next door on the boulevard
  { x: -4035.3, z: -1456.8, r: 2.5, id: 13482, note: 'Lung hospital Sv. Sofia' },
  // --- the zoo's western entrance on Srebarna (OSM guardhouse in the fence line) at terminus 2764
  { x: -1965.9, z: 1089.5, r: 2.5, id: 14980, note: 'Zoo west entrance' },
  // --- Boyansko hanche, the inn that names stops 0265 / 0266
  { x: -6965.1, z: 2525.3, r: 2.5, id: 5293, note: 'Boyansko hanche' },
  // --- the chapel in Dragalevtsi cemetery (12.4 m, the only building inside it)
  { x: -3352.5, z: 3845.3, r: 2.5, id: 8747, note: 'Dragalevtsi cemetery chapel' },
];

/** The stretch of the Boyana Residence park fence (OSM) that runs along the road past stops 1439 / 1448. */
export const RESIDENCE_FENCE = [
  -6974.0, 2173.8, -6975.0, 2191.1, -6957.0, 2202.5, -6940.1, 2214.4, -6927.3, 2221.0, -6914.0, 2226.8,
  -6898.2, 2232.0, -6881.2, 2236.1, -6866.2, 2238.8, -6848.7, 2240.2, -6825.8, 2240.2, -6797.8, 2238.4,
  -6712.5, 2232.5, -6650.2, 2214.2, -6446.0, 2200.5,
];

/**
 * OSM fence / wall lines that a hand-built landmark redraws (its own fence, gate or wall): an OSM line
 * segment whose midpoint lies inside a circle {x, z, r} or within d of a polyline {pts, d} is left out
 * of the street furniture.
 */
export const LINE_MASKS64 = [
  { x: -1966, z: 1090, r: 9, note: 'zoo west entrance: pavilion and gate in the fence line' },
  { pts: RESIDENCE_FENCE, d: 1.5, note: 'Boyana Residence: the park fence along the road' },
];
