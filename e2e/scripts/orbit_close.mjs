// Low-orbit close-up of BODY: Ranger in a parking orbit, camera looking at the horizon and obliquely down.
const BODY = process.env.BODY ?? 'moon';
const PARK = Number(process.env.PARK ?? 150e3);
const SHIFT = Number(process.env.SHIFT ?? 0);
const setup = `await game.startCreative(false); game.cinematic = null; const B = (await import('/src/data/bodies.ts')).BODIES; const t = game.state.clock.earthTime + ${SHIFT};
  game.state.clock.earthTime = t; const R = B['${BODY}'].radius + ${PARK}; const vc = Math.sqrt(B['${BODY}'].mu / R);
  const SS = await import('/src/render/SolarSystem.ts'); const h = SS.helio('${BODY}', t).r;
  const sun = new V3(-h[0], -h[1], -h[2]).normalize(); const ax = new V3(0, 1, 0).cross(sun).normalize();
  const r0 = sun.clone().applyAxisAngle(new V3(0, 1, 0), -${Number(process.env.SUNANG ?? 55)} * Math.PI / 180 - 0.26); const v0 = new V3(0, 1, 0).cross(r0).normalize().multiplyScalar(vc);
  const ed = game.state.vehicles.endurance.data; delete ed.cruise; delete ed.hold; delete ed.pending; ed.orbit = { r0: r0.multiplyScalar(R).toArray(), v0: v0.toArray(), t0: t, body: '${BODY}' };
  game.state.vehicles.ranger1.docked = null; await game.goTo('space', { at: 'orbit' }, { fade: 0 }); return game.zone.primaryId;`;
const view = (name, js) => ({ js: `const z = game.zone; z.scene.visible = false; z.control.camMode = 'cinematic'; game.cinematic = { blocking: true, update: () => true }; const cam = game.camera; const r = new V3(...z.craft.pos); const up = r.clone().normalize(); const sun = z.sun.position.clone().sub(z.sun.target.position).normalize();
  const side = new V3().crossVectors(up, sun).normalize(); const fwd = new V3().crossVectors(side, up).normalize(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 3, shot: name });
export const steps = [
  { js: setup, wait: 3000, frames: 5 },
  // terminator region: look along the ground toward the sunset line
  view('oc_horizon', `cam.fov = 50; cam.updateProjectionMatrix(); cam.position.set(0, 0, 0); cam.up.copy(up); cam.lookAt(fwd.clone().multiplyScalar(-1).addScaledVector(up, -0.32))`),
  view('oc_nadir', `cam.fov = 40; cam.updateProjectionMatrix(); cam.position.set(0, 0, 0); cam.up.copy(fwd); cam.lookAt(up.clone().multiplyScalar(-1).addScaledVector(side, 0.35))`),
];
