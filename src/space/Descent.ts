import { BODY, BodyDef } from './Bodies';
import { pole } from './Ephemeris';
import { add, cross, dot, norm, propagate, scale, sub, unit, V3 } from './Kepler';

/*
 * Guided flight between a parking orbit and a landing site, as a double-precision point mass about the body:
 *
 *   descent  wait for the window -> deorbit burn -> coast -> lifting entry (worlds with air) -> powered braking
 *            -> the gate above the site, where the surface zone takes over for the terminal descent
 *   ascent   from the surface (handed over a few kilometres up) -> powered ascent straight into a rendezvous
 *            point behind the Endurance, matching its velocity
 *
 * Gravity is the body's (point mass); the air co-rotates with the body (exponential density); entry flies with
 * lift up or down to hold a shallow glide (a lifting body, L/D 0.6). Powered phases use zero-effort-miss /
 * zero-effort-velocity feedback guidance (optimal for a constant gravity field; the field is updated every step,
 * with the centrifugal relief of the horizontal speed, so it converges from orbital speed).
 */

export interface Perf {
  /** total thrust of the engines used for braking and ascent (N), effective exhaust speed (m/s), masses (kg) */
  thrust: number;
  ve: number;
  dry: number;
  fuel: number;
  /** drag area (m^2): belly into the flow in entry, engine-first while braking, nose-first climbing; L/D in entry */
  cdA: number;
  cdANose: number;
  cdAEntry: number;
  ld: number;
}

/** A place on the rotating surface: state relative to the body centre (inertial axes) at sim time t. */
export type SiteFn = (t: number) => { r: V3; v: V3; up: V3 };
/** A moving point to meet in orbit (the rendezvous point behind the Endurance). */
export type TargetFn = (t: number) => { r: V3; v: V3 };

export type FlightPhase = 'wait' | 'deorbit' | 'coast' | 'entry' | 'braking' | 'gate' | 'terminal' | 'landed' | 'ascent' | 'pitch' | 'insert' | 'close' | 'trim' | 'done';

export const GATE_ALT = 1200;        // m above the site: where the terminal descent starts
export const GATE_VZ = -28;          // m/s vertical speed at the gate
export const HANDOVER_ALT = 9000;    // m: the surface zone takes over below this height above the site

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Angular velocity of a body's rotation (inertial, rad/s). */
export function spinVector(b: BodyDef): V3 {
  if (!b.rotation) return [0, 0, 0];
  return scale(pole(b.id), (2 * Math.PI) / b.rotation);
}

export class GuidedFlight {
  t = 0;
  phase: FlightPhase = 'wait';
  /** commanded thrust acceleration (inertial, m/s^2) and throttle 0..1 for the visuals */
  aT: V3 = [0, 0, 0];
  throttle = 0;
  fuel: number;
  /** entry heating 0..1 (plasma), dynamic pressure (Pa) */
  heat = 0;
  q = 0;
  /** remaining time for the powered phase (s) */
  tgo = 0;
  private omega: V3;
  private mu: number;
  private rp = 0;
  tDeorbit = 0;
  /** surface altitude above the reference sphere at the site (m) */
  siteH = 0;
  /** planned time of arrival at the rendezvous point (ascent) */
  tArrive = 0;
  /** height of the craft's reference point above the ground when it stands on its gear (m) */
  touchH = 0;

  /** time of the vertical rise off the pad to ASCENT_RISE metres */
  static ascentRiseTime(b: BodyDef, aMax: number) {
    const a = aMax * 0.9 - b.GM / (b.R * b.R);
    return Math.sqrt((2 * GuidedFlight.ASCENT_RISE) / Math.max(1, Math.min(a, 14)));
  }
  /** duration of the powered insertion to orbital speed */
  static insertionTime(vOrb: number, aMax: number) { return Math.max(60, (vOrb / (0.5 * aMax)) * 1.25); }
  static readonly ASCENT_RISE = 600;
  /** dynamic pressure the climb is held under (Pa) */
  static readonly Q_MAX = 25000;

  /** height at the end of the pitch program: six scale heights in air (dynamic pressure low), a few km without */
  turnHeight() {
    const a = this.body.atmosphere;
    if (!a) return 6000;
    // where the air is thin enough for orbital speed (q ~ 2 kPa), but no higher than six scale heights
    const vOrb = Math.sqrt(this.mu / this.body.R);
    return Math.max(12000, Math.min(6 * a.H, a.H * Math.log((a.rho0 * vOrb * vOrb) / 4000)));
  }

