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
const M = `const F = z.fauna; const eco = F.creatures.find((k) => k.species === 'eco'); const of = (sp) => F.creatures.filter((k) => k.species === sp);`;
const fprobe = `const z = game.zone; const F = z.fauna; if (!F) return 'no fauna'; const pl = game.player.pos;
  return { sp: F.creatures.filter((k) => k.species !== 'eco').map((k) => k.species.slice(0, 4) + ':' + k.state + '@' + Math.round(Math.hypot(k.pos.x - pl.x, k.pos.z - pl.z) * 10) / 10).join(' '), hold: F.hold ? F.hold.kind + ' ' + F.hold.got + '/' + F.hold.need : null, hp: +(game.state.player.health ?? 1).toFixed(2), bio: Object.keys(game.state.flags).filter((k) => k.startsWith('bio:')).join(','), tide: F.creatures.find((k) => k.species === 'eco')?.tideState(pl.x, pl.z) };`;
const fshot = (name, js) => ({ js: `${H} ${M} const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 55; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: name, probe: fprobe });
const fgo = (js, frames = 30) => ({ js: `${H} ${M} ${js}; return 1;`, frames, probe: fprobe });
const mash = (n) => Array.from({ length: n }, () => ({ js: `game.input.virtualPress('interact'); return 1;`, frames: 3 }));
parts[2] = [
  land,
  { untilJs: `game.zone.fauna && game.zone.fauna.creatures.length >= 8`, max: 600, chunk: 30, probe: fprobe },
  // the first crest well after the test's scenes (the tide scene at the end brings it forward)
  { js: `game.zone.waves.first = game.zone.time + 3000; return 1;`, frames: 1 },
  // Ferracaris on the reef: a close look, then a fast pass makes them clamp
  fgo(`const c = of('ferracaris')[0]; put(c.cx + 2.2, c.cz + 1.6, 0.05, 0, -0.5); pl.heading.set(-0.8, 0, -0.6).normalize()`, 60),
  fshot('miller_ferracaris', `const c = of('ferracaris')[0]; const y = z.terrainY(c.cx, c.cz); cam.position.set(c.cx + 1.6, 1.3, c.cz + 1.4); cam.lookAt(c.cx, y, c.cz)`), free,
  fshot('miller_ferracaris_close', `const c = of('ferracaris')[0]; const g = c.ind.find((q) => q.state !== 'gone'); const y = z.terrainY(g.x, g.z); cam.fov = 32; cam.updateProjectionMatrix(); cam.position.set(g.x + 0.75, Math.max(y, 0) + 0.5, g.z + 0.6); cam.lookAt(g.x, y + 0.03, g.z)`), free,
  // the Sediment Maw: buried, then a walker steps on its rim
  fgo(`const m = of('sedimentmaw')[0]; m.cooldown = 0; m.energy = 1; const p = m.mouthPos(new V()); put(p.x + 3.5, p.z, 0.05, Math.PI / 2, -0.35)`, 30),
  fshot('miller_maw_buried', `const m = of('sedimentmaw')[0]; const p = m.mouthPos(new V()); cam.position.set(p.x + 2.2, p.y + 1.6, p.z + 1.2); cam.lookAt(p)`), free,
  fgo(`const m = of('sedimentmaw')[0]; const p = m.mouthPos(new V()); put(p.x + 1.4, p.z, 0.05, Math.PI / 2, -0.4); game.input.virtualHold('forward', true)`, 2),
  { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'sedimentmaw' && k.state !== 'buried')`, max: 120, chunk: 2, probe: fprobe },
  { js: `game.input.virtualHold('forward', false); return 1;`, frames: 6, probe: fprobe },
  fshot('miller_maw_strike', `const m = of('sedimentmaw')[0]; const p = m.mouthPos(new V()); cam.position.set(p.x + 2.4, p.y + 1.5, p.z - 1.8); cam.lookAt(p.x, p.y + 0.2, p.z)`), free,
  { frames: 20, probe: fprobe },
  ...mash(8),
  { frames: 40, probe: fprobe },
  // the Mimic Crawler: camouflaged in its den by the pool
  fgo(`const m = of('mimic')[0]; m.setState('den'); m.cooldown = 999; put(m.den.x + 7, m.den.z + 1, 0.05, Math.PI / 2, -0.3)`, 60),
  fshot('miller_mimic_den', `const m = of('mimic')[0]; cam.position.set(m.pos.x + 2.4, m.pos.y + 1.3, m.pos.z + 1.6); cam.lookAt(m.pos.x, m.pos.y + 0.3, m.pos.z)`), free,
  // too close to its eggs: the warning display
  fgo(`const m = of('mimic')[0]; m.cooldown = 0; put(m.den.x + 2.4, m.den.z + 0.3, 0.05, Math.PI / 2, -0.3); pl.heading.set(-1, 0, 0)`, 70),
  fshot('miller_mimic_warn', `const m = of('mimic')[0]; cam.position.set(m.pos.x + 2.2, m.pos.y + 1.0, m.pos.z - 1.6); cam.lookAt(m.pos.x, m.pos.y + 0.35, m.pos.z)`), free,
  fgo(`const m = of('mimic')[0]; put(m.pos.x + 1.3, m.pos.z, 0.05, Math.PI / 2, -0.3)`, 2),
  { untilJs: `!!game.zone.fauna.hold`, max: 200, chunk: 2, probe: fprobe },
  { frames: 30, probe: fprobe },
  fshot('miller_mimic_grapple', `const m = of('mimic')[0]; cam.position.set(m.pos.x + 1.6, m.pos.y + 1.4, m.pos.z + 2.2); cam.lookAt(pl.pos.x, pl.pos.y + 0.3, pl.pos.z)`), free,
  ...mash(8),
  { frames: 60, probe: fprobe },
  // left alone, it finds the canister and takes it home
  fgo(`const m = of('mimic')[0]; put(m.den.x + 15, m.den.z - 8, 0.05, 0, 0); m.setState('den'); m.st = 9; m.cooldown = 0; m.encounters = 0`, 2),
  { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'mimic' && k.state === 'carry')`, max: 2400, chunk: 30, probe: fprobe },
  { frames: 60, probe: fprobe },
  fshot('miller_mimic_carry', `const m = of('mimic')[0]; cam.position.set(m.pos.x + 2.0, m.pos.y + 1.5, m.pos.z + 2.2); cam.lookAt(m.pos.x, m.pos.y + 0.2, m.pos.z)`), free,
  // a crest due in 100 s: every species reacts (grazers hide, the crawler goes home, the maws bury deeper)
  fgo(`const W = z.waves; W.first = z.time + 100 - (W.wave(0).t0 - W.first); for (const k of F.creatures) k.st = 0`, 120),
  fshot('miller_ferracaris_hide', `const c = of('ferracaris')[0]; const y = z.terrainY(c.cx, c.cz); cam.position.set(c.cx + 1.1, y + 0.75, c.cz + 1.0); cam.lookAt(c.cx, y, c.cz)`), free,
  { frames: 2, probe: fprobe },
];
parts[6] = [
  land,
  { untilJs: `game.zone.fauna && game.zone.fauna.creatures.length >= 8`, max: 600, chunk: 30, probe: fprobe },
  fgo(`const m = of('mimic')[0]; put(m.den.x + 1.3, m.den.z + 0.3, 0.05, Math.PI / 2, -0.3); m.setState('warn'); m.st = 5`, 2),
  { untilJs: `!!game.zone.fauna.hold`, max: 200, chunk: 2, probe: fprobe },
  fshot('dbg', `cam.position.set(pl.pos.x + 2, pl.pos.y + 2, pl.pos.z + 2); cam.lookAt(pl.pos)`), free,
  { js: `return { ctx: game.input.context, cin: !!game.cinematic, got: game.zone.fauna.hold?.got };`, frames: 1 },
  { js: `game.input.virtualPress('interact'); return { ctx: game.input.context, mode: game.player.mode, sub: game.player.submerged, onFoot: game.zone.fauna.host.playerOnFoot() };`, frames: 3, probe: fprobe },
  { js: `game.input.virtualPress('interact'); const r = { got: game.zone.fauna.hold?.got }; return r;`, frames: 1, probe: fprobe },
  { js: `return { got: game.zone.fauna.hold?.got, pressedNow: game.input.pressed('interact') };`, frames: 1 },
];
parts[7] = [
  land,
  { untilJs: `game.zone.fauna && game.zone.fauna.creatures.length >= 8`, max: 600, chunk: 30, probe: fprobe },
  fgo(`const c = of('ferracaris')[0]; put(c.cx + 3, c.cz + 2, 0.05, 0, -0.5)`, 30),
  { js: `${H} ${M} const c = of('ferracaris')[0]; const m = c.meshes[0]; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; const g = c.ind[0]; const mat = new game.camera.matrix.constructor(); m.getMatrixAt(0, mat);
    return { n: c.ind.length, meshes: c.meshes.length, names: c.meshes.map((q) => q.material.name), size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => +v.toFixed(3)), g: [g.x, g.z, g.s, g.state].map((v) => typeof v === 'number' ? +v.toFixed(2) : v), y: +z.terrainY(g.x, g.z).toFixed(2), water: +z.waterLevel(g.x, g.z).toFixed(2), m0: Array.from(mat.elements).map((v) => +v.toFixed(2)), root: [c.root.position.x, c.root.scale.x], visible: c.root.visible, parentScale: c.root.parent?.scale.x };`, frames: 1 },
];
const dshot = (name, js) => ({ js: `${H} ${M} game.state.player.health = 1; F['crack'] = 0; const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 55; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 3, shot: name, probe: fprobe });
parts[3] = [
  land,
  { untilJs: `game.zone.fauna && game.zone.fauna.creatures.length >= 18`, max: 900, chunk: 30, probe: fprobe },
  { js: `game.zone.waves.first = game.zone.time + 4000; game.state.creative.hazardProtection = true; return 1;`, frames: 1 },
  // Breaker Shield at its nest; approach → guard display; crowd it → a shove
  fgo(`const b = of('breaker')[0]; put(b.nest.x + 7, b.nest.z + 2, 0.05, Math.PI / 2, -0.2); pl.heading.set(-1, 0, 0)`, 40),
  dshot('miller_breaker', `const b = of('breaker')[0]; cam.position.set(b.pos.x + 4.5, b.pos.y + 1.8, b.pos.z - 3.5); cam.lookAt(b.pos.x, b.pos.y + 0.5, b.pos.z)`), free,
  fgo(`const b = of('breaker')[0]; put(b.nest.x + 2.2, b.nest.z + 0.4, 0.05, Math.PI / 2, -0.2)`, 2),
  { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'breaker' && k.state === 'shove')`, max: 300, chunk: 3, probe: fprobe },
  { frames: 30, probe: fprobe },
  // Rift Architect building by the vents
  fgo(`const a = of('architect')[0]; put(a.den.x + 6, a.den.z + 3, 0.05, 1.2, -0.3); game.input.virtualPress('flashlight')`, 200),
  dshot('miller_architect', `const a = of('architect')[0]; cam.position.set(a.pos.x + 2.4, a.pos.y + 1.5, a.pos.z + 1.8); cam.lookAt(a.pos.x, a.pos.y + 0.3, a.pos.z)`), free,
  { untilJs: `!!game.state.flags['bio:architect:construction']`, max: 1800, chunk: 30, probe: fprobe },
  dshot('miller_architect_build', `const a = of('architect')[0]; cam.position.set(a.pos.x + 2.0, a.pos.y + 1.6, a.pos.z - 1.6); cam.lookAt(a.den.x, a.den.y + 0.2, a.den.z)`), free,
  // a Luminous Siren by the rift wall (lamp off: the lure in the dark)
  fgo(`const s = of('siren')[0]; put(s.perch.x + 3, s.perch.z + 2, 0.05, 0, 0); game.input.virtualPress('flashlight')`, 60),
  dshot('miller_siren', `const s = of('siren')[0]; cam.position.copy(s.pos).add(new V(1.3, 0.35, 1.0)); cam.lookAt(s.pos.x, s.pos.y + 0.05, s.pos.z)`), free,
  // an Abyssal Stalker: near its ledge it investigates; crowd it and it strikes after a telegraph
  fgo(`const s = of('abyssstalker')[0]; put(s.ledge.x + 8, s.ledge.z + 4, 0.05, 0, 0); pl.pos.y = Math.max(pl.pos.y, s.pos.y); game.input.virtualPress('flashlight')`, 120),
  dshot('miller_stalker', `const s = of('abyssstalker')[0]; const f = new V(0, 0, -1).applyQuaternion(s.q); cam.position.copy(s.pos).addScaledVector(f, 7).add(new V(3, 1.5, 0)); cam.lookAt(s.pos)`), free,
  fgo(`const s = of('abyssstalker')[0]; s.cooldown = 0; s.energy = 1; s.setState('investigate'); put(s.pos.x + 3, s.pos.z + 1, 0.05, 0, 0); pl.pos.y = Math.max(pl.pos.y, s.pos.y)`, 2),
  { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'abyssstalker' && (k.state === 'telegraph' || k.state === 'strike'))`, max: 600, chunk: 6, probe: fprobe },
  dshot('miller_stalker_strike', `const s = of('abyssstalker')[0]; const f = new V(0, 0, -1).applyQuaternion(s.q); cam.position.copy(s.pos).addScaledVector(f, 5).add(new V(2.5, 1.2, 0)); cam.lookAt(s.pos)`), free,
  { frames: 60, probe: fprobe },
  // the Chorus pod in the basin
  fgo(`const c = of('chorus')[0]; put(c.pos.x + 12, c.pos.z + 8, 0.05, 0, 0); pl.pos.y = Math.max(pl.pos.y, c.pos.y)`, 60),
  dshot('miller_chorus', `const cs = of('chorus'); const c = cs[0]; const m = cs.reduce((a, k) => a.add(k.pos), new V()).divideScalar(cs.length); cam.position.copy(m).add(new V(-8, 3, 12)); cam.lookAt(m)`), free,
  // the Cathedral feeding
  fgo(`const c = of('cathedral')[0]; put(c.pos.x + 30, c.pos.z + 25, 0.05, 0, 0); pl.pos.y = Math.max(pl.pos.y, c.pos.y)`, 30),
  dshot('miller_cathedral', `const c = of('cathedral')[0]; const f = new V(0, 0, -1).applyQuaternion(c.q); cam.position.copy(c.pos).addScaledVector(f, 26).add(new V(-14, -4, 0)); cam.lookAt(c.pos)`), free,
  // the Crown, risen into reach
  fgo(`const c = of('crown')[0]; c.pos.set(B.basin.x + 20, -45, B.basin.z + 10); c.setState('patrol'); put(B.basin.x + 20, B.basin.z - 40, 0.05, 0, 0); pl.pos.y = Math.max(pl.pos.y, -40)`, 30),
  dshot('miller_crown', `const c = of('crown')[0]; const f = new V(0, 0, -1).applyQuaternion(c.q); cam.position.copy(c.pos).addScaledVector(f, 16).add(new V(3, 2.5, 0)); cam.lookAt(c.pos.x, c.pos.y + 1, c.pos.z)`), free,
  { frames: 2, probe: fprobe },
];
const P = process.env.PART ?? '1';
export const steps = parts[P];
