// Ranger 1 parked on the NASA forecourt (after a return) → ASCENT TO ORBIT → hand-over at 45 km → orbit insertion.
const probe = `const z = game.zone; if (!z) return 'loading'; const rf = z.returnFlight; const c = z.id === 'earth' ? rf?.craft : z.craft; if (!c) return { zone: z.id };
  const ctl = z.id === 'earth' ? rf.control : z.control; const ap = ctl?.autopilot;
  return { zone: z.id, ap: ap ? ap.name + ':' + ap.phase : null, alt: z.id === 'space' ? +(z.env.altitude(c.pos) / 1000).toFixed(1) : +((c.pos[1] - z.height(c.pos[0], c.pos[2])) / 1000).toFixed(1), v: Math.round(Math.hypot(...c.vel)), fuel: Math.round(c.state.fuel), msg: ctl?.messages?.[0] ?? null };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.creative.unlimitedResources = false; const r1 = game.state.vehicles.ranger1; r1.data.onEarth = true; r1.data.earthTarget = 'nasa'; r1.landed = true; r1.location = 'earth'; r1.docked = null; r1.fuel = r1.fuelMax;
    await game.goTo('earth', { at: 'ranger1' }, { fade: 0 }); game.zone.returnFlight.ascend(); return 1;`, wait: 3000, frames: 2, probe },
  { untilJs: `!!game.zone && game.zone.id === 'space' && !!game.zone.craft`, max: 20000, dt: 0.1, chunk: 50, probe },
  { wait: 2500, frames: 3, probe },
  { untilJs: `!game.zone.control?.autopilot`, max: 20000, chunk: 60, probe },
  { js: `const z = game.zone; const c = z.craft; const P = await import('/src/space/earthFrame.ts'); const s = P.orbitSummary(c.pos, c.vel, 3.986004418e14, 6.371e6); return { pe: +(s.pe / 1000).toFixed(1), ap: +(s.ap / 1000).toFixed(1), fuel: Math.round(c.state.fuel) };`, frames: 1 },
];
