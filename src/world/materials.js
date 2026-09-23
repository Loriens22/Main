// Shared world materials (created once after textures are generated).
import * as THREE from 'three';
import * as TX from '../textures.js';

export const WM = {};
export const WT = {};

/** Injects large-scale world-space tint variation to hide texture tiling. */
function macro(mat, scale = 0.012, amount = 0.22, seed = 0) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.macroScale = { value: scale };
    sh.uniforms.macroAmt = { value: amount };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform float macroScale; uniform float macroAmt;
float mhash(vec2 p){ return fract(sin(dot(p, vec2(127.1 + ${seed.toFixed(1)}, 311.7))) * 43758.5453); }
float mnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(mhash(i), mhash(i+vec2(1,0)), u.x), mix(mhash(i+vec2(0,1)), mhash(i+vec2(1,1)), u.x), u.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ vec2 q = vWPos.xz * macroScale; float n = mnoise(q) * 0.6 + mnoise(q * 3.7) * 0.3 + mnoise(q * 11.0) * 0.1;
  diffuseColor.rgb *= 1.0 + (n - 0.5) * 2.0 * macroAmt; }`);
  };
  mat.customProgramCacheKey = () => 'macro' + scale + amount + seed;
  return mat;
}

export function initWorldMaterials() {
  const A = TX.asphalt(1024);
  A.map.repeat.set(1, 1);
  WT.asphalt = A;
  WT.pavers = TX.pavers(512);
  WT.grass = TX.grass(1024);
  WT.dirt = TX.dirt(512);
  WT.concrete = TX.concrete(256, 172, 5);
  WT.concreteDark = TX.concrete(256, 130, 9);
  WT.bark = TX.bark(256);
  WT.leaves = TX.leafCluster(512, 'broad');
  WT.leavesBirch = TX.leafCluster(512, 'birch');
  WT.needles = TX.needles(512);
  WT.roofTiles = TX.roofTiles(512);
  WT.flatRoof = TX.flatRoof(256);
  WT.wood = TX.woodPlanks(256);
  WT.stone = TX.stoneWall(256);
  WT.rubber = TX.rubberPlay(256);

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const vc = { vertexColors: true };
  WM.asphalt = macro(std({ name: 'asphalt', map: A.map, normalMap: A.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.93, ...vc }), 0.02, 0.12, 1);
  WM.pavers = macro(std({ name: 'pavers', map: WT.pavers.map, normalMap: WT.pavers.normal, roughness: 0.9, ...vc }), 0.03, 0.12, 2);
  WM.curb = std({ name: 'curb', map: WT.concrete, roughness: 0.85, side: THREE.DoubleSide, ...vc });
  WM.grass = macro(std({ name: 'grass', map: WT.grass, roughness: 0.97, ...vc }), 0.008, 0.28, 3);
  WM.dirt = std({ name: 'dirt', map: WT.dirt, roughness: 0.97, ...vc });
  WM.concrete = std({ name: 'concrete', map: WT.concrete, roughness: 0.9, ...vc });
  WM.paint = std({ name: 'marking', color: 0xf2f2ec, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...vc });
  WM.paint.userData = { cast: false };
  WM.metal = std({ name: 'metal', color: 0x9aa0a6, metalness: 0.7, roughness: 0.45, ...vc });
  WM.metalDark = std({ name: 'metalDark', color: 0x3b3f44, metalness: 0.6, roughness: 0.5, ...vc });
  WM.galv = std({ name: 'galv', color: 0xb8bec4, metalness: 0.8, roughness: 0.4, ...vc });
  WM.painted = std({ name: 'painted', color: 0xffffff, roughness: 0.75, ...vc });
  WM.plastic = WM.painted;
  WM.glass = new THREE.MeshPhysicalMaterial({ name: 'glassW', color: 0x9fb1bd, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false, envMapIntensity: 1.6, side: THREE.DoubleSide });
  WM.glass.userData = { cast: false, receive: false };
  WM.glassDark = std({ name: 'glassDark', color: 0x1d252c, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.6 });
  WM.roofTiles = std({ name: 'roofTiles', map: WT.roofTiles, roughness: 0.8, ...vc });
  WM.flatRoof = std({ name: 'flatRoof', map: WT.flatRoof, roughness: 0.95, ...vc });
  WM.wood = std({ name: 'wood', map: WT.wood, roughness: 0.8, ...vc });
  WM.stone = std({ name: 'stone', map: WT.stone, roughness: 0.9, ...vc });
  WM.bark = std({ name: 'bark', map: WT.bark, roughness: 0.95, ...vc });
  WM.rubber = std({ name: 'playRubber', map: WT.rubber, roughness: 0.95, ...vc });
  WM.leaves = std({ alphaToCoverage: true, name: 'leaves', map: WT.leaves, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, ...vc });
  WM.leavesBirch = std({ alphaToCoverage: true, name: 'leavesBirch', map: WT.leavesBirch, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, ...vc });
  WM.needles = std({ alphaToCoverage: true, name: 'needles', map: WT.needles, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, ...vc });
  WM.hedge = WM.painted;
  WM.fabric = std({ name: 'fabric', color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, ...vc });
  WM.emissive = std({ name: 'emissiveW', color: 0x222222, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.4, ...vc });

  // facade atlases
  const fac = (f, name) => {
    const m = std({ name, map: f.map, roughnessMap: f.rough, roughness: 1, metalness: 0.0, envMapIntensity: 1.2, ...vc });
    return m;
  };
  WM.panelA = fac(TX.panelFacade({ seed: 3, base: [198, 193, 182] }), 'panelA');
  WM.panelB = fac(TX.panelFacade({ seed: 7, base: [176, 178, 176], joint: '#5d5f60' }), 'panelB');
  WM.panelC = fac(TX.panelFacade({ seed: 11, base: [214, 198, 168], joint: '#7b6a55' }), 'panelC');
  WM.tower = fac(TX.panelFacade({ seed: 17, base: [206, 196, 176], winW: 0.44, winH: 0.46 }), 'tower');
  WM.modernA = fac(TX.modernFacade({ seed: 5, base: [238, 234, 226], accent: '#b0563a' }), 'modernA');
  WM.modernB = fac(TX.modernFacade({ seed: 9, base: [232, 226, 210], accent: '#6f7880' }), 'modernB');
  WM.modernC = fac(TX.modernFacade({ seed: 13, base: [242, 238, 232], accent: '#c9a25a' }), 'modernC');
  WM.school = fac(TX.schoolFacade(), 'school');
  WM.ribbon = fac(TX.ribbonFacade(), 'ribbon');
  WM.shopA = fac(TX.shopfront({ seed: 3 }), 'shopA');
  WM.shopB = fac(TX.shopfront({ seed: 8, tint: '#9a1f1f' }), 'shopB');
  // plain wall for building sides/backs of panel blocks (same palette)
  WM.plainA = macro(std({ name: 'plainA', map: WT.concrete, color: 0xe8e2d6, roughness: 0.95, ...vc }), 0.05, 0.08, 4);

  for (const k of ['leaves', 'leavesBirch', 'needles']) WM[k].userData = { cast: true, receive: true };
  // flat / small surfaces never cast shadows (keeps the shadow pass cheap)
  for (const k of ['asphalt', 'pavers', 'curb', 'grass', 'dirt', 'paint', 'rubber', 'flatRoof', 'emissive', 'glassDark', 'stone']) WM[k].userData = { ...(WM[k].userData || {}), cast: false };
  return WM;
}
