/* ============================================================================
   p7-physics.js — ORBITAL MECHANICS (orb*) + 6-DOF SHIP FLIGHT MODEL (flt*)
   Agent B3.  Tag prefixes: orb / flt.  Owns the global SHIP.
   Everything Float64, SI units, allocation-free in the update path.

   Reference frame: world is Y-up.  p2-core's fieldHeight() uses |y| as latitude,
   so +Y is the planetary/ecliptic polar axis.  Classical orbital elements are
   traditionally written Z-up, so element math happens in a rotated "element
   frame" E:  E = (x, -z, y)  <->  W = (X, Z, -Y).  det = +1, a pure rotation.
   ============================================================================ */

/* ---------------------------------------------------------------- constants */
const orbG0 = 9.80665;                 // standard gravity, for Isp
const orbAU = 1.495978707e11;          // m
const orbS0 = 1361;                    // solar constant at 1 AU, W/m^2
const orbKepTol = 1e-13;               // Kepler convergence tolerance, radians
const orbKepMaxIt = 64;                // hard iteration cap (bisection floor
                                       // needs ~52 to reach 1e-15 over a 2-wide
                                       // bracket, so 64 can never be exhausted
                                       // without the answer already being right)
const orbTiny = 1e-12;
const orbSigmaSB = 5.670374419e-8;     // Stefan-Boltzmann
const orbSuttonK = 1.7415e-4;          // Sutton-Graves constant (SI)

/* ------------------------------------------------------- module-wide scratch */
const _orb0 = v3(), _orb1 = v3(), _orb2 = v3(), _orb3 = v3(), _orb4 = v3();
const _orb5 = v3(), _orb6 = v3(), _orb7 = v3(), _orb8 = v3(), _orb9 = v3();
const _orb10 = v3(), _orb11 = v3(), _orb12 = v3(), _orb13 = v3();
const _orbq0 = new Float64Array(4), _orbq1 = new Float64Array(4);
const _orbq2 = new Float64Array(4), _orbq3 = new Float64Array(4);

/* ------------------------------------------------ world <-> element frame */
const orbW2E = (o, a) => { const x = a[0], y = a[1], z = a[2]; o[0] = x; o[1] = -z; o[2] = y; return o; };
const orbE2W = (o, a) => { const X = a[0], Y = a[1], Z = a[2]; o[0] = X; o[1] = Z; o[2] = -Y; return o; };

/* ============================================================================
   KEPLER'S EQUATION
   Both solvers are "safe Newton" (Numerical Recipes rtsafe): a Newton step is
   taken only when it lands inside a bracket known to contain the root and is
   shrinking the interval fast enough; otherwise the step degrades to bisection.
   Because f is strictly monotone on the bracket, convergence is unconditional —
   the classic high-e Newton divergence simply cannot happen.
   ========================================================================== */

/* Elliptic:  M = E - e*sin(E).  Bracket [M-e, M+e] always contains the root
   because E = M + e*sin(E) and |e*sin(E)| <= e. */
function orbKepler(M, e) {
  if (!isFinite(M)) return 0;
  if (!(e >= 0)) e = 0;
  if (e > 0.9999999999) e = 0.9999999999;
  M = M % TAU;
  if (M > Math.PI) M -= TAU; else if (M < -Math.PI) M += TAU;
  if (e < 1e-14) return M;
  let lo = M - e, hi = M + e;                       // f(lo)<=0<=f(hi)
  // initial guess: low-e series, Danby's shifted guess for high e
  let E = (e < 0.8) ? (M + e * Math.sin(M) * (1 + e * Math.cos(M)))
                    : (M + 0.85 * e * (M < 0 ? -1 : 1));
  if (!(E > lo)) E = lo; else if (!(E < hi)) E = hi;
  let dxOld = hi - lo, dx = dxOld;
  for (let it = 0; it < orbKepMaxIt; it++) {
    const f = E - e * Math.sin(E) - M;
    if (f < 0) lo = E; else hi = E;
    const fp = 1 - e * Math.cos(E);
    const trial = (fp > 1e-15) ? (E - f / fp) : Infinity;
    if (!(trial > lo && trial < hi) || Math.abs(2 * f) > Math.abs(dxOld * fp)) {
      dxOld = dx; dx = 0.5 * (hi - lo); E = lo + dx;   // bisect
    } else {
      dxOld = dx; dx = E - trial; E = trial;           // Newton
    }
    if (Math.abs(dx) < orbKepTol) break;
  }
  return E;
}

/* Hyperbolic:  M = e*sinh(H) - H.  Monotone in H (dM/dH = e*cosh H - 1 > 0 for
   e>1), so a bracket grown outward from 0 always works. */
function orbKeplerH(M, e) {
  if (!isFinite(M)) return 0;
  if (!(e > 1.0000000001)) e = 1.0000000001;
  const sgn = M < 0 ? -1 : 1, Ma = Math.abs(M);
  if (Ma < 1e-14) return 0;
  // guess: near-parabolic small-M linearisation, else the asymptotic log form
  let H = (Ma / e < 1) ? (Ma / (e - 1)) : Math.log(2 * Ma / e + 1.8);
  if (!isFinite(H) || !(H > 0)) H = 1;
  if (H > 700) H = 700;
  let lo = 0, hi = H;
  let g = e * Math.sinh(hi) - hi - Ma, n = 0;
  while (g < 0 && n < 200) { lo = hi; hi = hi * 2 + 1e-6; if (hi > 710) { hi = 710; break; } g = e * Math.sinh(hi) - hi - Ma; n++; }
  H = 0.5 * (lo + hi);
  let dxOld = hi - lo, dx = dxOld;
  for (let it = 0; it < orbKepMaxIt; it++) {
    const f = e * Math.sinh(H) - H - Ma;
    if (f < 0) lo = H; else hi = H;
    const fp = e * Math.cosh(H) - 1;
    const trial = (isFinite(fp) && fp > 1e-15) ? (H - f / fp) : Infinity;
    if (!(trial > lo && trial < hi) || !(Math.abs(2 * f) <= Math.abs(dxOld * fp))) {
      dxOld = dx; dx = 0.5 * (hi - lo); H = lo + dx;
    } else {
      dxOld = dx; dx = H - trial; H = trial;
    }
    if (Math.abs(dx) < orbKepTol * (1 + Math.abs(H))) break;
  }
  return sgn * H;
}

