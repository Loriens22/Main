// Loads Blender GLB exports shipped as base64 JSON containers (see scripts/pack-models.mjs) and parses
// them with three's GLTFLoader. Promises are cached so every page shares one decoded scene per model.
import { use } from 'react';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map<string, Promise<GLTF>>();

export function loadGLB(path: string): Promise<GLTF> {
  if (!cache.has(path)) {
    const p = fetch(`${path}.json`)
      .then((r) => { if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); })
      .then((j: { data: string; bytes: number }) => {
        const bin = atob(j.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        if (bytes.length !== j.bytes) throw new Error(`${path}: size mismatch`);
        return new GLTFLoader().parseAsync(bytes.buffer, '');
      });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path)!;
}

/** Suspends until the model is ready (use inside <Suspense>). */
export function useGLB(path: string): GLTF {
  return use(loadGLB(path));
}
