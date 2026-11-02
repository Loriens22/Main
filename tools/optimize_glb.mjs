// Shrinks a GLB exported from Blender for embedding in the single-file game: welds vertices, quantizes positions
// (14 bit), normals (8 bit) and the lightmap UVs (TEXCOORD_1, 12 bit) and compresses the buffers with meshopt
// (EXT_meshopt_compression, decoded in the game by three's MeshoptDecoder). TEXCOORD_0 (metres for the tiling
// materials, encoded into [0, 1] by herolib.py) is quantized to 16 bit as well.
//   node tools/optimize_glb.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, quantize, meshopt, dedup, prune, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const [src, dst] = process.argv.slice(2);
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const before = (await io.writeBinary(doc)).byteLength;
// texture coordinates only where the game uses them (HeroBuildings.js): UV0 for the tiled and drawn materials,
// the lightmap UVs for everything that takes the baked occlusion
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const name = (prim.getMaterial() && prim.getMaterial().getName()) || '';
    if (!/^(cw|lf|pn|sign):/.test(name) && prim.getAttribute('TEXCOORD_0')) prim.setAttribute('TEXCOORD_0', null);
    if (/^(int|glow|sign|glass):/.test(name) && prim.getAttribute('TEXCOORD_1')) prim.setAttribute('TEXCOORD_1', null);
  }
}
await doc.transform(
  dedup(),
  weld(),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  // the lightmap needs no more than 12 bits (a 2048 atlas), positions 14 (1-2 cm over a building), normals 8
  quantize({ pattern: /^TEXCOORD_1$/, quantizeTexcoord: 12 }),
  quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0)$/, quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 16 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  prune({ keepAttributes: true, keepLeaves: false }),
);
const out = await io.writeBinary(doc);
const fs = await import('node:fs');
fs.writeFileSync(dst, out);
let tris = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
console.log(`${dst}: ${(before / 1024).toFixed(0)} KB -> ${(out.byteLength / 1024).toFixed(0)} KB, ${tris} triangles`);
