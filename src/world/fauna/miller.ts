import * as THREE from 'three';
import { Creature, FaunaManager } from './Fauna';
import { AX } from './Rig';
import { MILLER_BIOME } from '../surface/millerBiome';
import { populateMillerDeep, DEEP_SPECIES } from './millerDeep';

/**
 * Miller's Planet — the abyssal biosphere (docs/MILLER_BIOSPHERE.md). Original speculative species; behaviour comes
 * from senses and needs (energy, stress, shelter, tide) rather than random attack rolls.
 *   Eco         — shared state: tidal states from real precursors, the field log (observations → research flags).
 *   Ferracaris  — reef grazer colonies (instanced): graze, clamp to the rock when flow or a shadow comes, hide in
 *                 crevices before a crest, some swept away; harmless.
 *   SedimentMaw — buried suction ambusher in the soft hollow: feels footsteps, a short-range suction pulse and a
 *                 clamp on a foot (pull free with E), a missed strike costs it, it relocates when disturbed too often.
 *   MimicCrawler — camouflaged eight-limbed crawler of the reef pool: watches, forages, carries an odd object to its
 *                 den, warns with rippling skin patterns, grips and bites only when cornered near its eggs; remembers.
 */
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const SAND = new THREE.Color(0.42, 0.42, 0.4);
const SILT = new THREE.Color(0.3, 0.32, 0.3);
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const smooth = THREE.MathUtils.smoothstep;

