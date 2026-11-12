import * as THREE from 'three';
import DB from '../../shared/materials.json';
import { patchWorldMaterial, SurfaceParams } from './patch';

interface MatSpec {
  tex?: string;
  tile?: number;
  color?: string;
  rough?: number;
  metal?: number;
  kind?: 'glass';
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  alphaTest?: number;
  side?: 'double';
  uvMode?: 'native';
}

const SPECS = DB as unknown as Record<string, MatSpec>;
const TEX_URL = (set: string, map: string) => `${import.meta.env.BASE_URL}assets/textures/${set}_${map}.webp`;

/** Per texture-set surface behaviour: how baked convexity / cavity data is used. */
const SURFACE: Record<string, SurfaceParams> = {
  metal_painted: { wear: 0.75, dirt: 0.75, edgeColor: 0x8f9194 },
  metal_bare: { wear: 0.25, dirt: 0.7, edgeColor: 0xdcdfe2 },
  metal_dark: { wear: 0.6, dirt: 0.6, edgeColor: 0xa8abae },
  rust: { wear: 0.2, dirt: 0.8, edgeColor: 0x8a4a22 },
  corrugated: { wear: 0.2, dirt: 0.8, edgeColor: 0xb8bcc0 },
  tread_plate: { wear: 0.5, dirt: 0.8, edgeColor: 0xd0d3d6 },
  plastic_panel: { wear: 0.35, dirt: 0.8, edgeColor: 0xf2f1ec },
  hull_white: { wear: 0.3, dirt: 0.9, edgeColor: 0x8f9296 },
  hull_blanket: { wear: 0.0, dirt: 0.9 },
  hull_black: { wear: 0.55, dirt: 0.5, edgeColor: 0x9a9da2 },
  hull_tiles: { wear: 0.4, dirt: 0.5, edgeColor: 0x7d7f83 },
  radiator: { wear: 0.4, dirt: 0.6, edgeColor: 0x9a9da2 },
  thruster_metal: { wear: 0.2, dirt: 0.6, edgeColor: 0xc8cacc },
  siding_white: { wear: 0.35, dirt: 0.9, edgeColor: 0x7c766a },
  wood_painted: { wear: 0.45, dirt: 0.9, edgeColor: 0x8b8475 },
  wood_planks: { wear: 0.2, dirt: 0.9, edgeColor: 0xb3a995 },
  floor_wood: { wear: 0.3, dirt: 0.8, edgeColor: 0xb89a74 },
  concrete: { wear: 0.25, dirt: 0.9, edgeColor: 0xb5b3ad },
  concrete_panels: { wear: 0.25, dirt: 0.9, edgeColor: 0xb5b3ad },
  floor_panel: { wear: 0.5, dirt: 0.8, edgeColor: 0xc4c7ca },
  padding: { wear: 0.0, dirt: 0.7 },
  tile_white: { wear: 0.0, dirt: 0.9 },
};

/**
 * Builds and caches shared PBR materials from shared/materials.json.
 * Two flavours per name: with and without baked vertex AO (geometry-dependent).
 */
export class MaterialLibrary {
  private cache = new Map<string, THREE.Material>();
  private texBase = new Map<string, THREE.Texture>();
  private texVariants = new Map<string, THREE.Texture>();
  private loader = new THREE.TextureLoader();
  anisotropy = 8;
  envIntensity = 1.0;

  has(name: string) { return name in SPECS; }

  private tex(set: string, map: 'albedo' | 'normal' | 'orm', tile: number): THREE.Texture {
    const baseKey = `${set}_${map}`;
    const key = `${baseKey}@${tile}`;
    const hit = this.texVariants.get(key);
    if (hit) return hit;
    let base = this.texBase.get(baseKey);
    const configure = (t: THREE.Texture) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.anisotropy;
      t.colorSpace = map === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.repeat.set(1 / tile, 1 / tile);
    };
    if (!base) {
      const clones: THREE.Texture[] = [];
      base = this.loader.load(TEX_URL(set, map), () => { for (const c of clones) c.needsUpdate = true; });
      (base as any).__clones = clones;
      this.texBase.set(baseKey, base);
      configure(base);
      this.texVariants.set(key, base);
      (base as any).__tile = tile;
      return base;
    }
    const c = base.clone();
    configure(c);
    ((base as any).__clones as THREE.Texture[]).push(c);
    if (base.image) c.needsUpdate = true;
    this.texVariants.set(key, c);
    return c;
  }

  setAnisotropy(a: number) {
    this.anisotropy = a;
    for (const t of this.texVariants.values()) { t.anisotropy = a; t.needsUpdate = !!t.image; }
  }

  /** Get the shared material for a glTF material name. `vao` selects the baked-AO shader variant. */
  get(name: string, vao = false): THREE.Material {
    const key = name + (vao ? '|ao' : '');
    const hit = this.cache.get(key);
    if (hit) return hit;
    const spec = SPECS[name];
    let m: THREE.Material;
    if (!spec) {
      m = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.7 });
      console.warn(`[materials] unknown material "${name}"`);
    } else if (spec.kind === 'glass') {
      const g = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(spec.color ?? '#ffffff'), roughness: spec.rough ?? 0.05, metalness: spec.metal ?? 0.0,
        transparent: true, opacity: spec.opacity ?? 0.25, depthWrite: false, side: THREE.DoubleSide,
        envMapIntensity: 1.4, specularIntensity: 1.0, ior: 1.5,
      });
      m = patchWorldMaterial(g, { glass: true, dust: 1, dirt: 0 }, { vao: false });
    } else {
      const tile = spec.uvMode === 'native' ? 1 : spec.tile ?? 1;
      const p: THREE.MeshStandardMaterialParameters = {
        color: new THREE.Color(spec.color ?? '#ffffff'),
        roughness: spec.tex ? spec.rough ?? 1.0 : spec.rough ?? 0.6,
        metalness: spec.tex ? spec.metal ?? 1.0 : spec.metal ?? 0.0,
      };
      if (spec.tex) {
        p.map = this.tex(spec.tex, 'albedo', tile);
        p.normalMap = this.tex(spec.tex, 'normal', tile);
        const orm = this.tex(spec.tex, 'orm', tile);
        p.roughnessMap = orm;
        p.metalnessMap = orm;
        p.aoMap = orm;
        p.aoMapIntensity = 0.8;
      }
      if (spec.emissive) {
        p.emissive = new THREE.Color(spec.emissive);
        p.emissiveIntensity = spec.emissiveIntensity ?? 1;
      }
      if (spec.alphaTest) { p.alphaTest = spec.alphaTest; }
      if (spec.side === 'double') p.side = THREE.DoubleSide;
      const sm = new THREE.MeshStandardMaterial(p);
      if (p.roughness! > 1) { sm.roughness = 1; }
      const surf = { ...(spec.tex ? SURFACE[spec.tex] : undefined) };
      if (spec.emissive) { surf.dust = 0; surf.dirt = 0; }
      m = patchWorldMaterial(sm, surf, { vao });
    }
    m.name = name;
    this.cache.set(key, m);
    return m;
  }

  /** A private (unshared) copy, for parts whose appearance animates (screens, indicator lamps...). */
  unique(name: string, vao = false): THREE.Material {
    const src = this.get(name, vao) as THREE.MeshStandardMaterial;
    const c = src.clone();
    c.onBeforeCompile = src.onBeforeCompile;
    c.customProgramCacheKey = src.customProgramCacheKey;
    c.defines = { ...(src as any).defines };
    c.name = name;
    return c;
  }

  all() { return this.cache.values(); }
}

export const materials = new MaterialLibrary();
