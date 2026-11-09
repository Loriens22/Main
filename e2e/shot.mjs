// Usage: node e2e/shot.mjs <out.png> [script.js] [frames] [width] [height]
// Loads the game in headless Chromium (SwiftShader WebGL), pauses the real-time loop, optionally runs a
// script against window.__game (game), steps N frames deterministically and saves the canvas + UI.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [out = 'e2e/out/shot.png', scriptPath, frames = '3', w = '960', h = '540'] = process.argv.slice(2);
const url = process.env.GAME_URL ?? 'http://localhost:5173/';
fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.setDefaultTimeout(600000);
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) || m.text().startsWith('[T]')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
const preset = process.env.GFX ?? 'performance';
await page.addInitScript((p) => {
  try {
    const s = JSON.parse(localStorage.getItem('ibe.settings.v1') || '{}');
    s.graphics = { ...(s.graphics || {}), preset: p, ...(p === 'performance' ? { resolutionScale: 1, textureQuality: 1, shadowQuality: 1, reflections: 0, ambientOcclusion: 0, volumetrics: 1, atmosphere: 1, water: 1, viewDistance: 1, antiAliasing: 'fxaa', motionBlur: false, filmGrain: true, lensEffects: true, bloom: true, vegetationDensity: 0.5 } : {}) };
    localStorage.setItem('ibe.settings.v1', JSON.stringify(s));
  } catch {}
}, preset);
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.phase !== 'loading', null, { timeout: 600000 });
await page.evaluate(() => { window.__game.running = false; window.__game.settings.graphics.preset; });
if (scriptPath) {
  const code = fs.readFileSync(scriptPath, 'utf8');
  const res = await page.evaluate(`(async () => { const game = window.__game; ${code} })()`);
  if (res !== undefined) console.log('script result:', JSON.stringify(res));
}
const ms = await page.evaluate((n) => window.__game.step(n, 1 / 30), +frames);
console.log(`frame ms: ${ms.toFixed(0)}`);
const data = await page.evaluate(() => window.__game.renderer.canvas.toDataURL('image/png'));
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
try { await page.screenshot({ path: out.replace('.png', '_ui.png'), timeout: 20000 }); } catch { console.log('(ui screenshot skipped)'); }
const stats = await page.evaluate(() => { const g = window.__game; return { phase: g.phase, calls: g.renderer.stats.calls, tris: g.renderer.stats.tris, zone: g.zone?.id, player: g.player.pos.toArray().map((v) => +v.toFixed(2)) }; });
console.log('stats', JSON.stringify(stats));
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
