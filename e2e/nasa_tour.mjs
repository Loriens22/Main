// A walk round the NASA base as a player (regression test for the floor holes, the security door and the elevator):
// forecourt → security panel (USE) → tunnel → the security door's control button (USE) → atrium → mission control
// → labs corridor → medical bay (auto door) → the stair to the 5.5 m balcony → elevator call + car panel → level −35
// → the lower corridor → the silo hall. Every leg checks the player stays on a floor; screenshots along the way.
//   node e2e/nasa_tour.mjs <url> <outDir>      (against a served build; SHOTS=1 for screenshots)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url = 'http://localhost:5200/', out = 'e2e/out/nasa_tour'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.setDefaultTimeout(900000);
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.phase === 'menu', null, { polling: 500 });
await p.evaluate(async () => { const g = window.__game; g.running = false; await g.startCreative(false); g.cinematic = null; g.state.clock.earthTime += 4.5 * 3600; g.zone.content.spawnAt('nasa'); });
const run = (n, r = false) => p.evaluate(([n, r]) => window.__game.step(n, 1 / 30, r), [n, r]);
// screenshots only with SHOTS=1: on a software renderer each new area's first read-back compiles its shaders and costs
// gigabytes, and a long session of them runs a test machine out of memory (e2e/nasa_views.mjs takes the pictures)
const shot = async (n) => {
  if (process.env.SHOTS !== '1') return;
  await run(1, true);
  fs.writeFileSync(`${out}/${n}.png`, Buffer.from((await p.evaluate(() => window.__game.renderer.canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
};
const results = [];
const log = (k, v) => { results.push([k, v]); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
// model coordinates (x east, y north, z up) of the player's feet
const loc = () => p.evaluate(() => { const g = window.__game, o = g.zone.content.nasa.origin, q = g.player.pos; return [+(q.x - o.x).toFixed(2), +(-(q.z - o.z)).toFixed(2), +(q.y - o.y).toFixed(2)]; });
const prompt = () => p.evaluate(() => document.querySelector('.prompt.show')?.textContent ?? null);
const place = (x, y, z, yaw, pitch = 0) => p.evaluate(([x, y, z, yaw, pitch]) => { const g = window.__game, o = g.zone.content.nasa.origin; g.player.enterFrame(g.player.frame, new (g.camera.position.constructor)(o.x + x, o.y + z + 0.05, o.z - y), yaw, 'walk'); g.player.pitch = pitch; }, [x, y, z, yaw, pitch]);
const face = (yaw, pitch = 0) => p.evaluate(([yaw, pitch]) => { const g = window.__game; g.player.enterFrame(g.player.frame, g.player.pos.clone(), yaw, 'walk'); g.player.pitch = pitch; }, [yaw, pitch]);
const N = 0, W = Math.PI / 2, S = Math.PI, E = -Math.PI / 2;
/** turn the player to look straight at an interactable (by its id) */
const aim = (id) => p.evaluate((id) => {
  const g = window.__game, pl = g.player, it = g.interaction.items.get(id);
  if (!it) return 'missing ' + id;
  const w = it.targets[0].getWorldPosition(new (g.camera.position.constructor)());
  const dx = w.x - pl.pos.x, dz = w.z - pl.pos.z;
  pl.enterFrame(pl.frame, pl.pos.clone(), Math.atan2(-dx, -dz), 'walk');
  pl.pitch = Math.atan2(w.y - (pl.pos.y + 1.62), Math.hypot(dx, dz));
  return +Math.hypot(dx, dz).toFixed(2);
}, id);
/** walk forward until `done(loc)` (or a time limit); fails if the feet drop more than 1.2 m below where they started */
const walk = async (name, done, maxS = 60) => {
  const start = await loc();
  await p.evaluate(() => window.__game.input.virtMove.set(0, 1));
  let l = start, low = start[2];
  for (let i = 0; i < maxS * 2; i++) {
    await run(15);
    l = await loc();
    low = Math.min(low, l[2]);
    if (done(l)) break;
  }
  await p.evaluate(() => window.__game.input.virtMove.set(0, 0));
  await run(4);
  l = await loc();
  const ok = done(l) && low > start[2] - 1.2;
  log(`${ok ? 'OK  ' : 'FAIL'} ${name}`, { from: start, to: l, lowest: low });
  return ok;
};
const use = async () => { await p.evaluate(() => window.__game.input.virtualPress('interact')); await run(3); };

// 1) the security panel opens the blast doors
const panel = await p.evaluate(() => { const g = window.__game, it = g.interaction.items.get('nasa_blast_panel'), o = g.zone.content.nasa.origin; const w = it.targets[0].getWorldPosition(new (g.camera.position.constructor)()); return [w.x - o.x, -(w.z - o.z), w.y - o.y]; });
await place(panel[0], panel[1] - 1.4, 0, N, Math.atan2(panel[2] - 1.62, 1.4));
await run(4);
log('panel prompt', await prompt());
await use();
await run(200);
log('blast doors open', await p.evaluate(() => window.__game.zone.content.nasa.blastOpen));
// 2) the tunnel to the security door; its control button
await place(1.5, -8, 0, N);
await walk('tunnel to the security door', (l) => l[1] > 42.0);
await shot('01_security_door');
await place(2.6, 44.2, 0, N);
log('aim at the door button (m)', await aim('nasa_doorbtn:innerdoor_btn_s'));
await run(4);
log('door button prompt', await prompt());
await use();
await run(180);
log('security door raised', await p.evaluate(() => { const d = window.__game.zone.content.nasa.site.doors.get('nasa_inner'); return { open: d.open, t: +d.t.toFixed(2), lift: +d.node.position.y.toFixed(2) }; }));
await shot('02_door_raised');
await place(0, 43, 0, N);
await walk('through the door into the atrium', (l) => l[1] > 68);
await shot('03_atrium');
// 3) mission control (west)
await place(-8, 82, 0, W);
await walk('atrium → mission control corridor → aisle steps → down the tiers', (l) => l[0] < -50, 60);
log('room', await p.evaluate(() => window.__game.zone.content.indoorRoom));
await shot('04_mission_control');
// 4) labs corridor and the medical bay's auto door
await place(8, 82, 0, E);
await walk('atrium → labs corridor', (l) => l[0] > 61.5);
await face(N);
await run(4);
await place(63.25, 82.2, 0, N);
await run(30);
log('medical bay door', await p.evaluate(() => { const d = window.__game.zone.content.nasa.autoDoors.find((x) => x.id === 'adoor_medical'); return d ? { t: +d.t.toFixed(2) } : null; }));
await shot('05_lab_door');
await walk('into the medical bay', (l) => l[1] > 88);
log('room', await p.evaluate(() => window.__game.zone.content.indoorRoom));
await shot('06_medical_bay');
// 5) the stair to the 5.5 m balcony (north-east)
const sa = Math.PI / 4;
await place(Math.cos(sa) * 7.4, 82 + Math.sin(sa) * 7.4, 0, N - Math.PI / 4);
await walk('up the stair to the balcony', (l) => l[2] > 5.3 && Math.hypot(l[0], l[1] - 82) > 17.2, 30);
await shot('07_balcony');
// 6) the elevator: call it to level 0, ride to −35 with the car panel, walk to the silo hall
await place(0, 97, 0, N);
await run(10);
await place(3.6, 99.6, 0, N);
log('aim at the call button (m)', await aim('nasa_elcall:elcall_0'));
await run(6);
log('call button prompt', await prompt());
await use();
for (let i = 0; i < 30; i++) { await run(30); const m = await p.evaluate(() => { const m = window.__game.zone.content.nasa.mover('nasa_elevator'); return [m.level, m.y, m.target]; }); if (m[1] === m[2] && m[0] === 0) break; }
await run(60);
log('gate at level 0', await p.evaluate(() => { const gt = window.__game.zone.content.nasa.gates.find((x) => x.level === 0); return { t: +gt.t.toFixed(2) }; }));
await shot('08_elevator_landing');
await place(0, 99.5, 0, N);
await walk('onto the elevator car', (l) => l[1] > 104.5, 20);
// the car panel (DOM): pick level −35
await place(2.6, 104.6, 0, N);
log('aim at the car panel (m)', await aim('nasa_el_btn'));
await run(4);
log('car panel prompt', await prompt());
await use();
await run(2);
const picked = await p.evaluate(() => { const bt = [...document.querySelectorAll('.panel button')].find((x) => /LEVEL −35/.test(x.textContent)); if (!bt) return null; bt.click(); return bt.textContent; });
log('picked', picked);
await place(0, 107, 0, N);
for (let i = 0; i < 40; i++) { await run(30); const m = await p.evaluate(() => { const m = window.__game.zone.content.nasa.mover('nasa_elevator'); return [m.y, m.target]; }); if (m[0] === m[1]) break; }
await run(60);
log('rode down to', await loc());
await shot('09_lower_landing');
await walk('lower corridor → silo hall', (l) => l[1] > 180, 90);
await face(N, 0.25);
await shot('10_silo_hall');
log('errors', errs.slice(0, 8));
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
await b.close();
