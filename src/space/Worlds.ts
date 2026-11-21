import { AU, BODY, BodyDef, SystemId, R_G } from './Bodies';
import type { V3 } from './Kepler';
import { state } from './Ephemeris';
import { AtmosphereParams, EARTH_ATMOSPHERE } from '../render/Sky';

/** Sunlight at a body relative to the Sun's at 1 au (the Gargantua system: light from the accretion disk). */
export function irradianceAt(id: string, jd: number) {
  const b = BODY[id];
  if (b.system === 'gargantua') return b.insolation ?? 0.5;
  const r = state(id, jd).r;
  return (AU / Math.hypot(r[0], r[1], r[2])) ** 2;
}

/** Apparent angular radius of the light source seen from a body (rad); 0 where it is not a star. */
export function sunAngularRadius(id: string, jd: number) {
  const b = BODY[id];
  if (b.system !== 'sol') return 0;
  const r = state(id, jd).r;
  return BODY.sun.R / Math.hypot(r[0], r[1], r[2]);
}

/** The eye's adaptation to the light level: keeps a sunlit scene readable from Mercury to Neptune. */
export function exposureFor(irr: number, base = 0.95) {
  return base * Math.min(150, Math.pow(1 / Math.max(irr, 1e-4), 0.85));
}

/** Sky-model parameters for a body (vacuum for airless ones). */
export function atmosphereFor(b: BodyDef, jd: number, opts: { clouds?: boolean } = {}): AtmosphereParams {
  const irr = irradianceAt(b.id, jd);
  const sunR = sunAngularRadius(b.id, jd);
  const a = b.atmosphere;
  // beyond the wormhole the light comes from Gargantua's disk, which has its own renderer: no sun disc
  const disc = b.system === 'sol' ? Math.max(sunR, 0.0006) : 1e-5;
  if (!a) {
    return {
      ...EARTH_ATMOSPHERE, planetRadius: b.R, atmosphereHeight: 1000, betaR: [0, 0, 0], betaM: 0, betaD: [0, 0, 0], betaDAbs: [0, 0, 0],
      HR: 8000, HM: 1200, HD: 1000, sunE: 20 * irr, ambient: [0.05, 0.05, 0.05], cloudCoverage: 0, cirrus: 0, sunRadius: disc, fogDensity: 0, fogFalloff: 0.001,
    };
  }
  return {
    ...EARTH_ATMOSPHERE,
    planetRadius: b.R, atmosphereHeight: Math.min(a.top, 12 * a.HR),
    betaR: a.betaR, betaM: a.betaM, betaD: a.betaD ?? [0, 0, 0], betaDAbs: a.betaDAbs ?? [0, 0, 0],
    HR: a.HR, HM: a.HM, HD: a.HD ?? 2000, g: a.g, sunE: 20 * irr,
    sunTint: b.system === 'gargantua' ? [1.0, 0.93, 0.82] : EARTH_ATMOSPHERE.sunTint,
    cloudCoverage: opts.clouds ? EARTH_ATMOSPHERE.cloudCoverage : 0, cirrus: opts.clouds ? 0.4 : 0,
    sunRadius: disc,
  };
}

/**
 * Where the light comes from, for an observer at pos (system frame): the Sun at the origin; in the Gargantua
 * system the brightest part of the accretion disk as seen from there, the inner disk on the side whose gas moves
 * toward the observer (Doppler beaming), at ~4 M from the hole. Returns the vector from pos to the source.
 */
export function toLight(pos: V3, system: SystemId | string): V3 {
  if (system !== 'gargantua') return [-pos[0], -pos[1], -pos[2]];
  const phc = Math.atan2(pos[1], pos[0]);
  const psi = phc - Math.PI / 2;
  const src: V3 = [4 * R_G * Math.cos(psi), 4 * R_G * Math.sin(psi), 0];
  return [src[0] - pos[0], src[1] - pos[1], src[2] - pos[2]];
}
