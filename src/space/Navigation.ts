import { BODIES, systemCentre } from '../data/bodies';
import { bodyState } from './ephemeris';
import { lambert, propagate, norm, sub, type V3 } from './kepler';
import { eclToThree } from '../render/SolarSystem';

/**
 * Endurance navigation: patched-conic transfer planning between Solar-System bodies.
 *   • planet ↔ planet: heliocentric Lambert arc (ephemeris positions), Δv = escape from the departure parking orbit
 *     to v∞ + capture from v∞ into the arrival parking orbit (Oberth-aware: √(v∞² + 2μ/r) − √(μ/r));
 *   • moon legs: the parent planet's transfer plus a local Hohmann between parking orbits;
 *   • same-planet moves (e.g. Saturn → Titan): local Hohmann inside the planet's sphere of influence.
 * Two profiles: 'efficient' (search departure dates over the next window, minimum Δv with a mild waiting penalty)
 * and 'fast' (leave soon, shortest flight within the Δv budget).
 */
const MU_SUN = BODIES.sun.mu;
const DAY = 86400;
const YEAR = 365.25 * DAY;

export interface TransferPlan {
  from: string;
  to: string;
  profile: 'efficient' | 'fast';
  tDep: number;
  tArr: number;
  dvDep: number;
  dvArr: number;
  dv: number;
  vinfDep: number;
  vinfArr: number;
  /** heliocentric departure state (three equatorial frame) of the cruise arc, or null for a local move */
  r0: V3 | null;
  v0: V3 | null;
  local: boolean;
  /** gravitational parameter of the cruise arc's central body (Sun or Gargantua) */
  mu?: number;
}

/** Destinations offered by the navigation computer (every landable moon included, in order out from its planet). */
export const DESTINATIONS = ['mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos', 'jupiter', 'io', 'europa', 'ganymede', 'callisto', 'saturn', 'mimas', 'enceladus', 'dione', 'rhea', 'titan', 'iapetus', 'wormhole', 'uranus', 'titania', 'neptune', 'triton'];
export const GARG_DESTINATIONS = ['wormhole_g', 'miller', 'mann', 'edmunds'];
export function destinations(system: string) {
  return system === 'gargantua' ? GARG_DESTINATIONS : DESTINATIONS;
}

/** Parking-orbit radius around a body (m): low for small worlds, outside rings/radiation-heavy zones for giants. */
export function parkRadius(id: string) {
  const b = BODIES[id];
  if (!b) return 7e6;
  switch (id) {
    case 'earth': return b.radius + 420e3;
    case 'mercury': return b.radius + 400e3;
    case 'venus': return b.radius + 450e3;
    case 'moon': return b.radius + 150e3;
    case 'mars': return b.radius + 400e3;
    case 'jupiter': return b.radius * 1.9;
    case 'saturn': return 1.9e8; // outside the F ring, with a view across the rings
    case 'uranus': return b.radius * 2.2;
    case 'neptune': return b.radius * 2.2;
    case 'titan': return b.radius + 1200e3; // above the haze
    case 'phobos': case 'deimos': return b.radius + 8e3;
    case 'miller': return b.radius + 500e3;
    case 'mann': return b.radius + 400e3;
    case 'edmunds': return b.radius + 420e3;
    default: return b.kind === 'moon' ? b.radius + Math.max(120e3, b.radius * 0.15) : b.radius * 1.5;
  }
}

/** The heliocentric "anchor" of a body (itself for planets, its parent for moons). */
export function planetOf(id: string) {
  const b = BODIES[id];
  if (!b) return id;
  if (id === 'wormhole') return 'saturn';
  return b.parent && b.parent !== 'sun' && b.parent !== 'gargantua' ? b.parent : id;
}

function vEsc(mu: number, r: number, vinf: number) {
  return Math.sqrt(vinf * vinf + (2 * mu) / r) - Math.sqrt(mu / r);
}

