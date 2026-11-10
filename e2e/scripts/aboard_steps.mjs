// Aboard the Endurance: spawn in rooms, check spin gravity + floor contact, eye-level screenshots.
const probe = `const z = game.zone; const p = game.player; const g = z.eFrame.gravity(p.pos, new p.pos.constructor()).length();
return { mode: p.mode, frame: p.frame?.id, r: +Math.hypot(p.pos.x, p.pos.y).toFixed(2), g: +(g / 9.81).toFixed(2), room: z.describe().sub, grounded: p.grounded ?? null };`;
const look = (yaw, pitch) => `const p = game.player; p.heading.applyAxisAngle(p.up, ${yaw}); p.pitch = ${pitch};`;
const room = (at, name, yaw = 0, pitch = -0.05) => [
  { js: `await game.zone.spawn({ at: '${at}' });`, frames: 45, probe },
  { js: look(yaw, pitch), frames: 2, shot: name, probe },
];
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'endurance:command' }, { fade: 0 }); return game.zone.id;`, wait: 5000, frames: 45, probe },
  { js: look(0, -0.08), frames: 2, shot: 'ab_command', probe },
  { js: look(Math.PI, -0.1), frames: 2, shot: 'ab_command_rear', probe },
  ...room('endurance:galley', 'ab_galley', 0.6),
  ...room('endurance:cryo', 'ab_cryo', 2.4, -0.15),
  ...room('endurance:hub', 'ab_hub', 0, 0),
];
