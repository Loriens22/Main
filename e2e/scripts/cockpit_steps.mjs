// Ranger 1 cockpit views in orbit (nose prograde, Earth below).
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'orbit' }, { fade: 0 }); return game.zone.id;`, wait: 4000, frames: 10 },
  { js: `const c = game.zone.control; c.camMode = 'cockpit'; c.camPitch = -0.25; c.camYaw = 0;`, frames: 2, shot: 'cockpit_fwd' },
  { js: `const c = game.zone.control; c.camPitch = -0.15; c.camYaw = 0.9;`, frames: 2, shot: 'cockpit_side' },
];
