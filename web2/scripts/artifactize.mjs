// Post-build: turn dist/index.html into the artifact page fragment (the host wraps it in <html><head><body>),
// inline the CSS, and copy everything into dist-artifact/ with a manifest of supporting files.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const out = new URL('../dist-artifact/', import.meta.url).pathname;
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });
cpSync(dist, out, { recursive: true, filter: (src) => !src.endsWith('.glb') });

let html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="(\.\/assets\/[^"]+\.css)"[^>]*>/g)];
let styles = '';
for (const m of css) {
  const path = join(dist, m[1]);
  // fonts referenced as ./KaTeX_*.woff2 relative to the css file live in assets/
  styles += readFileSync(path, 'utf8').replace(/url\((?:\.\/)?(KaTeX_[^)]+)\)/g, 'url(assets/$1)');
  html = html.replace(m[0], '');
}
const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1]
  .replace(/<meta charset[^>]*>/, '')
  .replace(/<meta name="viewport"[^>]*>/, '')
  .trim();
const body = /<body>([\s\S]*?)<\/body>/.exec(html)[1].trim();
const fragment = `${head}\n<style>\n${styles}\n</style>\n${body}\n`;
writeFileSync(join(out, 'index.html'), fragment);
for (const m of css) rmSync(join(out, m[1]), { force: true });

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) walk(p);
  else if (p !== join(out, 'index.html')) files.push(relative(out, p));
});
walk(out);
writeFileSync(join(out, 'files.json'), JSON.stringify(files, null, 1));
const size = files.reduce((a, f) => a + statSync(join(out, f)).size, 0);
console.log(`artifact: index.html ${(statSync(join(out, 'index.html')).size / 1024).toFixed(0)} KB + ${files.length} files, ${(size / 1048576).toFixed(1)} MB`);
