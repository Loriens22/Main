import { describe, expect, it } from 'vitest';
import { AU, BODY, soiRadius, surfaceGravity } from '../src/space/Bodies';
import { calendarDate, J2000, julianDate, LAUNCH_JD, pole, position, state, surfacePoint } from '../src/space/Ephemeris';
import { add, elementsToState, lambert, norm, propagate, stateToElements, sub, V3 } from '../src/space/Kepler';
import { kerrCircularDilation, MILLER_DILATION, MILLER_R, dilationAt } from '../src/space/Relativity';

const MU_SUN = BODY.sun.GM;

describe('ephemeris', () => {
  it('Julian dates round-trip and J2000 is noon 1 January 2000', () => {
    expect(julianDate(2000, 1, 1, 12)).toBeCloseTo(J2000, 6);
    const c = calendarDate(LAUNCH_JD);
    expect(c.year).toBe(2067); expect(c.month).toBe(7); expect(c.day).toBe(15);
  });

  it('planet positions at J2000 match the published values', () => {
    const near = (id: string, ref: V3, tol: number) => {
      const p = position(id, J2000).map((x) => x / AU);
      expect(Math.hypot(p[0] - ref[0], p[1] - ref[1], p[2] - ref[2])).toBeLessThan(tol);
    };
    near('earth', [-0.1771, 0.9672, 0.0], 0.01);
    near('mars', [1.3907, -0.0134, -0.0345], 0.02);
    near('jupiter', [4.0012, 2.9385, -0.1017], 0.03);
    near('saturn', [6.4064, 6.5698, -0.3690], 0.05);
  });

  it('moons stay at their distance, poles are unit vectors, surface points lie on the radius', () => {
    const jd = LAUNCH_JD;
    const d = norm(sub(position('titan', jd), position('saturn', jd)));
    expect(d / BODY.titan.orbit!.a).toBeCloseTo(1, 6);
    expect(norm(pole('uranus'))).toBeCloseTo(1, 9);
    expect(norm(surfacePoint('mars', -4.6, 137.4, jd)) / BODY.mars.R).toBeCloseTo(1, 9);
    // Earth's pole is tilted 23.44 deg from the ecliptic pole
    expect(Math.acos(pole('earth')[2]) * 180 / Math.PI).toBeCloseTo(23.44, 1);
  });

  it('spheres of influence and gravity are sensible', () => {
    expect(soiRadius(BODY.earth) / 1e9).toBeCloseTo(0.925, 1);
    expect(surfaceGravity(BODY.mars)).toBeCloseTo(3.72, 1);
    expect(surfaceGravity(BODY.miller) / 9.80665).toBeCloseTo(1.3, 1);
    expect(state('moon', LAUNCH_JD).r.length).toBe(3);
  });
});

