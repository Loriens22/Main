import * as THREE from 'three';

/**
 * A layer of procedural cumulus/stratus clouds on a large camera-following plane (raymarched slab-lite:
 * fbm density sampled at two heights for self-shadowing). Gives the ascent something to punch through.
 */
export class CloudLayer {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(noise: THREE.Texture, readonly base = 4200, readonly thickness = 900, coverage = 0.42) {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        tNoise: { value: noise },
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(1, 1, 1) },
        uAmb: { value: new THREE.Color(0.5, 0.55, 0.62) },
        uCover: { value: coverage },
        uFogCol: { value: new THREE.Color(0.7, 0.7, 0.7) },
        uDust: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tNoise; uniform float uTime, uCover, uDust; uniform vec3 uSun, uSunCol, uAmb, uFogCol; varying vec3 vW;
        float dens(vec2 p){
          float n = texture2D(tNoise, p / 9000.0 + uTime * 0.0004).r * 0.55 + texture2D(tNoise, p / 2600.0 - uTime * 0.0007).g * 0.3 + texture2D(tNoise, p / 700.0).b * 0.15;
          return smoothstep(1.0 - uCover, 1.0 - uCover + 0.22, n);
        }
        void main(){
          float d = dens(vW.xz);
          if (d < 0.01) discard;
          float ds = dens(vW.xz + uSun.xz * 380.0);
          float light = clamp(1.0 - ds * 0.7, 0.25, 1.0);
          vec3 col = uSunCol * light * max(uSun.y, 0.05) * 1.2 + uAmb * 0.6;
          col = mix(col, vec3(0.6, 0.5, 0.38), uDust * 0.6);
          float dist = distance(cameraPosition, vW);
          float fade = 1.0 - smoothstep(25000.0, 60000.0, dist);
          col = mix(uFogCol, col, exp(-dist / 90000.0));
          gl_FragColor = vec4(col, d * 0.92 * fade);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(140000, 140000, 1, 1).rotateX(-Math.PI / 2), this.material);
    this.mesh.position.y = base;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.userData.owned = true;
  }

  update(dt: number, cam: THREE.Camera, sun: THREE.Vector3, sunCol: THREE.Color, amb: THREE.Color, fog: THREE.Color, dust: number) {
    const u = this.material.uniforms;
    u.uTime.value += dt;
    (u.uSun.value as THREE.Vector3).copy(sun);
    (u.uSunCol.value as THREE.Color).copy(sunCol);
    (u.uAmb.value as THREE.Color).copy(amb);
    (u.uFogCol.value as THREE.Color).copy(fog);
    u.uDust.value = dust;
    this.mesh.position.x = cam.position.x;
    this.mesh.position.z = cam.position.z;
  }

  /** 0..1 how deep the camera is inside the cloud deck (for the whiteout) */
  inside(y: number) {
    const t = 1 - Math.abs(y - this.base) / (this.thickness * 0.5);
    return Math.max(0, Math.min(1, t)) * this.material.uniforms.uCover.value * 1.6;
  }
}
