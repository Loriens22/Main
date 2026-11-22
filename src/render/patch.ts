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
  /** direct sunlight colour x intensity (for translucency and hand-written shaders) */
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  /** wind: xy = horizontal direction (x, z), z = time, w = strength 0..1+ */
  uWind: { value: new THREE.Vector4(0.8, 0.6, 0, 0.25) },
  /** player position (foliage parts around it) */
  uPlayer: { value: new THREE.Vector3(0, -1000, 0) },
  /** bounce light inside enclosed spaces (where the baked sky visibility is low) */
  uAmbientIn: { value: new THREE.Color(0.035, 0.032, 0.03) },
  /** colour x intensity of the artificial lighting baked into vertex alpha (facility / spacecraft interiors) */
  uBakedLight: { value: new THREE.Color(1.0, 0.96, 0.9) },
  /** a body of water: x on (0/1), y surface height (world y), z extinction along a path (1/m), w downwelling-light
   *  attenuation with depth (1/m) */
  uWater: { value: new THREE.Vector4(0, 0, 0.06, 0.05) },
  /** the water's own colour (in-scattered light just under the surface) */
  uWaterCol: { value: new THREE.Color(0.06, 0.12, 0.13) },
  /** horizontal extent of the water: x, z centre and radius (radius 0: everywhere); w: curvature 1 / 2R of the surface */
  uWaterReg: { value: new THREE.Vector4(0, 0, 0, 0) },
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
varying vec4 vVAO;
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
  vVAO = color;
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
uniform vec3 uAmbientIn;
uniform vec3 uBakedLight;
uniform vec4 uWater;
uniform vec3 uWaterCol;
uniform vec4 uWaterReg;
#ifdef USE_VAO
varying vec4 vVAO;
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
  // R = local occlusion, B = baked visibility of the environment (sky + ground bounce).
  float vao = mix( 1.0, vVAO.r, uSurf.z );
  float vis = vVAO.b;
  reflectedLight.indirectDiffuse *= vao * vis;
  reflectedLight.indirectDiffuse += uAmbientIn * material.diffuseColor * ( vao * ( 1.0 - vis ) );
  reflectedLight.indirectSpecular *= mix( 0.05, 1.0, vis ) * mix( 1.0, vao, 0.85 );
  reflectedLight.directDiffuse *= mix( 1.0, vao, 0.3 );
  // A = 1 - sqrt(E): artificial light baked in Blender for large interiors
  float bl = 1.0 - vVAO.a;
  bl *= bl;
  reflectedLight.indirectDiffuse += uBakedLight * material.diffuseColor * ( bl * 3.2 );
  reflectedLight.indirectSpecular += uBakedLight * material.specularColor * ( bl * 0.9 * ( 1.0 - 0.6 * material.roughness ) );
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
  float dist = length( toFrag );
  vec3 dir = toFrag / max( dist, 1e-4 );
  float fa = skyFogAmount( cameraPosition, toFrag );
  vec3 fogged = mix( gl_FragColor.rgb, skyFogColor( dir ), fa );
  bool inReg = uWaterReg.z <= 0.0 || length( vWPos.xz - uWaterReg.xy ) < uWaterReg.z;
  if ( uWater.x > 0.5 && inReg ) {
    // the water surface follows the planet's curve (uWaterReg.w = 1 / 2R, drop measured from the zone origin)
    float sY = uWater.y - dot( vWPos.xz, vWPos.xz ) * uWaterReg.w;
    float cY = uWater.y - dot( cameraPosition.xz, cameraPosition.xz ) * uWaterReg.w;
    bool camIn = cameraPosition.y < cY;
    float dep = max( 0.0, sY - vWPos.y );
    // from above, knee-deep water is left to the sea surface's own shading; deeper water darkens and closes in
    float wgt = camIn ? 1.0 : smoothstep( 0.8, 3.0, dep );
    if ( wgt > 0.0 ) {
      // the stretch of the view ray that runs through water
      float inW = camIn ? ( vWPos.y < sY ? dist : min( dist, ( cY - cameraPosition.y ) / max( dir.y, 1e-3 ) ) )
                        : min( dist, dep / max( -dir.y, 1e-3 ) );
      // red goes first: what reaches a surface at depth is blue-green, and dimmer (seen from inside the water the
      // scene light itself is dimmed by the camera's depth: see the zone's underwater state)
      vec3 absorb = exp( -dep * uWater.w * vec3( 2.2, 1.0, 0.75 ) );
      vec3 lit = gl_FragColor.rgb;
      #if defined( USE_EMISSIVEMAP ) || defined( STANDARD )
        vec3 emis = totalEmissiveRadiance;
        lit = ( lit - emis ) * ( camIn ? vec3( 1.0 ) : absorb ) + emis;
      #else
        lit = lit * ( camIn ? vec3( 1.0 ) : absorb );
      #endif
      float a = 1.0 - exp( -uWater.z * inW );
      float camDep = max( 0.0, cY - min( cameraPosition.y, vWPos.y ) );
      vec3 wc = uWaterCol * exp( -camDep * uWater.w * vec3( 1.6, 0.95, 0.8 ) );
      // inside the water: brighter toward the light above
      if ( camIn ) wc *= 1.0 + 0.8 * pow( max( dir.y, 0.0 ), 1.5 );
      vec3 wr = mix( lit * exp( -inW * uWater.z * 0.35 * vec3( 1.8, 0.9, 0.7 ) ), wc, a );
      if ( !camIn ) wr = mix( wr, skyFogColor( dir ), fa );
      gl_FragColor.rgb = mix( fogged, wr, wgt );
    } else gl_FragColor.rgb = fogged;
  } else gl_FragColor.rgb = fogged;
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
      uDustColor: W.uDustColor, uWearP: { value: wearP }, uEdgeColor: { value: edgeColor }, uAmbientIn: W.uAmbientIn, uBakedLight: W.uBakedLight,
      uWater: W.uWater, uWaterCol: W.uWaterCol, uWaterReg: W.uWaterReg,
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
