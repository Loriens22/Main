// Arrival view of the portal from the forecourt entrance (local y ≈ -62)
await game.startCreative(false);
game.cinematic = null;
const p = game.player; const z = game.zone; const V = p.pos.constructor;
const x = 2897, zz = -3150 + 68;
p.enterFrame(p.frame, new V(x, z.height(x, zz) + 0.05, zz), 0);
p.heading.set(0.05, 0, -1).normalize(); p.pitch = 0.12;
game.zone.content.forest?.prime(x, zz);
return 'ok';
