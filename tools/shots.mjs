// node tools/shots.mjs shots.json  -> renders each {name, code, w, h} into tools/out/<name>.png in one browser session
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const list = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const pre = process.argv[3] || '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
const t0 = Date.now();
await page.goto('file://' + resolve('trolleybus.html'));
await page.evaluate(() => { window.__manual = true; });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 }).catch(() => logs.push('ready timeout'));
console.log('ready after', Date.now() - t0, 'ms');
if (pre) { try { const r = await page.evaluate(pre); if (r !== undefined) console.log('pre:', JSON.stringify(r).slice(0, 3000)); } catch (e) { console.log('pre error', e.message); } }
for (const s of list) {
  if (s.w) await page.setViewportSize({ width: s.w, height: s.h });
  try { const r = await page.evaluate(s.code); if (r !== undefined) console.log(s.name, JSON.stringify(r).slice(0, 3000)); } catch (e) { console.log(s.name, 'error', e.message); }
  await page.waitForTimeout(s.wait || 400);
  await page.screenshot({ path: `tools/out/${s.name}.png` });
}
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
