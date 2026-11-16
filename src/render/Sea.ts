import * as THREE from 'three';

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
varying vec3 vW;
varying float vDist;
float h2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float n2( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h2( i ), h2( i + vec2( 1, 0 ) ), u.x ), mix( h2( i + vec2( 0, 1 ) ), h2( i + vec2( 1, 1 ) ), u.x ), u.y ); }
// slope of a sum of travelling waves (wind chop on shallow water), fading with distance to avoid aliasing
vec2 waves( vec2 p, float t, float fade ) {
  vec2 g = vec2( 0.0 );
  vec2 dir[ 5 ]; dir[ 0 ] = vec2( 0.8, 0.6 ); dir[ 1 ] = vec2( 0.3, 0.95 ); dir[ 2 ] = vec2( 0.95, -0.3 ); dir[ 3 ] = vec2( -0.5, 0.86 ); dir[ 4 ] = vec2( 0.7, 0.2 );
  float L[ 5 ]; L[ 0 ] = 6.3; L[ 1 ] = 3.1; L[ 2 ] = 1.7; L[ 3 ] = 0.9; L[ 4 ] = 0.45;
  for ( int i = 0; i < 5; i++ ) {
    float k = 6.2831 / L[ i ];
    float c = sqrt( 9.8 * 1.3 / k );   // deep-water dispersion at 1.3 g (the shortest waves: shallow is negligible)
    float a = 0.035 * L[ i ] / 6.0;
    float ph = k * dot( dir[ i ], p ) - k * c * t;
    float f = i >= 3 ? fade : 1.0;
    g += dir[ i ] * ( a * k * cos( ph ) ) * f;
  }
  g += ( vec2( n2( p * 2.3 + t * 0.7 ), n2( p * 2.3 - t * 0.6 + 7.0 ) ) - 0.5 ) * 0.08 * fade;
  return g;
}
void main() {
  float fade = 1.0 - smoothstep( 30.0, 400.0, vDist );
  vec2 g = waves( vW.xz, uTime, fade );
  vec3 N = normalize( vec3( -g.x, 1.0, -g.y ) );
  vec3 V = normalize( uCam - vW );
  float cosT = max( dot( N, V ), 0.0 );
  float F = 0.02 + 0.98 * pow( 1.0 - cosT, 5.0 );
  vec3 R = reflect( -V, N );
  vec3 sky = mix( uHorizon, uZenith, pow( clamp( R.y, 0.0, 1.0 ), 0.45 ) );
  float spec = pow( max( dot( R, uSunDir ), 0.0 ), 900.0 ) * 60.0 + pow( max( dot( R, uSunDir ), 0.0 ), 60.0 ) * 0.6;
  vec3 col = sky * F + uSunCol * spec * step( 0.0, uSunDir.y );
  // shallow water: the floor shows through, more at steep angles and close by
  float alpha = clamp( F + 0.18 + 0.5 * smoothstep( 20.0, 2000.0, vDist ), 0.0, 1.0 );
  col += uDeep * ( 1.0 - F ) * 0.35;
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
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
        uZenith: { value: new THREE.Color(0.3, 0.38, 0.46) }, uHorizon: { value: new THREE.Color(0.62, 0.66, 0.68) },
        uDeep: { value: new THREE.Color(0.05, 0.08, 0.09) },
      },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  setSun(dir: THREE.Vector3, col: THREE.Color) {
    (this.mat.uniforms.uSunDir.value as THREE.Vector3).copy(dir);
    (this.mat.uniforms.uSunCol.value as THREE.Color).copy(col);
    // sky colours follow the light: a bright overcast-blue by day, dark by night
    const k = Math.max(0, Math.min(1, dir.y * 3 + 0.3));
    (this.mat.uniforms.uZenith.value as THREE.Color).setRGB(0.3 * k, 0.38 * k, 0.46 * k).multiply(col).multiplyScalar(1.2);
    (this.mat.uniforms.uHorizon.value as THREE.Color).setRGB(0.62 * k, 0.66 * k, 0.7 * k).multiply(col).multiplyScalar(1.2);
  }

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
