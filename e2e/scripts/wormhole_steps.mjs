// The Anomaly: hold at the Sol mouth → traverse (cinematic) → Gargantua system; views of Gargantua; nav plan to Miller.
const probe = `const z = game.zone; if (!z) return 'loading'; return { sys: game.state.system, sysZone: z.sys, primary: z.primaryId, where: z.whereText(), cin: !!game.cinematic, warp: +game.renderer.fx.warp.toFixed(2) };`;
const view = (name, js) => ({ js: `const z = game.zone; game.cinematic = { blocking: true, update: () => true }; z.scene.visible = true; const cam = game.camera; ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: name, probe });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; const t = game.state.clock.earthTime; const SS = await import('/src/render/SolarSystem.ts');
    const w = SS.helio("wormhole", t).r; const off = new V3(-w[0], -w[1], -w[2]).normalize().multiplyScalar(6e3);
    const ed = game.state.vehicles.endurance.data; delete ed.cruise; delete ed.orbit; ed.hold = { target: 'wormhole', offset: off.toArray() };
    await game.goTo('space', { at: 'docked' }, { fade: 0 }); return game.zone.primaryId;`, wait: 3000, frames: 10, probe },
  { js: `void game.zone.traverse(); return 1;`, frames: 150, probe },
  { frames: 1, shot: 'wh_approach', probe },
  { frames: 150, probe },
  { frames: 1, shot: 'wh_throat', probe },
  { frames: 80, probe },
  { wait: 3000, untilJs: `game.zone && game.zone.sys === 'gargantua' && !!game.cinematic`, max: 2000, chunk: 5 },
  { wait: 3500, frames: 5, probe },
  { frames: 30, shot: 'wh_emerge0' },
  { frames: 180, shot: 'wh_emerge', probe: `const z = game.zone; const c = game.camera; return { cin: !!game.cinematic, cam: c.position.toArray().map((v) => Math.round(v)), e: z.eRoot.position.toArray().map((v) => Math.round(v)), hold: game.state.vehicles.endurance.data.hold?.offset?.map((v) => Math.round(v)) };` },
  { frames: 300, probe },
  view('wh_gargantua', `z.scene.visible = false; z.control.camMode = 'cinematic'; cam.position.set(0, 0, 0); cam.fov = 60; cam.updateProjectionMatrix(); const SS = await import('/src/render/SolarSystem.ts'); const h = SS.helio('wormhole_g', game.state.clock.earthTime).r; cam.lookAt(new V3(-h[0], -h[1], -h[2]))`),
  view('wh_gargantua_tele', `z.scene.visible = false; cam.position.set(0, 0, 0); cam.fov = 22; cam.updateProjectionMatrix(); const SS = await import('/src/render/SolarSystem.ts'); const h = SS.helio('wormhole_g', game.state.clock.earthTime).r; cam.lookAt(new V3(-h[0], -h[1], -h[2]))`),
  view('wh_endurance', `z.scene.visible = true; const e = z.eRoot.position.clone(); const SS = await import('/src/render/SolarSystem.ts'); const h = SS.helio('wormhole_g', game.state.clock.earthTime).r; const dir = new V3(-h[0], -h[1], -h[2]).normalize(); cam.fov = 60; cam.updateProjectionMatrix(); cam.position.copy(e).addScaledVector(dir, -160).add(new V3(0, 40, 0)); cam.lookAt(e.clone().addScaledVector(dir, 200))`),
  { js: `game.cinematic = null; const N = await import('/src/space/Navigation.ts'); const out = {}; for (const to of ['miller', 'mann', 'edmunds']) { const p = N.planTransfer('wormhole_g', to, game.state.clock.earthTime, 'fast', 110e3); out[to] = p ? { dv: Math.round(p.dv), days: Math.round((p.tArr - p.tDep) / 86400) } : null; } return out;`, frames: 1, probe },
];