  /** horizontal direction along the Endurance's orbit (prograde) at the ship */
  downrange(): V3 {
    const up = unit(this.r);
    const tg = this.target ? this.target(this.t) : null;
    const h = tg ? unit(cross(tg.r, tg.v)) : unit(cross(this.r, this.v));
    return unit(cross(h, up));
  }

  constructor(public body: BodyDef, public r: V3, public v: V3, public perf: Perf, public program: 'descent' | 'ascent', public site: SiteFn, public target: TargetFn | null = null) {
    this.fuel = perf.fuel;
    this.omega = spinVector(body);
    this.mu = body.GM;
    if (program === 'ascent') { this.phase = 'ascent'; }
  }

  get mass() { return this.perf.dry + this.fuel; }
  get alt() { return norm(this.r) - this.body.R; }
  /** height above the landing site's ground level */
  get height() { return norm(this.r) - this.body.R - this.siteH; }
  get aMax() { return this.perf.thrust / this.mass; }

  /** air velocity: relative to the co-rotating atmosphere */
  airVel(): V3 { return sub(this.v, cross(this.omega, this.r)); }

  density(alt = this.alt) {
    const a = this.body.atmosphere;
    if (!a || alt > a.top) return 0;
    return a.rho0 * Math.exp(-Math.max(0, alt) / a.H);
  }

  /** ground range (m) from the ship's sub-point to the site, along the surface */
  rangeTo(siteR: V3) {
    const c = Math.max(-1, Math.min(1, dot(unit(this.r), unit(siteR))));
    return Math.acos(c) * this.body.R;
  }

  /** periapsis radius of the current orbit */
  periapsis() {
    const r = norm(this.r), v2 = dot(this.v, this.v);
    const h = norm(cross(this.r, this.v));
    const E = v2 / 2 - this.mu / r;
    if (E >= 0) return h * h / this.mu / 2;
    const a = -this.mu / (2 * E);
    const e = Math.sqrt(Math.max(0, 1 - (h * h) / (this.mu * a)));
    return a * (1 - e);
  }

  /**
   * The attitude the Ranger flies in this phase (inertial): nose direction and belly-up direction. Main engines push
   * along the nose; the lift engines push along the belly-up axis. Returns which engines are firing.
   */
  attitude(): { fwd: V3; up: V3; engines: 'main' | 'lift' | 'none' } {
    const radial = unit(this.r);
    const ortho = (f: V3, u: V3): V3 => { const o = sub(u, scale(f, dot(u, f))); return norm(o) > 1e-6 ? unit(o) : unit(cross(f, [0, 0, 1])); };
    const thr = norm(this.aT) > 1e-3;
    switch (this.phase) {
      case 'entry': {
        // belly into the flow, nose 40 degrees above the air velocity
        const va = unit(this.airVel());
        const lat = unit(cross(va, radial));
        const up0 = ortho(va, radial);
        const k = Math.cos(0.7), sn = Math.sin(0.7);
        const fwd = add(scale(va, k), scale(up0, sn));
        void lat;
        return { fwd, up: ortho(fwd, add(scale(up0, k), scale(va, -sn))), engines: 'none' };
      }
      case 'deorbit': case 'pitch': case 'insert': case 'close': case 'trim': {
        if (!thr) break;
        const f = unit(this.aT);
        return { fwd: f, up: ortho(f, radial), engines: 'main' };
      }
      case 'braking': {
        const st = this.site(this.t);
        const vrel = norm(sub(this.v, st.v));
        if (vrel > 260 && thr) { const f = unit(this.aT); return { fwd: f, up: ortho(f, radial), engines: 'main' }; }
      }
      // falls through
      case 'gate': case 'terminal': case 'ascent': case 'landed': {
        // belly down, lift engines carrying the craft; nose level toward the direction of travel (or along track)
        const u = thr && dot(this.aT, radial) > 0 ? unit(this.aT) : radial;
        const vh = sub(this.v, scale(radial, dot(this.v, radial)));
        const st = this.site(this.t);
        const rel = sub(vh, sub(st.v, scale(radial, dot(st.v, radial))));
        const heading = norm(rel) > 3 ? rel : this.target ? this.downrange() : (norm(vh) > 1 ? vh : cross([0, 0, 1], radial));
        const fwd = ortho(u, heading);
        return { fwd, up: u, engines: thr ? 'lift' : 'none' };
      }
    }
    // coasting: nose along the velocity, belly toward the ground
    const f = unit(this.v);
    return { fwd: f, up: ortho(f, radial), engines: 'none' };
  }

