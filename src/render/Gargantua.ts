import * as THREE from 'three';
import { QU } from './quality';

/**
 * The Gargantua system's sky: another galaxy (dense star field, a galactic band, nebulosity) and the black hole
 * itself, ray traced per pixel. Distances are in units of the horizon radius Rs.
 *   • photon paths: Schwarzschild null geodesics integrated in Cartesian form, d²x/dλ² = −1.5·h²·x/r⁵
 *     (h = |x × v|), so the shadow (b < 2.6 Rs), the photon ring and the lensed sky all emerge from the geometry;
 *   • a thin accretion disk (Shakura–Sunyaev temperature profile) crossed by the bent rays — its far side appears
 *     above and below the shadow; Doppler beaming and gravitational redshift (kept moderate, as in the film);
 *   • turbulent streaks orbiting at Keplerian rates.
 */
export const OTHER_SKY_GLSL = /* glsl */ `
  float gsHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float gsNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(gsHash(i), gsHash(i + vec3(1,0,0)), f.x), mix(gsHash(i + vec3(0,1,0)), gsHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(gsHash(i + vec3(0,0,1)), gsHash(i + vec3(1,0,1)), f.x), mix(gsHash(i + vec3(0,1,1)), gsHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  // the Gargantua galaxy: denser, bluer star field, a broad band with dust lanes, magenta–blue nebulae
  vec3 otherSky(vec3 d){
    vec3 col = vec3(0.0);
    for (int k = 0; k < 3; k++){
      vec3 p = d * (150.0 + float(k) * 230.0);
      vec3 i = floor(p);
      float h = gsHash(i + float(k) * 7.0);
      float s = step(0.955, h) * pow(fract(h * 113.0), 4.0);
      vec3 f = fract(p) - 0.5;
      vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.7), fract(h * 57.0));
      col += tint * s * exp(-dot(f, f) * 32.0) * 8.0;
    }
    vec3 bandN = normalize(vec3(0.35, 0.82, 0.45));
    float lat = dot(d, bandN);
    float band = exp(-lat * lat * 12.0);
    float neb = gsNoise(d * 5.0) * 0.6 + gsNoise(d * 13.0) * 0.4;
    float dust = smoothstep(0.45, 0.7, gsNoise(d * 9.0 + 3.0)) * exp(-lat * lat * 60.0);
    col += mix(vec3(0.22, 0.28, 0.62), vec3(0.68, 0.42, 0.6), neb) * band * (0.2 + 0.8 * neb) * 0.6 * (1.0 - 0.75 * dust);
    col += vec3(0.5, 0.48, 0.6) * pow(gsNoise(d * 40.0), 6.0) * band * 0.8;
    return col;
  }
`;

