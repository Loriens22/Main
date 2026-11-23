import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { materials } from './Materials';
import { patchWorldMaterial } from './patch';

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

  /** `clips`: the GLB's animations (authored in Blender; they bind to this instance's nodes by name) */
  constructor(public name: string, public root: THREE.Object3D, public clips: THREE.AnimationClip[] = []) {
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

  url(name: string) { return name.includes('/') ? `${import.meta.env.BASE_URL}assets/${name}.glb` : `${import.meta.env.BASE_URL}assets/models/${name}.glb`; }

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
      } else if (src.name.startsWith('cr_') || src.name.startsWith('crt')) {
        // a creature's own baked skin (colour, normal and roughness maps on its second UV set): kept, made organic
        // (no metalness) and given the shared world shading (fog, water, baked occlusion)
        const m = src as THREE.MeshStandardMaterial;
        m.metalness = 0;
        m.metalnessMap = null;
        // the vertex colours carry baked occlusion, read by the world shading itself
        m.vertexColors = false;
        m.roughness = 1;
        if (m.map) m.map.anisotropy = 8;
        if (m.normalMap) m.normalScale.set(1.15, 1.15);
        // the tissue's optical extras from the library (iridescent shells, velvety sheen, light organs)
        // (keyed by the baked material's own name in the library: 'cr_<creature>', or 'crt_<creature>' for its translucent tissue)
        const ex = materials.extras(src.name.replace(/^crt\d\d_/, 'crt_'));
        if (ex && (m as any).__phys) mesh.material = (m as any).__phys;
        else if (ex && !(m as any).__extras) {
          if (ex.emissive) { m.emissive = new THREE.Color(ex.emissive); m.emissiveIntensity = ex.emissiveIntensity ?? 1; m.emissiveMap = m.map; }
          if (ex.iridescence || ex.sheen) {
            const pm = new THREE.MeshPhysicalMaterial({
              name: m.name, map: m.map, normalMap: m.normalMap, normalScale: m.normalScale.clone(), roughnessMap: m.roughnessMap, roughness: m.roughness,
              metalness: 0, color: m.color.clone(), emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity, emissiveMap: m.emissiveMap,
              aoMap: m.aoMap, iridescence: ex.iridescence, iridescenceIOR: 1.6, iridescenceThicknessMinimum: 180, iridescenceThicknessMaximum: 620, sheen: ex.sheen, sheenRoughness: 0.5,
              sheenColor: new THREE.Color(1, 1, 1),
            });
            (pm as any).__extras = true;
            (m as any).__phys = pm;
            mesh.material = pm;
          } else (m as any).__extras = true;
        }
        const mm = mesh.material as THREE.MeshStandardMaterial;
        if (!(mm as any).__patched) { patchWorldMaterial(mm, { wear: 0, dirt: 0, dust: 0 }, { vao: hasAO }); (mm as any).__patched = true; }
        const tr = /^crt(\d\d)_/.exec(src.name);
        if (tr) {
          const m = mm;
          // translucent tissue (fins, membranes, glassy bodies): the baked maps seen through
          m.transparent = true; m.opacity = Number(tr[1]) / 100; m.depthWrite = false; m.side = THREE.DoubleSide;
          mesh.renderOrder = 10;
        }
        mesh.castShadow = flags.shadow !== 0 && !tr;
        mesh.receiveShadow = true;
        mesh.userData.__collide = false;
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
    return new Model(name, group, g.animations);
  }
}

function pick(u: Record<string, any>) {
  const o: Record<string, any> = {};
  for (const k of ['colonly', 'col', 'hascol', 'shadow', 'dynamic']) if (k in u) o[k] = u[k];
  return o;
}

export const assets = new AssetManager();
