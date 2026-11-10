// Mission computer → NAVIGATION tab with a planned transfer shown.
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; await game.goTo('space', { at: 'docked' }, { fade: 0 }); return game.zone.id;`, wait: 6000, frames: 10 },
  { js: `const P = await import('/src/ui/Panels.ts'); P.openMissionComputer(game, 'nav'); await new Promise(r => setTimeout(r, 300));
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent === 'FAST' && b.closest('.item')?.textContent.includes('Saturn')); btn?.click(); await new Promise(r => setTimeout(r, 400)); return !!btn;`, frames: 2, shot: 'navui', ui: true },
];