/* ============================================================================
   ORBITAL ELEMENTS
   ========================================================================== */

/* Blank element record with its Float64 sub-arrays preallocated. */
function orbElements() {
  return {
    a: 0, e: 0, i: 0, raan: 0, argp: 0, nu: 0, M0: 0, epoch: 0, mu: 0,
    n: 0, period: Infinity, rp: 0, ra: Infinity, h: 0, energy: 0,
    p: 0, hyper: false, valid: false, rSOI: Infinity,
    hvec: v3(), evec: v3(), nvec: v3()
  };
}

/* state -> elements.  `out` optional (pass SHIP.orbit to stay allocation-free).
   Robust for e->0 (argp undefined), i->0 or i->pi (raan undefined), retrograde,
   and hyperbolic.  Quadrants come from atan2 of an in-plane orthonormal pair,
   never from a sign test that degenerates when the reference is ambiguous. */
function orbFromState(pos, vel, mu, epoch, out) {
  const el = out || orbElements();
  el.mu = mu; el.epoch = epoch || 0; el.valid = false;
  if (!(mu > 0)) return el;
  const R = orbW2E(_orb0, pos), V = orbW2E(_orb1, vel);
  const r = vlen(R), v2 = vlen2(V);
  if (!(r > 0) || !isFinite(r) || !isFinite(v2)) return el;

  const H = vcross(_orb2, R, V);
  const hm = vlen(H);
  vcopy(el.hvec, H); el.h = hm;

  // eccentricity vector: e = ((v^2 - mu/r) R - (R.V) V)/mu
  const rv = vdot(R, V);
  const c1 = (v2 - mu / r) / mu, c2 = rv / mu;
  const E = _orb3;
  E[0] = c1 * R[0] - c2 * V[0]; E[1] = c1 * R[1] - c2 * V[1]; E[2] = c1 * R[2] - c2 * V[2];
  let e = vlen(E);
  if (!isFinite(e)) return el;
  vcopy(el.evec, E);

  const energy = 0.5 * v2 - mu / r;
  el.energy = energy;
  el.p = hm * hm / mu;

  // keep a safe distance from the exactly-parabolic singularity
  if (Math.abs(e - 1) < 1e-9) e = (e < 1) ? (1 - 1e-9) : (1 + 1e-9);
  el.e = e;
  el.hyper = e > 1;

  let a;
  if (e < 1) a = -mu / (2 * energy);
  else       a = -mu / (2 * energy);           // negative for hyperbola
  if (!isFinite(a) || a === 0) a = (e < 1) ? r : -r;
  el.a = a;

  // inclination from the reference normal (+Z in element frame)
  const hz = (hm > orbTiny) ? clamp(H[2] / hm, -1, 1) : 1;
  el.i = Math.acos(hz);

  // node vector n = zhat x h ; degenerate (equatorial) -> use +X, raan = 0
  const N = el.nvec;
  N[0] = -H[1]; N[1] = H[0]; N[2] = 0;
  const nm = vlen(N);
  if (nm > hm * 1e-11 && nm > orbTiny) { vscl(N, N, 1 / nm); el.raan = Math.atan2(N[1], N[0]); }
  else { vset(N, 1, 0, 0); el.raan = 0; }
  if (el.raan < 0) el.raan += TAU;

  // in-plane axis 90 degrees ahead of N (direction of motion)
  const Hh = (hm > orbTiny) ? vscl(_orb4, H, 1 / hm) : vset(_orb4, 0, 0, 1);
  const NP = vcross(_orb5, Hh, N);              // unit, in-plane, ahead of node

  // argument of periapsis (undefined for circular -> 0)
  const eSmall = e < 1e-9;
  if (eSmall) { el.argp = 0; }
  else {
    const Eh = vscl(_orb6, E, 1 / e);
    el.argp = Math.atan2(vdot(NP, Eh), vdot(N, Eh));
    if (el.argp < 0) el.argp += TAU;
  }

  // true anomaly (from periapsis, or from the node when circular)
  const Rh = vscl(_orb7, R, 1 / r);
  let nu;
  if (eSmall) nu = Math.atan2(vdot(NP, Rh), vdot(N, Rh));
  else {
    const Eh = vscl(_orb6, E, 1 / e);
    const EP = vcross(_orb8, Hh, Eh);
    nu = Math.atan2(vdot(EP, Rh), vdot(Eh, Rh));
  }
  if (nu < 0) nu += TAU;
  el.nu = nu;

  // mean motion, mean anomaly at epoch
  if (e < 1) {
    el.n = Math.sqrt(mu / (a * a * a));
    el.period = TAU / el.n;
    el.rp = a * (1 - e); el.ra = a * (1 + e);
  } else {
    const aa = -a;
    el.n = Math.sqrt(mu / (aa * aa * aa));
    el.period = Infinity;
    el.rp = a * (1 - e); el.ra = Infinity;
  }
  el.M0 = orbNuToM(el, nu);
  el.valid = isFinite(el.a) && isFinite(el.n) && isFinite(el.M0);
  return el;
}

/* true anomaly -> mean anomaly for these elements */
function orbNuToM(el, nu) {
  const e = el.e;
  if (e < 1) {
    const E = 2 * Math.atan2(Math.sqrt(Math.max(0, 1 - e)) * Math.sin(nu * 0.5),
                             Math.sqrt(Math.max(0, 1 + e)) * Math.cos(nu * 0.5));
    return E - e * Math.sin(E);
  }
  const den = 1 + e * Math.cos(nu);
  if (!(den > 1e-12)) return NaN;                 // beyond the asymptote
  const sh = Math.sqrt(e * e - 1) * Math.sin(nu) / den;
  const Hh = Math.asinh(sh);
  return e * sh - Hh;
}