function rnd(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ------------------------------------------------------------------------------------------------ research catalogue
export interface SpeciesInfo {
  name: string;
  latin: string;
  size: string;
  habitat: string;
  diet: string;
  senses: string;
  tide: string;
  threat: string;
}
export const MILLER_SPECIES: Record<string, SpeciesInfo> = {
  ferracaris: {
    name: 'Ferracaris depressa', latin: 'Ferracaris depressa', size: '8–30 cm (game estimate)', habitat: 'Wet basalt of the reef, crevices, awash ledges',
    diet: 'Grazes microbial films off rock (foundation of the reef food web)', senses: 'Tactile fringe filaments, flow-sensitive margins',
    tide: 'Clamps flat as flow rises; retreats into fissures before a crest; some are swept away', threat: 'Harmless',
  },
  sedimentmaw: {
    name: 'Sediment Maw', latin: 'Arenafaux vorax', size: '1.2–2.5 m across, mostly buried (game estimate)', habitat: 'Soft fine-sediment hollows with prey traffic',
    diet: 'Small benthic animals pulled in by a short suction pulse', senses: 'Tactile and vibration sensors in the mouth rim and back; chemical cues down-current',
    tide: 'Buries deeper and seals the mouth before a crest', threat: 'Foot entrapment, loss of balance; cannot swallow a suited person',
  },
  mimic: {
    name: 'Mimic Crawler', latin: 'Cryptomorphus sapiens', size: '1.5–2.8 m span (game estimate)', habitat: 'Reef crevices, sheltered pools, cave mouths',
    diet: 'Omnivore and scavenger; small prey', senses: 'Large camera eyes, chemoreceptors on the limbs and mouth, touch across the limbs',
    tide: 'Stops exploring, compresses into its den and anchors', threat: 'Grip and bite only if cornered or near its eggs',
  },
};

Object.assign(MILLER_SPECIES, DEEP_SPECIES);

/** Shared ecosystem state: the tides as each place feels them, and the field log. A model-less creature, updated first. */
export class Eco extends Creature {
  readonly species = 'eco';
  /** something new this frame the player saw (for tests and the HUD) */
  last = '';
  canister: THREE.Group | null = null;

  constructor(f: FaunaManager) {
    super(f);
    this.view = 1e9;
    this.nearR = 1e9;
  }

  /** 0 quiet · 1 precursors · 2 anticipatory retreat · 3 high hazard · 4 post-wave */
  tideState(x: number, z: number) {
    const t = this.f.host.tide(x, z);
    if (!t) return 0;
    if (t.since < 90) return 4;
    if (t.tta < 40) return 3;
    if (t.tta < 120) return 2;
    if (t.tta < 240) return 1;
    return 0;
  }

  /** record evidence once (flag bio:<species>:<key>); the first sighting of a species is announced */
  note(species: string, key: string, text: string) {
    const g = this.game;
    const k = `bio:${species}:${key}`;
    if (g.flag(k)) return false;
    g.flag(k, Math.round(g.state.clock.earthTime));
    const info = MILLER_SPECIES[species];
    const first = key === 'sighting';
    g.notify(first ? `New life form recorded — ${info?.name ?? species}. Field log updated.` : `Field log · ${info?.name ?? species}: ${text}`, 'ok', 5);
    this.last = `${species}:${key}`;
    g.log?.('mission', 'computer', `${info?.name ?? species} — ${text}`);
    return true;
  }

  /** the player is looking at a point closely enough to see what happens there */
  watching(p: THREE.Vector3, range: number, cone = 0.35) {
    const cam = this.game.camera;
    const c = cam.getWorldPosition(_w);
    const d = c.distanceTo(p);
    if (d > range) return false;
    // under water, visibility is the murk's
    if (this.f.host.waterLevel(c.x, c.z) > c.y && d > 22) return false;
    cam.getWorldDirection(_u);
    _v.subVectors(p, c).normalize();
    return _u.dot(_v) > Math.cos(cone);
  }

  update() {
    this.pos.copy(this.game.player.pos);
  }

  dispose() {
    super.dispose();
    if (this.canister) {
      this.canister.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.canister.removeFromParent();
    }
  }
}

// ================================================================================================ Ferracaris
interface Grazer {
  x: number;
  z: number;
  yaw: number;
  s: number;
  state: 'graze' | 'clamp' | 'hide' | 'gone';
  t: number;
  move: number;
  hx: number;
  hz: number;
  turn: number;
}

/** A reef colony of Ferracaris: one instanced mesh per material, the legs and fringe animated in the vertex shader. */
class FerracarisColony extends Creature {
  readonly species = 'ferracaris';
  private meshes: THREE.InstancedMesh[] = [];
  private ind: Grazer[] = [];
  private phase!: THREE.InstancedBufferAttribute;
  private moving!: THREE.InstancedBufferAttribute;
  private uT = { value: 0 };
  private watchT = 0;
  private lastState = 0;
  private sweptN = 0;

  constructor(f: FaunaManager, readonly eco: Eco, readonly cx: number, readonly cz: number, readonly n: number, readonly seed: number) {
    super(f);
    this.view = 70;
    this.nearR = 70;
  }

  async build() {
    const inst = await this.game.assets.instance('fauna_ferracaris');
    const R = rnd(this.seed);
    const host = this.f.host;
    // spots on wet rock: the ledges awash or just under the water, not the dry crests
    for (let i = 0; i < this.n * 40 && this.ind.length < this.n; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * 3.2;
      const x = this.cx + Math.cos(a) * d, z = this.cz + Math.sin(a) * d;
      const y = host.terrainY(x, z);
      if (y < -0.4 || y > 0.3) continue;
      const g: Grazer = { x, z, yaw: R() * TAU, s: 0.55 + 0.6 * R(), state: 'graze', t: R() * 10, move: 1, hx: x, hz: z, turn: (R() - 0.5) * 0.6 };
      this.ind.push(g);
    }
    const N = Math.max(1, this.ind.length);
    const ph = new Float32Array(N), mv = new Float32Array(N);
    for (let i = 0; i < N; i++) ph[i] = R() * TAU;
    this.phase = new THREE.InstancedBufferAttribute(ph, 1);
    this.moving = new THREE.InstancedBufferAttribute(mv, 1);
    const uT = this.uT;
    inst.root.updateMatrixWorld(true);
    inst.root.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const geo = src.geometry.clone();
      geo.applyMatrix4(src.matrixWorld);
      geo.setAttribute('aPhase', this.phase);
      geo.setAttribute('aMove', this.moving);
      const mat = (src.material as THREE.MeshStandardMaterial).clone();
      const legs = /ferra_leg|ferra_fringe/.test(mat.name);
      if (legs) {
        // metachronal leg waves (front to back) while walking; the fringe trembles in the flow
        const prev = mat.onBeforeCompile;
        mat.onBeforeCompile = (sh, r) => {
          prev?.call(mat, sh, r);
          sh.uniforms.uT = uT;
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uT; attribute float aPhase; attribute float aMove;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              float wave = sin(uT * 13.0 + aPhase - position.z * 70.0);
              float edge = smoothstep(0.03, 0.08, abs(position.x));
              transformed.y += (0.004 * max(wave, 0.0) * aMove + 0.0012 * sin(uT * 3.0 + aPhase + position.z * 40.0)) * edge;
              transformed.z += 0.004 * cos(uT * 13.0 + aPhase - position.z * 70.0) * aMove * edge;`);
        };
        mat.customProgramCacheKey = () => 'ferra_legs';
      }
      const m = new THREE.InstancedMesh(geo, mat, N);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(m);
      this.root.add(m);
    });
    this.f.root.add(this.root);
    this.pos.set(this.cx, host.terrainY(this.cx, this.cz), this.cz);
  }

  update(dt: number, near: boolean) {
    this.uT.value += dt;
    if (!near || !this.meshes.length) return;
    const host = this.f.host;
    const eco = this.eco;
    const pl = this.game.player;
    const tide = eco.tideState(this.cx, this.cz);
    const plFast = pl.vel.length() > 0.6;
    const mv = this.moving.array as Float32Array;
    let hidden = 0;
    this.ind.forEach((g, i) => {
      g.t += dt;
      const dp = Math.hypot(pl.pos.x - g.x, pl.pos.z - g.z);
      // the colony reads the water: rising flow → clamp; a coming crest → into the crevices; after it → out again
      if (g.state !== 'gone') {
        if (tide >= 2) g.state = 'hide';
        else if (tide === 1 || (dp < 1.1 && plFast) || dp < 0.45) {
          if (g.state === 'graze') g.t = 0;
          g.state = 'clamp';
        } else if (g.state !== 'graze' && g.t > 6 + (i % 5)) g.state = 'graze';
      }
      let speed = 0;
      if (g.state === 'graze') {
        // slow wandering over the film, turning back toward home
        g.yaw += (g.turn + 0.6 * Math.sin(g.t * 0.3 + i)) * dt * 0.4;
        const toHome = Math.atan2(g.hx - g.x, g.hz - g.z);
        if (Math.hypot(g.hx - g.x, g.hz - g.z) > 1.5) g.yaw += Math.sin(toHome - g.yaw) * dt;
        speed = 0.012 * (0.5 + 0.5 * Math.sin(g.t * 0.7 + i * 2));
      } else if (g.state === 'hide') {
        // down into the nearest fissure (the lowest wet rock nearby)
        let best = host.terrainY(g.x, g.z), bx = g.x, bz = g.z;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU, x = g.x + Math.cos(a) * 0.4, z = g.z + Math.sin(a) * 0.4;
          const y = host.terrainY(x, z);
          if (y < best - 0.02) {
            best = y;
            bx = x;
            bz = z;
          }
        }
        if (bx !== g.x || bz !== g.z) {
          g.yaw = Math.atan2(bx - g.x, bz - g.z);
          speed = 0.05;
        } else hidden++;
      }
      g.move = damp(g.move, speed > 0 ? 1 : 0, 6, dt);
      mv[i] = g.move;
      g.x += Math.sin(g.yaw) * speed * dt;
      g.z += Math.cos(g.yaw) * speed * dt;
    });
    // the crest went over: grazers caught out of shelter are swept off the rock; the colony refills slowly later
    if (tide === 4 && this.lastState !== 4) {
      this.ind.forEach((g) => {
        if (g.state !== 'hide' || Math.random() < 0.08) {
          g.state = 'gone';
          this.sweptN++;
        }
      });
    }
    if (tide === 0 && this.sweptN > 0) {
      for (const g of this.ind) {
        if (g.state === 'gone' && Math.random() < dt * 0.01) {
          g.state = 'graze';
          g.s = 0.35 + 0.2 * Math.random(); // a juvenile settles
          g.x = g.hx;
          g.z = g.hz;
          this.sweptN--;
        }
      }
    }
    this.lastState = tide;
    this.moving.needsUpdate = true;
    // write the matrices: on the rock, aligned to its slope, flattened when clamped
    this.ind.forEach((g, i) => {
      const y = host.terrainY(g.x, g.z);
      const e = 0.12;
      const nx = host.terrainY(g.x - e, g.z) - host.terrainY(g.x + e, g.z);
      const nz = host.terrainY(g.x, g.z - e) - host.terrainY(g.x, g.z + e);
      _v.set(nx, 2 * e, nz).normalize();
      _q.setFromUnitVectors(AX.y, _v).multiply(_q2.setFromAxisAngle(AX.y, g.yaw + Math.PI));
      const flat = g.state === 'graze' ? 1 : 0.82;
      const sc = g.state === 'gone' ? 0 : g.s;
      _s.set(sc, sc * flat, sc);
      _m.compose(_u.set(g.x, y - 0.004, g.z), _q, _s);
      for (const m of this.meshes) m.setMatrixAt(i, _m);
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    // field notes
    const c = _w.set(this.cx, host.terrainY(this.cx, this.cz), this.cz);
    if (eco.watching(c, 9, 0.5)) {
      this.watchT += dt;
      if (this.watchT > 2.5) eco.note('ferracaris', 'sighting', 'Small flat armoured animals grazing the wet rock.');
      if (this.watchT > 2.5 && this.ind.some((g) => g.state === 'clamp' && g.t < 3)) eco.note('ferracaris', 'clamp', 'They flatten and grip the rock when disturbed or when the flow rises.');
      if (this.watchT > 1 && tide >= 2 && hidden > 2) eco.note('ferracaris', 'tide', 'Before the crest they creep into fissures — an early warning of the wave.');
    } else this.watchT = Math.max(0, this.watchT - dt);
  }

  dispose() {
    super.dispose();
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}

// ================================================================================================ Sediment Maw
class SedimentMaw extends Creature {
  readonly species = 'sedimentmaw';
  size = 1;
  open = 0;
  energy = 1;
  disturb = 0;
  private breathT = 3;
  private rimR = 0.62;
  private mouth = new THREE.Vector3();
  private watchT = 0;
  private dig = new THREE.Vector3();
  private sink = 0;

  constructor(f: FaunaManager, readonly eco: Eco) {
    super(f);
    this.view = 60;
    this.nearR = 40;
  }

  /** the mouth centre on the sediment (world) */
  mouthPos(out = new THREE.Vector3()) {
    return out.set(0, 0, -0.12 * this.size).applyAxisAngle(AX.y, this.yaw).add(this.pos);
  }

  update(dt: number, near: boolean) {
    const host = this.f.host;
    const pl = this.game.player;
    const eco = this.eco;
    const tide = eco.tideState(this.pos.x, this.pos.z);
    const floor = host.terrainY(this.pos.x, this.pos.z);
    this.energy = Math.min(1, this.energy + dt * 0.004);
    const mp = this.mouthPos(this.mouth);
    const R = this.rimR * this.size;
    const dp = Math.hypot(pl.pos.x - mp.x, pl.pos.z - mp.z);
    const onFoot = host.playerOnFoot();
    // vibration from footsteps through the sediment: stronger with speed, weaker with distance; slow careful steps
    // barely register
    const vib = onFoot && pl.grounded ? clamp(pl.vel.length() / 2, 0, 1) * (1 - clamp(dp / 7, 0, 1)) : 0;
    switch (this.state) {
      case 'idle':
      case 'buried': {
        this.open = damp(this.open, 0, 3, dt);
        // before a crest: deeper into the sediment, mouth sealed
        this.sink = damp(this.sink, tide >= 2 ? 0.18 : 0, 1, dt);
        // a footfall on or at the rim: strike (a hungry, rested animal; never before a crest)
        if (onFoot && dp < R + 0.3 && vib > 0.05 && this.cooldown <= 0 && this.energy > 0.3 && tide < 2 && this.f.hostility > 0) {
          this.setState('strike');
          this.f.voice.burrow(mp);
          this.game.audio.thud(undefined, 0.5, 70);
        } else if (vib > 0.35 && dp < 4 && Math.random() < dt * 2) {
          // it tenses: a ring of sediment shivers (the attentive can see it)
          this.f.puffs.burst(mp, 3, SILT, { speed: 0.4, up: 0.15, size: 0.4, life: 1.2, alpha: 0.35, spread: R * 2 });
        }
        // it breathes through two valves: a faint puff every few seconds
        this.breathT -= dt;
        if (this.breathT < 0) {
          this.breathT = 5 + Math.random() * 4;
          _v.set(0, 0, 0.82 * this.size).applyAxisAngle(AX.y, this.yaw).add(this.pos).setY(floor + 0.02);
          this.f.puffs.burst(_v, 2, SILT, { speed: 0.2, up: 0.25, size: 0.25, life: 1.5, alpha: 0.3, spread: 0.2 });
        }
        if (this.disturb >= 3 && this.cooldown <= 0) {
          // too many disturbances: it digs off to another part of the hollow
          const a = Math.random() * TAU, d = 8 + Math.random() * 14;
          this.dig.set(MILLER_BIOME.hollow.x + Math.cos(a) * d, 0, MILLER_BIOME.hollow.z + Math.sin(a) * d);
          this.setState('relocate');
          this.disturb = 0;
        }
        break;
      }
      case 'strike': {
        // the mouth snaps open; the buccal chamber expands: a brief inflow pulls loose things (and feet) toward it
        this.open = Math.min(1, this.open + dt / 0.12);
        if (this.st < 0.3 && onFoot && dp < R + 0.8) {
          _v.set(mp.x - pl.pos.x, 0, mp.z - pl.pos.z).normalize().multiplyScalar(2.2);
          this.f.shove.add(_v.multiplyScalar(dt * 6));
        }
        if (this.st < dt * 1.5) {
          this.f.puffs.burst(mp, 26, SAND, { speed: 1.6, up: 1.2, size: 0.8, life: 2.5, alpha: 0.5, spread: R * 1.6 });
          this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 0.5);
        }
        if (this.st > 0.35) {
          if (onFoot && dp < R + 0.12) {
            // a foot caught in the rim: the suit's boot is far too big to swallow — it holds and squeezes
            this.setState('clamp');
            this.f.hurtPlayer(0.05, { cause: 'a Sediment Maw', crack: null, shake: 0.9 });
            const look = () => _u.copy(this.mouth).setY(this.mouth.y + 0.1);
            this.f.grab(this, 'grip', this.f.hostility === 2 ? 8 : 6, look, (broke) => {
              this.setState('reset');
              this.cooldown = 14;
              this.energy -= 0.2;
              if (broke) this.game.notify('You wrenched your boot out of the rim.', 'ok', 3);
            });
            this.game.notify('Your foot is caught in something buried in the sand — mash E (Interact) to pull free!', 'alert', 4);
            if (eco.watching(mp, 6, 1.2)) eco.note('sedimentmaw', 'strike', 'A buried mouth opened under a footstep and clamped the boot.');
          } else {
            // missed: the effort is spent and it must reset
            this.setState('reset');
            this.cooldown = 10;
            this.energy -= 0.25;
            this.disturb++;
            if (eco.watching(mp, 10, 0.6)) eco.note('sedimentmaw', 'strike', 'A suction strike from under the sediment — short range only.');
          }
        }
        break;
      }
      case 'clamp': {
        this.open = damp(this.open, 0.38, 6, dt);
        if (!this.f.hold || this.f.hold.by !== this) {
          this.setState('reset');
          break;
        }
        // the hold slackens by itself: the prey is unsuitable
        if (this.st > 9) this.f.release(false);
        else if (Math.random() < dt * 0.6) this.f.hurtPlayer(0.012, { cause: 'a Sediment Maw', crack: null, shake: 0.3 });
        break;
      }
      case 'reset': {
        this.open = damp(this.open, 0, 1.6, dt);
        if (this.st > 2.5) this.setState('buried');
        break;
      }
      case 'relocate': {
        // moving under the sediment: a faint travelling ripple and silt puffs
        _v.subVectors(this.dig, this.pos).setY(0);
        const d = _v.length();
        if (d < 0.3) this.setState('buried');
        else {
          this.pos.addScaledVector(_v.normalize(), Math.min(d, 0.35 * dt));
          this.sink = damp(this.sink, 0.25, 2, dt);
          if (Math.random() < dt * 3) this.f.puffs.burst(this.pos, 2, SILT, { speed: 0.3, up: 0.2, size: 0.5, life: 1.4, alpha: 0.3, spread: 0.8 });
        }
        break;
      }
    }
    // buried: its back just level with the sediment; it heaves up a little to strike
    const heave = this.state === 'strike' || this.state === 'clamp' ? 0.08 : 0;
    this.pos.y = floor - (0.12 + this.sink) * this.size + heave * this.size;
    if (near) this.pose(dt);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.scale.setScalar(this.size);
    // field notes: careful watching reveals a ring pattern and the breathing puffs
    if (eco.watching(mp, 7, 0.45)) {
      this.watchT += dt;
      if (this.watchT > 4) eco.note('sedimentmaw', 'sighting', 'A ring in the sediment with faint breathing puffs: something is buried here.');
    } else this.watchT = Math.max(0, this.watchT - dt * 0.5);
  }

  private pose(dt: number) {
    const r = this.rig;
    r.reset();
    // the rim: shut it pulls into a sand-covered pucker; open it spreads wide
    const close = (1 - this.open) * 0.48;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      // Blender (cos a, sin a, z) → model (cos a, z, −sin a): inward and down when shut
      r.move(`lip${i}`, _v.set(-Math.cos(a) * close, -close * 0.25 + this.open * 0.05, Math.sin(a) * close));
    }
    r.scale('throat', 1 + this.open * 0.25);
    // digging limbs: tucked under the sediment while buried, braced out in a strike
    const brace = this.state === 'strike' || this.state === 'clamp' ? 1 : 0;
    ['L', 'R'].forEach((s) => {
      for (let k = 0; k < 3; k++) {
        for (let i = 1; i <= 3; i++) {
          // the limbs point out to the sides: swinging them down is a rotation about the body's long axis
          const sgn = s === 'L' ? 1 : -1;
          r.rot(`limb${s}${k}${i}`, AX.z, sgn * ((0.85 - 1.05 * brace) * (i === 1 ? 1 : 0.5) + 0.04 * Math.sin(this.t * 0.8 + k + i)));
        }
      }
    });
    void dt;
  }
}

// ================================================================================================ Mimic Crawler
class MimicCrawler extends Creature {
  readonly species = 'mimic';
  size = 1;
  readonly den = new THREE.Vector3();
  private target = new THREE.Vector3();
  private camo = 1;
  private display = 0;
  private speedV = 0;
  private gait = 0;
  private uniforms = { uCamo: { value: 1 }, uDisplay: { value: 0 }, uT: { value: 0 } };
  /** temperament and memory */
  bold = 0.6;
  encounters = 0;
  private tense = 0;
  private holding = false;
  private eyeYaw = 0;
  private eyePitch = 0;
  private watchT = 0;
  private wasHidden = true;
  private eggs: THREE.Group | null = null;
  private squash = 1;

  constructor(f: FaunaManager, readonly eco: Eco) {
    super(f);
    this.view = 70;
    this.nearR = 45;
  }

  /** skin: camouflage toward the basalt's mottle, and rippling high-contrast warning bands */
  setupSkin() {
    const U = this.uniforms;
    for (const m of this.glow) {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        prev?.call(m, sh, r);
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vMimicP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMimicP = position;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vMimicP; uniform float uCamo, uDisplay, uT;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            float mot = 0.5 + 0.5 * sin(vMimicP.x * 23.0 + sin(vMimicP.z * 17.0)) * sin(vMimicP.z * 19.0 + vMimicP.y * 11.0);
            vec3 rock = mix(vec3(0.035, 0.038, 0.042), vec3(0.11, 0.1, 0.09), mot);
            diffuseColor.rgb = mix(diffuseColor.rgb, rock, uCamo * 0.85);
            float band = smoothstep(-0.2, 0.2, sin(length(vMimicP.xz) * 26.0 - uT * 7.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.025, 0.022, 0.02), vec3(0.42, 0.37, 0.31), band), uDisplay * 0.85);`);
      };
      m.customProgramCacheKey = () => 'mimic_skin_' + m.name;
      m.needsUpdate = true;
    }
  }

  /** the clutch under the den's ledge (why it defends this place) */
  buildEggs() {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xd8d2c0, roughness: 0.2, transmission: 0, clearcoat: 1, sheen: 0.5 });
    const geo = new THREE.SphereGeometry(0.045, 12, 8);
    const R = rnd(91);
    for (let i = 0; i < 22; i++) {
      const e = new THREE.Mesh(geo, mat);
      e.position.set((R() - 0.5) * 0.35, 0.03 + R() * 0.05, (R() - 0.5) * 0.25);
      e.scale.setScalar(0.8 + R() * 0.4);
      g.add(e);
    }
    g.position.copy(this.den).add(_v.set(-0.6, 0, 0.3));
    g.position.y = this.f.host.terrainY(g.position.x, g.position.z);
    this.f.root.add(g);
    this.eggs = g;
  }

  private walk(to: THREE.Vector3, v: number, dt: number) {
    const host = this.f.host;
    const want = Math.atan2(-(to.x - this.pos.x), -(to.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    this.yaw += clamp(d, -1.4 * dt, 1.4 * dt);
    this.speedV = damp(this.speedV, Math.abs(d) > 1 ? v * 0.3 : v, 3, dt);
    this.pos.addScaledVector(this.fwd(_w), this.speedV * dt);
    this.pos.y = host.terrainY(this.pos.x, this.pos.z);
    return Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
  }

  update(dt: number, near: boolean) {
    const host = this.f.host;
    const pl = this.game.player;
    const eco = this.eco;
    const tide = eco.tideState(this.pos.x, this.pos.z);
    const dp = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    const dDen = Math.hypot(pl.pos.x - this.den.x, pl.pos.z - this.den.z);
    const onFoot = host.playerOnFoot();
    const lit = this.game.zone && (this.game.zone as unknown as { headlampOn?: boolean }).headlampOn;
    // what it perceives: the suited figure moving, its lamp, closeness to the clutch
    const seen = onFoot && dp < (lit ? 14 : 9);
    this.tense = damp(this.tense, seen ? 1 - dp / 14 : 0, 1.5, dt);
    let camoT = 0.4;
    let dispT = 0;
    this.speedV = this.state === 'den' || this.state === 'watch' ? damp(this.speedV, 0, 4, dt) : this.speedV;
    this.squash = damp(this.squash, tide >= 2 || this.state === 'den' ? 0.82 : 1, 2, dt);
    switch (this.state) {
      case 'idle':
      case 'den': {
        camoT = 1;
        this.pos.lerp(_v.copy(this.den).setY(host.terrainY(this.den.x, this.den.z)), Math.min(1, dt * 0.5));
        if (tide < 2 && this.st > 8 && !seen && this.cooldown <= 0) {
          // go out foraging; an unfamiliar object nearby draws it first
          const c = eco.canister;
          if (c && !c.userData.inDen && c.position.distanceTo(this.den) < 16) {
            this.target.copy(c.position);
            this.setState('inspect');
          } else {
            const a = Math.random() * TAU;
            this.target.set(this.den.x + Math.cos(a) * 5, 0, this.den.z + Math.sin(a) * 5);
            this.setState('forage');
          }
        }
        if (seen && dDen < 3.2 && this.f.hostility > 0) this.setState('warn');
        break;
      }
      case 'forage': {
        camoT = 0.65;
        const d = this.walk(this.target, 0.22, dt);
        if (d < 0.4 || this.st > 30) this.setState('return');
        if (seen && dp < 6) this.setState('watch');
        if (tide >= 1) this.setState('return');
        break;
      }
      case 'inspect': {
        // it observes the strange object before touching it; then it takes it home
        camoT = 0.6;
        const c = eco.canister!;
        const d = this.walk(this.target.copy(c.position), this.st < 4 ? 0.15 : 0.28, dt);
        if (d < 0.9) {
          this.speedV = 0;
          if (this.st > 6) {
            this.holding = true;
            this.setState('carry');
          }
        }
        if (seen && dp < 5) this.setState('watch');
        if (tide >= 1) this.setState('return');
        break;
      }
      case 'carry': {
        camoT = 0.55;
        const c = eco.canister!;
        const d = this.walk(this.den, 0.22, dt);
        c.position.copy(this.pos).add(_v.set(0, 0.12, 0)).addScaledVector(this.fwd(_u), 0.75);
        c.position.y = Math.max(c.position.y, host.terrainY(c.position.x, c.position.z) + 0.1);
        c.rotation.y = this.yaw + 0.6;
        if (eco.watching(this.pos, 12, 0.5)) eco.note('mimic', 'manipulation', 'It gripped the instrument canister, turned it over and carried it into its den.');
        if (d < 0.6) {
          c.userData.inDen = true;
          c.position.copy(this.den).add(_v.set(0.3, 0.1, -0.4));
          c.position.y = host.terrainY(c.position.x, c.position.z) + 0.1;
          this.holding = false;
          this.setState('den');
          this.cooldown = 20;
        }
        if (tide >= 2) {
          this.holding = false;
          this.setState('return');
        }
        break;
      }
      case 'watch': {
        // freeze and match the rock; the eyes keep following
        camoT = 1;
        if (!seen || dp > 9) this.setState('return');
        else if (dDen < 3.2 && this.f.hostility > 0) this.setState('warn');
        else if (this.st > 12 && dp > 3) this.setState('return');
        break;
      }
      case 'warn': {
        // arms spread, mantle up, skin rippling in bands: a clear signal with a way out
        dispT = 1;
        camoT = 0;
        if (eco.watching(this.pos, 10, 0.6)) eco.note('mimic', 'display', 'Threat display near a clutch of eggs: rippling bands, arms spread. It is guarding them.');
        if (!seen || dDen > 4.5) {
          this.setState('den');
          break;
        }
        // stay close after the warning (and nearer still if it already knows you): it grapples
        const reach = 1.7 + 0.25 * this.encounters;
        // (after a grapple it only displays for a while: the intruder has time to back off)
        if (dp < reach && this.st > 2.5 - Math.min(1.5, this.encounters * 0.5) && onFoot && !this.f.hold && this.cooldown <= 0) {
          this.setState('grapple');
          this.encounters++;
          this.f.grab(this, 'grip', this.f.hostility === 2 ? 9 : 6, () => _u.copy(this.pos).setY(this.pos.y + 0.4), (broke) => {
            this.setState('retreat');
            this.cooldown = 25;
            if (broke) this.game.notify('You tore free — it jetted back into its den.', 'ok', 3);
          });
          this.game.notify('A limb has wrapped round your leg — mash E (Interact) to tear free!', 'alert', 4);
          this.game.audio.thud(undefined, 0.4, 90);
          if (eco.watching(this.pos, 6, 1.2)) eco.note('mimic', 'grapple', 'It wrapped a limb round a leg — contact grip, then a bite at exposed suit.');
        }
        break;
      }
      case 'grapple': {
        dispT = 0.6;
        camoT = 0;
        if (!this.f.hold || this.f.hold.by !== this) {
          this.setState('retreat');
          break;
        }
        this.yaw = Math.atan2(-(pl.pos.x - this.pos.x), -(pl.pos.z - this.pos.z));
        if (this.st > 1.6 && Math.floor(this.st / 1.6) !== Math.floor((this.st - dt) / 1.6)) this.f.hurtPlayer(0.05, { cause: 'a Mimic Crawler', crack: null, shake: 0.6 });
        if (this.st > 8) this.f.release(false); // not food: it lets go
        break;
      }
      case 'retreat':
      case 'return': {
        camoT = 0.9;
        if (this.walk(this.den, this.state === 'retreat' ? 0.9 : 0.3, dt) < 0.4) this.setState('den');
        break;
      }
    }
    if (tide >= 2 && this.state !== 'den' && this.state !== 'grapple' && this.state !== 'retreat' && this.state !== 'return') this.setState('return');
    this.camo = damp(this.camo, camoT, 1.2, dt);
    this.display = damp(this.display, dispT, 3, dt);
    this.uniforms.uCamo.value = this.camo;
    this.uniforms.uDisplay.value = this.display;
    this.uniforms.uT.value = this.t;
    // field notes: hard to see until it moves or the camouflage slips
    const hidden = this.camo > 0.85 && this.speedV < 0.05;
    if (eco.watching(this.pos, hidden ? 3.5 : 12, hidden ? 0.3 : 0.45)) {
      this.watchT += dt;
      if (this.watchT > 2.5) eco.note('mimic', 'sighting', hidden ? 'What looked like rock has eyes — and they follow you.' : 'An eight-limbed armoured crawler.');
      if (this.wasHidden && !hidden && this.watchT > 1) eco.note('mimic', 'camouflage', 'Its skin shifted from rock mottle to its own colours within seconds.');
    } else this.watchT = Math.max(0, this.watchT - dt);
    this.wasHidden = hidden;
    if (near) this.pose(dt, pl.pos);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.scale.set(this.size, this.size * this.squash * (1 + 0.12 * this.display), this.size);
  }

  private pose(dt: number, target: THREE.Vector3) {
    const r = this.rig;
    r.reset();
    this.gait += this.speedV * dt * 9;
    const walking = clamp(this.speedV / 0.2, 0, 1);
    const spread = this.display;
    ['L', 'R'].forEach((s, si) => {
      const sx = si === 0 ? -1 : 1;
      for (let k = 0; k < 4; k++) {
        // alternating arms step: lift and swing; at rest the distal halves curl and uncurl slowly
        const ph = this.gait + k * Math.PI * 0.5 + si * Math.PI;
        r.rot(`arm${s}${k}1`, AX.y, sx * (0.18 * Math.sin(ph) * walking + 0.25 * spread));
        r.rot(`arm${s}${k}1`, AX.x, -0.14 * Math.max(0, Math.sin(ph)) * walking - 0.25 * spread);
        for (let i = 3; i <= 5; i++) r.rot(`arm${s}${k}${i}`, AX.y, sx * (0.12 * Math.sin(this.t * 0.7 + k + i) * (1 - walking) * (1 - spread)));
      }
    });
    // the grapple: the nearest front arm reaches for the leg
    if (this.state === 'grapple') {
      for (let i = 1; i <= 5; i++) r.rot(`armR0${i}`, AX.y, i === 1 ? -0.5 : -0.15);
    }
    // eyes follow what it watches
    _v.copy(target).sub(this.pos);
    const yaw = Math.atan2(-_v.x, -_v.z) - this.yaw;
    const want = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    this.eyeYaw = damp(this.eyeYaw, clamp(want, -1.2, 1.2), 4, dt);
    this.eyePitch = damp(this.eyePitch, clamp(Math.atan2(_v.y + 1.2, Math.hypot(_v.x, _v.z)), -0.4, 0.5), 4, dt);
    for (const e of ['eyeL', 'eyeR']) {
      r.rot(e, AX.y, this.eyeYaw * 0.6);
      r.rot(e, AX.x, this.eyePitch * 0.5);
    }
    r.scale('body', 1 + 0.03 * Math.sin(this.t * 1.3) + 0.12 * this.display);
  }

  dispose() {
    super.dispose();
    if (this.eggs) {
      this.eggs.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.eggs.removeFromParent();
    }
  }
}

/** The instrument canister from Miller's lander, washed against the reef pool's edge. */
function buildCanister(f: FaunaManager, at: THREE.Vector3) {
  const g = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color: 0xcfcbc0, roughness: 0.45, metalness: 0.3 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xc89b20, roughness: 0.5 });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x103040, roughness: 0.05, clearcoat: 1, emissive: new THREE.Color(0.1, 0.5, 0.7), emissiveIntensity: 0.6 });
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 18), body);
  c.rotation.z = Math.PI / 2;
  g.add(c);
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.113, 0.113, 0.05, 18), stripe);
  s.rotation.z = Math.PI / 2;
  s.position.x = 0.07;
  g.add(s);
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), lens);
  l.position.set(-0.17, 0, 0);
  g.add(l);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 4), body);
  ant.position.set(0.05, 0.16, 0);
  g.add(ant);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  g.position.copy(at);
  f.root.add(g);
  return g;
}

