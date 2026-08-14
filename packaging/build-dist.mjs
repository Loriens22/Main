#!/usr/bin/env node
/**
 * Ornight Plus release builder.
 *
 * Produces every shippable artifact into <repo>/dist (gitignored — artifacts
 * are made on demand; the PWA *sources* under packaging/ are what's committed):
 *
 *   dist/pwa/                    installable PWA. Host this directory; the URL
 *                                you open on the tablet is its index.html.
 *   dist/ornight-plus-pwa.zip    the same directory, zipped for upload.
 *   dist/ornight-plus.html       the single-file build — one self-contained
 *                                HTML file that runs offline from a download.
 *
 * Usage:  node packaging/build-dist.mjs [--skip-tablet-build] [--skip-single] [--skip-zip]
 *
 * `--skip-tablet-build` re-assembles the PWA from an existing apps/tablet/dist
 * instead of rebuilding it, which is what you want when iterating on the
 * manifest, the icons or the service worker.
 *
 * Every step is fail-loud. If the tablet app does not compile this script stops
 * with the compiler's own output rather than shipping a broken bundle.
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = join(ROOT, 'dist');
const PWA_OUT = join(DIST, 'pwa');
const TABLET_DIST = join(ROOT, 'apps', 'tablet', 'dist');
const TABLET_SINGLE = join(ROOT, 'apps', 'tablet', 'dist-single');

const args = new Set(process.argv.slice(2));
const skipSingle = args.has('--skip-single');
const skipZip = args.has('--skip-zip');
const skipTabletBuild = args.has('--skip-tablet-build');

/* -------------------------------------------------------------------------- */
/* Console                                                                    */
/* -------------------------------------------------------------------------- */

const tty = process.stdout.isTTY === true;
const paint = (code, text) => (tty ? `[${code}m${text}[0m` : text);
const dim = (text) => paint('2', text);
const bold = (text) => paint('1', text);
const blue = (text) => paint('38;5;69', text);
const red = (text) => paint('31', text);

let step = 0;
const heading = (text) => {
  step += 1;
  console.log(`\n${blue(`[${step}]`)} ${bold(text)}`);
};

function fail(message, detail) {
  console.error(`\n${red('✗ build-dist failed')} — ${message}`);
  if (detail) console.error(`\n${detail}`);
  process.exit(1);
}

