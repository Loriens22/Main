// Return to Earth: Earth orbit → RETURN TO EARTH (NASA or farm) → entry → hand-over → touchdown → EVA → re-board → ascent → orbit.
const TARGET = process.env.TARGET ?? 'nasa';
const probe = `const z = game.zone; if (!z) return 'loading'; const rf = z.returnFlight; const c = z.id === 'earth' ? rf?.craft : z.craft; if (!c) return { zone: z.id };
  const ap = (z.id === 'earth' ? rf.control : z.control)?.autopilot; const agl = z.id === 'earth' ? c.pos[1] - z.height(c.pos[0], c.pos[2]) : null;
  return { zone: z.id, ap: ap ? ap.name + ':' + ap.phase : null, alt: z.id === 'space' ? +(z.env.altitude(c.pos) / 1000).toFixed(2) : null, agl: agl !== null ? +agl.toFixed(1) : null, v: +Math.hypot(...c.vel).toFixed(1), landed: c.landed, g: +(c.accel.length() / 9.81).toFixed(1),
    off: z.id === 'earth' ? +Math.hypot(c.pos[0] - rf.target[0], c.pos[2] - rf.target[2]).toFixed(1) : null, fuel: Math.round(c.state.fuel), msg: (z.id === 'earth' ? rf.control : z.control)?.messages?.[0] ?? null, mode: game.player.mode };`;
const chase = (name, yaw = 2.4, pitch = 0.2, dist = 1.2) => ({ js: `const z = game.zone; const ctl = z.id === 'earth' ? z.returnFlight.control : z.control; ctl.camMode = 'chase'; ctl.chaseYaw = ${yaw}; ctl.chasePitch = ${pitch}; ctl.chaseDist = ${dist}; return 1;`, frames: 2, shot: name, probe });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.creative.unlimitedResources = false; game.state.vehicles.ranger1.docked = null; game.state.vehicles.ranger1.fuel = game.state.vehicles.ranger1.fuelMax;
    await game.goTo('space', { at: 'orbit' }, { fade: 0 }); return game.zone.landOnEarth('${TARGET}');`, wait: 3000, frames: 5, probe },
  { frames: 2, probe },
  { untilJs: `(() => { const z = game.zone; return z && z.id === 'space' && z.env.altitude(z.craft.pos) < 90e3; })()`, max: 30000, chunk: 30, probe },
  chase('er_entry', 2.6, 0.15, 1.5),
  { untilJs: `!!game.zone && game.zone.id === 'earth' && !!game.zone.returnFlight?.craft`, max: 30000, chunk: 30, probe },
  { wait: 2500, frames: 3, probe },
  chase('er_handover', 2.2, 0.25, 1.3),
  { untilJs: `(() => { const rf = game.zone.returnFlight; const c = rf.craft; return c.pos[1] - game.zone.height(c.pos[0], c.pos[2]) < 400; })()`, max: 12000, dt: 0.1, chunk: 50, probe },
  chase('er_approach', 2.0, 0.22, 1.0),
  { untilJs: `!!game.zone.returnFlight.ranger.site`, max: 6000, dt: 0.05, chunk: 50, probe },
  { js: `const z = game.zone; const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; const r = z.returnFlight.ranger.root.position.clone(); const V = cam.position.constructor; cam.fov = 55; cam.updateProjectionMatrix(); cam.position.copy(r).add(new V(-24, 0, 18)); cam.position.y = z.height(cam.position.x, cam.position.z) + 1.8; cam.lookAt(r.clone().add(new V(0, 1, 0))); cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: 'er_landed', probe },
  { js: `game.cinematic = null; game.zone.returnFlight.ranger.beginEva(); return game.player.mode;`, frames: 30, shot: 'er_eva', probe },
  { js: `const rf = game.zone.returnFlight; rf.ranger.seat(); rf.ascend(); return 1;`, frames: 5, probe },
  { untilJs: `!!game.zone && game.zone.id === 'space' && !!game.zone.craft`, max: 20000, dt: 0.1, chunk: 50, probe },
  { wait: 2500, frames: 3, probe },
  { untilJs: `!game.zone.control?.autopilot`, max: 8000, chunk: 30, probe },
  { frames: 1, probe },
];
