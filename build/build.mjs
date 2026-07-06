// Bundle src/main.js (+ three.js and all modules) into ONE offline HTML file.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [resolve(__dirname, 'src/main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2019'],
  minify: true,
  legalComments: 'none',
  write: false,
  logLevel: 'info'
});

const js = result.outputFiles[0].text;
const template = readFileSync(resolve(__dirname, 'src/template.html'), 'utf8');
const html = template.replace('/*__BUNDLE__*/', () => js);

const out = resolve(__dirname, '..', 'index.html');
writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`\n✓ Wrote ${out}  (${kb} KB)`);
