// Water surfaces: lakes (depth-aware colour/transparency from the terrain
// heightfield, shoreline foam), pools and ponds. Waves come from two
// scrolling samples of a GPU-baked tileable wave normal map; reflections and
// sun glints come from the PBR pipeline (environment map + low roughness).

import * as THREE from 'three';
import { patchMaterial } from '../render/shaderPatches.js';
import { G } from '../core/context.js';
import { markNoAO } from '../render/renderer.js';

let waveSet = null;
export function waveNormals() {
  if (!waveSet) {
    waveSet = G.baker.bake('water', { size: 512, world: 8, bump: 0.35, seed: 3, colA: new THREE.Color(0.5, 0.5, 0.5) });
  }
  return waveSet.normalMap;
}

export function createWaterMaterial(opts = {}) {
  const terrain = opts.terrain || null;
  const uniforms = {
    uWaterNormal: { value: waveNormals() },
    uShallow: { value: new THREE.Color(opts.shallow || 0x1d6f6a) },
    uDeep: { value: new THREE.Color(opts.deep || 0x03161f) },
    uWaterY: { value: opts.level ?? 0 },
    uHeightTex: { value: terrain ? terrain.heightTex : null },
    uHasTerrain: { value: terrain ? 1 : 0 },
    uTerrainHalf: { value: terrain ? terrain.half : 1 },
    uTerrainN: { value: terrain ? terrain.N : 1 },
    uTerrainRes: { value: terrain ? terrain.res : 1 },
    uFixedDepth: { value: opts.depth ?? 2 },
    uWaveScale: { value: opts.waveScale ?? 1 },
    uFoam: { value: opts.foam ?? 1 },
    uFlow: { value: new THREE.Vector2(opts.flowX ?? 0, opts.flowZ ?? 0) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: opts.roughness ?? 0.05, metalness: 0, transparent: true, depthWrite: true, envMapIntensity: 1.1 });
  mat.defines = { NO_WEATHER: '' };
  patchMaterial(mat, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform sampler2D uWaterNormal;
        uniform sampler2D uHeightTex;
        uniform vec3 uShallow, uDeep;
        uniform float uWaterY, uHasTerrain, uTerrainHalf, uTerrainN, uTerrainRes, uFixedDepth, uWaveScale, uFoam;
        uniform vec2 uFlow;
        float wTerrainH( vec2 p ) {
          vec2 f = ( p + uTerrainHalf ) / uTerrainRes;
          f = clamp( f, vec2( 0.0 ), vec2( uTerrainN - 0.001 ) );
          ivec2 i = ivec2( floor( f ) ); vec2 t = fract( f );
          float a = texelFetch( uHeightTex, i, 0 ).r, b = texelFetch( uHeightTex, i + ivec2( 1, 0 ), 0 ).r;
          float c = texelFetch( uHeightTex, i + ivec2( 0, 1 ), 0 ).r, d = texelFetch( uHeightTex, i + ivec2( 1, 1 ), 0 ).r;
          return mix( mix( a, b, t.x ), mix( c, d, t.x ), t.y );
        }
        float wHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
        float wNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( wHash( i ), wHash( i + vec2( 1, 0 ) ), u.x ), mix( wHash( i + vec2( 0, 1 ) ), wHash( i + vec2( 1, 1 ) ), u.x ), u.y ); }
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wDepth = uHasTerrain > 0.5 ? uWaterY - wTerrainH( vWPos.xz ) : uFixedDepth;
        float wDeepF = smoothstep( 0.0, 7.0, wDepth );
        vec3 wCol = mix( uShallow, uDeep, wDeepF );
        float wT = uGTime;
        float foamN = wNoise( vWPos.xz * 3.0 + wT * 0.4 ) * 0.6 + wNoise( vWPos.xz * 9.0 - wT * 0.3 ) * 0.4;
        float foam = uFoam * smoothstep( 0.55, 0.0, wDepth ) * smoothstep( 0.35, 0.65, foamN + 0.25 * sin( wDepth * 12.0 - wT * 2.0 ) );
        diffuseColor.rgb = mix( wCol, vec3( 0.9 ), foam );
        diffuseColor.a = clamp( smoothstep( 0.0, 1.8, wDepth ) * 0.82 + 0.1 + foam * 0.5, 0.0, 0.97 );
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( roughness, 0.6, foam );')
      .replace('#include <normal_fragment_maps>', `
        vec2 wuv1 = vWPos.xz * 0.06 * uWaveScale + vec2( 0.021, 0.013 ) * uGTime + uFlow * uGTime;
        vec2 wuv2 = vWPos.xz * 0.11 * uWaveScale - vec2( 0.017, 0.024 ) * uGTime + uFlow * uGTime * 1.3;
        vec2 wuv3 = vWPos.xz * 0.37 * uWaveScale + vec2( -0.04, 0.03 ) * uGTime;
        vec3 wn = ( texture2D( uWaterNormal, wuv1 ).xyz * 2.0 - 1.0 ) + ( texture2D( uWaterNormal, wuv2 ).xyz * 2.0 - 1.0 ) + ( texture2D( uWaterNormal, wuv3 ).xyz * 2.0 - 1.0 ) * 0.4;
        float wDist = length( vWPos - cameraPosition );
        wn.xy *= ( 0.5 + uWindStrength * 0.6 ) / ( 1.0 + wDist * 0.012 );
        vec3 wN = normalize( vec3( wn.x, wn.z * 3.0, wn.y ) );
        normal = normalize( ( viewMatrix * vec4( wN, 0.0 ) ).xyz );
      `);
  }, 'water-surface');
  mat.userData.waterUniforms = uniforms;
  return mat;
}

export function createLakePlane(terrain, level, size) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, createWaterMaterial({ terrain, level }));
  mesh.position.y = level;
  mesh.receiveShadow = true;
  mesh.renderOrder = 5;
  mesh.userData.noRaycast = true;
  mesh.userData.water = true;
  markNoAO(mesh);
  return mesh;
}
