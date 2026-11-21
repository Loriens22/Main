import { describe, expect, it } from 'vitest';
import { BODIES, BODY } from '../src/space/Bodies';
import { LAUNCH_JD, surfacePoint } from '../src/space/Ephemeris';
import { add, cross, dot, norm, propagate, scale, sub, unit, V3 } from '../src/space/Kepler';
import { GATE_ALT, GATE_VZ, GuidedFlight, planAscent, planDescent, rangerPerf, spinVector } from '../src/space/Descent';
import { siteFunction } from '../src/space/FlightProgram';
import { RANGER_SPEC } from '../src/vehicles/Spacecraft';

const WORLDS = BODIES.filter((b) => b.landing).map((b) => b.id);

/** the site and the Endurance's parking orbit laid over it (as the orbit zone does on arrival) */
function setup(id: string, dt0 = 0) {
  const b = BODY[id], L = b.landing!, jd0 = LAUNCH_JD;
  const w = spinVector(b);
  const site = siteFunction(b, jd0);
  const s0 = site(0).r, sv = unit(s0);
  const east = unit(cross(BODY[id].system === 'gargantua' ? [0, 0, 1] : (globalThis as any).__pole ?? [0, 0, 1], sv));
  // plane through the site and its local east (pole of the body)
  const poleV = unit(w[0] || w[1] || w[2] ? w : [0, 0, 1]);
  const E = unit(cross(poleV, sv));
  void east;
  const rE = b.R + (b.surveyAlt ?? b.parkingAlt), n = Math.sqrt(b.GM / rE ** 3);
  const phase0 = -0.35 + dt0 * n;
  const endu = (t: number) => {
    const ph = phase0 + n * t;
    return { r: add(scale(sv, rE * Math.cos(ph)), scale(E, rE * Math.sin(ph))), v: add(scale(sv, -rE * n * Math.sin(ph)), scale(E, rE * n * Math.cos(ph))) };
  };
  return { b, site, endu, n, rE };
}