function run(command, commandArgs, label) {
  console.log(dim(`    $ ${command} ${commandArgs.join(' ')}`));
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) fail(`${label} could not start (${result.error.message}).`);
  if (result.status !== 0) {
    fail(
      `${label} exited with code ${result.status}.`,
      'The tablet UI is a separate workspace — if it does not compile yet, that failure is\n' +
        'above and belongs to whoever owns apps/tablet/src. No artifacts were written.',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function walk(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
}

const bytes = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;

const dirSize = (dir) =>
  walk(dir).reduce((total, file) => total + statSync(join(dir, file)).size, 0);

/* -------------------------------------------------------------------------- */
/* 1 — build the tablet app                                                   */
/* -------------------------------------------------------------------------- */

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

console.log(bold('\nOrnight Plus — release build'));
console.log(dim(`  version ${pkg.version}   root ${ROOT}`));

if (skipTabletBuild) {
  heading('Reusing the existing tablet build (--skip-tablet-build)');
  if (!existsSync(join(TABLET_DIST, 'index.html'))) {
    fail(
      `--skip-tablet-build was passed but ${relative(ROOT, TABLET_DIST)} holds no index.html.`,
      'Run without the flag once to produce it.',
    );
  }
} else {
  heading('Building the tablet app (npm run build:tablet)');
  run('npm', ['run', 'build:tablet'], 'npm run build:tablet');
  if (!existsSync(join(TABLET_DIST, 'index.html'))) {
    fail(
      `the tablet build reported success but ${relative(ROOT, join(TABLET_DIST, 'index.html'))} does not exist.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* 2 — assemble the PWA                                                       */
/* -------------------------------------------------------------------------- */

heading('Assembling the PWA');

rmSync(PWA_OUT, { recursive: true, force: true });
mkdirSync(PWA_OUT, { recursive: true });
cpSync(TABLET_DIST, PWA_OUT, { recursive: true });
cpSync(join(HERE, 'icons'), join(PWA_OUT, 'icons'), {
  recursive: true,
  filter: (src) => !src.endsWith('.mjs'),
});
cpSync(join(HERE, 'pwa', 'manifest.webmanifest'), join(PWA_OUT, 'manifest.webmanifest'));
cpSync(join(HERE, 'pwa', 'offline.html'), join(PWA_OUT, 'offline.html'));
cpSync(join(PWA_OUT, 'icons', 'favicon.ico'), join(PWA_OUT, 'favicon.ico'));
console.log(dim(`    copied tablet bundle + ${readdirSync(join(HERE, 'icons')).length - 1} icons`));

/* ---- head injection ------------------------------------------------------ */

const HEAD_MARKER = '<!-- ornight:pwa -->';
const HEAD = `    ${HEAD_MARKER}
    <link rel="manifest" href="manifest.webmanifest" />
    <meta name="theme-color" content="#05070f" />
    <meta name="color-scheme" content="dark" />
    <meta name="application-name" content="Ornight Plus" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Ornight" />
    <meta name="format-detection" content="telephone=no" />
    <link rel="icon" href="favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="192x192" href="icons/ornight-192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="icons/ornight-512.png" />
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="icons/ornight-152.png" />
    <link rel="apple-touch-icon" sizes="167x167" href="icons/ornight-167.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="icons/ornight-180.png" />`;

// Registered from the load event so the first paint is never delayed by it,
// and reloaded once when a new worker takes over so an updated build shows up
// without the user hunting for a hard refresh.
const SW_SCRIPT = `    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function (error) {
            console.warn('Ornight: service worker registration failed', error);
          });
          var reloading = false;
          navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (reloading) return;
            reloading = true;
            location.reload();
          });
        });
      }
    </script>`;

const indexPath = join(PWA_OUT, 'index.html');
let html = readFileSync(indexPath, 'utf8');

if (html.includes(HEAD_MARKER)) fail('index.html already carries the PWA head block.');
if (!/<\/head>/i.test(html)) fail('index.html has no </head> to inject into.');

// iOS only respects viewport-fit=cover when it is on the viewport meta itself,
// so rewrite the tag Vite emitted rather than adding a second one.
const viewport =
  '<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, viewport-fit=cover" />';
html = /<meta\s+name=["']viewport["'][^>]*>/i.test(html)
  ? html.replace(/<meta\s+name=["']viewport["'][^>]*>/i, viewport)
  : html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n    ${viewport}`);

// Vite emits root-absolute asset URLs. Making them relative is what lets the
// same directory be served from https://host/ *and* from https://host/ornight/,
// which matters because most people will drop this under a path.
const relativised = html.replace(/\b(src|href)="\/(?!\/)/g, '$1="');
if (relativised !== html) console.log(dim('    rewrote root-absolute asset URLs as relative'));
html = relativised;

html = html.replace(/[^\S\n]*<\/head>/i, `${HEAD}\n${SW_SCRIPT}\n  </head>`);
writeFileSync(indexPath, html);
console.log(dim('    injected manifest link, apple meta tags, icons and SW registration'));

/* ---- service worker ------------------------------------------------------ */

const precache = [
  ...new Set([
    './',
    './index.html',
    './offline.html',
    ...walk(PWA_OUT)
      .filter((file) => file !== 'sw.js')
      .sort()
      .map((file) => `./${file}`),
  ]),
];

// The cache name folds in a digest of the payload, so any content change
// invalidates the old cache and `activate` sweeps it away.
const digest = createHash('sha256');
for (const file of walk(PWA_OUT).sort()) {
  digest.update(file).update(readFileSync(join(PWA_OUT, file)));
}
const cacheVersion = `${pkg.version}-${digest.digest('hex').slice(0, 8)}`;

const sw = readFileSync(join(HERE, 'pwa', 'sw.js'), 'utf8')
  .replaceAll('__ORNIGHT_VERSION__', cacheVersion)
  .replaceAll('__ORNIGHT_PRECACHE__', JSON.stringify(precache));
writeFileSync(join(PWA_OUT, 'sw.js'), sw);
console.log(dim(`    service worker cache "ornight-${cacheVersion}", ${precache.length} entries`));

/* -------------------------------------------------------------------------- */
/* 3 — the single-file build                                                  */
/* -------------------------------------------------------------------------- */

let singleFile = null;
if (skipSingle) {
  console.log(dim('\n    (skipping the single-file build: --skip-single)'));
} else {
  heading('Building the single-file app (npm run build:single)');
  run('npm', ['run', 'build:single'], 'npm run build:single');
  const source = join(TABLET_SINGLE, 'index.html');
  if (!existsSync(source)) fail(`the single-file build produced no ${relative(ROOT, source)}.`);
  singleFile = join(DIST, 'ornight-plus.html');
  cpSync(source, singleFile);
  console.log(dim(`    ${relative(ROOT, singleFile)}  ${bytes(statSync(singleFile).size)}`));
}

/* -------------------------------------------------------------------------- */
/* 4 — zip the PWA                                                            */
/* -------------------------------------------------------------------------- */

/** Minimal store/deflate ZIP writer — no dependency, no `zip` binary needed. */
function writeZip(sourceDir, target) {
  const table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const files = walk(sourceDir).sort();
  /** @type {Buffer[]} */
  const local = [];
  /** @type {Buffer[]} */
  const central = [];
  let offset = 0;

  for (const name of files) {
    const raw = readFileSync(join(sourceDir, name));
    const deflated = deflateRawSync(raw, { level: 9 });
    const store = deflated.length >= raw.length;
    const body = store ? raw : deflated;
    const method = store ? 0 : 8;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(raw);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(0, 10); // time
    header.writeUInt16LE(0x21, 12); // date (1996-01-01, deterministic)
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    local.push(header, nameBuf, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(0o100644 << 16, 38); // external attrs: -rw-r--r--
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += header.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(target, Buffer.concat([...local, centralBuf, end]));
  return files.length;
}

let zipPath = null;
if (skipZip) {
  console.log(dim('\n    (skipping the zip: --skip-zip)'));
} else {
  heading('Zipping the PWA');
  zipPath = join(DIST, 'ornight-plus-pwa.zip');
  rmSync(zipPath, { force: true });

  const hasZipBinary =
    spawnSync('zip', ['-v'], { stdio: 'ignore', shell: false }).status === 0;

  if (hasZipBinary) {
    console.log(dim('    $ zip -qr9 ../ornight-plus-pwa.zip .   (system zip)'));
    const result = spawnSync('zip', ['-qr9', zipPath, '.'], { cwd: PWA_OUT, stdio: 'inherit' });
    if (result.status !== 0) fail(`zip exited with code ${result.status}.`);
  } else {
    const count = writeZip(PWA_OUT, zipPath);
    console.log(dim(`    no system zip; used the built-in writer (${count} entries)`));
  }
  console.log(dim(`    ${relative(ROOT, zipPath)}  ${bytes(statSync(zipPath).size)}`));
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const pwaFiles = walk(PWA_OUT);

console.log(`\n${bold('Built:')}`);
const row = (path, size, note) =>
  console.log(`  ${blue('•')} ${path.padEnd(30)} ${String(size).padStart(10)}  ${dim(note)}`);

row(
  `${relative(ROOT, PWA_OUT)}/`,
  bytes(dirSize(PWA_OUT)),
  `${pwaFiles.length} files — host this, open its index.html on the tablet`,
);
if (zipPath) row(relative(ROOT, zipPath), bytes(statSync(zipPath).size), 'upload / transfer bundle');
if (singleFile)
  row(
    relative(ROOT, singleFile),
    bytes(statSync(singleFile).size),
    'one self-contained file, works from a download',
  );

console.log(`\n${bold('Try it locally:')}`);
console.log(`  ${dim('$')} npx serve ${relative(ROOT, PWA_OUT)}      ${dim('# or any static server')}`);
console.log(
  `  ${dim('then open the LAN URL on the tablet — Chrome ▸ Install app, Safari ▸ Share ▸ Add to Home Screen.')}`,
);
console.log(`  ${dim('Full instructions: docs/INSTALL.md')}\n`);
