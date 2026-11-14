// The Mars refuge (game alternate-history extension) and its nine speculative species: the massif, the tunnel, the
// cavern, the lake, and each species in place. PART=1 (landform + views) | 2 (species close-ups) | 3 (behaviours);
// unset runs 1 + 2.
const site = process.env.SITE ?? '2';
const F = `const z = game.zone; const F = z.fauna; const R = z.refuge; const pl = game.player; const V = pl.pos.constructor;
  const of = (sp) => F ? F.creatures.filter((c) => c.species === sp) : [];
  const W = (x, y, zz) => R.world(x, y, zz);
  const fy = (x, zz) => z.faunaHost().terrainY(R.c.x + x, R.c.z + zz) - R.y0;`;
const probe = `const z = game.zone; const F = z.fauna; const R = z.refuge; if (!R) return 'no refuge'; const pl = game.player.pos;
  const by = {}; if (F) for (const c of F.creatures) { by[c.species] = (by[c.species] ?? '') + c.state[0] + Math.round(c.pos.distanceTo(pl)) + ' '; }
  return { y0: +R.y0.toFixed(1), refugeK: +z.refugeK.toFixed(2), underK: +z.underK.toFixed(2), sp: by, hp: +(game.state.player.health ?? 1).toFixed(2), eco: F && F.creatures[0]?.biofilm !== undefined ? { film: +F.creatures[0].biofilm.toFixed(2), rib: F.creatures[0].ribbons, last: F.creatures[0].last } : null };`;
const cine = (fov) => `const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = ${fov}; cam.updateProjectionMatrix();`;
const view = (name, from, to, fov = 55, frames = 3) => ({ js: `${F} ${cine(fov)} const a = W(${from.join(',')}), b = W(${to.join(',')}); cam.position.copy(a); cam.lookAt(b); cam.updateMatrixWorld(true); return 1;`, frames, shot: name, probe });
const free = { js: `game.cinematic = null; return 1;`, frames: 1 };
const land = { js: `await game.startCreative(false); game.cinematic = null;
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES.mars.sites[${site}]; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'mars', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    game.state.creative.hazardProtection = true; game.state.player.health = 1;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); game.step(2, 1 / 30, false);
    const B = (await import('/src/data/bodies.ts')).BODIES.mars; for (let i = 0; i < 30 && game.zone.sunLocal.y < 0.55; i++) { game.state.clock.earthTime += Math.abs(B.rotation) / 24; game.step(1, 1 / 30, false); }
    game.zone.beginEva(true);
    return { sun: +game.zone.sunLocal.y.toFixed(2), refuge: !!game.zone.refuge, y0: game.zone.refuge?.y0 };`, wait: 1500, frames: 30 };
const populated = { untilJs: `game.zone.fauna && game.zone.fauna.creatures.filter((c) => ['icebloom','ferric','prism','ghost','bmimic','serpent','monarch','hermit'].includes(c.species)).length >= 15`, max: 900, chunk: 30, probe };
/** put the player on foot at (x, z) in the refuge frame, facing (fx, fz) */
const stand = (x, zz, fx, fz) => ({ js: `${F} const p = W(${x}, 0, ${zz}); p.y = fy(${x}, ${zz}) + R.y0 + 0.05; pl.enterFrame(z.ground, p, Math.atan2(-(${fx} - ${x}), -(${fz} - ${zz})), 'walk'); return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) };`, frames: 60, probe });

const parts = {
  1: [
    land, populated,
    view('refuge_massif', [150, 30, 70], [0, 4, 0], 50),
    view('refuge_mouth', [-14, 3, -112], [-6, -1.5, -70], 55),
    stand(-6, -80, -6, -60),
    { js: `${F} return { inside: R.inside(pl.pos), floor: fy(-6, -70), water: R.waterLevel(pl.pos.x, pl.pos.z) };`, frames: 2, probe },
    stand(-20, -48, 10, 8),
    view('refuge_from_ledge', [-22, -8.5, -50], [8, -22, 6], 62, 50),
    view('refuge_shore', [-4, -18.2, -27], [0, -24, 6], 60, 10),
    view('refuge_skylight', [10, -18.5, -6], [34, -17, 6], 60, 4),
    view('refuge_underwater', [-14, -23.2, -6], [0, -24.5, 6], 62, 10),
    view('refuge_grove', [6, -23.6, 12], [-6, -24.5, 0], 58, 4),
    free,
  ],
};

