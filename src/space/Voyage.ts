import { AU, BODY, BodyDef, DAY, GM_GARGANTUA, parkAlt, R_G, soiRadius } from './Bodies';
import { state } from './Ephemeris';
import { add, dot, lambert, norm, propagate, scale, sub, unit, V3 } from './Kepler';

/*
 * Voyage planning. Transfers between planets are Lambert arcs about the Sun from the departure planet's position
 * now to the target's position on arrival; the cost is the burn from the Endurance's parking orbit onto the
 * departure hyperbola and the capture burn into the target's parking orbit (both with the Oberth gain of burning
 * deep in the gravity well). Transfers between moons of one planet use the same method about that planet.
 *
 * Beyond the wormhole the navigation is the film's: slingshots round Gargantua. A Newtonian orbit near a 1e8
 * solar-mass hole runs at a third of light speed, so a literal two-body cost would be meaningless; the game uses
 * Kepler times for the legs and a fixed, documented slingshot cost instead.
 */

export const ENDURANCE_DV = 60000;            // m/s of manoeuvre capability (fusion-assisted drive, fiction)
export const SLINGSHOT_DV = 1800;             // m/s per leg in the Gargantua system (fiction, see header)

export interface TransferPlan {
  from: string;
  to: string;
  /** body the arc is computed about */
  center: string;
  jdDepart: number;
  /** time of flight (s) */
  tof: number;
  /** state just after the departure burn relative to `center`, in the system frame */
  r1: V3;
  v1: V3;
  dvDepart: number;
  dvArrive: number;
  vInfDepart: number;
  vInfArrive: number;
  kind: 'economy' | 'fast' | 'direct' | 'slingshot';
  label: string;
  /** departure and arrival legs about the end bodies (set when the burn is scheduled, see finalizeDeparture) */
  dep?: Conic;
  arr?: Conic;
  /** residual offsets faded in over the first / last few per cent of the leg where no local conic is used */
  depOff?: V3;
  arrOff?: V3;
  /** seconds from scheduling to the departure burn (waiting for the right point of the parking orbit) */
  wait?: number;
  /** in-plane angle of the parking orbit the ship is captured into */
  arrPhase?: number;
}

/**
 * A leg about one of the end bodies: the ship's state relative to it at voyage time tp, in the system frame.
 * For a body with gravity it is a Kepler conic (the escape or capture hyperbola, periapsis at tp). For one without
 * (the wormhole) it is a straight line with a burn of BURN_S seconds at the end that starts or stops the ship.
 */
export interface Conic { body: string; tp: number; r: V3; v: V3; kind: 'dep' | 'arr' }
export interface ParkState { r: V3; v: V3 }
const BURN_S = 900;

/** The body whose sphere of influence frames a transfer between two bodies. */
function centerOf(a: BodyDef, b: BodyDef): string {
  if (a.system === 'gargantua' || b.system === 'gargantua') return 'gargantua';
  if (a.parent && a.parent === b.parent) return a.parent;
  if (a.parent === b.id) return b.id;                     // moon -> its planet
  if (b.parent === a.id) return a.id;                     // planet -> its moon
  return 'sun';
}

/** The ancestor of a body that orbits the centre directly (a planet for a moon when the centre is the Sun). */
function legBody(id: string, center: string): string {
  let b = BODY[id];
  while (b.parent && b.parent !== center && BODY[b.parent].parent) b = BODY[b.parent];
  return b.id;
}

/** Burn from a circular parking orbit (radius rp, body GM mu) onto a hyperbola with excess speed vinf. */
export function oberth(vinf: number, mu: number, rp: number) {
  if (mu <= 0) return vinf;
  return Math.sqrt(vinf * vinf + (2 * mu) / rp) - Math.sqrt(mu / rp);
}

function relState(id: string, center: string, jd: number) {
  const s = state(id, jd), c = state(center, jd);
  return { r: sub(s.r, c.r), v: sub(s.v, c.v) };
}

