import { describe, it, expect } from 'vitest';
import { propagate, elements, stateFromElements, lambert, norm, sub, AU, MU_SUN, type V3 } from '../src/space/kepler';

const MU_E = 3.986004418e14;

describe('kepler propagation', () => {
  it('returns to start after one circular period', () => {
    const r: V3 = [7000e3, 0, 0];
    const v: V3 = [0, Math.sqrt(MU_E / 7000e3), 0];
    const T = 2 * Math.PI * Math.sqrt(7000e3 ** 3 / MU_E);
    const s = propagate(r, v, MU_E, T);
    expect(norm(sub(s.r, r))).toBeLessThan(1);
  });

  it('conserves energy on an eccentric orbit over a long skip', () => {
    const { r, v } = stateFromElements(2 * AU, 0.4, 0.1, 0.3, 0.7, 0.2, MU_SUN);
    const e0 = norm(v) ** 2 / 2 - MU_SUN / norm(r);
    const s = propagate(r, v, MU_SUN, 5 * 365.25 * 86400);
    const e1 = norm(s.v) ** 2 / 2 - MU_SUN / norm(s.r);
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(1e-9);
  });

  it('handles hyperbolic trajectories', () => {
    const r: V3 = [7000e3, 0, 0];
    const v: V3 = [0, 12000, 0];
    const s = propagate(r, v, MU_E, 3600);
    const e0 = 12000 ** 2 / 2 - MU_E / 7000e3;
    const e1 = norm(s.v) ** 2 / 2 - MU_E / norm(s.r);
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(1e-8);
    expect(elements(s.r, s.v, MU_E).e).toBeGreaterThan(1);
  });

  it('elements round-trip', () => {
    const { r, v } = stateFromElements(1.2e7, 0.2, 0.5, 1.0, 2.0, 0.9, MU_E);
    const el = elements(r, v, MU_E);
    expect(el.a).toBeCloseTo(1.2e7, -2);
    expect(el.e).toBeCloseTo(0.2, 6);
    expect(el.i).toBeCloseTo(0.5, 6);
  });
});

describe('lambert', () => {
  it('reproduces a known propagated arc', () => {
    const { r, v } = stateFromElements(1.3 * AU, 0.2, 0.02, 0.1, 0.4, 0.3, MU_SUN);
    const tof = 200 * 86400;
    const s = propagate(r, v, MU_SUN, tof);
    const sol = lambert(r, s.r, tof, MU_SUN, true);
    expect(sol).not.toBeNull();
    expect(norm(sub(sol!.v1, v))).toBeLessThan(1);
    expect(norm(sub(sol!.v2, s.v))).toBeLessThan(1);
  });

  it('finds a 2-year Earth→Saturn fast transfer', () => {
    const r1: V3 = [AU, 0, 0];
    const r2: V3 = [-9.5 * AU * Math.cos(0.3), -9.5 * AU * Math.sin(0.3), 0];
    const tof = 2 * 365.25 * 86400;
    const sol = lambert(r1, r2, tof, MU_SUN, true);
    expect(sol).not.toBeNull();
    const vEarth = Math.sqrt(MU_SUN / AU);
    const dep = norm(sub(sol!.v1, [0, vEarth, 0]));
    expect(dep).toBeGreaterThan(5000);
    expect(dep).toBeLessThan(40000);
  });
});
