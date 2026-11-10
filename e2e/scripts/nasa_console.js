await game.startCreative(false);
game.cinematic = null;
game.zone.content.spawnAt('nasa_mc');
const p = game.player; const n = game.zone.content.nasa; const V = p.pos.constructor;
p.enterFrame(p.frame, new V(n.origin.x - 56.9, n.origin.y + 0.05, n.origin.z - 76.6), 0);
p.heading.set(-1, 0, 0.35).normalize(); p.pitch = -0.28;
return p.pos.toArray();
