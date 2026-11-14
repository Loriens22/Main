// Alien life on Mars: population, each species' behaviour and attack, damage, break-free, the settings switch.
// PART=1 (strider + overview) | 2 (stalker) | 3 (lancewing + tether-kite + toggle); unset runs all.
const site = process.env.SITE ?? '2';
const F = `const z = game.zone; const F = z.fauna; const pl = game.player; const V = pl.pos.constructor;
  const of = (sp) => F.creatures.filter((c) => c.species === sp);
  const put = (c, dx, dz) => { c.pos.set(pl.pos.x + dx, 0, pl.pos.z + dz); c.pos.y = z.terrainY(c.pos.x, c.pos.z); c.home.copy(c.pos); };`;
const probe = `const z = game.zone; const F = z.fauna; if (!F) return 'no fauna'; const pl = game.player.pos;
  return { n: F.creatures.length, sp: F.creatures.map((c) => c.species[0] + ':' + c.state + '@' + Math.round(c.pos.distanceTo(pl))).join(' '), hp: +(game.state.player.health ?? 1).toFixed(2), hold: F.hold ? F.hold.kind + ' ' + F.hold.got + '/' + F.hold.need : null, cracks: +game.renderer.fx.cracks.toFixed(2), onFoot: F.host.playerOnFoot() };`;
