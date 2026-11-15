import * as THREE from 'three';
import { EARTH_ATMOSPHERE, Sky } from '../../render/Sky';
import { fogUniforms, FOG_GLSL, FOG_UNIFORM_DECL, W } from '../../render/patch';
import { clamp, damp, DEG, lerp, rng, smoothstep } from '../../core/math';
import { bus } from '../../core/events';
import { ui } from '../../ui/store';

export type WeatherKind = 'haze' | 'clear' | 'overcast';
interface Params { dust: number; cloud: number; cloudDensity: number; cirrus: number; fog: number; wind: number; exposure: number }

const SETS: Record<WeatherKind, Params> = {
  // the pale yellow-green dusty afternoon of reference 1
  haze: { dust: 1.9, cloud: 0.28, cloudDensity: 0.6, cirrus: 0.85, fog: 0.00016, wind: 0.28, exposure: 1.0 },
  clear: { dust: 0.45, cloud: 0.12, cloudDensity: 0.5, cirrus: 0.3, fog: 0.00008, wind: 0.16, exposure: 0.95 },
  // the grey-blue overcast of reference 2
  overcast: { dust: 0.75, cloud: 0.96, cloudDensity: 0.95, cirrus: 0.0, fog: 0.0003, wind: 0.55, exposure: 1.25 },
};
const STORM: Params = { dust: 12, cloud: 0.5, cloudDensity: 0.8, cirrus: 0, fog: 0.022, wind: 1.9, exposure: 0.6 };

export type StormPhase = 'none' | 'warning' | 'arriving' | 'peak' | 'clearing';

/**
 * Time of day, weather fronts and dust storms for the Earth zone. Storms are events with a visible
 * approaching wall, wind, lost visibility, dust that settles on every surface, and consequences for
 * farm machinery and neighbours (via the `weather:storm` event).
 */
export class Weather {
  kind: WeatherKind = 'haze';
  private cur: Params = { ...SETS.haze };
  /** local solar time in hours */
  hours = 15.3;
  day = 196;
  latitude = 50.7;
  storm: StormPhase = 'none';
  /** 0..1 intensity of the storm at the player's position */
  intensity = 0;
  private stormT = 0;
  private stormDur = 150;
  /** unit direction the wind blows toward (x, z) */
  windDir = new THREE.Vector2(0.86, 0.5);
  /** dust settled on surfaces 0..1 */
  deposit = 0.08;
  private wall: THREE.Mesh;
  private wallMat: THREE.ShaderMaterial;
  private dustPts: THREE.Points;
  private dustMat: THREE.ShaderMaterial;
  private nextChange = 420;
  private nextStorm = 780;
  private rand = rng(977);
  private sunDir = new THREE.Vector3();
  indoors = 0;
  /** distance of the wall front from the camera (m, positive = still approaching) */
  frontDist = 0;

