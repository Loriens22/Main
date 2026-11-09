import * as THREE from 'three';

/**
 * Engine plume: layered additive cone with procedural flicker, shock diamonds in atmosphere and
 * under-expanded bloom in vacuum. Extends along local -Z from the nozzle.
 */
export class Plume {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  level = 0;

  constructor(opts: { radius: number; length: number; core: THREE.ColorRepresentation; edge: THREE.ColorRepresentation; intensity?: number }) {
    const g = new THREE.CylinderGeometry(opts.radius * 0.55, opts.radius * 2.2, opts.length, 28, 24, true);
    g.translate(0, -opts.length / 2, 0);
    g.rotateX(Math.PI / 2); // along -Z
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uLevel: { value: 0 },
        uTime: { value: 0 },
        uAtmo: { value: 1 },
        uLen: { value: opts.length },
        uCore: { value: new THREE.Color(opts.core) },
        uEdge: { value: new THREE.Color(opts.edge) },
        uInt: { value: opts.intensity ?? 6 },
      },
      vertexShader: /* glsl */ `
        uniform float uLevel, uAtmo, uLen, uTime;
        varying float vT; varying vec3 vN; varying vec3 vView; varying vec2 vRad;
        void main(){
          vec3 p = position;
          float t = clamp(-p.z / uLen, 0.0, 1.0);
          // vacuum: plume balloons outward; atmosphere: tight column
          float spread = mix(1.9, 0.75, uAtmo);
          p.xy *= mix(1.0, spread, t) * (0.6 + 0.4 * uLevel);
          p.z *= mix(0.35, 1.0, uLevel) * mix(1.25, 1.0, uAtmo);
          p.xy *= 1.0 + 0.05 * sin(uTime * 37.0 + t * 20.0);
          vT = t;
          vRad = p.xy;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vView = normalize(-mv.xyz);
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLevel, uTime, uAtmo, uInt; uniform vec3 uCore, uEdge;
        varying float vT; varying vec3 vN; varying vec3 vView;
        float hash(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          float rim = abs(dot(normalize(vN), vView));
          float body = pow(rim, 1.6);
          float fall = pow(1.0 - vT, 1.6);
          float flick = 0.85 + 0.15 * hash(floor(uTime * 60.0) + vT * 13.0);
          // shock diamonds (Mach disks) appear in atmosphere
          float diamonds = uAtmo * smoothstep(0.55, 1.0, sin(vT * 38.0 - uTime * 4.0)) * (1.0 - vT) * 0.9;
          vec3 col = mix(uCore, uEdge, smoothstep(0.0, 0.45, vT) * (1.0 - rim * 0.5));
          float a = (body * fall + diamonds * body) * uLevel * flick;
          gl_FragColor = vec4(col * a * uInt, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.userData.owned = true;
  }

  update(dt: number, level: number, atmo: number) {
    this.level = THREE.MathUtils.damp(this.level, level, 12, dt);
    const u = this.material.uniforms;
    u.uLevel.value = this.level;
    u.uTime.value += dt;
    u.uAtmo.value = atmo;
    this.mesh.visible = this.level > 0.01;
  }
}

/** Soft particle smoke/steam (launch clouds, exhaust trails, RCS puffs, dust kicked up on landing). */
export class Smoke {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private next = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(readonly max = 1500, color: THREE.ColorRepresentation = 0xd8d2c8, readonly lifetime = 9, tex?: THREE.Texture) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max).fill(-1);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 600 }, tNoise: { value: tex ?? null }, uHasTex: { value: tex ? 1 : 0 }, uLight: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA; varying float vSeed;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 1.0, 900.0);
          vA = aAlpha;
          vSeed = fract(position.x * 0.13 + position.z * 0.07);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform sampler2D tNoise; uniform float uHasTex, uLight; varying float vA; varying float vSeed;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          float n = uHasTex > 0.5 ? texture2D(tNoise, gl_PointCoord * 0.5 + vSeed).r : 0.7;
          float a = smoothstep(0.5, 0.1, r) * vA * (0.55 + 0.6 * n);
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor * uLight * (0.8 + 0.3 * n), a);
        }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 15;
    this.points.userData.owned = true;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, size: number, spread = 1) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = p.x + (Math.random() - 0.5) * spread;
    this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread;
    this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
    this.vel[i * 3] = v.x + (Math.random() - 0.5) * spread * 2;
    this.vel[i * 3 + 1] = v.y + (Math.random() - 0.5) * spread * 2;
    this.vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * spread * 2;
    this.life[i] = this.lifetime * (0.6 + Math.random() * 0.6);
    this.size[i] = size;
    this.alpha[i] = 0;
  }

  update(dt: number, drag = 0.4, rise = 0.6, grow = 1.8, shift?: THREE.Vector3) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k] *= 1 - drag * dt;
      this.vel[k + 1] = this.vel[k + 1] * (1 - drag * dt) + rise * dt;
      this.vel[k + 2] *= 1 - drag * dt;
      this.pos[k] += this.vel[k] * dt + (shift?.x ?? 0);
      this.pos[k + 1] += this.vel[k + 1] * dt + (shift?.y ?? 0);
      this.pos[k + 2] += this.vel[k + 2] * dt + (shift?.z ?? 0);
      this.size[i] += grow * dt;
      const t = this.life[i] / this.lifetime;
      this.alpha[i] = Math.min(1, (1 - t) * 6) * Math.min(1, t * 2) * 0.55;
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}
