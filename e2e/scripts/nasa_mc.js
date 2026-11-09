await game.startCreative(false);
game.cinematic = null;
game.zone.content.spawnAt('nasa_mc');
const p = game.player;
const n = game.zone.content.nasa;
p.pos.set(n.origin.x - 34, n.origin.y + 1.35 + 0.5, n.origin.z - 82);
p.noclip = true;
p.heading.set(-1, 0, 0.0).normalize(); p.pitch = 0.08;
return p.pos.toArray();
