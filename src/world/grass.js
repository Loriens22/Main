// ---------------------------------------------------------------------------
// GPU grass: hundreds of thousands of blades drawn with one instanced draw.
//
// Each instance has a fixed offset inside a square tile. In the vertex shader
// the tile is wrapped around the camera (mod arithmetic), which yields
// world-stable blade positions around the player at zero CPU cost. The
// blade samples the terrain heightfield texture (manual bilinear texelFetch
// on an R32F texture), is masked by slope/water/snow/paint (paths, building
// footprints...), thins out with distance, sways in the wind with gusts and
// bends away from the player. Lighting goes through the standard PBR
// pipeline (shadows, fog, IBL) plus a back-lit translucency term.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { patchMaterial, injectGlobals } from '../render/shaderPatches.js';
import { markNoAO } from '../render/renderer.js';
import { RNG } from '../core/rng.js';

function bladeGeometry() {
  const segs = 4;
  const pos = [], idx = [];
  for (let s = 0; s < segs; s++) {
    const y = s / segs;
    const hw = 0.5 * (1 - Math.pow(y, 1.4));
    pos.push(-hw, y, 0, hw, y, 0);
  }
  pos.push(0, 1, 0);
  for (let s = 0; s < segs - 1; s++) {
    const a = s * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, d, a, d, c);
  }
  const t = segs * 2;
  idx.push(t - 2, t - 1, t);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

const GRASS_PARS = /* glsl */`
attribute vec4 aOffset;
uniform vec3 uCam;
uniform float uTile;
uniform float uRadius;
uniform float uTerrainHalf;
uniform float uTerrainN;
uniform float uTerrainRes;
uniform float uWaterLevel;
uniform float uSnowLine;
uniform float uHeightMul;
uniform float uWidthMul;
uniform sampler2D uHeightTex;
uniform sampler2D uPaintTex;
uniform vec3 uPlayerPos;
uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform vec3 uDryColor;
uniform float uFlowers;
varying vec3 vGrassColor;
varying float vGrassAO;

float gHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float gNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gHash( i ), gHash( i + vec2( 1, 0 ) ), u.x ), mix( gHash( i + vec2( 0, 1 ) ), gHash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
float gFbm( vec2 p ) { return gNoise( p ) * 0.5 + gNoise( p * 2.03 + 7.1 ) * 0.3 + gNoise( p * 4.1 + 3.3 ) * 0.2; }
float terrainH( vec2 p ) {
  vec2 f = ( p + uTerrainHalf ) / uTerrainRes;
  f = clamp( f, vec2( 0.0 ), vec2( uTerrainN - 0.001 ) );
  ivec2 i = ivec2( floor( f ) ); vec2 t = fract( f );
  float a = texelFetch( uHeightTex, i, 0 ).r, b = texelFetch( uHeightTex, i + ivec2( 1, 0 ), 0 ).r;
  float c = texelFetch( uHeightTex, i + ivec2( 0, 1 ), 0 ).r, d = texelFetch( uHeightTex, i + ivec2( 1, 1 ), 0 ).r;
  return t.x >= t.y ? a + ( b - a ) * t.x + ( d - b ) * t.y : a + ( d - c ) * t.x + ( c - a ) * t.y;
}
`;

