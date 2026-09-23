// Bundles src/main.js (plus three.js) into ONE self-contained HTML file: trolleybus.html
// Usage: node build.mjs            (minified)
//        node build.mjs --dev      (readable, with sourcemap-free output)
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const dev = process.argv.includes('--dev');
const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  write: false,
  target: ['es2020'],
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
});
let js = result.outputFiles[0].text;
// never let the bundle close the inline <script> early
js = js.replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync('src/index.template.html', 'utf8');
const css = readFileSync('src/style.css', 'utf8');
const html = tpl.replace('/*__STYLE__*/', () => css).replace('/*__BUNDLE__*/', () => js);
writeFileSync('trolleybus.html', html);
console.log(`trolleybus.html written: ${(html.length / 1024).toFixed(0)} KB`);
