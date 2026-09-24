// Shared helpers to turn an SDFBuilder program into a renderable mesh for
// non-humanoid generators (creatures, sculptures, robots, blobs...).

import * as THREE from 'three';
import { extractSDFMesh } from '../../core/sdf.js';
import { noise } from '../../core/noise.js';

// Box-projected UVs (metres) chosen per vertex by dominant normal axis.
export function boxProjectUV(pos, nor, scale = 1) {
  const n = pos.length / 3;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const nx = Math.abs(nor[i * 3]), ny = Math.abs(nor[i * 3 + 1]), nz = Math.abs(nor[i * 3 + 2]);
    const x = pos[i * 3] * scale, y = pos[i * 3 + 1] * scale, z = pos[i * 3 + 2] * scale;
    if (ny >= nx && ny >= nz) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else if (nx >= nz) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  return uv;
}

// mesh (from extractSDFMesh) -> BufferGeometry with material groups in matOrder.
export function sdfGeometry(mesh, sdf, matOrder, opts = {}) {
  const n = mesh.vertexCount;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(opts.uvs || boxProjectUV(mesh.positions, mesh.normals, opts.uvScale || 1), 2));
  if (mesh.skinIndex && opts.skin) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(mesh.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(mesh.skinWeight, 4));
  }
  const col = new Float32Array(n * 3);
  const aoPow = opts.aoPow ?? 1.2, aoMin = opts.aoMin ?? 0.2;
  for (let i = 0; i < n; i++) {
    let a = mesh.ao ? Math.pow(mesh.ao[i], aoPow) * (1 - aoMin) + aoMin : 1;
    let r = a, gg = a, b = a;
    if (opts.colorFn) { const c = opts.colorFn(i, mesh, sdf.prims[mesh.dominant[i]]); r *= c[0]; gg *= c[1]; b *= c[2]; }
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const idx = mesh.indices;
  const tri = idx.length / 3;
  const matIndex = new Map(matOrder.map((m, i) => [m, i]));
  const buckets = matOrder.map(() => []);
  for (let t = 0; t < tri; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    const pa = sdf.prims[mesh.dominant[a]], pb = sdf.prims[mesh.dominant[b]], pc = sdf.prims[mesh.dominant[c]];
    let m;
    if (pa.mat === pb.mat || pa.mat === pc.mat) m = pa.mat;
    else if (pb.mat === pc.mat) m = pb.mat;
    else m = [pa, pb, pc].sort((x, y) => (y.priority || 0) - (x.priority || 0))[0].mat;
    buckets[matIndex.has(m) ? matIndex.get(m) : 0].push(a, b, c);
  }
  const all = [];
  let start = 0;
  buckets.forEach((bk, i) => { if (bk.length) { g.addGroup(start, bk.length, i); start += bk.length; for (const x of bk) all.push(x); } });
  g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(all) : new Uint16Array(all), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// Compile + extract + convert in one go.
export function* sdfToGeometry(sdf, ctx, opts) {
  sdf.compile(noise);
  const mesh = yield* extractSDFMesh(sdf, { voxel: opts.voxel, skin: !!opts.skin, boneCount: opts.boneCount || 1, sigma: opts.sigma || opts.voxel * 2, aoScale: opts.aoScale || opts.voxel * 6, bounds: opts.bounds, onProgress: opts.onProgress, refine: opts.refine }, ctx);
  return { geometry: sdfGeometry(mesh, sdf, opts.matOrder || [0], opts), mesh };
}
