#!/usr/bin/env node
/* Concatenate every module into the HTML shell -> dist/spawn-hub.html */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist', 'spawn-hub.html');

const FILES = [
  'blocks.js',
  'world.js',
  'textures.js',
  'light.js',
  'mesher.js',
  'render.js',
  'particles.js',
  'builds/terrain.js',
  'builds/poor.js',
  'builds/bee.js',
  'builds/modern.js',
  'builds/market.js',
  'builds/sports.js',
  'builds/plaza.js',
  'app.js',
];

let bundle = '';
for (const f of FILES) {
  const p = path.join(SRC, f);
  const code = fs.readFileSync(p, 'utf8');
  bundle += '\n/* ===== ' + f + ' ===== */\n' + code + '\n';
}

const shell = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');
if (shell.indexOf('/*__BUNDLE__*/') < 0) throw new Error('shell.html is missing the bundle marker');
const html = shell.replace('/*__BUNDLE__*/', () => bundle);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log('wrote ' + path.relative(ROOT, OUT) + '  (' + kb + ' KB, ' + FILES.length + ' modules)');

/* ---------------------------------------------------------------------
   Artifact variant: the hosting page supplies <!doctype>, <head> and
   <body>, so emit the content only — title, styles, markup, scripts.
   --------------------------------------------------------------------- */
const ART = path.join(ROOT, 'dist', 'spawn-hub.artifact.html');
const headStart = html.indexOf('<head>') + '<head>'.length;
const headEnd = html.indexOf('</head>');
const bodyStart = html.indexOf('<body>') + '<body>'.length;
const bodyEnd = html.lastIndexOf('</body>');
const head = html.slice(headStart, headEnd)
  .split('\n')
  .filter(l => !/<meta charset|<meta name="viewport"|<meta name="theme-color"/.test(l))
  .join('\n').trim();
const art = head + '\n' + html.slice(bodyStart, bodyEnd).trim() + '\n';
fs.writeFileSync(ART, art);
console.log('wrote ' + path.relative(ROOT, ART) +
  '  (' + (Buffer.byteLength(art) / 1024).toFixed(1) + ' KB, no document wrapper)');
for (const tag of ['<!DOCTYPE', '<html', '<head>', '<body>']) {
  if (art.includes(tag)) throw new Error('artifact variant still contains ' + tag);
}

/* sanity: no leftover network references */
for (const bad of ['http://', 'https://', 'src="//', 'fetch(', 'XMLHttpRequest', 'import(']) {
  if (html.includes(bad)) console.warn('  ! contains "' + bad + '" — check it is not a live request');
}
