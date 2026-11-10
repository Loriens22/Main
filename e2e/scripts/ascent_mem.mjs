// Memory isolation for the surface zone: landed → ascend, 1500 frames at dt 0.1, no rendering. FLAGS=noStream,noEnv,...
const flags = (process.env.FLAGS ?? '').split(',').filter(Boolean).map((f) => `window.__${f} = true;`).join(' ');
export const steps = [
  { js: `${flags} await game.startCreative(false); game.cinematic = null; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'moon', lat: 0.674, lon: 23.473, name: 'T' }; v.landed = true; await game.goTo('surface', { at: 'landed' }, { fade: 0 }); return 1;`, wait: 2000, frames: 2 },
  { js: `game.zone.ascend(); return 1;`, frames: 2 },
  ...Array.from({ length: 5 }, () => ({ frames: 300, dt: 0.1, chunk: 50, probe: `const z = game.zone; return z ? { id: z.id, agl: Math.round(z.env?.altitude(z.craft.pos)) } : 0;` })),
];
