import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS } from './textures';

/** Particle shapes — indices into the atlas. */
export const P = {
  dot: 0,
  confetti: 1,
  heart: 2,
  z: 3,
  question: 4,
  sparkle: 5,
  smoke: 6,
  note: 7,
} as const;

export interface EmitOpts {
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  spread?: number; // random velocity magnitude
  life?: number;
  size?: number;
  sizeEnd?: number;
  color?: THREE.ColorRepresentation;
  shape?: number;
  gravity?: number; // px/s^2 (world, +y up)
  drag?: number;
  flutter?: number;
  count?: number;
  additive?: boolean;
  alpha?: number;
  hueJitter?: number;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute float aShape;
attribute vec4 aColor;
uniform float uPixelRatio;
varying float vShape;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio;
  vShape = aShape;
  vColor = aColor;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying float vShape;
varying vec4 vColor;
void main() {
  float col = mod(vShape, ${ATLAS_COLS}.0);
  float row = floor(vShape / ${ATLAS_COLS}.0);
  vec2 uv = vec2((col + gl_PointCoord.x) / ${ATLAS_COLS}.0, 1.0 - (row + gl_PointCoord.y) / ${ATLAS_ROWS}.0);
  vec4 tex = texture2D(uAtlas, uv);
  float a = tex.a * vColor.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb * tex.rgb * a, a);
}
`;

class Pool {
  readonly cap: number;
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private size: Float32Array;
  private shape: Float32Array;
  private color: Float32Array;
  // simulation
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private flutter: Float32Array;
  private baseA: Float32Array;
  private seed: Float32Array;
  alive = 0;

  constructor(cap: number, material: THREE.ShaderMaterial) {
    this.cap = cap;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.shape = new Float32Array(cap);
    this.color = new Float32Array(cap * 4);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.flutter = new Float32Array(cap);
    this.baseA = new Float32Array(cap);
    this.seed = new Float32Array(cap);
    const mk = (arr: Float32Array, n: number) => {
      const a = new THREE.BufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.geo.setAttribute('position', mk(this.pos, 3));
    this.geo.setAttribute('aSize', mk(this.size, 1));
    this.geo.setAttribute('aShape', mk(this.shape, 1));
    this.geo.setAttribute('aColor', mk(this.color, 4));
    this.geo.setDrawRange(0, 0);
    this.points = new THREE.Points(this.geo, material);
    this.points.frustumCulled = false;
  }

  emit(o: EmitOpts, c: THREE.Color) {
    const n = o.count ?? 1;
    for (let k = 0; k < n; k++) {
      if (this.alive >= this.cap) return;
      const i = this.alive++;
      const sp = o.spread ?? 0;
      const ang = Math.random() * Math.PI * 2;
      const mag = sp * (0.35 + Math.random() * 0.65);
      this.pos[i * 3] = o.x;
      this.pos[i * 3 + 1] = o.y;
      this.pos[i * 3 + 2] = o.z ?? 0;
      this.vel[i * 3] = (o.vx ?? 0) + Math.cos(ang) * mag;
      this.vel[i * 3 + 1] = (o.vy ?? 0) + Math.sin(ang) * mag;
      this.vel[i * 3 + 2] = 0;
      const life = (o.life ?? 1) * (0.75 + Math.random() * 0.5);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.s0[i] = o.size ?? 16;
      this.s1[i] = o.sizeEnd ?? this.s0[i];
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0.5;
      this.flutter[i] = o.flutter ?? 0;
      this.baseA[i] = o.alpha ?? 1;
      this.seed[i] = Math.random() * 100;
      this.shape[i] = o.shape ?? P.dot;
      let r = c.r;
      let g = c.g;
      let b = c.b;
      if (o.hueJitter) {
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        const tmp = new THREE.Color().setHSL((hsl.h + (Math.random() - 0.5) * o.hueJitter + 1) % 1, hsl.s, hsl.l);
        r = tmp.r;
        g = tmp.g;
        b = tmp.b;
      }
      this.color[i * 4] = r;
      this.color[i * 4 + 1] = g;
      this.color[i * 4 + 2] = b;
      this.color[i * 4 + 3] = 0;
    }
  }

  update(dt: number, t: number) {
    let n = this.alive;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      const fl = this.flutter[i];
      const wob = fl ? Math.sin(t * 7 + this.seed[i]) * fl : 0;
      this.pos[i * 3] += (this.vel[i * 3] + wob) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      const k = 1 - this.life[i] / this.maxLife[i];
      const fadeIn = Math.min(1, k * 8);
      const fadeOut = Math.min(1, (1 - k) * 3);
      this.color[i * 4 + 3] = this.baseA[i] * fadeIn * fadeOut;
      let s = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      if (fl) s *= 0.75 + 0.25 * Math.abs(Math.sin(t * 9 + this.seed[i]));
      this.size[i] = s;
    }
    this.alive = n;
    this.geo.setDrawRange(0, n);
    if (n > 0 || this.geo.drawRange.count !== n) {
      for (const name of ['position', 'aSize', 'aShape', 'aColor']) {
        (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  }

  private copy(from: number, to: number) {
    for (let c = 0; c < 3; c++) {
      this.pos[to * 3 + c] = this.pos[from * 3 + c];
      this.vel[to * 3 + c] = this.vel[from * 3 + c];
    }
    for (let c = 0; c < 4; c++) this.color[to * 4 + c] = this.color[from * 4 + c];
    this.size[to] = this.size[from];
    this.shape[to] = this.shape[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from];
    this.s1[to] = this.s1[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.flutter[to] = this.flutter[from];
    this.baseA[to] = this.baseA[from];
    this.seed[to] = this.seed[from];
  }

  clear() {
    this.alive = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose() {
    this.geo.dispose();
  }
}

export class Particles {
  readonly group = new THREE.Group();
  private normal: Pool;
  private additive: Pool;
  private matN: THREE.ShaderMaterial;
  private matA: THREE.ShaderMaterial;
  private tmpColor = new THREE.Color();
  readonly uniforms: { uAtlas: THREE.IUniform<THREE.Texture>; uPixelRatio: THREE.IUniform<number> };

  constructor(atlas: THREE.Texture) {
    this.uniforms = { uAtlas: { value: atlas }, uPixelRatio: { value: 1 } };
    this.matN = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      premultipliedAlpha: true,
    });
    this.matA = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
    });
    this.normal = new Pool(260, this.matN);
    this.additive = new Pool(220, this.matA);
    this.normal.points.renderOrder = 30;
    this.additive.points.renderOrder = 31;
    this.group.add(this.normal.points, this.additive.points);
  }

  get alive() {
    return this.normal.alive + this.additive.alive;
  }

  emit(o: EmitOpts) {
    this.tmpColor.set(o.color ?? 0xffffff);
    (o.additive ? this.additive : this.normal).emit(o, this.tmpColor);
  }

  update(dt: number, t: number) {
    this.normal.update(dt, t);
    this.additive.update(dt, t);
  }

  clear() {
    this.normal.clear();
    this.additive.clear();
  }

  dispose() {
    this.normal.dispose();
    this.additive.dispose();
    this.matN.dispose();
    this.matA.dispose();
  }
}
