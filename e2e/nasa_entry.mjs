// The NASA entry as a player does it (regression test for the hillside that blocked the tunnel behind the blast doors):
//   in  — the security panel (USE) opens the blast doors; walk the tunnel; the inner door at the checkpoint (USE);
//         into the atrium
//   out — from the atrium back out to the forecourt
//   car — drive the farm pickup through the blast doors into the tunnel (it must stay on the tunnel floor)
// Serve a build first (npm run build; cd dist; python3 -m http.server 5200), then:
//   node e2e/nasa_entry.mjs http://localhost:5200/ e2e/out/nasa_entry in|out|car
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url = 'http://localhost:5200/', out = 'out2', part = 'in'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.setDefaultTimeout(900000);
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.phase === 'menu', null, { polling: 500 });
await p.evaluate(async () => { const g = window.__game; g.running = false; await g.startCreative(false); g.cinematic = null; g.state.clock.earthTime += 4.5 * 3600; g.zone.content.spawnAt('nasa'); });
const run = (n, r = false) => p.evaluate(([n, r]) => window.__game.step(n, 1 / 30, r), [n, r]);
const shot = async (n) => { await run(1, true); fs.writeFileSync(`${out}/${n}.png`, Buffer.from((await p.evaluate(() => window.__game.renderer.canvas.toDataURL('image/png'))).split(',')[1], 'base64')); };
const log = (...a) => console.log(...a);
const loc = () => p.evaluate(() => { const g = window.__game, o = g.zone.content.nasa.origin, q = g.player.pos; return [+(q.x - o.x).toFixed(2), +(q.y - o.y).toFixed(2), +(-(q.z - o.z)).toFixed(2)]; });
const prompt = () => p.evaluate(() => document.querySelector('.prompt.show')?.textContent ?? null);
await run(40);
if (part === 'in') {
// 1) the security panel: stand in front of it, look at it, USE
const panel = await p.evaluate(() => {
  const g = window.__game, it = g.interaction.items.get('nasa_blast_panel'), o = g.zone.content.nasa.origin;
  const w = it.targets[0].getWorldPosition(new (g.camera.position.constructor)());
  return { local: [+(w.x - o.x).toFixed(2), +(w.y - o.y).toFixed(2), +(-(w.z - o.z)).toFixed(2)], label: it.label() };
});
log('security panel at (local x, height, y)', JSON.stringify(panel));
await p.evaluate(() => {
  const g = window.__game, it = g.interaction.items.get('nasa_blast_panel'), pl = g.player;
  const V = g.camera.position.constructor;
  const w = it.targets[0].getWorldPosition(new V());
  const at = new V(w.x, 0, w.z + 1.4); at.y = g.zone.height(at.x, at.z) + 0.05;
  // facing −z (north) toward the facade
  pl.enterFrame(pl.frame, at, 0, 'walk');
  pl.pitch = Math.atan2(w.y - (at.y + 1.62), 1.4);
});
await run(4);
log('prompt at the panel:', await prompt());
await p.evaluate(() => window.__game.input.virtualPress('interact'));
await run(3);
log('blast doors open after USE:', await p.evaluate(() => window.__game.zone.content.nasa.blastOpen));
await run(150);
// 2) walk in, centre of the tunnel, facing north
await p.evaluate(() => { const g = window.__game, o = g.zone.content.nasa.origin, pl = g.player; const V = g.camera.position.constructor; pl.enterFrame(pl.frame, new V(o.x, g.zone.height(o.x, o.z + 8) + 0.05, o.z + 8), 0, 'walk'); pl.pitch = 0; g.input.virtMove.set(0, 1); });
// from the forecourt (y = −8) to the security door (y = 46): about 52 m at walking pace (1.6 m/s)
let reachedDoor = false;
for (let i = 0; i < 100; i++) {
  await run(15);
  const l = await loc();
  if (l[2] > 43.2) { reachedDoor = true; break; }
  if (l[1] < -3) { log('FELL', l); break; }
}
await p.evaluate(() => window.__game.input.virtMove.set(0, 0));
await run(6);
log('at the inner door', reachedDoor, JSON.stringify(await loc()), 'prompt:', await prompt());
await shot('01_inner_door');
await p.evaluate(() => window.__game.input.virtualPress('interact'));
await run(90);
log('inner door open:', await p.evaluate(() => window.__game.zone.content.nasa.site.doors.get('nasa_inner')?.open));
await p.evaluate(() => window.__game.input.virtMove.set(0, 1));
let atrium = false;
for (let i = 0; i < 40; i++) { await run(15); const l = await loc(); if (l[2] > 70) { atrium = true; break; } }
await p.evaluate(() => window.__game.input.virtMove.set(0, 0));
log('reached the atrium:', atrium, JSON.stringify(await loc()), 'room:', await p.evaluate(() => window.__game.zone.content.indoorRoom));
await shot('02_atrium');
}
if (part === 'out') {
// 3) back out: turn round, walk south to the forecourt
await p.evaluate(() => { const g = window.__game; g.zone.content.spawnAt('nasa_atrium'); const pl = g.player; const o = g.zone.content.nasa.origin; const V = g.camera.position.constructor; pl.enterFrame(pl.frame, new V(o.x, o.y + 0.05, o.z - 72), Math.PI, 'walk'); pl.pitch = 0; });
await run(30);
await p.evaluate(() => window.__game.input.virtMove.set(0, 1));
let outside = false;
for (let i = 0; i < 140; i++) { await run(15); const l = await loc(); if (l[2] < -14) { outside = true; break; } if (l[1] < -3 || l[1] > 1.5) { log('ODD height on the way out', l); break; } }
await p.evaluate(() => window.__game.input.virtMove.set(0, 0));
log('back on the forecourt:', outside, JSON.stringify(await loc()));
await shot('03_back_out');
}
if (part === 'car') {
await p.evaluate(() => { const g = window.__game; g.zone.content.nasa.toggleBlast(); });
await run(150);
// 4) drive the farm pickup into the tunnel
const drive = await p.evaluate(async () => {
  const g = window.__game, z = g.zone, o = z.content.nasa.origin, V = g.camera.position.constructor;
  const v = z.content.vehicles.list.find((x) => x.spec.kind === 'car');
  if (!v) return 'no car';
  v.disablePhysics();
  const at = new V(o.x + 2.0, 0, o.z + 30); at.y = z.height(at.x, at.z) + 0.3; // the vehicle lane, east of the turnstiles
  v.root.position.copy(at);
  v.root.quaternion.identity();
  v.root.updateMatrixWorld(true);
  g.player.enterFrame(g.player.frame, new V(o.x + 3, at.y, o.z + 30), 0, 'walk');
  v.enter();
  return v.id;
});
log('driving', drive);
await run(30);
const vloc = () => p.evaluate(() => { const g = window.__game, o = g.zone.content.nasa.origin, v = g.control, t = v.body?.translation(); return t ? [+(t.x - o.x).toFixed(2), +(t.y - o.y).toFixed(2), +(-(t.z - o.z)).toFixed(2), +v.speed.toFixed(1)] : null; });
log('car at start', JSON.stringify(await vloc()));

await p.evaluate(() => window.__game.input.virtMove.set(0, 1));
let maxY = -9, last = null;
for (let i = 0; i < 40; i++) {
  await run(15);
  const l = await vloc();
  if (!l) break;
  maxY = Math.max(maxY, l[1]);
  if (i % 4 === 3) log('car', JSON.stringify(l));
  if (l[2] > 30) break;
  last = l;
}
await p.evaluate(() => window.__game.input.virtMove.set(0, 0));
await run(30);
log('car end', JSON.stringify(await vloc()), 'highest body y above the floor:', maxY.toFixed(2));

await shot('04_car_in_tunnel');
}
log('errors', JSON.stringify(errs));
await b.close();
