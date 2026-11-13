// The Lazarus sites on the Gargantua worlds: props, interactions, dialogue choices, explorers boarding Ranger 1.
// BODY=miller | mann | edmunds
const BODY = process.env.BODY ?? 'miller';
const helpers = `const use = (id) => { const it = game.interaction.items.get(id); if (!it) return 'missing ' + id; const l = it.label(); it.use(); return l; };
  const pick = (s) => { const b = [...document.querySelectorAll('.dialogue .opts button')].find((x) => x.textContent.includes(s)); if (!b) return 'no option: ' + s + ' in ' + [...document.querySelectorAll('.dialogue .opts button')].map((x) => x.textContent).join(' | '); b.click(); return 'picked ' + s; };
  const line = () => document.querySelector('.dialogue .txt')?.textContent ?? null;
  const at = (x, z) => { const p = new V3(x, game.zone.terrainY(x, z) + 0.05, z); game.player.enterFrame(game.zone.ground, p, 0, 'walk'); };
  const L = game.zone.lazarus; const sp = (n) => L.spot(n);
  // stand at a camp spot facing another one
  const atS = (n, face) => { const p = sp(n); const f = face ? sp(face) : null; const yaw = f ? Math.atan2(-(f.x - p.x), -(f.z - p.z)) : 0; game.player.enterFrame(game.zone.ground, new V3(p.x, p.y + 0.05, p.z), yaw, 'walk'); return [p.x, p.y, p.z].map((v) => +v.toFixed(1)); };
  const pl = () => { const p = game.player.pos; return { pos: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), room: L.camp.roomAt(p) }; };`;
const probe = `const z = game.zone; if (!z || !z.lazarus) return z ? 'no site' : 'loading'; const L = z.lazarus; const f = (k) => !!game.flag(k);
  return { npcs: L.npcs.map((n) => ({ id: n.state.id, vis: n.visible, follow: n.state.following, aboard: n.state.aboard, pos: [Math.round(n.pos.x), Math.round(n.pos.z)] })), flags: ['miller_recorder', 'miller_rescued', 'mann_awake', 'mann_logs_read', 'mann_aboard', 'mann_left', 'edmunds_log', 'edmunds_soil', 'edmunds_fate'].filter(f), disc: game.state.discoveries.filter((d) => /miller|mann|edmunds/.test(d)), props: [...game.interaction.items.keys()].filter((k) => /lazarus|npc:/.test(k)).length };`;
