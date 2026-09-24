// ---------------------------------------------------------------------------
// GPU procedural PBR texture baker.
//
// Each material "recipe" is a GLSL function
//     void surface(vec2 uv, out vec3 albedo, out float height, out float rough,
//                  out float metal, out float ao, out float alpha, out vec3 emis)
// built from *periodic* noise (gradient noise, fbm, Worley) so every baked
// texture tiles seamlessly. The baker renders the recipe into render targets:
//   - albedo  (sRGB render target, alpha channel = cut-out mask for leaves/hair)
//   - normal  (tangent space, derived from finite differences of `height`)
//   - ORM     (R = ambient occlusion, G = roughness, B = metalness: the glTF
//              packing three.js understands for aoMap/roughnessMap/metalnessMap)
//   - emissive (optional, e.g. lit office windows, lava cracks, sci-fi strips)
// Render targets get mipmaps + anisotropic filtering and are used directly as
// material maps - no CPU readback, so a 1024^2 set bakes in a few ms.
// A per-bake seed makes every generated entity's surfaces unique.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const NOISE_LIB = /* glsl */`
uniform float uSeed;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec4 uP;
uniform vec4 uQ;
uniform float uWorld;
varying vec2 vUv;

vec2 hash22( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}
float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
vec3 hash32( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) ); p3 += dot( p3, p3.yxz + 33.33 ); return fract( ( p3.xxy + p3.yzz ) * p3.zyx ); }
vec2 seedOff() { return vec2( uSeed * 7.123, uSeed * 3.917 ); }

