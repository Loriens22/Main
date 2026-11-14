// Jupiter's cloud layer: dive in (cruise), fly with the cloud-cruise hold, views; creatures (PART=2+).
const site = process.env.SITE ?? '0';
const probe = `const z = game.zone; if (!z.gas) return 'not gas'; const c = z.craft; const up = new c.quat.constructor(); const alt = z.env.altitude(c.pos);
  return { alt: Math.round(alt), v: Math.round(Math.hypot(...c.vel)), vy: +c.vel[1].toFixed(1), ap: z.control.autopilot?.name ?? null, hull: +(game.state.vehicles.ranger1.damage.hull ?? 1).toFixed(2), fauna: z.fauna ? z.fauna.creatures.map((k) => k.species[0] + ':' + k.state + '@' + Math.round(k.pos.distanceTo(new k.pos.constructor(...c.pos)))).join(' ') : null };`;
const land = { js: `await game.startCreative(false); game.cinematic = null;
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES.jupiter.sites[${site}]; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'jupiter', lat: s.lat, lon: s.lon, name: s.name }; v.landed = false;
    await game.goTo('surface', { at: 'cruise' }, { fade: 0 }); game.step(2, 1 / 30, false);
    const B = (await import('/src/data/bodies.ts')).BODIES.jupiter; for (let i = 0; i < 30 && game.zone.sunLocal.y < 0.45; i++) { game.state.clock.earthTime += Math.abs(B.rotation) / 24; game.step(1, 1 / 30, false); }
    return { gas: game.zone.gas, sun: +game.zone.sunLocal.y.toFixed(2) };`, wait: 1500, frames: 30, probe };
