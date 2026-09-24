// Weather: rain streaks, snowflakes, storms with lightning, fog. Particles are
// GPU-wrapped around the camera (same trick as the grass) so they cost one
// draw call each. The weather also drives global shader state: wetness
// (darker, glossier surfaces), snow cover accumulating on up-facing
// surfaces, cloud cover, fog density and wind strength.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { globalUniforms } from '../render/shaderPatches.js';
import { markNoAO } from '../render/renderer.js';

function particleSystem(count, box, kind) {
  const rng = new RNG(kind === 'rain' ? 11 : 12);
  const base = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    base[i * 4] = rng.next() * box; base[i * 4 + 1] = rng.next() * box; base[i * 4 + 2] = rng.next() * box; base[i * 4 + 3] = rng.next();
  }
  const geo = new THREE.InstancedBufferGeometry();
  const quad = kind === 'rain'
    ? [-0.008, 0, 0, 0.008, 0, 0, 0.008, 0.55, 0, -0.008, 0.55, 0]
    : [-0.035, -0.035, 0, 0.035, -0.035, 0, 0.035, 0.035, 0, -0.035, 0.035, 0];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(quad, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uTime: { value: 0 }, uAmount: { value: 0 },
      uColor: { value: new THREE.Color(kind === 'rain' ? 0x9aa8b8 : 0xffffff) }, uWind: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */`
      attribute vec4 aBase;
      uniform vec3 uCam; uniform float uBox; uniform float uTime; uniform float uAmount; uniform vec2 uWind;
      varying vec2 vUv; varying float vA;
      void main() {
        vUv = uv;
        float speed = ${kind === 'rain' ? '11.0' : '1.1'};
        vec3 p = aBase.xyz;
        p.y -= uTime * speed * ( 0.8 + aBase.w * 0.4 );
        ${kind === 'snow' ? 'p.x += sin( uTime * 0.7 + aBase.w * 20.0 ) * 0.6; p.z += cos( uTime * 0.5 + aBase.w * 13.0 ) * 0.6;' : ''}
        p.xz += uWind * uTime * ${kind === 'rain' ? '1.5' : '0.8'};
        vec3 wp = uCam + mod( p - uCam + uBox * 0.5, uBox ) - uBox * 0.5;
        vA = step( aBase.w, uAmount ) * ( 1.0 - smoothstep( uBox * 0.3, uBox * 0.5, length( wp - uCam ) ) );
        vec4 mv = viewMatrix * vec4( wp, 1.0 );
        ${kind === 'rain'
          ? 'vec3 up = ( viewMatrix * vec4( normalize( vec3( uWind.x * 0.12, 1.0, uWind.y * 0.12 ) ), 0.0 ) ).xyz; vec3 side = normalize( cross( up, vec3( 0.0, 0.0, 1.0 ) ) ); mv.xyz += side * position.x + up * position.y;'
          : 'mv.xy += position.xy;'}
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying vec2 vUv; varying float vA;
      void main() {
        ${kind === 'rain' ? 'float a = smoothstep( 0.0, 0.5, vUv.y ) * ( 1.0 - abs( vUv.x - 0.5 ) * 2.0 ) * 0.35;' : 'float a = smoothstep( 0.5, 0.2, length( vUv - 0.5 ) ) * 0.9;'}
        if ( a * vA < 0.01 ) discard;
        gl_FragColor = vec4( uColor, a * vA );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.userData.noRaycast = true;
  markNoAO(mesh);
  return mesh;
}

export const WEATHER_TYPES = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];

export class Weather {
  constructor(world) {
    this.world = world;
    this.type = 'clear';
    this.target = { rain: 0, snow: 0, storm: 0, fog: 0, clouds: 0.42, wind: 0.45 };
    this.cur = { ...this.target };
    this.wetness = 0;
    this.snowCover = 0;
    this.rain = particleSystem(14000, 36, 'rain');
    this.snow = particleSystem(9000, 34, 'snow');
    world.scene.add(this.rain, this.snow);
    this.lightningTimer = 5;
    this.flash = 0;
    this.onThunder = null;
  }

  set(type) {
    this.type = type;
    const t = { rain: 0, snow: 0, storm: 0, fog: 0, clouds: 0.42, wind: 0.45 };
    if (type === 'cloudy') { t.clouds = 0.78; t.wind = 0.6; }
    if (type === 'rain') { t.rain = 0.7; t.clouds = 0.85; t.storm = 0.45; t.wind = 0.8; t.fog = 0.25; }
    if (type === 'storm') { t.rain = 1; t.clouds = 0.95; t.storm = 1; t.wind = 1.4; t.fog = 0.35; }
    if (type === 'snow') { t.snow = 1; t.clouds = 0.85; t.storm = 0.35; t.wind = 0.35; t.fog = 0.3; }
    if (type === 'fog') { t.fog = 1; t.clouds = 0.6; t.wind = 0.15; }
    this.target = t;
  }

  update(dt, camPos, atmo, time) {
    const k = Math.min(1, dt * 0.25);
    for (const key in this.target) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    const c = this.cur;
    // Surfaces get wet quickly and dry slowly; snow accumulates over ~1 minute.
    this.wetness += ((c.rain > 0.1 ? 1 : 0) - this.wetness) * dt * (c.rain > 0.1 ? 0.15 : 0.02);
    this.snowCover += ((c.snow > 0.1 ? 0.95 : 0) - this.snowCover) * dt * (c.snow > 0.1 ? 0.03 : 0.01);
    globalUniforms.uWetness.value = this.wetness;
    globalUniforms.uSnowCover.value = this.snowCover;
    globalUniforms.uWindStrength.value = c.wind;
    if (atmo) {
      atmo.storm = c.storm;
      atmo.weatherFog = c.fog;
      atmo.custom.cloudCover = c.clouds;
    }
    const wind = globalUniforms.uWindDir.value.clone().multiplyScalar(c.wind * 2);
    for (const [sys, amt] of [[this.rain, c.rain], [this.snow, c.snow]]) {
      sys.visible = amt > 0.01;
      const u = sys.material.uniforms;
      u.uCam.value.copy(camPos); u.uTime.value = time; u.uAmount.value = amt; u.uWind.value.copy(wind);
    }
    // Lightning during storms.
    this.flash = Math.max(0, this.flash - dt * 4);
    if (c.storm > 0.8 && c.rain > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.flash = 1;
        this.lightningTimer = 6 + Math.random() * 14;
        if (this.onThunder) setTimeout(() => this.onThunder(), 400 + Math.random() * 2500);
      }
    }
  }

  dispose() {
    for (const s of [this.rain, this.snow]) { s.geometry.dispose(); s.material.dispose(); this.world.scene.remove(s); }
  }
}