const shotAt = (name, js) => ({ js: `${F} const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 60; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: name, probe });
const free = { js: `game.cinematic = null; return 1;`, frames: 1 };
const land = { js: `await game.startCreative(false); game.cinematic = null;
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES.mars.sites[${site}]; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'mars', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    game.state.creative.hazardProtection = false; game.state.player.health = 1;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); game.step(2, 1 / 30, false);
    const B = (await import('/src/data/bodies.ts')).BODIES.mars; for (let i = 0; i < 30 && game.zone.sunLocal.y < 0.4; i++) { game.state.clock.earthTime += Math.abs(B.rotation) / 24; game.step(1, 1 / 30, false); }
    game.zone.beginEva(true);
    // out into the open, away from Ranger 1
    const r = game.zone.ranger.root.position; const x = r.x + 32, zz = r.z + 26; game.player.enterFrame(game.zone.ground, new game.player.pos.constructor(x, game.zone.terrainY(x, zz) + 0.05, zz), 0, 'walk');
    return { sun: +game.zone.sunLocal.y.toFixed(2), fauna: !!game.zone.fauna };`, wait: 1500, frames: 30 };
const populated = { untilJs: `game.zone.fauna && game.zone.fauna.creatures.length >= 8`, max: 600, chunk: 30, probe };
const parts = {
  1: [
    land, populated,
    // the herd, posed right in front of us
    { js: `${F} const s = of('strider'); s.forEach((c, i) => { put(c, -6 + i * 7, -26 - i * 4); c.setState('graze'); }); return s.length;`, frames: 40, probe },
    shotAt('fauna_striders', `const c = of('strider')[0]; cam.position.set(pl.pos.x + 9, pl.pos.y + 2.2, pl.pos.z - 8); cam.lookAt(c.pos.x, c.pos.y + 2.4, c.pos.z)`), free,
    shotAt('fauna_strider_close', `const c = of('strider')[1]; const f = c.fwd(new V()); const sd = new V(-f.z, 0, f.x); cam.position.copy(c.pos).addScaledVector(sd, 7.5).addScaledVector(f, 2.5); cam.position.y = c.pos.y + 2.4; cam.lookAt(c.pos.x, c.pos.y + 2.3, c.pos.z)`), free,
    // one comes to display: rear up, crest flared, organs strobing
    { js: `${F} const c = of('strider')[0]; put(c, 0, -20); c.yaw = 0; c.setState('alert'); return 1;`, frames: 45, probe },
    shotAt('fauna_strider_display', `const c = of('strider')[0]; cam.position.set(pl.pos.x + 5, pl.pos.y + 1.7, pl.pos.z - 2); cam.lookAt(c.pos.x, c.pos.y + 2.8, c.pos.z)`), free,
    // the shriek: rings, cracks, ringing ears; then the charge and the scythe
    { untilJs: `game.zone.fauna.creatures.some((c) => c.species === 'strider' && c.state === 'shriek' && c.st > 0.9)`, max: 240, chunk: 3, probe },
    shotAt('fauna_strider_shriek', `const c = of('strider')[0]; cam.position.copy(pl.pos).add(new V(0, 1.7, 0)); cam.lookAt(c.pos.x, c.pos.y + 3.2, c.pos.z)`), free,
    { untilJs: `game.zone.fauna.creatures.some((c) => c.species === 'strider' && (c.state === 'strike' || c.state === 'recover'))`, max: 400, chunk: 3, probe },
    { js: `${F} return { hp: game.state.player.health, cracks: game.renderer.fx.cracks };`, frames: 8, probe },
    shotAt('fauna_strider_strike', `const c = of('strider')[0]; cam.position.copy(pl.pos).add(new V(2.5, 1.6, 3)); cam.lookAt(c.pos.x, c.pos.y + 2.2, c.pos.z)`), free,
  ],
  2: [
    land, populated,
    { js: `${F} game.state.player.health = 1; const s = of('stalker')[0]; put(s, 10, -6); s.setState('buried'); s.cooldown = 0; return s.state;`, frames: 1, probe },
    { untilJs: `game.zone.fauna.creatures.some((c) => c.species === 'stalker' && c.state === 'tunnel')`, max: 60, chunk: 1, probe },
    { js: `${F} const s = of('stalker')[0]; return [s.state, Math.round(s.distXZ(pl.pos))];`, frames: 30, probe },
    shotAt('fauna_stalker_close', `const c = of('stalker')[1]; c.inst.root.visible = true; c.setState('circle'); const f = c.fwd(new V()); const sd = new V(-f.z, 0, f.x); cam.position.copy(c.pos).addScaledVector(sd, 4.5).addScaledVector(f, 1.5); cam.position.y = c.pos.y + 1.3; cam.lookAt(c.pos.x, c.pos.y + 0.9, c.pos.z)`), free,
        shotAt('fauna_stalker_tunnel', `const c = of('stalker')[0]; cam.position.copy(pl.pos).add(new V(-3, 2.2, 4)); cam.lookAt(c.pos.x, c.pos.y, c.pos.z)`), free,
    { untilJs: `game.zone.fauna.creatures.some((c) => c.species === 'stalker' && (c.state === 'crouch' || c.state === 'leap'))`, max: 300, chunk: 2, probe },
    shotAt('fauna_stalker_pounce', `const c = of('stalker')[0]; cam.position.copy(pl.pos).add(new V(3, 1.4, 3)); cam.lookAt(c.pos.x, c.pos.y + 0.8, c.pos.z)`), free,
    { untilJs: `!!game.zone.fauna.hold || game.zone.fauna.creatures.some((c) => c.species === 'stalker' && c.state === 'circle')`, max: 120, chunk: 1, probe },
    { js: `${F} return F.hold ? 'pinned' : 'missed';`, frames: 40, probe },
    shotAt('fauna_stalker_pin', `const c = of('stalker')[0]; const h = c.headPos(); cam.position.copy(pl.pos).add(new V(0, 0.5, 0)); cam.lookAt(h)`), free,
    // break free: mash Interact
    ...Array.from({ length: 12 }, () => ({ js: `game.input.virtualPress('interact'); return 1;`, frames: 3 })),
    { js: `${F} return { hold: !!F.hold, st: of('stalker')[0].state, hp: game.state.player.health };`, frames: 30, probe },
  ],
  3: [
    land, populated,
    { js: `${F} game.state.player.health = 1; const l = of('lancewing')[0]; l.home.set(pl.pos.x + 40, 0, pl.pos.z - 40); l.pos.set(pl.pos.x + 60, pl.pos.y + 60, pl.pos.z - 40); l.setState('soar'); l.st = 10; l.cooldown = 0; return 1;`, frames: 20, probe },
    shotAt('fauna_lancewing_soar', `const c = of('lancewing')[0]; cam.position.copy(pl.pos).add(new V(0, 1.7, 0)); cam.lookAt(c.pos)`), free,
    { untilJs: `game.zone.fauna.creatures.some((c) => c.species === 'lancewing' && c.state === 'dive' && c.st > 0.6)`, max: 400, chunk: 3, probe },
    shotAt('fauna_lancewing_dive', `const c = of('lancewing')[0]; const d = c.pos.clone().sub(pl.pos).normalize(); cam.position.copy(c.pos).addScaledVector(d, -9).add(new V(3, 2, 0)); cam.lookAt(c.pos)`), free,
    { untilJs: `game.zone.fauna.creatures.some((c) => c.species === 'lancewing' && c.state === 'pull')`, max: 300, chunk: 2, probe },
    { js: `${F} return game.state.player.health;`, frames: 20, probe },
    // tether-kite: drift one over us, its tether across our path
    { js: `${F} game.state.player.health = 1; const k = of('tetherkite')[0]; k.cooldown = 0; k.pos.set(pl.pos.x + 3, pl.pos.y + 26, pl.pos.z + 1); k.rope.forEach((p, i) => p.set(pl.pos.x + 3 - i * 0.2, Math.max(pl.pos.y, pl.pos.y + 26 - i * 1.5), pl.pos.z + 1)); k.prev.forEach((p, i) => p.copy(k.rope[i])); return 1;`, frames: 60, probe },
    shotAt('fauna_tetherkite', `const c = of('tetherkite')[0]; cam.position.copy(pl.pos).add(new V(6, 2.5, 9)); cam.lookAt(c.pos.x, (c.pos.y + pl.pos.y) / 2, c.pos.z)`), free,
    { js: `${F} const k = of('tetherkite')[0]; const p = k.rope[k.rope.length - 3]; pl.pos.set(p.x, z.terrainY(p.x, p.z), p.z); return 1;`, frames: 4, probe },
    { js: `${F} const k = of('tetherkite')[0]; let best = 1e9, bi = -1; k.rope.forEach((p, i) => { const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z); if (d < best) { best = d; bi = i; } }); return { best: +best.toFixed(2), bi, py: +(k.rope[bi].y - pl.pos.y).toFixed(2), cd: k.cooldown, snag: k.snag, onFoot: F.host.playerOnFoot(), hostile: F.hostility };`, frames: 1 },
    { untilJs: `!!game.zone.fauna.hold`, max: 60, chunk: 1, probe },
    { js: `return 1;`, frames: 120, probe },
    shotAt('fauna_tether_lift', `const c = of('tetherkite')[0]; cam.position.copy(pl.pos).add(new V(5, -1, 7)); cam.lookAt(pl.pos.x, pl.pos.y + 1, pl.pos.z)`), free,
    ...Array.from({ length: 8 }, () => ({ js: `game.input.virtualPress('interact'); return 1;`, frames: 3 })),
    { js: `return 1;`, frames: 60, probe },
    // the settings switch: no creatures when off
    { js: `game.settings.life.mars = false; game.applySettings(); return 1;`, frames: 3, probe },
    { js: `${F} return { visible: F.root.visible, active: F.active() };`, frames: 1 },
    { js: `game.settings.life.mars = true; game.applySettings(); return game.zone.fauna.active();`, frames: 2 },
  ],
};

// close-up survey of each Mars species (daylight; LAMP shots add a test light at the camera to judge skin)
const sv = (name, sp, off, look, fov = 40, idx = 0) => ({ js: `${F} const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = ${fov}; cam.updateProjectionMatrix();
  const c = of('${sp}')[${idx}]; if (!c) return 'missing'; const f = c.fwd(new V()); const sd = new V(-f.z, 0, f.x);
  cam.position.copy(c.pos).addScaledVector(sd, ${off[0]}).addScaledVector(f, ${off[2]}); cam.position.y = c.pos.y + ${off[1]};
  cam.lookAt(c.pos.x + f.x * ${look[1]}, c.pos.y + ${look[0]}, c.pos.z + f.z * ${look[1]}); cam.updateMatrixWorld(true); return c.state;`, frames: 2, shot: name });
parts[4] = [
  land, populated,
  { js: `${F} game.state.creative.hazardProtection = true; for (const c of F.creatures) c.cooldown = 999; const s = of('strider'); s.forEach((c, i) => { put(c, -6 + i * 9, -18 - i * 5); c.setState('graze'); });
    const k = of('stalker')[0]; if (k) { put(k, 8, -10); k.setState('prowl'); } return s.length;`, frames: 30, probe },
  sv('mars_strider', 'strider', [6.5, 2.6, 1.5], [2.4, 0.3], 45), free,
  sv('mars_strider_head', 'strider', [2.4, 3.6, 3.2], [3.4, 1.8], 40), free,
  sv('mars_strider_legs', 'strider', [3.2, 1.0, 0.5], [0.9, 0], 45), free,
  { js: `${F} const k = of('stalker')[0]; put(k, 6, -6); k.setState('prowl'); k.yaw = 0.8; return k.state;`, frames: 4, probe },
  sv('mars_stalker', 'stalker', [3.0, 1.3, 1.0], [0.9, 0.4], 45), free,
  sv('mars_stalker_head', 'stalker', [1.0, 1.15, 2.6], [0.9, 1.7], 40), free,
  { js: `${F} const l = of('lancewing')[0]; if (!l) return 'none'; l.pos.set(pl.pos.x + 4, pl.pos.y + 14, pl.pos.z - 16); return l.state;`, frames: 3, probe },
  { js: `${F} const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 45; cam.updateProjectionMatrix(); const l = of('lancewing')[0]; cam.position.set(l.pos.x + 7, l.pos.y - 3, l.pos.z + 6); cam.lookAt(l.pos); cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: 'mars_lancewing' }, free,
  { js: `${F} const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 40; cam.updateProjectionMatrix(); const k = of('tetherkite')[0]; if (!k) return 'none'; cam.position.set(k.pos.x + 4.5, k.pos.y, k.pos.z + 3); cam.lookAt(k.pos); cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: 'mars_tetherkite' }, free,
];
const P = process.env.PART;
export const steps = P ? parts[P] : [...parts[1], ...parts[2].slice(2), ...parts[3].slice(2)];
