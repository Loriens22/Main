import * as THREE from 'three';
import { BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { Settings } from '../core/Settings';
import { bus } from '../core/events';
import { damp } from '../core/math';
import { materials } from './Materials';

const GRADE_FRAG = /* glsl */ `
uniform float uExposure;
uniform float uGrain;
uniform float uVignette;
uniform float uSeed;
uniform vec3 uTint;
uniform float uSaturation;
uniform float uContrast;
uniform float uFade; // 0..1 fade to black
uniform vec3 uFlash; // additive whiteout (clouds, wormhole)

vec3 agxContrast( vec3 x ) {
  vec3 x2 = x * x; vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx( vec3 v ) {
  const mat3 m = mat3( 0.842479062253094, 0.0423282422610123, 0.0423756549057051, 0.0784335999999992, 0.878468636469772, 0.0784336, 0.0792237451477643, 0.0791661274605434, 0.879142973793104 );
  const mat3 mi = mat3( 1.19687900512017, -0.0528968517574562, -0.0529716355144438, -0.0980208811401368, 1.15190312990417, -0.0980434501171241, -0.0990297440797205, -0.0989611768448433, 1.15107367264116 );
  v = m * max( v, vec3( 1e-10 ) );
  v = clamp( log2( v ), -12.47393, 4.026069 );
  v = ( v + 12.47393 ) / 16.5;
  v = agxContrast( v );
  // "punchy" look: restores the contrast and saturation AgX removes
  float l = dot( v, vec3( 0.2126, 0.7152, 0.0722 ) );
  v = pow( max( v, vec3( 0.0 ) ), vec3( uContrast ) );
  v = l + uSaturation * ( v - l );
  v = mi * v;
  return pow( max( v, vec3( 0.0 ) ), vec3( 2.2 ) );
}
float hash13( vec3 p ) {
  p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z );
}
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  vec3 c = inputColor.rgb * uExposure * uTint;
  c = agx( c );
  vec2 q = uv - 0.5;
  float vig = smoothstep( 0.95, 0.25, length( q * vec2( 1.0, 0.8 ) ) );
  c *= mix( 1.0, vig, uVignette );
  float n = hash13( vec3( gl_FragCoord.xy, uSeed ) ) - 0.5;
  float lum = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c += n * uGrain * ( 0.04 + 0.1 * sqrt( max( lum, 0.0 ) ) * ( 1.0 - lum ) );
  c = mix( c, vec3( 0.0 ), uFade ) + uFlash;
  outputColor = vec4( max( c, vec3( 0.0 ) ), inputColor.a );
}
`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      blendFunction: BlendFunction.SET,
      uniforms: new Map<string, THREE.Uniform>([
        ['uExposure', new THREE.Uniform(1.0)],
        ['uGrain', new THREE.Uniform(0.5)],
        ['uVignette', new THREE.Uniform(0.35)],
        ['uSeed', new THREE.Uniform(0)],
        ['uTint', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ['uSaturation', new THREE.Uniform(1.25)],
        ['uContrast', new THREE.Uniform(1.25)],
        ['uFade', new THREE.Uniform(0)],
        ['uFlash', new THREE.Uniform(new THREE.Vector3(0, 0, 0))],
      ]),
    });
  }
  u(name: string) { return this.uniforms.get(name)!; }
}

/** Screen-space look per environment (set by zones; smoothly approached). */
export interface Look {
  exposure: number;
  tint: [number, number, number];
  saturation: number;
  contrast: number;
  bloom: number;
  aoIntensity: number;
  aoRadius: number;
}

export const DEFAULT_LOOK: Look = { exposure: 1.0, tint: [1, 1, 1], saturation: 1.25, contrast: 1.25, bloom: 0.55, aoIntensity: 2.2, aoRadius: 1.2 };

