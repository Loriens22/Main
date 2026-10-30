import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { litMeshes, lightmapLayout, lightmapSignature, variantOf } from '../src/vehicle/BusLightmap.js';

// a small stand-in for a bus model: a section with one parts group (box, mirrored tube, floor) and a door pivot
function model(shift = 0) {
  const root = new THREE.Group();
  const sec = new THREE.Group();
  root.add(sec);
  const parts = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial();
  const add = (g, x) => {
    const m = new THREE.Mesh(g.toNonIndexed(), mat);
    m.position.x = x;
    parts.add(m);
  };
  add(new THREE.BoxGeometry(2.5, 3, 12), shift);
  add(new THREE.CylinderGeometry(0.02, 0.02, 2, 8), 0.7);
  add(new THREE.PlaneGeometry(2.4, 11).rotateX(-Math.PI / 2), 0);
  parts.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhysicalMaterial({ transparent: true })));
  sec.add(parts);
  const pivot = new THREE.Group();
  pivot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.05).toNonIndexed(), mat));
  sec.add(pivot);
  return { root, quality: 'high' };
}

test('baked meshes: the opaque meshes of the parts groups, not the moving or transparent ones', () => {
  const m = model();
  const lit = litMeshes(m);
  assert.equal(lit.length, 3);
  assert.ok(lit.every((x) => !x.material.transparent));
});

test('the lightmap layout is deterministic, inside the atlas and clear of the reserved white block', () => {
  const a = lightmapLayout(litMeshes(model()), 512);
  const b = lightmapLayout(litMeshes(model()), 512);
  assert.equal(a.signature, b.signature);
  assert.equal(a.scale, b.scale);
  a.uvs.forEach((uv, i) => assert.deepEqual(Array.from(uv), Array.from(b.uvs[i])));
  for (const uv of a.uvs) {
    for (let i = 0; i < uv.length; i += 2) {
      assert.ok(uv[i] > 0 && uv[i] < 1 && uv[i + 1] > 0 && uv[i + 1] < 1);
      assert.ok(!(uv[i] * 512 < 8 && uv[i + 1] * 512 < 8), 'no chart in the white block');
    }
  }
  assert.ok(a.scale > 5, `scale ${a.scale}`);
});

test('a changed model no longer matches the baked signature', () => {
  assert.notEqual(lightmapSignature(litMeshes(model(0))), lightmapSignature(litMeshes(model(0.05))));
});

test('detail levels: ultra and high share the full geometry, balanced and low have their own', () => {
  assert.equal(variantOf('ultra'), 'full');
  assert.equal(variantOf('high'), 'full');
  assert.equal(variantOf('balanced'), 'balanced');
  assert.equal(variantOf('low'), 'low');
});
