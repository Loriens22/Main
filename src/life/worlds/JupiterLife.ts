import * as THREE from 'three';
import type { SurfaceZone } from '../../world/space/SurfaceZone';
import { assets } from '../../render/Assets';
import { hashRand, type Creature } from '../Creature';
import { JUPITER_SPECIES } from '../species';
import { Schools } from './Schools';
import { WorldLife } from './WorldLife';
import { ui } from '../../ui/store';
import { mission } from '../../mission/Mission';
import { story } from '../../core/Story';
import { clamp } from '../../core/math';

const SAVED: { eco?: any } = {};

const GLINT_VERT = /* glsl */ `
attribute float aSeed;
uniform float uT;
uniform float uPx;
uniform vec3 uSun;
varying float vB;
void main() {
  // each glint orbits its swarm's centre in a loose, slowly churning cloud
  vec3 p = position;
  float a = uT * ( 0.05 + 0.08 * fract( aSeed * 7.0 ) ) + aSeed * 40.0;
  p += vec3( sin( a ) * 3.0, sin( a * 1.3 + 2.0 ) * 1.5, cos( a * 0.9 ) * 3.0 );
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  float d = max( 0.5, -mv.z );
  gl_Position = projectionMatrix * mv;
  // sunlight glinting off reflective membranes: flickering as they turn
  float flick = pow( 0.5 + 0.5 * sin( uT * ( 3.0 + 5.0 * fract( aSeed * 13.0 ) ) + aSeed * 60.0 ), 6.0 );
  vB = ( 0.25 + 2.5 * flick ) * ( 1.0 - smoothstep( 250.0, 700.0, d ) );
  gl_PointSize = clamp( uPx * 0.05 / d, 1.0, 4.0 );
}`;
const GLINT_FRAG = /* glsl */ `
varying float vB;
void main() {
  float r = length( gl_PointCoord - 0.5 );
  if ( r > 0.5 ) discard;
  gl_FragColor = vec4( vec3( 1.0, 0.78, 0.38 ) * vB * ( 1.0 - r * 2.0 ), 1.0 );
}`;

/**
 * The life of Jupiter in the speculative-evolution mode (after the user's nine-panel concept sheet): the animals of
 * the clear air between the broken ammonia cloud above and the deck far below, round the floating station. Each
 * species keeps to its survivable altitude corridor; winds shear with height; haze limits sight; the station's
 * long-range scanner reaches far.
 */
export class JupiterLife extends WorldLife {
  planet = 'jupiter';
  private glints: THREE.Points[] = [];
  private glintMat: THREE.ShaderMaterial;
  private conservative: boolean;
  private introduced = false;

