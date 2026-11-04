import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Final grade: exposure -> ACES filmic -> sRGB -> lift/gamma/gain/sat ->
 *  vignette, chromatic aberration, CRT snow, scanlines, paper, grain, fades. */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    tPaper: { value: null },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uTime: { value: 0 },
    uExposure: { value: 1 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGamma: { value: new THREE.Vector3(1, 1, 1) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
    uCA: { value: 0.0015 },
    uWarp: { value: 0 },
    uStatic: { value: 0 },
    uStaticBase: { value: 0 },
    uScan: { value: 0 },
    uScanScale: { value: 1 },
    uPaper: { value: 0 },
    uFadeColor: { value: new THREE.Color(0, 0, 0) },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D tPaper;
    uniform vec2 uRes; uniform float uTime, uExposure, uSat, uContrast, uVignette, uGrain, uCA, uWarp, uStatic, uStaticBase, uScan, uScanScale, uPaper, uFade;
    uniform vec3 uLift, uGamma, uGain, uFadeColor;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
    vec3 aces(vec3 x){ const float a=2.51; const float b=0.03; const float c=2.43; const float d=0.59; const float e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
    void main(){
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      // CRT barrel warp (used while the camera dives into the television glass)
      float r2 = dot(cc, cc);
      uv = 0.5 + cc * (1.0 + uWarp * r2 * 1.6) / (1.0 + uWarp * 0.25);
      vec2 dir = cc * (uCA + uWarp * 0.012);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;
      col *= uExposure;
      col = aces(col);
      col = toSRGB(col);
      // grade
      col = pow(max(col, 0.0), 1.0 / uGamma);
      col = col * uGain + uLift * (1.0 - col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      // paper fibre overlay (botanical act)
      if (uPaper > 0.0) {
        vec3 pp = texture2D(tPaper, vUv * vec2(uRes.x / uRes.y, 1.0) * 1.6).rgb;
        col *= mix(vec3(1.0), 0.86 + pp * 0.24, uPaper);
      }
      // scanlines
      if (uScan > 0.0) {
        float s = sin(vUv.y * uRes.y * 3.14159 / (2.0 * uScanScale));
        col *= mix(1.0, 0.72 + 0.28 * s * s, uScan);
      }
      // analog snow
      if (uStatic > 0.0) {
        vec2 px = floor(vUv * uRes / 2.0);
        float n = hash(px + floor(uTime * 60.0) * vec2(17.0, 61.0));
        float band = smoothstep(0.0, 1.0, sin(vUv.y * 9.0 + uTime * 11.0) * 0.5 + 0.5) * 0.25;
        float line = step(0.985, hash(vec2(floor(vUv.y * uRes.y / 3.0), floor(uTime * 30.0)))) * 0.5;
        vec3 snow = vec3(clamp(n * 1.1 + band - 0.1 + line, 0.0, 1.0));
        col = mix(col, mix(snow, max(snow, vec3(uStaticBase)), uStaticBase * 0.6), uStatic);
      }
      // vignette
      col *= 1.0 - uVignette * smoothstep(0.25, 1.05, length(cc * vec2(1.25, 1.0)) * 1.25);
      // grain
      float g = hash(vUv * uRes + fract(uTime * 7.31) * 911.0) - 0.5;
      col += g * uGrain;
      col = mix(col, uFadeColor, uFade);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  composer: EffectComposer;
  renderPass: RenderPass;
  bloom: UnrealBloomPass;
  final: ShaderPass;
  constructor(public renderer: THREE.WebGLRenderer, w: number, h: number, paper: THREE.Texture, samples = 4) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.final.uniforms.tPaper.value = paper;
    paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
    this.composer.addPass(this.final);
    this.setSize(w, h);
  }
  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w, h);
  }
  get u() { return this.final.uniforms; }
  render(scene: THREE.Scene, cam: THREE.Camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = cam;
    this.composer.render();
  }
}

export interface Grade {
  exposure?: number; lift?: number[]; gamma?: number[]; gain?: number[]; sat?: number; contrast?: number;
  vignette?: number; grain?: number; ca?: number; bloom?: number; bloomRadius?: number; bloomThreshold?: number; paper?: number;
}

export function applyGrade(p: Post, g: Grade) {
  const u = p.u;
  u.uExposure.value = g.exposure ?? 1;
  u.uLift.value.fromArray(g.lift ?? [0, 0, 0]);
  u.uGamma.value.fromArray(g.gamma ?? [1, 1, 1]);
  u.uGain.value.fromArray(g.gain ?? [1, 1, 1]);
  u.uSat.value = g.sat ?? 1;
  u.uContrast.value = g.contrast ?? 1;
  u.uVignette.value = g.vignette ?? 0.35;
  u.uGrain.value = g.grain ?? 0.03;
  u.uCA.value = g.ca ?? 0.0012;
  u.uPaper.value = g.paper ?? 0;
  p.bloom.strength = g.bloom ?? 0.3;
  p.bloom.radius = g.bloomRadius ?? 0.5;
  p.bloom.threshold = g.bloomThreshold ?? 0.85;
}

export function lerpGrade(a: Grade, b: Grade, k: number): Grade {
  const L = (x: any, y: any, d: any) => (x ?? d) + ((y ?? d) - (x ?? d)) * k;
  const LV = (x: number[] | undefined, y: number[] | undefined, d: number[]) => [0, 1, 2].map((i) => L(x?.[i], y?.[i], d[i]));
  return {
    exposure: L(a.exposure, b.exposure, 1), lift: LV(a.lift, b.lift, [0, 0, 0]), gamma: LV(a.gamma, b.gamma, [1, 1, 1]), gain: LV(a.gain, b.gain, [1, 1, 1]),
    sat: L(a.sat, b.sat, 1), contrast: L(a.contrast, b.contrast, 1), vignette: L(a.vignette, b.vignette, 0.35), grain: L(a.grain, b.grain, 0.03),
    ca: L(a.ca, b.ca, 0.0012), bloom: L(a.bloom, b.bloom, 0.3), bloomRadius: L(a.bloomRadius, b.bloomRadius, 0.5), bloomThreshold: L(a.bloomThreshold, b.bloomThreshold, 0.85), paper: L(a.paper, b.paper, 0),
  };
}