const GRASS_NORMAL = /* glsl */`
vec2 gCam = uCam.xz;
vec2 gp = gCam + mod( aOffset.xy - gCam + uTile * 0.5, uTile ) - uTile * 0.5;
float gd = length( gp - gCam );
float gh = terrainH( gp );
float ghx = terrainH( gp + vec2( uTerrainRes, 0.0 ) ) - terrainH( gp - vec2( uTerrainRes, 0.0 ) );
float ghz = terrainH( gp + vec2( 0.0, uTerrainRes ) ) - terrainH( gp - vec2( 0.0, uTerrainRes ) );
vec3 gN = normalize( vec3( -ghx, 2.0 * uTerrainRes, -ghz ) );
vec2 gpuv = ( gp + uTerrainHalf ) / ( 2.0 * uTerrainHalf );
vec4 gPaint = textureLod( uPaintTex, gpuv, 0.0 );
float gMask = 1.0 - smoothstep( 0.22, 0.36, 1.0 - gN.y );
gMask *= smoothstep( uWaterLevel + 0.7, uWaterLevel + 1.8, gh );
gMask *= 1.0 - smoothstep( uSnowLine - 25.0, uSnowLine - 5.0, gh );
gMask *= 1.0 - clamp( max( max( gPaint.r, gPaint.g ), max( gPaint.b, gPaint.a ) ) * 1.4, 0.0, 1.0 );
float gKeep = step( aOffset.w, 1.0 - smoothstep( uRadius * 0.25, uRadius, gd ) * 0.92 );
float gFade = 1.0 - smoothstep( uRadius * 0.8, uRadius, gd );
float gInside = step( abs( gp.x ), uTerrainHalf - 2.0 ) * step( abs( gp.y ), uTerrainHalf - 2.0 );
float gS = gMask * gKeep * gFade * gInside;
float gMeadow = smoothstep( 0.45, 0.75, gFbm( gp * 0.012 ) + gFbm( gp * 0.2 + 3.0 ) * 0.15 );
float gR1 = fract( aOffset.w * 17.31 ), gR2 = fract( aOffset.w * 31.77 ), gR3 = fract( aOffset.w * 7.13 ), gR4 = fract( aOffset.w * 53.1 );
float gClump = gFbm( gp * 0.35 );
float bladeH = uHeightMul * ( 0.16 + 0.42 * gR1 * gR1 ) * ( 0.6 + gMeadow * 0.9 + gClump * 0.5 ) * smoothstep( 0.0, 0.35, gS );
float bladeW = uWidthMul * 0.034 * ( 0.6 + 0.8 * gR2 ) * ( 1.0 + smoothstep( 8.0, 50.0, gd ) * 1.6 );
float gAng = aOffset.z;
vec2 gDir = vec2( cos( gAng ), sin( gAng ) );
vec2 gSide = vec2( -gDir.y, gDir.x );
float gY = position.y;
// Wind: travelling waves + gust noise.
float gPhase = dot( gp, uWindDir ) * 0.35 - uGTime * 2.4;
float gWind = ( sin( gPhase ) * 0.5 + 0.5 ) * uWindStrength * 0.7 + gNoise( gp * 0.06 - uWindDir * uGTime * 0.5 ) * uWindStrength;
vec2 gBend = uWindDir * gWind * 0.55 + gDir * ( gR3 - 0.5 ) * 0.35;
// Bend away from the player.
vec2 gAway = gp - uPlayerPos.xz; float gPd = length( gAway );
float gPush = ( 1.0 - smoothstep( 0.15, 0.9, gPd ) ) * step( abs( uPlayerPos.y - gh ), 1.6 );
gBend += ( gPd > 0.001 ? gAway / gPd : vec2( 0.0 ) ) * gPush * 1.1;
float gCurve = gY * gY;
objectNormal = normalize( vec3( gDir.x, 0.0, gDir.y ) + vec3( gSide.x, 0.0, gSide.y ) * position.x * 2.2 + vec3( 0.0, 0.6, 0.0 ) );
objectNormal = normalize( mix( objectNormal, gN, 0.55 + smoothstep( 10.0, 40.0, gd ) * 0.35 ) );
// Colour.
vec3 gBase = uBaseColor * ( 0.7 + 0.5 * gR2 );
vec3 gTip = mix( uTipColor, uDryColor, clamp( gMeadow * 0.5 + ( gR4 - 0.5 ) * 0.35 + gClump * 0.15, 0.0, 0.85 ) );
gTip *= 0.8 + 0.4 * gR1;
vGrassColor = mix( gBase, gTip, smoothstep( 0.0, 0.75, gY ) );
float gFlower = step( gR4, uFlowers * ( 0.3 + gMeadow ) ) * step( 0.82, gY );
vec3 gFlowerCol = gR3 < 0.25 ? vec3( 0.95, 0.95, 0.9 ) : gR3 < 0.5 ? vec3( 1.0, 0.8, 0.1 ) : gR3 < 0.75 ? vec3( 0.55, 0.25, 0.8 ) : vec3( 0.9, 0.15, 0.1 );
vGrassColor = mix( vGrassColor, gFlowerCol, gFlower );
vGrassAO = mix( 0.5, 1.0, gY );
`;

const GRASS_BEGIN = /* glsl */`
vec3 transformed = vec3( gp.x, gh, gp.y );
float gw = gFlower > 0.5 ? bladeW * 2.5 : bladeW;
transformed.xz += gSide * position.x * gw;
transformed.y += gY * bladeH * ( 1.0 - length( gBend ) * 0.25 * gCurve );
transformed.xz += gBend * gCurve * bladeH;
`;

export class GrassLayer {
  constructor(terrain, opts = {}) {
    this.terrain = terrain;
    const count = opts.count || 60000;
    this.radius = opts.radius || 40;
    const tile = this.radius * 2;
    const geo = bladeGeometry();
    const rng = new RNG(opts.seed || 7);
    const offs = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      offs[i * 4] = rng.next() * tile;
      offs[i * 4 + 1] = rng.next() * tile;
      offs[i * 4 + 2] = rng.next() * Math.PI * 2;
      offs[i * 4 + 3] = rng.next();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 4));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = {
      uCam: { value: new THREE.Vector3() },
      uTile: { value: tile },
      uRadius: { value: this.radius },
      uTerrainHalf: { value: terrain.half },
      uTerrainN: { value: terrain.N },
      uTerrainRes: { value: terrain.res },
      uWaterLevel: { value: terrain.waterLevel },
      uSnowLine: { value: terrain.snowLine },
      uHeightMul: { value: opts.height || 1 },
      uWidthMul: { value: opts.width || 1 },
      uHeightTex: { value: terrain.heightTex },
      uPaintTex: { value: terrain.paintTex },
      uPlayerPos: { value: new THREE.Vector3(0, -1000, 0) },
      uBaseColor: { value: new THREE.Color(opts.baseColor || 0x28461a) },
      uTipColor: { value: new THREE.Color(opts.tipColor || 0x5f8c2a) },
      uDryColor: { value: new THREE.Color(opts.dryColor || 0x968a46) },
      uFlowers: { value: opts.flowers ?? 0.025 },
      uTranslucentColor: { value: new THREE.Color(opts.translucent || 0x9acd4a).multiplyScalar(0.5) },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
    mat.defines = { TRANSLUCENT: '' };
    if (opts.emissive) { mat.emissive = new THREE.Color(opts.emissive); mat.emissiveIntensity = opts.emissiveIntensity || 0.4; }
    const U = this.uniforms;
    patchMaterial(mat, (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + GRASS_PARS)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );\n' + GRASS_NORMAL)
        .replace('#include <begin_vertex>', GRASS_BEGIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassColor;\nvarying float vGrassAO;')
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'))
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGrassColor;')
        .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= vGrassAO; reflectedLight.directDiffuse *= mix( 0.6, 1.0, vGrassAO );');
    }, 'grass-blades');
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.userData.noRaycast = true;
    markNoAO(this.mesh);
  }

  update(camPos, playerPos) {
    this.uniforms.uCam.value.copy(camPos);
    if (playerPos) this.uniforms.uPlayerPos.value.copy(playerPos);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export { injectGlobals };
