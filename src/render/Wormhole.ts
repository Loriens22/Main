import * as THREE from 'three';

/*
 * The wormhole as a gravitational lens: an Ellis wormhole, ds^2 = -dt^2 + dl^2 + (b0^2 + l^2) dOmega^2, throat
 * radius b0, no mass (nothing pulls the ship in; the film's wormhole was a lens, not a well).
 *
 * A light ray with impact parameter b = k b0 sweeps the azimuth dphi/dl = (b/r^2) / sqrt(1 - b^2/r^2), r^2 = b0^2 + l^2.
 * With l = b0 tan t the integrand becomes k / sqrt(1 - k^2 cos^2 t) dt (finite range, smooth): rays with k < 1 go
 * through the throat (and show the other universe), rays with k > 1 turn round at cos t = 1/k and come back out on
 * this side, bent; near k = 1 they wind round the throat (the bright ring of multiple images). The turning point is
 * integrated with t = t_turn + w^2, which removes the square-root singularity. For a ray traced from the camera, the
 * sky it sees lies at azimuth (total sweep) from the camera's outward direction, in the plane of the ray.
 */

const VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4( position, 1.0 );
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uCenter;       // wormhole centre relative to the camera (zone frame, m)
uniform float uB0;          // throat radius (m)
uniform float uL;           // camera's proper radial distance from the throat (m); its sign is the side
uniform mat3 uZoneToNear;   // zone directions -> the frame of the camera's universe's sky map
uniform mat3 uNearToFar;    // that frame -> the other universe's sky map frame
uniform samplerCube uNear, uFar;
uniform float uNearGain, uFarGain;
varying vec3 vW;
const float HPI = 1.5707963;

float fInt( float k, float t ) { float c = cos( t ); return k / sqrt( max( 1e-10, 1.0 - k * k * c * c ) ); }
// smooth part: midpoint rule
float integ( float k, float ta, float tb ) {
  float s = 0.0, h = ( tb - ta ) / 64.0;
  for ( int i = 0; i < 64; i++ ) s += fInt( k, ta + ( float( i ) + 0.5 ) * h );
  return s * h;
}
// from the turning point tt to T, with t = tt + w^2
float integTurn( float k, float tt, float T ) {
  float W = sqrt( max( T - tt, 0.0 ) ), s = 0.0, h = W / 48.0;
  for ( int i = 0; i < 48; i++ ) { float w = ( float( i ) + 0.5 ) * h; s += 2.0 * w * fInt( k, tt + w * w ); }
  return s * h;
}

void main() {
  vec3 d = normalize( vW - cameraPosition );
  vec3 toC = normalize( uCenter );
  vec3 eOut = -toC;                                   // outward radial direction at the camera
  float cosPsi = clamp( dot( d, toC ), -1.0, 1.0 );   // angle from the inward direction
  float sinPsi = sqrt( max( 0.0, 1.0 - cosPsi * cosPsi ) );
  vec3 ePerp = sinPsi > 1e-6 ? ( d - toC * cosPsi ) / sinPsi : vec3( 0.0 );
  float L = abs( uL );
  float rc = sqrt( uB0 * uB0 + L * L );
  float k = rc * sinPsi / uB0;
  float tc = atan( L / uB0 );
  float dphi;
  bool through = false;
  if ( cosPsi > 0.0 ) {
    // heading in toward the throat
    if ( k < 1.0 ) { dphi = integ( k, -HPI, tc ); through = true; }
    else { float tt = acos( 1.0 / k ); dphi = integTurn( k, tt, tc ) + integTurn( k, tt, HPI ); }
  } else {
    // heading away: only the rest of the sweep out to infinity
    if ( k < 1.0 ) dphi = integ( k, tc, HPI );
    else { float tt = acos( 1.0 / k ); dphi = integTurn( k, tt, HPI ) - integTurn( k, tt, tc ); }
  }
  vec3 sky = cos( dphi ) * eOut + sin( dphi ) * ePerp;
  vec3 dn = uZoneToNear * sky;
  // a negative mip bias keeps the repeated images round the throat sharp instead of averaged into a band
  vec3 col = through ? textureCube( uFar, uNearToFar * dn, -1.5 ).rgb * uFarGain : textureCube( uNear, dn, -1.5 ).rgb * uNearGain;
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The lens drawn in the background scene: a sphere tens of throat radii across around the mouth (beyond that the
 * bending is under a twentieth of a degree), drawn from inside or outside alike (back faces), sampling the sky maps
 * of both universes.
 */
export class WormholeLens {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  static readonly EXTENT = 40;

  constructor(public b0: number) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthTest: false, depthWrite: false,
      uniforms: {
        uCenter: { value: new THREE.Vector3(0, 0, -1) }, uB0: { value: b0 }, uL: { value: 25 * b0 },
        uZoneToNear: { value: new THREE.Matrix3() }, uNearToFar: { value: new THREE.Matrix3() },
        uNear: { value: null }, uFar: { value: null }, uNearGain: { value: 1 }, uFarGain: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  /**
   * Place the lens for a camera at proper distance l from the throat (sign: which universe), the centre in direction
   * dirZone (zone frame) from the camera.
   */
  place(l: number, dirZone: THREE.Vector3) {
    const rc = Math.sqrt(this.b0 * this.b0 + l * l);
    const u = this.mat.uniforms;
    u.uL.value = l;
    (u.uCenter.value as THREE.Vector3).copy(dirZone).normalize().multiplyScalar(rc);
    this.mesh.position.copy(u.uCenter.value as THREE.Vector3);
    this.mesh.scale.setScalar(this.b0 * WormholeLens.EXTENT);
  }

  setSkies(near: THREE.Texture, far: THREE.Texture, zoneToNear: THREE.Matrix3, nearToFar: THREE.Matrix3, nearGain = 1, farGain = 1) {
    const u = this.mat.uniforms;
    u.uNear.value = near; u.uFar.value = far;
    (u.uZoneToNear.value as THREE.Matrix3).copy(zoneToNear);
    (u.uNearToFar.value as THREE.Matrix3).copy(nearToFar);
    u.uNearGain.value = nearGain; u.uFarGain.value = farGain;
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); }
}
