// Node smoke test: runs the bundle headlessly (no rendering), executes all
// registered builds, reports errors, per-build block deltas, out-of-region
// writes, and unknown-block warnings. Usage:
//   node spawnhub/build.mjs [outdir] && node spawnhub/test/smoke.mjs [outdir]
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || 'dist';
const code = readFileSync(join(root, outDir, 'bundle.js'), 'utf8');
(0, eval)(code); // document undefined -> engine boot skipped

const SH = globalThis.SpawnHub;
const W = SH.W;
const only = process.argv[3];

let prev = 0;
function countBlocks() { let n = 0; const b = W.blocks; for (let i = 0; i < b.length; i++) if (b[i]) n++; return n; }

let failed = false;
const builds = globalThis.SpawnBuilds.list();
if (!builds.length) { console.log('NO BUILDS REGISTERED'); process.exit(1); }
for (const b of builds) {
  if (only && b.name !== only) continue;
  W._region = b.bounds; W._regionName = b.name;
  const t0 = Date.now();
  try {
    b.fn(W, SH.B);
    const n = countBlocks();
    console.log(`OK   ${b.name.padEnd(14)} order=${String(b.order).padEnd(3)} +${(n - prev).toLocaleString().padStart(9)} blocks  (${Date.now() - t0}ms)`);
    prev = n;
  } catch (e) {
    failed = true;
    console.log(`FAIL ${b.name}: ${e.stack}`);
  }
  W._region = null;
}
if (Object.keys(W._violations).length) {
  console.log('OUT-OF-REGION WRITES (should be ~0 except terrain/details):');
  for (const [k, v] of Object.entries(W._violations)) console.log('  ' + k + ': ' + v);
}
if (SH.warnings && SH.warnings.length) { console.log('WARNINGS:'); for (const w of SH.warnings) console.log('  ' + w); failed = true; }
console.log('total blocks:', prev.toLocaleString(), '| block types registered:', SH.BLOCKS.length);
process.exit(failed ? 1 : 0);
