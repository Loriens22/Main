import * as THREE from 'three';

/**
 * Shell-texture fur. One InstancedBufferGeometry per furry mesh draws every shell in a
 * single draw call (instanced attribute `shell`). The opaque base layer is drawn by a
 * second mesh sharing the same vertex buffers (instanceCount 1, shell = 0) so that it can
 * write depth while the translucent shells do not.
 *
 * Works on SkinnedMesh (three injects USE_SKINNING + bone texture for any material) and on
 * plain meshes (the skinning chunks compile out).
 */

export interface FurUniforms {
  [k: string]: THREE.IUniform;
  uShellCount: THREE.IUniform<number>;
  uFurLength: THREE.IUniform<number>;
  uGravity: THREE.IUniform<THREE.Vector3>;
  uInertia: THREE.IUniform<THREE.Vector3>;
  uTime: THREE.IUniform<number>;
  uStrandTex: THREE.IUniform<THREE.Texture>;
  uDensity: THREE.IUniform<number>;
  uRootColor: THREE.IUniform<THREE.Color>;
  uBaseColor: THREE.IUniform<THREE.Color>;
  uTipColor: THREE.IUniform<THREE.Color>;
  uKeyDir: THREE.IUniform<THREE.Vector3>;
  uKeyColor: THREE.IUniform<THREE.Color>;
  uRimDir: THREE.IUniform<THREE.Vector3>;
  uRimColor: THREE.IUniform<THREE.Color>;
  uSkyColor: THREE.IUniform<THREE.Color>;
  uGroundColor: THREE.IUniform<THREE.Color>;
  uTint: THREE.IUniform<THREE.Color>;
  uSaturation: THREE.IUniform<number>;
  uBrightness: THREE.IUniform<number>;
  uSheen: THREE.IUniform<number>;
  uRimStrength: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uWarmLightPos: THREE.IUniform<THREE.Vector3>;
  uWarmLight: THREE.IUniform<number>;
  uKnitScale: THREE.IUniform<THREE.Vector2>;
}

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>

attribute float shell;
attribute vec3 restPos;
attribute float furLen;
attribute float aoAttr;

uniform float uShellCount;
uniform float uFurLength;
uniform vec3 uGravity;
uniform vec3 uInertia;
uniform float uTime;

varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vWorldPos;
varying float vH;
varying float vAO;
varying float vFurLen;
varying vec2 vUv;
#ifdef USE_KNIT
attribute vec2 knitZone;
varying vec2 vKnit;
#endif

void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>

  vec3 n = normalize(objectNormal);
  float h = shell / max(uShellCount, 1.0);
  float len = uFurLength * furLen;
  // Strands droop with gravity and trail behind motion; bending grows with h^2.
  vec3 bendDir = uGravity + uInertia;
  bendDir -= n * dot(bendDir, n) * 0.6;
  float wob = sin(uTime * 2.3 + restPos.x * 7.0 + restPos.y * 5.0) * 0.08;
  vec3 disp = n * len * h + (bendDir + n * wob) * len * h * h;
  transformed += disp;

  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mv;
  vViewPos = mv.xyz;
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNormalV = normalize(normalMatrix * n);
  vRest = restPos;
  vRestN = normal;
  vH = h;
  vAO = aoAttr;
  vFurLen = furLen;
  vUv = uv;
  #ifdef USE_KNIT
  vKnit = knitZone;
  #endif
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uStrandTex;
uniform float uDensity;
uniform vec3 uRootColor;
uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uRimDir;
uniform vec3 uRimColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uTint;
uniform float uSaturation;
uniform float uBrightness;
uniform float uSheen;
uniform float uRimStrength;
uniform float uOpacity;
uniform vec3 uWarmLightPos;
uniform float uWarmLight;
uniform vec2 uKnitScale;

varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vWorldPos;
varying float vH;
varying float vAO;
varying float vFurLen;
varying vec2 vUv;
#ifdef USE_KNIT
varying vec2 vKnit;
#endif

vec4 strandSample(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(8.0));
  w /= (w.x + w.y + w.z + 1e-5);
  vec4 a = texture2D(uStrandTex, p.yz * uDensity);
  vec4 b = texture2D(uStrandTex, p.zx * uDensity + vec2(0.37, 0.11));
  vec4 c = texture2D(uStrandTex, p.xy * uDensity + vec2(0.71, 0.53));
  return a * w.x + b * w.y + c * w.z;
}

