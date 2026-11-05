// Pack every public/models/*.glb into a served JSON container: {format, encoding, bytes, sha256, data}.
// The artifact host serves JSON but not model/gltf-binary; the browser decodes base64 back to the exact GLB bytes.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../public/models/', import.meta.url).pathname;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.glb'))) {
  const buf = readFileSync(join(dir, f));
  const out = { format: 'glb', encoding: 'base64', bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), source: `blender/ -> ${f}`, data: buf.toString('base64') };
  writeFileSync(join(dir, `${f}.json`), JSON.stringify(out));
  console.log(`packed ${f}: ${(buf.length / 1048576).toFixed(2)} MB -> ${((out.data.length) / 1048576).toFixed(2)} MB json`);
}