/* elements + time -> state, RELATIVE TO THE FOCUS (body-centred). */
function orbToState(el, t, outPos, outVel) {
  if (outPos) { outPos[0] = outPos[1] = outPos[2] = 0; }
  if (outVel) { outVel[0] = outVel[1] = outVel[2] = 0; }
  if (!el || !el.valid) return outPos;
  const mu = el.mu, e = el.e;
  const M = el.M0 + el.n * (t - el.epoch);
  let px, py, vx, vy;
  if (e < 1) {
    const a = el.a;
    const Ea = orbKepler(M, e);
    const cE = Math.cos(Ea), sE = Math.sin(Ea);
    const s1 = Math.sqrt(Math.max(0, 1 - e * e));
    const r = a * (1 - e * cE);
    px = a * (cE - e); py = a * s1 * sE;
    const rr = (r > 1e-6) ? r : 1e-6;
    const f = Math.sqrt(mu * Math.abs(a)) / rr;
    vx = -f * sE; vy = f * s1 * cE;
  } else {
    const aa = Math.abs(el.a);
    const Hh = orbKeplerH(M, e);
    const cH = Math.cosh(Hh), sH = Math.sinh(Hh);
    const s1 = Math.sqrt(Math.max(0, e * e - 1));
    const r = aa * (e * cH - 1);
    px = aa * (e - cH); py = aa * s1 * sH;
    const rr = (r > 1e-6) ? r : 1e-6;
    const f = Math.sqrt(mu * aa) / rr;
    vx = -f * sH; vy = f * s1 * cH;
  }
  return orbPerifocal(el, px, py, vx, vy, outPos, outVel);
}

/* perifocal (x,y) + (vx,vy) -> world, using the element angles. */
function orbPerifocal(el, px, py, vx, vy, outPos, outVel) {
  const cO = Math.cos(el.raan), sO = Math.sin(el.raan);
  const ci = Math.cos(el.i), si = Math.sin(el.i);
  const cw = Math.cos(el.argp), sw = Math.sin(el.argp);
  const Px = cO * cw - sO * sw * ci, Py = sO * cw + cO * sw * ci, Pz = sw * si;
  const Qx = -cO * sw - sO * cw * ci, Qy = -sO * sw + cO * cw * ci, Qz = cw * si;
  if (outPos) {
    const X = px * Px + py * Qx, Y = px * Py + py * Qy, Z = px * Pz + py * Qz;
    outPos[0] = X; outPos[1] = Z; outPos[2] = -Y;          // E -> W
  }
  if (outVel) {
    const X = vx * Px + vy * Qx, Y = vx * Py + vy * Qy, Z = vx * Pz + vy * Qz;
    outVel[0] = X; outVel[1] = Z; outVel[2] = -Y;
  }
  return outPos;
}

/* radius at a given true anomaly */
function orbRadiusAt(el, nu) {
  const d = 1 + el.e * Math.cos(nu);
  if (!(Math.abs(d) > 1e-12)) return Infinity;
  return el.p / d;
}

/* next time at or after tFrom at which the true anomaly equals nu.
   Returns Infinity if unreachable (hyperbolic past-asymptote / already gone). */
function orbTimeAtNu(el, nu, tFrom) {
  const M = orbNuToM(el, nu);
  if (!isFinite(M)) return Infinity;
  if (el.e < 1) {
    const P = el.period;
    let t = el.epoch + (M - el.M0) / el.n;
    if (!isFinite(t)) return Infinity;
    const k = Math.ceil((tFrom - t) / P);
    return t + (k > 0 ? k * P : 0);
  }
  const t = el.epoch + (M - el.M0) / el.n;
  return (t >= tFrom) ? t : Infinity;
}

/* eccentric-anomaly-uniform samples of the conic (position only, relative to
   the focus).  Writes 3*count values into outF64 (Float64Array or Float32Array).
   Returns the number of points written. */
function orbSamplePath(el, count, outF64) {
  if (!el || !el.valid || !outF64 || count < 2) return 0;
  const need = count * 3;
  if (outF64.length < need) count = Math.floor(outF64.length / 3);
  if (count < 2) return 0;
  const e = el.e;
  if (e < 1) {
    const a = el.a, b = a * Math.sqrt(Math.max(0, 1 - e * e));
    for (let k = 0; k < count; k++) {
      const Ea = k / count * TAU;
      orbPerifocal(el, a * (Math.cos(Ea) - e), b * Math.sin(Ea), 0, 0, _orb9, null);
      outF64[k * 3] = _orb9[0]; outF64[k * 3 + 1] = _orb9[1]; outF64[k * 3 + 2] = _orb9[2];
    }
  } else {
    const aa = Math.abs(el.a), s1 = Math.sqrt(Math.max(0, e * e - 1));
    let rMax = isFinite(el.rSOI) ? el.rSOI : Math.abs(el.rp) * 60;
    if (!(rMax > Math.abs(el.rp))) rMax = Math.abs(el.rp) * 60;
    let ch = (rMax / aa + 1) / e; if (!(ch >= 1)) ch = 1;
    const Hmax = Math.acosh(Math.min(ch, 1e6));
    for (let k = 0; k < count; k++) {
      const Hh = -Hmax + 2 * Hmax * (k / (count - 1));
      orbPerifocal(el, aa * (e - Math.cosh(Hh)), aa * s1 * Math.sinh(Hh), 0, 0, _orb9, null);
      outF64[k * 3] = _orb9[0]; outF64[k * 3 + 1] = _orb9[1]; outF64[k * 3 + 2] = _orb9[2];
    }
  }
  return count;
}

/* ============================================================================
   BODIES / SPHERES OF INFLUENCE
   ========================================================================== */