// species close-ups: the camera relative to the animal (side, up, forward), looking at (height, ahead)
const sv = (name, sp, off, look, fov = 40, idx = 0) => ({ js: `${F} ${cine(fov)}
  const c = of('${sp}')[${idx}]; if (!c) return 'missing ${sp}'; const f = c.fwd(new V()); const sd = new V(-f.z, 0, f.x);
  cam.position.copy(c.pos).addScaledVector(sd, ${off[0]}).addScaledVector(f, ${off[2]}); cam.position.y = c.pos.y + ${off[1]};
  cam.lookAt(c.pos.x + f.x * ${look[1]}, c.pos.y + ${look[0]}, c.pos.z + f.z * ${look[1]}); cam.updateMatrixWorld(true); return c.state;`, frames: 3, shot: name });
parts[2] = [
  land, populated,
  stand(-24, -24, -30, -22),
  { js: `${F} for (const c of F.creatures) c.cooldown = 999; return 1;`, frames: 20, probe },
  sv('refuge_prism', 'prism', [2.6, 1.3, 1.6], [0.45, 0.2], 45), free,
  sv('refuge_prism_head', 'prism', [0.9, 0.75, 1.8], [0.45, 0.6], 40), free,
  { js: `${F} const n = F.root.children.find((o) => o.name && o.name.includes('PrismNest')); return n ? 'nest' : F.root.children.length;`, frames: 1 },
  sv('refuge_bmimic', 'bmimic', [3.2, 1.6, 2.4], [0.25, 0.6], 45), free,
  sv('refuge_bmimic_head', 'bmimic', [0.9, 0.55, 2.2], [0.25, 0.9], 40), free,
  sv('refuge_ferric', 'ferric', [3.8, 1.6, 2.5], [1.6, 0], 55), free,
  sv('refuge_ghost', 'ghost', [2.2, 0.9, 1.6], [0, 0.2], 50), free,
  sv('refuge_serpent', 'serpent', [2.4, 1.0, 2.0], [0.1, 0.7], 50), free,
  sv('refuge_serpent_head', 'serpent', [0.8, 0.45, 2.3], [0.15, 1.2], 40), free,
  sv('refuge_monarch', 'monarch', [7.5, 1.5, 5.5], [0, 1.0], 50), free,
  sv('refuge_monarch_head', 'monarch', [2.6, 0.4, 5.2], [0, 2.0], 45), free,
  sv('refuge_icebloom', 'icebloom', [0.9, 1.1, 0.9], [0.05, 0], 45), free,
  { js: `${F} const h = of('hermit')[0]; if (!h) return 'none'; h.pos.copy(h.fissure); h.pos.x += 3; h.pos.y = z.terrainY(h.pos.x, h.pos.z); h.setState('cross'); return 1;`, frames: 20, probe },
  sv('refuge_hermit', 'hermit', [0.6, 0.35, 0.6], [0.1, 0], 45), free,
];

// PART 3 — research tools, memory between visits, the carcass sequence
const T = `${F} const tools = z.research; const mem = F?.creatures[0]?.mem;`;
const tprobe = `const z = game.zone; const t = z.research; const F = z.fauna; const flags = game.state.flags; const keys = Object.keys(flags);
  const young = F ? F.creatures.filter((c) => c.species === 'prism' && c.juvenile).map((c) => (c.deadAt === null ? 'alive' : 'dead:' + c.stage)) : [];
  return { cine: game.cinematic ? game.cinematic.constructor.name : null, drone: t?.drone ? t.drone.pos.toArray().map((v) => +v.toFixed(1)) : null, hud: t ? t.hudText.slice(0, 120) : null,
    samples: keys.filter((k) => k.startsWith('sample:')), prog: flags['prog:mars'] ?? 0, young, mem: keys.filter((k) => k.startsWith('mem:mars_refuge:')).map((k) => k.slice(16) + '=' + String(flags[k]).slice(0, 40)),
    sp: F ? F.creatures.filter((c) => ['serpent', 'bmimic', 'monarch', 'ghost'].includes(c.species)).map((c) => c.species.slice(0, 3) + ':' + c.state).join(' ') : null };`;