// Periodic gradient noise, range ~[-1,1]. per = lattice period (integer).
float pnoise( vec2 p, vec2 per ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  vec2 so = seedOff();
  vec2 g00 = hash22( mod( i, per ) + so ) * 2.0 - 1.0;
  vec2 g10 = hash22( mod( i + vec2( 1, 0 ), per ) + so ) * 2.0 - 1.0;
  vec2 g01 = hash22( mod( i + vec2( 0, 1 ), per ) + so ) * 2.0 - 1.0;
  vec2 g11 = hash22( mod( i + vec2( 1, 1 ), per ) + so ) * 2.0 - 1.0;
  float a = dot( g00, f ), b = dot( g10, f - vec2( 1, 0 ) ), c = dot( g01, f - vec2( 0, 1 ) ), d = dot( g11, f - vec2( 1, 1 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ) * 1.6;
}
float fbm( vec2 uv, float freq, int oct ) {
  float s = 0.0, a = 0.5, n = 0.0;
  for ( int k = 0; k < 8; k ++ ) { if ( k >= oct ) break; s += a * pnoise( uv * freq, vec2( freq ) ); n += a; freq *= 2.0; a *= 0.5; }
  return s / n;
}
float fbm2( vec2 uv, vec2 freq, int oct ) {
  float s = 0.0, a = 0.5, n = 0.0;
  for ( int k = 0; k < 8; k ++ ) { if ( k >= oct ) break; s += a * pnoise( uv * freq, freq ); n += a; freq *= 2.0; a *= 0.5; }
  return s / n;
}
float ridged( vec2 uv, float freq, int oct ) {
  float s = 0.0, a = 0.5, n = 0.0;
  for ( int k = 0; k < 8; k ++ ) { if ( k >= oct ) break; float v = 1.0 - abs( pnoise( uv * freq, vec2( freq ) ) ); s += a * v * v; n += a; freq *= 2.0; a *= 0.5; }
  return s / n;
}
// Periodic Worley: x = F1, y = F2, z = cell hash, w unused.
vec4 worley( vec2 uv, vec2 freq ) {
  vec2 p = uv * freq; vec2 i = floor( p ), f = fract( p );
  float f1 = 8.0, f2 = 8.0, id = 0.0; vec2 so = seedOff();
  for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
    vec2 o = vec2( float( x ), float( y ) );
    vec2 cm = mod( i + o, freq );
    vec2 r = hash22( cm + so + 13.7 );
    vec2 d = o + r - f;
    float dd = dot( d, d );
    if ( dd < f1 ) { f2 = f1; f1 = dd; id = hash12( cm + so ); } else if ( dd < f2 ) f2 = dd;
  }
  return vec4( sqrt( f1 ), sqrt( f2 ), id, 0.0 );
}
vec3 hueShift( vec3 c, float amt ) {
  float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
  return clamp( mix( vec3( l ), c, 1.0 + amt ), 0.0, 4.0 );
}
float luma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }
`;

// Material recipes. Each defines surface(). Colours arrive in linear space.
const RECIPES = {
  plaster: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float n = fbm( uv, 6.0, 5 ), f = fbm( uv, 48.0, 3 ), g = fbm( uv + 3.1, 3.0, 4 );
  h = n * 0.35 + f * 0.25 + max( 0.0, fbm( uv, 96.0, 2 ) ) * 0.2;
  alb = uColA * ( 0.93 + 0.07 * n + 0.04 * g ) * ( 1.0 - smoothstep( 0.35, 0.8, g ) * uP.x * 0.25 );
  r = 0.86 + 0.08 * f; m = 0.0; ao = 1.0 - 0.1 * smoothstep( 0.0, -0.5, n ); a = 1.0; e = vec3( 0.0 );
}`,
  concrete: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float n = fbm( uv, 4.0, 5 ), s = fbm( uv + 7.0, 2.0, 4 );
  vec4 w = worley( uv, vec2( 64.0 ) );
  float pores = smoothstep( 0.12, 0.0, w.x ) * step( 0.7, w.z );
  float panels = uP.x > 0.0 ? smoothstep( 0.004, 0.0, abs( fract( uv.x * uP.x ) - 0.5 ) - 0.497 ) + smoothstep( 0.004, 0.0, abs( fract( uv.y * uP.y ) - 0.5 ) - 0.497 ) : 0.0;
  h = 0.5 + n * 0.2 - pores * 0.5 - panels * 0.4 + fbm( uv, 80.0, 2 ) * 0.1;
  alb = uColA * ( 0.88 + 0.12 * n ) * ( 1.0 - 0.15 * smoothstep( 0.1, 0.6, s ) ) * ( 1.0 - pores * 0.35 ) * ( 1.0 - panels * 0.3 );
  r = 0.78 + 0.12 * n; m = 0.0; ao = 1.0 - pores * 0.4 - panels * 0.3; a = 1.0; e = vec3( 0.0 );
}`,
  brick: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float rows = uP.x, cols = uP.y;
  vec2 bp = vec2( uv.x * cols, uv.y * rows );
  float row = floor( bp.y );
  bp.x += mod( row, 2.0 ) * 0.5;
  vec2 cell = floor( bp ); vec2 f = fract( bp );
  cell.x = mod( cell.x, cols );
  float bw = uWorld / cols, bh = uWorld / rows;
  vec2 fm = f * vec2( bw, bh );
  float edge = min( min( fm.x, bw - fm.x ), min( fm.y, bh - fm.y ) );
  float nEdge = fbm( uv, 32.0, 3 ) * 0.004;
  float mortarHalf = uP.z;
  float brick = smoothstep( mortarHalf, mortarHalf + 0.006, edge + nEdge );
  float hsh = hash12( cell + seedOff() );
  vec3 hs = hash32( cell + 5.0 );
  vec3 bc = uColA * ( 0.72 + 0.5 * hsh );
  bc = mix( bc, bc * vec3( 1.1, 0.85, 0.75 ), hs.x * 0.5 );
  bc = mix( bc, uColC, step( 0.9, hs.y ) * 0.6 );
  float grime = fbm( uv, 5.0, 4 );
  float spots = fbm( uv, 40.0, 3 );
  bc *= 0.9 + 0.2 * spots;
  vec3 mc = uColB * ( 0.85 + 0.15 * fbm( uv, 60.0, 2 ) );
  alb = mix( mc, bc, brick ) * ( 1.0 - 0.18 * smoothstep( 0.0, 0.6, grime ) );
  h = brick * ( 0.7 + 0.12 * spots + 0.1 * fbm( uv + 2.0, 24.0, 3 ) ) + ( 1.0 - brick ) * 0.1 * fbm( uv, 90.0, 2 );
  r = mix( 0.95, 0.82 + 0.1 * spots, brick ); m = 0.0; ao = mix( 0.6, 1.0, brick ); a = 1.0; e = vec3( 0.0 );
}`,
  stone: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec2 fr = vec2( uP.x, uP.y );
  vec2 wuv = uv + vec2( fbm( uv, 6.0, 3 ), fbm( uv + 4.0, 6.0, 3 ) ) * 0.02;
  vec4 w = worley( wuv, fr );
  float edge = w.y - w.x;
  float stoneMask = smoothstep( uP.z, uP.z + 0.08, edge );
  float n = fbm( uv, 16.0, 5 ), n2 = fbm( uv + 9.0, 4.0, 4 );
  vec3 sc = uColA * ( 0.65 + 0.55 * w.z ) * ( 0.85 + 0.25 * n );
  sc = mix( sc, uColC, smoothstep( 0.55, 0.95, hash12( vec2( w.z * 91.0, 3.0 ) ) ) * 0.5 );
  vec3 moss = vec3( 0.08, 0.13, 0.03 );
  float mossAmt = smoothstep( 0.2, 0.7, n2 ) * uQ.x;
  alb = mix( uColB * ( 0.8 + 0.2 * n ), sc, stoneMask );
  alb = mix( alb, moss, mossAmt * ( 1.0 - stoneMask * 0.5 ) );
  h = stoneMask * ( 0.55 + 0.35 * smoothstep( 0.0, 0.35, edge ) + n * 0.15 ) + ( 1.0 - stoneMask ) * 0.05;
  r = mix( 0.95, 0.75 + 0.15 * n, stoneMask ); m = 0.0; ao = mix( 0.55, 1.0, stoneMask ); a = 1.0; e = vec3( 0.0 );
}`,
  cobble: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float rows = uP.x;
  vec2 bp = uv * rows; float row = floor( bp.y ); bp.x += mod( row, 2.0 ) * 0.5 + fbm( uv, 4.0, 2 ) * 0.1;
  vec2 cell = floor( bp ); vec2 f = fract( bp ) - 0.5; cell.x = mod( cell.x, rows );
  float hs = hash12( cell + seedOff() );
  float d = length( f * vec2( 1.0, 1.1 ) + ( hash22( cell ) - 0.5 ) * 0.1 );
  float dome = smoothstep( 0.5, 0.2, d );
  float n = fbm( uv, 32.0, 3 );
  alb = mix( uColB * 0.6, uColA * ( 0.7 + 0.5 * hs ) * ( 0.9 + 0.2 * n ), smoothstep( 0.0, 0.25, dome ) );
  h = dome * 0.8 + n * 0.1; r = mix( 0.95, 0.7, dome ); m = 0.0; ao = 0.5 + 0.5 * dome; a = 1.0; e = vec3( 0.0 );
}`,
  planks: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  if ( uQ.y > 0.5 ) uv = uv.yx;  // horizontal boards (siding)
  float n = uP.x;              // planks across u
  float seg = uP.y;            // segments along v
  float pu = uv.x * n;
  float pi = floor( pu ); float pf = fract( pu );
  float off = hash12( vec2( mod( pi, n ), 1.0 ) + seedOff() );
  float pv = uv.y * seg + off * seg;
  float si = floor( pv ); float sf = fract( pv );
  vec2 id = vec2( mod( pi, n ), mod( si, seg ) );
  float hs = hash12( id + seedOff() + 3.0 );
  float gap = smoothstep( 0.0, 0.012, pf ) * smoothstep( 1.0, 0.988, pf ) * smoothstep( 0.0, 0.004, sf ) * smoothstep( 1.0, 0.996, sf );
  // Grain: stretched noise along v with rings.
  vec2 guv = vec2( uv.x * n * 1.0 + hs * 10.0, uv.y );
  float grain = fbm2( guv, vec2( n * 6.0, 2.0 ), 5 );
  float rings = sin( ( grain * 6.0 + uv.x * n * 14.0 + hs * 20.0 ) * 3.14159 ) * 0.5 + 0.5;
  float fine = fbm2( uv, vec2( n * 60.0, 4.0 ), 3 );
  vec3 wc = mix( uColA, uColB, clamp( rings * 0.55 + grain * 0.4 + 0.2, 0.0, 1.0 ) );
  wc *= 0.78 + 0.44 * hs;
  wc = hueShift( wc, ( hs - 0.5 ) * 0.2 );
  wc *= 0.93 + 0.07 * fine;
  alb = wc * mix( 0.25, 1.0, gap );
  h = gap * ( 0.8 + 0.08 * rings + 0.05 * fine ); r = uQ.x + 0.1 * rings * ( 1.0 - uQ.x ); m = 0.0; ao = mix( 0.4, 1.0, gap ); a = 1.0; e = vec3( 0.0 );
}`,
  wood: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float grain = fbm2( uv, vec2( 3.0, 24.0 ), 5 );
  float rings = sin( ( uv.x * 18.0 + grain * 4.0 ) * 6.2831 ) * 0.5 + 0.5;
  float pores = fbm2( uv, vec2( 20.0, 160.0 ), 2 );
  vec3 c = mix( uColA, uColB, smoothstep( 0.2, 0.9, rings * 0.7 + grain * 0.5 ) );
  alb = c * ( 0.92 + 0.08 * pores );
  h = rings * 0.2 + pores * 0.1; r = uQ.x + 0.08 * rings; m = 0.0; ao = 1.0; a = 1.0; e = vec3( 0.0 );
}`,
  bark: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec2 wuv = uv + vec2( fbm2( uv, vec2( 3.0, 2.0 ), 3 ) * 0.08, 0.0 );
  vec4 w = worley( wuv, vec2( uP.x, uP.y ) );
  float ridge = smoothstep( 0.0, 0.5, w.y - w.x );
  float n = fbm2( uv, vec2( 8.0, 32.0 ), 4 );
  float lich = smoothstep( 0.35, 0.6, fbm( uv + 5.0, 4.0, 4 ) ) * uQ.x;
  vec3 c = uColA * ( 0.55 + 0.6 * ridge ) * ( 0.85 + 0.3 * n );
  // Birch-like horizontal marks when uQ.y > 0.
  float marks = uQ.y * smoothstep( 0.55, 0.8, fbm2( uv, vec2( 2.0, 24.0 ), 3 ) ) * smoothstep( 0.3, 0.7, pnoise( uv * vec2( 6.0, 40.0 ), vec2( 6.0, 40.0 ) ) );
  c = mix( c, uColB, lich );
  c = mix( c, vec3( 0.02 ), marks );
  alb = c;
  h = ridge * 0.8 + n * 0.2; r = 0.92; m = 0.0; ao = 0.5 + 0.5 * ridge; a = 1.0; e = vec3( 0.0 );
}`,
  rooftiles: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float rows = uP.x, cols = uP.y;
  vec2 p = vec2( uv.x * cols, uv.y * rows );
  float row = floor( p.y ); p.x += mod( row, 2.0 ) * 0.5 * uP.z;
  vec2 cell = floor( p ); vec2 f = fract( p ); cell.x = mod( cell.x, cols );
  float hs = hash12( cell + seedOff() );
  // Curved (barrel) profile across, overlapping ramp along rows.
  float barrel = uP.w > 0.5 ? sin( f.x * 3.14159 ) : smoothstep( 0.0, 0.06, f.x ) * smoothstep( 1.0, 0.94, f.x );
  float ramp = f.y;
  float lip = smoothstep( 0.0, 0.08, f.y );
  float n = fbm( uv, 24.0, 3 );
  h = barrel * 0.5 + ramp * 0.35 + n * 0.05;
  vec3 c = uColA * ( 0.7 + 0.45 * hs ) * ( 0.9 + 0.2 * n );
  c = mix( c, uColB, smoothstep( 0.6, 0.9, fbm( uv, 4.0, 3 ) ) * 0.4 );
  alb = c * mix( 0.45, 1.0, lip );
  r = 0.7 + 0.2 * n; m = 0.0; ao = mix( 0.5, 1.0, lip ) * ( 0.8 + 0.2 * barrel ); a = 1.0; e = vec3( 0.0 );
}`,
  metal: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float brush = fbm2( uv, vec2( 2.0, 256.0 ), 3 ) * uP.y;
  float n = fbm( uv, 8.0, 4 );
  float scratch = smoothstep( 0.96, 1.0, ridged( uv + 1.3, 12.0, 3 ) ) * uP.z;
  alb = uColA * ( 0.92 + 0.06 * brush + 0.04 * n );
  h = brush * 0.15 - scratch * 0.3;
  r = clamp( uP.x + brush * 0.08 + n * 0.05 + scratch * 0.2, 0.02, 1.0 ); m = 1.0; ao = 1.0; a = 1.0; e = vec3( 0.0 );
}`,
  painted: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float n = fbm( uv, 6.0, 4 );
  float chip = smoothstep( 0.62, 0.7, fbm( uv + 2.0, 10.0, 5 ) ) * uP.y;
  float orange = fbm( uv, 120.0, 2 ) * 0.1;
  alb = mix( uColA * ( 0.95 + 0.05 * n ), uColB, chip );
  h = orange * ( 1.0 - chip ) - chip * 0.3;
  r = mix( uP.x + n * 0.04, 0.5, chip ); m = chip * 0.9; ao = 1.0 - chip * 0.2; a = 1.0; e = vec3( 0.0 );
}`,
  rust: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float n = fbm( uv, 5.0, 5 ), n2 = fbm( uv + 4.0, 24.0, 4 );
  float rust = smoothstep( 0.35 - uP.x, 0.65 - uP.x, n * 0.5 + 0.5 + n2 * 0.2 );
  vec3 rc = mix( vec3( 0.25, 0.07, 0.02 ), vec3( 0.55, 0.22, 0.06 ), n2 * 0.5 + 0.5 );
  alb = mix( uColA, rc, rust );
  h = rust * ( 0.3 + n2 * 0.3 ); r = mix( 0.4, 0.95, rust ); m = 1.0 - rust; ao = 1.0 - rust * 0.2; a = 1.0; e = vec3( 0.0 );
}`,
  knit: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  // Jersey knit: rows of small V loops.
  vec2 p = uv * vec2( uP.x, uP.x * 1.3 );
  vec2 c = floor( p ); vec2 f = fract( p );
  float v = abs( f.x - 0.5 ) * 2.0;
  float loop = smoothstep( 0.0, 0.6, 1.0 - abs( f.y - 0.5 - ( v - 0.5 ) * 0.6 ) * 2.0 );
  float n = fbm( uv, 16.0, 4 );
  float fuzz = fbm( uv, 256.0, 2 );
  h = loop * 0.6 + fuzz * 0.15 + n * 0.1;
  alb = uColA * ( 0.88 + 0.12 * loop ) * ( 0.95 + 0.05 * n );
  r = 0.9; m = 0.0; ao = 0.8 + 0.2 * loop; a = 1.0; e = vec3( 0.0 );
}`,
  denim: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float f = uP.x;
  // 3/1 twill: diagonal ridges.
  float diag = fract( ( uv.x + uv.y ) * f );
  float ridge = smoothstep( 0.0, 0.35, diag ) * smoothstep( 1.0, 0.65, diag );
  float warpN = fbm2( uv, vec2( 4.0, f * 0.5 ), 4 );
  float slub = fbm2( uv, vec2( f * 0.25, 3.0 ), 3 );
  float fade = smoothstep( -0.2, 0.6, fbm( uv, 3.0, 4 ) ) * uP.y;
  vec3 indigo = uColA * ( 0.8 + 0.3 * warpN + 0.2 * slub );
  vec3 weft = uColB;
  vec3 c = mix( weft, indigo, 0.7 + 0.3 * ridge );
  c = mix( c, mix( c, weft, 0.5 ), fade );
  alb = c;
  h = ridge * 0.5 + slub * 0.2 + fbm( uv, 200.0, 2 ) * 0.1;
  r = 0.92; m = 0.0; ao = 0.85 + 0.15 * ridge; a = 1.0; e = vec3( 0.0 );
}`,
  weave: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec2 p = uv * uP.x; vec2 c = floor( p ); vec2 f = fract( p );
  float over = mod( c.x + c.y, 2.0 );
  float tx = sin( f.x * 3.14159 ), ty = sin( f.y * 3.14159 );
  h = over > 0.5 ? tx * 0.6 + ty * 0.2 : ty * 0.6 + tx * 0.2;
  float n = fbm( uv, 32.0, 3 );
  // Optional plaid using colour B/C bands.
  float plaid = uP.y;
  float bandU = step( 0.5, fract( uv.x * uP.z ) ), bandV = step( 0.5, fract( uv.y * uP.z ) );
  float bu2 = step( 0.85, fract( uv.x * uP.z * 2.0 + 0.3 ) ), bv2 = step( 0.85, fract( uv.y * uP.z * 2.0 + 0.3 ) );
  vec3 base = uColA;
  vec3 pl = mix( mix( base, uColB, ( bandU + bandV ) * 0.35 ), uColC, max( bu2, bv2 ) * 0.8 );
  alb = mix( base, pl, plaid ) * ( 0.9 + 0.1 * h ) * ( 0.95 + 0.05 * n );
  r = 0.88; m = 0.0; ao = 0.85 + 0.15 * h; a = 1.0; e = vec3( 0.0 );
}`,
  leather: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec4 w = worley( uv, vec2( uP.x ) );
  float peb = smoothstep( 0.0, 0.45, w.y - w.x );
  float n = fbm( uv, 6.0, 4 );
  alb = uColA * ( 0.8 + 0.2 * peb ) * ( 0.9 + 0.15 * n );
  h = peb * 0.5 + n * 0.1; r = 0.45 + 0.2 * ( 1.0 - peb ); m = 0.0; ao = 0.8 + 0.2 * peb; a = 1.0; e = vec3( 0.0 );
}`,
  marble: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float t = fbm( uv, 3.0, 6 );
  float v = abs( sin( ( uv.x * 2.0 + uv.y * 3.0 ) * 6.2831 + t * 8.0 ) );
  float vein = pow( 1.0 - v, 12.0 ) + pow( 1.0 - abs( sin( ( uv.y * 4.0 + t * 5.0 ) * 6.2831 ) ), 30.0 ) * 0.5;
  float cloud = fbm( uv + 3.0, 5.0, 5 );
  alb = mix( uColA * ( 0.92 + 0.08 * cloud ), uColB, clamp( vein, 0.0, 1.0 ) );
  h = cloud * 0.05; r = uP.x + vein * 0.05; m = 0.0; ao = 1.0; a = 1.0; e = vec3( 0.0 );
}`,
  granite: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec4 w = worley( uv, vec2( 90.0 ) );
  float n = fbm( uv, 40.0, 3 );
  vec3 c = mix( uColA, uColB, step( 0.6, w.z ) );
  c = mix( c, uColC, step( 0.9, w.z ) );
  alb = c * ( 0.85 + 0.25 * n );
  h = n * 0.1; r = uP.x; m = 0.0; ao = 1.0; a = 1.0; e = vec3( 0.0 );
}`,
  tiles: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec2 p = uv * vec2( uP.x, uP.y );
  vec2 c = floor( p ); vec2 f = fract( p ); c = mod( c, vec2( uP.x, uP.y ) );
  vec2 tsz = vec2( uWorld / uP.x, uWorld / uP.y );
  vec2 fm = f * tsz;
  float edge = min( min( fm.x, tsz.x - fm.x ), min( fm.y, tsz.y - fm.y ) );
  float tile = smoothstep( uP.z, uP.z + 0.002, edge );
  float hs = hash12( c + seedOff() );
  float checker = mod( c.x + c.y, 2.0 ) * uP.w;
  vec3 tc = mix( uColA, uColC, checker ) * ( 0.9 + 0.12 * hs );
  float n = fbm( uv, 20.0, 3 );
  alb = mix( uColB, tc * ( 0.97 + 0.03 * n ), tile );
  h = tile * ( 0.6 + smoothstep( uP.z, uP.z + 0.01, edge ) * 0.2 ); r = mix( 0.9, uQ.x + 0.05 * n, tile ); m = 0.0; ao = mix( 0.6, 1.0, tile ); a = 1.0; e = vec3( 0.0 );
}`,
  asphalt: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec4 w = worley( uv, vec2( 160.0 ) );
  float agg = smoothstep( 0.3, 0.0, w.x );
  float n = fbm( uv, 6.0, 4 );
  alb = uColA * ( 0.75 + 0.5 * agg * w.z + 0.15 * n );
  h = agg * 0.5 + n * 0.1; r = 0.85 - agg * 0.1; m = 0.0; ao = 0.8 + 0.2 * agg; a = 1.0; e = vec3( 0.0 );
}`,
  gravel: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec4 w = worley( uv, vec2( uP.x ) );
  vec4 w2 = worley( uv + 0.37, vec2( uP.x * 1.7 ) );
  float peb = smoothstep( 0.55, 0.1, w.x );
  float peb2 = smoothstep( 0.5, 0.1, w2.x );
  float p = max( peb, peb2 * 0.8 );
  vec3 c = mix( uColA, uColB, w.z ) * ( 0.6 + 0.4 * p );
  alb = mix( uColC * 0.5, c, smoothstep( 0.0, 0.3, p ) );
  h = p; r = 0.9 - p * 0.15; m = 0.0; ao = 0.45 + 0.55 * p; a = 1.0; e = vec3( 0.0 );
}`,
  grass: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float n = fbm( uv, 4.0, 4 ), n2 = fbm( uv + 5.0, 12.0, 4 );
  float blades = fbm2( uv, vec2( 180.0, 60.0 ), 3 ) * 0.5 + fbm2( uv + 1.7, vec2( 60.0, 200.0 ), 3 ) * 0.5;
  vec3 c = mix( uColA, uColB, smoothstep( -0.5, 0.6, n ) );
  c = mix( c, uColC, smoothstep( 0.35, 0.8, n2 ) * 0.15 );
  c *= 0.86 + 0.28 * ( blades * 0.5 + 0.5 );
  alb = c;
  h = blades * 0.6 + 0.5; r = 0.9; m = 0.0; ao = 0.75 + 0.25 * ( blades * 0.5 + 0.5 ); a = 1.0; e = vec3( 0.0 );
}`,
  dirt: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float n = fbm( uv, 6.0, 5 ), n2 = fbm( uv + 3.0, 30.0, 3 );
  vec4 w = worley( uv, vec2( 48.0 ) );
  float peb = smoothstep( 0.25, 0.05, w.x ) * step( 0.55, w.z );
  vec3 c = mix( uColA, uColB, smoothstep( -0.3, 0.5, n ) ) * ( 0.85 + 0.25 * n2 );
  c = mix( c, uColC, peb * 0.7 );
  alb = c;
  h = 0.4 + n * 0.3 + peb * 0.4 + n2 * 0.1; r = 0.95 - peb * 0.2; m = 0.0; ao = 0.8 + 0.2 * n; a = 1.0; e = vec3( 0.0 );
}`,
  rock: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec2 wuv = uv + vec2( fbm( uv, 3.0, 3 ), fbm( uv + 2.0, 3.0, 3 ) ) * 0.08;
  float strata = sin( ( wuv.y * uP.x + fbm( uv, 2.0, 3 ) * 2.0 ) * 6.2831 ) * 0.5 + 0.5;
  vec4 w = worley( wuv, vec2( 8.0 ) );
  float cracks = smoothstep( 0.02, 0.0, w.y - w.x - 0.02 );
  float n = fbm( uv, 12.0, 5 ), n2 = ridged( uv, 6.0, 4 );
  vec3 c = mix( uColA, uColB, strata * 0.6 + n * 0.3 ) * ( 0.8 + 0.3 * n2 );
  c = mix( c, uColC, smoothstep( 0.5, 0.8, fbm( uv + 7.0, 5.0, 3 ) ) * 0.4 );
  alb = c * ( 1.0 - cracks * 0.5 );
  h = n2 * 0.6 + n * 0.3 - cracks * 0.5 + strata * 0.1; r = 0.85 + 0.1 * n; m = 0.0; ao = ( 0.7 + 0.3 * n2 ) * ( 1.0 - cracks * 0.4 ); a = 1.0; e = vec3( 0.0 );
}`,
  sand: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float ripple = sin( ( uv.y * uP.x + fbm( uv, 3.0, 3 ) * 3.0 ) * 6.2831 ) * 0.5 + 0.5;
  float grain = fbm( uv, 200.0, 2 );
  float n = fbm( uv, 5.0, 4 );
  alb = mix( uColA, uColB, n * 0.5 + 0.5 ) * ( 0.92 + 0.1 * grain );
  h = ripple * 0.4 + grain * 0.2; r = 0.93; m = 0.0; ao = 0.9 + 0.1 * ripple; a = 1.0; e = vec3( 0.0 );
}`,
  snow: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float n = fbm( uv, 4.0, 5 ), g = fbm( uv, 120.0, 2 );
  alb = uColA * ( 0.94 + 0.06 * n );
  h = n * 0.5 + g * 0.1; r = 0.6 + 0.2 * g; m = 0.0; ao = 1.0; a = 1.0; e = vec3( 0.0 );
}`,
  forest: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec4 w = worley( uv, vec2( 40.0 ) );
  vec4 w2 = worley( uv + 0.5, vec2( 70.0 ) );
  float leaf = smoothstep( 0.45, 0.2, w.x );
  float leaf2 = smoothstep( 0.45, 0.2, w2.x );
  vec3 c1 = mix( vec3( 0.18, 0.09, 0.03 ), vec3( 0.35, 0.2, 0.05 ), w.z );
  vec3 c2 = mix( vec3( 0.22, 0.12, 0.04 ), vec3( 0.12, 0.1, 0.03 ), w2.z );
  vec3 soil = uColA * ( 0.8 + 0.2 * fbm( uv, 10.0, 3 ) );
  alb = mix( soil, mix( c1, c2, leaf2 ), max( leaf, leaf2 ) * 0.9 );
  h = max( leaf, leaf2 ) * 0.5; r = 0.9; m = 0.0; ao = 0.6 + 0.4 * max( leaf, leaf2 ); a = 1.0; e = vec3( 0.0 );
}`,
  thatch: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float strands = fbm2( uv, vec2( 180.0, 4.0 ), 3 );
  float layers = fract( uv.y * uP.x );
  float n = fbm( uv, 6.0, 4 );
  vec3 c = mix( uColA, uColB, strands * 0.5 + 0.5 ) * ( 0.8 + 0.3 * n );
  alb = c * ( 0.55 + 0.45 * layers );
  h = strands * 0.4 + layers * 0.5; r = 0.95; m = 0.0; ao = 0.5 + 0.5 * layers; a = 1.0; e = vec3( 0.0 );
}`,
  carpet: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float f = fbm( uv, 256.0, 2 ), n = fbm( uv, 8.0, 3 );
  float pattern = uP.x > 0.0 ? step( 0.5, fract( length( uv - 0.5 ) * uP.x ) ) : 0.0;
  alb = mix( uColA, uColB, pattern ) * ( 0.85 + 0.15 * f ) * ( 0.95 + 0.05 * n );
  h = f * 0.5; r = 0.98; m = 0.0; ao = 0.85 + 0.15 * f; a = 1.0; e = vec3( 0.0 );
}`,
  skin: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec4 w = worley( uv, vec2( uP.x ) );
  float pores = smoothstep( 0.18, 0.0, w.x );
  float fine = fbm( uv, 64.0, 3 );
  float blotch = fbm( uv, 6.0, 4 );
  float freckle = smoothstep( 0.72, 0.8, fbm( uv, 40.0, 3 ) * 0.5 + 0.5 ) * uP.y;
  alb = vec3( 1.0 ) * ( 0.96 + 0.04 * blotch ) * ( 1.0 - pores * 0.05 );
  alb = mix( alb, vec3( 0.75, 0.55, 0.45 ), freckle );
  alb = mix( alb, alb * vec3( 1.04, 0.96, 0.95 ), smoothstep( 0.0, 0.6, blotch ) );
  h = 0.5 - pores * 0.35 + fine * 0.2; r = 0.5 + 0.12 * fine + pores * 0.1; m = 0.0; ao = 1.0 - pores * 0.15; a = 1.0; e = vec3( 0.0 );
}`,
  hair: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float strands = fbm2( uv, vec2( 128.0, 2.0 ), 4 );
  float fine = fbm2( uv, vec2( 400.0, 4.0 ), 2 );
  float n = fbm( uv, 4.0, 3 );
  alb = uColA * ( 0.7 + 0.4 * ( strands * 0.5 + 0.5 ) ) * ( 0.9 + 0.2 * n );
  alb = mix( alb, uColB, smoothstep( 0.4, 0.9, fine ) * 0.3 );
  h = strands * 0.5 + fine * 0.3; r = 0.45 + 0.15 * fine; m = 0.0; ao = 0.8 + 0.2 * strands; a = 1.0; e = vec3( 0.0 );
}`,
  hairCard: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float x = uv.x * uP.x;
  float lane = floor( x ); float fx = fract( x );
  float hs = hash12( vec2( lane, 7.0 ) + seedOff() );
  float wave = sin( uv.y * 12.0 + hs * 6.28 ) * 0.08 * uP.y;
  float d = abs( fx - 0.5 + wave );
  float width = 0.32 * ( 1.0 - uv.y * 0.3 );
  float strand = smoothstep( width, width * 0.4, d );
  float len = 0.75 + 0.25 * hs;
  float tip = smoothstep( 1.0 - len + 0.02, 1.0 - len + 0.2, uv.y );
  a = strand * tip;
  alb = uColA * ( 0.65 + 0.6 * hs ) * ( 0.8 + 0.2 * uv.y );
  h = strand; r = 0.4 + 0.2 * hs; m = 0.0; ao = 0.4 + 0.6 * uv.y; e = vec3( 0.0 );
}`,
  fur: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float s = fbm2( uv, vec2( 60.0, 16.0 ), 4 );
  float f = fbm2( uv, vec2( 200.0, 40.0 ), 2 );
  float n = fbm( uv, 5.0, 3 );
  alb = uColA * ( 0.75 + 0.35 * ( s * 0.5 + 0.5 ) ) * ( 0.9 + 0.15 * n );
  h = s * 0.6 + f * 0.3; r = 0.8; m = 0.0; ao = 0.75 + 0.25 * s; a = 1.0; e = vec3( 0.0 );
}`,
  scales: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec2 p = uv * vec2( uP.x, uP.x * 1.5 );
  float row = floor( p.y ); p.x += mod( row, 2.0 ) * 0.5;
  vec2 c = floor( p ); vec2 f = fract( p ) - vec2( 0.5, 0.0 );
  float d = length( f * vec2( 1.0, 1.3 ) );
  float sc = smoothstep( 0.62, 0.3, d );
  float hs = hash12( mod( c, vec2( uP.x, uP.x * 1.5 ) ) + seedOff() );
  alb = mix( uColB, uColA * ( 0.8 + 0.4 * hs ), sc ) * ( 0.8 + 0.2 * f.y );
  h = sc * ( 0.4 + f.y * 0.6 ); r = 0.45 + 0.2 * ( 1.0 - sc ); m = uP.y * sc; ao = 0.6 + 0.4 * sc; a = 1.0; e = vec3( 0.0 );
}`,
  leaves: /* glsl */`
