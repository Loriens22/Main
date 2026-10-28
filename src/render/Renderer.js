// WebGL renderer setup + optional post-processing per quality preset.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

/**
 * Ground-truth ambient occlusion from the beauty pass's own depth buffer (normals rebuilt from depth):
 * no second scene render, so draw calls stay flat and alpha-tested leaves occlude only where they are
 * opaque. scale < 1 computes AO at a fraction of the resolution (the blend upsamples it).
 */
class SceneGTAOPass extends GTAOPass {
  constructor(scene, camera, w, h, depthTexture, scale) {
    super(scene, camera, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    this.aoScale = scale;
    this.setGBuffer(depthTexture);
  }

  setSize(w, h) {
    super.setSize(Math.max(1, Math.round(w * this.aoScale)), Math.max(1, Math.round(h * this.aoScale)));
  }
}

export const PRESETS = {
  ultra: { pixelRatioMax: 2, antialias: true, bloom: true, smaa: true, shadows: true, shadowMap: 4096, ao: 1 },
  high: { pixelRatioMax: 1.5, antialias: true, bloom: true, smaa: false, shadows: true, shadowMap: 2048, ao: 0.5 },
  balanced: { pixelRatioMax: 1, antialias: false, bloom: false, smaa: false, shadows: true, shadowMap: 1024, ao: 0 },
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
    const depth = new THREE.DepthTexture(size.x, size.y);
    depth.type = THREE.UnsignedIntType;
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.quality === 'ultra' ? 4 : 2, depthTexture: depth });
    this.composer = new EffectComposer(this.renderer, rt);
    // both ping-pong buffers share the depth texture, whichever one the scene lands in
    this.composer.renderTarget2.depthTexture = depth;
    this.composer.addPass(new RenderPass(scene, camera));
    if (this.preset.ao && this.aoEnabled !== false) {
      const ao = (this.ao = new SceneGTAOPass(scene, camera, size.x, size.y, depth, this.preset.ao));
      // world-space radius ~1 m: contact shadow at kerbs, under eaves and balconies, in window reveals,
      // around seats and poles inside the bus
      ao.updateGtaoMaterial({ radius: 2.0, distanceExponent: 1.3, thickness: 6.0, scale: 1.8, samples: this.quality === 'ultra' ? 16 : 10, distanceFallOff: 0.6, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: this.quality === 'ultra' ? 12 : 8 });
      this.aoInterior = false;
      ao.blendIntensity = 0.9;
      this.composer.addPass(ao);
    } else this.ao = null;
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

  /**
   * Inside a bus the street-scale AO radius (2 m) darkens the whole low ceiling in blotches: use a cabin-scale
   * radius (contact shading round seats, poles and window frames) while the camera is in a saloon or cab.
   */
  setInterior(on) {
    if (!this.ao || this.aoInterior === on) return;
    this.aoInterior = on;
    this.ao.updateGtaoMaterial(on ? { radius: 0.35, thickness: 0.8, scale: 1.2, distanceFallOff: 1.0 } : { radius: 2.0, thickness: 6.0, scale: 1.8, distanceFallOff: 0.6 });
    this.ao.updatePdMaterial(on ? { radius: 3 } : { radius: 5 });
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
