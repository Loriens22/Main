// Memory across a space → surface zone swap at BODY (render one frame on each side).
const BODY = process.env.BODY ?? 'mars';
const heap = `return { zone: game.zone?.id, heap: Math.round(performance.memory.usedJSHeapSize / 1e6), progs: game.renderer.gl.info.programs?.length, tex: game.renderer.gl.info.memory.textures, geo: game.renderer.gl.info.memory.geometries };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; const B = (await import('/src/data/bodies.ts')).BODIES; const R = B['${BODY}'].radius + 400e3; const t = game.state.clock.earthTime;
    const ed = game.state.vehicles.endurance.data; delete ed.cruise; delete ed.hold; ed.orbit = { r0: [R, 0, 0], v0: [0, 0, -Math.sqrt(B['${BODY}'].mu / R)], t0: t, body: '${BODY}' }; game.state.vehicles.ranger1.docked = null; await game.goTo('space', { at: 'orbit' }, { fade: 0 }); return 1;`, wait: 2000, frames: 3, shot: 'swap_space', probe: heap },
  { js: `const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: 18.38, lon: 77.58, name: 'x' }; v.landed = true; await game.goTo('surface', { at: 'landed' }, { fade: 0 }); return 1;`, wait: 2000, frames: 3, shot: 'swap_surface', probe: heap },
  { frames: 3, shot: 'swap_surface2', probe: heap },
];
