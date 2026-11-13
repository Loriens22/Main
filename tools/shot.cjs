// Headless screenshot / scripted-play helper.
//   node tools/shot.cjs "<query string>" out.png [--js "<expr run in page>"] [--w 1280 --h 720] [--wait 2500] [--frames 3]
// Requires a dev or preview server on http://localhost:5173 (override with IBE_URL).
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
(async () => {
  const base = process.env.IBE_URL || 'http://localhost:5173/';
  const query = args[0] || '';
  const out = args[1] || 'shot.png';
  const w = +opt('w', 1280), h = +opt('h', 720);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +opt('dpr', 1) });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto(base + (query ? '?' + query : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ibe && (window.__ibe.state === 'playing' || window.__ibe.state === 'menu'), null, { timeout: +opt('timeout', 120000) }).catch((e) => errors.push('timeout waiting for game: ' + e.message));
  await page.waitForTimeout(+opt('wait', 2500));
  const js = opt('js', null);
  if (js) {
    const r = await page.evaluate(js).catch((e) => 'EVAL ERROR: ' + e.message);
    if (r !== undefined) console.log('js ->', typeof r === 'string' ? r : JSON.stringify(r));
    await page.waitForTimeout(+opt('settle', 1500));
  }
  if (errors.length) console.log(errors.slice(0, 12).join('\n'));
  errors.length = 0;
  await page.screenshot({ path: out, timeout: 240000 });
  const info = await page.evaluate(() => window.__ibe ? { fps: Math.round(window.__ibe.fps), ...window.__ibe.renderer.info() } : null).catch(() => null);
  console.log('saved', out, JSON.stringify(info));
  if (errors.length) console.log(errors.slice(0, 12).join('\n'));
  await browser.close();
})();
