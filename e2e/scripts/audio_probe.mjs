// How many AudioParam automation calls does a frame make, and is the AudioContext running? (headless: no gesture)
export const steps = [
  { js: `const P = AudioParam.prototype; window.__ap = 0; for (const k of ['setTargetAtTime', 'setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) { const o = P[k]; P[k] = function (...a) { window.__ap++; return o.apply(this, a); }; }
    await game.startCreative(false); game.cinematic = null; return { state: game.audio.ctx?.state ?? null, t: game.audio.ctx?.currentTime ?? null };`, wait: 2000, frames: 5 },
  { js: `window.__ap = 0; game.step(300, 1 / 30, false); return { calls: window.__ap, perFrame: +(window.__ap / 300).toFixed(1), state: game.audio.ctx?.state, t: game.audio.ctx?.currentTime, loops: game.audio.loops?.size };`, frames: 1 },
  { js: `const z = game.zone; z.content.spawnAt('nasa_silo'); window.__ap = 0; game.step(300, 1 / 30, false); return { where: 'nasa', calls: window.__ap, perFrame: +(window.__ap / 300).toFixed(1), state: game.audio.ctx?.state, t: game.audio.ctx?.currentTime, loops: game.audio.loops?.size };`, frames: 1 },
];
