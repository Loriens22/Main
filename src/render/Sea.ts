import * as THREE from 'three';
import { W } from './patch';

const VERT = /* glsl */ `
uniform float uR;
uniform vec3 uCam;
varying vec3 vW;
varying float vDist;
void main() {
  vec4 w = modelMatrix * vec4( position, 1.0 );
  // the sea surface follows the curve of the planet (same drop as the terrain: d^2 / 2R from the site)
  w.y -= ( w.x * w.x + w.z * w.z ) / ( 2.0 * uR );
  vW = w.xyz;
  vDist = length( w.xyz - uCam );
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uDeep;
uniform vec3 uCam;
uniform vec4 uWater;
uniform vec3 uWaterCol;
varying vec3 vW;
varying float vDist;
float h2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float n2( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h2( i ), h2( i + vec2( 1, 0 ) ), u.x ), mix( h2( i + vec2( 0, 1 ) ), h2( i + vec2( 1, 1 ) ), u.x ), u.y ); }
// slope of the water surface: wind chop on shallow water. Nine trains from 7 m down to half a metre, spread about the
// wind in golden-angle steps so that no interference grid forms, with deep-water dispersion at 1.3 g (for the short
// chop the shallow depth hardly matters). Each fades out once its wavelength is under a couple of pixels (fp: metres
// per pixel), or the sum aliases into a moire grid at grazing angles. Value noise is only used to modulate the chop in
// gusts and for the finest roughness: used as a slope it shows its lattice as a checkerboard.
vec2 waves( vec2 p, float t, float fade, float fp ) {
  vec2 g = vec2( 0.0 );
  for ( int i = 0; i < 9; i++ ) {
    float fi = float( i );
    float L = 7.0 * pow( 0.72, fi );
    float ang = 0.6 + 1.1 * sin( fi * 2.399 + 0.3 );
    vec2 d = vec2( cos( ang ), sin( ang ) );
    float k = 6.2831 / L;
    float c = sqrt( 9.8 * 1.3 / k );
    float a = 0.026 * L / 6.0;
    float ph = k * dot( d, p ) - k * c * t + fi * 1.7;
    float f = ( 1.0 - smoothstep( 0.2, 0.5, fp / L ) ) * ( L < 1.2 ? fade : 1.0 );
    g += d * ( a * k * cos( ph ) ) * f;
  }
  mat2 rot = mat2( 0.8, -0.6, 0.6, 0.8 );
  float gust = 0.6 + 0.8 * n2( rot * p * 0.05 + vec2( t * 0.05, 0.0 ) );
  vec2 r = rot * p * 2.3;
  g += ( vec2( n2( r + t * 0.7 ), n2( r.yx - t * 0.6 + 7.0 ) ) - 0.5 ) * 0.05 * fade * ( 1.0 - smoothstep( 0.05, 0.15, fp ) );
  return g * gust;
}
void main() {
  float fade = 1.0 - smoothstep( 30.0, 400.0, vDist );
  vec2 dw = fwidth( vW.xz );
  vec2 g = waves( vW.xz, uTime, fade, max( dw.x, dw.y ) );
  vec3 N = normalize( vec3( -g.x, 1.0, -g.y ) );
  if ( !gl_FrontFacing ) {
    // seen from below: the sky through Snell's window (inside ~48.6 degrees of the vertical), beyond it the surface
    // mirrors the water itself (total internal reflection), all seen through the water between
    vec3 d = normalize( vW - uCam );
    float cosI = clamp( dot( d, N ), 0.0, 1.0 );
    float sinI = sqrt( 1.0 - cosI * cosI );
    float win = 1.0 - smoothstep( 0.70, 0.76, sinI );
    vec3 skyIn = mix( uHorizon, uZenith, cosI ) * 1.1 + uSunCol * pow( max( dot( refract( d, -N, 1.33 ), uSunDir ), 0.0 ), 200.0 ) * 4.0;
    float camDep = max( 0.0, uWater.y - uCam.y );
    vec3 wc = uWaterCol * exp( -camDep * uWater.w * vec3( 1.6, 0.95, 0.8 ) ) * ( 1.0 + 0.8 * pow( max( d.y, 0.0 ), 1.5 ) );
    vec3 col = mix( wc * 0.8, skyIn * ( 1.0 - pow( sinI / 0.75, 6.0 ) * 0.6 ), win );
    float a = 1.0 - exp( -uWater.z * vDist );
    col = mix( col * exp( -camDep * uWater.w * vec3( 1.6, 0.95, 0.8 ) ), wc, a );
    gl_FragColor = vec4( col, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  vec3 V = normalize( uCam - vW );
  float cosT = max( dot( N, V ), 0.0 );
  float F = 0.02 + 0.98 * pow( 1.0 - cosT, 5.0 );
  vec3 R = reflect( -V, N );
  vec3 sky = mix( uHorizon, uZenith, pow( clamp( R.y, 0.0, 1.0 ), 0.45 ) );
  float spec = pow( max( dot( R, uSunDir ), 0.0 ), 900.0 ) * 60.0 + pow( max( dot( R, uSunDir ), 0.0 ), 60.0 ) * 0.6;
  vec3 col = sky * F + uSunCol * spec * step( 0.0, uSunDir.y );
  // shallow water: the floor shows through, more at steep angles and close by
  float alpha = clamp( F + 0.32 + 0.5 * smoothstep( 15.0, 600.0, vDist ), 0.0, 1.0 );
  col += uDeep * ( 1.0 - F ) * uHorizon * 1.5;
  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The sea of Miller's planet: knee-deep water over the floor, curved with the planet, wind chop with 1.3 g
 * dispersion, Fresnel reflection of the sky and the light source, transparent to the floor at steep angles.
 */
export class SeaSurface {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;

  constructor(radius: number) {
    // rings: dense near the centre (the mesh follows the camera), sparse far out
    const g = new THREE.BufferGeometry();
    const pos: number[] = [], idx: number[] = [];
    const rings = 70, seg = 96;
    pos.push(0, 0, 0);
    for (let i = 1; i <= rings; i++) {
      const r = 2 * Math.pow(1.13, i) - 2;
      for (let j = 0; j < seg; j++) { const a = (j / seg) * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
    }
    for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
    for (let i = 1; i < rings; i++) {
      const a0 = 1 + (i - 1) * seg, a1 = 1 + i * seg;
      for (let j = 0; j < seg; j++) {
        const j1 = (j + 1) % seg;
        idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uR: { value: radius }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
        // reflections of the actual sky (the radiance the sky model measures for the fog) and of the light source
        uSunDir: W.uSunDir, uSunCol: W.uSunColor, uZenith: W.uFogZ, uHorizon: W.uFogH,
        uDeep: { value: new THREE.Color(0.05, 0.08, 0.09) },
        uWater: W.uWater, uWaterCol: W.uWaterCol,
      },
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** (kept for callers: the sky and light now come from the shared scene uniforms) */
  setSun(_dir: THREE.Vector3, _col: THREE.Color) {}

  update(dt: number, cam: THREE.Vector3) {
    this.mat.uniforms.uTime.value += dt;
    (this.mat.uniforms.uCam.value as THREE.Vector3).copy(cam);
    // follow the camera horizontally in whole metres (keeps the wave pattern fixed in the world)
    this.mesh.position.set(Math.round(cam.x), 0, Math.round(cam.z));
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
