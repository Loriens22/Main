// Physically based sky (Preetham), sun position for Sofia, lighting rig,
// fog, image-based lighting (PMREM) and a night star field.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const LAT = 42.67 * (Math.PI / 180);

/** Sun direction (world, y up, x east, z south) for a local solar hour and day-of-year. */
export function sunDirection(hour, dayOfYear = 200) {
  const decl = 23.44 * (Math.PI / 180) * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const H = ((hour - 12) / 24) * 2 * Math.PI; // hour angle
  const alt = Math.asin(Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H));
  let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(decl) * Math.cos(LAT)); // from south, west positive
  // convert: azimuth measured from south towards west
  const x = -Math.sin(az) * Math.cos(alt); // west positive => x negative
  const z = Math.cos(az) * Math.cos(alt); // south positive
  const y = Math.sin(alt);
  return new THREE.Vector3(x, y, z).normalize();
}

export class SkySystem {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.sky = new Sky();
    this.sky.scale.setScalar(35000);
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    // tame the HDR sun disc so it does not flood the bloom pass
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('760.0 * sundisc', '60.0 * sundisc')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyScale, 1.0 );')
      .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float skyScale;');
    this.sky.material.uniforms.skyScale = { value: 0.22 };
    if (!this.sky.material.fragmentShader.includes('uniform float skyScale')) {
      this.sky.material.fragmentShader = 'uniform float skyScale;\n' + this.sky.material.fragmentShader;
    }
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality !== 'balanced' || true;
    const sm = quality === 'ultra' ? 4096 : quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    this.shadowRange = quality === 'ultra' ? 110 : quality === 'high' ? 85 : 60;
    const c = this.sun.shadow.camera;
    c.left = -this.shadowRange; c.right = this.shadowRange; c.top = this.shadowRange; c.bottom = -this.shadowRange;
    c.near = 1; c.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x5a5146, 0.6);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xc9d6e2, 0.00007);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    // A tame gradient sky for image-based lighting (the Preetham sky is HDR and
    // would blow out reflections); colours follow the time of day.
    this.envUniforms = {
      uZenith: { value: new THREE.Color(0x5d8ccc) }, uHorizon: { value: new THREE.Color(0xc9d8e6) },
      uGround: { value: new THREE.Color(0x4b4842) }, uSun: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uSunAmt: { value: 1.0 },
    };
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.envUniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uZenith,uHorizon,uGround,uSunCol,uSun; uniform float uSunAmt; varying vec3 vDir;
        void main(){ vec3 d=normalize(vDir); float h=d.y;
          vec3 c = h>0.0 ? mix(uHorizon,uZenith,pow(clamp(h,0.0,1.0),0.55)) : mix(uHorizon*0.8,uGround,clamp(-h*6.0,0.0,1.0));
          float s = max(dot(d,normalize(uSun)),0.0);
          c += uSunCol*(pow(s,64.0)*2.5 + pow(s,6.0)*0.25)*uSunAmt;
          gl_FragColor=vec4(c,1.0); }`,
    }));
    this.envScene.add(this.envSky);
    // ground bounce for the environment (city colours)
    this.envGroundMat = new THREE.MeshBasicMaterial({ color: 0x4b4842 });
    this.stars = this.makeStars();
    scene.add(this.stars);
    this.weather = 'clear';
    this.hour = 10;
    this.envRT = null;
    this.lastEnvKey = '';
  }

  /** Linear radiance of the (scaled) sky in a few directions, used for fog & IBL colours. */
  sampleSky(dirs) {
    try {
      const r = this.renderer;
      if (!this._skyRT) {
        this._skyRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
        this._skyScene = new THREE.Scene();
        this._skyCam = new THREE.PerspectiveCamera(20, 1, 0.1, 100000);
        this._skyClone = new THREE.Mesh(this.sky.geometry, this.sky.material);
        this._skyClone.scale.setScalar(35000);
        this._skyScene.add(this._skyClone);
      }
      const prev = r.getRenderTarget();
      const out = [];
      const px = new Uint16Array(4);
      for (const d of dirs) {
        this._skyCam.position.set(0, 0, 0);
        this._skyCam.lookAt(d[0], d[1], d[2]);
        r.setRenderTarget(this._skyRT);
        r.render(this._skyScene, this._skyCam);
        r.readRenderTargetPixels(this._skyRT, 2, 2, 1, 1, px);
        out.push(new THREE.Color(THREE.DataUtils.fromHalfFloat(px[0]), THREE.DataUtils.fromHalfFloat(px[1]), THREE.DataUtils.fromHalfFloat(px[2])));
      }
      r.setRenderTarget(prev);
      return out;
    } catch (e) {
      return null;
    }
  }

  makeStars() {
    const n = 1800;
    const pos = new Float32Array(n * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const y = Math.abs(u);
      const rr = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * rr * 30000;
      pos[i * 3 + 1] = y * 30000;
      pos[i * 3 + 2] = Math.sin(a) * rr * 30000;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  }

  /** hour: 0..24 local solar time; weather: 'clear' | 'cloudy' | 'rain' */
  set(hour, weather) {
    this.hour = hour;
    this.weather = weather;
    const dir = sunDirection(hour);
    this.sunDir = dir;
    const elev = dir.y;
    const u = this.sky.material.uniforms;
    const cloudy = weather !== 'clear';
    u.turbidity.value = cloudy ? 10 : 4.5;
    u.rayleigh.value = cloudy ? 0.7 : 1.6;
    u.mieCoefficient.value = cloudy ? 0.02 : 0.004;
    u.sunPosition.value.copy(dir).multiplyScalar(1000);
    if (u.cloudCoverage) {
      u.cloudCoverage.value = weather === 'rain' ? 0.95 : weather === 'cloudy' ? 0.72 : 0.22;
      u.cloudDensity.value = weather === 'rain' ? 0.9 : weather === 'cloudy' ? 0.6 : 0.35;
    }
    // light colour & intensity from elevation
    const day = THREE.MathUtils.smoothstep(elev, -0.05, 0.25);
    const golden = THREE.MathUtils.smoothstep(elev, 0.0, 0.35);
    this.dayFactor = day;
    const sunCol = new THREE.Color().setRGB(1, 0.55 + 0.42 * golden, 0.3 + 0.62 * golden);
    const cloudK = weather === 'rain' ? 0.18 : weather === 'cloudy' ? 0.35 : 1;
    this.sun.color.copy(sunCol);
    this.sun.intensity = 3.4 * day * cloudK;
    this.hemi.intensity = 0.25 + 0.75 * day;
    this.hemi.color.setRGB(0.55 + 0.2 * day, 0.62 + 0.22 * day, 0.75 + 0.2 * day).multiplyScalar(cloudy ? 0.9 : 1);
    this.hemi.groundColor.setRGB(0.28 * day + 0.04, 0.26 * day + 0.04, 0.23 * day + 0.05);
    const night = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.05);
    this.night = night;
    if (night > 0.5) {
      // moonlight
      this.sun.color.setRGB(0.55, 0.65, 0.9);
      this.sun.intensity = 0.25;
      this.hemi.color.setRGB(0.18, 0.22, 0.34);
      this.hemi.groundColor.setRGB(0.08, 0.07, 0.07);
      this.hemi.intensity = 0.7;
    }
    this.stars.material.opacity = weather === 'clear' ? night * 0.9 : 0;
    // fog colour ~ horizon
    const fogDay = cloudy ? new THREE.Color(0xb7bec4) : new THREE.Color(0xc4d2de);
    const fogDusk = new THREE.Color(0xd6a47c);
    const fogNight = new THREE.Color(0x111824);
    let fc = fogDay.clone().lerp(fogDusk, (1 - golden) * day * 0.7).lerp(fogNight, night);
    // match fog and IBL to the actual sky radiance
    const ax = -dir.x, az = -dir.z, al = Math.hypot(ax, az) || 1;
    const smp = this.sampleSky([[ax / al, 0.04, az / al], [dir.x / al, 0.04, dir.z / al], [0, 1, 0]]);
    if (smp && smp.every((c) => Number.isFinite(c.r))) {
      fc = smp[0].clone().lerp(smp[1], 0.35).multiplyScalar(cloudy ? 0.85 : 0.8);
      this.skyZenith = smp[2];
      if (night > 0.5) fc.setRGB(0.012, 0.016, 0.026);
    }
    this.scene.fog.color.copy(fc);
    this.scene.fog.density = weather === 'rain' ? 0.00032 : weather === 'cloudy' ? 0.00012 : 0.00007;
    this.renderer.toneMappingExposure = (night > 0.5 ? 1.5 : 1.0) * (weather === 'rain' ? 1.2 : weather === 'cloudy' ? 1.1 : 1);
    this.envGroundMat.color.setRGB(0.3 * day + 0.02, 0.29 * day + 0.02, 0.27 * day + 0.03);
    const eu = this.envUniforms;
    eu.uSun.value.copy(dir);
    if (this.skyZenith) eu.uZenith.value.copy(this.skyZenith).multiplyScalar(0.6);
    else eu.uZenith.value.setRGB(0.22, 0.38, 0.66).multiplyScalar(0.15 + 0.85 * day);
    eu.uHorizon.value.copy(fc).multiplyScalar(0.6);
    eu.uGround.value.setRGB(0.24 * day + 0.02, 0.23 * day + 0.02, 0.21 * day + 0.025);
    eu.uSunCol.value.copy(sunCol);
    eu.uSunAmt.value = day * cloudK;
    if (night > 0.5) { eu.uZenith.value.setRGB(0.02, 0.03, 0.06); eu.uHorizon.value.setRGB(0.07, 0.07, 0.09); }
    this.updateEnv();
  }

  updateEnv() {
    const key = `${this.hour.toFixed(2)}-${this.weather}`;
    if (key === this.lastEnvKey) return;
    this.lastEnvKey = key;
    if (this.envRT) this.envRT.dispose();
    // darken the environment sky at night
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.night > 0.5 ? 0.6 : 1.0;
  }

  /** Keep the shadow frustum centred on the focus point, snapped to texels to avoid shimmering. */
  setQuality(q) {
    const sm = q === 'ultra' ? 4096 : q === 'high' ? 2048 : 1024;
    this.shadowRange = q === 'ultra' ? 110 : q === 'high' ? 85 : 60;
    const c = this.sun.shadow.camera;
    c.left = -this.shadowRange; c.right = this.shadowRange; c.top = this.shadowRange; c.bottom = -this.shadowRange;
    c.updateProjectionMatrix();
    if (this.sun.shadow.mapSize.x !== sm) {
      this.sun.shadow.mapSize.set(sm, sm);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  tick(dt) {
    const u = this.sky.material.uniforms;
    if (u.time) u.time.value += dt;
  }

  follow(focus) {
    const d = this.sunDir || new THREE.Vector3(0, 1, 0);
    const lightDir = d.y > 0.05 ? d : new THREE.Vector3(0.3, 0.8, 0.2).normalize();
    const texel = (this.shadowRange * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 400, focus.y + lightDir.y * 400, fz + lightDir.z * 400);
    this.sun.target.updateMatrixWorld();
    this.stars.position.set(focus.x, 0, focus.z);
    this.sky.position.set(focus.x, 0, focus.z);
  }
}
