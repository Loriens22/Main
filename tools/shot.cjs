// Headless verification: loads the built single-file game in Chromium
// (SwiftShader WebGL2), collects console errors and takes screenshots.
//   [VIEWPORT=844x390 MOBILE=1] node tools/shot.cjs <html> <outdir> '<query>' '<json steps>'
// steps: [{"eval": "js expression", "wait": ms, "shot": "name.png"}, ...]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const [html, outdir, query = '', stepsJson = '[]'] = process.argv.slice(2);
  const steps = JSON.parse(stepsJson);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  // VIEWPORT=844x390 MOBILE=1 emulates a phone (touch, device scale factor 3)
  const [vw, vh] = (process.env.VIEWPORT || '1280x720').split('x').map(Number);
  const mobile = !!process.env.MOBILE;
  const p = await b.newPage({ viewport: { width: vw, height: vh }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  const t0 = Date.now();
  await p.addInitScript(() => { window.__TEST_PRESERVE__ = true; });
  // INIT_JS='...' runs before the page, e.g. to remove an API and test a fallback
  if (process.env.INIT_JS) await p.addInitScript({ content: process.env.INIT_JS });
  await p.goto('file://' + path.resolve(html) + (query ? '?' + query : ''));
  try {
    await p.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 });
  } catch (e) {
    logs.push('TIMEOUT waiting for game ready: ' + (await p.evaluate(() => document.getElementById('loadmsg')?.textContent)));
  }
  console.log('ready after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  for (const s of steps) {
    if (s.eval) {
      try { const r = await p.evaluate(s.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r).slice(0, 20000)); }
      catch (e) { logs.push('[eval error] ' + e.message); }
    }
    // real input (hit-tested like a finger or mouse), unlike element.click() in eval
    if (s.tap) {
      try { await p.tap(s.tap, { timeout: 25000 }); console.log('tap ok:', s.tap); }
      catch (e) { logs.push('[tap failed] ' + s.tap + ': ' + e.message.split('\n').slice(0, 14).join(' | ')); }
    }
    if (s.touchAt) { await p.touchscreen.tap(s.touchAt[0], s.touchAt[1]); console.log('touch at', s.touchAt.join(',')); }
    // {drag: [x1, y1, x2, y2]}: mouse drag (desktop look-around)
    if (s.drag) {
      const [x1, y1, x2, y2] = s.drag;
      await p.mouse.move(x1, y1); await p.mouse.down();
      for (let i = 1; i <= 8; i++) { await p.mouse.move(x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8); await p.waitForTimeout(16); }
      await p.mouse.up(); console.log('drag ok');
    }
    // {hold: {sel, ms, dx, dy}}: press a finger on the element, optionally drag by (dx, dy), hold, release
    if (s.hold) {
      const box = await p.locator(s.hold.sel).first().boundingBox().catch(() => null);
      if (!box) logs.push('[hold failed] no element ' + s.hold.sel);
      else {
        const cdp = await p.context().newCDPSession(p);
        const x = box.x + box.width / 2 + (s.hold.ox || 0), y = box.y + box.height / 2 + (s.hold.oy || 0);
        const pt = (px, py) => [{ x: px, y: py, id: 7, radiusX: 4, radiusY: 4, force: 1 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
        const steps = 8, dx = s.hold.dx || 0, dy = s.hold.dy || 0;
        for (let i = 1; i <= steps && (dx || dy); i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (dx * i) / steps, y + (dy * i) / steps) });
          await p.waitForTimeout(16);
        }
        if (s.hold.during) { const r = await p.evaluate(s.hold.during); console.log('during hold:', JSON.stringify(r)); }
        await p.waitForTimeout(s.hold.ms || 300);
        if (s.hold.before) { const r = await p.evaluate(s.hold.before); console.log('before release:', JSON.stringify(r)); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        console.log('hold ok:', s.hold.sel);
      }
    }
    if (s.wait) await p.waitForTimeout(s.wait);
    if (s.shot) await p.screenshot({ path: path.join(outdir, s.shot), ...(/\.jpe?g$/.test(s.shot) ? { type: 'jpeg', quality: 84 } : {}) });
  }
  console.log(logs.slice(0, 40).join('\n') || 'no console errors');
  await b.close();
})();
