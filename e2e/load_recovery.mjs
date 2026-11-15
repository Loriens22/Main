// The NASA base (and the rest of the lazily loaded world) survives a bad load: a dropped model download is retried,
// a script chunk that is missing (a release landed while the page was cached) reloads the current build, a part that
// still fails is reported on screen, and a player who falls out of the world is put back.
//   node e2e/load_recovery.mjs <url> [scenario…]     (against a served build; scenarios: retry chunk fail fall mc)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url = 'http://localhost:5200/', ...only] = process.argv.slice(2);
const out = 'e2e/out/load_recovery';
fs.mkdirSync(out, { recursive: true });
const want = (s) => !only.length || only.includes(s);
const results = [];
const log = (k, v) => { results.push([k, v]); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };

async function open(setup) {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.setDefaultTimeout(900000);
  const errs = [], reqs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 160)); });
  p.on('request', (r) => { if (/nasa\.glb|NasaSite-/.test(r.url())) reqs.push(r.url().replace(/^.*\/assets\//, '')); });
  await setup?.(p);
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__game && window.__game.phase === 'menu', null, { polling: 500 });
  return { b, p, errs, reqs };
}
const start = (p) => p.evaluate(async () => { const g = window.__game; g.running = false; await g.startCreative(false); g.cinematic = null; g.step(10, 1 / 30, false); });
const nasaState = (p) => p.evaluate(() => { const n = window.__game.zone.content.nasa; return { base: !!n, meshes: (() => { let k = 0; n?.site?.root.traverse((o) => { if (o.isMesh) k++; }); return k; })() }; });
const toasts = (p) => p.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent));

if (want('retry')) {
  // the model download fails once (a dropped connection): tried again, the base is there
  let n = 0;
  const { b, p, errs, reqs } = await open((p) => p.route('**/nasa.glb*', (r) => (n++ === 0 ? r.abort('connectionreset') : r.continue())));
  log('retry: requests', reqs);
  log('retry: base', await nasaState(p));
  log('retry: console', errs.filter((e) => /nasa|assets/.test(e)).slice(0, 3));
  await b.close();
}
if (want('chunk')) {
  // the NASA base's script chunk is missing once (an older index.html after a release): reload, then the base is there
  let n = 0;
  const { b, p, reqs } = await open((p) => p.route('**/NasaSite-*.js', (r) => (n++ === 0 ? r.fulfill({ status: 404, body: 'gone' }) : r.continue())));
  log('chunk: url after recovery', p.url().replace(/^https?:\/\/[^/]+/, ''));
  log('chunk: requests', reqs);
  log('chunk: base', await nasaState(p));
  await b.close();
}
if (want('fail')) {
  // the model cannot be downloaded at all: the player is told, on screen
  const { b, p, reqs } = await open((p) => p.route('**/nasa.glb*', (r) => r.abort('failed')));
  await start(p);
  log('fail: requests', reqs);
  log('fail: base', await nasaState(p));
  log('fail: on screen', await toasts(p));
  await b.close();
}
if (want('fall') || want('mc')) {
  const { b, p } = await open();
  await start(p);
  if (want('fall')) {
    const at = (where) => p.evaluate((where) => {
      const g = window.__game, c = g.zone.content, o = c.nasa.origin, V = g.camera.position.constructor, pl = g.player;
      const pos = where === 'field' ? new V(-300, g.zone.height(-300, 200) - 25, 200)
        : where === 'silo' ? new V(o.x, o.y - 35 + 0.05, o.z - 180)
        : new V(o.x, o.y - 140, o.z - 82);
      pl.enterFrame(g.zone.ground, pos, 0, 'walk');
      for (let k = 0; k < 40; k++) g.step(1, 1 / 30, false);
      const q = pl.pos;
      return { where, ground: +(g.zone.height(q.x, q.z) - q.y).toFixed(2), local: [+(q.x - o.x).toFixed(1), +(q.y - o.y).toFixed(2), +(-(q.z - o.z)).toFixed(1)] };
    }, where);
    log('fall: under the fields', await at('field'));
    log('fall: in the silo hall (35 m down, a real floor: stays)', await at('silo'));
    log('fall: below the base', await at('below'));
    log('fall: on screen', await toasts(p));
  }
  if (want('mc')) {
    await p.evaluate(() => { const g = window.__game; g.zone.content.spawnAt('nasa_mc'); g.step(30, 1 / 30, false); g.step(1, 1 / 30, true); });
    log('mc: arrival', await p.evaluate(() => { const g = window.__game, o = g.zone.content.nasa.origin, q = g.player.pos; return { local: [+(q.x - o.x).toFixed(2), +(q.y - o.y).toFixed(2), +(-(q.z - o.z)).toFixed(2)], room: g.zone.content.indoorRoom }; }));
    fs.writeFileSync(`${out}/mc_arrival.png`, Buffer.from((await p.evaluate(() => window.__game.renderer.canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
  }
  await b.close();
}
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
