// Space visuals: posed cameras (cinematic mode) around the Endurance and toward the Earth.
const AT = process.env.AT ?? 'approach';
const pose = (name, js) => ({ js: `const z = game.zone; z.control.camMode = 'cinematic'; const cam = game.camera; ${js}; cam.updateMatrixWorld(true);`, frames: 1, shot: name });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: '${AT}' }, { fade: 0 }); return game.zone.id;`, wait: 5000, frames: 20 },
  // camera beside the Endurance, looking along the ring toward the Earth's limb
  pose('sv_endurance_wide', `const e = z.eRoot.position.clone(); const down = new V3(...z.origin).normalize().negate(); const side = new V3(0,0,1).applyQuaternion(z.eQLvlh); cam.position.copy(e).addScaledVector(side, -95).addScaledVector(down, -25).add(new V3(18, 0, 0).applyQuaternion(z.eQLvlh)); cam.up.copy(down.clone().negate()); cam.lookAt(e.clone().addScaledVector(down, 12));`),
  // from the Ranger's docking camera
  { js: `game.zone.control.camMode = 'docking';`, frames: 1, shot: 'sv_docking_cam' },
  // the Earth below from the Ranger (looking down at nadir and toward the horizon)
  pose('sv_earth_horizon', `const down = new V3(...z.origin).normalize().negate(); const fwd = new V3(...z.craft.vel).normalize(); cam.position.set(0, 0, 0); cam.up.copy(down.clone().negate()); cam.lookAt(fwd.clone().multiplyScalar(10).addScaledVector(down, 3.5));`),
];
