await game.startCreative(false);
game.cinematic = null;
const p = game.player; const z = game.zone; const V = p.pos.constructor;
const x = 2700, zz = -1900;
p.enterFrame(p.frame, new V(x, z.height(x, zz) + 0.05, zz), 0);
p.noclip = true; p.pos.y += 140; p.vel?.set?.(0, 0, 0);
p.heading.set(0.2, 0, -1).normalize(); p.pitch = -0.18;
game.zone.content.forest?.prime(x, zz);
return 'ok';
