// Full launch: board Ranger 1 in the silo, run the checklist, autopilot countdown and ascent to the space handover.
const probe = `if (!game.zone) return 'loading'; if (game.zone.id === 'space') { const c = game.zone.craft; return { zone: 'space', ap: game.zone.control?.autopilot?.phase ?? null, v: c && Math.round(c.speed()), msg: game.zone.control?.messages?.[0] ?? null }; } const l = game.zone.launch; const c = l?.craft; return { zone: game.zone.id, phase: l?.phase, stage: l?.stageNo, t: l && +l.missionT.toFixed(1), alt: c && Math.round(c.pos[1] - l.padY), v: c && Math.round(c.speed()), fuel: c && Math.round(c.state.fuel), cam: l?.control?.camMode, ts: l?.control?.timeScale };`;
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
  // on into orbit: hand-over to the orbital zone, staging, orbit insertion
  { untilJs: `!!game.zone && game.zone.id === 'space' && !!game.zone.craft`, max: 20000, chunk: 60, probe },
  { wait: 2500, frames: 3, probe },
  { untilJs: `(() => { const z = game.zone; if (!z || z.id !== 'space' || !z.craft || z.control?.autopilot) return false; const r = z.craft.pos, v = z.craft.vel; const rn = Math.hypot(...r), v2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2; const a = 1 / (2 / rn - v2 / 3.986004418e14); return a > 6.371e6 + 150e3; })()`, max: 20000, chunk: 60, probe },
  { js: `const z = game.zone; const c = z.craft; const P = await import('/src/space/earthFrame.ts'); const s = P.orbitSummary(c.pos, c.vel, 3.986004418e14, 6.371e6); return { pe: +(s.pe / 1000).toFixed(1), ap: +(s.ap / 1000).toFixed(1), fuel: Math.round(c.state.fuel), spec: c.spec.label };`, frames: 1 },
];
