await game.startCreative(false);
game.cinematic = null;
game.zone.content.spawnAt('nasa_mc');
const p = game.player;
p.pitch = 0.02;
return [p.pos.toArray().map(v => +v.toFixed(1)), game.zone.content.indoorRoom];
