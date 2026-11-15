// Skip the drive between the farm and the NASA base: on foot with J, back with the pause-menu entry, then in the
// pickup both ways; and the touch layout's SKIP DRIVE button. Checks where you end up, the clock and the flags.
//   node e2e/farm_nasa_travel.mjs <url> <outDir>      (against a served build)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url = 'http://localhost:5200/', out = 'e2e/out/travel'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.setDefaultTimeout(900000);
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.phase === 'menu', null, { polling: 500 });
await p.evaluate(async () => { const g = window.__game; g.running = false; await g.startCreative(false); g.cinematic = null; });
const run = (n, r = false) => p.evaluate(([n, r]) => window.__game.step(n, 1 / 30, r), [n, r]);
const shot = async (n) => { await run(1, true); await p.screenshot({ path: `${out}/${n}.png` }); };
const results = [];
const log = (k, v) => { results.push([k, v]); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
const where = () => p.evaluate(() => {
  const g = window.__game, c = g.control, P = c?.root?.position ?? g.player.pos;
  return { inCar: !!c?.root, x: Math.round(P.x), z: Math.round(P.z), toNasa: Math.round(Math.hypot(P.x - 2900, P.z + 3150)), toFarm: Math.round(Math.hypot(P.x, P.z)), clock: Math.round(g.state.clock.earthTime), reachedNasa: !!g.state.flags.reachedNasa, option: g.zone.content.travel?.option() ?? null };
});
/** step the game while the fade runs in real time, until the travel has finished */
const settle = async () => {
  for (let i = 0; i < 80; i++) {
    await run(3);
    await p.waitForTimeout(60);
    const busy = await p.evaluate(() => window.__game.zone.content.travel?.busy);
    if (!busy && i > 3) break;
  }
  await run(20);
};
await run(30);
const a = await where();
log('at the farm', a);
log('on-screen button', await p.evaluate(() => { const e = document.querySelector('.travel-chip'); return e && getComputedStyle(e).display !== 'none' ? e.textContent : null; }));
await shot('01_farm_button');
// 1) on foot, J
await p.evaluate(() => window.__game.input.virtualPress('travel'));
await run(2);
await settle();
const b1 = await where();
log('after J (on foot)', b1);
log('drive time skipped (min)', Math.round((b1.clock - a.clock) / 60));
await shot('02_at_nasa');
// 2) back home from the pause menu
await p.evaluate(() => window.__game.toggleMenu());
await run(3);
const entry = await p.evaluate(() => { const bt = [...document.querySelectorAll('.panel button')].find((x) => /SKIP THE DRIVE/.test(x.textContent)); if (!bt) return null; const t = bt.textContent; bt.click(); return t; });
log('pause-menu entry', entry);
await settle();
log('after the menu entry', await where());
// 3) in the pickup, both ways
await p.evaluate(() => { const g = window.__game, v = g.zone.content.vehicles.list.find((x) => x.id === 'pickup'); g.player.enterFrame(g.player.frame, v.root.position.clone().add(new (g.camera.position.constructor)(2, 0, 0)), 0, 'walk'); v.enter(); });
await run(30);
log('in the pickup at the farm', await where());
await p.evaluate(() => window.__game.input.virtualPress('travel'));
await run(2);
await settle();
const c1 = await where();
log('after J (driving)', c1);
await run(60);
log('pickup parked on the forecourt, 2 s later', await p.evaluate(() => { const g = window.__game, t = g.control?.body?.translation(); return t ? { y: +(t.y - g.zone.height(t.x, t.z)).toFixed(2), speed: +g.control.speed.toFixed(2) } : null; }));
await shot('03_pickup_at_nasa');
await p.evaluate(() => window.__game.input.virtualPress('travel'));
await run(2);
await settle();
log('after J again (driving home)', await where());
await shot('04_pickup_home');
// 4) touch: the SKIP DRIVE button shows only while the skip is possible
await p.evaluate(() => { const g = window.__game; g.control?.exit?.(); g.setControl(null); g.zone.content.spawnAt('farm'); g.input.touchActive = false; g.touch.enable(); });
await run(10);
log('touch buttons at the farm', await p.evaluate(() => [...document.querySelectorAll('.touch button')].filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.textContent)));
await p.evaluate(() => { const g = window.__game; g.zone.content.spawnAt('nasa_atrium'); });
await run(10);
log('touch buttons in the NASA atrium', await p.evaluate(() => [...document.querySelectorAll('.touch button')].filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.textContent)));
log('errors', errs.slice(0, 8));
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
await b.close();
