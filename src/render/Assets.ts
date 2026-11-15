import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { MaterialLibrary } from './Materials';

const MODEL_BASE = 'assets/models/';
/** content hash of each model at build time (vite.config.ts): the URL changes when the file does, so a browser or CDN
 * never pairs a new build with a cached older model, and an unchanged model stays cached across releases */
declare const __MODEL_HASHES__: Record<string, string>;
const MODEL_HASHES: Record<string, string> = typeof __MODEL_HASHES__ === 'object' ? __MODEL_HASHES__ : {};
/** a failed download is tried again this many times (a dropped mobile connection, a CDN hiccup during a release) */
const MODEL_RETRIES = 2;

export function modelUrl(name: string, attempt = 0) {
  const h = MODEL_HASHES[name];
  const q = [h ? `h=${h}` : '', attempt ? `retry=${attempt}` : ''].filter(Boolean).join('&');
  return MODEL_BASE + name + '.glb' + (q ? `?${q}` : '');
}

export interface ModelInstance {
  root: THREE.Object3D;
  /** named nodes (first occurrence wins) */
  nodes: Map<string, THREE.Object3D>;
  /** collider descriptions extracted from COL_* boxes / col=mesh nodes (in root space) */
  colliders: ColliderDesc[];
  interactables: THREE.Object3D[];
  screens: THREE.Mesh[];
  animations: THREE.AnimationClip[];
}

export interface ColliderDesc {
  kind: 'box' | 'mesh';
  node: THREE.Object3D;
  /** box: half extents in node-local space */
  half?: THREE.Vector3;
  /** box centre in node-local space */
  center?: THREE.Vector3;
  geometry?: THREE.BufferGeometry;
  exterior: boolean;
  door?: string;
}

export class Assets {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<GLTF>>();
  onProgress: ((name: string, done: number, total: number) => void) | null = null;
  private pending = 0;
  private finished = 0;

  constructor(private materials: MaterialLibrary) {}

  load(name: string): Promise<GLTF> {
    let p = this.cache.get(name);
    if (!p) {
      this.pending++;
      p = new Promise<GLTF>((resolve, reject) => {
        const attempt = (n: number) =>
          this.loader.load(
            modelUrl(name, n),
            (g) => {
              this.materials.upgrade(g.scene);
              this.finished++;
              this.onProgress?.(name, this.finished, this.pending);
              resolve(g);
            },
            undefined,
            (e) => {
              if (n < MODEL_RETRIES) {
                console.warn(`[assets] ${name}: download failed, trying again`, e);
                setTimeout(() => attempt(n + 1), 1500 * (n + 1));
                return;
              }
              this.finished++;
              console.error(`[assets] failed to load ${name}`, e);
              this.cache.delete(name); // a later request starts afresh
              reject(e);
            },
          );
        attempt(0);
      });
      this.cache.set(name, p);
    }
    return p;
  }

  async preload(names: string[]) {
    await Promise.all(names.map((n) => this.load(n).catch(() => null)));
  }

  /** Clone a loaded model (geometry/materials shared) and index its named parts. */
  async instance(name: string): Promise<ModelInstance> {
    const g = await this.load(name);
    const root = SkeletonUtils.clone(g.scene);
    return indexModel(root, g.animations);
  }
}

export function indexModel(root: THREE.Object3D, animations: THREE.AnimationClip[] = []): ModelInstance {
  const nodes = new Map<string, THREE.Object3D>();
  const colliders: ColliderDesc[] = [];
  const interactables: THREE.Object3D[] = [];
  const screens: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  const toRemove: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!nodes.has(o.name)) nodes.set(o.name, o);
    const ud = o.userData;
    if (o.name.startsWith('COL_') || ud.col === 'box' || ud.col === 'mesh') {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const geo = mesh.geometry;
        geo.computeBoundingBox();
        const bb = geo.boundingBox!;
        const kind = ud.col === 'mesh' ? 'mesh' : 'box';
        colliders.push({
          kind,
          node: o,
          half: bb.getSize(new THREE.Vector3()).multiplyScalar(0.5),
          center: bb.getCenter(new THREE.Vector3()),
          geometry: kind === 'mesh' ? geo : undefined,
          exterior: !!ud.exterior,
          door: ud.door,
        });
        if (o.name.startsWith('COL_')) {
          mesh.visible = false;
          (mesh as any).isCollisionProxy = true;
        }
      } else if (o.children.length) {
        // multi-primitive node: glTF exporter wraps meshes as children
        o.children.forEach((c) => {
          const cm = c as THREE.Mesh;
          if (cm.isMesh && o.name.startsWith('COL_')) cm.visible = false;
        });
      }
    }
    if (ud.interact && ud.interact !== 'none') interactables.push(o);
    if (ud.screen) screens.push(o as THREE.Mesh);
  });
  toRemove.forEach((o) => o.removeFromParent());
  return { root, nodes, colliders, interactables, screens, animations };
}

/** World-space (relative to `space`) transform of a node. */
export function nodeMatrixIn(node: THREE.Object3D, space: THREE.Object3D, out = new THREE.Matrix4()) {
  space.updateWorldMatrix(true, false);
  node.updateWorldMatrix(true, false);
  return out.copy(space.matrixWorld).invert().multiply(node.matrixWorld);
}