  constructor(zone: SurfaceZone) {
    super(zone, 'jupiter-life');
    this.conservative = zone.game.settings.creative.science === 'conservative';
    this.glintMat = new THREE.ShaderMaterial({
      vertexShader: GLINT_VERT, fragmentShader: GLINT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uPx: { value: 800 }, uSun: { value: new THREE.Vector3() } },
    });
    this.layout();
    this.startEcosystem(SAVED.eco);
    void this.load();
  }

  species() { return this.conservative ? [] : JUPITER_SPECIES.filter((s) => s.id !== 'aeromite'); }

  // ============================================================================================ habitats
  private ring(tag: string, n: number, r0: number, r1: number, y0: number, y1: number, seed: string) {
    for (let i = 0; i < n; i++) {
      const a = hashRand(seed, i) * Math.PI * 2, r = r0 + (r1 - r0) * hashRand(seed, i + 50), y = y0 + (y1 - y0) * hashRand(seed, i + 90);
      this.addSpot(tag, { pos: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), heading: a + Math.PI / 2 });
    }
  }

  private layout() {
    this.ring('upper', 4, 250, 550, 120, 320, 'up');
    this.ring('drift', 6, 45, 220, 10, 140, 'dr');
    this.ring('stormedge', 1, 600, 650, -380, -300, 'se');
    this.ring('colony', 3, 110, 230, -40, 60, 'co');
    this.ring('margin', 5, 160, 380, -80, 100, 'mg');
    this.ring('deep', 3, 180, 320, -560, -430, 'dp');
    this.ring('lane', 3, 200, 420, -160, 20, 'ln');
    this.ring('hunt', 1, 700, 760, 60, 140, 'hn');
  }

  // ============================================================================================ loading
  private async load() {
    if (!this.conservative) {
      const mite = await assets.load('creatures/jupiter/aeromite');
      if (this.disposed) return;
      // aeromite swarms: thousands of centimetre floaters in loose clouds, some drifting past the deck
      const homes = [0, 1, 2, 3, 4].map((i) => {
        const a = hashRand('sw', i) * Math.PI * 2, r = i === 0 ? 40 : 90 + 220 * hashRand('sw', i + 9);
        return { pos: new THREE.Vector3(Math.cos(a) * r, 15 + 60 * hashRand('sw', i + 20), Math.sin(a) * r), range: 60 };
      });
      this.schools = new Schools(mite, homes, 220, { base: 0.03, size: [0.015, 0.04], cloud: [14, 6, 14] });
      this.root.add(this.schools.group);
      for (const h of homes) {
        const n = 1400, pos = new Float32Array(n * 3), seed = new Float32Array(n);
        for (let k = 0; k < n; k++) {
          const r = 28 * Math.cbrt(Math.random()), a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
          pos.set([Math.sin(b) * Math.cos(a) * r, Math.cos(b) * r * 0.45, Math.sin(b) * Math.sin(a) * r], k * 3);
          seed[k] = Math.random();
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        const p = new THREE.Points(g, this.glintMat);
        p.frustumCulled = false;
        p.renderOrder = 9;
        this.glints.push(p);
        this.root.add(p);
      }
    }
    this.ready = true;
  }

  // ============================================================================================ the physical world
  protected ground() { return -1e6; }
  surface(): number | null { return null; }

  /** daylight: full in the clear air, fading into the deeper cloud below */
  lightAt(p: THREE.Vector3) {
    const sun = clamp(this.zone.sky.sunDir.y * 3 + 0.2, 0.05, 1);
    return sun * (p.y > -200 ? 1 : Math.exp((p.y + 200) / 500));
  }

  /** wind shear: the station drifts with its own layer; above and below, the air moves past it */
  protected current(p: THREE.Vector3, out: THREE.Vector3) {
    return out.set(3.0 * Math.sin(p.y / 260), 0.15 * Math.sin(p.x / 400 + p.z / 300), 1.5 * Math.cos(p.y / 380) - 1.5);
  }

  protected hazard() { return { state: 0, cue: 0 }; }
  protected refuge(c: Creature) { return c.home; }

  /** the station's scanner: a telescope on the deck's mast resolves animals far out in the haze */
  protected override scanRange() { return this.sub?.piloted ? 34 : 650; }
  protected override sightScale() { return 4.5; }

  // ============================================================================================ update
  override update(dt: number) {
    super.update(dt);
    if (!this.ready) return;
    const r = this.game.renderer;
    this.glintMat.uniforms.uT.value += dt;
    this.glintMat.uniforms.uPx.value = r.height / (2 * Math.tan(((r.camera as THREE.PerspectiveCamera).fov * Math.PI) / 360));
    if (this.schools) this.schools.list.forEach((s, i) => this.glints[i]?.position.copy(s.contact.pos));
    if (!this.introduced && !this.conservative) {
      this.introduced = true;
      if (!story.has('jupiter_life')) {
        story.set('jupiter_life');
        mission.note('Speculative-evolution mode: the station\'s scanner watches the air round the deck for the hypothetical animals of the sheet (original designs; no life is known on Jupiter).');
        ui.toast('Watch the sky round the deck: the station\'s scanner (R) reaches far into the haze. Field codex: J.', 'info', 7);
      }
    }
  }

  protected save() { SAVED.eco = this.eco.serialize(); }

  override dispose() {
    for (const g of this.glints) g.geometry.dispose();
    this.glintMat.dispose();
    super.dispose();
  }
}
