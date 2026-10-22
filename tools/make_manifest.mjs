// Writes data/research/route280_manifest.json from the generated route data
// plus the manually researched notes below. Run after tools/build_route.py:
//   node tools/make_manifest.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const route = JSON.parse(readFileSync('src/data/route280.json', 'utf8'));

// Notes per stop code that the automated pipeline cannot know. Everything
// here is stated with its evidence; nothing is presented as verified when
// it is not.
const NOTES = {
  '0764': {
    discrepancy: 'Directive name "НСБАЛ по онкология"; the OSM stop node (same code 0764) is named "Онкологична болница". Signs and HUD show the directive name; the voice announcement currently uses the "speech" form "Онкологична болница". Which form the real on-board system speaks has not been verified.',
  },
  '0761': {
    discrepancy: 'As 0764 (opposite direction): OSM name "Онкологична болница".',
  },
  '1258': {
    note: 'Listed only in the direction B stop sequence (Студентски град → СУ) of the directive; direction A has no stop of this name.',
  },
  '1697': {
    note: 'Shared terminal pole for both directions at ул. Шипка by the SU rectorate. The turning manoeuvre between the two directions is modelled by terminalLinks (routed on real streets), not by reversing the path.',
  },
  '1694': {
    note: 'Arrival pole inside the Студентски град turning loop; pinned to OSM way 1193785354 so the path uses the loop rather than a dead-end service stub.',
  },
  '1693': {
    note: 'Departure pole in the same loop as 1694 (pinned to the same way).',
  },
};

const LANDMARKS = [
  { name: 'Софийски университет „Св. Климент Охридски“ (Ректорат)', modelled: 'procedural', how: 'OSM footprint with landmark style: rusticated base, portico with columns, statues of the Evlogi & Hristo Georgiev brothers approximated as pedestal figures', confidence: 'medium' },
  { name: 'Военна академия „Г. С. Раковски“', modelled: 'procedural', how: 'OSM footprint, classical palette, hip roof', confidence: 'low' },
  { name: 'Орлов мост (Eagles’ Bridge)', modelled: 'procedural', how: 'Four columns with bronze eagles at the real OSM node positions of the bridge corners; bridge railings on the Perlovska river crossing', confidence: 'medium' },
  { name: 'Yellow paving (жълти павета), бул. Цар Освободител / Орлов мост', modelled: 'procedural', how: 'Yellow paving texture where OSM surface=paving_stones/sett within ~900 m of the SU terminal', confidence: 'medium' },
  { name: 'бул. Цариградско шосе', modelled: 'from data', how: 'Multi-lane boulevard from OSM lanes/width with medians, signals and crossings', confidence: 'medium' },
  { name: 'Хотел Плиска', modelled: 'procedural', how: 'OSM footprint as tower; red "ПЛИСКА" roof sign', confidence: 'medium' },
  { name: 'ж.к. Изток / бул. Г. М. Димитров', modelled: 'from data', how: 'OSM building heights/levels; panel-block facade style chosen by footprint and height', confidence: 'medium' },
  { name: 'Технически университет', modelled: 'from data', how: 'OSM footprints + institutional facade style', confidence: 'medium' },
  { name: 'Лесотехнически университет', modelled: 'from data', how: 'OSM footprints + vegetation density from OSM landuse', confidence: 'low' },
  { name: 'ж.к. Дървеница', modelled: 'from data', how: 'OSM panel blocks', confidence: 'medium' },
  { name: 'УНСС', modelled: 'from data', how: 'OSM footprint, institutional style', confidence: 'low' },
  { name: 'Спортна зала „Христо Ботев“', modelled: 'from data', how: 'OSM footprint with flat roof', confidence: 'low' },
  { name: 'Зимен дворец на спорта', modelled: 'from data', how: 'OSM footprint and height', confidence: 'low' },
  { name: 'Национална спортна академия', modelled: 'procedural', how: 'OSM footprints; stadium light masts placed at OSM pitch corners', confidence: 'low' },
  { name: 'Студентски град', modelled: 'from data', how: 'OSM dormitory blocks and the bus turning loop', confidence: 'medium' },
  { name: 'Витоша (skyline)', modelled: 'from data', how: 'Far terrain from Terrarium DEM tiles (Mapzen/AWS open data)', confidence: 'high' },
];

const now = new Date().toISOString().slice(0, 10);
const dirs = {};
for (const id of ['A', 'B']) {
  const d = route.directions[id];
  dirs[id] = {
    from: d.from_,
    headsign: d.headsign,
    lengthMeters: Math.round(d.length),
    streets: d.streets.map((s) => s.name).filter((n, i, a) => n && a.indexOf(n) === i),
    stops: d.stops.map((s, i) => {
      const next = d.stops[i + 1];
      return {
        order: i + 1,
        code: s.code,
        name: s.name,
        speech: s.speech,
        osmName: s.osmName,
        lat: s.lat,
        lon: s.lon,
        road: s.road,
        roadClass: s.roadClass,
        arcLengthMeters: Math.round(s.s),
        distanceToNextMeters: next ? Math.round(next.s - s.s) : null,
        poleOffsetFromCentrelineMeters: s.poleOffset,
        rightHandSide: s.rightSide,
        amenities: { shelter: s.shelter, bench: s.bench, bin: s.bin, lit: s.lit, departuresBoard: s.departuresBoard, wheelchair: s.wheelchair },
        source: s.source,
        positionConfidence: 'high (OSM node matched by official stop code)',
        amenityConfidence: 'medium (OSM tags; not field-verified)',
        ...(NOTES[s.code] || {}),
      };
    }),
  };
}

const manifest = {
  title: 'Sofia bus line 280 — route research manifest',
  generated: now,
  method: [
    'Stops matched by their official Sofia Urban Mobility Center codes (OSM ref tag) in the Overture Maps 2026-10-21.0 release (OpenStreetMap derived).',
    'Bus path routed independently per direction with an edge-based Dijkstra on drivable OSM roads, respecting one-way restrictions and banning U-turns.',
    'Elevation from Terrarium DEM tiles (Mapzen / AWS open data, ~30 m SRTM-derived).',
    'No Google Maps / Street View imagery or data was used.',
  ],
  licences: {
    roads_buildings_stops: 'ODbL-1.0 — © OpenStreetMap contributors, via Overture Maps Foundation',
    elevation: 'Mapzen Terrain Tiles (SRTM, GMTED, ETOPO1) — public domain / attribution',
  },
  directions: dirs,
  landmarks: LANDMARKS,
  unresolved: [
    'Stop amenity tags (shelter, bench, real-time board) come from OSM and were not verified on site; some shelters may be missing or differ in design.',
    'Lane counts and markings are inferred from OSM road class, width and lanes tags; exact turn-lane layouts at Орлов мост and Цариградско шосе junctions are simplified.',
    'Traffic signal positions come from OSM highway=traffic_signals nodes; phase timings are generic (not the real Sofia programmes).',
    'Building facades are procedural styles chosen per footprint; they are not photographic reconstructions. Heights come from OSM height/levels when present, otherwise estimated.',
    'The in-game timetable is derived from distance (6.3 m/s average) plus 22 s per stop; it is not the official SKGT/ЦГМ schedule.',
    'The "НСБАЛ по онкология" / "Онкологична болница" naming difference is unresolved (see stop notes).',
  ],
};

mkdirSync('data/research', { recursive: true });
writeFileSync('data/research/route280_manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote data/research/route280_manifest.json', dirs.A.stops.length, '+', dirs.B.stops.length, 'stops');
