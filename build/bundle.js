#!/usr/bin/env node
/* Bundles src/*.js + the HTML shell into a single self-contained index.html.
   Usage: node build/bundle.js [--out index.html] [--minify] */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'src');

var ORDER = [
  '10_core.js',
  '20_render.js',
  '30_geometry.js',
  '40_actors.js',
  '50_systems.js',
  '60_ui.js',
  '70_story.js',
  '80_main.js'
];

var args = process.argv.slice(2);
var outName = 'index.html';
var minify = false;
/* fragment mode emits page-content only (no doctype/html/head/body) because the
   Artifact host wraps the file in its own skeleton at publish time. */
var fragment = false;
for (var i = 0; i < args.length; i++) {
  if (args[i] === '--out') { outName = args[++i]; }
  else if (args[i] === '--minify') { minify = true; }
  else if (args[i] === '--fragment') { fragment = true; }
}

function readOptional(f) {
  var p = path.join(SRC, f);
  if (!fs.existsSync(p)) {
    console.warn('  [MISSING] ' + f + '  -> emitting stub');
    return '/* MISSING MODULE: ' + f + ' */\n';
  }
  return fs.readFileSync(p, 'utf8');
}

/* Conservative size reducer: strips full-line // comments and /* *\/ block
   comments that are not inside a string or template literal, plus trailing
   whitespace and blank-line runs. Never renames identifiers. Skipped by
   default because GLSL lives inside template literals. */
function lightStrip(code) {
  var out = '';
  var i = 0, n = code.length;
  var inStr = null, inLine = false, inBlock = false;
  while (i < n) {
    var c = code[i], d = code[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; i += 2; } else { i++; } continue; }
    if (inStr) {
      out += c;
      if (c === '\\') { out += (d === undefined ? '' : d); i += 2; continue; }
      if (c === inStr) { inStr = null; }
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { inLine = true; i += 2; continue; }
    if (c === '/' && d === '*') { inBlock = true; i += 2; continue; }
    out += c; i++;
  }
  return out.split('\n').map(function (l) { return l.replace(/\s+$/, ''); })
            .filter(function (l, idx, arr) {
              return !(l === '' && idx > 0 && arr[idx - 1] === '');
            }).join('\n');
}

console.log('Bundling Island Protocol...');
var parts = [];
var report = [];
ORDER.forEach(function (f) {
  var code = readOptional(f);
  if (minify) { code = lightStrip(code); }
  report.push({ file: f, bytes: Buffer.byteLength(code, 'utf8'), lines: code.split('\n').length });
  parts.push('/* ============ ' + f + ' ============ */\n' + code);
});

var js = parts.join('\n\n');

var shellPath = path.join(ROOT, 'build', 'shell.html');
var shell = fs.readFileSync(shellPath, 'utf8');

if (shell.indexOf('__GAME_JS__') < 0) {
  console.error('shell.html is missing the __GAME_JS__ placeholder'); process.exit(1);
}
/* Guard: a literal </script> inside JS would terminate the tag early. */
if (/<\/script/i.test(js)) {
  js = js.replace(/<\/script/gi, '<\\/script');
  console.warn('  escaped literal </script occurrences in JS');
}

var body = shell.replace('__GAME_JS__', function () { return js; })
                .replace(/__BUILD_DATE__/g, new Date().toISOString().slice(0, 10));

var html = fragment ? body : (
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,' +
  'user-scalable=no,viewport-fit=cover">\n' +
  '<meta name="theme-color" content="#05070a">\n' +
  '<meta name="mobile-web-app-capable" content="yes">\n' +
  '<meta name="apple-mobile-web-app-capable" content="yes">\n' +
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
  '<meta name="description" content="Island Protocol: Presidential Extraction - ' +
  'a survival-horror escort shooter that runs entirely in one HTML file.">\n' +
  '<title>Island Protocol: Presidential Extraction</title>\n' +
  '</head>\n<body>\n' + body + '\n</body>\n</html>\n'
);

var outPath = path.join(ROOT, outName);
fs.writeFileSync(outPath, html, 'utf8');

console.log('\n  module                bytes      lines');
console.log('  ---------------------------------------');
report.forEach(function (r) {
  console.log('  ' + r.file.padEnd(20) + String(r.bytes).padStart(9) + String(r.lines).padStart(11));
});
var total = fs.statSync(outPath).size;
console.log('  ---------------------------------------');
console.log('  ' + outName.padEnd(20) + String(total).padStart(9) +
            '   (' + (total / 1048576).toFixed(2) + ' MB)');
if (total > 16 * 1048576) { console.error('\n  WARNING: exceeds the 16MB artifact limit'); }
console.log('\nWrote ' + outPath);
