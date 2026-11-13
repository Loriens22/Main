// Compress exported GLBs in place: dedup + vertex quantisation + meshopt compression.
// Node names, hierarchy, empties (markers) and extras are preserved.
//   node tools/optimize_glb.mjs [name ...]      (default: every *.glb in public/assets/models)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, quantize, reorder, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('public/assets/models');
const names = process.argv.slice(2);
const files = (names.length ? names.map((n) => n.replace(/\.glb$/, '') + '.glb') : fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))).map((f) => path.join(dir, f));
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
for (const f of files) {
  const before = fs.statSync(f).size;
  const doc = await io.read(f);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) {
    console.log(`  ${path.basename(f)} already compressed`);
    continue;
  }
  await doc.transform(
    dedup(),
    reorder({ encoder: MeshoptEncoder, level: 'medium' }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14, quantizeColor: 8 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(f, doc);
  const after = fs.statSync(f).size;
  console.log(`  ${path.basename(f)}  ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB`);
}
