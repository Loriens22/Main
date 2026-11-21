import * as THREE from 'three';
import type { V3 } from '../space/Kepler';
import { makeGalaxySky, STARS_GLSL } from './GalaxySky';

/*
 * Gargantua: per-pixel ray tracing in the Kerr metric (units G = c = M = 1), Boyer-Lindquist coordinates.
 *
 * Null geodesics follow from the Hamiltonian  2 rho^2 H = Delta p_r^2 + p_th^2 - P^2/Delta + (b/sin th - a sin th)^2
 * with P = r^2 + a^2 - a b, E = 1 and b = p_phi conserved:
 *   dr/dl = Delta p_r / rho^2,  dth/dl = p_th / rho^2,  dphi/dl = (a P / Delta + b / sin^2 th - a) / rho^2
 *   dp_r/dl = -(Delta' p_r^2 - (4 r P Delta - P^2 Delta') / Delta^2) / (2 rho^2)
 *   dp_th/dl = (b/sin th - a sin th) cos th (b / sin^2 th + a) / rho^2
 * Rays start at the camera with momenta from the zero-angular-momentum observer's frame (as in James, von
 * Tunzelmann, Franklin & Thorne 2015) and are traced backward in time. Each crossing of the equatorial plane between
 * the innermost stable circular orbit and the disk's outer edge adds the thin disk's light: Novikov-Thorne-like flux,
 * blackbody colour at the observed temperature g T, and intensity g^4 (gravitational redshift and Doppler beaming,
 * g = E_camera / E_emitter for the gas on prograde circular orbits). Rays that escape sample the galaxy sky in the
 * direction they came from; rays that reach the horizon are black.
 *
 * Spin: the story's a = 1 - 1e-14 (Miller's dilation uses the same value). The GPU holds it as 1.0 (single
 * precision cannot tell them apart); every quantity that differs between the two lies within 1e-5 M of the horizon:
 * the innermost stable orbit (1.000034 M, computed in double precision on the CPU) and the horizon itself. Delta is
 * written (r - 1)^2 + a^2 - 1 so it keeps its precision down there; the shadow's flattened prograde edge, the
 * strongly lopsided photon ring and the disk running down almost to the horizon are those of the near-extremal hole.
 */

const VERT = /* glsl */ `
varying vec2 vClip;
void main() { vClip = position.xy; gl_Position = vec4( position.xy, 0.9999, 1.0 ); }`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uPix;
${STARS_GLSL}
vec3 skyAtPix( vec3 d, samplerCube sky, float gain, float pix ) {
  vec3 glow = pow( textureCube( sky, d ).rgb, vec3( 2.2 ) );
  float band = clamp( dot( glow, vec3( 3.0 ) ), 0.0, 1.0 );
  return ( glow * 0.35 + starField( d, pix, band ) ) * gain;
}
vec3 skyAt( vec3 d, samplerCube sky, float gain ) { return skyAtPix( d, sky, gain, uPix ); }
uniform vec3 uCam;          // camera position, black-hole frame, units of M
uniform mat3 uZoneToSys;    // zone-frame directions -> black-hole frame
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uA, uRh, uRin, uRout, uTime, uDisk, uTdisk, uSkyGain;
uniform samplerCube uSky;
varying vec2 vClip;
const float HALF_PI = 1.5707963;

vec3 blackbody( float T ) {
  T = clamp( T, 800.0, 40000.0 ); float t = T / 100.0; vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp( 1.29293618606 * pow( t - 60.0, -0.1332047592 ), 0.0, 1.0 );
  c.g = t <= 66.0 ? clamp( 0.39008157876 * log( t ) - 0.63184144378, 0.0, 1.0 ) : clamp( 1.12989086089 * pow( t - 60.0, -0.0755148492 ), 0.0, 1.0 );
  c.b = t >= 66.0 ? 1.0 : ( t <= 19.0 ? 0.0 : clamp( 0.54320678911 * log( t - 10.0 ) - 1.19625408914, 0.0, 1.0 ) );
  return pow( c, vec3( 2.2 ) );
}
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), u.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), u.x ), u.y ); }

void derivs( vec3 X, vec2 P, float b, out vec3 dX, out vec2 dP ) {
  float r = X.x, s = max( sin( X.y ), 1e-4 ), c = cos( X.y );
  float a = uA, a2 = a * a;
  float rho2 = r * r + a2 * c * c;
  float D = max( ( r - 1.0 ) * ( r - 1.0 ) + a2 - 1.0, 1e-9 );
  float Pp = r * r + a2 - a * b;
  float B = b / s - a * s;
  dX.x = D * P.x / rho2;
  dX.y = P.y / rho2;
  dX.z = ( a * Pp / D + b / ( s * s ) - a ) / rho2;
  float dD = 2.0 * r - 2.0;
  dP.x = -( dD * P.x * P.x - ( 4.0 * r * Pp * D - Pp * Pp * dD ) / ( D * D ) ) / ( 2.0 * rho2 );
  dP.y = B * c * ( b / ( s * s ) + a ) / rho2;
}

