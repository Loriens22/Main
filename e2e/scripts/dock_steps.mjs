// Docking autopilot from the 160 m approach spawn: probe every 10 s of sim time, shots along the way.
const probe = `const z = game.zone; const c = z.craft; const r = z.portRelation(c); const ap = z.control.autopilot; return { t: +(ap?.t ?? -1).toFixed(1), ph: ap?.phase ?? (z.r1Docked ? 'DOCKED' : null), dist: +r.dist.toFixed(2), lat: +r.lateral.toFixed(2), close: +r.closing.toFixed(2), align: +r.alignErr.toFixed(1), roll: +r.rollErr.toFixed(1), rate: +r.rateErr.toFixed(3), fuel: Math.round(c.state.fuel) };`;
const s = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'approach' }, { fade: 0 }); const P = await import('/src/space/Proximity.ts'); const z = game.zone; z.control.setAutopilot(new P.DockingApproach(z)); z.control.camMode = 'chase'; return z.id;`, wait: 3000, frames: 10, probe },
];
for (let k = 0; k < 8; k++) s.push({ frames: 240, chunk: 120, probe, shot: k === 2 || k === 4 || k === 5 ? 'dock_' + k : undefined });
s.push({ js: `game.zone.control.camMode = 'docking';`, frames: 1, shot: 'dock_final_cam', probe });
export const steps = s;
