#!/usr/bin/env python3
"""Byte-split the final MP4 into <=14 MB parts + manifest. The page re-joins the
parts into one Blob, which is byte-identical to the original file."""
import hashlib, json, os, sys
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    if f.startswith('part-'):
        os.remove(os.path.join(out, f))
data = open(src, 'rb').read()
CH = 14 * 1024 * 1024
parts = []
for i in range(0, len(data), CH):
    name = f'part-{i // CH:02d}.bin'
    open(os.path.join(out, name), 'wb').write(data[i:i + CH])
    parts.append({'file': name, 'bytes': len(data[i:i + CH])})
json.dump({'name': os.path.basename(src), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'parts': parts}, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)
print('parts', len(parts), 'bytes', len(data))
