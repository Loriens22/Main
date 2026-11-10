// Liftoff: range-camera views as the stack leaves the silo (keep renders few: SwiftShader + forest is heavy).
const probe = `const l = game.zone.launch; const c = l?.craft; return { phase: l?.phase, t: l && +l.missionT.toFixed(1), alt: c && Math.round(c.pos[1] - l.padY), cam: l?.control?.camMode };`;
const T = +(process.env.LIFT_T ?? 3);
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.mission.decision = 'endurance'; game.zone.content.spawnAt('nasa_silo');`, frames: 20 },
  { js: `game.zone.content.nasa.board(); const l = game.zone.launch; game.ui.closeAllPanels(); l.nasa.siloDoorsOpen = true; l.mode = 'auto'; l.startCountdown(); l.control.camMode = 'tower';`, frames: Math.round((11 + T) * 30) },
  { js: `game.zone.launch.control.camMode = 'tower';`, frames: 1, shot: 'lift_t' + T, probe },
];