  /** Arm the descent: deorbit at tD into an orbit with periapsis radius rp. */
  armDescent(tD: number, rp: number) {
    this.tDeorbit = tD;
    this.rp = rp;
    this.phase = 'wait';
  }

  // ------------------------------------------------------------------------------------------ guidance
  /** ZEM/ZEV acceleration toward (rT, vT) in tgo seconds with gravity g. */
  private zem(rT: V3, vT: V3, g: V3, tgo: number): V3 {
    const zem = sub(rT, add(add(this.r, scale(this.v, tgo)), scale(g, 0.5 * tgo * tgo)));
    const zev = sub(vT, add(this.v, scale(g, tgo)));
    return add(scale(zem, 6 / (tgo * tgo)), scale(zev, -2 / tgo));
  }

  /**
   * ZEM/ZEV in curvilinear coordinates about the body (downrange along the great circle to the target, crossrange,
   * height): straight-line prediction in these coordinates follows the curve of the ground, and the vertical
   * "gravity" includes the centrifugal relief of the horizontal speed, so the law works from orbital speed down to
   * a hover and from the ground up to orbit.
   */
  private curvZem(rT: V3, vT: V3, tgo: number): V3 {
    const r = norm(this.r), up = scale(this.r, 1 / r);
    const uT = unit(rT);
    let sHat = sub(uT, scale(up, dot(uT, up)));
    if (norm(sHat) < 1e-7) sHat = sub(this.v, scale(up, dot(this.v, up)));
    if (norm(sHat) < 1e-9) sHat = unit(cross(up, [0, 0, 1]));
    sHat = unit(sHat);
    const cHat = cross(up, sHat);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(up, uT))));
    const sT = ang * r, hT = norm(rT) - r;
    const vs = dot(this.v, sHat), vc = dot(this.v, cHat), vr = dot(this.v, up);
    const gh = -this.mu / (r * r) + (vs * vs + vc * vc) / r;
    const vTs = dot(vT, sHat), vTc = dot(vT, cHat), vTr = dot(vT, uT);
    const k1 = 6 / (tgo * tgo), k2 = -2 / tgo;
    const as = k1 * (sT - vs * tgo) + k2 * (vTs - vs);
    const ac = k1 * (-vc * tgo) + k2 * (vTc - vc);
    const ah = k1 * (hT - vr * tgo - 0.5 * gh * tgo * tgo) + k2 * (vTr - vr - gh * tgo);
    return add(add(scale(sHat, as), scale(cHat, ac)), scale(up, ah));
  }

  /** time for a powered phase that has to change the velocity by dv */
  tgoFor(dv: number) { return Math.max(25, dv / (0.5 * this.aMax)); }

  /** speed below which the entry glide hands over to the powered descent */
  static readonly ENTRY_EXIT = 650;

  private guide(): V3 {
    const zero: V3 = [0, 0, 0];
    switch (this.phase) {
      case 'wait':
        if (this.t >= this.tDeorbit) this.phase = 'deorbit'; else return zero;
      // falls through
      case 'deorbit': {
        // retrograde burn sized to put the periapsis at rp half an orbit on (no overshoot: the last step is trimmed)
        const r = norm(this.r), up = scale(this.r, 1 / r);
        const vh = norm(sub(this.v, scale(up, dot(this.v, up))));
        const vNew = Math.sqrt((2 * this.mu * this.rp) / (r * (r + this.rp)));
        const need = vh - vNew;
        if (need <= 0.05 || this.periapsis() <= this.rp) { this.phase = 'coast'; return zero; }
        return scale(unit(this.v), -Math.min(this.aMax, need / 0.25));
      }
      case 'coast': {
        const air = this.body.atmosphere;
        if (air && this.alt < air.top) { this.phase = 'entry'; return zero; }
        if (!air) {
          const s = this.site(this.t);
          const vrel = norm(sub(this.v, s.v));
          if (this.rangeTo(s.r) <= this.brakeRange(vrel, this.vhRel(s.v), Math.min(this.height, this.rp - this.body.R - this.siteH))) { this.startBraking(); return this.guide(); }
        }
        return zero;
      }
      case 'entry': {
        const va = norm(this.airVel());
        // the glide ends low and slow: the air does most of the braking (near terminal speed in thick air)
        if ((va < GuidedFlight.ENTRY_EXIT && this.height < 14000) || this.height < 9000) { this.startBraking(); return this.guide(); }
        return zero;
      }
      case 'braking': {
        const tgo = Math.max(1, this.tgo);
        const s = this.site(this.t + tgo);
        const rT = add(s.r, scale(s.up, GATE_ALT + this.siteH));
        const vT = add(s.v, scale(s.up, GATE_VZ));
        let a = this.curvZem(rT, vT, tgo);
        // never sink below the gate height while still on the way to it
        const up = unit(this.r), vr = dot(this.v, up);
        const vrMin = -Math.max(4, 0.06 * (this.height - GATE_ALT * 0.7));
        if (vr < vrMin && this.rangeTo(s.r) > 300) {
          const g = this.mu / dot(this.r, this.r);
          const need = g + (vrMin - vr) * 0.6, au = dot(a, up);
          if (au < need) a = add(a, scale(up, need - au));
        }
        // the drag already does part of the braking
        return sub(a, this.dragAccel());
      }
      case 'ascent': {
        // straight up off the pad
        const up = unit(this.r);
        const g = this.mu / dot(this.r, this.r);
        if (this.height > GuidedFlight.ASCENT_RISE) { this.phase = 'pitch'; return this.guide(); }
        return scale(up, Math.min(this.aMax, g + 12));
      }
      case 'pitch': {
        // gravity-turn-like climb: a vertical-speed profile that dies away at the turn height, the speed held under
        // a dynamic-pressure limit in the air, and all the thrust that is left pushing downrange
        const up = unit(this.r), dr = this.downrange();
        const turnH = this.turnHeight();
        const vOrb = Math.sqrt(this.mu / norm(this.r));
        const vh = dot(this.v, dr);
        if (this.height >= turnH * 0.98 || vh > 0.75 * vOrb) { this.startInsertion(); return this.guide(); }
        const vr = dot(this.v, up), va = norm(this.airVel());
        const rho = this.density();
        const vmax = rho > 0 ? Math.sqrt((2 * GuidedFlight.Q_MAX) / rho) : Infinity;
        const vrT = Math.min(Math.sqrt(2 * 4 * Math.max(0, turnH - this.height)), 0.9 * vmax);
        const gh = this.mu / dot(this.r, this.r) - Math.max(0, dot(this.v, dr)) ** 2 / norm(this.r);
        const av = Math.max(0, Math.min(this.aMax, gh + 0.5 * (vrT - vr)));
        const room = Math.sqrt(Math.max(0, this.aMax * this.aMax - av * av));
        const ah = isFinite(vmax) ? room * Math.max(0, Math.min(1, (vmax - va) / (0.15 * vmax))) : room;
        return add(scale(up, av), scale(dr, ah));
      }
      case 'insert': {
        // into the Endurance's orbit: its plane, its radius, circular speed; the along-track point is left free
        const tg = this.target!(this.t);
        const hH = unit(cross(tg.r, tg.v)), rT = norm(tg.r);
        const tgo = Math.max(3, this.tgo);
        // aim where the ship gets to while it accelerates to orbital speed (average of now and then), in the plane
        const vO = Math.sqrt(this.mu / rT);
        let p = add(this.r, scale(add(this.v, scale(this.downrange(), vO)), tgo / 2));
        p = sub(p, scale(hH, dot(p, hH)));
        const rTgt = scale(unit(p), rT);
        const vTgt = scale(unit(cross(hH, rTgt)), Math.sqrt(this.mu / rT));
        let a = this.curvZem(rTgt, vTgt, tgo);
        // never sink back toward the ground low down
        const up = unit(this.r), vr = dot(this.v, up);
        if (this.height < 20000 && vr < 30) {
          const g = this.mu / dot(this.r, this.r);
          const need = g + (30 - vr) * 0.2;
          const au = dot(a, up);
          if (au < need) a = add(a, scale(up, need - au));
        }
        return sub(a, this.dragAccel());
      }
      case 'close': {
        // the last few kilometres to the rendezvous point behind the Endurance
        const tg = this.target!(this.t + Math.max(1, this.tgo));
        return this.zem(tg.r, tg.v, scale(this.r, -this.mu / norm(this.r) ** 3), Math.max(1, this.tgo));
      }
      case 'gate':
        this.phase = 'terminal';
      // falls through
      case 'terminal': {
        // straight down onto the pad: descent rate easing with height, horizontal position and drift nulled
        const st = this.site(this.t), up = st.up;
        const rel = sub(this.r, st.r);
        const h = dot(rel, up) - this.siteH - this.touchH;
        const off = sub(rel, scale(up, dot(rel, up)));
        const vrel = sub(this.v, st.v), vz = dot(vrel, up), vh = sub(vrel, scale(up, vz));
        if (h <= 0.02 && vz <= 0.5) { this.phase = 'landed'; return zero; }
        // slow enough near the ground, and never descend faster than the remaining height allows
        const vzT = -Math.max(1.0, Math.min(-GATE_VZ, 0.05 * h + 0.8));
        const g = this.mu / dot(this.r, this.r);
        const aSite = cross(this.omega, cross(this.omega, st.r));
        const az = g + (vzT - vz) * 1.6 + dot(aSite, up);
        const ah = add(add(scale(off, -0.05), scale(vh, -0.55)), sub(aSite, scale(up, dot(aSite, up))));
        return add(scale(up, az), ah);
      }
      case 'trim': {
        // null the last of the relative velocity (gravity acts alike on both: no compensation needed)
        const tg = this.target!(this.t);
        const dv = sub(tg.v, this.v);
        if (norm(dv) < 0.3 || this.fuel <= 0) { this.phase = 'done'; return zero; }
        return scale(dv, 1 / 2);
      }
      default:
        return zero;
    }
  }

  /** duration of the powered descent from this state: the speed to kill and the height to lose */
  brakeTime(vrel: number, height = this.height) { return Math.max(this.tgoFor(vrel), (height - GATE_ALT) / 120 + 10); }

  /** ground range the powered descent covers (the uprange distance to start it at) */
  brakeRange(vrel: number, vh = vrel, height = this.height) { return 0.5 * vh * this.brakeTime(vrel, height) + 2000; }

  /** horizontal speed relative to the ground under the site */
  vhRel(sv: V3) {
    const up = unit(this.r), d = sub(this.v, sv);
    return norm(sub(d, scale(up, dot(d, up))));
  }

  /** Braking: the time to the gate from the speed to kill and the thrust available. */
  startBraking() {
    this.phase = 'braking';
    const s = this.site(this.t);
    const vrel = norm(sub(this.v, s.v));
    const range = this.rangeTo(s.r);
    this.tgo = Math.min(900, Math.max(this.brakeTime(vrel), (1.6 * range) / Math.max(this.vhRel(s.v), 60)));
  }

  startInsertion() {
    this.phase = 'insert';
    const tg = this.target!(this.t);
    const vOrb = Math.sqrt(this.mu / norm(tg.r));
    this.tgo = GuidedFlight.insertionTime(Math.max(300, vOrb - Math.max(0, dot(this.v, this.downrange()))), this.aMax);
  }

  /** after insertion: a short transfer to the rendezvous point, then a velocity trim */
  startClose() {
    const tg = this.target!(this.t);
    const d = norm(sub(tg.r, this.r));
    this.phase = 'close';
    this.tgo = Math.max(30, Math.min(240, d / 40));
  }

  /** drag area for the attitude flown in this phase */
  cdA() {
    const p = this.phase;
    return p === 'entry' ? this.perf.cdAEntry : p === 'ascent' || p === 'pitch' || p === 'insert' || p === 'trim' ? this.perf.cdANose : this.perf.cdA;
  }

  private dragAccel(): V3 {
    const rho = this.density();
    if (rho <= 0) return [0, 0, 0];
    const va = this.airVel(), s = norm(va);
    return scale(va, (-0.5 * rho * this.cdA() * s) / this.mass);
  }

  /**
   * Lift in entry: bank to hold a shallow glide (vertical part) and to steer toward the site's ground track
   * (lateral part), as a lifting body does to cover cross-range.
   */
  private liftAccel(drag: V3): V3 {
    if (this.phase !== 'entry') return [0, 0, 0];
    const va = this.airVel(), up = unit(this.r);
    const vr = dot(va, up), s = norm(va), vh = unit(va);
    // hold a shallow glide; full lift up when the deceleration passes 3 g; never steer hard into the thick air
    const vrWant = -Math.max(20, 0.012 * s);
    let lamV = Math.max(-0.3, Math.min(1, (vrWant - vr) * 0.03));
    if (norm(drag) > 3 * 9.81) lamV = 1;
    // cross-range to the site, relative to the remaining range: bank toward it with what lift is left
    const site = this.site(this.t).r;
    const lat = unit(cross(up, vh));
    const d = sub(site, this.r);
    const cr = dot(d, lat), rg = Math.max(20000, dot(d, vh));
    const want = Math.max(-1, Math.min(1, (cr / rg) * 6));
    const room = Math.sqrt(Math.max(0, 1 - lamV * lamV));
    const lamL = want * room;
    const lv = unit(sub(up, scale(vh, dot(up, vh))));
    return scale(add(scale(lv, lamV), scale(lat, lamL)), this.perf.ld * norm(drag));
  }

  // ------------------------------------------------------------------------------------------ integration
  private accel(r: V3, v: V3, aT: V3): V3 {
    const rr = norm(r);
    let a = scale(r, -this.mu / (rr * rr * rr));
    a = add(a, aT);
    const rho = this.density(rr - this.body.R);
    if (rho > 0) {
      const va = sub(v, cross(this.omega, r)), s = norm(va);
      const d = scale(va, (-0.5 * rho * this.cdA() * s) / this.mass);
      a = add(add(a, d), this.liftAccel(d));
    }
    return a;
  }

  /** Advance dt seconds (sub-stepped; analytic in coast above the air). */
  step(dt: number) {
    if (this.phase === 'landed') {
      // standing on the pad: carried round with the body's rotation
      this.t += dt;
      const st = this.site(this.t);
      this.r = add(st.r, scale(st.up, this.siteH + this.touchH));
      this.v = st.v;
      this.aT = [0, 0, 0]; this.throttle = 0; this.heat = 0; this.q = 0;
      return;
    }
    let left = dt;
    while (left > 1e-9) {
      if ((this.phase as FlightPhase) === 'landed') { this.t += left; break; }
      const air = this.body.atmosphere;
      const coasting = (this.phase === 'wait' || this.phase === 'coast') && (!air || this.alt > air.top);
      if (coasting) {
        // analytic Kepler coast, in slices so phase changes are caught
        const h = Math.min(left, this.phase === 'wait' ? Math.max(0.05, this.tDeorbit - this.t) : 5);
        const s = propagate(this.r, this.v, this.mu, h);
        this.r = s.r; this.v = s.v; this.t += h; left -= h;
        this.aT = [0, 0, 0]; this.throttle = 0;
        this.guide();
        continue;
      }
      const h = Math.min(left, this.phase === 'entry' ? 1 : 0.25);
      let aT = this.guide();
      const am = norm(aT), lim = this.fuel > 0 ? this.aMax : 0;
      if (am > lim) aT = scale(aT, lim / am);
      this.aT = aT;
      this.throttle = lim > 0 ? Math.min(1, norm(aT) / lim) : 0;
      // RK4 with the thrust held over the step
      const r0 = this.r, v0 = this.v;
      const k1v = this.accel(r0, v0, aT), k1r = v0;
      const k2v = this.accel(add(r0, scale(k1r, h / 2)), add(v0, scale(k1v, h / 2)), aT), k2r = add(v0, scale(k1v, h / 2));
      const k3v = this.accel(add(r0, scale(k2r, h / 2)), add(v0, scale(k2v, h / 2)), aT), k3r = add(v0, scale(k2v, h / 2));
      const k4v = this.accel(add(r0, scale(k3r, h)), add(v0, scale(k3v, h)), aT), k4r = add(v0, scale(k3v, h));
      this.r = add(r0, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6));
      this.v = add(v0, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6));
      this.fuel = Math.max(0, this.fuel - (this.mass * norm(aT) * h) / this.perf.ve);
      this.t += h; left -= h;
      if (this.phase === 'braking' || this.phase === 'insert' || this.phase === 'close') this.tgo -= h;
      // entry heating: convective flux ~ sqrt(rho) v^3 (Sutton-Graves), normalised so a hard entry glows fully
      const rho = this.density();
      const va = norm(this.airVel());
      this.q = 0.5 * rho * va * va;
      this.heat = Math.min(1, (Math.sqrt(rho) * va * va * va) / 2.5e10);
      if (this.phase === 'braking' && this.tgo <= 0.5) this.phase = 'terminal';
      if (this.phase === 'insert' && this.tgo <= 3) this.startClose();
      else if (this.phase === 'close' && this.tgo <= 1) this.phase = 'trim';
    }
  }
}