describe('two-body mechanics', () => {
  it('propagation closes an ellipse after one period and agrees with the elements', () => {
    const s = elementsToState({ a: 1.3 * AU, e: 0.3, i: 0.2, node: 1.0, peri: 0.5, M: 0.7 }, MU_SUN);
    const P = 2 * Math.PI * Math.sqrt((1.3 * AU) ** 3 / MU_SUN);
    const s2 = propagate(s.r, s.v, MU_SUN, P);
    expect(norm(sub(s2.r, s.r)) / AU).toBeLessThan(1e-7);
    const el = stateToElements(s.r, s.v, MU_SUN);
    expect(el.a / AU).toBeCloseTo(1.3, 8); expect(el.e).toBeCloseTo(0.3, 8); expect(el.i).toBeCloseTo(0.2, 8);
  });

  it('hyperbolic propagation forward then back returns to the start', () => {
    const r: V3 = [7000e3, 0, 0], v: V3 = [0, 12000, 1000];
    const mu = BODY.earth.GM;
    const f = propagate(r, v, mu, 5000), b = propagate(f.r, f.v, mu, -5000);
    expect(norm(sub(b.r, r))).toBeLessThan(1e-2);
  });

  it('Lambert reproduces the Hohmann transfer and lands on the target', () => {
    const r1: V3 = [AU, 0, 0];
    const a = (AU + 1.524 * AU) / 2, tH = Math.PI * Math.sqrt(a ** 3 / MU_SUN);
    const ang = 179 * Math.PI / 180;
    const r2: V3 = [1.524 * AU * Math.cos(ang), 1.524 * AU * Math.sin(ang), 0];
    const sol = lambert(r1, r2, tH * 0.99, MU_SUN, true)!;
    expect(sol).not.toBeNull();
    const vH = Math.sqrt(MU_SUN * (2 / AU - 1 / a));
    expect(norm(sol.v1) / vH).toBeCloseTo(1, 1);
    const end = propagate(r1, sol.v1, MU_SUN, tH * 0.99);
    expect(norm(sub(end.r, r2)) / AU).toBeLessThan(1e-6);
  });

  it('Lambert handles a fast (hyperbolic) transfer', () => {
    const r1: V3 = [AU, 0, 0], r2: V3 = [-6 * AU, 7 * AU, 0.2 * AU];
    const tof = 2 * 365.25 * 86400;
    const sol = lambert(r1, r2, tof, MU_SUN, true)!;
    expect(sol).not.toBeNull();
    const end = propagate(r1, sol.v1, MU_SUN, tof);
    expect(norm(sub(end.r, r2)) / AU).toBeLessThan(1e-6);
  });
});

describe('relativity', () => {
  it("Miller's planet: one hour = seven years", () => {
    expect(kerrCircularDilation(MILLER_R) / MILLER_DILATION).toBeCloseTo(1, 4);
    expect(MILLER_R).toBeGreaterThan(1);
    expect(MILLER_R).toBeLessThan(1.001);
    expect(dilationAt('earth')).toBe(1);
    // far away the weak-field value takes over
    expect(dilationAt({ rOverM: 1e4 })).toBeCloseTo(1.00015, 5);
  });
});

describe('voyage planning', () => {
  it('plans Earth to Mars and Earth to Saturn with sensible costs and times', async () => {
    const { planVoyage, voyagePosition, ENDURANCE_DV } = await import('../src/space/Voyage');
    const mars = planVoyage('earth', 'mars', LAUNCH_JD);
    expect(mars.length).toBeGreaterThan(0);
    const eco = mars.find((p) => p.kind === 'economy')!;
    // Hohmann-like: ~0.7 years and ~5.6 km/s from LEO to low Mars orbit (the date matters, allow a range)
    expect(eco.tof / 86400).toBeGreaterThan(120);
    expect(eco.tof / 86400).toBeLessThan(400);
    expect(eco.dvDepart + eco.dvArrive).toBeLessThan(15000);
    const sat = planVoyage('earth', 'saturn', LAUNCH_JD);
    const fast = sat.find((p) => p.kind === 'fast');
    expect(fast).toBeDefined();
    expect(fast!.tof / 86400 / 365.25).toBeLessThan(2.1);
    expect(fast!.dvDepart + fast!.dvArrive).toBeLessThan(ENDURANCE_DV);
    // the arc arrives where Saturn will be
    const end = voyagePosition(fast!, fast!.tof)!;
    const tgt = state('saturn', LAUNCH_JD + fast!.tof / 86400).r;
    expect(norm(sub(end.r, tgt)) / AU).toBeLessThan(1e-4);
    // a moon transfer is computed about its planet
    const moon = planVoyage('earth', 'moon', LAUNCH_JD);
    expect(moon[0].center).toBe('earth');
    expect(moon[moon.length - 1].tof / 86400).toBeLessThan(8);
  });
});

