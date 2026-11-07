// Hero buildings modelled in Blender (tools/blender/hero/*.py): Bulgaria Mall, Billa, Millennium Center, the bTV
// tower and the NDK, each a GLB (quantized + meshopt) with a baked ambient-occlusion map on its second UV set.
// The material NAMES in the GLB say what the game puts on each surface (tools/blender/hero/herolib.py):
//   cw:<preset>  curtain wall with lit windows at night    lf:<kind>:<#hex>  tiling stone / concrete
//   pn:<preset>  panel cladding with joints                lit:<id>          plain by day, floodlit at night
//   sign:<id>    sign drawn here                          glow:<id>         emissive at night
//   glass:<id>   transparent glazing                      water             fountain water
//   std:<id>     the GLB's own colour / roughness / metalness
// Tiling materials get their UV0 (metres) divided by the texture's tile size; every material is a per-building
// clone carrying that building's AO map (uv1).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { curtainTexture, panelTexture } from './LandmarkGeometry.js';
import { signMat } from './LandmarkInstitutionsKit.js';
import HEROES from '../data/hero/index.js';
import { HERO_SIGNS, HERO_CURTAINS, HERO_GLOW, HERO_INTERIOR, HERO_PANELS } from './HeroStyle.js';

const UV_RANGE = 1024, SIGN_UV = 100; // tools/blender/hero/herolib.py

/** Hero buildings of each line. */
export const HERO_LINES = { 7: ['mall', 'billa', 'millennium', 'btv', 'ndk'], 9: ['nevsky', 'ndk', 'millennium', 'btv'], 84: ['nevsky', 'airport'] };

async function decodeAo(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const tex = new THREE.Texture(img);
    tex.channel = 1;
    tex.colorSpace = THREE.SRGBColorSpace; // stored sRGB-encoded, sampled linear
    tex.flipY = false; // glTF UV convention
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Parses the GLBs and AO maps of a line's hero buildings: { name: { scene, ao, meta } }. */
export async function loadHeroes(line) {
  const names = (HERO_LINES[line] || []).filter((n) => HEROES[n]);
  if (!names.length) return {};
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  await Promise.all(names.map(async (n) => {
    try {
      const { glb, ao, meta } = HEROES[n];
      const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
      const [gltf, tex] = await Promise.all([loader.parseAsync(buf, ''), ao ? decodeAo(ao) : null]);
      out[n] = { scene: gltf.scene, ao: tex, meta };
    } catch (e) {
      console.warn(`hero ${n} unavailable`, e);
    }
  }));
  return out;
}

const WATER = () => new THREE.MeshStandardMaterial({ color: 0x4f7f8e, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.86, envMapIntensity: 1.6 });

/** The game material for a GLB material name (one per building and name). */
function resolve(name, src, M, ao, cache) {
  if (cache.has(name)) return cache.get(name);
  const [kind, a, b] = name.split(':');
  let m = null, tile = null;
  if (kind === 'cw' && HERO_CURTAINS[a]) {
    const p = HERO_CURTAINS[a];
    const t = curtainTexture('hero:' + a, p.tex);
    m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, color: p.tint ?? 0xffffff, roughness: p.rough ?? 0.12, metalness: p.metal ?? 0.5, envMapIntensity: p.env ?? 1.2 });
    tile = [t.w, t.h];
    M.night.push(m);
  } else if (kind === 'pn' && HERO_PANELS[a]) {
    // panel cladding (metal sandwich panels, precast concrete): joints and tone variation, metres
    const p = HERO_PANELS[a];
    m = new THREE.MeshStandardMaterial({ map: panelTexture('hero:' + a, p.tex), roughness: p.rough ?? 0.6, metalness: p.metal ?? 0, envMapIntensity: p.env ?? 1 });
    tile = [p.tex.w, p.tex.h];
  } else if (kind === 'lf') {
    const key = M.lf(a, b);
    m = M.m[key].clone();
    tile = M.tile(key);
  } else if (kind === 'sign' && HERO_SIGNS[a]) {
    m = signMat(M, 'hero:' + a, HERO_SIGNS[a]);
    m.name = name;
    if (HERO_SIGNS[a].nightI) m.userData.nightI = HERO_SIGNS[a].nightI;
    cache.set(name, m);
    return m; // shared, drawn 0..1, no AO
  } else if (kind === 'glass') {
    m = new THREE.MeshPhysicalMaterial({ color: src.color, roughness: 0.04, metalness: 0.1, transparent: true, opacity: src.opacity < 1 ? src.opacity : 0.3, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 });
    cache.set(name, m);
    return m;
  } else if (kind === 'water') {
    m = WATER();
  } else if (kind === 'int') {
    // rooms behind shop glass: evenly lit by their own lamps, no ambient occlusion
    m = new THREE.MeshStandardMaterial({ color: src.color, roughness: 0.7, emissive: src.color, emissiveIntensity: HERO_INTERIOR.day });
    m.userData.nightI = HERO_INTERIOR.night;
    m.userData.dayI = HERO_INTERIOR.day;
    M.night.push(m);
    m.name = name;
    cache.set(name, m);
    return m;
  } else if (kind === 'lit') {
    // an ordinary surface by day (occlusion, shadows) that is lit at night: floodlit fins, lit pool floors
    const g = HERO_GLOW[a] || {};
    m = new THREE.MeshStandardMaterial({ color: src.color, roughness: src.roughness, metalness: src.metalness, emissive: g.color ?? 0xffffff, emissiveIntensity: 0 });
    m.userData.nightI = g.night ?? 0.8;
    m.userData.dayI = 0;
    M.night.push(m);
  } else if (kind === 'glow') {
    const g = HERO_GLOW[a] || {};
    m = new THREE.MeshStandardMaterial({ color: src.color, roughness: g.rough ?? 0.4, metalness: 0, emissive: g.color ?? src.color, emissiveIntensity: g.day ?? 0 });
    m.userData.nightI = g.night ?? 1.6;
    m.userData.dayI = g.day ?? 0;
    M.night.push(m);
  } else {
    m = new THREE.MeshStandardMaterial({ color: src.color, roughness: src.roughness, metalness: src.metalness, envMapIntensity: src.metalness > 0.5 ? 1.3 : 1 });
  }
  if (ao && kind !== 'glow') {
    m.aoMap = ao;
    m.aoMapIntensity = 1;
  }
  m.name = name;
  m.userData.tile = tile;
  cache.set(name, m);
  return m;
}

