import * as THREE from 'three';
import { BODY, BodyDef } from '../space/Bodies';

const TEX = (n: string) => `${import.meta.env.BASE_URL}assets/textures/${n}.webp`;
const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function tex(name: string, srgb: boolean, wrap = true) {
  const k = name + (srgb ? '|s' : '');
  let t = texCache.get(k);
  if (!t) {
    t = loader.load(TEX(name));
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (wrap) t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 8;
    texCache.set(k, t);
  }
  return t;
}

const NOISE = /* glsl */ `
float h3( vec3 p ) { p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float n3( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( h3( i ), h3( i + vec3( 1, 0, 0 ) ), f.x ), mix( h3( i + vec3( 0, 1, 0 ) ), h3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( h3( i + vec3( 0, 0, 1 ) ), h3( i + vec3( 1, 0, 1 ) ), f.x ), mix( h3( i + vec3( 0, 1, 1 ) ), h3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float fb( vec3 p ) { return n3( p ) * 0.5 + n3( p * 2.03 + 3.1 ) * 0.27 + n3( p * 4.11 + 7.7 ) * 0.15 + n3( p * 8.3 + 1.3 ) * 0.08; }
`;

const VERT = /* glsl */ `
varying vec3 vObj; varying vec3 vNw; varying vec3 vPw; varying vec3 vTan;
uniform vec3 uOblate;   // object scale (1, polar/equatorial, 1)
void main() {
  vObj = normalize( position );
  vec4 wp = modelMatrix * vec4( position * uOblate, 1.0 );
  vPw = wp.xyz - cameraPosition;
  vNw = normalize( mat3( modelMatrix ) * ( normal / uOblate ) );
  vec3 east = normalize( vec3( position.z, 0.0, -position.x ) + vec3( 1e-6 ) );   // d/dlon with 90 E at -Z
  vTan = normalize( mat3( modelMatrix ) * east );
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAlbedo, uNormal, uClouds, uRingTex;
uniform float uHasNormal, uHasClouds, uKind;     // kind: 0 airless rock, 1 rock with air, 2 gas giant, 3 ice giant
uniform vec3 uSunDir;                            // toward the sun (world)
uniform vec3 uSunCol;                            // irradiance colour at the body (already includes distance)
uniform float uTime;
uniform vec3 uBands;                             // differential rotation: equator rate, pole rate (rad/s), cloud drift (rad/s)
uniform vec4 uRing;                              // inner, outer (in planet radii), has ring, optical-depth scale
uniform vec3 uPoleW;                             // north pole (world)
uniform float uDetail;                           // procedural sub-texture detail (0 far .. 1 close)
uniform float uRadiusKm;
uniform vec3 uLimb;
uniform float uNormalK;
uniform float uOcean;                            // open water: sun glint
varying vec3 vObj; varying vec3 vNw; varying vec3 vPw; varying vec3 vTan;
${NOISE}
vec2 uvOf( vec3 o, float extraLon ) {
  float lon = atan( -o.z, o.x ) + extraLon;
  float lat = asin( clamp( o.y, -1.0, 1.0 ) );
  return vec2( fract( lon / 6.2831853 + 0.5 ), lat / 3.1415927 + 0.5 );
}
// the longitude wraps from 1 to 0 somewhere on screen: take derivatives from whichever of u and u-shifted-by-half
// is continuous here, so the mip level does not collapse into a visible seam
vec4 tex2( sampler2D t, vec2 uv ) {
  vec2 a = uv, b = vec2( fract( uv.x + 0.5 ) - 0.5, uv.y );
  vec2 dxa = dFdx( a ), dya = dFdy( a ), dxb = dFdx( b ), dyb = dFdy( b );
  bool useB = abs( dxb.x ) + abs( dyb.x ) < abs( dxa.x ) + abs( dya.x );
  return textureGrad( t, uv, useB ? dxb : dxa, useB ? dyb : dya );
}
float ringTau( float r ) {
  if ( uRing.z < 0.5 || r < uRing.x || r > uRing.y ) return 0.0;
  return texture2D( uRingTex, vec2( ( r - uRing.x ) / ( uRing.y - uRing.x ), 0.5 ) ).a * 4.0 * uRing.w;
}
void main() {
  vec3 N = normalize( vNw );
  vec3 V = normalize( -vPw );
  float lat = asin( clamp( vObj.y, -1.0, 1.0 ) );
  float s2 = sin( lat ) * sin( lat );
  // gas giants: zonal winds move each latitude at its own rate
  float extra = uKind > 1.5 ? uTime * ( uBands.x + ( uBands.y - uBands.x ) * s2 ) : 0.0;
  vec2 uv = uvOf( vObj, extra );
  vec3 alb = pow( tex2( uAlbedo, uv ).rgb, vec3( 2.2 ) );
  vec3 Nr = N;
  if ( uHasNormal > 0.5 ) {
    vec3 T = normalize( vTan - N * dot( vTan, N ) );
    vec3 B = cross( N, T );
    vec3 tn = tex2( uNormal, uv ).xyz * 2.0 - 1.0;
    tn.xy *= uNormalK;
    Nr = normalize( T * tn.x + B * tn.y + N * tn.z );
  }
  // sub-texture detail as the camera closes in (orbit, descent)
  if ( uDetail > 0.001 ) {
    vec3 P = vObj * uRadiusKm;
    float d = ( fb( P * 0.05 ) - 0.5 ) * 0.6 + ( fb( P * 0.4 ) - 0.5 ) * 0.4 * uDetail + ( fb( P * 2.7 ) - 0.5 ) * 0.25 * uDetail;
    alb *= 1.0 + d * ( uKind > 1.5 ? 0.15 : 0.6 );
  }
  vec3 L = normalize( uSunDir );
  float mu0 = dot( Nr, L ), mu = max( dot( N, V ), 0.0 ), mus = dot( N, L );
  // ring shadow on the planet: follow the ray toward the sun to the ring plane
  float ringT = 1.0;
  if ( uRing.z > 0.5 ) {
    vec3 Pw = N;     // unit-radius position from the centre, in world orientation (sphere normal)
    float lp = dot( L, uPoleW );
    if ( abs( lp ) > 1e-4 ) {
      float t = -dot( Pw, uPoleW ) / lp;
      if ( t > 0.0 ) {
        float r = length( Pw + L * t );
        ringT = exp( -ringTau( r ) / max( abs( lp ), 0.03 ) );
      }
    }
  }
  vec3 col;
  if ( uKind < 0.5 ) {
    // airless regolith: Lommel-Seeliger with a little Lambert, and the opposition surge
    float ls = max( mu0, 0.0 ) / ( max( mu0, 0.0 ) + mu + 1e-3 );
    float ph = dot( L, V );
    col = alb * uSunCol * ( ls * 1.6 + max( mu0, 0.0 ) * 0.25 ) * ( 1.0 + 0.25 * pow( max( ph, 0.0 ), 30.0 ) );
  } else if ( uKind < 1.5 ) {
    vec3 sunC = uSunCol * mix( vec3( 1.0, 0.55, 0.3 ), vec3( 1.0 ), smoothstep( -0.02, 0.3, mus ) );
    col = alb * sunC * max( mu0, 0.0 );
    if ( uHasClouds > 0.5 ) {
      vec2 cuv = vec2( uv.x + uTime * uBands.z, uv.y );
      vec4 cl = tex2( uClouds, cuv ); cl.rgb = pow( cl.rgb, vec3( 2.2 ) );
      vec3 tsun = L - N * dot( L, N );
      float sh = 1.0 - 0.5 * tex2( uClouds, cuv + vec2( dot( tsun, normalize( vTan ) ), -dot( tsun, cross( N, normalize( vTan ) ) ) ) * 0.004 ).a;
      col *= sh;
      if ( uOcean > 0.5 ) {
        vec3 H = normalize( V + L );
        float nh = max( dot( N, H ), 0.0 );
        col += sunC * ( pow( nh, 220.0 ) * 2.2 + pow( nh, 24.0 ) * 0.05 ) * smoothstep( 0.0, 0.2, mus ) * ( 1.0 - cl.a );
      }
      col = mix( col, cl.rgb * sunC * ( max( mus, 0.0 ) * 0.92 + 0.03 ), cl.a );
    }
  } else {
    // giants: soft limb darkening, terminator softened by the deep atmosphere
    float lambert = max( mus * 0.92 + 0.08, 0.0 );
    lambert *= smoothstep( -0.08, 0.15, mus );
    col = alb * uSunCol * lambert * pow( max( mu, 0.02 ), 0.18 );
  }
  col *= ringT;
  // a hint of the atmosphere at the limb (distant views; the full sky model takes over close in)
  if ( uKind > 0.5 ) {
    float rim = pow( 1.0 - mu, 4.0 );
    col += uLimb * uSunCol * rim * 0.35 * smoothstep( -0.15, 0.3, mus );
  }
  gl_FragColor = vec4( col, 1.0 );
}`;

