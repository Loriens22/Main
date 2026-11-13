import * as THREE from 'three';

/**
 * Procedural creature skin (no textures, no UV seams). Patterns are evaluated in the mesh's
 * bind-pose object space, so they stay glued to a skinned body while it bends.
 *
 * Layers, all optional:
 *  - plates   raised cells separated by grooves (scales, scutes, armour tiles)
 *  - wrinkle  ridged folds stretched along an axis (skin creases across the body)
 *  - pores    small pits (pores, sensory pits)
 *  - mottle   soft blotches toward a second colour
 *  - spots    discrete round spots of a third colour, some cells only
 *  - retic    thin lines along cell borders (reticulated patterns)
 *  - belly    countershading: underside toward a paler colour
 *  - lattice  holes cut out of cell interiors (open lattice tissue)
 * Relief feeds a derivative bump (Mikkelsen surface gradient), cavities darken and stay wet
 * (lower roughness). A baked ambient-occlusion vertex layer (attribute aoInv = 1 − AO) dims
 * indirect light and, partly, the albedo in folds, under plates and inside mouths.
 */
export interface SkinSpec {
  /** pattern frequency multiplier on object-space metres */
  scale?: number;
  plates?: number; // relief depth of plate cells (m at scale 1)
  plateSize?: number; // cell size (m)
  plateGroove?: number; // groove width 0..0.5 (fraction of cell)
  plateStretch?: [number, number, number]; // anisotropic cells (e.g. elongated scales)
  wrinkle?: number; // relief depth
  wrinkleSize?: number; // spacing (m)
  wrinkleAxis?: [number, number, number]; // frequency multiplier per axis: large = folds cross that axis
  pores?: number; // pit depth
  poreSize?: number; // cell size (m)
  mottle?: number; // 0..1
  mottleSize?: number; // blotch size (m)
  mottleColor?: [number, number, number];
  /** frequency multiplier per axis (model space, y up, −z forward): e.g. [4, 4, 0.5] = streaks along the body */
  mottleAxis?: [number, number, number];
  /** a second, finer blotch layer toward this colour */
  mottle2?: number;
  mottle2Size?: number;
  mottle2Color?: [number, number, number];
  spots?: number; // 0..1
  spotSize?: number; // cell size (m)
  spotRadius?: number; // 0..0.5 fraction of cell
  spotDensity?: number; // fraction of cells with a spot
  spotColor?: [number, number, number];
  retic?: number; // 0..1
  reticSize?: number;
  reticWidth?: number; // fraction of cell
  reticColor?: [number, number, number];
  belly?: number; // 0..1
  bellyColor?: [number, number, number];
  /** cavities darken by this much (0..1) */
  cavity?: number;
  /** cavities wetter: roughness multiplied down by up to this */
  wet?: number;
  /** albedo variation (fine fbm) 0..1 */
  vary?: number;
  /** cut holes: keep only borders this wide (fraction of cell) */
  lattice?: number;
  latticeSize?: number;
  /** how strongly baked AO darkens the albedo (indirect light always gets full AO) */
  aoAlbedo?: number;
}

const GLSL_NOISE = /* glsl */ `
float skH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 skH3(vec3 p){ return vec3(skH(p), skH(p + 19.19), skH(p + 47.53)); }
float skN(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(skH(i), skH(i + vec3(1,0,0)), f.x), mix(skH(i + vec3(0,1,0)), skH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(skH(i + vec3(0,0,1)), skH(i + vec3(1,0,1)), f.x), mix(skH(i + vec3(0,1,1)), skH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float skF(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * skN(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.9375; }
// x: distance to nearest feature, y: border distance (F2 - F1), z: cell id hash
vec3 skV(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  float d1 = 8.0, d2 = 8.0; float id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = skH3(i + g) * 0.85 + 0.075;
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = skH(i + g + 3.7); } else if (d < d2) d2 = d;
  }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec3(d1, d2 - d1, id);
}
`;

function v3(c: [number, number, number] | undefined, d: [number, number, number]) {
  return new THREE.Vector3(...(c ?? d));
}