  constructor(private sky: Sky, parent: THREE.Object3D, volumetrics: number) {
    // ---- storm wall: a towering curtain of dust that rolls in ahead of the front
    this.wallMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { ...fogUniforms(), uTime: { value: 0 }, uAlpha: { value: 0 }, uSun: W.uSunColor },
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        ${FOG_UNIFORM_DECL}
        uniform float uTime; uniform float uAlpha; uniform vec3 uSun;
        varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
        float n(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+7.1; a*=0.5; } return s; }
        void main(){
          vec2 p = vec2(vUv.x*26.0, vUv.y*5.0);
          float b = fbm(p + vec2(uTime*0.035, -uTime*0.05)) * 0.6 + fbm(p*2.7 - vec2(0.0, uTime*0.09)) * 0.4;
          float top = 1.0 - smoothstep(0.35 + b*0.55, 0.62 + b*0.6, vUv.y);
          float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float a = top * ends * uAlpha * (0.86 + 0.14*b);
          vec3 lit = vec3(0.56,0.44,0.3) * (0.25 + uSun * 0.2 * (0.5 + b)) + uFogH * 0.35;
          vec3 col = mix(lit * 0.55, lit, smoothstep(0.0, 0.7, vUv.y + b*0.3));
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(9000, 950, 1, 1), this.wallMat);
    this.wall.frustumCulled = false;
    this.wall.visible = false;
    this.wall.renderOrder = 5;
    parent.add(this.wall);
    // ---- airborne dust and chaff streaming past the camera
    const N = [0, 2600, 6000][clamp(volumetrics, 0, 2)];
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(Math.max(1, N) * 3), seed = new Float32Array(Math.max(1, N));
    const r = rng(31);
    for (let i = 0; i < N; i++) { pos[i * 3] = r() * 60; pos[i * 3 + 1] = r() * 26; pos[i * 3 + 2] = r() * 60; seed[i] = r(); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.NormalBlending,
      uniforms: { ...fogUniforms(), uCam: { value: new THREE.Vector3() }, uWindV: { value: new THREE.Vector3() }, uT: { value: 0 }, uAmt: { value: 0 }, uGround: { value: 0 }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float seed; uniform vec3 uCam; uniform vec3 uWindV; uniform float uT; uniform float uAmt; uniform float uGround; uniform float uScale;
        varying float vA;
        void main(){
          vec3 p = position + uWindV * uT * (0.6 + seed) + vec3(sin(uT*1.7+seed*40.0), cos(uT*2.3+seed*31.0)*0.6, sin(uT*1.1+seed*17.0)) * 0.6;
          p = mod(p - uCam + vec3(30.0, 6.0, 30.0), vec3(60.0, 26.0, 60.0)) - vec3(30.0, 6.0, 30.0) + uCam;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = clamp(uScale * (0.012 + seed * 0.03) / max(d, 0.5), 1.0, 14.0);
          // grains do not pass through the ground; fade them out as they reach it
          vA = uAmt * smoothstep(uGround - 0.1, uGround + 0.5, p.y) * smoothstep(30.0, 18.0, d) * step(seed, uAmt * 1.2 + 0.05);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float; ${FOG_UNIFORM_DECL} varying float vA;
        void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uFogH * 1.25 + vec3(0.08,0.06,0.03), a * 0.75); }`,
    });
    this.dustPts = new THREE.Points(g, this.dustMat);
    this.dustPts.frustumCulled = false;
    this.dustPts.visible = false;
    this.dustPts.renderOrder = 6;
    parent.add(this.dustPts);
    this.apply(1, true);
  }

  /** Sun direction from local solar time, date and latitude (zone frame: +X east, +Z south). */
  sunDirection(out: THREE.Vector3) {
    const decl = 23.44 * DEG * Math.sin((2 * Math.PI * (284 + this.day)) / 365);
    const H = (this.hours - 12) * 15 * DEG, lat = this.latitude * DEG;
    const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
    const el = Math.asin(clamp(sinEl, -1, 1));
    const cosAz = (Math.sin(decl) - sinEl * Math.sin(lat)) / Math.max(1e-5, Math.cos(el) * Math.cos(lat));
    let az = Math.acos(clamp(cosAz, -1, 1));
    if (H > 0) az = 2 * Math.PI - az;
    return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
  }

  set(kind: WeatherKind) { this.kind = kind; }

  /** Start a dust storm now (also used by Creative Mode and tests). */
  triggerStorm(duration = 150) {
    if (this.storm !== 'none') return;
    this.storm = 'warning';
    this.stormT = 0;
    this.stormDur = duration;
    const a = this.rand() * Math.PI * 2;
    this.windDir.set(Math.cos(a), Math.sin(a));
    ui.set({ alert: 'Dust storm approaching' });
    ui.toast('Dust storm on the horizon. Take shelter and close the windows.', 'warn', 7);
    bus.emit('weather:storm', { active: true, phase: 'warning' });
    bus.emit('sfx', { id: 'siren' });
  }

  private apply(dt: number, immediate = false) {
    const base = SETS[this.kind];
    const k = this.intensity;
    const rate = immediate ? 1e3 : 0.08;
    const mix = (a: number, b: number) => lerp(a, b, k);
    const c = this.cur;
    c.dust = damp(c.dust, mix(base.dust, STORM.dust), rate * 4, dt);
    c.cloud = damp(c.cloud, mix(base.cloud, STORM.cloud), rate, dt);
    c.cloudDensity = damp(c.cloudDensity, mix(base.cloudDensity, STORM.cloudDensity), rate, dt);
    c.cirrus = damp(c.cirrus, mix(base.cirrus, STORM.cirrus), rate, dt);
    c.fog = damp(c.fog, mix(base.fog, STORM.fog), rate * 6, dt);
    c.wind = damp(c.wind, mix(base.wind, STORM.wind), rate * 5, dt);
    c.exposure = damp(c.exposure, mix(base.exposure, STORM.exposure), rate * 3, dt);
    const A = EARTH_ATMOSPHERE;
    const p = this.sky.params;
    const changed = Math.abs(p.betaD[0] - A.betaD[0] * c.dust) / (p.betaD[0] + 1e-9) > 0.03 || Math.abs(p.cloudCoverage - c.cloud) > 0.01 || Math.abs(p.cirrus - c.cirrus) > 0.02;
    if (changed || immediate) {
      this.sky.setParams({
        betaD: [A.betaD[0] * c.dust, A.betaD[1] * c.dust, A.betaD[2] * c.dust],
        betaDAbs: [A.betaDAbs[0] * c.dust, A.betaDAbs[1] * c.dust, A.betaDAbs[2] * c.dust],
        cloudCoverage: c.cloud, cloudDensity: c.cloudDensity, cirrus: c.cirrus,
      });
    }
    this.sky.sunOcclusion = 1 - 0.9 * smoothstep(0.15, 0.9, k);
    W.uFogP.value.x = c.fog;
    W.uFogP.value.y = lerp(0.0011, 0.0002, k);
    W.uWind.value.set(this.windDir.x, this.windDir.y, W.uWind.value.z, c.wind);
    this.sky.wind.set(this.windDir.x, this.windDir.y).multiplyScalar(6 + c.wind * 18);
  }

  get exposure() { return this.cur.exposure; }
  get wind() { return this.cur.wind; }

  update(dt: number, cam: THREE.Vector3, groundY: number) {
    this.hours = (this.hours + dt / 3600) % 24;
    // ---- scheduled weather changes and storms
    this.nextChange -= dt;
    if (this.nextChange <= 0 && this.storm === 'none') {
      const r = this.rand();
      this.kind = r < 0.5 ? 'haze' : r < 0.78 ? 'overcast' : 'clear';
      this.nextChange = 500 + this.rand() * 700;
      bus.emit('weather:change', this.kind);
    }
    this.nextStorm -= dt;
    if (this.nextStorm <= 0) { this.nextStorm = 1100 + this.rand() * 1500; this.triggerStorm(120 + this.rand() * 90); }
    // ---- storm timeline: warning (wall on the horizon) -> arriving -> peak -> clearing
    const WARN = 55, ARRIVE = 14, CLEAR = 45;
    if (this.storm !== 'none') {
      this.stormT += dt;
      const t = this.stormT;
      let target = 0;
      if (t < WARN) { this.storm = 'warning'; this.frontDist = lerp(2600, 180, t / WARN); target = 0.12 * (t / WARN); }
      else if (t < WARN + ARRIVE) { if (this.storm !== 'arriving') { this.storm = 'arriving'; bus.emit('weather:storm', { active: true, phase: 'arriving' }); } this.frontDist = lerp(180, -200, (t - WARN) / ARRIVE); target = lerp(0.12, 1, (t - WARN) / ARRIVE); }
      else if (t < WARN + ARRIVE + this.stormDur) { if (this.storm !== 'peak') { this.storm = 'peak'; ui.set({ alert: 'Dust storm' }); } this.frontDist = -400; target = 0.85 + 0.15 * Math.sin(t * 0.21); }
      else if (t < WARN + ARRIVE + this.stormDur + CLEAR) { if (this.storm !== 'clearing') { this.storm = 'clearing'; ui.set({ alert: '' }); bus.emit('weather:storm', { active: false, phase: 'clearing' }); } target = lerp(0.85, 0, (t - WARN - ARRIVE - this.stormDur) / CLEAR); }
      else { this.storm = 'none'; target = 0; ui.set({ alert: '' }); ui.toast('The storm has passed.', 'info', 5); }
      this.intensity = damp(this.intensity, target, 1.2, dt);
    } else this.intensity = damp(this.intensity, 0, 0.5, dt);
    // dust settles during the storm and is slowly blown / washed off afterwards
    this.deposit = clamp(this.deposit + (this.intensity > 0.3 ? dt * 0.006 * this.intensity : -dt * 0.00012), 0.06, 0.85);
    W.uSurf.value.x = this.deposit;
    this.apply(dt);
    this.sunDirection(this.sunDir);
    this.sky.setSunDirection(this.sunDir);
    // ---- wall
    const showWall = this.storm === 'warning' || this.storm === 'arriving';
    this.wall.visible = showWall;
    if (showWall) {
      this.wallMat.uniforms.uTime.value += dt;
      this.wallMat.uniforms.uAlpha.value = damp(this.wallMat.uniforms.uAlpha.value, this.frontDist > 60 ? 0.97 : 0.0, 1.5, dt);
      const d = Math.max(this.frontDist, 40);
      this.wall.position.set(cam.x - this.windDir.x * d, groundY + 430, cam.z - this.windDir.y * d);
      this.wall.rotation.y = Math.atan2(this.windDir.x, this.windDir.y);
    }
    // ---- particles
    const amt = this.intensity * (1 - this.indoors);
    this.dustPts.visible = amt > 0.02 && this.dustMat.uniforms.uAmt !== undefined && (this.dustPts.geometry.attributes.position.count > 1);
    const u = this.dustMat.uniforms;
    u.uAmt.value = amt;
    u.uT.value += dt;
    u.uCam.value.copy(cam);
    u.uGround.value = groundY;
    u.uWindV.value.set(this.windDir.x * 16 * this.cur.wind, -0.4, this.windDir.y * 16 * this.cur.wind);
  }

  serialize() { return { kind: this.kind, hours: this.hours, day: this.day, deposit: this.deposit, nextStorm: this.nextStorm }; }
  deserialize(d: any) {
    if (!d) return;
    this.kind = d.kind ?? 'haze'; this.hours = d.hours ?? this.hours; this.day = d.day ?? this.day; this.deposit = d.deposit ?? this.deposit; this.nextStorm = d.nextStorm ?? this.nextStorm;
    this.storm = 'none'; this.intensity = 0;
    this.apply(1, true);
  }
}

void FOG_GLSL;
