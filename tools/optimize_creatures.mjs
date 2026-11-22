// Compress the creature GLBs (skinned, baked skins) in place without touching their shape:
// positions and skin weights stay full float; normals, tangents, UVs and colours are quantised; then every
// buffer is meshopt-encoded (lossless byte coding, decoded on load by three's MeshoptDecoder).
//   node tools/optimize_creatures.mjs [path/to/creature.glb ...]   (default: every GLB under public/assets/creatures)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public/assets/creatures');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.glb') ? [path.join(d, e.name)] : []));
const files = process.argv.length > 2 ? process.argv.slice(2).map((f) => path.resolve(f)) : walk(root);
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
let total0 = 0, total1 = 0;
for (const f of files) {
  const before = fs.statSync(f).size;
  const doc = await io.read(f);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) { console.log(`  ${path.relative(root, f)} already compressed`); continue; }
  await doc.transform(
    dedup(),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ pattern: /^(NORMAL|TANGENT|TEXCOORD_\d+|COLOR_\d+)$/, quantizeNormal: 12, quantizeTexcoord: 14, quantizeColor: 8 }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(f, doc);
  const after = fs.statSync(f).size;
  total0 += before; total1 += after;
  console.log(`  ${path.relative(root, f)}  ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB`);
}
console.log(`total ${(total0 / 1e6).toFixed(1)} MB -> ${(total1 / 1e6).toFixed(1)} MB`);
