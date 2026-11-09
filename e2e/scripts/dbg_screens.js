await game.startCreative(false);
game.cinematic = null;
game.zone.content.spawnAt('nasa_mc');
game.step(2, 1/30, false);
const n = game.zone.content.nasa;
const out = n.screens.map(s => { const g = s.canvas.getContext('2d'); const d = g.getImageData(10, 10, 1, 1).data; const wp = s.mesh.getWorldPosition(new (game.camera.position.constructor)()); return s.mesh.name + ' ' + s.canvas.width + 'x' + s.canvas.height + ' px=' + Array.from(d).join(',') + ' vis=' + s.mesh.visible + ' mat=' + s.mesh.material.type + ' normal=' + JSON.stringify(s.mesh.geometry.attributes.normal?.array?.slice(0,3)) + ' wp=' + wp.toArray().map(Math.round); });
return out;
