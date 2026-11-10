// Full launch: board Ranger 1 in the silo, run the checklist, autopilot countdown and ascent to the space handover.
const probe = `const l = game.zone.launch; const c = l?.craft; return { zone: game.zone.id, phase: l?.phase, stage: l?.stageNo, t: l && +l.missionT.toFixed(1), alt: c && Math.round(c.pos[1] - l.padY), v: c && Math.round(c.speed()), fuel: c && Math.round(c.state.fuel), cam: l?.control?.camMode, ts: l?.control?.timeScale };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.mission.decision = 'endurance'; game.zone.content.spawnAt('nasa_silo'); return game.player.pos.toArray();`, frames: 20 },
  { js: `game.zone.content.nasa.board(); return game.zone.launch?.phase;`, frames: 10, shot: 'launch_01_board', ui: true },
  { js: `const l = game.zone.launch; game.ui.closeAllPanels(); l.nasa.siloDoorsOpen = true; l.mode = 'auto'; l.startCountdown(); return l.phase;`, frames: 240, shot: 'launch_02_countdown', probe },
  { frames: 120, shot: 'launch_03_liftoff', probe },
  { frames: 150, shot: 'launch_04_climb', probe },
  { frames: 600, shot: 'launch_05_high', probe },
  { frames: 900, probe },
  { frames: 900, shot: 'launch_06_upper', probe },
  { frames: 900, probe },
  { frames: 900, shot: 'launch_07_end', probe },
];
