// Bundles src/ (+ three.js) into ONE self-contained HTML file.
//
//   node tools/build.mjs          -> dist/genesis-sandbox.html (minified) + index.html copy
//   node tools/build.mjs --dev    -> unminified build with sourcemap comments stripped
//
// The output has no external references at all: JavaScript, CSS and the
// HTML shell are inlined, textures are generated on the GPU at runtime and
// audio is synthesised, so the file works offline from a USB stick.

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');

const result = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: !dev,
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
});

let js = result.outputFiles[0].text;
// Never let the inline script terminate the <script> tag early.
js = js.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');
const shell = readFileSync(join(root, 'src/ui/shell.html'), 'utf8');
const html = shell
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js)
  .replace('__BUILD_DATE__', new Date().toISOString().slice(0, 10));

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/genesis-sandbox.html'), html);
writeFileSync(join(root, 'index.html'), html);
console.log(`Built dist/genesis-sandbox.html (${(html.length / 1024).toFixed(0)} KB)${dev ? ' [dev]' : ''}`);
