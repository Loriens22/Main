await game.startCreative(false);
game.cinematic = null;
const p = game.player;
const z = game.zone;
const V = p.pos.constructor;
p.enterFrame(p.frame, new V(2915, z.height(2915, -3060) + 0.05, -3060), 0);
p.heading.set(-0.15, 0, -1).normalize();
p.pitch = 0.18;
return { portal: z.gen.portalLevel, siloTop: z.gen.siloTop, hAbove: [0,10,40,80,120].map(y => +(z.height(2900, -3150 - y) - z.gen.portalLevel).toFixed(1)), mc: +(z.height(2853, -3232) - z.gen.portalLevel).toFixed(1), labs: +(z.height(2952, -3232) - z.gen.portalLevel).toFixed(1) };
