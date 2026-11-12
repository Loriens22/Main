import * as THREE from 'three';
import { W } from './patch';
import { Renderer } from './Renderer';
import { clamp, damp, lerp } from '../core/math';

/** Physical-ish description of an atmosphere. Lengths in metres, coefficients in 1/m. */
export interface AtmosphereParams {
  planetRadius: number;
  atmosphereHeight: number;
  betaR: [number, number, number];
  betaM: number;
  /** aerosol/dust scattering and absorption (the blight-era haze on Earth, haze on the Lazarus worlds) */
  betaD: [number, number, number];
  betaDAbs: [number, number, number];
  HR: number;
  HM: number;
  HD: number;
  g: number;
  sunE: number;
  sunTint: [number, number, number];
  /** multiple-scattering fill colour factor */
  ambient: [number, number, number];
  cloudCoverage: number;
  cloudDensity: number;
  cloudAltitude: number;
  cirrus: number;
  /** angular radius of the light source disc (radians) */
  sunRadius: number;
  fogDensity: number;
  fogFalloff: number;
}

export const EARTH_ATMOSPHERE: AtmosphereParams = {
  planetRadius: 6371e3, atmosphereHeight: 80e3,
  betaR: [5.8e-6, 13.5e-6, 33.1e-6], betaM: 2.6e-5,
  betaD: [2.2e-5, 1.9e-5, 1.1e-5], betaDAbs: [0.2e-5, 0.5e-5, 1.5e-5],
  HR: 8000, HM: 1200, HD: 2600, g: 0.78, sunE: 20, sunTint: [1.0, 0.97, 0.9], ambient: [0.9, 0.95, 0.85],
  cloudCoverage: 0.35, cloudDensity: 0.7, cloudAltitude: 3200, cirrus: 0.6, sunRadius: 0.00465,
  fogDensity: 0.00011, fogFalloff: 0.0009,
};

const SKY_COMMON = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform float uSunE;
uniform vec3 uSunTint;
uniform vec3 uBetaR;
uniform float uBetaM;
uniform vec3 uBetaD;
uniform vec3 uBetaDAbs;
uniform vec4 uScale;   // HR, HM, HD, g
uniform vec3 uPlanet;  // Rp, Ha, camera altitude
uniform vec4 uCloud;   // coverage, density, altitude, cirrus
uniform vec3 uCloudOff; // xz offset (wind + camera), time
uniform vec3 uAmbient;
uniform float uSunRadius;
uniform float uStars;
const float PI = 3.14159265359;

