import { BODY, BodyDef } from './Bodies';
import { surfacePoint } from './Ephemeris';
import { norm, sub, unit, V3 } from './Kepler';
import { GuidedFlight, HANDOVER_ALT, SiteFn, TargetFn } from './Descent';

/** The landing site of a body as a function of program time (s after jd0): state relative to the body centre. */
export function siteFunction(body: BodyDef, jd0: number, dEast = 0, dNorth = 0): SiteFn {
  const L = body.landing!;
  // a point near the landing site (dEast, dNorth metres from it: where the Ranger stands after being moved)
  const lat = L.lat + (dNorth / body.R) * (180 / Math.PI);
  const lon = L.lon + (dEast / (body.R * Math.cos((L.lat * Math.PI) / 180))) * (180 / Math.PI);
  const at = (t: number) => surfacePoint(body.id, lat, lon, jd0 + t / 86400);
  return (t: number) => {
    // velocity straight from the ephemeris (exactly consistent with the positions)
    const r = at(t), a = at(t - 0.5), b = at(t + 0.5);
    return { r, v: sub(b, a), up: unit(r) };
  };
}

const PHASE_LABEL: Record<string, string> = {
  wait: 'Waiting for the window', deorbit: 'Deorbit burn', coast: 'Coasting down', entry: 'Entry', braking: 'Powered descent',
  gate: 'High gate', terminal: 'Terminal descent', landed: 'Landed', ascent: 'Lift-off', pitch: 'Climb', insert: 'Orbit insertion',
  raise: 'Apoapsis trim', xfer: 'Transfer coast', close: 'Closing on the Endurance', trim: 'Matching velocity', done: 'Rendezvous',
};

/**
 * One automatic descent or ascent of Ranger 1: the guided point-mass flight (shared by the orbit and surface zones,
 * which hand it to each other a few kilometres up), its clock, and the time compression that keeps an automatic
 * landing or return within about two minutes of real time (the burns and the final metres run near real time).
 */
export class FlightProgram {
  /** program time at which the ascent lifts off (the window) */
  launchAt = 0;
  constructor(public kind: 'descent' | 'ascent', public f: GuidedFlight, public body: BodyDef, public jd0: number, public met0: number) {}

  get jd() { return this.jd0 + this.f.t / 86400; }

  step(dt: number) {
    const w = this.warp();
    if (this.kind === 'ascent' && this.f.phase === 'landed' && this.f.t + dt * w >= this.launchAt) {
      // hold on the pad up to the window, then light the engines
      this.f.step(Math.max(0, this.launchAt - this.f.t));
      this.f.phase = 'ascent';
      return;
    }
    this.f.step(dt * w);
  }

  /** sim seconds per real second for the current phase */
  /** constant compression for a wait, fixed when it starts so the wait takes about five seconds */
  private waitWarp = 0;
  private xferWarp = 0;

  warp(): number {
    const f = this.f;
    const hold = f.phase === 'wait' ? f.tDeorbit - f.t : this.kind === 'ascent' && f.phase === 'landed' ? this.launchAt - f.t : -1;
    if (hold < 0) this.waitWarp = 0;
    else if (!this.waitWarp) this.waitWarp = Math.max(1, Math.min(20000, hold / 5));
    switch (f.phase) {
      case 'wait': return this.waitWarp;
      case 'landed': return this.kind === 'ascent' ? this.waitWarp : 1;
      case 'deorbit': return 3;
      case 'coast': {
        // the fall from a high orbit (gas giants) takes hours: about eight seconds of real time down to the air
        const vr = -(f.v[0] * f.r[0] + f.v[1] * f.r[1] + f.v[2] * f.r[2]) / norm(f.r);
        const top = f.body.atmosphere ? f.body.atmosphere.top : 0;
        return Math.max(150, Math.min(20000, (f.alt - top) / Math.max(vr, 1) / 8));
      }
      case 'xfer': {
        // up the transfer ellipse in about ten seconds
        if (!this.xferWarp) this.xferWarp = Math.max(30, Math.min(20000, f.timeToApoapsis() / 10));
        return this.xferWarp;
      }
      case 'entry': {
        // a long fall through thick air (Venus, Titan) runs faster: about 30 s of real time for what is left
        const vr = Math.abs(f.v[0] * f.r[0] + f.v[1] * f.r[1] + f.v[2] * f.r[2]) / norm(f.r);
        return Math.max(15, Math.min(600, f.height / Math.max(vr, 1) / 15));
      }
      case 'braking': return f.height < HANDOVER_ALT * 1.5 ? Math.max(5, Math.min(30, f.tgo / 15)) : Math.max(8, Math.min(60, f.tgo / 25));
      case 'gate': case 'terminal': return f.height > 200 ? 10 : f.height > 25 ? 3 : 1.5;
      case 'ascent': return 2;
      case 'pitch': return 20;
      case 'insert': return Math.max(15, Math.min(120, f.tgo / 10));
      case 'close': return Math.max(6, Math.min(60, f.tgo / 6));
      case 'trim': return 2;
      case 'raise': return 2;
      default: return 1;
    }
  }

  status(): string {
    const f = this.f;
    const label = PHASE_LABEL[f.phase] ?? f.phase;
    if (f.phase === 'wait') return `${label} · burn in ${fmtT(f.tDeorbit - f.t)}`;
    if (this.kind === 'ascent' && f.phase === 'landed') return `Launch window in ${fmtT(this.launchAt - f.t)}`;
    if (f.phase === 'xfer') return `${label} · apoapsis in ${fmtT(f.timeToApoapsis())}`;
    if (f.phase === 'entry') return `${label} · ${(norm(f.airVel()) / 1000).toFixed(2)} km/s · ${(f.q / 1000).toFixed(1)} kPa`;
    const s = f.site(f.t);
    if (this.kind === 'descent') return `${label} · ${(f.height / 1000).toFixed(f.height < 10000 ? 2 : 1)} km · ${(f.rangeTo(s.r) / 1000).toFixed(1)} km to go`;
    if (f.target && (f.phase === 'close' || f.phase === 'trim' || f.phase === 'insert')) {
      const tg = f.target(f.t);
      return `${label} · ${(norm(sub(tg.r, f.r)) / 1000).toFixed(1)} km · ${norm(sub(tg.v, f.v)).toFixed(0)} m/s`;
    }
    return `${label} · ${(f.height / 1000).toFixed(1)} km`;
  }
}

function fmtT(s: number) {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m}:${String(ss).padStart(2, '0')}`;
}

/** helper: a target function for the point a distance behind the Endurance along its orbit */
export function behindTarget(endurance: TargetFn, metres: number): TargetFn {
  return (t: number) => {
    const e = endurance(t);
    const u = unit(e.v);
    return { r: [e.r[0] - u[0] * metres, e.r[1] - u[1] * metres, e.r[2] - u[2] * metres] as V3, v: e.v };
  };
}

void BODY;
