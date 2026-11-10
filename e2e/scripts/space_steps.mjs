// Space zone: Earth from orbit, the Endurance at the hold point, chase views.
const probe = `const z = game.zone; const c = z.craft; const r = z.portRelation(c); return { zone: z.id, dist: +r.dist.toFixed(1), align: +r.alignErr.toFixed(1), sun: z.sunVis, cam: z.control?.camMode, ap: z.control?.autopilot?.name ?? null };`;
const AT = process.env.AT ?? 'approach';
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: '${AT}' }, { fade: 0 }); return game.zone.id;`, wait: 4000, frames: 30, probe },
  { js: `game.zone.control.camMode = 'chase';`, frames: 20, shot: 'space_chase_' + AT, probe },
  { js: `game.zone.control.camMode = 'cockpit';`, frames: 5, shot: 'space_cockpit', probe },
];
