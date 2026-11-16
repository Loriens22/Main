/*
 * Gravitational time dilation for the Gargantua system.
 *
 * For a prograde circular equatorial orbit around a Kerr black hole (G = c = 1, r in units of M, spin a in M):
 *
 *   dt/dtau = (r^1.5 + a) / ( r^0.75 * sqrt( r^1.5 - 3 r^0.5 + 2 a ) )
 *
 * Near the horizon of a near-extremal hole the term under the root is the difference of nearly equal numbers;
 * with s = sqrt(r) it factors exactly as  s^3 - 3 s + 2a = (s - 1)^2 (s + 2) - 2 (1 - a),  which keeps the
 * computation accurate in double precision. Gargantua spins at a = 1 - 1e-14 (the film's value); Miller's planet
 * sits where one hour on it is seven years outside (factor ~61 320).
 */

export const GARGANTUA_SPIN_EPS = 1e-14;

/** dt/dtau (coordinate time per proper time) for a circular prograde orbit at r (units of M). */
export function kerrCircularDilation(r: number, eps = GARGANTUA_SPIN_EPS) {
  const a = 1 - eps, s = Math.sqrt(r);
  const under = (s - 1) * (s - 1) * (s + 2) - 2 * eps;
  if (under <= 0) return Infinity;
  return (r * s + a) / (Math.pow(r, 0.75) * Math.sqrt(under));
}

/** Radius (units of M) of the prograde circular orbit with a given dilation factor (bisection, near the horizon). */
export function radiusForDilation(factor: number, eps = GARGANTUA_SPIN_EPS) {
  let lo = 1 + 1e-9, hi = 50;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (kerrCircularDilation(mid, eps) > factor) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** One hour on Miller's planet = seven years (365.25 d) outside. */
export const MILLER_DILATION = (7 * 365.25 * 24) / 1;

/** Miller's orbit radius in units of M (about 1 + 4e-5: deep in the near-horizon throat). */
export const MILLER_R = radiusForDilation(MILLER_DILATION);

/**
 * Dilation (coordinate seconds per local second) at a place in the Gargantua system.
 * Places far out use the weak-field circular-orbit value 1/sqrt(1 - 3/r). Navigation distances are given in
 * gravitational radii; Miller's planet and anything orbiting close to it take the near-horizon Kerr value.
 */
export function dilationAt(place: 'earth' | 'miller' | { rOverM: number }) {
  if (place === 'earth') return 1;
  if (place === 'miller') return kerrCircularDilation(MILLER_R);
  const r = place.rOverM;
  if (r < 6) return kerrCircularDilation(Math.max(r, MILLER_R));
  return 1 / Math.sqrt(1 - 3 / r);
}
