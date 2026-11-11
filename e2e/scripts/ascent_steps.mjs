// Ascent profile from landed on BODY: phase, altitude, speeds, apoapsis, fuel every few seconds.
const BODY = process.env.BODY ?? 'mars';
const FUEL = Number(process.env.FUEL ?? 8800);
const SYS = ['miller', 'mann', 'edmunds'].includes(BODY) ? 'gargantua' : 'sol';
const UNLIMITED = process.env.UNLIMITED ? 'true' : 'false';
const EVERY = Number(process.env.EVERY ?? 10);
const probe = `const z = game.zone; if (!z || !z.craft) return 'loading'; const c = z.craft; const ap = z.control.autopilot; const s = z.orbit ? z.orbit(c) : null; const up = new (game.camera.position.constructor)(...z.env.up(c.pos)); const v = new (game.camera.position.constructor)(...c.vel);
  return { zone: z.id, ph: ap ? ap.phase : null, msg: z.control.messages?.[0] ?? null, alt: +(z.env.altitude(c.pos) / 1000).toFixed(2), vr: +v.dot(up).toFixed(0), vh: +Math.sqrt(Math.max(0, v.lengthSq() - v.dot(up) ** 2)).toFixed(0), ap: s ? +(s.ap / 1000).toFixed(1) : null, fuel: Math.round(c.state.fuel), thr: +c.throttle.toFixed(2), vtol: +c.vtol.toFixed(2), pitch: +(Math.asin(Math.max(-1, Math.min(1, c.forward().dot(up)))) * 57.3).toFixed(0) };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.creative.unlimitedResources = ${UNLIMITED}; game.state.system = '${SYS}'; const L = await import('/src/data/landing.ts'); const s = L.SURFACES['${BODY}'].sites[0]; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true; v.fuel = ${FUEL}; await game.goTo('surface', { at: 'landed' }, { fade: 0 }); game.zone.ascend(); return 1;`, wait: 1500, frames: 2, probe },
  { untilJs: `!!game.zone && game.zone.id === 'space' && !!game.zone.craft`, max: 16000, dt: 0.1, chunk: 100, every: EVERY, probe },
  { wait: 2500, frames: 3, probe },
  { untilJs: `!game.zone.control?.autopilot`, max: 16000, chunk: 100, every: EVERY, probe },
  { js: `const z = game.zone; const c = z.craft; const P = await import('/src/space/earthFrame.ts'); const B = (await import('/src/data/bodies.ts')).BODIES[z.primaryId]; const s = P.orbitSummary(c.pos, c.vel, B.mu, B.radius); return { pe: +(s.pe / 1000).toFixed(1), ap: +(s.ap / 1000).toFixed(1), fuel: Math.round(c.state.fuel) };`, frames: 1 },
];
