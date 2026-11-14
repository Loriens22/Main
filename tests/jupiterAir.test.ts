import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { JupiterAir, aeroStep, G_JUP, type AeroBody } from '../src/world/fauna/jupiterAir';

const rho = (p: THREE.Vector3) => 0.17 * Math.exp(-(p.y + 1500) / 27000);
const SKIMMER: AeroBody = { m: 600, S: 120, CLmax: 1.4, CD0: 0.02, k: 0.04, buoy: 0, T: 0, bank: 0.7 };

/** still air: no cells, no gusts */
class Still extends JupiterAir {
  updraft() {
    return 0;
  }
  wind(_p: THREE.Vector3, out = new THREE.Vector3()) {
    return out.set(0, 0, 0);
  }
}
/** a uniform rising column of w m/s */
class Rising extends Still {
  constructor(readonly w: number) {
    super(rho, 0);
  }
  wind(_p: THREE.Vector3, out = new THREE.Vector3()) {
    return out.set(0, this.w, 0);
  }
}

function fly(b: AeroBody, air: JupiterAir, goal: THREE.Vector3, wantV: number, secs: number, v0 = new THREE.Vector3(40, 0, 0)) {
  const pos = new THREE.Vector3();
  const vel = v0.clone();
  const dt = 1 / 30;
  for (let i = 0; i < secs / dt; i++) {
    air.t += dt;
    aeroStep(b, air, pos, vel, goal, wantV, dt);
  }
  return { pos, vel };
}

describe('Jupiter air: lift, drag and buoyancy', () => {
  it('a glider in still air sinks at a glide ratio set by its drag polar (no free levitation)', () => {
    const { pos, vel } = fly(SKIMMER, new Still(rho, 0), new THREE.Vector3(1e6, 0, 0), 40, 60);
    const sink = -vel.y;
    expect(sink).toBeGreaterThan(1);
    expect(sink).toBeLessThan(6);
    // it kept flying forward: a glide, not a fall
    expect(pos.x).toBeGreaterThan(1500);
    expect(vel.length()).toBeGreaterThan(30);
  });

  it('the same glider in a 6 m/s rising core climbs', () => {
    const { pos } = fly(SKIMMER, new Rising(6), new THREE.Vector3(1e6, 0, 0), 40, 60);
    expect(pos.y).toBeGreaterThan(50);
  });

  it('banks toward its goal (turns left and right correctly)', () => {
    for (const side of [1, -1]) {
      const { pos } = fly(SKIMMER, new Rising(4), new THREE.Vector3(0, 0, side * 1e6), 40, 20);
      expect(Math.sign(pos.z)).toBe(side);
      expect(Math.abs(pos.z)).toBeGreaterThan(150);
    }
  });

  it('a heavy body with no lift and no thrust falls; buoyancy only offsets part of the weight', () => {
    const rock: AeroBody = { m: 1000, S: 4, CLmax: 0, CD0: 1, k: 0, buoy: 0.5, T: 0, bank: 0 };
    const { vel } = fly(rock, new Still(rho, 0), new THREE.Vector3(0, 0, 0), 0, 30, new THREE.Vector3());
    // terminal speed where drag balances half the weight: sqrt(2·m·g·0.5 / (ρ·S·Cd))
    const vt = Math.sqrt((2 * 1000 * G_JUP * 0.5) / (rho(new THREE.Vector3(0, -1000, 0)) * 4 * 1));
    expect(-vel.y).toBeGreaterThan(vt * 0.6);
    expect(-vel.y).toBeLessThan(vt * 1.4);
  });

  it('a near-neutral drifter takes up the wind (drag-limited, stable at large steps)', () => {
    const jelly: AeroBody = { m: 120, S: 60, CLmax: 0, CD0: 1.2, k: 0, buoy: 0.995, T: 0, bank: 0 };
    const air = new (class extends Still {
      wind(_p: THREE.Vector3, out = new THREE.Vector3()) {
        return out.set(8, 0, -3);
      }
    })(rho, 0);
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    for (let i = 0; i < 600; i++) aeroStep(jelly, air, pos, vel, pos.clone(), 0, 0.25);
    expect(vel.x).toBeGreaterThan(6.5);
    expect(vel.z).toBeLessThan(-2);
    expect(Math.abs(vel.y)).toBeLessThan(2);
  });

  it('the convective field has rising cores and a downdraft ring, and core() finds a rising one', () => {
    const air = new JupiterAir(rho, 0, 3);
    let up = 0, down = 0;
    for (let x = 0; x < 6400; x += 50) for (let z = 0; z < 6400; z += 50) {
      const w = air.updraft(x, z);
      if (w > 2) up++;
      if (w < -0.3) down++;
    }
    expect(up).toBeGreaterThan(50);
    expect(down).toBeGreaterThan(50);
    const c = air.core(800, 800);
    expect(air.updraft(c.x, c.z)).toBeGreaterThan(1.5);
  });
});
