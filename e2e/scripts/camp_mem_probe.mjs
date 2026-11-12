// Memory over non-rendered frames at a surface site, with or without a camp. BODY=mann|edmunds, SITE=0 (camp) | 1 (none)
const BODY = process.env.BODY ?? 'mann';
const SITE = +(process.env.SITE ?? 0);
const probe = `const m = performance.memory; return { heapMB: Math.round(m.usedJSHeapSize / 1e6), totalMB: Math.round(m.totalJSHeapSize / 1e6), camp: !!game.zone.lazarus?.camp, geo: game.renderer.gl.info.memory.geometries, tex: game.renderer.gl.info.memory.textures, progs: game.renderer.gl.info.programs?.length };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.system = 'gargantua';
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES['${BODY}'].sites[${SITE}]; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); game.step(2, 1 / 30, false); game.zone.beginEva(true); return s.name;`, wait: 1500, probe },
  ...Array.from({ length: 6 }, () => ({ frames: 60, probe })),
  { frames: 1, shot: 'mem_one_render', probe },
  ...Array.from({ length: 3 }, () => ({ frames: 60, probe })),
];
