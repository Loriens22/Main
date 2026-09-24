// Sky, sun/moon lighting, time of day and image-based lighting.
//
// The sky shader implements the Preetham analytic daylight model (as in
// three.js' Sky example) extended with procedural clouds, stars, moon,
// aurora, nebulae and planets so that portal dimensions can reuse it in a
// stylised "gradient" mode. A CPU port of the same model derives the sun
// colour, fog colour and ambient colour so that lighting, fog and sky always
// agree. The sky is periodically re-rendered into a PMREM environment map
// which lights every PBR material (IBL = our global-illumination
// approximation together with GTAO and hemisphere bounce).

import * as THREE from 'three';
import { globalUniforms } from './shaderPatches.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform float uMieG;
uniform float uMode;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunGlow;
uniform float uSunSize;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uCloudCover;
uniform float uCloudOpacity;
uniform vec3 uCloudTint;
uniform float uCloudScale;
uniform vec2 uCloudWind;
uniform float uStars;
uniform float uMoon;
uniform float uAurora;
uniform float uNebula;
uniform vec3 uNebulaA;
uniform vec3 uNebulaB;
uniform float uPlanet;
uniform vec3 uPlanetDir;
uniform vec3 uPlanetA;
uniform vec3 uPlanetB;
uniform float uTime;
uniform float uExposure;
uniform float uStorm;
uniform vec3 uFogColorSky;
uniform float uHorizonBlend;
uniform float uSunDisk;
varying vec3 vDir;

const float PI = 3.141592653589793;

float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float hash13( vec3 p3 ) { p3 = fract( p3 * 0.1031 ); p3 += dot( p3, p3.zyx + 31.32 ); return fract( ( p3.x + p3.y ) * p3.z ); }
vec3 hash33( vec3 p3 ) { p3 = fract( p3 * vec3( 0.1031, 0.1030, 0.0973 ) ); p3 += dot( p3, p3.yxz + 33.33 ); return fract( ( p3.xxy + p3.yxx ) * p3.zyx ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash12( i ), hash12( i + vec2( 1, 0 ) ), u.x ), mix( hash12( i + vec2( 0, 1 ) ), hash12( i + vec2( 1, 1 ) ), u.x ), u.y );
}
float fbm( vec2 p ) {
  float s = 0.0, a = 0.5;
  mat2 m = mat2( 1.6, 1.2, -1.2, 1.6 );
  for ( int i = 0; i < 5; i ++ ) { s += a * vnoise( p ); p = m * p; a *= 0.5; }
  return s;
}
float vnoise3( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p ); vec3 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash13( i ), b = hash13( i + vec3( 1, 0, 0 ) ), c = hash13( i + vec3( 0, 1, 0 ) ), d = hash13( i + vec3( 1, 1, 0 ) );
  float e = hash13( i + vec3( 0, 0, 1 ) ), f1 = hash13( i + vec3( 1, 0, 1 ) ), g = hash13( i + vec3( 0, 1, 1 ) ), h = hash13( i + vec3( 1, 1, 1 ) );
  return mix( mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ), mix( mix( e, f1, u.x ), mix( g, h, u.x ), u.y ), u.z );
}

vec3 preetham( vec3 dir ) {
  float zenithAngle = acos( max( 0.0, dir.y ) );
  float inv = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / PI ), -1.253 ) );
  float sR = 8.4E3 * inv;
  float sM = 1.25E3 * inv;
  vec3 Fex = exp( -( uBetaR * sR + uBetaM * sM ) );
  float cosTheta = dot( dir, uSunDir );
  float rPhase = 0.05968310365946075 * ( 1.0 + pow( cosTheta * 0.5 + 0.5, 2.0 ) );
  float g2 = uMieG * uMieG;
  float mPhase = 0.07957747154594767 * ( ( 1.0 - g2 ) / pow( 1.0 - 2.0 * uMieG * cosTheta + g2, 1.5 ) );
  vec3 betaTheta = uBetaR * rPhase + uBetaM * mPhase;
  vec3 ratio = betaTheta / ( uBetaR + uBetaM );
  vec3 Lin = pow( uSunE * ratio * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ), pow( uSunE * ratio * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - uSunDir.y, 5.0 ), 0.0, 1.0 ) );
  vec3 L0 = vec3( 0.1 ) * Fex;
  float sundisk = smoothstep( 0.99996, 0.99999, cosTheta ) * uSunDisk;
  L0 += ( uSunE * 19000.0 * Fex ) * sundisk;
  vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  return pow( texColor, vec3( 1.0 / 2.4 ) );
}

