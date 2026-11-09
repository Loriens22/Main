import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import type { GraphicsSettings } from '../core/Settings';

export interface RenderLayer {
  scene: THREE.Scene;
  camera: THREE.Camera;
  clearDepth?: boolean;
}

/** Renders several scene layers into one buffer (far scaled-space layer, then near layer). */
class LayeredRenderPass extends Pass {
  layers: RenderLayer[] = [];
  clearColor = new THREE.Color(0x000000);
  constructor() {
    super();
    this.needsSwap = false;
  }
  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    const oldAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    renderer.setClearColor(this.clearColor, 1);
    renderer.clear(true, true, true);
    for (const l of this.layers) {
      if (l.clearDepth) renderer.clearDepth();
      renderer.render(l.scene, l.camera);
    }
    renderer.autoClear = oldAuto;
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    grain: { value: 0.035 },
    vignette: { value: 0.35 },
    chroma: { value: 0.0012 },
    saturation: { value: 0.92 },
    lift: { value: new THREE.Vector3(0.006, 0.005, 0.004) },
    gain: { value: new THREE.Vector3(1.02, 1.0, 0.97) },
    contrast: { value: 1.04 },
    dust: { value: 0.0 },
    dustColor: { value: new THREE.Color(0.55, 0.47, 0.36) },
    fade: { value: 0.0 },
    fadeColor: { value: new THREE.Color(0, 0, 0) },
    blurDir: { value: new THREE.Vector2(0, 0) },
    visor: { value: 0.0 },
    shake: { value: 0.0 },
    warp: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float time; uniform vec2 resolution;
    uniform float grain, vignette, chroma, saturation, contrast, dust, fade, visor, shake, warp;
    uniform vec3 lift, gain, dustColor, fadeColor; uniform vec2 blurDir;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 uv = vUv;
      if (shake > 0.0) uv += (vec2(noise(vec2(time*31.0,1.0)), noise(vec2(2.0,time*29.0))) - 0.5) * shake * 0.01;
      if (warp > 0.0) { vec2 c = uv - 0.5; float r = length(c); uv = 0.5 + c * (1.0 - warp * 0.35 * r * r) ; }
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      if (length(blurDir) > 0.0005) {
        col = vec3(0.0);
        for (int i = 0; i < 8; i++) { float t = (float(i) / 7.0 - 0.5); col += texture2D(tDiffuse, uv + blurDir * t).rgb; }
        col /= 8.0;
      } else if (chroma > 0.0) {
        vec2 off = c * chroma * (1.0 + r2 * 4.0);
        col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      // colour grade (display referred)
      col = col * gain + lift * (1.0 - col);
      col = (col - 0.5) * contrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      // dust storm haze in screen space
      if (dust > 0.0) {
        float n = noise(uv * vec2(6.0, 3.0) + vec2(time * 0.35, time * 0.05)) * 0.6 + noise(uv * 22.0 + time * 1.3) * 0.4;
        col = mix(col, dustColor * (0.75 + 0.5 * n), clamp(dust * (0.55 + 0.45 * n), 0.0, 0.95));
      }
      // helmet visor: slight tint, edge darkening and reflection streak
      if (visor > 0.0) {
        float e = smoothstep(0.18, 0.5, r2);
        col = mix(col, col * vec3(0.92, 0.96, 1.0), visor);
        col *= 1.0 - e * 0.55 * visor;
        col += vec3(0.04, 0.05, 0.06) * smoothstep(0.02, 0.0, abs(uv.y - 0.82 + uv.x * 0.25)) * visor;
      }
      col *= 1.0 - vignette * smoothstep(0.08, 0.62, r2);
      float g = hash(uv * resolution + fract(time * 13.7) * 100.0) - 0.5;
      col += g * grain * (1.0 - l * 0.6);
      col = mix(col, fadeColor, fade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

class GradePass extends Pass {
  material: THREE.ShaderMaterial;
  quad: FullScreenQuad;
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GradeShader.uniforms),
      vertexShader: GradeShader.vertexShader,
      fragmentShader: GradeShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    this.material.uniforms.tDiffuse.value = read.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : write);
    this.quad.render(renderer);
  }
  setSize(w: number, h: number) {
    this.material.uniforms.resolution.value.set(w, h);
  }
}

/** Screen-space effects the gameplay layer can drive. */
export interface ScreenFx {
  dust: number;
  fade: number;
  fadeColor: THREE.Color;
  visor: number;
  shake: number;
  warp: number;
  exposure: number; // target exposure multiplier
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  private layered = new LayeredRenderPass();
  private bloom: UnrealBloomPass;
  private grade = new GradePass();
  private output = new OutputPass();
  private aa: Pass | null = null;
  private gtao: GTAOPass | null = null;
  private gtaoScene: THREE.Scene | null = null;
  private settings!: GraphicsSettings;
  private width = 1;
  private height = 1;
  private exposure = 1;
  private lastCamQuat = new THREE.Quaternion();
  private lastCamPos = new THREE.Vector3(1e9, 0, 0);
  snapNext = false;
  readonly fx: ScreenFx = { dust: 0, fade: 0, fadeColor: new THREE.Color(0, 0, 0), visor: 0, shake: 0, warp: 0, exposure: 1 };
  readonly pmrem: THREE.PMREMGenerator;
  readonly maxAnisotropy: number;
  stats = { calls: 0, tris: 0, fps: 0 };

