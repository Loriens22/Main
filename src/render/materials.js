// Material library: named PBR material types backed by GPU-baked textures.
//
// materials.get('brick', { color: '#8b3a2a', seed: 2 }) returns a shared
// MeshStandardMaterial whose albedo/normal/ORM maps were baked by the
// TextureBaker. Materials and texture sets are cached and reference counted
// so deleting generated entities frees GPU memory once nothing uses them.
//
// Two colouring strategies:
//  - "tint" types (plaster, fabric, plastic, skin...) bake a neutral texture
//    once and apply the requested colour via material.color (cheap, shared).
//  - patterned types (brick, wood, marble...) bake the colour into the
//    texture because the pattern itself has several colours.

import * as THREE from 'three';
import { G, genPreset } from '../core/context.js';
import { patchMaterial } from './shaderPatches.js';

// Vertex wind sway for vegetation (works for instanced and regular meshes) and
// "foliage" mode: two-sided cards keep their authored (spherical) normals on
// both faces so tree crowns shade like soft volumes instead of flat quads.
export function applyWindPatch(m, wind, foliage, translucent) {
  const defines = { ...(m.defines || {}) };
  if (wind === 'leaf') defines.WIND_LEAF = '';
  if (translucent) defines.TRANSLUCENT = '';
  m.defines = defines;
  const tc = new THREE.Color(translucent || '#000000');
  patchMaterial(m, (shader) => {
    shader.uniforms.uTranslucentColor = { value: tc };
    if (wind) {
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wOrigin = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
      #else
        vec3 wOrigin = vec3( modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2] );
      #endif
      float wH = max( transformed.y, 0.0 );
      float wPhase = uGTime * 1.25 + dot( wOrigin.xz, vec2( 0.13, 0.17 ) );
      float wSway = ( sin( wPhase ) * 0.6 + sin( wPhase * 2.3 + 1.0 ) * 0.25 + 0.4 ) * uWindStrength;
      transformed.xz += uWindDir * wSway * 0.01 * wH * wH / ( 1.0 + wH * 0.06 );
      #ifdef WIND_LEAF
        transformed += vec3( sin( uGTime * 6.0 + position.x * 4.0 + position.z * 3.0 ), sin( uGTime * 5.3 + position.y * 5.0 ) * 0.5, cos( uGTime * 5.7 + position.z * 4.0 ) ) * 0.03 * uWindStrength * ( 0.3 + wH * 0.06 );
      #endif`);
    }
    if (foliage) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
    }
  }, 'veg-' + (wind || 'none') + (foliage ? '-f' : '') + (translucent ? '-t' : ''));
}

const c = (hex) => new THREE.Color(hex);

