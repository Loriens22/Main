// Bundles src/ into ONE self-contained HTML file (index.html at the repo root
// and dist/sofia-bus-280.html). Three.js, the Route 280 data and the world
// pack are all inlined, so the game runs offline from a single file.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev');

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  target: ['es2020', 'safari15'],
  loader: { '.b64': 'text', '.json': 'json', '.glsl': 'text' },
  legalComments: 'none',
  write: false,
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  logLevel: 'info',
};

function emit(result) {
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = readFileSync('src/index.html', 'utf8').replace('<!--APP_SCRIPT-->', () => `<script>${js}</script>`);
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/sofia-bus-280.html', html);
  writeFileSync('index.html', html);
  console.log(`built index.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
}

if (watch) {
  const ctx = await esbuild.context({ ...options, plugins: [{ name: 'emit', setup(b) { b.onEnd((r) => r.errors.length || emit(r)); } }] });
  await ctx.watch();
} else {
  emit(await esbuild.build(options));
}
