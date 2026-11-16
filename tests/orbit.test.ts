import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { cwAccel, cwPropagate, cwTarget, lvlhToPolar, polarToLvlh } from '../src/space/Orbit';
import { meanMotion, MU_EARTH, PARKING_ALT, R_EARTH } from '../src/space/Earth';

const rT = R_EARTH + PARKING_ALT;
const n = meanMotion(rT);

describe('relative motion', () => {
  test('closed-form CW propagation matches numerical integration of the CW accelerations', () => {
    const p = new THREE.Vector3(-1500, 220, 40), v = new THREE.Vector3(1.2, -0.4, 0.05);
    const a = new THREE.Vector3();
    const P = p.clone(), V = v.clone();
    const dt = 0.05, T = 1800;
    for (let t = 0; t < T; t += dt) {
      // semi-implicit with midpoint velocity for accuracy
      cwAccel(P, V, n, a);
      const Vm = V.clone().addScaledVector(a, dt / 2);
      const Pm = P.clone().addScaledVector(V, dt / 2);
      cwAccel(Pm, Vm, n, a);
      P.addScaledVector(Vm, dt);
      V.addScaledVector(a, dt);
    }
    const cp = new THREE.Vector3(), cv = new THREE.Vector3();
    cwPropagate(p, v, n, T, cp, cv);
    expect(cp.distanceTo(P)).toBeLessThan(0.5);
    expect(cv.distanceTo(V)).toBeLessThan(0.002);
  });

  test('CW agrees with exact two-body motion for a nearby craft', () => {
    // craft 1.2 km behind and 300 m below, on a circular orbit of its own
    const r = rT - 300, phi0 = -1200 / rT, vt = Math.sqrt(MU_EARTH / r);
    const p0 = new THREE.Vector3(), v0 = new THREE.Vector3();
    polarToLvlh(r, phi0, 0, vt, rT, 0, n, p0, v0);
    // exact polar two-body integration
    let R = r, PHI = phi0, VR = 0, VT = vt;
    const dt = 0.1, T = 1200;
    for (let t = 0; t < T; t += dt) {
      const ar = (VT * VT) / R - MU_EARTH / (R * R);
      const at = (-VR * VT) / R;
      VR += ar * dt; VT += at * dt;
      R += VR * dt; PHI += (VT / R) * dt;
    }
    const pe = new THREE.Vector3(), ve = new THREE.Vector3();
    polarToLvlh(R, PHI, VR, VT, rT, n * T, n, pe, ve);
    const pc = new THREE.Vector3(), vc = new THREE.Vector3();
    cwPropagate(p0, v0, n, T, pc, vc);
    // a lower orbit runs ahead: 1.5 n dY per second
    expect(pe.x - p0.x).toBeGreaterThan(400);
    expect(pc.distanceTo(pe)).toBeLessThan(15);
  });

  test('polar <-> LVLH round trip', () => {
    const p = new THREE.Vector3(), v = new THREE.Vector3();
    polarToLvlh(rT + 120, 0.0013, 2.5, 7670, rT, 0.001, n, p, v);
    const back = lvlhToPolar(p, v, rT, 0.001, n);
    expect(back.r).toBeCloseTo(rT + 120, 3);
    expect(back.phi).toBeCloseTo(0.0013, 9);
    expect(back.vr).toBeCloseTo(2.5, 6);
    expect(back.vt).toBeCloseTo(7670, 4);
  });

  test('two-impulse targeting reaches the hold point', () => {
    const p0 = new THREE.Vector3(-6200, -350, 120), hold = new THREE.Vector3(-60, 0, 0);
    const T = 0.3 * (2 * Math.PI / n);
    const sol = cwTarget(p0, hold, n, T)!;
    expect(sol).not.toBeNull();
    const pf = new THREE.Vector3(), vf = new THREE.Vector3();
    cwPropagate(p0, sol.v0, n, T, pf, vf);
    expect(pf.distanceTo(hold)).toBeLessThan(1e-3);
    expect(vf.distanceTo(sol.vf)).toBeLessThan(1e-6);
    console.log(`transfer ${T.toFixed(0)} s, dv1 ${sol.v0.length().toFixed(2)} m/s, dv2 ${sol.vf.length().toFixed(2)} m/s`);
  });
});