const orbTestBodies = [];             // used only when BODIES does not exist yet
function orbBodyList() {
  if (typeof BODIES !== 'undefined' && BODIES && BODIES.length) return BODIES;
  return orbTestBodies;
}

/* r_soi = a * (m/M)^(2/5) = a * (mu/muParent)^0.4 */
function orbSoiRadius(body) {
  if (!body) return Infinity;
  const p = body.parent;
  if (!p || !(p.mu > 0) || !(body.a > 0) || !(body.mu > 0)) return Infinity;
  return body.a * Math.pow(body.mu / p.mu, 0.4);
}
function orbBodySoi(body) {
  if (!body) return Infinity;
  if (body.soi === undefined || body.soi === null || !isFinite(body.soi)) {
    const s = orbSoiRadius(body);
    if (body.soi === undefined || body.soi === null) body.soi = s;
    return s;
  }
  return body.soi;
}

/* deepest body (smallest SOI) whose sphere of influence contains pos */
function orbDominant(pos) {
  const L = orbBodyList();
  let best = null, bestSoi = Infinity;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    if (!b || !b.pos || !(b.mu > 0)) continue;
    const s = orbBodySoi(b);
    const d = vdist(pos, b.pos);
    if (d < s && s <= bestSoi) { best = b; bestSoi = s; }
  }
  return best;
}

function orbStar() {
  const L = orbBodyList();
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    if (b && (b.kind === 'star' || b.kind === 0) && b.mu > 0) return b;
  }
  for (let i = 0; i < L.length; i++) if (L[i] && !L[i].parent && L[i].mu > 0) return L[i];
  return null;
}

/* spin axis in world space (obliquity `tilt` tips +Y toward +X) */
function orbBodySpinAxis(body, out) {
  const t = (body && isFinite(body.tilt)) ? body.tilt : 0;
  return vnorm(out, vset(out, Math.sin(t), Math.cos(t), 0));
}
function orbBodySpinRate(body) {
  if (!body || !isFinite(body.rotPeriod) || Math.abs(body.rotPeriod) < 1e-6) return 0;
  return TAU / body.rotPeriod;
}
/* velocity of the co-rotating surface/atmosphere at a world point */
function orbBodySurfaceVel(body, worldPos, out) {
  vset(out, 0, 0, 0);
  if (!body || !body.pos) return out;
  const w = orbBodySpinRate(body);
  if (!(Math.abs(w) > 0)) return out;
  const ax = orbBodySpinAxis(body, _orb10);
  vsub(_orb11, worldPos, body.pos);
  vcross(out, ax, _orb11);
  return vscl(out, out, w);
}

/* body state at an arbitrary time (for node previews).  Falls back to the
   body's current pos/vel when it has no usable elements. */
function orbBodyStateAt(body, t, outPos, outVel) {
  if (!body) { vset(outPos, 0, 0, 0); if (outVel) vset(outVel, 0, 0, 0); return outPos; }
  const par = body.parent;
  if (!par || !(par.mu > 0) || !(body.a > 0)) {
    vcopy(outPos, body.pos || _orb0);
    if (outVel) vcopy(outVel, body.vel || _orb0);
    return outPos;
  }
  let el = body._orbEl;
  if (!el) {
    el = body._orbEl = orbElements();
    el.mu = par.mu; el.a = body.a; el.e = body.e || 0;
    el.i = body.inc || 0; el.raan = body.raan || 0; el.argp = body.argp || 0;
    el.M0 = body.m0 || 0; el.epoch = 0;
    el.p = el.a * (1 - el.e * el.e);
    el.n = Math.sqrt(par.mu / (el.a * el.a * el.a));
    el.period = TAU / el.n; el.rp = el.a * (1 - el.e); el.ra = el.a * (1 + el.e);
    el.valid = isFinite(el.n);
  }
  orbToState(el, t, outPos, outVel);
  orbBodyStateAt(par, t, _orb12, _orb13);
  vadd(outPos, outPos, _orb12);
  if (outVel) vadd(outVel, outVel, _orb13);
  return outPos;
}

/* ============================================================================
   MISSION-PLANNING HELPERS
   ========================================================================== */
const orbCircularVel = (mu, r) => (r > 0 && mu > 0) ? Math.sqrt(mu / r) : 0;
const orbEscapeVel = (mu, r) => (r > 0 && mu > 0) ? Math.sqrt(2 * mu / r) : 0;

const orbHohmannOut = { dv1: 0, dv2: 0, dv: 0, tof: 0, phase: 0, aT: 0 };
function orbHohmann(r1, r2, mu) {
  const o = orbHohmannOut;
  o.dv1 = o.dv2 = o.dv = o.tof = o.phase = o.aT = 0;
  if (!(r1 > 0) || !(r2 > 0) || !(mu > 0)) return o;
  const aT = 0.5 * (r1 + r2);
  const v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
  const vp = Math.sqrt(mu * (2 / r1 - 1 / aT));
  const va = Math.sqrt(mu * (2 / r2 - 1 / aT));
  o.aT = aT; o.dv1 = vp - v1; o.dv2 = v2 - va;
  o.dv = Math.abs(o.dv1) + Math.abs(o.dv2);
  o.tof = Math.PI * Math.sqrt(aT * aT * aT / mu);
  // phase angle the target must lead by at departure
  const n2 = Math.sqrt(mu / (r2 * r2 * r2));
  o.phase = Math.PI - n2 * o.tof;
  while (o.phase > Math.PI) o.phase -= TAU;
  while (o.phase < -Math.PI) o.phase += TAU;
  return o;
}

/* The classic landing-burn solve: at what altitude must a full-throttle
   retrograde burn begin so that vertical speed reaches zero at the surface?
   Constant-thrust, constant-g approximation with the current mass:
        a_net = F/m - g      d = v^2 / (2 a_net)
   Extra detail is stashed in orbBurnInfo. */
