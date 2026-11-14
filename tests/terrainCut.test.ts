import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld, RAPIER, initPhysics } from '../src/physics/Physics';

/**
 * Terrain cuts (a tunnel driven under a hillside, e.g. the NASA entry): inside the cut volume the terrain height map
 * is ignored by ray queries and by moving bodies; outside it everything collides as before. The contact filter runs
 * inside rapier's step, so it must be pure JS: a hook that throws silently drops every terrain contact.
 */
describe('terrain cuts', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  const world = () => {
    const ph = new PhysicsWorld(new THREE.Vector3(0, -9.81, 0));
    ph.setTerrainPatch(0, 0, 16, 4, () => 0);
    ph.terrainCuts.push(new THREE.Box3(new THREE.Vector3(10, -5, -5), new THREE.Vector3(20, 5, 5)));
    return ph;
  };
  const dropBox = (ph: PhysicsWorld, x: number) => {
    const b = ph.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 2, 0));
    ph.world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), b);
    return b;
  };

  it('bodies outside a cut still rest on the terrain', () => {
    const ph = world();
    const b = dropBox(ph, -10);
    for (let i = 0; i < 120; i++) ph.step(1 / 60);
    expect(b.translation().y).toBeCloseTo(0.5, 1);
  });

  it('bodies inside a cut do not touch the terrain (the structure brings its own floor)', () => {
    const ph = world();
    const inside = dropBox(ph, 15);
    const outside = dropBox(ph, -10);
    for (let i = 0; i < 120; i++) ph.step(1 / 60);
    expect(inside.translation().y).toBeLessThan(-1);
    // and the filter does not leak to bodies elsewhere in the same step
    expect(outside.translation().y).toBeCloseTo(0.5, 1);
  });

  it('a floor collider inside the cut carries the body', () => {
    const ph = world();
    ph.addBox(new THREE.Vector3(5, 0.1, 5), new THREE.Vector3(15, -2.1, 0));
    const b = dropBox(ph, 15);
    for (let i = 0; i < 180; i++) ph.step(1 / 60);
    expect(b.translation().y).toBeCloseTo(-1.5, 1);
  });

  it('ray queries from inside a cut skip the terrain', () => {
    const ph = world();
    ph.world.step(); // build the query structures
    const down = new THREE.Vector3(0, -1, 0);
    expect(ph.raycast(new THREE.Vector3(-10, 3, 0), down, 10)?.point.y).toBeCloseTo(0, 1);
    expect(ph.raycast(new THREE.Vector3(15, 3, 0), down, 10)).toBeNull();
    expect(ph.inTerrainCut({ x: 15, y: 0, z: 0 })).toBe(true);
    expect(ph.inTerrainCut({ x: 15, y: 6, z: 0 })).toBe(false);
  });
});
