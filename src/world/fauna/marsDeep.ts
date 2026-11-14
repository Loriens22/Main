import * as THREE from 'three';
import { Creature, FaunaManager } from './Fauna';
import { AX } from './Rig';
import { PreySwarm } from './prey';
import { SPECIES_EXPANSION } from '../../data/speciesExpansion';
import { REFUGE as L, type MarsRefuge } from '../surface/marsRefuge';

/**
 * The Mars refuge's nine speculative-evolution species (models: blender/assets/fauna_mars_deep.py; dossiers:
 * data/speciesExpansion.ts). Not monsters spawned round the player: a small linked food web in one cavern.
 *   sources     Crimson Icebloom (skylight light through ice) · Ferric Cathedral groves (seep chemistry, biofilm)
 *   grazers     Glass Ribbon schools — numbers follow the biofilm budget; they hide in cracks when hunters pass
 *   builders    Prism Architects tend a nest, carry shards home, warn, and strike only in the nest's defence
 *   hunters     Ghost of Valles (ribbons, mid-water), Thermal Rift Serpent (the warm channel), Basalt Mimic (cave floor
 *               ambush), Subglacial Monarch (the deep basin; inspects far more than it attacks)
 *   the surface Red Dune Hermit: a brief crossing from its fissure, then back underground
 * Every attack is telegraphed (pre-tension, display, a slow approach) and has a non-violent way out; Settings →
 * Hostility 'passive' turns attacks into displays. Evidence the player actually witnesses is logged to the codex
 * (flags bio:<id>:<key>).
 */
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const DUST = new THREE.Color(0.6, 0.38, 0.26);
const SILT = new THREE.Color(0.1, 0.1, 0.09);

function rnd(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** the refuge frame (x east, z south, y from the levelled ground) → zone frame */
function at(R: MarsRefuge, x: number, y: number, z: number, out = new THREE.Vector3()) {
  return R.world(x, y, z, out);
}

/** push a surface point out of the refuge massif's footprint (for the surface animals' homes and wanderings) */
export function outsideRefuge(R: MarsRefuge | null | undefined, p: THREE.Vector3, margin = 22) {
  if (!R) return p;
  const dx = p.x - R.c.x, dz = p.z - R.c.z;
  const d = Math.hypot(dx, dz);
  const lim = L.mound.r + margin;
  if (d < lim) {
    const k = lim / Math.max(d, 1e-3);
    p.x = R.c.x + dx * k;
    p.z = R.c.z + dz * k;
  }
  return p;
}

// ================================================================================================ ecosystem
/**
 * Shared refuge state, a model-less creature updated first: the biofilm budget (a production rate that the ribbons
 * graze down), the player's disturbance (moving fast, the lamp in an animal's face), the field log, the eyes.
 */
export class RefugeEco extends Creature {
  readonly species = 'refuge_eco';
  /** grazeable biofilm on the grove, 0..1 (regrows from seep chemistry) */
  biofilm = 0.8;
  /** ribbons alive in the lake (all schools) and the number the biofilm can carry */
  ribbons = 0;
  /** player disturbance 0..1: fast movement, thrust, the lamp at close range */
  noise = 0;
  /** hunters' positions this frame (filled as they update) and last frame's (what the ribbons react to) */
  readonly hunters: THREE.Vector3[] = [];
  readonly huntersSeen: THREE.Vector3[] = [];
  /** the ribbon schools (their live counts feed the carrying capacity) */
  schools: { live: number }[] = [];
  last = '';
  private prevPl = new THREE.Vector3();

  constructor(f: FaunaManager, readonly R: MarsRefuge) {
    super(f);
    this.view = 1e9;
    this.nearR = 1e9;
    this.prevPl.copy(f.game.player.pos);
  }

  /** ribbon carrying capacity from the biofilm (energy-limited) */
  get capacity() {
    return Math.round(18 + 40 * this.biofilm);
  }

  /** the player is under the rock and on foot (the refuge's animals only react to someone actually there) */
  playerInside() {
    return this.f.host.playerOnFoot() && this.R.inside(this.game.player.pos) > 0.5;
  }

  inWater(p: THREE.Vector3) {
    return p.y < this.R.waterLevel(p.x, p.z);
  }


  /** record evidence once (flag bio:<id>:<key>); the first sighting is announced */
  note(id: string, key: string, text?: string) {
    const g = this.game;
    const k = `bio:${id}:${key}`;
    if (g.flag(k)) return false;
    const info = SPECIES_EXPANSION[id];
    const t = text ?? info?.evidence[key] ?? key;
    g.flag(k, `${Math.round(g.state.clock.earthTime)}|${t}`);
    g.notify(key === 'sighting' ? `New life form recorded — ${info?.name ?? id}. Codex updated.` : `Codex · ${info?.name ?? id}: ${t}`, 'ok', 5);
    this.last = `${id}:${key}`;
    g.log?.('mission', 'computer', `${info?.name ?? id} — ${t}`);
    return true;
  }

  /** the player looks at p closely enough to see what happens there (murky water shortens sight) */
  watching(p: THREE.Vector3, range: number, cone = 0.4) {
    const cam = this.game.camera;
    const c = cam.getWorldPosition(_w);
    const d = c.distanceTo(p);
    const under = c.y < this.R.waterLevel(c.x, c.z);
    if (d > (under ? Math.min(range, 16) : range)) return false;
    cam.getWorldDirection(_u);
    _v.subVectors(p, c).normalize();
    return _u.dot(_v) > Math.cos(cone);
  }

  /** the suit lamp (camera-mounted) is on and pointed at p from within range */
  lit(p: THREE.Vector3, range: number) {
    return (this.f.host.lamp?.() ?? true) && this.watching(p, range, 0.32);
  }

  update(dt: number) {
    const pl = this.game.player;
    const v = pl.pos.distanceTo(this.prevPl) / Math.max(dt, 1e-3);
    this.prevPl.copy(pl.pos);
    this.noise = THREE.MathUtils.damp(this.noise, this.playerInside() ? THREE.MathUtils.clamp((v - 1.5) / 3, 0, 1) : 0, 2, dt);
    // biofilm: production at the seeps (logistic regrowth) minus grazing
    this.biofilm = THREE.MathUtils.clamp(this.biofilm + dt * (0.004 * (1 - this.biofilm) - 0.00004 * this.ribbons), 0.05, 1);
    this.huntersSeen.length = 0;
    for (const h of this.hunters) this.huntersSeen.push(h);
    this.hunters.length = 0;
    let n = 0;
    for (const sc of this.schools) n += sc.live;
    this.ribbons = n;
    this.pos.copy(pl.pos);
  }
}

/** a refuge animal: knows the ecosystem, keeps to its medium */
abstract class RefugeCreature extends Creature {
  size = 1;
  constructor(f: FaunaManager, readonly eco: RefugeEco) {
    super(f);
  }

  get R() {
    return this.eco.R;
  }

  floor(x: number, z: number) {
    return this.f.host.terrainY(x, z);
  }

  /** hostility 0 passive (displays only) */
  get hostile() {
    return this.f.hostility > 0;
  }

  /** the transform, with the body size (the young grow on Mars's own clock) */
  place(pitch = 0, roll = 0) {
    super.place(pitch, roll);
    this.root.scale.setScalar(this.size);
  }
}

/** an animal held in the lake: between the floor (+m) and the surface (−m) */
abstract class RefugeSwimmer extends RefugeCreature {
  readonly vel = new THREE.Vector3();
  pitch = 0;
  roll = 0;
  protected goal = new THREE.Vector3();

  protected swimTo(p: THREE.Vector3, speed: number, turn: number, dt: number, margin = 0.8) {
    _v.subVectors(p, this.pos);
    const d = _v.length();
    if (d > 1e-3) _v.divideScalar(d);
    const want = _u.copy(_v).multiplyScalar(speed * Math.min(1, d / 2));
    this.vel.lerp(want, 1 - Math.exp(-turn * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.keepInWater(margin);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.05) {
      let dy = Math.atan2(-this.vel.x, -this.vel.z) - this.yaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      this.yaw += THREE.MathUtils.clamp(dy, -turn * dt, turn * dt);
      this.roll = THREE.MathUtils.damp(this.roll, -THREE.MathUtils.clamp(dy, -0.6, 0.6) * 0.5, 2, dt);
    }
    this.pitch = THREE.MathUtils.damp(this.pitch, Math.atan2(this.vel.y, Math.max(hs, 0.1)) * 0.7, 3, dt);
    this.speed = this.vel.length();
  }

  protected keepInWater(margin: number) {
    const lvl = this.R.waterLevel(this.pos.x, this.pos.z);
    const fl = this.floor(this.pos.x, this.pos.z);
    if (!Number.isFinite(lvl)) return;
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, fl + margin * this.size, lvl - margin * this.size);
    // only where the floor is under water (the lake and the channel)
    if (fl > lvl - 2 * margin * this.size) {
      this.pos.addScaledVector(this.vel, -0.05);
      this.vel.multiplyScalar(-0.3);
    }
  }

  protected place3() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.root.scale.setScalar(this.size);
  }
}

