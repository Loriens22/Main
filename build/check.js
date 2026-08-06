#!/usr/bin/env node
/* Headless smoke test: loads dist/steve.html in Chromium (SwiftShader),
 * reports console errors, page errors, any external network request, and
 * basic runtime health (fps, draw calls, registry population).
 *
 *   node build/check.js            # boot only
 *   node build/check.js --play     # boot, start the game, walk around
 */
const path = require('path');
const { chromium } = require(path.join('/opt/node22/lib/node_modules/playwright'));

const ROOT = path.resolve(__dirname, '..');
const FILE = 'file://' + path.join(ROOT, 'dist', 'steve.html');
const PLAY = process.argv.includes('--play');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--disable-gpu-sandbox', '--mute-audio']
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });

  const errors = [], warns = [], external = [];
  page.on('console', m => {
    const t = m.type(), text = m.text();
    if (/GL Driver Message|SwiftShader|Automatic fallback|WebGL: /.test(text)) return;
    if (t === 'error') errors.push(text);
    else if (t === 'warning') warns.push(text);
  });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));
  page.on('request', r => { if (!r.url().startsWith('file://')) external.push(r.url()); });

  await page.goto(FILE, { waitUntil: 'load', timeout: 60000 });

  // Wait for boot to finish (or time out).
  await page.waitForFunction(
    () => window.SG && window.SG.engine && window.SG.engine.running,
    null, { timeout: 45000 }
  ).catch(() => errors.push('TIMEOUT: engine never started'));

  await page.waitForTimeout(2500);

  const report = await page.evaluate(() => {
    const SG = window.SG || {};
    const E = (SG.engine || {});
    const count = o => (o ? Object.keys(o).length : 0);
    return {
      mode: E.mode, fps: Math.round(E.fps || 0), frame: E.frame,
      calls: E.renderer ? E.renderer.info.render.calls : -1,
      tris: E.renderer ? E.renderer.info.render.triangles : -1,
      geometries: E.renderer ? E.renderer.info.memory.geometries : -1,
      textures: E.renderer ? E.renderer.info.memory.textures : -1,
      registries: {
        tex: count(SG.tex), mat: count(SG.mat), models: count(SG.models),
        chars: count(SG.chars), levels: count(SG.levels),
        lines: count(SG.script && SG.script.lines),
        eggs: count(SG.eggs && SG.eggs.all)
      },
      sgErrors: (SG.errors || []).slice(0, 40),
      quality: SG.quality
    };
  });

  if (PLAY) {
    await page.evaluate(() => {
      if (window.SG && window.SG.engine) window.SG.engine.startNewGame();
    });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      if (window.SG && window.SG.cinema && window.SG.cinema.skip) window.SG.cinema.skip();
    });
    await page.waitForTimeout(3000);
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(700);
      await page.keyboard.up(key);
    }
    await page.waitForTimeout(1200);
    report.play = await page.evaluate(() => {
      const E = window.SG.engine;
      return {
        mode: E.mode, fps: Math.round(E.fps || 0),
        calls: E.renderer.info.render.calls,
        tris: E.renderer.info.render.triangles,
        level: E.level && E.level.id,
        pos: E.player && E.player.getPosition ?
          E.player.getPosition(new window.THREE.Vector3()).toArray().map(n => +n.toFixed(2)) : null,
        sgErrors: (window.SG.errors || []).slice(0, 40)
      };
    });
    await page.screenshot({ path: path.join(ROOT, 'dist', 'shot.png') });
  }

  console.log(JSON.stringify({ report, errors, warns: warns.slice(0, 20), external }, null, 2));
  await browser.close();
  process.exit(errors.length || external.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILURE', e); process.exit(2); });
