// Adaptive quality in the real-time loop: on SwiftShader the game cannot hold its frame-rate target, so dynamic
// resolution should fall to its floor and an automatically chosen preset should step down (with a notification).
const probe = `const g = game.settings.graphics; const c = game.renderer.gl.domElement; return { preset: g.preset, auto: g.autoPreset, dyn: g.dynamicResolution, scale: +game.renderer.dynScale.toFixed(2), buffer: c.width + 'x' + c.height, fps: +game.renderer.stats.fps.toFixed(1), note: document.querySelector('.notify, .notification, .toast')?.textContent ?? null, phase: game.phase, vis: document.visibilityState, loading: game.zoneLoading, adapt: JSON.stringify(game.adapt) };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; const S = await import('/src/core/Settings.ts'); const g = game.settings.graphics; S.applyPreset(g, 'medium'); g.autoPreset = true; game.applySettings(); game.running = true; return g.preset;`, wait: 500, probe },
  { wait: 12000, probe },
  { wait: 12000, probe },
  { wait: 12000, probe },
  { js: `game.running = false; return 1;`, probe },
];