// world = metres covered by one texture tile (geometry UVs are in metres).
export const MATERIAL_TYPES = {
  plaster: { recipe: 'plaster', world: 2.5, bump: 0.0015, colA: '#ffffff', tint: '#ece8df', rough: 1, p: [0.6] },
  stucco: { recipe: 'plaster', world: 1.5, bump: 0.004, colA: '#ffffff', tint: '#e6dccb', rough: 1, p: [1] },
  paint: { recipe: 'plaster', world: 3, bump: 0.0006, colA: '#ffffff', tint: '#f2f0ea', rough: 0.95, p: [0.1] },
  concrete: { recipe: 'concrete', world: 3, bump: 0.003, colA: '#ffffff', tint: '#a3a19b', rough: 1, p: [0, 0] },
  concretePanels: { recipe: 'concrete', world: 3, bump: 0.003, colA: '#ffffff', tint: '#b0aea8', rough: 1, p: [2, 3] },
  brick: { recipe: 'brick', world: 1.2, bump: 0.012, colA: '#8e4431', colB: '#b9b1a3', colC: '#4d2a22', p: [18, 5, 0.005] },
  whiteBrick: { recipe: 'brick', world: 1.2, bump: 0.01, colA: '#e8e4dc', colB: '#c9c4ba', colC: '#b5b0a5', p: [18, 5, 0.005] },
  stone: { recipe: 'stone', world: 2.5, bump: 0.04, colA: '#8f8a80', colB: '#5f5b55', colC: '#a89f8c', p: [5, 7, 0.02], q: [0.2] },
  castleStone: { recipe: 'stone', world: 3, bump: 0.05, colA: '#8a8479', colB: '#4a4640', colC: '#9d9280', p: [4, 6, 0.025], q: [0.35] },
  fieldstone: { recipe: 'stone', world: 2, bump: 0.05, colA: '#9a9181', colB: '#6b6558', colC: '#7b6f5f', p: [6, 6, 0.04], q: [0.15] },
  cobble: { recipe: 'cobble', world: 2, bump: 0.03, colA: '#7d776d', colB: '#3d3a35', p: [10] },
  planks: { recipe: 'planks', world: 2.4, bump: 0.004, colA: '#b98a5a', colB: '#7a5230', p: [14, 2], q: [0.45] },
  floorWood: { recipe: 'planks', world: 2.4, bump: 0.003, colA: '#c89a68', colB: '#8c603a', p: [16, 2], q: [0.32] },
  cladding: { recipe: 'planks', world: 3, bump: 0.006, colA: '#5a3d26', colB: '#2e1e12', p: [20, 1], q: [0.7] },
  siding: { recipe: 'planks', world: 2.4, bump: 0.012, colA: '#ffffff', colB: '#ececec', tint: '#dfe6ea', p: [13, 1], q: [0.6, 1] },
  woodSiding: { recipe: 'planks', world: 2.4, bump: 0.012, colA: '#9a6a42', colB: '#6a4428', p: [12, 1], q: [0.7, 1] },
  deck: { recipe: 'planks', world: 2.4, bump: 0.005, colA: '#8a6a4a', colB: '#5a4028', p: [12, 1], q: [0.7] },
  wood: { recipe: 'wood', world: 1, bump: 0.001, colA: '#a8763f', colB: '#6b4323', q: [0.5] },
  darkWood: { recipe: 'wood', world: 1, bump: 0.001, colA: '#5a3a22', colB: '#2d1a0e', q: [0.45] },
  lightWood: { recipe: 'wood', world: 1, bump: 0.001, colA: '#d8b98f', colB: '#b08a5c', q: [0.55] },
  logs: { recipe: 'bark', world: 2, bump: 0.02, colA: '#6b4a2e', colB: '#8c8a5a', p: [6, 30], q: [0.1, 0] },
  bark: { recipe: 'bark', world: 1.5, bump: 0.03, colA: '#5b4632', colB: '#7d8054', p: [7, 20], q: [0.25, 0] },
  birchBark: { recipe: 'bark', world: 1.5, bump: 0.01, colA: '#e8e4d8', colB: '#9b9a7e', p: [4, 30], q: [0.0, 1] },
  darkBark: { recipe: 'bark', world: 1.5, bump: 0.03, colA: '#2e2520', colB: '#3a3a30', p: [8, 18], q: [0.1, 0] },
  rooftiles: { recipe: 'rooftiles', world: 2, bump: 0.03, colA: '#9c4a30', colB: '#5a3a2a', p: [8, 8, 1, 1] },
  slate: { recipe: 'rooftiles', world: 2, bump: 0.015, colA: '#4a4d52', colB: '#2d3035', p: [10, 6, 1, 0] },
  shingles: { recipe: 'rooftiles', world: 2, bump: 0.012, colA: '#3d3a38', colB: '#26211f', p: [12, 7, 1, 0] },
  metal: { recipe: 'metal', world: 1, bump: 0.0008, colA: '#ffffff', tint: '#c8cacc', p: [0.35, 1, 0.3], metal: 1 },
  steel: { recipe: 'metal', world: 1, bump: 0.0008, colA: '#ffffff', tint: '#b4b7ba', p: [0.3, 1, 0.3], metal: 1 },
  chrome: { recipe: 'metal', world: 1, bump: 0.0002, colA: '#ffffff', tint: '#e8e8ea', p: [0.06, 0.2, 0.05], metal: 1 },
  gold: { recipe: 'metal', world: 1, bump: 0.0003, colA: '#ffffff', tint: '#ffcf6a', p: [0.18, 0.4, 0.1], metal: 1 },
  copper: { recipe: 'metal', world: 1, bump: 0.0004, colA: '#ffffff', tint: '#e6926a', p: [0.25, 0.6, 0.2], metal: 1 },
  bronze: { recipe: 'metal', world: 1, bump: 0.0006, colA: '#ffffff', tint: '#b6804a', p: [0.35, 0.3, 0.3], metal: 1 },
  iron: { recipe: 'metal', world: 1, bump: 0.001, colA: '#ffffff', tint: '#5a5b5e', p: [0.55, 0.5, 0.5], metal: 1 },
  painted: { recipe: 'painted', world: 1.5, bump: 0.0005, colA: '#ffffff', colB: '#888888', tint: '#3a6ea5', p: [0.4, 0.0] },
  paintedWorn: { recipe: 'painted', world: 1.5, bump: 0.001, colA: '#ffffff', colB: '#777777', tint: '#3a6ea5', p: [0.5, 1.0] },
  rust: { recipe: 'rust', world: 1.5, bump: 0.004, colA: '#7a7c80', p: [0.1] },
  knit: { recipe: 'knit', world: 0.12, bump: 0.0006, colA: '#ffffff', tint: '#e0e0e0', p: [40] },
  cotton: { recipe: 'weave', world: 0.08, bump: 0.0004, colA: '#ffffff', tint: '#e8e8e8', p: [60, 0, 4] },
  plaid: { recipe: 'weave', world: 0.3, bump: 0.0004, colA: '#8a1c1c', colB: '#1c2a4a', colC: '#e8d8a0', p: [120, 1, 3] },
  denim: { recipe: 'denim', world: 0.1, bump: 0.0006, colA: '#2b3e66', colB: '#c9ccd4', p: [80, 0.6] },
  leather: { recipe: 'leather', world: 0.3, bump: 0.0008, colA: '#ffffff', tint: '#4a2e1c', p: [60] },
  fabric: { recipe: 'weave', world: 0.1, bump: 0.0005, colA: '#ffffff', tint: '#8a8a8a', p: [70, 0, 4] },
  velvet: { recipe: 'carpet', world: 0.3, bump: 0.0004, colA: '#ffffff', colB: '#ffffff', tint: '#6a1a2a', p: [0], sheen: true },
  marble: { recipe: 'marble', world: 1.5, bump: 0.0005, colA: '#efece6', colB: '#8a8580', p: [0.12] },
  blackMarble: { recipe: 'marble', world: 1.5, bump: 0.0005, colA: '#1a1a1c', colB: '#c8c2b8', p: [0.1] },
  granite: { recipe: 'granite', world: 0.6, bump: 0.0005, colA: '#6a6664', colB: '#2a2624', colC: '#c8bfb4', p: [0.3] },
  tiles: { recipe: 'tiles', world: 1.2, bump: 0.004, colA: '#e8e8e4', colB: '#9a9690', colC: '#e8e8e4', p: [4, 4, 0.002, 0], q: [0.2] },
  poolTiles: { recipe: 'tiles', world: 1, bump: 0.003, colA: '#4fb3c9', colB: '#e0e8ea', colC: '#3a9ab2', p: [10, 10, 0.0015, 0], q: [0.15] },
  checker: { recipe: 'tiles', world: 1.2, bump: 0.002, colA: '#f0efe8', colB: '#777777', colC: '#1a1a1a', p: [4, 4, 0.001, 1], q: [0.15] },
  pavers: { recipe: 'tiles', world: 2, bump: 0.006, colA: '#b8b2a6', colB: '#6a665e', colC: '#a8a296', p: [3, 3, 0.004, 0], q: [0.75] },
  asphalt: { recipe: 'asphalt', world: 3, bump: 0.003, colA: '#3a3a3c' },
  gravel: { recipe: 'gravel', world: 1.5, bump: 0.02, colA: '#8a857a', colB: '#bab4a6', colC: '#5a554c', p: [30] },
  grass: { recipe: 'grass', world: 3, bump: 0.01, colA: '#3f6a1e', colB: '#5f8a2a', colC: '#8a8a3a' },
  lawn: { recipe: 'grass', world: 2, bump: 0.008, colA: '#3d7020', colB: '#55902a', colC: '#6a9a30' },
  dirt: { recipe: 'dirt', world: 3, bump: 0.02, colA: '#5a4130', colB: '#3d2c20', colC: '#8a8070' },
  soil: { recipe: 'dirt', world: 1.5, bump: 0.02, colA: '#3a2a1c', colB: '#241a10', colC: '#5a4a3a' },
  rock: { recipe: 'rock', world: 6, bump: 0.12, colA: '#7a746a', colB: '#5a554e', colC: '#8a7a60', p: [3] },
  sand: { recipe: 'sand', world: 4, bump: 0.01, colA: '#d2bc8e', colB: '#b89e70', p: [12] },
  snow: { recipe: 'snow', world: 4, bump: 0.02, colA: '#f4f6fa' },
  forestFloor: { recipe: 'forest', world: 3, bump: 0.02, colA: '#3a2c1e' },
  thatch: { recipe: 'thatch', world: 2, bump: 0.03, colA: '#b89a58', colB: '#7a6030', p: [10] },
  carpet: { recipe: 'carpet', world: 2, bump: 0.002, colA: '#ffffff', colB: '#ffffff', tint: '#7a2a2a', p: [0] },
  rug: { recipe: 'carpet', world: 2, bump: 0.002, colA: '#8a2a2a', colB: '#d8c090', p: [18] },
  skin: { recipe: 'skin', world: 0.08, bump: 0.00025, colA: '#ffffff', tint: '#c89a7a', p: [70, 0], physical: 'skin' },
  hair: { recipe: 'hair', world: 0.15, bump: 0.0008, colA: '#ffffff', colB: '#ffffff', tint: '#2a1a10', physical: 'hair' },
  fur: { recipe: 'fur', world: 0.25, bump: 0.002, colA: '#ffffff', tint: '#8a6a4a', physical: 'fur' },
  scales: { recipe: 'scales', world: 0.3, bump: 0.003, colA: '#ffffff', colB: '#888888', tint: '#3a6a3a', p: [24, 0.2] },
  books: { recipe: 'books', world: 0.9, bump: 0.01, colA: '#7a1a1a', colB: '#1a3a6a', colC: '#2a5a2a', p: [26] },
  facade: { recipe: 'facade', world: 6, bump: 0.02, colA: '#4a6070', colB: '#2a2c30', p: [4, 2, 0.04, 0.35] },
  panels: { recipe: 'panels', world: 1.5, bump: 0.006, colA: '#d8dade', colB: '#a8acb2', colC: '#40c0ff', p: [4], q: [1, 0.35, 0.6] },
  darkPanels: { recipe: 'panels', world: 1.5, bump: 0.006, colA: '#2a2c30', colB: '#1a1c20', colC: '#ff4060', p: [4], q: [1, 0.3, 0.7] },
  stripes: { recipe: 'stripes', world: 1, bump: 0.0005, colA: '#ffffff', colB: '#d02020', p: [6, 0.78, 0.4] },
  plastic: { recipe: 'plastic', world: 1, bump: 0.0003, colA: '#ffffff', tint: '#d0d0d0', p: [0.35] },
  glossyPlastic: { recipe: 'plastic', world: 1, bump: 0.0002, colA: '#ffffff', tint: '#d0d0d0', p: [0.12] },
  rubber: { recipe: 'rubber', world: 0.5, bump: 0.002, colA: '#1a1a1a', p: [0] },
  tire: { recipe: 'rubber', world: 0.6, bump: 0.008, colA: '#161616', p: [24] },
  ice: { recipe: 'ice', world: 3, bump: 0.005, colA: '#b8d8ec', physical: 'ice' },
  lava: { recipe: 'lava', world: 4, bump: 0.05, colA: '#000000', emissive: '#ffffff', emissiveIntensity: 3 },
  crystal: { recipe: 'crystal', world: 1, bump: 0.01, colA: '#9a6aff', colB: '#5a3aff', p: [0.6], emissive: '#ffffff', emissiveIntensity: 1.5, physical: 'crystal' },
  leaves: { recipe: 'leaves', world: 1, bump: 0.002, colA: '#3d6b1f', colB: '#5f8f2a', colC: '#8a9a3a', p: [0, 18] },
  hairCard: { recipe: 'hairCard', world: 1, bump: 0.001, colA: '#ffffff', tint: '#2a1a10', p: [22, 0.5] },
  // Edible and craft materials ("a chocolate castle", "a candy house", "a lego tower").
  chocolate: { recipe: 'plastic', world: 1, bump: 0.0004, colA: '#ffffff', tint: '#5a3020', p: [0.22] },
  candy: { recipe: 'stripes', world: 0.8, bump: 0.0003, colA: '#ffffff', colB: '#e8307a', p: [6, 0.5, 0.4] },
  gingerbread: { recipe: 'plaster', world: 1, bump: 0.003, colA: '#ffffff', tint: '#a8642a', rough: 0.9, p: [1] },
  icing: { recipe: 'plaster', world: 1, bump: 0.001, colA: '#ffffff', tint: '#fbf8f2', rough: 0.7, p: [0.3] },
  cardboard: { recipe: 'plaster', world: 1.5, bump: 0.001, colA: '#ffffff', tint: '#b8905a', rough: 1, p: [0.4] },
  lego: { recipe: 'plastic', world: 1, bump: 0.0002, colA: '#ffffff', tint: '#d82020', p: [0.1] },
  bubblegum: { recipe: 'plastic', world: 1, bump: 0.0002, colA: '#ffffff', tint: '#f880b8', p: [0.15] },
  cottonCandy: { recipe: 'fur', world: 0.3, bump: 0.002, colA: '#ffffff', tint: '#f8b0d8', physical: 'fur' },
  jelly: { special: 'glass', tint: '#e83a5a', opacity: 0.7 },
  // Untextured special materials.
  glass: { special: 'glass' },
  tintedGlass: { special: 'glass', tint: '#203040', opacity: 0.55 },
  mirror: { special: 'mirror' },
  emissive: { special: 'emissive' },
  carPaint: { special: 'carPaint' },
  eye: { special: 'eye' },
  water: { special: 'waterSimple' },
  basic: { special: 'basic' },
  hologram: { special: 'hologram' },
};

