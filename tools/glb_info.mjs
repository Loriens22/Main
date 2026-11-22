import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const r = doc.getRoot();
  let tex = 0, acc = 0;
  const tl = r.listTextures().map((t) => { const b = t.getImage()?.byteLength || 0; tex += b; return `${t.getName()}:${t.getMimeType()}:${t.getSize()?.join('x')}:${(b / 1e6).toFixed(2)}MB`; });
  for (const a of r.listAccessors()) acc += a.getArray()?.byteLength || 0;
  const tris = r.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((q, p) => q + (p.getIndices()?.getCount() || 0) / 3, 0), 0);
  console.log(f.split('/').slice(-2).join('/'), `tex ${(tex / 1e6).toFixed(1)}MB acc ${(acc / 1e6).toFixed(1)}MB tris ${tris} anims ${r.listAnimations().length} skins ${r.listSkins().length}`);
  console.log('   ', tl.join('  '));
}