describe('flown path', () => {
  // a circular parking orbit about a body, inclined i to the ecliptic, as a function of the in-plane angle
  const circle = (id: string, alt: number, inc: number) => {
    const b = BODY[id], r = b.R + alt, n = Math.sqrt(b.GM / r ** 3);
    const at = (phi: number) => ({
      r: [r * Math.cos(phi), r * Math.sin(phi) * Math.cos(inc), r * Math.sin(phi) * Math.sin(inc)] as V3,
      v: [-r * n * Math.sin(phi), r * n * Math.cos(phi) * Math.cos(inc), r * n * Math.cos(phi) * Math.sin(inc)] as V3,
    });
    return { at, n, period: (2 * Math.PI) / n };
  };

  it('Earth to Mars: leaves from the parking orbit, never jumps, ends in the Mars parking orbit', async () => {
    const V = await import('../src/space/Voyage');
    const plan = V.planVoyage('earth', 'mars', LAUNCH_JD).find((p) => p.kind === 'economy')!;
    const E = circle('earth', 400e3, 0.5), M = circle('mars', 400e3, 0.3);
    let p = V.finalizeDeparture(plan, LAUNCH_JD, (t) => E.at(0.3 + E.n * t), E.period);
    expect(p.wait!).toBeGreaterThanOrEqual(0);
    expect(p.wait!).toBeLessThanOrEqual(E.period + 60);
    p = V.finalizeArrival(p, M.at, 0);
    // starts exactly at the burn point of the parking orbit
    const start = V.voyagePoint(p, 0);
    const burn = add(position('earth', p.jdDepart), E.at(0.3 + E.n * p.wait!).r);
    expect(norm(sub(start, burn))).toBeLessThan(1);
    // ends exactly at the capture point of the Mars parking orbit
    const end = V.voyagePoint(p, p.tof);
    const cap = add(position('mars', p.jdDepart + p.tof / 86400), M.at(p.arrPhase!).r);
    expect(norm(sub(end, cap))).toBeLessThan(1);
    // continuity: no step faster than 60 km/s over the whole leg, sampled densely near both ends
    const ts: number[] = [];
    for (let k = 0; k <= 400; k++) ts.push(p.tof * (k / 400) ** 3);
    for (let k = 0; k <= 400; k++) ts.push(p.tof * (1 - (k / 400) ** 3));
    ts.sort((a, b) => a - b);
    let worst = 0;
    for (let k = 1; k < ts.length; k++) {
      const dt = ts[k] - ts[k - 1];
      if (dt < 1) continue;
      worst = Math.max(worst, norm(sub(V.voyagePoint(p, ts[k]), V.voyagePoint(p, ts[k - 1]))) / dt);
    }
    expect(worst).toBeLessThan(60e3);
    // the burns cost no less than the coplanar ideal
    expect(p.dvDepart).toBeGreaterThanOrEqual(plan.dvDepart * 0.98);
  });

  it('Saturn to the wormhole: a short transfer that comes to rest at the standoff point', async () => {
    const V = await import('../src/space/Voyage');
    const plans = V.planVoyage('saturn', 'wormhole', LAUNCH_JD);
    expect(plans.length).toBe(1);
    const S = circle('saturn', BODY.saturn.parkingAlt, 0.4);
    let p = V.finalizeDeparture(plans[0], LAUNCH_JD, (t) => S.at(S.n * t), S.period);
    const stand = (phi: number) => ({ r: [25e3 * Math.cos(phi), 25e3 * Math.sin(phi), 0] as V3, v: [0, 0, 0] as V3 });
    p = V.finalizeArrival(p, stand, 0);
    const end = V.voyagePoint(p, p.tof);
    expect(norm(sub(end, add(position('wormhole', p.jdDepart + p.tof / 86400), stand(p.arrPhase!).r)))).toBeLessThan(1);
    const late = V.voyagePosition(p, p.tof - 1);
    const wv = state('wormhole', p.jdDepart + p.tof / 86400).v;
    expect(norm(sub(late.v, wv))).toBeLessThan(20);   // braked to rest relative to the wormhole
  });
});
