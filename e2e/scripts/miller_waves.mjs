// Miller's tidal waves: landed Ranger at the beacon, a wave scheduled shortly, views of the approach, the ride over
// the crest and the aftermath; then the player on foot is swept by the next wave.
const PROT = process.env.PROT === '1';
const probe = `const z = game.zone; if (!z || !z.waves) return "loading"; const c = z.craft; const pl = game.player; const W = z.waves; const nx = W.next(c.pos[0], c.pos[2], z.time);
  return { t: +z.time.toFixed(1), tta: nx ? +nx.tta.toFixed(1) : null, H: nx ? Math.round(nx.wave.H) : null, hHere: +W.height(c.pos[0], c.pos[2], z.time).toFixed(1), craft: c.pos.map((v) => +v.toFixed(1)), landed: c.landed, ride: !!z.ride, flooded: +z.ranger.flooded.toFixed(1), eff: c.efficiency, site: !!z.rangerSite,
    player: [pl.pos.x, pl.pos.y, pl.pos.z].map((v) => +v.toFixed(1)), mode: pl.mode, swim: !!z.swim, health: game.state.player.health, dmg: game.state.vehicles.ranger1.damage, hud: z.hudInfo().extra.filter((e) => e[0] === 'WAVE' || e[0] === 'ENGINES'), msg: game.ui?.lastNotify ?? null };`;
const view = (name, js) => ({ js: `const z = game.zone; const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 62; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 1, shot: name, probe });
const free = { js: `game.cinematic = null; return 1;`, frames: 1 };
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.system = 'gargantua'; game.state.creative.damageProtection = ${PROT}; game.state.creative.hazardProtection = ${PROT};
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES.miller.sites[0]; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'miller', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); return game.zone.def.style;`, wait: 2500, frames: 10, probe },
  { js: `const z = game.zone; z.waves.first = null; z.waves.schedule(z.time + 150); return z.waves.wave(0);`, frames: 2, probe },
  // approach: wait until ~70 s out, look east toward the incoming crest from beside the Ranger
  { untilJs: `(() => { const z = game.zone; const c = z.craft; const nx = z.waves.next(c.pos[0], c.pos[2], z.time); return nx && nx.tta < 70; })()`, max: 4000, dt: 0.1, chunk: 50, probe },
  view('wave_approach', `const c = z.craft; const w = z.waves.wave(0); cam.position.set(c.pos[0] + w.dir.x * 60 - w.dir.y * 25, c.pos[1] + 4, c.pos[2] + w.dir.y * 60 + w.dir.x * 25); cam.lookAt(c.pos[0] - w.dir.x * 3000, c.pos[1] + 250, c.pos[2] - w.dir.y * 3000)`),
  free,
  { untilJs: `(() => { const z = game.zone; const c = z.craft; const nx = z.waves.next(c.pos[0], c.pos[2], z.time); return nx && nx.tta < 12; })()`, max: 4000, dt: 0.1, chunk: 50, probe },
  view('wave_close', `const c = z.craft; const w = z.waves.wave(0); cam.position.set(c.pos[0] + w.dir.x * 120 - w.dir.y * 60, c.pos[1] + 6, c.pos[2] + w.dir.y * 120 + w.dir.x * 60); cam.lookAt(c.pos[0] - w.dir.x * 800, c.pos[1] + 300, c.pos[2] - w.dir.y * 800)`),
  free,
  { untilJs: `!!game.zone.ride`, max: 2000, dt: 0.05, chunk: 20, probe },
  { frames: 60, dt: 0.05, chunk: 20, probe },
  view('wave_ride', `const c = z.craft; const w = z.waves.wave(0); cam.position.set(c.pos[0] - w.dir.y * 220 + w.dir.x * 40, c.pos[1] + 30, c.pos[2] + w.dir.x * 220 + w.dir.y * 40); cam.lookAt(c.pos[0], c.pos[1], c.pos[2])`),
  free,
  { frames: 200, dt: 0.05, chunk: 20, probe },
  view('wave_crest', `const c = z.craft; const w = z.waves.wave(0); cam.position.set(c.pos[0] - w.dir.y * 300 - w.dir.x * 150, c.pos[1] + 60, c.pos[2] + w.dir.x * 300 - w.dir.y * 150); cam.lookAt(c.pos[0], c.pos[1] - 20, c.pos[2])`),
  free,
  { untilJs: `!game.zone.ride`, max: 3000, dt: 0.05, chunk: 20, probe },
  { frames: 120, dt: 0.1, chunk: 30, probe },
  view('wave_after', `const c = z.craft; const w = z.waves.wave(0); cam.position.set(c.pos[0] - w.dir.x * 80, c.pos[1] + 8, c.pos[2] - w.dir.y * 80); cam.lookAt(c.pos[0] + w.dir.x * 4000, c.pos[1] + 200, c.pos[2] + w.dir.y * 4000)`),
  free,
  // second wave: the player on foot beside the Ranger
  { js: `const z = game.zone; z.beginEva(true); const n = Math.max(1, Math.floor((z.time - z.waves.first) / z.waves.period) + 1); z.waves.first = z.time + 60 - n * z.waves.period - (z.waves.wave(n).t0 - (z.waves.first + n * z.waves.period)); return { n, t0: z.waves.wave(n).t0 - z.time };`, frames: 5, probe },
  { untilJs: `!!game.zone.swim`, max: 3000, dt: 0.05, chunk: 20, probe },
  { frames: 140, dt: 0.05, chunk: 20, probe },
  view('wave_swim', `const p = game.player.pos; const w = z.waves.wave(z.sweptWave); cam.position.set(p.x - w.dir.y * 45 - w.dir.x * 25, p.y + 6, p.z + w.dir.x * 45 - w.dir.y * 25); cam.lookAt(p.x, p.y, p.z)`),
  free,
  { untilJs: `!game.zone.swim`, max: 4000, dt: 0.05, chunk: 40, probe },
  { frames: 20, dt: 0.05, probe },
];
