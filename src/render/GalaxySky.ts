import * as THREE from 'three';
import { fbm2, rng } from '../core/math';

/**
 * The diffuse light of Gargantua's galaxy (not ours: Earth's constellations would be wrong there): a galactic band
 * with a brighter core and dust lanes along a great circle, rendered once into a cube texture. The stars themselves
 * are drawn procedurally by the shaders that look at this sky (STARS_GLSL), so they stay sharp points at any zoom
 * and under any lensing magnification.
 */
export function makeGalaxySky(size = 512, seed = 7): THREE.CubeTexture {
  void seed; void rng;
  const faces: HTMLCanvasElement[] = [];
  // face basis: +X, -X, +Y, -Y, +Z, -Z (three.js cube order), direction for pixel (u, v) in [-1, 1]
  const dirs: [number[], number[], number[]][] = [
    [[1, 0, 0], [0, 0, -1], [0, -1, 0]], [[-1, 0, 0], [0, 0, 1], [0, -1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, 0, 1], [1, 0, 0], [0, -1, 0]], [[0, 0, -1], [-1, 0, 0], [0, -1, 0]],
  ];
  // galactic plane normal (tilted), and the direction of the galactic centre within it
  const gN = new THREE.Vector3(0.25, 0.42, 0.87).normalize();
  const gC = new THREE.Vector3(1, 0, 0).sub(gN.clone().multiplyScalar(gN.x)).normalize();
  const gB = new THREE.Vector3().crossVectors(gN, gC);
  const bandAt = (d: THREE.Vector3) => {
    const lat = Math.asin(Math.max(-1, Math.min(1, d.dot(gN))));
    const lon = Math.atan2(d.dot(gB), d.dot(gC));
    const core = Math.exp(-((lon / 0.9) ** 2)) * 1.8 + 0.6;
    const width = 0.09 + 0.06 * Math.exp(-((lon / 0.7) ** 2));
    const band = Math.exp(-((lat / width) ** 2)) * core;
    // dust lanes: dark filaments near the plane
    const dust = Math.max(0, fbm2(lon * 6 + 3, lat * 30, 5) - 0.42) * 2.4 * Math.exp(-((lat / (width * 0.6)) ** 2));
    const clump = 0.7 + 0.6 * fbm2(lon * 14, lat * 40 + 9, 4);
    return { band: band * clump * Math.max(0, 1 - dust), lat, lon };
  };
  const tmp = new THREE.Vector3();
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const [F, U, V] = dirs[f];
    // diffuse glow of the band (unresolved stars), computed on a coarse grid and smoothed by bilinear filtering
    const step = 8;
    const g = Math.ceil(size / step) + 1;
    const glow = new Float32Array(g * g * 3);
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
      const u = ((i * step) / size) * 2 - 1, v = ((j * step) / size) * 2 - 1;
      tmp.set(F[0] + U[0] * u + V[0] * v, F[1] + U[1] * u + V[1] * v, F[2] + U[2] * u + V[2] * v).normalize();
      const b = bandAt(tmp);
      const warm = Math.exp(-((b.lon / 1.2) ** 2));
      const k = (j * g + i) * 3;
      glow[k] = b.band * (0.55 + 0.25 * warm); glow[k + 1] = b.band * (0.5 + 0.15 * warm); glow[k + 2] = b.band * (0.48 - 0.05 * warm);
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = x / step, gy = y / step, i0 = Math.floor(gx), j0 = Math.floor(gy), fx = gx - i0, fy = gy - j0;
      const k = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const a = glow[(j0 * g + i0) * 3 + ch], b = glow[(j0 * g + i0 + 1) * 3 + ch], cc = glow[((j0 + 1) * g + i0) * 3 + ch], d = glow[((j0 + 1) * g + i0 + 1) * 3 + ch];
        const val = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
        img.data[k + ch] = Math.min(255, Math.round(Math.pow(Math.min(1, val * 0.11), 1 / 2.2) * 255));
      }
      img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    faces.push(c);
  }
  const tex = new THREE.CubeTexture(faces);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Approximate sRGB-normalised colour of a blackbody at temperature T (K). */
export function blackbodyRGB(T: number): [number, number, number] {
  // Tanner Helland's fit, normalised
  const t = T / 100;
  let r: number, g: number, b: number;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  const c = (x: number) => Math.max(0, Math.min(255, x)) / 255;
  return [c(r), c(g), c(b)];
}

/**
 * GLSL: procedural stars in a direction d (any frame fixed to the sky), for a pixel of angular size pix (rad).
 * Two populations on cube-sphere grids; a seeded hash decides presence, position, brightness (a steep power law:
 * many faint stars, few bright) and colour (blackbody 3000-25000 K). Denser where the galactic band glows (band).
 */
export const STARS_GLSL = /* glsl */ `
float sHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
vec3 starTint( float h ) {
  return h < 0.25 ? vec3( 1.0, 0.72, 0.45 ) : h < 0.55 ? vec3( 1.0, 0.9, 0.78 ) : h < 0.85 ? vec3( 0.95, 0.97, 1.0 ) : vec3( 0.72, 0.82, 1.0 );
}
vec3 starField( vec3 d, float pix, float band ) {
  vec3 a = abs( d ); vec2 uv; float face;
  if ( a.x >= a.y && a.x >= a.z ) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if ( a.y >= a.z ) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec3 col = vec3( 0.0 );
  for ( int l = 0; l < 3; l++ ) {
    float N = l == 0 ? 90.0 : l == 1 ? 300.0 : 900.0;
    float dens = l == 0 ? 0.35 : l == 1 ? 0.3 : 0.25 + 0.5 * band;
    vec2 g = ( uv * 0.5 + 0.5 ) * N;
    vec2 cell = floor( g ) + face * 1013.0 + float( l ) * 77.0;
    float h = sHash( cell );
    if ( h > dens ) continue;
    vec2 p = floor( g ) + 0.25 + 0.5 * vec2( sHash( cell + 3.1 ), sHash( cell + 7.7 ) );
    float dist = length( g - p ) * 2.0 / N;                  // ~radians on the face
    float m = sHash( cell + 9.3 );
    float flux = ( l == 0 ? 6.0 : l == 1 ? 1.4 : 0.45 ) * pow( m, 3.0 ) + 0.02;
    float sig = max( pix * 0.75, 1.5e-4 );
    float w = exp( -dist * dist / ( 2.0 * sig * sig ) ) * min( 1.0, ( pix * pix ) / ( sig * sig ) );
    col += starTint( sHash( cell + 1.7 ) ) * flux * w;
  }
  return col;
}`;