void main() {
  // view ray in the zone frame from the current camera (works for screen and cube-map cameras alike)
  vec4 v = uInvProj * vec4( vClip, 1.0, 1.0 );
  vec3 dirZ = normalize( ( uCamWorld * vec4( v.xyz / v.w, 0.0 ) ).xyz );
  vec3 N = normalize( uZoneToSys * dirZ );
  vec3 c = uCam;
  float r = length( c ), th = acos( clamp( c.z / r, -1.0, 1.0 ) ), ph = atan( c.y, c.x );
  vec3 er = c / r, eth = vec3( cos( th ) * cos( ph ), cos( th ) * sin( ph ), -sin( th ) ), eph = vec3( -sin( ph ), cos( ph ), 0.0 );
  // far away and well clear of the hole: the bending is the weak-field 4M/b toward the hole
  float bImp = length( cross( c, N ) );
  float towards = dot( N, -er );
  if ( bImp > 150.0 || ( towards < 0.0 && r > 150.0 ) ) {
    vec3 toward = normalize( -er - N * dot( -er, N ) );
    float defl = towards > 0.0 ? 4.0 / max( bImp, 1.0 ) : 2.0 / r;
    vec3 d = normalize( N * cos( defl ) + toward * sin( defl ) );
    gl_FragColor = vec4( skyAt( d, uSky, uSkyGain ), 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  vec3 nF = -N;
  float nr = dot( nF, er ), nth = dot( nF, eth ), nph = dot( nF, eph );
  float a = uA, a2 = a * a;
  float st = max( sin( th ), 1e-4 ), ct = cos( th );
  float rho = sqrt( r * r + a2 * ct * ct ), D = max( ( r - 1.0 ) * ( r - 1.0 ) + a2 - 1.0, 1e-9 );
  float Sig = sqrt( ( r * r + a2 ) * ( r * r + a2 ) - a2 * D * st * st );
  float alpha = rho * sqrt( D ) / Sig, omega = 2.0 * a * r / ( Sig * Sig ), varpi = Sig * st / rho;
  float EF = 1.0 / ( alpha + omega * varpi * nph );
  vec2 P = vec2( EF * rho * nr / sqrt( D ), EF * rho * nth );
  float b = EF * varpi * nph;
  vec3 X = vec3( r, th, ph );
  vec3 col = vec3( 0.0 ); float A = 0.0;
  float rEsc = max( r * 1.15, 60.0 );
  bool escaped = false;
  for ( int i = 0; i < 420; i++ ) {
    float rr = X.x;
    float hmag = clamp( 0.02 * ( rr - uRh ) + 0.003 * rr * rr, 0.0015, 0.12 * rr );
    float h = -hmag;
    vec3 X0 = X; vec2 P0 = P;
    vec3 k1x, k2x, k3x, k4x; vec2 k1p, k2p, k3p, k4p;
    derivs( X, P, b, k1x, k1p );
    derivs( X + 0.5 * h * k1x, P + 0.5 * h * k1p, b, k2x, k2p );
    derivs( X + 0.5 * h * k2x, P + 0.5 * h * k2p, b, k3x, k3p );
    derivs( X + h * k3x, P + h * k3p, b, k4x, k4p );
    X += h / 6.0 * ( k1x + 2.0 * k2x + 2.0 * k3x + k4x );
    P += h / 6.0 * ( k1p + 2.0 * k2p + 2.0 * k3p + k4p );
    // keep theta inside (0, pi) when a ray passes over a pole
    if ( X.y < 0.0 ) { X.y = -X.y; X.z += 3.14159265; P.y = -P.y; }
    if ( X.y > 3.14159265 ) { X.y = 6.2831853 - X.y; X.z += 3.14159265; P.y = -P.y; }
    if ( X.x < uRh * 1.02 ) break;
    // the disk: a crossing of the equatorial plane
    if ( ( X0.y - HALF_PI ) * ( X.y - HALF_PI ) < 0.0 ) {
      float f = ( X0.y - HALF_PI ) / ( X0.y - X.y );
      float rc = mix( X0.x, X.x, f ), phc = mix( X0.z, X.z, f );
      if ( rc > uRin && rc < uRout ) {
        float sq = sqrt( rc );
        float Om = 1.0 / ( rc * sq + a );
        float ut = ( rc * sq + a ) / ( pow( rc, 0.75 ) * sqrt( max( rc * sq - 3.0 * sq + 2.0 * a, 1e-6 ) ) );
        float g = EF / ( ut * ( 1.0 - Om * b ) );
        float F = max( 0.0, 1.0 - sqrt( uRin / rc ) ) / ( rc * rc * rc );
        // normalised to the profile's peak (at r = 49/36 r_in, F = 0.0567 / r_in^3)
        float Fn = F * uRin * uRin * uRin / 0.0567;
        float Tem = uTdisk * pow( max( Fn, 0.0 ), 0.25 );
        // streaks of hotter gas, sheared by the differential rotation
        float rot = phc - Om * uTime;
        float lr = log( rc );
        float tex = 0.7 + 0.3 * vnoise( vec2( lr * 40.0, rot * 1.5 + lr * 4.0 ) ) * ( 0.75 + 0.25 * vnoise( vec2( lr * 140.0, rot * 4.0 ) ) );
        vec3 e = blackbody( g * Tem ) * pow( g, 4.0 ) * Fn * uDisk * tex;
        float edge = smoothstep( uRin, uRin * 1.08, rc ) * ( 1.0 - smoothstep( uRout * 0.55, uRout, rc ) );
        float op = 0.92 * edge;
        col += ( 1.0 - A ) * e * edge;
        A += ( 1.0 - A ) * op;
        if ( A > 0.985 ) break;
      }
    }
    if ( X.x > rEsc && X.x > X0.x ) { escaped = true; break; }
  }
  vec3 d = vec3( sin( X.y ) * cos( X.z ), sin( X.y ) * sin( X.z ), cos( X.y ) );
  // the size of this pixel on the source sky (larger where lensing magnifies): stars stay points
  float pixSrc = clamp( sqrt( length( dFdx( d ) ) * length( dFdy( d ) ) ), uPix * 0.35, uPix * 3.0 );
  if ( escaped ) col += ( 1.0 - A ) * skyAtPix( d, uSky, uSkyGain, pixSrc );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

let galaxy: THREE.CubeTexture | null = null;
export function galaxySky() { return (galaxy ??= makeGalaxySky()); }

/** innermost stable circular orbit (prograde), Bardeen-Press-Teukolsky */
export function iscoRadius(a: number) {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
}

/**
 * The black hole and its galaxy as the whole background of the scene: a full-screen pass drawn behind every
 * other background object (the planets of the system are painted over it).
 */
export class BlackHoleView {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  static readonly SPIN = 1 - 1e-14;

  constructor(public M: number) {
    const a = BlackHoleView.SPIN;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        uCam: { value: new THREE.Vector3(300, 0, 0) }, uZoneToSys: { value: new THREE.Matrix3() },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
        uA: { value: a }, uRh: { value: 1 + Math.sqrt((1 - a) * (1 + a)) }, uRin: { value: iscoRadius(a) }, uRout: { value: 24 },
        uTime: { value: 0 }, uDisk: { value: 1 }, uTdisk: { value: 5200 }, uSkyGain: { value: 0.05 },
        uSky: { value: galaxySky() }, uPix: { value: 0.001 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -4000;
    // the camera matrices are taken at draw time (screen and cube-map cameras alike)
    this.mesh.onBeforeRender = (_r, _s, cam) => {
      (this.mat.uniforms.uInvProj.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
      (this.mat.uniforms.uCamWorld.value as THREE.Matrix4).copy(cam.matrixWorld);
      // angular size of a pixel, for sharp stars at any field of view
      const pc = cam as THREE.PerspectiveCamera;
      const h = (_r.getRenderTarget()?.height ?? _r.domElement.height) || 720;
      this.mat.uniforms.uPix.value = pc.fov ? (2 * Math.tan((pc.fov * Math.PI) / 360)) / h : 0.001;
    };
  }

  /** camera in the system frame (m) and rotation zone <- system; time in seconds (disk rotation) */
  update(camSys: V3, rot: THREE.Matrix4, t: number, exposure: number) {
    const u = this.mat.uniforms;
    (u.uCam.value as THREE.Vector3).set(camSys[0] / this.M, camSys[1] / this.M, camSys[2] / this.M);
    (u.uZoneToSys.value as THREE.Matrix3).setFromMatrix4(rot).transpose();
    // M in seconds: the disk turns once per 2 pi (r^1.5 + a) M / c
    u.uTime.value = t / (this.M / 299792458);
    // the galaxy is faint next to the disk: keep the stars at a sensible brightness under any eye adaptation
    u.uSkyGain.value = 0.06 / Math.max(0.3, exposure);
    // the disk's surface brightness is intrinsic (the same from Miller as from the far side of the wormhole), far
    // above any daylit sky; a mild adaptation keeps it from burning out where the eye is dark-adapted
    u.uDisk.value = 6 / Math.sqrt(Math.max(0.3, exposure));
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); }
}
