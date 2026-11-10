// Solar-system renderer checks from wherever the zone spawns: look at named bodies with a narrow lens.
const AT = process.env.AT ?? 'approach';
const lookAt = (id, fov, name) => ({
  js: `const z = game.zone; z.scene.visible = false; z.control.camMode = 'cinematic'; const cam = game.camera; const b = z.system.bodies.find((x) => x.id === '${id}');
    cam.position.set(0, 0, 0); cam.fov = ${fov}; cam.updateProjectionMatrix(); cam.lookAt(b.mesh.position.clone().normalize().multiplyScalar(100)); cam.updateMatrixWorld(true);
    return { id: '${id}', distKm: Math.round(b.dist), fov: ${fov} };`,
  frames: 1, shot: name,
});
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: '${AT}' }, { fade: 0 }); return game.zone.id;`, wait: 6000, frames: 20 },
  { js: `const z = game.zone; z.scene.visible = false; z.control.camMode = 'cinematic'; const cam = game.camera; cam.fov = 60; cam.updateProjectionMatrix();
    const down = new V3(...z.origin).normalize().negate(); const fwd = new V3(...z.craft.vel).normalize(); cam.position.set(0, 0, 0); cam.up.copy(down.clone().negate()); cam.lookAt(fwd.clone().multiplyScalar(10).addScaledVector(down, 3.5)); cam.updateMatrixWorld(true);`, frames: 1, shot: 'sys_earth' },
  lookAt('moon', 2.0, 'sys_moon'),
  lookAt('sun', 30, 'sys_sun'),
  lookAt('jupiter', 0.3, 'sys_jupiter_far'),
];
