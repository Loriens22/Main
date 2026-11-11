// Which Phone-preset setting breaks the Gargantua view from Miller orbit? Start from High, change one setting at a time.
const set = (name, js) => ({ js: `const g = game.settings.graphics; ${js}; game.applySettings(); return '${name}';`, frames: 3, dt: 1 / 600, shot: 'bis_' + name });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; game.state.system = 'gargantua';
    const B = (await import('/src/data/bodies.ts')).BODIES; const t = game.state.clock.earthTime; const R = B.miller.radius + 400e3; const vc = Math.sqrt(B.miller.mu / R);
    const ed = game.state.vehicles.endurance.data; delete ed.cruise; delete ed.hold; delete ed.pending; ed.orbit = { r0: [R, 0, 0], v0: [0, 0, -vc], t0: t, body: 'miller' };
    await game.goTo('space', { at: 'orbit' }, { fade: 0 }); return game.zone.primaryId;`, wait: 2500, frames: 20 },
  { js: `const z = game.zone; z.scene.visible = false; const SS = await import('/src/render/SolarSystem.ts');
    game.cinematic = { blocking: true, update: (_dt, cam) => { const h = SS.helio('miller', game.state.clock.earthTime).r; cam.position.set(0, 0, 0); cam.fov = 60; cam.updateProjectionMatrix(); cam.lookAt(new cam.position.constructor(-h[0], -h[1], -h[2])); return true; } };
    const S = await import('/src/core/Settings.ts'); S.applyPreset(game.settings.graphics, 'high'); game.applySettings(); return 1;`, frames: 3, dt: 1 / 600, shot: 'bis_high' },
  set('bloom', 'g.bloom = false'),
  set('vol0', 'g.volumetrics = 0'),
  set('atmo0', 'g.atmosphere = 0'),
  set('tex0', 'g.textureQuality = 0'),
  set('res', 'g.resolutionScale = 0.75; g.pixelRatioCap = 1'),
  set('aa', "g.antiAliasing = 'off'"),
  set('shadow0', 'g.shadowQuality = 0; g.reflections = 0; g.water = 0; g.viewDistance = 0'),
  set('rest', "g.filmGrain = false; g.lensEffects = false; g.ambientOcclusion = 0; g.vegetationDensity = 0.2; g.dynamicResolution = true"),
];
