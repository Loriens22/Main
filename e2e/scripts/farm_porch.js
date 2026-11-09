await game.startCreative(false);
game.cinematic = null;
const p = game.player;
const V = p.pos.constructor;
const x = -2.5, z = 10.5;
p.enterFrame(p.frame, new V(x, game.zone.height(x, z) + 0.05, z), 0);
p.heading.set(-5, 0, -6.5).normalize();
p.pitch = 0.05;
return p.pos.toArray();