/** Inject the skin layers into a standard/physical material. quality: 0 colour only, 1 + relief, 2 + pores */
export function applySkin(m: THREE.MeshStandardMaterial, s: SkinSpec, quality = 2) {
  const f: string[] = [];
  const relief = quality >= 1;
  if (s.plates) f.push('SK_PLATES');
  if (s.wrinkle && relief) f.push('SK_WRINKLE');
  if (s.pores && quality >= 2) f.push('SK_PORES');
  if (s.mottle) f.push('SK_MOTTLE');
  if (s.mottle2) f.push('SK_MOTTLE2');
  if (s.spots) f.push('SK_SPOTS');
  if (s.retic) f.push('SK_RETIC');
  if (s.belly) f.push('SK_BELLY');
  if (s.lattice) f.push('SK_LATTICE');
  if (relief && (s.plates || s.wrinkle || (s.pores && quality >= 2))) f.push('SK_BUMP');
  const u = {
    skScale: { value: s.scale ?? 1 },
    skPlates: { value: new THREE.Vector4(s.plates ?? 0, 1 / (s.plateSize ?? 0.1), s.plateGroove ?? 0.12, 0) },
    skPlateStretch: { value: v3(s.plateStretch, [1, 1, 1]) },
    skWrinkle: { value: new THREE.Vector2(s.wrinkle ?? 0, 1 / (s.wrinkleSize ?? 0.05)) },
    skWrinkleAxis: { value: v3(s.wrinkleAxis, [1, 1, 4]) },
    skPores: { value: new THREE.Vector2(s.pores ?? 0, 1 / (s.poreSize ?? 0.01)) },
    skMottle: { value: new THREE.Vector2(s.mottle ?? 0, 1 / (s.mottleSize ?? 0.3)) },
    skMottleColor: { value: v3(s.mottleColor, [0, 0, 0]) },
    skMottleAxis: { value: v3(s.mottleAxis, [1, 1, 1]) },
    skMottle2: { value: new THREE.Vector2(s.mottle2 ?? 0, 1 / (s.mottle2Size ?? 0.05)) },
    skMottle2Color: { value: v3(s.mottle2Color, [0, 0, 0]) },
    skSpots: { value: new THREE.Vector4(s.spots ?? 0, 1 / (s.spotSize ?? 0.1), s.spotRadius ?? 0.25, s.spotDensity ?? 0.5) },
    skSpotColor: { value: v3(s.spotColor, [1, 1, 1]) },
    skRetic: { value: new THREE.Vector3(s.retic ?? 0, 1 / (s.reticSize ?? 0.1), s.reticWidth ?? 0.06) },
    skReticColor: { value: v3(s.reticColor, [1, 1, 1]) },
    skBelly: { value: s.belly ?? 0 },
    skBellyColor: { value: v3(s.bellyColor, [1, 1, 1]) },
    skCavity: { value: new THREE.Vector4(s.cavity ?? 0.3, s.wet ?? 0.4, s.vary ?? 0.15, s.aoAlbedo ?? 0.55) },
    skLattice: { value: new THREE.Vector2(s.lattice ?? 0, 1 / (s.latticeSize ?? 0.1)) },
  };
  const defs = f.map((d) => `#define ${d}`).join('\n');
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aoInv;
        varying vec3 vSkP; varying vec3 vSkN; varying float vSkAO;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSkP = position; vSkN = normal; vSkAO = 1.0 - aoInv;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${defs}
        varying vec3 vSkP; varying vec3 vSkN; varying float vSkAO;
        uniform float skScale, skBelly;
        uniform vec4 skPlates, skSpots, skCavity; uniform vec3 skPlateStretch, skWrinkleAxis, skRetic;
        uniform vec2 skWrinkle, skPores, skMottle, skLattice;
        uniform vec3 skMottleColor, skSpotColor, skReticColor, skBellyColor, skMottleAxis, skMottle2Color;
        uniform vec2 skMottle2;
        ${GLSL_NOISE}
        float skHeight; float skCav;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 p = vSkP * skScale;
          skHeight = 0.0; skCav = 0.0;
          // domain warp: organic, irregular cells instead of a regular tiling
          vec3 wq = vec3(skN(p * 1.7), skN(p * 1.7 + 7.13), skN(p * 1.7 + 3.71)) - 0.5;
          #ifdef SK_LATTICE
            vec3 lv = skV((p + wq * 0.6 / skLattice.y) * skLattice.y);
            if (lv.y > skLattice.x * (0.7 + 0.6 * lv.z)) discard;
          #endif
          #ifdef SK_PLATES
            vec3 pq = p + wq * (0.9 / skPlates.y);
            vec3 pv = skV(pq * skPlateStretch * skPlates.y);
            float gw = skPlates.z * (0.6 + 0.8 * skN(p * skPlates.y * 0.37));
            float edge = smoothstep(0.0, gw, pv.y);
            float dome = 1.0 - pv.x * 0.5;
            float ch = 0.45 + 0.55 * pv.z;
            skHeight += skPlates.x * edge * dome * ch;
            skCav = max(skCav, (1.0 - edge) * 0.8);
            diffuseColor.rgb *= 0.86 + 0.28 * pv.z;
          #endif
          #ifdef SK_WRINKLE
            float wr = skF(p * skWrinkleAxis * skWrinkle.y);
            float ridge = 1.0 - abs(wr * 2.0 - 1.0);
            skHeight += skWrinkle.x * ridge;
            skCav = max(skCav, smoothstep(0.55, 0.0, ridge) * 0.7);
          #endif
          #ifdef SK_PORES
            vec3 po = skV(p * skPores.y);
            float pit = 1.0 - smoothstep(0.0, 0.32, po.x);
            skHeight -= skPores.x * pit * step(0.35, po.z);
          #endif
          #ifdef SK_MOTTLE
            float mt = smoothstep(0.36, 0.66, skF((p + wq * (0.7 / skMottle.y)) * skMottleAxis * skMottle.y));
            diffuseColor.rgb = mix(diffuseColor.rgb, skMottleColor, mt * skMottle.x);
          #endif
          #ifdef SK_MOTTLE2
            float m2 = smoothstep(0.45, 0.62, skF(p * skMottle2.y + 13.7));
            diffuseColor.rgb = mix(diffuseColor.rgb, skMottle2Color, m2 * skMottle2.x);
          #endif
          #ifdef SK_RETIC
            vec3 rv = skV((p + wq * (0.8 / skRetic.y)) * skRetic.y);
            float line = 1.0 - smoothstep(skRetic.z * 0.5, skRetic.z, rv.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, skReticColor, line * skRetic.x);
          #endif
          #ifdef SK_SPOTS
            vec3 sv = skV((p + wq * (0.5 / skSpots.y)) * skSpots.y);
            float sp = (1.0 - smoothstep(skSpots.z * 0.75, skSpots.z, sv.x)) * step(1.0 - skSpots.w, sv.z);
            diffuseColor.rgb = mix(diffuseColor.rgb, skSpotColor, sp * skSpots.x);
          #endif
          #ifdef SK_BELLY
            float bl = smoothstep(0.15, -0.65, normalize(vSkN).y);
            diffuseColor.rgb = mix(diffuseColor.rgb, skBellyColor, bl * skBelly);
          #endif
          diffuseColor.rgb *= 1.0 - skCavity.z * 0.5 + skCavity.z * skF(p * 9.0);
          diffuseColor.rgb *= 1.0 - skCav * skCavity.x;
          diffuseColor.rgb *= mix(1.0, vSkAO, skCavity.w);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (1.0 - skCav * skCavity.y), 0.04, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        #ifdef SK_BUMP
        {
          vec3 sp = -vViewPosition;
          vec3 sx = dFdx(sp); vec3 sy = dFdy(sp);
          vec2 dh = vec2(dFdx(skHeight), dFdy(skHeight));
          vec3 r1 = cross(sy, normal); vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
          normal = normalize(abs(det) * normal - grad);
        }
        #endif`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vSkAO;
        reflectedLight.indirectSpecular *= mix(1.0, vSkAO, 0.8);`,
      );
  };
  m.customProgramCacheKey = () => 'skin1:' + f.join(',');
  m.userData.skin = true;
  m.userData.skinSpec = s;
}

/** clone a material keeping its skin (Material.clone drops onBeforeCompile) */
export function cloneSkinned<T extends THREE.Material>(m: T, quality = 2): T {
  const c = m.clone() as T;
  const spec = m.userData.skinSpec as SkinSpec | undefined;
  if (spec) applySkin(c as unknown as THREE.MeshStandardMaterial, spec, quality);
  return c;
}

/**
 * glTF COLOR_0 (baked AO) → attribute aoInv = 1 − AO. Stored inverted so a mesh without the
 * layer reads the WebGL default (0) as "no occlusion"; meshes that share a skin material
 * but were exported without AO then stay lit.
 */
export function adoptAO(geo: THREE.BufferGeometry) {
  const c = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!c || geo.getAttribute('aoInv')) return false;
  const n = c.count;
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.round((1 - THREE.MathUtils.clamp(c.getX(i), 0, 1)) * 255);
  geo.setAttribute('aoInv', new THREE.BufferAttribute(a, 1, true));
  geo.deleteAttribute('color');
  return true;
}
