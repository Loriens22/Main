// WebGL renderer + post-processing chain.
//
// Chain: RenderPass (HDR half-float, optional MSAA) -> GTAO (ambient
// occlusion, High/Ultra) -> Unreal bloom -> OutputPass (ACES tone mapping +
// sRGB) -> FinalPass (colour grading, vignette, grain, chromatic aberration,
// per-dimension tint and screen effects) -> FXAA (Low/Medium).

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { G, settings, GRAPHICS_PRESETS } from '../core/context.js';

// Objects that must not contribute to the AO G-buffer (vertex-animated grass,
// alpha-tested foliage, sky, particles, transparent surfaces).
export const noAOSet = new Set();
export function markNoAO(obj) { noAOSet.add(obj); obj.userData.noAO = true; return obj; }
export function unmarkNoAO(obj) { noAOSet.delete(obj); }

class FastGTAOPass extends GTAOPass {
  overrideVisibility() {
    const cache = this._visibilityCache;
    cache.clear();
    for (const o of noAOSet) { cache.set(o, o.visible); o.visible = false; }
  }
  restoreVisibility() {
    for (const [o, v] of this._visibilityCache) o.visible = v;
    this._visibilityCache.clear();
  }
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.28 },
    uGrain: { value: 0.035 },
    uCA: { value: 0.0015 },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.04 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uLift: { value: new THREE.Color(0, 0, 0) },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uWobble: { value: 0 },
    uPulse: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uInvert: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uCA, uSaturation, uContrast, uFlash, uWobble, uPulse, uInvert;
    uniform vec3 uTint, uLift, uFlashColor;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec2 uv = vUv;
      if ( uWobble > 0.0 ) {
        uv += vec2( sin( uv.y * 18.0 + uTime * 1.7 ), cos( uv.x * 14.0 + uTime * 1.3 ) ) * 0.0035 * uWobble;
      }
      vec2 dc = uv - 0.5;
      float r2 = dot( dc, dc );
      vec2 off = dc * uCA * ( 1.0 + uPulse * 4.0 ) * r2 * 4.0;
      vec3 col;
      col.r = texture2D( tDiffuse, uv + off ).r;
      col.g = texture2D( tDiffuse, uv ).g;
      col.b = texture2D( tDiffuse, uv - off ).b;
      // Grading (display-referred): lift, tint, contrast, saturation.
      col = col * uTint + uLift * ( 1.0 - col );
      col = ( col - 0.5 ) * uContrast + 0.5;
      float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = mix( vec3( l ), col, uSaturation );
      col = mix( col, 1.0 - col, uInvert );
      // Vignette.
      float vig = smoothstep( 0.9, 0.25, length( dc * vec2( 1.0, 0.85 ) ) * ( 1.0 + uPulse * 0.4 ) );
      col *= mix( 1.0, vig, uVignette );
      // Film grain.
      float g = hash( uv * uResolution + fract( uTime ) * 91.7 ) - 0.5;
      col += g * uGrain * ( 1.0 - l * 0.6 );
      col = mix( col, uFlashColor, uFlash );
      gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
    }`,
};

export function detectQuality() {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
  } catch (e) { /* ignore */ }
  const low = /swiftshader|llvmpipe|software|mali-4|adreno \(tm\) [3-5]/i.test(gpu);
  if (low) return 'low';
  if (isMobile) return 'low';
  if (/rtx|radeon rx [5-9]|rx [6-9]\d{3}|apple m[1-9] (pro|max|ultra)|arc a7/i.test(gpu)) return 'high';
  return 'medium';
}

export function resolveQuality() {
  let name = settings.graphics;
  if (name === 'auto' || !GRAPHICS_PRESETS[name]) name = detectQuality();
  return { ...GRAPHICS_PRESETS[name] };
}

export class Renderer {
  constructor(container) {
    this.container = container;
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false, preserveDrawingBuffer: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;
    r.info.autoReset = false;
    container.appendChild(r.domElement);
    r.domElement.id = 'game-canvas';
    this.renderer = r;
    this.composer = null;
    this.passes = {};
    this.scene = null;
    this.camera = null;
    this.exposure = 1;
  }

  setup(scene, camera, quality) {
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    const r = this.renderer;
    const pr = Math.min(window.devicePixelRatio || 1, quality.pixelRatio) * (settings.renderScale || 1);
    r.setPixelRatio(pr);
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = settings.shadows;
    this.buildComposer();
  }

  buildComposer() {
    const q = this.quality;
    const r = this.renderer;
    if (this.composer) {
      for (const p of this.composer.passes) if (p.dispose) p.dispose();
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa || 0 });
    const composer = new EffectComposer(r, rt);
    composer.setPixelRatio(1);
    composer.setSize(size.x, size.y);
    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);
    this.passes.render = renderPass;
    if (q.ao && settings.ao) {
      const gtao = new FastGTAOPass(this.scene, this.camera, Math.floor(size.x * 0.5), Math.floor(size.y * 0.5));
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      gtao.blendIntensity = 0.85;
      composer.addPass(gtao);
      this.passes.gtao = gtao;
    } else this.passes.gtao = null;
    if (q.bloom && settings.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.55, 0.92);
      composer.addPass(bloom);
      this.passes.bloom = bloom;
    } else this.passes.bloom = null;
    const out = new OutputPass();
    composer.addPass(out);
    this.passes.output = out;
    const fin = new ShaderPass(FinalShader);
    fin.uniforms.uResolution.value.set(size.x, size.y);
    composer.addPass(fin);
    this.passes.final = fin;
    if (q.fxaa) {
      const fxaa = new ShaderPass(FXAAShader);
      fxaa.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
      composer.addPass(fxaa);
      this.passes.fxaa = fxaa;
    } else this.passes.fxaa = null;
    this.composer = composer;
  }

  setScene(scene) {
    this.scene = scene;
    if (this.passes.render) this.passes.render.scene = scene;
    if (this.passes.gtao) this.passes.gtao.scene = scene;
  }

  resize() {
    const r = this.renderer;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio) * (settings.renderScale || 1);
    r.setPixelRatio(pr);
    r.setSize(window.innerWidth, window.innerHeight);
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
    if (this.passes.fxaa) this.passes.fxaa.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
    this.passes.final.uniforms.uResolution.value.set(size.x, size.y);
    if (this.passes.gtao) this.passes.gtao.setSize(Math.floor(size.x * 0.5), Math.floor(size.y * 0.5));
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  render(dt) {
    const r = this.renderer;
    r.toneMappingExposure = this.exposure;
    this.passes.final.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
