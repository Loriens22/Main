await game.startCreative(false);
game.cinematic = null;
const p = game.player;
const V = p.pos.constructor;
const x = 9.0, z = 15.5;
p.enterFrame(p.frame, new V(x, game.zone.height(x, z) + 0.05, z), 0);
p.heading.set(17 - x, 0, 7.5 - z).normalize();
p.pitch = 0.12;
return p.pos.toArray();