vec3 gradientSky( vec3 dir ) {
  float y = dir.y;
  vec3 col = y > 0.0 ? mix( uHorizon, uZenith, pow( clamp( y, 0.0, 1.0 ), 0.55 ) ) : mix( uHorizon, uGround, pow( clamp( -y * 3.0, 0.0, 1.0 ), 0.6 ) );
  float c = max( dot( dir, uSunDir ), 0.0 );
  col += uSunGlow * ( pow( c, 8.0 ) * 0.5 + pow( c, 64.0 ) * 1.5 );
  float disk = smoothstep( 1.0 - uSunSize, 1.0 - uSunSize * 0.7, c ) * uSunDisk;
  col += uSunColor * disk * 20.0;
  return col;
}

void main() {
  vec3 dir = normalize( vDir );
  vec3 col = uMode < 0.5 ? preetham( dir ) : gradientSky( dir );

  // Night sky base.
  col += vec3( 0.0025, 0.0045, 0.011 ) * uStars * smoothstep( -0.2, 0.3, dir.y );

  // Nebula / galaxy band.
  if ( uNebula > 0.0 ) {
    float n = fbm( dir.xz * 2.5 / ( abs( dir.y ) + 0.6 ) + dir.y * 3.0 );
    float n2 = fbm( dir.zx * 5.0 + 11.0 );
    float band = exp( -pow( dot( dir, normalize( vec3( 0.3, 0.8, 0.5 ) ) ) * 2.6, 2.0 ) );
    col += mix( uNebulaA, uNebulaB, n2 ) * pow( n, 2.5 ) * ( 0.4 + band ) * uNebula;
  }

  // Stars.
  if ( uStars > 0.0 ) {
    vec3 sd = dir * 300.0;
    vec3 cell = floor( sd );
    vec3 f = fract( sd ) - 0.5;
    float h = hash13( cell );
    if ( h > 0.996 ) {
      vec3 o = hash33( cell ) - 0.5;
      float s = smoothstep( 0.28, 0.0, length( f - o * 0.5 ) );
      float tw = 0.6 + 0.4 * sin( uTime * ( 2.0 + h * 6.0 ) + h * 400.0 );
      vec3 sc = mix( vec3( 1.0, 0.8, 0.6 ), vec3( 0.7, 0.8, 1.0 ), fract( h * 97.0 ) );
      col += sc * s * tw * uStars * 2.5 * smoothstep( -0.05, 0.15, dir.y );
    }
    // Milky way.
    float mw = exp( -pow( dot( dir, normalize( vec3( 0.4, 0.3, -0.87 ) ) ) * 4.0, 2.0 ) );
    col += vec3( 0.03, 0.035, 0.05 ) * mw * fbm( dir.xy * 12.0 + dir.z * 5.0 ) * uStars * smoothstep( 0.0, 0.2, dir.y );
  }

  // Moon.
  if ( uMoon > 0.0 ) {
    float mc = dot( dir, uMoonDir );
    float disk = smoothstep( 0.99955, 0.9997, mc );
    vec3 local = dir - uMoonDir;
    float crater = vnoise( local.xy * 900.0 ) * 0.25 + vnoise( local.yz * 2400.0 ) * 0.12;
    col += vec3( 1.2, 1.18, 1.1 ) * disk * ( 1.0 - crater ) * uMoon * 3.0;
    col += vec3( 0.08, 0.1, 0.14 ) * pow( max( mc, 0.0 ), 400.0 ) * uMoon;
  }

  // Planet (space dimensions).
  if ( uPlanet > 0.0 ) {
    float pc = dot( dir, uPlanetDir );
    float ang = acos( clamp( pc, -1.0, 1.0 ) );
    float R = 0.28;
    if ( ang < R ) {
      vec3 side = normalize( cross( uPlanetDir, vec3( 0.0, 1.0, 0.0 ) ) );
      vec3 up2 = cross( side, uPlanetDir );
      vec2 pp = vec2( dot( dir, side ), dot( dir, up2 ) ) / sin( R );
      float z = sqrt( max( 0.0, 1.0 - dot( pp, pp ) ) );
      vec3 nrm = normalize( pp.x * side + pp.y * up2 - z * uPlanetDir );
      float bands = fbm( vec2( pp.y * 9.0 + fbm( pp * 5.0 ) * 1.5, 0.0 ) );
      vec3 pcol = mix( uPlanetA, uPlanetB, bands );
      float lit = max( dot( -nrm, uSunDir ), 0.0 ) * 0.9 + 0.08;
      col = mix( col, pcol * lit, uPlanet * smoothstep( R, R * 0.98, ang ) );
    }
    // Ring.
    vec3 ringN = normalize( vec3( 0.2, 1.0, 0.35 ) );
    vec3 rel = dir - uPlanetDir;
    float rd = length( rel - ringN * dot( rel, ringN ) ) / 0.28;
    float ringMask = smoothstep( 1.3, 1.35, rd ) * smoothstep( 2.1, 2.0, rd ) * step( abs( dot( rel, ringN ) ), 0.02 );
    col += uPlanetB * ringMask * uPlanet * ( 0.6 + 0.4 * sin( rd * 60.0 ) );
  }

  // Aurora borealis: stacked noise curtains.
  if ( uAurora > 0.0 && dir.y > 0.0 ) {
    vec3 acc = vec3( 0.0 );
    for ( int i = 0; i < 12; i ++ ) {
      float fi = float( i );
      float hgt = 1.0 + fi * 0.08;
      vec2 p = dir.xz / ( dir.y + 0.12 ) * hgt * 0.35;
      float curtain = fbm( vec2( p.x * 1.2 + uTime * 0.03, p.y * 0.4 ) + fbm( p * 0.6 + uTime * 0.02 ) * 1.5 );
      float band = smoothstep( 0.45, 0.75, curtain ) * smoothstep( 1.0, 0.7, curtain );
      vec3 ac = mix( vec3( 0.1, 1.0, 0.45 ), vec3( 0.6, 0.2, 1.0 ), fi / 12.0 );
      acc += ac * band * ( 1.0 - fi / 12.0 ) * 0.25;
    }
    col += acc * uAurora * smoothstep( 0.0, 0.25, dir.y );
  }

  // Clouds: 2D fbm layer projected onto a plane, lit toward the sun.
  if ( uCloudCover > 0.0 && dir.y > 0.0 ) {
    float t = 1.0 / ( dir.y + 0.03 );
    vec2 cp = dir.xz * t * uCloudScale + uCloudWind * uTime;
    float base = fbm( cp );
    float detail = fbm( cp * 3.1 + 7.0 );
    float n = base * 0.75 + detail * 0.25;
    float thr = 1.0 - uCloudCover;
    float dens = smoothstep( thr * 0.9, thr * 0.9 + 0.3, n );
    float nSun = fbm( cp + uSunDir.xz * 0.12 ) * 0.75 + detail * 0.25;
    float densSun = smoothstep( thr * 0.9, thr * 0.9 + 0.3, nSun );
    float light = clamp( 1.0 - ( densSun - dens * 0.4 ) * 1.4, 0.15, 1.0 );
    float mu = max( dot( dir, uSunDir ), 0.0 );
    float silver = pow( mu, 12.0 ) * ( 1.0 - dens ) * 3.0;
    vec3 lit = uSunColor * ( light * 2.6 + silver * 2.0 ) + uAmbient * 1.2;
    vec3 shade = uAmbient * 1.0 + uSunColor * 0.25;
    vec3 ccol = mix( shade, lit, light ) * uCloudTint * ( 1.0 - uStorm * 0.75 );
    float fade = smoothstep( 0.0, 0.15, dir.y );
    col = mix( col, ccol, clamp( dens * fade * uCloudOpacity, 0.0, 1.0 ) );
  }

  // Blend into fog colour at the horizon so the terrain silhouette matches.
  col = mix( col, uFogColorSky, uHorizonBlend * exp( -max( dir.y, 0.0 ) * 14.0 ) * smoothstep( -0.25, 0.0, dir.y ) );
  if ( dir.y < 0.0 ) col = mix( col, uFogColorSky, clamp( -dir.y * 6.0, 0.0, 1.0 ) * uHorizonBlend );

  gl_FragColor = vec4( max( col, 0.0 ) * uExposure, 1.0 );
}`;

// ---- CPU port of the Preetham model (for sun colour, fog & ambient) ----
const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];

function sunIntensity(zc) {
  zc = Math.max(-1, Math.min(1, zc));
  return 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(zc)) / 1.5)));
}

export class PreethamCPU {
  constructor() { this.betaR = [0, 0, 0]; this.betaM = [0, 0, 0]; this.sunE = 0; this.sun = [0, 1, 0]; this.g = 0.8; }
  set(sunDir, turbidity, rayleigh, mieCoef, g) {
    this.sun = [sunDir.x, sunDir.y, sunDir.z];
    this.sunE = sunIntensity(sunDir.y);
    this.g = g;
    const c = 0.2 * turbidity * 10e-18;
    for (let i = 0; i < 3; i++) {
      this.betaR[i] = TOTAL_RAYLEIGH[i] * rayleigh;
      this.betaM[i] = 0.434 * c * MIE_CONST[i] * mieCoef;
    }
  }
  transmittance(dy) {
    const za = Math.acos(Math.max(0, dy));
    const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(93.885 - (za * 180) / Math.PI, -1.253));
    const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
    return [0, 1, 2].map((i) => Math.exp(-(this.betaR[i] * sR + this.betaM[i] * sM)));
  }
  color(dx, dy, dz) {
    const Fex = this.transmittance(dy);
    const s = this.sun;
    const cosT = dx * s[0] + dy * s[1] + dz * s[2];
    const rPhase = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
    const g = this.g, g2 = g * g;
    const mPhase = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
    const mixF = Math.min(1, Math.max(0, Math.pow(1 - s[1], 5)));
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const bt = this.betaR[i] * rPhase + this.betaM[i] * mPhase;
      const ratio = bt / (this.betaR[i] + this.betaM[i]);
      let Lin = Math.pow(Math.max(0, this.sunE * ratio * (1 - Fex[i])), 1.5);
      Lin *= 1 + (Math.pow(Math.max(0, this.sunE * ratio * Fex[i]), 0.5) - 1) * mixF;
      const L0 = 0.1 * Fex[i];
      const tex = (Lin + L0) * 0.04 + [0, 0.0003, 0.00075][i];
      out[i] = Math.pow(tex, 1 / 2.4);
    }
    return out;
  }
}

function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Sky',
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uBetaR: { value: new THREE.Vector3() },
      uBetaM: { value: new THREE.Vector3() },
      uSunE: { value: 1000 },
      uMieG: { value: 0.8 },
      uMode: { value: 0 },
      uZenith: { value: new THREE.Color(0.1, 0.25, 0.6) },
      uHorizon: { value: new THREE.Color(0.6, 0.7, 0.85) },
      uGround: { value: new THREE.Color(0.2, 0.2, 0.22) },
      uSunGlow: { value: new THREE.Color(1, 0.8, 0.5) },
      uSunSize: { value: 0.0006 },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uAmbient: { value: new THREE.Color(0.35, 0.45, 0.6) },
      uCloudCover: { value: 0.45 },
      uCloudOpacity: { value: 0.95 },
      uCloudTint: { value: new THREE.Color(1, 1, 1) },
      uCloudScale: { value: 0.55 },
      uCloudWind: { value: new THREE.Vector2(0.006, 0.002) },
      uStars: { value: 0 },
      uMoon: { value: 0 },
      uAurora: { value: 0 },
      uNebula: { value: 0 },
      uNebulaA: { value: new THREE.Color(0.5, 0.1, 0.8) },
      uNebulaB: { value: new THREE.Color(0.1, 0.6, 0.9) },
      uPlanet: { value: 0 },
      uPlanetDir: { value: new THREE.Vector3(0.5, 0.4, -0.7).normalize() },
      uPlanetA: { value: new THREE.Color(0.8, 0.6, 0.4) },
      uPlanetB: { value: new THREE.Color(0.9, 0.85, 0.7) },
      uTime: { value: 0 },
      uExposure: { value: 1 },
      uStorm: { value: 0 },
      uFogColorSky: { value: new THREE.Color(0.7, 0.75, 0.8) },
      uHorizonBlend: { value: 0.6 },
      uSunDisk: { value: 1 },
    },
  });
}

// Per-world atmosphere: sky dome, sun light, env map and fog parameters.
export class Atmosphere {
  constructor(renderer, scene, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.dynamic = opts.dynamic !== false; // overworld has a day/night cycle
    this.mode = opts.mode || 'physical';
    this.timeOfDay = opts.timeOfDay ?? 10.2; // hours
    this.turbidity = opts.turbidity ?? 2.4;
    this.rayleigh = opts.rayleigh ?? 1.2;
    this.mieCoef = opts.mieCoef ?? 0.005;
    this.mieG = opts.mieG ?? 0.8;
    this.fogDensity = opts.fogDensity ?? 0.00075;
    this.fogHeightFalloff = opts.fogHeightFalloff ?? 0.0085;
    this.fogBase = opts.fogBase ?? 0;
    this.exposure = 1;
    this.envIntensity = opts.envIntensity ?? 1;
    this.sunIntensityMul = opts.sunIntensity ?? 1;
    this.weatherFog = 0;
    this.storm = 0;
    this.custom = opts; // gradient palette etc.
    // The Preetham model outputs large HDR values; scale the sky so that sunlit
    // ground and sky have a realistic luminance ratio (otherwise IBL ambient
    // overpowers the sun and the image looks flat and washed out).
    this.skyExposure = opts.skyExposure ?? (this.mode === 'physical' ? 0.3 : 1);

    this.material = makeSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.sky.scale.setScalar(4500);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.sky.userData.noRaycast = true;
    scene.add(this.sky);

    // Environment capture scene: sky + a ground hemisphere for bounce light.
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(this.sky.geometry, this.material);
    this.envSky.scale.setScalar(900);
    this.envScene.add(this.envSky);
    this.groundMat = new THREE.MeshBasicMaterial({ color: 0x404030, side: THREE.BackSide, fog: false });
    const ground = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 12, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), this.groundMat);
    this.envScene.add(ground);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this._envTimer = 999;
    this._lastEnvSun = new THREE.Vector3(0, -2, 0);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 600;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x88aadd, 0x445533, 0.25);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xaabbcc, this.fogDensity);

    this.cpu = new PreethamCPU();
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.sunColor = new THREE.Color(1, 1, 1);
    this.fogColor = new THREE.Color();
    this.fogSunColor = new THREE.Color();
    this.ambient = new THREE.Color();
    this.night = 0;
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.shadowRange = 60;
    this.shadowMapSize = 2048;
    if (this.mode === 'gradient') this.material.uniforms.uMode.value = 1;
    this.applyCustom(opts);
    this.update(0, null, true);
  }

  applyCustom(o) {
    const u = this.material.uniforms;
    const setC = (k, v) => { if (v !== undefined) u[k].value.set(v); };
    setC('uZenith', o.zenith); setC('uHorizon', o.horizon); setC('uGround', o.ground);
    setC('uSunGlow', o.sunGlow); setC('uCloudTint', o.cloudTint);
    setC('uNebulaA', o.nebulaA); setC('uNebulaB', o.nebulaB);
    setC('uPlanetA', o.planetA); setC('uPlanetB', o.planetB);
    if (o.cloudCover !== undefined) u.uCloudCover.value = o.cloudCover;
    if (o.stars !== undefined) u.uStars.value = o.stars;
    if (o.aurora !== undefined) u.uAurora.value = o.aurora;
    if (o.nebula !== undefined) u.uNebula.value = o.nebula;
    if (o.planet !== undefined) u.uPlanet.value = o.planet;
    if (o.moon !== undefined) u.uMoon.value = o.moon;
    if (o.sunSize !== undefined) u.uSunSize.value = o.sunSize;
    if (o.sunDisk !== undefined) u.uSunDisk.value = o.sunDisk;
    if (o.skyExposure !== undefined) u.uExposure.value = o.skyExposure;
    if (o.sunDir) this.fixedSunDir = new THREE.Vector3().fromArray(o.sunDir).normalize();
    if (o.sunColor) this.fixedSunColor = new THREE.Color(o.sunColor);
    if (o.fogColor) this.fixedFogColor = new THREE.Color(o.fogColor);
    if (o.ambient) this.fixedAmbient = new THREE.Color(o.ambient);
    if (o.exposure !== undefined) this.fixedExposure = o.exposure;
    if (o.groundColor) this.groundMat.color.set(o.groundColor);
  }

  setTime(hours) { this.timeOfDay = ((hours % 24) + 24) % 24; this._envTimer = 999; }

  computeSunDir(hours, out) {
    // Sunrise at 06:00 in the east (+x), culminating ~62 degrees high in the
    // south-west at noon, setting at 18:00 in the west.
    const angle = ((hours - 6) / 12) * Math.PI;
    const elev = Math.asin(Math.sin(angle) * Math.sin(THREE.MathUtils.degToRad(62)));
    const az = angle * 0.92 + 0.12;
    out.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), -Math.cos(elev) * Math.sin(az)).normalize();
    return out;
  }

  // Advance time and recompute lighting. camera: to follow shadows.
  update(dt, camera, force = false, dayLengthMin = 30, cycle = true) {
    const u = this.material.uniforms;
    if (this.dynamic && cycle && dt > 0) {
      this.timeOfDay = (this.timeOfDay + (dt / (dayLengthMin * 60)) * 24) % 24;
    }
    if (this.fixedSunDir) this.sunDir.copy(this.fixedSunDir);
    else this.computeSunDir(this.timeOfDay, this.sunDir);
    this.moonDir.set(-this.sunDir.x * 0.9, -this.sunDir.y, -this.sunDir.z * 0.9 + 0.3).normalize();

    const sy = this.sunDir.y;
    this.night = THREE.MathUtils.smoothstep(-sy, -0.02, 0.18); // 1 at night
    const day = 1 - this.night;

    if (this.mode === 'physical') {
      this.cpu.set(this.sunDir, this.turbidity + this.storm * 6, this.rayleigh, this.mieCoef * (1 + this.weatherFog * 3), this.mieG);
      u.uBetaR.value.fromArray(this.cpu.betaR);
      u.uBetaM.value.fromArray(this.cpu.betaM);
      u.uSunE.value = this.cpu.sunE;
      u.uMieG.value = this.mieG;
      // Sun colour from atmospheric transmittance along the sun direction.
      const T = this.cpu.transmittance(Math.max(sy, 0.0));
      const m = Math.max(T[0], T[1], T[2]) || 1;
      this.sunColor.setRGB(T[0] / m, T[1] / m, T[2] / m);
      // Fog colour: average of the horizon ring (slightly above horizon).
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const c = this.cpu.color(Math.cos(a) * 0.995, 0.08, Math.sin(a) * 0.995);
        r += c[0]; g += c[1]; b += c[2];
      }
      const se = this.skyExposure;
      this.fogColor.setRGB((r / 8) * se, (g / 8) * se, (b / 8) * se);
      const sh = new THREE.Vector3(this.sunDir.x, 0, this.sunDir.z).normalize();
      const cs = this.cpu.color(sh.x * 0.99, 0.06, sh.z * 0.99);
      this.fogSunColor.setRGB(cs[0] * se, cs[1] * se, cs[2] * se);
      const z = this.cpu.color(0, 1, 0);
      this.ambient.setRGB(z[0] * se, z[1] * se, z[2] * se);
      u.uExposure.value = se;
      // Night palette.
      const nightFog = new THREE.Color(0.012, 0.017, 0.03);
      this.fogColor.lerp(nightFog, this.night * 0.85);
      this.fogSunColor.lerp(nightFog, this.night * 0.85);
      this.ambient.lerp(new THREE.Color(0.01, 0.015, 0.03), this.night * 0.9);
      // Storm darkening.
      if (this.storm > 0) {
        const gray = new THREE.Color(0.35, 0.37, 0.4).multiplyScalar(day * 0.7 + 0.05);
        this.fogColor.lerp(gray, this.storm * 0.8);
        this.fogSunColor.lerp(gray, this.storm * 0.8);
      }
      u.uStars.value = this.night * (1 - this.storm);
      u.uMoon.value = this.night * (1 - this.storm * 0.9);
      u.uCloudCover.value = THREE.MathUtils.lerp(this.custom.cloudCover ?? 0.42, 0.92, this.storm);
      u.uStorm.value = this.storm;
    } else {
      this.sunColor.copy(this.fixedSunColor || new THREE.Color(1, 0.95, 0.85));
      this.fogColor.copy(this.fixedFogColor || u.uHorizon.value);
      this.fogSunColor.copy(this.fogColor).lerp(this.sunColor, 0.25);
      this.ambient.copy(this.fixedAmbient || u.uZenith.value);
      this.night = this.custom.night ?? 0;
    }
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);
    // Cloud lighting inputs are pre-exposure (the shader multiplies by uExposure).
    const invSE = 1 / Math.max(0.05, u.uExposure.value);
    u.uSunColor.value.copy(this.sunColor).multiplyScalar((this.mode === 'physical' ? Math.max(0.03, day) : 1) * 1.1 * (this.mode === 'physical' ? 1 / 0.3 * 0.3 : 1));
    u.uAmbient.value.copy(this.ambient).multiplyScalar(invSE);
    u.uFogColorSky.value.copy(this.fogColor);
    u.uHorizonBlend.value = THREE.MathUtils.clamp(this.fogDensity * 250 + this.weatherFog * 0.6, 0.2, 0.95);

    // Light: sun by day, moon by night.
    const useMoon = this.mode === 'physical' && sy < -0.03;
    this.lightDir.copy(useMoon ? this.moonDir : this.sunDir);
    let intensity;
    if (this.mode === 'physical') {
      if (useMoon) {
        intensity = 0.35 * THREE.MathUtils.smoothstep(this.moonDir.y, 0.0, 0.2) * (1 - this.storm * 0.8);
        this.sun.color.setRGB(0.55, 0.65, 1.0);
      } else {
        intensity = 3.4 * THREE.MathUtils.smoothstep(sy, -0.03, 0.12) * (1 - this.storm * 0.75);
        this.sun.color.copy(this.sunColor);
      }
    } else {
      intensity = this.custom.sunIntensity ?? 2.5;
      this.sun.color.copy(this.sunColor);
    }
    this.sun.intensity = intensity * this.sunIntensityMul;
    this.hemi.color.copy(this.ambient).multiplyScalar(1.4);
    this.hemi.groundColor.copy(this.groundMat.color).multiplyScalar(0.6 + day);
    this.hemi.intensity = this.mode === 'physical' ? 0.35 + this.night * 0.6 : (this.custom.hemi ?? 0.5);
    this.exposure = this.fixedExposure ?? (1.25 + this.night * 1.8 - this.storm * 0.1);

    // Ground bounce colour for the environment capture.
    if (this.mode === 'physical') {
      const gb = new THREE.Color(0.12, 0.13, 0.08).multiplyScalar(Math.max(0.02, day) * (0.5 + 1.5 * Math.max(0, sy)));
      this.groundMat.color.copy(gb);
    }

    // Fog.
    const fog = this.scene.fog;
    fog.color.copy(this.fogColor);
    fog.density = this.fogDensity * (1 + this.weatherFog * 5 + this.storm * 1.5);

    if (camera) {
      this.sky.position.copy(camera.position);
      this.updateShadowCamera(camera);
    }
    this._envTimer += dt;
  }

  // Keep the shadow frustum centred on the camera, snapped to texels to avoid shimmering.
  updateShadowCamera(camera) {
    const range = this.shadowRange;
    const cam = this.sun.shadow.camera;
    if (cam.right !== range) {
      cam.left = -range; cam.right = range; cam.top = range; cam.bottom = -range;
      cam.updateProjectionMatrix();
    }
    const center = camera.position.clone();
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    fwd.y = 0; if (fwd.lengthSq() > 0) fwd.normalize();
    center.addScaledVector(fwd, range * 0.35);
    // Snap in light space.
    const texel = (range * 2) / this.shadowMapSize;
    const lightRot = new THREE.Matrix4().lookAt(new THREE.Vector3(), this.lightDir.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = lightRot.clone().invert();
    const ls = center.clone().applyMatrix4(inv);
    ls.x = Math.round(ls.x / texel) * texel;
    ls.y = Math.round(ls.y / texel) * texel;
    center.copy(ls.applyMatrix4(lightRot));
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(this.lightDir, 250);
    this.sun.target.updateMatrixWorld();
  }

  // Re-render the environment map when the sun moved enough.
  maybeUpdateEnv(force = false) {
    const moved = this._lastEnvSun.angleTo(this.sunDir);
    if (!force && !(this._envTimer > 4 && moved > 0.004) && !(this._envTimer > 1.5 && moved > 0.05)) return false;
    this._envTimer = 0;
    this._lastEnvSun.copy(this.sunDir);
    const u = this.material.uniforms;
    const prevBlend = u.uHorizonBlend.value;
    u.uHorizonBlend.value = Math.min(prevBlend, 0.5);
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.5, 2000);
    u.uHorizonBlend.value = prevBlend;
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    return true;
  }

  // Push this world's lighting into the global shader uniforms (called before rendering it).
  applyGlobals() {
    globalUniforms.uFogSunDir.value.copy(this.sunDir);
    globalUniforms.uFogSunColor.value.copy(this.fogSunColor);
    globalUniforms.uFogHeightFalloff.value = this.fogHeightFalloff;
    globalUniforms.uFogBaseHeight.value = this.fogBase;
    this.scene.environmentIntensity = this.envIntensity * (this.mode === 'physical' ? (0.25 + 0.75 * (1 - this.night)) * (1 - this.storm * 0.4) : 1);
    this.material.uniforms.uTime.value = globalUniforms.uGTime.value;
  }

  dispose() {
    this.scene.remove(this.sky, this.sun, this.sun.target, this.hemi);
    this.material.dispose();
    this.sky.geometry.dispose();
    if (this.envRT) this.envRT.dispose();
    this.pmrem.dispose();
  }
}
