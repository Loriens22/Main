// Headless verification: loads the built single-file game in Chromium
// (SwiftShader WebGL2), collects console errors and takes screenshots.
//   node tools/shot.cjs <html> <outdir> '<query>' '<json steps>'
// steps: [{"eval": "js expression", "wait": ms, "shot": "name.png"}, ...]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const [html, outdir, query = '', stepsJson = '[]'] = process.argv.slice(2);
  const steps = JSON.parse(stepsJson);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  const t0 = Date.now();
  await p.addInitScript(() => { window.__TEST_PRESERVE__ = true; });
  await p.goto('file://' + path.resolve(html) + (query ? '?' + query : ''));
  try {
    await p.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 });
  } catch (e) {
    logs.push('TIMEOUT waiting for game ready: ' + (await p.evaluate(() => document.getElementById('loadmsg')?.textContent)));
  }
  console.log('ready after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  for (const s of steps) {
    if (s.eval) {
      try { const r = await p.evaluate(s.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r).slice(0, 2000)); }
      catch (e) { logs.push('[eval error] ' + e.message); }
    }
    if (s.wait) await p.waitForTimeout(s.wait);
    if (s.shot) await p.screenshot({ path: path.join(outdir, s.shot) });
  }
  console.log(logs.slice(0, 40).join('\n') || 'no console errors');
  await b.close();
})();
