// 3/4 view from the south-west at ~25 m (house only)
await game.startCreative(false);
game.cinematic = null;
const p = game.player;
const V = p.pos.constructor;
const x = -19, z = 19;
p.enterFrame(p.frame, new V(x, game.zone.height(x, z) + 0.05, z), 0);
p.heading.set(15, 0, -19).normalize();
p.pitch = 0.16;
return p.pos.toArray();
