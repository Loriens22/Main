// Headless end-to-end test of the vertical slice.
//
//   node tools/smoke-test.mjs [--cmd "prompt"]... [--shots dir] [--q low]
//
// Boots the built single-file game in headless Chromium (SwiftShader WebGL),
// starts it, submits prompts through the real command pipeline, waits for
// every generation job to finish (checking the 5-minute budget), then frames
// each created entity with the camera and saves screenshots.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cmds = [];
let shots = join(root, 'tools/out'), q = 'low', w = 960, h = 540, gen = 'balanced', extra = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cmd') cmds.push(args[++i]);
  else if (args[i] === '--shots') shots = args[++i];
  else if (args[i] === '--q') q = args[++i];
  else if (args[i] === '--size') { [w, h] = args[++i].split('x').map(Number); }
  else if (args[i] === '--gen') gen = args[++i];
  else if (args[i] === '--extra') extra = args[++i];
}
if (!cmds.length) {
  cmds.push('create a modern two-story house with large windows and a garden');
  cmds.push('create a 1.70 m tall slightly overweight man with short black hair wearing a blue shirt');
}
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('crash', () => { console.log('PAGE CRASHED. Last logs:\n' + logs.slice(-30).join('\n')); });
browser.on('disconnected', () => console.log('browser disconnected'));
const t0 = Date.now();
await page.goto('file://' + join(root, 'index.html') + `?q=${q}&gen=${gen}&nomirror&nofx&budget=400${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.G && window.G.player && window.G.avatar && window.G.avatar.ready && window.__frames > 2, null, { timeout: 600000 });
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.evaluate(() => { document.getElementById('start-btn').click(); });
let failures = 0;
for (let i = 0; i < cmds.length; i++) {
  const c = cmds[i];
  const tc = Date.now();
  await page.evaluate((text) => { window.G.ui.hooks.onCommand(text, null); }, c);
  try {
    await page.waitForFunction(() => window.G.jobs.active.length === 0, null, { timeout: 330000, polling: 500 });
  } catch (e) { console.log('TIMEOUT waiting for', c); failures++; }
  const secs = (Date.now() - tc) / 1000;
  const info = await page.evaluate(() => {
    const G = window.G;
    const e = G.lastCreated;
    if (!e) return null;
    return { name: e.name, gen: e.gen, cat: e.category, pos: e.root.position.toArray().map((v) => +v.toFixed(2)), height: e.height, radius: e.footprint && e.footprint.radius, tris: (() => { let t = 0; e.root.traverse((o) => { if (o.geometry) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return Math.round(t); })() };
  });
  console.log(`[${secs.toFixed(1)} s${secs > 300 ? ' OVER BUDGET' : ''}] "${c}" ->`, JSON.stringify(info));
  if (!info) failures++;
  if (secs > 300) failures++;
  // Frame the entity: stand back and look at it.
  await page.evaluate(() => {
    const G = window.G;
    const e = G.lastCreated;
    if (!e) return;
    const r = Math.max(1.2, (e.footprint ? e.footprint.radius : 1) * e.scale);
    const H = (e.height || 2) * e.scale;
    const dist = Math.max(r * 1.7, H * 1.4, 3.0);
    const yaw = e.root.rotation.y + 0.55;
    const px = e.root.position.x + Math.sin(yaw) * dist, pz = e.root.position.z + Math.cos(yaw) * dist;
    const P = G.player;
    P.position.set(px, G.world.colliders.groundHeight(px, pz, 0.3, e.root.position.y + 40, 80), pz);
    P.velocity.set(0, 0, 0);
    P.yaw = Math.atan2(-(e.root.position.x - px), -(e.root.position.z - pz));
    const eyeY = P.position.y + 1.87;
    const targetY = e.root.position.y + H * 0.45;
    P.pitch = Math.atan2(targetY - eyeY, Math.hypot(e.root.position.x - px, e.root.position.z - pz));
    P.eyeSmoothY = 1.87;
    if (P.cameraMode !== 'first') P.toggleCamera();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(shots, `slice${i + 1}.png`), timeout: 180000 });
}
// Third-person view of the player avatar.
await page.evaluate(() => { const G = window.G; G.player.toggleCamera(); G.player.pitch = -0.25; });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(shots, 'player3p.png'), timeout: 180000 });
const stats = await page.evaluate(() => ({ entities: window.G.registry.entities.size, fps: window.G.fps, calls: window.G.renderer.renderer.info.render.calls }));
console.log('stats', JSON.stringify(stats));
const errs = logs.filter((l) => /pageerror|\[error\]/i.test(l));
if (errs.length) { console.log('ERRORS:\n' + errs.slice(0, 30).join('\n')); failures += errs.length; }
if (process.env.ALLLOGS) console.log(logs.join('\n'));
console.log(failures ? `FAILED (${failures})` : 'PASS');
await browser.close();
process.exit(failures ? 1 : 0);