const orbBurnInfo = { alt: Infinity, time: Infinity, dv: 0, twr: 0, vspd: 0, aNet: 0 };
function orbSuicideBurnAlt(ship, body) {
  const o = orbBurnInfo;
  o.alt = Infinity; o.time = Infinity; o.dv = 0; o.twr = 0; o.vspd = 0; o.aNet = 0;
  if (!ship || !body || !body.pos || !(body.mu > 0)) return Infinity;
  vsub(_orb0, ship.pos, body.pos);
  const r = vlen(_orb0);
  if (!(r > 0)) return Infinity;
  const up = vscl(_orb1, _orb0, 1 / r);
  const g = body.mu / (r * r);
  orbBodySurfaceVel(body, ship.pos, _orb2);
  vsub(_orb3, ship.vel, body.vel ? vadd(_orb4, body.vel, _orb2) : _orb2);
  const vDown = -vdot(_orb3, up);                 // positive when descending
  o.vspd = vDown;
  const F = (ship.maxThrust || 0) * (ship.fuel > 0 ? 1 : 0);
  const m = ship.mass || 1;
  const aNet = F / m - g;
  o.twr = (g > 0) ? (F / m) / g : Infinity;
  o.aNet = aNet;
  if (!(vDown > 0)) { o.alt = 0; o.time = 0; return 0; }
  if (!(aNet > 0.05)) return Infinity;            // cannot stop: TWR <= 1
  o.alt = vDown * vDown / (2 * aNet);
  o.time = vDown / aNet;
  o.dv = vDown + g * o.time;                      // gravity losses included
  return o.alt;
}

/* ============================================================================
   SAS CONTROL LAWS
   Returns the desired attitude quaternion (nose = -Z, dorsal = +Y).
   Roll is left free: the reference "up" is the ship's current up projected off
   the target forward, so the controller sees zero roll error unless commanded.
   ========================================================================== */
const orbSasModes = ['stability', 'prograde', 'retrograde', 'normal', 'antinormal',
                     'radialin', 'radialout', 'target', 'maneuver'];
const orbSasHold = new Float64Array([0, 0, 0, 1]);

function orbSasTarget(mode, outQuat) {
  const S = (typeof SHIP !== 'undefined') ? SHIP : null;
  if (!S) return qid(outQuat);
  if (mode === 'stability' || !mode) { outQuat[0] = orbSasHold[0]; outQuat[1] = orbSasHold[1]; outQuat[2] = orbSasHold[2]; outQuat[3] = orbSasHold[3]; return outQuat; }

  const b = S.soi;
  const R = _orb0, V = _orb1;
  if (b && b.pos) {
    vsub(R, S.pos, b.pos);
    vsub(V, S.vel, b.vel || _orb2);
    // below the Karman-ish line, fly the surface-relative velocity like KSP
    const alt = vlen(R) - (b.radius || 0);
    const atmoH = (b.atmo && b.atmo.height) ? b.atmo.height : 0;
    if (alt < atmoH) { orbBodySurfaceVel(b, S.pos, _orb3); vsub(V, V, _orb3); }
  } else { vset(R, 0, 1, 0); vcopy(V, S.vel); }

  const rm = vlen(R), vm = vlen(V);
  const Rh = (rm > orbTiny) ? vscl(_orb4, R, 1 / rm) : vset(_orb4, 0, 1, 0);
  const Vh = (vm > 1e-6) ? vscl(_orb5, V, 1 / vm) : vcopy(_orb5, Rh);
  let Nh = vcross(_orb6, R, V);
  if (vlen2(Nh) < 1e-12) { vcross(Nh, Rh, _orb7[0] !== undefined ? vset(_orb7, 0, 1, 0) : Rh); }
  vnorm(Nh, Nh);
  if (vlen2(Nh) < 0.5) { vset(Nh, 0, 1, 0); }
  const RadOut = vnorm(_orb8, vcross(_orb8, Vh, Nh));
  const fwd = _orb9;

  switch (mode) {
    case 'prograde':   vcopy(fwd, Vh); break;
    case 'retrograde': vscl(fwd, Vh, -1); break;
    case 'normal':     vcopy(fwd, Nh); break;
    case 'antinormal': vscl(fwd, Nh, -1); break;
    case 'radialout':  vcopy(fwd, RadOut); break;
    case 'radialin':   vscl(fwd, RadOut, -1); break;
    case 'target': {
      const T = S.target;
      if (T && T.pos) { vsub(fwd, T.pos, S.pos); if (vlen2(fwd) < 1e-6) vcopy(fwd, Vh); vnorm(fwd, fwd); }
      else vcopy(fwd, Vh);
      break;
    }
    case 'maneuver': {
      if (orbNode && orbNode.valid && vlen2(orbNode.dvWorld) > 1e-12) vnorm(fwd, orbNode.dvWorld);
      else vcopy(fwd, Vh);
      break;
    }
    default: vcopy(fwd, Vh); break;
  }
  if (!(vlen2(fwd) > 0.5)) vcopy(fwd, Vh);

  // roll reference: current dorsal, orthogonalised; fall back to radial-out
  const up = _orb10;
  qrot(up, S.quat, orbUpModel);
  const d = vdot(up, fwd);
  up[0] -= fwd[0] * d; up[1] -= fwd[1] * d; up[2] -= fwd[2] * d;
  if (vlen2(up) < 0.04) {
    vcopy(up, RadOut);
    const d2 = vdot(up, fwd);
    up[0] -= fwd[0] * d2; up[1] -= fwd[1] * d2; up[2] -= fwd[2] * d2;
    if (vlen2(up) < 1e-6) vset(up, fwd[1], fwd[2], fwd[0]);
  }
  vnorm(up, up);
  return qlook(outQuat, fwd, up);
}
const orbUpModel = v3(0, 1, 0);
const orbFwdModel = v3(0, 0, -1);
const orbRightModel = v3(1, 0, 0);

/* ============================================================================
   TIME WARP — KSP style.  Only on-rails, and only above a per-body minimum
   altitude that scales with the body's radius and atmosphere.
   ========================================================================== */