/** Local Hohmann Δv between a planet's parking orbit and a moon's orbit + capture at the moon. */
function moonLeg(planet: string, moon: string) {
  const p = BODIES[planet], m = BODIES[moon];
  if (!m?.circ) return { dv: 0, tof: 0 };
  const r1 = parkRadius(planet), r2 = m.circ.r;
  const a = (r1 + r2) / 2;
  const dv1 = Math.abs(Math.sqrt(p.mu / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1));
  const vArr = Math.sqrt(p.mu / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
  const dv2 = vEsc(m.mu, parkRadius(moon), Math.abs(vArr));
  return { dv: dv1 + dv2, tof: Math.PI * Math.sqrt((a * a * a) / p.mu) };
}

function helioEcl(id: string, t: number) {
  const s = bodyState(id, t);
  return { r: s.r as V3, v: s.v as V3 };
}

/** Plan a transfer from the body the Endurance is parked at to a destination. */
export function planTransfer(from: string, to: string, t0: number, profile: 'efficient' | 'fast', dvBudget = 60e3): TransferPlan | null {
  if (from === to) return null;
  const pa = planetOf(from), pb = planetOf(to);
  const prep = 1800; // engine start-up and alignment
  if (pa === pb) {
    // local move inside one planet's sphere of influence (planet ↔ moon, moon ↔ moon, the Anomaly near Saturn)
    const legA = from === pa ? { dv: 0, tof: 0 } : moonLeg(pa, from);
    const legB = to === pb ? { dv: 0, tof: 0 } : to === 'wormhole' ? { dv: 4500, tof: 3 * DAY } : moonLeg(pb, to);
    const dv = legA.dv + legB.dv;
    const tof = Math.max(6 * 3600, legA.tof + legB.tof);
    return { from, to, profile, tDep: t0 + prep, tArr: t0 + prep + tof, dvDep: legA.dv, dvArr: legB.dv, dv, vinfDep: 0, vinfArr: 0, r0: null, v0: null, local: true };
  }
  const A = BODIES[pa], B = BODIES[pb];
  if (A.system !== B.system) return null; // the wormhole joins the systems: no conic between them
  const MU_SUN = BODIES[systemCentre(A.system)].mu;
  const aA = A.el ? A.el[0] * 1.495978707e11 : A.circ!.r, aB = B.el ? B.el[0] * 1.495978707e11 : B.circ!.r;
  const tH = Math.PI * Math.sqrt(Math.pow((aA + aB) / 2, 3) / MU_SUN);
  const synodic = Math.abs(1 / (1 / Math.sqrt(aA ** 3 / MU_SUN) - 1 / Math.sqrt(aB ** 3 / MU_SUN))) * 2 * Math.PI;
  const window = profile === 'efficient' ? Math.min(synodic * 1.05, 3 * YEAR) : A.system === 'gargantua' ? 120 * DAY : 45 * DAY;
  const tofs: number[] = [];
  if (profile === 'efficient') for (let k = 0.55; k <= 1.45; k += 0.05) tofs.push(tH * k);
  else for (let k = 0.12; k <= 1.0; k += 0.02) tofs.push(tH * k);
  const nDep = profile === 'efficient' ? 60 : 10;
  let best: TransferPlan | null = null;
  let bestCost = Infinity;
  const extraA = from === pa ? 0 : moonLeg(pa, from).dv;
  const extraB = to === pb ? 0 : to === 'wormhole' ? 4500 : moonLeg(pb, to).dv;
  for (let i = 0; i < nDep; i++) {
    const tDep = t0 + prep + (window * i) / nDep;
    const sa = helioEcl(pa, tDep);
    for (const tof of tofs) {
      const sb = helioEcl(pb, tDep + tof);
      const sol = lambert(sa.r, sb.r, tof, MU_SUN, true);
      if (!sol) continue;
      const vinfA = norm(sub(sol.v1, sa.v)), vinfB = norm(sub(sol.v2, sb.v));
      if (!isFinite(vinfA) || !isFinite(vinfB)) continue;
      const dvDep = vEsc(A.mu, parkRadius(pa), vinfA) + extraA;
      const dvArr = vEsc(B.mu, parkRadius(pb), vinfB) + extraB;
      const dv = dvDep + dvArr;
      if (profile === 'fast' && dv > dvBudget) continue;
      const cost = profile === 'efficient' ? dv + ((tDep - t0) / (30 * DAY)) * 40 + (tof / YEAR) * 150 : tof / DAY + (tDep - t0) / DAY + dv / 2000;
      if (cost < bestCost) {
        bestCost = cost;
        best = { from, to, profile, tDep, tArr: tDep + tof, dvDep, dvArr, dv, vinfDep: vinfA, vinfArr: vinfB, r0: eclToThree(sa.r), v0: eclToThree(sol.v1), local: false, mu: MU_SUN };
      }
    }
  }
  return best;
}

/** Heliocentric cruise state (three frame) of a planned transfer at time t. */
export function cruiseState(plan: TransferPlan, t: number): { r: V3; v: V3 } {
  return propagate(plan.r0!, plan.v0!, plan.mu ?? MU_SUN, Math.max(0, Math.min(t, plan.tArr) - plan.tDep));
}

export function fmtDuration(s: number) {
  const d = s / DAY;
  if (d >= 365) return `${(d / 365.25).toFixed(2)} years`;
  if (d >= 2) return `${d.toFixed(0)} days`;
  return `${(s / 3600).toFixed(1)} hours`;
}
