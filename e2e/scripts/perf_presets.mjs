// Render cost of the High vs Phone presets on three heavy scenes (Earth farm, Moon surface, Gargantua from Miller
// orbit). Each measurement: switch preset, warm up, then time single rendered frames with a 1-pixel readback so the
// GPU work is included. Run: SCENE=earth|moon|gargantua GFX=high e2e/run.sh e2e/scripts/perf_presets.mjs e2e/out/perf 960 540
const measure = (preset) => `const S = await import('/src/core/Settings.ts'); const g = game.settings.graphics; S.applyPreset(g, '${preset}'); g.autoPreset = false; game.applySettings();
  const gl = game.renderer.gl.getContext(); const px = new Uint8Array(4);
  game.step(4, 1 / 30, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = []; for (let i = 0; i < 6; i++) { const t0 = performance.now(); game.step(1, 1 / 30, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms.push(performance.now() - t0); }
  ms.sort((a, b) => a - b); const c = game.renderer.gl.domElement;
  return { preset: '${preset}', msMedian: +ms[3].toFixed(1), buffer: c.width + 'x' + c.height, calls: game.renderer.stats.calls };`;
const scene = (name, setup) => [
  { js: setup, wait: 2500, frames: 20 },
  { js: measure('high'), frames: 0, shot: `perf_${name}_high` },
  { js: measure('phone'), frames: 0, shot: `perf_${name}_phone` },
];
const orbit = (body, park) => `await game.startCreative(false); game.cinematic = null; game.state.system = 'gargantua';
  const SF = await import('/src/space/surfaceFrame.ts'); const B = (await import('/src/data/bodies.ts')).BODIES; const t = game.state.clock.earthTime;
  const R = B['${body}'].radius + ${park}; const vc = Math.sqrt(B['${body}'].mu / R);
  const ed = game.state.vehicles.endurance.data; delete ed.cruise; delete ed.hold; delete ed.pending; ed.orbit = { r0: [R, 0, 0], v0: [0, 0, -vc], t0: t, body: '${body}' };
  await game.goTo('space', { at: 'orbit' }, { fade: 0 }); return game.zone.primaryId;`;
const SCENE = process.env.SCENE ?? 'earth';
const all = {
  earth: () => scene('earth', `await game.startCreative(false); game.cinematic = null; return game.zone.id;`),
  moon: () => scene('moon', `await game.startCreative(false); game.cinematic = null; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'moon', lat: 9.7, lon: -20.1, name: 'Copernicus' }; v.landed = true; await game.goTo('surface', { at: 'landed' }, { fade: 0 });
    const z = game.zone; const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; const r = z.r1Root.position.clone(); cam.fov = 60; cam.updateProjectionMatrix(); cam.position.copy(r).add(new cam.position.constructor(-30, 0, 24)); cam.position.y = z.gen.field.height(cam.position.x, cam.position.z) + 3; cam.lookAt(r); return 1;`),
  gargantua: () => [...scene('gargantua', `${orbit('miller', 400e3)}`),
  // re-aimed every frame: at Miller one frame is ~30 minutes of Earth time and the planet moves along its orbit
  { js: `const z = game.zone; z.scene.visible = false; const SS = await import('/src/render/SolarSystem.ts');
    game.cinematic = { blocking: true, update: (_dt, cam) => { const h = SS.helio('miller', game.state.clock.earthTime).r; cam.position.set(0, 0, 0); cam.fov = 60; cam.updateProjectionMatrix(); cam.lookAt(new cam.position.constructor(-h[0], -h[1], -h[2])); return true; } }; return 1;`, frames: 2 },
  { js: measure('high'), frames: 0, shot: 'perf_gargantua_view_high' },
  { js: measure('phone'), frames: 0, shot: 'perf_gargantua_view_phone' }],
};
// one scene per page: several zones in one SwiftShader page exceed the test machine's memory
export const steps = all[SCENE]();