const orbWarpLevels = [1, 2, 5, 10, 50, 100, 1000, 10000, 100000];
/* minimum altitude for each level, as a multiple of the body radius, on top of
   the atmosphere height (KSP's table shape) */
const orbWarpMinAlt = [0, 0, 0.005, 0.02, 0.06, 0.12, 0.35, 1.2, 4.0];
let orbWarpIndex = 0;
let orbWarp = 1;
let orbTime = 0;                      // simulation clock, seconds
let orbWarpBlocked = '';              // reason string for the HUD

function orbWarpAllowedIndex() {
  const S = (typeof SHIP !== 'undefined') ? SHIP : null;
  if (!S) return 0;
  if (S.landed) return orbWarpLevels.length - 1;       // landed warp is fine
  if (!S.onRails) { orbWarpBlocked = 'THRUST/ATMO'; return 0; }
  const b = S.soi;
  if (!b) { orbWarpBlocked = ''; return orbWarpLevels.length - 1; }
  const alt = S.altitude;
  const atmoH = (b.atmo && b.atmo.height) ? b.atmo.height : 0;
  const Rb = b.radius || 1;
  let hi = 0;
  for (let i = 0; i < orbWarpLevels.length; i++) {
    if (alt >= atmoH + orbWarpMinAlt[i] * Rb) hi = i; else break;
  }
  orbWarpBlocked = (hi === 0) ? 'TOO LOW' : '';
  return hi;
}
function orbWarpSet(i) {
  const hi = orbWarpAllowedIndex();
  orbWarpIndex = clamp(Math.round(i) | 0, 0, Math.min(hi, orbWarpLevels.length - 1));
  orbWarp = orbWarpLevels[orbWarpIndex];
  return orbWarp;
}
const orbWarpUp = () => orbWarpSet(orbWarpIndex + 1);
const orbWarpDown = () => orbWarpSet(orbWarpIndex - 1);
const orbWarpReset = () => orbWarpSet(0);

/* ============================================================================
   MANOEUVRE NODES + PATCHED-CONIC PREVIEW
   ========================================================================== */
const orbNode = {
  active: false, valid: false, t: 0,
  pro: 0, nor: 0, rad: 0,             // dv components, m/s
  dv: 0, dvWorld: v3(),
  burnTime: 0, startOffset: 0, tToNode: 0,
  patches: [], nPatch: 0, dirty: true
};
for (let i = 0; i < 4; i++) orbNode.patches.push({ body: null, el: orbElements(), t0: 0, t1: Infinity, kind: 'coast' });

function orbNodeCreate(t, pro, nor, rad) {
  orbNode.active = true; orbNode.t = t;
  orbNode.pro = pro || 0; orbNode.nor = nor || 0; orbNode.rad = rad || 0;
  orbNode.dirty = true;
  return orbNode;
}
function orbNodeClear() { orbNode.active = false; orbNode.valid = false; orbNode.nPatch = 0; }
function orbNodeAdjust(dPro, dNor, dRad, dT) {
  if (!orbNode.active) return orbNode;
  orbNode.pro += dPro || 0; orbNode.nor += dNor || 0; orbNode.rad += dRad || 0;
  orbNode.t += dT || 0; orbNode.dirty = true;
  return orbNode;
}

/* burn time from the rocket equation with the current stage */
function orbBurnTime(dv, ship) {
  const S = ship || ((typeof SHIP !== 'undefined') ? SHIP : null);
  if (!S || !(dv > 0)) return 0;
  const isp = S.ispEff || 340, F = S.maxThrust || 1, m0 = S.mass || 1;
  const ve = isp * orbG0;
  const m1 = m0 * Math.exp(-dv / ve);
  const mdot = F / ve;
  if (!(mdot > 0)) return Infinity;
  const fuelNeeded = m0 - m1;
  if (fuelNeeded > (S.fuelMass || 0)) return Infinity;    // not enough propellant
  return fuelNeeded / mdot;
}

/* Predict the orbit after the node, patching through up to `maxPatches` conics.
   Returns orbNode with .patches[0..nPatch-1] filled. */
function orbPreviewNode(node) {
  const N = node || orbNode;
  N.valid = false; N.nPatch = 0;
  const S = (typeof SHIP !== 'undefined') ? SHIP : null;
  if (!N.active || !S || !S.orbit || !S.orbit.valid || !S.soi) return N;

  // 1. propagate on rails to the node time
  const b0 = S.soi;
  orbToState(S.orbit, N.t, _orb0, _orb1);          // relative to b0
  const rm = vlen(_orb0), vm = vlen(_orb1);
  if (!(rm > 0) || !(vm > 0)) return N;
  const Vh = vscl(_orb2, _orb1, 1 / vm);
  let Nh = vcross(_orb3, _orb0, _orb1); vnorm(Nh, Nh);
  if (!(vlen2(Nh) > 0.5)) vset(Nh, 0, 1, 0);
  const RadOut = vnorm(_orb4, vcross(_orb4, Vh, Nh));

  // 2. apply dv in the prograde / normal / radial basis
  const dvv = _orb5;
  dvv[0] = Vh[0] * N.pro + Nh[0] * N.nor + RadOut[0] * N.rad;
  dvv[1] = Vh[1] * N.pro + Nh[1] * N.nor + RadOut[1] * N.rad;
  dvv[2] = Vh[2] * N.pro + Nh[2] * N.nor + RadOut[2] * N.rad;
  vcopy(N.dvWorld, dvv);
  N.dv = vlen(dvv);
  N.burnTime = orbBurnTime(N.dv, S);
  N.startOffset = -0.5 * (isFinite(N.burnTime) ? N.burnTime : 0);
  N.tToNode = N.t - orbTime;
  vadd(_orb1, _orb1, dvv);

  // 3. patch forward
  N.nPatch = orbPatch(_orb0, _orb1, b0, N.t, N.patches, N.patches.length);
  N.valid = N.nPatch > 0;
  N.dirty = false;
  return N;
}

