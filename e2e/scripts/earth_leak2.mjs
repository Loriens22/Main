// Native-memory growth during an ascent from the NASA forecourt (frames stepped, nothing rendered).
// VARIANT=base | noaudio | noroads — disables one suspect subsystem.
const VARIANT = process.env.VARIANT ?? 'base';
const probe = `const z = game.zone; if (!z || !z.returnFlight) return z ? z.id : 'loading'; const rf = z.returnFlight; const c = rf.craft;
  return { agl: Math.round(c.pos[1] - z.height(c.pos[0], c.pos[2])), v: Math.round(Math.hypot(...c.vel)), ap: rf.control.autopilot?.phase ?? null, heapMB: Math.round(performance.memory.usedJSHeapSize / 1e6), cols: z.ground.physics.world.colliders.len(), roads: window.__roads | 0, patches: window.__patches | 0 };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; const r1 = game.state.vehicles.ranger1; r1.data.onEarth = true; r1.data.earthTarget = 'nasa'; r1.landed = true; r1.location = 'earth'; r1.docked = null; r1.fuel = r1.fuelMax;
    await game.goTo('earth', { at: 'ranger1' }, { fade: 0 }); const z = game.zone; const ph = z.ground.physics; const o = ph.setTerrainPatch.bind(ph); ph.setTerrainPatch = (...a) => { window.__patches = (window.__patches | 0) + 1; return o(...a); };
    if ('${VARIANT}' === 'noaudio') { try { await game.audio.ctx?.close(); } catch {} game.audio.ctx = null; }
    if ('${VARIANT}' === 'noroads') z.roadColCenter.set(1e12, 1e12); // never "far from" … patched below
    return !!z.returnFlight;`, wait: 3000, frames: 10, probe },
  { js: `const z = game.zone; if ('${VARIANT}' === 'noroads') { z.roadColCenter = { distanceTo: () => 0, copy() {} }; } else { const ph = z.ground.physics; const rem = ph.world.removeCollider.bind(ph.world); ph.world.removeCollider = (...a) => { window.__roads = (window.__roads | 0) + 1; return rem(...a); }; }
    z.returnFlight.ascend(); return 1;`, frames: 2, probe },
  ...Array.from({ length: 12 }, () => ({ frames: 200, dt: 0.1, chunk: 50, probe })),
];
