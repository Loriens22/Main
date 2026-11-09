await game.startCreative(false);
game.cinematic = null;
game.zone.content.spawnAt('nasa_atrium');
const p = game.player;
p.heading.set(0, 0, -1); p.pitch = 0.25;
return p.pos.toArray();
