// Launch handover → space zone → orbit insertion. Uses a synthetic handover state (the same fields
// Launch.handover writes: launch-local axes X east, Y up, Z south) so the test skips the atmospheric ascent.
const probe = `const z = game.zone; const c = z.craft; const s = (await import('/src/space/earthFrame.ts')).orbitSummary(c.pos, c.vel);
return { zone: z.id, spec: c.spec.label, ap: z.control.autopilot?.name ?? null, alt: Math.round(s.alt / 1000), pe: Math.round(s.pe / 1000), apo: Math.round(s.ap / 1000), v: Math.round(c.speed()), fuel: Math.round(c.state.fuel), stack: !!z.stackRoot, ph: z.control.autopilot?.phase, thr: +c.throttle.toFixed(2), sas: c.sas, w: +c.angVel.length().toFixed(3), fwdUp: +c.forward().dot(new c.angVel.constructor(...c.pos).normalize()).toFixed(3), rcsOn: c.rcsOn, ts: z.control.timeScale, ms: z.control.maxStep };`;
const s = [
  {
    js: `await game.startCreative(false); game.cinematic = null; const r1 = game.state.vehicles.ranger1;
    // stack pitched ~45° from vertical toward the east (body −Z = stack up)
    r1.data.launch = { x: 21000, y: 46000 + 6.371e6, z: 0, vx: 1500 + 360, vy: 1150, vz: 0, q: [0.3827, 0, 0, 0.9239], stage: 2, s2fuel: 80000, s1fuel: 0, t: 140, mode: 'auto' };
    r1.data.mounted = false; await game.goTo('space', { at: 'launch' }, { fade: 0 }); return game.zone.id;`,
    wait: 4000, frames: 10, probe,
  },
];
for (let k = 0; k < 17; k++) s.push({ frames: 300, chunk: 150, probe, shot: k === 1 ? 'ins_chase' : undefined });
export const steps = s;
