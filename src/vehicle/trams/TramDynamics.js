// Rail-bound motion of a tram: the track line of a direction, the placement of the body sections on it and
// the longitudinal dynamics (traction, adhesion, brakes, resistance, gradient). A tram has one degree of
// freedom: the arc length s of its front end along the track. Everything else follows from the track.
import { PathSampler } from '../../core/path.js';
import { g } from './TramSpecs.js';

const ROAD_Y = 0.07;
const BED_RAIL = 0.3 + 0.22; // ballast bed + sleeper + rail (TramTracks.js)

/**
 * The track one direction runs on, continued through both terminal loops (the bogies behind the front end
 * still need track at the start, the tram runs into the loop at the end). s = 0 at the first stop.
 */
export class TrackLine {
  constructor(route, dirId, hf) {
    const other = route.other(dirId);
    const dir = route.direction(dirId), od = route.direction(other);
    const inLink = route.terminalLinks[dirId === 'A' ? 'BtoA' : 'AtoB'] || [];
    const outLink = route.terminalLinks[dirId === 'A' ? 'AtoB' : 'BtoA'] || [];
    const pathPts = (P, s0, s1) => {
      const out = [];
      const i0 = P.index(Math.max(0, s0)), i1 = P.index(Math.min(P.length, s1));
      out.push([P.at(Math.max(0, s0)).x, P.at(Math.max(0, s0)).z]);
      for (let i = i0 + 1; i <= i1; i++) out.push([P.x[i], P.z[i]]);
      const e = P.at(Math.min(P.length, s1));
      out.push([e.x, e.z]);
      return out;
    };
    const tail = pathPts(od.path, od.path.length - 120, od.path.length);
    const head = pathPts(od.path, 0, 120);
    const main = pathPts(dir.path, 0, dir.path.length);
    const pts = [];
    let s0 = 0;
    const add = (list, mark = false) => {
      for (const p of list) {
        if (pts.length && Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) < 0.3) continue;
        pts.push(p);
      }
      return mark;
    };
    add(tail);
    add(inLink);
    // the arc length where this direction's path begins
    const pre = new PathSampler(pts.length > 1 ? pts : [[0, 0], [0, 1]]);
    const start = pre.nearest(main[0][0], main[0][1]);
    s0 = pts.length > 1 ? start.s : 0;
    if (pts.length > 1) pts.length = start.i + 1;
    add(main);
    add(outLink);
    add(head);
    this.P = new PathSampler(pts);
    this.s0 = this.P.nearest(main[0][0], main[0][1], s0, 40).s;
    this.length = dir.path.length;
    this.end = this.P.length - this.s0; // beyond the last stop: the loop and the other direction's start
    // rail head height every 2 m: street track at road level, ballast track on its bed
    this.hf = hf;
    const street = trackFlags(route);
    const n = Math.ceil(this.P.length / 2) + 1;
    this.railY = new Float32Array(n);
    this.street = new Uint8Array(n);
    const tmp = {};
    for (let i = 0; i < n; i++) {
      this.P.at(i * 2, tmp);
      const st = street(tmp.x, tmp.z);
      this.street[i] = st ? 1 : 0;
      this.railY[i] = hf.heightAt(tmp.x, tmp.z) + (st ? ROAD_Y + 0.01 : BED_RAIL);
    }
  }

  at(s, out = {}) {
    return this.P.at(s + this.s0, out);
  }

  tangent(s, win = 4, out = {}) {
    return this.P.tangent(s + this.s0, win, out);
  }

  curvature(s, win = 8) {
    return this.P.curvature(s + this.s0, win);
  }

  nearest(x, z, sHint = null, win = 120) {
    const r = this.P.nearest(x, z, sHint == null ? null : sHint + this.s0, win);
    r.s -= this.s0;
    return r;
  }

  /** True where the track lies in the carriageway (street running). */
  streetAt(s) {
    const i = Math.max(0, Math.min(this.street.length - 1, Math.round((s + this.s0) / 2)));
    return this.street[i] === 1;
  }

  /** Rail head height at s (interpolated). */
  y(s) {
    const u = Math.max(0, (s + this.s0) / 2), i = Math.min(this.railY.length - 2, Math.floor(u));
    const f = Math.min(1, u - i);
    return this.railY[i] * (1 - f) + this.railY[i + 1] * f;
  }
}

