import * as THREE from 'three';
import type { JupiterAir } from './jupiterAir';
import type { Spacecraft } from '../../vehicles/Spacecraft';
import type { Game } from '../../core/Game';
import type { Frame } from '../Frame';
import type { ModelInstance } from '../../render/Assets';
import { Rig } from './Rig';
import { MILLER_FACTOR, START_EARTH_TIME } from '../../core/MissionClock';
import { cloneSkinned } from '../../render/CreatureSkin';
import { CreatureVoice } from '../../audio/CreatureVoice';
import { h } from '../../ui/UI';

/**
 * Alien life (Settings → Alien life): creatures native to Mars (on the ground) and Jupiter (in the cloud layer).
 * A FaunaManager lives in a surface zone, keeps a population around the player, runs their behaviour, and owns what
 * their attacks do to the player (suit integrity, visor cracks, pins, lifts, knock-backs) and to Ranger 1 (hull).
 */
export interface FaunaHost {
  game: Game;
  scene: THREE.Object3D;
  /** 'mars' | 'jupiter' */
  body: string;
  terrainY(x: number, z: number): number;
  sunHeight(): number;
  ground: Frame;
  /** the player is on foot outside (EVA), i.e. a possible target for ground creatures */
  playerOnFoot(): boolean;
  rangerRoot(): THREE.Object3D;
  /** Ranger 1's flight state while it flies (Jupiter: the craft creatures grab, drag and shock) */
  craft(): Spacecraft | null;
  /** the pilot's stick and throttle are fighting off a creature: they must not abort the autopilot */
  struggle(on: boolean): void;
  /** water surface height at (x, z) (−Infinity on dry worlds) */
  waterLevel(x: number, z: number): number;
  /** Miller's tides at (x, z): seconds until the next crest arrives, seconds since the last one passed; null elsewhere */
  tide(x: number, z: number): { tta: number; since: number; dir: [number, number] } | null;
  /** Ranger 1 is flying (Jupiter: always) */
  rangerFlying(): boolean;
  /** knocked out on foot: back to Ranger 1 */
  knockout(msg: string): void;
  say(who: string, text: string): void;
  /** keep a body of radius r from passing through cave rock on its way from → to (moves `to`; true if it did) */
  caveGuard?(from: THREE.Vector3, to: THREE.Vector3, r: number): boolean;
  /** the suit lamp is on */
  lamp?(): boolean;
  /** Mars: the subsurface refuge (world/surface/marsRefuge.ts), if this site has one */
  refuge?(): import('../surface/marsRefuge').MarsRefuge | null;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _ga = new THREE.Vector3();
const _gb = new THREE.Vector3();
const _gc = new THREE.Vector3();

/** hours of Miller's own (dilated) time since the mission began */
export function localHours(earthTime: number) {
  return ((earthTime - START_EARTH_TIME) * MILLER_FACTOR) / 3600;
}

export abstract class Creature {
  abstract readonly species: string;
  readonly root = new THREE.Group();
  inst!: ModelInstance;
  rig!: Rig;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  state = 'idle';
  /** seconds in the current state */
  st = 0;
  t = Math.random() * 100;
  cooldown = 0;
  readonly home = new THREE.Vector3();
  /** set false to remove */
  alive = true;
  /** drawn within this distance of the camera (m) */
  view = 1500;
  /** posed (rig animated) within this distance */
  nearR = 260;
  /** body radius for collisions with cave rock (0: none) */
  collideR = 0;
  /** half body length (m, at size 1): the nose and the tail end are also kept out of cave rock */
  collideLen = 0;
  readonly prevQ = new THREE.Quaternion();
  /** meshes carrying the 'juvenile' shape key (blended out as the animal grows) and its own skin uniforms */
  private juvMorph: { m: THREE.Mesh; i: number }[] = [];
  private youthU: { skYouth: { value: number } }[] = [];
  /**
   * a young animal growing on its world's own clock: size = base × min(max, 1 + rate × age h); born in local hours
   * (Miller: 1 h of its time ≈ 7 years on Earth, so a long stay there or the years waiting in orbit show)
   */
  growth: { base: number; born: number; rate: number; max: number } | null = null;
  readonly prevPos = new THREE.Vector3();
  /** glow materials cloned per creature (pulsing light organs) */
  protected glow: THREE.MeshStandardMaterial[] = [];
  /** distance levels of detail baked in Blender (<mesh>_lod1, _lod2, skinned to the same bones) */
  private lods: THREE.Object3D[][] = [[], [], []];
  private lod = -1;
  /** the model's bounding radius at size 1 (m), for the LOD distances */
  bodyR = 1;

