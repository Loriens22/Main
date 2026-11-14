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
  return { y0: +R.y0.toFixed(1), refugeK: +z.refugeK.toFixed(2), underK: +z.underK.toFixed(2), sp: by, hp: +(game.state.player.health ?? 1).toFixed(2), eco: F && F.creatures[0].biofilm !== undefined ? { film: +F.creatures[0].biofilm.toFixed(2), rib: F.creatures[0].ribbons, last: F.creatures[0].last } : null };`;
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
const P = process.env.PART;
export const steps = P ? parts[P] : [...parts[1], ...parts[2].slice(2)];