// Keyword -> material type (used by the NLP layer for "made of X").
export const MATERIAL_WORDS = {
  wood: 'wood', wooden: 'wood', oak: 'wood', timber: 'planks', plank: 'planks', bamboo: 'lightWood', pine: 'lightWood', mahogany: 'darkWood', walnut: 'darkWood', ebony: 'darkWood',
  stone: 'stone', rock: 'rock', rocky: 'rock', cobblestone: 'cobble', marble: 'marble', granite: 'granite', brick: 'brick', bricks: 'brick', concrete: 'concrete', cement: 'concrete',
  metal: 'metal', metallic: 'metal', steel: 'steel', iron: 'iron', chrome: 'chrome', silver: 'chrome', gold: 'gold', golden: 'gold', copper: 'copper', bronze: 'bronze', rusty: 'rust', rusted: 'rust', aluminum: 'metal', aluminium: 'metal', titanium: 'steel',
  glass: 'glass', crystal: 'crystal', crystalline: 'crystal', diamond: 'crystal', ice: 'ice', icy: 'ice', frozen: 'ice',
  chocolate: 'chocolate', choc: 'chocolate', candy: 'candy', sugar: 'candy', gingerbread: 'gingerbread', icing: 'icing', frosted: 'icing', cardboard: 'cardboard', carton: 'cardboard',
  lego: 'lego', legos: 'lego', jelly: 'jelly', jello: 'jelly', gelatin: 'jelly', gummy: 'jelly', bubblegum: 'bubblegum', cottoncandy: 'cottonCandy',
  plastic: 'plastic', rubber: 'rubber', leather: 'leather', fabric: 'fabric', cloth: 'fabric', velvet: 'velvet', denim: 'denim', wool: 'knit', woolen: 'knit', cotton: 'cotton',
  lava: 'lava', magma: 'lava', molten: 'lava', sand: 'sand', sandstone: 'sand', snow: 'snow', clay: 'rooftiles', terracotta: 'rooftiles', straw: 'thatch', thatch: 'thatch', paper: 'paint',
  neon: 'emissive', glowing: 'emissive', holographic: 'hologram', hologram: 'hologram', mirror: 'mirror', mirrored: 'mirror', obsidian: 'blackMarble', jade: 'glossyPlastic', porcelain: 'glossyPlastic', ceramic: 'glossyPlastic',
};

