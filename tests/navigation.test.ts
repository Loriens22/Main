import { describe, it, expect } from 'vitest';
import { DESTINATIONS, planTransfer, parkRadius } from '../src/space/Navigation';
import { SURFACES } from '../src/data/landing';
import { BODIES } from '../src/data/bodies';

describe('navigation destinations', () => {
  it('offers every landable Solar-System body', () => {
    const sol = Object.keys(SURFACES).filter((id) => BODIES[id].system === 'sol');
    for (const id of sol) expect(DESTINATIONS, id).toContain(id);
  });
  it('plans transfers to the newly listed moons', () => {
    const t = 2128563000;
    for (const [from, to] of [['mars', 'deimos'], ['saturn', 'mimas'], ['titan', 'dione'], ['enceladus', 'rhea'], ['saturn', 'iapetus'], ['earth', 'iapetus']] as [string, string][]) {
      const p = planTransfer(from, to, t, 'efficient', parkRadius(from) - BODIES[from].radius);
      expect(p, `${from} → ${to}`).toBeTruthy();
      expect(Number.isFinite(p!.dv)).toBe(true);
      expect(p!.tArr).toBeGreaterThan(p!.tDep);
    }
  });
});
