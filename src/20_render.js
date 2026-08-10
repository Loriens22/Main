/* ==========================================================================
   ISLAND PROTOCOL: PRESIDENTIAL EXTRACTION
   20_render.js - IP.Renderer : WebGL2 / GLSL ES 3.00 deferred-ish forward+
                  renderer with PBR, CSM, SSAO, volumetrics, procedural
                  GPU-synthesised material library, HDR post stack.

   Owner: Agent C. Exposes ONLY IP.Renderer.

   PIPELINE (per frame, in order)
     0. cull + bucket + sort draw lists            (zero heap allocation)
     1. cascaded shadow maps (1/2/3 cascades by quality)
     2. depth prepass into the HDR FBO depth attachment  (quality >= 1)
     3. SSAO (half res) + bilateral blur           (quality >= 1)
     4. opaque forward+ PBR pass (LEQUAL, depth write off if prepass ran)
     5. skybox from the prefiltered procedural environment cubemap
     6. volumetric light shafts (half res, dithered, temporally jittered)
        additively blitted into the HDR target     (quality == 2)
     7. depth blit -> depthCopy (so transparent/sprite passes can sample it)
     8. transparent pass, back-to-front, depth-test / no depth-write
     9. GPU-instanced sprite/particle pass (alpha batch then additive batch)
    10. luminance downsample -> 1x1 -> temporal adaptation (auto exposure)
    11. bright pass -> 3-mip separable gaussian bloom
    12. composite: bloom + ACES + grade + CA + vignette + grain + rain lens
        + hurt / flashbang / lightning -> backbuffer

   HARD RULES OBEYED: no modules, no external assets, no network, single IIFE,
   ASCII only, node --check clean, nothing touched on window.
   ========================================================================== */