// ------------------------------------------------------------------------------------------ planning
/**
 * Choose the deorbit: periapsis low over the site (or just inside the air for an entry) and the burn timed so the
 * powered descent starts the right distance uprange. A reference descent is flown in simulation to measure how far
 * round the body the deorbit, coast and entry glide carry the ship; the first pass where the site will be that far
 * ahead (and close enough to the ground track: the site turns under the orbit with the body's rotation) gives the
 * burn time, which is then refined by bisection on the simulated miss.
 */
export function planDescent(body: BodyDef, r: V3, v: V3, perf: Perf, site: SiteFn, opts: { maxCross?: number; horizon?: number; siteH?: number; ok?: (t: number) => boolean } = {}) {
  const mu = body.GM;
  const rr = norm(r), n = Math.sqrt(mu / rr ** 3), P = (2 * Math.PI) / n;
  const air = body.atmosphere;
  const rp = air ? body.R + Math.min(air.top * 0.45, 40000) : body.R + (opts.siteH ?? 0) + 15000;
  const hHat = unit(cross(r, v));
  const maxCross = opts.maxCross ?? (4 * Math.PI) / 180;
  const horizon = opts.horizon ?? Math.max(P * 40, 32 * 86400);
  /** signed angle from a to b about the orbit normal (positive ahead), -pi..pi */
  const angle = (a: V3, b: V3) => Math.atan2(dot(cross(a, b), hHat), dot(a, b));
  // fly the descent from a burn at tD: travel angle, duration and the miss (range left minus range wanted)
  const fly = (tD: number) => {
    const f = new GuidedFlight(body, r, v, perf, 'descent', site);
    f.siteH = opts.siteH ?? 0;
    f.armDescent(tD, rp);
    let guard = 0, travel = 0, prev: V3 | null = null;
    while (f.phase !== 'braking' && f.phase !== 'gate' && guard++ < 200000) {
      f.step(f.phase === 'wait' ? Math.max(1, tD - f.t) : 2);
      if (f.phase !== 'wait') { if (prev) travel += angle(prev, f.r); prev = f.r; }
    }
    const s = f.site(f.t);
    const vrel = norm(sub(f.v, s.v));
    const want = f.brakeRange(vrel, f.vhRel(s.v));
    const ahead = angle(f.r, sub(s.r, scale(hHat, dot(s.r, hHat))));
    return { miss: ahead - want / body.R, tB: f.t - tD, travel, want, f };
  };
  const ref = fly(0);
  const lead = ref.travel + ref.want / body.R;
  // the site's projection on the orbit plane, seen from the burn point, at the time the braking would start
  const shipAt = (t: number) => propagate(r, v, mu, t).r;
  const geo = (tD: number) => {
    const sr = site(tD + ref.tB).r;
    const proj = sub(sr, scale(hHat, dot(sr, hHat)));
    let d = angle(shipAt(tD), proj) - lead;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return { d, cross: Math.asin(Math.max(-1, Math.min(1, dot(unit(sr), hHat)))) };
  };
  let tCand = -1;
  const dt = P / 90;
  for (let t = 0; t < horizon; t += dt) {
    const a = geo(t), b = geo(t + dt);
    // the site falls back relative to the burn point as time goes on: d decreases through zero
    if (a.d > 0 && b.d <= 0 && a.d - b.d < 1 && Math.abs(a.cross) < maxCross) {
      const tc = t + dt * (a.d / (a.d - b.d));
      // e.g. daylight at the site on landing
      if (!opts.ok || opts.ok(tc + ref.tB + 300)) { tCand = tc; break; }
    }
  }
  if (tCand < 0) return null;
  // bracket on the simulated miss (a later burn moves the braking start further on: the miss falls), then bisect
  const miss = (t: number) => fly(Math.max(0, t)).miss;
  let lo = tCand, mLo = miss(lo);
  let hi = lo + mLo / n, mHi = miss(hi);
  for (let k = 0; k < 10 && Math.sign(mLo) === Math.sign(mHi); k++) {
    const stepT = (mHi / n) * 1.3 + Math.sign(mHi) * 10;
    lo = hi; mLo = mHi;
    hi = Math.max(0, hi + stepT); mHi = miss(hi);
  }
  let t1 = Math.abs(mLo) < Math.abs(mHi) ? lo : hi, m1 = Math.min(Math.abs(mLo), Math.abs(mHi));
  if (Math.sign(mLo) !== Math.sign(mHi) && Math.abs(mLo - mHi) < 1) {
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2, mm = miss(mid);
      t1 = mid; m1 = mm;
      if (Math.abs(mm) * body.R < 100) break;
      if (Math.sign(mm) === Math.sign(mLo)) { lo = mid; mLo = mm; } else { hi = mid; mHi = mm; }
    }
  }
  return { tDeorbit: t1, rp, missM: m1 * body.R, cross: geo(t1).cross };
}

