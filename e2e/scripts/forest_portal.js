await game.startCreative(false);
game.cinematic = null;
const p = game.player; const z = game.zone; const V = p.pos.constructor;
const x = 2935, zz = -3020;
p.enterFrame(p.frame, new V(x, z.height(x, zz) + 0.05, zz), 0);
p.heading.set(-0.3, 0, -1).normalize(); p.pitch = 0.1;
game.zone.content.forest?.prime(x, zz);
return { n: game.zone.content.forest ? 'ok' : 'missing', d: +z.gen.forestDensity(2900, -3300).toFixed(2) };
