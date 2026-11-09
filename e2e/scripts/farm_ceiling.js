await game.startCreative(false);
game.cinematic = null;
const p = game.player;
const V = p.pos.constructor;
const x = -6.5, z = 5.5;
p.enterFrame(p.frame, new V(x, 0.6, z), 0);
p.heading.set(-1, 0, 0.3).normalize();
p.pitch = 0.75;
return p.pos.toArray();