function quantHex(col) {
  // Quantise to 5 bits/channel so near-identical colours share bakes.
  const r = Math.round(col.r * 31), g = Math.round(col.g * 31), b = Math.round(col.b * 31);
  return (r << 10) | (g << 5) | b;
}

export class MaterialLibrary {
  constructor(baker) {
    this.baker = baker;
    this.textureSets = new Map(); // key -> { set, refs, lastUsed }
    this.materials = new Map();   // key -> { material, refs, texKey }
    this.baseTexSize = 512;
  }

  texSize(def, opts) {
    const q = G.quality ? G.quality.texSize : 512;
    const gp = genPreset();
    let s = (opts.size || q * (def.sizeMul || 1) * gp.texScale);
    s = Math.pow(2, Math.round(Math.log2(Math.max(128, Math.min(2048, s)))));
    return s;
  }

  _getTextureSet(type, def, opts) {
    const colA = new THREE.Color(opts.bakeColor || def.colA || '#ffffff');
    const colB = new THREE.Color(opts.color2 || def.colB || def.colA || '#888888');
    const colC = new THREE.Color(opts.color3 || def.colC || def.colB || '#444444');
    const size = this.texSize(def, opts);
    const seed = opts.seed ?? 0;
    const p = opts.p || def.p || [0, 0, 0, 0];
    const q = opts.q || def.q || [0, 0, 0, 0];
    const world = opts.world || def.world || 1;
    const key = [def.recipe, quantHex(colA), quantHex(colB), quantHex(colC), size, seed, p.join(','), q.join(','), world].join('|');
    let entry = this.textureSets.get(key);
    if (!entry) {
      const set = this.baker.bake(def.recipe, { colA, colB, colC, size, seed, p, q, world, bump: opts.bump || def.bump });
      for (const t of [set.map, set.normalMap, set.ormMap, set.emissiveMap]) {
        if (t) t.repeat.set(1 / world, 1 / world);
      }
      entry = { set, refs: 0, lastUsed: performance.now(), key };
      this.textureSets.set(key, entry);
    }
    entry.lastUsed = performance.now();
    return entry;
  }

