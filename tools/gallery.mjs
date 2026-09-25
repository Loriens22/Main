// Gallery test for the gadget generator (and any generator/params list).
//
//   node tools/gallery.mjs [--kinds a,b,c] [--prompts "p1|p2"] [--out dir] [--per 6]
//
// Boots the built game headless, builds every gadget recipe (or the given
// kinds / prompts) directly through the generator with a synchronous
// context, reports failures and triangle counts, lays the results out in
// rows (each normalised to a 1.6 m cell) and screenshots every row.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let each = false, yawShot = 0, kinds = null, prompts = null, genName = 'gadget', from = 0, count = 1e9, prefix = 'row', out = join(root, 'tools/out/gallery'), per = 6, shots = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--kinds') kinds = args[++i].split(',');
  else if (args[i] === '--prompts') prompts = args[++i].split('|');
  else if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--per') per = Number(args[++i]);
  else if (args[i] === '--noshots') shots = false;
  else if (args[i] === '--each') each = true;
  else if (args[i] === '--yaw') yawShot = Number(args[++i]);
  else if (args[i] === '--gen') genName = args[++i];
  else if (args[i] === '--from') from = Number(args[++i]);
  else if (args[i] === '--count') count = Number(args[++i]);
  else if (args[i] === '--prefix') prefix = args[++i];
}
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 520 } });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
await page.goto('file://' + join(root, 'index.html') + '?q=low&gen=fast&nomirror&nofx&budget=400&time=11');
await page.waitForFunction(() => window.G && window.G.player && window.G.avatar && window.G.avatar.ready && window.__frames > 2, null, { timeout: 600000 });
await page.evaluate(() => document.getElementById('start-btn').click());

const res = await page.evaluate(({ kinds, prompts, genName, from, count }) => {
  const G = window.G;
  const { GENERATORS, RECIPES, RIDES, CIVIC, LANDMARKS, THREE, RNG, parse } = G.debugGen;
  const blank = () => ({ colors: [], primaryColor: null, secondaryColor: null, materials: [], sizeMul: 1, dims: {}, flags: {}, words: [], text: '', features: [], companions: [], clothing: [], hair: {}, personality: [], accessories: [], styles: [] });
  const items = [];
  if (prompts) {
    for (const p of prompts) {
      const cmd = parse(p);
      if (cmd && cmd.items) for (const it of cmd.items) items.push({ label: p, item: it });
      else items.push({ label: p, error: 'not a creation: ' + (cmd && cmd.type) });
    }
  } else {
    for (const k of (kinds || (genName === 'ride' ? Object.keys(RIDES) : genName === 'civic' ? CIVIC : genName === 'landmark' ? LANDMARKS : Object.keys(RECIPES))).slice(from, from + count)) items.push({ label: k, item: { gen: genName, concept: k, params: { kind: k, species: k, breed: k }, attrs: { ...blank(), text: k, words: [k] }, count: 1 } });
  }
  const ctx = { detail: 0.6, shouldYield: () => false, mustFinish: () => false, progress() {}, stage() {}, elapsed: () => 0, sliceEnd: Infinity };
  const results = [];
  const P = G.player;
  const fx = P.position.x, fz = P.position.z;
  let i = 0;
  for (const { label, item, error } of items) {
    if (error) { results.push({ label, error }); continue; }
    const gen = GENERATORS[item.gen];
    const t0 = performance.now();
    try {
      if (!gen) throw new Error('no generator ' + item.gen);
      const it = gen.build(ctx, item, new RNG(1234 + i), { world: G.world });
      let step = it.next();
      let guard = 0;
      while (!step.done && guard++ < 1e6) step = it.next();
      const data = step.value;
      let tris = 0; data.root.traverse((o) => { if (o.geometry && o.geometry.attributes.position) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
      const box = new THREE.Box3().setFromObject(data.root);
      const size = box.getSize(new THREE.Vector3());
      const md = Math.max(size.x, size.y, size.z, 0.01);
      const sc = Math.min(40, 1.6 / md);
      data.root.scale.multiplyScalar(sc);
      const row = Math.floor(i / 6), col = i % 6;
      const x = fx + (col - 2.5) * 2.2, z = fz - 6 - row * 3.5;
      const y = G.world.terrain ? G.world.terrain.heightAt(x, z) : P.position.y;
      data.root.position.set(x, y - box.min.y * sc, z);
      G.world.scene.add(data.root);
      (window.__rows = window.__rows || [])[row] = (window.__rows[row] || []).concat([data.root]);
      results.push({ label, name: data.name, tris: Math.round(tris), ms: Math.round(performance.now() - t0), size: [size.x, size.y, size.z].map((v) => +v.toFixed(2)), row });
    } catch (e) {
      results.push({ label, error: String(e && e.stack || e).slice(0, 400) });
    }
    i++;
  }
  return results;
}, { kinds, prompts, genName, from, count });
let bad = 0;
for (const r of res) {
  if (r.error) { bad++; console.log('FAIL', r.label, r.error); }
  else console.log(`${r.label.padEnd(22)} ${String(r.name).padEnd(28)} ${String(r.tris).padStart(7)} tris ${String(r.ms).padStart(5)} ms  size ${r.size.join('x')}`);
}
console.log(`${res.length - bad}/${res.length} built`);
if (shots && each) {
  // One close-up per item (front three-quarter view).
  const n = res.length;
  for (let idx = 0, ok = 0; idx < n; idx++) {
    if (res[idx].error) continue;
    const i = ok++;
    await page.evaluate(({ i, yawShot }) => {
      const G = window.G, P = G.player;
      const all = (window.__rows || []).flat();
      all.forEach((o, j) => { o.visible = j === i; });
      const o = all[i];
      if (!window.__g0) window.__g0 = P.position.clone();
      const d = 3.0;
      P.position.set(o.position.x + Math.sin(yawShot) * d, o.position.y + 0.1, o.position.z + Math.cos(yawShot) * d);
      P.velocity.set(0, 0, 0);
      P.yaw = yawShot; P.pitch = -0.12; P.flying = true;
    }, { i, yawShot });
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(out, `${prefix}${String(i).padStart(2, '0')}.png`), timeout: 180000 });
  }
} else if (shots) {
  const rows = Math.max(...res.filter((r) => !r.error).map((r) => r.row)) + 1;
  for (let rw = 0; rw < rows; rw++) {
    await page.evaluate((rw) => {
      const G = window.G, P = G.player;
      if (!window.__g0) window.__g0 = P.position.clone();
      const z = window.__g0.z - 6 - rw * 3.5;
      P.position.set(window.__g0.x, window.__g0.y, z + 7.2);
      P.velocity.set(0, 0, 0);
      P.yaw = 0; P.pitch = -0.2; P.flying = true;
      (window.__rows || []).forEach((list, i) => list && list.forEach((o) => { o.visible = i === rw; }));
    }, rw);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(out, `${prefix}${String(rw).padStart(2, '0')}.png`), timeout: 180000 });
  }
}
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
