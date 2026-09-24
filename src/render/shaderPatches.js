// Global shader patches applied to three.js' built-in shader chunks.
//
// 1. Atmospheric height fog with sun in-scattering. Stock three.js fog is a
//    pure function of view depth. We replace it with exponential *height*
//    fog (denser in valleys, thinner on mountain tops) whose colour shifts
//    toward the sun colour when looking toward the sun. This single change
//    gives a large boost in perceived realism ("aerial perspective").
// 2. Weather response: snow cover accumulates on up-facing surfaces and rain
//    makes everything darker and glossier - for every standard material at
//    once, without touching individual materials.
// 3. Optional wrap-lighting subsurface approximation for skin (SKIN_SSS)
//    and back-lit translucency for leaves / grass (TRANSLUCENT).
//
// Global uniforms are injected into every material via a default
// Material.prototype.onBeforeCompile. Materials that need their own
// onBeforeCompile call injectGlobals(shader) themselves.

import * as THREE from 'three';

export const globalUniforms = {
  uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
  uFogHeightFalloff: { value: 0.012 },
  uFogBaseHeight: { value: 0 },
  uGTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(1, 0.35).normalize() },
  uWindStrength: { value: 0.5 },
  uWetness: { value: 0 },
  uSnowCover: { value: 0 },
  uSSSStrength: { value: 1 },
};

export function injectGlobals(shader) {
  for (const k in globalUniforms) shader.uniforms[k] = globalUniforms[k];
}

let patched = false;
export function applyShaderPatches() {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk;

  // Declarations for global uniforms usable from any vertex/fragment patch.
  C.common = C.common + `
uniform float uGTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
`;

  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif
`;
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // World position reconstructed from view space: view matrices are rigid,
  // so the inverse rotation is the transpose.
  vFogWorldPos = transpose( mat3( viewMatrix ) ) * mvPosition.xyz + cameraPosition;
#endif
`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  uniform vec3 uFogSunDir;
  uniform vec3 uFogSunColor;
  uniform float uFogHeightFalloff;
  uniform float uFogBaseHeight;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  vec3 fogRay = vFogWorldPos - cameraPosition;
  float fogDist = length( fogRay );
  vec3 fogDir = fogRay / max( fogDist, 1e-4 );
  #ifdef FOG_EXP2
    float fogAmount;
    if ( uFogHeightFalloff > 0.0 ) {
      // Analytic integral of density * exp(-falloff * height) along the view ray.
      float y0 = cameraPosition.y - uFogBaseHeight;
      float t = uFogHeightFalloff * fogRay.y;
      float integ = exp( -uFogHeightFalloff * max( y0, -50.0 ) ) * ( abs( t ) > 1e-4 ? ( 1.0 - exp( -t ) ) / t : 1.0 );
      fogAmount = 1.0 - exp( -fogDensity * fogDist * integ );
    } else {
      fogAmount = 1.0 - exp( - fogDensity * fogDensity * fogDist * fogDist );
    }
  #else
    float fogAmount = smoothstep( fogNear, fogFar, fogDist );
  #endif
  float fogSun = pow( max( dot( fogDir, uFogSunDir ), 0.0 ), 6.0 );
  vec3 fogCol = mix( fogColor, uFogSunColor, fogSun );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, clamp( fogAmount, 0.0, 1.0 ) );
#endif
`;

  // Weather + custom light terms in the physical lighting model.
  C.lights_physical_pars_fragment = /* glsl */`
uniform float uSnowCover;
uniform float uWetness;
uniform float uSSSStrength;
#ifdef SKIN_SSS
  uniform vec3 uSSSColor;
#endif
#ifdef TRANSLUCENT
  uniform vec3 uTranslucentColor;
#endif
` + C.lights_physical_pars_fragment.replace(
    'vec3 irradiance = dotNL * directLight.color;',
    /* glsl */`vec3 irradiance = dotNL * directLight.color;
	#ifdef SKIN_SSS
		// Wrap lighting: light bleeds past the terminator with a reddish tint.
		float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.45 ) / 1.45 );
		reflectedLight.directDiffuse += ( wrapNL - dotNL ) * directLight.color * uSSSColor * uSSSStrength * BRDF_Lambert( material.diffuseColor );
	#endif
	#ifdef TRANSLUCENT
		float backNL = saturate( dot( -geometryNormal, directLight.direction ) );
		float viewScatter = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), 3.0 );
		reflectedLight.directDiffuse += ( backNL * 0.6 + viewScatter * 0.8 ) * directLight.color * uTranslucentColor * BRDF_Lambert( material.diffuseColor );
	#endif`);

  C.lights_physical_fragment = /* glsl */`
#ifndef NO_WEATHER
{
  vec3 weatherN = inverseTransformDirection( normal, viewMatrix );
  float weatherUp = smoothstep( 0.3, 0.85, weatherN.y );
  float snowAmt = uSnowCover * weatherUp;
  if ( snowAmt > 0.001 ) {
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.89, 0.93 ), snowAmt );
    roughnessFactor = mix( roughnessFactor, 0.7, snowAmt );
    metalnessFactor *= 1.0 - snowAmt;
  }
  if ( uWetness > 0.001 ) {
    float wetAmt = uWetness * ( 0.35 + 0.65 * weatherUp ) * ( 1.0 - snowAmt );
    diffuseColor.rgb *= 1.0 - 0.3 * wetAmt;
    roughnessFactor = mix( roughnessFactor, 0.1, wetAmt * 0.75 );
  }
}
#endif
` + C.lights_physical_fragment;

  // Default hook: every material gets the global uniforms.
  THREE.Material.prototype.onBeforeCompile = function (shader) { injectGlobals(shader); };
}

// Helper to chain a custom onBeforeCompile while keeping global uniform injection.
export function patchMaterial(material, fn, cacheKey) {
  material.onBeforeCompile = (shader, renderer) => {
    injectGlobals(shader);
    fn(shader, renderer);
  };
  // The wrapper arrow function has identical source text for every caller, so the
  // program cache key must come from the patch itself or programs get mixed up.
  const key = cacheKey || fn.toString();
  material.customProgramCacheKey = () => key;
  return material;
}
