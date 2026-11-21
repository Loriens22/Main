/*
 * The worlds of the game. Solar-system data are real (IAU/JPL values, rounded): radii, GM, rotation, pole
 * directions and, for the planets, JPL's approximate Keplerian elements (Standish, valid 1800-2050, used a little
 * beyond). Moons ride circular orbits in their planet's equatorial plane at their real distances and periods.
 *
 * The Gargantua system is fiction built to the film's numbers and is documented as such: a 10^8 solar-mass,
 * near-extremal Kerr black hole whose accretion disk lights its planets. Navigation there is Newtonian with
 * Gargantua's GM; the planets' clocks use the Kerr circular-orbit time dilation (see Relativity.ts).
 */
export type BodyKind = 'star' | 'rocky' | 'gas' | 'ice' | 'blackhole' | 'wormhole';
export type SystemId = 'sol' | 'gargantua';

export interface JplElements {
  /** a (au), e, I (deg), L (deg), long. perihelion (deg), long. node (deg) and their rates per Julian century */
  a: [number, number]; e: [number, number]; I: [number, number]; L: [number, number]; w: [number, number]; O: [number, number];
}

export interface CircularOrbit {
  /** radius (m), period (s; negative = retrograde), inclination to the parent's equator (deg), phase at J2000 (deg) */
  a: number; period: number; inc?: number; phase?: number; node?: number;
}

export interface AtmosphereDef {
  /** surface density (kg/m^3) and scale height (m) for drag and entry */
  rho0: number; H: number;
  /** top of the sensible atmosphere for rendering (m) */
  top: number;
  /** Rayleigh coefficients at the surface (1/m) and their scale height, Mie/haze coefficient and its scale height */
  betaR: [number, number, number]; HR: number; betaM: number; HM: number; g: number;
  /** absorbing dust/haze (Mars, Titan) */
  betaD?: [number, number, number]; betaDAbs?: [number, number, number]; HD?: number;
  breathable?: boolean;
  /** colour of the limb as seen from space (for distant rendering) */
  limb: [number, number, number];
}

export interface BodyDef {
  id: string;
  name: string;
  kind: BodyKind;
  system: SystemId;
  parent: string | null;
  /** mean radius and polar radius (m) */
  R: number;
  Rp?: number;
  GM: number;
  /** sidereal rotation period (s), negative for retrograde rotation; 0 = tidally locked to the orbit */
  rotation: number;
  /** north pole direction, J2000 equatorial right ascension / declination (deg) */
  pole: [number, number];
  /** prime-meridian angle at J2000 (deg) */
  W0?: number;
  jpl?: JplElements;
  orbit?: CircularOrbit;
  atmosphere?: AtmosphereDef;
  rings?: { inner: number; outer: number };
  /** surface map set in public/assets/textures (planet_<id>_*) or null for a purely procedural look */
  maps: string | null;
  /** a surface the Ranger can land on (and the zone that plays it) */
  landing?: { zone: string; lat: number; lon: number; site: string };
  /**
   * Gas and ice giants: a floating station at the 1-bar level (a hot-hydrogen aerostat) the Ranger lands on, and the
   * ascent booster it builds from atmospheric hydrogen for the climb back to the Endurance (see docs/SPACE.md).
   */
  station?: { name: string; booster: { fuel: number; dry: number; thrust: number; isp: number }; wind: number; tempK: number; molar: number };
  /** altitude of the Endurance's parking orbit (m) */
  parkingAlt: number;
  /** giants: a low circular survey orbit (as Juno and Cassini flew close in), from which the station is reached */
  surveyAlt?: number;
  /** light the planet receives as a fraction of the Sun's at 1 au (Gargantua system: from the disk) */
  insolation?: number;
  blurb: string;
}

export const AU = 1.495978707e11;
export const DAY = 86400;
export const HOUR = 3600;
export const C_LIGHT = 299792458;

