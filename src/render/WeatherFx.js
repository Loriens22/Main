// Rain: GPU-animated streaks around the camera (masked out of the bus
// interior) and raindrops on the windscreen that the wipers clear.
import * as THREE from 'three';
import { FRONT_Z } from '../vehicle/BusSpec.js';

export class WeatherFx {
  constructor({ scene, quality }) {
    this.scene = scene;
    const n = quality === 'balanced' ? 2500 : quality === 'high' ? 5000 : 8000;
    const pos = new Float32Array(n * 2 * 3);
    const seed = new Float32Array(n * 2 * 4);
    for (let i = 0; i < n; i++) {
      const s = [Math.random(), Math.random(), Math.random(), 0.7 + Math.random() * 0.6];
      for (let e = 0; e < 2; e++) {
        seed.set([s[0], s[1], s[2], e === 0 ? s[3] : -s[3]], (i * 2 + e) * 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    this.uniforms = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(0.8, 0.3) },
      uBoxA: { value: new THREE.Vector4(0, 0, 0, -1) }, uExtA: { value: new THREE.Vector3(0, 0, 0) },
      uBoxB: { value: new THREE.Vector4(0, 0, 0, -1) }, uExtB: { value: new THREE.Vector3(0, 0, 0) },
      uOpacity: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        uniform float uTime; uniform vec3 uCam; uniform vec2 uWind;
        uniform vec4 uBoxA, uBoxB; uniform vec3 uExtA, uExtB;
        varying float vA;
        bool inBox(vec3 p, vec4 b, vec3 e) {
          vec2 d = p.xz - b.xy;
          float l = dot(d, b.zw), w = dot(d, vec2(-b.w, b.z));
          return abs(l) < e.x && abs(w) < e.y && p.y < e.z;
        }
        void main() {
          float R = 32.0;
          float speed = 9.0 * abs(seed.w);
          vec3 p;
          p.x = uCam.x + (fract(seed.x - uCam.x / (2.0 * R)) - 0.5) * 2.0 * R;
          p.z = uCam.z + (fract(seed.z - uCam.z / (2.0 * R)) - 0.5) * 2.0 * R;
          float fall = fract(seed.y + uTime * speed / 40.0);
          p.y = uCam.y + 18.0 - fall * 40.0;
          p.xz += uWind * (1.0 - fall) * 2.0;
          if (seed.w < 0.0) p += vec3(uWind.x, 9.0, uWind.y) * -0.055;
          vA = 0.55;
          if (inBox(p, uBoxA, uExtA) || inBox(p, uBoxB, uExtB)) vA = 0.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying float vA;
        void main() { if (vA < 0.01) discard; gl_FragColor = vec4(0.75, 0.8, 0.88, vA * uOpacity); }`,
    });
    this.rain = new THREE.LineSegments(g, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.makeWindscreen();
    this.weather = 'clear';
  }

  makeWindscreen() {
    this.wipe = new Float32Array(64).fill(-100);
    this.wipeTex = new THREE.DataTexture(this.wipe, 64, 1, THREE.RedFormat, THREE.FloatType);
    this.wipeTex.needsUpdate = true;
    this.wsUniforms = { uTime: { value: 0 }, uWipe: { value: this.wipeTex }, uRain: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.wsUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uRain; uniform sampler2D uWipe; varying vec2 vUv;
        float h(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p,p+34.23); return fract(p.x*p.y); }
        // wiper pivots at the bottom of the screen (uv space), sweeping arcs
        float wipedAfter(vec2 uv, float birth) {
          vec2 piv = uv.x < 0.5 ? vec2(0.28, 0.0) : vec2(0.78, 0.0);
          vec2 d = (uv - piv) * vec2(2.2, 1.6);
          if (length(d) > 1.05) return 0.0;
          float ang = atan(d.x, d.y); // -pi/2..pi/2
          float idx = clamp((ang + 1.6) / 3.2, 0.0, 1.0);
          float last = texture2D(uWipe, vec2(idx, 0.5)).r;
          return step(birth, last);
        }
        void main() {
          vec4 col = vec4(0.0);
          for (int layer = 0; layer < 2; layer++) {
            float sc = layer == 0 ? 26.0 : 11.0;
            vec2 g = vUv * vec2(sc * 2.0, sc);
            vec2 id = floor(g);
            vec2 f = fract(g) - 0.5;
            float r = h(id + float(layer) * 7.0);
            float period = 1.5 + r * 5.0;
            float birth = floor((uTime + r * 40.0) / period) * period - r * 40.0;
            float age = uTime - birth;
            vec2 off = vec2(h(id + 3.1) - 0.5, h(id + 5.7) - 0.5) * 0.6;
            vec2 q = (f - off) * vec2(2.0, 1.0);
            float size = (layer == 0 ? 0.12 : 0.18) * (0.6 + r * 0.6);
            float d = length(q);
            float drop = smoothstep(size, size * 0.6, d) * step(r, uRain * 0.85);
            drop *= 1.0 - wipedAfter(vUv, birth);
            float hl = smoothstep(size * 0.5, 0.0, length(q - vec2(-size * 0.3, size * 0.35)));
            col += vec4(vec3(0.75 + hl * 0.6), drop * (0.22 + hl * 0.4));
          }
          gl_FragColor = vec4(col.rgb / max(col.a, 1e-3), min(col.a, 0.55));
        }`,
    });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.5), mat);
    this.screen.rotation.y = Math.PI;
    this.screen.position.set(0, 1.77, FRONT_Z + 0.07);
    this.screen.visible = false;
    this.screen.renderOrder = 10;
  }

  set(weather) {
    this.weather = weather;
    const rain = weather === 'rain';
    this.rain.visible = rain;
    this.uniforms.uOpacity.value = rain ? 1 : 0;
    this.wsUniforms.uRain.value = rain ? 1 : 0;
  }

  update(dt, camera, bus) {
    const u = this.uniforms;
    u.uTime.value += dt;
    this.wsUniforms.uTime.value += dt;
    u.uCam.value.copy(camera.position);
    const boxes = bus ? bus.phys.boxes() : [];
    const b = [u.uBoxA, u.uBoxB], e = [u.uExtA, u.uExtB];
    for (let i = 0; i < 2; i++) {
      const bx = boxes[i];
      if (bx) {
        b[i].value.set(bx.cx, bx.cz, bx.fx, bx.fz);
        e[i].value.set(bx.hl, bx.hw, bus.model.front.position.y + 3.0);
      } else e[i].value.set(0, 0, -1e9);
    }
    // windscreen drops follow the player's bus front section
    if (bus && this.screen.parent !== bus.model.front) bus.model.front.add(this.screen);
    this.screen.visible = this.weather === 'rain' && !!bus;
    if (bus && bus.wiper) {
      // record when each angular bucket was last swept by the wiper blades
      const ang = bus.wiper.mode > 0 ? Math.sin(Math.min(1, (bus.wiper.phase % 1) * 1.6) * Math.PI) * 1.45 : 0;
      const k = Math.floor(((1.5 - ang) / Math.PI) * 63 + 0.5);
      const t = this.wsUniforms.uTime.value;
      for (let j = Math.max(0, 63 - k - 2); j <= Math.min(63, 63 - k + 2); j++) this.wipe[j] = t;
      this.wipeTex.needsUpdate = true;
    }
  }
}