// Intersections are written in terms of altitude to avoid catastrophic cancellation at planet scale.
vec2 hitShell( float camR, float mu, float cShell ) {
  // ray from radius camR with cosine mu to local up; cShell = camR^2 - R^2 (precomputed as a product)
  float b = camR * mu;
  float d = b * b - cShell;
  if ( d < 0.0 ) return vec2( 1e12, -1e12 );
  d = sqrt( d );
  return vec2( -b - d, -b + d );
}
float hash21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash21( i ), hash21( i + vec2( 1, 0 ) ), u.x ), mix( hash21( i + vec2( 0, 1 ) ), hash21( i + vec2( 1, 1 ) ), u.x ), u.y );
}
float fbm( vec2 p ) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2( 0.8, -0.6, 0.6, 0.8 );
  for ( int i = 0; i < 5; i++ ) { s += a * vnoise( p ); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

struct Atmo { vec3 L; vec3 T; float tEnd; bool ground; };

Atmo atmosphere( vec3 rd ) {
  float Rp = uPlanet.x, Ha = uPlanet.y, h0 = max( uPlanet.z, 1.0 );
  float camR = Rp + h0;
  float mu = rd.y;
  vec2 ta = hitShell( camR, mu, ( h0 - Ha ) * ( 2.0 * Rp + h0 + Ha ) );
  vec2 tg = hitShell( camR, mu, h0 * ( 2.0 * Rp + h0 ) );
  Atmo o; o.L = vec3( 0.0 ); o.T = vec3( 1.0 ); o.ground = tg.x > 0.0 && tg.y > 0.0; o.tEnd = 0.0;
  float t0 = max( ta.x, 0.0 ), t1 = ta.y;
  if ( o.ground ) t1 = min( t1, tg.x );
  if ( t1 <= t0 ) return o;
  o.tEnd = t1;
  vec3 ro = vec3( 0.0, camR, 0.0 );
  vec3 betaDExt = uBetaD + uBetaDAbs;
  float odR = 0.0, odM = 0.0, odD = 0.0;
  vec3 sR = vec3( 0.0 ), sM = vec3( 0.0 ), sD = vec3( 0.0 );
  float prevS = 0.0;
  for ( int i = 0; i < N_VIEW; i++ ) {
    // quadratic distribution: denser sampling near the camera where density changes fastest
    float s1 = float( i + 1 ) / float( N_VIEW );
    float sm = ( prevS + s1 ) * 0.5;
    float t = t0 + ( t1 - t0 ) * sm * sm;
    float dt = ( t1 - t0 ) * ( s1 * s1 - prevS * prevS );
    prevS = s1;
    vec3 p = ro + rd * t;
    float pr = length( p );
    float h = max( pr - Rp, 0.0 );
    float dR = exp( -h / uScale.x ) * dt, dM = exp( -h / uScale.y ) * dt, dD = exp( -h / uScale.z ) * dt;
    odR += dR; odM += dM; odD += dD;
    float muL = dot( p, uSunDir ) / pr;
    // planet shadow (terminator / night side)
    vec2 tgl = hitShell( pr, muL, h * ( 2.0 * Rp + h ) );
    if ( tgl.x > 0.0 && tgl.y > 0.0 ) continue;
    vec2 tl = hitShell( pr, muL, ( h - Ha ) * ( 2.0 * Rp + h + Ha ) );
    float dl = tl.y / float( N_LIGHT );
    float lR = 0.0, lM = 0.0, lD = 0.0;
    for ( int j = 0; j < N_LIGHT; j++ ) {
      vec3 q = p + uSunDir * ( ( float( j ) + 0.5 ) * dl );
      float hq = max( length( q ) - Rp, 0.0 );
      lR += exp( -hq / uScale.x ); lM += exp( -hq / uScale.y ); lD += exp( -hq / uScale.z );
    }
    vec3 tau = uBetaR * ( odR + lR * dl ) + uBetaM * 1.1 * ( odM + lM * dl ) + betaDExt * ( odD + lD * dl );
    vec3 att = exp( -tau );
    sR += dR * att; sM += dM * att; sD += dD * att;
  }
  float c = dot( rd, uSunDir );
  float g = uScale.w;
  float pR = 3.0 / ( 16.0 * PI ) * ( 1.0 + c * c );
  float pM = 3.0 / ( 8.0 * PI ) * ( ( 1.0 - g * g ) * ( 1.0 + c * c ) ) / ( ( 2.0 + g * g ) * pow( 1.0 + g * g - 2.0 * g * c, 1.5 ) );
  float gd = 0.55;
  float pD = 3.0 / ( 8.0 * PI ) * ( ( 1.0 - gd * gd ) * ( 1.0 + c * c ) ) / ( ( 2.0 + gd * gd ) * pow( 1.0 + gd * gd - 2.0 * gd * c, 1.5 ) );
  o.T = exp( -( uBetaR * odR + uBetaM * 1.1 * odM + betaDExt * odD ) );
  vec3 single = sR * uBetaR * pR + sM * uBetaM * pM + sD * uBetaD * pD;
  // cheap multiple-scattering fill: isotropic, proportional to what the view ray has lost
  float sunUp = smoothstep( -0.12, 0.25, uSunDir.y );
  vec3 ms = ( vec3( 1.0 ) - o.T ) * uAmbient * ( 0.012 + 0.03 * sunUp ) * ( uBetaR * 4.0e4 + uBetaD * 1.6e4 + uBetaM * 6.0e3 );
  o.L = uSunE * uSunTint * ( single + ms );
  return o;
}

vec3 sunTransmittance() {
  float Rp = uPlanet.x, Ha = uPlanet.y, h0 = max( uPlanet.z, 1.0 );
  float camR = Rp + h0;
  vec2 tl = hitShell( camR, uSunDir.y, ( h0 - Ha ) * ( 2.0 * Rp + h0 + Ha ) );
  float dl = tl.y / 8.0;
  float lR = 0.0, lM = 0.0, lD = 0.0;
  for ( int j = 0; j < 8; j++ ) {
    vec3 q = vec3( 0.0, camR, 0.0 ) + uSunDir * ( ( float( j ) + 0.5 ) * dl );
    float hq = max( length( q ) - Rp, 0.0 );
    lR += exp( -hq / uScale.x ); lM += exp( -hq / uScale.y ); lD += exp( -hq / uScale.z );
  }
  return exp( -( uBetaR * lR + uBetaM * 1.1 * lM + ( uBetaD + uBetaDAbs ) * lD ) * dl );
}

vec4 cloudLayer( vec3 rd, float alt, float scale, float coverage, float density, vec2 stretch, vec3 sunCol, vec3 skyCol ) {
  float Rp = uPlanet.x, h0 = max( uPlanet.z, 1.0 );
  float camR = Rp + h0;
  bool above = h0 > alt;
  vec2 t = hitShell( camR, rd.y, ( h0 - alt ) * ( 2.0 * Rp + h0 + alt ) );
  float tc = above ? t.x : t.y;
  if ( tc <= 0.0 || tc > 6.0e5 ) return vec4( 0.0 );
  vec3 p = rd * tc;
  vec2 uv = ( p.xz + uCloudOff.xy ) / scale * stretch;
  float n = fbm( uv ) * 0.65 + fbm( uv * 3.1 + 7.0 ) * 0.35;
  float d = smoothstep( 1.0 - coverage, 1.0 - coverage + 0.38, n ) * density;
  if ( d <= 0.001 ) return vec4( 0.0 );
  vec2 so = normalize( uSunDir.xz + 1e-4 ) * 0.16 * stretch;
  float n2 = fbm( uv + so ) * 0.65 + fbm( ( uv + so ) * 3.1 + 7.0 ) * 0.35;
  float shade = exp( -smoothstep( 1.0 - coverage, 1.0 - coverage + 0.38, n2 ) * 2.4 * density );
  float fwd = pow( max( dot( rd, uSunDir ), 0.0 ), 6.0 );
  vec3 col = sunCol * ( 0.28 + 0.72 * shade ) * ( 0.75 + 1.4 * fwd ) + skyCol * 0.55;
  float fade = exp( -tc / 9.0e4 );
  return vec4( col, d * fade );
}

vec3 skyColor( vec3 rd, bool withSun ) {
  Atmo a = atmosphere( rd );
  vec3 col = a.L;
  vec3 sunT = sunTransmittance();
  vec3 sunCol = uSunE * uSunTint * sunT * 0.11 * smoothstep( -0.06, 0.08, uSunDir.y );
  vec3 skyAmb = atmosphere( vec3( 0.0, 1.0, 0.0 ) ).L;
  if ( !a.ground ) {
    if ( uStars > 0.001 ) {
      vec3 sd = rd * 220.0;
      vec3 cell = floor( sd );
      float hs = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
      float st = step( 0.9965, hs ) * smoothstep( 0.6, 0.0, length( fract( sd ) - 0.5 ) );
      col += st * uStars * a.T * ( 0.4 + 2.0 * fract( hs * 91.7 ) );
    }
    if ( withSun ) {
      float c = dot( rd, uSunDir );
      float ang = acos( clamp( c, -1.0, 1.0 ) );
      float disc = smoothstep( uSunRadius, uSunRadius * 0.82, ang );
      float limb = 1.0 - 0.45 * pow( clamp( ang / uSunRadius, 0.0, 1.0 ), 2.0 );
      col += disc * limb * uSunTint * a.T * uSunE * 9.0;
      col += uSunTint * a.T * uSunE * 0.02 * pow( max( c, 0.0 ), 900.0 );
    }
    if ( uCloud.w > 0.001 ) {
      vec4 ci = cloudLayer( rd, 9000.0, 26000.0, 0.42 + 0.3 * uCloud.w, 0.5 * uCloud.w, vec2( 1.0, 0.28 ), sunCol, skyAmb );
      col = mix( col, ci.rgb * a.T + a.L * ( 1.0 - a.T ), ci.a );
    }
    if ( uCloud.x > 0.001 ) {
      vec4 cl = cloudLayer( rd, uCloud.z, 5200.0, uCloud.x, uCloud.y, vec2( 1.0 ), sunCol, skyAmb );
      // aerial perspective on the cloud deck: blend toward the in-scattered light with distance
      float tcl = clamp( 1.0 - exp( -3.2 * ( 1.0 - clamp( abs( rd.y ) * 6.0, 0.0, 1.0 ) ) ), 0.0, 1.0 );
      col = mix( col, mix( cl.rgb, a.L, tcl * 0.75 ), cl.a );
    }
  }
  return col;
}
`;

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4( position, 0.0 );
  gl_Position = projectionMatrix * vec4( p.xyz, 1.0 );
  gl_Position.z = gl_Position.w; // far plane
}
`;
const DOME_FRAG = /* glsl */ `
varying vec3 vDir;
void main() {
  vec3 rd = normalize( vDir );
  gl_FragColor = vec4( skyColor( rd, true ), 1.0 );
}
`;
const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;
const BAKE_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float lon = ( vUv.x - 0.5 ) * 2.0 * PI;
  float lat = ( vUv.y - 0.5 ) * PI;
  vec3 rd = vec3( cos( lat ) * cos( lon ), sin( lat ), cos( lat ) * sin( lon ) );
  vec3 c = skyColor( rd, false );
  // ground bounce for the lower hemisphere so IBL from below is not black
  if ( rd.y < 0.0 ) c = mix( c, uGroundColor * ( atmosphere( vec3( 0.0, 1.0, 0.0 ) ).L * 1.6 + sunTransmittance() * uSunE * uSunTint * 0.045 * max( uSunDir.y, 0.0 ) ), smoothstep( 0.0, -0.08, rd.y ) );
  gl_FragColor = vec4( min( c, vec3( 60.0 ) ), 1.0 );
}
`;

/**
 * Sky dome + sun light + image-based lighting for any body with an atmosphere.
 * The same scattering model renders the dome, bakes the environment map, and feeds the fog colours,
 * so distant terrain always dissolves into exactly the sky behind it.
 */
export class Sky {
  params: AtmosphereParams;
  dome: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private bakeMat: THREE.ShaderMaterial;
  private uniforms: Record<string, THREE.IUniform>;
  sun = new THREE.DirectionalLight(0xffffff, 3);
  fill = new THREE.HemisphereLight(0xffffff, 0x444444, 0);
  sunDir = new THREE.Vector3(0.3, 0.7, 0.4).normalize();
  /** linear RGB of direct sunlight after atmospheric extinction */
  sunColor = new THREE.Color(1, 1, 1);
  altitude = 2;
  cloudOffset = new THREE.Vector2();
  wind = new THREE.Vector2(6, 2.5);
  private bakeRT: THREE.WebGLRenderTarget;
  private probeRT: THREE.WebGLRenderTarget;
  private bakeScene = new THREE.Scene();
  private bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private bakeTimer = 0;
  private dirty = true;
  private probe = new Float32Array(32 * 16 * 4);
  shadowRange = 70;
  shadowFocus = new THREE.Vector3();
  groundColor = new THREE.Color(0.32, 0.28, 0.2);
  envIntensity = 1.0;
  enabled = true;
  /** extra uniform darkening for storms: multiplies sun */
  sunOcclusion = 1.0;

  constructor(private r: Renderer, quality: number, params: AtmosphereParams = EARTH_ATMOSPHERE) {
    this.params = { ...params };
    const p = this.params;
    this.uniforms = {
      uSunDir: { value: this.sunDir },
      uSunE: { value: p.sunE },
      uSunTint: { value: new THREE.Vector3(...p.sunTint) },
      uBetaR: { value: new THREE.Vector3(...p.betaR) },
      uBetaM: { value: p.betaM },
      uBetaD: { value: new THREE.Vector3(...p.betaD) },
      uBetaDAbs: { value: new THREE.Vector3(...p.betaDAbs) },
      uScale: { value: new THREE.Vector4(p.HR, p.HM, p.HD, p.g) },
      uPlanet: { value: new THREE.Vector3(p.planetRadius, p.atmosphereHeight, 2) },
      uCloud: { value: new THREE.Vector4(p.cloudCoverage, p.cloudDensity, p.cloudAltitude, p.cirrus) },
      uCloudOff: { value: new THREE.Vector3() },
      uAmbient: { value: new THREE.Vector3(...p.ambient) },
      uSunRadius: { value: p.sunRadius },
      uStars: { value: 0 },
      uGroundColor: { value: this.groundColor },
    };
    const defs = (q: number) => ({ N_VIEW: [8, 12, 18][q], N_LIGHT: [3, 4, 6][q] });
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: DOME_VERT, fragmentShader: SKY_COMMON + DOME_FRAG,
      defines: defs(quality), side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    });
    this.bakeMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: BAKE_VERT, fragmentShader: SKY_COMMON + 'uniform vec3 uGroundColor;\n' + BAKE_FRAG,
      defines: { N_VIEW: 8, N_LIGHT: 3 }, depthTest: false, depthWrite: false,
    });
    this.dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.dome.matrixAutoUpdate = false;
    r.spaceScene.add(this.dome);
    this.bakeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat));
    const envSize = 256;
    this.bakeRT = new THREE.WebGLRenderTarget(envSize, envSize / 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.bakeRT.texture.mapping = THREE.EquirectangularReflectionMapping;
    this.probeRT = new THREE.WebGLRenderTarget(32, 16, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.pmrem = new THREE.PMREMGenerator(r.gl);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    r.scene.add(this.sun, this.sun.target, this.fill);
    this.setShadowQuality(2);
  }

  setShadowQuality(q: number) {
    const size = [512, 1024, 2048, 4096][clamp(q, 0, 3)];
    this.sun.castShadow = q > 0;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
  }

  setParams(p: Partial<AtmosphereParams>) {
    Object.assign(this.params, p);
    this.dirty = true;
  }

  setSunDirection(dir: THREE.Vector3) {
    if (this.sunDir.distanceToSquared(dir) > 1e-7) this.dirty = true;
    this.sunDir.copy(dir).normalize();
  }

  /** Request an environment re-bake on the next opportunity. */
  invalidate() { this.dirty = true; }

  private syncUniforms() {
    const p = this.params, u = this.uniforms;
    u.uSunE.value = p.sunE;
    (u.uSunTint.value as THREE.Vector3).set(...p.sunTint);
    (u.uBetaR.value as THREE.Vector3).set(...p.betaR);
    u.uBetaM.value = p.betaM;
    (u.uBetaD.value as THREE.Vector3).set(...p.betaD);
    (u.uBetaDAbs.value as THREE.Vector3).set(...p.betaDAbs);
    (u.uScale.value as THREE.Vector4).set(p.HR, p.HM, p.HD, p.g);
    (u.uPlanet.value as THREE.Vector3).set(p.planetRadius, p.atmosphereHeight, Math.max(1, this.altitude));
    (u.uCloud.value as THREE.Vector4).set(p.cloudCoverage, p.cloudDensity, p.cloudAltitude, p.cirrus);
    (u.uAmbient.value as THREE.Vector3).set(...p.ambient);
    u.uSunRadius.value = p.sunRadius;
    u.uStars.value = clamp((-this.sunDir.y - 0.02) * 6, 0, 1) * (1 - p.cloudCoverage * 0.8);
  }

  /** CPU mirror of the shader's sun transmittance (for the directional light colour). */
  private computeSunColor() {
    const p = this.params;
    const Rp = p.planetRadius, Ha = p.atmosphereHeight, h0 = Math.max(1, this.altitude);
    const camR = Rp + h0, mu = this.sunDir.y;
    const b = camR * mu, c = (h0 - Ha) * (2 * Rp + h0 + Ha);
    const disc = b * b - c;
    const tEnd = disc > 0 ? -b + Math.sqrt(disc) : 0;
    const N = 24, dl = tEnd / N;
    let lR = 0, lM = 0, lD = 0;
    for (let j = 0; j < N; j++) {
      const t = (j + 0.5) * dl;
      const h = Math.max(0, Math.sqrt(camR * camR + 2 * camR * mu * t + t * t) - Rp);
      lR += Math.exp(-h / p.HR); lM += Math.exp(-h / p.HM); lD += Math.exp(-h / p.HD);
    }
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const tau = (p.betaR[i] * lR + p.betaM * 1.1 * lM + (p.betaD[i] + p.betaDAbs[i]) * lD) * dl;
      out[i] = Math.exp(-tau) * p.sunTint[i];
    }
    // below-horizon falloff (planet shadow)
    const horizon = -Math.sqrt(Math.max(0, 1 - (Rp / camR) * (Rp / camR)));
    const vis = clamp((mu - horizon + 0.01) / 0.03, 0, 1);
    const overcast = 1 - clamp(p.cloudCoverage * p.cloudDensity * 1.25 - 0.25, 0, 0.92);
    this.sunColor.setRGB(out[0] * vis, out[1] * vis, out[2] * vis);
    return overcast;
  }

  update(dt: number, cameraPos: THREE.Vector3, altitude: number) {
    if (!this.enabled) return;
    if (Math.abs(altitude - this.altitude) > Math.max(2, this.altitude * 0.02)) this.dirty = true;
    this.altitude = altitude;
    this.cloudOffset.x += this.wind.x * dt;
    this.cloudOffset.y += this.wind.y * dt;
    (this.uniforms.uCloudOff.value as THREE.Vector3).set(this.cloudOffset.x + cameraPos.x, this.cloudOffset.y + cameraPos.z, performance.now() / 1000);
    this.syncUniforms();
    const overcast = this.computeSunColor();
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = Math.PI * (this.params.sunE / 20) * overcast * this.sunOcclusion;
    // shadow frustum follows the focus point, snapped to shadow texels to avoid crawling
    const range = this.shadowRange;
    const cam = this.sun.shadow.camera;
    if (cam.right !== range) {
      cam.left = -range; cam.right = range; cam.top = range; cam.bottom = -range;
      cam.near = 1; cam.far = 600;
      cam.updateProjectionMatrix();
    }
    const texel = (range * 2) / this.sun.shadow.mapSize.x;
    const f = this.shadowFocus;
    const lightDir = this.sunDir.y > 0.02 ? this.sunDir : _v.set(this.sunDir.x, 0.02, this.sunDir.z).normalize();
    // build light-space basis for snapping
    _right.crossVectors(_up, lightDir).normalize();
    _upL.crossVectors(lightDir, _right).normalize();
    const sx = Math.round(f.dot(_right) / texel) * texel, sy = Math.round(f.dot(_upL) / texel) * texel, sz = f.dot(lightDir);
    _t.set(0, 0, 0).addScaledVector(_right, sx).addScaledVector(_upL, sy).addScaledVector(lightDir, sz);
    this.sun.target.position.copy(_t);
    this.sun.position.copy(_t).addScaledVector(lightDir, 300);
    this.sun.target.updateMatrixWorld();
    W.uSunDir.value.copy(this.sunDir);

    this.bakeTimer -= dt;
    if (this.dirty && this.bakeTimer <= 0) this.bake();
  }

  /** Bake the low-res sky panorama -> PMREM environment, and read back fog colours. */
  bake() {
    this.dirty = false;
    this.bakeTimer = 0.75;
    const gl = this.r.gl;
    const prevRT = gl.getRenderTarget();
    gl.setRenderTarget(this.bakeRT);
    gl.render(this.bakeScene, this.bakeCam);
    gl.setRenderTarget(this.probeRT);
    gl.render(this.bakeScene, this.bakeCam);
    gl.readRenderTargetPixels(this.probeRT, 0, 0, 32, 16, this.probe);
    gl.setRenderTarget(prevRT);
    const old = this.envRT;
    this.envRT = this.pmrem.fromEquirectangular(this.bakeRT.texture);
    this.r.scene.environment = this.envRT.texture;
    this.r.scene.environmentIntensity = this.envIntensity;
    old?.dispose();
    // fog colours: horizon ring (row 8 = +5.6 deg), zenith cap (rows 13..15), glow toward the sun azimuth
    const px = (x: number, y: number, o: number[]) => {
      const i = (y * 32 + ((x % 32) + 32) % 32) * 4;
      o[0] += this.probe[i]; o[1] += this.probe[i + 1]; o[2] += this.probe[i + 2];
    };
    const hz = [0, 0, 0], zn = [0, 0, 0], sg = [0, 0, 0];
    for (let x = 0; x < 32; x++) { px(x, 8, hz); px(x, 9, hz); }
    for (let x = 0; x < 32; x++) for (let y = 13; y < 16; y++) px(x, y, zn);
    const sunLon = Math.atan2(this.sunDir.z, this.sunDir.x);
    const sxp = Math.round((sunLon / (2 * Math.PI) + 0.5) * 32 - 0.5);
    for (let d = -1; d <= 1; d++) { px(sxp + d, 8, sg); px(sxp + d, 9, sg); }
    for (let i = 0; i < 3; i++) { hz[i] /= 64; zn[i] /= 96; sg[i] = Math.max(0, sg[i] / 6 - hz[i]); }
    W.uFogH.value.setRGB(hz[0], hz[1], hz[2]);
    W.uFogZ.value.setRGB(lerp(hz[0], zn[0], 0.6), lerp(hz[1], zn[1], 0.6), lerp(hz[2], zn[2], 0.6));
    W.uFogSun.value.setRGB(sg[0], sg[1], sg[2]);
  }

  setFog(density: number, falloff: number, baseHeight = 0) {
    W.uFogP.value.set(density, falloff, baseHeight, 6);
  }

  setVisible(v: boolean) {
    this.enabled = v;
    this.dome.visible = v;
    this.sun.visible = v;
  }

  dispose() {
    this.r.spaceScene.remove(this.dome);
    this.r.scene.remove(this.sun, this.sun.target, this.fill);
    this.bakeRT.dispose();
    this.probeRT.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.mat.dispose();
    this.bakeMat.dispose();
  }
}

const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _right = new THREE.Vector3(), _upL = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
void damp;
