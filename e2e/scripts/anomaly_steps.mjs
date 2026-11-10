// Arrive at the Anomaly near Saturn (plan, jump to arrival, capture) and look at the lens.
const view = (name, js) => ({ js: `const z = game.zone; game.cinematic = null; z.control.camMode = 'cinematic'; const cam = game.camera; ${js}; cam.updateMatrixWorld(true);`, frames: 2, shot: name });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'docked' }, { fade: 0 }); return game.zone.id;`, wait: 6000, frames: 10 },
  { js: `const N = await import('/src/space/Navigation.ts'); const z = game.zone; const plan = N.planTransfer('earth', 'wormhole', game.state.clock.earthTime, 'fast');
    game.clock.skipEarth(plan.tArr - game.state.clock.earthTime, { location: 'space', system: 'sol' }); void z.arrive(plan); return 'arriving';`, frames: 60, probe: 'return game.zone.whereText();' },
  { frames: 60, probe: 'return game.zone.whereText();' },
  { frames: 60 },
  view('anom_lens', `z.scene.visible = false; cam.position.set(0, 0, 0); cam.fov = 45; cam.updateProjectionMatrix(); cam.lookAt(z.lens.mesh.position)`),
  view('anom_endurance', `z.scene.visible = true; const e = z.eRoot.position.clone(); const dir = z.lens.mesh.position.clone().normalize(); cam.fov = 60; cam.updateProjectionMatrix(); cam.position.copy(e).addScaledVector(dir, -140).add(new V3(0, 30, 0)); cam.lookAt(e.clone().addScaledVector(dir, 400))`),
  view('anom_saturn', `z.scene.visible = false; const b = z.system.bodies.find((x) => x.id === 'saturn'); cam.position.set(0, 0, 0); cam.fov = 2.5; cam.updateProjectionMatrix(); cam.lookAt(b.mesh.position)`),
];
