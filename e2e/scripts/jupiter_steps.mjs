// Jupiter's cloud layer: dive in (cruise), fly with the cloud-cruise hold, views; creatures (PART=2+).
const site = process.env.SITE ?? '0';
const probe = `const z = game.zone; if (!z.gas) return 'not gas'; const c = z.craft; const up = new c.quat.constructor(); const alt = z.env.altitude(c.pos);
  return { alt: Math.round(alt), v: Math.round(Math.hypot(...c.vel)), vy: +c.vel[1].toFixed(1), ap: z.control.autopilot?.name ?? null, hull: +(game.state.vehicles.ranger1.damage.hull ?? 1).toFixed(2), fauna: z.fauna ? z.fauna.creatures.map((k) => k.species[0] + ':' + k.state + '@' + Math.round(k.pos.distanceTo(new k.pos.constructor(...c.pos)))).join(' ') : null };`;
const land = { js: `await game.startCreative(false); game.cinematic = null;
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES.jupiter.sites[${site}]; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'jupiter', lat: s.lat, lon: s.lon, name: s.name }; v.landed = false;
    await game.goTo('surface', { at: 'cruise' }, { fade: 0 }); game.step(2, 1 / 30, false);
    const B = (await import('/src/data/bodies.ts')).BODIES.jupiter; for (let i = 0; i < 30 && game.zone.sunLocal.y < 0.45; i++) { game.state.clock.earthTime += Math.abs(B.rotation) / 24; game.step(1, 1 / 30, false); }
    return { gas: game.zone.gas, sun: +game.zone.sunLocal.y.toFixed(2) };`, wait: 1500, frames: 30, probe };
const view = (name, js) => ({ js: `const z = game.zone; const c = z.craft; const P = new game.camera.position.constructor(...c.pos); const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 65; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: name, probe });
const free = { js: `game.cinematic = null; return 1;`, frames: 1 };
export const steps = [
  land,
  { frames: 300, chunk: 60, probe },
  view('jup_chase', `cam.position.copy(P).add(new P.constructor(-40, 12, 25)); cam.lookAt(P.x + 60, P.y - 5, P.z)`), free,
  view('jup_wide', `cam.position.copy(P).add(new P.constructor(0, 8, 0)); cam.lookAt(P.x + 3000, P.y - 900, P.z + 1200)`), free,
  view('jup_down', `cam.position.copy(P).add(new P.constructor(0, -6, 0)); cam.lookAt(P.x + 1500, P.y - 3500, P.z - 600)`), free,
  { frames: 300, chunk: 60, probe },
];
