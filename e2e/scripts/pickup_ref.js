// The pickup parked at the porch's east end, seen from the south-west (reference image 2)
await game.startCreative(false);
game.cinematic = null;
const p = game.player;
const V = p.pos.constructor;
const x = -3.5, z = 19.5;
p.enterFrame(p.frame, new V(x, game.zone.height(x, z) + 0.05, z), 0);
p.heading.set(4.8 - x, 0, 10.4 - z).normalize();
p.pitch = -0.02;
return p.pos.toArray();
