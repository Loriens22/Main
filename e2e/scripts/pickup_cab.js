await game.startCreative(false);
game.cinematic = null;
const vs = game.zone.content.vehicles;
const pk = vs.list.find(v => v.id === 'pickup');
pk.enter();
pk.setLights(true);
game.step(75, 1/30);
return pk.root.position.toArray();
