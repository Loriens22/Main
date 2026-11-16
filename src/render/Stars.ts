import * as THREE from 'three';

const D2R = Math.PI / 180;

/** Seeded PRNG so the sky is the same every session. */
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximate RGB of a black body at temperature T (K), normalised. */
function blackbody(T: number, out: number[]) {
  const t = T / 100;
  let r: number, g: number, b: number;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  out[0] = Math.min(255, Math.max(0, r)) / 255; out[1] = Math.min(255, Math.max(0, g)) / 255; out[2] = Math.min(255, Math.max(0, b)) / 255;
  const m = Math.max(out[0], out[1], out[2]);
  out[0] /= m; out[1] /= m; out[2] /= m;
  return out;
}

/** Unit vector in equatorial (ECI J2000) coordinates from right ascension and declination in degrees. */
function radec(ra: number, dec: number, out = new THREE.Vector3()) {
  const a = ra * D2R, d = dec * D2R;
  return out.set(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
}

const VERT = /* glsl */ `
attribute float aMag;
attribute vec3 aCol;
uniform float uScale;
uniform float uLimit;
uniform float uPx;
varying vec3 vCol;
varying float vI;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.999999; // behind everything in the background scene
  // flux relative to a 0th magnitude star; dimmer than the adaptation limit fades out
  float flux = pow( 10.0, -0.4 * aMag );
  float vis = smoothstep( uLimit + 0.6, uLimit - 0.8, aMag );
  vI = flux * uScale * vis;
  vCol = aCol;
  // brighter stars bloom into slightly larger points; faint ones stay one pixel
  gl_PointSize = uPx * clamp( 1.2 + 1.6 * sqrt( flux ), 1.0, 5.0 );
}`;

const FRAG = /* glsl */ `
varying vec3 vCol;
varying float vI;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length( d ) * 2.0;
  float core = exp( -r * r * 5.0 );
  if ( core < 0.01 ) discard;
  gl_FragColor = vec4( vCol * vI * core, 1.0 );
}`;

/**
 * The fixed stars: a seeded catalogue with a realistic magnitude distribution, colour temperatures, and a band of
 * faint stars along the galactic plane, plus a soft Milky Way glow. Fixed in inertial (J2000 equatorial)
 * coordinates; the zone orients it into its own frame.
 */
export class StarField {
  group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private glowMat: THREE.ShaderMaterial;

  constructor(count = 9000, radius = 4.0e6) {
    const rnd = mulberry(1977);
    const pos = new Float32Array(count * 3), mag = new Float32Array(count), col = new Float32Array(count * 3);
    // galactic pole (J2000): RA 192.86, Dec 27.13; galactic centre RA 266.4, Dec -28.94
    const gp = radec(192.86, 27.13), gc = radec(266.4, -28.94);
    const gy = new THREE.Vector3().crossVectors(gp, gc).normalize();
    const v = new THREE.Vector3(), c = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      // number of stars grows ~x3 per magnitude: sample magnitude from an exponential up to 7.2
      const u = rnd();
      const m = 7.2 + Math.log(u * (1 - Math.pow(3, -8.6)) + Math.pow(3, -8.6)) / Math.log(3);
      // faint stars crowd toward the galactic plane
      const toPlane = m > 4.5 && rnd() < 0.55;
      if (toPlane) {
        const l = rnd() * Math.PI * 2;
        const b = (rnd() + rnd() + rnd() - 1.5) * 0.16 * (1.6 - 0.6 * Math.cos(l));
        v.copy(gc).multiplyScalar(Math.cos(b) * Math.cos(l)).addScaledVector(gy, Math.cos(b) * Math.sin(l)).addScaledVector(gp, Math.sin(b));
      } else {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
        v.set(r * Math.cos(a), r * Math.sin(a), z);
      }
      v.normalize().multiplyScalar(radius);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      mag[i] = m;
      // spectral mix: mostly sun-like and cooler, a few hot blue-white
      const T = rnd() < 0.12 ? 9000 + rnd() * 16000 : 3200 + Math.pow(rnd(), 0.7) * 5200;
      blackbody(T, c);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    // a handful of bright named stars at their real positions (RA, Dec, magnitude, temperature)
    const named: [number, number, number, number][] = [
      [101.29, -16.72, -1.46, 9900], [95.99, -52.7, -0.74, 7300], [219.9, -60.83, -0.27, 5800], [213.92, 19.18, -0.05, 4300],
      [279.23, 38.78, 0.03, 9600], [79.17, 46.0, 0.08, 5000], [78.63, -8.2, 0.13, 12000], [114.83, 5.22, 0.34, 6500],
      [88.79, 7.41, 0.5, 3500], [24.43, -57.24, 0.46, 15000], [210.96, -60.37, 0.61, 25000], [297.7, 8.87, 0.76, 7700],
      [186.65, -63.1, 0.76, 26000], [68.98, 16.51, 0.86, 3900], [247.35, -26.43, 0.96, 3600], [201.3, -11.16, 0.97, 22000],
      [116.33, 28.03, 1.14, 4800], [344.41, -29.62, 1.16, 8600], [310.36, 45.28, 1.25, 8500], [152.09, 11.97, 1.35, 12000],
      [37.95, 89.26, 1.98, 6000],
    ];
    const n = named.length;
    const total = count + n;
    const P = new Float32Array(total * 3), M = new Float32Array(total), C = new Float32Array(total * 3);
    P.set(pos); M.set(mag); C.set(col);
    named.forEach(([ra, dec, m, T], k) => {
      radec(ra, dec, v).multiplyScalar(radius);
      const i = count + k;
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      M[i] = m;
      blackbody(T, c);
      C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2];
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('aMag', new THREE.BufferAttribute(M, 1));
    geo.setAttribute('aCol', new THREE.BufferAttribute(C, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 2.2 }, uLimit: { value: 6.5 }, uPx: { value: Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, this.mat);
    pts.frustumCulled = false;
    pts.renderOrder = -3000;
    this.group.add(pts);

    // Milky Way glow: a band on a sphere, brighter and wider toward the galactic centre, with dust lanes
    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { uGP: { value: gp.clone() }, uGC: { value: gc.clone() }, uGY: { value: gy.clone() }, uI: { value: 0.035 } },
      vertexShader: /* glsl */ `
        varying vec3 vD;
        void main() { vD = normalize( position ); vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_Position = p; gl_Position.z = p.w * 0.999999; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uGP, uGC, uGY; uniform float uI;
        varying vec3 vD;
        float h( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
        float n3( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( mix( h( i ), h( i + vec3( 1, 0, 0 ) ), f.x ), mix( h( i + vec3( 0, 1, 0 ) ), h( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                      mix( mix( h( i + vec3( 0, 0, 1 ) ), h( i + vec3( 1, 0, 1 ) ), f.x ), mix( h( i + vec3( 0, 1, 1 ) ), h( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
        void main() {
          vec3 d = normalize( vD );
          float b = asin( clamp( dot( d, uGP ), -1.0, 1.0 ) );
          float l = atan( dot( d, uGY ), dot( d, uGC ) );
          float centre = 0.5 + 0.5 * cos( l );
          float width = 0.09 + 0.1 * centre;
          float band = exp( -b * b / ( width * width ) ) * ( 0.35 + 0.65 * centre * centre );
          float clump = n3( d * 9.0 ) * 0.6 + n3( d * 23.0 ) * 0.4;
          float dust = smoothstep( 0.35, 0.75, n3( d * 14.0 + 3.0 ) ) * exp( -b * b / ( 0.0016 + 0.002 * centre ) );
          float I = band * ( 0.55 + 0.6 * clump ) * ( 1.0 - 0.75 * dust ) * uI;
          gl_FragColor = vec4( vec3( 0.95, 0.9, 0.82 ) * I, 1.0 );
        }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.01, 64, 32), this.glowMat);
    glow.frustumCulled = false;
    glow.renderOrder = -3001;
    this.group.add(glow);
    this.group.renderOrder = -3000;
  }

  /** brightness scale (eye adaptation) and limiting magnitude */
  setVisibility(scale: number, limit = 6.5) {
    this.mat.uniforms.uScale.value = scale;
    this.mat.uniforms.uLimit.value = limit;
    this.glowMat.uniforms.uI.value = 0.035 * Math.min(1, scale / 2.2);
    this.group.visible = scale > 0.01;
  }

  /** Orient: rows of the frame basis (frame axes expressed in ECI) */
  orient(X: THREE.Vector3, Y: THREE.Vector3, Z: THREE.Vector3) {
    _m.set(X.x, X.y, X.z, 0, Y.x, Y.y, Y.z, 0, Z.x, Z.y, Z.z, 0, 0, 0, 0, 1);
    this.group.quaternion.setFromRotationMatrix(_m);
  }
}

const _m = new THREE.Matrix4();
