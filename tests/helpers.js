import { readFileSync } from 'node:fs';
import { Route280 } from '../src/gameplay/Route280Data.js';

export const routeJson = JSON.parse(readFileSync(new URL('../src/data/route280.json', import.meta.url), 'utf8'));
export const makeRoute = () => new Route280(routeJson);

/** Drive a StopManager along a direction with a simple kinematic profile, serving every stop. */
export function simulateTrip(dir, sm, { serve = () => true, dt = 0.1, onStep = null } = {}) {
  let s = dir.stops[0].frontS;
  let v = 0;
  let doors = false;
  let dwell = 0;
  let t = 0;
  // start at the first stop with doors open (terminal), then close and leave
  sm.update({ frontS: s, speed: 0, doorsOpen: true, dt });
  for (let guard = 0; guard < 200000 && !sm.finished; guard++) {
    const next = sm.nextStop;
    const target = next ? next.frontS : dir.length;
    const shouldServe = next && serve(next) && !sm.served.has(next.index);
    const dist = target - s;
    if (doors) {
      dwell += dt;
      if (dwell > 5) { doors = false; dwell = 0; }
      v = 0;
    } else if (shouldServe && dist < 0.5 && dist > -5 && v < 0.5 && sm.atStop === next.index && !sm.served.has(next.index)) {
      doors = true;
      v = 0;
    } else {
      const vmax = shouldServe ? Math.min(12, Math.sqrt(Math.max(0, 2 * 1.2 * Math.max(0, dist)))) : 12;
      v = Math.min(vmax, v + 1.2 * dt);
      if (shouldServe && dist < 0.3 && dist > -3) v = 0;
    }
    s += v * dt;
    t += dt;
    sm.update({ frontS: s, speed: v, doorsOpen: doors, dt });
    if (onStep) onStep({ s, v, doors, t });
  }
  return { s, t };
}