  constructor(readonly f: FaunaManager) {}

  get game() {
    return this.f.game;
  }

  async load(model: string, glowMats: string[] = []) {
    this.inst = await this.game.assets.instance(model);
    this.root.add(this.inst.root);
    this.rig = new Rig(this.inst);
    const young = this.growth !== null;
    this.inst.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const lv = /_lod(\d)/.exec(m.name) ?? /_lod(\d)/.exec(m.parent?.name ?? '');
      this.lods[lv ? Math.min(2, Number(lv[1])) : 0].push(m);
      m.castShadow = true;
      m.receiveShadow = true;
      const ji = m.morphTargetDictionary?.juvenile;
      if (young && ji !== undefined) this.juvMorph.push({ m, i: ji });
      const swap = (mat: THREE.Material) => {
        const isGlow = glowMats.some((g) => mat.name.startsWith(g));
        // a growing animal gets its own copies of its skin (its youth tint is its own)
        if (!isGlow && !(young && mat.userData.skin)) return mat;
        const c = cloneSkinned(mat as THREE.MeshStandardMaterial, this.game.materials?.textureQuality ?? 2);
        if (isGlow) this.glow.push(c as THREE.MeshStandardMaterial);
        if (young && c.userData.skinUniforms) this.youthU.push(c.userData.skinUniforms);
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
    this.f.root.add(this.root);
    const bs = new THREE.Box3().setFromObject(this.inst.root).getBoundingSphere(new THREE.Sphere());
    this.bodyR = Math.max(0.05, bs.radius);
    this.setLod(0);
    return this;
  }

  /** show one level of detail (0 full … 2 far); levels a model lacks fall back to the nearest finer one */
  setLod(level: number) {
    let l = level;
    while (l > 0 && !this.lods[l].length) l--;
    if (l === this.lod) return;
    this.lod = l;
    this.lods.forEach((ms, i) => ms.forEach((m) => (m.visible = i === l)));
  }

  get lodLevel() {
    return this.lod;
  }

  /** 1 newborn … 0 adult: the juvenile shape key and the paler young colouring */
  setYouth(k: number) {
    for (const j of this.juvMorph) if (j.m.morphTargetInfluences) j.m.morphTargetInfluences[j.i] = k;
    for (const u of this.youthU) u.skYouth.value = k;
  }

  setState(s: string) {
    this.state = s;
    this.st = 0;
  }

  /** forward (model −Z) in world for the current yaw */
  fwd(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** turn toward a point at up to `rate` rad/s; returns the remaining angle */
  turnTo(p: THREE.Vector3, rate: number, dt: number) {
    const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    return d;
  }

  distXZ(p: THREE.Vector3) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  playerDist() {
    return this.pos.distanceTo(this.game.player.pos);
  }

  setGlow(k: number) {
    for (const m of this.glow) m.emissiveIntensity = k;
  }

  abstract update(dt: number, near: boolean): void;

  /** after update: write the transform */
  place(pitch = 0, roll = 0) {
    this.root.position.copy(this.pos);
    this.root.rotation.set(pitch, this.yaw, roll, 'YXZ');
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.glow) m.dispose();
  }
}

// ----------------------------------------------------------------------------------------------- effects
/** Short-lived dust / spore puffs: one Points cloud reused. */
export class Puffs {
  readonly points: THREE.Points;
  private n = 0;
  private readonly N = 600;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private max: Float32Array;

