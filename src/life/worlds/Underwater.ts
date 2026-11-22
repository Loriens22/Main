import * as THREE from 'three';
import { W } from '../../render/patch';

/** the light the particles show up in: the sub's lamp bar (a cone) and the ambient light at the camera */
export interface Lamp { pos: THREE.Vector3; dir: THREE.Vector3; on: boolean }

const VOL_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

// the same water colour the patched materials fade into (patch.ts FRAG_FOG), so distant rock dissolves seamlessly
const VOL_FRAG = /* glsl */ `
uniform vec4 uWater;
uniform vec3 uWaterCol;
uniform float uCamDep;
varying vec3 vDir;
void main() {
  vec3 d = normalize( vDir );
  vec3 wc = uWaterCol * exp( -uCamDep * uWater.w * vec3( 1.6, 0.95, 0.8 ) ) * ( 1.0 + 0.8 * pow( max( d.y, 0.0 ), 1.5 ) );
  gl_FragColor = vec4( wc, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const PART_VERT = /* glsl */ `
attribute float aSeed;
uniform vec3 uCam;
uniform float uT;
uniform float uBox;
uniform vec3 uDrift;
uniform vec3 uLampP;
uniform vec3 uLampD;
uniform float uLampOn;
uniform float uAmb;
uniform float uPx;
uniform float uSize;
uniform vec4 uStir[4];
uniform vec3 uCentre;
uniform float uGlow;
uniform float uWrap;
varying float vB;
varying float vGlow;
void main() {
  vec3 w;
  if ( uWrap > 0.5 ) {
    // marine snow: a box of flakes wrapped round the camera, sinking and carried by the current
    vec3 p = position * uBox + uDrift * uT;
    p.x += sin( uT * 0.31 + aSeed * 40.0 ) * 0.25;
    p.z += cos( uT * 0.27 + aSeed * 31.0 ) * 0.25;
    vec3 rel = mod( p - uCam, uBox ) - 0.5 * uBox;
    w = uCam + rel;
  } else {
    // a bloom: a slowly turning cloud round its centre
    float a = uT * ( 0.01 + 0.02 * fract( aSeed * 13.0 ) );
    vec3 p = position;
    w = uCentre + vec3( p.x * cos( a ) - p.z * sin( a ), p.y + sin( uT * 0.2 + aSeed * 20.0 ) * 0.4, p.x * sin( a ) + p.z * cos( a ) );
  }
  vec4 mv = viewMatrix * vec4( w, 1.0 );
  float d = max( 0.05, -mv.z );
  gl_Position = projectionMatrix * mv;
  vec3 lp = w - uLampP;
  float ld = length( lp );
  float cone = smoothstep( 0.78, 0.94, dot( lp / max( ld, 1e-3 ), uLampD ) ) * uLampOn / ( 1.0 + ld * ld * 0.015 );
  float fade = uWrap > 0.5 ? 1.0 - smoothstep( uBox * 0.3, uBox * 0.5, length( w - uCam ) ) : 1.0 - smoothstep( 40.0, 90.0, d );
  // bioluminescence: sparks where something stirs the water
  float stir = 0.0;
  for ( int i = 0; i < 4; i++ ) { vec3 s = w - uStir[ i ].xyz; stir += uStir[ i ].w * exp( -dot( s, s ) / 5.0 ); }
  vGlow = ( uGlow * ( 0.25 + 0.75 * step( 0.85, fract( aSeed * 91.0 + uT * 0.05 ) ) ) + stir ) * fade;
  vB = ( uAmb * 0.5 + cone * 3.0 ) * fade;
  gl_PointSize = clamp( uPx * uSize * ( 0.7 + 0.6 * fract( aSeed * 7.0 ) ) / d, 1.0, 7.0 );
}`;

const PART_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform vec3 uGlowCol;
varying float vB;
varying float vGlow;
void main() {
  float r = length( gl_PointCoord - 0.5 );
  if ( r > 0.5 ) discard;
  float a = 1.0 - r * 2.0;
  gl_FragColor = vec4( ( uCol * vB + uGlowCol * vGlow ) * a, 1.0 );
}`;

