import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BODIES } from '../src/data/bodies';
import { setPrimary, PRIMARY } from '../src/space/earthFrame';
import { makeSite, bodyRot } from '../src/space/surfaceFrame';
import { DeorbitLanding, predictEntry, entryAero } from '../src/space/Landing';
import { propagate, type V3 } from '../src/space/kepler';
import { lambertECI } from '../src/space/Proximity';
import { SPECS } from '../src/data/vehicles';
import { handoverAltitude } from '../src/data/landing';

/**
 * Deorbit planning through an atmosphere: the planned (impulsive) deorbit, flown through the entry model, must reach
 * the approach gate close to where the powered descent expects it, for thin (Mars), Earth-like and very deep (Titan)
 * atmospheres.
 */
function fly(body: string, lat: number, lon: number, park: number) {
  const B = BODIES[body];
  setPrimary(body, B.mu, B.radius);
  const t = 2128563000;
  const site = makeSite(body, lat, lon);
  const Rt = bodyRot(body, t).transpose();
  const s = site.up.clone().applyMatrix3(Rt).normalize();
  const n = site.south.clone().negate().applyMatrix3(Rt).normalize();
  const a = (-60 * Math.PI) / 180;
  const along = n.clone().cross(s);
  const r = s.clone().multiplyScalar(Math.cos(a)).addScaledVector(along, Math.sin(a));
  const R = B.radius + park;
  const vc = Math.sqrt(B.mu / R);
  const v = n.clone().cross(r).normalize().multiplyScalar(vc);
  const spec = SPECS.ranger;
  const mass = spec.dryMass + 26000;
  const c = {
    pos: r.multiplyScalar(R).toArray() as V3, vel: v.toArray() as V3, mass, spec,
    maxAccel: () => spec.mainThrust / mass,
  };
  let now = t;
  const host = { now: () => now, say: () => {} };
  const hHand = handoverAltitude(body, B.radius);
  const ap = new DeorbitLanding(host as never, site, 'site', hHand);
  const ok = ap.plan(c as never);
  expect(ok).toBe(true);
  // impulsive burn at tBurn toward the aimed gate, then the entry model down to the gate altitude
  const st = propagate(c.pos, c.vel, PRIMARY.mu, ap.tBurn - t);
  now = ap.tBurn;
  const gate = (ap as unknown as { gate(t: number, aimed?: boolean): THREE.Vector3 }).gate.bind(ap);
  const sol = lambertECI(st.r, gate(ap.tArr).toArray() as V3, ap.tArr - ap.tBurn, ap['hRef']);
  expect(sol).toBeTruthy();
  const pr = predictEntry(st.r, sol!.v1, entryAero(c as never), ap.gateAlt, (ap.tArr - ap.tBurn) * 3 + 20000);
  expect(pr.hit).toBe(true);
  // compare with the un-aimed gate in the body frame
  const pB = new THREE.Vector3(...pr.r).applyMatrix3(bodyRot(body, ap.tBurn + pr.t)).normalize();
  const gB = gate(ap.tArr, false).applyMatrix3(bodyRot(body, ap.tArr)).normalize();
  const sB = site.up.clone();
  const miss = pB.angleTo(gB) * B.radius;
  const fromSite = pB.angleTo(sB) * B.radius;
  const gateFromSite = gB.angleTo(sB) * B.radius;
  const vGate = Math.hypot(...pr.v);
  return { miss, fromSite, gateFromSite, vGate, gMax: pr.gMax, tEntry: pr.t, tof: ap.tArr - ap.tBurn, entryMiss: ap.entryMiss, upAngle: ap.upAngle, aimAlong: ap.aimAlong, dv: ap.dv };
}

describe('deorbit entry targeting', () => {
  for (const [body, lat, lon, park] of [
    ['mars', 18.38, 77.58, 150e3],
    ['titan', -10.6, -167.7, 1200e3],
    ['edmunds', 12, 40, 200e3],
  ] as [string, number, number, number][]) {
    it(`${body}: entry arrives at the approach gate`, () => {
      const r = fly(body, lat, lon, park);
      console.log(body, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +(+v).toFixed(3)]))));
      expect(r.miss).toBeLessThan(15e3);
    }, 120000);
  }
});
