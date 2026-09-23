import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { setMaxAniso } from './textures.js';
import { clamp } from './util.js';

export const QUALITY = {
  ultra: { dpr: 2.0, shadow: 4096, shadowRange: 70, mirrors: 512, far: 1.0 },
  high: { dpr: 1.6, shadow: 2048, shadowRange: 60, mirrors: 384, far: 1.0 },
  medium: { dpr: 1.25, shadow: 2048, shadowRange: 48, mirrors: 256, far: 0.8 },
  low: { dpr: 1.0, shadow: 1024, shadowRange: 40, mirrors: 192, far: 0.6 },
};

/** Lighting presets: sun elevation/azimuth (deg, azimuth 180 = south), colours and atmosphere. */
export const TIMES = {
  morning: { elev: 17, azim: 112, sun: 0xffdcb8, sunI: 2.9, sky: 0xd6e0ee, gnd: 0x6e6250, hemiI: 0.34, fog: 0xc8d2dc, far: 1500, turb: 4.2, ray: 1.5, mie: 0.006, mieG: 0.8, gain: 0.6, env: 0.66, exp: 1.02, lamps: 0.15 },
  noon: { elev: 60, azim: 175, sun: 0xfff6ea, sunI: 3.6, sky: 0xe2e8f0, gnd: 0x7a6e58, hemiI: 0.3, fog: 0xc2d0dc, far: 1600, turb: 2.6, ray: 1.1, mie: 0.004, mieG: 0.78, gain: 0.62, env: 0.75, exp: 0.98, lamps: 0.15 },
  afternoon: { elev: 38, azim: 208, sun: 0xffeccf, sunI: 3.4, sky: 0xdfe6f0, gnd: 0x7a6e58, hemiI: 0.3, fog: 0xc4d2de, far: 1500, turb: 3.2, ray: 1.25, mie: 0.0045, mieG: 0.78, gain: 0.62, env: 0.72, exp: 1.0, lamps: 0.15 },
  sunset: { elev: 7, azim: 262, sun: 0xffa45c, sunI: 2.7, sky: 0xc4c6da, gnd: 0x6a5642, hemiI: 0.5, fog: 0xd6b49c, far: 1250, turb: 6.5, ray: 2.2, mie: 0.009, mieG: 0.86, gain: 0.58, env: 0.62, exp: 1.14, lamps: 3.2 },
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    setMaxAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.07, 30000);
    this.quality = 'high';
    this.dynRes = true;
    this.resScale = 1;
    this.frameTimes = [];

    // --- sun & sky ---
    this.sunDir = new THREE.Vector3();
    const elev = 38 * Math.PI / 180, azim = 208 * Math.PI / 180; // afternoon sun from the south-west
    this.sunDir.set(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev)).normalize();
    this.sky = new Sky();
    this.sky.scale.setScalar(24000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3.2; u.rayleigh.value = 1.25; u.mieCoefficient.value = 0.0045; u.mieDirectionalG.value = 0.78;
    u.sunPosition.value.copy(this.sunDir);
    u.cloudCoverage.value = 0.34; u.cloudDensity.value = 0.55; u.cloudScale.value = 0.00018; u.cloudSpeed.value = 0.00003; u.cloudElevation.value = 0.45;
    u.skyGain = { value: 0.62 };
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('uniform float time;', 'uniform float time;\nuniform float skyGain;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyGain, 1.0 );');
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffeccf, 3.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2;
    this.sunTarget = new THREE.Object3D();
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun, this.sunTarget);
    this.hemi = new THREE.HemisphereLight(0xdfe6f0, 0x7a6e58, 0.3);
    this.scene.add(this.hemi);

    this.fogColor = new THREE.Color(0xc4d2de);
    this.scene.fog = new THREE.Fog(this.fogColor, 240, 1500);
    this.scene.environmentIntensity = 0.72;
    this.setShadowRange(60);
    this.buildEnvironment();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky2 = new Sky();
    sky2.scale.setScalar(900);
    const u2 = sky2.material.uniforms, u = this.sky.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'cloudCoverage', 'cloudDensity', 'cloudScale', 'cloudElevation']) u2[k].value = u[k].value;
    u2.sunPosition.value.copy(this.sunDir);
    u2.showSunDisc.value = 0;
    envScene.add(sky2);
    // ground & distant city ring so reflections below the horizon are not sky-coloured
    const ground = new THREE.Mesh(new THREE.CircleGeometry(800, 32), new THREE.MeshBasicMaterial({ color: 0x4d4f4c }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2; envScene.add(ground);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(600, 600, 60, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x8c9096, side: THREE.BackSide }));
    ring.position.y = 25; envScene.add(ring);
    const rt = pmrem.fromScene(envScene, 0, 0.5, 5000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    pmrem.dispose();
  }

  /** Switches the time of day (sun, sky, fog, ambient and image-based lighting). */
  setTimeOfDay(key) {
    const T = TIMES[key] || TIMES.afternoon;
    this.tod = key;
    const elev = T.elev * Math.PI / 180, azim = T.azim * Math.PI / 180;
    this.sunDir.set(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev)).normalize();
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.turbidity.value = T.turb; u.rayleigh.value = T.ray; u.mieCoefficient.value = T.mie; u.mieDirectionalG.value = T.mieG;
    u.skyGain.value = T.gain;
    this.sun.color.set(T.sun); this.sun.intensity = T.sunI;
    this.hemi.color.set(T.sky); this.hemi.groundColor.set(T.gnd); this.hemi.intensity = T.hemiI;
    this.fogColor.set(T.fog); this.scene.fog.color.copy(this.fogColor); this.scene.fog.far = T.far;
    this.scene.environmentIntensity = T.env;
    this.renderer.toneMappingExposure = T.exp;
    this.buildEnvironment();
    return T;
  }

  setQuality(q) {
    this.quality = q;
    const Q = QUALITY[q];
    this.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.setShadowRange(Q.shadowRange);
    this.resScale = 1;
    this.resize();
  }

  setShadowRange(r) {
    this.shadowRange = r;
    const c = this.sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 320;
    c.updateProjectionMatrix();
  }

  /** Keeps the shadow frustum centred on the area of interest, snapped to texels to avoid shimmer. */
  followShadow(focus) {
    const texel = (this.shadowRange * 2) / this.sun.shadow.mapSize.x;
    // work in light space
    const lz = this.sunDir.clone();
    const lx = new THREE.Vector3(0, 1, 0).cross(lz).normalize();
    const ly = lz.clone().cross(lx);
    let a = focus.dot(lx), b = focus.dot(ly);
    a = Math.round(a / texel) * texel; b = Math.round(b / texel) * texel;
    const c = focus.dot(lz);
    const p = lx.multiplyScalar(a).add(ly.multiplyScalar(b)).add(lz.clone().multiplyScalar(c));
    this.sunTarget.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 160);
    this.sunTarget.updateMatrixWorld();
  }

  pixelRatio() {
    const base = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dpr);
    return clamp(base * this.resScale, 0.6, 3);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // wider FOV in portrait so the driver still sees the road
    this.camera.fov = w > h ? 58 : 72;
    this.camera.updateProjectionMatrix();
  }

  /** Dynamic resolution: keep ~50-60 fps on phones by scaling the render resolution. */
  adapt(dt) {
    if (!this.dynRes) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 45) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const old = this.resScale;
    if (avg > 1 / 42 && this.resScale > 0.55) this.resScale = Math.max(0.55, this.resScale - 0.1);
    else if (avg < 1 / 58 && this.resScale < 1) this.resScale = Math.min(1, this.resScale + 0.05);
    if (old !== this.resScale) this.resize();
  }

  render(scene, camera) {
    this.renderer.render(scene || this.scene, camera || this.camera);
  }
}