describe('descent and ascent guidance', () => {
  for (const id of WORLDS) {
    it(`${id}: deorbit to the gate above the site, then back up to the Endurance`, () => {
      const { b, site, endu } = setup(id, 1.0);
      const perf = rangerPerf(RANGER_SPEC);
      // the Ranger starts at the staging point 300 m behind the Endurance
      const e0 = endu(0);
      const r0 = sub(e0.r, scale(unit(e0.v), 300)), v0 = e0.v;
      const plan = planDescent(b, r0, v0, perf, site)!;
      expect(plan).not.toBeNull();
      const f = new GuidedFlight(b, r0, v0, perf, 'descent', site);
      f.armDescent(plan.tDeorbit, plan.rp);
      let maxG = 0, minH = Infinity, guard = 0, tBrake = -1, heat = 0;
      while (f.phase !== 'terminal' && f.phase !== 'landed' && guard++ < 400000) {
        const before = norm(f.v);
        f.step(f.phase === 'wait' ? Math.max(1, plan.tDeorbit - f.t) : f.phase === 'coast' && f.alt > (b.atmosphere?.top ?? 0) + 2e5 ? 20 : 0.5);
        if (f.phase !== 'wait' && f.phase !== 'coast') maxG = Math.max(maxG, Math.abs(norm(f.v) - before) / 0.5 / 9.81);
        if (f.phase === 'braking' && tBrake < 0) tBrake = f.t;
        if (f.phase === 'braking' || f.phase === 'entry') minH = Math.min(minH, f.height);
        heat = Math.max(heat, f.heat);
      }
      const s = site(f.t);
      const gate = add(s.r, scale(s.up, GATE_ALT));
      const miss = norm(sub(f.r, gate));
      const vErr = norm(sub(f.v, add(s.v, scale(s.up, GATE_VZ))));
      const out = { id, wait_h: +(plan.tDeorbit / 3600).toFixed(2), missPlan_km: +(plan.missM / 1000).toFixed(2), cross_deg: +(plan.cross * 57.3).toFixed(2), descent_min: +((f.t - plan.tDeorbit) / 60).toFixed(1), braking_s: +(f.t - tBrake).toFixed(0), gateMiss_m: +miss.toFixed(0), vErr: +vErr.toFixed(1), fuelLeft: +(f.fuel / perf.fuel).toFixed(2), maxG: +maxG.toFixed(1), minH_km: +(minH / 1000).toFixed(2), heat: +heat.toFixed(2) };
      if (process.env.TRACE) require('fs').appendFileSync(process.env.TRACE, JSON.stringify(out) + '\n');
      expect(miss).toBeLessThan(150);
      expect(vErr).toBeLessThan(25);
      expect(f.fuel).toBeGreaterThan(0);
      expect(minH).toBeGreaterThan(GATE_ALT * 0.5);
      // terminal descent onto the pad
      f.touchH = 2.2;
      let gT = 0, vTouch = 0;
      const tGate = f.t;
      while (f.phase !== 'landed' && gT++ < 20000) {
        const st = site(f.t);
        vTouch = dot(sub(f.v, st.v), st.up);
        f.step(0.05);
      }
      const st = site(f.t);
      const padMiss = norm(sub(sub(f.r, st.r), scale(st.up, dot(sub(f.r, st.r), st.up))));
      if (process.env.TRACE) require('fs').appendFileSync(process.env.TRACE, JSON.stringify({ id, terminal_s: +(f.t - tGate).toFixed(0), padMiss_m: +padMiss.toFixed(2), touchdown_ms: +vTouch.toFixed(2) }) + '\n');
      expect(f.phase).toBe('landed');
      expect(padMiss).toBeLessThan(15);
      expect(Math.abs(vTouch)).toBeLessThan(2);
      // ---- ascent: wait for the window, climb, insert 1.5 km behind the Endurance with its velocity
      const t0 = f.t;
      const behind = (t: number) => { const e = endu(t); return { r: sub(e.r, scale(unit(e.v), 1500)), v: e.v }; };
      // gas giants: the station refuels the Ranger and straps its ascent booster on
      const perfUp = b.station ? rangerPerf(RANGER_SPEC, RANGER_SPEC.fuelMax, b.station.booster) : perf;
      const asc = planAscent(b, (t) => site(t0 + t), (t) => behind(t0 + t), perfUp)!;
      expect(asc).not.toBeNull();
      const tL = t0 + asc.tLaunch;
      const sL = site(tL);
      const a = new GuidedFlight(b, add(sL.r, scale(sL.up, 5)), sL.v, perfUp, 'ascent', site, behind);
      // every world, Venus included (the drive takes its reaction mass from the dense air low down)
      expect(asc.fuelOk).toBe(true);
      a.t = tL;
      a.tArrive = t0 + asc.tArrive;
      let g2 = 0, maxQ = 0, dropped = -1;
      a.onJettison = () => { dropped = a.height; };
      while (a.phase !== 'done' && g2++ < 400000) { a.step(a.phase === 'xfer' ? 30 : 0.5); maxQ = Math.max(maxQ, a.q); }
      const tg = behind(a.t);
      const aMiss = norm(sub(a.r, tg.r)), aV = norm(sub(a.v, tg.v));
      if (process.env.TRACE) require('fs').appendFileSync(process.env.TRACE, JSON.stringify({ id, window_h: +(asc.tLaunch / 3600).toFixed(2), climb_s: +(a.t - tL).toFixed(0), miss_m: +aMiss.toFixed(0), vErr: +aV.toFixed(1), fuelUsed: +(1 - a.fuel / perf.fuel).toFixed(2), maxQ_kPa: +(maxQ / 1000).toFixed(1), boosterDrop_km: +(dropped / 1000).toFixed(0) }) + '\n');
      expect(aMiss).toBeLessThan(500);
      expect(aV).toBeLessThan(5);
      expect(a.fuel).toBeGreaterThan(0);
    });
  }
});