/** Gargantua: 1e8 solar masses. r_g = GM/c^2 ~ 1 au. */
export const GM_GARGANTUA = 1.32712440018e20 * 1e8;
export const R_G = GM_GARGANTUA / (C_LIGHT * C_LIGHT);

const km = 1000;

export const BODIES: BodyDef[] = [
  { id: 'sun', name: 'Sun', kind: 'star', system: 'sol', parent: null, R: 695700 * km, GM: 1.32712440018e20, rotation: 25.38 * DAY, pole: [286.13, 63.87], maps: null, parkingAlt: 0, blurb: 'G2V main-sequence star.' },
  {
    id: 'mercury', name: 'Mercury', kind: 'rocky', system: 'sol', parent: 'sun', R: 2439.7 * km, GM: 2.2032e13, rotation: 58.6462 * DAY, pole: [281.01, 61.45], W0: 329.55,
    jpl: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.2503235, 149472.67411175], w: [77.45779628, 0.16047689], O: [48.33076593, -0.12534081] },
    maps: 'mercury', parkingAlt: 150 * km, landing: { zone: 'surface:mercury', lat: -12, lon: 160, site: 'Beethoven basin rim' },
    blurb: 'Airless, heavily cratered, 430 °C by day and -180 °C at night.',
  },
  {
    id: 'venus', name: 'Venus', kind: 'rocky', system: 'sol', parent: 'sun', R: 6051.8 * km, GM: 3.24859e14, rotation: -243.025 * DAY, pole: [272.76, 67.16], W0: 160.2,
    jpl: { a: [0.72333566, 0.0000039], e: [0.00677672, -0.00004107], I: [3.39467605, -0.0007889], L: [181.9790995, 58517.81538729], w: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
    atmosphere: { rho0: 65, H: 15900, top: 250 * km, betaR: [2.0e-6, 3.6e-6, 7.0e-6], HR: 15900, betaM: 4e-4, HM: 6000, g: 0.85, betaD: [6e-5, 6.5e-5, 8e-5], betaDAbs: [0.2e-5, 0.6e-5, 2.4e-5], HD: 22000, limb: [1.0, 0.86, 0.55] },
    maps: 'venus', parkingAlt: 300 * km, landing: { zone: 'surface:venus', lat: -7.55, lon: 303.69, site: 'Phoebe Regio, the Venera 13 site' },
    blurb: 'Sulphuric-acid cloud deck over a 92-bar, 465 °C surface lit a dim orange. No real crewed craft could land and leave again: in the game the Ranger can (fiction, see docs).',
  },
  {
    id: 'earth', name: 'Earth', kind: 'rocky', system: 'sol', parent: 'sun', R: 6371 * km, GM: 3.986004418e14, rotation: 0.99726968 * DAY, pole: [0, 90], W0: 190.147,
    jpl: { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], w: [102.93768193, 0.32327364], O: [0, 0] },
    atmosphere: { rho0: 1.225, H: 8500, top: 80 * km, betaR: [5.8e-6, 13.5e-6, 33.1e-6], HR: 8000, betaM: 2.6e-5, HM: 1200, g: 0.78, breathable: true, limb: [0.45, 0.65, 1.0] },
    maps: null, landing: { zone: 'surface:earth', lat: 38.74372, lon: -104.85308, site: 'NASA landing field' }, parkingAlt: 400 * km, blurb: 'Home. The blight is winning.',
  },
  {
    id: 'moon', name: 'Moon', kind: 'rocky', system: 'sol', parent: 'earth', R: 1737.4 * km, GM: 4.9048695e12, rotation: 0, pole: [266.86, 65.64],
    orbit: { a: 384400 * km, period: 27.321661 * DAY, inc: 5.145, phase: 218.3 },
    maps: 'moon', parkingAlt: 100 * km, landing: { zone: 'surface:moon', lat: 0.67, lon: 23.47, site: 'Mare Tranquillitatis' },
    blurb: 'Airless regolith plains and highlands; 1/6 g.',
  },
  {
    id: 'mars', name: 'Mars', kind: 'rocky', system: 'sol', parent: 'sun', R: 3389.5 * km, Rp: 3376.2 * km, GM: 4.282837e13, rotation: 1.02595676 * DAY, pole: [317.68, 52.89], W0: 176.63,
    jpl: { a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
    atmosphere: { rho0: 0.020, H: 11100, top: 90 * km, betaR: [1.9e-7, 4.6e-7, 1.0e-6], HR: 11100, betaM: 6e-6, HM: 10000, g: 0.8, betaD: [1.2e-5, 1.0e-5, 0.7e-5], betaDAbs: [0.25e-5, 0.6e-5, 1.25e-5], HD: 11000, limb: [0.95, 0.72, 0.55] },
    maps: 'mars', parkingAlt: 300 * km, landing: { zone: 'surface:mars', lat: -4.6, lon: 137.4, site: 'Gale crater floor' },
    blurb: 'Cold desert under a thin CO2 sky; 0.38 g. Dust tints the sky butterscotch.',
  },
  { id: 'phobos', name: 'Phobos', kind: 'rocky', system: 'sol', parent: 'mars', R: 11.1 * km, GM: 7.087e5, rotation: 0, pole: [317.68, 52.89], orbit: { a: 9376 * km, period: 0.31891 * DAY, phase: 35 }, maps: null, parkingAlt: 5 * km, landing: { zone: 'surface:phobos', lat: 2, lon: -36, site: 'Stickney crater rim' }, blurb: 'Captured-asteroid moon, grooved and dark.' },
  { id: 'deimos', name: 'Deimos', kind: 'rocky', system: 'sol', parent: 'mars', R: 6.2 * km, GM: 9.8e4, rotation: 0, pole: [316.65, 53.52], orbit: { a: 23463 * km, period: 1.263 * DAY, phase: 210 }, maps: null, parkingAlt: 5 * km, landing: { zone: 'surface:deimos', lat: 22, lon: -3.5, site: 'Voltaire crater' }, blurb: 'Small, smooth outer moon of Mars.' },
  {
    id: 'jupiter', name: 'Jupiter', kind: 'gas', system: 'sol', parent: 'sun', R: 69911 * km, Rp: 66854 * km, GM: 1.26686534e17, rotation: 0.41354 * DAY, pole: [268.057, 64.495], W0: 284.95,
    jpl: { a: [5.202887, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], w: [14.72847983, 0.21252668], O: [100.47390909, 0.20469106] },
    atmosphere: { rho0: 0.16, H: 27000, top: 1500 * km, betaR: [1.5e-6, 3.2e-6, 7.0e-6], HR: 27000, betaM: 1e-5, HM: 20000, g: 0.8, limb: [0.75, 0.75, 0.85] },
    maps: 'jupiter', parkingAlt: 450000 * km, landing: { zone: 'station:jupiter', lat: 17, lon: 20, site: 'Aeolus Station, 1 bar, North Tropical Zone' },
    surveyAlt: 4000 * km,
    station: { name: 'Aeolus Station', booster: { fuel: 62000, dry: 5500, thrust: 2.7e6, isp: 4500 }, wind: 0, tempK: 165, molar: 2.22 },
    blurb: 'Gas giant: no surface. Belts and zones of ammonia cloud, the Great Red Spot. The Ranger lands on Aeolus Station, an aerostat floating at the 1-bar level; the station builds an ascent booster from atmospheric hydrogen for the climb back.',
  },
  { id: 'io', name: 'Io', kind: 'rocky', system: 'sol', parent: 'jupiter', R: 1821.6 * km, GM: 5.959916e12, rotation: 0, pole: [268.05, 64.5], orbit: { a: 421700 * km, period: 1.769138 * DAY, phase: 10 }, maps: 'io', parkingAlt: 100 * km, landing: { zone: 'surface:io', lat: 12, lon: 51, site: 'Plains by Loki Patera' }, blurb: 'Volcanic sulphur world.' },
  { id: 'europa', name: 'Europa', kind: 'rocky', system: 'sol', parent: 'jupiter', R: 1560.8 * km, GM: 3.202739e12, rotation: 0, pole: [268.08, 64.51], orbit: { a: 671034 * km, period: 3.551181 * DAY, phase: 120 }, maps: 'europa', parkingAlt: 100 * km, landing: { zone: 'surface:europa', lat: 9.7, lon: 87, site: 'Conamara Chaos' }, blurb: 'Ice shell over a global ocean, crossed by dark lineae.' },
  { id: 'ganymede', name: 'Ganymede', kind: 'rocky', system: 'sol', parent: 'jupiter', R: 2634.1 * km, GM: 9.887834e12, rotation: 0, pole: [268.2, 64.57], orbit: { a: 1070412 * km, period: 7.154553 * DAY, phase: 250 }, maps: 'ganymede', parkingAlt: 120 * km, landing: { zone: 'surface:ganymede', lat: 10, lon: -160, site: 'Uruk Sulcus grooved terrain' }, blurb: 'Largest moon: dark ancient terrain and bright grooved ice.' },
  { id: 'callisto', name: 'Callisto', kind: 'rocky', system: 'sol', parent: 'jupiter', R: 2410.3 * km, GM: 7.179289e12, rotation: 0, pole: [268.72, 64.83], orbit: { a: 1882709 * km, period: 16.689017 * DAY, phase: 320 }, maps: 'callisto', parkingAlt: 120 * km, landing: { zone: 'surface:callisto', lat: 14.7, lon: -56, site: 'Valhalla basin' }, blurb: 'Dark, saturated with craters.' },
  {
    id: 'saturn', name: 'Saturn', kind: 'gas', system: 'sol', parent: 'sun', R: 58232 * km, Rp: 54364 * km, GM: 3.7931187e16, rotation: 0.44401 * DAY, pole: [40.589, 83.537], W0: 38.9,
    jpl: { a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], w: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
    atmosphere: { rho0: 0.19, H: 59500, top: 1800 * km, betaR: [1.2e-6, 2.4e-6, 5.0e-6], HR: 59500, betaM: 1e-5, HM: 40000, g: 0.8, limb: [0.9, 0.82, 0.6] },
    rings: { inner: 66900 * km, outer: 140220 * km },
    maps: 'saturn', parkingAlt: 300000 * km, landing: { zone: 'station:saturn', lat: 32, lon: -40, site: 'Zephyr Station, 1 bar' },
    surveyAlt: 3000 * km,
    station: { name: 'Zephyr Station', booster: { fuel: 30000, dry: 3000, thrust: 1.3e6, isp: 4500 }, wind: 0, tempK: 134, molar: 2.07 },
    blurb: 'Ringed gas giant. The wormhole was found in its orbit. Zephyr Station floats at the 1-bar level.',
  },
  { id: 'enceladus', name: 'Enceladus', kind: 'rocky', system: 'sol', parent: 'saturn', R: 252.1 * km, GM: 7.21e9, rotation: 0, pole: [40.66, 83.52], orbit: { a: 237948 * km, period: 1.370218 * DAY, phase: 70 }, maps: 'enceladus', parkingAlt: 30 * km, landing: { zone: 'surface:enceladus', lat: 5, lon: 60, site: 'Sarandib Planitia' }, blurb: 'Bright ice moon venting water from its south pole.' },
  { id: 'rhea', name: 'Rhea', kind: 'rocky', system: 'sol', parent: 'saturn', R: 763.8 * km, GM: 1.539e11, rotation: 0, pole: [40.38, 83.55], orbit: { a: 527108 * km, period: 4.518212 * DAY, phase: 200 }, maps: 'rhea', parkingAlt: 50 * km, landing: { zone: 'surface:rhea', lat: -14, lon: -112, site: 'Inktomi crater rays' }, blurb: 'Icy, cratered.' },
  {
    id: 'titan', name: 'Titan', kind: 'rocky', system: 'sol', parent: 'saturn', R: 2574.7 * km, GM: 8.978138e12, rotation: 0, pole: [39.48, 83.43], orbit: { a: 1221870 * km, period: 15.945 * DAY, phase: 290 },
    atmosphere: { rho0: 5.3, H: 21000, top: 600 * km, betaR: [0.4e-6, 0.9e-6, 2.0e-6], HR: 21000, betaM: 1.2e-5, HM: 30000, g: 0.75, betaD: [2.2e-5, 2.8e-5, 4.2e-5], betaDAbs: [0.4e-5, 1.4e-5, 3.6e-5], HD: 60000, limb: [1.0, 0.65, 0.25] },
    maps: 'titan', parkingAlt: 1200 * km, landing: { zone: 'surface:titan', lat: -10.3, lon: 167.7, site: 'Huygens landing site, Adiri' }, blurb: 'Orange nitrogen haze over methane lakes.',
  },
  { id: 'iapetus', name: 'Iapetus', kind: 'rocky', system: 'sol', parent: 'saturn', R: 734.5 * km, GM: 1.2051e11, rotation: 0, pole: [318.16, 75.03], orbit: { a: 3560820 * km, period: 79.3215 * DAY, inc: 15.47, phase: 40 }, maps: 'iapetus', parkingAlt: 50 * km, landing: { zone: 'surface:iapetus', lat: 10, lon: -90, site: 'Cassini Regio' }, blurb: 'Two-toned: one hemisphere coal-dark, the other bright.' },
  {
    id: 'uranus', name: 'Uranus', kind: 'ice', system: 'sol', parent: 'sun', R: 25362 * km, Rp: 24973 * km, GM: 5.793939e15, rotation: -0.71833 * DAY, pole: [257.311, -15.175], W0: 203.81,
    jpl: { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], w: [170.9542763, 0.40805281], O: [74.01692503, 0.04240589] },
    atmosphere: { rho0: 0.42, H: 27700, top: 1200 * km, betaR: [1.0e-6, 2.0e-6, 3.8e-6], HR: 27700, betaM: 6e-6, HM: 30000, g: 0.8, limb: [0.6, 0.88, 0.95] },
    rings: { inner: 41837 * km, outer: 51149 * km },
    maps: 'uranus', parkingAlt: 120000 * km, landing: { zone: 'station:uranus', lat: -12, lon: 60, site: 'Boreas Station, 1 bar' },
    surveyAlt: 2500 * km,
    station: { name: 'Boreas Station', booster: { fuel: 16000, dry: 1800, thrust: 0.7e6, isp: 4500 }, wind: 0, tempK: 76, molar: 2.64 },
    blurb: 'Ice giant lying on its side; methane haze turns it pale cyan. Boreas Station floats at the 1-bar level.',
  },
  { id: 'titania', name: 'Titania', kind: 'rocky', system: 'sol', parent: 'uranus', R: 788.4 * km, GM: 2.27e11, rotation: 0, pole: [257.43, -15.1], orbit: { a: 435910 * km, period: -8.706234 * DAY, phase: 0 }, maps: 'rhea', parkingAlt: 50 * km, landing: { zone: 'surface:titania', lat: -33, lon: -25, site: 'Messina Chasmata' }, blurb: 'Largest moon of Uranus.' },
  {
    id: 'neptune', name: 'Neptune', kind: 'ice', system: 'sol', parent: 'sun', R: 24622 * km, Rp: 24341 * km, GM: 6.836529e15, rotation: 0.6713 * DAY, pole: [299.36, 43.46], W0: 249.98,
    jpl: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], w: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664] },
    atmosphere: { rho0: 0.45, H: 19700, top: 1200 * km, betaR: [1.0e-6, 2.4e-6, 6.0e-6], HR: 19700, betaM: 6e-6, HM: 30000, g: 0.8, limb: [0.35, 0.55, 1.0] },
    maps: 'neptune', parkingAlt: 110000 * km, landing: { zone: 'station:neptune', lat: -22, lon: 150, site: 'Notus Station, 1 bar' },
    surveyAlt: 2500 * km,
    station: { name: 'Notus Station', booster: { fuel: 18000, dry: 2000, thrust: 0.8e6, isp: 4500 }, wind: 0, tempK: 72, molar: 2.6 },
    blurb: 'Deep blue ice giant with the fastest winds in the Solar System. Notus Station floats at the 1-bar level.',
  },
  { id: 'triton', name: 'Triton', kind: 'rocky', system: 'sol', parent: 'neptune', R: 1353.4 * km, GM: 1.4276e12, rotation: 0, pole: [299.36, 41.17], orbit: { a: 354759 * km, period: -5.876854 * DAY, inc: 157, phase: 100 }, maps: 'triton', parkingAlt: 80 * km, landing: { zone: 'surface:triton', lat: 20, lon: -30, site: 'Bubembe Regio cantaloupe terrain' }, blurb: 'Retrograde captured moon with nitrogen geysers.' },

  // ---------------------------------------------------------------- beyond the wormhole (fiction, see header)
  { id: 'wormhole', name: 'Wormhole', kind: 'wormhole', system: 'sol', parent: 'saturn', R: 1000, GM: 0, rotation: 0, pole: [40.589, 83.537], orbit: { a: 1.45e9, period: 0, phase: 30 }, maps: null, parkingAlt: 24000, blurb: 'A sphere two kilometres across, in Saturn orbit. The far side shows another galaxy.' },
  { id: 'gate', name: 'Wormhole · far side', kind: 'wormhole', system: 'gargantua', parent: 'gargantua', R: 1000, GM: 0, rotation: 0, pole: [0, 90], orbit: { a: 300 * R_G, period: 0, inc: 9, phase: 75 }, maps: null, parkingAlt: 24000, insolation: 0.15, blurb: 'Where the wormhole opens beyond Saturn: Gargantua fills the sky ahead.' },
  { id: 'gargantua', name: 'Gargantua', kind: 'blackhole', system: 'gargantua', parent: null, R: R_G, GM: GM_GARGANTUA, rotation: 0, pole: [0, 90], maps: null, parkingAlt: 0, blurb: 'Rotating supermassive black hole, 100 million solar masses, spinning within a hair of the maximum.' },
  {
    id: 'miller', name: "Miller's planet", kind: 'rocky', system: 'gargantua', parent: 'gargantua', R: 6700 * km, GM: 5.72e14, rotation: 0, pole: [0, 90], orbit: { a: 12 * R_G, period: 0, inc: 4, phase: 0 },
    atmosphere: { rho0: 1.5, H: 8800, top: 90 * km, betaR: [5.2e-6, 11.6e-6, 25.0e-6], HR: 8800, betaM: 3.5e-5, HM: 1500, g: 0.76, betaD: [0.7e-5, 0.7e-5, 0.65e-5], betaDAbs: [0.1e-5, 0.15e-5, 0.2e-5], HD: 2500, limb: [0.62, 0.72, 0.82] },
    maps: 'miller', parkingAlt: 250 * km, landing: { zone: 'surface:miller', lat: 4.0, lon: -30.0, site: "Dr. Miller's beacon" }, insolation: 0.55,
    blurb: '1.3 g. A planet-wide shallow ocean. Tidal waves over a kilometre high sweep round it.',
  },
  {
    id: 'mann', name: "Mann's planet", kind: 'rocky', system: 'gargantua', parent: 'gargantua', R: 5800 * km, GM: 2.64e14, rotation: 67 * HOUR, pole: [0, 90], orbit: { a: 420 * R_G, period: 0, inc: 7, phase: 150 },
    atmosphere: { rho0: 0.9, H: 9200, top: 90 * km, betaR: [5.0e-6, 11.0e-6, 24.0e-6], HR: 9200, betaM: 5e-5, HM: 2200, g: 0.8, betaD: [0.9e-5, 0.9e-5, 0.95e-5], betaDAbs: [0.05e-5, 0.06e-5, 0.07e-5], HD: 5000, limb: [0.8, 0.84, 0.9] },
    maps: 'mann', parkingAlt: 200 * km, landing: { zone: 'surface:mann', lat: -38, lon: 75, site: "Dr. Mann's shelter" }, insolation: 0.18,
    blurb: '0.8 g. Ice and frozen cloud; ammonia in the air. Not breathable.',
  },
  {
    id: 'edmunds', name: "Edmunds' planet", kind: 'rocky', system: 'gargantua', parent: 'gargantua', R: 6200 * km, GM: 3.58e14, rotation: 24.667 * HOUR, pole: [0, 90], orbit: { a: 120 * R_G, period: 0, inc: 5, phase: 260 },
    atmosphere: { rho0: 1.05, H: 8900, top: 85 * km, betaR: [5.6e-6, 12.6e-6, 29.5e-6], HR: 8900, betaM: 2.0e-5, HM: 1300, g: 0.78, betaD: [0.8e-5, 0.7e-5, 0.5e-5], betaDAbs: [0.1e-5, 0.25e-5, 0.6e-5], HD: 2400, breathable: true, limb: [0.55, 0.7, 1.0] },
    maps: 'edmunds', parkingAlt: 250 * km, landing: { zone: 'surface:edmunds', lat: 18, lon: 140, site: 'Edmunds research base' }, insolation: 1.0,
    blurb: '0.95 g. Dry rocky desert under a breathable sky. The most promising world.',
  },
];

