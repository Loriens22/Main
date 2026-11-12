import * as THREE from 'three';

/**
 * Shared uniforms injected into every world material:
 *  - sky-coloured exponential height fog (aerial perspective that matches the sky dome),
 *  - baked per-vertex ambient occlusion / convexity (from Blender) for grounding, edge wear and cavity dirt,
 *  - global dust deposition (storms) on upward-facing surfaces.
 */
export const W = {
  uFogH: { value: new THREE.Color(0.6, 0.62, 0.6) },
  uFogZ: { value: new THREE.Color(0.35, 0.45, 0.6) },
  uFogSun: { value: new THREE.Color(1.0, 0.85, 0.6) },
  uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.4).normalize() },
  /** x density (1/m), y height falloff (1/m), z base height (world y), w sun glow exponent */
  uFogP: { value: new THREE.Vector4(0.00012, 0.0012, 0, 8) },
  /** x dust deposit 0..1, y unused, z vertex-AO strength, w time */
  uSurf: { value: new THREE.Vector4(0, 0, 1, 0) },
  uDustColor: { value: new THREE.Color(0.52, 0.45, 0.34) },
  /** x: extra flat ambient multiplier for interiors (unused by default) */
  uMisc: { value: new THREE.Vector4(1, 0, 0, 0) },
};

export interface SurfaceParams {
  /** edge wear strength (convex edges blend toward edgeColor) */
  wear?: number;
  /** cavity dirt strength */
  dirt?: number;
  edgeColor?: THREE.ColorRepresentation;
  /** how much deposited dust shows on this material (glass shows it as haze) */
  dust?: number;
  glass?: boolean;
}

const VERT_PARS = /* glsl */ `
varying vec3 vWPos;
#ifdef USE_VAO
attribute vec4 color;
varying vec3 vVAO;
#endif
`;

const VERT_MAIN = /* glsl */ `
{
  vec4 wpw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    wpw = instanceMatrix * wpw;
  #endif
  vWPos = ( modelMatrix * wpw ).xyz;
}
#ifdef USE_VAO
  vVAO = color.rgb;
#endif
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vWPos;
uniform vec3 uFogH;
uniform vec3 uFogZ;
uniform vec3 uFogSun;
uniform vec3 uSunDir;
uniform vec4 uFogP;
uniform vec4 uSurf;
uniform vec3 uDustColor;
uniform vec4 uWearP; // wear, dirt, dust, glass
uniform vec3 uEdgeColor;
#ifdef USE_VAO
varying vec3 vVAO;
#endif
`;

// Runs after normal_fragment_maps: diffuseColor, roughnessFactor, metalnessFactor and normal are final.
const FRAG_SURFACE = /* glsl */ `
#ifdef USE_VAO
{
  float cvx = vVAO.g * 2.0 - 1.0;
  float cav = clamp( -cvx * 1.6, 0.0, 1.0 ) * 0.55 + ( 1.0 - vVAO.r ) * 0.75;
  float dirtAmt = clamp( cav * uWearP.y, 0.0, 0.85 );
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.42, 0.38, 0.33 ), dirtAmt );
  roughnessFactor = mix( roughnessFactor, max( roughnessFactor, 0.85 ), dirtAmt );
  float edge = smoothstep( 0.1, 0.45, cvx ) * uWearP.x;
  diffuseColor.rgb = mix( diffuseColor.rgb, uEdgeColor, edge );
  roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.75, edge );
}
#endif
{
  vec3 wn = inverseTransformDirection( normal, viewMatrix );
  float dustAmt = uSurf.x * uWearP.z * smoothstep( 0.15, 0.85, wn.y );
  if ( uWearP.w > 0.5 ) {
    // glass: dust reads as a diffuse haze that also kills the sheen
    float ndv = clamp( abs( dot( normal, normalize( vViewPosition ) ) ), 0.0, 1.0 );
    float fres = pow( 1.0 - ndv, 3.0 );
    float haze = uSurf.x * uWearP.z * 0.55;
    diffuseColor.a = clamp( mix( diffuseColor.a, 1.0, fres * 0.85 ) + haze, 0.0, 1.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, uDustColor, haze );
    roughnessFactor = mix( roughnessFactor, 0.9, haze );
  } else {
    diffuseColor.rgb = mix( diffuseColor.rgb, uDustColor, dustAmt * 0.8 );
    roughnessFactor = mix( roughnessFactor, 0.95, dustAmt );
    metalnessFactor *= 1.0 - dustAmt;
  }
}
`;

