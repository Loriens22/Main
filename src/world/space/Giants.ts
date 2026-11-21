import type { AtmosphereParams } from '../../render/Sky';

/*
 * Inside the giant planets, at the stations' 1-bar level. What is around a station:
 *
 *   Jupiter  ammonia-ice cloud a few km above 1 bar (broken here), the ammonium-hydrosulphide deck ~25 km below
 *            (tan zones and brown belts, gaps showing the deep air), water clouds and lightning deeper still.
 *   Saturn   the same layers spread over ~2x the height (lower gravity, colder): a pale yellow world, more haze.
 *   Uranus   methane ice cloud above, a hydrogen-sulphide deck below; methane absorbs red: cyan light.
 *   Neptune  bright methane cirrus streaks high up, a deeper blue (more methane, less haze).
 *
 * Sky scattering: Rayleigh of H2/He scaled from Earth's by the number density at 1 bar (P/kT) and the lower
 * polarisability of H2 (~0.23 of N2/O2), photochemical haze (Jupiter, Saturn), methane absorption (Uranus, Neptune).
 * Cloud altitudes after the equilibrium cloud models (Weidenschilling & Lewis, Atreya); colours are artistic but
 * follow the planets' true colour images.
 */

export interface GiantLook {
  sky: Partial<AtmosphereParams>;
  /** how often lightning flashes in the deck (per second) */
  lightning: number;
  /** drift of the clouds relative to the station (m/s) */
  wind: [number, number];
  /** sky tint for the cloud decks, for the creatures' fog */
  name: string;
}

export const GIANT: Record<string, GiantLook> = {
  jupiter: {
    name: 'Jupiter',
    lightning: 0.12,
    wind: [4, 1.5],
    sky: {
      betaR: [2.3e-6, 5.5e-6, 13.4e-6], HR: 27000, betaM: 1.6e-5, HM: 18000, g: 0.72,
      betaD: [1.1e-5, 0.95e-5, 0.6e-5], betaDAbs: [0.25e-5, 0.7e-5, 1.8e-5], HD: 30000,
      sunTint: [1.0, 0.95, 0.86], ambient: [1.0, 0.9, 0.75], fogDensity: 1.2e-5, fogFalloff: 0.00004,
      giant: { floor: -25000, ceil: 9000, cover: 0.5, zone: [0.92, 0.83, 0.68], belt: [0.4, 0.23, 0.12], upper: [0.97, 0.94, 0.88], deep: [0.06, 0.035, 0.02], haze: [0.66, 0.55, 0.42], hazeL: 220000, scale: 1 },
    },
  },
  saturn: {
    name: 'Saturn',
    lightning: 0.04,
    wind: [5, 1],
    sky: {
      betaR: [2.9e-6, 6.8e-6, 16.6e-6], HR: 51500, betaM: 1.2e-5, HM: 40000, g: 0.72,
      betaD: [1.4e-5, 1.25e-5, 0.75e-5], betaDAbs: [0.2e-5, 0.5e-5, 1.4e-5], HD: 60000,
      sunTint: [1.0, 0.96, 0.85], ambient: [1.0, 0.93, 0.75], fogDensity: 1.0e-5, fogFalloff: 0.00003,
      giant: { floor: -40000, ceil: 18000, cover: 0.42, zone: [0.9, 0.82, 0.62], belt: [0.72, 0.6, 0.4], upper: [0.98, 0.94, 0.82], deep: [0.12, 0.1, 0.06], haze: [0.86, 0.77, 0.56], hazeL: 160000, scale: 1.6 },
    },
  },
  uranus: {
    name: 'Uranus',
    lightning: 0.01,
    wind: [3, 2],
    sky: {
      betaR: [5.0e-6, 11.7e-6, 28.8e-6], HR: 27500, betaM: 0.6e-5, HM: 25000, g: 0.75,
      betaD: [0.25e-5, 0.25e-5, 0.25e-5], betaDAbs: [3.5e-6, 0.6e-6, 0.1e-6], HD: 30000,
      sunTint: [0.9, 1.0, 1.0], ambient: [0.75, 0.95, 1.0], fogDensity: 1.0e-5, fogFalloff: 0.00004,
      giant: { floor: -30000, ceil: 14000, cover: 0.35, zone: [0.78, 0.9, 0.92], belt: [0.52, 0.74, 0.8], upper: [0.92, 0.97, 0.98], deep: [0.04, 0.11, 0.14], haze: [0.6, 0.82, 0.86], hazeL: 140000, scale: 1.3 },
    },
  },
  neptune: {
    name: 'Neptune',
    lightning: 0.01,
    wind: [6, 1],
    sky: {
      betaR: [4.6e-6, 10.8e-6, 26.5e-6], HR: 20600, betaM: 0.5e-5, HM: 20000, g: 0.75,
      betaD: [0.15e-5, 0.15e-5, 0.15e-5], betaDAbs: [5.0e-6, 1.0e-6, 0.15e-6], HD: 25000,
      sunTint: [0.85, 0.95, 1.0], ambient: [0.6, 0.8, 1.0], fogDensity: 1.0e-5, fogFalloff: 0.00004,
      giant: { floor: -25000, ceil: 11000, cover: 0.28, zone: [0.62, 0.75, 0.98], belt: [0.34, 0.5, 0.86], upper: [0.95, 0.97, 1.0], deep: [0.03, 0.05, 0.17], haze: [0.42, 0.58, 0.95], hazeL: 120000, scale: 1.1 },
    },
  },
};
