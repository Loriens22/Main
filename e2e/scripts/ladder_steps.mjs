// Walk route aboard: command deck → shaft ladder → vestibule (ring level) → spoke ladder → hub.
const probe = `const z = game.zone; const p = game.player; const g = z.eFrame.gravity(p.pos, new p.pos.constructor()).length();
return { mode: p.mode, r: +Math.hypot(p.pos.x, p.pos.y).toFixed(2), axial: +p.pos.z.toFixed(2), g: +(g / 9.81).toFixed(2), room: z.describe().sub };`;
const use = (id) => `const it = game.zone.site.interactables.find((i) => i.id === '${id}'); if (!it) return 'missing ${id}'; it.use(); return game.player.mode;`;
const look = (yaw, pitch) => `const p = game.player; p.heading.applyAxisAngle(p.up, ${yaw}); p.pitch = ${pitch};`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'endurance:command' }, { fade: 0 }); return game.zone.id;`, wait: 5000, frames: 30, probe },
  { js: look(0, 0.05), frames: 2, shot: 'lad_command_windows', probe },
  { js: use('endu_lad_m9'), frames: 2, probe },
  { js: `game.player.ladderT = 0.5;`, frames: 2, shot: 'lad_shaft', probe },
  { js: `game.player.ladderT = 1.01;`, frames: 20, probe },
  { js: look(2.2, -0.1), frames: 2, shot: 'lad_vestibule', probe },
  { js: use('endu_lad_s9'), frames: 2, probe },
  { js: `game.player.ladderT = 0.55;`, frames: 2, shot: 'lad_spoke', probe },
  { js: `game.player.ladderT = 1.01;`, frames: 30, probe },
  { js: look(0, 0), frames: 2, shot: 'lad_hub_arrive', probe },
  { js: `await game.zone.spawn({ at: 'endurance:galley' });`, frames: 30 },
  { js: look(-0.5, 0.0), frames: 2, shot: 'lad_galley_portholes', probe },
];