// ================================================================================================ Crimson Icebloom
class Icebloom extends RefugeCreature {
  readonly species = 'icebloom';
  private open = 1;
  private dormant = 0;
  private watchT = 0;

  constructor(f: FaunaManager, eco: RefugeEco, p: THREE.Vector3, n: THREE.Vector3, size: number) {
    super(f, eco);
    this.pos.copy(p);
    this.size = size;
    this.view = 120;
    this.nearR = 0;
    this.root.quaternion.setFromUnitVectors(_v.set(0, 1, 0), n.clone().normalize());
    this.root.rotateY(Math.random() * TAU);
  }

  update(dt: number) {
    const R = this.R;
    // turgor follows light: open in the skylight's day, folded at night or once torn
    const light = R.skyK;
    this.dormant = Math.max(0, this.dormant - dt);
    const want = this.dormant > 0 ? 0.72 : light > 0.25 ? 1 : 0.86;
    const prev = this.open;
    this.open = THREE.MathUtils.damp(this.open, want, this.dormant > 0 ? 2.5 : 0.05, dt);
    this.root.position.copy(this.pos);
    this.root.scale.set(this.size * (0.92 + 0.08 * this.open), this.size * this.open, this.size * (0.92 + 0.08 * this.open));
    const pl = this.game.player.pos;
    if (pl.distanceTo(this.pos) < 0.9 * this.size + 0.4 && this.dormant <= 0 && this.eco.playerInside()) {
      this.dormant = 900;
      this.eco.note('icebloom', 'touch');
    }
    if (this.eco.watching(this.pos, 9)) {
      this.eco.note('icebloom', 'sighting');
      this.watchT += dt;
      if (this.watchT > 8 && Math.abs(this.open - prev) / Math.max(dt, 1e-3) > 0.0005) this.eco.note('icebloom', 'light');
    } else this.watchT = 0;
  }
}

// ================================================================================================ Ferric Cathedral
class Ferric extends RefugeCreature {
  readonly species = 'ferric';
  private shrink = 0;
  private watchT = 0;

  constructor(f: FaunaManager, eco: RefugeEco, p: THREE.Vector3, size: number) {
    super(f, eco);
    this.pos.copy(p);
    this.size = size;
    this.yaw = Math.random() * TAU;
    this.view = 160;
    this.nearR = 0;
  }

  update(dt: number) {
    const pl = this.game.player.pos;
    const close = pl.distanceTo(this.pos) < 3 * this.size + 1 || (this.eco.noise > 0.5 && pl.distanceTo(this.pos) < 7);
    this.shrink = THREE.MathUtils.damp(this.shrink, close ? 1 : 0, close ? 3 : 0.08, dt);
    if (close && this.shrink > 0.5) this.eco.note('ferric', 'retract');
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    const s = this.size;
    this.root.scale.set(s * (1 - 0.04 * this.shrink), s * (1 - 0.06 * this.shrink) * (1 + 0.004 * Math.sin(this.t * 0.7)), s * (1 - 0.04 * this.shrink));
    if (this.eco.watching(this.pos.clone().setY(this.pos.y + 1.5 * s), 22)) {
      this.eco.note('ferric', 'sighting');
      this.watchT += dt;
      if (this.watchT > 6) this.eco.note('ferric', 'flow');
    } else this.watchT = 0;
  }
}

// ================================================================================================ Glass Ribbons
/** a school: instanced animals that graze the grove, school round their patch and vanish into cracks from hunters */
class RibbonSchool extends RefugeCreature {
  readonly species = 'ribbon';
  readonly school: PreySwarm;
  readonly P: Float32Array;
  readonly center = new THREE.Vector3();
  private patch = new THREE.Vector3();
  private hidden = 0;
  private hideT = 0;
  private threats: THREE.Vector3[] = [];

  constructor(f: FaunaManager, eco: RefugeEco, patch: THREE.Vector3, n: number) {
    super(f, eco);
    this.patch.copy(patch);
    this.center.copy(patch);
    this.pos.copy(patch);
    this.view = 1e9;
    this.nearR = 1e9;
    this.P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.P.set([patch.x + (Math.random() - 0.5) * 6, patch.y + (Math.random() - 0.5) * 2, patch.z + (Math.random() - 0.5) * 6], i * 3);
    this.school = new PreySwarm(f, 'mars_ribbon', this.P, 1, { amp: 0.6, freq: 7, len: 0.42 });
    this.school.build().catch(() => undefined);
  }

  /** alive (not hidden in a crack) */
  get live() {
    let n = 0;
    for (let i = 1; i < this.P.length; i += 3) if (this.P[i] > -500) n++;
    return n;
  }

