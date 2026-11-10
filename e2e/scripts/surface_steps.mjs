// Surface zone: landed on BODY at SITE (lat/lon env), views around the Ranger, cockpit, EVA.
const BODY = process.env.BODY ?? 'moon';
const LAT = Number(process.env.LAT ?? 0.674), LON = Number(process.env.LON ?? 23.473);
const NAME = process.env.NAME ?? 'Mare Tranquillitatis';
const HOUR = Number(process.env.HOUR ?? 0); // shift the clock to move the Sun
const probe = `const z = game.zone; const c = z.craft; return { zone: z.id, mode: game.player.mode, ctx: game.input.context, landed: c?.landed, pos: c ? c.pos.map((v) => +v.toFixed(1)) : null,
  sun: z.sunLocal ? z.sunLocal.toArray().map((v) => +v.toFixed(3)) : null, exp: +z.exposure.toFixed(2), sunVis: +(z.sunVisCPU ?? 0).toFixed(2), site: !!z.rangerSite, where: z.describe() };`;
const view = (name, js) => ({ js: `const z = game.zone; const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; ${js}; cam.updateMatrixWorld(true);`, frames: 2, shot: name });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.clock.earthTime += ${HOUR} * 3600; if ('${BODY}' === 'miller' || '${BODY}' === 'mann' || '${BODY}' === 'edmunds') game.state.system = 'gargantua'; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: ${LAT}, lon: ${LON}, name: '${NAME}' }; v.landed = true;
    const t0 = performance.now(); await game.goTo('surface', { at: 'landed' }, { fade: 0 }); return { id: game.zone.id, ms: Math.round(performance.now() - t0) };`, wait: 3000, frames: 20, probe },
  { frames: 30, shot: 'surf_cockpit', probe },
  view('surf_ranger', `const r = z.r1Root.position.clone(); const sun = z.sunLocal.clone(); sun.y = 0; sun.normalize(); cam.fov = 55; cam.updateProjectionMatrix(); cam.position.copy(r).add(new V3(-sun.x * 14 + sun.z * 10, 4.5, -sun.z * 14 - sun.x * 10)); cam.position.y = z.gen.field.height(cam.position.x, cam.position.z) + 2.2; cam.lookAt(r.clone().add(new V3(0, 0.5, 0)))`),
  view('surf_vista', `const r = z.r1Root.position.clone(); cam.fov = 60; cam.updateProjectionMatrix(); cam.position.copy(r).add(new V3(25, 0, 25)); cam.position.y = z.gen.field.height(cam.position.x, cam.position.z) + 1.7; cam.lookAt(cam.position.clone().add(new V3(1, -0.05, 0.3)))`),
  view('surf_aerial', `const r = z.r1Root.position.clone(); cam.fov = 55; cam.updateProjectionMatrix(); cam.position.copy(r).add(new V3(-600, 900, 700)); cam.lookAt(r)`),
  view('surf_sky', `const r = z.r1Root.position.clone(); const s = z.sunLocal.clone(); cam.fov = 70; cam.updateProjectionMatrix(); cam.position.copy(r).add(new V3(-s.x * 30 + 12, 0, -s.z * 30 + 8)); cam.position.y = z.gen.field.height(cam.position.x, cam.position.z) + 1.7; const tgt = cam.position.clone().add(new V3(s.x, Math.max(0.1, s.y * 0.85), s.z)); cam.lookAt(tgt)`),
  { js: `game.cinematic = null; game.zone.beginEva(); return game.player.mode;`, frames: 30, probe },
  { frames: 30, shot: 'surf_eva', probe },
];