/* Walk a trajectory forward through SOI changes.  posRel/velRel are relative to
   `body` at time t0.  Fills out[] and returns the patch count. */
function orbPatch(posRel, velRel, body, t0, out, maxPatches) {
  let n = 0;
  let b = body, t = t0;
  const pr = vcopy(_orb6, posRel), vr = vcopy(_orb7, velRel);
  while (n < maxPatches && b) {
    const P = out[n];
    P.body = b; P.t0 = t; P.kind = 'coast'; P.t1 = Infinity;
    const el = orbFromState(pr, vr, b.mu, t, P.el);
    if (!el.valid) break;
    const soi = orbBodySoi(b);
    el.rSOI = soi;

    // --- escape ---
    let tEsc = Infinity;
    if (isFinite(soi) && (el.e >= 1 || el.ra > soi)) {
      const c = (el.p / soi - 1) / (el.e > 1e-12 ? el.e : 1e-12);
      if (c >= -1 && c <= 1) {
        const nuE = Math.acos(clamp(c, -1, 1));     // outbound branch
        tEsc = orbTimeAtNu(el, nuE, t + 1e-6);
        const tEsc2 = orbTimeAtNu(el, TAU - nuE, t + 1e-6);
        if (tEsc2 < tEsc && el.e < 1) { /* inbound branch first: not an escape */ }
      }
    }
    // --- impact ---
    let tImp = Infinity;
    const Rb = b.radius || 0;
    if (Rb > 0 && el.rp < Rb) {
      const c = (el.p / Rb - 1) / (el.e > 1e-12 ? el.e : 1e-12);
      if (c >= -1 && c <= 1) {
        const nuI = TAU - Math.acos(clamp(c, -1, 1)); // descending branch
        tImp = Math.min(orbTimeAtNu(el, nuI, t + 1e-6), orbTimeAtNu(el, Math.acos(clamp(c, -1, 1)), t + 1e-6));
      }
    }
    // --- child encounter (coarse scan + bisection refine) ---
    let tEnc = Infinity, encBody = null;
    const L = orbBodyList();
    const span = Math.min(isFinite(el.period) ? el.period * 1.02 : 1e9,
                          Math.min(tEsc, tImp) - t);
    if (isFinite(span) && span > 0) {
      const NS = 96;
      for (let k = 0; k < L.length; k++) {
        const c = L[k];
        if (!c || c === b || c.parent !== b || !(c.mu > 0)) continue;
        const cs = orbBodySoi(c);
        if (!isFinite(cs)) continue;
        let prev = Infinity;
        for (let s = 1; s <= NS; s++) {
          const ts = t + span * (s / NS);
          orbToState(el, ts, _orb8, null);
          orbBodyStateAt(c, ts, _orb9, null);
          orbBodyStateAt(b, ts, _orb10, null);
          vsub(_orb11, _orb9, _orb10);              // child relative to b
          const d = vdist(_orb8, _orb11) - cs;
          if (d < 0) {
            // bisect between the previous sample and this one
            let lo = t + span * ((s - 1) / NS), hi = ts;
            for (let it = 0; it < 24; it++) {
              const mid = 0.5 * (lo + hi);
              orbToState(el, mid, _orb8, null);
              orbBodyStateAt(c, mid, _orb9, null);
              orbBodyStateAt(b, mid, _orb10, null);
              vsub(_orb11, _orb9, _orb10);
              if (vdist(_orb8, _orb11) - cs < 0) hi = mid; else lo = mid;
            }
            if (hi < tEnc) { tEnc = hi; encBody = c; }
            break;
          }
          prev = d;
        }
      }
    }

    const tNext = Math.min(tEsc, tImp, tEnc);
    if (!isFinite(tNext)) { P.t1 = Infinity; n++; break; }
    P.t1 = tNext;
    if (tNext === tImp) { P.kind = 'impact'; n++; break; }
    P.kind = (tNext === tEnc) ? 'encounter' : 'escape';
    n++;
    if (n >= maxPatches) break;

    // hand over: absolute state is continuous, only the frame changes
    orbToState(el, tNext, _orb8, _orb9);            // rel to b
    orbBodyStateAt(b, tNext, _orb10, _orb11);       // b absolute
    vadd(_orb8, _orb8, _orb10); vadd(_orb9, _orb9, _orb11);   // absolute
    const nb = (tNext === tEnc) ? encBody : b.parent;
    if (!nb || !(nb.mu > 0)) break;
    orbBodyStateAt(nb, tNext, _orb12, _orb13);
    vsub(pr, _orb8, _orb12); vsub(vr, _orb9, _orb13);
    b = nb; t = tNext + 1e-3;
  }
  return n;
}

/* ============================================================================
   ================================ SHIP ======================================
   ========================================================================== */

/* ---- configuration ---- */
const fltCfg = {
  dryMass: 4200,            // kg
  fuelCap: 6800,            // kg of LF/OX
  monoCap: 240,             // kg of monopropellant
  len: 9.0, rad: 1.9,       // hull envelope, m
  comDryZ: 0.35,            // dry centre of mass, model Z (+Z is aft)
  comFuelZ: 1.10,           // propellant centroid, model Z
  refArea: 11.3,            // pi*rad^2, m^2
  refLen: 4.5,              // aerodynamic reference length, m
  copZ: 2.05,               // centre of pressure, model Z — AFT of the CoM,
                            // which is what makes the ship weathercock
  cd0: 0.42, cdMax: 1.45,   // axial / broadside drag coefficient
  clAlpha: 1.65,            // lift-curve slope, per radian (blunt body)
  alphaCrit: 0.28,          // 16 deg — stall onset
  cmq: 0.55,                // pitch-damping coefficient
  ctrlAuth: 0.055,          // control-surface authority coefficient
  noseRadius: 1.15,         // m, for Sutton-Graves
  stagArea: 4.2, radArea: 62,
  skinMass: 380, skinCp: 900,
  skinMaxT: 2350,           // K, above which the hull ablates
  wheelTorque: 9000,        // N.m
  wheelMomentum: 60000,     // N.m.s before saturation
  wheelPower: 900,          // W at full torque
  batteryJ: 3.2e7,          // J  (~8.9 kWh)
  panelArea: 26, panelEff: 0.29,
  baseLoad: 320,            // W housekeeping
  o2Seconds: 45 * 86400,    // life support endurance at full tank
  rcsThrust: 400,           // N per port
  rcsIsp: 240,
  rcsPulse: 0.11,           // s, PWM period for discrete bursts
  gearBreakV: 12,           // m/s vertical impact limit
  gearK: 130000, gearCComp: 23000, gearCReb: 46000,
  muS: 0.90, muK: 0.65
};