export const BODY: Record<string, BodyDef> = Object.fromEntries(BODIES.map((b) => [b.id, b]));

/** Orbit of each body around its parent, filled in for circular orbits without an explicit period. */
for (const b of BODIES) {
  if (b.orbit && b.parent && !b.orbit.period) {
    const P = BODY[b.parent];
    b.orbit.period = P.GM > 0 ? 2 * Math.PI * Math.sqrt((b.orbit.a ** 3) / P.GM) : 0;
  }
  // tidally locked bodies turn once per orbit
  if (b.rotation === 0 && b.orbit && b.orbit.period) b.rotation = b.orbit.period;
}

/** Bodies the navigation computer offers. */
export const SOL_DESTINATIONS = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'europa', 'saturn', 'titan', 'uranus', 'neptune'];
export const LAZARUS_DESTINATIONS = ['wormhole', 'miller', 'mann', 'edmunds'];
/** the wormhole's two mouths */
export const WORMHOLE_PAIR: Record<string, string> = { wormhole: 'gate', gate: 'wormhole' };

/** Sphere of influence radius of a body about its parent (Laplace). */
export function soiRadius(b: BodyDef): number {
  if (!b.parent) return Infinity;
  const P = BODY[b.parent];
  const a = b.jpl ? b.jpl.a[0] * AU : b.orbit ? b.orbit.a : 0;
  if (!P || P.GM <= 0 || b.GM <= 0) return 0;
  return a * Math.pow(b.GM / P.GM, 0.4);
}

/**
 * The Endurance's parking altitude at a body: its default, or the one chosen for it (the low survey orbit at a giant,
 * picked for the capture or reached later by a Hohmann transfer). Saved with the game.
 */
export const parkingOverride: Record<string, number> = {};
export const parkAlt = (b: BodyDef) => parkingOverride[b.id] ?? b.parkingAlt;

/** Surface gravity (m/s^2). */
export const surfaceGravity = (b: BodyDef) => b.GM / (b.R * b.R);
