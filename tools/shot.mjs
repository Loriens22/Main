// Headless screenshot helper: node tools/shot.mjs out.png "js to eval before shot" [w h] [waitMs]
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
import { resolve } from 'node:path';
const [,, out = 'tools/out/shot.png', code = '', w = '1280', h = '720', wait = '1500'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
await page.goto('file://' + resolve('trolleybus.html'));
await page.waitForTimeout(+wait);
if (code) { try { const r = await page.evaluate(code); if (r !== undefined) console.log('eval:', JSON.stringify(r).slice(0, 2000)); } catch (e) { console.log('eval error', e.message); } }
await page.waitForTimeout(600);
await page.screenshot({ path: out });
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
