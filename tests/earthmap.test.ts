import { describe, expect, it } from 'vitest';
import { EarthMap, FARM, NASA } from '../src/world/earth/EarthMap';

describe('EarthMap', () => {
  const m = new EarthMap();
  it('road from the farm to NASA is about six kilometres', () => {
    expect(m.roadLength).toBeGreaterThan(5800);
    expect(m.roadLength).toBeLessThan(6200);
    const a = m.road[0], b = m.road[m.road.length - 1];
    expect(Math.hypot(a.x - FARM.x, a.z - FARM.z)).toBeLessThan(80);
    expect(Math.hypot(b.x - NASA.portal.x, b.z - NASA.portal.z)).toBeLessThan(5);
  });
  it('road gradient stays drivable and the bed is graded into the terrain', () => {
    let maxGrade = 0;
    for (let i = 1; i < m.road.length; i++) maxGrade = Math.max(maxGrade, Math.abs(m.road[i].y - m.road[i - 1].y) / 2);
    expect(maxGrade).toBeLessThan(0.14);
    for (const i of [200, 900, 1500, 2400]) {
      const r = m.road[i];
      expect(Math.abs(m.height(r.x, r.z) - r.y)).toBeLessThan(0.05);
    }
  });
  it('no crops on the road or in the yard', () => {
    const r = m.road[600];
    expect(m.cornDensity(r.x, r.z)).toBe(0);
    expect(m.cornDensity(FARM.x, FARM.z)).toBe(0);
    expect(m.cornDensity(-2600, 250)).toBe(1);
  });
});
