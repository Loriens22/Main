#!/usr/bin/env node
/**
 * Frame-exact renderer for "Happy birthday Matex".
 *
 * Serves dist/ locally, opens it in headless Chromium (Playwright) in export
 * mode and calls window.__film.renderAt(t) for every frame time, so the output
 * is deterministic and independent of real-time speed.
 *
 *   stills:   node scripts/export/render_frames.mjs --times 5,20.5,33 --out shots --w 960 --h 540
 *   sequence: node scripts/export/render_frames.mjs --from 0 --to 206 --fps 24 --out frames/seg0.mkv
 *             (frames are piped as JPEG straight into ffmpeg -> lossless-ish MJPEG/H.264 segment)
 */
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(arg('dist', 'dist'));
const W = +arg('w', 1920), H = +arg('h', 1080);
const OUT = arg('out', 'shots');
const ONLY = arg('only', '');
const QUALITY = +arg('q', 0.94);
const PORT = +arg('port', 8700 + Math.floor(Math.random() * 200));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => { const t = m.text(); if (!/GPU stall|Driver Message|swiftshader/i.test(t)) console.log('[page]', t.slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html?export=1&w=${W}&h=${H}${ONLY ? `&only=${ONLY}` : ''}`);
await page.waitForFunction('window.__film && window.__film.ready || window.__filmError', null, { timeout: 15 * 60 * 1000, polling: 500 });
const err = await page.evaluate('window.__filmError');
if (err) { console.error('boot failed', err); process.exit(1); }
const missing = await page.evaluate('window.__film.missing');
if (missing?.length) console.log('missing assets:', missing);

async function frame(t) {
  return page.evaluate(([tt, q]) => { window.__film.renderAt(tt); return window.__film.capture('image/jpeg', q); }, [t, QUALITY]);
}

const times = arg('times', '');
const SEQ = arg('seq', '');
if (times) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const ts of times.split(',')) {
    const t = +ts;
    const a = Date.now();
    const url = await frame(t);
    fs.writeFileSync(path.join(OUT, `t${t.toFixed(2).padStart(7, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`t=${t} ${(Date.now() - a)}ms`);
  }
} else if (SEQ) {
  // Resumable image-sequence mode: worker `offset` of `stride` renders frames f = offset, offset+stride, ...
  // Each frame is written atomically (tmp + rename) and skipped when it already exists.
  const fps = +arg('fps', 24);
  const from = +arg('from', 0), to = +arg('to', 206);
  const stride = +arg('stride', 1), offset = +arg('offset', 0);
  const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
  fs.mkdirSync(SEQ, { recursive: true });
  const todo = [];
  for (let f = f0; f < f1; f++) if ((f - f0) % stride === offset && !fs.existsSync(path.join(SEQ, `${String(f).padStart(5, '0')}.jpg`))) todo.push(f);
  console.log(`worker ${offset}/${stride}: ${todo.length} frames to render`);
  const start = Date.now();
  for (let i = 0; i < todo.length; i++) {
    const f = todo[i];
    const url = await frame(f / fps);
    const dst = path.join(SEQ, `${String(f).padStart(5, '0')}.jpg`);
    fs.writeFileSync(dst + '.tmp', Buffer.from(url.split(',')[1], 'base64'));
    fs.renameSync(dst + '.tmp', dst);
    if (i % 12 === 0 || i === todo.length - 1) {
      const el = (Date.now() - start) / 1000, rate = el / (i + 1);
      console.log(`frame ${f} (${i + 1}/${todo.length}) t=${(f / fps).toFixed(2)} ${rate.toFixed(2)}s/f eta ${((todo.length - i - 1) * rate / 60).toFixed(1)}min`);
    }
  }
  console.log('sequence worker done');
} else {
  const fps = +arg('fps', 24);
  const from = +arg('from', 0), to = +arg('to', 206);
  const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // visually lossless intermediate (re-encoded once at the end)
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const start = Date.now();
  for (let f = f0; f < f1; f++) {
    const url = await frame(f / fps);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - f0) % 24 === 0) {
      const el = (Date.now() - start) / 1000, done = f - f0 + 1, rate = el / done;
      console.log(`frame ${f}/${f1} t=${(f / fps).toFixed(2)} ${rate.toFixed(2)}s/f eta ${((f1 - f) * rate / 60).toFixed(1)}min`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('segment written', OUT);
}
await browser.close();
server.close();