void main() {
  float h = vH;
  vec4 st = strandSample(vRest, normalize(vRestN));
  float strand = st.r;
  float lenF = mix(0.55, 1.0, st.b);

  float alpha = 1.0;
  if (h > 0.0) {
    // Each strand has its own length; it thins towards its tip (cone profile).
    float hn = h / lenF;
    float hair = smoothstep(hn * 0.82 - 0.04, hn * 0.82 + 0.1, strand) * (1.0 - smoothstep(0.92, 1.0, hn));
    // Dense undercoat close to the skin so the pelt never looks sparse.
    float under = 1.0 - smoothstep(0.08, 0.34, h);
    alpha = max(hair, under);
    alpha *= 1.0 - h * 0.3;
    if (alpha < 0.03) discard;
  }

  float knit = 1.0;
  #ifdef USE_KNIT
    float ku = vUv.x;
    // Sides: stockinette "V" stitches.
    vec2 k = vec2(ku * uKnitScale.x, vUv.y * uKnitScale.y);
    float row = fract(k.y);
    float colx = fract(k.x) * 2.0 - 1.0;
    float vv = abs(colx) - (row - 0.5) * 0.9;
    float side = mix(0.6, 1.1, smoothstep(0.55, 0.0, abs(vv)));
    // Crown: radial ribs converging on the centre nub.
    float ribs = 0.5 + 0.5 * cos(ku * 6.2831853 * 28.0);
    float crownK = mix(0.5, 1.25, smoothstep(0.1, 0.9, ribs));
    // Rolled band: fine vertical ribbing.
    float bandRibs = 0.5 + 0.5 * cos(ku * 6.2831853 * 80.0);
    float bandK = mix(0.45, 1.2, smoothstep(0.15, 0.85, bandRibs));
    knit = mix(mix(side, crownK, vKnit.y), bandK, vKnit.x);
  #endif

  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  vec3 L = normalize(uKeyDir);

  // Wrap diffuse for soft, light-scattering fur.
  float wrap = 0.42;
  float diff = clamp((dot(N, L) + wrap) / (1.0 + wrap), 0.0, 1.0);
  diff = diff * diff * (3.0 - 2.0 * diff);

  // Root-to-tip colour + self-occlusion.
  float hv = clamp(h, 0.0, 1.0);
  float ao = mix(0.55, 1.0, pow(hv, 0.6)) * vAO;
  vec3 col = mix(uRootColor, uBaseColor, smoothstep(0.0, 0.5, hv));
  col = mix(col, uTipColor, smoothstep(0.55, 1.0, hv) * (0.25 + 0.35 * st.g));
  col *= mix(0.94, 1.06, st.g);
  col *= knit;

  // Kajiya-Kay style sheen with the strand tangent ~= shell normal.
  vec3 H = normalize(L + V);
  float tdh = dot(N, H);
  float sinTH = sqrt(max(0.0, 1.0 - tdh * tdh));
  float spec = pow(sinTH, 18.0) * uSheen * (0.25 + 0.75 * hv);

  vec3 hemi = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
  vec3 lit = col * (hemi * 0.5 + uKeyColor * diff * 1.05) * ao;
  lit += uKeyColor * spec * mix(col, vec3(1.0), 0.35) * diff;

  // Velvet rim: fur catches back light at grazing angles.
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 2.2);
  float rimL = clamp(dot(N, normalize(uRimDir)) * 0.5 + 0.6, 0.0, 1.0);
  lit += uRimColor * fres * rimL * uRimStrength * (0.35 + 0.65 * hv) * mix(col, vec3(1.0), 0.5);

  // Warm point light (Sparky's flame).
  vec3 toW = uWarmLightPos - vWorldPos;
  float dW = length(toW);
  float warm = uWarmLight * max(0.0, 1.0 - dW / 260.0);
  lit += vec3(1.0, 0.45, 0.12) * warm * col * (0.4 + 0.6 * clamp(dot(N, normalize(toW)) * 0.5 + 0.5, 0.0, 1.0));

  // Emotion grading.
  float luma = dot(lit, vec3(0.299, 0.587, 0.114));
  lit = mix(vec3(luma), lit, uSaturation) * uTint * uBrightness;

  gl_FragColor = vec4(lit, alpha * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;

export function createFurUniforms(opts: {
  strandTex: THREE.Texture;
  density: number;
  furLength: number;
  root: string;
  base: string;
  tip: string;
  sheen: number;
  knitScale?: [number, number];
}): FurUniforms {
  return {
    uShellCount: { value: 24 },
    uFurLength: { value: opts.furLength },
    uGravity: { value: new THREE.Vector3(0, -0.35, 0) },
    uInertia: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uStrandTex: { value: opts.strandTex },
    uDensity: { value: opts.density },
    uRootColor: { value: new THREE.Color(opts.root) },
    uBaseColor: { value: new THREE.Color(opts.base) },
    uTipColor: { value: new THREE.Color(opts.tip) },
    uKeyDir: { value: new THREE.Vector3(-0.45, 0.75, 0.55).normalize() },
    uKeyColor: { value: new THREE.Color(1.0, 0.95, 0.88) },
    uRimDir: { value: new THREE.Vector3(0.6, 0.35, -0.7).normalize() },
    uRimColor: { value: new THREE.Color(0.75, 0.88, 1.0) },
    uSkyColor: { value: new THREE.Color(0.86, 0.92, 1.0) },
    uGroundColor: { value: new THREE.Color(0.36, 0.33, 0.42) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uSaturation: { value: 1 },
    uBrightness: { value: 1 },
    uSheen: { value: opts.sheen },
    uRimStrength: { value: 1 },
    uOpacity: { value: 1 },
    uWarmLightPos: { value: new THREE.Vector3(0, 0, -99999) },
    uWarmLight: { value: 0 },
    uKnitScale: { value: new THREE.Vector2(...(opts.knitScale ?? [1, 1])) },
  };
}

export function createFurMaterials(uniforms: FurUniforms, knit = false) {
  const defines: Record<string, string> = {};
  if (knit) defines.USE_KNIT = '';
  const base = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
  });
  const shells = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  return { base, shells };
}

/**
 * Build the base (1 instance) and shell (N instances) geometries sharing vertex buffers.
 * `src` must carry position, normal, uv, restPos, furLen, aoAttr (+ skinIndex/skinWeight).
 */
export function makeFurGeometries(src: THREE.BufferGeometry, maxShells: number) {
  const mk = (shellValues: number[]) => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = src.index;
    for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.attributes[name]);
    g.setAttribute('shell', new THREE.InstancedBufferAttribute(new Float32Array(shellValues), 1));
    g.instanceCount = shellValues.length;
    g.boundingSphere = src.boundingSphere?.clone() ?? null;
    return g;
  };
  const base = mk([0]);
  const shellVals: number[] = [];
  for (let i = 1; i <= maxShells; i++) shellVals.push(i);
  const shells = mk(shellVals);
  return { base, shells };
}
