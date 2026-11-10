// Mission control from the back tier, looking across the consoles to the screen wall
await game.startCreative(false);
game.cinematic = null;
game.zone.content.spawnAt('nasa_mc');
const p = game.player; const n = game.zone.content.nasa; const V = p.pos.constructor;
p.enterFrame(p.frame, new V(n.origin.x - 34.5, n.origin.y + 1.4, n.origin.z - 79), 0);
p.heading.set(-1, 0, -0.18).normalize(); p.pitch = -0.12;
return p.pos.toArray();
