import * as THREE from 'three';
import type { EarthContent } from './EarthContent';

/**
 * Dust storms: building → peak → clearing, scheduled in Earth time. Affects sky, fog, light, wind, corn,
 * particles (with ground collision), dust accumulation on surfaces, audio, machinery behaviour and the HUD.
 */
export class Weather {
  phase: 'calm' | 'building' | 'peak' | 'clearing' = 'calm';
  intensity = 0;
  private t0 = 0;
  private dur = { build: 180, peak: 420, clear: 200 };
  private points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private clouds: THREE.Mesh[] = [];
  private cloudMat: THREE.ShaderMaterial;
  private readonly N = 5000;
  readonly wind = new THREE.Vector3(1, 0, 0.35).normalize();
  private warned = false;
  private rattleT = 0;
  private pointsMat: THREE.ShaderMaterial;

  constructor(readonly content: EarthContent) {
    const zone = content.zone;
    // fine dust particles (CPU-simulated, ground collision)
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.N * 3);
    this.vel = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * 80;
      this.pos[i * 3 + 1] = Math.random() * 18;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
      this.vel[i] = 0.6 + Math.random() * 0.8;
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.pointsMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0.62, 0.5, 0.36) }, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        uniform float uScale; varying float vFade;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = clamp(uScale / d, 1.0, 10.0);
          vFade = smoothstep(0.5, 3.0, d) * (1.0 - smoothstep(25.0, 45.0, d));
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uColor; varying float vFade;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c));
          gl_FragColor = vec4(uColor, a * uOpacity * vFade);
        }`,
    });
    this.points = new THREE.Points(g, this.pointsMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.userData.owned = true;
    zone.scene.add(this.points);
    // billowing dust cloud sprites
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { tNoise: { value: content.game.materials.tex('noise', false, 1) }, uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0.55, 0.45, 0.33) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vDist;
        void main(){
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tNoise; uniform float uTime, uOpacity; uniform vec3 uColor; varying vec2 vUv; varying float vDist;
        void main(){
          vec2 c = vUv - 0.5;
          float r = length(c);
          float n = texture2D(tNoise, vUv * 0.7 + vec2(uTime * 0.02, uTime * 0.007)).r * 0.6 + texture2D(tNoise, vUv * 1.9 - vec2(uTime * 0.03, 0.0)).g * 0.4;
          float a = smoothstep(0.5, 0.05, r) * smoothstep(0.25, 0.7, n) * uOpacity * smoothstep(4.0, 30.0, vDist);
          gl_FragColor = vec4(uColor * (0.7 + 0.5 * n), a);
        }`,
    });
    const pg = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(pg, this.cloudMat);
      m.userData.owned = true;
      m.userData.off = new THREE.Vector3((Math.random() - 0.5) * 300, 4 + Math.random() * 40, (Math.random() - 0.5) * 300);
      const s = 40 + Math.random() * 80;
      m.scale.set(s, s * 0.6, 1);
      m.renderOrder = 9;
      m.frustumCulled = false;
      zone.scene.add(m);
      this.clouds.push(m);
    }
    const st = content.game.state.farm;
    if (!st.nextStormT) st.nextStormT = content.game.state.clock.earthTime + 1500;
  }

  get game() {
    return this.content.game;
  }

  /** Creative: start a storm now. */
  trigger() {
    this.content.game.state.farm.nextStormT = this.content.game.state.clock.earthTime + 5;
    this.warned = false;
  }

  update(dt: number) {
    const game = this.game;
    const st = game.state.farm;
    const now = game.state.clock.earthTime;
    const zone = this.content.zone;
    // schedule
    if (this.phase === 'calm') {
      const until = st.nextStormT - now;
      if (until < 240 && !this.warned) {
        this.warned = true;
        game.notify('Weather service: dust storm approaching from the west. Bring machines in, seal windows.', 'warn', 9);
      }
      if (until <= 0) {
        this.phase = 'building';
        this.t0 = now;
        (this.content as any).vehicles?.list?.forEach((v: any) => {
          if (v.driver !== 'player' && v.task.kind !== 'parked') v.task = (this.content as any).vehicles.returnTask(v);
        });
      }
    }
    const e = now - this.t0;
    if (this.phase === 'building') {
      this.intensity = Math.min(1, e / this.dur.build);
      if (e > this.dur.build) { this.phase = 'peak'; this.t0 = now; }
    } else if (this.phase === 'peak') {
      this.intensity = 0.9 + 0.1 * Math.sin(e * 0.3);
      if (e > this.dur.peak) { this.phase = 'clearing'; this.t0 = now; }
    } else if (this.phase === 'clearing') {
      this.intensity = Math.max(0, 1 - e / this.dur.clear);
      if (e > this.dur.clear) {
        this.phase = 'calm';
        this.intensity = 0;
        this.warned = false;
        st.nextStormT = now + 2400 + Math.random() * 3600;
        game.notify('The storm has passed. Dust settles on everything.', 'info', 6);
      }
    }
    // dust deposits accumulate during storms and slowly fade
    st.stormLevel = Math.min(1, Math.max(0, (st.stormLevel ?? 0) + (this.intensity > 0.5 ? 0.01 : -0.0006) * (dt > 0 ? 1 : 0)));
    const smoothI = this.intensity * this.intensity * (3 - 2 * this.intensity);
    zone.storm = smoothI;
    // screen-space dust only when outdoors
    const indoors = this.content.isIndoors();
    game.renderer.fx.dust = indoors ? smoothI * 0.08 : smoothI * 0.55;
    // particles follow the camera
    const cam = game.camera.position;
    const speed = 4 + smoothI * 22;
    this.pointsMat.uniforms.uOpacity.value = indoors ? 0 : smoothI * 0.85;
    this.points.position.set(cam.x, 0, cam.z);
    if (smoothI > 0.01 && !indoors) {
      const p = this.pos;
      for (let i = 0; i < this.N; i++) {
        const k = i * 3;
        p[k] += this.wind.x * speed * this.vel[i] * dt;
        p[k + 2] += this.wind.z * speed * this.vel[i] * dt;
        p[k + 1] += Math.sin((p[k] + i) * 0.3 + zone.time * 2) * 0.6 * dt - 0.15 * dt;
        // wrap around the camera box
        if (p[k] > 40) p[k] -= 80; else if (p[k] < -40) p[k] += 80;
        if (p[k + 2] > 40) p[k + 2] -= 80; else if (p[k + 2] < -40) p[k + 2] += 80;
        // ground collision: bounce off the terrain (and objects approximated by terrain + 0.1)
        const gy = zone.height(cam.x + p[k], cam.z + p[k + 2]);
        if (p[k + 1] < gy + 0.05) p[k + 1] = gy + 0.05 + Math.random() * 1.5;
        if (p[k + 1] > gy + 20) p[k + 1] = gy + Math.random() * 3;
      }
      (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    // clouds
    this.cloudMat.uniforms.uTime.value = zone.time;
    this.cloudMat.uniforms.uOpacity.value = smoothI * 0.75;
    for (const c of this.clouds) {
      const off = c.userData.off as THREE.Vector3;
      off.addScaledVector(this.wind, speed * 0.8 * dt);
      if (off.x > 160) off.x -= 320;
      if (off.z > 160) off.z -= 320;
      if (off.x < -160) off.x += 320;
      if (off.z < -160) off.z += 320;
      c.position.set(cam.x + off.x, zone.height(cam.x + off.x, cam.z + off.z) + off.y, cam.z + off.z);
      c.lookAt(cam);
      c.visible = smoothI > 0.02;
    }
    // rattling metal and sheet sounds near the farm buildings at the peak
    this.rattleT -= dt;
    if (smoothI > 0.5 && this.rattleT <= 0 && game.audio.ctx) {
      this.rattleT = 1.5 + Math.random() * 4;
      const p = cam.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 2, (Math.random() - 0.5) * 30));
      if (Math.random() < 0.6) game.audio.clank({ pos: p, base: 200 + Math.random() * 300, gain: 0.08 * smoothI, decay: 0.3 });
      else game.audio.burst({ pos: p, dur: 0.4, freq: 1200, q: 4, gain: 0.08 * smoothI, noise: 'pink' });
    }
    if (game.state.flags.stormMood !== (smoothI > 0.4)) game.state.flags.stormMood = smoothI > 0.4;
  }
}
