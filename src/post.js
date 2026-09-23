// Real-time "Eevee-style" post-processing tuned for mobile GPUs:
// one MSAA HDR scene render → GTAO reconstructed from depth (half res, no extra scene pass)
// → dual-filter bloom on a small mip chain → one final pass (AO, bloom, ACES, grading, vignette, dither).
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// bright-pass with a soft knee (half resolution)
const PREFILTER = /* glsl */`
uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold, knee; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + texel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + texel * vec2(0.5, -0.5)).rgb
         + texture2D(tSrc, vUv + texel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + texel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  c = min(c, vec3(40.0)); // tame fireflies (sun glints)
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - threshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;
// dual Kawase filter (Marius Bjørge, "Bandwidth-efficient rendering", SIGGRAPH 2015)
const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
void main() {
  vec2 h = texel * 0.5;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv - h).rgb; s += texture2D(tSrc, vUv + h).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb; s += texture2D(tSrc, vUv - vec2(h.x, -h.y)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;
const UP = /* glsl */`
uniform sampler2D tSrc, tAdd; uniform vec2 texel; uniform float addW; varying vec2 vUv;
void main() {
  vec2 h = texel * 0.5;
  vec3 s = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb * addW, 1.0);
}`;
const FINAL = /* glsl */`
uniform sampler2D tColor, tAO, tBloom;
uniform float showAO, useAO, aoInt, bloomInt, exposure, contrast, saturation, vignette, warmth, time;
uniform vec2 res;
varying vec2 vUv;
vec3 pfFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 pfAces(vec3 c) {
  const mat3 IM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c = IM * (c / 0.6); c = pfFit(c); return clamp(OM * c, 0.0, 1.0);
}
vec3 pfSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  if (useAO > 0.5) { float ao = texture2D(tAO, vUv).r; c *= mix(1.0, ao, aoInt); if (showAO > 0.5) { gl_FragColor = vec4(vec3(ao), 1.0); return; } }
  c += texture2D(tBloom, vUv).rgb * bloomInt;
  c = pfAces(c * exposure);
  // grading: gentle saturation, warm highlights / cool shadows, S-curve contrast
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  c *= mix(vec3(1.0 - warmth * 0.5, 1.0, 1.0 + warmth * 0.6), vec3(1.0 + warmth, 1.0 + warmth * 0.25, 1.0 - warmth * 0.7), smoothstep(0.05, 0.8, l));
  c = pfSRGB(clamp(c, 0.0, 1.0));
  c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
  vec2 q = vUv - 0.5; q.x *= res.x / res.y;
  c *= 1.0 - vignette * smoothstep(0.35, 1.05, length(q));
  c += (hash(vUv * res) - 0.5) / 255.0; // dither against banding in the sky
  gl_FragColor = vec4(c, 1.0);
}`;

export const POST_LEVELS = {
  // ao: 0 = off, else resolution scale of the AO buffer
  ultra: { ao: 1.0, aoSamples: 16, bloom: true, msaa: 4 },
  high: { ao: 0.5, aoSamples: 12, bloom: true, msaa: 4 },
  medium: { ao: 0, aoSamples: 8, bloom: true, msaa: 4 },
  low: null, // direct rendering, no post
};

export class Post {
  constructor(renderer, scene, camera) {
    this.r = renderer; this.scene = scene; this.camera = camera;
    this.level = POST_LEVELS.high;
    this.w = 1; this.h = 1;
    const hdr = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, generateMipmaps: false });
    this.rt.depthTexture = new THREE.DepthTexture(1, 1);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    // ambient occlusion straight from the scene depth (normals reconstructed → no second geometry pass)
    // (three r186 dereferences its own normal target inside setGBuffer, so hand the depth over afterwards)
    this.gtao = new GTAOPass(scene, camera, 1, 1);
    this.gtao.setGBuffer(this.rt.depthTexture);
    this.gtao.normalRenderTarget.dispose();
    this.gtao.normalRenderTarget = { setSize() {}, dispose() {}, texture: null, depthTexture: null };
    this.gtao.output = GTAOPass.OUTPUT.Off;
    this.gtao.updateGtaoMaterial({ radius: 2.0, distanceExponent: 1.4, thickness: 2.2, distanceFallOff: 1.0, scale: 1.25, samples: 12, screenSpaceRadius: false });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 7, rings: 2, samples: 16 });
    // bloom mip chain
    this.mips = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(1, 1, hdr));
    this.ups = Array.from({ length: 4 }, () => new THREE.WebGLRenderTarget(1, 1, hdr));
    const sm = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false, toneMapped: false });
    this.mPre = sm(PREFILTER, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 2.2 }, knee: { value: 0.9 } });
    this.mDown = sm(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    this.mUp = sm(UP, { tSrc: { value: null }, tAdd: { value: null }, texel: { value: new THREE.Vector2() }, addW: { value: 1 } });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.white.needsUpdate = true;
    this.mFinal = sm(FINAL, {
      tColor: { value: this.rt.texture }, tAO: { value: this.white }, tBloom: { value: this.black },
      showAO: { value: 0 }, useAO: { value: 0 }, aoInt: { value: 1.0 }, bloomInt: { value: 0.1 }, exposure: { value: 1 },
      contrast: { value: 0.16 }, saturation: { value: 1.06 }, vignette: { value: 0.22 }, warmth: { value: 0.035 }, time: { value: 0 },
      res: { value: new THREE.Vector2(1, 1) },
    });
    this.quad = new FullScreenQuad(null);
  }
  get enabled() { return !!this.level; }
  setLevel(key) {
    this.level = POST_LEVELS[key] ?? null;
    if (!this.level) return;
    if (this.rt.samples !== this.level.msaa) { this.rt.samples = this.level.msaa; this.rt.dispose(); }
    if (this.level.ao) this.gtao.updateGtaoMaterial({ samples: this.level.aoSamples });
    this.setSize(this.w, this.h, true);
  }
  setSize(w, h, force = false) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (!force && w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.rt.setSize(w, h);
    const L = this.level;
    if (L?.ao) this.gtao.setSize(Math.max(1, Math.round(w * L.ao)), Math.max(1, Math.round(h * L.ao)));
    let mw = w, mh = h;
    for (let i = 0; i < this.mips.length; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); this.mips[i].setSize(mw, mh); if (i < this.ups.length) this.ups[i].setSize(mw, mh); }
    this.mFinal.uniforms.res.value.set(w, h);
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.quad.render(this.r); }
  render(time = 0) {
    const r = this.r, L = this.level;
    const size = r.getDrawingBufferSize(this._v || (this._v = new THREE.Vector2()));
    this.setSize(size.x, size.y);
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    const U = this.mFinal.uniforms;
    // AO (half or full resolution)
    if (L.ao) {
      this.gtao.render(r, null, this.rt);
      U.tAO.value = this.gtao.pdRenderTarget.texture; U.useAO.value = 1;
    } else { U.tAO.value = this.white; U.useAO.value = 0; }
    // bloom: prefilter → 4 downsamples → 4 upsamples
    if (L.bloom) {
      this.mPre.uniforms.tSrc.value = this.rt.texture; this.mPre.uniforms.texel.value.set(1 / this.w, 1 / this.h);
      this.pass(this.mPre, this.mips[0]);
      for (let i = 1; i < this.mips.length; i++) {
        this.mDown.uniforms.tSrc.value = this.mips[i - 1].texture; this.mDown.uniforms.texel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
        this.pass(this.mDown, this.mips[i]);
      }
      let src = this.mips[this.mips.length - 1];
      for (let i = this.ups.length - 1; i >= 0; i--) {
        this.mUp.uniforms.tSrc.value = src.texture; this.mUp.uniforms.texel.value.set(1 / src.width, 1 / src.height);
        this.mUp.uniforms.tAdd.value = this.mips[i].texture; this.mUp.uniforms.addW.value = 1;
        this.pass(this.mUp, this.ups[i]); src = this.ups[i];
      }
      U.tBloom.value = this.ups[0].texture;
    } else U.tBloom.value = this.black;
    U.exposure.value = r.toneMappingExposure; U.time.value = time % 100;
    this.pass(this.mFinal, null);
  }
}
