import * as THREE from 'three';
import { AU, BODIES, BODY, SystemId } from '../space/Bodies';
import { bodyAxes, pole, state } from '../space/Ephemeris';
import type { V3 } from '../space/Kepler';
import { PlanetBody } from './Planet';
import { BlackHoleView } from './BlackHole';
import { toLight } from '../space/Worlds';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();

/**
 * Scaled space: a body at true distance d is drawn at D(d) along the same direction and scaled by D/d, so its
 * apparent size and direction are exact while every body fits the background camera's range. D is monotonic,
 * so drawing farther bodies first keeps occlusion right.
 */
export function compressDistance(d: number) {
  const K = 4e5;
  return d < K ? d : K * (1 + Math.log(d / K));
}

const POINT_VERT = /* glsl */ `
attribute float aI; attribute vec3 aC;
varying float vI; varying vec3 vC;
void main() {
  vI = aI; vC = aC;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp( 2.0 + sqrt( aI ) * 3.0, 0.0, 7.0 );
}`;
const POINT_FRAG = /* glsl */ `
varying float vI; varying vec3 vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot( q, q );
  if ( r > 1.0 ) discard;
  float a = exp( -r * 3.5 );
  gl_FragColor = vec4( vC * vI * a, 1.0 );
}`;

/**
 * Every body of one planetary system drawn in the background (space) scene, placed each frame from double-
 * precision positions: the planets and moons with their real orientation, phases, rings and shadows, the Sun,
 * and the bodies too far away to show a disc as star-like points.
 */
export class SystemView {
  group = new THREE.Group();
  bodies = new Map<string, PlanetBody>();
  private pts: THREE.Points;
  private ptPos: Float32Array;
  private ptI: Float32Array;
  private ptC: Float32Array;
  private ids: string[];
  private sun: THREE.Mesh | null = null;
  private sunGlow: THREE.Sprite | null = null;
  /** bodies drawn by someone else (the Earth globe, Gargantua, the wormhole) */
  exclude = new Set<string>();
  /** reference date for slowly accumulating effects (zonal-wind shear, cloud drift) */
  jdRef = 0;
  /** brightness of the sunlight on bodies (renderer units at 1 au) */
  sunE = 20;
  /** draw the Sun (off where a sky model already draws its disc) */
  showSun = true;
  /** bodies whose limb a sky model draws instead of the simple shell */
  noShell = new Set<string>();
  /** Gargantua and its galaxy (the Gargantua system's whole background) */
  blackHole: BlackHoleView | null = null;
  /** current eye adaptation, so the black hole shader keeps the stars at a sensible brightness */
  exposure = 1;