/** Full-sky dome of the other galaxy (drawn first in the far layer). */
export class AlienSky {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthTest: false, depthWrite: false,
      uniforms: { uK: { value: 1 } },
      vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `precision highp float; uniform float uK; varying vec3 vD; ${OTHER_SKY_GLSL}
        void main(){ gl_FragColor = vec4(otherSky(normalize(vD)) * uK, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(2.5e5, 64, 32), this.mat);
    this.mesh.renderOrder = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.owned = true;
  }
}

const SCALED_KM = 40000;

export class Gargantua {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  /** disk inner/outer radius and bounding sphere (Rs) */
  readonly inner = 2.2;
  readonly outer = 10;
  readonly bound = 40;
  /** angular-size of the shadow from the camera (rad), for HUD/descriptions */
  angular = 0;

  constructor(readonly rsKm: number, diskNormal: THREE.Vector3) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthTest: false, depthWrite: false,
      uniforms: {
        uCam: { value: new THREE.Vector3(100, 0, 0) }, uN: { value: diskNormal.clone().normalize() },
        uIn: { value: this.inner }, uOut: { value: this.outer }, uBound: { value: this.bound }, uTime: { value: 0 }, uK: { value: 1 }, uDisk: { value: 1 }, uQGarg: QU.uQGarg,
      },
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uCam, uN; uniform float uIn, uOut, uBound, uTime, uK, uDisk, uQGarg; varying vec3 vW;
        ${OTHER_SKY_GLSL}
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          float a = gsHash(vec3(i, 1.0)), b = gsHash(vec3(i + vec2(1.0, 0.0), 1.0)), c = gsHash(vec3(i + vec2(0.0, 1.0), 1.0)), d = gsHash(vec3(i + vec2(1.0, 1.0), 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
        vec3 ramp(float t){
          // emitted colour vs (redshifted) temperature: deep orange → gold → white → faintly blue-white
          vec3 c = mix(vec3(0.9, 0.28, 0.05), vec3(1.0, 0.62, 0.28), smoothstep(0.1, 0.5, t));
          c = mix(c, vec3(1.0, 0.9, 0.78), smoothstep(0.45, 0.95, t));
          return mix(c, vec3(0.88, 0.93, 1.0), smoothstep(1.0, 1.6, t));
        }
        vec4 disk(vec3 xi, vec3 v){
          float r = length(xi);
          vec3 e1 = normalize(cross(uN, vec3(0.31, 0.57, 0.76))); vec3 e2 = cross(uN, e1);
          float ang = atan(dot(xi, e2), dot(xi, e1));
          float om = 2.0 * pow(r, -1.5);
          float a2 = ang + om * uTime;
          // sheared turbulence: streaks stretched along the orbit, clumps and gaps, no regular banding
          vec2 q = vec2(r * 3.2 + 0.8 * n2(vec2(r * 1.3, a2 * 1.5)), a2 * 2.2);
          float tex = 0.35 + 0.65 * (n2(q * vec2(1.0, 2.0)) * 0.5 + n2(q * vec2(3.1, 7.0) + 5.0) * 0.3 + n2(q * vec2(9.0, 22.0) + 11.0) * 0.2);
          float rings = 0.82 + 0.18 * n2(vec2(r * 6.0, a2 * 0.7 + 3.0));
          float x = uIn / r;
          float T = pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0), 0.25) / 0.488;
          float beta = clamp(sqrt(0.5 / r), 0.0, 0.62);
          vec3 vd = normalize(cross(uN, xi));
          float cosT = dot(vd, -v);
          float gam = inversesqrt(1.0 - beta * beta);
          float D = 1.0 / (gam * (1.0 - beta * cosT));
          float g = D * sqrt(max(1.0 - 1.0 / r, 0.04));
          float I = 2.4 * T * T * T * T * pow(g, 2.2) * tex * rings;
          float edge = smoothstep(uIn, uIn * 1.08, r) * (1.0 - smoothstep(uOut * 0.55, uOut, r));
          float a = clamp(edge * (0.55 + 0.45 * tex) * 1.2, 0.0, 1.0);
          return vec4(ramp(T * g) * I, a);
        }
        void main(){
          vec3 rd = normalize(vW);                 // far camera at the origin
          vec3 x = uCam; vec3 v = rd;
          float b0 = dot(x, v); float c0 = dot(x, x) - uBound * uBound;
          if (c0 > 0.0){
            float hh = b0 * b0 - c0;
            if (hh < 0.0 || b0 > 0.0){ gl_FragColor = vec4(otherSky(rd) * uK, 1.0); return; }
            x += v * (-b0 - sqrt(hh));
          }
          vec3 hv = cross(x, v); float h2 = dot(hv, hv);
          vec3 col = vec3(0.0); float acc = 0.0; bool cap = false;
          // fewer steps at low quality: longer steps far from the hole only — near the photon sphere a long step
          // jumps a grazing ray straight through the horizon and the shadow balloons
          int nSteps = int(260.0 * uQGarg); float kStep = 260.0 / float(nSteps);
          for (int i = 0; i < 260; i++){
            if (i >= nSteps) break;
            float r = length(x);
            float dt = clamp(0.045 * r * mix(1.0, kStep, smoothstep(5.0, 14.0, r)), 0.008, 1.6 * kStep);
            vec3 a = -1.5 * h2 * x / (r * r * r * r * r);
            vec3 v2 = normalize(v + a * dt);
            vec3 xn = x + v2 * dt;
            float s0 = dot(x, uN), s1 = dot(xn, uN);
            if (uDisk > 0.5 && s0 * s1 < 0.0){
              vec3 xi = mix(x, xn, s0 / (s0 - s1));
              float ri = length(xi);
              if (ri > uIn && ri < uOut){
                vec4 dc = disk(xi, v2);
                col += (1.0 - acc) * dc.rgb * dc.a;
                acc += (1.0 - acc) * dc.a;
                if (acc > 0.985) break;
              }
            }
            x = xn; v = v2;
            if (dot(x, x) < 1.0){ cap = true; break; }
            if (dot(x, x) > uBound * uBound && dot(x, v) > 0.0) break;
          }
          vec3 bg = cap ? vec3(0.0) : otherSky(normalize(v));
          gl_FragColor = vec4((col + (1.0 - acc) * bg) * uK, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.userData.owned = true;
  }

  /**
   * @param relM black hole position relative to the camera (metres, three axes)
   */
  update(relM: THREE.Vector3, time: number, k = 1) {
    const u = this.mat.uniforms;
    const rs = this.rsKm * 1000;
    (u.uCam.value as THREE.Vector3).copy(relM).multiplyScalar(-1 / rs);
    u.uTime.value = time;
    u.uK.value = k;
    const distKm = relM.length() / 1000;
    const boundKm = this.bound * this.rsKm;
    if (distKm < boundKm * 1.05) {
      // inside the bounding sphere: any enclosing proxy works (the shader only uses view directions)
      this.mesh.position.set(0, 0, 0);
      this.mesh.scale.setScalar(1e5);
    } else {
      const sc = SCALED_KM / distKm;
      this.mesh.position.copy(relM).multiplyScalar(sc / 1000);
      this.mesh.scale.setScalar(boundKm * sc);
    }
    this.angular = Math.atan(2.6 * rs / Math.max(relM.length(), rs));
  }
}