  // Get a (shared, ref-counted) material. Call release() when done.
  get(type, opts = {}) {
    const def = MATERIAL_TYPES[type] || MATERIAL_TYPES.plaster;
    if (def.special) return this._special(type, def, opts);
    // Patterned types put the requested colour into the bake; tint types use material.color.
    const tintColor = def.tint ? new THREE.Color(opts.color || def.tint) : new THREE.Color(1, 1, 1);
    const bakeOpts = { ...opts };
    if (!def.tint && opts.color) bakeOpts.bakeColor = opts.color;
    const texEntry = this._getTextureSet(type, def, bakeOpts);
    const matKey = [texEntry.key, type, quantHex(tintColor), opts.roughness ?? '', opts.metalness ?? '', opts.vertexColors ? 1 : 0,
      opts.side ?? '', opts.transparent ? 1 : 0, opts.opacity ?? '', opts.emissive ?? '', opts.emissiveIntensity ?? '', opts.skinned ? 1 : 0,
      opts.alphaTest ?? '', opts.envMapIntensity ?? '', opts.flat ? 1 : 0, opts.normalScale ?? '', opts.noWeather ? 1 : 0, opts.translucent ?? '',
      opts.wind ?? '', opts.foliage ? 1 : 0].join('|');
    let entry = this.materials.get(matKey);
    if (!entry) {
      const material = this._build(type, def, opts, texEntry.set, tintColor);
      material.userData.shared = true;
      material.userData.libKey = matKey;
      entry = { material, refs: 0, texKey: texEntry.key, created: performance.now() };
      this.materials.set(matKey, entry);
      texEntry.refs++;
    }
    entry.created = performance.now();
    return entry.material;
  }

