import * as THREE from 'three';

/**
 * Ray-traced planet with single-scattering atmosphere, drawn in a kilometre-scale "far" layer.
 *
 * The mesh is a back-faced sphere at the atmosphere's outer radius; every fragment casts the view ray
 * analytically against the planet sphere (a perfect limb at any distance), then
 *   • shades the surface (albedo map, clouds with cast shadows, ocean sun glint, night-side city lights),
 *   • integrates Rayleigh + Mie in-scattering along the view ray (sunlight attenuated through the atmosphere),
 * and writes premultiplied colour + coverage so stars show through the thin limb.
 * Planet frame: +Y = rotation axis (north). Texture lookup goes through uRot (inertial → body-fixed).
 */
export interface GlobeOptions {
  radius: number; // km
  atmosphere: number; // km thickness of the shell
  day: THREE.Texture;
  aux: THREE.Texture; // R clouds, G water mask, B city lights
  rayleigh?: THREE.Vector3; // 1/km
  mie?: number; // 1/km
  hr?: number; // km
  hm?: number; // km
}

const VERT = /* glsl */ `
  varying vec3 vL;
  void main(){
    vL = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDay, tAux;
  uniform vec3 uSun;          // unit, planet frame
  uniform vec3 uCam;          // camera position in planet frame (km)
  uniform mat3 uRot;          // inertial → body-fixed
  uniform float uR, uRa, uHr, uHm, uMie, uSunI, uSunL, uLights, uExposure;
  uniform vec3 uRay;
  varying vec3 vL;
  const float PI = 3.14159265;

  vec2 sphere(vec3 ro, vec3 rd, float r){
    float b = dot(ro, rd); float c = dot(ro, ro) - r * r; float h = b * b - c;
    if (h < 0.0) return vec2(1e9, -1e9);
    h = sqrt(h); return vec2(-b - h, -b + h);
  }
  vec2 lonlatUV(vec3 n){
    vec3 e = uRot * n;
    float lon = atan(-e.z, e.x);
    float lat = asin(clamp(e.y, -1.0, 1.0));
    return vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  }
  vec4 samp(sampler2D t, vec2 uv){
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    dx.x -= floor(dx.x + 0.5); dy.x -= floor(dy.x + 0.5);   // no mip seam at the date line
    return textureGrad(t, uv, dx, dy);
  }
  // optical depth (Rayleigh, Mie) from p toward the sun, 4-step march
  vec2 sunDepth(vec3 p){
    vec2 s = sphere(p, uSun, uRa);
    float L = max(s.y, 0.0); float ds = L / 4.0; vec2 od = vec2(0.0);
    for (int i = 0; i < 4; i++){
      vec3 q = p + uSun * (ds * (float(i) + 0.5));
      float h = length(q) - uR;
      if (h < 0.0) return vec2(1e4);
      od += vec2(exp(-h / uHr), exp(-h / uHm)) * ds;
    }
    return od;
  }
  vec3 transmit(vec2 od){ return exp(-(uRay * od.x + uMie * 1.1 * od.y)); }
  // ---- procedural detail below the texture resolution (faded by the pixel footprint)
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // fbm around 0.5; scale = feature size of the first octave (km), px = pixel footprint (km)
  float detail(vec3 p, float scale, float px, int oct){
    float a = 0.5, s = 0.0, f = 1.0 / scale;
    for (int i = 0; i < 6; i++){
      if (i >= oct) break;
      float fade = clamp(1.6 - px * f * 3.0, 0.0, 1.0);
      s += a * fade * (vnoise(p * f) - 0.5);
      f *= 2.63; a *= 0.56;
    }
    return 0.5 + s;
  }

  void main(){
    vec3 ro = uCam;
    vec3 rd = normalize(vL - uCam);
    vec2 ta = sphere(ro, rd, uRa);
    vec2 tp = sphere(ro, rd, uR);
    bool hitP = tp.x > 0.0 && tp.x < 1e8;
    float t0 = max(ta.x, 0.0);
    float t1 = hitP ? tp.x : ta.y;
    if (t1 <= t0) discard;
    // ---- in-scattering along the view ray
    const int N = 14;
    float ds = (t1 - t0) / float(N);
    vec2 odV = vec2(0.0);
    vec3 sumR = vec3(0.0), sumM = vec3(0.0);
    for (int i = 0; i < N; i++){
      vec3 p = ro + rd * (t0 + ds * (float(i) + 0.5));
      float h = length(p) - uR;
      vec2 d = vec2(exp(-h / uHr), exp(-h / uHm)) * ds;
      odV += d;
      vec2 odS = sunDepth(p);
      vec3 T = transmit(odV + odS);
      sumR += T * d.x; sumM += T * d.y;
    }
    float mu = dot(rd, uSun);
    float pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
    float g = 0.76;
    float pm = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    vec3 inscat = uSunI * (sumR * uRay * pr + sumM * uMie * pm);
    vec3 Tview = transmit(odV);
    vec3 col = inscat;
    float alpha = clamp(max(max(inscat.r, inscat.g), inscat.b) * 1.5, 0.0, 1.0);
    if (hitP){
      vec3 p = ro + rd * tp.x;
      vec3 n = normalize(p);
      vec2 uv = lonlatUV(n);
      vec3 alb = samp(tDay, uv).rgb;
      vec4 aux = samp(tAux, uv);
      float px = max(length(fwidth(p)), 0.01);
      // surface texture: fields, ridges, soil and vegetation patches the 10 km/texel map cannot hold
      float land = 1.0 - aux.g;
      float dn = detail(p, 45.0, px, 6);
      float dn2 = detail(p * 1.7 + 13.0, 9.0, px, 4);
      alb *= mix(1.0, 0.72 + 0.56 * dn, land);
      alb = mix(alb, alb * vec3(1.08, 0.98, 0.86), land * smoothstep(0.55, 0.75, dn2) * 0.6);
      alb *= mix(1.0, 0.9 + 0.2 * dn, aux.g);
      // clouds: erode the soft map edges into cellular structure, add popcorn cumulus over open ocean
      float cn = detail(p + 71.0, 60.0, px, 6);
      float edge = 4.0 * aux.r * (1.0 - aux.r);
      float cloud = clamp(aux.r * 1.15 + (cn - 0.5) * 1.6 * (0.35 + edge), 0.0, 1.0);
      float cu = smoothstep(0.63, 0.74, detail(p * 2.0 + 5.0, 14.0, px, 5)) * (1.0 - aux.r) * 0.55;
      cloud = max(cloud, cu * smoothstep(0.2, 0.9, aux.g + 0.3));
      cloud = smoothstep(0.08, 0.9, cloud);
      // cloud shadow: sample the cloud deck a little toward the sun along the surface
      vec3 st = uSun - n * dot(uSun, n);
      float shadow = 1.0 - 0.6 * samp(tAux, lonlatUV(normalize(n + st * 0.0016))).r;
      float ndl = dot(n, uSun);
      vec3 sunT = transmit(sunDepth(p + n * 0.05));           // reddened sunlight at the terminator
      vec3 sunL = sunT * uSunL;                                  // irradiance / π, matches the near-field sun light
      float lit = max(ndl, 0.0);
      vec3 ground = alb * lit * shadow;
      // ocean glint (Blinn-Phong + broad sheen), weakened under clouds
      vec3 v = -rd; vec3 hv = normalize(v + uSun);
      float water = aux.g * (1.0 - cloud);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
      float spec = (pow(max(dot(n, hv), 0.0), 220.0) * 6.0 + pow(max(dot(n, hv), 0.0), 18.0) * 0.12) * (0.3 + fres) * step(0.0, ndl);
      vec3 surf = ground * (1.0 - cloud) + vec3(0.92, 0.93, 0.95) * cloud * (0.15 + 0.85 * lit);
      surf = surf * sunL + vec3(spec * water) * sunL;
      // skylight on the day side (blue fill)
      surf += alb * vec3(0.10, 0.16, 0.28) * smoothstep(-0.15, 0.35, ndl) * 0.25 * uSunL;
      // city lights on the night side (dimmed by clouds)
      float night = 1.0 - smoothstep(-0.12, 0.06, ndl);
      surf += vec3(1.0, 0.68, 0.36) * pow(aux.b, 1.4) * night * (1.0 - 0.75 * cloud) * uLights;
      col = surf * Tview + inscat;
      alpha = 1.0;
    }
    col *= uExposure;
    gl_FragColor = vec4(col, alpha);
  }`;

