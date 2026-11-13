// Draw cost of a camp view: calls, triangles, shadow casters, programs. BODY=mann|edmunds
const BODY = process.env.BODY ?? 'mann';
const land = { js: `await game.startCreative(false); game.cinematic = null; game.state.system = 'gargantua';
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES['${BODY}'].sites[0]; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); game.step(2, 1 / 30, false); return 1;`, wait: 1500 };
const stats = `const r = game.renderer.gl; const inf = r.info; let casters = 0, meshes = 0, casterTris = 0; game.zone.scene.traverse((o) => { if (o.isMesh && o.visible) { meshes++; if (o.castShadow) { casters++; const g = o.geometry; casterTris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.count ?? 1); } } });
  return { calls: game.renderer.stats?.calls, frameCalls: inf.render.calls, tris: inf.render.triangles, progs: inf.programs?.length, meshes, casters, casterTrisK: Math.round(casterTris / 1000), shadows: game.zone.sun?.castShadow, ms: Math.round(game.renderer.stats?.ms ?? 0) };`;
const view = `const z = game.zone; const L = z.lazarus; const a = L.spot('spot_view'), b = L.spot('spot_main') ?? L.spot('spot_center'); const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.position.set(a.x, z.terrainY(a.x, a.z) + 3.2, a.z); cam.lookAt(b.x, b.y + 1.6, b.z); cam.updateMatrixWorld(true); return 1;`;
export const steps = [
  land,
  { js: `game.cinematic = { blocking: true, update: () => true }; const cam = game.camera; cam.position.set(30, game.zone.terrainY(30, -30) + 3, -30); cam.lookAt(60, game.zone.terrainY(60, -60), -60); return 1;`, frames: 1 },
  { js: `const t = performance.now(); game.step(1, 1 / 30, true); const dt = performance.now() - t; ${stats.replace('return {', 'return { renderMs: Math.round(dt),')}`, frames: 0 },
  { js: view, frames: 1 },
  { js: `const t = performance.now(); game.step(1, 1 / 30, true); const dt = performance.now() - t; ${stats.replace('return {', 'return { renderMs: Math.round(dt),')}`, frames: 0 },
  { js: `const t = performance.now(); game.step(1, 1 / 30, true); const dt = performance.now() - t; ${stats.replace('return {', 'return { renderMs: Math.round(dt),')}`, frames: 0 },
  { js: `const z = game.zone; z.sun.castShadow = false; const t = performance.now(); game.step(1, 1 / 30, true); const dt = performance.now() - t; ${stats.replace('return {', 'return { noShadowMs: Math.round(dt),')}`, frames: 0 },
];
