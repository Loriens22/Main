// Full rendezvous + docking from the parking-orbit spawn (time-compressed autopilot).
const probe = `const z = game.zone; const c = z.craft; const r = z.portRelation(c); const ap = z.control.autopilot; const s = (await import('/src/space/earthFrame.ts')).orbitSummary(c.pos, c.vel);
return { T: Math.round(game.state.clock.earthTime - window.__t0), ap: ap?.name?.slice(0, 10) ?? (z.r1Docked ? 'DOCKED' : null), ph: ap?.phase, ts: z.control.timeScale, dist: +r.dist.toFixed(1), axial: +r.axial.toFixed(1), lat: +r.lateral.toFixed(1), spinOn: ap?.spinOn, close: +r.closing.toFixed(2), pe: Math.round(s.pe / 1000), ap_: Math.round(s.ap / 1000), dv: Math.round(c.deltaV()) };`;
const s = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'orbit' }, { fade: 0 }); window.__t0 = game.state.clock.earthTime; const P = await import('/src/space/Proximity.ts'); const z = game.zone; z.control.setAutopilot(new P.Rendezvous(z, () => z.control.setAutopilot(new P.DockingApproach(z)))); return z.id;`, wait: 3000, frames: 5 },
];
for (let k = 0; k < 13; k++) s.push({ frames: 300, chunk: 300, probe });
for (let k = 0; k < 10; k++) s.push({ frames: 450, chunk: 150, probe, shot: k === 9 ? "rdv_end" : undefined });
export const steps = s;
