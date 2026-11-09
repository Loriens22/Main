import * as THREE from 'three';

/**
 * Physically based single-scattering sky (Rayleigh + Mie), evaluated per pixel on a camera-centred dome.
 * Parameters are per planet (Earth's dust-laden sky, Miller's pale haze, Mann's white murk, Edmunds' clear sky).
 * The same model is evaluated on the CPU to derive fog, ambient and sun colours for lighting coherence.
 */
export interface AtmosphereParams {
  planetRadius: number; // m
  atmosphereHeight: number; // m
  rayleigh: [number, number, number]; // scattering coefficients at sea level (1/m)
  rayleighScale: number; // scale height (m)
  mie: number; // 1/m
  mieScale: number;
  mieG: number;
  mieTint: [number, number, number]; // dust/aerosol colour multiplier
  sunIntensity: number;
  ground: [number, number, number]; // ground albedo for below-horizon colour
  stars: number; // star visibility multiplier
}

export const ATMOSPHERES: Record<string, AtmosphereParams> = {
  earth: {
    planetRadius: 6371e3, atmosphereHeight: 100e3, rayleigh: [5.8e-6, 13.5e-6, 33.1e-6], rayleighScale: 8000,
    mie: 4.2e-5, mieScale: 1600, mieG: 0.8, mieTint: [1.0, 0.86, 0.62], sunIntensity: 22, ground: [0.24, 0.22, 0.17],
    stars: 1,
  },
  miller: {
    planetRadius: 7200e3, atmosphereHeight: 110e3, rayleigh: [3.2e-6, 6.2e-6, 11.5e-6], rayleighScale: 9000,
    mie: 6.0e-5, mieScale: 2200, mieG: 0.72, mieTint: [0.95, 0.93, 0.88], sunIntensity: 16, ground: [0.28, 0.32, 0.34],
    stars: 0.2,
  },
  mann: {
    planetRadius: 5100e3, atmosphereHeight: 80e3, rayleigh: [3.0e-6, 4.4e-6, 6.0e-6], rayleighScale: 7000,
    mie: 1.6e-4, mieScale: 1400, mieG: 0.68, mieTint: [0.97, 0.98, 1.0], sunIntensity: 12, ground: [0.6, 0.62, 0.65],
    stars: 0.1,
  },
  edmunds: {
    planetRadius: 6100e3, atmosphereHeight: 100e3, rayleigh: [5.0e-6, 11.8e-6, 27.0e-6], rayleighScale: 8500,
    mie: 1.8e-5, mieScale: 1300, mieG: 0.78, mieTint: [1.0, 0.92, 0.8], sunIntensity: 20, ground: [0.35, 0.28, 0.2],
    stars: 1,
  },
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 sunDir;
uniform float Rp, Ra, Hr, Hm, mieG, sunI, starsVis, camAlt, dustAmt, sunDisk;
uniform vec3 betaR, mieTint, groundCol, dustCol;
uniform float betaM;
uniform float time;
#define PI 3.14159265
vec2 raySphere(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd); float c = dot(ro, ro) - r*r; float d = b*b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  d = sqrt(d); return vec2(-b - d, -b + d);
}
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
vec3 atmosphere(vec3 rd){
  vec3 ro = vec3(0.0, Rp + camAlt, 0.0);
  vec2 ta = raySphere(ro, rd, Ra);
  if (ta.x > ta.y) return vec3(0.0);
  vec2 tp = raySphere(ro, rd, Rp);
  float tmax = ta.y;
  bool hitGround = tp.x > 0.0 && tp.x < tmax;
  if (hitGround) tmax = tp.x;
  float tmin = max(ta.x, 0.0);
  const int N = 16; const int NL = 6;
  float ds = (tmax - tmin) / float(N);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  float mu = dot(rd, sunDir);
  float phR = 3.0 / (16.0 * PI) * (1.0 + mu*mu);
  float g = mieG;
  float phM = 3.0 / (8.0 * PI) * ((1.0 - g*g) * (1.0 + mu*mu)) / ((2.0 + g*g) * pow(1.0 + g*g - 2.0*g*mu, 1.5));
  for (int i = 0; i < N; i++){
    vec3 p = ro + rd * (tmin + ds * (float(i) + 0.5));
    float h = length(p) - Rp;
    float hr = exp(-h / Hr) * ds; float hm = exp(-h / Hm) * ds;
    odR += hr; odM += hm;
    vec2 tl = raySphere(p, sunDir, Ra);
    float dsl = tl.y / float(NL);
    float odRl = 0.0, odMl = 0.0; bool shadow = false;
    for (int j = 0; j < NL; j++){
      vec3 pl = p + sunDir * (dsl * (float(j) + 0.5));
      float hl = length(pl) - Rp;
      if (hl < 0.0) { shadow = true; break; }
      odRl += exp(-hl / Hr) * dsl; odMl += exp(-hl / Hm) * dsl;
    }
    if (!shadow){
      vec3 tau = betaR * (odR + odRl) + betaM * 1.1 * mieTint * (odM + odMl);
      vec3 att = exp(-tau);
      sumR += att * hr; sumM += att * hm;
    }
  }
  vec3 col = sunI * (sumR * betaR * phR + sumM * betaM * mieTint * phM);
  if (hitGround){
    vec3 tau = betaR * odR + betaM * 1.1 * mieTint * odM;
    col += groundCol * max(sunDir.y, 0.0) * sunI * 0.03 * exp(-tau);
  }
  return col;
}
void main(){
  vec3 rd = normalize(vDir);
  vec3 col = atmosphere(rd);
  // sun disc with limb darkening
  float mu = dot(rd, sunDir);
  float disc = smoothstep(0.99996 - 0.00002, 0.99996, mu) * sunDisk;
  vec3 ro = vec3(0.0, Rp + camAlt, 0.0);
  vec3 trans = exp(-(betaR * 8000.0 + betaM * mieTint * 1200.0) * 3.0 / max(sunDir.y + 0.15, 0.05));
  col += disc * trans * 600.0;
  // stars, faded by sky brightness
  float skyL = dot(col, vec3(0.3, 0.5, 0.2));
  if (starsVis > 0.0 && rd.y > -0.05){
    vec3 q = rd * 380.0;
    vec3 cell = floor(q);
    float h = hash13(cell);
    if (h > 0.9965){
      vec3 c = cell + 0.5 + (vec3(hash13(cell+1.3), hash13(cell+7.1), hash13(cell+3.7)) - 0.5) * 0.6;
      float d = length(q - c);
      float tw = 0.75 + 0.25 * sin(time * (2.0 + h * 9.0) + h * 40.0);
      float s = smoothstep(0.6, 0.0, d) * (h - 0.9965) * 300.0 * tw;
      col += vec3(0.85, 0.9, 1.0) * s * starsVis * clamp(1.0 - skyL * 6.0, 0.0, 1.0);
    }
  }
  // dust storm: flatten towards dust colour
  col = mix(col, dustCol * (0.25 + 0.75 * max(sunDir.y, 0.05)) * sunI * 0.06, dustAmt);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly sunDir = new THREE.Vector3(0.3, 0.6, -0.4).normalize();
  params: AtmosphereParams;
  dust = 0;
  readonly dustColor = new THREE.Color(0.62, 0.5, 0.36);
  private envScene = new THREE.Scene();
  private envMesh: THREE.Mesh;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvSun = new THREE.Vector3(0, -1, 0);
  private lastEnvDust = -1;

  constructor(params: AtmosphereParams) {
    this.params = params;
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        sunDir: { value: this.sunDir },
        Rp: { value: params.planetRadius },
        Ra: { value: params.planetRadius + params.atmosphereHeight },
        Hr: { value: params.rayleighScale },
        Hm: { value: params.mieScale },
        mieG: { value: params.mieG },
        sunI: { value: params.sunIntensity },
        starsVis: { value: params.stars },
        camAlt: { value: 2 },
        betaR: { value: new THREE.Vector3(...params.rayleigh) },
        betaM: { value: params.mie },
        mieTint: { value: new THREE.Vector3(...params.mieTint) },
        groundCol: { value: new THREE.Vector3(...params.ground) },
        dustAmt: { value: 0 },
        dustCol: { value: new THREE.Vector3(0.62, 0.5, 0.36) },
        sunDisk: { value: 1 },
        time: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.scale.setScalar(20000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.envMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.material);
    this.envMesh.scale.setScalar(100);
    this.envScene.add(this.envMesh);
  }

  setParams(p: AtmosphereParams) {
    this.params = p;
    const u = this.material.uniforms;
    u.Rp.value = p.planetRadius;
    u.Ra.value = p.planetRadius + p.atmosphereHeight;
    u.Hr.value = p.rayleighScale;
    u.Hm.value = p.mieScale;
    u.mieG.value = p.mieG;
    u.sunI.value = p.sunIntensity;
    u.starsVis.value = p.stars;
    (u.betaR.value as THREE.Vector3).set(...p.rayleigh);
    u.betaM.value = p.mie;
    (u.mieTint.value as THREE.Vector3).set(...p.mieTint);
    (u.groundCol.value as THREE.Vector3).set(...p.ground);
    this.lastEnvDust = -1;
  }

  update(camera: THREE.Camera, time: number, altitude: number) {
    this.mesh.position.copy(camera.position);
    const u = this.material.uniforms;
    u.time.value = time;
    u.camAlt.value = Math.max(1, altitude);
    u.dustAmt.value = this.dust;
    (u.dustCol.value as THREE.Vector3).set(this.dustColor.r, this.dustColor.g, this.dustColor.b);
  }

  /** Regenerate the IBL environment map when lighting changed noticeably. Returns the env texture. */
  updateEnvironment(pmrem: THREE.PMREMGenerator, force = false): THREE.Texture | null {
    if (!force && this.envRT && this.lastEnvSun.angleTo(this.sunDir) < 0.02 && Math.abs(this.lastEnvDust - this.dust) < 0.05) {
      return this.envRT.texture;
    }
    this.lastEnvSun.copy(this.sunDir);
    this.lastEnvDust = this.dust;
    const old = this.envRT;
    const u = this.material.uniforms;
    const disk = u.sunDisk.value;
    u.sunDisk.value = 0; // keep the sun out of the IBL (direct light handles it)
    this.envRT = pmrem.fromScene(this.envScene, 0, 0.1, 500);
    u.sunDisk.value = disk;
    old?.dispose();
    return this.envRT.texture;
  }

  // ---------------------------------------------------------------- CPU evaluation for lighting
  /** Radiance-ish colour of the sky in direction rd (same model, fewer samples). */
  evaluate(rd: THREE.Vector3, altitude = 2): THREE.Color {
    const p = this.params;
    const Rp = p.planetRadius, Ra = Rp + p.atmosphereHeight;
    const ro = new THREE.Vector3(0, Rp + altitude, 0);
    const rs = (o: THREE.Vector3, d: THREE.Vector3, r: number): [number, number] => {
      const b = o.dot(d), c = o.dot(o) - r * r, disc = b * b - c;
      if (disc < 0) return [1e9, -1e9];
      const s = Math.sqrt(disc);
      return [-b - s, -b + s];
    };
    const ta = rs(ro, rd, Ra);
    const tp = rs(ro, rd, Rp);
    let tmax = ta[1];
    if (tp[0] > 0 && tp[0] < tmax) tmax = tp[0];
    const N = 10, NL = 4;
    const ds = tmax / N;
    const sumR = [0, 0, 0], sumM = [0, 0, 0];
    let odR = 0, odM = 0;
    const mu = rd.dot(this.sunDir);
    const phR = (3 / (16 * Math.PI)) * (1 + mu * mu);
    const g = p.mieG;
    const phM = ((3 / (8 * Math.PI)) * ((1 - g * g) * (1 + mu * mu))) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
    const pt = new THREE.Vector3(), pl = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      pt.copy(ro).addScaledVector(rd, ds * (i + 0.5));
      const h = pt.length() - Rp;
      const hr = Math.exp(-h / p.rayleighScale) * ds, hm = Math.exp(-h / p.mieScale) * ds;
      odR += hr; odM += hm;
      const tl = rs(pt, this.sunDir, Ra);
      const dsl = tl[1] / NL;
      let odRl = 0, odMl = 0, shadow = false;
      for (let j = 0; j < NL; j++) {
        pl.copy(pt).addScaledVector(this.sunDir, dsl * (j + 0.5));
        const hl = pl.length() - Rp;
        if (hl < 0) { shadow = true; break; }
        odRl += Math.exp(-hl / p.rayleighScale) * dsl;
        odMl += Math.exp(-hl / p.mieScale) * dsl;
      }
      if (!shadow) {
        for (let k = 0; k < 3; k++) {
          const tau = p.rayleigh[k] * (odR + odRl) + p.mie * 1.1 * p.mieTint[k] * (odM + odMl);
          const a = Math.exp(-tau);
          sumR[k] += a * hr; sumM[k] += a * hm;
        }
      }
    }
    const c = new THREE.Color();
    c.r = p.sunIntensity * (sumR[0] * p.rayleigh[0] * phR + sumM[0] * p.mie * p.mieTint[0] * phM);
    c.g = p.sunIntensity * (sumR[1] * p.rayleigh[1] * phR + sumM[1] * p.mie * p.mieTint[1] * phM);
    c.b = p.sunIntensity * (sumR[2] * p.rayleigh[2] * phR + sumM[2] * p.mie * p.mieTint[2] * phM);
    if (this.dust > 0) {
      const d = this.dustColor.clone().multiplyScalar((0.25 + 0.75 * Math.max(this.sunDir.y, 0.05)) * p.sunIntensity * 0.06);
      c.lerp(d, this.dust);
    }
    return c;
  }

  /** Direct sunlight colour reaching the ground (transmittance along the sun path). */
  sunColor(): THREE.Color {
    const p = this.params;
    const mu = Math.max(this.sunDir.y, 0.0);
    const air = 1 / Math.max(mu + 0.15 * Math.pow(Math.max(0, 1 - mu), 3), 0.035);
    const c = new THREE.Color();
    const t = (k: number) => Math.exp(-(p.rayleigh[k] * p.rayleighScale + p.mie * p.mieTint[k] * p.mieScale * 1.1) * air);
    c.setRGB(t(0), t(1), t(2));
    if (this.dust > 0) c.multiplyScalar(1 - this.dust * 0.85).lerp(new THREE.Color(0.5, 0.38, 0.25), this.dust * 0.3);
    if (this.sunDir.y < -0.03) c.multiplyScalar(Math.max(0, 1 + this.sunDir.y * 12));
    return c;
  }
}