// Leaf cluster atlas card with alpha. uP.x = shape (0 broad,1 needles,2 frond,3 blossom,4 lobed), uP.y = count.
float leafShape( vec2 p, float shape ) {
  if ( shape < 0.5 ) { float w = 0.42 * sin( clamp( p.y, 0.0, 1.0 ) * 3.14159 ) * ( 1.0 - p.y * 0.3 ); return abs( p.x ) - w; }
  if ( shape < 1.5 ) { return abs( p.x ) - 0.035; }
  if ( shape < 2.5 ) { float w = 0.12 * ( 1.0 - p.y ); return abs( p.x ) - w; }
  if ( shape < 3.5 ) { float ang = atan( p.x, p.y - 0.5 ); float rr = length( vec2( p.x, p.y - 0.5 ) ); return rr - 0.3 * ( 0.75 + 0.25 * cos( ang * 5.0 ) ); }
  float ang = atan( p.x, p.y - 0.35 ); float rr = length( vec2( p.x, p.y - 0.35 ) ); return rr - 0.38 * ( 0.7 + 0.3 * abs( cos( ang * 2.5 ) ) );
}
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float shape = uP.x; float count = uP.y;
  a = 0.0; h = 0.0; alb = uColA; ao = 1.0;
  if ( shape > 4.5 ) {
    // Pinnate frond (palms, ferns): rachis along v with slanted leaflets.
    float ax = abs( uv.x - 0.5 );
    float rachis = smoothstep( 0.012, 0.004, ax ) * step( uv.y, 0.98 );
    float rows = 34.0;
    float sl = ( uv.y - ax * 0.7 ) * rows;
    float t = fract( sl );
    float leaflet = smoothstep( 0.5, 0.15, abs( t - 0.5 ) ) * step( ax, 0.46 * ( 1.0 - uv.y * 0.85 ) * ( 0.8 + 0.2 * sin( floor( sl ) * 1.7 ) ) ) * step( 0.03, uv.y );
    a = max( rachis, leaflet );
    float hs = hash12( vec2( floor( sl ), sign( uv.x - 0.5 ) ) + seedOff() );
    alb = mix( uColA, uColB, hs ) * ( 0.75 + 0.35 * ( 1.0 - ax * 2.0 ) );
    alb = mix( alb, uColC, rachis * 0.6 );
    h = leaflet * ( 1.0 - abs( t - 0.5 ) * 2.0 ) * 0.6 + rachis * 0.8;
    r = 0.5; m = 0.0; e = vec3( 0.0 );
    return;
  }
  float bestD = 1.0; float bestHs = 0.0; float vein = 0.0;
  for ( int i = 0; i < 40; i ++ ) {
    if ( float( i ) >= count ) break;
    vec3 hs = hash32( vec2( float( i ) * 7.13, uSeed ) );
    vec2 base = vec2( 0.5, 0.05 ) + vec2( ( hs.x - 0.5 ) * 0.7, hs.y * 0.75 );
    float ang = ( hs.z - 0.5 ) * 2.2 + ( base.x - 0.5 ) * 1.5;
    float len = shape > 0.5 && shape < 1.5 ? 0.35 : ( shape > 2.5 ? 0.22 : 0.28 );
    len *= 0.75 + 0.5 * hs.y;
    vec2 d = uv - base;
    float cs = cos( ang ), sn = sin( ang );
    vec2 q = vec2( cs * d.x - sn * d.y, sn * d.x + cs * d.y ) / len;
    float sd = leafShape( q, shape );
    if ( q.y > -0.05 && q.y < 1.05 && sd < 0.0 ) {
      if ( sd < bestD ) { bestD = sd; bestHs = hs.x; vein = smoothstep( 0.03, 0.0, abs( q.x ) ) + smoothstep( 0.02, 0.0, abs( abs( q.x ) - fract( q.y * 4.0 ) * 0.25 ) ) * 0.4; }
      a = 1.0;
      h = max( h, 0.5 - sd * 2.0 );
    }
  }
  vec3 c = mix( uColA, uColB, bestHs );
  c = mix( c, uColC, smoothstep( 0.7, 1.0, bestHs ) * 0.5 );
  alb = c * ( 0.9 - vein * 0.25 ) * ( 0.85 + 0.15 * fbm( uv, 16.0, 3 ) );
  h -= vein * 0.1;
  r = 0.55 + 0.2 * bestHs; m = 0.0; e = vec3( 0.0 );
}`,
  books: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  // Row of book spines: variable widths via hashed cumulative cells.
  float x = uv.x * uP.x;
  float i = floor( x ); float f = fract( x );
  vec3 hs = hash32( vec2( mod( i, uP.x ), 1.0 ) + seedOff() );
  float top = 0.72 + 0.26 * hs.y;
  float book = step( uv.y, top ) * smoothstep( 0.0, 0.06, f ) * smoothstep( 1.0, 0.94, f );
  vec3 pal = hs.z < 0.33 ? uColA : ( hs.z < 0.66 ? uColB : uColC );
  vec3 bc = hueShift( pal * ( 0.5 + 0.8 * hs.x ), ( hs.y - 0.5 ) * 0.6 );
  float band = step( abs( uv.y - top * 0.82 ), 0.02 ) + step( abs( uv.y - top * 0.18 ), 0.015 );
  float title = step( abs( uv.y - top * 0.55 ), 0.08 ) * step( abs( f - 0.5 ), 0.2 ) * step( 0.5, fbm( vec2( f * 3.0, uv.y * 40.0 ), 16.0, 2 ) );
  bc = mix( bc, vec3( 0.8, 0.6, 0.2 ), clamp( band * step( 0.5, hs.x ) + title * 0.8, 0.0, 1.0 ) );
  float round = sin( f * 3.14159 );
  alb = mix( vec3( 0.03, 0.02, 0.015 ), bc * ( 0.7 + 0.3 * round ), book );
  h = book * ( 0.4 + 0.5 * round ); r = mix( 0.9, 0.55, book ); m = band * book * 0.8 * step( 0.5, hs.x ); ao = mix( 0.2, 1.0, book ); a = 1.0; e = vec3( 0.0 );
}`,
  facade: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec2 p = uv * vec2( uP.x, uP.y );
  vec2 c = floor( p ); vec2 f = fract( p );
  c = mod( c, vec2( uP.x, uP.y ) );
  float mw = uP.z;
  float frameX = smoothstep( mw, mw + 0.01, f.x ) * smoothstep( 1.0 - mw, 1.0 - mw - 0.01, f.x );
  float frameY = smoothstep( mw * 1.6, mw * 1.6 + 0.01, f.y ) * smoothstep( 1.0 - mw * 0.6, 1.0 - mw * 0.6 - 0.01, f.y );
  float glass = frameX * frameY;
  float hs = hash12( c + seedOff() );
  float lit = step( 1.0 - uP.w, hash12( c + seedOff() + 17.0 ) );
  vec3 interior = mix( vec3( 1.0, 0.75, 0.45 ), vec3( 0.8, 0.9, 1.0 ), step( 0.7, hs ) );
  float blinds = step( 0.6, hash12( c + 3.3 ) ) * step( 0.5, fract( f.y * 14.0 ) ) * 0.4;
  alb = mix( uColB, uColA * ( 0.85 + 0.3 * hs ), glass );
  e = interior * lit * glass * ( 1.0 - blinds ) * ( 0.6 + 0.4 * f.y );
  h = ( 1.0 - glass ) * 0.8; r = mix( 0.45, 0.04 + 0.05 * hs, glass ); m = mix( 0.8, 0.9, glass ); ao = mix( 0.8, 1.0, glass ); a = 1.0;
}`,
  panels: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec2 p = uv * uP.x; vec2 c = floor( p ); vec2 f = fract( p ); c = mod( c, vec2( uP.x ) );
  vec3 hs = hash32( c + seedOff() );
  // Merge some cells horizontally for variety.
  vec2 fm = f;
  if ( hs.x > 0.6 ) fm.x = fract( p.x * 0.5 );
  float edge = min( min( fm.x, 1.0 - fm.x ), min( fm.y, 1.0 - fm.y ) );
  float groove = smoothstep( 0.015, 0.03, edge );
  float bolt = smoothstep( 0.035, 0.02, length( f - vec2( 0.08 ) ) ) + smoothstep( 0.035, 0.02, length( f - vec2( 0.92, 0.08 ) ) );
  float strip = step( 0.85, hs.y ) * step( abs( f.y - 0.5 ), 0.04 ) * step( abs( f.x - 0.5 ), 0.35 );
  vec3 base = mix( uColA, uColB, step( 0.75, hs.z ) ) * ( 0.9 + 0.1 * fbm( uv, 32.0, 2 ) );
  alb = base * mix( 0.3, 1.0, groove ) * ( 1.0 - bolt * 0.3 );
  e = uColC * strip * uQ.x * 3.0;
  h = groove * ( 0.6 + hs.z * 0.2 ) + bolt * 0.3; r = uQ.y + 0.1 * hs.x; m = uQ.z; ao = mix( 0.4, 1.0, groove ); a = 1.0;
}`,
  stripes: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float t = fract( ( uv.x * cos( uP.y ) + uv.y * sin( uP.y ) ) * uP.x );
  float s = smoothstep( 0.48, 0.52, t ) - smoothstep( 0.98, 1.0, t );
  alb = mix( uColA, uColB, s ); h = fbm( uv, 16.0, 2 ) * 0.1; r = uP.z; m = 0.0; ao = 1.0; a = 1.0; e = vec3( 0.0 );
}`,
  plastic: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float n = fbm( uv, 8.0, 3 ), f = fbm( uv, 128.0, 2 );
  alb = uColA * ( 0.97 + 0.03 * n ); h = f * 0.05; r = uP.x + 0.03 * n; m = 0.0; ao = 1.0; a = 1.0; e = vec3( 0.0 );
}`,
  rubber: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float tread = uP.x > 0.0 ? step( 0.5, fract( uv.x * uP.x + step( 0.5, fract( uv.y * 3.0 ) ) * 0.5 ) ) : 1.0;
  float n = fbm( uv, 40.0, 2 );
  alb = uColA * ( 0.9 + 0.1 * n ); h = tread * 0.8 + n * 0.1; r = 0.85; m = 0.0; ao = 0.6 + 0.4 * tread; a = 1.0; e = vec3( 0.0 );
}`,
  ice: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec4 w = worley( uv, vec2( 6.0 ) );
  float crack = smoothstep( 0.03, 0.0, w.y - w.x );
  float n = fbm( uv, 8.0, 4 );
  alb = mix( uColA, vec3( 0.95 ), crack * 0.6 ) * ( 0.9 + 0.1 * n );
  h = n * 0.2 - crack * 0.3; r = 0.08 + crack * 0.3 + n * 0.03; m = 0.0; ao = 1.0; a = 1.0; e = vec3( 0.0 );
}`,
  lava: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec2 wuv = uv + vec2( fbm( uv, 4.0, 3 ), fbm( uv + 3.0, 4.0, 3 ) ) * 0.06;
  vec4 w = worley( wuv, vec2( 7.0 ) );
  float crack = smoothstep( 0.12, 0.0, w.y - w.x );
  float n = fbm( uv, 16.0, 4 );
  alb = mix( vec3( 0.03, 0.025, 0.02 ) * ( 0.8 + 0.4 * n ), vec3( 0.5, 0.1, 0.0 ), crack );
  e = mix( vec3( 1.0, 0.25, 0.02 ), vec3( 1.0, 0.8, 0.3 ), crack * crack ) * crack * 4.0;
  h = ( 1.0 - crack ) * ( 0.6 + n * 0.3 ); r = mix( 0.9, 0.6, crack ); m = 0.0; ao = 1.0; a = 1.0;
}`,
  crystal: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  vec4 w = worley( uv, vec2( 5.0 ) );
  float facet = w.x;
  float n = fbm( uv, 8.0, 3 );
  alb = mix( uColA, uColB, facet ) ; h = facet * 0.6; r = 0.05 + n * 0.05; m = 0.0; ao = 1.0; a = 1.0;
  e = uColA * smoothstep( 0.6, 0.0, facet ) * uP.x;
}`,
  water: /* glsl */`
void surface( vec2 uv, out vec3 alb, out float h, out float r, out float m, out float ao, out float a, out vec3 e ) {
  float w1 = fbm2( uv, vec2( 4.0, 4.0 ), 5 );
  float w2 = ridged( uv + 0.3, 8.0, 4 );
  h = w1 * 0.6 + w2 * 0.4; alb = uColA; r = 0.05; m = 0.0; ao = 1.0; a = 1.0; e = vec3( 0.0 );
}`,
};

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