parts[3] = [
  land, populated,
  // sampling on foot: the regolith outside (N), then in the cavern by the grove (a biofilm swab), then the brine
  { js: `game.input.virtualPress('sample'); return 1;`, frames: 3, probe: tprobe },
  stand(-20, -48, 10, 8),
  { js: `${T} const fc = of('ferric')[0]; tools.sample(fc.pos.clone().add(new V(1.5, 0.6, 0)), false); return 1;`, frames: 2, probe: tprobe },
  { js: `${T} const p = W(10, -24, 8); tools.sample(p, false); return 1;`, frames: 2, probe: tprobe },
  // the survey drone: launched by G, flown forward with the move input, then taken into the warm channel
  stand(-24, -24, -30, -22),
  { js: `game.input.virtualPress('drone'); return 1;`, frames: 4, probe: tprobe },
  { js: `game.input.virtualHold('forward', true); game.input.virtualHold('jump', true); return 1;`, frames: 45, probe: tprobe },
  { js: `game.input.virtualHold('forward', false); game.input.virtualHold('jump', false); return 1;`, frames: 3, shot: 'tools_drone_view', ui: true, probe: tprobe },
  { js: `${T} const s = of('serpent')[0]; s.setState('station'); s.cooldown = 0; const d = tools.drone; d.pos.copy(s.pos).addScaledVector(s.fwd(new V()), 7); d.pos.y = s.pos.y + 0.3; d.yaw = s.yaw + Math.PI; d.pitch = -0.05; return R.waterLevel(d.pos.x, d.pos.z) - d.pos.y;`, frames: 2, probe: tprobe },
  { untilJs: `game.zone.fauna.creatures.some((c) => c.species === 'serpent' && ['display', 'shove'].includes(c.state))`, max: 900, chunk: 30, probe: tprobe },
  { frames: 20, shot: 'tools_drone_serpent', ui: true, probe: tprobe },
  { untilJs: `!!game.state.flags['bio:serpent:probe']`, max: 300, chunk: 30, probe: tprobe },
  { js: `game.input.virtualPress('drone'); return 1;`, frames: 4, probe: tprobe },
  // photo mode: facing the nest, B; the species tag and the readouts; E captures (the codex records the photograph)
  stand(-24, -18, -30, -22),
  { js: `${F} const p = of('prism')[0]; for (const c of F.creatures) c.cooldown = 999; const a = pl.pos; pl.enterFrame(z.ground, a.clone(), Math.atan2(-(p.pos.x - a.x), -(p.pos.z - a.z)), 'walk'); return 1;`, frames: 10, probe: tprobe },
  { js: `game.input.virtualPress('photo'); return 1;`, frames: 6, probe: tprobe },
  { js: `${F} const p = of('prism')[0]; const cam = game.camera; cam.lookAt(p.pos.x, p.pos.y + 0.4, p.pos.z); const e = new cam.rotation.constructor().setFromQuaternion(cam.quaternion, 'YXZ'); const pm = game.cinematic; pm.yaw = e.y; pm.pitch = e.x; return 1;`, frames: 8, shot: 'tools_photo', ui: true, probe: tprobe },
  { js: `game.input.virtualPress('interact'); return 1;`, frames: 4, probe: tprobe },
  { js: `game.input.virtualPress('photo'); return Object.keys(game.state.flags).filter((k) => k.includes(':photo'));`, frames: 4, probe: tprobe },
  // the carcass: the Mimic's ambush on the young Prism Architect (forced close and hungry; the catch forced)
  { js: `${F} const m = of('bmimic')[0]; const y = of('prism').find((c) => c.juvenile && c.deadAt === null); m.hunger = 1; m.cooldown = 0; m.setState('anchor');
      y.pos.copy(m.pos).addScaledVector(m.fwd(new V()), 2.5); y.pos.y = z.faunaHost().terrainY(y.pos.x, y.pos.z); y.setState('forage'); window.__rnd = Math.random; Math.random = () => 0.1; return 1;`, frames: 1 },
  { untilJs: `game.zone.fauna.creatures.some((c) => c.species === 'prism' && c.juvenile && c.deadAt !== null)`, max: 120, chunk: 5, probe: tprobe },
  { js: `Math.random = window.__rnd; return 1;`, frames: 30, probe: tprobe },
  sv('carcass_fresh', 'bmimic', [3.0, 2.2, 3.0], [0.1, 0.8], 50), free,
  // site time passes (the clock jumped as if by time warp): scavenged, then under the biofilm mat, then loose plates
  { js: `game.state.clock.earthTime += 30 * 3600; return 1;`, frames: 40, probe: tprobe },
  { js: `${F} ${cine(50)} const y = of('prism').find((c) => c.juvenile && c.deadAt !== null); cam.position.copy(y.pos).add(new V(2.2, 2.0, 2.2)); cam.lookAt(y.pos); cam.updateMatrixWorld(true); return y.stage;`, frames: 3, shot: 'carcass_mat', probe: tprobe }, free,
  { js: `game.state.clock.earthTime += 45 * 3600; return 1;`, frames: 360, probe: tprobe },
  { js: `${F} ${cine(50)} const y = of('prism').find((c) => c.juvenile && c.deadAt !== null); cam.position.copy(y.pos).add(new V(2.2, 2.0, 2.2)); cam.lookAt(y.pos); cam.updateMatrixWorld(true); return y.stage;`, frames: 3, shot: 'carcass_plates', probe: tprobe }, free,
  // memory between visits: leave and come back (a new zone load) — the carcass, the hatchling, the counts persist
  { js: `${F} return { young: game.state.flags['mem:mars_refuge:young'], hatched: of('prism').filter((c) => c.juvenile && c.deadAt === null).length };`, frames: 1, probe: tprobe },
  { js: `await game.goTo('surface', { at: 'landed' }, { fade: 0 }); game.step(2, 1 / 30, false); game.zone.beginEva(true); return game.state.flags['mem:mars_refuge:visits'];`, wait: 1500, frames: 30 },
  populated,
  { js: `${F} const eco = F.creatures[0]; return { away: +eco.mem.away.toFixed(2), visits: eco.mem.visits, biofilm: +eco.biofilm.toFixed(2), young: of('prism').filter((c) => c.juvenile).map((c) => c.deadAt === null ? 'alive' : 'dead:' + c.stage), mimicExp: of('bmimic')[0].exposures, serpentShoves: of('serpent')[0].shoves };`, frames: 2, probe: tprobe },
  { js: `const P = await import('/src/ui/Panels.ts'); P.openMissionComputer(game, 'bio'); await new Promise((r) => setTimeout(r, 400)); const t = document.body.innerText; return { programme: t.includes('RESEARCH PROGRAMMES'), samples: t.includes('SAMPLES') };`, frames: 2, shot: 'codex_programme', ui: true },
];

