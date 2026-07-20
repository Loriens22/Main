// Renders dist/index.html headlessly and captures screenshots from preset views.
// Usage: node spawnhub/test/shot.mjs [outdir] [shotdir]
import { chromium } from 'playwright-core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || 'dist';
const shotDir = process.argv[3] || join(root, 'shots');
mkdirSync(shotDir, { recursive: true });

const VIEWS = {
  overview: { target: [150, 40, 150], yaw: 0.8, pitch: -0.55, dist: 150 },
  plaza:    { target: [144, 38, 146], yaw: 2.6, pitch: -0.35, dist: 52 },
  tower:    { target: [76, 50, 200], yaw: 4.2, pitch: -0.25, dist: 55 },
  shops:    { target: [136, 38, 88], yaw: 3.6, pitch: -0.3, dist: 45 },
  modern:   { target: [232, 52, 82], yaw: 1.3, pitch: -0.3, dist: 70 },
  bee:      { target: [130, 45, 200], yaw: 5.6, pitch: -0.3, dist: 45 },
  field:    { target: [214, 36, 206], yaw: 0.6, pitch: -0.45, dist: 55 },
  pond:     { target: [168, 34, 202], yaw: 5.2, pitch: -0.25, dist: 35 },
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 500)); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto('file://' + join(root, outDir, 'index.html'));
try {
  await page.waitForSelector('#loader', { state: 'hidden', timeout: 120000 });
} catch {
  const msg = await page.textContent('#loadmsg').catch(() => '?');
  console.log('LOADER STUCK:', msg);
}
await page.waitForTimeout(1200);

for (const [name, v] of Object.entries(VIEWS)) {
  await page.evaluate((vv) => { SpawnHub.Engine.setView(vv); }, v);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shotDir, name + '.png') });
  console.log('shot:', name);
}
if (errors.length) { console.log('CONSOLE ISSUES:'); for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ' + e); }
else console.log('no console errors');
await browser.close();
