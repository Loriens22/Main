// Headless screenshot helper for development.
//   node tools/shot.mjs "<query-string>" out.png [waitFrames] [width] [height]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const qs = process.argv[2] || '';
const out = process.argv[3] || join(root, 'tools/out/shot.png');
const waitFrames = Number(process.argv[4] || 20);
const width = Number(process.argv[5] || 1280), height = Number(process.argv[6] || 720);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const t0 = Date.now();
await page.goto('file://' + join(root, 'index.html') + (qs ? '?' + qs : ''));
try {
  await page.waitForFunction((n) => window.__frames >= n, waitFrames, { timeout: 240000 });
} catch (e) { logs.push('[timeout] ' + e.message); }
await page.screenshot({ path: out, timeout: 180000 });
console.log(`shot in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
const errs = logs.filter((l) => /error|warn|timeout/i.test(l) && !/useProgram/.test(l)).map((l) => l.split('\n').filter((x) => /ERROR|error|warn|timeout|^\[/i.test(x) || />/.test(x)).slice(0, 12).join('\n'));
console.log(errs.slice(0, 40).join('\n'));
if (process.env.ALLLOGS) console.log(logs.join('\n'));
await browser.close();
