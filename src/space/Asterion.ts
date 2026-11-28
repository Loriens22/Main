/**
 * The ASTERION BINARY SYSTEM (game fiction, Part 2 directive): two red dwarfs 4.24 light-years from the Sun and
 * exactly four planets on circumbinary orbits. Names and values are fictional but kept physically consistent (the
 * habitable zone follows the pair's combined luminosity; surface gravity follows mass and radius). One data file:
 * nothing about these worlds is improvised elsewhere.
 */
export const LY = 9.4607304725808e15;
export const AU_M = 1.495978707e11;
export const G_EARTH = 9.80665;

export interface StarDef { id: string; name: string; spectral: string; mass: number; radius: number; teff: number; lum: number; color: string }
export interface PlanetDef {
  id: string; name: string; index: number;
  /** semi-major axis (AU, round the pair's barycentre), orbital period (days) */
  a: number; period: number;
  /** radius and mass relative to the Earth; surface gravity (m/s^2) */
  radius: number; mass: number; gravity: number;
  atmosphere: string; pressure: number; temp: [number, number];
  fauna: boolean; faunaNote: string;
  look: string; poi: string[]; landing: string[];
}

export const ASTERION = {
  name: 'ASTERION BINARY SYSTEM',
  distanceLy: 4.24,
  /** direction from the Sun (J2000 equatorial, deg): a fictional placement in the southern sky */
  ra: 219.9, dec: -60.8,
  binary: { separationAu: 0.052, periodDays: 5.9 },
  stars: [
    { id: 'asterionA', name: 'Asterion A', spectral: 'M3.5 V', mass: 0.31, radius: 0.30, teff: 3350, lum: 0.0110, color: '#ffb27a' },
    { id: 'asterionB', name: 'Asterion B', spectral: 'M5 V', mass: 0.17, radius: 0.19, teff: 3050, lum: 0.0035, color: '#ff8e5c' },
  ] as StarDef[],
  planets: [
    {
      id: 'lyravia', name: 'Lyravia', index: 1, a: 0.118, period: 21.3, radius: 1.08, mass: 1.12, gravity: 9.42,
      atmosphere: 'N₂ 77 % · O₂ 19 % · Ar · CO₂ 0.06 %', pressure: 1.1, temp: [-5, 31],
      fauna: true, faunaNote: 'Six native animal species confirmed',
      look: 'Iridescent ringed world: pink and teal forests, floating-island uplands, shallow rainbow-tinted lakes',
      poi: ['Floating-island uplands', 'Pink-forest lowlands', 'Rainbow shallows', 'Crystal monolith fields'],
      landing: ['Meadow Basin (LZ-1)', 'Teal Forest Edge (LZ-2)'],
    },
    {
      id: 'cindervale', name: 'Cindervale', index: 2, a: 0.072, period: 10.2, radius: 0.94, mass: 0.83, gravity: 9.21,
      atmosphere: 'CO₂ 68 % · N₂ 29 % · SO₂ haze (photochemical smog)', pressure: 0.45, temp: [40, 160],
      fauna: false, faunaNote: 'No fauna (none in this survey phase)',
      look: 'Dark blue world: reflective volcanic-mineral flats, brine pools, jagged spires, a red-lit horizon',
      poi: ['Mirror flats (mineral brines — too hot for liquid water)', 'Spire fields', 'Fumarole valleys'],
      landing: ['Spire Flats (LZ-1)'],
    },
    {
      id: 'verdantis', name: 'Verdantis', index: 3, a: 0.155, period: 32.0, radius: 1.21, mass: 1.6, gravity: 10.72,
      atmosphere: 'N₂ 71 % · CO₂ 4 % · O₂ 22 % · H₂O (humid)', pressure: 2.3, temp: [18, 42],
      fauna: false, faunaNote: 'No fauna (plants only)',
      look: 'Teal and green humid world: mist, marshes, bioluminescent vegetation, immense silent fronds',
      poi: ['Glow marshes', 'Frond canopy', 'Spine-forest ridges'],
      landing: ['Mist Delta (LZ-1)'],
    },
    {
      id: 'nivalith', name: 'Nivalith', index: 4, a: 0.26, period: 69.7, radius: 0.86, mass: 0.62, gravity: 8.22,
      atmosphere: 'N₂ 88 % · Ar 9 % · CH₄ traces (thin)', pressure: 0.08, temp: [-160, -70],
      fauna: false, faunaNote: 'No fauna',
      look: 'Violet-white glacial silica world: glass ridges, salt plains, obsidian canyons, blue-green polar auroras',
      poi: ['Glass ridges', 'Salt mirrors', 'Obsidian canyons', 'Polar aurora field'],
      landing: ['Glass Ridge Plain (LZ-1)'],
    },
  ] as PlanetDef[],
};

/** combined luminosity (Suns) and the habitable zone (AU) of the pair */
export function asterionHZ() {
  const L = ASTERION.stars.reduce((s, x) => s + x.lum, 0);
  return { lum: L, inner: Math.sqrt(L / 1.1), outer: Math.sqrt(L / 0.53) };
}
