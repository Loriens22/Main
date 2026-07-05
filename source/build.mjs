/* Bundles source/scene.js (with three.js inlined) into a single
   self-contained HTML file: luxury-apartment-complex-3d.html
   Usage:  node source/build.mjs  (needs: npm i three@0.160.1 esbuild) */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const result = await build({
  entryPoints: [join(here, 'scene.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2021', 'safari15'],
  write: false,
  legalComments: 'none',
});
const bundle = result.outputFiles[0].text;

const template = readFileSync(join(here, 'template.html'), 'utf8');
const html = template.replace('/*BUNDLE*/', () => bundle);
const out = join(root, 'luxury-apartment-complex-3d.html');
writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');
