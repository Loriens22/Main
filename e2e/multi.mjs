// Usage: node e2e/multi.mjs <steps.mjs> <outDir> [width] [height]
// Like shot.mjs but runs a sequence of steps exported by <steps.mjs>:
//   export const steps = [{ js: 'code run against `game`', frames: 30, dt: 1/30, shot: 'name' }, ...]
// Each step evaluates its js (may be async, may return a value that gets logged), advances `frames`
// deterministic frames and optionally saves the canvas to <outDir>/<shot>.png.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [stepsPath, outDir = 'e2e/out', w = '960', h = '540'] = process.argv.slice(2);
const { steps } = await import(pathToFileURL(path.resolve(stepsPath)).href);
const url = process.env.GAME_URL ?? 'http://localhost:5173/';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.setDefaultTimeout(900000);
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
await page.waitForFunction(() => window.__game && window.__game.phase !== 'loading', null, { timeout: 900000 });
await page.evaluate(() => { window.__game.running = false; });
let i = 0;
for (const st of steps) {
  i++;
  const t0 = Date.now();
  if (st.js) {
    const res = await page.evaluate(`(async () => { const game = window.__game; const V3 = game.camera.position.constructor; ${st.js} })()`);
    if (res !== undefined) console.log(`[${i}] result:`, JSON.stringify(res));
  }
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.frames) {
    // advance in chunks so long runs do not block the page for minutes in one call
    let left = st.frames;
    while (left > 0) {
      const n = Math.min(left, st.chunk ?? 60);
      await page.evaluate(([n, dt, last]) => window.__game.step(n, dt, last), [n, st.dt ?? 1 / 30, left - n <= 0 && !!st.shot]);
      left -= n;
    }
  }
  if (st.shot) {
    if (!st.frames) await page.evaluate(() => window.__game.step(1, 1 / 30, true));
    const data = await page.evaluate(() => window.__game.renderer.canvas.toDataURL('image/png'));
    fs.writeFileSync(path.join(outDir, st.shot + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    if (st.ui) { try { await page.screenshot({ path: path.join(outDir, st.shot + '_ui.png'), timeout: 20000 }); } catch {} }
  }
  if (st.probe) {
    const r = await page.evaluate(`(() => { const game = window.__game; ${st.probe} })()`);
    console.log(`[${i}] probe:`, JSON.stringify(r));
  }
  console.log(`[${i}] done in ${((Date.now() - t0) / 1000).toFixed(1)} s${st.shot ? ' -> ' + st.shot : ''}`);
  if (logs.length) { console.log(logs.splice(0).slice(0, 25).join('\n')); }
}
await browser.close();