const view = (name, js) => ({ js: `const z = game.zone; const c = z.craft; const P = new game.camera.position.constructor(...c.pos); const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 65; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: name, probe });
const free = { js: `game.cinematic = null; return 1;`, frames: 1 };
const J = `const z = game.zone; const F = z.fauna; const sky = F.creatures.find((k) => k.species === 'sky'); const of = (sp) => F.creatures.filter((k) => k.species === sp);
  const c = z.craft; const V = game.camera.position.constructor; const P = new V(...c.pos); const cam = game.camera;`;
const jprobe = `const z = game.zone; const F = z.fauna; if (!F) return 'no fauna'; const sky = F.creatures.find((k) => k.species === 'sky'); const c = z.craft; const d = game.state.vehicles.ranger1.damage;
  const rp = sky ? sky.rp : null;
  return { alt: Math.round(z.env.altitude(c.pos)), v: Math.round(Math.hypot(...c.vel)), hull: +(d.hull ?? 1).toFixed(3), av: +(d.avionics ?? 1).toFixed(3), eng: +(d.engines ?? 1).toFixed(3), thrustK: F.thrustK, grip: sky?.grip ? sky.grip.kind + ' ' + sky.grip.got.toFixed(1) + '/' + sky.grip.need : null, att: sky?.attacker?.species ?? null,
    sp: F.creatures.filter((k) => k.species !== 'sky').map((k) => k.species.slice(0, 2) + ':' + k.state + '@' + Math.round(k.pos.distanceTo(rp))).join(' '), crack: +F.cabinCrack.toFixed(2), fade: +game.renderer.fx.fade.toFixed(2) };`;
const shot = (name, js) => ({ js: `${J} game.cinematic = { blocking: true, update: () => true }; cam.fov = 65; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: name, probe: jprobe });
const calm = { js: `${J} sky.lull = 999; sky.attacker = null; F.creatures.forEach((k) => (k.cooldown = 999)); return 1;`, frames: 1 };
const go = (js, frames = 1) => ({ js: `${J} ${js}; return 1;`, frames, probe: jprobe });
const populatedJ = { untilJs: `game.zone.fauna && game.zone.fauna.creatures.length >= 12`, max: 600, chunk: 30, probe: jprobe };
// rock the Ranger: push the roll control (here the touch stick) and let go, n times
const rock = (n) => Array.from({ length: n }, (_, i) => [{ js: `game.input.virtFlight.roll = ${i % 2 ? 1 : -1}; return 1;`, frames: 2 }, { js: `game.input.virtFlight.roll = 0; return 1;`, frames: 2 }]).flat();
const parts = {
  1: [
    land,
    { frames: 300, chunk: 60, probe },
    view('jup_chase', `cam.position.copy(P).add(new P.constructor(-40, 12, 25)); cam.lookAt(P.x + 60, P.y - 5, P.z)`), free,
    view('jup_wide', `cam.position.copy(P).add(new P.constructor(0, 8, 0)); cam.lookAt(P.x + 3000, P.y - 900, P.z + 1200)`), free,
    view('jup_down', `cam.position.copy(P).add(new P.constructor(0, -6, 0)); cam.lookAt(P.x + 1500, P.y - 3500, P.z - 600)`), free,
    { frames: 300, chunk: 60, probe },
  ],
  // the species, posed for portraits (no attacks)
  2: [
    land, populatedJ, calm,
    go(`const f = of('floater')[0]; f.size = 1.6; sky.ahead(260, -90, 30, f.pos); f.charge = 0`, 3),
    shot('jup_floater', `const f = of('floater')[0]; cam.position.copy(P).add(new V(0, 6, 0)).addScaledVector(sky.head, -20); cam.lookAt(f.pos.x, f.pos.y - 12, f.pos.z)`), free,
    go(`const f = of('floater')[1]; f.size = 2.4; sky.ahead(700, 250, 120, f.pos); const g = of('floater')[2]; g.size = 1.1; sky.ahead(420, -220, -60, g.pos)`, 3),
    shot('jup_floater_herd', `cam.position.copy(P).add(new V(0, 4, 0)).addScaledVector(sky.head, -30); const t = sky.ahead(500, 0, 20); cam.lookAt(t)`), free,
    go(`const v = of('veilray')[0]; v.setState('glide'); sky.ahead(90, 25, 25, v.pos); v.vel.copy(sky.rv)`, 2),
    shot('jup_veilray', `const v = of('veilray')[0]; cam.position.copy(v.pos).add(new V(0, -16, 0)).addScaledVector(sky.head, -26); cam.lookAt(v.pos.x, v.pos.y - 6, v.pos.z)`), free,
    shot('jup_veilray_side', `const v = of('veilray')[0]; const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(v.pos).addScaledVector(sd, 30).add(new V(0, 6, 0)); cam.lookAt(v.pos.x, v.pos.y - 5, v.pos.z)`), free,
    go(`const m = of('mawray')[0]; m.setState('cruise'); sky.ahead(90, -25, -10, m.pos); m.vel.copy(sky.rv)`, 2),
    shot('jup_mawray', `const m = of('mawray')[0]; cam.position.copy(m.pos).add(new V(0, -24, 0)).addScaledVector(sky.head, 8); cam.lookAt(m.pos)`), free,
    shot('jup_mawray_side', `const m = of('mawray')[0]; const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(m.pos).addScaledVector(sd, -26).add(new V(0, 3, 0)).addScaledVector(sky.head, 10); cam.lookAt(m.pos.x, m.pos.y, m.pos.z)`), free,
    go(`const bs = of('sporebulb'); const at = sky.ahead(120, 40, 0); bs.forEach((b, i) => b.pos.set(at.x + (i % 3) * 14 - 14, at.y + ((i * 7) % 5) * 4 - 8, at.z + Math.floor(i / 3) * 14 - 14))`, 2),
    shot('jup_spores', `const at = sky.ahead(120, 40, -3); cam.position.copy(at).add(new V(0, 4, 0)).addScaledVector(sky.head, -55); cam.lookAt(at)`), free,
    go(`const h = of('hunter')[0]; h.setState('drift'); sky.ahead(260, 60, 120, h.pos); h.drop = 0`, 3),
    shot('jup_hunter', `const h = of('hunter')[0]; const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(h.pos).addScaledVector(sd, -170).add(new V(0, -40, 0)).addScaledVector(sky.head, 40); cam.lookAt(h.pos.x, h.pos.y - 25, h.pos.z)`), free,
    shot('jup_hunter_pod', `const h = of('hunter')[0]; const p = h.podTop(new V()); const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(p).addScaledVector(sd, -16).addScaledVector(sky.head, 26).add(new V(0, -3, 0)); cam.lookAt(p.x, p.y - 4, p.z)`), free,
  ],
  // the attacks
  3: [
    land, populatedJ, calm,
    // a floater's discharge
    go(`const f = of('floater')[0]; f.size = 1.4; f.pos.copy(sky.rp).add(new V(0, 19 * f.size + 4, 0)).addScaledVector(sky.head, 30); f.charge = 0.98; f.cooldown = 0`, 2),
    { untilJs: `game.zone.fauna.thrustK === 0`, max: 40, chunk: 1, probe: jprobe },
    { frames: 4 },
    shot('jup_arc', `const f = of('floater')[0]; cam.position.copy(P).add(new V(0, 10, 0)).addScaledVector(sky.head, -45); cam.lookAt(f.pos.x, f.pos.y - 20, f.pos.z)`), free,
    { frames: 60, probe: jprobe },
    // a veil ray drops onto the canopy
    go(`of('floater').forEach((f) => { f.charge = 0; f.cooldown = 999; sky.ahead(-3000, 0, 0, f.pos); }); sky.lull = 0; sky.attacker = null; const v = of('veilray')[0]; v.cooldown = 0; sky.ahead(170, 0, 55, v.pos); v.vel.copy(sky.rv); sky.claim(v); v.setState('shadow'); v.st = 5`, 1),
    { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'veilray' && k.state === 'drape')`, max: 200, chunk: 2, probe: jprobe },
    { frames: 45, probe: jprobe },
    shot('jup_veil_drape', `cam.position.copy(sky.toWorld(new V(-11, 6, -22))); cam.lookAt(sky.toWorld(new V(0, 1, -4)))`), free,
    { js: `game.zone.control.camMode = 'cockpit'; return 1;`, frames: 3, shot: 'jup_veil_cockpit', probe: jprobe },
    shot('jup_veil_cockpit_up', `const e = sky.toWorld(sky.eye.clone()); cam.position.copy(e); cam.up.copy(new V(0, 0, -1).applyQuaternion(sky.rq)); cam.lookAt(sky.toWorld(new V(-0.6, 4, 0.6))); cam.up.set(0, 1, 0)`), free,
    ...rock(9),
    { frames: 30, probe: jprobe },
    // a maw ray stalks from below and latches on
    go(`sky.lull = 0; sky.attacker = null; const m = of('mawray')[0]; m.cooldown = 0; sky.ahead(-160, 0, -45, m.pos); m.vel.copy(sky.rv); sky.claim(m); m.setState('trail'); m.st = 9`, 1),
    { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'mawray' && k.state === 'latched')`, max: 300, chunk: 2, probe: jprobe },
    { frames: 75, probe: jprobe },
    shot('jup_maw_latched', `cam.position.copy(sky.toWorld(new V(13, 5, -17))); cam.lookAt(sky.toWorld(new V(0, 2, -4)))`), free,
    { js: `game.zone.control.camMode = 'cockpit'; return 1;`, frames: 3, shot: 'jup_maw_cockpit', probe: jprobe },
    shot('jup_maw_cockpit_up', `const e = sky.toWorld(sky.eye.clone()); cam.position.copy(e); cam.up.copy(new V(0, 0, -1).applyQuaternion(sky.rq)); cam.lookAt(sky.toWorld(new V(0, 4, -0.3))); cam.up.set(0, 1, 0)`), free,
    ...rock(12),
    { frames: 30, probe: jprobe },
    // a spore colony in the flight path
    go(`sky.lull = 999; if (of('sporebulb').length < 5) sky.spawnColony()`, 1),
    { untilJs: `game.zone.fauna.creatures.filter((k) => k.species === 'sporebulb').length >= 5`, max: 120, chunk: 2, probe: jprobe },
    go(`const bs = of('sporebulb'); const at = sky.ahead(330, 0, 0); bs.forEach((b, i) => b.pos.set(at.x + (i % 3) * 16 - 16, at.y + ((i * 7) % 5) * 5 - 10, at.z + Math.floor(i / 3) * 16 - 16)); bs[0].colony.armT = -1`, 1),
    { untilJs: `game.zone.fauna.creatures.filter((k) => k.species === 'sporebulb').length < 5`, max: 200, chunk: 2, probe: jprobe },
    shot('jup_spore_burst', `cam.position.copy(P).add(new V(0, 14, 0)).addScaledVector(sky.head, -60); cam.lookAt(sky.ahead(120, 0, 0))`), free,
    { untilJs: `game.zone.fauna.thrustK < 1`, max: 120, chunk: 2, probe: jprobe },
    { js: `game.zone.control.camMode = 'cockpit'; return 1;`, frames: 3, shot: 'jup_spore_inside', probe: jprobe },
    // the hunter: drop, harpoon, reel, crush
    go(`sky.lull = 0; sky.attacker = null; const h = of('hunter')[0]; h.cooldown = 0; sky.ahead(240, 0, 240, h.pos); sky.claim(h); h.setState('stalk')`, 1),
    { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'hunter' && k.state === 'reel')`, max: 300, chunk: 2, probe: jprobe },
    { frames: 40, probe: jprobe },
    shot('jup_hunter_reel', `const h = of('hunter')[0]; const p = h.podTop(new V()); const mid = p.clone().lerp(sky.rp, 0.5); const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(mid).addScaledVector(sd, -120).add(new V(0, 10, 0)); cam.lookAt(mid.x, mid.y + 30, mid.z)`), free,
    { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'hunter' && k.state === 'crush')`, max: 600, chunk: 6, probe: jprobe },
    { frames: 50, probe: jprobe },
    shot('jup_hunter_crush', `const h = of('hunter')[0]; const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(sky.rp).addScaledVector(sd, -40).add(new V(0, 6, 0)); cam.lookAt(sky.rp.x, sky.rp.y + 4, sky.rp.z)`), free,
    ...rock(14),
    { frames: 60, probe: jprobe },
    // Settings → Alien life → Jupiter off: no creatures
    { js: `game.settings.life.jupiter = false; game.applySettings(); return 1;`, frames: 3, probe: jprobe },
    { js: `const F = game.zone.fauna; return { visible: F.root.visible, active: F.active(), thrustK: F.thrustK };`, frames: 1 },
    { js: `game.settings.life.jupiter = true; game.applySettings(); return game.zone.fauna.active();`, frames: 2 },
  ],
};
parts[4] = [
  land, populatedJ, calm,
  { js: `${J} const r = z.ranger.root; const out = {}; const B = new game.camera.position.constructor; r.updateMatrixWorld(true);
    r.traverse((o) => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (!ms.some((m) => /glass|window|canopy/i.test(m.name))) return;
      const g = o.geometry; g.computeBoundingBox(); const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld); const a = sky.toLocal(bb.min, new V()), b = sky.toLocal(bb.max, new V());
      out[o.name + ':' + ms.map((m) => m.name).join('/')] = [a, b].map((v) => [v.x, v.y, v.z].map((x) => +x.toFixed(2))); });
    return { eye: [sky.eye.x, sky.eye.y, sky.eye.z].map((x) => +x.toFixed(2)), glass: out };`, frames: 1 },
];
// the maw ray alone (quick iteration)
parts[5] = [
  land, populatedJ, calm,
  go(`sky.lull = 0; sky.attacker = null; const m = of('mawray')[0]; m.cooldown = 0; sky.ahead(-160, 0, -45, m.pos); m.vel.copy(sky.rv); sky.claim(m); m.setState('trail'); m.st = 9`, 1),
  { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'mawray' && k.state === 'latched')`, max: 300, chunk: 2, probe: jprobe },
  { frames: 60, probe: jprobe },
  shot('jup_maw_latched', `cam.position.copy(sky.toWorld(new V(13, 5, -17))); cam.lookAt(sky.toWorld(new V(0, 2, -4)))`), free,
  { js: `game.zone.control.camMode = 'cockpit'; return 1;`, frames: 3, shot: 'jup_maw_cockpit', probe: jprobe },
  shot('jup_maw_cockpit_up', `const e = sky.toWorld(sky.eye.clone()); cam.position.copy(e); cam.up.copy(new V(0, 0, -1).applyQuaternion(sky.rq)); cam.lookAt(sky.toWorld(new V(0, 4, -0.3))); cam.up.set(0, 1, 0)`), free,
];

// close-up survey: each species moved in front of a free camera beside the Ranger
const jsv = (name, sp, dist, up = 0, side = 0.6, slot = 0) => ({ js: `${J} game.cinematic = { blocking: true, update: () => true }; cam.fov = 50; cam.updateProjectionMatrix();
  const k = of('${sp}')[0]; if (!k) return 'missing';
  const C0 = new V(...c.pos).add(new V(60 + ${slot} * 400, 30, 40)); k.pos.copy(C0); k.root.position.copy(C0); k.update?.(0.001, true);
  cam.position.copy(C0).add(new V(${dist} * ${side}, ${up}, ${dist})); cam.lookAt(C0.x, C0.y + ${up} * 0.3, C0.z); cam.updateMatrixWorld(true); return k.state;`, frames: 2, shot: name });
parts[6] = [
  land, populatedJ, calm,
  jsv('jup_veilray', 'veilray', 30, 6, 0.6, 1),
  jsv('jup_veilray_under', 'veilray', 26, -18, 0.2, 1),
  jsv('jup_mawray', 'mawray', 28, -14, 0.3, 2),
  jsv('jup_sporebulb', 'sporebulb', 16, 2, 0.6, 3),
  jsv('jup_floater', 'floater', 80, 4, 0.6, 4),
  jsv('jup_hunter', 'hunter', 130, 10, 0.8, 6),
  jsv('jup_hunter_pod', 'hunter', 30, -50, 0.6, 6),
  free,
];
// the reference sheet's nine (jupiterSheet.ts): each placed beside the Ranger and seen at a fitting distance
const sheetReady = { untilJs: `game.zone.fauna && ['stormskimmer','skyjelly','stormbeast','voltdrifter','deepdiver','gasgrazer','stormhunter'].every((sp) => game.zone.fauna.creatures.some((k) => k.species === sp)) && game.zone.fauna.creatures.some((k) => k.species === 'colony')`, max: 900, chunk: 30, probe: jprobe };
// a view in the animal's own frame: (side, up, ahead) metres from it, looking at it
const jfr = (name, sp, side, up, ahead, slot = 0) => ({ js: `${J} game.cinematic = { blocking: true, update: () => true }; cam.fov = 50; cam.updateProjectionMatrix();
  const k = of('${sp}')[0]; if (!k) return 'missing';
  const C0 = new V(...c.pos).add(new V(60 + ${slot} * 400, 30, 40)); k.pos.copy(C0); k.root.position.copy(C0); k.update?.(0.001, true); k.root.updateMatrixWorld(true);
  const q = k.root.quaternion; const fw = new V(0, 0, -1).applyQuaternion(q), rt = new V(1, 0, 0).applyQuaternion(q), upv = new V(0, 1, 0).applyQuaternion(q);
  cam.position.copy(C0).addScaledVector(rt, ${side}).addScaledVector(upv, ${up}).addScaledVector(fw, ${ahead}); cam.lookAt(C0); cam.updateMatrixWorld(true); return k.state;`, frames: 2, shot: name });
parts[7] = [
  land, populatedJ, sheetReady, calm,
  jfr('sheet_stormskimmer', 'stormskimmer', 22, 14, 26, 1),
  jsv('sheet_stormskimmer_top', 'stormskimmer', 12, 38, 0.2, 1),
  jsv('sheet_skyjelly', 'skyjelly', 22, -4, 0.5, 2),
  jsv('sheet_stormbeast', 'stormbeast', 70, 8, 0.8, 3),
  jfr('sheet_stormbeast_maw', 'stormbeast', 12, 4, 46, 3),
  jfr('sheet_voltdrifter', 'voltdrifter', 11, 3, 6, 4),
  jsv('sheet_deepdiver', 'deepdiver', 28, 6, 0.7, 5),
  jsv('sheet_gasgrazer', 'gasgrazer', 55, 6, 0.6, 6),
  jfr('sheet_gasgrazer_comb', 'gasgrazer', 10, -2, 40, 6),
  jsv('sheet_stormhunter', 'stormhunter', 40, 8, 0.7, 7),
  jfr('sheet_stormhunter_head', 'stormhunter', 7, 3, 22, 7),
  { js: `${J} game.cinematic = { blocking: true, update: () => true }; cam.fov = 60; cam.updateProjectionMatrix(); const k = of('colony')[0]; const C0 = k.center; cam.position.copy(C0).add(new V(160, 40, 220)); cam.lookAt(C0); cam.updateMatrixWorld(true); return 1;`, frames: 3, shot: 'sheet_colony', probe: jprobe },
  { js: `${J} game.cinematic = { blocking: true, update: () => true }; cam.fov = 60; cam.updateProjectionMatrix(); const k = of('aeromite')[0]; const C0 = k.center; cam.position.copy(C0).add(new V(30, 8, 40)); cam.lookAt(C0); cam.updateMatrixWorld(true); return 1;`, frames: 3, shot: 'sheet_aeromites', probe: jprobe },
  free,
];

// PART 8 — the flight model in game: corridors, soaring, the torn Skyjelly sinking and taken below, memory, tools
const aprobe = `const z = game.zone; const F = z.fauna; if (!F || !F.air) return 'no air'; const A = F.air; const sky = F.creatures.find((k) => k.species === 'sky');
  const row = (k) => k.species.slice(0, 4) + ':' + k.state + ' dy' + Math.round(k.pos.y - A.refY) + ' vy' + (k.vel ? k.vel.y.toFixed(1) : '-') + (k.aero ? ' V' + k.aero.V.toFixed(0) + ' w' + k.aero.w.toFixed(1) + ' CL' + k.aero.CL.toFixed(2) : '') + (k.torn !== undefined && k.torn >= 0 ? ' TORN' + k.torn.toFixed(0) : '');
  return { ranger_dy: Math.round(sky.rp.y - A.refY), t: +A.t.toFixed(0), sp: F.creatures.filter((k) => ['stormskimmer', 'stormbeast', 'voltdrifter', 'deepdiver', 'gasgrazer', 'stormhunter'].includes(k.species) || (k.species === 'skyjelly' && k.torn >= 0)).map(row).join(' | '),
    flags: Object.keys(game.state.flags).filter((k) => /bio:(stormskimmer|skyjelly|deepdiver|stormhunter):|sample:jupiter|jupiter:profile|mem:jupiter|prog:jupiter/.test(k)) };`;
const A = `${J} const A = F.air;`;
parts[8] = [
  land, populatedJ, sheetReady, calm,
  // a minute of free flight: every species flies by forces in its own corridor
  { frames: 1800, chunk: 300, probe: aprobe },
  // soaring: a Stormskimmer put low in its corridor over the strongest nearby core climbs while it circles there
  { js: `${A} const k = of('stormskimmer')[0]; const cc = A.core(sky.rp.x + 600, sky.rp.z + 600, new V()); k.pos.set(cc.x + 140, A.refY + 160, cc.z); A.wind(k.pos, k.vel).add(new V(0, 0, 38)); k['core'].copy(cc); k.setState('thermal'); window.__y0 = k.pos.y; return { w: +A.updraft(cc.x, cc.z).toFixed(1) };`, frames: 1 },
  { frames: 900, chunk: 300, probe: aprobe },
  { js: `${A} const k = of('stormskimmer')[0]; return { climbed: +(k.pos.y - window.__y0).toFixed(0), state: k.state };`, frames: 1 },
  jfr('phys_skimmer_bank', 'stormskimmer', 30, 10, 20, 1),
  free,
  // the torn Skyjelly: put in the Ranger's path at speed; it tears and sinks
  { js: `${A} const j = of('skyjelly')[0]; j.pos.copy(sky.rp).addScaledVector(sky.rv.clone().normalize(), 6); j.vel.copy(sky.rv).multiplyScalar(0.0); return Math.round(sky.rv.length());`, frames: 6, probe: aprobe },
  { js: `${A} const j = of('skyjelly')[0]; window.__jy = j.pos.y; return j.torn;`, frames: 600, chunk: 150, probe: aprobe },
  { js: `${A} const j = of('skyjelly')[0]; return { torn: j.torn, sank: +(window.__jy - j.pos.y).toFixed(0), vy: +j.vel.y.toFixed(1) };`, frames: 1 },
  // a Deepdiver below takes it as it sinks through the lower corridor
  { js: `${A} const j = of('skyjelly')[0]; const d = of('deepdiver')[0]; if (j.torn < 0) return 'not torn'; j.pos.y = A.refY - 620; d.pos.copy(j.pos).add(new V(320, -120, 0)); d.prey = null; return 1;`, frames: 2 },
  { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'deepdiver' && k.meals > 0)`, max: 2400, chunk: 60, probe: aprobe },
  jsv('phys_deepdiver', 'deepdiver', 30, 6, 0.7, 5),
  free,
  // the Stormhunter's memory: an intercept broken off by leaving its envelope counts as a failure (remembered)
  { js: `${A} const h = of('stormhunter')[0]; window.__f0 = game.state.flags['mem:jupiter:hunter.fails'] ?? 0; sky.lull = 0; sky.attacker = null; h.cooldown = 0; h.setState('call'); sky.claim(h); h.band = [2000, 3000]; return window.__f0;`, frames: 10 },
  { js: `${A} const h = of('stormhunter')[0]; h.band = [-350, 450]; return { fails: game.state.flags['mem:jupiter:hunter.fails'], state: h.state };`, frames: 1, probe: aprobe },
  // photo mode in flight (B): the species tag, altitude / pressure / wind readouts; E captures
  { js: `${A} const k = of('gasgrazer')[0]; k.pos.copy(sky.rp).addScaledVector(sky.head, 140).add(new V(0, 10, 0)); return 1;`, frames: 2 },
  { js: `game.input.virtualPress('photo'); return 1;`, frames: 4, probe: aprobe },
  { js: `${A} const k = of('gasgrazer')[0]; const pm = game.cinematic; cam.lookAt(k.pos); const e = new cam.rotation.constructor().setFromQuaternion(cam.quaternion, 'YXZ'); pm.yaw = e.y; pm.pitch = e.x; return game.cinematic?.constructor.name;`, frames: 6, shot: 'tools_photo_jupiter', ui: true },
  { js: `game.input.virtualPress('interact'); return 1;`, frames: 3 },
  { js: `game.input.virtualPress('photo'); return { photo: Object.keys(game.state.flags).filter((k) => k.includes(':photo')), hud: game.zone.research.hudText };`, frames: 3 },
  // the aerosol sampler near the swarm (N)
  { js: `${A} const m = of('aeromite')[0]; m.center.copy(sky.rp).addScaledVector(sky.head, 60); return 1;`, frames: 15 },
  { js: `game.input.virtualPress('sample'); return 1;`, frames: 3, probe: aprobe },
  { frames: 120, probe: aprobe },
];
// PART 9 — conservative science mode at Jupiter: no animals in the clouds, the flight and the tools unchanged
parts[9] = [
  { js: `game.settings.life.science = 'conservative'; return 1;`, frames: 1 },
  land,
  { frames: 600, chunk: 200, probe },
  { js: `const F = game.zone.fauna; return { fauna: F ? F.creatures.length : null, air: !!F?.air, science: game.settings.life.science };`, frames: 1 },
  view('conservative_jupiter', `cam.position.copy(P).add(new P.constructor(0, 8, 0)); cam.lookAt(P.x + 3000, P.y - 400, P.z + 1200)`), free,
  { js: `game.input.virtualPress('sample'); return 1;`, frames: 3 },
  { js: `return { samples: Object.keys(game.state.flags).filter((k) => k.startsWith('sample:')), prog: game.state.flags['prog:jupiter'] ?? 0 };`, frames: 1 },
];
// PART 10 — the Gasgrazer alone (quick look at the comb)
parts[10] = [land, populatedJ, sheetReady, calm, jsv('sheet_gasgrazer', 'gasgrazer', 55, 6, 0.6, 6), jfr('sheet_gasgrazer_comb', 'gasgrazer', 10, -2, 40, 6), jfr('sheet_gasgrazer_side', 'gasgrazer', 34, 4, 14, 6), free];
const PART = process.env.PART ?? '1';
export const steps = parts[PART];