/**
 * Being in the water: the water volume round the camera (the far end of every sight line), marine snow drifting
 * through the lamp beams, plankton blooms that spark where the water is stirred, and the dark plumes of the vents.
 */
export class Underwater {
  group = new THREE.Group();
  volume: THREE.Mesh;
  private volMat: THREE.ShaderMaterial;
  private snow: THREE.Points;
  private blooms: THREE.Points[] = [];
  private plumes: THREE.Points | null = null;
  private mats: THREE.ShaderMaterial[] = [];
  private t = 0;

  constructor(bloomCentres: THREE.Vector3[]) {
    this.volMat = new THREE.ShaderMaterial({
      vertexShader: VOL_VERT, fragmentShader: VOL_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: { uWater: W.uWater, uWaterCol: W.uWaterCol, uCamDep: { value: 0 } },
    });
    this.volume = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), this.volMat);
    this.volume.renderOrder = -5;
    this.volume.frustumCulled = false;
    this.group.add(this.volume);
    this.snow = this.points(2600, (i, p) => p.set(Math.random(), Math.random(), Math.random()), { wrap: true, size: 0.028, col: [0.7, 0.76, 0.74], glow: 0, glowCol: [0.3, 0.9, 1.0] });
    this.group.add(this.snow);
    for (const c of bloomCentres) {
      const b = this.points(2400, (_i, p) => {
        // a lens-shaped cloud, densest in its middle
        const r = 34 * Math.pow(Math.random(), 0.6), a = Math.random() * Math.PI * 2;
        p.set(Math.cos(a) * r, (Math.random() - 0.5) * 10 * (1 - r / 40), Math.sin(a) * r);
      }, { wrap: false, size: 0.03, col: [0.45, 0.62, 0.5], glow: 0.05, glowCol: [0.25, 1.0, 0.75] });
      (b.material as THREE.ShaderMaterial).uniforms.uCentre.value.copy(c);
      this.blooms.push(b);
      this.group.add(b);
    }
  }

  private points(n: number, at: (i: number, p: THREE.Vector3) => void, o: { wrap: boolean; size: number; col: number[]; glow: number; glowCol: number[] }) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) { at(i, p); pos.set([p.x, p.y, p.z], i * 3); seed[i] = Math.random(); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uBox: { value: 26 }, uDrift: { value: new THREE.Vector3(0.02, -0.035, 0.01) },
        uLampP: { value: new THREE.Vector3() }, uLampD: { value: new THREE.Vector3(0, 0, -1) }, uLampOn: { value: 0 }, uAmb: { value: 0 },
        uPx: { value: 800 }, uSize: { value: o.size }, uStir: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uCentre: { value: new THREE.Vector3() },
        uGlow: { value: o.glow }, uWrap: { value: o.wrap ? 1 : 0 }, uCol: { value: new THREE.Color(...o.col) }, uGlowCol: { value: new THREE.Color(...o.glowCol) },
      },
    });
    this.mats.push(m);
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 8;
    return pts;
  }

  /** the dark mineral plumes over the vent chimneys */
  setPlumes(sources: { pos: THREE.Vector3; power: number }[]) {
    const per = 70, n = sources.length * per;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), seed = new Float32Array(n), base = new Float32Array(n * 4);
    sources.forEach((s, k) => {
      for (let i = 0; i < per; i++) {
        const j = k * per + i;
        pos.set([s.pos.x, s.pos.y, s.pos.z], j * 3);
        seed[j] = Math.random();
        base.set([(Math.random() - 0.5), Math.random(), (Math.random() - 0.5), s.power], j * 4);
      }
    });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 4));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uT: { value: 0 }, uPx: { value: 800 }, uAmb: { value: 0 }, uLampP: { value: new THREE.Vector3() }, uLampD: { value: new THREE.Vector3() }, uLampOn: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        attribute vec4 aBase;
        uniform float uT; uniform float uPx; uniform float uAmb; uniform vec3 uLampP; uniform vec3 uLampD; uniform float uLampOn;
        varying float vA; varying float vL;
        void main() {
          // a particle rises from the chimney mouth, spreading and slowing as the plume entrains water
          float h = fract( aBase.y + uT * ( 0.05 + 0.04 * aSeed ) );
          float rise = h * 18.0 * aBase.w;
          float sp = 0.25 + h * 2.6;
          vec3 w = position + vec3( aBase.x * sp + sin( uT * 0.6 + aSeed * 30.0 ) * 0.3 * h, rise, aBase.z * sp + cos( uT * 0.5 + aSeed * 17.0 ) * 0.3 * h );
          vec4 mv = viewMatrix * vec4( w, 1.0 );
          float d = max( 0.1, -mv.z );
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp( uPx * ( 0.5 + 1.6 * h ) / d, 1.0, 64.0 );
          vA = ( 1.0 - h ) * smoothstep( 0.0, 0.05, h ) * 0.35;
          vec3 lp = w - uLampP; float ld = length( lp );
          vL = uAmb * 0.4 + smoothstep( 0.78, 0.94, dot( lp / max( ld, 1e-3 ), uLampD ) ) * uLampOn * 2.0 / ( 1.0 + ld * ld * 0.015 );
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vL;
        void main() {
          float r = length( gl_PointCoord - 0.5 );
          if ( r > 0.5 ) discard;
          // dark mineral smoke: it only shows against the water where light falls on it
          gl_FragColor = vec4( vec3( 0.05, 0.045, 0.04 ) * vL, vA * ( 1.0 - r * 2.0 ) );
        }`,
    });
    this.plumes = new THREE.Points(g, m);
    this.plumes.frustumCulled = false;
    this.plumes.renderOrder = 7;
    this.group.add(this.plumes);
  }

  /**
   * under: the camera is in the water; camDep its depth; amb the ambient light there (0..1); px the pixels per metre
   * at 1 m; stir: up to four points stirring the water (position, strength)
   */
  update(dt: number, cam: THREE.Vector3, under: boolean, camDep: number, amb: number, px: number, lamp: Lamp | null, stir: THREE.Vector4[]) {
    this.t += dt;
    this.volume.visible = under;
    this.volume.position.copy(cam);
    this.volMat.uniforms.uCamDep.value = Math.max(0, camDep);
    this.snow.visible = under;
    for (const m of this.mats) {
      const u = m.uniforms;
      u.uT.value = this.t;
      u.uCam.value.copy(cam);
      u.uAmb.value = amb;
      u.uPx.value = px;
      u.uLampOn.value = lamp && lamp.on ? 1 : 0;
      if (lamp) { u.uLampP.value.copy(lamp.pos); u.uLampD.value.copy(lamp.dir); }
      for (let i = 0; i < 4; i++) u.uStir.value[i].copy(stir[i] ?? _zero);
    }
    for (const b of this.blooms) b.visible = under;
    if (this.plumes) {
      const u = (this.plumes.material as THREE.ShaderMaterial).uniforms;
      u.uT.value = this.t; u.uPx.value = px; u.uAmb.value = amb;
      u.uLampOn.value = lamp && lamp.on ? 1 : 0;
      if (lamp) { u.uLampP.value.copy(lamp.pos); u.uLampD.value.copy(lamp.dir); }
      this.plumes.visible = under;
    }
  }

  /** move a bloom (they drift with the water) */
  moveBloom(i: number, c: THREE.Vector3) { (this.blooms[i]?.material as THREE.ShaderMaterial | undefined)?.uniforms.uCentre.value.copy(c); }

  dispose() {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
    this.volMat.dispose();
    (this.plumes?.material as THREE.Material | undefined)?.dispose();
    this.group.removeFromParent();
  }
}

const _zero = new THREE.Vector4();
