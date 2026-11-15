// The way to Ranger 1 at the top of the rocket, as a player: from the silo hall's entrance across the floor → the
// gantry lift's call post → into the cage by its south door (and its west door) → its button → up 64.8 m → out through the gate onto the landing → along the crew access arm → the hatch prompt.
// Then the safety edges: the arm's walls, the landing's railings, the bar at the adapter, the landing gate over the
// empty shaft once the cage has gone down, and the call button that brings it back.
//   node e2e/gantry_arm.mjs <url> <outDir>      (against a served build; SHOTS=1 for pictures)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url = 'http://localhost:5200/', out = 'e2e/out/gantry_arm'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.setDefaultTimeout(900000);
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.phase === 'menu', null, { polling: 500 });
await p.evaluate(async () => { const g = window.__game; g.running = false; await g.startCreative(false); g.cinematic = null; g.state.clock.earthTime += 4.5 * 3600; g.zone.content.spawnAt('nasa_silo'); g.step(30, 1 / 30, false); });
const run = (n, r = false) => p.evaluate(([n, r]) => window.__game.step(n, 1 / 30, r), [n, r]);
const shot = async (n) => {
  if (process.env.SHOTS !== '1') return;
  await run(1, true);
  fs.writeFileSync(`${out}/${n}.png`, Buffer.from((await p.evaluate(() => window.__game.renderer.canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
};
const results = [];
let fails = 0;
const log = (k, v) => { results.push([k, v]); if (k.startsWith('FAIL')) fails++; console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
const check = (name, ok, v) => log(`${ok ? 'OK  ' : 'FAIL'} ${name}`, v);
// model coordinates (x east, y north, z up) of the player's feet
const loc = () => p.evaluate(() => { const g = window.__game, o = g.zone.content.nasa.origin, q = g.player.pos; return [+(q.x - o.x).toFixed(2), +(-(q.z - o.z)).toFixed(2), +(q.y - o.y).toFixed(2)]; });
const prompt = () => p.evaluate(() => document.querySelector('.prompt.show')?.textContent ?? null);
const place = (x, y, z, yaw) => p.evaluate(([x, y, z, yaw]) => { const g = window.__game, o = g.zone.content.nasa.origin; g.player.enterFrame(g.player.frame, new (g.camera.position.constructor)(o.x + x, o.y + z + 0.05, o.z - y), yaw, 'walk'); g.player.pitch = 0; }, [x, y, z, yaw]);
const face = (yaw) => p.evaluate((yaw) => { const g = window.__game; g.player.enterFrame(g.player.frame, g.player.pos.clone(), yaw, 'walk'); g.player.pitch = 0; }, yaw);
const N = 0, W = Math.PI / 2, S = Math.PI, E = -Math.PI / 2;
const aim = (id) => p.evaluate((id) => {
  const g = window.__game, pl = g.player, it = g.interaction.items.get(id);
  if (!it) return 'missing ' + id;
  const w = it.targets[0].getWorldPosition(new (g.camera.position.constructor)());
  const dx = w.x - pl.pos.x, dz = w.z - pl.pos.z;
  pl.enterFrame(pl.frame, pl.pos.clone(), Math.atan2(-dx, -dz), 'walk');
  pl.pitch = Math.atan2(w.y - (pl.pos.y + 1.62), Math.hypot(dx, dz));
  return +Math.hypot(dx, dz).toFixed(2);
}, id);
/** walk forward for up to `s` seconds or until done(loc); returns the end and the lowest point */
const walk = async (done, s = 20) => {
  const start = await loc();
  await p.evaluate(() => window.__game.input.virtMove.set(0, 1));
  let l = start, low = start[2];
  for (let i = 0; i < s * 2; i++) {
    await run(15);
    l = await loc();
    low = Math.min(low, l[2]);
    if (done(l)) break;
  }
  await p.evaluate(() => window.__game.input.virtMove.set(0, 0));
  await run(4);
  return { start, end: await loc(), low };
};
const use = async () => { await p.evaluate(() => window.__game.input.virtualPress('interact')); await run(3); };
const lift = () => p.evaluate(() => { const m = window.__game.zone.content.nasa.mover('gantry_lift'); return { level: m.level, y: +m.y.toFixed(2), moving: m.y !== m.target }; });
const SY = 200, LOW = -35, ARM = LOW + 64.8;

/** walk to a point on the floor, steering towards it every half second */
const walkTo = async (x, y, s = 40, r = 0.35) => {
  const start = await loc();
  let l = start, low = start[2];
  await p.evaluate(() => window.__game.input.virtMove.set(0, 1));
  for (let i = 0; i < s * 2; i++) {
    await p.evaluate(([x, y]) => { const g = window.__game, o = g.zone.content.nasa.origin, pl = g.player; const dx = o.x + x - pl.pos.x, dz = o.z - y - pl.pos.z; pl.heading.set(dx, 0, dz).normalize(); pl.orthoHeading?.(); }, [x, y]);
    await run(15);
    l = await loc();
    low = Math.min(low, l[2]);
    if (Math.hypot(l[0] - x, l[1] - y) < r) break;
  }
  await p.evaluate(() => window.__game.input.virtMove.set(0, 0));
  await run(4);
  return { start, end: await loc(), low };
};
// 1) from the silo hall's entrance (where the corridor comes in) across the floor to the cage's south door
await place(0, 177.5, LOW, N);
let w = await walkTo(12.5, 194.9);
check('hall entrance → in front of the cage', Math.hypot(w.end[0] - 12.5, w.end[1] - 194.9) < 0.6 && w.low > LOW - 0.3, w);
log('call post prompt', [await aim('gl_btn:gl_call_bottom'), (await run(4), await prompt())]);
await face(N);
w = await walk((l) => l[1] > 197.0, 8);
check('in through the south door', w.end[1] > 196.8 && w.end[0] > 11.6 && w.end[0] < 13.4 && w.low > LOW - 0.3, w);
await shot('01_cage');
// 2) the west door works at the silo floor too
await face(W);
w = await walk((l) => l[0] < 10.0, 6);
check('out through the west door', w.end[0] < 10.5 && w.low > LOW - 0.3, w.end);
await face(E);
w = await walk((l) => l[0] > 12.3, 6);
check('back in through the west door', w.end[0] > 12.0 && w.low > LOW - 0.3, w.end);
// 3) the cage's button: up to the crew access arm
log('cage button', [await aim('gl_btn:gl_button'), (await run(4), await prompt())]);
await use();
for (let i = 0; i < 40 && (await lift()).moving !== false; i++) await run(15);
for (let i = 0; i < 40 && (await lift()).moving; i++) await run(15);
await run(40);
const top = await loc();
check('rode up with the cage', Math.abs(top[2] - ARM) < 0.3, { at: top, lift: await lift() });
// up here the south gate stays down (nothing on that side but the drop)
await face(S);
w = await walk(() => false, 3);
check('the south gate holds at the top', w.end[1] > 196.3 && w.low > ARM - 0.3, w.end);
await place(12.5, 197.1, ARM, W);
// 4) out through the gate onto the landing, then onto the arm and along it to the adapter
await face(W);
w = await walk((l) => l[0] < 9.6, 8);
check('cage → landing', w.end[0] < 10.2 && w.low > ARM - 0.3, w);
await face(N);
w = await walk((l) => l[1] > 199.9, 6);
check('landing → arm', w.end[1] > 199.5 && w.low > ARM - 0.3, w);
await face(W);
w = await walk((l) => l[0] < 3.7, 12);
check('along the arm to the adapter', w.end[0] < 4.2 && w.low > ARM - 0.3, w);
await shot('02_arm_tip');
log('hatch prompt', [await aim('board_ranger1'), (await run(4), await prompt())]);
// 5) the edges hold: the bar at the adapter, both arm walls, the landing's railings
await face(W);
w = await walk(() => false, 3);
check('the bar at the adapter holds', w.end[0] > 3.25 && w.low > ARM - 0.3, w.end);
await place(6.0, SY, ARM, N);
w = await walk(() => false, 3);
check('the arm\'s north wall holds', w.end[1] < SY + 1.05 && w.low > ARM - 0.3, w.end);
await face(S);
w = await walk(() => false, 3);
check('the arm\'s south wall holds', w.end[1] > SY - 1.05 && w.low > ARM - 0.3, w.end);
await place(9.0, 197.5, ARM, S);
w = await walk(() => false, 3);
check('the landing\'s south railing holds', w.end[1] > 196.2 && w.low > ARM - 0.3, w.end);
await place(9.0, 197.5, ARM, W);
w = await walk(() => false, 3);
check('the landing\'s west railing holds', w.end[0] > 7.4 && w.low > ARM - 0.3, w.end);
// 6) the cage goes down without you: the landing gate closes over the shaft; the landing's call button brings it back
await p.evaluate(() => window.__game.zone.content.nasa.callMover('gantry_lift'));
for (let i = 0; i < 60 && (await lift()).moving; i++) await run(15);
await run(40);
await place(10.0, 197.1, ARM, E);
w = await walk(() => false, 3);
check('the landing gate holds over the empty shaft', w.end[0] < 11.45 && w.low > ARM - 0.3, { end: w.end, lift: await lift() });
await shot('03_landing_gate');
await place(10.6, 197.0, ARM, S);
log('landing call button', [await aim('gl_btn:gl_call_top'), (await run(4), await prompt())]);
await use();
for (let i = 0; i < 60 && (await lift()).moving; i++) await run(15);
await run(40);
check('called back up to the landing', (await lift()).level === 1 && !(await lift()).moving, await lift());
await place(10.0, 197.1, ARM, E);
w = await walk((l) => l[0] > 12.3, 6);
check('landing → back into the cage', w.end[0] > 12.0 && w.low > ARM - 0.3, w);
// 7) up and along the arm once more, and board Ranger 1 with the Endurance mission authorised: the launch begins
await face(W);
w = await walk((l) => l[0] < 9.6, 8);
await face(N);
w = await walk((l) => l[1] > 199.9, 6);
await face(W);
w = await walk((l) => l[0] < 3.7, 12);
await p.evaluate(() => { window.__game.state.mission.decision = 'endurance'; });
log('hatch prompt (mission authorised)', [await aim('board_ranger1'), (await run(4), await prompt())]);
await use();
await run(30);
const launch = await p.evaluate(() => { const g = window.__game, l = g.zone.launch; return l ? { phase: l.phase, control: g.control?.constructor?.name ?? null } : null; });
check('boarded Ranger 1: the launch sequence starts', !!launch && launch.phase !== 'aborted', launch);
log('errors', errs.slice(0, 8));
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await b.close();
