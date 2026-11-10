// Interplanetary voyage: Earth orbit → (plan) → departure burn → heliocentric cruise → cryosleep → capture at TO.
const TO = process.env.TO ?? 'mars';
const PROFILE = process.env.PROFILE ?? 'fast';
const probe = `const z = game.zone; const d = game.state.vehicles.endurance.data;
return { primary: z.primaryId, prog: game.state.endurance.nav.program, cruise: !!d.cruise, pending: !!d.pending, hold: !!d.hold, where: z.whereText(), date: new Date(Date.UTC(2000,0,1,12) + game.state.clock.earthTime * 1000).toISOString().slice(0, 10), fuelT: Math.round(game.state.vehicles.endurance.fuel / 1000), burn: +z.burnLevel.toFixed(2) };`;
const view = (name, js) => ({ js: `const z = game.zone; game.cinematic = null; z.scene.visible = ${'true'}; z.control.camMode = 'cinematic'; const cam = game.camera; ${js}; cam.updateMatrixWorld(true);`, frames: 1, shot: name });
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'docked' }, { fade: 0 }); return game.zone.id;`, wait: 6000, frames: 10, probe },
  { js: `const N = await import('/src/space/Navigation.ts'); const z = game.zone; const t0 = performance.now(); const plan = N.planTransfer('earth', '${TO}', game.state.clock.earthTime, '${PROFILE}'); const ms = performance.now() - t0;
    if (!plan) return 'no plan'; z.engage(plan); return { ms: Math.round(ms), dep: plan.tDep - game.state.clock.earthTime, tof_d: Math.round((plan.tArr - plan.tDep) / 86400), dv: Math.round(plan.dv), local: plan.local };`, frames: 2, probe },
  { js: `const p = game.state.vehicles.endurance.data.pending; await game.zone.skipTo(p.tDep - 5, 'window');`, frames: 10, probe },
  { frames: 90, shot: 'voy_departure_burn', probe },
  { frames: 300, probe },
  { frames: 60, shot: 'voy_cruise', probe },
  { js: `const c = game.state.vehicles.endurance.data.cruise; if (!c) return 'no cruise'; await game.zone.cryosleep(c.tArr - 3);`, frames: 30, probe },
  { frames: 60, probe },
  { frames: 300, shot: 'voy_capture', probe },
  { frames: 240, probe },
  view('voy_planet', `z.scene.visible = false; const b = z.system.bodies.find((x) => x.id === '${TO === 'wormhole' ? 'saturn' : TO}'); cam.position.set(0, 0, 0); cam.fov = ${Number(process.env.FOV ?? 50)}; cam.updateProjectionMatrix(); cam.lookAt(b.mesh.position)`),
  view('voy_endurance', `z.scene.visible = true; const e = z.eRoot.position.clone(); const b = z.system.bodies.find((x) => x.id === '${TO === 'wormhole' ? 'saturn' : TO}'); const dir = b.mesh.position.clone().normalize(); cam.fov = 55; cam.updateProjectionMatrix(); cam.position.copy(e).addScaledVector(dir, -120).add(new V3(0, 25, 0)); cam.lookAt(e.clone().addScaledVector(dir, 60))`),
];