/**
 * Ascent window: the launch time from which the rendezvous point behind the Endurance is where a natural ascent
 * arrives (a vertical rise, then about half orbital speed on average downrange during the powered insertion), with
 * the site close to the Endurance's orbit plane. Returns the launch time and the planned arrival time.
 */
export function planAscent(body: BodyDef, site: SiteFn, endurance: TargetFn, perf: Perf, opts: { maxCross?: number; horizon?: number } = {}) {
  const e0 = endurance(0);
  const mu = body.GM, rr = norm(e0.r), n = Math.sqrt(mu / rr ** 3), P = (2 * Math.PI) / n;
  const hHat = unit(cross(e0.r, e0.v));
  const vOrb = Math.sqrt(mu / rr);
  // reference ascent from the site at t = 0: climb, pitch program and insertion into the orbit (free along-track)
  const ref = new GuidedFlight(body, add(site(0).r, scale(site(0).up, 5)), site(0).v, perf, 'ascent', site, endurance);
  let guard = 0;
  while (ref.phase !== 'close' && ref.phase !== 'done' && guard++ < 40000) ref.step(0.5);
  const up0 = unit(site(0).r);
  const proj = (x: V3) => sub(x, scale(hHat, dot(x, hHat)));
  // how far round the ship gets from the site, plus a little: it should come in just behind the Endurance's point
  const theta1 = Math.atan2(dot(cross(proj(up0), proj(ref.r)), hHat), dot(proj(up0), proj(ref.r)));
  const tClimb = ref.t;
  const lead = theta1 + 1000 / rr;
  void vOrb;
  const maxCross = opts.maxCross ?? (4 * Math.PI) / 180;
  const horizon = opts.horizon ?? Math.max(P * 40, 4 * 86400);
  const f = (t: number) => {
    const s = site(t).r, e = endurance(t + tClimb).r;
    const proj = sub(s, scale(hHat, dot(s, hHat)));
    let ang = Math.atan2(dot(cross(proj, e), hHat), dot(proj, e)) - lead;
    ang = Math.atan2(Math.sin(ang), Math.cos(ang));
    return { ang, cross: Math.asin(Math.max(-1, Math.min(1, dot(unit(s), hHat)))) };
  };
  const step = Math.min(P / 90, 600);
  for (let t = 0; t < horizon; t += step) {
    const a = f(t), b = f(t + step);
    // the Endurance gains on the site: the arrival point's lead grows through the wanted value
    if (Math.abs(a.cross) < maxCross && a.ang <= 0 && b.ang > 0 && b.ang - a.ang < 1) {
      let lo = t, hi = t + step;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (f(m).ang <= 0) lo = m; else hi = m; }
      const tL = (lo + hi) / 2;
      return { tLaunch: tL, tArrive: tL + tClimb, cross: f(tL).cross };
    }
  }
  return null;
}

/** The Ranger as a point mass (fictional high-Isp drive: see docs/SPACE.md). */
export function rangerPerf(spec: { dryMass: number; fuelMax: number; main: { thrust: number; isp: number }; lift: { thrust: number; isp: number } }, fuel = spec.fuelMax): Perf {
  const T = spec.main.thrust + spec.lift.thrust;
  const isp = T / (spec.main.thrust / spec.main.isp + spec.lift.thrust / spec.lift.isp);
  return { thrust: T * 0.92, ve: isp * 9.80665, dry: spec.dryMass, fuel, cdA: 40, cdANose: 9, cdAEntry: 110, ld: 0.6 };
}

void smooth; void BODY;
