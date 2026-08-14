/**
 * Turns the single-file build into a page the Artifact host can render.
 *
 *   node packaging/build-artifact-page.mjs
 *
 * The host wraps whatever it is given in its own `<!doctype html><head></head>
 * <body>`, so handing it a complete HTML document would nest one document
 * inside another and strand every `<meta>` and the `<title>` in the body. This
 * unwraps the build into the fragment the host actually wants: title first (it
 * only scans the opening 8 KB, and the stylesheet alone is larger than that),
 * then styles, then the mount point, then the bundle.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'apps/tablet/dist-single/index.html');
const OUT_DIR = join(ROOT, 'dist');
const OUT = join(OUT_DIR, 'ornight-artifact.html');

const html = readFileSync(SOURCE, 'utf8');

const collect = (tag) => {
  const out = [];
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[0]);
  return out;
};

const styles = collect('style');
const scripts = collect('script');

if (styles.length === 0 || scripts.length === 0) {
  console.error(
    'Expected inlined <style> and <script> in the single-file build. ' +
      'Run `npm run build:single` first.',
  );
  process.exit(1);
}

// Anything the bundle expects to find in the document already — currently just
// the React mount point.
const rootMatch = /<div id="root"[^>]*>[\s\S]*?<\/div>/i.exec(html);
const mount = rootMatch ? rootMatch[0] : '<div id="root"></div>';

const page = [
  '<title>Ornight Plus</title>',
  // The app reads this attribute to decide whether to render full glass; the
  // host owns <html>, so set it before the bundle runs rather than in markup.
  '<script>document.documentElement.dataset.glass="full";document.documentElement.lang="en";</script>',
  ...styles,
  mount,
  ...scripts,
].join('\n');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, page);

const mb = (page.length / 1024 / 1024).toFixed(2);
console.log(`wrote ${OUT} (${mb} MB, ${styles.length} style / ${scripts.length} script blocks)`);
if (page.length > 16 * 1024 * 1024) {
  console.error('Over the 16 MB artifact limit.');
  process.exit(1);
}
