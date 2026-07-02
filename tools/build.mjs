/*
 * Bundles src/sofia-metro-m3.dev.html into a fully self-contained
 * single HTML file (three.js inlined, no CDN needed).
 *
 * Usage:
 *   npm i esbuild three@0.160.0
 *   node tools/build.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/sofia-metro-m3.dev.html'), 'utf8');

const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) throw new Error('module script not found');
writeFileSync(join(root, 'tools/.entry.js'), m[1]);

const out = buildSync({
  entryPoints: [join(root, 'tools/.entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  write: false,
  logLevel: 'warning',
});
const bundle = out.outputFiles[0].text;

const final = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/,
    () => '<script>' + bundle.replace(/<\/script>/g, '<\\/script>') + '</script>');

writeFileSync(join(root, 'sofia-metro-m3.html'), final);
console.log('wrote sofia-metro-m3.html —', final.length, 'bytes');
