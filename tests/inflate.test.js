import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { gunzip } from '../src/core/inflate.js';

test('gunzip fallback decodes the embedded world pack exactly like zlib', () => {
  const b64 = readFileSync(new URL('../src/data/world.pack.b64', import.meta.url), 'utf8');
  const bin = Buffer.from(b64, 'base64');
  const ours = gunzip(new Uint8Array(bin));
  const ref = gunzipSync(bin);
  assert.equal(ours.length, ref.length);
  assert.ok(Buffer.from(ours).equals(ref));
});

test('gunzip handles stored, fixed and dynamic blocks', () => {
  const samples = [
    Buffer.alloc(0),
    Buffer.from('a'),
    Buffer.from('Следваща спирка Технически университет. '.repeat(200)),
    Buffer.from(Array.from({ length: 70000 }, (_, i) => (i * 7919) % 251)),
  ];
  for (const s of samples) {
    for (const level of [0, 1, 9]) {
      const out = gunzip(new Uint8Array(gzipSync(s, { level })));
      assert.ok(Buffer.from(out).equals(s), `level ${level}, ${s.length} bytes`);
    }
  }
});
