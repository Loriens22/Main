import * as THREE from 'three';
import { W } from './patch';

/*
 * Miller's tidal wave: a ridge of water about 1.2 km high and longer than the horizon, sweeping across the knee-deep
 * sea. (In the film's science, the planet is held almost tidally locked by Gargantua and rocks slightly; the sea
 * sloshes with the rocking into kilometre-high waves once an hour or so.) From the surface it first shows above the
 * horizon more than 100 km out and looks like a distant mountain range.
 *
 * The shape is fixed (a long gentle back, a steep concave front, a crest that varies along its length); it is moved
 * each frame and bent down with the curve of the planet in the vertex shader. Shading: Fresnel reflection of the
 * actual sky (the fog colours the sky model measures), light through the thin crest, foam where the front steepens
 * and breaks, streaks running down the face.
 */

const VERT = /* glsl */ `
uniform float uR;
uniform float uTime;
attribute float aFoam;
varying vec3 vW;
varying vec3 vN;
varying float vFoam;
varying float vH;
void main() {
  vec4 w = modelMatrix * vec4( position, 1.0 );
  w.y -= ( w.x * w.x + w.z * w.z ) / ( 2.0 * uR );
  vW = w.xyz; vH = position.y; vFoam = aFoam;
  vN = normalize( mat3( modelMatrix ) * normal );
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uFogH, uFogZ, uSunColor, uSunDir;
uniform float uHeight;
varying vec3 vW;
varying vec3 vN;
varying float vFoam;
varying float vH;
float h2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float n2( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h2( i ), h2( i + vec2( 1, 0 ) ), u.x ), mix( h2( i + vec2( 0, 1 ) ), h2( i + vec2( 1, 1 ) ), u.x ), u.y ); }
float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i++ ) { s += a * n2( p ); p *= 2.07; a *= 0.5; } return s; }
void main() {
  vec3 V = normalize( cameraPosition - vW );
  float dist = length( cameraPosition - vW );
  // surface detail: ripples and streaks running down the face, fading with distance
  float fade = 1.0 - smoothstep( 800.0, 12000.0, dist );
  vec2 q = vec2( vW.x + vW.z, vW.y * 3.0 + uTime * 25.0 ) * 0.02;
  float st = fbm( q ) - 0.5;
  vec3 N0 = gl_FrontFacing ? vN : -vN;               // seen from behind the crest or from under the water
  vec3 N = normalize( N0 + vec3( st * 0.25, 0.0, ( fbm( q.yx + 7.0 ) - 0.5 ) * 0.25 ) * fade );
  float cosT = max( dot( N, V ), 0.0 );
  float F = 0.02 + 0.98 * pow( 1.0 - cosT, 5.0 );
  vec3 R = reflect( -V, N );
  vec3 sky = mix( uFogH, uFogZ, smoothstep( 0.0, 0.6, R.y ) );
  float spec = gl_FrontFacing ? pow( max( dot( R, uSunDir ), 0.0 ), 400.0 ) * 30.0 : 0.0;
  // the body of the water: dark blue-grey, lit through where the crest is thin (forward scattering toward the eye)
  float thin = smoothstep( 0.7, 1.0, vH / uHeight );
  float through = pow( max( dot( -V, uSunDir ), 0.0 ), 3.0 ) * thin;
  vec3 body = vec3( 0.018, 0.034, 0.042 ) * ( 0.5 + 0.8 * max( dot( N, uSunDir ), 0.0 ) ) * uSunColor + vec3( 0.03, 0.11, 0.1 ) * through * uSunColor;
  // streaks of water sheeting down the face
  body *= 0.75 + 0.5 * fbm( vec2( ( vW.x - vW.z ) * 0.004, vW.y * 0.0015 + uTime * 0.02 ) );
  vec3 col = mix( body, sky, F ) + uSunColor * spec;
  // foam: breaking water at the foot and the lip, streaked
  float foam = clamp( vFoam * ( 0.55 + 0.9 * fbm( q * 3.0 + 3.0 ) ), 0.0, 1.0 );
  vec3 white = ( uSunColor * max( dot( N, uSunDir ), 0.2 ) * 0.7 + uFogZ * 0.6 );
  col = mix( col, white, foam );
  // aerial perspective: the far wave dissolves into the horizon haze
  float haze = 1.0 - exp( -dist / 160000.0 );
  col = mix( col, uFogH, haze );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** water height above the sea (m) at u along the propagation from the crest line, v along it (mesh frame) */
export function waveProfile(u: number, v: number) {
  const H = 1200, Lv = 90000;
  // crest height varies along its length; the front is a steep concave wall, the back a long slope
  const hv = H * (0.82 + 0.18 * Math.sin(v / 7300 + 1.3) * Math.cos(v / 11900));
  const shift = 350 * Math.sin(v / 9000);       // the crest line wanders a little
  const x = u - shift;
  // the steep concave front and the long back meet in a rounded crest (a smooth minimum ~150 m wide, not a cusp)
  const F = x >= 520 ? 0 : hv * Math.pow(1 - x / 520, 2.2);
  const B = hv * Math.exp(-((x / 3200) ** 2)) * (1 - 0.05 * Math.sin(x / 140));
  const k = 170;
  const m = Math.min(F, B);
  let h = m - k * Math.log(Math.exp((m - F) / k) + Math.exp((m - B) / k));
  h = Math.max(0, h);
  // the ends of the ridge sink back into the sea
  return h * Math.max(0, Math.min(1, (Lv - Math.abs(v)) / 15000));
}

export class MillerWave {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  /** propagation direction (zone frame, horizontal) */
  dir = new THREE.Vector3(1, 0, 0);
  /** crest position along dir (m, signed, relative to the site) */
  s = -120000;
  static readonly HEIGHT = 1200;
  /** speed of the crest (m/s) and the time between waves (s, local) */
  static readonly SPEED = 40;
  static readonly PERIOD = 3600;

  constructor(radius: number) {
    const H = MillerWave.HEIGHT;
    // u: along the propagation (front > 0), v: along the crest
    const us: number[] = [];
    for (let u = -9000; u < -1200; u += 260) us.push(u);
    for (let u = -1200; u < 300; u += 30) us.push(u);
    for (let u = 300; u <= 900; u += 60) us.push(u);
    const nv = 220, Lv = 90000;
    const pos: number[] = [], foam: number[] = [], idx: number[] = [];
    const prof = waveProfile;
    for (let j = 0; j <= nv; j++) {
      const v = -Lv + (2 * Lv * j) / nv;
      for (const u of us) {
        const h = prof(u, v);
        pos.push(u, h, v);
        const slope = Math.abs(prof(u + 15, v) - prof(u - 15, v)) / 30;
        const shift = 350 * Math.sin(v / 9000);
        const x = u - shift;
        // whitewater where the front is steep and breaking, at its foot, and spray along the lip
        // whitewater only where the water breaks: along the lip (top of the steep front) and in a band at its foot
        const lip = x > -60 && x < 140 && h > 0.8 * MillerWave.HEIGHT ? 0.9 : 0;
        const foot = x > 380 && x < 560 ? 0.75 * Math.sin(((x - 380) / 180) * Math.PI) : 0;
        foam.push(Math.min(1, lip + foot + Math.max(0, slope - 4.5) * 0.15));
      }
    }
    const nu = us.length;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      idx.push(a, c, b, b, c, d);   // wound so the normals point out of the water
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: {
        uR: { value: radius }, uTime: { value: 0 }, uHeight: { value: H },
        uFogH: W.uFogH, uFogZ: W.uFogZ, uSunColor: W.uSunColor, uSunDir: W.uSunDir,
      },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }

  /** Place the wave for local time t (s): the crest crosses the site once per period. */
  update(t: number, dt: number) {
    const P = MillerWave.PERIOD, c = MillerWave.SPEED;
    const phase = ((t % P) + P) % P;
    // arrival at the site three quarters of the way through each period
    this.s = (phase - 0.75 * P) * c;
    this.mesh.position.set(this.dir.x * this.s, 0, this.dir.z * this.s);
    this.mesh.rotation.y = Math.atan2(-this.dir.z, this.dir.x);
    this.mat.uniforms.uTime.value += dt;
  }

  /**
   * The water at a point of the zone (x, z, near the site): its height above the sea, the slope of the surface along
   * the direction of travel (dh/du, negative on the front face), and where the point is relative to the crest (u > 0:
   * not yet reached).
   */
  at(x: number, z: number) {
    const d = this.dir;
    const u = x * d.x + z * d.z - this.s, v = -x * d.z + z * d.x;
    const h = waveProfile(u, v);
    const slope = (waveProfile(u + 4, v) - waveProfile(u - 4, v)) / 8;
    return { h, slope, u };
  }

  /** seconds until the crest reaches a point d metres along the direction of travel (negative once past) */
  eta(d = 0) { return (d - this.s) / MillerWave.SPEED; }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); }
}