// PART 4 — conservative science mode: the refuge is there as a landform; no complex animals; the tools still work
parts[4] = [
  { js: `game.settings.life.science = 'conservative'; return game.settings.life.science;`, frames: 1 },
  land,
  { frames: 300, chunk: 100, probe },
  { js: `${F} return { refuge: !!R, fauna: F ? F.creatures.map((c) => c.species) : null, science: game.settings.life.science, populated: F ? F['populated'] : null };`, frames: 1 },
  view('conservative_refuge_grove', [6, -23.6, 12], [-6, -24.5, 0], 58, 10),
  free,
  { js: `game.input.virtualPress('sample'); return 1;`, frames: 3 },
  { js: `return { samples: Object.keys(game.state.flags).filter((k) => k.startsWith('sample:')), prog: game.state.flags['prog:mars'] ?? 0, intro: game.state.flags['prog:mars:intro'] ?? null };`, frames: 1 },
  { js: `const P = await import('/src/ui/Panels.ts'); P.openMissionComputer(game, 'bio'); await new Promise((r) => setTimeout(r, 400)); const t = document.body.innerText; return { archive: t.includes('ARCHIVE HYPOTHESIS'), conservativeNote: t.includes('CONSERVATIVE'), suspended: t.includes('programmes are suspended') };`, frames: 2, shot: 'conservative_codex', ui: true },
];
const P = process.env.PART;
export const steps = P ? parts[P] : [...parts[1], ...parts[2].slice(2)];