const RING_VERT = /* glsl */ `
varying vec3 vPw; varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vPw = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const RING_FRAG = /* glsl */ `
uniform sampler2D uRingTex;
uniform vec4 uRing;          // inner, outer (planet radii), -, optical-depth scale
uniform vec3 uSunDir, uSunCol, uPoleW;
uniform vec3 uCenterRel;     // planet centre relative to the camera (scaled units)
uniform float uRadius;       // planet radius (scaled units)
uniform float uDark;         // particle albedo multiplier (Uranus's rings are coal-dark)
varying vec3 vPw; varying vec3 vLocal;
${NOISE}
float sphereHit( vec3 ro, vec3 rd, vec3 c, float R ) {
  vec3 oc = ro - c; float b = dot( oc, rd ), cc = dot( oc, oc ) - R * R, h = b * b - cc;
  if ( h < 0.0 ) return -1.0;
  return -b - sqrt( h );
}
void main() {
  float r = length( vLocal.xy );
  if ( r < uRing.x || r > uRing.y ) discard;
  float u = ( r - uRing.x ) / ( uRing.y - uRing.x );
  vec4 s = texture2D( uRingTex, vec2( u, 0.5 ) );
  float tau = s.a * 4.0 * uRing.w;
  // azimuthal clumping (spokes, wakes) as a whisper of variation
  float az = atan( vLocal.y, vLocal.x );
  tau *= 0.92 + 0.16 * n3( vec3( r * 40.0, az * 6.0, 0.0 ) );
  if ( tau < 1e-4 ) discard;
  vec3 V = normalize( -vPw );
  float d = length( vPw );
  // hidden behind the planet?
  float tHit = sphereHit( vec3( 0.0 ), -V, uCenterRel, uRadius );
  if ( tHit > 0.0 && tHit < d ) discard;
  vec3 n = normalize( uPoleW );
  float muV = abs( dot( V, n ) ), muL = dot( uSunDir, n );
  float alpha = 1.0 - exp( -tau / max( muV, 0.015 ) );
  vec3 P = -V * d;                       // point relative to the camera
  // in the planet's shadow?
  float tS = sphereHit( P, normalize( uSunDir ), uCenterRel, uRadius * 0.985 );
  float shadow = tS > 0.0 ? 0.0 : 1.0;
  bool litFace = sign( dot( V, n ) ) == sign( muL );
  float ph = dot( -V, normalize( uSunDir ) );   // > 0: looking toward the sun (forward scattering)
  vec3 c = pow( s.rgb, vec3( 2.2 ) ) * uDark;
  vec3 col;
  if ( litFace ) {
    col = c * uSunCol * ( 0.85 + 0.35 * pow( max( -ph, 0.0 ), 4.0 ) ) * ( 1.0 - exp( -tau / max( abs( muL ), 0.02 ) ) ) / max( alpha, 1e-3 ) * 0.9;
  } else {
    // seen from the unlit face: only light diffusing through, strongest in thin rings, forward scattering
    float through = ( 1.0 - exp( -tau / max( abs( muL ), 0.02 ) ) ) * exp( -tau * 0.6 );
    col = c * uSunCol * through * ( 0.25 + 1.6 * pow( max( ph, 0.0 ), 6.0 ) ) / max( alpha, 1e-3 );
  }
  col *= shadow;
  gl_FragColor = vec4( col, alpha );
}`;

const SHELL_FRAG = /* glsl */ `
uniform vec3 uSunDir, uSunCol, uLimb;
uniform vec3 uCenterRel;     // planet centre relative to the camera (scaled units)
uniform float uRadiusW;      // planet radius (scaled units)
uniform float uHW;           // visible haze scale height (scaled units)
uniform float uThick;        // optical thickness scale
varying vec3 vObj; varying vec3 vNw; varying vec3 vPw; varying vec3 vTan;
void main() {
  vec3 rd = normalize( vPw );
  // closest approach of the view ray to the planet centre
  float tc = dot( uCenterRel, rd );
  vec3 cp = rd * tc - uCenterRel;
  float b = length( cp );
  float h = b - uRadiusW;                         // > 0: the ray passes above the surface
  float dens = h > 0.0 ? exp( -h / uHW ) : exp( h / ( uHW * 0.35 ) ) * 0.35;
  // light at the tangent point: day side bright, a red rim of forward-scattered light at the terminator
  vec3 n = normalize( cp );
  float sd = dot( n, normalize( uSunDir ) );
  float day = smoothstep( -0.3, 0.25, sd );
  float fwd = pow( max( dot( rd, normalize( uSunDir ) ), 0.0 ), 6.0 );
  vec3 c = uLimb * uSunCol * ( day + fwd * 2.5 * smoothstep( -0.4, 0.0, sd ) );
  float a = 1.0 - exp( -dens * uThick * 30.0 );
  gl_FragColor = vec4( c * a * 0.35, 1.0 );
}`;

export interface PlanetLook {
  kind: number;
  bands: [number, number, number];
  normalK: number;
  limbThick: number;
  ringDark: number;
}

function lookOf(b: BodyDef): PlanetLook {
  const kind = b.kind === 'gas' ? 2 : b.kind === 'ice' ? 3 : b.atmosphere && b.atmosphere.rho0 > 0.05 ? 1 : 0;
  // zonal winds (rad/s): Jupiter's equator runs ~100 m/s ahead of the deep rotation
  const bands: [number, number, number] = b.id === 'jupiter' ? [1.4e-6, -0.6e-6, 0] : b.id === 'saturn' ? [3.2e-6, -0.2e-6, 0] : b.id === 'neptune' ? [-1.2e-5, 2e-6, 0] : [0, 0, 2e-6];
  return { kind, bands, normalK: b.id === 'moon' || b.id === 'mercury' ? 0.3 : kind === 0 ? 0.55 : 1.0, limbThick: b.kind === 'gas' || b.kind === 'ice' ? 0.05 : 0.025, ringDark: b.id === 'uranus' ? 0.25 : 1.0 };
}

/**
 * One body seen from space: globe (oblate), optional cloud deck, ring system and atmosphere limb shell.
 * Built in object space (+Y north pole, longitude 0 at +X, 90 E at -Z) with radius 1; the system view scales and
 * places it every frame.
 */
export class PlanetBody {
  group = new THREE.Group();
  globe: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  ring: THREE.Mesh | null = null;
  ringMat: THREE.ShaderMaterial | null = null;
  shell: THREE.Mesh | null = null;
  shellMat: THREE.ShaderMaterial | null = null;
  look: PlanetLook;
  /** visible haze scale height in planet radii */
  hazeH = 0;

  constructor(public def: BodyDef, segs = 128) {
    this.look = lookOf(def);
    const id = def.id;
    const maps = def.maps ?? (id === 'earth' ? 'earth' : null);
    const hasNormal = !!maps && def.kind === 'rocky' && !['venus', 'titan', 'miller'].includes(id);
    const hasClouds = !!maps && ['miller', 'mann', 'edmunds', 'earth'].includes(id);
    // the Earth's maps come from its own generator (earth_*), the others from planets.py (planet_<id>_*)
    const map = (kind: string) => (id === 'earth' ? `earth_${kind}` : `planet_${maps}_${kind}`);
    const ringDef = def.rings;
    const ringTex = ringDef ? tex(id === 'uranus' ? 'ring_uranus' : 'ring_saturn', false, false) : null;   // raw: decoded once in the shader
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uAlbedo: { value: maps ? tex(map('albedo'), false) : null },
        uNormal: { value: hasNormal ? tex(map('normal'), false) : null },
        uClouds: { value: hasClouds ? tex(map('clouds'), false) : null },
        uRingTex: { value: ringTex },
        uHasNormal: { value: hasNormal ? 1 : 0 }, uHasClouds: { value: hasClouds ? 1 : 0 }, uKind: { value: this.look.kind },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uSunCol: { value: new THREE.Vector3(1, 1, 1) }, uTime: { value: 0 },
        uBands: { value: new THREE.Vector3(...this.look.bands) },
        uRing: { value: new THREE.Vector4(ringDef ? ringDef.inner / def.R : 0, ringDef ? ringDef.outer / def.R : 0, ringDef ? 1 : 0, 1) },
        uPoleW: { value: new THREE.Vector3(0, 1, 0) }, uDetail: { value: 0 }, uRadiusKm: { value: def.R / 1000 },
        uLimb: { value: new THREE.Vector3(...(def.atmosphere?.limb ?? [0, 0, 0])) }, uNormalK: { value: this.look.normalK }, uOcean: { value: id === 'miller' ? 1 : 0 },
        uOblate: { value: new THREE.Vector3(1, def.Rp ? def.Rp / def.R : 1, 1) },
      },
      vertexShader: VERT, fragmentShader: FRAG, depthWrite: false, depthTest: false,
    });
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(1, segs, segs / 2), this.mat);
    this.globe.frustumCulled = false;
    this.group.add(this.globe);
    if (ringDef && ringTex) {
      this.ringMat = new THREE.ShaderMaterial({
        uniforms: {
          uRingTex: { value: ringTex }, uRing: this.mat.uniforms.uRing, uSunDir: this.mat.uniforms.uSunDir, uSunCol: this.mat.uniforms.uSunCol,
          uPoleW: this.mat.uniforms.uPoleW, uCenterRel: { value: new THREE.Vector3() }, uRadius: { value: 1 }, uDark: { value: this.look.ringDark },
        },
        vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      });
      const g = new THREE.RingGeometry(ringDef.inner / def.R, ringDef.outer / def.R, 256, 4);
      this.ring = new THREE.Mesh(g, this.ringMat);
      // RingGeometry lies in XY: turn it into the equatorial plane (XZ, pole +Y)
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.frustumCulled = false;
      this.group.add(this.ring);
    }
    if (def.atmosphere && def.kind !== 'star') {
      // the shell reaches six visible scale heights up; the shader works from the ray's closest approach
      this.hazeH = Math.max(def.atmosphere.HM, def.atmosphere.HD ?? 0, def.atmosphere.HR * 0.6) / def.R;
      const top = 1 + Math.min(def.atmosphere.top / def.R, this.hazeH * 7);
      this.shellMat = new THREE.ShaderMaterial({
        uniforms: {
          uSunDir: this.mat.uniforms.uSunDir, uSunCol: this.mat.uniforms.uSunCol, uLimb: this.mat.uniforms.uLimb, uThick: { value: this.look.limbThick },
          uOblate: this.mat.uniforms.uOblate, uCenterRel: { value: new THREE.Vector3() }, uRadiusW: { value: 1 }, uHW: { value: 0.01 },
        },
        vertexShader: VERT, fragmentShader: SHELL_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.FrontSide,
      });
      this.shell = new THREE.Mesh(new THREE.SphereGeometry(top, 96, 48), this.shellMat);
      this.shell.frustumCulled = false;
      this.group.add(this.shell);
    }
  }

  /** order of drawing within the space scene (larger = later) */
  setOrder(base: number) {
    this.globe.renderOrder = base;
    if (this.shell) this.shell.renderOrder = base + 1;
    if (this.ring) this.ring.renderOrder = base + 2;
  }

  dispose() {
    this.group.removeFromParent();
    this.globe.geometry.dispose(); this.mat.dispose();
    this.ring?.geometry.dispose(); this.ringMat?.dispose();
    this.shell?.geometry.dispose(); this.shellMat?.dispose();
  }
}

export const bodyById = (id: string) => BODY[id];