  _build(type, def, opts, set, tintColor) {
    const physical = def.physical || opts.physical;
    const params = {
      color: tintColor,
      map: set.map,
      normalMap: set.normalMap,
      roughnessMap: set.ormMap,
      metalnessMap: set.ormMap,
      aoMap: set.ormMap,
      aoMapIntensity: 0.9,
      roughness: opts.roughness ?? def.rough ?? 1,
      metalness: opts.metalness ?? def.metal ?? 1, // map B channel carries metalness
      vertexColors: !!opts.vertexColors,
      side: opts.side ?? THREE.FrontSide,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      alphaTest: opts.alphaTest ?? 0,
      flatShading: !!opts.flat,
    };
    if (opts.normalScale !== undefined) params.normalScale = new THREE.Vector2(opts.normalScale, opts.normalScale);
    if (set.emissiveMap) {
      params.emissiveMap = set.emissiveMap;
      params.emissive = new THREE.Color(opts.emissive || def.emissive || '#ffffff');
      params.emissiveIntensity = opts.emissiveIntensity ?? def.emissiveIntensity ?? 1;
    } else if (opts.emissive) {
      params.emissive = new THREE.Color(opts.emissive);
      params.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    let m;
    if (physical === 'skin') {
      m = new THREE.MeshPhysicalMaterial({ ...params, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.9, 0.55, 0.45), specularIntensity: 0.6, clearcoat: 0.04, clearcoatRoughness: 0.5 });
      m.defines = { SKIN_SSS: '', NO_WEATHER: '' };
      patchMaterial(m, (shader) => { shader.uniforms.uSSSColor = { value: new THREE.Color(0.9, 0.3, 0.2) }; }, 'skin-sss');
    } else if (physical === 'hair') {
      m = new THREE.MeshPhysicalMaterial({ ...params, sheen: 0.6, sheenRoughness: 0.35, sheenColor: tintColor.clone().lerp(new THREE.Color(1, 0.9, 0.8), 0.5), specularIntensity: 0.5 });
      m.defines = { NO_WEATHER: '' };
    } else if (physical === 'fur') {
      m = new THREE.MeshPhysicalMaterial({ ...params, sheen: 0.8, sheenRoughness: 0.5, sheenColor: tintColor.clone().lerp(new THREE.Color(1, 1, 1), 0.4) });
    } else if (physical === 'ice') {
      m = new THREE.MeshPhysicalMaterial({ ...params, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.85, ior: 1.31 });
    } else if (physical === 'crystal') {
      m = new THREE.MeshPhysicalMaterial({ ...params, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.6, iridescenceIOR: 1.5, transparent: true, opacity: 0.8 });
    } else if (def.sheen || opts.sheen) {
      m = new THREE.MeshPhysicalMaterial({ ...params, sheen: 1, sheenRoughness: 0.5, sheenColor: tintColor.clone().lerp(new THREE.Color(1, 1, 1), 0.3) });
    } else if (opts.clearcoat) {
      m = new THREE.MeshPhysicalMaterial({ ...params, clearcoat: opts.clearcoat, clearcoatRoughness: opts.clearcoatRoughness ?? 0.08 });
    } else {
      m = new THREE.MeshStandardMaterial(params);
    }
    if (opts.wind || opts.foliage) applyWindPatch(m, opts.wind, !!opts.foliage, opts.translucent);
    if (opts.envMapIntensity !== undefined) m.envMapIntensity = opts.envMapIntensity;
    if (opts.noWeather) m.defines = { ...(m.defines || {}), NO_WEATHER: '' };
    if (opts.translucent && !(opts.wind || opts.foliage)) {
      m.defines = { ...(m.defines || {}), TRANSLUCENT: '' };
      const tc = new THREE.Color(opts.translucent);
      patchMaterial(m, (shader) => { shader.uniforms.uTranslucentColor = { value: tc }; }, 'translucent');
    }
    if (opts.alphaTest) m.alphaToCoverage = G.quality ? G.quality.msaa > 0 : false;
    m.name = type;
    return m;
  }

