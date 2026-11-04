#!/usr/bin/env node
/**
 * Framing check for Act I: steps the manor scene through time WITHOUT rendering
 * and reports where the man's head / hips / hands and the TV screen land in the
 * frame (normalised device coords, |x|,|y| <= 1 is on screen).
 *   node scripts/export/framing_check.mjs --dist dist_dev --from 10 --to 44 --step 0.5 [--keys file.json]
 * --keys: JSON {trackIndex: [CamKey...]} to try camera keys before editing the source.
 */
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(arg('dist', 'dist'));
const PORT = 8790 + Math.floor(Math.random() * 9);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html?export=1&w=640&h=360&only=manor`);
await page.waitForFunction('window.__film && window.__film.ready || window.__filmError', null, { timeout: 15 * 60 * 1000, polling: 500 });
const keys = arg('keys', '') ? JSON.parse(fs.readFileSync(arg('keys'), 'utf8')) : null;
const out = await page.evaluate(([from, to, step, keys]) => {
  const S = window.__film.S, THREE = window.__film.THREE, M = S.manor;
  if (keys) for (const [i, k] of Object.entries(keys)) M.tracks[+i].keys = k;
  M.camera.aspect = 16 / 9;
  const find = (re) => { let b = null; M.man.group.traverse((o) => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
  const head = find(/^head(?!b)/i), hips = find(/^hips/i), hl = find(/^handL/i), hr = find(/^handR/i), fl = find(/^footL/i);
  const tvP = new THREE.Vector3(2.69, 1.065, 0.515); // CRT glass centre
  const v = new THREE.Vector3(), rows = [];
  const ndc = (o, dy = 0) => { if (!o) return null; o.getWorldPosition(v); v.y += dy; v.project(M.camera); return [+v.x.toFixed(2), +v.y.toFixed(2)]; };
  for (let t = from; t <= to + 1e-6; t += step) {
    M.update(t);
    M.scene.updateMatrixWorld(true);
    M.camera.updateMatrixWorld(true);
    const ti = M.tracks.findIndex((tr) => t >= tr.t0 && t <= tr.t1);
    rows.push({ t: +t.toFixed(2), tr: ti, headTop: ndc(head, 0.16), head: ndc(head, 0.08), hips: ndc(hips), handL: ndc(hl), handR: ndc(hr), foot: ndc(fl), tv: (() => { v.copy(tvP).project(M.camera); return [+v.x.toFixed(2), +v.y.toFixed(2)]; })(), f: +M.camera.getFocalLength().toFixed(0) });
  }
  return rows;
}, [+arg('from', 10), +arg('to', 44), +arg('step', 0.5), keys]);
const off = (p) => !p || Math.abs(p[0]) > 1 || Math.abs(p[1]) > 1;
for (const r of out) {
  const flag = off(r.headTop) ? (off(r.head) ? 'HEAD-OUT' : 'top-cut') : '';
  console.log(`t=${String(r.t).padEnd(6)} tr${r.tr} f${r.f} headTop ${JSON.stringify(r.headTop)} head ${JSON.stringify(r.head)} hips ${JSON.stringify(r.hips)} hands ${JSON.stringify(r.handL)}${JSON.stringify(r.handR)} foot ${JSON.stringify(r.foot)} tv ${JSON.stringify(r.tv)} ${flag}`);
}
await browser.close(); server.close();
