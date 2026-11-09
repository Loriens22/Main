await game.startCreative(false);
game.cinematic = null;
const p = game.player; const z = game.zone; const V = p.pos.constructor;
p.enterFrame(p.frame, new V(2960, z.height(2960, -2985) + 0.05, -2985), 0);
p.heading.set(-0.35, 0, -1).normalize(); p.pitch = 0.12;
return { siloTop: z.gen.siloTop - z.gen.portalLevel, hAbove: [0,10,40,80,120].map(y => +(z.height(2900, -3150 - y) - z.gen.portalLevel).toFixed(1)), mc: +(z.height(2853, -3232) - z.gen.portalLevel).toFixed(1), labs: +(z.height(2952, -3232) - z.gen.portalLevel).toFixed(1) };
