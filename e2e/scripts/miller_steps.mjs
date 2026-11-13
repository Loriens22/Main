// Miller's habitats and the suit under water: reef, hollow, rift and basin from the air; the lee pool; swimming down
// the rift with the helmet lamp; the basin rim. PART=1 (habitats) | 2 (fauna, later parts).
const H = `const z = game.zone; const pl = game.player; const V = pl.pos.constructor; const B = (await import('/src/world/surface/millerBiome.ts')).MILLER_BIOME;
  const put = (x, zz, dy = 0.05, yaw = 0, pitch = 0) => { pl.enterFrame(z.ground, new V(x, z.terrainY(x, zz) + dy, zz), yaw, 'walk'); pl.pitch = pitch; };`;
const probe = `const z = game.zone; const pl = game.player; return { pos: [pl.pos.x, pl.pos.y, pl.pos.z].map((v) => Math.round(v * 10) / 10), floor: +z.terrainY(pl.pos.x, pl.pos.z).toFixed(1), sub: +pl.submerged.toFixed(2), depth: +(z.stillDepth(pl.pos) - 1.6).toFixed(1), underK: +z.underK.toFixed(3), mode: pl.mode, hp: +(game.state.player.health ?? 1).toFixed(2) };`;
const land = { js: `await game.startCreative(false); game.cinematic = null;
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES.miller.sites[0]; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'miller', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    game.state.creative.hazardProtection = false; game.state.player.health = 1;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); game.step(2, 1 / 30, false);
    const B = (await import('/src/data/bodies.ts')).BODIES.miller; for (let i = 0; i < 30 && game.zone.sunLocal.y < 0.4; i++) { game.state.clock.earthTime += Math.abs(B.rotation) / 24; game.step(1, 1 / 30, false); }
    game.zone.beginEva(true);
    return { sun: +game.zone.sunLocal.y.toFixed(2) };`, wait: 1500, frames: 30 };
const shot = (name, js, frames = 2) => ({ js: `${H} const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 60; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames, shot: name, probe });
const free = { js: `game.cinematic = null; return 1;`, frames: 1 };
const go = (js, frames = 30) => ({ js: `${H} ${js}; return 1;`, frames, probe });
const parts = {
  1: [
    land,
    shot('miller_reef_air', `cam.position.set(B.reef.x + 70, 38, B.reef.z + 60); cam.lookAt(B.reef.x - 20, 0, B.reef.z - 5)`), free,
    shot('miller_rift_air', `cam.position.set(B.rift[1][0] + 60, 160, B.rift[1][1] - 60); cam.lookAt(B.rift[3][0], -20, B.rift[3][1])`), free,
    go(`put(B.pool.x + 4, B.pool.z, 0.05, Math.PI / 2, -0.25)`, 40),
    { frames: 2, shot: 'miller_pool', probe },
    // into the rift, lamp on
    go(`const x = B.rift[3][0], zz = B.rift[3][1]; put(x, zz, 0.05, 2.4, 0.05); game.input.virtualPress('flashlight')`, 60),
    { frames: 2, shot: 'miller_rift_floor', probe },
    // swim up a few metres
    { js: `game.input.virtualHold('jump', true); return 1;`, frames: 90, probe },
    { js: `game.input.virtualHold('jump', false); return 1;`, frames: 2, shot: 'miller_rift_swim', probe },
    // the basin rim, looking down into the dark
    go(`const a = Math.atan2(B.rift[4][1] - B.basin.z, B.rift[4][0] - B.basin.x); const r = B.basin.r * 0.86; put(B.basin.x + Math.cos(a) * r, B.basin.z + Math.sin(a) * r, 0.05, 0, -0.35); pl.heading.set(-Math.cos(a), 0, -Math.sin(a))`, 60),
    { frames: 2, shot: 'miller_basin_rim', probe },
    // the flats unchanged near the landing
    go(`put(20, 30, 0.05, 0.6, -0.05); game.input.virtualPress('flashlight')`, 30),
    { frames: 2, shot: 'miller_flats', probe },
  ],
};
const P = process.env.PART ?? '1';
export const steps = parts[P];
