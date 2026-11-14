import type { Game } from '../../core/Game';

/**
 * Persistent memory for a site's animals and its slow ecology, saved with the game (flags mem:<site>:<key>, JSON).
 * Between visits the world goes on: on arrival, `away` is the time (h) since the last visit, and each system catches
 * up with it (biofilm regrowth, nest building, carcass decay, a new hatchling) instead of resetting.
 *
 * What an animal remembers is small and bounded — counts and levels that bias its choices, never a map of the
 * player (directive: bounded associative learning, no omniscience):
 *   Prism Architect   habituation 0..1 to calm, distant observers (and separately to the survey drone)
 *   Basalt Mimic      lamp exposures: lit at range repeatedly, it breaks cover earlier and keeps further from lights
 *   Rift Serpent      shoves given: an intruder it has had to push warns it off sooner
 *   Subglacial Monarch inspections: each calm one makes the next approach slower and more curious
 *   Stormhunter       failed intercepts and calm encounters: after misses it assesses longer; a probe that never
 *                     threatens it is eventually ignored
 */
export class FaunaMemory {
  /** hours since the last visit (0 on the first) */
  readonly away: number;
  /** visits to this site, including this one */
  readonly visits: number;

  constructor(readonly game: Game, readonly site: string) {
    const last = Number(this.raw('lastVisit'));
    this.away = Number.isFinite(last) && last > 0 ? Math.max(0, this.hours - last) : 0;
    this.visits = (Number(this.raw('visits')) || 0) + 1;
    game.flag(this.k('visits'), this.visits);
    this.stamp();
  }

  /** the site's clock (h): Earth-reference time is close enough to local time on Mars and Jupiter */
  get hours() {
    return this.game.state.clock.earthTime / 3600;
  }

  /** mark the site as visited now (called on arrival and periodically, so the next `away` is right) */
  stamp() {
    this.game.flag(this.k('lastVisit'), Math.round(this.hours * 100) / 100);
  }

  private k(key: string) {
    return `mem:${this.site}:${key}`;
  }

  private raw(key: string) {
    return this.game.state.flags[this.k(key)];
  }

  get<T>(key: string, def: T): T {
    const r = this.raw(key);
    if (r === undefined) return def;
    if (typeof def === 'number') return (Number(r) as unknown as T) ?? def;
    try {
      return typeof r === 'string' ? (JSON.parse(r) as T) : (r as unknown as T);
    } catch {
      return def;
    }
  }

  set(key: string, v: unknown) {
    this.game.flag(this.k(key), typeof v === 'number' ? Math.round(v * 1000) / 1000 : JSON.stringify(v));
  }

  /** add to a counter; returns the new value */
  bump(key: string, by = 1) {
    const n = this.get(key, 0) + by;
    this.set(key, n);
    return n;
  }
}

/** one memory per site per zone session (shared by every species there) */
const live = new Map<string, FaunaMemory>();
export function siteMemory(game: Game, site: string) {
  let m = live.get(site);
  if (!m || m.game !== game) {
    m = new FaunaMemory(game, site);
    live.set(site, m);
  }
  return m;
}
/** forget the session's memory objects (on leaving the zone: the next arrival computes `away` afresh) */
export function endSiteMemories() {
  for (const m of live.values()) m.stamp();
  live.clear();
}
