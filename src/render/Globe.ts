import * as THREE from 'three';

const TEX = (n: string) => `${import.meta.env.BASE_URL}assets/textures/${n}.webp`;

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNw;     // normal in the frame of the space camera (world orientation)
varying vec3 vPw;     // position relative to the camera
varying vec3 vTan;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vPw = wp.xyz - cameraPosition;
  vNw = normalize( mat3( modelMatrix ) * normal );
  // tangent toward increasing longitude (east) for the relief normal map
  vec3 east = normalize( vec3( position.z, 0.0, -position.x ) + vec3( 1e-6 ) );
  vTan = normalize( mat3( modelMatrix ) * east );
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAlbedo, uNormal, uSpec, uClouds;
uniform vec3 uSunDir;          // toward the sun, same frame as vNw
uniform float uSunE;
uniform vec3 uSunTint;
uniform float uCloudShift;     // longitude offset of the cloud layer (they drift)
uniform float uNightLights;
varying vec2 vUv; varying vec3 vNw; varying vec3 vPw; varying vec3 vTan;
void main() {
  vec3 N = normalize( vNw );
  vec3 T = normalize( vTan - N * dot( vTan, N ) );
  vec3 B = cross( N, T );
  vec3 tn = texture2D( uNormal, vUv ).xyz * 2.0 - 1.0;
  vec3 Nr = normalize( T * tn.x + B * tn.y + N * tn.z );
  vec3 alb = texture2D( uAlbedo, vUv ).rgb;
  alb = pow( alb, vec3( 2.2 ) );
  vec4 sp = texture2D( uSpec, vUv );
  vec2 cuv = vec2( vUv.x + uCloudShift, vUv.y );
  vec4 cl = texture2D( uClouds, cuv );
  float ndl = dot( N, uSunDir );
  float day = smoothstep( -0.08, 0.12, ndl );
  // sunlight reddens through the long path near the terminator
  vec3 sunCol = uSunE * uSunTint * mix( vec3( 1.0, 0.45, 0.2 ), vec3( 1.0 ), smoothstep( -0.02, 0.35, ndl ) ) * 0.12;
  // cloud shadow: sample the cloud deck shifted toward the sun
  vec3 tsun = uSunDir - N * dot( uSunDir, N );
  vec2 so = vec2( dot( tsun, T ), dot( tsun, B ) ) * 0.004;
  float shadow = 1.0 - 0.55 * texture2D( uClouds, cuv + vec2( so.x, -so.y ) ).a;
  vec3 ground = alb * sunCol * max( dot( Nr, uSunDir ), 0.0 ) * shadow;
  // ocean glint
  vec3 V = normalize( -vPw );
  vec3 H = normalize( V + uSunDir );
  float spec = pow( max( dot( N, H ), 0.0 ), 180.0 ) * 2.5 + pow( max( dot( N, H ), 0.0 ), 18.0 ) * 0.06;
  ground += sp.r * spec * sunCol * day * ( 1.0 - cl.a );
  // clouds lit from above, a little translucent toward the terminator
  vec3 cloudCol = cl.rgb * sunCol * ( max( ndl, 0.0 ) * 0.9 + 0.04 );
  vec3 col = mix( ground, cloudCol, cl.a );
  // city lights on the night side, dimmed under cloud
  col += vec3( 1.0, 0.72, 0.42 ) * sp.g * uNightLights * ( 1.0 - day ) * ( 1.0 - cl.a * 0.85 );
  gl_FragColor = vec4( col, 1.0 );
}`;

/**
 * The Earth seen from altitude: textured sphere with relief shading, cloud deck and cloud shadows, ocean
 * glint and the few city lights left. The sky dome composites atmospheric in-scattering and extinction on top.
 * Lives in the renderer's space scene; the zone positions and orients it relative to the camera.
 */
export class Globe {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  radius: number;

  constructor(radius = 6371e3, segs = 192) {
    this.radius = radius;
    const loader = new THREE.TextureLoader();
    const tex = (n: string, srgb = false) => {
      const t = loader.load(TEX(n));
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uAlbedo: { value: tex('earth_albedo') }, uNormal: { value: tex('earth_normal') }, uSpec: { value: tex('earth_spec') },
        uClouds: { value: tex('earth_clouds') }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunE: { value: 20 },
        uSunTint: { value: new THREE.Vector3(1, 0.97, 0.92) }, uCloudShift: { value: 0 }, uNightLights: { value: 1.5 },
      },
      vertexShader: VERT, fragmentShader: FRAG, depthWrite: false, depthTest: false,
    });
    // equirect UV sphere: +Y is the north pole, longitude 0 at +X, +90 E at -Z (see earthToMesh)
    const geo = new THREE.SphereGeometry(radius, segs, segs / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2000;
  }

  setSun(dir: THREE.Vector3, energy = 20) {
    (this.mat.uniforms.uSunDir.value as THREE.Vector3).copy(dir);
    this.mat.uniforms.uSunE.value = energy;
  }
}
