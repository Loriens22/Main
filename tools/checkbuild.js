#!/usr/bin/env node
/* =====================================================================
   checkbuild.js  —  headless validator for a single builder file.

     node tools/checkbuild.js <name>            e.g.  node tools/checkbuild.js poor
     node tools/checkbuild.js <name> --slice 20 (vertical section at z=20)
     node tools/checkbuild.js all

   Reports: block count, palette used, out-of-bounds writes, blocks placed
   outside the builder's declared zone, floating-block audit, an ASCII
   top-down map and an ASCII vertical cross-section.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const ZONES = {
  poor: { x0: -64, z0: 4, x1: -30, z1: 42, ground: 34, label: 'Poor residential tower' },
  modern: { x0: 26, z0: -60, x1: 64, z1: -22, ground: 38, label: 'Modern high-rise complex' },
  bee: { x0: -16, z0: -50, x1: 14, z1: -24, ground: 40, label: 'Bee landmark' },
  market: { x0: 22, z0: -6, x1: 60, z1: 30, ground: 32, label: 'Market / shops' },
  sports: { x0: -26, z0: 38, x1: 16, z1: 74, ground: 32, label: 'Football pitch & playground' },
  plaza: { x0: -96, z0: -96, x1: 95, z1: 95, ground: 32, label: 'Plaza / landscaping' },
  terrain: { x0: -96, z0: -96, x1: 95, z1: 95, ground: 32, label: 'Terrain' },
};

function loadInto(ctx, file) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, ctx, { filename: file });
}

function run(names, opts) {
  const sandbox = { console, Math, Object, Array, JSON, String, Number, Boolean,
    Uint8Array, Uint16Array, Int16Array, Int32Array, Float32Array, isNaN, parseInt, parseFloat };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  loadInto(ctx, path.join(SRC, 'blocks.js'));
  loadInto(ctx, path.join(SRC, 'world.js'));
  loadInto(ctx, path.join(SRC, 'builds', 'terrain.js'));

  const W = ctx.World;
  const BLOCKS = ctx.MCBlocks.BLOCKS;

  ctx.BUILDERS.terrain();
  const afterTerrain = W.ids.slice();

  const results = [];
  for (const name of names) {
    if (name === 'terrain') continue;
    const f = path.join(SRC, 'builds', name + '.js');
    if (!fs.existsSync(f)) { console.error('!! missing ' + f); continue; }
    loadInto(ctx, f);
    if (!ctx.BUILDERS[name]) { console.error('!! ' + name + '.js did not register BUILDERS.' + name); continue; }
    W.resetOOB();
    const t0 = Date.now();
    try { ctx.BUILDERS[name](); }
    catch (e) { console.error('!! ' + name + ' threw: ' + e.stack); continue; }
    results.push({ name, ms: Date.now() - t0, oob: W.outOfBounds });
  }

  /* ---- diff against terrain --------------------------------------- */
  const zoneName = names.length === 1 ? names[0] : null;
  const zone = zoneName ? ZONES[zoneName] : null;

  let changed = 0, outside = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, minY = 1e9, maxY = -1e9;
  const used = new Map();
  const outsideSamples = [];

  for (let y = 0; y < W.SY; y++)
    for (let z = W.Z0; z < W.Z0 + W.SZ; z++)
      for (let x = W.X0; x < W.X0 + W.SX; x++) {
        const i = W.idx(x, y, z);
        if (W.ids[i] === afterTerrain[i]) continue;
        changed++;
        const id = W.ids[i];
        if (id) used.set(id, (used.get(id) || 0) + 1);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (zone && (x < zone.x0 || x > zone.x1 || z < zone.z0 || z > zone.z1)) {
          outside++;
          if (outsideSamples.length < 12) outsideSamples.push(`(${x},${y},${z}) ${BLOCKS[id] ? BLOCKS[id].name : 'AIR'}`);
        }
      }

  /* ---- floating block audit ---------------------------------------- */
  let floating = 0; const floatSamples = [];
  const bx0 = Math.max(W.X0 + 1, minX - 1), bx1 = Math.min(W.X0 + W.SX - 2, maxX + 1);
  const bz0 = Math.max(W.Z0 + 1, minZ - 1), bz1 = Math.min(W.Z0 + W.SZ - 2, maxZ + 1);
  for (let y = Math.max(1, minY); y <= Math.min(W.SY - 2, maxY); y++)
    for (let z = bz0; z <= bz1; z++)
      for (let x = bx0; x <= bx1; x++) {
        const i = W.idx(x, y, z);
        const id = W.ids[i];
        if (!id || W.ids[i] === afterTerrain[i]) continue;
        const d = BLOCKS[id];
        if (!d.opaque) continue;
        let n = 0;
        if (W.get(x + 1, y, z)) n++; if (W.get(x - 1, y, z)) n++;
        if (W.get(x, y + 1, z)) n++; if (W.get(x, y - 1, z)) n++;
        if (W.get(x, y, z + 1)) n++; if (W.get(x, y, z - 1)) n++;
        if (n === 0) { floating++; if (floatSamples.length < 10) floatSamples.push(`(${x},${y},${z}) ${d.name}`); }
      }

  /* ---- report ------------------------------------------------------- */
  console.log('='.repeat(66));
  for (const r of results) console.log(`builder ${r.name.padEnd(10)} ${String(r.ms).padStart(5)} ms   out-of-bounds writes: ${r.oob}`);
  console.log('-'.repeat(66));
  console.log(`blocks changed : ${changed}`);
  console.log(`bounds         : x ${minX}..${maxX}   y ${minY}..${maxY}   z ${minZ}..${maxZ}`);
  if (zone) {
    console.log(`declared zone  : x ${zone.x0}..${zone.x1}   z ${zone.z0}..${zone.z1}   ground y=${zone.ground}`);
    console.log(`outside zone   : ${outside} ${outside ? '  <-- FIX THESE' : 'OK'}`);
    outsideSamples.forEach(s => console.log('      ' + s));
  }
  console.log(`isolated blocks: ${floating}${floating ? '  (check these are intentional)' : ''}`);
  floatSamples.forEach(s => console.log('      ' + s));
  console.log(`palette used   : ${used.size} distinct block types`);
  const top = [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)
    .map(([id, n]) => `${BLOCKS[id].name}:${n}`).join('  ');
  console.log('   ' + top);
  console.log(`markers        : ${W.markers.length}    POIs: ${W.pois.length}`);
  W.pois.forEach(p => console.log(`      POI "${p.label}" @ ${p.x},${p.y},${p.z}`));

  /* ---- ASCII top-down ------------------------------------------------ */
  if (minX < 1e8) {
    const CH = ' .:-=+*#%@';
    console.log('\nTOP-DOWN (height above ground, x ->, z v)');
    const stepX = Math.max(1, Math.ceil((maxX - minX + 1) / 96));
    const stepZ = Math.max(1, Math.ceil((maxZ - minZ + 1) / 48));
    for (let z = minZ; z <= maxZ; z += stepZ) {
      let line = '';
      for (let x = minX; x <= maxX; x += stepX) {
        let top = -1;
        for (let y = W.SY - 1; y >= 0; y--) { if (W.get(x, y, z)) { top = y; break; } }
        const base = zone ? zone.ground : 32;
        const rel = top - base;
        line += rel <= 0 ? '.' : CH[Math.min(9, Math.max(1, Math.round(rel / 4)))];
      }
      console.log('  ' + line);
    }
  }

  /* ---- ASCII cross-section ------------------------------------------- */
  const sliceZ = opts.slice !== undefined ? opts.slice : Math.round((minZ + maxZ) / 2);
  if (minX < 1e8) {
    console.log(`\nCROSS-SECTION at z=${sliceZ} (y up, x ->)`);
    for (let y = Math.min(W.SY - 1, maxY + 1); y >= Math.max(0, minY - 1); y--) {
      let line = '';
      for (let x = minX; x <= maxX; x++) {
        const id = W.get(x, y, sliceZ);
        if (!id) { line += ' '; continue; }
        const d = BLOCKS[id];
        line += d.light > 6 ? '*' : d.opaque ? '#' : d.shape === 'full' ? 'o' : '-';
      }
      console.log(String(y).padStart(3) + '|' + line);
    }
  }
  console.log('='.repeat(66));
}

const argv = process.argv.slice(2);
const opts = {};
const names = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--slice') { opts.slice = parseInt(argv[++i], 10); }
  else names.push(argv[i]);
}
if (!names.length) names.push('all');
if (names[0] === 'all') {
  const all = fs.readdirSync(path.join(SRC, 'builds')).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
  run(all.filter(n => n !== 'terrain'), opts);
} else run(names, opts);
