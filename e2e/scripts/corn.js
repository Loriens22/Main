await game.startCreative(false);
game.cinematic = null;
const p = game.player;
p.enterFrame(p.frame, new (p.pos.constructor)(-60, game.zone.height(-60, 60) + 0.05, 60), 0);
p.heading.set(0.6, 0, -1).normalize();
p.pitch = 0.02;
return p.pos.toArray();