// ================================================================================================ population
export async function populateMiller(f: FaunaManager) {
  const eco = new Eco(f);
  f.creatures.unshift(eco);
  const B = MILLER_BIOME;
  const host = f.host;
  const R = rnd(4242);
  const jobs: Promise<unknown>[] = [];
  // Ferracaris colonies on the reef's wet rock
  const colonies = [
    [B.reef.x + 12, B.reef.z - 8],
    [B.reef.x - 18, B.reef.z + 14],
    [B.reef.x + 4, B.reef.z + 22],
  ];
  colonies.forEach(([x, z], i) => {
    const c = new FerracarisColony(f, eco, x, z, f.count(16), 77 + i * 13);
    jobs.push(c.build().then(() => f.creatures.push(c)));
  });
  // Sediment Maws buried in the soft hollow
  for (let i = 0; i < f.count(3); i++) {
    const m = new SedimentMaw(f, eco);
    const a = (i / 3) * TAU + R(), d = 6 + R() * 18;
    m.pos.set(B.hollow.x + Math.cos(a) * d, 0, B.hollow.z + Math.sin(a) * d);
    m.size = 0.75 + R() * 0.3;
    m.yaw = R() * TAU;
    m.setState('buried');
    jobs.push(f.add(m, 'fauna_sedimentmaw'));
  }
  // a Mimic Crawler denning on the reef pool's sheltered west side; its eggs under the ledge; the canister nearby
  const mc = new MimicCrawler(f, eco);
  mc.den.set(B.pool.x + 9, 0, B.pool.z - 2);
  mc.den.y = host.terrainY(mc.den.x, mc.den.z);
  mc.pos.copy(mc.den);
  mc.yaw = -Math.PI / 2;
  mc.bold = 0.4 + R() * 0.5;
  mc.setState('den');
  mc.st = 0;
  jobs.push(
    f.add(mc, 'fauna_mimic', ['mimic_skin', 'mimic_plate', 'mimic_under']).then(() => {
      mc.setupSkin();
      mc.buildEggs();
    }),
  );
  jobs.push(populateMillerDeep(f, eco));
  const cp = new THREE.Vector3(B.pool.x + 3, 0, B.pool.z - 7);
  cp.y = host.terrainY(cp.x, cp.z) + 0.1;
  eco.canister = buildCanister(f, cp);
  await Promise.all(jobs);
}