/* ---- ship construction ---- */
function fltMakeEngine(x, y, z, thrust, ispV, ispS, gimb) {
  return {
    pos: v3(x, y, z),                 // model space
    dir: v3(0, 0, -1),                // FORCE direction on the ship (nose = -Z)
    dirCur: v3(0, 0, -1),             // after gimbal — VFX plume is -dirCur
    thrustVac: thrust, ispVac: ispV, ispSL: ispS,
    gimbalMax: gimb * DEG, gimbalRate: 25 * DEG,
    gimbalX: 0, gimbalY: 0, gimbalCmdX: 0, gimbalCmdY: 0,
    spool01: 0, cmd01: 0, thrustNow: 0, mdot: 0,
    flameout: false, fire01: 0
  };
}
function fltMakePort(px, py, pz, dx, dy, dz, thrust, idx) {
  return {
    pos: v3(px, py, pz),
    dir: vnorm(v3(), v3(dx, dy, dz)),  // FORCE direction on the ship
    thrust: thrust,
    level: 0,                          // solver duty 0..1
    fire01: 0,                         // discrete valve state (VFX)
    phase: (idx * 0.6180339887) % 1    // PWM dither offset
  };
}
function fltMakeLeg(px, py, pz, dx, dy, dz) {
  return {
    pos: v3(px, py, pz), dir: vnorm(v3(), v3(dx, dy, dz)),
    rest: 2.4, stroke: 0.62,
    compression: 0, compression01: 0, rate: 0,
    contact: false, dustRate: 0, broken: false,
    foot: v3(), normal: v3(0, 1, 0), load: 0
  };
}

function fltMakeShip() {
  const C = fltCfg;
  const engines = [fltMakeEngine(0, 0, 3.90, 210000, 345, 285, 6)];
  const ports = [];
  const T = C.rcsThrust;
  let idx = 0;
  for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) {
    const px = 1.55 * sx, pz = 2.55 * sz, py = 0.10;
    ports.push(fltMakePort(px, py, pz, 0, 1, 0, T, idx++));      // push +Y
    ports.push(fltMakePort(px, py, pz, 0, -1, 0, T, idx++));     // push -Y
    ports.push(fltMakePort(px, py, pz, -sx, 0, 0, T, idx++));    // push inboard
    ports.push(fltMakePort(px, py, pz, 0, 0, -sz, T, idx++));    // push axially
  }
  const gear = [];
  for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2)
    gear.push(fltMakeLeg(2.15 * sx, -1.45, 2.60 * sz, 0.45 * sx, -1, 0.33 * sz));

  return {
    /* ---- contract fields ---- */
    pos: v3(), vel: v3(), quat: new Float64Array([0, 0, 0, 1]), angVel: v3(),
    mass: C.dryMass + C.fuelCap + C.monoCap, dryMass: C.dryMass,
    throttle: 0, rcs: v3(), translate: v3(),
    sas: true, sasMode: 'stability', gearDown: false, brakes: false,
    fuel: 1, oxygen: 1, hull: 1, power: 1,
    maxThrust: 210000, engines: engines, rcsPorts: ports, gear: gear,
    soi: null, orbit: orbElements(),

    /* ---- B3 extensions ---- */
    rcsOn: true,
    fuelMass: C.fuelCap, monoMass: C.monoCap, mono: 1,
    com: v3(0, 0, C.comDryZ), inertia: v3(1, 1, 1), invInertia: v3(1, 1, 1),
    angVelWorld: v3(),
    wheelH: v3(), wheelSat: 0,
    altitude: Infinity, altitudeAGL: Infinity, groundR: 0,
    speed: 0, vspeed: 0, hspeed: 0, gForce: 0,
    surfVel: v3(), airVel: v3(),
    rho: 0, pressRatio: 0, mach: 0, dynPres: 0, aoa: 0, slip: 0,
    skinT: 290, coreT: 290, heatFlux: 0, reentry: 0,
    ispEff: 345, twr: 0, dvRemaining: 0,
    onRails: false, landed: false, settleTimer: 0, contactCount: 0,
    target: null, phase: 'space',
    thrustNow: 0, accel: v3(), torqueCmd: v3(), attErr: 0,
    ok: true
  };
}

let SHIP = fltMakeShip();

/* ---- flt scratch (never touch _v0.._v9 / _orb*) ---- */
const _flt0 = v3(), _flt1 = v3(), _flt2 = v3(), _flt3 = v3(), _flt4 = v3();
const _flt5 = v3(), _flt6 = v3(), _flt7 = v3(), _flt8 = v3(), _flt9 = v3();
const _flt10 = v3(), _flt11 = v3(), _flt12 = v3(), _flt13 = v3(), _flt14 = v3();
const _fltq0 = new Float64Array(4), _fltq1 = new Float64Array(4), _fltq2 = new Float64Array(4);
const fltFrc = v3();        // accumulated world force
const fltTrq = v3();        // accumulated BODY torque
const fltAccW = v3();       // cached linear acceleration (world)
const fltAlphaB = v3();     // cached angular acceleration (body)
const fltAtmoOut = { rho: 0, press: 0, temp: 0, sos: 340, g: 9.81 };
