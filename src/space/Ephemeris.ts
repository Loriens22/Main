import { AU, BODY, BodyDef, DAY } from './Bodies';
import { add, cross, elementsToState, norm, scale, unit, V3 } from './Kepler';

/*
 * Where everything is. Frames: the Solar System uses heliocentric ecliptic J2000 coordinates (x toward the
 * vernal equinox, z to the north ecliptic pole), metres. The Gargantua system uses Gargantua-centred coordinates
 * with the accretion disk in the xy plane. Time is a Julian date (TDB ~ UTC at this precision).
 */

export const J2000 = 2451545.0;
const D2R = Math.PI / 180;
const OBL = 23.4392911 * D2R;

/** Julian date of a calendar date (Gregorian), hours UTC. */
export function julianDate(y: number, m: number, d: number, h = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5 + h / 24;
}

/** Calendar date of a Julian date. */
export function calendarDate(jd: number) {
  const Z = Math.floor(jd + 0.5), F = jd + 0.5 - Z;
  const alpha = Math.floor((Z - 1867216.25) / 36524.25);
  const A = Z + 1 + alpha - Math.floor(alpha / 4);
  const B = A + 1524, C = Math.floor((B - 122.1) / 365.25), D = Math.floor(365.25 * C), E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + F;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const d = Math.floor(day), hours = (day - d) * 24;
  return { year, month, day: d, hours };
}

/** The mission calendar: lift-off from the concealed site, 15 July 2067, 21:18 UTC (15:18 local). */
export const LAUNCH_JD = julianDate(2067, 7, 15, 21.3);

/** Equatorial J2000 unit vector (RA, Dec in degrees) in ecliptic coordinates. */
export function eqToEcl(ra: number, dec: number): V3 {
  const a = ra * D2R, d = dec * D2R;
  const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  return [x, y * Math.cos(OBL) + z * Math.sin(OBL), -y * Math.sin(OBL) + z * Math.cos(OBL)];
}

const poleCache = new Map<string, V3>();
/** North pole of a body (unit, in its system frame). */
export function pole(id: string): V3 {
  let p = poleCache.get(id);
  if (!p) {
    const b = BODY[id];
    p = b.system === 'gargantua' ? [0, 0, 1] : eqToEcl(b.pole[0], b.pole[1]);
    poleCache.set(id, p);
  }
  return p;
}

/** Equator basis of a body: e1 toward the ascending node of the equator on the reference plane, e2 = pole x e1. */
export function equatorBasis(id: string): { e1: V3; e2: V3; n: V3 } {
  const n = pole(id);
  let e1 = cross([0, 0, 1], n);
  if (norm(e1) < 1e-9) e1 = [1, 0, 0];
  e1 = unit(e1);
  return { e1, e2: cross(n, e1), n };
}

function jplState(b: BodyDef, jd: number): { r: V3; v: V3 } {
  const T = (jd - J2000) / 36525, j = b.jpl!;
  const a = (j.a[0] + j.a[1] * T) * AU, e = j.e[0] + j.e[1] * T, I = (j.I[0] + j.I[1] * T) * D2R;
  const L = (j.L[0] + j.L[1] * T) * D2R, w = (j.w[0] + j.w[1] * T) * D2R, O = (j.O[0] + j.O[1] * T) * D2R;
  return elementsToState({ a, e, i: I, node: O, peri: w - O, M: L - w }, BODY.sun.GM + b.GM);
}

function circularState(b: BodyDef, jd: number): { r: V3; v: V3 } {
  const o = b.orbit!;
  if (!o.period) return { r: [o.a, 0, 0], v: [0, 0, 0] };
  const t = (jd - J2000) * DAY;
  const th = ((o.phase ?? 0) * D2R) + (2 * Math.PI * t) / o.period;
  // reference plane: the parent's equator (the Moon: the ecliptic), tilted by the orbit's own inclination
  const P = b.parent!;
  const base = b.id === 'moon' || BODY[P].kind === 'blackhole' ? { e1: [1, 0, 0] as V3, e2: [0, 1, 0] as V3, n: [0, 0, 1] as V3 } : equatorBasis(P);
  const inc = (o.inc ?? 0) * D2R, node = (o.node ?? 0) * D2R;
  // node line in the reference plane, then the inclined orbit plane
  const nl = add(scale(base.e1, Math.cos(node)), scale(base.e2, Math.sin(node)));
  const np = cross(base.n, nl);
  const q = add(scale(np, Math.cos(inc)), scale(base.n, Math.sin(inc)));
  const c = Math.cos(th), s = Math.sin(th);
  const r = add(scale(nl, o.a * c), scale(q, o.a * s));
  const wv = (2 * Math.PI) / o.period;
  const v = add(scale(nl, -o.a * s * wv), scale(q, o.a * c * wv));
  return { r, v };
}

/** State of a body relative to its parent. */
export function localState(id: string, jd: number): { r: V3; v: V3 } {
  const b = BODY[id];
  if (b.jpl) return jplState(b, jd);
  if (b.orbit) return circularState(b, jd);
  return { r: [0, 0, 0], v: [0, 0, 0] };
}

/** State of a body in its system frame (heliocentric ecliptic, or Gargantua-centred). */
export function state(id: string, jd: number): { r: V3; v: V3 } {
  const b = BODY[id];
  const s = localState(id, jd);
  // the system's root (Sun, Gargantua) sits at the origin
  if (!b.parent || !BODY[b.parent].parent) return s;
  const p = state(b.parent, jd);
  return { r: add(p.r, s.r), v: add(p.v, s.v) };
}

export const position = (id: string, jd: number) => state(id, jd).r;

/** Prime-meridian angle (rad) at a date. */
export function rotationAngle(id: string, jd: number) {
  const b = BODY[id];
  if (!b.rotation) return 0;
  const t = (jd - J2000) * DAY;
  return ((b.W0 ?? 0) * D2R) + (2 * Math.PI * t) / b.rotation;
}

/**
 * Body-fixed axes in the system frame: x toward the prime meridian on the equator, y = z x x (90 deg east),
 * z the north pole. Tidally locked moons keep their prime meridian facing the parent.
 */
export function bodyAxes(id: string, jd: number): { x: V3; y: V3; z: V3 } {
  const { e1, e2, n } = equatorBasis(id);
  const b = BODY[id];
  let W = rotationAngle(id, jd);
  if (b.orbit && b.parent && b.orbit.period && Math.abs(b.rotation - b.orbit.period) < 1) {
    // synchronous: sub-parent point at longitude 0
    const toParent = scale(localState(id, jd).r, -1);
    W = Math.atan2(dotp(toParent, e2), dotp(toParent, e1));
  }
  const c = Math.cos(W), s = Math.sin(W);
  const x = add(scale(e1, c), scale(e2, s));
  return { x, y: cross(n, x), z: n };
}
const dotp = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Position of a surface point (geographic lat/lon in degrees, east-positive) relative to the body centre. */
export function surfacePoint(id: string, lat: number, lon: number, jd: number, h = 0): V3 {
  const ax = bodyAxes(id, jd), R = BODY[id].R + h;
  const la = lat * D2R, lo = lon * D2R;
  return add(add(scale(ax.x, R * Math.cos(la) * Math.cos(lo)), scale(ax.y, R * Math.cos(la) * Math.sin(lo))), scale(ax.z, R * Math.sin(la)));
}
