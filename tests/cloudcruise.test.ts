import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Spacecraft, type FlightEnv } from '../src/vehicles/Spacecraft';
import { SPECS } from '../src/data/vehicles';
import { CloudCruise } from '../src/space/Landing';
import type { VehicleState } from '../src/core/State';

/**
 * Jupiter's cloud layer: Ranger 1 on the CLOUD CRUISE hold (augmented hydrogen: unlimited, efficiency ×2) keeps its
 * height and speed in 2.5 g, rides out an electrical surge (no thrust for 1.6 s) and fights a maw ray's drag.
 */
const G = 24.79;
const env: FlightEnv = {
  gravity: () => [0, -G, 0],
  density: (p) => 0.17 * Math.exp(-p[1] / 27000),
  up: () => [0, 1, 0],
  altitude: (p) => p[1],
};

function ranger() {
  const st = {
    id: 'ranger1', type: 'ranger', name: 'Ranger 1', location: 'surface', pos: [0, 1500, 0], quat: [0, 0, 0, 1], vel: [150, 0, 0], angVel: [0, 0, 0],
    fuel: 2000, fuelMax: 2000, power: 1, damage: {}, maintenance: 0, docked: null, landed: false, gearDown: false, passengers: [], autopilot: null, lights: false, hatchOpen: false, data: {},
  } as unknown as VehicleState;
  const c = new Spacecraft(SPECS.ranger, st);
  c.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
  c.unlimited = true;
  c.efficiency = 2;
  return c;
}

function fly(c: Spacecraft, ap: CloudCruise, seconds: number, each?: (t: number, dt: number) => void) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    each?.(t, dt);
    ap.update(c, dt, env);
    c.step(dt, env);
  }
}

describe('cloud cruise on Jupiter', () => {
  it('holds altitude and airspeed', () => {
    const c = ranger();
    const ap = new CloudCruise(1500, 150);
    fly(c, ap, 60);
    expect(Math.abs(c.pos[1] - 1500)).toBeLessThan(40);
    expect(Math.abs(Math.hypot(c.vel[0], c.vel[2]) - 150)).toBeLessThan(15);
  });

  it('recovers from an electrical surge (no thrust for 1.6 s)', () => {
    const c = ranger();
    const ap = new CloudCruise(1500, 150);
    fly(c, ap, 10);
    let low = 1e9;
    fly(c, ap, 30, (t) => {
      c.efficiency = t < 1.6 ? 0 : 2;
      low = Math.min(low, c.pos[1]);
    });
    expect(low).toBeGreaterThan(1350); // a short sag, not a plunge
    expect(Math.abs(c.pos[1] - 1500)).toBeLessThan(60);
  });

  it('fights a latched maw ray dragging it down', () => {
    const c = ranger();
    const ap = new CloudCruise(1500, 150);
    fly(c, ap, 20, (_t, dt) => {
      c.vel[1] -= 6 * dt;
      const k = 1 - 0.1 * dt;
      c.vel[0] *= k;
      c.vel[2] *= k;
    });
    expect(c.pos[1]).toBeGreaterThan(1200);
  });
});
