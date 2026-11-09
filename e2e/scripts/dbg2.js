await game.startCreative(false);
game.cinematic = null;
const n = game.zone.content.nasa;
let err = null;
try { n.update(0.6); } catch (e) { err = String(e) + e.stack; }
const s = n.screens[3];
const d = s.canvas.getContext('2d').getImageData(10, 10, 1, 1).data;
return { err, px: Array.from(d), subs: game.zone.content.subsystems.map(x => x.constructor.name) };