const FRAG_AO = /* glsl */ `
#ifdef USE_VAO
{
  float vao = mix( 1.0, vVAO.r, uSurf.z );
  reflectedLight.indirectDiffuse *= vao;
  reflectedLight.indirectSpecular *= mix( 1.0, vao, 0.85 );
  reflectedLight.directDiffuse *= mix( 1.0, vao, 0.3 );
}
#endif
`;

export const FOG_GLSL = /* glsl */ `
vec3 skyFogColor( vec3 dir ) {
  float up = clamp( dir.y, 0.0, 1.0 );
  vec3 c = mix( uFogH, uFogZ, pow( up, 0.45 ) );
  float s = pow( max( dot( dir, uSunDir ), 0.0 ), uFogP.w );
  return c + uFogSun * s;
}
float skyFogAmount( vec3 camPos, vec3 toFrag ) {
  float dist = length( toFrag );
  float hf = uFogP.y;
  float t = hf * toFrag.y;
  float integ = abs( t ) > 1e-3 ? ( 1.0 - exp( -t ) ) / t : 1.0 - 0.5 * t;
  float base = exp( -hf * clamp( camPos.y - uFogP.z, -400.0, 60000.0 ) );
  return 1.0 - exp( -uFogP.x * dist * base * integ );
}
`;

const FRAG_FOG = /* glsl */ `
#ifdef USE_SKYFOG
{
  vec3 toFrag = vWPos - cameraPosition;
  float fa = skyFogAmount( cameraPosition, toFrag );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, skyFogColor( normalize( toFrag ) ), fa );
}
#endif
`;

/** Patch a built-in lit material (Standard / Physical / Lambert) with the shared world shading. */
export function patchWorldMaterial<T extends THREE.Material>(m: T, p: SurfaceParams = {}, opts: { vao?: boolean; fog?: boolean } = {}): T {
  const mm = m as any;
  mm.defines = { ...(mm.defines || {}) };
  if (opts.vao) mm.defines.USE_VAO = '';
  if (opts.fog !== false) mm.defines.USE_SKYFOG = '';
  const wearP = new THREE.Vector4(p.wear ?? 0, p.dirt ?? 0.6, p.dust ?? 1, p.glass ? 1 : 0);
  const edgeColor = new THREE.Color(p.edgeColor ?? 0x9a9a9a);
  mm.userData.wearP = wearP;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    Object.assign(shader.uniforms, {
      uFogH: W.uFogH, uFogZ: W.uFogZ, uFogSun: W.uFogSun, uSunDir: W.uSunDir, uFogP: W.uFogP, uSurf: W.uSurf,
      uDustColor: W.uDustColor, uWearP: { value: wearP }, uEdgeColor: { value: edgeColor },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS + FOG_GLSL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_SURFACE)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + FRAG_AO)
      .replace('#include <fog_fragment>', FRAG_FOG);
  };
  // Distinct cache key per patch flavour (defines already participate in the program key).
  const baseKey = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => 'world|' + (baseKey ? baseKey() : '');
  return m;
}

/** Fog uniforms + GLSL for hand-written ShaderMaterials (terrain, ocean, vegetation). */
export function fogUniforms() {
  return { uFogH: W.uFogH, uFogZ: W.uFogZ, uFogSun: W.uFogSun, uSunDir: W.uSunDir, uFogP: W.uFogP, uSurf: W.uSurf, uDustColor: W.uDustColor };
}

export const FOG_UNIFORM_DECL = /* glsl */ `
uniform vec3 uFogH;
uniform vec3 uFogZ;
uniform vec3 uFogSun;
uniform vec3 uSunDir;
uniform vec4 uFogP;
uniform vec4 uSurf;
uniform vec3 uDustColor;
`;
