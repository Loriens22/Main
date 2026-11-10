// Docked Ranger 1 → leave the pilot seat → Endurance hub → iris door → back into the pilot seat.
const probe = `const z = game.zone; const p = game.player; return { mode: p.mode, frame: p.frame?.id, aboard: z.aboard, control: !!game.control, room: z.describe().sub };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'docked' }, { fade: 0 }); return game.zone.r1Docked;`, wait: 5000, frames: 20, probe },
  { js: `const ok = game.control.exit(); if (ok) game.setControl(null); return ok;`, frames: 30, probe },
  { js: `const p = game.player; p.pitch = 0.0;`, frames: 2, shot: 'xfer_hub', probe },
  { js: `const it = [...game.interaction.items?.values?.() ?? []].find((i) => i.id === 'endu_board_r1'); if (!it) return 'no reboard'; it.use(); return game.player.mode;`, frames: 10, probe },
];