/** Candidate Lambert transfer leaving now with a given time of flight. */
function lambertLeg(from: string, to: string, center: string, jd: number, tof: number) {
  const A = legBody(from, center), B = legBody(to, center);
  const mu = BODY[center].GM;
  const s1 = relState(A, center, jd), s2 = relState(B, center, jd + tof / DAY);
  const sol = lambert(s1.r, s2.r, tof, mu, true);
  if (!sol) return null;
  const vInfD = norm(sub(sol.v1, s1.v)), vInfA = norm(sub(sol.v2, s2.v));
  const fb = BODY[from], tb = BODY[to];
  // departing from a moon or planet parking orbit, capturing into the target's
  const dvD = A === from ? oberth(vInfD, fb.GM, fb.R + parkAlt(fb)) : vInfD;
  // arriving at a moon (or the wormhole) of another planet: fall in through the planet's well to the moon's orbit and
  // match it there (no Oberth gain at the moon itself is assumed)
  const dvA = B === to ? oberth(vInfA, tb.GM, tb.R + parkAlt(tb)) : (() => {
    const P = BODY[B], rm = tb.orbit?.a ?? P.R * 10;
    return Math.abs(Math.sqrt(vInfA * vInfA + (2 * P.GM) / rm) - Math.sqrt(P.GM / rm));
  })();
  return { r1: s1.r, v1: sol.v1, dvD, dvA, vInfD, vInfA };
}

/** Hohmann time between the orbits of two bodies about a centre. */
function hohmannTime(from: string, to: string, center: string, jd: number) {
  const mu = BODY[center].GM;
  const a1 = norm(relState(legBody(from, center), center, jd).r), a2 = norm(relState(legBody(to, center), center, jd).r);
  return Math.PI * Math.sqrt(((a1 + a2) / 2) ** 3 / mu);
}

/**
 * Plans the voyage options from one body to another departing at jd: the most economical arc found and a fast one
 * (the film's two years to Saturn). Returns the options sorted by time of flight.
 */
export function planVoyage(from: string, to: string, jd: number): TransferPlan[] {
  if (from === to) return [];
  const fb = BODY[from], tb = BODY[to];
  const center = centerOf(fb, tb);
  if (center === 'gargantua') return [slingshot(from, to, jd)];
  if (center === from || center === to) return [planetMoon(from, to, center, jd)];
  const tH = hohmannTime(from, to, center, jd);
  let best: TransferPlan | null = null, fast: TransferPlan | null = null;
  const maxFast = Math.min(tH * 0.45, 2.05 * 365.25 * DAY);
  for (let k = 0; k <= 60; k++) {
    const f = 0.12 + (1.35 - 0.12) * (k / 60);
    const tof = tH * f;
    const leg = lambertLeg(from, to, center, jd, tof);
    if (!leg || !isFinite(leg.dvD + leg.dvA)) continue;
    const plan: TransferPlan = {
      from, to, center, jdDepart: jd, tof, r1: leg.r1, v1: leg.v1, dvDepart: leg.dvD, dvArrive: leg.dvA, vInfDepart: leg.vInfD, vInfArrive: leg.vInfA,
      kind: 'economy', label: '',
    };
    const dv = leg.dvD + leg.dvA;
    if (!best || dv < best.dvDepart + best.dvArrive) best = plan;
    if (tof <= maxFast && (!fast || dv < fast.dvDepart + fast.dvArrive)) fast = { ...plan, kind: 'fast' };
  }
  const out: TransferPlan[] = [];
  if (best) out.push({ ...best, kind: 'economy', label: 'Minimum energy' });
  if (fast && best && fast.tof < best.tof * 0.8 && fast.dvDepart + fast.dvArrive <= ENDURANCE_DV) out.push({ ...fast, label: center === 'sun' ? 'Fast transfer' : 'Fast transfer' });
  return out.sort((a, b) => a.tof - b.tof);
}

/**
 * Between a planet's parking orbit and one of its moons: a Hohmann ellipse from the parking radius to the moon's
 * distance, aimed so that its apoapsis meets the moon on arrival (or the reverse, from the moon down to the planet).
 */
