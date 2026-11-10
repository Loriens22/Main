// Descent visuals over BODY: synthetic start 30 km up, 150 km up-range at orbital-ish speed; chase-camera shots per phase.
const BODY = process.env.BODY ?? 'moon';
const LAT = Number(process.env.LAT ?? 0.674), LON = Number(process.env.LON ?? 23.473);
const HOUR = Number(process.env.HOUR ?? -55);
const VH = Number(process.env.VH ?? 1600), X0 = Number(process.env.X0 ?? -150000), H0 = Number(process.env.H0 ?? 30000);
const probe = `const z = game.zone; if (!z) return 0; const c = z.craft; const ap = z.control.autopilot; return { ap: ap ? ap.phase : null, agl: +(c.pos[1] - z.gen.field.height(c.pos[0], c.pos[2])).toFixed(0), v: +Math.hypot(...c.vel).toFixed(1), landed: c.landed, off: +Math.hypot(c.pos[0] - z.target[0], c.pos[2] - z.target[2]).toFixed(1), fuel: Math.round(c.state.fuel) };`;
const chase = (name, yaw = 2.3, pitch = 0.22, dist = 1) => ({ js: `const z = game.zone; z.control.camMode = 'chase'; z.control.chaseYaw = ${yaw}; z.control.chasePitch = ${pitch}; z.control.chaseDist = ${dist}; return 1;`, frames: 2, shot: name, probe });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.clock.earthTime += ${HOUR} * 3600; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: ${LAT}, lon: ${LON}, name: 'site' }; v.landed = true; await game.goTo('surface', { at: 'landed' }, { fade: 0 }); return game.zone.def.style;`, wait: 2000, frames: 2 },
  { js: `const z = game.zone; const c = z.craft; z.removeRangerSite?.(); c.pos[0] = ${X0}; c.pos[1] = ${H0} + z.gen.curvature(${X0}, 0) + z.gen.field.height(${X0}, 0) - z.gen.curvature(${X0}, 0); c.pos[2] = 0; c.vel[0] = ${VH}; c.vel[1] = -20; c.vel[2] = 0; c.landed = false; c.contact = false; c.gearDown = false;
    const L = await import('/src/space/Landing.ts'); z.control.setAutopilot(new L.PoweredDescent(z, 'site')); return 1;`, frames: 2, probe },
  { untilJs: `(() => { const z = game.zone, c = z.craft; return c.pos[1] - z.gen.field.height(c.pos[0], c.pos[2]) < 12000; })()`, max: 6000, dt: 0.1, chunk: 50 },
  chase('dv_braking', 2.6, 0.12, 1.4),
  { untilJs: `game.zone.control.autopilot?.phase !== 'brake'`, max: 6000, dt: 0.1, chunk: 50 },
  chase('dv_highgate', 2.2, 0.3, 1.2),
  { untilJs: `(() => { const z = game.zone, c = z.craft; return c.pos[1] - z.gen.field.height(c.pos[0], c.pos[2]) < 25 || !z.control.autopilot; })()`, max: 8000, dt: 0.1, chunk: 50 },
  chase('dv_final', 1.9, 0.18, 0.8),
  { untilJs: `!!game.zone.rangerSite`, max: 3000, dt: 0.05, chunk: 50, probe },
  { js: `const z = game.zone; const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; const r = z.r1Root.position.clone(); const s = z.sunLocal.clone(); s.y = 0; s.normalize(); cam.fov = 50; cam.updateProjectionMatrix(); cam.position.copy(r).add(new cam.position.constructor(s.x * 16 - s.z * 9, 0, s.z * 16 + s.x * 9)); cam.position.y = z.gen.field.height(cam.position.x, cam.position.z) + 1.8; cam.lookAt(r.clone().add(new cam.position.constructor(0, 0.4, 0))); cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: 'dv_down', probe },
];
