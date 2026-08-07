/* =====================================================================
 * 51_postfx.js — SG.fx.*  hand-written post-processing.
 *
 * No EffectComposer, no examples/ imports: only the core Three.js build is
 * inlined. The scene is rendered into a WebGLRenderTarget and fullscreen
 * quads are drawn with our own ShaderMaterials through an ortho camera and
 * one shared plane.
 *
 * Quality tiers (read once, at init)
 *   low   one combined grain + vignette + fade overlay drawn straight over
 *         the back buffer with multiply blending. ZERO render targets.
 *   med   scene target + bloom (bright pass + separable blur at 1/4 res)
 *         + grade, vignette, grain, scanline, glitch.
 *   high  the above + radial chromatic aberration + a cheap two-tap DOF
 *         driven by a DepthTexture (silently disabled if depth textures
 *         are unavailable).
 *
 * The full path renders the scene with tone mapping OFF into a half-float
 * target so bloom can threshold real HDR values; ACES + sRGB encoding then
 * happen in the composite shader. If anything throws during init we log
 * once, leave SG.fx.enabled false and 90_main.js falls back to a plain
 * renderer.render — which is still the whole game, just flatter.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var fx = SG.fx;
  var util = SG.util;

  fx.enabled = false;
  fx.tier = 'off';

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  var R = null, SCENE = null, CAM = null;
  var BW = 0, BH = 0;                    /* drawing-buffer size in pixels */
  var TIER = 'low';
  var HAS_DOF = false;

  var sceneRT = null, bloomA = null, bloomB = null, depthTex = null;
  var quadGeo = null, quadCam = null, quadScene = null, quadMesh = null;
  var matBright = null, matBlur = null, matComp = null, matOverlay = null;

  var savedToneMapping = null;
  var time = 0;
  var logged = false;

  var _v2 = null;                        /* scratch — never allocate per frame */

  function warnOnce(msg, e) {
    if (logged) return;
    logged = true;
    if (window.console) console.warn('[SG.fx] ' + msg, e || '');
  }

  /* ------------------------------------------------------------------ */
  /* Parameters                                                          */
  /* ------------------------------------------------------------------ */

  var DEFAULTS = {
    bloom: 0.55,        /* additive strength of the bright pass          */
    grain: 0.30,        /* animated film grain                          */
    vignette: 0.38,     /* corner falloff                               */
    ca: 0.30,           /* radial chromatic aberration                  */
    dof: 0,             /* FOCUS DISTANCE in metres. 0 = off.           */
    dofStrength: 1.0,   /* how hard out-of-focus goes                   */
    scanline: 0.16,     /* CRT line mask                                */
    exposure: 1.0,
    saturation: 1.02,
    fadeToBlack: 0,
    glitch: 0,
    threshold: 0.85     /* bloom bright-pass cut                        */
  };

  var P = {};
  var PULSE = {};
  for (var _k in DEFAULTS) {
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, _k)) P[_k] = DEFAULTS[_k];
  }

  fx.params = P;

  fx.set = function (name, value) {
    if (!Object.prototype.hasOwnProperty.call(P, name)) return;
    var v = +value;
    P[name] = isNaN(v) ? DEFAULTS[name] : v;
  };

  fx.get = function (name) {
    return Object.prototype.hasOwnProperty.call(P, name) ? val(name) : 0;
  };

  /* An eased impulse that decays back to the base value. */
  fx.pulse = function (name, amount, ms) {
    if (!Object.prototype.hasOwnProperty.call(P, name)) return;
    var dur = (ms === undefined ? 400 : ms) / 1000;
    if (dur <= 0) return;
    PULSE[name] = { amt: +amount || 0, t: 0, dur: dur };
  };

  fx.reset = function () {
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) P[k] = DEFAULTS[k];
    }
    PULSE = {};
  };

  function val(name) {
    var v = P[name];
    var p = PULSE[name];
    if (p) v += p.amt * util.smooth(1 - p.t / p.dur);
    return v;
  }

  function stepPulses(dt) {
    for (var k in PULSE) {
      if (!Object.prototype.hasOwnProperty.call(PULSE, k)) continue;
      PULSE[k].t += dt;
      if (PULSE[k].t >= PULSE[k].dur) delete PULSE[k];
    }
  }

  /* ------------------------------------------------------------------ */
  /* Shader source                                                       */
  /* ------------------------------------------------------------------ */

  var VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  var COMMON = [
    'float sgHash(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}'
  ].join('\n');

  /* Bright pass, 4 taps so the 1/4-res downsample does not sparkle. */
  var FRAG_BRIGHT = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uThreshold;',
    'uniform float uSoft;',
    'varying vec2 vUv;',
    'vec3 tap(vec2 uv) {',
    '  vec3 c = texture2D(tDiffuse, uv).rgb;',
    '  float l = max(max(c.r, c.g), c.b);',
    '  return c * smoothstep(uThreshold, uThreshold + uSoft, l);',
    '}',
    'void main() {',
    '  vec3 c = tap(vUv + vec2( uTexel.x,  uTexel.y));',
    '  c += tap(vUv + vec2(-uTexel.x,  uTexel.y));',
    '  c += tap(vUv + vec2( uTexel.x, -uTexel.y));',
    '  c += tap(vUv + vec2(-uTexel.x, -uTexel.y));',
    '  gl_FragColor = vec4(c * 0.25, 1.0);',
    '}'
  ].join('\n');

  /* Separable 9-tap gaussian. */
  var FRAG_BLUR = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uDir;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270;',
    '  c += texture2D(tDiffuse, vUv + uDir * 1.3846153).rgb * 0.3162162;',
    '  c += texture2D(tDiffuse, vUv - uDir * 1.3846153).rgb * 0.3162162;',
    '  c += texture2D(tDiffuse, vUv + uDir * 3.2307692).rgb * 0.0702702;',
    '  c += texture2D(tDiffuse, vUv - uDir * 3.2307692).rgb * 0.0702702;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  var FRAG_COMPOSITE = [
    'uniform sampler2D tDiffuse;',
    'uniform sampler2D tBloom;',
    'uniform sampler2D tDepth;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uBloom;',
    'uniform float uGrain;',
    'uniform float uVignette;',
    'uniform float uCA;',
    'uniform float uScanline;',
    'uniform float uExposure;',
    'uniform float uSat;',
    'uniform float uFade;',
    'uniform float uGlitch;',
    'uniform float uDofFocus;',
    'uniform float uDofScale;',
    'uniform float uNear;',
    'uniform float uFar;',
    'varying vec2 vUv;',
    COMMON,

    /* three.js ACESFilmicToneMapping, inlined (the scene target is linear) */
    'vec3 sgACES(vec3 color) {',
    '  mat3 mIn = mat3(0.59719, 0.07600, 0.02840,',
    '                  0.35458, 0.90834, 0.13383,',
    '                  0.04823, 0.01566, 0.83777);',
    '  mat3 mOut = mat3( 1.60475, -0.10208, -0.00327,',
    '                   -0.53108,  1.10813, -0.07276,',
    '                   -0.07367, -0.00605,  1.07602);',
    '  color /= 0.6;',
    '  color = mIn * color;',
    '  vec3 a = color * (color + 0.0245786) - 0.000090537;',
    '  vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;',
    '  color = mOut * (a / b);',
    '  return clamp(color, 0.0, 1.0);',
    '}',

    'vec3 sgSRGB(vec3 c) {',
    '  c = clamp(c, 0.0, 1.0);',
    '  vec3 lo = c * 12.92;',
    '  vec3 hi = 1.055 * pow(c, vec3(0.4166667)) - 0.055;',
    '  return mix(lo, hi, step(vec3(0.0031308), c));',
    '}',

    '#ifdef USE_DOF',
    'float sgDepth(vec2 uv) {',
    '  float d = texture2D(tDepth, uv).x;',
    '  return (uNear * uFar) / (uFar - d * (uFar - uNear));',
    '}',
    '#endif',

    'void main() {',
    '  vec2 uv = vUv;',

    /* --- glitch: horizontal block displacement --------------------- */
    '  if (uGlitch > 0.001) {',
    '    float blk = floor(uv.y * 26.0);',
    '    float t = floor(uTime * 14.0);',
    '    float r = sgHash(vec2(blk, t));',
    '    float r2 = sgHash(vec2(blk + 7.31, t));',
    '    if (r < uGlitch * 0.55) {',
    '      uv.x = fract(uv.x + (r2 - 0.5) * 0.14 * uGlitch);',
    '    }',
    '  }',

    '  vec2 d = uv - 0.5;',
    '  vec3 col;',

    /* --- radial chromatic aberration ------------------------------- */
    '#ifdef USE_CA',
    '  float amt = uCA * 0.0035 + uGlitch * 0.012;',
    '  col.r = texture2D(tDiffuse, uv + d * amt).r;',
    '  col.g = texture2D(tDiffuse, uv).g;',
    '  col.b = texture2D(tDiffuse, uv - d * amt).b;',
    '#else',
    '  if (uGlitch > 0.001) {',
    '    float amt = uGlitch * 0.012;',
    '    col.r = texture2D(tDiffuse, uv + d * amt).r;',
    '    col.g = texture2D(tDiffuse, uv).g;',
    '    col.b = texture2D(tDiffuse, uv - d * amt).b;',
    '  } else {',
    '    col = texture2D(tDiffuse, uv).rgb;',
    '  }',
    '#endif',

    /* --- cheap two-tap depth of field (cutscenes only) -------------- */
    '#ifdef USE_DOF',
    '  if (uDofScale > 0.0 && uDofFocus > 0.0) {',
    '    float dist = sgDepth(uv);',
    '    float coc = clamp(abs(dist - uDofFocus) / (uDofFocus * 0.55 + 0.45), 0.0, 1.0);',
    '    coc *= uDofScale;',
    '    if (coc > 0.004) {',
    '      vec2 px = coc * 6.0 / uRes;',
    '      vec3 blur = texture2D(tDiffuse, uv + vec2( px.x,  px.y) * 1.2).rgb;',
    '      blur += texture2D(tDiffuse, uv + vec2(-px.x,  px.y) * 1.2).rgb;',
    '      blur += texture2D(tDiffuse, uv + vec2( px.x, -px.y) * 1.2).rgb;',
    '      blur += texture2D(tDiffuse, uv + vec2(-px.x, -px.y) * 1.2).rgb;',
    '      blur += texture2D(tDiffuse, uv + vec2(0.0, px.y * 2.1)).rgb;',
    '      blur += texture2D(tDiffuse, uv - vec2(0.0, px.y * 2.1)).rgb;',
    '      col = mix(col, blur / 6.0, coc);',
    '    }',
    '  }',
    '#endif',

    /* --- bloom ------------------------------------------------------ */
    '#ifdef USE_BLOOM',
    '  col += texture2D(tBloom, uv).rgb * uBloom;',
    '#endif',

    /* --- grade ------------------------------------------------------ */
    '  col = sgACES(col * uExposure);',
    '  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(vec3(lum), col, uSat);',

    /* --- vignette --------------------------------------------------- */
    '  float rad = length(d) * 1.4142;',
    '  col *= 1.0 - uVignette * smoothstep(0.32, 0.98, rad);',

    /* --- scanlines / CRT mask --------------------------------------- */
    '  if (uScanline > 0.001) {',
    '    float line = 0.5 + 0.5 * sin(vUv.y * uRes.y * 3.14159265);',
    '    col *= 1.0 - uScanline * 0.5 * line;',
    '    float slot = 0.5 + 0.5 * sin(vUv.x * uRes.x * 1.5707963);',
    '    col *= 1.0 - uScanline * 0.12 * slot;',
    '  }',

    /* --- animated grain --------------------------------------------- */
    '  if (uGrain > 0.001) {',
    '    float g = sgHash(vUv * uRes + vec2(fract(uTime) * 137.0, fract(uTime * 1.7) * 311.0));',
    '    col += (g - 0.5) * uGrain * 0.085;',
    '  }',

    '  col *= 1.0 - clamp(uFade, 0.0, 1.0);',
    '  gl_FragColor = vec4(sgSRGB(col), 1.0);',
    '}'
  ].join('\n');

  /* Low tier: one multiply-blended overlay, no targets, no scene copy. */
  var FRAG_OVERLAY = [
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uGrain;',
    'uniform float uVignette;',
    'uniform float uScanline;',
    'uniform float uExposure;',
    'uniform float uFade;',
    'uniform float uGlitch;',
    'varying vec2 vUv;',
    COMMON,
    'void main() {',
    '  vec2 d = vUv - 0.5;',
    '  float rad = length(d) * 1.4142;',
    '  float k = 1.0 - uVignette * smoothstep(0.32, 0.98, rad);',
    '  k *= uExposure;',
    '  if (uScanline > 0.001) {',
    '    float line = 0.5 + 0.5 * sin(vUv.y * uRes.y * 3.14159265);',
    '    k *= 1.0 - uScanline * 0.45 * line;',
    '  }',
    '  if (uGrain > 0.001) {',
    '    float g = sgHash(vUv * uRes + vec2(fract(uTime) * 137.0, fract(uTime * 1.7) * 311.0));',
    '    k *= 1.0 + (g - 0.5) * uGrain * 0.22;',
    '  }',
    '  if (uGlitch > 0.001) {',
    '    float blk = floor(vUv.y * 26.0);',
    '    float r = sgHash(vec2(blk, floor(uTime * 14.0)));',
    '    if (r < uGlitch * 0.4) k *= 0.55 + r;',
    '  }',
    '  k *= 1.0 - clamp(uFade, 0.0, 1.0);',
    '  gl_FragColor = vec4(vec3(max(k, 0.0)), 1.0);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ */
  /* Target management                                                   */
  /* ------------------------------------------------------------------ */

  function bufferSize() {
    R.getDrawingBufferSize(_v2);
    return { w: Math.max(2, Math.floor(_v2.x)), h: Math.max(2, Math.floor(_v2.y)) };
  }

  function disposeTargets() {
    if (sceneRT) { sceneRT.dispose(); sceneRT = null; }
    if (bloomA) { bloomA.dispose(); bloomA = null; }
    if (bloomB) { bloomB.dispose(); bloomB = null; }
    /* sceneRT.dispose() does not free an attached depth texture. */
    if (depthTex) { depthTex.dispose(); depthTex = null; }
  }

  function depthSupported() {
    if (!THREE.DepthTexture || !R) return false;
    if (R.capabilities && R.capabilities.isWebGL2) return true;
    try {
      if (R.extensions && R.extensions.has) return !!R.extensions.has('WEBGL_depth_texture');
    } catch (e) { /* fall through */ }
    return false;
  }

  function allocate(w, h) {
    disposeTargets();
    BW = w; BH = h;
    if (TIER === 'low') return;

    var type = (R.capabilities && R.capabilities.isWebGL2)
      ? THREE.HalfFloatType : THREE.UnsignedByteType;

    sceneRT = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: type,
      depthBuffer: true,
      stencilBuffer: false
    });
    sceneRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
    sceneRT.texture.generateMipmaps = false;
    sceneRT.texture.wrapS = sceneRT.texture.wrapT = THREE.ClampToEdgeWrapping;

    if (HAS_DOF) {
      depthTex = new THREE.DepthTexture(w, h);
      depthTex.format = THREE.DepthFormat;
      depthTex.type = (R.capabilities && R.capabilities.isWebGL2)
        ? THREE.UnsignedIntType : THREE.UnsignedShortType;
      depthTex.minFilter = THREE.NearestFilter;
      depthTex.magFilter = THREE.NearestFilter;
      sceneRT.depthTexture = depthTex;
    }

    var bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    var bopts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: type,
      depthBuffer: false,
      stencilBuffer: false
    };
    bloomA = new THREE.WebGLRenderTarget(bw, bh, bopts);
    bloomB = new THREE.WebGLRenderTarget(bw, bh, bopts);
    bloomA.texture.colorSpace = THREE.LinearSRGBColorSpace;
    bloomB.texture.colorSpace = THREE.LinearSRGBColorSpace;
    bloomA.texture.generateMipmaps = false;
    bloomB.texture.generateMipmaps = false;
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  fx.init = function (renderer, scene, camera) {
    if (!renderer || !scene || !camera || !THREE) return false;

    R = renderer; SCENE = scene; CAM = camera;

    /* Metals are holes without an environment; this is the first moment we
     * have a renderer to build one with. Independent of the fx path. */
    if (SG.mat && typeof SG.mat.installEnvironment === 'function') {
      try { SG.mat.installEnvironment(renderer, scene); } catch (e) { /* optional */ }
    }

    try {
      _v2 = new THREE.Vector2();
      TIER = SG.quality === 'high' ? 'high' : (SG.quality === 'med' ? 'med' : 'low');

      /* A WebGL1 context cannot give us a half-float target we can trust,
       * so it gets the overlay path rather than a broken HDR pipeline. */
      if (!(R.capabilities && R.capabilities.isWebGL2) && TIER !== 'low') TIER = 'low';
      HAS_DOF = (TIER === 'high') && depthSupported();

      quadGeo = new THREE.PlaneGeometry(2, 2);
      quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      quadScene = new THREE.Scene();
      quadMesh = new THREE.Mesh(quadGeo, null);
      quadMesh.frustumCulled = false;
      quadScene.add(quadMesh);

      matOverlay = new THREE.ShaderMaterial({
        uniforms: {
          uRes: { value: new THREE.Vector2(1, 1) },
          uTime: { value: 0 },
          uGrain: { value: 0 },
          uVignette: { value: 0 },
          uScanline: { value: 0 },
          uExposure: { value: 1 },
          uFade: { value: 0 },
          uGlitch: { value: 0 }
        },
        vertexShader: VERT,
        fragmentShader: FRAG_OVERLAY,
        depthTest: false,
        depthWrite: false,
        blending: THREE.MultiplyBlending,
        transparent: true
      });

      if (TIER !== 'low') {
        matBright = new THREE.ShaderMaterial({
          uniforms: {
            tDiffuse: { value: null },
            uTexel: { value: new THREE.Vector2(0.001, 0.001) },
            uThreshold: { value: 0.85 },
            uSoft: { value: 0.5 }
          },
          vertexShader: VERT,
          fragmentShader: FRAG_BRIGHT,
          depthTest: false, depthWrite: false
        });

        matBlur = new THREE.ShaderMaterial({
          uniforms: {
            tDiffuse: { value: null },
            uDir: { value: new THREE.Vector2(0.001, 0) }
          },
          vertexShader: VERT,
          fragmentShader: FRAG_BLUR,
          depthTest: false, depthWrite: false
        });

        var defines = { USE_BLOOM: '' };
        if (TIER === 'high') defines.USE_CA = '';
        if (HAS_DOF) defines.USE_DOF = '';

        matComp = new THREE.ShaderMaterial({
          defines: defines,
          uniforms: {
            tDiffuse: { value: null },
            tBloom: { value: null },
            tDepth: { value: null },
            uRes: { value: new THREE.Vector2(1, 1) },
            uTime: { value: 0 },
            uBloom: { value: 0 },
            uGrain: { value: 0 },
            uVignette: { value: 0 },
            uCA: { value: 0 },
            uScanline: { value: 0 },
            uExposure: { value: 1 },
            uSat: { value: 1 },
            uFade: { value: 0 },
            uGlitch: { value: 0 },
            uDofFocus: { value: 0 },
            uDofScale: { value: 0 },
            uNear: { value: 0.05 },
            uFar: { value: 200 }
          },
          vertexShader: VERT,
          fragmentShader: FRAG_COMPOSITE,
          depthTest: false, depthWrite: false
        });

        /* We tone map ourselves, in the composite, off a linear HDR buffer. */
        savedToneMapping = R.toneMapping;
        R.toneMapping = THREE.NoToneMapping;
      }

      var s = bufferSize();
      allocate(s.w, s.h);

      /* Compile now so a shader error surfaces here rather than mid-cutscene. */
      if (TIER !== 'low') {
        quadMesh.material = matComp;
        matComp.uniforms.tDiffuse.value = sceneRT.texture;
        matComp.uniforms.tBloom.value = bloomA.texture;
        if (depthTex) matComp.uniforms.tDepth.value = depthTex;
        R.compile(quadScene, quadCam);
      }
      quadMesh.material = matOverlay;
      R.compile(quadScene, quadCam);

      fx.enabled = true;
      fx.tier = TIER;
      return true;
    } catch (e) {
      warnOnce('post-processing disabled', e);
      teardown();
      fx.enabled = false;
      fx.tier = 'off';
      return false;
    }
  };

  function teardown() {
    disposeTargets();
    if (matBright) { matBright.dispose(); matBright = null; }
    if (matBlur) { matBlur.dispose(); matBlur = null; }
    if (matComp) { matComp.dispose(); matComp = null; }
    if (matOverlay) { matOverlay.dispose(); matOverlay = null; }
    if (quadGeo) { quadGeo.dispose(); quadGeo = null; }
    quadMesh = null; quadScene = null; quadCam = null;
    if (R && savedToneMapping !== null) {
      R.toneMapping = savedToneMapping;
      savedToneMapping = null;
    }
  }

  fx.dispose = function () {
    teardown();
    fx.enabled = false;
    fx.tier = 'off';
  };

  /* Called by the settings menu when the quality tier changes. */
  fx.rebuild = function () {
    if (!R) return false;
    var r = R, s = SCENE, c = CAM;
    fx.dispose();
    logged = false;
    return fx.init(r, s, c);
  };

  /* ------------------------------------------------------------------ */
  /* Resize                                                              */
  /* ------------------------------------------------------------------ */

  fx.resize = function (w, h) {
    if (!R || !fx.enabled) return;
    /* Trust the drawing buffer, not the CSS size — DPR lives in there. */
    var s = bufferSize();
    if (s.w === BW && s.h === BH) return;
    try {
      allocate(s.w, s.h);
      if (matComp && sceneRT) {
        matComp.uniforms.tDiffuse.value = sceneRT.texture;
        matComp.uniforms.tBloom.value = bloomA.texture;
        matComp.uniforms.tDepth.value = depthTex || null;
      }
    } catch (e) {
      warnOnce('resize failed, dropping to plain render', e);
      fx.dispose();
    }
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  function drawQuad(material, target) {
    quadMesh.material = material;
    R.setRenderTarget(target || null);
    R.render(quadScene, quadCam);
  }

  fx.render = function (dt) {
    if (!fx.enabled || !R || !SCENE || !CAM) return;
    dt = (typeof dt === 'number' && isFinite(dt)) ? Math.min(dt, 0.1) : 0;
    time += dt;
    stepPulses(dt);

    /* --- low: draw the scene straight to the screen, then one overlay -- */
    if (TIER === 'low') {
      R.setRenderTarget(null);
      R.render(SCENE, CAM);
      var ou = matOverlay.uniforms;
      ou.uRes.value.set(BW || 1, BH || 1);
      ou.uTime.value = time;
      ou.uGrain.value = val('grain');
      ou.uVignette.value = val('vignette');
      ou.uScanline.value = val('scanline') * 0.5;
      ou.uExposure.value = val('exposure');
      ou.uFade.value = val('fadeToBlack');
      ou.uGlitch.value = val('glitch');
      var auto = R.autoClear;
      R.autoClear = false;
      drawQuad(matOverlay, null);
      R.autoClear = auto;
      return;
    }

    if (!sceneRT) return;

    /* --- scene -> linear HDR target ---------------------------------- */
    R.setRenderTarget(sceneRT);
    R.clear();
    R.render(SCENE, CAM);

    /* --- bloom: bright pass then separable blur, all at 1/4 res ------- */
    var bloom = val('bloom');
    if (bloom > 0.001) {
      matBright.uniforms.tDiffuse.value = sceneRT.texture;
      matBright.uniforms.uTexel.value.set(0.5 / BW, 0.5 / BH);
      matBright.uniforms.uThreshold.value = P.threshold;
      drawQuad(matBright, bloomA);

      var bw = bloomA.width, bh = bloomA.height;
      var passes = TIER === 'high' ? 2 : 1;
      for (var i = 0; i < passes; i++) {
        var spread = 1 + i * 1.7;
        matBlur.uniforms.tDiffuse.value = bloomA.texture;
        matBlur.uniforms.uDir.value.set(spread / bw, 0);
        drawQuad(matBlur, bloomB);
        matBlur.uniforms.tDiffuse.value = bloomB.texture;
        matBlur.uniforms.uDir.value.set(0, spread / bh);
        drawQuad(matBlur, bloomA);
      }
    }

    /* --- composite to the screen ------------------------------------- */
    var u = matComp.uniforms;
    u.tDiffuse.value = sceneRT.texture;
    u.tBloom.value = bloomA.texture;
    u.tDepth.value = depthTex || null;
    u.uRes.value.set(BW, BH);
    u.uTime.value = time;
    u.uBloom.value = bloom;
    u.uGrain.value = val('grain');
    u.uVignette.value = val('vignette');
    u.uCA.value = val('ca');
    u.uScanline.value = val('scanline');
    u.uExposure.value = val('exposure') * (R.toneMappingExposure || 1);
    u.uSat.value = val('saturation');
    u.uFade.value = val('fadeToBlack');
    u.uGlitch.value = val('glitch');
    if (HAS_DOF) {
      var focus = val('dof');
      u.uDofFocus.value = focus;
      u.uDofScale.value = focus > 0 ? val('dofStrength') : 0;
      u.uNear.value = CAM.near;
      u.uFar.value = CAM.far;
    }
    drawQuad(matComp, null);
    R.setRenderTarget(null);
  };

  fx.__stats = function () {
    return {
      enabled: fx.enabled,
      tier: fx.tier,
      dof: HAS_DOF,
      size: BW + 'x' + BH,
      targets: sceneRT ? (bloomA ? 3 : 1) : 0
    };
  };

})(window.SG, window.THREE);