  _special(type, def, opts) {
    const key = ['special', type, opts.color ? quantHex(new THREE.Color(opts.color)) : '', opts.opacity ?? '', opts.emissiveIntensity ?? '', opts.roughness ?? '', opts.metalness ?? '', opts.side ?? '', opts.vertexColors ? 1 : 0].join('|');
    let entry = this.materials.get(key);
    if (!entry) {
      let m;
      const col = new THREE.Color(opts.color || def.tint || '#ffffff');
      switch (def.special) {
        case 'glass':
          m = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(opts.color || def.tint || '#dfeaf0'), metalness: 0, roughness: opts.roughness ?? 0.03,
            transparent: true, opacity: opts.opacity ?? def.opacity ?? 0.22, envMapIntensity: 1.6, ior: 1.5, specularIntensity: 1,
            side: opts.side ?? THREE.DoubleSide, depthWrite: false,
          });
          m.defines = { NO_WEATHER: '' };
          break;
        case 'mirror':
          m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02, envMapIntensity: 1.5 });
          break;
        case 'emissive':
          m = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.2), emissive: col, emissiveIntensity: opts.emissiveIntensity ?? 3, roughness: 0.5, metalness: 0, vertexColors: !!opts.vertexColors });
          m.defines = { NO_WEATHER: '' };
          break;
        case 'carPaint':
          m = new THREE.MeshPhysicalMaterial({ color: col, metalness: opts.metalness ?? 0.55, roughness: opts.roughness ?? 0.32, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2, vertexColors: !!opts.vertexColors });
          break;
        case 'eye':
          m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.0, map: opts.map || null });
          m.defines = { NO_WEATHER: '' };
          break;
        case 'waterSimple':
          m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.03, metalness: 0, transparent: true, opacity: opts.opacity ?? 0.7, envMapIntensity: 1.3 });
          m.defines = { NO_WEATHER: '' };
          break;
        case 'hologram':
          m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
          break;
        default:
          m = new THREE.MeshStandardMaterial({ color: col, roughness: opts.roughness ?? 0.6, metalness: opts.metalness ?? 0, vertexColors: !!opts.vertexColors, side: opts.side ?? THREE.FrontSide });
      }
      m.userData.shared = true;
      m.userData.libKey = key;
      m.name = type;
      entry = { material: m, refs: 0, texKey: null, created: performance.now() };
      this.materials.set(key, entry);
    }
    entry.created = performance.now();
    return entry.material;
  }

  // Simple coloured PBR material without textures (for tiny details).
  plain(color, roughness = 0.6, metalness = 0, extra = {}) {
    return this._special('basic', { special: 'basic' }, { color, roughness, metalness, ...extra });
  }

  // Reference counting is per owner (entity / world object), not per get() call:
  // owners call retainTree() once when they go live and releaseTree() on delete.
  retain(material) {
    const key = material && material.userData.libKey;
    const e = key && this.materials.get(key);
    if (e) e.refs++;
  }

  release(material) {
    const key = material && material.userData.libKey;
    if (!key) return;
    const e = this.materials.get(key);
    if (!e) return;
    e.refs--;
    if (e.refs <= 0) this._disposeEntry(key, e);
  }

  retainTree(root) { for (const m of collectLibraryMaterials(root)) this.retain(m); }
  releaseTree(root) { for (const m of collectLibraryMaterials(root)) this.release(m); }

  _disposeEntry(key, e) {
    this.materials.delete(key);
    e.material.dispose();
    if (e.texKey) {
      const t = this.textureSets.get(e.texKey);
      if (t) { t.refs--; t.lastUsed = performance.now(); }
    }
  }

  // Free materials that were created but never retained (e.g. cancelled
  // generations) and texture sets nobody has used for a while.
  collectGarbage(maxIdleMs = 60000) {
    const now = performance.now();
    for (const [k, e] of this.materials) {
      if (e.refs <= 0 && now - e.created > 120000) this._disposeEntry(k, e);
    }
    for (const [k, t] of this.textureSets) {
      if (t.refs <= 0 && now - t.lastUsed > maxIdleMs) {
        for (const rt of t.set.targets) rt.dispose();
        this.textureSets.delete(k);
      }
    }
  }

  stats() {
    return { materials: this.materials.size, textureSets: this.textureSets.size };
  }
}

// Collect library materials used by an object tree (for release on delete).
export function collectLibraryMaterials(root, out = new Set()) {
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (m && m.userData.libKey) out.add(m);
  });
  return out;
}
