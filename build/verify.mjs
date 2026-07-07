import { chromium } from 'playwright-core';
import { pathToFileURL } from 'url';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const fileUrl = pathToFileURL(resolve(__dirname, '..', 'index.html')).href;

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1600,900'
  ]
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const logs = [], errors = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));
page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

await page.goto(fileUrl, { waitUntil: 'load', timeout: 60000 });

// wait for the loading overlay to be dismissed (scene initialised)
let overlayHidden = false;
try {
  await page.waitForFunction(() => {
    const o = document.getElementById('overlay');
    return o && o.classList.contains('hidden');
  }, { timeout: 45000 });
  overlayHidden = true;
} catch (e) { /* handled below */ }

// let it render a few seconds & measure fps
await page.waitForTimeout(4000);

// Introspect the running scene
const diag = await page.evaluate(() => {
  const canvas = document.getElementById('scene');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const fps = document.getElementById('fps')?.textContent || 'n/a';
  const overlay = document.getElementById('overlay');
  const errShown = overlay && overlay.innerHTML.includes('Unable to start');
  let objects = -1, tris = -1;
  try {
    const grp = window.__complexGroup;
    if (grp) { objects = 0; grp.traverse(() => objects++); }
  } catch (e) {}
  // read renderer info if exposed
  return {
    hasWebGL: !!gl,
    glVersion: gl ? gl.getParameter(gl.VERSION) : null,
    fps, errShown,
    canvasW: canvas.width, canvasH: canvas.height,
    complexObjects: objects
  };
});

// ---- print the health report FIRST (before slow software-rendered shots) ----
console.log('\n================ VERIFY REPORT ================');
console.log('overlay dismissed :', overlayHidden);
console.log('diag              :', JSON.stringify(diag, null, 2));
console.log('console messages  :', logs.length);
logs.slice(0, 40).forEach(l => console.log('   ', l));
console.log('errors            :', errors.length);
errors.forEach(e => console.log('   ', e));
console.log('==============================================\n');

// screenshots of a few views (best-effort; software render can be slow)
async function shot(viewName, name) {
  try {
    await page.evaluate(v => { const V = window.__VIEWS[v]; window.__setView(V.pos, V.tgt); }, viewName);
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(__dirname, name), timeout: 120000 });
    console.log('  shot', name);
  } catch (e) { console.log('  shot FAILED', name, e.message); }
}
await shot('aerial', 'shot_aerial.png');
await shot('courtyard', 'shot_courtyard.png');
await shot('facade', 'shot_facade.png');
await shot('penthouse', 'shot_penthouse.png');
await shot('street', 'shot_street.png');
await page.evaluate(() => window.__setSun(7, 108));
await shot('aerial', 'shot_golden.png');
await page.evaluate(() => window.__setSun(34, 148));

await browser.close();
const ok = overlayHidden && diag.hasWebGL && !diag.errShown && errors.length === 0;
console.log(ok ? 'RESULT: PASS ✓' : 'RESULT: FAIL ✗');
process.exit(ok ? 0 : 1);