  constructor(readonly canvas: HTMLCanvasElement, settings: GraphicsSettings) {
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      logarithmicDepthBuffer: false,
      preserveDrawingBuffer: true, // allows screenshots
    });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.info.autoReset = false;
    this.maxAnisotropy = this.gl.capabilities.getMaxAnisotropy();
    this.pmrem = new THREE.PMREMGenerator(this.gl);

    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(this.gl, rt);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 0.92);
    this.applySettings(settings);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  applySettings(s: GraphicsSettings) {
    this.settings = s;
    this.gl.shadowMap.enabled = s.shadowQuality > 0;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.rebuildChain();
    this.resize();
  }

  private rebuildChain() {
    const s = this.settings;
    const c = this.composer;
    while (c.passes.length) c.removePass(c.passes[0]);
    c.addPass(this.layered);
    this.gtao?.dispose();
    this.gtao = null;
    if (s.ambientOcclusion > 0 && this.gtaoScene) {
      const cam = this.layered.layers[this.layered.layers.length - 1]?.camera as THREE.PerspectiveCamera | undefined;
      if (cam) {
        this.gtao = new GTAOPass(this.gtaoScene, cam, this.width, this.height);
        this.gtao.blendIntensity = s.ambientOcclusion >= 2 ? 1.0 : 0.8;
        this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: s.ambientOcclusion >= 3 ? 16 : 10 });
        c.addPass(this.gtao);
      }
    }
    if (s.bloom) c.addPass(this.bloom);
    c.addPass(this.output);
    c.addPass(this.grade);
    this.aa = null;
    if (s.antiAliasing === 'smaa') this.aa = new SMAAPass();
    else if (s.antiAliasing === 'fxaa' || s.antiAliasing === 'msaa') this.aa = new FXAAPass();
    if (this.aa) c.addPass(this.aa);
    const rt = (c as any).renderTarget1 as THREE.WebGLRenderTarget;
    const samples = s.antiAliasing === 'msaa' ? 4 : 0;
    rt.samples = samples;
    (c as any).renderTarget2.samples = samples;
  }

  /** Set the scene that ambient occlusion is computed for (near layer). */
  setAOScene(scene: THREE.Scene | null) {
    if (this.gtaoScene === scene) return;
    this.gtaoScene = scene;
    this.rebuildChain();
  }

  resize() {
    const s = this.settings;
    const dpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 2 : 2.5);
    const scale = s?.resolutionScale ?? 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.gl.setPixelRatio(dpr * scale);
    this.gl.setSize(this.width, this.height, false);
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.composer.setPixelRatio(dpr * scale);
    this.composer.setSize(this.width, this.height);
    this.bloom.resolution.set(this.width * 0.5, this.height * 0.5);
  }

  get aspect() {
    return this.width / Math.max(1, this.height);
  }

  render(layers: RenderLayer[], camera: THREE.PerspectiveCamera, dt: number, time: number) {
    this.layered.layers = layers;
    const s = this.settings;
    if (this.gtao) {
      (this.gtao as any).camera = camera;
    }
    // exposure adaptation toward the zone's target
    const target = this.fx.exposure;
    // eye adaptation; snaps instantly when the camera teleports (fast travel, spawns)
    const jumped = camera.position.distanceTo(this.lastCamPos) > 25;
    this.lastCamPos.copy(camera.position);
    if (jumped || this.snapNext) this.exposure = target;
    else this.exposure += (target - this.exposure) * Math.min(1, dt * 1.5);
    this.snapNext = false;
    this.gl.toneMappingExposure = this.exposure;

    const u = this.grade.material.uniforms;
    u.time.value = time;
    u.grain.value = s.filmGrain ? 0.032 : 0.0;
    u.vignette.value = s.lensEffects ? 0.38 : 0.22;
    u.chroma.value = s.lensEffects ? 0.0011 : 0.0;
    u.dust.value = this.fx.dust;
    u.fade.value = this.fx.fade;
    (u.fadeColor.value as THREE.Color).copy(this.fx.fadeColor);
    u.visor.value = this.fx.visor;
    u.shake.value = this.fx.shake;
    u.warp.value = this.fx.warp;
    // camera rotation motion blur (screen-space, direction from angular velocity)
    if (s.motionBlur && dt > 0) {
      const dq = this.lastCamQuat.clone().invert().multiply(camera.quaternion);
      const e = new THREE.Euler().setFromQuaternion(dq, 'YXZ');
      const k = 0.35 / Math.max(dt * 60, 0.5);
      (u.blurDir.value as THREE.Vector2).set(THREE.MathUtils.clamp(e.y * k, -0.03, 0.03), THREE.MathUtils.clamp(-e.x * k, -0.03, 0.03));
    } else (u.blurDir.value as THREE.Vector2).set(0, 0);
    this.lastCamQuat.copy(camera.quaternion);

    this.gl.info.reset();
    this.composer.render(dt);
    this.stats.calls = this.gl.info.render.calls;
    this.stats.tris = this.gl.info.render.triangles;
  }

  setBloom(strength: number, threshold = 0.92, radius = 0.55) {
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.bloom.radius = radius;
  }

  setGrade(opts: { saturation?: number; contrast?: number; gain?: [number, number, number]; lift?: [number, number, number] }) {
    const u = this.grade.material.uniforms;
    if (opts.saturation !== undefined) u.saturation.value = opts.saturation;
    if (opts.contrast !== undefined) u.contrast.value = opts.contrast;
    if (opts.gain) (u.gain.value as THREE.Vector3).set(...opts.gain);
    if (opts.lift) (u.lift.value as THREE.Vector3).set(...opts.lift);
  }

  screenshot(): string {
    return this.canvas.toDataURL('image/jpeg', 0.92);
  }
}