function planetMoon(from: string, to: string, center: string, jd: number): TransferPlan {
  const P = BODY[center], mu = P.GM;
  const moon = from === center ? to : from;
  const rp = P.R + parkAlt(P);
  const am = norm(relState(moon, center, jd).r);
  const a = (rp + am) / 2;
  const tof = Math.PI * Math.sqrt((a ** 3) / mu);
  const vp = Math.sqrt(mu * (2 / rp - 1 / a)), va = Math.sqrt(mu * (2 / am - 1 / a));
  const vMoon = Math.sqrt(mu / am), vPark = Math.sqrt(mu / rp);
  const M = BODY[moon];
  const outbound = from === center;
  const vinf = Math.abs(vMoon - va);
  const dvLow = vp - vPark, dvHigh = oberth(vinf, M.GM, M.R + parkAlt(M));
  // geometry: the ellipse in the moon's orbit plane, periapsis opposite the moon's position on arrival (outbound)
  const mArr = relState(moon, center, jd + tof / DAY), mNow = relState(moon, center, jd);
  const h = [mNow.r[1] * mNow.v[2] - mNow.r[2] * mNow.v[1], mNow.r[2] * mNow.v[0] - mNow.r[0] * mNow.v[2], mNow.r[0] * mNow.v[1] - mNow.r[1] * mNow.v[0]] as V3;
  const hn = norm(h);
  const ur = outbound ? mArr.r.map((x) => -x / norm(mArr.r)) as V3 : mNow.r.map((x) => x / norm(mNow.r)) as V3;
  const ut = [(h[1] * ur[2] - h[2] * ur[1]) / hn, (h[2] * ur[0] - h[0] * ur[2]) / hn, (h[0] * ur[1] - h[1] * ur[0]) / hn] as V3;
  const r0 = outbound ? rp : am, v0 = outbound ? vp : va;
  return {
    from, to, center, jdDepart: jd, tof, r1: ur.map((x) => x * r0) as V3, v1: ut.map((x) => x * v0) as V3,
    dvDepart: outbound ? dvLow : dvHigh, dvArrive: outbound ? dvHigh : dvLow, vInfDepart: outbound ? 0 : vinf, vInfArrive: outbound ? vinf : 0,
    kind: 'direct', label: 'Transfer orbit',
  };
}

/** The Gargantua system: a slingshot leg with a Kepler transfer time about Gargantua (see header). */
function slingshot(from: string, to: string, jd: number): TransferPlan {
  const rf = BODY[from].orbit?.a ?? 300 * R_G, rt = BODY[to].orbit?.a ?? 300 * R_G;
  const a = (rf + rt) / 2;
  const tof = Math.PI * Math.sqrt((a ** 3) / GM_GARGANTUA);
  return {
    from, to, center: 'gargantua', jdDepart: jd, tof, r1: [rf, 0, 0], v1: [0, 0, 0], dvDepart: SLINGSHOT_DV * 0.6, dvArrive: SLINGSHOT_DV * 0.4,
    vInfDepart: 0, vInfArrive: 0, kind: 'slingshot', label: 'Slingshot round Gargantua',
  };
}

// ------------------------------------------------------------------------------------------- the flown path
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const mix = (a: V3, b: V3, w: number): V3 => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];

/** Position relative to the conic's body at voyage time t. */
export function localTrack(c: Conic, t: number): V3 {
  const mu = BODY[c.body].GM, dt = t - c.tp;
  if (mu > 0) return propagate(c.r, c.v, mu, dt).r;
  const tau = Math.abs(dt);
  const s = tau < BURN_S ? (tau * tau) / (2 * BURN_S) : tau - BURN_S / 2;
  return c.kind === 'arr' ? sub(c.r, scale(c.v, s)) : add(c.r, scale(c.v, s));
}

/** Where a local leg hands over to the transfer arc: across the body's sphere of influence. */
function fadeRadius(id: string) {
  const b = BODY[id];
  if (b.GM <= 0) return 5e7;
  return Math.max(soiRadius(b), 20 * (b.R + b.parkingAlt));
}

