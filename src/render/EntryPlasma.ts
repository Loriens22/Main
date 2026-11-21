import * as THREE from 'three';

/*
 * The glow of atmospheric entry around the Ranger: the shock layer standing off the windward side, where the air is
 * compressed and heated to several thousand kelvin and radiates, and the luminous wake trailing behind. The layer is
 * a paraboloid shell opening downstream, brightest at the stagnation point and toward its limb (a thin glowing shell
 * is seen through more of itself edge-on), with turbulent streaks running aft; the wake is a long cone fading with
 * distance. Both are additive light, so the hull, the windows and the cockpit occlude them naturally.
 *
 * Colour by the gas: air (N2/O2) glows orange-pink, CO2 a paler pink-white, Titan's nitrogen-methane violet (CN bands).
 * Brightness follows the heating the flight model computes (Sutton-Graves convective flux, normalised) with a steep
 * onset: a Mars entry from low orbit barely glows, a 9 km/s entry at Miller blazes.
 */

const VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vL;
void main() {
  vL = position;
  vec4 w = modelMatrix * vec4( position, 1.0 );
  vW = w.xyz;
  vN = normalize( mat3( modelMatrix ) * normal );
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const NOISE = /* glsl */ `
float h3( vec3 p ) { p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float n3( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( h3( i ), h3( i + vec3( 1, 0, 0 ) ), f.x ), mix( h3( i + vec3( 0, 1, 0 ) ), h3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( h3( i + vec3( 0, 0, 1 ) ), h3( i + vec3( 1, 0, 1 ) ), f.x ), mix( h3( i + vec3( 0, 1, 1 ) ), h3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float fb( vec3 p ) { return n3( p ) * 0.5 + n3( p * 2.1 + 3.1 ) * 0.3 + n3( p * 4.3 + 7.7 ) * 0.2; }
`;

// shock layer: local frame with +Z upstream (into the flow), apex at z = 0, opening toward -z
const SHOCK_FRAG = /* glsl */ `
uniform float uGain, uTime, uLen;
uniform vec3 uColor;
varying vec3 vW; varying vec3 vN; varying vec3 vL;
${NOISE}
void main() {
  vec3 V = normalize( cameraPosition - vW );
  float mu = abs( dot( normalize( vN ), V ) );
  float ax = -vL.z / uLen;                                   // 0 at the stagnation point, 1 a vehicle length aft
  float core = exp( -ax * 5.0 );
  float limb = 0.5 / ( mu + 0.5 );
  float a = atan( vL.y, vL.x );
  float streak = fb( vec3( cos( a ) * 7.0, sin( a ) * 7.0, ax * 3.0 - uTime * 6.0 ) );
  float flicker = 0.55 + 0.9 * streak * streak;
  float edge = 1.0 - smoothstep( 0.5, 1.0, ax / 0.9 );        // the shell's open end fades out
  // white-hot at the stagnation point, saturated toward the edges
  vec3 c = mix( uColor * uColor, mix( uColor, vec3( 1.0, 0.9, 0.75 ), 0.75 ), core );
  vec3 col = c * uGain * ( core * 0.9 + 0.12 ) * limb * flicker * edge * 0.55;
  gl_FragColor = vec4( col, 1.0 );
}`;

// wake: a cone along -z from the vehicle, local length 1 (scaled)
const WAKE_FRAG = /* glsl */ `
uniform float uGain, uTime, uLen;
uniform vec3 uColor;
varying vec3 vW; varying vec3 vN; varying vec3 vL;
${NOISE}
void main() {
  vec3 V = normalize( cameraPosition - vW );
  float mu = abs( dot( normalize( vN ), V ) );
  float ax = -vL.z;                                           // 0 at the vehicle .. 1 at the end of the wake
  float a = atan( vL.y, vL.x );
  // streamers: hot gas peeling off the edges of the windward face and trailing aft, flickering
  float turb = fb( vec3( cos( a ) * 9.0, sin( a ) * 9.0, ax * 2.5 - uTime * 5.0 ) );
  float str = smoothstep( 0.5, 0.85, turb );
  float fall = exp( -ax * 3.0 ) * smoothstep( 0.0, 0.05, ax );
  vec3 col = uColor * uColor * uGain * fall * str * ( 0.3 + 0.7 * ( 1.0 - mu ) ) * 0.5;
  gl_FragColor = vec4( col, 1.0 );
}`;

export type PlasmaGas = 'air' | 'co2' | 'titan';

export const PLASMA_COLOR: Record<PlasmaGas, [number, number, number]> = {
  air: [1.0, 0.42, 0.2],
  co2: [1.0, 0.6, 0.48],
  titan: [0.72, 0.42, 1.0],
};

export class EntryPlasma {
  group = new THREE.Group();
  /** orange light the sheath throws on the hull */
  light = new THREE.PointLight(0xff7a40, 0, 0, 2);
  private shock: THREE.Mesh;
  private wake: THREE.Mesh;
  private shockMat: THREE.ShaderMaterial;
  private wakeMat: THREE.ShaderMaterial;
  private t = 0;
  /** visible glow 0..1.5 (smoothed) */
  glow = 0;

  /** len: vehicle length (m) */
  constructor(private len: number) {
    const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
    this.shockMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SHOCK_FRAG, uniforms: { uGain: { value: 0 }, uTime: { value: 0 }, uLen: { value: len }, uColor: { value: new THREE.Vector3(...PLASMA_COLOR.air) } }, ...common });
    this.wakeMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: WAKE_FRAG, uniforms: { uGain: { value: 0 }, uTime: { value: 0 }, uLen: { value: len }, uColor: this.shockMat.uniforms.uColor }, ...common });
    // paraboloid z = -(x^2 + y^2) / (2 Rn): a tight cap over the windward face, 0.9 lengths deep
    const Rn = len * 0.3, depth = len * 0.9;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 40; i++) { const z = (i / 40) ** 1.6 * depth; pts.push(new THREE.Vector2(Math.sqrt(2 * Rn * z), -z)); }
    const shockGeo = new THREE.LatheGeometry(pts, 64);
    shockGeo.rotateX(Math.PI / 2);      // lathe axis Y -> Z ... (the lathe's y becomes -z)
    this.shock = new THREE.Mesh(shockGeo, this.shockMat);
    // the streamers: a sleeve 1 long from the rim of the cap, converging behind the vehicle (the wake's neck)
    const rim = Math.sqrt(2 * Rn * depth);
    const wakeGeo = new THREE.CylinderGeometry(rim, 0.3 * len, 1, 64, 32, true);
    wakeGeo.translate(0, -0.5, 0);
    wakeGeo.rotateX(Math.PI / 2);        // cylinder axis Y -> -Z, top (narrow end, y = 0) at the vehicle
    this.wake = new THREE.Mesh(wakeGeo, this.wakeMat);
    this.shock.frustumCulled = false; this.wake.frustumCulled = false;
    this.shock.renderOrder = 10; this.wake.renderOrder = 9;
    this.group.add(this.shock, this.wake, this.light);
    this.group.visible = false;
  }

  setGas(g: PlasmaGas) {
    (this.shockMat.uniforms.uColor.value as THREE.Vector3).set(...PLASMA_COLOR[g]);
    this.light.color.setRGB(...PLASMA_COLOR[g]);
  }

  /**
   * heat: the flight model's heating 0..1; flow: direction of motion through the air (zone frame); centre: the
   * vehicle's centre; exposure: the camera's (the glow is far brighter than anything sunlit, so it is scaled to stay
   * near the top of the display range at any exposure).
   */
  update(dt: number, heat: number, flow: THREE.Vector3, centre: THREE.Vector3, exposure: number) {
    const target = Math.min(1.5, Math.pow(Math.max(0, heat) / 0.12, 1.5));
    this.glow += (target - this.glow) * Math.min(1, dt * 2.5);
    this.t += dt;
    const on = this.glow > 0.01 && flow.lengthSq() > 1e-6;
    this.group.visible = on;
    if (!on) { this.light.intensity = 0; return; }
    const z = flow.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), z);
    this.group.quaternion.copy(q);
    // stand-off ahead of the windward face
    this.group.position.copy(centre).addScaledVector(z, this.len * 0.42);
    this.shock.scale.setScalar(1);
    this.wake.scale.set(1, 1, this.len * 6);
    this.wake.position.set(0, 0, -this.len * 0.9);
    const gain = (this.glow * 3) / Math.max(exposure, 1e-3);
    this.shockMat.uniforms.uGain.value = gain;
    this.wakeMat.uniforms.uGain.value = gain;
    this.shockMat.uniforms.uTime.value = this.t;
    this.wakeMat.uniforms.uTime.value = this.t;
    this.light.position.set(0, 0, 0);
    this.light.intensity = (this.glow * 120) / Math.max(exposure, 1e-3);
  }

  dispose() {
    this.shock.geometry.dispose(); this.wake.geometry.dispose();
    this.shockMat.dispose(); this.wakeMat.dispose();
    this.group.removeFromParent();
  }
}
