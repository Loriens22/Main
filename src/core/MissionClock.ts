import type { GameState } from './State';

/** J2000.0 epoch as a JS Date (TT ≈ UTC + 69 s; the offset is irrelevant at game scale). */
export const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
/** Mission start date: 14 June 2067, ~08:35 local solar time on the farm (15:30 UTC, longitude 104° W). */
export const START_EARTH_TIME = (Date.UTC(2067, 5, 14, 15, 30, 0) - J2000_MS) / 1000;

export const YEAR = 365.25 * 86400;
export const DAY = 86400;

/**
 * Gravitational time dilation factors (dτ/dt, proper time per unit Earth-reference time).
 * Miller's planet follows the film: 1 hour local ≈ 7 years on Earth.
 * The other factors are game approximations for orbits far from Gargantua.
 */
export const MILLER_FACTOR = 1 / (7 * YEAR / 3600); // ≈ 1 / 61 362

export interface ClockContext {
  location: string;
  system: string;
  /** optional fine-grained dilation for the player's current situation (e.g. descending near Miller) */
  playerDilation?: number;
  enduranceDilation?: number;
}

/**
 * Mission clock. The player's proper time advances 1:1 with real elapsed time (× timeScale).
 * Earth-reference time advances by dτ / (dτ/dt). Endurance proper time advances with its own factor.
 */
export class MissionClock {
  constructor(private state: GameState) {}

  get earthTime() {
    return this.state.clock.earthTime;
  }
  get timeScale() {
    return this.state.clock.timeScale;
  }
  set timeScale(v: number) {
    this.state.clock.timeScale = v;
  }

  playerDilation(ctx: ClockContext): number {
    if (ctx.playerDilation !== undefined) return ctx.playerDilation;
    return locationDilation(ctx.location, ctx.system);
  }

  enduranceDilation(ctx: ClockContext): number {
    if (ctx.enduranceDilation !== undefined) return ctx.enduranceDilation;
    return ctx.system === 'gargantua' ? 1 / 1.0012 : 1;
  }

  /** Advance by a real-time step dtReal (s). Returns the Earth-reference dt. */
  advance(dtReal: number, ctx: ClockContext): number {
    const c = this.state.clock;
    const dTau = dtReal * c.timeScale;
    const f = this.playerDilation(ctx);
    const dEarth = dTau / f;
    c.playerProper += dTau;
    c.earthTime += dEarth;
    c.enduranceProper += dEarth * this.enduranceDilation(ctx);
    return dEarth;
  }

  /** Jump Earth time forward analytically (cryosleep / skip). Player sleeps, so proper time is ship time. */
  skipEarth(dEarth: number, ctx: ClockContext) {
    const c = this.state.clock;
    const fe = this.enduranceDilation(ctx);
    c.earthTime += dEarth;
    c.enduranceProper += dEarth * fe;
    c.playerProper += dEarth * fe;
  }

  static date(earthTime: number): Date {
    return new Date(J2000_MS + earthTime * 1000);
  }

  static formatDate(earthTime: number): string {
    const d = MissionClock.date(earthTime);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
      d.getUTCMinutes(),
    )} UTC`;
  }

  static formatDuration(s: number, short = false): string {
    const sign = s < 0 ? '-' : '';
    s = Math.abs(s);
    if (s >= YEAR) {
      const y = Math.floor(s / YEAR);
      const d = Math.floor((s - y * YEAR) / DAY);
      return short ? `${sign}${y}y ${d}d` : `${sign}${y} yr ${d} d`;
    }
    if (s >= DAY) {
      const d = Math.floor(s / DAY);
      const h = Math.floor((s - d * DAY) / 3600);
      return `${sign}${d}d ${h}h`;
    }
    const h = Math.floor(s / 3600);
    const m = Math.floor((s - h * 3600) / 60);
    const sec = Math.floor(s % 60);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${sign}${p(h)}:${p(m)}:${p(sec)}`;
  }
}

export function locationDilation(location: string, system: string): number {
  switch (location) {
    case 'miller':
      return MILLER_FACTOR;
    case 'mann':
      return 1 / 1.00004;
    case 'edmunds':
      return 1 / 1.0006;
    case 'space':
      return system === 'gargantua' ? 1 / 1.0012 : 1;
    default:
      return 1;
  }
}
