import { describe, it, expect } from 'vitest';
import { MillerWaves, WAVE_C } from '../src/world/surface/MillerWaves';
import { fmtLatLon } from '../src/util/format';

describe("Miller's tidal waves", () => {
  const W = new MillerWaves();
  W.schedule(300);
  it('crest passes the origin at t0 with height H', () => {
    const w = W.wave(0);
    expect(W.height(0, 0, w.t0)).toBeCloseTo(w.H, 3);
    expect(W.height(0, 0, w.t0 - 200)).toBeLessThan(1); // 21 km away: still water
  });
  it('gradient matches finite differences', () => {
    const w = W.wave(0);
    for (const t of [w.t0 - 8, w.t0 + 5, w.t0 + 30]) {
      const g = W.gradient(120, -40, t);
      const e = 0.5;
      const gx = (W.height(120 + e, -40, t) - W.height(120 - e, -40, t)) / (2 * e);
      const gz = (W.height(120, -40 + e, t) - W.height(120, -40 - e, t)) / (2 * e);
      expect(g.x).toBeCloseTo(gx, 3);
      expect(g.y).toBeCloseTo(gz, 3);
    }
  });
  it('next() counts down to the arrival at a point', () => {
    const w = W.wave(0);
    const x = w.dir.x * 1000, z = w.dir.y * 1000; // 1 km downstream
    const n = W.next(x, z, w.t0 - 60)!;
    expect(n.wave.n).toBe(0);
    expect(n.tta).toBeCloseTo(60 + 1000 / WAVE_C, 3);
  });
});

describe('lat/lon formatting', () => {
  it('never prints a negative zero hemisphere', () => {
    expect(fmtLatLon(-0.001, 23.473)).toBe('0.00°N 23.47°E');
    expect(fmtLatLon(-10.6, -167.7, 1)).toBe('10.6°S 167.7°W');
  });
});
