/**
 * Celestial bodies. Sol planets use the JPL "approximate positions of the planets" Keplerian elements
 * (Standish, valid 1800–2050; mildly extrapolated to the 2060s). Moons use circular orbits with real radii/periods.
 * The Gargantua system is fictional (film-inspired), with game-scale orbits.
 */
export type BodyKind = 'star' | 'terrestrial' | 'gas' | 'ice' | 'moon' | 'ocean' | 'frozen' | 'desert' | 'blackhole' | 'wormhole';

export interface BodyDef {
  id: string;
  name: string;
  system: 'sol' | 'gargantua';
  kind: BodyKind;
  radius: number; // m
  mu: number; // m^3/s^2
  parent: string | null;
  /** JPL elements [a(AU), e, I, L, varpi, Omega] + rates per century */
  el?: number[];
  rates?: number[];
  /** circular orbit around parent (moons / Gargantua system) */
  circ?: { r: number; period: number; inc?: number; phase?: number };
  rotation: number; // sidereal rotation period (s), negative = retrograde
  tilt: number; // axial tilt rad
  atmosphere?: { height: number; color: [number, number, number]; density: number };
  rings?: { inner: number; outer: number };
  surface?: string; // location id with an explorable surface zone
  color: [number, number, number];
  info: string;
}

const AU = 1.495978707e11;
const D = 86400;
const deg = Math.PI / 180;