export class Globe {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly radius: number;

  constructor(o: GlobeOptions) {
    this.radius = o.radius;
    const ra = o.radius + o.atmosphere;
    o.aux.colorSpace = THREE.NoColorSpace;
    for (const t of [o.day, o.aux]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        tDay: { value: o.day },
        tAux: { value: o.aux },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uCam: { value: new THREE.Vector3(0, 0, ra * 3) },
        uRot: { value: new THREE.Matrix3() },
        uR: { value: o.radius },
        uRa: { value: ra },
        uHr: { value: o.hr ?? 8 },
        uHm: { value: o.hm ?? 1.2 },
        uRay: { value: o.rayleigh ?? new THREE.Vector3(5.8e-3, 13.5e-3, 33.1e-3) },
        uMie: { value: o.mie ?? 2.2e-3 },
        uSunI: { value: 11 },
        uSunL: { value: 1.0 },
        uLights: { value: 0.9 },
        uExposure: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(ra, 96, 48), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.userData.owned = true;
  }

  /**
   * @param center planet centre relative to the far camera (km), camera at the origin
   * @param sun unit sun direction (planet frame = world frame here)
   * @param spin rotation angle of the body-fixed frame about +Y (rad)
   */
  update(center: THREE.Vector3, sun: THREE.Vector3, spin: number) {
    this.mesh.position.copy(center);
    const u = this.material.uniforms;
    (u.uCam.value as THREE.Vector3).copy(center).negate();
    (u.uSun.value as THREE.Vector3).copy(sun).normalize();
    // inertial → body-fixed = rotation about +Y by −spin
    const c = Math.cos(spin), s = Math.sin(spin);
    (u.uRot.value as THREE.Matrix3).set(c, 0, -s, 0, 1, 0, s, 0, c);
  }
}

/** Procedural star field + faint Milky Way band, drawn first in the far layer (infinitely distant). */
export class Starfield {
  readonly group = new THREE.Group();

