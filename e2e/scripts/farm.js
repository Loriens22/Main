await game.startCreative(false);
game.cinematic = null;
const p = game.player;
p.heading.set(0.25, 0, -1).normalize();
p.pitch = 0.12;
return p.pos.toArray();
