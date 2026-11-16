import * as THREE from 'three';

let tex: THREE.Texture | null = null;
/** Soft, lumpy puff: a few overlapping blobs so billows do not look like discs. */
function puffTexture() {
  if (tex) return tex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * S * 0.2;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, rad = S * (0.16 + rnd() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.32)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }
  tex = new THREE.CanvasTexture(c);
  return tex;
}

const VERT = /* glsl */ `
attribute float aAge;    // 0..1 of life
attribute float aSize;   // world size (m)
attribute float aHeat;   // 0..1 incandescence
attribute float aSeed;
uniform float uScale;    // pixels per world unit at distance 1
varying float vAge; varying float vHeat; varying float vSeed; varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  float d = max( -mv.z, 0.1 );
  gl_PointSize = clamp( aSize * uScale / d, 0.0, 1024.0 );
  vAge = aAge; vHeat = aHeat; vSeed = aSeed;
  // fade particles that are about to cover the whole screen (camera inside the cloud)
  vFade = smoothstep( 0.6, 4.0, d / max( aSize, 0.01 ) );
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uSun;       // sunlight colour * intensity
uniform vec3 uAmb;       // ambient sky light
uniform vec3 uSunDirV;   // sun direction in view space
uniform float uOpacity;
varying float vAge; varying float vHeat; varying float vSeed; varying float vFade;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float s = sin( vSeed * 6.283 ), c = cos( vSeed * 6.283 );
  uv = mat2( c, -s, s, c ) * uv;
  float a = texture2D( uTex, uv + 0.5 ).a;
  // fake sphere normal for directional shading of each billow
  vec3 n = normalize( vec3( uv.x * 2.0, -uv.y * 2.0, 0.6 ) );
  float lit = 0.45 + 0.55 * max( dot( n, uSunDirV ), 0.0 );
  vec3 col = vec3( 0.86, 0.85, 0.83 ) * ( uSun * lit * 0.32 + uAmb );
  // hot gas near the engines glows orange
  col += vec3( 1.0, 0.45, 0.15 ) * vHeat * vHeat * 14.0 * ( 1.0 - vAge );
  float alpha = a * uOpacity * ( 1.0 - smoothstep( 0.55, 1.0, vAge ) ) * smoothstep( 0.0, 0.04, vAge ) * vFade;
  gl_FragColor = vec4( col * alpha, alpha );
}`;

/**
 * Billowing exhaust and steam as camera-facing soft particles: they rise, spread, slow down in the air, cool from
 * incandescent orange to grey and fade. Lit by the zone's sun and sky colour.
 */
export class Smoke {
  points: THREE.Points;
  mat: THREE.ShaderMaterial;
  private n: number;
  private pos: Float32Array; private vel: Float32Array; private age: Float32Array; private life: Float32Array;
  private size0: Float32Array; private size1: Float32Array; private heat0: Float32Array;
  private aAge: Float32Array; private aSize: Float32Array; private aHeat: Float32Array; private aSeed: Float32Array;
  private next = 0;
  alive = 0;
  /** linear drag (1/s): billows lose their speed in air */
  drag = 0.35;
  /** buoyancy (m/s^2, along +Y) */
  lift = 1.6;

  constructor(capacity = 1600) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3); this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(2); this.life = new Float32Array(capacity).fill(1);
    this.size0 = new Float32Array(capacity); this.size1 = new Float32Array(capacity); this.heat0 = new Float32Array(capacity);
    this.aAge = new Float32Array(capacity).fill(1); this.aSize = new Float32Array(capacity); this.aHeat = new Float32Array(capacity);
    this.aSeed = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.aSeed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.aAge, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aHeat', new THREE.BufferAttribute(this.aHeat, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.aSeed, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: puffTexture() }, uScale: { value: 600 }, uSun: { value: new THREE.Color(3, 3, 3) }, uAmb: { value: new THREE.Color(0.5, 0.55, 0.6) },
        uSunDirV: { value: new THREE.Vector3(0, 1, 0) }, uOpacity: { value: 0.85 },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 15;
  }

  emit(p: THREE.Vector3Like, v: THREE.Vector3Like, life: number, size0: number, size1: number, heat = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.age[i] = 0; this.life[i] = life; this.size0[i] = size0; this.size1[i] = size1; this.heat0[i] = heat;
  }

  /** Advance. `shift` moves every particle (a floating origin that follows a moving vehicle). */
  update(dt: number, cam: THREE.PerspectiveCamera, sunDirWorld: THREE.Vector3, sun: THREE.Color, amb: THREE.Color, shift?: THREE.Vector3, wind?: THREE.Vector3) {
    const k = Math.exp(-this.drag * dt);
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i];
      if (a >= 1) { this.aAge[i] = 1; this.aSize[i] = 0; continue; }
      alive++;
      const na = a + dt / this.life[i];
      this.age[i] = na;
      const j = i * 3;
      this.vel[j] *= k; this.vel[j + 1] = this.vel[j + 1] * k + this.lift * dt; this.vel[j + 2] *= k;
      this.pos[j] += (this.vel[j] + (wind ? wind.x : 0)) * dt + (shift ? shift.x : 0);
      this.pos[j + 1] += this.vel[j + 1] * dt + (shift ? shift.y : 0);
      this.pos[j + 2] += (this.vel[j + 2] + (wind ? wind.z : 0)) * dt + (shift ? shift.z : 0);
      this.aAge[i] = na;
      // billows grow fast at first, then slowly
      this.aSize[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * Math.sqrt(Math.min(1, na * 1.4));
      this.aHeat[i] = this.heat0[i] * Math.exp(-na * 9);
    }
    this.alive = alive;
    const g = this.points.geometry;
    for (const n of ['position', 'aAge', 'aSize', 'aHeat']) (g.attributes[n] as THREE.BufferAttribute).needsUpdate = true;
    const u = this.mat.uniforms;
    u.uScale.value = (window.innerHeight * Math.min(window.devicePixelRatio || 1, 2)) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    (u.uSun.value as THREE.Color).copy(sun);
    (u.uAmb.value as THREE.Color).copy(amb);
    (u.uSunDirV.value as THREE.Vector3).copy(sunDirWorld).transformDirection(cam.matrixWorldInverse);
    this.points.visible = alive > 0;
  }

  clear() { this.age.fill(2); this.alive = 0; }
}