  constructor(count = 14000, seed = 7) {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // galactic north pole (equatorial RA 192.86°, Dec 27.13°) in the planet frame (+Y north)
    const ra = THREE.MathUtils.degToRad(192.86), de = THREE.MathUtils.degToRad(27.13);
    const gp = new THREE.Vector3(Math.cos(de) * Math.cos(ra), Math.sin(de), -Math.cos(de) * Math.sin(ra)).normalize();
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      // concentrate faint stars toward the galactic plane
      for (let k = 0; k < 6; k++) {
        v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
        if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) continue;
        v.normalize();
        if (Math.abs(v.dot(gp)) < 0.25 + rnd() * 0.75 || i % 3 === 0) break;
      }
      pos.set([v.x * 1e5, v.y * 1e5, v.z * 1e5], i * 3);
      const m = Math.pow(rnd(), 9); // magnitude distribution: few bright, many faint
      const t = rnd();
      const c = t < 0.15 ? [1.0, 0.72, 0.5] : t < 0.35 ? [1.0, 0.9, 0.78] : t < 0.8 ? [0.95, 0.97, 1.0] : [0.72, 0.82, 1.0];
      const b = 0.25 + m * 3.5;
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
      size[i] = 1.2 + m * 3.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 }, uVis: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute float size; varying vec3 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uScale; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; uniform float uVis;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; float a = exp(-r * 3.5); gl_FragColor = vec4(vC * a * uVis, 1.0); }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 0;
    pts.userData.owned = true;
    this.group.add(pts);
    // Milky Way: soft noisy band on a background sphere
    const mw = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPole: { value: gp }, uVis: { value: 1 } },
      vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vD; uniform vec3 uPole; uniform float uVis;
        float h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          float b = dot(vD, uPole);
          float band = exp(-b * b * 28.0);
          float n = n3(vD * 6.0) * 0.5 + n3(vD * 13.0) * 0.3 + n3(vD * 29.0) * 0.2;
          float dust = smoothstep(0.45, 0.75, n3(vD * 9.0 + 3.1)) * exp(-b * b * 300.0);
          vec3 c = vec3(0.55, 0.58, 0.7) * band * (0.35 + 0.9 * n) * (1.0 - 0.7 * dust);
          gl_FragColor = vec4(c * 0.05 * uVis, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2e5, 48, 24), mw);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    sky.userData.owned = true;
    this.group.add(sky);
  }

  setVisibility(v: number) {
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (m?.uniforms?.uVis) m.uniforms.uVis.value = v;
    });
  }
}

/** The Sun as seen from space: a small hot disc plus a soft corona sprite (bloom does the rest). */
export class SunDisc {
  readonly mesh: THREE.Mesh;
  constructor() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: /* glsl */ `varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        varying vec2 vU;
        void main(){ float r = length(vU); float disc = smoothstep(0.042, 0.034, r); float halo = exp(-r * 9.0) * 0.6 + exp(-r * 3.0) * 0.08;
          vec3 c = vec3(1.0, 0.97, 0.92) * (disc * 60.0 + halo * 3.0); gl_FragColor = vec4(c, 1.0); }`,
    });
    // sized for a distance of 50 000 km: the disc (r ≈ 0.038 of the half-quad) subtends ~0.28°
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(13000, 13000), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.userData.owned = true;
  }
  update(dir: THREE.Vector3) {
    this.mesh.position.copy(dir).normalize().multiplyScalar(50000);
  }
}
