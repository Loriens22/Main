#!/usr/bin/env node
/* Concatenates src/*.js (filename order) + the inlined Three.js IIFE into a
 * single self-contained dist/steve.html. No network, no external assets. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'steve.html');

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
if (!files.length) { console.error('no sources'); process.exit(1); }

let game = '';
let missing = [];
for (const f of files) {
  const p = path.join(SRC, f);
  const code = fs.readFileSync(p, 'utf8');
  game += `\n/* ===== ${f} ${'='.repeat(Math.max(0, 62 - f.length))} */\n`;
  game += code;
  if (!code.trim()) missing.push(f);
}

const three = fs.readFileSync(path.join(ROOT, 'build', 'three.inline.js'), 'utf8');
let shell = fs.readFileSync(path.join(ROOT, 'build', 'shell.html'), 'utf8');

// Guard: nothing in the payload may close the script tag early.
for (const [name, body] of [['three', three], ['game', game]]) {
  if (/<\/script/i.test(body)) {
    console.error(`FATAL: literal </script> found in ${name} payload`);
    process.exit(1);
  }
}

shell = shell.replace('/*__THREE__*/', () => three);
shell = shell.replace('/*__GAME__*/', () => game);

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(OUT, shell);

const kb = (shell.length / 1024).toFixed(0);
console.log(`built ${OUT}`);
console.log(`  sources : ${files.length} (${files.join(', ')})`);
console.log(`  three   : ${(three.length / 1024).toFixed(0)} KB`);
console.log(`  game    : ${(game.length / 1024).toFixed(0)} KB`);
console.log(`  total   : ${kb} KB`);
if (missing.length) console.warn(`  EMPTY   : ${missing.join(', ')}`);