  /** a hunter takes the nearest ribbon within reach of p; true on a catch */
  take(p: THREE.Vector3, reach: number) {
    let best = -1, bd = reach;
    for (let i = 0; i < this.P.length; i += 3) {
      if (this.P[i + 1] < -500) continue;
      const d = Math.hypot(this.P[i] - p.x, this.P[i + 1] - p.y, this.P[i + 2] - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return false;
    this.P[best + 1] = -1000;
    return true;
  }

  update(dt: number) {
    const eco = this.eco;
    // the patch drifts along the grove; grazing keeps them low over the cathedral branches
    this.center.set(this.patch.x + Math.sin(this.t * 0.05) * 3, this.patch.y + Math.sin(this.t * 0.09) * 0.6, this.patch.z + Math.cos(this.t * 0.04) * 3);
    this.pos.copy(this.center);
    // hunters near: the whole school folds into the cracks at once and stays hidden a while
    let danger = false;
    for (const h of eco.huntersSeen) if (h.distanceTo(this.center) < 7) danger = true;
    if (danger) this.hideT = 25;
    this.hideT = Math.max(0, this.hideT - dt);
    const P = this.P;
    const n = P.length / 3;
    if (this.hideT > 0) {
      // slide into the nearest fissure (down to the floor), then out of sight
      for (let i = 0; i < n; i++) {
        if (P[i * 3 + 1] < -500) continue;
        const fl = this.floor(P[i * 3], P[i * 3 + 2]);
        P[i * 3 + 1] -= dt * 1.6;
        if (P[i * 3 + 1] < fl + 0.1) {
          P[i * 3 + 1] = -2000; // hidden (not eaten: −2000 comes back)
          this.hidden++;
        }
      }
      if (eco.watching(this.center, 25) && danger) eco.note('ribbon', 'hide');
    } else {
      // come back out of the cracks; grow back toward what the biofilm can carry
      for (let i = 0; i < n; i++) {
        const y = P[i * 3 + 1];
        if (y < -1500 && Math.random() < dt * 0.3) {
          P.set([this.center.x + (Math.random() - 0.5) * 4, this.floor(this.center.x, this.center.z) + 0.3, this.center.z + (Math.random() - 0.5) * 4], i * 3);
          this.hidden = Math.max(0, this.hidden - 1);
        } else if (y < -500 && y > -1500 && eco.ribbons < eco.capacity && Math.random() < dt * 0.004 * eco.biofilm) {
          // a juvenile from the egg capsules in the crevices
          P.set([this.center.x, this.floor(this.center.x, this.center.z) + 0.3, this.center.z], i * 3);
        }
      }
    }
    // keep every ribbon in the water
    for (let i = 0; i < n; i++) {
      if (P[i * 3 + 1] < -500) continue;
      const lvl = this.R.waterLevel(P[i * 3], P[i * 3 + 2]);
      const fl = this.floor(P[i * 3], P[i * 3 + 2]);
      P[i * 3 + 1] = THREE.MathUtils.clamp(P[i * 3 + 1], fl + 0.15, lvl - 0.3);
    }
    const pl = this.game.player.pos;
    const seen = this.center.distanceTo(pl) < 45 && eco.playerInside();
    if (seen) {
      this.threats.length = 0;
      for (const h of eco.huntersSeen) this.threats.push(h);
      if (eco.inWater(pl)) this.threats.push(pl);
      if (this.hideT <= 0) this.school.flock(dt, this.center, 3.2, this.threats, 3.5, 1.1);
      if (eco.watching(this.center, 16)) {
        eco.note('ribbon', 'sighting');
        if (this.center.distanceTo(this.patch) < 6 && this.t > 20) eco.note('ribbon', 'graze');
      }
    }
    this.school.update(dt, seen);
  }

  dispose() {
    super.dispose();
    this.school.dispose();
  }
}

// ================================================================================================ Prism Architect
const SHARD_GEO = new THREE.BoxGeometry(0.16, 0.012, 0.09);

class PrismArchitect extends RefugeCreature {
  readonly species = 'prism';
  phase = 0;
  private goal = new THREE.Vector3();
  private carry: THREE.Mesh | null = null;
  private habit = 0;
  private quietT = 0;
  private clickT = 0;
  private struck = 0;
  private raise = 0;

  constructor(f: FaunaManager, eco: RefugeEco, readonly nest: THREE.Vector3, readonly shards: THREE.Mesh[], readonly juvenile: boolean) {
    super(f, eco);
    this.view = 150;
    this.nearR = 60;
    this.collideR = 0.7;
    this.collideLen = 0.5;
    this.setState('forage');
  }

  private walk(p: THREE.Vector3, v: number, dt: number) {
    const d = this.turnTo(p, 1.6, dt);
    this.speed = THREE.MathUtils.damp(this.speed, Math.abs(d) > 1 ? v * 0.3 : v, 3, dt);
    this.pos.addScaledVector(this.fwd(_v), this.speed * dt);
    this.pos.y = this.floor(this.pos.x, this.pos.z);
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player.pos;
    const inside = eco.playerInside();
    const dPl = this.pos.distanceTo(pl);
    const dNest = pl.distanceTo(this.nest);
    // habituation: a calm observer who keeps their distance becomes part of the cave (bounded: never inside 3 m)
    if (inside && dNest > 6 && dNest < 16 && eco.noise < 0.2) {
      this.quietT += dt;
      if (this.quietT > 60 && this.habit < 1) {
        this.habit = Math.min(1, this.habit + dt / 120);
        if (this.habit > 0.6 && eco.watching(this.pos, 20)) eco.note('prism', 'habituate');
      }
    } else if (dNest < 6) this.quietT = 0;
    const warnR = THREE.MathUtils.lerp(8, 4.5, this.habit) + 3 * eco.noise;
    const threat = inside && !this.juvenile && (dNest < warnR || dPl < warnR * 0.6);
    if (threat && this.state !== 'warn' && this.state !== 'strike' && this.state !== 'recover') {
      this.dropShard();
      this.setState('warn');
    }
    this.raise = THREE.MathUtils.damp(this.raise, this.state === 'warn' || this.state === 'strike' ? 1 : 0, 4, dt);
    switch (this.state) {
      case 'forage': {
        // scrape the floor round the nest; now and then go for a shard
        if (this.goal.lengthSq() === 0 || this.distXZ(this.goal) < 0.6) {
          const a = Math.random() * TAU, d = 2 + Math.random() * 8;
          this.goal.set(this.nest.x + Math.cos(a) * d, 0, this.nest.z + Math.sin(a) * d);
        }
        this.walk(this.goal, 0.45, dt);
        if (!this.juvenile && this.st > 20 && Math.random() < dt * 0.05 && this.shards.some((s) => s.visible && !s.userData.held)) this.setState('fetch');
        break;
      }
      case 'fetch': {
        const s = this.shards.filter((q) => q.visible && !q.userData.held).sort((a, b) => a.position.distanceTo(this.pos) - b.position.distanceTo(this.pos))[0];
        if (!s) {
          this.setState('forage');
          break;
        }
        this.walk(s.position, 0.6, dt);
        if (this.distXZ(s.position) < 0.9) {
          s.userData.held = true;
          this.carry = s;
          this.setState('carry');
        }
        break;
      }
      case 'carry': {
        this.walk(this.nest, 0.5, dt);
        if (this.carry) {
          ahead(this, 0.7, 0.35, this.carry.position);
          this.carry.rotation.set(0.3, this.yaw, 0);
        }
        if (this.distXZ(this.nest) < 1.3) {
          // set into the nest roof: the shard joins the build (it returns to the floor later — erosion, other builders)
          if (this.carry) {
            this.carry.visible = false;
            this.carry.userData.held = false;
            this.carry.userData.back = 400 + Math.random() * 400;
            if (eco.watching(this.nest, 26)) eco.note('prism', 'build');
          }
          this.carry = null;
          this.setState('forage');
        }
        break;
      }
      case 'warn': {
        // freeze, face the intruder, spread the plates and lift the manipulators; dry clicks
        this.speed = THREE.MathUtils.damp(this.speed, 0, 6, dt);
        this.turnTo(pl, 1.4, dt);
        this.clickT -= dt;
        if (this.clickT < 0) {
          this.clickT = 0.6 + Math.random() * 0.5;
          if (inside) this.f.voice.clicks(this.pos, 5, 0.3);
        }
        if (eco.watching(this.pos, 18)) eco.note('prism', 'warn');
        this.f.alarm = Math.max(this.f.alarm, 1);
        // at the eggs and still coming: a short grappling strike (never in passive mode)
        if (this.hostile && dNest < 2.6 && dPl < 2.2 && this.cooldown <= 0 && this.st > 1.5) this.setState('strike');
        if (!threat && this.st > 3) this.setState('forage');
        break;
      }
      case 'strike': {
        this.turnTo(pl, 3, dt);
        const lunge = this.st < 0.35;
        this.speed = lunge ? 2.6 : 0;
        if (lunge) this.pos.addScaledVector(this.fwd(_v), this.speed * dt);
        this.pos.y = this.floor(this.pos.x, this.pos.z);
        if (this.st > 0.3 && this.struck === 0 && dPl < 1.7) {
          this.struck = 1;
          const k = _u.subVectors(pl, this.pos).setY(0).normalize().multiplyScalar(3.5);
          this.f.hurtPlayer(0.07, { cause: 'a Prism Architect defending its nest', knock: k, crack: null, shake: 0.6 });
        }
        if (this.st > 0.9) {
          this.struck = 0;
          this.cooldown = 8;
          this.setState('recover');
        }
        break;
      }
      case 'recover': {
        // back off toward the nest, still facing out
        this.goal.copy(this.nest);
        this.walk(this.goal, 0.4, dt);
        if (this.st > 4) this.setState(threat ? 'warn' : 'forage');
        break;
      }
    }
    // shards that were built in come back to the floor after a while (other builders, erosion: the nest keeps changing)
    for (const s of this.shards) {
      if (!s.visible && s.userData.back !== undefined) {
        s.userData.back -= dt;
        if (s.userData.back < 0) {
          s.visible = true;
          delete s.userData.back;
        }
      }
    }
    if (inside && eco.watching(this.pos, 22)) eco.note('prism', 'sighting');
    this.place();
    if (near) this.pose(dt);
  }

  private dropShard() {
    if (!this.carry) return;
    this.carry.position.y = this.floor(this.carry.position.x, this.carry.position.z) + 0.01;
    this.carry.userData.held = false;
    this.carry = null;
  }

  private pose(dt: number) {
    const r = this.rig;
    r.reset();
    this.phase += dt * (1.5 + this.speed * 6);
    const sw = Math.min(1, this.speed / 0.3);
    for (const [side, sx] of [['L', -1], ['R', 1]] as const) {
      for (let k = 0; k < 3; k++) {
        const g = (k + (side === 'L' ? 0 : 1)) % 2;
        const p = this.phase + g * Math.PI;
        r.rot(`leg${side}${k}1`, AX.y, 0.32 * sw * Math.sin(p));
        r.rot(`leg${side}${k}1`, AX.fwd, -sx * 0.22 * sw * Math.max(0, Math.cos(p)) - sx * 0.12 * this.raise);
      }
      // manipulators: scraping the floor while foraging, raised high in a display
      const scrape = this.state === 'forage' ? 0.25 * Math.sin(this.t * 3 + sx) : 0;
      r.rot(`man${side}1`, AX.x, -0.9 * this.raise + scrape);
      r.rot(`man${side}2`, AX.x, -0.6 * this.raise);
    }
    r.rot('head', AX.x, -0.25 * this.raise + 0.05 * Math.sin(this.t * 1.3));
    r.rot('body', AX.x, -0.08 * this.raise);
  }
}

function ahead(c: Creature, d: number, y: number, out: THREE.Vector3) {
  return out.copy(c.fwd(_w)).multiplyScalar(d).add(c.pos).setY(c.pos.y + y);
}

// ================================================================================================ Ghost of Valles
class Ghost extends RefugeSwimmer {
  readonly species = 'ghost';
  private hunger = Math.random() * 0.5;
  private ang = Math.random() * TAU;
  private lungeAt = new THREE.Vector3();
  private closeT = 0;

  constructor(f: FaunaManager, eco: RefugeEco, readonly grove: THREE.Vector3, readonly schools: RibbonSchool[], readonly deep: THREE.Vector3) {
    super(f, eco);
    this.view = 90;
    this.nearR = 50;
    this.collideR = 0.7;
    this.collideLen = 0.6;
    this.setState('patrol');
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player.pos;
    this.hunger = Math.min(1, this.hunger + dt / 400);
    const lvl = this.R.waterLevel(this.pos.x, this.pos.z);
    const target = this.schools.filter((s) => s.live > 0).sort((a, b) => a.center.distanceTo(this.pos) - b.center.distanceTo(this.pos))[0];
    // the lamp beam in its eyes: it turns away into the dark (unless it is mid-lunge)
    if (eco.playerInside() && eco.lit(this.pos, 12) && this.state !== 'lunge' && this.state !== 'shy') {
      this.setState('shy');
      eco.note('ghost', 'shy');
    }
    let fold = 0;
    switch (this.state) {
      case 'patrol': {
        this.ang += dt * 0.05;
        this.goal.set(this.grove.x + Math.cos(this.ang) * 11, lvl - 4.5 + Math.sin(this.t * 0.2), this.grove.z + Math.sin(this.ang) * 9);
        this.swimTo(this.goal, 0.9, 0.8, dt, 1.2);
        if (this.hunger > 0.55 && target && this.cooldown <= 0) this.setState('stalk');
        break;
      }
      case 'stalk': {
        if (!target) {
          this.setState('patrol');
          break;
        }
        // above and behind the school, then a pause with the membranes drawn in
        this.goal.copy(target.center).add(_v.set(0, 1.8, 0));
        this.swimTo(this.goal, 0.6, 1.0, dt, 1);
        eco.hunters.push(this.pos);
        if (this.pos.distanceTo(this.goal) < 2.5) {
          fold = Math.min(1, this.st / 3);
          if (this.st > 4) {
            this.lungeAt.copy(target.center);
            this.setState('lunge');
          }
        }
        break;
      }
      case 'lunge': {
        fold = 0.6;
        this.swimTo(this.lungeAt, 5.5, 4, dt, 0.6);
        if (this.st > 0.9) {
          const got = target ? target.take(this.pos, 2.2) && Math.random() < 0.45 : false;
          if (got) this.hunger = 0;
          if (eco.watching(this.pos, 16)) eco.note('ghost', 'hunt');
          this.cooldown = got ? 120 : 45;
          this.setState('recover');
        }
        break;
      }
      case 'recover': {
        // a miss costs: a slow glide back up
        this.goal.copy(this.pos).add(_v.set(Math.sin(this.ang) * 3, 1.5, Math.cos(this.ang) * 3));
        this.swimTo(this.goal, 0.4, 0.5, dt, 1.2);
        if (this.st > 12) this.setState('patrol');
        break;
      }
      case 'shy': {
        this.goal.copy(this.deep);
        this.swimTo(this.goal, 1.6, 1.2, dt, 1.2);
        if (this.st > 15) this.setState('patrol');
        break;
      }
    }
    // crowded close for long: a nip at the suit (rare, small; never in passive mode)
    if (eco.inWater(pl) && pl.distanceTo(this.pos) < 2.2) this.closeT += dt;
    else this.closeT = Math.max(0, this.closeT - dt);
    if (this.hostile && this.closeT > 4 && this.cooldown <= 0) {
      this.f.hurtPlayer(0.04, { cause: 'a Ghost of Valles', crack: null, shake: 0.3 });
      this.cooldown = 40;
      this.closeT = 0;
      this.setState('shy');
    }
    if (eco.watching(this.pos, 22)) eco.note('ghost', 'sighting');
    this.place3();
    if (near) {
      const r = this.rig;
      r.reset();
      const flap = Math.sin(this.t * (this.state === 'lunge' ? 4 : 1.4));
      for (const [s, sx] of [['L', -1], ['R', 1]] as const) {
        r.rot(`wing${s}1`, AX.fwd, sx * (0.22 * flap - 0.25 * fold));
        r.rot(`wing${s}2`, AX.fwd, sx * (0.3 * Math.sin(this.t * 1.4 - 0.9) - 0.35 * fold));
      }
      for (let i = 1; i <= 4; i++) r.rot(`tail${i}`, AX.y, 0.18 * Math.sin(this.t * 1.1 - i * 0.7));
      r.rot('jaw', AX.x, this.state === 'lunge' ? 0.5 : 0.05);
    }
  }
}

// ================================================================================================ Basalt Mimic
class BasaltMimic extends RefugeCreature {
  readonly species = 'bmimic';
  private covers: THREE.Vector3[];
  private cover = 0;
  private lightMem = 0;
  private tense = 0;
  private leapFrom = new THREE.Vector3();
  private leapTo = new THREE.Vector3();
  private hit = false;
  phase = 0;

  constructor(f: FaunaManager, eco: RefugeEco, covers: THREE.Vector3[], readonly young: PrismArchitect | null) {
    super(f, eco);
    this.covers = covers;
    this.pos.copy(covers[0]);
    this.view = 120;
    this.nearR = 50;
    this.collideR = 0.9;
    this.collideLen = 0.9;
    this.setState('anchor');
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player.pos;
    const inside = eco.playerInside();
    const d = this.pos.distanceTo(pl);
    this.lightMem = Math.max(0, this.lightMem - dt);
    // exposed by the lamp at range: it loses its cover and crawls off (and remembers the light a while)
    if (inside && eco.lit(this.pos, 10) && d > 3 && this.state !== 'leap' && this.state !== 'move') {
      this.lightMem = 90;
      eco.note('bmimic', 'sighting');
      eco.note('bmimic', 'exposed');
      this.cover = (this.cover + 1 + Math.floor(Math.random() * (this.covers.length - 1))) % this.covers.length;
      this.setState('move');
    }
    switch (this.state) {
      case 'anchor': {
        this.speed = 0;
        this.tense = THREE.MathUtils.damp(this.tense, 0, 2, dt);
        this.pos.y = this.floor(this.pos.x, this.pos.z);
        // a person stepping close, unaware: pre-tension first (never a one-frame jump scare)
        if (inside && d < 7 && this.lightMem <= 0 && this.cooldown <= 0) this.setState('tense');
        // a young Prism Architect wandering by: an ambush the size it prefers (and usually misses)
        else if (this.young && this.young.pos.distanceTo(this.pos) < 5 && this.cooldown <= 0) {
          this.leapTo.copy(this.young.pos);
          this.startLeap();
        }
        break;
      }
      case 'tense': {
        // body lowers, toes reposition, breathing quickens: the legible warning
        this.tense = THREE.MathUtils.damp(this.tense, 1, 2.5, dt);
        this.turnTo(pl, 0.8, dt);
        if (this.st > 0.6 && this.st - dt <= 0.6) this.f.voice.growl(this.pos, 0.8, 0.25);
        if (eco.watching(this.pos, 12)) {
          eco.note('bmimic', 'sighting');
          eco.note('bmimic', 'tension');
        }
        this.f.alarm = Math.max(this.f.alarm, 1);
        if (d > 9 || this.lightMem > 0) this.setState('anchor');
        else if (this.st > 2.2 && d < 4 && this.hostile) {
          this.leapTo.copy(pl);
          this.startLeap();
        } else if (this.st > 8) {
          this.cooldown = 20;
          this.setState('anchor');
        }
        break;
      }
      case 'leap': {
        const k = Math.min(1, this.st / 0.5);
        this.pos.lerpVectors(this.leapFrom, this.leapTo, k);
        this.pos.y = this.floor(this.pos.x, this.pos.z) + Math.sin(Math.PI * k) * 0.7;
        if (!this.hit && k > 0.7 && this.pos.distanceTo(pl) < 1.7 && inside) {
          this.hit = true;
          const kn = _u.subVectors(pl, this.pos).setY(0).normalize().multiplyScalar(4);
          this.f.hurtPlayer(0.12, { cause: 'a Basalt Mimic ambush', knock: kn, shake: 1.1 });
        }
        if (k >= 1) {
          this.cooldown = 30;
          this.setState('retreat');
        }
        break;
      }
      case 'retreat':
      case 'move': {
        const c = this.covers[this.cover];
        this.turnTo(c, 2, dt);
        this.speed = THREE.MathUtils.damp(this.speed, this.state === 'move' ? 0.9 : 1.3, 3, dt);
        this.pos.addScaledVector(this.fwd(_v), this.speed * dt);
        this.pos.y = this.floor(this.pos.x, this.pos.z);
        if (this.distXZ(c) < 0.8) {
          this.yaw += Math.PI * (Math.random() - 0.5);
          this.setState('anchor');
        }
        if (this.st > 40) this.setState('anchor');
        break;
      }
    }
    this.place(-0.05 * this.tense);
    if (near) {
      const r = this.rig;
      r.reset();
      this.phase += dt * this.speed * 4;
      const sw = Math.min(1, this.speed / 0.5);
      for (const [s, sx] of [['L', -1], ['R', 1]] as const) {
        for (let k = 0; k < 3; k++) {
          const g = (k + (s === 'L' ? 0 : 1)) % 2;
          const p = this.phase + g * Math.PI;
          r.rot(`limb${s}${k}1`, AX.y, 0.35 * sw * Math.sin(p) + 0.04 * this.tense * Math.sin(this.t * 7 + k));
          r.rot(`limb${s}${k}1`, AX.fwd, -sx * (0.25 * sw * Math.max(0, Math.cos(p)) - 0.15 * this.tense));
        }
      }
      // breathing: slow at rest, fast and shallow under tension
      const br = Math.sin(this.t * (this.tense > 0.5 ? 5 : 1.2)) * (this.tense > 0.5 ? 0.012 : 0.02);
      r.scale('sp2', 1 + br);
      r.rot('head', AX.x, 0.08 * this.tense);
      r.rot('jaw', AX.x, this.state === 'leap' ? 0.45 : 0);
      r.rot('tail1', AX.y, 0.1 * Math.sin(this.t * 0.6));
    }
  }

  private startLeap() {
    this.leapFrom.copy(this.pos);
    _v.subVectors(this.leapTo, this.pos).setY(0);
    if (_v.length() > 3.2) _v.setLength(3.2);
    this.leapTo.copy(this.pos).add(_v);
    this.hit = false;
    this.f.voice.growl(this.pos, 0.5, 0.4);
    this.setState('leap');
  }
}

// ================================================================================================ Red Dune Hermit
class DuneHermit extends RefugeCreature {
  readonly species = 'hermit';
  private out = 0;
  private dest = new THREE.Vector3();
  private waitT = 30 + Math.random() * 60;
  phase = 0;
  private curl = 0;

  constructor(f: FaunaManager, eco: RefugeEco, readonly fissure: THREE.Vector3) {
    super(f, eco);
    this.pos.copy(fissure);
    this.view = 80;
    this.nearR = 30;
    this.setState('below');
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player.pos;
    const h = this.f.host;
    const sun = h.sunHeight();
    const dPl = this.distXZ(pl);
    const onFoot = h.playerOnFoot();
    switch (this.state) {
      case 'below': {
        // underground (the manager owns visibility): kept below the surface out of sight
        this.pos.copy(this.fissure);
        this.pos.y = this.floor(this.pos.x, this.pos.z) - 1.2;
        this.place();
        this.waitT -= dt;
        // crossings in mild light (morning, evening), not under a high Sun, and not with someone standing over the crack
        if (this.waitT < 0 && sun > -0.05 && sun < 0.45 && !(onFoot && dPl < 10)) {
          const a = Math.random() * TAU;
          this.dest.set(this.fissure.x + Math.cos(a) * (7 + Math.random() * 7), 0, this.fissure.z + Math.sin(a) * (7 + Math.random() * 7));
          this.pos.copy(this.fissure);
          this.out = 0;
          this.setState('cross');
        }
        return;
      }
      case 'cross':
      case 'return': {
        this.out += dt;
        const goal = this.state === 'cross' ? this.dest : this.fissure;
        this.turnTo(goal, 1.2, dt);
        this.speed = THREE.MathUtils.damp(this.speed, 0.22, 2, dt);
        this.pos.addScaledVector(this.fwd(_v), this.speed * dt);
        if (Math.random() < dt * 3) this.f.puffs.burst(this.pos, 1, DUST, { speed: 0.2, up: 0.1, size: 0.12, life: 1.2, alpha: 0.35 });
        // someone close or running nearby: stop and curl like a stone
        if (onFoot && (dPl < 6 || (dPl < 15 && eco.noise > 0.4))) this.setState('curl');
        if (this.state === 'cross' && (this.distXZ(this.dest) < 0.4 || this.out > 150)) this.setState('return');
        if (this.state === 'return' && this.distXZ(this.fissure) < 0.4) {
          this.waitT = 120 + Math.random() * 180;
          this.setState('below');
        }
        break;
      }
      case 'curl': {
        this.speed = 0;
        this.out += dt;
        if (onFoot && h.playerOnFoot() && dPl < 14) eco.note('hermit', 'curl');
        // waits, then hurries home (the clock outside is its water and its reserves)
        if (this.st > 12 && !(onFoot && dPl < 4)) this.setState('return');
        break;
      }
    }
    this.pos.y = this.floor(this.pos.x, this.pos.z);
    this.curl = THREE.MathUtils.damp(this.curl, this.state === 'curl' ? 1 : 0, 4, dt);
    if (onFoot && eco.watching(this.pos, 18)) eco.note('hermit', 'sighting');
    this.place();
    this.root.position.y -= 0.05 * this.curl;
    if (near) {
      const r = this.rig;
      r.reset();
      this.phase += dt * this.speed * 30;
      for (const [s, sx] of [['L', -1], ['R', 1]] as const) {
        for (let k = 0; k < 3; k++) {
          const g = (k + (s === 'L' ? 0 : 1)) % 2;
          const p = this.phase + g * Math.PI;
          r.rot(`leg${s}${k}1`, AX.y, 0.4 * Math.sin(p) * (1 - this.curl));
          // curled: the legs fold up under the shell
          r.rot(`leg${s}${k}1`, AX.fwd, -sx * (0.25 * Math.max(0, Math.cos(p)) * (1 - this.curl) + 0.9 * this.curl));
        }
      }
      r.rot('head', AX.x, 0.3 * this.curl);
      r.scale('head', 1 - 0.4 * this.curl);
    }
  }
}

// ================================================================================================ Thermal Rift Serpent
class RiftSerpent extends RefugeSwimmer {
  readonly species = 'serpent';
  private station = new THREE.Vector3();
  private mouthP = new THREE.Vector3();
  private hunger = 0.3;
  private shoved = false;

  constructor(f: FaunaManager, eco: RefugeEco, readonly school: RibbonSchool | null) {
    super(f, eco);
    const R = eco.R;
    const a = L.channel.a, b = L.channel.b;
    at(R, a[0] + (b[0] - a[0]) * 0.45, L.channel.bottom + 0.8, a[1] + (b[1] - a[1]) * 0.45, this.station);
    at(R, b[0] + 2, L.channel.bottom + 1, b[1] + 1, this.mouthP);
    this.pos.copy(this.station);
    this.yaw = Math.atan2(-(a[0] - b[0]), -(a[1] - b[1]));
    this.view = 100;
    this.nearR = 50;
    this.collideR = 0.45;
    this.collideLen = 1.6;
    this.setState('station');
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player.pos;
    const inside = eco.playerInside();
    const plWater = inside && eco.inWater(pl);
    const d = this.pos.distanceTo(pl);
    this.hunger = Math.min(1, this.hunger + dt / 300);
    if (plWater && d < 10 && (this.state === 'station' || this.state === 'patrol')) this.setState('investigate');
    let jaw = 0, lift = 0;
    switch (this.state) {
      case 'station': {
        // low-motion station-keeping in the channel's flow shadow, facing upstream
        this.swimTo(this.station, 0.25, 0.6, dt, 0.4);
        if (this.st > 60 + Math.random() * 60) this.setState('patrol');
        if (this.hunger > 0.6 && this.school && this.school.live > 0 && this.school.center.distanceTo(this.mouthP) < 9) this.setState('hunt');
        break;
      }
      case 'patrol': {
        this.swimTo(this.st < 25 ? this.mouthP : this.station, 0.9, 0.8, dt, 0.4);
        if (this.st > 50) this.setState('station');
        break;
      }
      case 'hunt': {
        if (!this.school) {
          this.setState('station');
          break;
        }
        // a slow approach, then one powerful acceleration
        const burst = this.pos.distanceTo(this.school.center) < 5;
        this.swimTo(this.school.center, burst ? 4.5 : 0.7, burst ? 3 : 1, dt, 0.4);
        eco.hunters.push(this.pos);
        jaw = burst ? 0.6 : 0;
        if (burst && this.school.take(this.pos, 1.6)) {
          this.hunger = 0;
          if (eco.watching(this.pos, 16)) eco.note('serpent', 'hunt');
          this.setState('station');
        }
        if (this.st > 25) this.setState('station');
        break;
      }
      case 'investigate': {
        // contact first: closes slowly to a few metres, head toward the intruder
        _v.subVectors(pl, this.pos).setLength(Math.max(0, d - 5));
        this.goal.copy(this.pos).add(_v);
        this.swimTo(this.goal, 0.6, 1, dt, 0.4);
        if (!plWater || d > 14) this.setState('station');
        else if (d < 5) this.setState('display');
        break;
      }
      case 'display': {
        // head raised, jaws open, a low resonance: a warning, not yet an attack
        this.vel.multiplyScalar(Math.exp(-3 * dt));
        this.turnTo(pl, 1.5, dt);
        jaw = 0.7;
        lift = 0.4;
        if (this.st < dt * 1.5) this.f.voice.growl(this.pos, 1.2, 0.35);
        if (eco.watching(this.pos, 14)) eco.note('serpent', 'display');
        this.f.alarm = Math.max(this.f.alarm, 1);
        if (this.st > 3.5) {
          if (plWater && d < 2.6 && this.hostile && this.cooldown <= 0) {
            this.shoved = false;
            this.setState('shove');
          } else if (!plWater || d > 7) this.setState('station');
          else this.setState('display');
        }
        break;
      }
      case 'shove': {
        // a territorial shove (a bite is rare): out of its channel
        this.swimTo(pl, 3.5, 4, dt, 0.4);
        jaw = 0.4;
        if (!this.shoved && d < 1.8) {
          this.shoved = true;
          const k = _u.subVectors(pl, this.pos).setY(0).normalize().multiplyScalar(5);
          this.f.hurtPlayer(0.06, { cause: 'a Thermal Rift Serpent guarding its channel', knock: k, crack: null, shake: 0.8 });
          this.cooldown = 25;
        }
        if (this.st > 1.2) this.setState('station');
        break;
      }
    }
    if (eco.watching(this.pos, 20)) eco.note('serpent', 'sighting');
    this.place3();
    if (near) {
      const r = this.rig;
      r.reset();
      // sinusoidal axial motion (stronger with speed), the tail sculling
      const amp = 0.06 + 0.12 * Math.min(1, this.speed / 1.5);
      for (let i = 1; i <= 8; i++) r.rot(`sp${i}`, AX.y, amp * (i / 8) * Math.sin(this.t * (1.2 + this.speed) - i * 0.75));
      r.rot('head', AX.x, -lift);
      r.rot('jaw', AX.x, jaw);
      // the limbs fold back along the body while swimming
      for (const [s, sx] of [['L', -1], ['R', 1]] as const) for (let k = 0; k < 2; k++) r.rot(`limb${s}${k}1`, AX.y, -sx * 0.6 * Math.min(1, this.speed));
    }
  }
}

// ================================================================================================ Subglacial Monarch
class Monarch extends RefugeSwimmer {
  readonly species = 'monarch';
  private center = new THREE.Vector3();
  private ang = Math.random() * TAU;
  private closeT = 0;
  private fatigue = 0;
  private inspectAt = 0;

  constructor(f: FaunaManager, eco: RefugeEco) {
    super(f, eco);
    const lk = L.lake;
    at(eco.R, lk.c[0] + 14, lk.level - 10, lk.c[1], this.center);
    this.pos.copy(this.center);
    this.view = 140;
    this.nearR = 80;
    this.collideR = 1.2;
    this.collideLen = 2.4;
    this.setState('patrol');
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player.pos;
    const plWater = eco.playerInside() && eco.inWater(pl);
    const d = this.pos.distanceTo(pl);
    this.fatigue = Math.max(0, this.fatigue - dt);
    let jaw = 0.05;
    if (plWater && d < 22 && this.state === 'patrol' && this.t - this.inspectAt > 90) {
      this.inspectAt = this.t;
      this.setState('inspect');
    }
    switch (this.state) {
      case 'patrol': {
        // slow loops in the deep basin, mostly under the ice
        this.ang += dt * 0.03;
        this.goal.set(this.center.x + Math.cos(this.ang) * 9, this.center.y + Math.sin(this.t * 0.05) * 2, this.center.z + Math.sin(this.ang) * 13);
        this.swimTo(this.goal, 0.9, 0.35, dt, 1.5);
        break;
      }
      case 'inspect': {
        // sideways first, one pass below the diver, then a slow turn away
        if (this.st < 12) this.goal.copy(pl).add(_v.set(Math.cos(this.ang) * 9, -5, Math.sin(this.ang) * 9));
        else this.goal.copy(pl).add(_v.set(-Math.cos(this.ang) * 6, -6, -Math.sin(this.ang) * 6));
        this.swimTo(this.goal, 1.1, 0.3, dt, 1.5);
        if (eco.watching(this.pos, 30)) eco.note('monarch', 'inspect');
        if (this.st > 26 || !plWater) this.setState('patrol');
        break;
      }
      case 'warn': {
        this.swimTo(pl, 0.5, 0.4, dt, 1.5);
        jaw = 0.35;
        this.f.alarm = Math.max(this.f.alarm, 1);
        if (this.st > 5) {
          if (plWater && d < 6 && this.hostile && this.fatigue <= 0) this.setState('strike');
          else this.setState('patrol');
        }
        break;
      }
      case 'strike': {
        // a long burst, one ram/bite, disengage; a miss tires it and it changes strategy
        this.swimTo(pl, 4.5, 1.2, dt, 1.2);
        jaw = 0.7;
        if (d < 2.6) {
          const k = _u.subVectors(pl, this.pos).normalize().multiplyScalar(6);
          this.f.hurtPlayer(0.25, { cause: 'a Subglacial Monarch', knock: k, shake: 1.6 });
          this.fatigue = 240;
          this.setState('patrol');
        } else if (this.st > 4) {
          this.fatigue = 120;
          this.setState('patrol');
        }
        break;
      }
    }
    // crowded in deep water a long time: it warns (a rare event, never in passive mode)
    if (plWater && d < 6) this.closeT += dt;
    else this.closeT = Math.max(0, this.closeT - dt * 0.5);
    if (this.closeT > 6 && this.state !== 'warn' && this.state !== 'strike') {
      this.closeT = 0;
      this.setState('warn');
    }
    if (eco.watching(this.pos, 32)) eco.note('monarch', 'sighting');
    this.place3();
    if (near) {
      const r = this.rig;
      r.reset();
      const amp = 0.05 + 0.08 * Math.min(1, this.speed / 2);
      for (let i = 1; i <= 5; i++) r.rot(`sp${i}`, AX.y, amp * (i / 5) ** 1.5 * Math.sin(this.t * (0.7 + this.speed * 0.4) - i * 0.6));
      r.rot('jaw', AX.x, jaw);
      r.rot('finL', AX.fwd, 0.1 * Math.sin(this.t * 0.5));
      r.rot('finR', AX.fwd, -0.1 * Math.sin(this.t * 0.5));
    }
  }
}

// ================================================================================================ population
/**
 * The refuge's population (once per landing; deterministic placement from the refuge layout, so a revisit finds the
 * same colonies, the same nest and the same lairs). Speculative-evolution mode only.
 */
export async function populateRefuge(f: FaunaManager, R: MarsRefuge) {
  // one model that fails to load must not hold up the rest of the refuge
  const safe = (p: Promise<unknown>) => p.catch((e) => console.error('[refuge] species', e));
  const eco = new RefugeEco(f, R);
  f.creatures.unshift(eco);
  const rand = rnd(9091);
  const jobs: Promise<unknown>[] = [];
  const W = (x: number, y: number, z: number) => at(R, x, y, z);
  const floorAt = (x: number, z: number) => f.host.terrainY(R.c.x + x, R.c.z + z);
  const lk = L.lake;
  // ---- Crimson Icebloom: on the ice shelf under the skylight, and on the ice front at the waterline
  const [sx, sz] = L.skylight.c;
  const blooms: [THREE.Vector3, THREE.Vector3, number][] = [];
  for (let i = 0; i < 4; i++) {
    const a = rand() * TAU, d = 1.5 + rand() * 4;
    blooms.push([W(sx + Math.cos(a) * d, L.ice.top + 0.04, sz + Math.sin(a) * d), new THREE.Vector3(0, 1, 0), 0.8 + rand() * 0.6]);
  }
  for (const z of [-6, 4, 14]) blooms.push([W(L.ice.x0 + 1.8 * Math.sin(z * 0.37) + 1.1 * Math.sin(z * 0.9 + 1) - 0.05, lk.level + 0.45, z), new THREE.Vector3(-1, 0.25, 0), 0.5 + rand() * 0.3]);
  for (const [p, n, s] of blooms) jobs.push(safe(f.add(new Icebloom(f, eco, p, n, s), 'mars_icebloom')));
  // ---- Ferric Cathedrals on the vent mounds
  const vents = L.vents;
  for (let i = 0; i < vents.length; i++) {
    const [x, z] = vents[i];
    const p = W(x, 0, z);
    p.y = floorAt(x, z) - 0.15;
    jobs.push(safe(f.add(new Ferric(f, eco, p, 0.85 + rand() * 0.3), i === vents.length - 1 ? 'mars_ferric_small' : 'mars_ferric')));
  }
  // ---- Glass Ribbon schools: over the grove, and at the warm channel's mouth
  const grove = W(vents[0][0], lk.level - 3.5, vents[0][1] + 4);
  const chMouth = W(L.channel.b[0] + 3, lk.level - 1.8, L.channel.b[1] + 1);
  const s1 = new RibbonSchool(f, eco, grove, f.count(26));
  const s2 = new RibbonSchool(f, eco, chMouth, f.count(16));
  f.creatures.push(s1, s2);
  // ---- Prism Architects: a nest by the north-west wall, two adults and a young one, shards on the floor
  const [nx, nz] = L.nest;
  const nest = W(nx, 0, nz);
  nest.y = floorAt(nx, nz);
  const nestI = await f.game.assets.instance('mars_prism_nest').catch(() => null);
  if (nestI) {
    nestI.root.position.copy(nest);
    nestI.root.rotation.y = Math.atan2(nx, nz);
    f.root.add(nestI.root);
  }
  const shardMat = f.game.materials.get('pa_plate') ?? new THREE.MeshStandardMaterial({ color: 0x6a4a8a, metalness: 0.4, roughness: 0.3 });
  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rand() * TAU, d = 4 + rand() * 9;
    const m = new THREE.Mesh(SHARD_GEO, shardMat);
    m.position.set(nest.x + Math.cos(a) * d, 0, nest.z + Math.sin(a) * d);
    m.position.y = f.host.terrainY(m.position.x, m.position.z) + 0.008;
    m.rotation.set(0, rand() * TAU, (rand() - 0.5) * 0.2);
    m.scale.setScalar(0.8 + rand() * 0.8);
    m.castShadow = true;
    f.root.add(m);
    shards.push(m);
  }
  const prisms: PrismArchitect[] = [];
  for (let i = 0; i < 3; i++) {
    const juv = i === 2;
    const p = new PrismArchitect(f, eco, nest, shards, juv);
    p.pos.set(nest.x + 2 + i * 1.5, 0, nest.z + 1.5 + i);
    p.pos.y = f.host.terrainY(p.pos.x, p.pos.z);
    p.yaw = rand() * TAU;
    if (juv) p.growth = { base: 0.45, born: -40, rate: 0.004, max: 2.2 };
    prisms.push(p);
    jobs.push(safe(f.add(p, 'mars_prism')));
  }
  // ---- Ghosts of Valles over the grove (the deep under the ice is where they go when disturbed)
  const deep = W(lk.c[0] + 16, lk.level - 8, lk.c[1]);
  for (let i = 0; i < f.count(2); i++) {
    const g = new Ghost(f, eco, grove, [s1, s2], deep);
    g.pos.copy(grove).add(new THREE.Vector3(6 * (i ? 1 : -1), 1, 3));
    g.size = 0.9 + rand() * 0.2;
    jobs.push(safe(f.add(g, 'mars_ghost')));
  }
  // ---- the Basalt Mimic: a lair near the tunnel's foot, two other covers along the floor
  const [lx, lz] = L.lair;
  const covers = [W(lx, 0, lz), W(lx - 14, 0, lz + 8), W(lx + 8, 0, lz + 16)];
  for (const c of covers) c.y = f.host.terrainY(c.x, c.z);
  const bm = new BasaltMimic(f, eco, covers, prisms[2]);
  bm.yaw = Math.atan2(-(nest.x - covers[0].x), -(nest.z - covers[0].z));
  jobs.push(safe(f.add(bm, 'mars_bmimic')));
  // ---- the Thermal Rift Serpent in the warm channel
  jobs.push(safe(f.add(new RiftSerpent(f, eco, s2), 'mars_serpent')));
  // ---- the Subglacial Monarch in the deep basin
  jobs.push(safe(f.add(new Monarch(f, eco), 'mars_monarch')));
  // ---- the Red Dune Hermit at its fissure outside the massif (a crack in the levelled ground)
  const [fx, fz] = L.fissure;
  const fis = W(fx, 0, fz);
  fis.y = f.host.terrainY(fis.x, fis.z);
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  crack.rotation.set(-Math.PI / 2, 0, 0.6);
  crack.position.copy(fis).setY(fis.y + 0.02);
  f.root.add(crack);
  jobs.push(safe(f.add(new DuneHermit(f, eco, fis), 'mars_hermit')));
  eco.schools = [s1, s2];
  await Promise.all(jobs);
}