export const BODIES: Record<string, BodyDef> = {
  sun: { id: 'sun', name: 'Sun', system: 'sol', kind: 'star', radius: 6.957e8, mu: 1.32712440018e20, parent: null, rotation: 25.38 * D, tilt: 7.25 * deg, color: [1, 0.95, 0.85], info: 'G2V main-sequence star.' },
  mercury: { id: 'mercury', name: 'Mercury', system: 'sol', kind: 'terrestrial', radius: 2.4397e6, mu: 2.2032e13, parent: 'sun', el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], rates: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], rotation: 58.646 * D, tilt: 0.03 * deg, color: [0.55, 0.53, 0.5], info: 'Airless, cratered, extreme temperature swings. Orbital reconnaissance only.' },
  venus: { id: 'venus', name: 'Venus', system: 'sol', kind: 'terrestrial', radius: 6.0518e6, mu: 3.24859e14, parent: 'sun', el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], rates: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418], rotation: -243.025 * D, tilt: 177.36 * deg, atmosphere: { height: 250e3, color: [0.95, 0.85, 0.6], density: 1 }, color: [0.9, 0.82, 0.6], info: '92 bar CO₂ atmosphere, 465 °C surface. Atmospheric reconnaissance from orbit.' },
  earth: { id: 'earth', name: 'Earth', system: 'sol', kind: 'terrestrial', radius: 6.371e6, mu: 3.986004418e14, parent: 'sun', el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], rates: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0], rotation: 86164.1, tilt: 23.44 * deg, atmosphere: { height: 100e3, color: [0.55, 0.7, 1.0], density: 1 }, surface: 'earth', color: [0.35, 0.45, 0.6], info: 'Home. Dying of blight and dust.' },
  moon: { id: 'moon', name: 'Moon', system: 'sol', kind: 'moon', radius: 1.7374e6, mu: 4.9048695e12, parent: 'earth', circ: { r: 3.844e8, period: 27.3217 * D, inc: 5.14 * deg, phase: 1.1 }, rotation: 27.3217 * D, tilt: 6.7 * deg, color: [0.6, 0.6, 0.58], info: 'Earth’s natural satellite.' },
  mars: { id: 'mars', name: 'Mars', system: 'sol', kind: 'terrestrial', radius: 3.3895e6, mu: 4.282837e13, parent: 'sun', el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rates: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], rotation: 88642.7, tilt: 25.19 * deg, atmosphere: { height: 80e3, color: [0.85, 0.6, 0.45], density: 0.15 }, color: [0.7, 0.4, 0.25], info: 'Cold desert with a thin CO₂ atmosphere. Orbital survey.' },
  phobos: { id: 'phobos', name: 'Phobos', system: 'sol', kind: 'moon', radius: 1.11e4, mu: 7.087e5, parent: 'mars', circ: { r: 9.376e6, period: 0.31891 * D, phase: 0.3 }, rotation: 0.31891 * D, tilt: 0, color: [0.4, 0.37, 0.34], info: 'Captured asteroid-like moon.' },
  deimos: { id: 'deimos', name: 'Deimos', system: 'sol', kind: 'moon', radius: 6.2e3, mu: 9.6e4, parent: 'mars', circ: { r: 2.3463e7, period: 1.263 * D, phase: 2.1 }, rotation: 1.263 * D, tilt: 0, color: [0.45, 0.42, 0.38], info: 'Small outer moon of Mars.' },
  jupiter: { id: 'jupiter', name: 'Jupiter', system: 'sol', kind: 'gas', radius: 6.9911e7, mu: 1.26686534e17, parent: 'sun', el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rates: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], rotation: 35730, tilt: 3.13 * deg, atmosphere: { height: 5e6, color: [0.85, 0.75, 0.6], density: 1 }, color: [0.8, 0.7, 0.55], info: 'Gas giant — no solid surface. Orbital and atmospheric reconnaissance only.' },
  io: { id: 'io', name: 'Io', system: 'sol', kind: 'moon', radius: 1.8216e6, mu: 5.9599e12, parent: 'jupiter', circ: { r: 4.217e8, period: 1.769 * D, phase: 0.5 }, rotation: 1.769 * D, tilt: 0, color: [0.85, 0.75, 0.35], info: 'Volcanic moon.' },
  europa: { id: 'europa', name: 'Europa', system: 'sol', kind: 'moon', radius: 1.5608e6, mu: 3.2027e12, parent: 'jupiter', circ: { r: 6.709e8, period: 3.551 * D, phase: 1.8 }, rotation: 3.551 * D, tilt: 0, color: [0.82, 0.78, 0.72], info: 'Ice shell over a global ocean.' },
  ganymede: { id: 'ganymede', name: 'Ganymede', system: 'sol', kind: 'moon', radius: 2.6341e6, mu: 9.8878e12, parent: 'jupiter', circ: { r: 1.0704e9, period: 7.155 * D, phase: 3.0 }, rotation: 7.155 * D, tilt: 0, color: [0.6, 0.57, 0.52], info: 'Largest moon in the Solar System.' },
  callisto: { id: 'callisto', name: 'Callisto', system: 'sol', kind: 'moon', radius: 2.4103e6, mu: 7.1793e12, parent: 'jupiter', circ: { r: 1.8827e9, period: 16.689 * D, phase: 4.4 }, rotation: 16.689 * D, tilt: 0, color: [0.42, 0.4, 0.37], info: 'Heavily cratered ice-rock moon.' },
  saturn: { id: 'saturn', name: 'Saturn', system: 'sol', kind: 'gas', radius: 5.8232e7, mu: 3.7931187e16, parent: 'sun', el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rates: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], rotation: 38362, tilt: 26.73 * deg, atmosphere: { height: 4e6, color: [0.9, 0.82, 0.62], density: 1 }, rings: { inner: 7.45e7, outer: 1.4022e8 }, color: [0.85, 0.78, 0.6], info: 'Gas giant with the brightest ring system. The anomaly co-orbits nearby.' },
  mimas: { id: 'mimas', name: 'Mimas', system: 'sol', kind: 'moon', radius: 1.982e5, mu: 2.503e9, parent: 'saturn', circ: { r: 1.8554e8, period: 0.942 * D, phase: 0.2 }, rotation: 0.942 * D, tilt: 0, color: [0.75, 0.75, 0.73], info: 'Small icy moon with a giant crater.' },
  enceladus: { id: 'enceladus', name: 'Enceladus', system: 'sol', kind: 'moon', radius: 2.521e5, mu: 7.211e9, parent: 'saturn', circ: { r: 2.3795e8, period: 1.37 * D, phase: 1.4 }, rotation: 1.37 * D, tilt: 0, color: [0.92, 0.93, 0.95], info: 'Bright icy moon with water plumes.' },
  dione: { id: 'dione', name: 'Dione', system: 'sol', kind: 'moon', radius: 5.614e5, mu: 7.311e10, parent: 'saturn', circ: { r: 3.774e8, period: 2.737 * D, phase: 2.6 }, rotation: 2.737 * D, tilt: 0, color: [0.8, 0.8, 0.78], info: 'Icy moon.' },
  rhea: { id: 'rhea', name: 'Rhea', system: 'sol', kind: 'moon', radius: 7.638e5, mu: 1.539e11, parent: 'saturn', circ: { r: 5.2704e8, period: 4.518 * D, phase: 3.7 }, rotation: 4.518 * D, tilt: 0, color: [0.78, 0.77, 0.75], info: 'Saturn’s second-largest moon.' },
  titan: { id: 'titan', name: 'Titan', system: 'sol', kind: 'moon', radius: 2.5747e6, mu: 8.978e12, parent: 'saturn', circ: { r: 1.22187e9, period: 15.945 * D, phase: 5.0 }, rotation: 15.945 * D, tilt: 0, atmosphere: { height: 600e3, color: [0.85, 0.6, 0.3], density: 1.5 }, color: [0.8, 0.6, 0.3], info: 'Thick orange nitrogen–methane atmosphere.' },
  iapetus: { id: 'iapetus', name: 'Iapetus', system: 'sol', kind: 'moon', radius: 7.345e5, mu: 1.205e11, parent: 'saturn', circ: { r: 3.56082e9, period: 79.32 * D, inc: 15.5 * deg, phase: 0.9 }, rotation: 79.32 * D, tilt: 0, color: [0.55, 0.5, 0.45], info: 'Two-toned moon.' },
  uranus: { id: 'uranus', name: 'Uranus', system: 'sol', kind: 'ice', radius: 2.5362e7, mu: 5.793939e15, parent: 'sun', el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], rates: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589], rotation: -62064, tilt: 97.77 * deg, atmosphere: { height: 2e6, color: [0.6, 0.85, 0.9], density: 1 }, color: [0.6, 0.82, 0.88], info: 'Ice giant tilted on its side.' },
  titania: { id: 'titania', name: 'Titania', system: 'sol', kind: 'moon', radius: 7.884e5, mu: 2.27e11, parent: 'uranus', circ: { r: 4.363e8, period: 8.706 * D, phase: 1.2 }, rotation: 8.706 * D, tilt: 0, color: [0.65, 0.62, 0.6], info: 'Largest moon of Uranus.' },
  neptune: { id: 'neptune', name: 'Neptune', system: 'sol', kind: 'ice', radius: 2.4622e7, mu: 6.836529e15, parent: 'sun', el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rates: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664], rotation: 57996, tilt: 28.32 * deg, atmosphere: { height: 2e6, color: [0.35, 0.5, 0.95], density: 1 }, color: [0.3, 0.45, 0.85], info: 'Windiest planet; deep blue ice giant.' },
  triton: { id: 'triton', name: 'Triton', system: 'sol', kind: 'moon', radius: 1.3534e6, mu: 1.428e12, parent: 'neptune', circ: { r: 3.5476e8, period: -5.877 * D, inc: 157 * deg, phase: 2.2 }, rotation: 5.877 * D, tilt: 0, color: [0.75, 0.72, 0.7], info: 'Retrograde captured moon with nitrogen geysers.' },
  wormhole: { id: 'wormhole', name: 'The Anomaly', system: 'sol', kind: 'wormhole', radius: 1000, mu: 5e9, parent: 'saturn', rotation: 0, tilt: 0, color: [0.8, 0.85, 1], info: 'A spherical gravitational lens ~2 km across, co-orbiting Saturn. Speculative physics: modelled as a traversable throat.' },
  // ------------------------------------------------------------------------------------------- Gargantua system (fictional)
  gargantua: { id: 'gargantua', name: 'Gargantua', system: 'gargantua', kind: 'blackhole', radius: 2.954e11, mu: 2.0e22, parent: null, rotation: 0, tilt: 0, color: [0, 0, 0], info: 'Supermassive rotating black hole, ~10⁸ solar masses, near-extremal spin (film parameters).' },
  wormhole_g: { id: 'wormhole_g', name: 'The Anomaly (exit)', system: 'gargantua', kind: 'wormhole', radius: 1000, mu: 5e9, parent: 'gargantua', circ: { r: 8.9e12, period: 0, phase: 2.6, inc: 0.05 }, rotation: 0, tilt: 0, color: [0.8, 0.85, 1], info: 'Exit throat of the wormhole.' },
  miller: { id: 'miller', name: 'Miller', system: 'gargantua', kind: 'ocean', radius: 7.2e6, mu: 6.61e14, parent: 'gargantua', circ: { r: 1.77e12, period: 0, phase: 0.4 }, rotation: 6.4e6, tilt: 0.02, atmosphere: { height: 110e3, color: [0.7, 0.75, 0.78], density: 1.2 }, surface: 'miller', color: [0.45, 0.52, 0.56], info: 'Shallow global ocean, 130 % Earth gravity. Tidally locked; colossal tidal waves. 1 hour ≈ 7 Earth years.' },
  mann: { id: 'mann', name: 'Mann', system: 'gargantua', kind: 'frozen', radius: 5.1e6, mu: 2.04e14, parent: 'gargantua', circ: { r: 6.5e12, period: 0, phase: 3.3 }, rotation: 97200, tilt: 0.3, atmosphere: { height: 80e3, color: [0.85, 0.88, 0.92], density: 0.9 }, surface: 'mann', color: [0.82, 0.84, 0.86], info: 'Frozen world with ammonia atmosphere and frozen clouds. 80 % Earth gravity.' },
  edmunds: { id: 'edmunds', name: 'Edmunds', system: 'gargantua', kind: 'desert', radius: 6.1e6, mu: 3.47e14, parent: 'gargantua', circ: { r: 1.18e13, period: 0, phase: 5.2 }, rotation: 79200, tilt: 0.38, atmosphere: { height: 100e3, color: [0.6, 0.75, 0.95], density: 1 }, surface: 'edmunds', color: [0.62, 0.5, 0.38], info: 'Rocky desert world, breathable traces, 95 % Earth gravity. Edmunds’ beacon went silent.' },
};

/**
 * Gargantua's orbital dynamics use a game-scale gravitational parameter (BODIES.gargantua.mu): the horizon radius
 * (and so the look) is that of a 10⁸ M☉ hole, but orbital speeds of 15–110 km/s keep transfers within the
 * Endurance's ~160 km/s. Periods follow from that μ so the ephemeris and the navigation agree.
 */
for (const id of ['miller', 'mann', 'edmunds', 'wormhole_g']) {
  const c = BODIES[id].circ!;
  c.period = 2 * Math.PI * Math.sqrt((c.r * c.r * c.r) / BODIES.gargantua.mu);
}
BODIES.miller.rotation = BODIES.miller.circ!.period;

/** Rotation locked to the parent (moons and Miller): the prime meridian faces the parent body. */
export function tidallyLocked(id: string) {
  const b = BODIES[id];
  return !!b?.circ && !!b.parent && b.parent !== 'sun' && (b.kind === 'moon' || id === 'miller');
}

/** The body at the centre of a star system (heliocentric frame origin). */
export function systemCentre(system: string) {
  return system === 'gargantua' ? 'gargantua' : 'sun';
}

export const SOL_PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
export const GARG_PLANETS = ['miller', 'mann', 'edmunds'];
export { AU };
