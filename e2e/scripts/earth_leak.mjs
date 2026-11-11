// Memory probe: Ranger 1 descending onto the NASA forecourt in the Earth zone, frames stepped without rendering.
// Samples the JS heap, Rapier collider count and terrain-patch rebuilds per chunk to find what grows.
const probe = `const z = game.zone; if (!z || !z.returnFlight) return 'loading'; const rf = z.returnFlight; const c = rf.craft; const ph = z.ground.physics; const mi = game.renderer.gl.info.memory; let objs = 0; z.scene.traverse(() => objs++);
  return { agl: +(c.pos[1] - z.height(c.pos[0], c.pos[2])).toFixed(1), ap: rf.control.autopilot?.phase ?? null, heapMB: Math.round(performance.memory.usedJSHeapSize / 1e6), colliders: ph.world.colliders.len(), patches: window.__patches | 0, site: !!rf.ranger.site, geo: mi.geometries, tex: mi.textures, objs, cam: game.camera.position.toArray().map((v) => Math.round(v)) };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; const r1 = game.state.vehicles.ranger1; r1.data.onEarth = true; r1.data.earthTarget = 'nasa'; r1.landed = true; r1.location = 'earth'; r1.docked = null;
    await game.goTo('earth', { at: 'ranger1' }, { fade: 0 }); const ph = game.zone.ground.physics; const orig = ph.setTerrainPatch.bind(ph); ph.setTerrainPatch = (...a) => { window.__patches = (window.__patches | 0) + 1; return orig(...a); }; return !!game.zone.returnFlight;`, wait: 3000, frames: 10, probe },
  { js: `const rf = game.zone.returnFlight; const c = rf.craft; rf.ranger.removeSite(); c.landed = false; c.contact = false; c.pos[1] += 2000; c.pos[0] -= 1500; c.vel[0] = c.vel[1] = c.vel[2] = 0; const L = await import('/src/space/Landing.ts'); rf.control.setAutopilot(new L.PoweredDescent(rf, rf.targetName, 'approach')); rf.control.camMode = 'chase'; rf.control.chaseYaw = 2.0; rf.control.chasePitch = 0.22; rf.control.chaseDist = 1.0; return rf.control.autopilot?.name;`, frames: 3, probe },
  { frames: 1, shot: 'leak_view', probe },
  ...Array.from({ length: 20 }, () => ({ frames: 200, dt: 0.05, chunk: 50, probe })),
];
