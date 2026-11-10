/**
 * Landable bodies: surface style, relief scale of the orbital height maps, named landing sites.
 * Sites use planetocentric latitude / east longitude, matching the body maps (scripts/gen_planets.py).
 */
export type SurfaceStyle = 'lunar' | 'mercury' | 'mars' | 'icy' | 'europa' | 'io' | 'titan' | 'rubble';

export interface LandingSite {
  name: string;
  lat: number;
  lon: number;
  note: string;
}

export interface SurfaceDef {
  style: SurfaceStyle;
  /** metres of relief for the full ±0.5 range of the map's height channel */
  relief: number;
  /** fraction of the ground covered by boulders near fresh craters (0..1) */
  rocks: number;
  /** procedural crater density multiplier */
  craters: number;
  /** ground colour multiplier applied to the orbital albedo map up close */
  tint: [number, number, number];
  /** surface temperature description for the HUD */
  temp: string;
  sites: LandingSite[];
}

export const SURFACES: Record<string, SurfaceDef> = {
  moon: {
    style: 'lunar', relief: 6500, rocks: 0.6, craters: 1, tint: [1, 1, 1], temp: '−170…+120 °C',
    sites: [
      { name: 'Mare Tranquillitatis', lat: 0.674, lon: 23.473, note: 'Smooth basalt plain — the first crewed landing site.' },
      { name: 'Copernicus crater', lat: 9.7, lon: -20.1, note: '93 km rayed crater with terraced walls and central peaks.' },
      { name: 'Tycho crater', lat: -43.3, lon: -11.2, note: 'Young, sharp crater; boulder-strewn ejecta, bright rays.' },
      { name: 'Mare Imbrium', lat: 32.8, lon: -15.6, note: 'Vast dark lava plain inside an ancient basin.' },
      { name: 'Shackleton rim (south pole)', lat: -89.4, lon: -129, note: 'Grazing sunlight, permanent shadow in the crater below.' },
      { name: 'Tsiolkovsky (far side)', lat: -20.4, lon: 129.1, note: 'Dark-floored crater on the far side; Earth never rises here.' },
    ],
  },
  mercury: {
    style: 'mercury', relief: 4500, rocks: 0.5, craters: 1.1, tint: [1, 1, 1], temp: '−180…+430 °C',
    sites: [
      { name: 'Caloris Planitia', lat: 30.5, lon: -170, note: 'Floor of the 1 500 km Caloris impact basin.' },
      { name: 'Hokusai ray crater', lat: 58, lon: 16.8, note: 'Young crater with rays crossing half the planet.' },
      { name: 'Chao Meng-Fu (south pole)', lat: -87.3, lon: -134, note: 'Polar crater; ice in permanent shadow.' },
    ],
  },
  mars: {
    style: 'mars', relief: 9000, rocks: 0.45, craters: 0.45, tint: [1, 0.97, 0.94], temp: '−80…+10 °C',
    sites: [
      { name: 'Jezero crater', lat: 18.38, lon: 77.58, note: 'Ancient lake bed with a river delta.' },
      { name: 'Gale crater', lat: -5.4, lon: 137.8, note: 'Crater floor below the layered Aeolis Mons.' },
      { name: 'Meridiani Planum', lat: -1.95, lon: -5.5, note: 'Flat hematite plains, dark sand ripples.' },
      { name: 'Valles Marineris', lat: -13.2, lon: -61, note: 'Floor of Coprates Chasma, the great canyon system.' },
      { name: 'Utopia Planitia', lat: 46.7, lon: 117.5, note: 'Northern lowland plain, frost in winter.' },
      { name: 'Planum Boreum (north cap)', lat: 82.5, lon: -40, note: 'Water-ice polar cap with spiral troughs.' },
    ],
  },
  phobos: {
    style: 'rubble', relief: 1200, rocks: 0.9, craters: 1.3, tint: [1, 1, 1], temp: '−110…−4 °C',
    sites: [{ name: 'Stickney crater rim', lat: 1, lon: -49, note: 'Rim of the 9 km crater; Mars fills a quarter of the sky.' }],
  },
  deimos: {
    style: 'rubble', relief: 500, rocks: 0.6, craters: 0.8, tint: [1, 1, 1], temp: '−110…−20 °C',
    sites: [{ name: 'Voltaire', lat: 22, lon: 3.5, note: 'Smooth regolith-blanketed crater.' }],
  },
  io: {
    style: 'io', relief: 2500, rocks: 0.3, craters: 0, tint: [1, 1, 1], temp: '−140 °C (lava 1 200 °C)',
    sites: [
      { name: 'Sulphur plains', lat: 8, lon: 40, note: 'Yellow sulphur frost between volcanic centres.' },
      { name: 'Volcanic patera rim', lat: -20, lon: -110, note: 'Dark silicate flows; plumes on the horizon.' },
    ],
  },
  europa: {
    style: 'europa', relief: 900, rocks: 0.2, craters: 0.08, tint: [1, 1, 1], temp: '−160 °C',
    sites: [
      { name: 'Ridged plains', lat: 9.7, lon: -86.7, note: 'Double ridges and lineae over the ice shell.' },
      { name: 'Chaos terrain', lat: -10, lon: 40, note: 'Jumbled ice blocks over the hidden ocean.' },
    ],
  },
  ganymede: {
    style: 'icy', relief: 2500, rocks: 0.3, craters: 0.6, tint: [1, 1, 1], temp: '−160 °C',
    sites: [
      { name: 'Galileo Regio', lat: 35, lon: -150, note: 'Ancient dark cratered terrain.' },
      { name: 'Grooved terrain', lat: -10, lon: 60, note: 'Bright parallel ridges and troughs.' },
    ],
  },
  callisto: {
    style: 'icy', relief: 2500, rocks: 0.4, craters: 1.2, tint: [1, 1, 1], temp: '−140 °C',
    sites: [{ name: 'Valhalla basin', lat: 15, lon: -57, note: 'Centre of a 3 800 km multi-ring basin.' }],
  },
  mimas: {
    style: 'icy', relief: 6000, rocks: 0.3, craters: 1.3, tint: [1, 1, 1], temp: '−200 °C',
    sites: [{ name: 'Herschel crater floor', lat: 0, lon: -112, note: 'Inside the 130 km crater; the central peak towers 7 km.' }],
  },
  enceladus: {
    style: 'icy', relief: 1600, rocks: 0.2, craters: 0.5, tint: [1, 1, 1], temp: '−200 °C',
    sites: [
      { name: 'Tiger stripes (south pole)', lat: -82, lon: 30, note: 'Warm fractures venting the water plumes.' },
      { name: 'Cratered north', lat: 50, lon: -20, note: 'Old, soft-edged craters in bright snow.' },
    ],
  },
  dione: {
    style: 'icy', relief: 3000, rocks: 0.3, craters: 1, tint: [1, 1, 1], temp: '−185 °C',
    sites: [{ name: 'Wispy terrain', lat: 0, lon: -70, note: 'Bright ice cliffs on the trailing hemisphere.' }],
  },
  rhea: {
    style: 'icy', relief: 4000, rocks: 0.3, craters: 1.1, tint: [1, 1, 1], temp: '−195 °C',
    sites: [{ name: 'Inktomi rays', lat: -14, lon: -112, note: 'Young bright-rayed crater.' }],
  },
  titan: {
    style: 'titan', relief: 900, rocks: 0.35, craters: 0.05, tint: [1, 1, 1], temp: '−179 °C · 1.5 bar',
    sites: [
      { name: 'Huygens landing plain', lat: -10.6, lon: -167.7, note: 'Rounded ice pebbles on a damp floodplain.' },
      { name: 'Belet dune sea', lat: -6, lon: 100, note: 'Equatorial longitudinal dunes of organic sand.' },
      { name: 'Kraken Mare shore', lat: 68, lon: -50, note: 'Coast of the largest methane sea.' },
    ],
  },
  iapetus: {
    style: 'icy', relief: 6000, rocks: 0.3, craters: 1.2, tint: [1, 1, 1], temp: '−170 °C',
    sites: [
      { name: 'Equatorial ridge', lat: 0, lon: 90, note: 'A 13 km tall ridge in dark Cassini Regio.' },
      { name: 'Bright trailing side', lat: 20, lon: -90, note: 'Clean ice plains.' },
    ],
  },
  titania: {
    style: 'icy', relief: 3000, rocks: 0.3, craters: 1, tint: [1, 1, 1], temp: '−200 °C',
    sites: [{ name: 'Messina Chasma', lat: -30, lon: 0, note: 'Rift canyon in the icy crust.' }],
  },
  triton: {
    style: 'icy', relief: 1200, rocks: 0.2, craters: 0.2, tint: [1, 1, 1], temp: '−235 °C',
    sites: [
      { name: 'Cantaloupe terrain', lat: 15, lon: 0, note: 'Dimpled ice of the northern plains.' },
      { name: 'Southern cap geysers', lat: -45, lon: 30, note: 'Nitrogen geyser streaks over the pink cap.' },
    ],
  },
};

export function isLandable(id: string) {
  return id in SURFACES;
}

/** Handover altitude between the orbital and surface zones (m). */
export function handoverAltitude(id: string, R: number) {
  return Math.min(40e3, 0.45 * R);
}
