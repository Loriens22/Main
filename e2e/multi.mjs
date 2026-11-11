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
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: !!process.env.TOUCH });
// synthetic multi-touch for touch-control tests: __touch(selectorOrElement, 'touchstart'|'touchmove'|'touchend', x, y, id)
await page.addInitScript(() => {
  window.__touch = (target, type, x, y, id = 1) => {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cx = x ?? r.left + r.width / 2, cy = y ?? r.top + r.height / 2;
    const t = new Touch({ identifier: id, target: el, clientX: cx, clientY: cy, pageX: cx, pageY: cy });
    const list = type === 'touchend' || type === 'touchcancel' ? [] : [t];
    el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: list, targetTouches: list, changedTouches: [t] }));
    return true;
  };
});
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
// any other named preset: apply the game's own preset table (the init script above only sets its name)
if (!['performance', 'custom'].includes(preset)) await page.evaluate(async (p) => { const S = await import('/src/core/Settings.ts'); const g = window.__game; S.applyPreset(g.settings.graphics, p); g.applySettings(); }, preset);
let i = 0;
// CDP_SAMPLE=1: Chrome's native sampling heap profiler on the page's renderer — after each step print the call stacks
// holding the most live native memory (finds leaks outside the JS heap: typed arrays, WebGL, audio, Blink)
let cdp = null;
if (process.env.CDP_SAMPLE) {
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Memory.startSampling', { samplingInterval: 1 << 17, suppressRandomness: false });
}
async function nativeTop() {
  if (!cdp) return;
  try {
    const { profile } = await cdp.send('Memory.getSamplingProfile');
    const agg = new Map();
    let all = 0;
    for (const s of profile.samples) {
      const fr = s.stack.filter((f) => !/malloc|alloc|partition|Partition|operator new|::Allocate|base::/.test(f)).slice(0, 5);
      const k = fr.join(' < ') || s.stack.slice(0, 3).join(' < ');
      agg.set(k, (agg.get(k) ?? 0) + s.total);
      all += s.total;
    }
    const top = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    console.log(`[native] live sampled ${(all / 1e6).toFixed(0)} MB; top:`);
    for (const [k, v] of top) console.log(`   ${(v / 1e6).toFixed(0)} MB  ${k.slice(0, 260)}`);
  } catch (e) { console.log('[native] profile failed', e.message); }
}
for (const st of steps) {
  i++;
  const t0 = Date.now();
  if (st.js) {
    const res = await page.evaluate(`(async () => { const game = window.__game; const V3 = game.camera.position.constructor; ${st.js} })()`);
    if (res !== undefined) console.log(`[${i}] result:`, JSON.stringify(res));
  }
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.untilJs) {
    // advance frames until the condition holds (or `max` frames), probing every chunk
    let n = 0, ok = false;
    while (n < (st.max ?? 3000)) {
      const k = st.chunk ?? 30;
      await page.evaluate(([k, dt]) => window.__game.step(k, dt, false), [k, st.dt ?? 1 / 30]);
      n += k;
      ok = await page.evaluate(`(() => { const game = window.__game; try { return !!(${st.untilJs}); } catch (e) { return false; } })()`);
      if (ok) break;
      if (st.probe && n % ((st.chunk ?? 30) * (st.every ?? 10)) === 0) console.log(`[${i}] ..${n}:`, JSON.stringify(await page.evaluate(`(async () => { const game = window.__game; ${st.probe} })()`)));
    }
    console.log(`[${i}] until ${ok ? 'met' : 'NOT met'} after ${n} frames`);
  }
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
    const r = await page.evaluate(`(async () => { const game = window.__game; ${st.probe} })()`);
    console.log(`[${i}] probe:`, JSON.stringify(r));
  }
  console.log(`[${i}] done in ${((Date.now() - t0) / 1000).toFixed(1)} s${st.shot ? ' -> ' + st.shot : ''}`);
  if (cdp && (st.native || i % 2 === 0)) await nativeTop();
  if (logs.length) { console.log(logs.splice(0).slice(0, 25).join('\n')); }
}
await browser.close();
