import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { materials } from './Materials';

export interface Marker {
  kind: string;
  id: string;
  node: THREE.Object3D;
  data: Record<string, any>;
}

/** An instantiated GLB: scene graph + semantic markers authored in Blender (custom props -> userData). */
export class Model {
  markers: Marker[] = [];
  /** meshes that should generate collision (visible static geometry and dedicated collision hulls) */
  colliders: THREE.Mesh[] = [];
  private byId = new Map<string, THREE.Object3D>();

  constructor(public name: string, public root: THREE.Object3D) {
    root.traverse((o) => {
      const u = o.userData;
      if (u.kind && u.id !== undefined) {
        this.markers.push({ kind: u.kind, id: String(u.id), node: o, data: u });
        this.byId.set(`${u.kind}:${u.id}`, o);
      }
      if (u.part) this.byId.set(`part:${u.part}`, o);
      if ((o as THREE.Mesh).isMesh && u.__collide) this.colliders.push(o as THREE.Mesh);
    });
  }

  ofKind(kind: string) { return this.markers.filter((m) => m.kind === kind); }
  marker(kind: string, id: string) { return this.markers.find((m) => m.kind === kind && m.id === id); }
  /** A named movable part (Blender custom prop `part`). */
  part(id: string) { return this.byId.get(`part:${id}`); }
  node(kind: string, id: string) { return this.byId.get(`${kind}:${id}`); }

  /** World-space pose of a marker. */
  markerPose(kind: string, id: string, pos = new THREE.Vector3(), quat = new THREE.Quaternion()) {
    const n = this.node(kind, id);
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    n.matrixWorld.decompose(pos, quat, _s);
    return { pos, quat };
  }
}

const _s = new THREE.Vector3();

class AssetManager {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<GLTF>>();
  shadowsEnabled = true;

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  url(name: string) { return `${import.meta.env.BASE_URL}assets/models/${name}.glb`; }

  private loadRaw(name: string): Promise<GLTF> {
    let p = this.cache.get(name);
    if (!p) {
      p = this.loader.loadAsync(this.url(name)).then((g) => { this.prepare(g.scene); return g; });
      this.cache.set(name, p);
    }
    return p;
  }

  preload(names: string[]) { return Promise.all(names.map((n) => this.loadRaw(n))); }

  /** Swap exported materials for shared library materials and resolve authoring flags. Runs once per GLB. */
  private prepare(scene: THREE.Object3D) {
    scene.traverse((o) => {
      // glTF nodes with several material slots become a Group of primitive meshes: inherit node flags.
      const flags = { ...(o.parent && (o.parent as any).__flags), ...pick(o.userData) };
      (o as any).__flags = flags;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const colonly = !!flags.colonly;
      const src = mesh.material as THREE.Material;
      const hasAO = !!mesh.geometry.attributes.color;
      if (colonly) {
        mesh.visible = false;
        mesh.userData.__collide = true;
      } else {
        mesh.material = materials.get(src.name, hasAO);
        const transparent = (mesh.material as THREE.Material).transparent;
        mesh.castShadow = !transparent && flags.shadow !== 0;
        mesh.receiveShadow = !transparent;
        mesh.userData.__collide = flags.col !== 0 && !flags.hascol;
        if (transparent) mesh.renderOrder = 10;
      }
      if (flags.dynamic) mesh.userData.__collide = false;
      // Quantised / compressed meshes keep exact bounds from the accessor min/max.
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    });
  }

  async load(name: string): Promise<Model> {
    const g = await this.loadRaw(name);
    let hasSkin = false;
    g.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasSkin = true; });
    const root = hasSkin ? SkeletonUtils.clone(g.scene) : g.scene.clone(true);
    const group = new THREE.Group();
    group.name = name;
    group.add(root);
    return new Model(name, group);
  }
}

function pick(u: Record<string, any>) {
  const o: Record<string, any> = {};
  for (const k of ['colonly', 'col', 'hascol', 'shadow', 'dynamic']) if (k in u) o[k] = u[k];
  return o;
}

export const assets = new AssetManager();
