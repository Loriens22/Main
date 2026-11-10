// At another planet: arrive (plan + jump + capture), undock Ranger 1, fly free, then dock back on autopilot.
const TO = process.env.TO ?? 'mars';
const probe = `const z = game.zone; const r = z.portRelation(z.craft); return { primary: z.primaryId, docked: z.r1Docked, dist: +r.dist.toFixed(1), ap: z.control.autopilot?.phase ?? null, where: z.whereText() };`;
const view = (name, js) => ({ js: `const z = game.zone; z.control.camMode = 'cinematic'; const cam = game.camera; ${js}; cam.updateMatrixWorld(true);`, frames: 2, shot: name });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'docked' }, { fade: 0 }); return game.zone.id;`, wait: 6000, frames: 10 },
  { js: `const N = await import('/src/space/Navigation.ts'); const z = game.zone; const plan = N.planTransfer('earth', '${TO}', game.state.clock.earthTime, 'fast');
    game.clock.skipEarth(plan.tArr - game.state.clock.earthTime, { location: 'space', system: 'sol' }); void z.arrive(plan); return 'arriving';`, frames: 300, probe },
  { js: `game.cinematic = null; game.zone.undock(); game.zone.control.camMode = 'chase';`, frames: 240, probe },
  { js: `game.zone.control.camMode = 'chase';`, frames: 2, shot: 'pf_ranger_free', probe },
  { js: `const P = await import('/src/space/Proximity.ts'); const z = game.zone; z.control.setAutopilot(new P.DockingApproach(z)); return z.control.autopilot.name;`, frames: 600, chunk: 150, probe },
  { frames: 600, chunk: 150, probe },
  { frames: 300, chunk: 150, probe },
];