  constructor(public system: SystemId, ids?: string[]) {
    this.ids = ids ?? BODIES.filter((b) => b.system === system && b.kind !== 'star' && b.kind !== 'blackhole' && b.kind !== 'wormhole' && b.R > 50e3).map((b) => b.id);
    for (const id of this.ids) {
      const p = new PlanetBody(BODY[id], ['jupiter', 'saturn', 'earth', 'mars', 'moon'].includes(id) ? 192 : 96);
      this.bodies.set(id, p);
      this.group.add(p.group);
    }
    const n = this.ids.length;
    this.ptPos = new Float32Array(n * 3); this.ptI = new Float32Array(n); this.ptC = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.ptPos, 3));
    g.setAttribute('aI', new THREE.BufferAttribute(this.ptI, 1));
    g.setAttribute('aC', new THREE.BufferAttribute(this.ptC, 3));
    this.pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
    this.pts.frustumCulled = false;
    this.pts.renderOrder = -2999;
    this.group.add(this.pts);
    if (system === 'gargantua') {
      this.blackHole = new BlackHoleView(BODY.gargantua.R);
      this.group.add(this.blackHole.mesh);
    }
    if (system === 'sol') {
      this.sun = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(60, 54, 46), depthTest: false, depthWrite: false, toneMapped: false }));
      this.sun.frustumCulled = false;
      this.group.add(this.sun);
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d')!;
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,250,240,1)'); gr.addColorStop(0.08, 'rgba(255,240,220,0.6)'); gr.addColorStop(0.3, 'rgba(255,220,180,0.12)'); gr.addColorStop(1, 'rgba(255,200,160,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: new THREE.Color(3, 2.8, 2.5), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }));
      this.sunGlow.renderOrder = -2990;
      this.group.add(this.sunGlow);
    }
  }

  /**
   * Place everything for a camera at camSys (system frame, metres) with rot taking system vectors to the zone frame
   * the background camera draws in. pxPerRad: viewport pixels per radian (for the point/disc decision).
   */
  update(jd: number, camSys: V3, rot: THREE.Matrix4, pxPerRad: number) {
    if (!this.jdRef) this.jdRef = jd;
    const tRel = (jd - this.jdRef) * 86400;
    const order: [string, number][] = [];
    // light source at the system origin (the Sun, or Gargantua's accretion disk)
    const sunRel = _v.set(-camSys[0], -camSys[1], -camSys[2]).applyMatrix4(rot);
    this.blackHole?.update(camSys, rot, tRel, this.exposure);
    if (this.sun && this.sunGlow) {
      this.sun.visible = this.sunGlow.visible = this.showSun;
      const d = sunRel.length(), D = compressDistance(d), k = D / d;
      this.sun.position.copy(sunRel).multiplyScalar(k);
      this.sun.scale.setScalar(BODY.sun.R * k);
      this.sun.renderOrder = -2995;
      this.sunGlow.position.copy(this.sun.position);
      // glare a fixed fraction of the view, brighter closer in
      this.sunGlow.scale.setScalar(D * 0.12 * Math.min(2.5, Math.sqrt(AU / d)));
    }
    let i = 0;
    for (const id of this.ids) {
      const p = this.bodies.get(id)!;
      const b = BODY[id];
      const s = state(id, jd).r;
      const rel = _a.set(s[0] - camSys[0], s[1] - camSys[1], s[2] - camSys[2]);
      const relZ = rel.clone().applyMatrix4(rot);
      const d = rel.length();
      const D = compressDistance(d), k = D / d;
      const hidden = this.exclude.has(id);
      p.group.visible = !hidden;
      p.group.position.copy(relZ).multiplyScalar(k);
      p.group.scale.setScalar(b.R * k);
      // orientation: object +X prime meridian, +Y pole, -Z 90 E
      const ax = bodyAxes(id, jd);
      const X = _b.set(ax.x[0], ax.x[1], ax.x[2]).applyMatrix4(rot);
      const Y = _c.set(ax.z[0], ax.z[1], ax.z[2]).applyMatrix4(rot);
      const Z = _v.set(-ax.y[0], -ax.y[1], -ax.y[2]).applyMatrix4(rot);
      _m.makeBasis(X, Y, Z);
      p.group.quaternion.setFromRotationMatrix(_m);
      const u = p.mat.uniforms;
      // sunlight: direction from the body to the system origin, irradiance falling with distance (or set per world)
      const tl = toLight(s, this.system);
      const toSun = _b.set(tl[0], tl[1], tl[2]);
      const ds = toSun.length();
      (u.uSunDir.value as THREE.Vector3).copy(toSun.applyMatrix4(rot).normalize());
      const irr = this.system === 'sol' ? (AU / ds) ** 2 : b.insolation ?? 0.5;
      (u.uSunCol.value as THREE.Vector3).set(1.0, 0.97, 0.92).multiplyScalar(this.sunE * irr * 0.12);
      const pw = pole(id);
      (u.uPoleW.value as THREE.Vector3).set(pw[0], pw[1], pw[2]).applyMatrix4(rot).normalize();
      u.uTime.value = tRel;
      u.uDetail.value = Math.max(0, Math.min(1, 1 - (d - b.R) / (b.R * 0.6)));
      if (p.shellMat) {
        (p.shellMat.uniforms.uCenterRel.value as THREE.Vector3).copy(p.group.position);
        p.shellMat.uniforms.uRadiusW.value = b.R * k;
        p.shellMat.uniforms.uHW.value = p.hazeH * b.R * k;
      }
      if (p.ringMat) {
        (p.ringMat.uniforms.uCenterRel.value as THREE.Vector3).copy(p.group.position);
        p.ringMat.uniforms.uRadius.value = b.R * k;
      }
      // a disc smaller than a couple of pixels is drawn as a point of light instead
      const angPx = (b.R / d) * pxPerRad;
      const pt = Math.max(0, Math.min(1, (2.5 - angPx) / 1.5));
      p.globe.visible = !hidden && angPx > 0.6;
      if (p.ring) p.ring.visible = !hidden && angPx > 0.6;
      if (p.shell) p.shell.visible = !hidden && angPx > 1.2 && !this.noShell.has(id);
      const dir = relZ.normalize();
      this.ptPos[i * 3] = dir.x * 3.9e6; this.ptPos[i * 3 + 1] = dir.y * 3.9e6; this.ptPos[i * 3 + 2] = dir.z * 3.9e6;
      // reflected light: albedo x illumination x apparent size x half-phase
      const phase = 0.5 * (1 + (u.uSunDir.value as THREE.Vector3).dot(_c.copy(dir).negate()));
      const flux = 0.3 * irr * ((b.R / d) ** 2) * phase * (b.rings ? 1.8 : 1);
      this.ptI[i] = hidden ? 0 : pt * Math.min(25, flux * 6e7);
      const tint = b.kind === 'gas' ? [1, 0.92, 0.78] : b.kind === 'ice' ? [0.75, 0.9, 1] : b.id === 'mars' ? [1, 0.7, 0.5] : [1, 0.97, 0.92];
      this.ptC[i * 3] = tint[0]; this.ptC[i * 3 + 1] = tint[1]; this.ptC[i * 3 + 2] = tint[2];
      order.push([id, d]);
      i++;
    }
    (this.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pts.geometry.attributes.aI as THREE.BufferAttribute).needsUpdate = true;
    // farther first
    order.sort((a, b) => b[1] - a[1]);
    order.forEach(([id], k) => this.bodies.get(id)!.setOrder(-2900 + k * 4));
  }

  dispose() {
    this.blackHole?.dispose();
    for (const p of this.bodies.values()) p.dispose();
    this.group.removeFromParent();
  }
}
