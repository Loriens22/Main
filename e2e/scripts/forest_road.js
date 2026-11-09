await game.startCreative(false);
game.cinematic = null;
const p = game.player; const z = game.zone; const V = p.pos.constructor;
const x = 2660, zz = -2470;
p.enterFrame(p.frame, new V(x, z.height(x, zz) + 0.05, zz), 0);
p.heading.set(0.35, 0, -1).normalize(); p.pitch = 0.04;
game.zone.content.forest?.prime(x, zz);
return { d: +z.gen.forestDensity(x + 30, zz).toFixed(2) };
