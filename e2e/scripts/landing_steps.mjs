// Full landing: lunar orbit → DEORBIT & LAND (autopilot) → handover → powered descent → touchdown → ascent → orbit.
const BODY = process.env.BODY ?? 'moon';
const LAT = Number(process.env.LAT ?? 0.674), LON = Number(process.env.LON ?? 23.473);
const NAME = process.env.NAME ?? 'Mare Tranquillitatis';
const PARK = Number(process.env.PARK ?? 150e3);
const UNLIMITED = process.env.UNLIMITED ? 'true' : 'false';
const SYS = ['miller', 'mann', 'edmunds'].includes(BODY) ? 'gargantua' : 'sol';
const probe = `const z = game.zone; if (!z) return "loading"; const c = z.craft; const ap = z.control?.autopilot; const agl = z.id === 'surface' ? c.pos[1] - z.gen.field.height(c.pos[0], c.pos[2]) : null;
  return { zone: z.id, ap: ap ? ap.name + ':' + ap.phase : null, alt: c ? +(z.env.altitude(c.pos) / 1000).toFixed(2) : null, agl: agl !== null ? +agl.toFixed(1) : null, v: c ? +Math.hypot(...c.vel).toFixed(1) : null,
    landed: c?.landed, msg: z.control?.messages?.[0] ?? null, fuel: c ? Math.round(c.state.fuel) : null, t: Math.round(game.state.clock.earthTime), heap: Math.round(performance.memory.usedJSHeapSize / 1e6) };`;
const until = (cond, max, dt = 1 / 30) => ({ js: `return 1;`, untilJs: cond, max, dt, probe });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.creative.unlimitedResources = ${UNLIMITED}; game.state.system = '${SYS}';
    const SF = await import('/src/space/surfaceFrame.ts'); const B = (await import('/src/data/bodies.ts')).BODIES;
    const t = game.state.clock.earthTime; const site = SF.makeSite('${BODY}', ${LAT}, ${LON});
    const Rt = SF.bodyRot('${BODY}', t).transpose(); const s = site.up.clone().applyMatrix3(Rt).normalize(); const n = site.south.clone().negate().applyMatrix3(Rt).normalize();
    const a = -60 * Math.PI / 180; const along = n.clone().cross(s); const r = s.clone().multiplyScalar(Math.cos(a)).addScaledVector(along, Math.sin(a));
    const R = B['${BODY}'].radius + ${PARK}; const vc = Math.sqrt(B['${BODY}'].mu / R); const v = n.clone().cross(r).normalize().multiplyScalar(vc);
    const ed = game.state.vehicles.endurance.data; delete ed.cruise; delete ed.hold; delete ed.pending; ed.orbit = { r0: r.multiplyScalar(R).toArray(), v0: v.toArray(), t0: t, body: '${BODY}' };
    game.state.vehicles.ranger1.docked = null; game.state.vehicles.ranger1.fuel = game.state.vehicles.ranger1.fuelMax; await game.goTo('space', { at: 'orbit' }, { fade: 0 }); return game.zone.primaryId;`, wait: 3000, frames: 5, probe },
  { js: `return game.zone.landAt(${LAT}, ${LON}, '${NAME}');`, frames: 5, probe },
  { frames: 1, shot: 'land_orbit', probe },
  { untilJs: `!!game.zone && game.zone.id === 'surface' && !!game.zone.craft`, max: 30000, chunk: 30, probe },
  { wait: 2500, frames: 3, shot: 'land_handover', probe },
  { frames: 600, dt: 0.1, chunk: 50, probe },
  { frames: 1, shot: 'land_braking', probe },
  { untilJs: `(() => { const ap = game.zone.control?.autopilot; return !ap || ap.phase !== 'brake'; })()`, max: 6000, dt: 0.1, chunk: 50, probe },
  { frames: 1, shot: 'land_highgate', probe },
  { untilJs: `(() => { const z = game.zone; const c = z.craft; return c.pos[1] - z.gen.field.height(c.pos[0], c.pos[2]) < 60 || !z.control.autopilot; })()`, max: 6000, dt: 0.1, chunk: 50, probe },
  { frames: 1, shot: 'land_final', probe },
  { untilJs: `!!game.zone.rangerSite`, max: 3000, dt: 0.05, chunk: 50, probe },
  { js: `const z = game.zone; const c = z.craft; return { landedAt: c.pos.map((v) => +v.toFixed(1)), offTarget: +Math.hypot(c.pos[0] - z.target[0], c.pos[2] - z.target[2]).toFixed(1) };`, frames: 30, shot: 'land_down', probe },
  { js: `game.zone.ascend(); return 1;`, frames: 5, probe },
  { untilJs: `!!game.zone && game.zone.id === 'space' && !!game.zone.craft`, max: 12000, dt: 0.1, chunk: 50, probe },
  { wait: 2500, frames: 3, probe },
  { untilJs: `!game.zone.control?.autopilot`, max: 4000, chunk: 30, probe },
  { js: `const z = game.zone; const c = z.craft; const P = await import('/src/space/earthFrame.ts'); const B = (await import('/src/data/bodies.ts')).BODIES[z.primaryId]; const s = P.orbitSummary(c.pos, c.vel, B.mu, B.radius); return { pe: +(s.pe / 1000).toFixed(1), ap: +(s.ap / 1000).toFixed(1) };`, frames: 1, shot: 'land_back_in_orbit', probe },
];