// a camera between two camp spots (from + up, looking at target + up)
const camView = (name, from, up, target, tup, extra = '') => view(name, `const L = z.lazarus; const a = L.spot('${from}'), b = L.spot('${target}'); ${extra}; cam.position.set(a.x, a.y + ${up}, a.z); cam.lookAt(b.x, b.y + ${tup}, b.z)`);
const exterior = (name) => view(name, `const L = z.lazarus; const a = L.spot('spot_view'), b = L.spot('spot_main') ?? L.spot('spot_center'); cam.position.set(a.x, z.terrainY(a.x, a.z) + 3.2, a.z); cam.lookAt(b.x, b.y + 1.6, b.z)`);
// walk forward (held key) for n frames
const walk = (frames) => [{ js: `game.input.virtualHold('forward', true); return 1;`, frames }, { js: `game.input.virtualHold('forward', false); return 1;`, frames: 2 }];
// local clock to dusk/night: step 1/48 of a rotation until the sun is below the horizon
const dusk = { js: `const B = (await import('/src/data/bodies.ts')).BODIES[game.zone.site.body]; let i = 0; for (; i < 60 && game.zone.sunLocal.y > -0.04; i++) { game.state.clock.earthTime += Math.abs(B.rotation) / 48; game.step(1, 1 / 30, false); } return { sun: +game.zone.sunLocal.y.toFixed(2), i };`, frames: 4 };
const view = (name, js) => ({ js: `const z = game.zone; const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 60; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 45, shot: name, probe });
const free = { js: `game.cinematic = null; return 1;`, frames: 1 };
const land = { js: `await game.startCreative(false); game.cinematic = null; game.state.system = 'gargantua';
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES['${BODY}'].sites[0]; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); if (game.zone.waves) { game.zone.waves.first = null; game.zone.waves.schedule(game.zone.time + 5000); }
    // local daytime for the screenshots: step the clock in 1/24 of a rotation until the sun is well up
    const B = (await import('/src/data/bodies.ts')).BODIES['${BODY}']; game.step(2, 1 / 30, false); for (let i = 0; i < 30 && game.zone.sunLocal.y < 0.35; i++) { game.state.clock.earthTime += Math.abs(B.rotation) / 24; game.step(1, 1 / 30, false); }
    // (unrendered: each rendered step with the Sun moved regenerated the environment map — a heavy SwiftShader job)
    return { site: !!game.zone.lazarus, sun: +game.zone.sunLocal.y.toFixed(2) };`, wait: 2500, frames: 10, probe };
const flows = {
  miller: [
    land,
    view('laz_miller_site', `cam.position.set(60, z.terrainY(60, -20) + 4, -20); cam.lookAt(80, 1.5, -40)`), free,
    { js: `${helpers} game.zone.beginEva(true); at(83, -33); return use('npc:miller');`, frames: 2 },
    { js: `${helpers} const t = line(); const a = pick('The Endurance is in orbit'); return [t, a, line()];`, frames: 2 },
    { js: `${helpers} return pick('I’ll get it');`, frames: 2, probe },
    { js: `${helpers} at(80, -38); return use('lazarus:miller_recorder');`, frames: 2, probe },
    { js: `${helpers} at(83, -33); use('npc:miller'); const t = line(); const a = pick('The Endurance is in orbit'); const b = pick('Stay close'); return [t, a, b];`, frames: 2, probe },
    view('laz_miller_follow', `const n = z.lazarus.npcs[0]; cam.position.set(n.pos.x - 6, n.pos.y + 2.5, n.pos.z + 6); cam.lookAt(n.pos.x, n.pos.y + 1.2, n.pos.z)`), free,
    { js: `${helpers} at(8, 6); return 1;`, frames: 2 },
    { untilJs: `!!game.flag('miller_rescued')`, max: 3000, chunk: 60, probe },
    { frames: 2, probe },
  ],
  mann: [
    land,
    exterior('laz_mann_site'), free,
    // up to the porch, open the outer door, walk into the airlock
    { js: `${helpers} game.zone.beginEva(true); const p = atS('spot_porch', 'nav_outer'); const r = use('mann_camp:mann_outer'); return [p, r];`, frames: 60 },
    'PART',
    { js: `${helpers} game.zone.beginEva(true); atS('spot_porch', 'nav_outer'); return use('mann_camp:mann_outer');`, frames: 60 },
    camView('laz_mann_porch', 'spot_porch', 1.7, 'nav_outer', 1.3), free,
    { js: `${helpers} atS('spot_porch', 'nav_outer'); return 1;`, frames: 1 },
    ...walk(130),
    { js: `${helpers} return pl();`, frames: 1 },
    'PART',
    // through the inner door into the main room
    { js: `${helpers} game.zone.beginEva(true); atS('nav_lock', 'spot_lock'); const r = use('mann_camp:mann_inner'); atS('spot_lock', 'nav_main'); return r;`, frames: 50 },
    ...walk(90),
    { js: `${helpers} return pl();`, frames: 1 },
    camView('laz_mann_interior', 'spot_pod', 1.55, 'spot_lock', 0.9), free,
    camView('laz_mann_lock', 'nav_main', 1.6, 'spot_lock', 1.0), free,
    'PART',
    { js: `${helpers} game.zone.beginEva(true); atS('spot_pod', 'spot_main'); return use('lazarus:mann_pod');`, frames: 120, probe },
    { js: `${helpers} atS('spot_main', 'spot_pod'); const r = use('lazarus:mann_terminal'); const txt = document.querySelector('.panel')?.textContent?.slice(0, 160) ?? null; game.ui.closeAllPanels(); return [r, txt];`, frames: 2, probe },
    { js: `${helpers} use('npc:mann'); const t = line(); const a = pick('Your raw logs say'); const t2 = line(); const b = pick('Come with us'); const t3 = line(); return [t, a, t2, b, t3];`, frames: 2, probe },
    // lead him out: the player waits on the porch; he walks the doorways
    { js: `${helpers} pick('Lead him'); atS('spot_porch', 'spot_view'); return 1;`, frames: 2 },
    { untilJs: `game.zone.lazarus.habRegion(game.zone.lazarus.npcs[0].pos) === 2`, max: 1500, chunk: 30, probe },
    view('laz_mann_out', `const L = z.lazarus; const n = L.npcs[0]; const a = L.spot('spot_porch'), v = L.spot('spot_view'); const d = v.clone().sub(a).setY(0).normalize(); cam.position.copy(a).addScaledVector(d, 5); cam.position.y = z.terrainY(cam.position.x, cam.position.z) + 1.9; cam.lookAt(n.pos.x, n.pos.y + 1.1, n.pos.z)`), free,
    { js: `${helpers} at(6, 8); return 1;`, frames: 2 },
    { untilJs: `!!game.flag('mann_aboard')`, max: 3000, chunk: 60, probe },
    dusk,
    exterior('laz_mann_dusk'), free,
    { frames: 2, probe },
  ],
  edmunds: [
    land,
    exterior('laz_edmunds_site'), free,
    { js: `${helpers} game.zone.beginEva(true); const p = atS('spot_door', 'spot_inside'); const r = use('edmunds_camp:edm_hab'); return [p, r];`, frames: 50 },
    ...walk(120),
    { js: `${helpers} return pl();`, frames: 1 },
    camView('laz_edmunds_living', 'spot_living', 1.6, 'spot_green', 0.9), free,
    camView('laz_edmunds_greenhouse', 'spot_green', 1.5, 'spot_green', 0.6, `b.x += (b.x - L.spot('spot_living').x) * 3; b.z += (b.z - L.spot('spot_living').z) * 3`), free,
    { js: `${helpers} atS('spot_living', 'spot_green'); const a = use('lazarus:edmunds_log'); game.ui.closeAllPanels(); const b = use('lazarus:edmunds_greenhouse'); game.ui.closeAllPanels(); const c = use('lazarus:edmunds_beacon'); game.ui.closeAllPanels(); const d = use('lazarus:edmunds_helmet'); game.ui.closeAllPanels(); return [a, b, c, d];`, frames: 3, probe },
    view('laz_edmunds_ridge', `const L = z.lazarus; const a = L.spot('spot_ridge'), b = L.camp.localPos(L.camp.node('helmet_hit')); cam.position.set(a.x, a.y + 1.8, a.z); cam.lookAt(b.x, b.y + 0.3, b.z)`), free,
    'PART',
    { js: `${helpers} game.zone.beginEva(true); const r = use('edmunds_camp:edm_cont'); return r;`, frames: 50 },
    camView('laz_edmunds_lab', 'spot_lab', 1.6, 'spot_lab_end', 0.9), free,
    dusk,
    exterior('laz_edmunds_dusk'), free,
    camView('laz_edmunds_dusk_close', 'spot_center', 2.0, 'spot_living', 1.4), free,
    camView('laz_edmunds_living_night', 'spot_living', 1.6, 'spot_green', 0.9), free,
    { frames: 2, probe },
  ],
};
// PART=n runs the n-th segment of the flow (segments split at its 'PART' markers; later ones start with a fresh
// landing) in its own browser — one long SwiftShader page can exhaust the test machine's memory; unset runs it all
const PART = +(process.env.PART ?? 0);
const segs = [[]];
for (const st of flows[BODY]) if (st === 'PART') segs.push([]); else segs[segs.length - 1].push(st);
export const steps = !PART ? segs.flat() : PART === 1 ? segs[0] : [land, ...segs[PART - 1]];