/**
 * A landmark item ({ meshes, x, z, tris }) for the hero `name` of `heroes` placed at its anchor, or null when
 * the hero is not loaded.
 */
export function heroItem(heroes, name, M) {
  const h = heroes && heroes[name];
  if (!h) return null;
  const root = h.scene;
  const cache = new Map();
  let tris = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    let mat = resolve(o.material.name, o.material, M, h.ao, cache);
    if (mat.aoMap && !o.geometry.attributes.uv1) {
      // a primitive exported without lightmap UVs: the same material without the AO map
      const key = mat.name + '#noao';
      if (!cache.has(key)) {
        const c = mat.clone();
        c.aoMap = null;
        c.userData = { ...mat.userData };
        if (M.night.includes(mat)) M.night.push(c);
        cache.set(key, c);
      }
      mat = cache.get(key);
    }
    o.material = mat;
    // UV0 left Blender as 0.5 + metres / UV_RANGE and the glTF exporter flipped v (1 - v): decode to metres (v
    // up, as the flipY canvas textures want), then to texture repeats. It arrives quantized (normalized
    // 16 bit), so it is replaced by a float attribute.
    const tile = mat.userData.tile || (/^sign:/.test(mat.name) ? [SIGN_UV, SIGN_UV] : null);
    const uv = o.geometry.attributes.uv;
    if (tile && uv && !o.geometry.userData.tiled) {
      const a = new Float32Array(uv.count * 2);
      for (let i = 0; i < uv.count; i++) {
        a[2 * i] = ((uv.getX(i) - 0.5) * UV_RANGE) / tile[0];
        a[2 * i + 1] = ((0.5 - uv.getY(i)) * UV_RANGE) / tile[1];
      }
      o.geometry.setAttribute('uv', new THREE.BufferAttribute(a, 2));
      o.geometry.userData.tiled = true;
    }
    const see = mat.transparent;
    o.castShadow = !see && !/^glow:|^sign:/.test(mat.name);
    o.receiveShadow = !see;
    if (see) o.renderOrder = 2;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  const [x, z] = h.meta.anchor;
  root.position.set(x, h.meta.base, z);
  root.updateMatrixWorld(true);
  root.traverse((o) => { o.matrixAutoUpdate = false; });
  root.name = `hero:${name}`;
  return { meshes: [root], x, z, tris: Math.round(tris) };
}
