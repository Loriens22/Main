// The Lazarus sites on the Gargantua worlds: props, interactions, dialogue choices, explorers boarding Ranger 1.
// BODY=miller | mann | edmunds
const BODY = process.env.BODY ?? 'miller';
const helpers = `const use = (id) => { const it = game.interaction.items.get(id); if (!it) return 'missing ' + id; const l = it.label(); it.use(); return l; };
  const pick = (s) => { const b = [...document.querySelectorAll('.dialogue .opts button')].find((x) => x.textContent.includes(s)); if (!b) return 'no option: ' + s + ' in ' + [...document.querySelectorAll('.dialogue .opts button')].map((x) => x.textContent).join(' | '); b.click(); return 'picked ' + s; };
  const line = () => document.querySelector('.dialogue .txt')?.textContent ?? null;
  const at = (x, z) => { const p = new V3(x, game.zone.terrainY(x, z) + 0.05, z); game.player.enterFrame(game.zone.ground, p, 0, 'walk'); };`;
const probe = `const z = game.zone; if (!z || !z.lazarus) return z ? 'no site' : 'loading'; const L = z.lazarus; const f = (k) => !!game.flag(k);
  return { npcs: L.npcs.map((n) => ({ id: n.state.id, vis: n.visible, follow: n.state.following, aboard: n.state.aboard, pos: [Math.round(n.pos.x), Math.round(n.pos.z)] })), flags: ['miller_recorder', 'miller_rescued', 'mann_awake', 'mann_logs_read', 'mann_aboard', 'mann_left', 'edmunds_log', 'edmunds_soil', 'edmunds_fate'].filter(f), disc: game.state.discoveries.filter((d) => /miller|mann|edmunds/.test(d)), props: [...game.interaction.items.keys()].filter((k) => /lazarus|npc:/.test(k)).length };`;
const view = (name, js) => ({ js: `const z = game.zone; const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 60; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: name, probe });
const free = { js: `game.cinematic = null; return 1;`, frames: 1 };
const land = { js: `await game.startCreative(false); game.cinematic = null; game.state.system = 'gargantua';
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES['${BODY}'].sites[0]; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); if (game.zone.waves) { game.zone.waves.first = null; game.zone.waves.schedule(game.zone.time + 5000); }
    // local daytime for the screenshots: step the clock in 1/24 of a rotation until the sun is well up
    const B = (await import('/src/data/bodies.ts')).BODIES['${BODY}']; game.step(2, 1 / 30, true); for (let i = 0; i < 30 && game.zone.sunLocal.y < 0.35; i++) { game.state.clock.earthTime += Math.abs(B.rotation) / 24; game.step(1, 1 / 30, true); }
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
    view('laz_mann_site', `cam.position.set(-44, z.terrainY(-44, 60) + 3, 60); cam.lookAt(-56, z.terrainY(-56, 46) + 1.5, 46)`), free,
    { js: `${helpers} game.zone.beginEva(true); at(-51, 47); return use('lazarus:mann_pod');`, frames: 3, probe },
    { js: `${helpers} at(-61, 49); const r = use('lazarus:mann_terminal'); const txt = document.querySelector('.panel')?.textContent?.slice(0, 160) ?? null; game.ui.closeAllPanels(); return [r, txt];`, frames: 2, probe },
    view('laz_mann_awake', `const n = z.lazarus.npcs[0]; cam.position.set(n.pos.x + 5, n.pos.y + 2, n.pos.z + 5); cam.lookAt(n.pos.x, n.pos.y + 1.3, n.pos.z)`), free,
    { js: `${helpers} at(-50, 49); use('npc:mann'); const t = line(); const a = pick('Your raw logs say'); const t2 = line(); const b = pick('Come with us'); const t3 = line(); return [t, a, t2, b, t3];`, frames: 2, probe },
    { js: `${helpers} pick('Lead him'); at(6, 8); return 1;`, frames: 2 },
    { untilJs: `!!game.flag('mann_aboard')`, max: 3000, chunk: 60, probe },
    { frames: 2, probe },
  ],
  edmunds: [
    land,
    view('laz_edmunds_site', `cam.position.set(40, z.terrainY(40, 72) + 3.5, 72); cam.lookAt(52, z.terrainY(52, 60) + 1.5, 60)`), free,
    view('laz_edmunds_greenhouse', `cam.position.set(47, z.terrainY(47, 66) + 2.2, 66); cam.lookAt(51, z.terrainY(51, 63) + 0.5, 63)`), free,
    { js: `${helpers} game.zone.beginEva(true); at(56, 58); const a = use('lazarus:edmunds_log'); game.ui.closeAllPanels(); const b = use('lazarus:edmunds_greenhouse'); game.ui.closeAllPanels(); const c = use('lazarus:edmunds_beacon'); game.ui.closeAllPanels(); const d = use('lazarus:edmunds_helmet'); game.ui.closeAllPanels(); return [a, b, c, d];`, frames: 3, probe },
    view('laz_edmunds_ridge', `cam.position.set(80, z.terrainY(80, 30) + 2, 30); cam.lookAt(86, z.terrainY(86, 36) + 0.3, 36)`),
  ],
};
export const steps = flows[BODY];
