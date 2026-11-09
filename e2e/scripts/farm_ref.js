// View of the farmhouse from the cornfield edge south-west of the house (reference image 2 viewpoint).
await game.startCreative(false);
game.cinematic = null;
const p = game.player;
const V = p.pos.constructor;
const x = -21, z = 28.5;
p.enterFrame(p.frame, new V(x, game.zone.height(x, z) + 0.05, z), 0);
p.heading.set(17.5, 0, -28.5).normalize();
p.pitch = 0.13;
return p.pos.toArray();