function makeFrag(recipe) {
  return NOISE_LIB + RECIPES[recipe] + /* glsl */`
uniform int uOut;
uniform vec2 uTexel;
uniform float uNormalScale;
void main() {
  vec3 alb; float h, r, m, ao, a; vec3 e;
  surface( vUv, alb, h, r, m, ao, a, e );
  if ( uOut == 0 ) {
    gl_FragColor = vec4( clamp( alb, 0.0, 1.0 ), a );
  } else if ( uOut == 1 ) {
    vec3 a2; float h1, h2, r2, m2, o2, al2; vec3 e2;
    surface( vUv + vec2( uTexel.x, 0.0 ), a2, h1, r2, m2, o2, al2, e2 );
    surface( vUv + vec2( 0.0, uTexel.y ), a2, h2, r2, m2, o2, al2, e2 );
    vec3 n = normalize( vec3( ( h - h1 ) * uNormalScale, ( h - h2 ) * uNormalScale, 1.0 ) );
    gl_FragColor = vec4( n * 0.5 + 0.5, 1.0 );
  } else if ( uOut == 2 ) {
    gl_FragColor = vec4( clamp( ao, 0.0, 1.0 ), clamp( r, 0.02, 1.0 ), clamp( m, 0.0, 1.0 ), 1.0 );
  } else {
    gl_FragColor = vec4( max( e, 0.0 ) / ( 1.0 + max( e, 0.0 ) ), 1.0 );
  }
}`;
}

