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

/*
 * Craters below the map's resolution (radius ~60 m to 4 km), for the close views from low orbit and on the descent.
 * Each octave is a lattice of cells of size S; a cell holds at most one crater, its centre a random point in the cell
 * projected onto the sphere, its radius shrinking with the centre's distance from the surface so that the crater's
 * whole influence (bowl, rim, ejecta to two radii) stays within S/2 of the centre: the 2x2x2 cells nearest a point
 * are then the only ones that can touch it. Octaves 2.5x apart in size with equal numbers per cell give the
 * saturated lunar size-frequency distribution, N(>D) ~ D^-2.
 *
 * A crater: a parabolic bowl of depth D below a raised rim of height Hr, ejecta falling off outside. Fresh craters are
 * deep (depth/diameter ~0.2) with bright ejecta; old ones are shallow. Cast shadows are analytic: the bowl is convex,
 * so a point inside is in shadow exactly when the ray toward the sun passes below the rim where it leaves the bowl.
 * Each octave fades in once its craters span a few pixels, so nothing aliases into noise from far away.
 */
const CRATERS = /* glsl */ `
vec4 hash44( vec4 p4 ) { p4 = fract( p4 * vec4( 0.1031, 0.1030, 0.0973, 0.1099 ) ); p4 += dot( p4, p4.wzxy + 33.33 ); return fract( ( p4.xxyz + p4.yzzw ) * p4.zywx ); }
// P: point (km, object frame) on the sphere of radius R; n: up; Ls: sun in the object frame; fp: km per pixel
void craterOctave( vec3 P, vec3 n, vec3 Ls, float R, float S, float dens, float seed, float fp,
                   inout vec3 grad, inout float lit, inout float albK ) {
  float fade = smoothstep( 0.8, 2.6, 0.12 * S / fp );
  if ( fade <= 0.0 || dens <= 0.0 ) return;
  float sinE = dot( Ls, n );
  vec3 Lt = Ls - n * sinE;
  float cosE = length( Lt );
  vec3 sh = Lt / max( cosE, 1e-5 );
  float tanE = sinE / max( cosE, 1e-4 );
  vec3 base = floor( P / S - 0.5 );
  for ( int i = 0; i < 16; i++ ) {
    // two candidate craters per cell (a jittered grid of one per cell would look too even)
    vec3 cell = base + vec3( float( i % 2 ), float( ( i / 2 ) % 2 ), float( ( i / 4 ) % 2 ) );
    float sd = seed + float( i / 8 ) * 0.37;
    vec4 h = hash44( vec4( cell, sd ) );
    if ( h.w > dens ) continue;
    vec4 k = hash44( vec4( cell.zxy + 17.0, sd + 5.0 ) );
    vec3 c = ( cell + h.xyz ) * S;
    float cl = length( c );
    float dz = cl - R;
    float q = 1.0 - 4.0 * dz * dz / ( S * S );
    if ( q <= 0.0 ) continue;
    float r = S * ( 0.08 + 0.17 * k.x ) * sqrt( q );      // <= S/4: ejecta to 2r stay within S/2
    vec3 d = P - c * ( R / cl );
    float rho = length( d );
    float x = rho / r;
    if ( x >= 2.0 ) continue;
    // degradation a: fresh (0) is a sharp-rimmed parabolic bowl, depth/diameter 0.2; old (1) is a shallow, rounded
    // dimple (h = -D (1 - x^2)^2) with no rim left
    float age = k.y, a = age * age;
    float D = r * ( 0.4 - 0.3 * a );
    float Hr = D * 0.18 * ( 1.0 - a );
    // craters wider than ~12 km have flat floors
    float floorD = r > 6.0 ? 0.7 * D : D;
    vec3 u = d / max( rho, 1e-6 );
    float dhdx;
    if ( x < 1.0 ) {
      float w = 1.0 - x * x, pw = pow( w, a );
      dhdx = D * w * pw < floorD ? 2.0 * D * ( 1.0 + a ) * pw * x : 0.0;
      // cast shadow: where the sunward ray leaves the bowl, is it still below the rim? (exact for the convex
      // fresh bowl, close enough for the rounded old ones); with the Sun below the horizon the bowl is all in shadow
      if ( sinE <= 0.0 ) lit = min( lit, 1.0 - fade );
      else {
        float xs = dot( d, sh ) / r;
        float tEx = -xs + sqrt( max( xs * xs - x * x + 1.0, 0.0 ) );
        float rise = tEx * r * tanE, need = min( D * w * pw, floorD );
        float pen = max( 0.005 * tEx * r, fp * 0.6 );
        lit = min( lit, mix( 1.0, smoothstep( -pen, pen, rise - need ), fade ) );
      }
    } else {
      dhdx = -2.5 * Hr * exp( -2.5 * ( x - 1.0 ) ) * ( 1.0 - smoothstep( 1.5, 2.0, x ) );
    }
    grad += u * ( dhdx / r ) * fade;
    // fresh craters: bright ejecta and walls; old ones fade into the surroundings
    float fresh = max( 0.0, 1.0 - age / 0.18 );
    albK *= 1.0 + fade * ( fresh * 0.5 * exp( -x * x * 0.7 ) - ( x < 1.0 ? 0.06 * age : 0.0 ) );
  }
}
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
uniform float uCraters;                          // density of the sub-texture crater population (0: none)
uniform float uCraterMare;                       // 1: fewer large craters where the map is dark (lunar maria)
varying vec3 vObj; varying vec3 vNw; varying vec3 vPw; varying vec3 vTan;
${NOISE}
${CRATERS}
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
    // a map texel is kilometres across: up close its slopes would be exaggerated, so it fades into the detail below
    tn.xy *= uNormalK * ( 1.0 - ( uCraters > 0.0 ? 0.95 : 0.7 ) * uDetail );
    Nr = normalize( T * tn.x + B * tn.y + N * tn.z );
  }
  vec3 L = normalize( uSunDir );
  float craterLit = 1.0;
  if ( uDetail > 0.001 ) {
    vec3 n = normalize( vObj );
    vec3 P = n * uRadiusKm;
    float fp = max( length( fwidth( P ) ), 1e-4 );    // km per pixel
    // the object frame's local east/north, matching the world tangent frame
    vec3 To = normalize( vec3( n.z, 0.0, -n.x ) + vec3( 1e-6 ) ); To = normalize( To - n * dot( To, n ) );
    vec3 Bo = cross( n, To );
    vec3 Tw = normalize( vTan - N * dot( vTan, N ) ), Bw = cross( N, Tw );
    if ( uCraters > 0.0 && uKind < 1.5 ) {
      vec3 Ls = To * dot( L, Tw ) + Bo * dot( L, Bw ) + n * dot( L, N );
      vec3 grad = vec3( 0.0 );
      float albK = 1.0;
      float lum = dot( alb, vec3( 0.3, 0.6, 0.1 ) );
      float big = uCraterMare > 0.5 ? mix( 0.25, 1.0, smoothstep( 0.075, 0.12, lum ) ) : 1.0;
      float dn = 0.5 * uCraters;
      craterOctave( P, n, Ls, uRadiusKm, 40.0, dn * big, 0.0, fp, grad, craterLit, albK );
      craterOctave( P, n, Ls, uRadiusKm, 16.0, dn * big, 1.0, fp, grad, craterLit, albK );
      craterOctave( P, n, Ls, uRadiusKm, 6.4, dn * mix( 0.6, 1.0, big ), 2.0, fp, grad, craterLit, albK );
      craterOctave( P, n, Ls, uRadiusKm, 2.56, dn, 3.0, fp, grad, craterLit, albK );
      craterOctave( P, n, Ls, uRadiusKm, 1.02, dn, 4.0, fp, grad, craterLit, albK );
      craterOctave( P, n, Ls, uRadiusKm, 0.41, dn, 5.0, fp, grad, craterLit, albK );
      vec2 g = vec2( dot( grad, To ), dot( grad, Bo ) );
      Nr = normalize( Nr - ( Tw * g.x + Bw * g.y ) );
      alb *= albK;
    }
    // albedo variation below the map's texels, each octave only once it spans several pixels
    float a1 = 1.0 - smoothstep( 0.15, 0.4, fp / 20.0 ), a2 = 1.0 - smoothstep( 0.15, 0.4, fp / 2.5 ), a3 = 1.0 - smoothstep( 0.15, 0.4, fp / 0.37 );
    float d = ( fb( P * 0.05 ) - 0.5 ) * 0.6 * a1 + ( fb( P * 0.4 ) - 0.5 ) * 0.4 * uDetail * a2 + ( fb( P * 2.7 ) - 0.5 ) * 0.25 * uDetail * a3;
    alb *= 1.0 + d * ( uKind > 1.5 ? 0.15 : 0.45 );
  }
  float mu0 = dot( Nr, L ), mu = max( dot( N, V ), 0.0 ), mus = dot( N, L );
  // relief only catches the light while the Sun is above the horizon of the surrounding ground (beyond the
  // terminator a wall facing the Sun is still below its horizon)
  float horizon = smoothstep( -0.012, 0.01, mus );
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
    col = alb * uSunCol * ( ls * 1.6 + max( mu0, 0.0 ) * 0.25 ) * ( 1.0 + 0.25 * pow( max( ph, 0.0 ), 30.0 ) ) * horizon;
  } else if ( uKind < 1.5 ) {
    vec3 sunC = uSunCol * mix( vec3( 1.0, 0.55, 0.3 ), vec3( 1.0 ), smoothstep( -0.02, 0.3, mus ) );
    col = alb * sunC * max( mu0, 0.0 ) * horizon;
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
  // crater shadows: no air, but the sunlit far wall lights the shadowed floor a little
  col *= ringT * mix( 0.04, 1.0, craterLit );
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

/** sub-texture crater populations: saturated on the ancient airless surfaces, sparse where they are resurfaced */
const CRATER_DENSITY: Record<string, number> = {
  moon: 1, mercury: 1, callisto: 1, rhea: 1, iapetus: 0.9, titania: 0.8, ganymede: 0.7, phobos: 0.8, deimos: 0.5,
  mars: 0.45, enceladus: 0.5, triton: 0.12, europa: 0.06, edmunds: 0.04,
};

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
        uCraters: { value: CRATER_DENSITY[id] ?? 0 }, uCraterMare: { value: id === 'moon' ? 1 : 0 },
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
