#!/usr/bin/env node
/* Validate every registered camera viewpoint: the eye must sit in air and
   have a clear line of sight, so no POI ends up jammed inside a wall or a
   flower pot. Reports the free distance ahead of each camera. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');

const sandbox = { console, Math, Object, Array, JSON, String, Number, Boolean,
  Uint8Array, Uint16Array, Int16Array, Int32Array, Float32Array, isNaN, parseInt, parseFloat };
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of ['blocks.js', 'world.js', 'builds/terrain.js', 'builds/poor.js', 'builds/bee.js',
  'builds/modern.js', 'builds/market.js', 'builds/sports.js', 'builds/plaza.js'])
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });

const W = ctx.World, BLOCKS = ctx.MCBlocks.BLOCKS;
ctx.BUILDERS.terrain();
for (const n of ['poor', 'bee', 'modern', 'market', 'sports', 'plaza']) ctx.BUILDERS[n]();

const R = Math.PI / 180;
let bad = 0;
console.log('viewpoint                     eye        clear  head  notes');
console.log('-'.repeat(74));
for (const p of W.pois) {
  const dx = Math.sin(p.yaw * R) * Math.cos(p.pitch * R);
  const dy = Math.sin(p.pitch * R);
  const dz = Math.cos(p.yaw * R) * Math.cos(p.pitch * R);
  const notes = [];

  const eye = BLOCKS[W.get(Math.round(p.x), Math.round(p.y), Math.round(p.z))];
  if (eye.opaque) notes.push('EYE INSIDE ' + eye.name);
  else if (!eye.air) notes.push('eye in ' + eye.name);

  // headroom: is there air immediately around the eye?
  let head = 0;
  for (const [ox, oy, oz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])
    if (!BLOCKS[W.get(Math.round(p.x)+ox, Math.round(p.y)+oy, Math.round(p.z)+oz)].opaque) head++;

  // free distance along the view ray
  let clear = 0, hit = '';
  for (let t = 0.5; t < 60; t += 0.5) {
    const hx = Math.round(p.x + dx*t), hy = Math.round(p.y + dy*t), hz = Math.round(p.z + dz*t);
    const b = BLOCKS[W.get(hx, hy, hz)];
    if (b.opaque) { hit = `${b.name}@${hx},${hy},${hz}`; break; }
    clear = t;
  }
  if (clear < 4) notes.push('BLOCKED by ' + hit);
  else if (clear < 7) notes.push('tight — ' + hit);
  if (head <= 2) notes.push('cramped');
  if (notes.some(n => /INSIDE|BLOCKED/.test(n))) bad++;

  console.log(
    p.label.padEnd(28) +
    `${p.x},${p.y},${p.z}`.padEnd(13) +
    String(clear.toFixed(1)).padStart(5) + '  ' +
    String(head).padStart(4) + '  ' + notes.join('; '));
}
console.log('-'.repeat(74));
console.log(W.pois.length + ' viewpoints, ' + bad + ' need fixing');
process.exit(bad ? 1 : 0);