export const RECIPE_NAMES = Object.keys(RECIPES);
export const EMISSIVE_RECIPES = new Set(['facade', 'panels', 'lava', 'crystal']);

export class TextureBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo, null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.programs = new Map();
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.bakeCount = 0;
  }

  _material(recipe) {
    let m = this.programs.get(recipe);
    if (!m) {
      m = new THREE.ShaderMaterial({
        name: 'bake_' + recipe,
        vertexShader: VERT,
        fragmentShader: makeFrag(recipe),
        uniforms: {
          uSeed: { value: 0 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uColC: { value: new THREE.Color() },
          uP: { value: new THREE.Vector4() }, uQ: { value: new THREE.Vector4() }, uWorld: { value: 1 },
          uOut: { value: 0 }, uTexel: { value: new THREE.Vector2() }, uNormalScale: { value: 1 },
        },
        depthTest: false, depthWrite: false,
      });
      m.onBeforeCompile = () => {}; // no global uniforms needed
      this.programs.set(recipe, m);
    }
    return m;
  }

  _target(size, colorSpace, withAlpha) {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: true, depthBuffer: false, type: THREE.UnsignedByteType,
      colorSpace: colorSpace || THREE.NoColorSpace,
    });
    rt.texture.anisotropy = this.anisotropy;
    rt.texture.userData.hasAlpha = !!withAlpha;
    return rt;
  }

  // Bake a texture set. Returns { map, normalMap, ormMap, emissiveMap?, targets[] }.
  bake(recipe, p) {
    if (!RECIPES[recipe]) recipe = 'plaster';
    const size = p.size || 512;
    const mat = this._material(recipe);
    const u = mat.uniforms;
    u.uSeed.value = (p.seed || 0) % 997;
    u.uColA.value.copy(p.colA || new THREE.Color(0.8, 0.8, 0.8));
    u.uColB.value.copy(p.colB || new THREE.Color(0.4, 0.4, 0.4));
    u.uColC.value.copy(p.colC || new THREE.Color(0.2, 0.2, 0.2));
    u.uP.value.fromArray(p.p || [0, 0, 0, 0]);
    u.uQ.value.fromArray(p.q || [0, 0, 0, 0]);
    u.uWorld.value = p.world || 1;
    u.uTexel.value.set(1 / size, 1 / size);
    // Height is in [0,1] * bump metres; texel spans world/size metres.
    u.uNormalScale.value = (p.bump || 0.005) / ((p.world || 1) / size);
    this.quad.material = mat;
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevXR = r.xr.enabled; r.xr.enabled = false;
    const prevTone = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
    const outs = [
      ['map', THREE.SRGBColorSpace, true],
      ['normalMap', THREE.NoColorSpace, false],
      ['ormMap', THREE.NoColorSpace, false],
    ];
    if (EMISSIVE_RECIPES.has(recipe) && p.emissive !== false) outs.push(['emissiveMap', THREE.SRGBColorSpace, false]);
    const result = { targets: [] };
    outs.forEach(([name, cs, alpha], i) => {
      const rt = this._target(size, cs, alpha);
      u.uOut.value = i;
      r.setRenderTarget(rt);
      r.render(this.scene, this.camera);
      result[name] = rt.texture;
      result.targets.push(rt);
    });
    r.setRenderTarget(prevRT);
    r.xr.enabled = prevXR;
    r.toneMapping = prevTone;
    this.bakeCount++;
    return result;
  }

  // Bake several recipes into array textures (terrain splatting). layers: [{recipe, ...params}]
  bakeArray(layers, size) {
    const n = layers.length;
    const mk = (cs) => {
      const rt = new THREE.WebGLArrayRenderTarget(size, size, n, {
        wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
        generateMipmaps: true, depthBuffer: false, colorSpace: cs,
      });
      rt.texture.anisotropy = this.anisotropy;
      rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
      return rt;
    };
    const targets = [mk(THREE.SRGBColorSpace), mk(THREE.NoColorSpace), mk(THREE.NoColorSpace)];
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevTone = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
    layers.forEach((L, li) => {
      const mat = this._material(L.recipe);
      const u = mat.uniforms;
      u.uSeed.value = (L.seed || 0) % 997;
      u.uColA.value.copy(L.colA); u.uColB.value.copy(L.colB || L.colA); u.uColC.value.copy(L.colC || L.colA);
      u.uP.value.fromArray(L.p || [0, 0, 0, 0]); u.uQ.value.fromArray(L.q || [0, 0, 0, 0]);
      u.uWorld.value = L.world || 4;
      u.uTexel.value.set(1 / size, 1 / size);
      u.uNormalScale.value = (L.bump || 0.02) / ((L.world || 4) / size);
      this.quad.material = mat;
      for (let o = 0; o < 3; o++) {
        u.uOut.value = o;
        r.setRenderTarget(targets[o], li);
        r.render(this.scene, this.camera);
      }
    });
    r.setRenderTarget(prevRT);
    r.toneMapping = prevTone;
    return { albedo: targets[0].texture, normal: targets[1].texture, orm: targets[2].texture, targets };
  }

  dispose() {
    for (const m of this.programs.values()) m.dispose();
    this.quad.geometry.dispose();
  }
}