/** The transfer arc itself, in the system frame. */
function arcPoint(plan: TransferPlan, t: number): V3 {
  const jd = plan.jdDepart + t / DAY;
  if (plan.kind === 'slingshot') {
    // beyond the wormhole (fiction, see the header): a prograde spiral in Gargantua's disk plane between the two orbits
    const e = smooth(t / plan.tof);
    const a = state(plan.from, jd).r, b = state(plan.to, jd).r;
    const ra = Math.hypot(a[0], a[1]), rb = Math.hypot(b[0], b[1]);
    const ta = Math.atan2(a[1], a[0]);
    let dth = Math.atan2(b[1], b[0]) - ta;
    dth = ((dth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const r = ra + (rb - ra) * e, th = ta + dth * e;
    return [r * Math.cos(th), r * Math.sin(th), a[2] + (b[2] - a[2]) * e];
  }
  const s = propagate(plan.r1, plan.v1, BODY[plan.center].GM, t);
  return add(s.r, state(plan.center, jd).r);
}

/** The flown path: the arc, with the escape and capture legs about the end bodies faded in near them. */
export function voyagePoint(plan: TransferPlan, t: number): V3 {
  const jd = plan.jdDepart + t / DAY;
  let r = arcPoint(plan, t);
  for (const c of [plan.dep, plan.arr]) {
    if (!c) continue;
    const R = fadeRadius(c.body);
    // far out on the leg the local conic has no weight: skip it (and the long propagation)
    const mu = BODY[c.body].GM, r0 = norm(c.r), v0 = norm(c.v);
    const vinf = Math.sqrt(Math.max(0, v0 * v0 - (mu > 0 ? (2 * mu) / r0 : 0)));
    if (r0 + vinf * Math.abs(t - c.tp) > 3 * R && Math.abs(t - c.tp) > BURN_S) continue;
    const loc = localTrack(c, t);
    const w = 1 - smooth((norm(loc) - 0.2 * R) / (0.8 * R));
    if (w > 0) r = mix(r, add(state(c.body, jd).r, loc), w);
  }
  const k = plan.kind === 'slingshot' ? 0.04 : 0.06;
  if (plan.depOff) r = add(r, scale(plan.depOff, 1 - smooth(t / (k * plan.tof))));
  if (plan.arrOff) r = add(r, scale(plan.arrOff, smooth((t - (1 - k) * plan.tof) / (k * plan.tof))));
  return r;
}

/** Where the Endurance is t seconds after the departure burn, and its velocity, in the system frame. */
export function voyagePosition(plan: TransferPlan, t: number): { r: V3; v: V3 } {
  const h = 2;
  const r = voyagePoint(plan, t);
  const a = voyagePoint(plan, Math.max(0, t - h)), b = voyagePoint(plan, Math.min(plan.tof, t + h));
  const dt = Math.min(plan.tof, t + h) - Math.max(0, t - h);
  return { r, v: scale(sub(b, a), 1 / dt) };
}

/** Distance (m) still to go: straight line from the ship to where the target will be on arrival. */
export function distanceRemaining(plan: TransferPlan, t: number) {
  const tgt = state(plan.to, plan.jdDepart + plan.tof / DAY).r;
  return norm(sub(tgt, voyagePoint(plan, t)));
}

// ------------------------------------------------------------------------------------------- scheduling the burns
/**
 * Periapsis state of a hyperbola about a body (gravity mu) with its periapsis on the direction rHat at radius rp
 * and excess velocity vinf along u: the escape leg ('dep', leaving along u) or the capture leg ('arr', arriving
 * along u). err is the angle between the asymptote this periapsis gives and the wanted one.
 */
function hyperbolaAt(rHat: V3, u: V3, vinf: number, mu: number, rp: number, kind: 'dep' | 'arr') {
  const e = 1 + (rp * vinf * vinf) / mu;
  const thInf = Math.acos(-1 / e);
  const ref = kind === 'dep' ? u : scale(u, -1);
  const err = Math.abs(Math.acos(Math.max(-1, Math.min(1, dot(rHat, ref)))) - thInf);
  const t = unit(sub(u, scale(rHat, dot(u, rHat))));
  const vp = Math.sqrt(vinf * vinf + (2 * mu) / rp);
  return { r: scale(rHat, rp), v: scale(t, vp), err };
}

/**
 * Schedule the departure from the parking orbit. park(t) is the ship's state relative to the departure body t
 * seconds from now (system frame) and period the parking orbit's period. The burn waits for the point of the orbit
 * that suits the transfer best: for an escape, where a hyperbola from the parking radius leaves along the arc's
 * departure direction (cost includes any plane change); for a transfer out to a moon, the point the Lambert arc
 * to the moon costs least from. Returns the plan with the burn time, its true cost and the escape leg.
 */
export function finalizeDeparture(plan: TransferPlan, jdNow: number, park: (t: number) => ParkState, period: number): TransferPlan {
  const from = plan.from, fb = BODY[from], center = plan.center;
  const N = 240;
  const times = isFinite(period) && period > 0 ? Array.from({ length: N }, (_, k) => 30 + (period * k) / N) : [0];
  if (plan.kind === 'slingshot') {
    return { ...plan, jdDepart: jdNow, wait: 0, depOff: park(0).r };
  }
  if (from === center) {
    // out to a moon of this planet: the Lambert arc from the burn point to the moon's position on arrival
    const mu = fb.GM;
    let best: { t: number; plan: TransferPlan; cost: number } | null = null;
    for (const t of times.filter((_, k) => k % 4 === 0)) {
      const s = park(t), jd = jdNow + t / DAY;
      const tgt = relState(legBody(plan.to, center), center, jd + plan.tof / DAY);
      const sol = lambert(s.r, tgt.r, plan.tof, mu, true);
      if (!sol) continue;
      const tb = BODY[plan.to];
      const vA = norm(sub(sol.v2, tgt.v));
      const cost = norm(sub(sol.v1, s.v)) + oberth(vA, tb.GM, tb.R + parkAlt(tb));
      if (!best || cost < best.cost) best = { t, cost, plan: { ...plan, jdDepart: jd, r1: s.r, v1: sol.v1, dvDepart: norm(sub(sol.v1, s.v)), vInfArrive: vA, wait: t } };
    }
    return best ? best.plan : { ...plan, jdDepart: jdNow, wait: 0, depOff: park(0).r };
  }
  const A = legBody(from, center);
  const leg = (jd: number) => {
    const s1 = relState(A, center, jd), s2 = relState(legBody(plan.to, center), center, jd + plan.tof / DAY);
    const sol = lambert(s1.r, s2.r, plan.tof, BODY[center].GM, true);
    return sol ? { r1: s1.r, v1: sol.v1, vinf: sub(sol.v1, s1.v) } : null;
  };
  if (A !== from) {
    // leaving a moon for another planet: the arc starts at the planet; the moon's own pull is left out
    const L = leg(jdNow);
    return L ? { ...plan, jdDepart: jdNow, r1: L.r1, v1: L.v1, wait: 0, depOff: add(sub(state(from, jdNow).r, state(A, jdNow).r), park(0).r) } : plan;
  }
  if (fb.GM <= 0) {
    // the wormhole: no gravity to escape, the ship simply burns onto the arc
    const L = leg(jdNow);
    if (!L) return plan;
    return { ...plan, jdDepart: jdNow, r1: L.r1, v1: L.v1, wait: 0, dvDepart: norm(L.vinf), dep: { body: from, tp: 0, r: park(0).r, v: L.vinf, kind: 'dep' } };
  }
  let jdBurn = jdNow, L = leg(jdBurn), pick: { t: number; h: ReturnType<typeof hyperbolaAt>; dv: number } | null = null;
  for (let iter = 0; iter < 2 && L; iter++) {
    const u = unit(L.vinf), vinf = norm(L.vinf);
    pick = null;
    for (const t of times) {
      const s = park(t);
      const h = hyperbolaAt(unit(s.r), u, vinf, fb.GM, norm(s.r), 'dep');
      const dv = norm(sub(h.v, s.v));
      // a mismatch of the asymptote costs about vinf x angle to correct later
      const score = dv + h.err * vinf;
      if (!pick || score < pick.dv + pick.h.err * vinf) pick = { t, h, dv };
    }
    jdBurn = jdNow + pick!.t / DAY;
    L = leg(jdBurn);
  }
  if (!L || !pick) return plan;
  return {
    ...plan, jdDepart: jdBurn, r1: L.r1, v1: L.v1, wait: pick.t, dvDepart: pick.dv, vInfDepart: norm(L.vinf),
    dep: { body: from, tp: 0, r: pick.h.r, v: pick.h.v, kind: 'dep' },
  };
}

/**
 * Schedule the arrival: parkAt(phi) is the target's parking orbit (state relative to the target, system frame, at
 * the arrival time) as a function of the in-plane angle. The capture hyperbola is chosen with its periapsis on that
 * orbit where the capture burn costs least, so the ship ends exactly where its parking orbit begins.
 */
export function finalizeArrival(plan: TransferPlan, parkAt: (phi: number) => ParkState, defaultPhase: number): TransferPlan {
  const to = plan.to, tb = BODY[to], center = plan.center;
  const jdArr = plan.jdDepart + plan.tof / DAY;
  const phis = Array.from({ length: 360 }, (_, k) => (k / 360) * 2 * Math.PI);
  if (plan.kind === 'slingshot') {
    const p = parkAt(defaultPhase);
    return { ...plan, arrPhase: defaultPhase, arrOff: p.r };
  }
  const end = propagate(plan.r1, plan.v1, BODY[center].GM, plan.tof);
  if (to === center) {
    // down from a moon to its planet: into the nearest point of the parking orbit
    let best = 0, bd = -2;
    for (const f of phis) { const d = dot(unit(parkAt(f).r), unit(end.r)); if (d > bd) { bd = d; best = f; } }
    const p = parkAt(best);
    return { ...plan, arrPhase: best, arrOff: sub(p.r, end.r), dvArrive: norm(sub(p.v, end.v)) };
  }
  const B = legBody(to, center);
  const tgt = relState(B, center, jdArr);
  const vrel = sub(end.v, tgt.v);
  if (B !== to) {
    const p = parkAt(defaultPhase);
    return { ...plan, arrPhase: defaultPhase, arrOff: add(sub(state(to, jdArr).r, state(B, jdArr).r), p.r) };
  }
  const u = unit(vrel), vinf = norm(vrel);
  if (tb.GM <= 0) {
    // the wormhole: brake to rest at the standoff point on the approach side
    let best = 0, bd = -2;
    for (const f of phis) { const d = -dot(unit(parkAt(f).r), u); if (d > bd) { bd = d; best = f; } }
    return { ...plan, arrPhase: best, dvArrive: vinf, vInfArrive: vinf, arr: { body: to, tp: plan.tof, r: parkAt(best).r, v: vrel, kind: 'arr' } };
  }
  let pick: { f: number; h: ReturnType<typeof hyperbolaAt>; dv: number } | null = null;
  for (const f of phis) {
    const s = parkAt(f);
    const h = hyperbolaAt(unit(s.r), u, vinf, tb.GM, norm(s.r), 'arr');
    const dv = norm(sub(h.v, s.v));
    if (!pick || dv + h.err * vinf < pick.dv + pick.h.err * vinf) pick = { f, h, dv };
  }
  return { ...plan, arrPhase: pick!.f, dvArrive: pick!.dv, vInfArrive: vinf, arr: { body: to, tp: plan.tof, r: pick!.h.r, v: pick!.h.v, kind: 'arr' } };
}

export const fmtDistance = (m: number) => (m > 0.05 * AU ? `${(m / AU).toFixed(2)} au` : m > 1e7 ? `${(m / 1e9).toFixed(2)} million km` : `${(m / 1000).toFixed(0)} km`);
export function fmtDuration(s: number) {
  const d = s / DAY;
  if (d >= 365.25) return `${(d / 365.25).toFixed(2)} years`;
  if (d >= 2) return `${d.toFixed(1)} days`;
  const h = s / 3600;
  return h >= 1 ? `${h.toFixed(1)} hours` : `${(s / 60).toFixed(0)} minutes`;
}
