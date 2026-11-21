import { describe, expect, it } from 'vitest';
import { WaveRide } from '../src/world/space/WaveRide';
import { waveProfile } from '../src/render/MillerWave';

/** The Ranger on the pad when Miller's wave arrives (crest 1 km out, coming at 40 m/s). */
function ride(D = 1500) {
  const c = 40, g = 12.74;
  const r = new WaveRide(28000, 1.1, g, c, D);
  let s = -1000;                     // crest position relative to the pad, along the wave's direction
  const water = (x: number) => {
    const u = x - s;
    const h = waveProfile(u, 0);
    const slope = (waveProfile(u + 4, 0) - waveProfile(u - 4, 0)) / 8;
    return { h, slope, u };
  };
  let maxZ = 0, t = 0, airT = 0;
  for (; t < 900; t += 1 / 60) {
    s += c / 60;
    r.step(1 / 60, water);
    maxZ = Math.max(maxZ, r.z);
    if (r.airborne) airT += 1 / 60;
    if (r.settled(water(r.x))) break;
  }
  return { r, maxZ, t, airT };
}

describe("Miller's wave and the Ranger", () => {
  it('lifts the hull over the crest, carries it on and sets it down', () => {
    const { r, maxZ, t, airT } = ride();
    if (process.env.TRACE) require('fs').appendFileSync(process.env.TRACE, JSON.stringify({ maxZ: +maxZ.toFixed(0), carried_m: +r.x.toFixed(0), maxG: +r.maxG.toFixed(1), maxDepth_m: +r.maxDepth.toFixed(1), settled_s: +t.toFixed(0), air_s: +airT.toFixed(1) }) + '\n');
    expect(maxZ).toBeGreaterThan(900);          // up near the crest (1.2 km)
    expect(r.x).toBeGreaterThan(300);           // carried on by the water
    expect(t).toBeLessThan(900);                // and back on the sea floor
    expect(r.maxG).toBeLessThan(25);            // violent, not instantly fatal
  });
});