export class Renderer {
  gl: THREE.WebGLRenderer;
  /** Local interactive scene (metres, small coordinates). */
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.08, 20000);
  /** Background scene: sky dome, sun, planets, stars, black hole. Rendered first with its own depth range. */
  spaceScene = new THREE.Scene();
  spaceCamera = new THREE.PerspectiveCamera(70, 1, 1, 1e7);
  composer!: EffectComposer;
  private grade!: GradeEffect;
  private bloom: BloomEffect | null = null;
  private ao: any = null;
  look: Look = { ...DEFAULT_LOOK };
  private lookTarget: Look = { ...DEFAULT_LOOK };
  fade = 0;
  fadeTarget = 0;
  fadeRate = 2.0;
  flash = new THREE.Vector3();
  width = 1;
  height = 1;
  frame = 0;
  maxAnisotropy = 1;

  constructor(public canvas: HTMLCanvasElement, private settings: Settings) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.shadowMap.autoUpdate = true;
    this.gl.info.autoReset = true;
    this.maxAnisotropy = this.gl.capabilities.getMaxAnisotropy();
    this.scene.background = null;
    this.spaceScene.background = new THREE.Color(0x000000);
    this.scene.add(this.camera);
    this.build();
    window.addEventListener('resize', () => this.resize());
    bus.on('settings:graphics', () => { this.build(); });
    this.resize();
  }

  /** (Re)build the post-processing chain for the current graphics settings. */
  build() {
    const g = this.settings.g;
    this.composer?.dispose();
    this.gl.shadowMap.enabled = g.shadowQuality > 0;
    materials.setAnisotropy(Math.min(this.maxAnisotropy, [2, 4, 16][g.textureQuality]));
    this.composer = new EffectComposer(this.gl, { frameBufferType: THREE.HalfFloatType, multisampling: 0, depthBuffer: true, stencilBuffer: false });
    const spacePass = new RenderPass(this.spaceScene, this.spaceCamera);
    const mainPass = new RenderPass(this.scene, this.camera);
    mainPass.clearPass.setClearFlags(false, true, false); // keep the space pass colour, reset depth
    this.composer.addPass(spacePass);
    this.composer.addPass(mainPass);
    this.ao = null;
    if (g.ambientOcclusion > 0) {
      const ao = new N8AOPostPass(this.scene, this.camera, this.width, this.height);
      ao.configuration.aoRadius = this.look.aoRadius;
      ao.configuration.distanceFalloff = 1.0;
      ao.configuration.intensity = this.look.aoIntensity;
      ao.configuration.color = new THREE.Color(0, 0, 0);
      ao.configuration.halfRes = g.ambientOcclusion < 2;
      ao.configuration.depthAwareUpsampling = true;
      ao.configuration.gammaCorrection = false;
      ao.setQualityMode(g.ambientOcclusion >= 2 ? 'Medium' : 'Low');
      this.composer.addPass(ao);
      this.ao = ao;
    }
    this.grade = new GradeEffect();
    const fx: Effect[] = [];
    this.bloom = null;
    if (g.bloom) {
      this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.25, intensity: this.look.bloom, radius: 0.72, levels: 7 });
      fx.push(this.bloom);
    }
    fx.push(this.grade);
    this.composer.addPass(new EffectPass(this.camera, ...fx));
    if (g.antialiasing > 0) {
      const smaa = new SMAAEffect({ preset: g.antialiasing > 1 ? SMAAPreset.HIGH : SMAAPreset.MEDIUM });
      this.composer.addPass(new EffectPass(this.camera, smaa));
    }
    this.resize();
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const g = this.settings.g;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * g.resolutionScale;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.spaceCamera.aspect = w / h;
    this.spaceCamera.updateProjectionMatrix();
    if (this.ao) this.ao.setSize(w * pr, h * pr);
  }

  setLook(l: Partial<Look>, immediate = false) {
    this.lookTarget = { ...DEFAULT_LOOK, ...l };
    if (immediate) this.look = { ...this.lookTarget, tint: [...this.lookTarget.tint] as [number, number, number] };
  }

  fadeTo(v: number, rate = 2.0, immediate = false) {
    this.fadeTarget = v;
    this.fadeRate = rate;
    if (immediate) this.fade = v;
  }

  render(dt: number) {
    this.frame++;
    const L = this.look, T = this.lookTarget;
    const k = 1.6; // eye adaptation rate
    L.exposure = damp(L.exposure, T.exposure, k, dt);
    L.saturation = damp(L.saturation, T.saturation, k, dt);
    L.contrast = damp(L.contrast, T.contrast, k, dt);
    L.bloom = damp(L.bloom, T.bloom, k, dt);
    L.aoIntensity = damp(L.aoIntensity, T.aoIntensity, k, dt);
    L.aoRadius = damp(L.aoRadius, T.aoRadius, k, dt);
    for (let i = 0; i < 3; i++) L.tint[i] = damp(L.tint[i], T.tint[i], k, dt);
    this.fade = damp(this.fade, this.fadeTarget, this.fadeRate, dt);
    if (Math.abs(this.fade - this.fadeTarget) < 0.003) this.fade = this.fadeTarget;

    const g = this.settings.g;
    const G = this.grade;
    G.u('uExposure').value = L.exposure;
    (G.u('uTint').value as THREE.Vector3).set(L.tint[0], L.tint[1], L.tint[2]);
    G.u('uSaturation').value = L.saturation;
    G.u('uContrast').value = L.contrast;
    G.u('uGrain').value = g.filmGrain ? 0.55 : 0.0;
    G.u('uVignette').value = g.lensEffects ? 0.38 : 0.0;
    G.u('uSeed').value = (this.frame % 1024) * 1.37;
    G.u('uFade').value = this.fade;
    (G.u('uFlash').value as THREE.Vector3).copy(this.flash);
    if (this.bloom) this.bloom.intensity = L.bloom;
    if (this.ao) {
      this.ao.configuration.intensity = L.aoIntensity;
      this.ao.configuration.aoRadius = L.aoRadius;
    }

    // The background camera shares orientation and lens with the main camera but sits at the origin.
    this.camera.updateMatrixWorld();
    this.spaceCamera.quaternion.setFromRotationMatrix(this.camera.matrixWorld);
    if (this.spaceCamera.fov !== this.camera.fov) {
      this.spaceCamera.fov = this.camera.fov;
      this.spaceCamera.updateProjectionMatrix();
    }
    this.composer.render(dt);
  }

  info() {
    const i = this.gl.info;
    return { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
  }
}
