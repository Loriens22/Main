// WebGL renderer setup + optional post-processing per quality preset.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export const PRESETS = {
  ultra: { pixelRatioMax: 2, antialias: true, bloom: true, smaa: true, shadows: true, shadowMap: 4096 },
  high: { pixelRatioMax: 1.5, antialias: true, bloom: true, smaa: false, shadows: true, shadowMap: 2048 },
  balanced: { pixelRatioMax: 1, antialias: false, bloom: false, smaa: false, shadows: true, shadowMap: 1024 },
};

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = quality;
    this.preset = PRESETS[quality];
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.preset.antialias && !this.preset.bloom,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: !!window.__TEST_PRESERVE__,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.shadowMap.enabled = this.preset.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderScale = 1;
    this.dynamicScale = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setupPost(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    if (!this.preset.bloom) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.quality === 'ultra' ? 4 : 2 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.4, 2.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    if (this.preset.smaa) this.composer.addPass(new SMAAPass(size.x, size.y));
  }

  /** Switch preset at runtime (post-processing, pixel ratio, shadows). */
  setQuality(q) {
    if (!PRESETS[q] || q === this.quality) return;
    this.quality = q;
    this.preset = PRESETS[q];
    this.renderer.shadowMap.enabled = this.preset.shadows;
    if (this.composer) {
      this.composer.dispose && this.composer.dispose();
      this.composer = null;
    }
    if (this.scene) this.setupPost(this.scene, this.camera);
    this.resize();
  }

  /** Adaptive resolution: lower the pixel ratio when frames take too long. */
  adapt(dt) {
    this._acc = (this._acc || 0) + dt;
    this._n = (this._n || 0) + 1;
    if (this._acc < 2) return;
    const fps = this._n / this._acc;
    this._acc = 0;
    this._n = 0;
    const target = this.quality === 'balanced' || /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 30 : 50;
    const prev = this.dynamicScale;
    if (fps < target * 0.85) this.dynamicScale = Math.max(0.55, this.dynamicScale - 0.1);
    else if (fps > target * 1.25) this.dynamicScale = Math.min(1, this.dynamicScale + 0.05);
    if (prev !== this.dynamicScale) this.resize();
  }

  pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.preset.pixelRatioMax) * this.renderScale * this.dynamicScale;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio());
      this.composer.setSize(w, h);
    }
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
