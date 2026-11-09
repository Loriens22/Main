import { BODIES, type BodyDef } from '../data/bodies';
import { eccentricAnomaly, add, sub, scale, norm, cross, unit, soi as soiRadius, type V3 } from './kepler';

const AU = 1.495978707e11;
const CENTURY = 36525 * 86400;
const deg = Math.PI / 180;

export interface State {
  r: V3;
  v: V3;
}

const cache = new Map<string, { t: number; s: State }>();

/** Position/velocity of a body in its system frame (Sun-centred ecliptic or Gargantua-centred), metres & m/s. */
export function bodyState(id: string, t: number): State {
  const c = cache.get(id);
  if (c && c.t === t) return c.s;
  const b = BODIES[id];
  let s: State;
  if (!b || !b.parent) s = { r: [0, 0, 0], v: [0, 0, 0] };
  else if (b.el && b.rates) s = jplState(b, t);
  else if (id === 'wormhole') s = wormholeState(t);
  else if (b.circ) {
    const p = bodyState(b.parent, t);
    const rel = circState(b, t);
    s = { r: add(p.r, rel.r), v: add(p.v, rel.v) };
  } else s = { r: [0, 0, 0], v: [0, 0, 0] };
  cache.set(id, { t, s });
  return s;
}

function jplState(b: BodyDef, t: number): State {
  const T = t / CENTURY;
  const e0 = b.el!, r0 = b.rates!;
  const a = (e0[0] + r0[0] * T) * AU;
  const e = e0[1] + r0[1] * T;
  const I = (e0[2] + r0[2] * T) * deg;
  const L = (e0[3] + r0[3] * T) * deg;
  const varpi = (e0[4] + r0[4] * T) * deg;
  const Om = (e0[5] + r0[5] * T) * deg;
  const w = varpi - Om;
  let M = L - varpi;
  M = ((M % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  const E = eccentricAnomaly(M, e);
  const mu = BODIES.sun.mu;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const n = Math.sqrt(mu / (a * a * a));
  const Edot = n / (1 - e * Math.cos(E));
  const vxp = -a * Math.sin(E) * Edot;
  const vyp = a * Math.sqrt(1 - e * e) * Math.cos(E) * Edot;
  const rot = (x: number, y: number): V3 => {
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
    return [
      (cw * cO - sw * sO * cI) * x + (-sw * cO - cw * sO * cI) * y,
      (cw * sO + sw * cO * cI) * x + (-sw * sO + cw * cO * cI) * y,
      sw * sI * x + cw * sI * y,
    ];
  };
  return { r: rot(xp, yp), v: rot(vxp, vyp) };
}

function circState(b: BodyDef, t: number): State {
  const c = b.circ!;
  const w = (2 * Math.PI) / c.period;
  const a = (c.phase ?? 0) + w * t;
  const inc = c.inc ?? 0;
  const R = c.r;
  const x = Math.cos(a) * R, y = Math.sin(a) * R;
  const vx = -Math.sin(a) * R * w, vy = Math.cos(a) * R * w;
  const ci = Math.cos(inc), si = Math.sin(inc);
  return { r: [x, y * ci, y * si], v: [vx, vy * ci, vy * si] };
}

/** The anomaly trails Saturn along its orbit by ~2.1 million km, slightly north of the ecliptic. */
function wormholeState(t: number): State {
  const s = bodyState('saturn', t);
  const u = unit(s.v);
  const r = add(sub(s.r, scale(u, 2.1e9)), [0, 0, 1.5e8]);
  return { r, v: s.v };
}

const soiCache = new Map<string, number>();
export function soiOf(id: string): number {
  const c = soiCache.get(id);
  if (c !== undefined) return c;
  const b = BODIES[id];
  let r = Infinity;
  if (b?.parent) {
    const p = BODIES[b.parent];
    const a = b.el ? b.el[0] * AU : b.circ ? b.circ.r : 1e9;
    if (b.kind === 'wormhole') r = 2e6;
    else if (b.system === 'gargantua' && b.parent === 'gargantua') r = Math.max(b.radius * 40, 3e8); // game-scale SOI near the black hole
    else r = soiRadius(a, b.mu, p.mu);
  }
  soiCache.set(id, r);
  return r;
}

/** Dominant gravitating body for a system-frame position (deepest SOI that contains the point). */
export function dominantBody(system: 'sol' | 'gargantua', r: V3, t: number): string {
  let best = system === 'sol' ? 'sun' : 'gargantua';
  let bestSoi = Infinity;
  for (const b of Object.values(BODIES)) {
    if (b.system !== system || !b.parent || b.kind === 'wormhole') continue;
    const s = soiOf(b.id);
    if (s >= bestSoi) continue;
    const p = bodyState(b.id, t);
    if (norm(sub(r, p.r)) < s) {
      best = b.id;
      bestSoi = s;
    }
  }
  return best;
}

export function bodiesOf(system: 'sol' | 'gargantua') {
  return Object.values(BODIES).filter((b) => b.system === system);
}

/** Local up/east/north basis at a planet-fixed site (for surface ↔ orbit handover). */
export function siteBasis(lat: number, lon: number): { up: V3; east: V3; north: V3 } {
  const up: V3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const east = unit(cross([0, 0, 1], up));
  const north = cross(up, east);
  return { up, east, north };
}

export function clearEphemerisCache() {
  cache.clear();
}