var IP = (typeof IP !== 'undefined' && IP) || {};
(function () {
  'use strict';

  var M4 = IP.M4, V3 = IP.V3, Q = IP.Q, Util = IP.Util, Noise = IP.Noise, Rand = IP.Rand;

  /* ======================================================================
     CONSTANTS / TUNING
     ====================================================================== */

  var MAX_LIGHTS = 48;          // hard cap, matches the std140 Lights block
  var MAX_VOL_LIGHTS = 4;       // point lights that contribute to volumetrics
  var MAX_DRAWS = 4096;         // per-frame draw item capacity (opaque+shadow)
  var MAX_TRANSPARENT = 1024;
  var MAX_SPRITES = 8192;       // per blend batch
  var SPRITE_STRIDE = 12;       // floats per sprite instance
  var TEXGEN_SIZE = 512;        // procedural material array resolution
  var TEX_LAYERS = 14;
  var ENV_SIZE = 128;           // environment cubemap face size
  var ENV_MIPS = 6;             // 128,64,32,16,8,4  (last mip ~ irradiance)
  var SSAO_KERNEL = 20;
  var VOL_STEPS_HI = 24;

  /* Material texture id -> array layer. Order is load-bearing: it must match
     the if/else chain inside the texgen fragment shader. */
  var TEX_IDS = ['none', 'concrete', 'metal', 'rust', 'wood', 'dirt', 'rock',
                 'foliage', 'tile', 'flesh', 'fabric', 'glass', 'grate', 'blood'];
  var TEX_INDEX = {};
  (function () { for (var i = 0; i < TEX_IDS.length; i++) { TEX_INDEX[TEX_IDS[i]] = i; } })();

  /* Quality presets. Index == scene.quality. */
  var QUALITY = [
    { /* 0 low / mobile */
      cascades: 1, shadowSize: 512, prepass: false, ssao: false, volumetric: false,
      bloomMips: 1, lights: 8, triplanar: false, pcf: 1, softParticles: false,
      ssaoScale: 0.5, volScale: 0.5, aniso: 2
    },
    { /* 1 medium */
      cascades: 2, shadowSize: 1024, prepass: true, ssao: true, volumetric: false,
      bloomMips: 3, lights: 24, triplanar: true, pcf: 1, softParticles: true,
      ssaoScale: 0.5, volScale: 0.5, aniso: 4
    },
    { /* 2 high */
      cascades: 3, shadowSize: 2048, prepass: true, ssao: true, volumetric: true,
      bloomMips: 3, lights: 48, triplanar: true, pcf: 2, softParticles: true,
      ssaoScale: 0.5, volScale: 0.5, aniso: 16
    }
  ];

  /* Fixed vertex attribute locations, shared by every mesh program. */
  var A_POS = 0, A_NRM = 1, A_UV = 2, A_COL = 3;
  var A_INST_A = 4, A_INST_B = 5, A_INST_C = 6;

  /* Uniform block binding points. */
  var UBO_FRAME = 0, UBO_LIGHTS = 1;

  /* Texture units (kept stable so sampler uniforms are set once at link). */
  var TU_ALBEDO = 0, TU_NORMAL = 1, TU_ORM = 2, TU_SHADOW = 3, TU_ENV = 4,
      TU_AO = 5, TU_DEPTH = 6, TU_NOISE = 7, TU_SRC = 8, TU_BLOOM = 9,
      TU_VOL = 10, TU_LUM = 11;

  /* ======================================================================
     std140 FRAME UNIFORM BLOCK LAYOUT  (736 bytes / 184 floats)
     ----------------------------------------------------------------------
       float idx  name
         0   uView          mat4
        16   uProj          mat4
        32   uViewProj      mat4
        48   uInvView       mat4
        64   uInvProj       mat4
        80   uPrevViewProj  mat4
        96   uCascade0      mat4
       112   uCascade1      mat4
       128   uCascade2      mat4
       144   uCamPos        vec4  (xyz camera world pos, w = scene.time)
       148   uSunDir        vec4  (xyz normalised TO-light dir, w = intensity)
       152   uSunCol        vec4  (rgb sun colour, w = shadow strength 0..1)
       156   uAmbient       vec4  (rgb ambient, w = ssao intensity)
       160   uFogCol        vec4  (rgb fog colour, w = fog density)
       164   uFogParams     vec4  (height, heightFalloff, near, far)
       168   uScreen        vec4  (w, h, 1/w, 1/h)
       172   uMisc          vec4  (quality, activeLightCount, exposure, ssaoOn)
       176   uCascadeSplits vec4  (split0, split1, split2, frameIndex)
       180   uMisc2         vec4  (lightning, normalOffset, depthBias, 1/shadowSize)
     ====================================================================== */
  var FRAME_FLOATS = 184;
  var F_VIEW = 0, F_PROJ = 16, F_VP = 32, F_INVVIEW = 48, F_INVPROJ = 64,
      F_PREVVP = 80, F_CASC0 = 96, F_CASC1 = 112, F_CASC2 = 128,
      F_CAMPOS = 144, F_SUNDIR = 148, F_SUNCOL = 152, F_AMBIENT = 156,
      F_FOGCOL = 160, F_FOGPARAMS = 164, F_SCREEN = 168, F_MISC = 172,
      F_SPLITS = 176, F_MISC2 = 180;

  /* std140 LIGHTS BLOCK: vec4 uLightPos[48] (xyz pos, w range)
                          vec4 uLightCol[48] (rgb colour * intensity, w flags) */
  var LIGHT_FLOATS = MAX_LIGHTS * 4 * 2;

  /* ======================================================================
     SHADER SOURCE
     Every source begins with the literal '#version 300 es\n' as its FIRST
     characters - GLSL ES requires the directive on line 1, column 1.
     ====================================================================== */
  var VER = '#version 300 es\n';

  var CH_PRECISION = [
    'precision highp float;',
    'precision highp int;',
    'precision highp sampler2D;',
    'precision highp sampler2DArray;',
    'precision highp samplerCube;',
    '#define PI 3.14159265359',
    '#define TAU 6.28318530718',
    ''].join('\n');

  var CH_PRECISION_SHADOWSAMP = CH_PRECISION +
    'precision highp sampler2DArrayShadow;\n';

  /* --- the Frame block. Byte-identical text in every consumer. ---------- */
  var CH_FRAME = [
    'layout(std140) uniform Frame {',
    '  mat4 uView;',
    '  mat4 uProj;',
    '  mat4 uViewProj;',
    '  mat4 uInvView;',
    '  mat4 uInvProj;',
    '  mat4 uPrevViewProj;',
    '  mat4 uCascade0;',
    '  mat4 uCascade1;',
    '  mat4 uCascade2;',
    '  vec4 uCamPos;',
    '  vec4 uSunDir;',
    '  vec4 uSunCol;',
    '  vec4 uAmbient;',
    '  vec4 uFogCol;',
    '  vec4 uFogParams;',
    '  vec4 uScreen;',
    '  vec4 uMisc;',
    '  vec4 uCascadeSplits;',
    '  vec4 uMisc2;',
    '};',
    ''].join('\n');

  var CH_LIGHTS = [
    'layout(std140) uniform Lights {',
    '  vec4 uLightPos[48];',
    '  vec4 uLightCol[48];',
    '};',
    ''].join('\n');

  /* --- tileable procedural noise, used by texgen + sky + lens fx -------- */
  var CH_NOISE = [
    'float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }',
    'float hash12(vec2 p){',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'vec2 hash22(vec2 p){',
    '  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.xx + p3.yz) * p3.zy);',
    '}',
    'float hash13(vec3 p3){',
    '  p3 = fract(p3 * 0.1031);',
    '  p3 += dot(p3, p3.zyx + 31.32);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    /* tileable value noise: lattice coords wrapped by "per" */
    'float vnoiseT(vec2 p, float per){',
    '  vec2 i = floor(p), f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = hash12(mod(i, per));',
    '  float b = hash12(mod(i + vec2(1.0, 0.0), per));',
    '  float c = hash12(mod(i + vec2(0.0, 1.0), per));',
    '  float d = hash12(mod(i + vec2(1.0, 1.0), per));',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
    '}',
    'float fbmT(vec2 p, float per, int oct){',
    '  float a = 0.5, s = 0.0, n = 0.0;',
    '  for (int k = 0; k < 8; k++){',
    '    if (k >= oct) break;',
    '    s += a * vnoiseT(p, per); n += a;',
    '    a *= 0.5; p *= 2.0; per *= 2.0;',
    '  }',
    '  return s / max(n, 1e-4);',
    '}',
    /* ridged fbm: veins, cracks, rock fractures */
    'float ridgeT(vec2 p, float per, int oct){',
    '  float a = 0.5, s = 0.0, n = 0.0;',
    '  for (int k = 0; k < 8; k++){',
    '    if (k >= oct) break;',
    '    float v = 1.0 - abs(vnoiseT(p, per) * 2.0 - 1.0);',
    '    s += a * v * v; n += a;',
    '    a *= 0.5; p *= 2.0; per *= 2.0;',
    '  }',
    '  return s / max(n, 1e-4);',
    '}',
    /* tileable worley: returns .x = F1, .y = F2 - F1 (cell edge distance) */
    'vec2 worleyT(vec2 p, float per){',
    '  vec2 i = floor(p), f = fract(p);',
    '  float f1 = 8.0, f2 = 8.0;',
    '  for (int y = -1; y <= 1; y++){',
    '    for (int x = -1; x <= 1; x++){',
    '      vec2 o = vec2(float(x), float(y));',
    '      vec2 h = hash22(mod(i + o, per));',
    '      vec2 d = o + h - f;',
    '      float dd = dot(d, d);',
    '      if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) { f2 = dd; }',
    '    }',
    '  }',
    '  f1 = sqrt(f1); f2 = sqrt(f2);',
    '  return vec2(f1, f2 - f1);',
    '}',
    /* cell id, for per-cell colour jitter (leaves, rock, tiles) */
    'vec3 worleyCell(vec2 p, float per){',
    '  vec2 i = floor(p), f = fract(p);',
    '  float f1 = 8.0; vec2 best = vec2(0.0);',
    '  for (int y = -1; y <= 1; y++){',
    '    for (int x = -1; x <= 1; x++){',
    '      vec2 o = vec2(float(x), float(y));',
    '      vec2 c = mod(i + o, per);',
    '      vec2 h = hash22(c);',
    '      vec2 d = o + h - f;',
    '      float dd = dot(d, d);',
    '      if (dd < f1) { f1 = dd; best = c; }',
    '    }',
    '  }',
    '  return vec3(sqrt(f1), best);',
    '}',
    ''].join('\n');

  /* --- height-fog + tonemap helpers shared by lit passes ---------------- */
  var CH_FOG = [
    /* Analytic exponential height fog. Integrates exp(-b*(y-h0)) along the',
       view ray so vertical motion through the fog slab is continuous. */
    'float heightFog(vec3 camP, vec3 wp){',
    '  vec3 d = wp - camP;',
    '  float dist = length(d);',
    '  if (dist < 1e-4) return 0.0;',
    '  float b = max(uFogParams.y, 1e-4);',
    '  float h0 = uFogParams.x;',
    '  float dens = uFogCol.w;',
    '  float fy = exp(-b * (camP.y - h0));',
    '  float dy = d.y;',
    '  float t = (abs(dy) > 1e-4) ? (1.0 - exp(-b * dy)) / (b * dy) : 1.0;',
    '  float amount = dens * dist * fy * t;',
    '  return 1.0 - exp(-max(amount, 0.0));',
    '}',
    ''].join('\n');

  var CH_PBR = [
    /* Cook-Torrance: GGX NDF + Smith height-correlated visibility + Schlick */
    'float D_GGX(float NoH, float a){',
    '  float a2 = a * a;',
    '  float d = (NoH * a2 - NoH) * NoH + 1.0;',
    '  return a2 / max(PI * d * d, 1e-7);',
    '}',
    'float V_SmithGGX(float NoV, float NoL, float a){',
    '  float a2 = a * a;',
    '  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);',
    '  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);',
    '  return 0.5 / max(gv + gl, 1e-6);',
    '}',
    'vec3 F_Schlick(vec3 f0, float u){',
    '  float f = pow(1.0 - u, 5.0);',
    '  return f0 + (vec3(1.0) - f0) * f;',
    '}',
    /* Karis analytic split-sum environment BRDF approximation */
    'vec2 envBRDF(float NoV, float rough){',
    '  vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);',
    '  vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);',
    '  vec4 r = rough * c0 + c1;',
    '  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;',
    '  return vec2(-1.04, 1.04) * a004 + r.zw;',
    '}',
    /* smooth range window on top of physical inverse-square falloff */
    'float lightAtten(float dist, float range){',
    '  float f = dist / max(range, 1e-3);',
    '  float w = clamp(1.0 - f * f * f * f, 0.0, 1.0);',
    '  w *= w;',
    '  return w / (dist * dist + 0.02);',
    '}',
    ''].join('\n');

  /* ------------------------------------------------------------------ */
  /* Fullscreen triangle vertex shader (no attributes, gl_VertexID based) */
  var VS_FULLSCREEN = VER + [
    'out vec2 vUV;',
    'void main(){',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  vUV = p;',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}',
    ''].join('\n');

  /* ==================== PROCEDURAL MATERIAL TEXTURE GEN ================= */
  /* One MRT draw per layer writes albedo(sqrt-encoded) / normal+height / ORM.
     Everything is authored tileable so triplanar world-space repeats do not
     seam. Height is evaluated 4 extra times per pixel for the sobel normal. */
  var FS_TEXGEN = VER + CH_PRECISION + CH_NOISE + [
    'in vec2 vUV;',
    'layout(location = 0) out vec4 oAlbedo;',
    'layout(location = 1) out vec4 oNormal;',
    'layout(location = 2) out vec4 oORM;',
    'uniform int uLayer;',
    'uniform sampler2D uNoiseTex;   // CPU-side IP.Noise atlas: r=fbm g=worley b=perlin a=white',
    '',
    '// ---- height field per material (drives the sobel normal map) ------',
    'float heightAt(int L, vec2 p){',
    '  if (L == 1){ // CONCRETE ------------------------------------------',
    '    float h = fbmT(p * 6.0, 6.0, 5) * 0.65 + fbmT(p * 34.0, 34.0, 3) * 0.18;',
    '    vec2 w = worleyT(p * 9.0, 9.0);',
    '    h -= smoothstep(0.45, 0.05, w.x) * 0.30;            // blown-out pits',
    '    float crack = ridgeT(p * 3.0 + 11.0, 3.0, 4);',
    '    h -= smoothstep(0.72, 0.97, crack) * 0.45;          // hairline cracks',
    '    return h;',
    '  } else if (L == 2){ // METAL PLATE ---------------------------------',
    '    vec2 g = fract(p * 3.0);',
    '    float seam = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));',
    '    float h = 0.55 + fbmT(vec2(p.x * 90.0, p.y * 6.0), 90.0, 3) * 0.06;',
    '    h -= (1.0 - smoothstep(0.0, 0.035, seam)) * 0.5;    // plate seams',
    '    vec2 rp = fract(p * 3.0) - 0.5;',
    '    vec2 rq = abs(rp) - 0.40;',
    '    float riv = length(max(rq, 0.0));',
    '    h += (1.0 - smoothstep(0.0, 0.035, riv)) * 0.35;    // corner rivets',
    '    return h;',
    '  } else if (L == 3){ // RUST ----------------------------------------',
    '    float base = 0.5 + fbmT(p * 8.0, 8.0, 5) * 0.25;',
    '    vec2 w = worleyT(p * 6.0, 6.0);',
    '    float scab = smoothstep(0.55, 0.1, w.x);',
    '    base -= scab * 0.35 * (0.5 + 0.5 * fbmT(p * 40.0, 40.0, 3));',
    '    return base;',
    '  } else if (L == 4){ // WOOD ----------------------------------------',
    '    float plank = floor(p.y * 4.0);',
    '    vec2 q = vec2(p.x + hash11(plank) * 0.37, p.y);',
    '    float grain = fbmT(vec2(q.x * 3.0, q.y * 48.0), 48.0, 4);',
    '    float rings = fract(q.x * 7.0 + grain * 2.4);',
    '    float h = 0.55 + (rings * rings) * 0.22 + grain * 0.1;',
    '    float gap = abs(fract(p.y * 4.0) - 0.5);',
    '    h -= smoothstep(0.47, 0.5, gap) * 0.35;             // plank gaps',
    '    vec2 kn = worleyT(p * 3.0 + 5.0, 3.0);',
    '    h -= smoothstep(0.25, 0.0, kn.x) * 0.25;            // knots',
    '    return h;',
    '  } else if (L == 5){ // DIRT ----------------------------------------',
    '    float h = fbmT(p * 5.0, 5.0, 6) * 0.7 + fbmT(p * 25.0, 25.0, 3) * 0.25;',
    '    vec2 w = worleyT(p * 22.0, 22.0);',
    '    h += smoothstep(0.4, 0.0, w.x) * 0.22;              // pebbles',
    '    return h;',
    '  } else if (L == 6){ // ROCK ----------------------------------------',
    '    vec2 w = worleyT(p * 4.0, 4.0);',
    '    float h = w.x * 0.55 + fbmT(p * 9.0, 9.0, 5) * 0.35;',
    '    h -= smoothstep(0.12, 0.0, w.y) * 0.4;              // fracture seams',
    '    h += fbmT(p * 40.0, 40.0, 3) * 0.08;',
    '    return h;',
    '  } else if (L == 7){ // FOLIAGE -------------------------------------',
    '    vec3 c = worleyCell(p * 4.0, 4.0);',
    '    float h = 0.6 - c.x * 0.4;',
    '    float vein = ridgeT((p + hash22(c.yz)) * 26.0, 26.0, 3);',
    '    h += vein * 0.14;',
    '    return h;',
    '  } else if (L == 8){ // TILE ----------------------------------------',
    '    vec2 g = fract(p * 6.0);',
    '    float e = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));',
    '    float h = smoothstep(0.0, 0.055, e) * 0.55 + 0.2;   // grout recess',
    '    h += fbmT(p * 60.0, 60.0, 2) * 0.03;',
    '    vec2 ch = worleyT(p * 14.0 + 3.0, 14.0);',
    '    h -= smoothstep(0.16, 0.0, ch.x) * 0.35;            // chipped corners',
    '    return h;',
    '  } else if (L == 9){ // FLESH ---------------------------------------',
    '    float h = 0.55 + fbmT(p * 7.0, 7.0, 4) * 0.2;',
    '    float vein = ridgeT(p * 5.0 + 2.0, 5.0, 5);',
    '    h += smoothstep(0.62, 0.95, vein) * 0.28;           // raised veins',
    '    vec2 w = worleyT(p * 13.0, 13.0);',
    '    h += smoothstep(0.3, 0.0, w.x) * 0.30;              // pustules',
    '    return h;',
    '  } else if (L == 10){ // FABRIC -------------------------------------',
    '    float u = fract(p.x * 60.0), v = fract(p.y * 60.0);',
    '    float weave = (sin(u * TAU) * 0.5 + 0.5) * step(fract(p.y * 30.0), 0.5)',
    '                + (sin(v * TAU) * 0.5 + 0.5) * step(0.5, fract(p.y * 30.0));',
    '    return 0.45 + weave * 0.25 + fbmT(p * 70.0, 70.0, 3) * 0.12;',
    '  } else if (L == 11){ // GLASS --------------------------------------',
    '    float h = 0.5 + fbmT(p * 3.0, 3.0, 3) * 0.02;',
    '    float smudge = smoothstep(0.35, 0.9, fbmT(p * 6.0 + 7.0, 6.0, 4));',
    '    h += smudge * 0.02;',
    '    return h;',
    '  } else if (L == 12){ // GRATE --------------------------------------',
    '    vec2 q = p * 8.0;',
    '    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;       // hex-ish offset',
    '    vec2 f = fract(q) - 0.5;',
    '    float d = length(f);',
    '    return smoothstep(0.30, 0.36, d) * 0.7 + 0.15;',
    '  } else if (L == 13){ // BLOOD --------------------------------------',
    '    float pool = fbmT(p * 4.0, 4.0, 5);',
    '    float h = 0.5 + smoothstep(0.42, 0.62, pool) * 0.12;',
    '    h += fbmT(p * 30.0, 30.0, 3) * 0.03;',
    '    return h;',
    '  }',
    '  return 0.5; // NONE',
    '}',
    '',
    '// ---- albedo / ao / roughness / metal / alpha ----------------------',
    'void matSample(int L, vec2 p, out vec3 alb, out float ao, out float rough,',
    '               out float metal, out float alpha){',
    '  alpha = 1.0; metal = 0.0; ao = 1.0; rough = 0.85; alb = vec3(0.6);',
    '  vec4 nz = texture(uNoiseTex, p);   // CPU IP.Noise atlas, adds character',
    '  if (L == 1){ // CONCRETE',
    '    float g = 0.34 + fbmT(p * 6.0, 6.0, 5) * 0.20 + nz.r * 0.06;',
    '    float speck = step(0.86, fbmT(p * 90.0, 90.0, 2));',
    '    g += speck * 0.10;',
    '    vec2 w = worleyT(p * 9.0, 9.0);',
    '    float pit = smoothstep(0.45, 0.05, w.x);',
    '    g -= pit * 0.16;',
    '    float crack = smoothstep(0.72, 0.97, ridgeT(p * 3.0 + 11.0, 3.0, 4));',
    '    g -= crack * 0.22;',
    '    float stain = smoothstep(0.5, 0.85, fbmT(p * 2.5 + 21.0, 2.5, 4));',
    '    alb = mix(vec3(g, g * 0.99, g * 0.95), vec3(0.16, 0.15, 0.13), stain * 0.55);',
    '    rough = 0.88 - speck * 0.08 + crack * 0.06;',
    '    ao = 1.0 - pit * 0.5 - crack * 0.45;',
    '  } else if (L == 2){ // METAL PLATE',
    '    float brush = fbmT(vec2(p.x * 90.0, p.y * 6.0), 90.0, 3);',
    '    float g = 0.42 + brush * 0.14;',
    '    vec2 gr = fract(p * 3.0);',
    '    float seam = 1.0 - smoothstep(0.0, 0.035, min(min(gr.x, 1.0 - gr.x), min(gr.y, 1.0 - gr.y)));',
    '    float grime = smoothstep(0.45, 0.85, fbmT(p * 4.0 + 3.0, 4.0, 4));',
    '    alb = mix(vec3(g * 0.86, g * 0.90, g), vec3(0.09, 0.09, 0.10), seam * 0.7);',
    '    alb = mix(alb, vec3(0.13, 0.12, 0.10), grime * 0.45);',
    '    metal = 1.0 - seam * 0.4 - grime * 0.35;',
    '    rough = 0.30 + brush * 0.18 + grime * 0.35 + seam * 0.25;',
    '    ao = 1.0 - seam * 0.55;',
    '  } else if (L == 3){ // RUST',
    '    vec2 w = worleyT(p * 6.0, 6.0);',
    '    float scab = smoothstep(0.55, 0.1, w.x);',
    '    float fine = fbmT(p * 30.0, 30.0, 4);',
    '    vec3 rustA = vec3(0.30, 0.11, 0.045);',
    '    vec3 rustB = vec3(0.46, 0.22, 0.08);',
    '    vec3 steel = vec3(0.30, 0.31, 0.33);',
    '    alb = mix(steel, mix(rustA, rustB, fine), clamp(scab + fine * 0.45, 0.0, 1.0));',
    '    alb *= 0.75 + nz.g * 0.4;',
    '    metal = (1.0 - scab) * 0.85;',
    '    rough = mix(0.42, 0.95, clamp(scab + fine * 0.3, 0.0, 1.0));',
    '    ao = 1.0 - scab * 0.35;',
    '  } else if (L == 4){ // WOOD',
    '    float plank = floor(p.y * 4.0);',
    '    vec2 q = vec2(p.x + hash11(plank) * 0.37, p.y);',
    '    float grain = fbmT(vec2(q.x * 3.0, q.y * 48.0), 48.0, 4);',
    '    float rings = fract(q.x * 7.0 + grain * 2.4);',
    '    float tone = 0.30 + rings * 0.28 + hash11(plank + 4.0) * 0.12;',
    '    alb = vec3(tone, tone * 0.62, tone * 0.36);',
    '    float rot = smoothstep(0.55, 0.9, fbmT(p * 3.0 + 9.0, 3.0, 4));',
    '    alb = mix(alb, vec3(0.10, 0.10, 0.08), rot * 0.7);',
    '    float gap = smoothstep(0.47, 0.5, abs(fract(p.y * 4.0) - 0.5));',
    '    alb *= 1.0 - gap * 0.85;',
    '    rough = 0.68 + grain * 0.2 + rot * 0.15;',
    '    ao = 1.0 - gap * 0.7 - rot * 0.2;',
    '  } else if (L == 5){ // DIRT',
    '    float c = fbmT(p * 5.0, 5.0, 6);',
    '    vec3 wet = vec3(0.075, 0.062, 0.048);',
    '    vec3 dry = vec3(0.19, 0.155, 0.115);',
    '    alb = mix(wet, dry, smoothstep(0.3, 0.75, c));',
    '    vec2 w = worleyT(p * 22.0, 22.0);',
    '    float peb = smoothstep(0.35, 0.0, w.x);',
    '    alb = mix(alb, vec3(0.24, 0.23, 0.21), peb * 0.7);',
    '    rough = 0.94 - peb * 0.2;',
    '    ao = 1.0 - (1.0 - c) * 0.35;',
    '  } else if (L == 6){ // ROCK',
    '    vec2 w = worleyT(p * 4.0, 4.0);',
    '    float g = 0.20 + w.x * 0.22 + fbmT(p * 9.0, 9.0, 5) * 0.14;',
    '    alb = vec3(g * 1.0, g * 0.99, g * 0.96);',
    '    float moss = smoothstep(0.55, 0.9, fbmT(p * 3.5 + 17.0, 3.5, 4));',
    '    alb = mix(alb, vec3(0.075, 0.115, 0.055), moss * 0.65);',
    '    float seam = smoothstep(0.12, 0.0, w.y);',
    '    alb *= 1.0 - seam * 0.6;',
    '    rough = 0.88 + moss * 0.08;',
    '    ao = 1.0 - seam * 0.6;',
    '  } else if (L == 7){ // FOLIAGE (alpha cut)',
    '    vec3 c = worleyCell(p * 4.0, 4.0);',
    '    float leaf = 1.0 - smoothstep(0.30, 0.42, c.x);',
    '    alpha = leaf;',
    '    float tint = hash12(c.yz);',
    '    vec3 g1 = vec3(0.045, 0.115, 0.038);',
    '    vec3 g2 = vec3(0.10, 0.16, 0.05);',
    '    alb = mix(g1, g2, tint);',
    '    float vein = ridgeT((p + hash22(c.yz)) * 26.0, 26.0, 3);',
    '    alb *= 0.8 + vein * 0.5;',
    '    float dead = smoothstep(0.6, 0.95, fbmT(p * 2.0 + 31.0, 2.0, 3));',
    '    alb = mix(alb, vec3(0.16, 0.11, 0.045), dead);',
    '    rough = 0.72;',
    '    ao = 0.75 + c.x * 0.25;',
    '  } else if (L == 8){ // TILE',
    '    vec2 g = fract(p * 6.0);',
    '    vec2 id = floor(p * 6.0);',
    '    float e = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));',
    '    float grout = 1.0 - smoothstep(0.0, 0.055, e);',
    '    float v = hash12(id);',
    '    vec3 tile = mix(vec3(0.30, 0.31, 0.30), vec3(0.44, 0.45, 0.42), v);',
    '    float stain = smoothstep(0.5, 0.9, fbmT(p * 2.0 + 5.0, 2.0, 4));',
    '    tile = mix(tile, vec3(0.10, 0.115, 0.075), stain * 0.6);',
    '    alb = mix(tile, vec3(0.11, 0.105, 0.095), grout);',
    '    vec2 ch = worleyT(p * 14.0 + 3.0, 14.0);',
    '    float chip = smoothstep(0.16, 0.0, ch.x);',
    '    alb = mix(alb, vec3(0.20, 0.19, 0.18), chip);',
    '    rough = mix(0.28 + v * 0.12 + stain * 0.4, 0.92, max(grout, chip));',
    '    ao = 1.0 - grout * 0.55 - chip * 0.3;',
    '  } else if (L == 9){ // FLESH',
    '    float base = fbmT(p * 7.0, 7.0, 4);',
    '    alb = mix(vec3(0.32, 0.10, 0.10), vec3(0.50, 0.22, 0.19), base);',
    '    float vein = smoothstep(0.6, 0.95, ridgeT(p * 5.0 + 2.0, 5.0, 5));',
    '    alb = mix(alb, vec3(0.20, 0.045, 0.06), vein * 0.8);',
    '    vec2 w = worleyT(p * 13.0, 13.0);',
    '    float pus = smoothstep(0.3, 0.0, w.x);',
    '    alb = mix(alb, vec3(0.55, 0.50, 0.22), pus * 0.6);',
    '    rough = 0.34 + base * 0.2 - pus * 0.14;',
    '    ao = 1.0 - vein * 0.25;',
    '  } else if (L == 10){ // FABRIC',
    '    float u = fract(p.x * 60.0), v = fract(p.y * 60.0);',
    '    float weave = (sin(u * TAU) * 0.5 + 0.5) * step(fract(p.y * 30.0), 0.5)',
    '                + (sin(v * TAU) * 0.5 + 0.5) * step(0.5, fract(p.y * 30.0));',
    '    float dye = fbmT(p * 3.0, 3.0, 4);',
    '    alb = mix(vec3(0.085, 0.095, 0.105), vec3(0.16, 0.15, 0.14), dye);',
    '    alb *= 0.7 + weave * 0.45;',
    '    float wear = smoothstep(0.6, 0.95, fbmT(p * 5.0 + 13.0, 5.0, 4));',
    '    alb = mix(alb, vec3(0.055, 0.05, 0.045), wear * 0.6);',
    '    rough = 0.93;',
    '    ao = 0.8 + weave * 0.2;',
    '  } else if (L == 11){ // GLASS',
    '    float smudge = smoothstep(0.35, 0.9, fbmT(p * 6.0 + 7.0, 6.0, 4));',
    '    float dust = fbmT(p * 40.0, 40.0, 3);',
    '    alb = mix(vec3(0.045, 0.055, 0.06), vec3(0.20, 0.21, 0.20), smudge * 0.5 + dust * 0.15);',
    '    rough = 0.045 + smudge * 0.30 + dust * 0.08;',
    '    metal = 0.0;',
    '    ao = 1.0;',
    '  } else if (L == 12){ // GRATE (holes punched with alpha)',
    '    vec2 q = p * 8.0;',
    '    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;',
    '    vec2 f = fract(q) - 0.5;',
    '    float d = length(f);',
    '    alpha = smoothstep(0.30, 0.34, d);',
    '    float edge = 1.0 - smoothstep(0.33, 0.46, d);',
    '    float grime = fbmT(p * 12.0, 12.0, 4);',
    '    alb = mix(vec3(0.20, 0.205, 0.215), vec3(0.11, 0.085, 0.06), grime * 0.7);',
    '    alb *= 1.0 - edge * 0.45;',
    '    metal = 0.9 - grime * 0.4;',
    '    rough = 0.42 + grime * 0.35;',
    '    ao = 1.0 - edge * 0.6;',
    '  } else if (L == 13){ // BLOOD',
    '    float pool = fbmT(p * 4.0, 4.0, 5);',
    '    float wetMask = smoothstep(0.44, 0.62, pool);',
    '    vec3 fresh = vec3(0.26, 0.012, 0.012);',
    '    vec3 dried = vec3(0.085, 0.020, 0.016);',
    '    alb = mix(dried, fresh, wetMask);',
    '    float spat = smoothstep(0.72, 0.95, fbmT(p * 16.0 + 4.0, 16.0, 3));',
    '    alb = mix(alb, fresh * 1.2, spat * 0.6);',
    '    alpha = clamp(smoothstep(0.30, 0.48, pool) + spat, 0.0, 1.0);',
    '    rough = mix(0.80, 0.13, wetMask);',
    '    ao = 1.0 - (1.0 - wetMask) * 0.2;',
    '  } else { // NONE - neutral, lets material albedo speak',
    '    alb = vec3(0.5); rough = 0.8; metal = 0.0; ao = 1.0;',
    '  }',
    '  alb = clamp(alb, vec3(0.0), vec3(1.0));',
    '  rough = clamp(rough, 0.035, 1.0);',
    '  metal = clamp(metal, 0.0, 1.0);',
    '  ao = clamp(ao, 0.0, 1.0);',
    '}',
    '',
    'void main(){',
    '  vec2 p = vUV;',
    '  vec3 alb; float ao, rough, metal, alpha;',
    '  matSample(uLayer, p, alb, ao, rough, metal, alpha);',
    '  float e = 1.0 / float(' + TEXGEN_SIZE + ');',
    '  float hL = heightAt(uLayer, p - vec2(e, 0.0));',
    '  float hR = heightAt(uLayer, p + vec2(e, 0.0));',
    '  float hD = heightAt(uLayer, p - vec2(0.0, e));',
    '  float hU = heightAt(uLayer, p + vec2(0.0, e));',
    '  float hC = heightAt(uLayer, p);',
    '  float strength = (uLayer == 11) ? 0.35 : 3.0;',
    '  vec3 n = normalize(vec3((hL - hR) * strength, (hD - hU) * strength, 2.0 * e * 40.0));',
    '  // sqrt-encode albedo: RGBA8 storage with usable precision in the darks',
    '  oAlbedo = vec4(sqrt(alb), alpha);',
    '  oNormal = vec4(n * 0.5 + 0.5, clamp(hC, 0.0, 1.0));',
    '  oORM = vec4(ao, rough, metal, 1.0);',
    '}',
    ''].join('\n');

  /* ===================== PROCEDURAL SKY / ENVIRONMENT =================== */
  /* Storm-at-night analytic sky. Rendered once into a cubemap; higher mips
     are cone-integrated so they double as roughness-prefiltered radiance and
     (last mip) as a crude irradiance probe. */
  var FS_ENV = VER + CH_PRECISION + CH_NOISE + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform int uFace;',
    'uniform float uRough;',
    'uniform vec3 uSun;        // direction TO the sun/moon',
    'uniform vec3 uSunColor;',
    'uniform float uTime;',
    'uniform float uLightning;',
    'uniform sampler2D uNoiseTex;',
    '',
    'vec3 faceDir(int f, vec2 uv){',
    '  vec2 c = uv * 2.0 - 1.0;',
    '  if (f == 0) return normalize(vec3( 1.0, -c.y, -c.x));',
    '  if (f == 1) return normalize(vec3(-1.0, -c.y,  c.x));',
    '  if (f == 2) return normalize(vec3( c.x,  1.0,  c.y));',
    '  if (f == 3) return normalize(vec3( c.x, -1.0, -c.y));',
    '  if (f == 4) return normalize(vec3( c.x, -c.y,  1.0));',
    '  return normalize(vec3(-c.x, -c.y, -1.0));',
    '}',
    '',
    '// Overcast storm: near-black blue zenith, slightly warmer sodium haze at',
    '// the horizon, heavy fbm cloud deck, dim moon disc bleeding through.',
    'vec3 skyColor(vec3 d){',
    '  float up = clamp(d.y, -1.0, 1.0);',
    '  vec3 zenith  = vec3(0.006, 0.011, 0.024);',
    '  vec3 horizon = vec3(0.030, 0.040, 0.062);',
    '  vec3 ground  = vec3(0.008, 0.008, 0.009);',
    '  vec3 col = mix(horizon, zenith, pow(clamp(up, 0.0, 1.0), 0.55));',
    '  col = mix(ground, col, smoothstep(-0.12, 0.06, up));',
    '  // sodium-vapour glow bleeding up from the facility, hugging the horizon',
    '  float hz = pow(1.0 - clamp(abs(up), 0.0, 1.0), 7.0);',
    '  col += vec3(0.055, 0.036, 0.016) * hz;',
    '  // two scrolling cloud decks projected on the sky dome',
    '  if (up > -0.05) {',
    '    vec2 cp = d.xz / max(abs(d.y) + 0.16, 0.16);',
    '    float c1 = fbmT(cp * 0.9 + vec2(uTime * 0.006, uTime * 0.0025), 512.0, 6);',
    '    float c2 = fbmT(cp * 2.3 - vec2(uTime * 0.011, 0.0), 512.0, 5);',
    '    float deck = clamp(c1 * 0.75 + c2 * 0.35, 0.0, 1.0);',
    '    float mask = smoothstep(-0.05, 0.30, up);',
    '    float thick = smoothstep(0.35, 0.85, deck) * mask;',
    '    vec3 cloudLit = vec3(0.055, 0.062, 0.080);',
    '    vec3 cloudDark = vec3(0.010, 0.013, 0.020);',
    '    col = mix(col, mix(cloudDark, cloudLit, deck), thick * 0.85);',
    '    // lightning lights the deck from inside',
    '    col += vec3(0.55, 0.62, 0.85) * uLightning * thick * (0.35 + deck * 0.9);',
    '  }',
    '  // moon / dim sun disc + broad glow, heavily attenuated by the deck',
    '  float sd = max(dot(d, uSun), 0.0);',
    '  col += uSunColor * pow(sd, 900.0) * 6.0;',
    '  col += uSunColor * pow(sd, 8.0) * 0.14;',
    '  col += uSunColor * pow(sd, 2.0) * 0.03;',
    '  col += vec3(0.30, 0.36, 0.55) * uLightning * 0.25;',
    '  return max(col, vec3(0.0));',
    '}',
    '',
    'void main(){',
    '  vec3 N = faceDir(uFace, vUV);',
    '  if (uRough < 0.01){',
    '    oCol = vec4(skyColor(N), 1.0);',
    '    return;',
    '  }',
    '  // cone-integrate the analytic sky: cheap, exact-enough prefilter',
    '  vec3 up = abs(N.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);',
    '  vec3 T = normalize(cross(up, N));',
    '  vec3 B = cross(N, T);',
    '  float a = uRough * uRough;',
    '  vec3 sum = vec3(0.0);',
    '  float wsum = 0.0;',
    '  const int NS = 24;',
    '  for (int i = 0; i < NS; i++){',
    '    float fi = float(i);',
    '    float u1 = fract(fi * 0.618033988 + 0.5);',
    '    float u2 = (fi + 0.5) / float(NS);',
    '    float phi = u1 * TAU;',
    '    float ct = sqrt((1.0 - u2) / (1.0 + (a * a - 1.0) * u2));',
    '    float st = sqrt(max(1.0 - ct * ct, 0.0));',
    '    vec3 H = normalize(T * (st * cos(phi)) + B * (st * sin(phi)) + N * ct);',
    '    vec3 L = normalize(2.0 * dot(N, H) * H - N);',
    '    float nl = max(dot(N, L), 0.0);',
    '    if (nl > 0.0){ sum += skyColor(L) * nl; wsum += nl; }',
    '  }',
    '  oCol = vec4(sum / max(wsum, 1e-4), 1.0);',
    '}',
    ''].join('\n');

  /* skybox draw: samples the finished cubemap so the sky and the IBL agree */
  var VS_SKY = VER + CH_FRAME + [
    'out vec3 vDir;',
    'void main(){',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  vec2 ndc = p * 2.0 - 1.0;',
    '  vec4 v = uInvProj * vec4(ndc, 1.0, 1.0);',
    '  vDir = mat3(uInvView) * (v.xyz / v.w);',
    '  gl_Position = vec4(ndc, 1.0, 1.0);',
    '}',
    ''].join('\n');

  var FS_SKY = VER + CH_PRECISION + CH_FRAME + [
    'in vec3 vDir;',
    'out vec4 oCol;',
    'uniform samplerCube uEnv;',
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  vec3 c = textureLod(uEnv, d, 0.0).rgb;',
    '  // fade the low sky into the fog colour so the horizon line dissolves',
    '  float h = smoothstep(0.14, -0.03, d.y);',
    '  c = mix(c, uFogCol.rgb, h * 0.92);',
    '  c += uFogCol.rgb * uMisc2.x * 1.4;',
    '  oCol = vec4(c, 1.0);',
    '}',
    ''].join('\n');

  /* =========================== SHADOW / DEPTH ========================== */
  var VS_DEPTH = VER + CH_FRAME + [
    'layout(location = 0) in vec3 aPos;',
    'uniform mat4 uModel;',
    'uniform mat4 uLightVP;   // identity-ish for the camera prepass',
    'uniform float uUseLightVP;',
    'void main(){',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  mat4 vp = (uUseLightVP > 0.5) ? uLightVP : uViewProj;',
    '  gl_Position = vp * wp;',
    '}',
    ''].join('\n');

  var FS_DEPTH = VER + CH_PRECISION + [
    'void main(){}',
    ''].join('\n');

  /* ============================ MAIN PBR =============================== */
  var VS_PBR = VER + CH_FRAME + [
    'layout(location = 0) in vec3 aPos;',
    'layout(location = 1) in vec3 aNrm;',
    'layout(location = 2) in vec2 aUV;',
    'layout(location = 3) in vec3 aCol;',
    'uniform mat4 uModel;',
    'uniform mat3 uNrmMat;',
    'out vec3 vWPos;',
    'out vec3 vNrm;',
    'out vec2 vUV;',
    'out vec3 vCol;',
    'out float vViewZ;',
    'void main(){',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vWPos = wp.xyz;',
    '  vNrm = normalize(uNrmMat * aNrm);',
    '  vUV = aUV;',
    '  vCol = aCol;',
    '  vec4 vp = uView * wp;',
    '  vViewZ = -vp.z;',
    '  gl_Position = uProj * vp;',
    '}',
    ''].join('\n');

  var FS_PBR = VER + CH_PRECISION_SHADOWSAMP + CH_FRAME + CH_LIGHTS + CH_PBR + CH_FOG + [
    'in vec3 vWPos;',
    'in vec3 vNrm;',
    'in vec2 vUV;',
    'in vec3 vCol;',
    'in float vViewZ;',
    'out vec4 oCol;',
    '',
    'uniform sampler2DArray uTexAlbedo;',
    'uniform sampler2DArray uTexNormal;',
    'uniform sampler2DArray uTexORM;',
    'uniform sampler2DArrayShadow uShadowMap;',
    'uniform samplerCube uEnv;',
    'uniform sampler2D uAOTex;',
    'uniform vec4 uAlbedo;      // rgb base colour, a = alpha',
    'uniform vec4 uMatParams;   // x rough, y metal, z texLayer(-1=none), w texScale',
    'uniform vec4 uEmissive;    // rgb emissive (already pulse-modulated), w unused',
    '',
    '// ---------------- triplanar material sampling ----------------------',
    'void triplanar(vec3 wp, vec3 N, float layer, float scale,',
    '               out vec4 alb, out vec3 nrm, out vec3 orm){',
    '  vec3 bw = abs(N);',
    '  bw = pow(bw, vec3(4.0));',
    '  bw /= max(bw.x + bw.y + bw.z, 1e-4);',
    '  vec2 uvX = wp.zy * scale;',
    '  vec2 uvY = wp.xz * scale;',
    '  vec2 uvZ = wp.xy * scale;',
    '  if (uMisc.x < 0.5) {',
    '    // quality 0: single dominant-axis projection (1 tap per map)',
    '    bool ax = (bw.x > bw.y && bw.x > bw.z);',
    '    bool ay = (!ax && bw.y > bw.z);',
    '    vec2 uv = ax ? uvX : (ay ? uvY : uvZ);',
    '    alb = texture(uTexAlbedo, vec3(uv, layer));',
    '    orm = texture(uTexORM, vec3(uv, layer)).xyz;',
    '    vec3 tn = texture(uTexNormal, vec3(uv, layer)).xyz * 2.0 - 1.0;',
    '    vec3 sn0 = sign(N);',
    '    vec3 wn = ax ? vec3(0.0, tn.y, tn.x) * sn0.x',
    '                 : (ay ? vec3(tn.x, 0.0, tn.y) * sn0.y : vec3(tn.x, tn.y, 0.0) * sn0.z);',
    '    nrm = normalize(N + wn);',
    '    return;',
    '  }',
    '  vec4 aX = texture(uTexAlbedo, vec3(uvX, layer));',
    '  vec4 aY = texture(uTexAlbedo, vec3(uvY, layer));',
    '  vec4 aZ = texture(uTexAlbedo, vec3(uvZ, layer));',
    '  alb = aX * bw.x + aY * bw.y + aZ * bw.z;',
    '  vec3 oX = texture(uTexORM, vec3(uvX, layer)).xyz;',
    '  vec3 oY = texture(uTexORM, vec3(uvY, layer)).xyz;',
    '  vec3 oZ = texture(uTexORM, vec3(uvZ, layer)).xyz;',
    '  orm = oX * bw.x + oY * bw.y + oZ * bw.z;',
    '  // UDN-style triplanar normal blend',
    '  vec3 nX = texture(uTexNormal, vec3(uvX, layer)).xyz * 2.0 - 1.0;',
    '  vec3 nY = texture(uTexNormal, vec3(uvY, layer)).xyz * 2.0 - 1.0;',
    '  vec3 nZ = texture(uTexNormal, vec3(uvZ, layer)).xyz * 2.0 - 1.0;',
    '  vec3 sn = sign(N);',
    '  vec3 wX = vec3(0.0, nX.y, nX.x) * sn.x;',
    '  vec3 wY = vec3(nY.x, 0.0, nY.y) * sn.y;',
    '  vec3 wZ = vec3(nZ.x, nZ.y, 0.0) * sn.z;',
    '  nrm = normalize(N + wX * bw.x + wY * bw.y + wZ * bw.z);',
    '}',
    '',
    '// ---------------- cascaded shadows ---------------------------------',
    'float sampleShadow(vec3 wp, vec3 N, float ndl, float viewZ, out int cascOut){',
    '  if (uSunCol.w < 0.01) { cascOut = 0; return 1.0; }',
    '  int c = 0;',
    '  if (viewZ > uCascadeSplits.x) c = 1;',
    '  if (viewZ > uCascadeSplits.y) c = 2;',
    '  cascOut = c;',
    '  mat4 m = uCascade0;',
    '  if (c == 1) m = uCascade1;',
    '  else if (c == 2) m = uCascade2;',
    '  float cs = 1.0 + float(c) * 1.4;',
    '  // normal offset scales with slope and cascade texel size',
    '  float slope = clamp(1.0 - ndl, 0.0, 1.0);',
    '  vec3 offP = wp + N * (uMisc2.y * cs * (0.35 + slope * 1.65));',
    '  vec4 sc = m * vec4(offP, 1.0);',
    '  vec3 pr = sc.xyz / max(sc.w, 1e-5);',
    '  pr = pr * 0.5 + 0.5;',
    '  if (pr.z >= 1.0 || pr.x < 0.0 || pr.x > 1.0 || pr.y < 0.0 || pr.y > 1.0) return 1.0;',
    '  float bias = uMisc2.z * cs * (1.0 + slope * 3.0);',
    '  float ref = pr.z - bias;',
    '  float texel = uMisc2.w;',
    '  float s = 0.0;',
    '  int R = int(uMisc.x) >= 2 ? 2 : 1;',
    '  float cnt = 0.0;',
    '  for (int y = -2; y <= 2; y++){',
    '    if (y < -R || y > R) continue;',
    '    for (int x = -2; x <= 2; x++){',
    '      if (x < -R || x > R) continue;',
    '      vec2 o = vec2(float(x), float(y)) * texel;',
    '      s += texture(uShadowMap, vec4(pr.xy + o, float(c), ref));',
    '      cnt += 1.0;',
    '    }',
    '  }',
    '  s /= max(cnt, 1.0);',
    '  // fade the last cascade out at its far edge so the terminator is soft',
    '  float fade = 1.0 - smoothstep(uCascadeSplits.z * 0.82, uCascadeSplits.z, viewZ);',
    '  return mix(1.0, s, fade);',
    '}',
    '',
    'void main(){',
    '  vec3 N = normalize(vNrm);',
    '  vec3 V = normalize(uCamPos.xyz - vWPos);',
    '  if (!gl_FrontFacing) N = -N;',
    '',
    '  vec3 baseCol = uAlbedo.rgb * vCol;',
    '  float rough = uMatParams.x;',
    '  float metal = uMatParams.y;',
    '  float ao = 1.0;',
    '  float alpha = uAlbedo.a;',
    '',
    '  if (uMatParams.z >= 0.0){',
    '    vec4 ta; vec3 tn; vec3 to;',
    '    triplanar(vWPos, N, uMatParams.z, uMatParams.w, ta, tn, to);',
    '    baseCol *= ta.rgb * ta.rgb * 2.0;   // undo the sqrt encode, keep midtones',
    '    alpha *= ta.a;',
    '    N = tn;',
    '    ao = to.x;',
    '    rough = clamp(rough * (0.35 + to.y * 1.15), 0.03, 1.0);',
    '    metal = clamp(max(metal, to.z * 0.92), 0.0, 1.0);',
    '  }',
    '  if (alpha < 0.35 && uAlbedo.a >= 0.999) discard;   // alpha-cut foliage/grate',
    '',
    '  float NoV = clamp(dot(N, V), 1e-4, 1.0);',
    '  vec3 f0 = mix(vec3(0.04), baseCol, metal);',
    '  vec3 diffCol = baseCol * (1.0 - metal);',
    '  float a = max(rough * rough, 1e-3);',
    '',
    '  vec3 direct = vec3(0.0);',
    '',
    '  // ---- sun ---------------------------------------------------------',
    '  vec3 L = normalize(uSunDir.xyz);',
    '  float NoL = dot(N, L);',
    '  int casc = 0;',
    '  if (NoL > 0.0){',
    '    float sh = sampleShadow(vWPos, N, NoL, vViewZ, casc);',
    '    if (sh > 0.001){',
    '      vec3 H = normalize(L + V);',
    '      float NoH = clamp(dot(N, H), 0.0, 1.0);',
    '      float VoH = clamp(dot(V, H), 0.0, 1.0);',
    '      vec3 F = F_Schlick(f0, VoH);',
    '      float D = D_GGX(NoH, a);',
    '      float Vs = V_SmithGGX(NoV, NoL, a);',
    '      vec3 spec = F * (D * Vs);',
    '      vec3 kd = (vec3(1.0) - F);',
    '      direct += (kd * diffCol / PI + spec) * uSunCol.rgb * uSunDir.w * NoL * sh;',
    '    }',
    '  }',
    '',
    '  // ---- punctual lights (CPU distance-culled into the UBO) -----------',
    '  int n = int(uMisc.y + 0.5);',
    '  for (int i = 0; i < 48; i++){',
    '    if (i >= n) break;',
    '    vec3 lp = uLightPos[i].xyz;',
    '    vec3 dv = lp - vWPos;',
    '    float d2 = dot(dv, dv);',
    '    float range = uLightPos[i].w;',
    '    if (d2 > range * range) continue;',
    '    float dist = sqrt(max(d2, 1e-8));',
    '    vec3 Lp = dv / dist;',
    '    float nl = dot(N, Lp);',
    '    if (nl <= 0.0) continue;',
    '    float att = lightAtten(dist, range);',
    '    vec3 H = normalize(Lp + V);',
    '    float NoH = clamp(dot(N, H), 0.0, 1.0);',
    '    float VoH = clamp(dot(V, H), 0.0, 1.0);',
    '    vec3 F = F_Schlick(f0, VoH);',
    '    float D = D_GGX(NoH, a);',
    '    float Vs = V_SmithGGX(NoV, nl, a);',
    '    vec3 spec = F * (D * Vs);',
    '    vec3 kd = (vec3(1.0) - F);',
    '    direct += (kd * diffCol / PI + spec) * uLightCol[i].rgb * (att * nl);',
    '  }',
    '',
    '  // ---- image based ambient -----------------------------------------',
    '  float ssao = 1.0;',
    '  if (uMisc.w > 0.5){',
    '    ssao = texture(uAOTex, gl_FragCoord.xy * uScreen.zw).r;',
    '  }',
    '  float occ = ao * mix(1.0, ssao, clamp(uAmbient.w, 0.0, 1.0));',
    '  vec3 R = reflect(-V, N);',
    '  float mipMax = float(' + (ENV_MIPS - 1) + ');',
    '  vec3 irr = textureLod(uEnv, N, mipMax).rgb;',
    '  vec3 pref = textureLod(uEnv, R, rough * mipMax).rgb;',
    '  vec2 ab = envBRDF(NoV, rough);',
    '  vec3 ambDiff = (irr + uAmbient.rgb) * diffCol * occ;',
    '  vec3 ambSpec = pref * (f0 * ab.x + ab.y) * occ;',
    '  // horizon occlusion keeps grazing reflections from lighting up caves',
    '  float ho = clamp(1.0 + dot(R, N), 0.0, 1.0); ho *= ho;',
    '  ambSpec *= ho;',
    '',
    '  // ---- rim / fresnel so silhouettes read in the dark ----------------',
    '  float rim = pow(1.0 - NoV, 3.5);',
    '  vec3 rimCol = (uAmbient.rgb * 6.0 + uFogCol.rgb * 3.0) * rim * (0.35 + 0.65 * (1.0 - rough));',
    '',
    '  vec3 col = direct + ambDiff + ambSpec + rimCol + uEmissive.rgb;',
    '',
    '  // ---- lightning bounce ---------------------------------------------',
    '  col += diffCol * uMisc2.x * (0.5 + max(N.y, 0.0) * 1.6) * 0.9;',
    '',
    '  // ---- fog ----------------------------------------------------------',
    '  float fg = heightFog(uCamPos.xyz, vWPos);',
    '  vec3 fogc = uFogCol.rgb * (1.0 + uMisc2.x * 5.0);',
    '  // cheap sun-inscatter tint towards the light',
    '  float vl = max(dot(normalize(vWPos - uCamPos.xyz), L), 0.0);',
    '  fogc += uSunCol.rgb * pow(vl, 6.0) * 0.35 * uSunDir.w;',
    '  col = mix(col, fogc, fg);',
    '',
    '  // cascade debug tint (uAmbient.w is driven negative by debug.showCascades)',
    '  if (uAmbient.w < -0.5){',
    '    casc = 0;',
    '    if (vViewZ > uCascadeSplits.x) casc = 1;',
    '    if (vViewZ > uCascadeSplits.y) casc = 2;',
    '    vec3 tint = casc == 0 ? vec3(1.0, 0.3, 0.3) : (casc == 1 ? vec3(0.3, 1.0, 0.3) : vec3(0.3, 0.4, 1.0));',
    '    col = mix(col, tint * (0.2 + length(col) * 0.4), 0.55);',
    '  }',
    '',
    '  oCol = vec4(max(col, vec3(0.0)), alpha);',
    '}',
    ''].join('\n');

  /* Unlit fallback - used only if the PBR program fails to compile/link. */
  var FS_FALLBACK = VER + CH_PRECISION + CH_FRAME + [
    'in vec3 vWPos;',
    'in vec3 vNrm;',
    'in vec2 vUV;',
    'in vec3 vCol;',
    'in float vViewZ;',
    'out vec4 oCol;',
    'uniform vec4 uAlbedo;',
    'uniform vec4 uMatParams;',
    'uniform vec4 uEmissive;',
    'void main(){',
    '  vec3 N = normalize(vNrm);',
    '  float d = max(dot(N, normalize(uSunDir.xyz)), 0.0) * 0.8 + 0.2;',
    '  oCol = vec4(uAlbedo.rgb * vCol * d + uEmissive.rgb, uAlbedo.a);',
    '}',
    ''].join('\n');

  /* ============================== SSAO ================================= */
  var FS_SSAO = VER + CH_PRECISION + CH_FRAME + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform sampler2D uDepth;',
    'uniform sampler2D uNoiseTex;',
    'uniform vec3 uKernel[' + SSAO_KERNEL + '];',
    'uniform vec2 uAOParams;   // x radius (world units), y intensity',
    '',
    'vec3 viewPos(vec2 uv){',
    '  float d = texture(uDepth, uv).r;',
    '  vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);',
    '  vec4 v = uInvProj * clip;',
    '  return v.xyz / v.w;',
    '}',
    '',
    'void main(){',
    '  float d = texture(uDepth, vUV).r;',
    '  if (d >= 0.99999){ oCol = vec4(1.0); return; }',
    '  vec3 P = viewPos(vUV);',
    '  // min-difference normal reconstruction: sharp at silhouettes',
    '  vec2 tx = uScreen.zw * 2.0;',
    '  vec3 pL = viewPos(vUV - vec2(tx.x, 0.0));',
    '  vec3 pR = viewPos(vUV + vec2(tx.x, 0.0));',
    '  vec3 pD = viewPos(vUV - vec2(0.0, tx.y));',
    '  vec3 pU = viewPos(vUV + vec2(0.0, tx.y));',
    '  vec3 dx = (abs(pR.z - P.z) < abs(P.z - pL.z)) ? (pR - P) : (P - pL);',
    '  vec3 dy = (abs(pU.z - P.z) < abs(P.z - pD.z)) ? (pU - P) : (P - pD);',
    '  vec3 N = normalize(cross(dx, dy));',
    '  if (dot(N, -normalize(P)) < 0.0) N = -N;',
    '',
    '  vec3 rvec = normalize(texture(uNoiseTex, vUV * uScreen.xy / 128.0).xyz * 2.0 - 1.0);',
    '  vec3 T = normalize(rvec - N * dot(rvec, N));',
    '  vec3 B = cross(N, T);',
    '  mat3 TBN = mat3(T, B, N);',
    '',
    '  float radius = uAOParams.x;',
    '  float occ = 0.0;',
    '  for (int i = 0; i < ' + SSAO_KERNEL + '; i++){',
    '    vec3 sp = P + TBN * uKernel[i] * radius;',
    '    vec4 cp = uProj * vec4(sp, 1.0);',
    '    vec2 suv = (cp.xy / cp.w) * 0.5 + 0.5;',
    '    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;',
    '    float sd = texture(uDepth, suv).r;',
    '    if (sd >= 0.99999) continue;',
    '    vec4 sv = uInvProj * vec4(suv * 2.0 - 1.0, sd * 2.0 - 1.0, 1.0);',
    '    float sampleZ = (sv.z / sv.w);',
    '    float rangeChk = smoothstep(0.0, 1.0, radius / max(abs(P.z - sampleZ), 1e-4));',
    '    occ += (sampleZ >= sp.z + 0.02 ? 1.0 : 0.0) * rangeChk;',
    '  }',
    '  float ao = 1.0 - (occ / float(' + SSAO_KERNEL + ')) * uAOParams.y;',
    '  oCol = vec4(clamp(ao, 0.0, 1.0));',
    '}',
    ''].join('\n');

  /* depth-aware 4x4 box blur, run once over the half-res AO buffer */
  var FS_AOBLUR = VER + CH_PRECISION + CH_FRAME + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform sampler2D uAO;',
    'uniform sampler2D uDepth;',
    'uniform vec2 uTexel;',
    'void main(){',
    '  float dc = texture(uDepth, vUV).r;',
    '  float sum = 0.0, wsum = 0.0;',
    '  for (int y = -2; y <= 1; y++){',
    '    for (int x = -2; x <= 1; x++){',
    '      vec2 uv = vUV + vec2(float(x) + 0.5, float(y) + 0.5) * uTexel;',
    '      float ds = texture(uDepth, uv).r;',
    '      float w = exp(-abs(ds - dc) * 900.0);',
    '      sum += texture(uAO, uv).r * w;',
    '      wsum += w;',
    '    }',
    '  }',
    '  oCol = vec4(sum / max(wsum, 1e-4));',
    '}',
    ''].join('\n');

  /* ========================== VOLUMETRIC LIGHT ========================== */
  /* Half-res dithered raymarch. Sun shafts sample the cascade shadow map;
     up to MAX_VOL_LIGHTS tagged point lights add local god-rays (emergency
     lamps stabbing through rain and broken ceilings). */
  var FS_VOLUME = VER + CH_PRECISION_SHADOWSAMP + CH_FRAME + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform sampler2D uDepth;',
    'uniform sampler2D uNoiseTex;',
    'uniform sampler2DArrayShadow uShadowMap;',
    'uniform vec4 uVolLightPos[' + MAX_VOL_LIGHTS + '];',
    'uniform vec4 uVolLightCol[' + MAX_VOL_LIGHTS + '];',
    'uniform vec4 uVolParams;  // x steps, y maxDist, z density, w pointLightCount',
    '',
    'float shadowAt(vec3 wp, float viewZ){',
    '  int c = 0;',
    '  if (viewZ > uCascadeSplits.x) c = 1;',
    '  if (viewZ > uCascadeSplits.y) c = 2;',
    '  mat4 m = uCascade0;',
    '  if (c == 1) m = uCascade1;',
    '  else if (c == 2) m = uCascade2;',
    '  vec4 sc = m * vec4(wp, 1.0);',
    '  vec3 pr = sc.xyz / max(sc.w, 1e-5);',
    '  pr = pr * 0.5 + 0.5;',
    '  if (pr.z >= 1.0 || pr.x < 0.0 || pr.x > 1.0 || pr.y < 0.0 || pr.y > 1.0) return 1.0;',
    '  return texture(uShadowMap, vec4(pr.xy, float(c), pr.z - uMisc2.z * 2.5));',
    '}',
    '',
    'float hg(float cosT, float g){',
    '  float g2 = g * g;',
    '  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * cosT, 1e-4), 1.5));',
    '}',
    '',
    'void main(){',
    '  float d = texture(uDepth, vUV).r;',
    '  vec4 clip = vec4(vUV * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);',
    '  vec4 vp = uInvProj * clip;',
    '  vec3 vpos = vp.xyz / vp.w;',
    '  float sceneDist = length(vpos);',
    '  vec3 wEnd = (uInvView * vec4(vpos, 1.0)).xyz;',
    '  vec3 O = uCamPos.xyz;',
    '  vec3 dir = wEnd - O;',
    '  float total = length(dir);',
    '  if (total < 1e-3){ oCol = vec4(0.0); return; }',
    '  dir /= total;',
    '  float maxD = min(total, uVolParams.y);',
    '  int steps = int(uVolParams.x);',
    '  float stepLen = maxD / float(steps);',
    '  // dither the ray start: blue-ish noise + per-frame temporal rotation',
    '  vec2 np = (gl_FragCoord.xy + uCascadeSplits.w * vec2(11.0, 23.0)) / 128.0;',
    '  float jitter = texture(uNoiseTex, np).a;',
    '  float t = stepLen * jitter;',
    '  vec3 L = normalize(uSunDir.xyz);',
    '  float phase = hg(dot(dir, L), 0.62);',
    '  vec3 acc = vec3(0.0);',
    '  int np2 = int(uVolParams.w);',
    '  for (int i = 0; i < 32; i++){',
    '    if (i >= steps) break;',
    '    vec3 p = O + dir * t;',
    '    // density falls off with height, same slab as the fog',
    '    float dens = uVolParams.z * exp(-max(uFogParams.y, 1e-4) * (p.y - uFogParams.x));',
    '    dens = clamp(dens, 0.0, 4.0);',
    '    if (dens > 1e-4){',
    '      float vz = t * dot(dir, -vec3(uView[0].z, uView[1].z, uView[2].z));',
    '      float sh = shadowAt(p, abs(vz));',
    '      acc += uSunCol.rgb * uSunDir.w * sh * phase * dens * stepLen * 12.0;',
    '      for (int k = 0; k < ' + MAX_VOL_LIGHTS + '; k++){',
    '        if (k >= np2) break;',
    '        vec3 dv = uVolLightPos[k].xyz - p;',
    '        float dd = dot(dv, dv);',
    '        float r = uVolLightPos[k].w;',
    '        if (dd > r * r) continue;',
    '        float dist = sqrt(max(dd, 1e-6));',
    '        float w = clamp(1.0 - (dist / r), 0.0, 1.0);',
    '        w = w * w;',
    '        float ph = hg(dot(dir, dv / dist), 0.35);',
    '        acc += uVolLightCol[k].rgb * w * ph * dens * stepLen * 9.0;',
    '      }',
    '    }',
    '    t += stepLen;',
    '    if (t > maxD) break;',
    '  }',
    '  acc += vec3(0.35, 0.42, 0.62) * uMisc2.x * min(maxD, 40.0) * 0.006;',
    '  oCol = vec4(max(acc, vec3(0.0)) * step(0.0, sceneDist), 1.0);',
    '}',
    ''].join('\n');

  /* ============================== SPRITES ============================== */
  var VS_SPRITE = VER + CH_FRAME + [
    'layout(location = 0) in vec2 aCorner;',
    'layout(location = 4) in vec4 iPosSize;   // xyz world pos, w size',
    'layout(location = 5) in vec4 iColor;     // rgba',
    'layout(location = 6) in vec4 iParams;    // x kind, y seed, z stretch, w spin',
    'out vec2 vQuad;',
    'out vec4 vColor;',
    'out float vKind;',
    'out float vSeed;',
    'out float vViewZ;',
    'out vec4 vScreen;',
    'void main(){',
    '  vec3 wp = iPosSize.xyz;',
    '  float size = iPosSize.w;',
    '  vec3 right = vec3(uInvView[0].x, uInvView[0].y, uInvView[0].z);',
    '  vec3 up = vec3(uInvView[1].x, uInvView[1].y, uInvView[1].z);',
    '  vec3 fwd = vec3(uInvView[2].x, uInvView[2].y, uInvView[2].z);',
    '  vec2 c = aCorner;',
    '  vec3 offs;',
    '  if (iParams.x > 0.5 && iParams.x < 1.5){',
    '    // rain: velocity-aligned stretched billboard',
    '    vec3 vel = normalize(vec3(0.10 * sin(uCamPos.w * 0.31 + iParams.y), -1.0, 0.05));',
    '    vec3 side = normalize(cross(vel, fwd));',
    '    offs = side * (c.x * size) + vel * (c.y * size * iParams.z);',
    '  } else {',
    '    float s = sin(iParams.w), co = cos(iParams.w);',
    '    vec2 r = vec2(c.x * co - c.y * s, c.x * s + c.y * co);',
    '    offs = right * (r.x * size) + up * (r.y * size);',
    '  }',
    '  vec4 wpos = vec4(wp + offs, 1.0);',
    '  vec4 vpos = uView * wpos;',
    '  vViewZ = -vpos.z;',
    '  vQuad = c;',
    '  vColor = iColor;',
    '  vKind = iParams.x;',
    '  vSeed = iParams.y;',
    '  gl_Position = uProj * vpos;',
    '  vScreen = gl_Position;',
    '}',
    ''].join('\n');

  var FS_SPRITE = VER + CH_PRECISION + CH_FRAME + CH_NOISE + CH_FOG + [
    'in vec2 vQuad;',
    'in vec4 vColor;',
    'in float vKind;',
    'in float vSeed;',
    'in float vViewZ;',
    'in vec4 vScreen;',
    'out vec4 oCol;',
    'uniform sampler2D uDepth;',
    'uniform float uSoft;      // 0 = disabled, else fade distance in view units',
    'void main(){',
    '  vec2 q = vQuad;',
    '  float r = length(q);',
    '  float a = vColor.a;',
    '  vec3 c = vColor.rgb;',
    '  int k = int(vKind + 0.5);',
    '  if (k == 0){            // spark: hot core, fast falloff',
    '    a *= exp(-r * r * 6.0);',
    '    c *= 1.0 + (1.0 - r) * 2.5;',
    '  } else if (k == 1){     // rain streak',
    '    float w = 1.0 - abs(q.x);',
    '    a *= smoothstep(0.0, 0.55, w) * smoothstep(1.02, 0.35, abs(q.y));',
    '    c *= 1.0 + (1.0 - abs(q.x)) * 0.6;',
    '  } else if (k == 2){     // smoke: fbm-carved puff',
    '    float n = fbmT(q * 1.7 + vec2(vSeed * 7.3, vSeed * 3.1 + uCamPos.w * 0.12), 64.0, 4);',
    '    a *= smoothstep(1.0, 0.15, r + (n - 0.5) * 0.75);',
    '  } else if (k == 3){     // blood droplet / splat',
    '    float n = vnoiseT(q * 3.0 + vSeed * 11.0, 64.0);',
    '    a *= smoothstep(0.95, 0.35, r + (n - 0.5) * 0.45);',
    '    c *= 0.55 + n * 0.6;',
    '  } else if (k == 4){     // spore: soft glow with a faint ring',
    '    float g = exp(-r * r * 3.2);',
    '    float ring = exp(-pow((r - 0.62) * 6.0, 2.0)) * 0.45;',
    '    a *= (g + ring);',
    '    c *= 1.0 + g * 1.2;',
    '  } else {                // muzzle flash: star burst',
    '    float ang = atan(q.y, q.x);',
    '    float star = 0.55 + 0.45 * abs(cos(ang * 3.0 + vSeed * 6.28));',
    '    a *= exp(-pow(r / max(star, 0.05), 2.6) * 3.2);',
    '    c *= 1.0 + (1.0 - r) * 4.0;',
    '  }',
    '  if (a <= 0.002) discard;',
    '  // soft depth fade against the opaque depth copy',
    '  if (uSoft > 0.0){',
    '    vec2 suv = (vScreen.xy / vScreen.w) * 0.5 + 0.5;',
    '    float sd = texture(uDepth, suv).r;',
    '    vec4 sv = uInvProj * vec4(suv * 2.0 - 1.0, sd * 2.0 - 1.0, 1.0);',
    '    float sceneZ = -(sv.z / sv.w);',
    '    a *= clamp((sceneZ - vViewZ) / uSoft, 0.0, 1.0);',
    '  }',
    '  // sprites live inside the fog volume too',
    '  vec3 wp = uCamPos.xyz;',
    '  float fg = clamp(1.0 - exp(-uFogCol.w * vViewZ), 0.0, 1.0);',
    '  c = mix(c, uFogCol.rgb * 2.0, fg * 0.55);',
    '  c += uFogCol.rgb * uMisc2.x * 3.0;',
    '  oCol = vec4(c * a, a);   // premultiplied: works for both blend modes',
    '}',
    ''].join('\n');

  /* ============================ POST STACK ============================= */
  var FS_BRIGHT = VER + CH_PRECISION + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform sampler2D uSrc;',
    'uniform vec4 uParams;   // x threshold, y knee, z prescale, w unused',
    'void main(){',
    '  vec3 c = texture(uSrc, vUV).rgb * uParams.z;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  float t = uParams.x;',
    '  float knee = max(uParams.y, 1e-4);',
    '  float soft = clamp((l - t + knee) / (2.0 * knee), 0.0, 1.0);',
    '  float w = max(l - t, soft * soft * knee) / max(l, 1e-4);',
    '  oCol = vec4(c * w, 1.0);',
    '}',
    ''].join('\n');

  var FS_BLUR = VER + CH_PRECISION + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform sampler2D uSrc;',
    'uniform vec2 uDir;   // texel-sized step, horizontal or vertical',
    'void main(){',
    '  // 9-tap gaussian collapsed into 5 bilinear fetches',
    '  vec3 c = texture(uSrc, vUV).rgb * 0.2270270270;',
    '  c += texture(uSrc, vUV + uDir * 1.3846153846).rgb * 0.3162162162;',
    '  c += texture(uSrc, vUV - uDir * 1.3846153846).rgb * 0.3162162162;',
    '  c += texture(uSrc, vUV + uDir * 3.2307692308).rgb * 0.0702702703;',
    '  c += texture(uSrc, vUV - uDir * 3.2307692308).rgb * 0.0702702703;',
    '  oCol = vec4(c, 1.0);',
    '}',
    ''].join('\n');

  /* generic blit / additive upsample */
  var FS_BLIT = VER + CH_PRECISION + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform sampler2D uSrc;',
    'uniform vec4 uTint;',
    'void main(){',
    '  oCol = vec4(texture(uSrc, vUV).rgb * uTint.rgb, uTint.a);',
    '}',
    ''].join('\n');

  /* log-luminance downsample, mip-averaged then temporally adapted */
  var FS_LUM = VER + CH_PRECISION + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform sampler2D uSrc;',
    'uniform float uPrescale;',
    'void main(){',
    '  vec3 c = texture(uSrc, vUV).rgb * uPrescale;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  oCol = vec4(log(max(l, 1e-4)), 0.0, 0.0, 1.0);',
    '}',
    ''].join('\n');

  var FS_ADAPT = VER + CH_PRECISION + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform sampler2D uLumTex;',
    'uniform sampler2D uPrev;',
    'uniform vec2 uAdapt;   // x = dt, y = speed',
    'void main(){',
    '  float avg = exp(textureLod(uLumTex, vec2(0.5), 8.0).r);',
    '  float prev = texture(uPrev, vec2(0.5)).r;',
    '  if (prev <= 0.0) prev = avg;',
    '  float k = 1.0 - exp(-uAdapt.x * uAdapt.y);',
    '  oCol = vec4(prev + (avg - prev) * k, 0.0, 0.0, 1.0);',
    '}',
    ''].join('\n');

  /* The final composite. One fullscreen triangle, everything folded in. */
  var FS_COMPOSITE = VER + CH_PRECISION + CH_NOISE + [
    'in vec2 vUV;',
    'out vec4 oCol;',
    'uniform sampler2D uSrc;',
    'uniform sampler2D uBloom0;',
    'uniform sampler2D uBloom1;',
    'uniform sampler2D uBloom2;',
    'uniform sampler2D uLum;',
    'uniform sampler2D uNoiseTex;',
    'uniform vec4 uP0;   // x exposure, y bloom, z grain, w chroma',
    'uniform vec4 uP1;   // x vignette, y saturation, z contrast, w time',
    'uniform vec4 uP2;   // x hurt, y flashbang, z lightning, w rainLens',
    'uniform vec4 uP3;   // x prescale, y bloomMips, z autoExposure, w scanline',
    '',
    'vec3 aces(vec3 x){',
    '  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;',
    '  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);',
    '}',
    '',
    'void main(){',
    '  vec2 uv = vUV;',
    '  vec2 cen = uv - 0.5;',
    '  float r2 = dot(cen, cen);',
    '',
    '  // --- hurt barrel warp + rain-on-lens refraction --------------------',
    '  float hurt = uP2.x;',
    '  uv += cen * r2 * (hurt * 0.22);',
    '  float rain = uP2.w;',
    '  if (rain > 0.001){',
    '    // vertical trickles: scroll a stretched noise field, take its gradient',
    '    vec2 rp = vec2(vUV.x * 5.0, vUV.y * 1.35 - uP1.w * 0.16);',
    '    float n1 = texture(uNoiseTex, rp).r;',
    '    vec2 rp2 = vec2(vUV.x * 11.0 + 4.0, vUV.y * 2.6 - uP1.w * 0.32);',
    '    float n2 = texture(uNoiseTex, rp2).g;',
    '    float streak = smoothstep(0.62, 0.95, n1) * 0.7 + smoothstep(0.72, 0.99, n2) * 0.3;',
    '    float grad = (n1 - n2);',
    '    uv += vec2(grad, grad * 0.4) * streak * rain * 0.03;',
    '  }',
    '',
    '  // --- radial chromatic aberration -----------------------------------',
    '  float ca = uP0.w * (0.0035 + hurt * 0.010) * (0.25 + r2 * 3.0);',
    '  vec3 hdr;',
    '  hdr.r = texture(uSrc, uv + cen * ca).r;',
    '  hdr.g = texture(uSrc, uv).g;',
    '  hdr.b = texture(uSrc, uv - cen * ca).b;',
    '  hdr *= uP3.x;',
    '',
    '  // --- bloom ---------------------------------------------------------',
    '  vec3 bl = texture(uBloom0, uv).rgb;',
    '  if (uP3.y > 1.5) bl += texture(uBloom1, uv).rgb * 0.75;',
    '  if (uP3.y > 2.5) bl += texture(uBloom2, uv).rgb * 0.55;',
    '  bl *= uP3.x;',
    '  hdr += bl * uP0.y;',
    '',
    '  // --- exposure with slow eye adaptation ------------------------------',
    '  float ex = uP0.x;',
    '  if (uP3.z > 0.5){',
    '    float avg = max(texture(uLum, vec2(0.5)).r, 1e-3);',
    '    ex *= clamp(0.36 / avg, 0.25, 5.0);',
    '  }',
    '  hdr *= ex;',
    '',
    '  // --- flashbang blows the whole exposure out --------------------------',
    '  hdr += vec3(1.0, 0.98, 0.94) * uP2.y * 14.0;',
    '  hdr += vec3(0.62, 0.72, 1.0) * uP2.z * 3.2;',
    '',
    '  vec3 col = aces(hdr);',
    '',
    '  // --- grade: desaturate, crush blacks, sickly-green shadows, red highs',
    '  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(vec3(lum), col, uP1.y);',
    '  col = clamp((col - 0.5) * uP1.z + 0.5, 0.0, 1.0);',
    '  vec3 shadowTint = vec3(0.80, 1.06, 0.90);',
    '  vec3 highTint = vec3(1.07, 0.97, 0.93);',
    '  col *= mix(shadowTint, highTint, smoothstep(0.15, 0.75, lum));',
    '  col = pow(max(col, vec3(0.0)), vec3(1.06));   // crush the toe',
    '',
    '  // --- rain-on-lens specular sparkle -----------------------------------',
    '  if (rain > 0.001){',
    '    vec2 rp = vec2(vUV.x * 5.0, vUV.y * 1.35 - uP1.w * 0.16);',
    '    float n1 = texture(uNoiseTex, rp).r;',
    '    float streak = smoothstep(0.70, 0.98, n1);',
    '    col += vec3(0.34, 0.40, 0.52) * streak * rain * 0.30;',
    '    float droplet = smoothstep(0.90, 1.0, texture(uNoiseTex, vUV * 3.0 + vec2(0.0, -uP1.w * 0.02)).b);',
    '    col += vec3(0.22, 0.26, 0.34) * droplet * rain * 0.25;',
    '  }',
    '',
    '  // --- hurt vignette: arterial red pulse from the edges -----------------',
    '  if (hurt > 0.001){',
    '    float pulse = 0.62 + 0.38 * sin(uP1.w * 7.5);',
    '    float e = smoothstep(0.16, 0.62, r2);',
    '    col = mix(col, vec3(0.42, 0.02, 0.02), e * hurt * pulse * 0.85);',
    '    col.r += e * hurt * 0.18 * pulse;',
    '  }',
    '',
    '  // --- vignette + dirty-lens bloom bleed --------------------------------',
    '  float vig = 1.0 - uP1.x * smoothstep(0.05, 0.72, r2);',
    '  col *= vig;',
    '  float dirt = texture(uNoiseTex, vUV * 1.7).b;',
    '  col += bl * uP0.y * dirt * 0.06;',
    '',
    '  // --- scanlines (CRT monitors / found footage beats) --------------------',
    '  if (uP3.w > 0.001){',
    '    float sl = 0.5 + 0.5 * sin(vUV.y * 900.0 + uP1.w * 3.0);',
    '    col *= 1.0 - uP3.w * 0.35 * sl;',
    '  }',
    '',
    '  // --- animated film grain (luma-weighted so darks stay noisy) ----------',
    '  float g = texture(uNoiseTex, vUV * 7.0 + vec2(fract(uP1.w * 13.0), fract(uP1.w * 7.3))).a;',
    '  float gn = (g - 0.5) * uP0.z;',
    '  col += gn * (0.35 + (1.0 - lum) * 0.9) * 0.28;',
    '',
    '  col = max(col, vec3(0.0));',
    '  // sRGB-ish output transfer',
    '  oCol = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);',
    '}',
    ''].join('\n');

  /* ======================================================================
     RUNTIME DRIVER
     ====================================================================== */

  var gl = null, canvasEl = null, aniso = null;
  var qLevel = 2, Qs = QUALITY[2];
  var W = 1280, H = 720, DPR = 1, RW = 1280, RH = 720;
  var progs = {}, tex = {}, fb = {};
  var uboFrame = null, uboLights = null;
  var frameData = new Float32Array(FRAME_FLOATS);
  var lightData = new Float32Array(LIGHT_FLOATS);
  var spriteData = new Float32Array(MAX_SPRITES * SPRITE_STRIDE);
  var spriteVAO = null, spriteInstBuf = null, emptyVAO = null;
  var halfFloatOK = false, floatRTOK = false;
  var frameIndex = 0, envDirty = true, lastEnvKey = '';
  var ok = false;

  /* preallocated scratch */
  var mView = M4.create(), mProj = M4.create(), mVP = M4.create();
  var mInvView = M4.create(), mInvProj = M4.create(), mPrevVP = M4.create();
  var mTmp = M4.create(), mTmp2 = M4.create(), mLightVP = [M4.create(), M4.create(), M4.create()];
  var nrmMat = new Float32Array(9);
  var vTmp = V3.create(), vTmp2 = V3.create(), vTmp3 = V3.create();
  var camTarget = V3.create(), camUp = V3.create(0, 1, 0);
  var planes = new Float32Array(24);
  var splits = new Float32Array(4);
  var ssaoKernel = new Float32Array(SSAO_KERNEL * 3);
  var drawOrder = new Int32Array(MAX_DRAWS);
  var drawKey = new Float64Array(MAX_DRAWS);
  var orderArr = [];
  var volPos = new Float32Array(MAX_VOL_LIGHTS * 4);
  var volCol = new Float32Array(MAX_VOL_LIGHTS * 4);
  var identity = M4.create();

  var stats = { drawCalls: 0, tris: 0, fps: 60, lights: 0, culled: 0, sprites: 0 };
  var debug = { wireframe: false, showCascades: false, noPost: false, noShadow: false };

  var KIND_ID = { spark: 0, rain: 1, smoke: 2, blood: 3, spore: 4, muzzle: 5 };
  var KIND_ADDITIVE = { spark: 1, muzzle: 1 };

  /* ------------------------------------------------------------------ */
  function compileShader(type, src, name) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s) || '';
      var lines = src.split('\n');
      var numbered = [];
      /* Print only the neighbourhood of each reported line: full dumps of a
         900-line shader are useless in a console. */
      var re = /(\d+):(\d+)/g, m, want = {};
      while ((m = re.exec(log)) !== null) {
        var ln = parseInt(m[2], 10);
        for (var k = ln - 3; k <= ln + 3; k++) { want[k] = 1; }
      }
      for (var i = 0; i < lines.length; i++) {
        if (want[i + 1]) { numbered.push((i + 1) + ' | ' + lines[i]); }
      }
      if (typeof console !== 'undefined') {
        console.error('[IP.Renderer] shader compile failed: ' + name + '\n' + log +
                      (numbered.length ? '\n' + numbered.join('\n') : ''));
      }
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function makeProg(vsSrc, fsSrc, name) {
    var vs = compileShader(gl.VERTEX_SHADER, vsSrc, name + '.vert');
    var fs = compileShader(gl.FRAGMENT_SHADER, fsSrc, name + '.frag');
    if (!vs || !fs) { return null; }
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (typeof console !== 'undefined') {
        console.error('[IP.Renderer] link failed: ' + name + '\n' + (gl.getProgramInfoLog(p) || ''));
      }
      gl.deleteProgram(p);
      return null;
    }
    var obj = { p: p, u: {}, name: name };
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) | 0;
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      if (!info) { continue; }
      var nm = info.name.replace(/\[0\]$/, '');
      obj.u[nm] = gl.getUniformLocation(p, info.name);
    }
    /* Uniform blocks bind to fixed points so we never rebind them per draw. */
    bindBlock(p, 'Frame', UBO_FRAME);
    bindBlock(p, 'Lights', UBO_LIGHTS);
    return obj;
  }

  function bindBlock(p, blockName, point) {
    try {
      var idx = gl.getUniformBlockIndex(p, blockName);
      if (idx !== undefined && idx !== 0xFFFFFFFF && idx >= 0) {
        gl.uniformBlockBinding(p, idx, point);
      }
    } catch (e) { /* block absent from this program */ }
  }

  function u1i(pr, n, v) { if (pr.u[n] !== undefined && pr.u[n] !== null) { gl.uniform1i(pr.u[n], v); } }
  function u1f(pr, n, v) { if (pr.u[n] !== undefined && pr.u[n] !== null) { gl.uniform1f(pr.u[n], v); } }
  function u2f(pr, n, a, b) { if (pr.u[n] !== undefined && pr.u[n] !== null) { gl.uniform2f(pr.u[n], a, b); } }
  function u3f(pr, n, a, b, c) { if (pr.u[n] !== undefined && pr.u[n] !== null) { gl.uniform3f(pr.u[n], a, b, c); } }
  function u4f(pr, n, a, b, c, d) { if (pr.u[n] !== undefined && pr.u[n] !== null) { gl.uniform4f(pr.u[n], a, b, c, d); } }
  function uMat4(pr, n, m) { if (pr.u[n] !== undefined && pr.u[n] !== null) { gl.uniformMatrix4fv(pr.u[n], false, m); } }
  function uMat3(pr, n, m) { if (pr.u[n] !== undefined && pr.u[n] !== null) { gl.uniformMatrix3fv(pr.u[n], false, m); } }
  function u3fv(pr, n, a) { if (pr.u[n] !== undefined && pr.u[n] !== null) { gl.uniform3fv(pr.u[n], a); } }
  function u4fv(pr, n, a) { if (pr.u[n] !== undefined && pr.u[n] !== null) { gl.uniform4fv(pr.u[n], a); } }

  /* Assign sampler uniforms to their fixed texture units, once per program. */
  function assignSamplers(pr, map) {
    if (!pr) { return; }
    gl.useProgram(pr.p);
    for (var k in map) { if (Object.prototype.hasOwnProperty.call(map, k)) { u1i(pr, k, map[k]); } }
  }

  /* ------------------------------------------------------------------ */
  function makeTex2D(w, h, internal, filter, wrap, levels) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, levels || 1, internal, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
    t.__w = w; t.__h = h;
    return t;
  }

  function makeFBO(colorTextures, depthTexture) {
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    var bufs = [];
    if (colorTextures) {
      for (var i = 0; i < colorTextures.length; i++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D,
                                colorTextures[i], 0);
        bufs.push(gl.COLOR_ATTACHMENT0 + i);
      }
      if (bufs.length > 1) { gl.drawBuffers(bufs); }
    }
    if (depthTexture) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
    }
    var st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE && typeof console !== 'undefined') {
      console.warn('[IP.Renderer] incomplete framebuffer 0x' + st.toString(16));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return f;
  }

  function del(o, kind) {
    if (!o) { return; }
    if (kind === 'tex') { gl.deleteTexture(o); }
    else if (kind === 'fbo') { gl.deleteFramebuffer(o); }
  }

  /* HDR colour format, chosen from what the device actually supports. */
  function hdrFormat() {
    if (floatRTOK) { return gl.RGBA16F; }
    return gl.RGBA8;
  }

  /* ------------------------------------------------------------------ */
  /*  CPU noise atlas: r=fbm  g=worley  b=perlin  a=white                 */
  function buildNoiseTexture() {
    var N = 256, data = new Uint8Array(N * N * 4);
    var r = Rand.make(0xBEEF);
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var i = (y * N + x) * 4;
        var fx = x / N * 8, fy = y / N * 8;
        data[i] = Math.floor((Noise.fbm2(fx, fy, 5, 2.0, 0.5) * 0.5 + 0.5) * 255);
        data[i + 1] = Math.floor(Noise.worley2(fx * 1.5, fy * 1.5) * 255);
        data[i + 2] = Math.floor((Noise.perlin2(fx * 2, fy * 2) * 0.5 + 0.5) * 255);
        data[i + 3] = Math.floor(r.f() * 255);
      }
    }
    var t = makeTex2D(N, N, gl.RGBA8, gl.LINEAR, gl.REPEAT, 1);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return t;
  }

  /*  Material library: one MRT pass per layer into three 2D array textures. */
  function buildMaterialArrays() {
    var S = TEXGEN_SIZE, L = TEX_LAYERS;
    var levels = Math.floor(Math.log(S) / Math.LN2) + 1;
    var names = ['albedoArr', 'normalArr', 'ormArr'];
    var i, t;
    for (i = 0; i < 3; i++) {
      t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, S, S, L);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
      if (aniso) {
        gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Qs.aniso);
      }
      tex[names[i]] = t;
    }
    if (!progs.texgen) { return; }

    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.viewport(0, 0, S, S);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(progs.texgen.p);
    gl.activeTexture(gl.TEXTURE0 + TU_NOISE);
    gl.bindTexture(gl.TEXTURE_2D, tex.noise);
    u1i(progs.texgen, 'uNoiseTex', TU_NOISE);
    gl.bindVertexArray(emptyVAO);
    for (var layer = 0; layer < L; layer++) {
      for (i = 0; i < 3; i++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i,
                                   tex[names[i]], 0, layer);
      }
      u1i(progs.texgen, 'uLayer', layer);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(f);
    for (i = 0; i < 3; i++) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex[names[i]]);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    }
  }

  /*  Procedural sky -> cubemap with roughness-prefiltered mips. */
  function buildEnvironment(sun, sunColor, lightning, time) {
    if (!progs.env) { return; }
    if (!tex.env) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
      gl.texStorage2D(gl.TEXTURE_CUBE_MAP, ENV_MIPS, hdrFormat(), ENV_SIZE, ENV_SIZE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      tex.env = t;
    }
    if (!fb.env) { fb.env = gl.createFramebuffer(); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.env);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.useProgram(progs.env.p);
    gl.activeTexture(gl.TEXTURE0 + TU_NOISE);
    gl.bindTexture(gl.TEXTURE_2D, tex.noise);
    u1i(progs.env, 'uNoiseTex', TU_NOISE);
    u3f(progs.env, 'uSun', -sun[0], -sun[1], -sun[2]);
    u3f(progs.env, 'uSunColor', sunColor[0], sunColor[1], sunColor[2]);
    u1f(progs.env, 'uLightning', lightning || 0);
    u1f(progs.env, 'uTime', time || 0);
    gl.bindVertexArray(emptyVAO);
    for (var mip = 0; mip < ENV_MIPS; mip++) {
      var size = Math.max(1, ENV_SIZE >> mip);
      gl.viewport(0, 0, size, size);
      u1f(progs.env, 'uRough', ENV_MIPS > 1 ? mip / (ENV_MIPS - 1) : 0);
      for (var face = 0; face < 6; face++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                                gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, tex.env, mip);
        u1i(progs.env, 'uFace', face);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ------------------------------------------------------------------ */
  function allocShadow() {
    if (tex.shadow) { del(tex.shadow, 'tex'); tex.shadow = null; }
    if (fb.shadow) { del(fb.shadow, 'fbo'); fb.shadow = null; }
    var size = Qs.shadowSize, layers = Qs.cascades;
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, size, size, layers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    tex.shadow = t;
    fb.shadow = gl.createFramebuffer();
  }

  function allocTargets() {
    var i;
    ['hdr', 'depth', 'depthCopy', 'ao0', 'ao1', 'vol', 'lum1', 'adapt0', 'adapt1'].forEach(function (k) {
      if (tex[k]) { del(tex[k], 'tex'); tex[k] = null; }
    });
    if (tex.bloom) { for (i = 0; i < tex.bloom.length; i++) { del(tex.bloom[i], 'tex'); del(tex.bloomTmp[i], 'tex'); } }
    ['hdr', 'depthCopy', 'ao0', 'ao1', 'vol', 'lum1', 'adapt0', 'adapt1'].forEach(function (k) {
      if (fb[k]) { del(fb[k], 'fbo'); fb[k] = null; }
    });
    if (fb.bloom) { for (i = 0; i < fb.bloom.length; i++) { del(fb.bloom[i], 'fbo'); del(fb.bloomTmp[i], 'fbo'); } }

    var fmt = hdrFormat();
    tex.hdr = makeTex2D(RW, RH, fmt, gl.LINEAR, gl.CLAMP_TO_EDGE, 1);
    tex.depth = makeTex2D(RW, RH, gl.DEPTH_COMPONENT24, gl.NEAREST, gl.CLAMP_TO_EDGE, 1);
    fb.hdr = makeFBO([tex.hdr], tex.depth);

    tex.depthCopy = makeTex2D(RW, RH, gl.DEPTH_COMPONENT24, gl.NEAREST, gl.CLAMP_TO_EDGE, 1);
    fb.depthCopy = makeFBO(null, tex.depthCopy);

    var aw = Math.max(1, RW * Qs.ssaoScale | 0), ah = Math.max(1, RH * Qs.ssaoScale | 0);
    tex.ao0 = makeTex2D(aw, ah, gl.RGBA8, gl.LINEAR, gl.CLAMP_TO_EDGE, 1);
    tex.ao1 = makeTex2D(aw, ah, gl.RGBA8, gl.LINEAR, gl.CLAMP_TO_EDGE, 1);
    fb.ao0 = makeFBO([tex.ao0], null);
    fb.ao1 = makeFBO([tex.ao1], null);

    var vw = Math.max(1, RW * Qs.volScale | 0), vh = Math.max(1, RH * Qs.volScale | 0);
    tex.vol = makeTex2D(vw, vh, fmt, gl.LINEAR, gl.CLAMP_TO_EDGE, 1);
    fb.vol = makeFBO([tex.vol], null);

    tex.bloom = []; tex.bloomTmp = []; fb.bloom = []; fb.bloomTmp = [];
    for (i = 0; i < 3; i++) {
      var bw = Math.max(1, RW >> (i + 1)), bh = Math.max(1, RH >> (i + 1));
      tex.bloom.push(makeTex2D(bw, bh, fmt, gl.LINEAR, gl.CLAMP_TO_EDGE, 1));
      tex.bloomTmp.push(makeTex2D(bw, bh, fmt, gl.LINEAR, gl.CLAMP_TO_EDGE, 1));
      fb.bloom.push(makeFBO([tex.bloom[i]], null));
      fb.bloomTmp.push(makeFBO([tex.bloomTmp[i]], null));
    }

    tex.lum1 = makeTex2D(64, 64, fmt, gl.LINEAR, gl.CLAMP_TO_EDGE, 7);
    fb.lum1 = makeFBO([tex.lum1], null);
    tex.adapt0 = makeTex2D(1, 1, fmt, gl.NEAREST, gl.CLAMP_TO_EDGE, 1);
    tex.adapt1 = makeTex2D(1, 1, fmt, gl.NEAREST, gl.CLAMP_TO_EDGE, 1);
    fb.adapt0 = makeFBO([tex.adapt0], null);
    fb.adapt1 = makeFBO([tex.adapt1], null);
  }

  /* ------------------------------------------------------------------ */
  function buildPrograms() {
    progs.texgen = makeProg(VS_FULLSCREEN, FS_TEXGEN, 'texgen');
    progs.env = makeProg(VS_FULLSCREEN, FS_ENV, 'env');
    progs.sky = makeProg(VS_SKY, FS_SKY, 'sky');
    progs.depth = makeProg(VS_DEPTH, FS_DEPTH, 'depth');
    progs.pbr = makeProg(VS_PBR, FS_PBR, 'pbr');
    progs.fallback = makeProg(VS_PBR, FS_FALLBACK, 'fallback');
    progs.ssao = makeProg(VS_FULLSCREEN, FS_SSAO, 'ssao');
    progs.aoblur = makeProg(VS_FULLSCREEN, FS_AOBLUR, 'aoblur');
    progs.volume = makeProg(VS_FULLSCREEN, FS_VOLUME, 'volume');
    progs.sprite = makeProg(VS_SPRITE, FS_SPRITE, 'sprite');
    progs.bright = makeProg(VS_FULLSCREEN, FS_BRIGHT, 'bright');
    progs.blur = makeProg(VS_FULLSCREEN, FS_BLUR, 'blur');
    progs.blit = makeProg(VS_FULLSCREEN, FS_BLIT, 'blit');
    progs.lum = makeProg(VS_FULLSCREEN, FS_LUM, 'lum');
    progs.adapt = makeProg(VS_FULLSCREEN, FS_ADAPT, 'adapt');
    progs.composite = makeProg(VS_FULLSCREEN, FS_COMPOSITE, 'composite');

    /* The PBR program is the only one we cannot live without. */
    if (!progs.pbr) { progs.pbr = progs.fallback; }

    assignSamplers(progs.pbr, {
      uTexAlbedo: TU_ALBEDO, uTexNormal: TU_NORMAL, uTexORM: TU_ORM,
      uShadowMap: TU_SHADOW, uEnv: TU_ENV, uAOTex: TU_AO
    });
    assignSamplers(progs.sky, { uEnv: TU_ENV });
    assignSamplers(progs.ssao, { uDepth: TU_DEPTH, uNoiseTex: TU_NOISE });
    assignSamplers(progs.aoblur, { uAO: TU_AO, uDepth: TU_DEPTH });
    assignSamplers(progs.volume, { uDepth: TU_DEPTH, uNoiseTex: TU_NOISE, uShadowMap: TU_SHADOW });
    assignSamplers(progs.sprite, { uDepth: TU_DEPTH });
    assignSamplers(progs.bright, { uSrc: TU_SRC });
    assignSamplers(progs.blur, { uSrc: TU_SRC });
    assignSamplers(progs.blit, { uSrc: TU_SRC });
    assignSamplers(progs.lum, { uSrc: TU_SRC });
    assignSamplers(progs.adapt, { uLumTex: TU_SRC, uPrev: TU_LUM });
    assignSamplers(progs.composite, {
      uSrc: TU_SRC, uBloom0: TU_BLOOM, uBloom1: TU_BLOOM + 1, uBloom2: TU_VOL,
      uLum: TU_LUM, uNoiseTex: TU_NOISE
    });
  }

  function buildSSAOKernel() {
    var r = Rand.make(0x5EED);
    for (var i = 0; i < SSAO_KERNEL; i++) {
      var x = r.f() * 2 - 1, y = r.f() * 2 - 1, z = r.f();
      var l = Math.sqrt(x * x + y * y + z * z) || 1;
      var scale = 0.1 + 0.9 * (i / SSAO_KERNEL) * (i / SSAO_KERNEL);
      ssaoKernel[i * 3] = x / l * scale;
      ssaoKernel[i * 3 + 1] = y / l * scale;
      ssaoKernel[i * 3 + 2] = z / l * scale;
    }
  }

  function buildSpriteGeometry() {
    spriteVAO = gl.createVertexArray();
    gl.bindVertexArray(spriteVAO);
    var corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    var cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    spriteInstBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spriteInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, spriteData.byteLength, gl.DYNAMIC_DRAW);
    var stride = SPRITE_STRIDE * 4;
    gl.enableVertexAttribArray(A_INST_A);
    gl.vertexAttribPointer(A_INST_A, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(A_INST_A, 1);
    gl.enableVertexAttribArray(A_INST_B);
    gl.vertexAttribPointer(A_INST_B, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(A_INST_B, 1);
    gl.enableVertexAttribArray(A_INST_C);
    gl.vertexAttribPointer(A_INST_C, 4, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(A_INST_C, 1);
    gl.bindVertexArray(null);
  }

  /* ------------------------------------------------------------------ */
  /*  PUBLIC: init                                                       */
  /* ------------------------------------------------------------------ */
  function init(canvas, opts) {
    opts = opts || {};
    canvasEl = canvas;
    try {
      gl = canvas.getContext('webgl2', {
        antialias: false, alpha: false, depth: true, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false,
        premultipliedAlpha: false, desynchronized: false,
        failIfMajorPerformanceCaveat: false
      });
    } catch (e) { gl = null; }
    if (!gl) { ok = false; return false; }

    floatRTOK = !!gl.getExtension('EXT_color_buffer_float');
    halfFloatOK = floatRTOK || !!gl.getExtension('EXT_color_buffer_half_float');
    if (!floatRTOK && halfFloatOK) { floatRTOK = true; }
    gl.getExtension('OES_texture_float_linear');
    gl.getExtension('EXT_float_blend');
    aniso = gl.getExtension('EXT_texture_filter_anisotropic');

    RW = Math.max(1, canvas.width || 1280);
    RH = Math.max(1, canvas.height || 720);
    W = RW; H = RH;

    emptyVAO = gl.createVertexArray();

    uboFrame = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, uboFrame);
    gl.bufferData(gl.UNIFORM_BUFFER, frameData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, UBO_FRAME, uboFrame);

    uboLights = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, uboLights);
    gl.bufferData(gl.UNIFORM_BUFFER, lightData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, UBO_LIGHTS, uboLights);

    buildPrograms();
    buildSSAOKernel();
    buildSpriteGeometry();

    tex.noise = buildNoiseTexture();
    buildMaterialArrays();
    buildEnvironment([0.32, -0.78, 0.54], [0.42, 0.50, 0.66], 0, 0);

    allocShadow();
    allocTargets();

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearColor(0, 0, 0, 1);

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault(); ok = false;
      if (typeof console !== 'undefined') { console.warn('[IP.Renderer] context lost'); }
    }, false);

    ok = true;
    return true;
  }

  function resize(w, h, dpr) {
    if (!ok) { return; }
    DPR = dpr || 1;
    W = Math.max(1, w | 0); H = Math.max(1, h | 0);
    RW = Math.max(1, (W * DPR) | 0); RH = Math.max(1, (H * DPR) | 0);
    if (canvasEl) { canvasEl.width = RW; canvasEl.height = RH; }
    allocTargets();
  }

  function setQuality(q) {
    q = q < 0 ? 0 : (q > 2 ? 2 : (q | 0));
    if (!ok) { qLevel = q; Qs = QUALITY[q]; return; }
    var prevShadow = Qs.shadowSize, prevCascades = Qs.cascades;
    qLevel = q; Qs = QUALITY[q];
    if (Qs.shadowSize !== prevShadow || Qs.cascades !== prevCascades) { allocShadow(); }
    allocTargets();
    envDirty = true;
  }

  /* ------------------------------------------------------------------ */
  /*  PUBLIC: geometry upload                                            */
  /* ------------------------------------------------------------------ */
  function computeBounds(geo) {
    var p = geo.positions, n = p.length;
    var mnx = 1e30, mny = 1e30, mnz = 1e30, mxx = -1e30, mxy = -1e30, mxz = -1e30;
    for (var i = 0; i < n; i += 3) {
      var x = p[i], y = p[i + 1], z = p[i + 2];
      if (x < mnx) { mnx = x; } if (x > mxx) { mxx = x; }
      if (y < mny) { mny = y; } if (y > mxy) { mxy = y; }
      if (z < mnz) { mnz = z; } if (z > mxz) { mxz = z; }
    }
    if (n === 0) { mnx = mny = mnz = mxx = mxy = mxz = 0; }
    return { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] };
  }

  function upload(geo) {
    if (!ok || !geo || !geo.positions || !geo.indices) { return null; }
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vc = geo.positions.length / 3;

    var vbPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbPos);
    gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(A_POS);
    gl.vertexAttribPointer(A_POS, 3, gl.FLOAT, false, 0, 0);

    var normals = geo.normals;
    if (!normals || normals.length !== geo.positions.length) {
      normals = new Float32Array(geo.positions.length);
      for (var i = 1; i < normals.length; i += 3) { normals[i] = 1; }
    }
    var vbNrm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbNrm);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(A_NRM);
    gl.vertexAttribPointer(A_NRM, 3, gl.FLOAT, false, 0, 0);

    var uvs = geo.uvs && geo.uvs.length === vc * 2 ? geo.uvs : new Float32Array(vc * 2);
    var vbUV = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbUV);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(A_UV);
    gl.vertexAttribPointer(A_UV, 2, gl.FLOAT, false, 0, 0);

    var cols = geo.colors && geo.colors.length === vc * 3 ? geo.colors : null;
    if (!cols) { cols = new Float32Array(vc * 3); cols.fill(1); }
    var vbCol = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbCol);
    gl.bufferData(gl.ARRAY_BUFFER, cols, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(A_COL);
    gl.vertexAttribPointer(A_COL, 3, gl.FLOAT, false, 0, 0);

    var idx = geo.indices;
    var use32 = vc > 65535 || !(idx instanceof Uint16Array);
    var idata = use32 ? (idx instanceof Uint32Array ? idx : new Uint32Array(idx))
                      : (idx instanceof Uint16Array ? idx : new Uint16Array(idx));
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idata, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    var b = geo.bounds || computeBounds(geo);
    var cxx = (b.min[0] + b.max[0]) * 0.5, cyy = (b.min[1] + b.max[1]) * 0.5, czz = (b.min[2] + b.max[2]) * 0.5;
    var rr = Math.sqrt((b.max[0] - cxx) * (b.max[0] - cxx) +
                       (b.max[1] - cyy) * (b.max[1] - cyy) +
                       (b.max[2] - czz) * (b.max[2] - czz));
    return {
      vao: vao, ibo: ibo, count: idata.length,
      type: use32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      bufs: [vbPos, vbNrm, vbUV, vbCol],
      bounds: b, cx: cxx, cy: cyy, cz: czz, radius: rr || 0.001
    };
  }

  function updateMesh(mesh, geo) {
    if (!ok || !mesh || !geo) { return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bufs[0]);
    gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.DYNAMIC_DRAW);
    if (geo.normals) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bufs[1]);
      gl.bufferData(gl.ARRAY_BUFFER, geo.normals, gl.DYNAMIC_DRAW);
    }
    var b = geo.bounds || computeBounds(geo);
    mesh.bounds = b;
    mesh.cx = (b.min[0] + b.max[0]) * 0.5;
    mesh.cy = (b.min[1] + b.max[1]) * 0.5;
    mesh.cz = (b.min[2] + b.max[2]) * 0.5;
  }

  function dispose(mesh) {
    if (!ok || !mesh) { return; }
    gl.deleteVertexArray(mesh.vao);
    gl.deleteBuffer(mesh.ibo);
    for (var i = 0; i < mesh.bufs.length; i++) { gl.deleteBuffer(mesh.bufs[i]); }
  }

  /* ------------------------------------------------------------------ */
  /*  Frustum culling                                                    */
  /* ------------------------------------------------------------------ */
  function extractPlanes(m) {
    var i, o;
    /* left, right, bottom, top, near, far - rows of the view-projection */
    var rows = [[0, 3, 1], [0, 3, -1], [1, 3, 1], [1, 3, -1], [2, 3, 1], [2, 3, -1]];
    for (i = 0; i < 6; i++) {
      var r = rows[i], a = r[0], sgn = r[2];
      o = i * 4;
      planes[o] = m[3] + sgn * m[a];
      planes[o + 1] = m[7] + sgn * m[4 + a];
      planes[o + 2] = m[11] + sgn * m[8 + a];
      planes[o + 3] = m[15] + sgn * m[12 + a];
      var len = Math.sqrt(planes[o] * planes[o] + planes[o + 1] * planes[o + 1] + planes[o + 2] * planes[o + 2]) || 1;
      planes[o] /= len; planes[o + 1] /= len; planes[o + 2] /= len; planes[o + 3] /= len;
    }
  }

  function sphereVisible(x, y, z, r) {
    for (var i = 0; i < 6; i++) {
      var o = i * 4;
      if (planes[o] * x + planes[o + 1] * y + planes[o + 2] * z + planes[o + 3] < -r) { return false; }
    }
    return true;
  }

  /* World-space centre/radius of a draw item, accounting for its matrix. */
  var _wc = new Float32Array(3);
  function itemSphere(it) {
    var g = it.geo, m = it.m;
    if (!g) { return 0; }
    M4.transformPoint(_wc, m, [g.cx, g.cy, g.cz]);
    /* uniform-ish scale estimate from the matrix basis */
    var sx = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
    var sy = Math.sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6]);
    var sz = Math.sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10]);
    return g.radius * Math.max(sx, Math.max(sy, sz));
  }

  /* ------------------------------------------------------------------ */
  /*  Material binding                                                   */
  /* ------------------------------------------------------------------ */
  function bindMaterial(pr, mat, time) {
    var alb = mat.albedo || [0.8, 0.8, 0.8];
    var em = mat.emissive || null;
    var pulse = 1;
    if (mat.emissivePulse) { pulse = 0.55 + 0.45 * Math.sin(time * mat.emissivePulse * 6.2831853); }
    u4f(pr, 'uAlbedo', alb[0], alb[1], alb[2], mat.alpha === undefined ? 1 : mat.alpha);
    var layer = -1;
    if (mat.tex && mat.tex !== 'none' && TEX_INDEX[mat.tex] !== undefined) { layer = TEX_INDEX[mat.tex]; }
    u4f(pr, 'uMatParams',
        mat.rough === undefined ? 0.8 : mat.rough,
        mat.metal === undefined ? 0.0 : mat.metal,
        layer, mat.texScale === undefined ? 1.0 : mat.texScale);
    if (em) { u4f(pr, 'uEmissive', em[0] * pulse, em[1] * pulse, em[2] * pulse, 0); }
    else { u4f(pr, 'uEmissive', 0, 0, 0, 0); }
  }

  function normalMatrix(m) {
    /* inverse-transpose of the upper 3x3 */
    var a00 = m[0], a01 = m[1], a02 = m[2],
        a10 = m[4], a11 = m[5], a12 = m[6],
        a20 = m[8], a21 = m[9], a22 = m[10];
    var b01 = a22 * a11 - a12 * a21,
        b11 = -a22 * a10 + a12 * a20,
        b21 = a21 * a10 - a11 * a20;
    var d = a00 * b01 + a01 * b11 + a02 * b21;
    if (!d) {
      nrmMat[0] = 1; nrmMat[1] = 0; nrmMat[2] = 0;
      nrmMat[3] = 0; nrmMat[4] = 1; nrmMat[5] = 0;
      nrmMat[6] = 0; nrmMat[7] = 0; nrmMat[8] = 1;
      return nrmMat;
    }
    d = 1.0 / d;
    nrmMat[0] = b01 * d;
    nrmMat[1] = (-a22 * a01 + a02 * a21) * d;
    nrmMat[2] = (a12 * a01 - a02 * a11) * d;
    nrmMat[3] = b11 * d;
    nrmMat[4] = (a22 * a00 - a02 * a20) * d;
    nrmMat[5] = (-a12 * a00 + a02 * a10) * d;
    nrmMat[6] = b21 * d;
    nrmMat[7] = (-a21 * a00 + a01 * a20) * d;
    nrmMat[8] = (a11 * a00 - a01 * a10) * d;
    return nrmMat;
  }

  /* ------------------------------------------------------------------ */
  /*  Cascade fitting                                                    */
  /* ------------------------------------------------------------------ */
  function fitCascades(camera, sunDir, near, far) {
    var n = Qs.cascades;
    var lambda = 0.72;
    var i;
    for (i = 0; i < n; i++) {
      var p = (i + 1) / n;
      var uni = near + (far - near) * p;
      var log = near * Math.pow(far / near, p);
      splits[i] = log * lambda + uni * (1 - lambda);
    }
    splits[3] = frameIndex & 1023;

    var prevSplit = near;
    for (i = 0; i < n; i++) {
      var sEnd = splits[i];
      /* centre of the frustum slice, radius covering its corners */
      var tanH = Math.tan(camera.fov * 0.5);
      var aspect = RW / Math.max(1, RH);
      var hn = tanH * prevSplit, wn = hn * aspect;
      var hf = tanH * sEnd, wf = hf * aspect;
      var midDist = (prevSplit + sEnd) * 0.5;
      var radius = Math.sqrt(Math.max(
        wn * wn + hn * hn + prevSplit * prevSplit,
        wf * wf + hf * hf + sEnd * sEnd) ) * 0.5 + (sEnd - prevSplit) * 0.5;
      radius = Math.max(radius, 2.0);

      Q.rotateVec3(vTmp, camera.quat, FWD_R);
      var ccx = camera.pos[0] + vTmp[0] * midDist;
      var ccy = camera.pos[1] + vTmp[1] * midDist;
      var ccz = camera.pos[2] + vTmp[2] * midDist;

      /* snap the centre to shadow-texel increments to stop shimmering */
      var texelsPerUnit = Qs.shadowSize / (radius * 2);
      ccx = Math.floor(ccx * texelsPerUnit) / texelsPerUnit;
      ccy = Math.floor(ccy * texelsPerUnit) / texelsPerUnit;
      ccz = Math.floor(ccz * texelsPerUnit) / texelsPerUnit;

      var d = radius * 2.6;
      vTmp2[0] = ccx - sunDir[0] * d;
      vTmp2[1] = ccy - sunDir[1] * d;
      vTmp2[2] = ccz - sunDir[2] * d;
      camTarget[0] = ccx; camTarget[1] = ccy; camTarget[2] = ccz;
      var upRef = Math.abs(sunDir[1]) > 0.98 ? UPZ_R : UPY_R;
      M4.lookAt(mTmp, vTmp2, camTarget, upRef);
      M4.ortho(mTmp2, -radius, radius, -radius, radius, 0.05, d * 2.2);
      M4.mul(mLightVP[i], mTmp2, mTmp);
      prevSplit = sEnd;
    }
  }
  var FWD_R = V3.create(0, 0, -1), UPY_R = V3.create(0, 1, 0), UPZ_R = V3.create(0, 0, 1);

  /* ------------------------------------------------------------------ */
  /*  Passes                                                             */
  /* ------------------------------------------------------------------ */
  function fullscreen() {
    gl.bindVertexArray(emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    stats.drawCalls++;
  }

  function bindTex(unit, target, t) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, t);
  }

  function drawItems(list, count, pr, isShadow) {
    var i, it;
    for (i = 0; i < count; i++) {
      it = list[orderArr[i]];
      if (!it || !it.geo) { continue; }
      if (isShadow) {
        uMat4(pr, 'uModel', it.m);
      } else {
        uMat4(pr, 'uModel', it.m);
        uMat3(pr, 'uNrmMat', normalMatrix(it.m));
        bindMaterial(pr, it.mat || {}, frameData[F_CAMPOS + 3]);
      }
      if (!it.geo.vao) { continue; }   /* never uploaded - skip rather than crash */
      gl.bindVertexArray(it.geo.vao);
      gl.drawElements(gl.TRIANGLES, it.geo.count, it.geo.type, 0);
      stats.drawCalls++;
      stats.tris += (it.geo.count || 0) / 3;
    }
  }

  /* Build the visible/sorted index list for a draw array. */
  function cullAndSort(items, doCull) {
    var n = 0, i, it, r;
    stats.culled = 0;
    for (i = 0; i < items.length && n < MAX_DRAWS; i++) {
      it = items[i];
      if (!it || !it.geo) { continue; }
      if (doCull) {
        r = itemSphere(it);
        if (!sphereVisible(_wc[0], _wc[1], _wc[2], r)) { stats.culled++; continue; }
      }
      drawOrder[n] = i;
      /* sort key: material texture layer, then mesh id - minimises state changes */
      var mat = it.mat || {};
      var layer = (mat.tex && TEX_INDEX[mat.tex] !== undefined) ? TEX_INDEX[mat.tex] : 15;
      drawKey[n] = layer * 100000 + (it.geo.count & 0xFFFF);
      n++;
    }
    orderArr.length = 0;
    for (i = 0; i < n; i++) { orderArr.push(drawOrder[i]); }
    orderArr.sort(function (a, b) {
      var ia = items[a], ib = items[b];
      var ma = ia.mat || {}, mb = ib.mat || {};
      var la = (ma.tex && TEX_INDEX[ma.tex] !== undefined) ? TEX_INDEX[ma.tex] : 15;
      var lb = (mb.tex && TEX_INDEX[mb.tex] !== undefined) ? TEX_INDEX[mb.tex] : 15;
      return la - lb;
    });
    return n;
  }

  /* Transparent items sort back-to-front by view depth. */
  function sortTransparent(items, camPos) {
    var n = 0, i;
    orderArr.length = 0;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.geo) { continue; }
      itemSphere(it);
      var dx = _wc[0] - camPos[0], dy = _wc[1] - camPos[1], dz = _wc[2] - camPos[2];
      it.__d = dx * dx + dy * dy + dz * dz;
      orderArr.push(i); n++;
    }
    orderArr.sort(function (a, b) { return items[b].__d - items[a].__d; });
    return n;
  }

  /* ------------------------------------------------------------------ */
  /*  PUBLIC: renderFrame                                                */
  /* ------------------------------------------------------------------ */
  var lastTime = 0, adaptPing = 0;

  function renderFrame(scene, dt) {
    if (!ok || !gl) { return; }
    if (gl.isContextLost && gl.isContextLost()) { return; }

    stats.drawCalls = 0; stats.tris = 0; stats.sprites = 0;
    var nowMs = Util.now();
    if (lastTime) { stats.fps = stats.fps * 0.92 + (1000 / Math.max(1, nowMs - lastTime)) * 0.08; }
    lastTime = nowMs;
    frameIndex++;

    var cameraIn = scene.camera;
    var q = (scene.quality === undefined ? qLevel : scene.quality) | 0;
    if (q !== qLevel) { setQuality(q); }

    var near = cameraIn.near || 0.06, far = cameraIn.far || 400;
    var aspect = RW / Math.max(1, RH);

    /* --- camera matrices --- */
    M4.perspective(mProj, cameraIn.fov || 1.1, aspect, near, far);
    Q.rotateVec3(vTmp, cameraIn.quat, FWD_R);
    camTarget[0] = cameraIn.pos[0] + vTmp[0];
    camTarget[1] = cameraIn.pos[1] + vTmp[1];
    camTarget[2] = cameraIn.pos[2] + vTmp[2];
    Q.rotateVec3(camUp, cameraIn.quat, UPY_R);
    M4.lookAt(mView, cameraIn.pos, camTarget, camUp);
    M4.copy(mPrevVP, mVP);
    M4.mul(mVP, mProj, mView);
    M4.invert(mInvView, mView);
    M4.invert(mInvProj, mProj);
    extractPlanes(mVP);

    /* --- sun / environment --- */
    var sun = scene.sun || {};
    var sunDir = sun.dir || [0.32, -0.78, 0.54];
    V3.normalize(vTmp3, sunDir);
    var sunCol = sun.color || [0.4, 0.48, 0.62];
    var lightning = (scene.post && scene.post.lightning) || 0;
    var envKey = sunCol[0].toFixed(2) + sunCol[1].toFixed(2) + sunCol[2].toFixed(2) +
                 vTmp3[0].toFixed(2) + vTmp3[1].toFixed(2);
    if (envDirty || envKey !== lastEnvKey) {
      lastEnvKey = envKey; envDirty = false;
      buildEnvironment(vTmp3, sunCol, 0, scene.time || 0);
    }

    /* --- pack the Frame UBO --- */
    frameData.set(mView, F_VIEW);
    frameData.set(mProj, F_PROJ);
    frameData.set(mVP, F_VP);
    frameData.set(mInvView, F_INVVIEW);
    frameData.set(mInvProj, F_INVPROJ);
    frameData.set(mPrevVP, F_PREVVP);

    fitCascades({ pos: cameraIn.pos, quat: cameraIn.quat, fov: cameraIn.fov || 1.1 },
                vTmp3, near, Math.min(far, 90));
    frameData.set(mLightVP[0], F_CASC0);
    frameData.set(mLightVP[Math.min(1, Qs.cascades - 1)], F_CASC1);
    frameData.set(mLightVP[Math.min(2, Qs.cascades - 1)], F_CASC2);

    frameData[F_CAMPOS] = cameraIn.pos[0];
    frameData[F_CAMPOS + 1] = cameraIn.pos[1];
    frameData[F_CAMPOS + 2] = cameraIn.pos[2];
    frameData[F_CAMPOS + 3] = scene.time || 0;
    /* uSunDir carries the direction TO the light */
    frameData[F_SUNDIR] = -vTmp3[0];
    frameData[F_SUNDIR + 1] = -vTmp3[1];
    frameData[F_SUNDIR + 2] = -vTmp3[2];
    frameData[F_SUNDIR + 3] = sun.intensity === undefined ? 1 : sun.intensity;
    frameData[F_SUNCOL] = sunCol[0];
    frameData[F_SUNCOL + 1] = sunCol[1];
    frameData[F_SUNCOL + 2] = sunCol[2];
    frameData[F_SUNCOL + 3] = debug.noShadow ? 0 : 1;
    var amb = sun.ambient || [0.05, 0.06, 0.08];
    frameData[F_AMBIENT] = amb[0];
    frameData[F_AMBIENT + 1] = amb[1];
    frameData[F_AMBIENT + 2] = amb[2];
    frameData[F_AMBIENT + 3] = Qs.ssao ? 1.0 : 0.0;
    var fog = scene.fog || {};
    var fogCol = fog.color || [0.03, 0.04, 0.06];
    frameData[F_FOGCOL] = fogCol[0];
    frameData[F_FOGCOL + 1] = fogCol[1];
    frameData[F_FOGCOL + 2] = fogCol[2];
    frameData[F_FOGCOL + 3] = fog.density === undefined ? 0.025 : fog.density;
    frameData[F_FOGPARAMS] = fog.height === undefined ? 9 : fog.height;
    frameData[F_FOGPARAMS + 1] = fog.heightFalloff === undefined ? 0.15 : fog.heightFalloff;
    frameData[F_FOGPARAMS + 2] = near;
    frameData[F_FOGPARAMS + 3] = far;
    frameData[F_SCREEN] = RW; frameData[F_SCREEN + 1] = RH;
    frameData[F_SCREEN + 2] = 1 / RW; frameData[F_SCREEN + 3] = 1 / RH;

    /* --- lights --- */
    var lights = scene.lights || [];
    var maxL = Math.min(Qs.lights, MAX_LIGHTS);
    var lc = 0;
    for (var li = 0; li < lights.length && lc < maxL; li++) {
      var L = lights[li];
      if (!L) { continue; }
      var lx = L.pos[0] - cameraIn.pos[0], ly = L.pos[1] - cameraIn.pos[1], lz = L.pos[2] - cameraIn.pos[2];
      var range = L.range || 10;
      var d2 = lx * lx + ly * ly + lz * lz;
      if (d2 > (range + far * 0.25) * (range + far * 0.25)) { continue; }
      if (!sphereVisible(L.pos[0], L.pos[1], L.pos[2], range)) { continue; }
      var inten = L.intensity === undefined ? 1 : L.intensity;
      lightData[lc * 4] = L.pos[0];
      lightData[lc * 4 + 1] = L.pos[1];
      lightData[lc * 4 + 2] = L.pos[2];
      lightData[lc * 4 + 3] = range;
      lightData[MAX_LIGHTS * 4 + lc * 4] = L.color[0] * inten;
      lightData[MAX_LIGHTS * 4 + lc * 4 + 1] = L.color[1] * inten;
      lightData[MAX_LIGHTS * 4 + lc * 4 + 2] = L.color[2] * inten;
      lightData[MAX_LIGHTS * 4 + lc * 4 + 3] = L.shadow ? 1 : 0;
      lc++;
    }
    stats.lights = lc;

    var post = scene.post || {};
    frameData[F_MISC] = qLevel;
    frameData[F_MISC + 1] = lc;
    frameData[F_MISC + 2] = post.exposure === undefined ? 1 : post.exposure;
    frameData[F_MISC + 3] = Qs.ssao ? 1 : 0;
    frameData[F_SPLITS] = splits[0];
    frameData[F_SPLITS + 1] = splits[Math.min(1, Qs.cascades - 1)];
    frameData[F_SPLITS + 2] = splits[Math.min(2, Qs.cascades - 1)];
    frameData[F_SPLITS + 3] = frameIndex & 1023;
    frameData[F_MISC2] = lightning;
    frameData[F_MISC2 + 1] = 0.035;
    frameData[F_MISC2 + 2] = 0.0018;
    frameData[F_MISC2 + 3] = 1 / Qs.shadowSize;

    gl.bindBuffer(gl.UNIFORM_BUFFER, uboFrame);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, frameData);
    gl.bindBuffer(gl.UNIFORM_BUFFER, uboLights);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, lightData);

    var items = scene.items || [];

    /* ============ 1. shadow cascades ============ */
    if (progs.depth && !debug.noShadow) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.shadow);
      gl.viewport(0, 0, Qs.shadowSize, Qs.shadowSize);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.cullFace(gl.FRONT);
      gl.useProgram(progs.depth.p);
      u1f(progs.depth, 'uUseLightVP', 1);
      for (var c = 0; c < Qs.cascades; c++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, tex.shadow, 0, c);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        uMat4(progs.depth, 'uLightVP', mLightVP[c]);
        var sn = 0;
        orderArr.length = 0;
        for (var si = 0; si < items.length && sn < MAX_DRAWS; si++) {
          if (items[si] && items[si].geo && items[si].castShadow !== false) { orderArr.push(si); sn++; }
        }
        drawItems(items, sn, progs.depth, true);
      }
      gl.cullFace(gl.BACK);
    }

    /* ============ 2. main HDR target ============ */
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.hdr);
    gl.viewport(0, 0, RW, RH);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clearColor(fogCol[0], fogCol[1], fogCol[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var nOpaque = cullAndSort(items, true);

    /* depth prepass */
    if (Qs.prepass && progs.depth) {
      gl.colorMask(false, false, false, false);
      gl.useProgram(progs.depth.p);
      u1f(progs.depth, 'uUseLightVP', 0);
      drawItems(items, nOpaque, progs.depth, true);
      gl.colorMask(true, true, true, true);
      gl.depthFunc(gl.LEQUAL);
    }

    /* SSAO from the prepass depth */
    if (Qs.ssao && Qs.prepass && progs.ssao && progs.aoblur) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.hdr);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb.depthCopy);
      gl.blitFramebuffer(0, 0, RW, RH, 0, 0, RW, RH, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ao0);
      gl.viewport(0, 0, tex.ao0.__w, tex.ao0.__h);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(progs.ssao.p);
      bindTex(TU_DEPTH, gl.TEXTURE_2D, tex.depthCopy);
      bindTex(TU_NOISE, gl.TEXTURE_2D, tex.noise);
      u3fv(progs.ssao, 'uKernel', ssaoKernel);
      u2f(progs.ssao, 'uAOParams', 0.55, 1.0);
      fullscreen();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ao1);
      gl.useProgram(progs.aoblur.p);
      bindTex(TU_AO, gl.TEXTURE_2D, tex.ao0);
      bindTex(TU_DEPTH, gl.TEXTURE_2D, tex.depthCopy);
      u2f(progs.aoblur, 'uTexel', 1 / tex.ao0.__w, 1 / tex.ao0.__h);
      fullscreen();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.hdr);
      gl.viewport(0, 0, RW, RH);
      gl.enable(gl.DEPTH_TEST);
    }

    /* opaque PBR */
    var pbr = progs.pbr;
    gl.useProgram(pbr.p);
    gl.depthMask(!Qs.prepass);
    gl.depthFunc(Qs.prepass ? gl.LEQUAL : gl.LESS);
    bindTex(TU_ALBEDO, gl.TEXTURE_2D_ARRAY, tex.albedoArr);
    bindTex(TU_NORMAL, gl.TEXTURE_2D_ARRAY, tex.normalArr);
    bindTex(TU_ORM, gl.TEXTURE_2D_ARRAY, tex.ormArr);
    bindTex(TU_SHADOW, gl.TEXTURE_2D_ARRAY, tex.shadow);
    bindTex(TU_ENV, gl.TEXTURE_CUBE_MAP, tex.env);
    bindTex(TU_AO, gl.TEXTURE_2D, (Qs.ssao && Qs.prepass) ? tex.ao1 : tex.noise);
    drawItems(items, nOpaque, pbr, false);
    gl.depthMask(true);
    gl.depthFunc(gl.LEQUAL);

    /* sky behind everything */
    if (progs.sky) {
      gl.useProgram(progs.sky.p);
      bindTex(TU_ENV, gl.TEXTURE_CUBE_MAP, tex.env);
      gl.depthMask(false);
      fullscreen();
      gl.depthMask(true);
    }

    /* volumetrics */
    if (Qs.volumetric && progs.volume && progs.blit) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.hdr);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb.depthCopy);
      gl.blitFramebuffer(0, 0, RW, RH, 0, 0, RW, RH, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.vol);
      gl.viewport(0, 0, tex.vol.__w, tex.vol.__h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(progs.volume.p);
      bindTex(TU_DEPTH, gl.TEXTURE_2D, tex.depthCopy);
      bindTex(TU_NOISE, gl.TEXTURE_2D, tex.noise);
      bindTex(TU_SHADOW, gl.TEXTURE_2D_ARRAY, tex.shadow);
      var nv = 0;
      for (var vi = 0; vi < lights.length && nv < MAX_VOL_LIGHTS; vi++) {
        var VL = lights[vi];
        if (!VL || !VL.shadow) { continue; }
        volPos[nv * 4] = VL.pos[0]; volPos[nv * 4 + 1] = VL.pos[1];
        volPos[nv * 4 + 2] = VL.pos[2]; volPos[nv * 4 + 3] = VL.range || 10;
        var vint = VL.intensity === undefined ? 1 : VL.intensity;
        volCol[nv * 4] = VL.color[0] * vint; volCol[nv * 4 + 1] = VL.color[1] * vint;
        volCol[nv * 4 + 2] = VL.color[2] * vint; volCol[nv * 4 + 3] = 1;
        nv++;
      }
      for (var vz = nv; vz < MAX_VOL_LIGHTS; vz++) {
        volPos[vz * 4 + 3] = 0; volCol[vz * 4 + 3] = 0;
      }
      u4fv(progs.volume, 'uVolLightPos', volPos);
      u4fv(progs.volume, 'uVolLightCol', volCol);
      u4f(progs.volume, 'uVolParams', VOL_STEPS_HI, 55, 0.032, nv);
      fullscreen();

      /* additively composite the half-res shafts back into the HDR target */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.hdr);
      gl.viewport(0, 0, RW, RH);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(progs.blit.p);
      bindTex(TU_SRC, gl.TEXTURE_2D, tex.vol);
      u4f(progs.blit, 'uTint', 1, 1, 1, 1);
      fullscreen();
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
    }

    /* transparent */
    var transparent = scene.transparent || [];
    if (transparent.length && pbr) {
      var nT = sortTransparent(transparent, cameraIn.pos);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(pbr.p);
      drawItems(transparent, nT, pbr, false);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /* sprites / particles */
    var sprites = scene.sprites || [];
    if (sprites.length && progs.sprite) {
      if (Qs.softParticles) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.hdr);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb.depthCopy);
        gl.blitFramebuffer(0, 0, RW, RH, 0, 0, RW, RH, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb.hdr);
        gl.viewport(0, 0, RW, RH);
      }
      drawSprites(sprites, scene.time || 0);
    }

    /* ============ 3. post ============ */
    if (debug.noPost || !progs.composite) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, RW, RH);
      gl.disable(gl.DEPTH_TEST);
      if (progs.blit) {
        gl.useProgram(progs.blit.p);
        bindTex(TU_SRC, gl.TEXTURE_2D, tex.hdr);
        u4f(progs.blit, 'uTint', 1, 1, 1, 1);
        fullscreen();
      }
      return;
    }
    postProcess(post, dt);
  }

  /* ------------------------------------------------------------------ */
  function drawSprites(sprites, time) {
    var passAdd, i, s, n, kind, kid;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.useProgram(progs.sprite.p);
    bindTex(TU_DEPTH, gl.TEXTURE_2D, tex.depthCopy);
    u1f(progs.sprite, 'uSoft', Qs.softParticles ? 0.6 : 0);
    gl.bindVertexArray(spriteVAO);

    for (passAdd = 0; passAdd < 2; passAdd++) {
      n = 0;
      for (i = 0; i < sprites.length && n < MAX_SPRITES; i++) {
        s = sprites[i];
        if (!s) { continue; }
        kind = s.kind || 'spark';
        var isAdd = KIND_ADDITIVE[kind] ? 1 : 0;
        if (isAdd !== passAdd) { continue; }
        kid = KIND_ID[kind] === undefined ? 0 : KIND_ID[kind];
        var o = n * SPRITE_STRIDE;
        spriteData[o] = s.pos[0]; spriteData[o + 1] = s.pos[1]; spriteData[o + 2] = s.pos[2];
        spriteData[o + 3] = s.size || 0.1;
        spriteData[o + 4] = s.color[0]; spriteData[o + 5] = s.color[1];
        spriteData[o + 6] = s.color[2]; spriteData[o + 7] = s.color[3];
        spriteData[o + 8] = kid;
        spriteData[o + 9] = (i * 0.61803398875) % 1;
        spriteData[o + 10] = kind === 'rain' ? 9.0 : 1.0;
        spriteData[o + 11] = kind === 'smoke' ? (i * 0.7) % 6.283 : 0;
        n++;
      }
      if (!n) { continue; }
      gl.blendFunc(gl.ONE, passAdd ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteInstBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, spriteData, 0, n * SPRITE_STRIDE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      stats.drawCalls++;
      stats.sprites += n;
    }
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  /* ------------------------------------------------------------------ */
  function postProcess(post, dt) {
    var i;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(emptyVAO);

    var prescale = floatRTOK ? 1.0 : 4.0;

    /* auto exposure: downsample luminance, then a 1x1 temporal adaptation */
    if (progs.lum && progs.adapt) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.lum1);
      gl.viewport(0, 0, 64, 64);
      gl.useProgram(progs.lum.p);
      bindTex(TU_SRC, gl.TEXTURE_2D, tex.hdr);
      u1f(progs.lum, 'uPrescale', prescale);
      fullscreen();
      gl.bindTexture(gl.TEXTURE_2D, tex.lum1);
      gl.generateMipmap(gl.TEXTURE_2D);

      var src = adaptPing ? tex.adapt1 : tex.adapt0;
      var dst = adaptPing ? fb.adapt0 : fb.adapt1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
      gl.viewport(0, 0, 1, 1);
      gl.useProgram(progs.adapt.p);
      bindTex(TU_SRC, gl.TEXTURE_2D, tex.lum1);
      bindTex(TU_LUM, gl.TEXTURE_2D, src);
      u2f(progs.adapt, 'uAdapt', Math.min(dt || 0.016, 0.1), 1.6);
      fullscreen();
      adaptPing = adaptPing ? 0 : 1;
    }

    /* bloom: bright pass into mip 0, then progressive downsample + blur */
    var mips = Qs.bloomMips;
    if (progs.bright && progs.blur && mips > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.bloom[0]);
      gl.viewport(0, 0, tex.bloom[0].__w, tex.bloom[0].__h);
      gl.useProgram(progs.bright.p);
      bindTex(TU_SRC, gl.TEXTURE_2D, tex.hdr);
      u4f(progs.bright, 'uParams', 1.05, 0.55, prescale, 0);
      fullscreen();

      for (i = 0; i < mips; i++) {
        if (i > 0) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb.bloom[i]);
          gl.viewport(0, 0, tex.bloom[i].__w, tex.bloom[i].__h);
          gl.useProgram(progs.blit.p);
          bindTex(TU_SRC, gl.TEXTURE_2D, tex.bloom[i - 1]);
          u4f(progs.blit, 'uTint', 1, 1, 1, 1);
          fullscreen();
        }
        gl.useProgram(progs.blur.p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb.bloomTmp[i]);
        gl.viewport(0, 0, tex.bloom[i].__w, tex.bloom[i].__h);
        bindTex(TU_SRC, gl.TEXTURE_2D, tex.bloom[i]);
        u2f(progs.blur, 'uDir', 1.4 / tex.bloom[i].__w, 0);
        fullscreen();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb.bloom[i]);
        bindTex(TU_SRC, gl.TEXTURE_2D, tex.bloomTmp[i]);
        u2f(progs.blur, 'uDir', 0, 1.4 / tex.bloom[i].__h);
        fullscreen();
      }
    }

    /* composite to the backbuffer */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, RW, RH);
    gl.useProgram(progs.composite.p);
    bindTex(TU_SRC, gl.TEXTURE_2D, tex.hdr);
    bindTex(TU_BLOOM, gl.TEXTURE_2D, tex.bloom[0]);
    bindTex(TU_BLOOM + 1, gl.TEXTURE_2D, tex.bloom[Math.min(1, mips - 1)] || tex.bloom[0]);
    bindTex(TU_VOL, gl.TEXTURE_2D, tex.bloom[Math.min(2, mips - 1)] || tex.bloom[0]);
    bindTex(TU_LUM, gl.TEXTURE_2D, adaptPing ? tex.adapt1 : tex.adapt0);
    bindTex(TU_NOISE, gl.TEXTURE_2D, tex.noise);
    u4f(progs.composite, 'uP0',
        post.exposure === undefined ? 1 : post.exposure,
        post.bloom === undefined ? 0.6 : post.bloom,
        post.grain === undefined ? 0.25 : post.grain,
        post.chroma === undefined ? 0.4 : post.chroma);
    u4f(progs.composite, 'uP1',
        post.vignette === undefined ? 0.6 : post.vignette,
        post.saturation === undefined ? 0.85 : post.saturation,
        post.contrast === undefined ? 1.1 : post.contrast,
        frameData[F_CAMPOS + 3]);
    u4f(progs.composite, 'uP2',
        post.hurt || 0, post.flashbang || 0, post.lightning || 0,
        post.rainLens === undefined ? 0.5 : post.rainLens);
    u4f(progs.composite, 'uP3', prescale, mips, 1, qLevel >= 2 ? 1 : 0);
    fullscreen();
  }

  /* ------------------------------------------------------------------ */
  function screenToWorldRay(nx, ny, camera, outOrigin, outDir) {
    var aspect = RW / Math.max(1, RH);
    M4.perspective(mTmp, camera.fov || 1.1, aspect, camera.near || 0.06, camera.far || 400);
    M4.invert(mTmp2, mTmp);
    var cx = mTmp2[0] * nx + mTmp2[8] * -1 + mTmp2[12];
    var cy = mTmp2[5] * ny + mTmp2[9] * -1 + mTmp2[13];
    vTmp[0] = cx; vTmp[1] = cy; vTmp[2] = -1;
    V3.normalize(vTmp, vTmp);
    Q.rotateVec3(outDir, camera.quat, vTmp);
    V3.normalize(outDir, outDir);
    outOrigin[0] = camera.pos[0];
    outOrigin[1] = camera.pos[1];
    outOrigin[2] = camera.pos[2];
    return outDir;
  }

  /* ------------------------------------------------------------------ */
  IP.Renderer = {
    init: init,
    resize: resize,
    upload: upload,
    updateMesh: updateMesh,
    dispose: dispose,
    setQuality: setQuality,
    renderFrame: renderFrame,
    screenToWorldRay: screenToWorldRay,
    stats: stats,
    debug: debug,
    get supportsWebGL2() { return ok; },
    get quality() { return qLevel; },
    TEX_IDS: TEX_IDS,
    markEnvDirty: function () { envDirty = true; }
  };

})();
if (typeof window !== 'undefined') { window.IP = IP; }
