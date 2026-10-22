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
          vA = 0.4;
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
        // time the wiper blade last passed over this point (two pivots, arms
        // sweeping from horizontal (-x) to vertical); -100 if never
        float lastWipe(vec2 m) {
          float best = -100.0;
          for (int i = 0; i < 2; i++) {
            vec2 d = m - (i == 0 ? vec2(0.95, 1.0) : vec2(-0.2, 1.0));
            float r = length(d);
            if (r > 0.97 || r < 0.12 || d.y < -0.03 || d.x > 0.03) continue;
            float phi = atan(-d.x, d.y);
            best = max(best, texture2D(uWipe, vec2(clamp(phi / 1.6, 0.0, 1.0), 0.5)).r);
          }
          return best;
        }
        void main() {
          vec2 m = vec2((vUv.x - 0.5) * 2.36, vUv.y * 1.5 + 1.02);
          float wiped = lastWipe(m);
          vec4 col = vec4(0.0);
          for (int layer = 0; layer < 3; layer++) {
            float sc = layer == 0 ? 30.0 : layer == 1 ? 14.0 : 7.0;
            vec2 g = vUv * vec2(sc * 1.6, sc);
            vec2 id = floor(g);
            vec2 f = fract(g) - 0.5;
            float r = h(id + float(layer) * 7.0);
            float period = 1.2 + r * 4.0;
            float birth = floor((uTime + r * 40.0) / period) * period - r * 40.0;
            if (wiped > birth) continue;            // swept away since it landed
            if (r > uRain * (layer == 2 ? 0.35 : 0.8)) continue;
            vec2 off = vec2(h(id + 3.1) - 0.5, h(id + 5.7) - 0.5) * 0.5;
            // big drops slowly run down the glass
            float age = uTime - birth;
            if (layer == 2) off.y -= min(age * 0.06 * r, 0.3);
            vec2 q = (f - off) * vec2(1.6, 1.0);
            float size = (layer == 0 ? 0.13 : layer == 1 ? 0.17 : 0.2) * (0.6 + r * 0.6);
            float d = length(q * vec2(1.0, layer == 2 ? 0.8 : 1.0));
            float body = smoothstep(size, size * 0.78, d);
            if (body <= 0.0) continue;
            float rim = smoothstep(size * 0.35, size * 0.95, d);
            float hl = smoothstep(size * 0.32, 0.0, length(q - vec2(-size * 0.28, size * 0.34)));
            // a drop is a tiny lens: darker refracted rim, bright specular glint
            vec3 c = mix(vec3(0.62, 0.66, 0.7), vec3(0.08, 0.09, 0.1), rim * 0.85);
            c = mix(c, vec3(1.8), hl);
            float a = body * (0.3 + rim * 0.4 + hl * 0.5);
            col.rgb = mix(col.rgb, c, a);
            col.a = max(col.a, a);
          }
          gl_FragColor = vec4(col.rgb, min(col.a, 0.7));
        }`,
      side: THREE.DoubleSide,
    });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.5), mat);
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
      // record when each angular bucket was last swept by the blades (arm
      // angle from vertical = 1.5 - wiper angle); fill the span covered
      // since the previous frame so fast sweeps leave no gaps
      const ang = bus.wiper.mode > 0 ? Math.sin(Math.min(1, (bus.wiper.phase % 1) * 1.6) * Math.PI) * 1.45 : 0;
      const k = Math.round(((1.5 - ang) / 1.6) * 63);
      const k0 = this.prevK ?? k;
      const t = this.wsUniforms.uTime.value;
      for (let j = Math.max(0, Math.min(k, k0) - 1); j <= Math.min(63, Math.max(k, k0) + 1); j++) this.wipe[j] = t;
      this.prevK = k;
      this.wipeTex.needsUpdate = true;
    }
  }
}