/** Street-running flag of the nearest track (route.tracks) at a point. */
function trackFlags(route) {
  const H = new Map();
  const key = (x, z) => `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
  for (const t of route.tracks || []) {
    for (const p of t.pts) {
      const k = key(p[0], p[1]);
      if (!H.has(k)) H.set(k, []);
      H.get(k).push([p[0], p[1], t.street]);
    }
  }
  return (x, z) => {
    let best = null, bd = 1e9;
    const gx = Math.floor(x / 10), gz = Math.floor(z / 10);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const a = H.get(`${gx + i},${gz + j}`);
        if (!a) continue;
        for (const q of a) {
          const d = (q[0] - x) ** 2 + (q[1] - z) ** 2;
          if (d < bd) { bd = d; best = q; }
        }
      }
    return best ? best[2] : true;
  };
}

/** World point (x, y, z) on the track at arc length s. */
function pointAt(line, s) {
  const p = line.at(s);
  return [p.x, line.y(s), p.z];
}

/** Pose of a section from its front end d0 and two points A (at dA) and B (at dB) behind it. */
function chordPose(d0, dA, A, dB, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
  const L = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / L, uy = dy / L, uz = dz / L; // pointing backwards along the section
  const back = dA - d0;
  return {
    x: A[0] - ux * back, y: A[1] - uy * back, z: A[2] - uz * back,
    yaw: Math.atan2(ux, uz),
    pitch: Math.atan2(-uy, Math.hypot(ux, uz)), // nose up when the front is higher
    ux, uy, uz, chord: L, dA, dB,
  };
}

/** Point of a posed section at distance d (along the tram) on its centre line. */
function sectionPoint(pose, d0, d) {
  const k = d - d0;
  return [pose.x + pose.ux * k, pose.y + pose.uy * k, pose.z + pose.uz * k];
}

/** Arc position behind sa at which the straight distance to the track point at sa is L (a rigid body). */
function chordBehind(line, sa, L) {
  const A = pointAt(line, sa);
  let sb = sa - L;
  for (let k = 0; k < 3; k++) {
    const B = pointAt(line, sb);
    sb -= L - Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  }
  return sb;
}

/**
 * Track arc positions of the supports that rest on the track (bogies, joints over a Jacobs bogie): d -> s.
 * The first support of the front section is at s - d; each further one where the chord from the previous
 * support of its section equals the body's distance (on a curve slightly more track than body).
 */
export function supportArcs(spec, line, s, out = new Map()) {
  out.clear();
  const car = spec.carried;
  for (const sec of spec.sections) {
    if (car && (sec.id === car.section || sec.supports.some((q) => q.kind === 'joint'))) continue;
    const [a, b] = sec.supports;
    const sa = out.has(a.d) ? out.get(a.d) : s - a.d;
    out.set(a.d, sa);
    if (!out.has(b.d)) out.set(b.d, chordBehind(line, sa, b.d - a.d));
  }
  // the bogie under a section that hangs on a carried module (its position along the track is approximate)
  for (const sec of spec.sections) for (const q of sec.supports) if (q.kind === 'bogie' && !out.has(q.d)) out.set(q.d, s - q.d);
  return out;
}

const ARCS = new Map();

/**
 * Places every section for the front end at arc length s: {id: pose}. Sections on two track supports sit on
 * their chord; a carried module (Schindler) hangs between the front section's rear joint and a joint solved
 * from the rear section's bogie (two circles in plan).
 */
export function placeSections(spec, line, s, out = {}) {
  const car = spec.carried;
  const arcs = supportArcs(spec, line, s, ARCS);
  for (const sec of spec.sections) {
    if (car && (sec.id === car.section || sec.supports.some((q) => q.kind === 'joint'))) continue;
    const [a, b] = sec.supports;
    out[sec.id] = chordPose(sec.d0, a.d, pointAt(line, arcs.get(a.d)), b.d, pointAt(line, arcs.get(b.d)));
  }
  if (car) {
    const front = spec.sections[0];
    const [j1, j2] = car.joints;
    const J1 = sectionPoint(out[front.id], front.d0, j1);
    const rear = spec.sections.find((q) => q.supports.some((p) => p.kind === 'joint' && Math.abs(p.d - j2) < 1e-6) && q.id !== car.section);
    const bog = rear.supports.find((q) => q.kind === 'bogie');
    const B = pointAt(line, arcs.get(bog.d));
    const r1 = j2 - j1, r2 = bog.d - j2;
    const guess = pointAt(line, s - j2);
    const J2 = circleMeet(J1, r1, B, r2, guess);
    J2[1] = guess[1];
    const mid = spec.sections.find((q) => q.id === car.section);
    out[mid.id] = chordPose(mid.d0, j1, J1, j2, J2);
    out[rear.id] = chordPose(rear.d0, j2, J2, bog.d, B);
  }
  return out;
}

/** Poses of the bogies for the front end at s: [{d, x, y, z, yaw, pitch}] (each on the chord of its axles). */
export function bogiePoses(spec, line, s, out = []) {
  const wb = spec.bogies.wheelbase;
  const arcs = supportArcs(spec, line, s, ARCS);
  let i = 0;
  const seen = new Set();
  for (const sec of spec.sections) {
    for (const q of sec.supports) {
      if (q.kind !== 'bogie' || seen.has(q.d)) continue;
      seen.add(q.d);
      const c = arcs.get(q.d);
      const A = pointAt(line, c + wb / 2), B = pointAt(line, c - wb / 2);
      const pz = chordPose(q.d - wb / 2, q.d - wb / 2, A, q.d + wb / 2, B);
      const o = out[i] || (out[i] = {});
      o.d = q.d;
      o.x = (A[0] + B[0]) / 2; o.y = (A[1] + B[1]) / 2; o.z = (A[2] + B[2]) / 2;
      o.yaw = pz.yaw; o.pitch = pz.pitch;
      i++;
    }
  }
  out.length = i;
  return out;
}

/** Intersection of two circles in plan (x, z) nearest to the guess; the guess when they do not meet. */
function circleMeet(A, ra, B, rb, guess) {
  const dx = B[0] - A[0], dz = B[2] - A[2];
  const d = Math.hypot(dx, dz);
  if (d < 1e-6 || d > ra + rb || d < Math.abs(ra - rb)) return [...guess];
  const a = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - a * a));
  const mx = A[0] + (dx * a) / d, mz = A[2] + (dz * a) / d;
  const p1 = [mx + (h * -dz) / d, guess[1], mz + (h * dx) / d];
  const p2 = [mx - (h * -dz) / d, guess[1], mz - (h * dx) / d];
  const d1 = (p1[0] - guess[0]) ** 2 + (p1[2] - guess[2]) ** 2, d2 = (p2[0] - guess[0]) ** 2 + (p2[2] - guess[2]) ** 2;
  return d1 <= d2 ? p1 : p2;
}

/**
 * Longitudinal dynamics. The driver's controller (lever) runs from emergency brake through the brake
 * notches and neutral to the power notches; it is notched, the force follows the notch with a short ramp.
 *   lever > 0: power notch / notches, lever < 0: brake notch / brakeNotches.
 * Traction needs the main switch, the pantograph on the wire, a direction, closed doors and released
 * parking brake; it is limited by adhesion (wet rail: less), the excess slips. Electric (rheostatic) braking
 * fades out below 7 km/h where the friction brake takes over; the emergency brake adds the magnetic track
 * brakes (independent of adhesion).
 */
export class TramPhysics {
  constructor(spec) {
    this.spec = spec;
    const P = spec.physics;
    this.P = P;
    this.mass = P.massEmpty + 4000; // passengers on board (updated by the game)
    this.s = 0;
    this.v = 0;
    this.a = 0;
    this.notch = 0; // -brakeNotches..notches (integer)
    this.force = 0; // smoothed traction / brake demand fraction (-1..1)
    this.selector = 'N'; // D (forward) / N / R
    this.engineOn = false; // main switch
    this.pantoUp = true;
    this.pantoH = 1; // 0 = lowered, 1 = on the wire
    this.parkingBrake = true;
    this.emergency = false;
    this.slip = 0;
    this.wet = 0;
    this.slope = 0;
    this.wireOk = true;
    this.motorLoad = 0;
    this.currentA = 0;
    this.stepJerk = 0;
    this.lastStep = 0;
    // the fields a bus exposes (camera, sounds, scoring, passengers read them; set by TramEntity)
    this.articulated = true;
    this.dims = spec.dims;
    this.x = 0; this.z = 0; this.yaw = 0; // front section: front end on the track, heading
    this.rx = 0; this.rz = 0; this.yawR = 0; // last section
    this.aLong = 0; this.aLat = 0;
    this.delta = 0; this.kneel = 0; this.stopBrake = false; this.brakeOut = 0;
    this.rpm = 0; this.load = 0; this.gear = 0; this.passengers = 0;
    this.distF = 0; this.distR = 0;
    this.lastCollision = null;
    const first = spec.sections[0], last = spec.sections[spec.sections.length - 1];
    this.c = first.d1 + 0.2; // front end -> first joint
    this.L2 = 0.17; // GameAudio: the listener is in the rear section when it is behind its front end
    this.box = [{ c: -first.length / 2, hl: first.length / 2 }, { c: -last.length / 2, hl: last.length / 2 }];
    this.poses = {};
  }

  get speedKmh() {
    return Math.abs(this.v) * 3.6;
  }

  get articulation() {
    let d = this.yaw - this.yawR;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  /** Front end of the tram (world x, z). */
  frontPoint() {
    return [this.x, this.z];
  }

  /** One oriented box per body section (world space) for collision and occlusion tests. */
  boxes() {
    const out = [];
    for (const sec of this.spec.sections) {
      const q = this.poses[sec.id];
      if (!q) continue;
      const h = Math.hypot(q.ux, q.uz) || 1, fx = -q.ux / h, fz = -q.uz / h; // forward
      const hl = sec.length / 2;
      out.push({ cx: q.x - fx * hl, cz: q.z - fz * hl, fx, fz, hl, hw: this.spec.dims.halfW });
    }
    return out;
  }

  get dirSign() {
    return this.selector === 'R' ? -1 : this.selector === 'N' ? 0 : 1;
  }

  /** Demand fraction of the current notch (T6M: the resistance steps, Schindler: smooth chopper-like steps). */
  notchFraction(n) {
    const P = this.P;
    if (n > 0) return P.steps ? [0, 0.22, 0.42, 0.62, 0.82, 1][Math.min(n, 5)] : n / P.notches;
    if (n < 0) return -(-n / P.brakeNotches);
    return 0;
  }

  step(dt, { interlock = false } = {}) {
    const P = this.P;
    const m = this.mass;
    // the player's notched controller, or a continuous demand (the AI driver)
    const target = this.analog != null ? Math.max(-1, Math.min(1, this.analog)) : this.notchFraction(this.notch);
    // contactor ramp: power rises over ~0.6 s, brakes over ~0.4 s
    const rate = target > this.force ? (target > 0 ? 1.6 : 2.5) : 2.5;
    this.force += Math.max(-rate * dt, Math.min(rate * dt, target - this.force));
    const sign = this.dirSign;
    const canPower = this.engineOn && this.pantoH > 0.95 && this.wireOk && !interlock && !this.parkingBrake && sign !== 0 && !this.emergency;
    let Ftr = 0;
    const av = Math.abs(this.v);
    if (canPower && this.force > 0) {
      Ftr = this.force * P.traction(av) * sign;
      // speed governor: the traction fades out over the last 0.6 m/s below and above vmax
      if (av > P.vmax - 0.3) Ftr *= Math.max(0, 1 - (av - P.vmax + 0.3) / 0.6);
      // adhesion of the powered axles
      const mu = 0.24 - 0.09 * this.wet + (this.sand ? 0.07 : 0);
      const lim = mu * m * P.poweredMassShare * g;
      if (Math.abs(Ftr) > lim) {
        this.slip = Math.min(1, this.slip + dt * 3);
        Ftr = Math.sign(Ftr) * lim * (0.8 - 0.2 * Math.sin(performance.now() / 70));
      } else this.slip = Math.max(0, this.slip - dt * 2);
    } else this.slip = Math.max(0, this.slip - dt * 2);
    // brakes (deceleration demand)
    let dec = 0;
    if (this.force < 0) dec = -this.force * P.serviceDecel;
    if (interlock && av < 1.5) dec = Math.max(dec, 0.9); // door brake holds the tram at the stop
    if (this.parkingBrake) dec = Math.max(dec, 1.5);
    if (this.emergency) dec = P.emergencyDecel;
    // service braking is adhesion-limited too (sanding helps a little)
    const muB = 0.2 - 0.07 * this.wet;
    if (!this.emergency) dec = Math.min(dec, muB * g + 0.2);
    // resistance and gradient (slope: rise per metre in the direction of +s)
    const [A, B, C] = P.davis;
    const Fres = (A + B * av + C * av * av) * Math.sign(this.v);
    const Fg = -m * g * this.slope;
    let acc = (Ftr - Fres + Fg) / m;
    // brakes oppose motion; at standstill they hold
    if (av > 0.02) {
      const brakeA = dec * Math.sign(this.v);
      const vNew = this.v + (acc - brakeA) * dt;
      if (Math.sign(vNew) !== Math.sign(this.v) && dec > 0) {
        this.v = 0;
        acc = 0;
      } else {
        this.v = vNew;
        acc -= brakeA;
      }
    } else {
      // standing: brakes hold up to their force, the rolling resistance of the bogies holds a tram that
      // nothing pushes (A of the Davis formula), otherwise it rolls off
      const push = Math.abs(Ftr + Fg);
      if ((dec > 0 && Math.abs(acc) < dec + 0.5) || (Ftr === 0 && push < A)) {
        this.v = 0;
        acc = 0;
      } else this.v += acc * dt;
    }
    if (this.emergency && this.v === 0) this.emergency = false;
    this.a = acc;
    this.s += this.v * dt;
    // motor load / line current for the sounds and the ammeter
    this.motorLoad = canPower ? Math.max(0, this.force) * Math.min(1, P.traction(av) / P.traction(0)) : 0;
    const brakeE = this.force < 0 && av > 2 ? -this.force : 0;
    this.currentA = Math.round((this.motorLoad * 600 + brakeE * 280) * (av > 0.1 || this.motorLoad > 0 ? 1 : 0));
    if (P.steps && this.notch !== this.lastStep) {
      this.stepJerk = 1;
      this.lastStep = this.notch;
    }
    this.stepJerk = Math.max(0, this.stepJerk - dt * 4);
    // what the sounds and the instruments read: traction motor speed (gear ratio ~6.9), load, brake
    this.rpm = (av / this.spec.bogies.wheelR) * 6.9 * (60 / (2 * Math.PI));
    this.load = this.motorLoad;
    this.brakeOut = Math.max(0, -this.force) + (this.emergency ? 1 : 0);
    this.gear = this.notch;
    this.distF += this.v * dt;
    this.distR = this.distF;
  }
}