  constructor(parent: THREE.Object3D) {
    const N = this.N;
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 4);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.max = new Float32Array(N);
    this.size = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `attribute float size; attribute vec4 pcol; varying vec4 vC;
        void main(){ vC = pcol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 900.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      // unlit and not tone mapped: colours are kept dark so they read as dust under the scene's exposure
      fragmentShader: /* glsl */ `varying vec4 vC; uniform float uLight; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard; gl_FragColor = vec4(vC.rgb * uLight, vC.a * (1.0 - d) * (1.0 - d)); }`,
      uniforms: { uLight: { value: 0.3 } },
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    parent.add(this.points);
  }

  burst(at: THREE.Vector3, count: number, color: THREE.Color, opts: { speed?: number; up?: number; size?: number; life?: number; alpha?: number; spread?: number } = {}) {
    for (let i = 0; i < count; i++) {
      const k = this.n++ % this.N;
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 3) * (0.3 + Math.random() * 0.7);
      const s = opts.spread ?? 0.4;
      this.pos.set([at.x + (Math.random() - 0.5) * s, at.y + Math.random() * s * 0.5, at.z + (Math.random() - 0.5) * s], k * 3);
      this.vel.set([Math.cos(a) * sp, (opts.up ?? 1.5) * (0.4 + Math.random()), Math.sin(a) * sp], k * 3);
      this.max[k] = this.life[k] = (opts.life ?? 1.6) * (0.6 + Math.random() * 0.6);
      this.size[k] = (opts.size ?? 0.6) * (0.6 + Math.random() * 0.8);
      this.col.set([color.r, color.g, color.b, opts.alpha ?? 0.55], k * 4);
    }
  }

  /** scene brightness for the unlit puffs (the zone's exposure makes 0.3 read as a sunlit dust colour) */
  set light(v: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uLight.value = v;
  }

  update(dt: number) {
    for (let k = 0; k < this.N; k++) {
      if (this.life[k] <= 0) {
        this.col[k * 4 + 3] = 0;
        continue;
      }
      this.life[k] -= dt;
      const f = this.life[k] / this.max[k];
      for (let j = 0; j < 3; j++) this.pos[k * 3 + j] += this.vel[k * 3 + j] * dt;
      this.vel[k * 3] *= 1 - dt * 1.5;
      this.vel[k * 3 + 1] = this.vel[k * 3 + 1] * (1 - dt * 1.2) - 0.6 * dt;
      this.vel[k * 3 + 2] *= 1 - dt * 1.5;
      this.size[k] += dt * 0.9;
      this.col[k * 4 + 3] = Math.min(this.col[k * 4 + 3], 0.6 * f);
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.pcol as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
  }
}

/** Expanding translucent rings (the strider's sonic blast; static arcs' shock on Jupiter). */
export class ShockRings {
  private rings: { m: THREE.Mesh; t: number; dur: number; grow: number }[] = [];
  private geo = new THREE.TorusGeometry(1, 0.06, 6, 40);
  constructor(private parent: THREE.Object3D) {}

  emit(at: THREE.Vector3, dir: THREE.Vector3, color = 0xbfe6ff, dur = 0.7, grow = 18) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.copy(at);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    m.scale.setScalar(0.3);
    m.userData.dir = dir.clone().normalize();
    this.parent.add(m);
    this.rings.push({ m, t: 0, dur, grow });
  }

  update(dt: number) {
    for (const r of this.rings) {
      r.t += dt;
      const k = r.t / r.dur;
      r.m.scale.setScalar(0.3 + k * r.grow * 0.12);
      r.m.position.addScaledVector(r.m.userData.dir as THREE.Vector3, dt * r.grow);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    }
    for (const r of this.rings.filter((x) => x.t >= x.dur)) {
      r.m.removeFromParent();
      (r.m.material as THREE.Material).dispose();
    }
    this.rings = this.rings.filter((x) => x.t < x.dur);
  }

  dispose() {
    for (const r of this.rings) r.m.removeFromParent();
    this.geo.dispose();
  }
}

// ----------------------------------------------------------------------------------------------- manager
export type Populate = (f: FaunaManager) => Promise<void>;

export class FaunaManager {
  readonly root = new THREE.Group();
  creatures: Creature[] = [];
  readonly voice: CreatureVoice;
  readonly puffs: Puffs;
  readonly rings: ShockRings;
  /** player held by a creature (stalker pin, kite lift): the player can't move; mash Interact to break free */
  hold: { by: Creature; kind: 'pin' | 'lift' | 'grip'; at: THREE.Vector3; got: number; need: number; t: number; look: () => THREE.Vector3; onFree: (broke: boolean) => void } | null = null;
  /** knock-back velocity applied to the player on foot */
  readonly shove = new THREE.Vector3();
  /** seconds of slowed walking (stunned by a shriek) */
  slow = 0;
  private hurtT = 0;
  private crack = 0;
  private populated = false;
  private populating = false;
  private vitalsEl: HTMLElement | null = null;
  private lastHealthCall = 1;
  /** some creature is hunting / displaying at the player (shows the suit meter) */
  alarm = 0;
  /** Ranger 1's canopy fractures (0..1), shown while the camera is in the cockpit (cabinView) */
  cabinCrack = 0;
  cabinView = false;
  /** Ranger 1 thrust factor (spore-choked intakes, electrical surge) */
  thrustK = 1;
  /** Jupiter: the air the cloud-layer animals fly in (world/fauna/jupiterAir.ts), shared with the research tools */
  air: JupiterAir | null = null;

  constructor(readonly host: FaunaHost, private populate: Populate) {
    this.voice = new CreatureVoice(host.game.audio);
    host.scene.add(this.root);
    this.puffs = new Puffs(this.root);
    this.rings = new ShockRings(this.root);
  }

  get game() {
    return this.host.game;
  }

  get settings() {
    return this.game.settings.life;
  }

  /** alien life switched on for this world */
  active() {
    const s = this.settings;
    const b = this.host.body;
    return s.enabled && (b === 'mars' ? s.mars : b === 'jupiter' ? s.jupiter : b === 'miller' ? s.miller : false);
  }

  /** 0 passive, 1 normal, 2 fierce */
  get hostility() {
    const h = this.settings.hostility;
    return h === 'passive' ? 0 : h === 'fierce' ? 2 : 1;
  }

  /** how many of a kind to keep (density setting) */
  count(base: number) {
    return Math.max(1, Math.round(base * this.settings.density));
  }

  /** local night 0..1 */
  night() {
    return THREE.MathUtils.clamp(1 - (this.host.sunHeight() + 0.05) * 4, 0, 1);
  }

  async add<T extends Creature>(c: T, model: string, glow: string[] = []) {
    await c.load(model, glow);
    this.creatures.push(c);
    return c;
  }

  update(dt: number) {
    const on = this.active();
    this.root.visible = on;
    if (!on) {
      if (this.hold) this.release(false);
      this.setVitals(false);
      this.game.player.speedScale = 1;
      return;
    }
    if (!this.populated && !this.populating) {
      this.populating = true;
      void this.populate(this).then(() => {
        this.populated = true;
        this.populating = false;
      });
    }
    const cam = this.game.camera.getWorldPosition(_w);
    this.alarm = Math.max(0, this.alarm - dt);
    const hours = localHours(this.game.state.clock.earthTime);
    for (const c of this.creatures) {
      const g = c.growth;
      if (!g) continue;
      const f = Math.min(g.max, 1 + g.rate * Math.max(0, hours - g.born));
      (c as unknown as { size: number }).size = g.base * f;
      // the build changes with the size: the young proportions blend out continuously to the adult's
      c.setYouth(g.max > 1 ? 1 - (f - 1) / (g.max - 1) : 0);
    }
    for (const c of this.creatures) {
      const d = c.pos.distanceTo(cam);
      // far ones tick slowly (still move); the rig is only posed when it can be seen in any detail
      const near = d < c.nearR;
      c.t += dt;
      c.st += dt;
      c.cooldown = Math.max(0, c.cooldown - dt);
      const guard = c.collideR > 0 && this.host.caveGuard;
      if (guard) {
        c.prevPos.copy(c.pos);
        c.prevQ.copy(c.root.quaternion);
      }
      c.update(dt, near);
      if (guard) {
        const sz = (c as unknown as { size?: number }).size ?? 1;
        let moved = this.host.caveGuard!(c.prevPos, c.pos, c.collideR * sz);
        // the nose and the tail end too: a long body or a trailing tail must not dip into the rock
        if (c.collideLen > 0) {
          for (const sgn of [-1, 1]) {
            _ga.set(0, 0, sgn * c.collideLen * sz).applyQuaternion(c.prevQ).add(c.prevPos);
            _gb.set(0, 0, sgn * c.collideLen * sz).applyQuaternion(c.root.quaternion).add(c.pos);
            _gc.copy(_gb);
            if (this.host.caveGuard!(_ga, _gb, c.collideR * sz * 0.5)) {
              c.pos.add(_gb.sub(_gc));
              moved = true;
            }
          }
        }
        if (moved) c.root.position.copy(c.pos);
      }
      c.root.visible = d < c.view;
      // levels of detail by distance in body radii (the rig keeps posing every level: they share the bones)
      const rr = c.bodyR * ((c as unknown as { size?: number }).size ?? 1);
      c.setLod(d < rr * 28 ? 0 : d < rr * 80 ? 1 : 2);
    }
    this.creatures = this.creatures.filter((c) => {
      if (!c.alive) c.dispose();
      return c.alive;
    });
    this.puffs.light = 0.32 * (1 - 0.85 * this.night());
    this.puffs.update(dt);
    this.rings.update(dt);
    this.updatePlayer(dt);
  }

  // --------------------------------------------------------------------------------------- the player
  private updatePlayer(dt: number) {
    const g = this.game;
    const pl = g.player;
    const fx = g.renderer.fx;
    this.slow = Math.max(0, this.slow - dt);
    pl.speedScale = this.slow > 0 ? 0.45 : 1;
    this.hurtT = Math.max(0, this.hurtT - dt * 1.6);
    fx.hurt = Math.max(fx.hurt * 0, this.hurtT * 0.9);
    // visor cracks follow suit integrity (a cracked visor stays cracked until the suit is serviced)
    const hp = g.state.player.health ?? 1;
    this.crack = Math.max(this.crack - dt * 0.002, hp < 0.85 ? (0.85 - hp) * 1.3 : 0);
    fx.cracks = this.host.playerOnFoot() ? Math.min(1, this.crack) : this.cabinView ? Math.min(1, this.cabinCrack) : 0;
    if (this.shove.lengthSq() > 1e-4 && this.host.playerOnFoot() && !this.hold) {
      pl.pos.addScaledVector(this.shove, dt);
      const ty = this.host.terrainY(pl.pos.x, pl.pos.z);
      if (pl.pos.y < ty) pl.pos.y = ty;
      this.shove.multiplyScalar(Math.max(0, 1 - dt * 5));
    }
    if (this.hold) this.holdStep(dt);
    const show = this.host.playerOnFoot() && (hp < 0.999 || this.alarm > 0);
    this.setVitals(show, hp);
  }

  private holdStep(dt: number) {
    const hd = this.hold!;
    const g = this.game;
    const pl = g.player;
    hd.t += dt;
    if (!this.host.playerOnFoot() || !hd.by.alive) {
      this.release(false);
      return;
    }
    pl.pos.copy(hd.at);
    pl.vel.set(0, 0, 0);
    if (g.input.pressed('interact') || g.input.pressed('jump')) {
      hd.got++;
      g.renderer.fx.shake = Math.max(g.renderer.fx.shake, 0.5);
      g.audio.thud(undefined, 0.25, 90);
    }
    // the camera is held on what holds you: pinned, you are on your back looking up at it (a grip on a leg leaves
    // the head free to look)
    const cam = g.camera;
    if (hd.kind !== 'grip') {
      const look = hd.look();
      if (hd.kind === 'pin') cam.position.copy(hd.at).add(_v.set(0, 0.42, 0));
      cam.lookAt(look);
    }
    g.ui.countdown(`${hd.kind === 'pin' ? 'PINNED' : hd.kind === 'grip' ? 'CAUGHT' : 'SNAGGED'} — BREAK FREE  [E]  ${'▮'.repeat(hd.got)}${'▯'.repeat(Math.max(0, hd.need - hd.got))}`);
    if (hd.got >= hd.need) this.release(true);
  }

  grab(by: Creature, kind: 'pin' | 'lift' | 'grip', need: number, look: () => THREE.Vector3, onFree: (broke: boolean) => void) {
    if (this.hold) return false;
    const at = this.game.player.pos.clone();
    this.hold = { by, kind, at, got: 0, need, t: 0, look, onFree };
    return true;
  }

  release(broke: boolean) {
    const hd = this.hold;
    if (!hd) return;
    this.hold = null;
    this.game.ui.countdown(null);
    hd.onFree(broke);
  }

  /**
   * Damage the player's suit. amount 0..1 of integrity; crack: where on the visor it struck (screen uv) or null;
   * knock: horizontal knock-back velocity (m/s). Creative hazard protection takes most of it; at zero the player
   * blacks out and the suit's tether winches them back to Ranger 1.
   */
  hurtPlayer(amount: number, opts: { cause: string; crack?: [number, number] | null; knock?: THREE.Vector3; shake?: number } = { cause: '' }) {
    const g = this.game;
    if (!this.host.playerOnFoot()) return;
    const ps = g.state.player;
    const prot = g.state.creative.hazardProtection;
    const k = (prot ? 0.3 : 1) * (this.hostility === 2 ? 1.35 : 1);
    ps.health = Math.max(0, (ps.health ?? 1) - amount * k);
    this.hurtT = Math.min(1, this.hurtT + 0.5 + amount * 2);
    g.renderer.fx.shake = Math.max(g.renderer.fx.shake, opts.shake ?? 0.8);
    if (opts.crack !== null && amount > 0.06) {
      g.renderer.fx.crackP.set(...(opts.crack ?? [0.35 + Math.random() * 0.3, 0.4 + Math.random() * 0.3]));
      this.crack = Math.min(1, this.crack + amount * 1.6);
      this.voice.crack();
    }
    if (opts.knock) this.shove.add(opts.knock);
    g.audio.thud(undefined, 0.5, 60);
    if (ps.health < 0.3 && this.lastHealthCall >= 0.3) {
      g.audio.ui('alert');
      g.notify(`Suit integrity ${Math.round(ps.health * 100)} % — get back to the Ranger.`, 'alert', 5);
    }
    this.lastHealthCall = ps.health;
    if (ps.health <= 0) {
      ps.health = 0.35;
      this.crack = 0.3;
      if (this.hold) this.release(false);
      this.shove.set(0, 0, 0);
      this.host.knockout(`You blacked out (${opts.cause}). The suit's emergency tether winched you back to Ranger 1 — suit integrity 35 %.`);
    }
  }

  /** red edge pulse (0..1) */
  flash(k: number) {
    this.hurtT = Math.min(1, this.hurtT + k);
  }

  /** Ranger 1 damage (Jupiter's creatures). Normal hostility leaves a wreck that still flies; fierce can destroy it. */
  hurtRanger(amount: number, sys: 'hull' | 'engines' | 'avionics' = 'hull') {
    const g = this.game;
    const d = g.state.vehicles.ranger1.damage;
    const prot = g.state.creative.damageProtection;
    const k = (prot ? 0.35 : 1) * (this.hostility === 2 ? 1.35 : 1);
    d[sys] = Math.max(prot ? 0.2 : this.hostility === 2 ? 0 : 0.05, (d[sys] ?? 1) - amount * k);
    return d[sys];
  }

  private setVitals(show: boolean, hp = 1) {
    const ui = this.game.ui;
    if (!show) {
      if (this.vitalsEl) {
        this.vitalsEl.remove();
        this.vitalsEl = null;
      }
      return;
    }
    if (!this.vitalsEl) {
      this.vitalsEl = h('div', { class: 'v' });
      ui.vitals.append(this.vitalsEl);
    }
    this.vitalsEl.replaceChildren(h('span', {}, `SUIT INTEGRITY ${Math.round(hp * 100)} %`), ui.meter(hp, 0.5));
  }

  dispose() {
    if (this.hold) this.release(false);
    for (const c of this.creatures) c.dispose();
    this.creatures = [];
    this.puffs.dispose();
    this.rings.dispose();
    this.root.removeFromParent();
    this.setVitals(false);
    const fx = this.game.renderer.fx;
    fx.hurt = 0;
    fx.cracks = 0;
    this.thrustK = 1;
    this.game.player.speedScale = 1;
    this.game.ui.countdown(null);
  }
}

/** a point `d` ahead of a creature at height y (helpers for species) */
export function ahead(c: Creature, d: number, y = 0, out = new THREE.Vector3()) {
  return out.copy(c.fwd(_v)).multiplyScalar(d).add(c.pos).setY(c.pos.y + y);
}
