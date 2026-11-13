import * as THREE from 'three';
import { Creature, FaunaManager } from './Fauna';
import { AX } from './Rig';
import { MILLER_BIOME, millerSpots } from '../surface/millerBiome';
import type { Eco } from './miller';
import { PreySwarm } from './prey';

/**
 * Miller's Planet — the reef's lee, the rift and the basin (docs/MILLER_BIOSPHERE.md):
 *   BreakerShield — armoured shoreline browser guarding a nest in the reef's lee: places itself between an intruder and
 *                   the eggs, raises its shield, knocks on the rock, shoves only if crowded.
 *   RiftArchitect — builds and repairs a wall of flat stones round an egg crevice by the rift's vents; swipes only to
 *                   defend the clutch.
 *   LuminousSiren — hovers by the rift wall with a pulsing lure; small drifting animals gather and are snapped up.
 *   AbyssalStalker — waits on the basin's ledges; investigates lights; a telegraphed straight burst only when crowded.
 *   ChorusPod     — a clicking social pod in the basin: loose flocking, investigates and moves on, hunts a prey school.
 *   Cathedral     — the slow filter feeder of the basin, mouth open through plankton; dangerous only by its wake.
 *   Crown         — the rare apex predator: patrols below suit depth, rarely rises; attacks only after a display, if pressed.
 * Underwater sight is short: what a creature perceives of the player is the suit's movement, lamp and closeness.
 */
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _e = new THREE.Euler();
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const SILT = new THREE.Color(0.3, 0.32, 0.3);
const B = MILLER_BIOME;

function rnd(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** the player as an animal would perceive them (underwater sight is short; the helmet lamp carries further) */
function perceive(c: Creature, range: number) {
  const g = c.game;
  const pl = g.player;
  if (!c.f.host.playerOnFoot()) return null;
  const d = pl.pos.distanceTo(c.pos);
  const lamp = (g.zone as unknown as { headlampOn?: boolean }).headlampOn ? 1.6 : 1;
  const moving = pl.vel.length() > 0.4 ? 1.3 : 1;
  return d < range * lamp * moving ? d : null;
}

// ------------------------------------------------------------------------------------------------ swimmers
abstract class Swimmer extends Creature {
  readonly vel = new THREE.Vector3();
  readonly q = new THREE.Quaternion();
  size = 1;
  /** clearance above the seabed and below the surface (m, at size 1) */
  clear = 1.5;
  private pitchA = 0;
  private bank = 0;
  protected swim = 0;

  constructor(f: FaunaManager, readonly eco: Eco) {
    super(f);
  }

  /** swim toward p at speed v; turns at up to `turn` rad/s; stays clear of the seabed and the surface */
  protected swimTo(p: THREE.Vector3, v: number, turn: number, dt: number, acc = 2) {
    const host = this.f.host;
    _v.subVectors(p, this.pos);
    const d = _v.length();
    if (d > 1e-3) _v.divideScalar(d);
    // look ahead for the seabed
    const sp = Math.max(0.5, this.vel.length());
    const ax = this.pos.x + this.vel.x / sp * 6 * this.size, az = this.pos.z + this.vel.z / sp * 6 * this.size;
    const floor = Math.max(host.terrainY(ax, az), host.terrainY(this.pos.x, this.pos.z)) + this.clear * this.size;
    if (this.pos.y < floor + 2 * this.size) _v.y = Math.max(_v.y, 0.6);
    const ceil = host.waterLevel(this.pos.x, this.pos.z) - this.clear * this.size;
    if (this.pos.y > ceil - this.size) _v.y = Math.min(_v.y, -0.4);
    _v.normalize();
    _u.copy(this.vel);
    const cur = _u.length();
    if (cur < 0.05) _u.copy(this.fwd3(_w));
    else _u.divideScalar(cur);
    const ang = _u.angleTo(_v);
    if (ang > 1e-4) _u.lerp(_v, Math.min(1, (turn * dt) / ang)).normalize();
    const ns = cur + clamp(v - cur, -acc * dt, acc * dt);
    this.vel.copy(_u).multiplyScalar(Math.max(0, ns));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = clamp(this.pos.y, floor, Math.max(floor, ceil));
    this.swim += dt * (0.6 + ns / Math.max(0.5, this.size)) * 1.4;
    return d;
  }

  protected fwd3(out: THREE.Vector3) {
    return out.set(0, 0, -1).applyQuaternion(this.q);
  }

  protected face(dt: number) {
    const sp = this.vel.length();
    if (sp < 0.05) return;
    const yaw = Math.atan2(-this.vel.x, -this.vel.z);
    let dy = yaw - this.yaw;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    this.yaw += dy * Math.min(1, dt * 4);
    this.pitchA = damp(this.pitchA, Math.asin(clamp(this.vel.y / sp, -1, 1)) * 0.8, 2, dt);
    this.bank = damp(this.bank, clamp((dy / Math.max(dt, 1e-3)) * 0.3, -0.5, 0.5), 2, dt);
    this.q.setFromEuler(_e.set(this.pitchA, this.yaw, this.bank, 'YXZ'));
  }

  placeSw() {
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.q);
    this.root.scale.setScalar(this.size);
  }

  /** body wave down the spine bones (amplitude growing to the tail) */
  protected undulate(prefix: string, n: number, amp: number, phase = 0) {
    for (let i = 1; i <= n; i++) this.rig.rot(`${prefix}${i}`, AX.y, amp * (i / n) * Math.sin(this.swim - i * 0.9 + phase));
  }
}

// ================================================================================================ Breaker Shield
class BreakerShield extends Creature {
  readonly species = 'breaker';
  readonly nest = new THREE.Vector3();
  private target = new THREE.Vector3();
  private speedV = 0;
  private gait = 0;
  private shield = 0;
  private knockT = 0;
  private crowdT = 0;
  private eggs: THREE.Group | null = null;
  size = 1;

  constructor(f: FaunaManager, readonly eco: Eco) {
    super(f);
    this.view = 160;
    this.nearR = 90;
  }

  buildNest() {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xcfc2a8, roughness: 0.35, clearcoat: 0.6 });
    const spots = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6 });
    const geo = new THREE.SphereGeometry(0.11, 14, 10);
    const sg = new THREE.SphereGeometry(0.02, 6, 4);
    const R = rnd(17);
    for (let i = 0; i < 9; i++) {
      const e = new THREE.Mesh(geo, mat);
      e.position.set((R() - 0.5) * 0.6, 0.08 + R() * 0.08, (R() - 0.5) * 0.45);
      e.scale.set(1, 1.15, 1);
      g.add(e);
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Mesh(sg, spots);
        _v.set(R() - 0.5, R() - 0.3, R() - 0.5).normalize().multiplyScalar(0.11);
        sp.position.copy(e.position).add(_v);
        sp.scale.set(1, 0.4, 1);
        g.add(sp);
      }
    }
    g.position.copy(this.nest);
    this.f.root.add(g);
    this.eggs = g;
  }

  private walk(to: THREE.Vector3, v: number, dt: number) {
    const want = Math.atan2(-(to.x - this.pos.x), -(to.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    this.yaw += clamp(d, -0.6 * dt, 0.6 * dt);
    this.speedV = damp(this.speedV, Math.abs(d) > 0.8 ? v * 0.3 : v, 2, dt);
    this.pos.addScaledVector(this.fwd(_w), this.speedV * dt);
    this.pos.y = this.f.host.terrainY(this.pos.x, this.pos.z);
    return Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player;
    const tide = eco.tideState(this.pos.x, this.pos.z);
    const dp = perceive(this, 9);
    const dNest = Math.hypot(pl.pos.x - this.nest.x, pl.pos.z - this.nest.z);
    let shieldT = 0;
    switch (this.state) {
      case 'idle':
      case 'browse': {
        // grazing the biofilm on the shelf near the nest, head down
        if (this.st > 12 || this.target.lengthSq() === 0) {
          const a = Math.random() * TAU;
          this.target.set(this.nest.x + Math.cos(a) * 4, 0, this.nest.z + Math.sin(a) * 4);
          this.st = 0;
        }
        this.walk(this.target, 0.12, dt);
        if (dp !== null && this.f.hostility > 0) this.setState('guard');
        if (tide >= 2) this.setState('shelter');
        break;
      }
      case 'guard': {
        // between the intruder and the eggs, shield raised, knocking on the rock
        shieldT = 1;
        _v.set(pl.pos.x - this.nest.x, 0, pl.pos.z - this.nest.z).normalize().multiplyScalar(1.8).add(this.nest);
        this.walk(_v, 0.35, dt);
        this.yaw = damp(this.yaw, Math.atan2(-(pl.pos.x - this.pos.x), -(pl.pos.z - this.pos.z)), 3, dt);
        this.knockT -= dt;
        if (this.knockT < 0) {
          this.knockT = 1.4;
          this.game.audio.thud(undefined, 0.35, 45);
          this.f.puffs.burst(this.pos, 3, SILT, { speed: 0.4, up: 0.2, size: 0.4, life: 1, alpha: 0.3, spread: 0.6 });
        }
        if (eco.watching(this.pos, 14, 0.4)) eco.note('breaker', 'display', 'It turned to face me between me and its eggs, lifted its shield and knocked on the rock.');
        this.crowdT = dp !== null && (dp < 3 || dNest < 3) ? this.crowdT + dt : Math.max(0, this.crowdT - dt);
        if (this.crowdT > 2.5 && dp !== null && dp < 3.2) this.setState('shove');
        if (dp === null && this.st > 4) this.setState('browse');
        if (tide >= 2) this.setState('shelter');
        break;
      }
      case 'shove': {
        // a short lurch forward: it cannot leap, but it can knock a person down
        shieldT = 1;
        this.speedV = this.st < 0.5 ? 2.2 : damp(this.speedV, 0, 4, dt);
        this.pos.addScaledVector(this.fwd(_w), this.speedV * dt);
        this.pos.y = this.f.host.terrainY(this.pos.x, this.pos.z);
        if (this.st > 0.3 && this.st < 0.6 && pl.pos.distanceTo(this.pos) < 2.4 * this.size && this.cooldown <= 0) {
          this.cooldown = 4;
          _v.set(pl.pos.x - this.pos.x, 0, pl.pos.z - this.pos.z).normalize().multiplyScalar(5);
          this.f.hurtPlayer(0.06, { cause: 'a Breaker Shield', knock: _v, shake: 0.9, crack: null });
          eco.note('breaker', 'shove', 'Crowded at its nest, it lurched forward and shoved — a short charge, not a chase.');
        }
        if (this.st > 1.5) {
          this.crowdT = 0;
          this.setState('guard');
        }
        break;
      }
      case 'shelter': {
        // low and braced over the nest in the reef's lee until the crest has passed
        shieldT = 0.3;
        this.walk(this.nest, 0.3, dt);
        if (tide === 0 && this.st > 10) this.setState('browse');
        if (eco.watching(this.pos, 14, 0.4) && tide >= 2) eco.note('breaker', 'tide', 'Before the crest it pressed itself flat over its nest in the lee of the reef.');
        break;
      }
    }
    this.shield = damp(this.shield, shieldT, 3, dt);
    if (near) this.pose(dt);
    this.root.position.copy(this.pos);
    this.root.rotation.set(-0.08 * this.shield, this.yaw, 0, 'YXZ');
    this.root.scale.set(this.size, this.size * (this.state === 'shelter' ? 0.85 : 1), this.size);
    if (eco.watching(this.pos, 20, 0.3)) eco.note('breaker', 'sighting', 'What looked like layered wet stone breathed — a massive armoured animal by a clutch of eggs.');
  }

  private pose(dt: number) {
    const r = this.rig;
    r.reset();
    this.gait += this.speedV * dt * 5;
    const w = clamp(this.speedV / 0.2, 0, 1);
    ['L', 'R'].forEach((s, si) => {
      for (let k = 0; k < 3; k++) {
        // alternating tripods: a slow deliberate gait, every step a weight shift
        const ph = this.gait + (k % 2 === si ? 0 : Math.PI);
        r.rot(`limb${s}${k}1`, AX.y, (si === 0 ? 1 : -1) * 0.22 * Math.sin(ph) * w);
        r.rot(`limb${s}${k}1`, AX.z, (si === 0 ? -1 : 1) * (0.12 * Math.max(0, Math.sin(ph)) * w + 0.15 * this.shield));
      }
    });
    r.rot('head', AX.x, -0.15 * (1 - this.shield) + 0.2 * this.shield + 0.03 * Math.sin(this.t * 1.1));
    r.scale('body', 1 + 0.015 * Math.sin(this.t * 0.9));
  }

  dispose() {
    super.dispose();
    this.eggs?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.eggs?.removeFromParent();
  }
}

// hatchlings: wander round the nest, run under the parent's shell edge when anything big comes near or the sea turns
class BreakerHatchling extends Creature {
  readonly species = 'breakerjuv';
  parent!: BreakerShield;
  size = 0.2;
  private target = new THREE.Vector3();
  private speedV = 0;
  private gait = 0;

  constructor(f: FaunaManager, readonly eco: Eco, readonly idx: number) {
    super(f);
    this.view = 70;
    this.nearR = 35;
  }

  update(dt: number, near: boolean) {
    const p = this.parent;
    const host = this.f.host;
    const pl = this.game.player;
    const tide = this.eco.tideState(this.pos.x, this.pos.z);
    const dpl = pl.pos.distanceTo(this.pos);
    const danger = dpl < 5 || tide >= 2 || p.state === 'guard' || p.state === 'shove' || p.state === 'shelter';
    if (danger && this.state !== 'hide') this.setState('hide');
    if (!danger && this.state === 'hide' && this.st > 4) this.setState('wander');
    let want = 0;
    if (this.state === 'hide') {
      const a = this.idx * 2.1 + p.yaw;
      this.target.set(p.pos.x + Math.cos(a) * 0.95 * p.size, 0, p.pos.z + Math.sin(a) * 0.95 * p.size);
      want = 0.4;
      if (this.eco.watching(this.pos, 8, 0.3) && dpl < 6) this.eco.note('breaker', 'young', 'Palm-sized young scattered round the nest, then ran in under the adult’s shell edge as I came close.');
    } else {
      if (this.state !== 'wander' || this.st > 5 + this.idx) {
        this.setState('wander');
        const a = Math.random() * TAU, d = 0.7 + Math.random() * 1.8;
        this.target.set(p.nest.x + Math.cos(a) * d, 0, p.nest.z + Math.sin(a) * d);
      }
      want = this.pos.distanceTo(_v.set(this.target.x, this.pos.y, this.target.z)) > 0.15 ? 0.12 : 0;
    }
    _v.set(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
    const d = _v.length();
    if (d < 0.08) want = 0;
    this.speedV = damp(this.speedV, want, 6, dt);
    if (d > 1e-3) {
      const yaw = Math.atan2(-_v.x, -_v.z);
      let dy = yaw - this.yaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      this.yaw += dy * Math.min(1, dt * 6);
      this.pos.addScaledVector(_v.divideScalar(d), this.speedV * dt);
    }
    this.pos.y = host.terrainY(this.pos.x, this.pos.z);
    if (near) {
      const r = this.rig;
      r.reset();
      this.gait += this.speedV * dt * 40;
      const w = clamp(this.speedV / 0.1, 0, 1);
      ['L', 'R'].forEach((s, si) => {
        for (let k = 0; k < 3; k++) {
          const ph = this.gait + (k % 2 === si ? 0 : Math.PI);
          r.rot(`limb${s}${k}1`, AX.y, (si === 0 ? 1 : -1) * 0.3 * Math.sin(ph) * w);
        }
      });
    }
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0, 'YXZ');
    this.root.scale.setScalar(this.size);
  }
}

// ================================================================================================ Rift Architect
interface Stone {
  m: THREE.Mesh;
  slot: THREE.Vector3;
  placed: boolean;
}

class RiftArchitect extends Creature {
  readonly species = 'architect';
  readonly den = new THREE.Vector3();
  private stones: Stone[] = [];
  private carrying: Stone | null = null;
  private target = new THREE.Vector3();
  private speedV = 0;
  private gait = 0;
  private threat = 0;
  private crowdT = 0;
  private lastTide = 0;
  private props = new THREE.Group();
  size = 1;

  constructor(f: FaunaManager, readonly eco: Eco) {
    super(f);
    this.view = 60;
    this.nearR = 45;
  }

  /** the egg crevice, the stone wall round it (some stones still loose nearby), pearl-white eggs */
  buildSite() {
    const host = this.f.host;
    const R = rnd(29);
    const sm = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.85 });
    const shell = new THREE.MeshPhysicalMaterial({ color: 0xd8d0e0, roughness: 0.2, clearcoat: 1, iridescence: 0.8 });
    const egg = new THREE.MeshPhysicalMaterial({ color: 0xf0eee8, roughness: 0.15, clearcoat: 1, sheen: 0.5 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU * 0.8 + 0.6;
      const slot = new THREE.Vector3(this.den.x + Math.cos(a) * 0.75, 0, this.den.z + Math.sin(a) * 0.55);
      slot.y = host.terrainY(slot.x, slot.z) + 0.05 + (i % 3) * 0.06;
      const nacre = i % 4 === 0;
      const geo = nacre ? new THREE.CylinderGeometry(0.11, 0.13, 0.03, 12) : new THREE.DodecahedronGeometry(0.11, 0);
      const m = new THREE.Mesh(geo, nacre ? shell : sm);
      if (!nacre) m.scale.set(1.3, 0.45, 1);
      const placed = i < 9;
      const p = placed ? slot : new THREE.Vector3(this.den.x + (R() - 0.5) * 5, 0, this.den.z + (R() - 0.5) * 5);
      if (!placed) p.y = host.terrainY(p.x, p.z) + 0.04;
      m.position.copy(p);
      m.rotation.set(R() * 0.4, R() * TAU, R() * 0.4);
      m.castShadow = true;
      this.props.add(m);
      this.stones.push({ m, slot, placed });
    }
    for (let i = 0; i < 14; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), egg);
      e.position.set(this.den.x + (R() - 0.5) * 0.35, host.terrainY(this.den.x, this.den.z) + 0.03 + R() * 0.04, this.den.z + (R() - 0.5) * 0.25);
      this.props.add(e);
    }
    this.f.root.add(this.props);
  }

  private walk(to: THREE.Vector3, v: number, dt: number) {
    const want = Math.atan2(-(to.x - this.pos.x), -(to.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    this.yaw += clamp(d, -1.6 * dt, 1.6 * dt);
    this.speedV = damp(this.speedV, Math.abs(d) > 0.9 ? v * 0.3 : v, 3, dt);
    this.pos.addScaledVector(this.fwd(_w), this.speedV * dt);
    this.pos.y = this.f.host.terrainY(this.pos.x, this.pos.z);
    return Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player;
    const tide = eco.tideState(this.pos.x, this.pos.z);
    const dp = perceive(this, 6);
    const dEggs = Math.hypot(pl.pos.x - this.den.x, pl.pos.z - this.den.z);
    let threatT = 0;
    // a crest went over: some of the wall is knocked down (and will be repaired)
    if (tide === 4 && this.lastTide !== 4) {
      for (const s of this.stones) {
        if (s.placed && Math.random() < 0.35) {
          s.placed = false;
          s.m.position.set(this.den.x + (Math.random() - 0.5) * 4, 0, this.den.z + (Math.random() - 0.5) * 4);
          s.m.position.y = this.f.host.terrainY(s.m.position.x, s.m.position.z) + 0.04;
        }
      }
      this.f.puffs.burst(this.den, 20, SILT, { speed: 1, up: 0.4, size: 1, life: 4, alpha: 0.4, spread: 2 });
    }
    this.lastTide = tide;
    switch (this.state) {
      case 'idle':
      case 'build': {
        // choose a loose stone, carry it, fit it into the gap (grasp → turn → place)
        if (tide >= 2) {
          this.setState('shelter');
          break;
        }
        if (dp !== null && dEggs < 3.5 && this.f.hostility > 0) {
          this.setState('defend');
          break;
        }
        if (!this.carrying) {
          const loose = this.stones.find((s) => !s.placed);
          if (!loose) {
            const a = this.t * 0.1;
            this.walk(this.target.set(this.den.x + Math.cos(a) * 1.2, 0, this.den.z + Math.sin(a) * 1.0), 0.08, dt);
            break;
          }
          if (this.walk(loose.m.position, 0.18, dt) < 0.45) {
            this.carrying = loose;
            this.setState('carry');
          }
        }
        break;
      }
      case 'carry': {
        const s = this.carrying!;
        s.m.position.copy(this.pos).addScaledVector(this.fwd(_w), 0.62 * this.size).setY(this.pos.y + 0.28 * this.size);
        if (this.walk(s.slot, 0.14, dt) < 0.55) {
          s.m.position.lerp(s.slot, Math.min(1, dt * 2));
          s.m.rotation.y += dt * 1.5;
          if (s.m.position.distanceTo(s.slot) < 0.03 || this.st > 14) {
            s.m.position.copy(s.slot);
            s.placed = true;
            this.carrying = null;
            this.game.audio.thud(undefined, 0.12, 300);
            if (eco.watching(this.pos, 10, 0.5)) eco.note('architect', this.stones.filter((q) => q.placed).length > 10 && this.lastTide === 0 ? 'repair' : 'construction', 'It carried a flat stone and set it into the wall round its eggs, turning it until it sat.');
            this.setState('build');
          }
        }
        if (tide >= 2 || (dp !== null && dEggs < 3)) {
          this.carrying = null;
          s.m.position.y = this.f.host.terrainY(s.m.position.x, s.m.position.z) + 0.04;
          this.setState(tide >= 2 ? 'shelter' : 'defend');
        }
        break;
      }
      case 'defend': {
        // manipulators raised, legs spread, tapping; a swipe at close range
        threatT = 1;
        this.walk(_v.set(pl.pos.x - this.den.x, 0, pl.pos.z - this.den.z).normalize().multiplyScalar(0.9).add(this.den), 0.3, dt);
        this.yaw = damp(this.yaw, Math.atan2(-(pl.pos.x - this.pos.x), -(pl.pos.z - this.pos.z)), 4, dt);
        if (Math.random() < dt * 2) this.game.audio.thud(undefined, 0.08, 420);
        if (eco.watching(this.pos, 8, 0.5)) eco.note('architect', 'defence', 'Near its eggs it raised its manipulators and tapped the rock: a warning.');
        this.crowdT = dp !== null && dp < 1.6 ? this.crowdT + dt : 0;
        if (this.crowdT > 2 && this.cooldown <= 0) {
          this.cooldown = 3;
          _v.set(pl.pos.x - this.pos.x, 0, pl.pos.z - this.pos.z).normalize().multiplyScalar(2.2);
          this.f.hurtPlayer(0.035, { cause: 'a Rift Architect', knock: _v, shake: 0.5, crack: null });
        }
        if (dp === null || dEggs > 5) this.setState('build');
        break;
      }
      case 'shelter': {
        this.walk(this.den, 0.25, dt);
        if (tide === 0 && this.st > 8) this.setState('build');
        break;
      }
    }
    this.threat = damp(this.threat, threatT, 4, dt);
    if (near) this.pose(dt);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.scale.set(this.size, this.size * (this.state === 'shelter' ? 0.8 : 1 + 0.08 * this.threat), this.size);
    if (eco.watching(this.pos, 9, 0.4)) eco.note('architect', 'sighting', 'A circle of stones by the vents is not geology: an armoured animal is building it.');
  }

  private pose(dt: number) {
    const r = this.rig;
    r.reset();
    this.gait += this.speedV * dt * 12;
    const w = clamp(this.speedV / 0.12, 0, 1);
    ['L', 'R'].forEach((s, si) => {
      for (let k = 0; k < 3; k++) {
        const ph = this.gait + (k % 2 === si ? 0 : Math.PI);
        r.rot(`leg${s}${k}1`, AX.y, (si ? -1 : 1) * 0.25 * Math.sin(ph) * w);
        r.rot(`leg${s}${k}1`, AX.z, (si ? 1 : -1) * (0.15 * Math.max(0, Math.sin(ph)) * w - 0.1 * this.threat));
      }
      // the manipulators: carrying held before the face, defending raised high, otherwise working the ground
      const lift = this.carrying ? 0.35 : this.threat * 0.7;
      r.rot(`man${s}1`, AX.x, -lift + 0.12 * Math.sin(this.t * 1.7 + si) * (1 - this.threat));
      r.rot(`man${s}3`, AX.x, 0.2 * Math.sin(this.t * 2.3 + si * 2) * (this.carrying ? 0.2 : 1));
    });
  }

  dispose() {
    super.dispose();
    this.props.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.props.removeFromParent();
  }
}

// ================================================================================================ Luminous Siren
class LuminousSiren extends Swimmer {
  readonly species = 'siren';
  readonly perch = new THREE.Vector3();
  private light: THREE.PointLight;
  private prey: PreySwarm;
  private preyP: Float32Array;
  private lure = 0.6;
  private snapT = 0;

  constructor(f: FaunaManager, eco: Eco) {
    super(f, eco);
    this.view = 60;
    this.nearR = 40;
    this.clear = 0.4;
    this.light = new THREE.PointLight(0x50fff0, 0, 5, 1.5);
    this.light.castShadow = false;
    f.root.add(this.light);
    // a few small phototactic animals (lantern shrimp) paddling toward the light
    this.preyP = new Float32Array(10 * 3);
    this.prey = new PreySwarm(f, 'fauna_prey_shrimp', this.preyP, 1, { amp: 0.1, freq: 18, len: 0.04 });
    this.prey.build().catch(() => undefined);
  }

  /** the lure bulb (world) */
  lurePos(out = new THREE.Vector3()) {
    return out.set(0, 0.09 * this.size, -0.8 * this.size).applyQuaternion(this.q).add(this.pos);
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const tide = eco.tideState(this.pos.x, this.pos.z);
    const dp = perceive(this, 3);
    let lureT = 0.7 + 0.3 * Math.sin(this.t * 1.3) * Math.sin(this.t * 0.37);
    switch (this.state) {
      case 'idle':
      case 'hover': {
        // holding station by the wall in the faint current, the lure swaying like something edible
        _v.copy(this.perch).add(_u.set(Math.sin(this.t * 0.2) * 0.4, Math.sin(this.t * 0.31) * 0.2, Math.cos(this.t * 0.17) * 0.3));
        this.swimTo(_v, 0.12, 0.8, dt, 0.4);
        this.face(dt);
        if (dp !== null && dp < 1.8) this.setState('startle');
        if (tide >= 2) this.setState('shelter');
        break;
      }
      case 'startle': {
        // a bright pulse and away into the shadow of the wall
        lureT = this.st < 0.3 ? 4 : 0.1;
        _v.copy(this.perch).add(_u.set(0, -1, 0));
        this.swimTo(_v, 0.9, 3, dt, 3);
        this.face(dt);
        if (this.st < dt * 1.5 && eco.watching(this.pos, 8, 0.5)) eco.note('siren', 'startle', 'Disturbed, it flashed its lure bright once and slipped into the shadow of the rock.');
        if (this.st > 6) this.setState('hover');
        break;
      }
      case 'shelter': {
        lureT = 0.05;
        this.swimTo(_v.copy(this.perch).add(_u.set(0, -1.5, 0)), 0.3, 1, dt, 0.5);
        this.face(dt);
        if (tide === 0 && this.st > 6) this.setState('hover');
        break;
      }
    }
    // the prey: drifting in toward the light; one comes too close and the siren snaps
    const lp = this.lurePos(_w);
    const pa = this.preyP;
    this.snapT -= dt;
    for (let i = 0; i < pa.length; i += 3) {
      if (pa[i + 1] === 0 && pa[i] === 0) {
        pa[i] = lp.x + (Math.random() - 0.5) * 3;
        pa[i + 1] = lp.y + (Math.random() - 0.5) * 2;
        pa[i + 2] = lp.z + (Math.random() - 0.5) * 3;
      }
      const attract = this.lure * 0.12;
      pa[i] += ((lp.x - pa[i]) * attract + (Math.random() - 0.5) * 0.2) * dt;
      pa[i + 1] += ((lp.y - pa[i + 1]) * attract + (Math.random() - 0.5) * 0.2) * dt;
      pa[i + 2] += ((lp.z - pa[i + 2]) * attract + (Math.random() - 0.5) * 0.2) * dt;
      const d = Math.hypot(pa[i] - lp.x, pa[i + 1] - lp.y, pa[i + 2] - lp.z);
      if (d < 0.25 && this.snapT < 0 && this.state === 'hover') {
        this.snapT = 8 + Math.random() * 10;
        pa[i] = pa[i + 1] = pa[i + 2] = 0;
        this.pos.addScaledVector(this.fwd3(_u), 0.12 * this.size);
        if (eco.watching(this.pos, 6, 0.6)) eco.note('siren', 'feeding', 'A small animal drifted to the light and the siren took it in one quick snap.');
      }
    }
    this.prey.update(dt, near);
    this.lure = damp(this.lure, lureT, 4, dt);
    this.setGlow(4 * this.lure);
    this.light.position.copy(lp);
    this.light.intensity = near ? 2.2 * this.lure : 0;
    if (near) {
      const r = this.rig;
      r.reset();
      this.undulate('sp', 6, 0.12);
      r.rot('lu1', AX.x, 0.08 * Math.sin(this.t * 1.1));
      r.rot('lu2', AX.z, 0.1 * Math.sin(this.t * 0.8));
    }
    this.placeSw();
    if (eco.watching(lp, 14, 0.25)) eco.note('siren', 'sighting', 'The cyan point in the dark was not an instrument LED: a glass-clear animal hangs behind its lure.');
  }

  dispose() {
    super.dispose();
    this.light.removeFromParent();
    this.light.dispose();
    this.prey.dispose();
  }
}

// ================================================================================================ Abyssal Stalker
class AbyssalStalker extends Swimmer {
  readonly species = 'abyssstalker';
  readonly ledge = new THREE.Vector3();
  private strikeDir = new THREE.Vector3();
  private crowdT = 0;
  private jaw = 0;
  energy = 1;

  constructor(f: FaunaManager, eco: Eco) {
    super(f, eco);
    this.view = 90;
    this.nearR = 60;
    this.clear = 1.2;
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player;
    const tide = eco.tideState(this.pos.x, this.pos.z);
    const dp = perceive(this, 18);
    this.energy = Math.min(1, this.energy + dt * 0.01);
    let jawT = 0;
    switch (this.state) {
      case 'idle':
      case 'ambush': {
        // motionless under the ledge, small corrections against the water's movement
        this.swimTo(_v.copy(this.ledge).add(_u.set(0, Math.sin(this.t * 0.3) * 0.15, 0)), 0.15, 0.4, dt, 0.3);
        if (this.vel.length() > 0.08) this.face(dt);
        if (dp !== null && this.cooldown <= 0) this.setState('investigate');
        if (tide >= 2) this.setState('withdraw');
        break;
      }
      case 'investigate': {
        // a slow pass round the light and the noise at a careful distance; a suit is not obviously food
        const a = this.t * 0.25;
        _v.copy(pl.pos).add(_u.set(Math.cos(a) * 9, 1.5 + Math.sin(this.t * 0.4), Math.sin(a) * 9));
        this.swimTo(_v, 1.1, 0.5, dt, 1);
        this.face(dt);
        if (eco.watching(this.pos, 22, 0.4)) eco.note('abyssstalker', 'sighting', 'A long black shape left the ledge and circled the lamp at a distance, then hung still.');
        // crowded at its ledge, it commits — after a visible telegraph
        this.crowdT = dp !== null && dp < 5.5 ? this.crowdT + dt : Math.max(0, this.crowdT - dt * 0.5);
        if (this.crowdT > 4 && this.energy > 0.5 && this.f.hostility > 0) {
          this.setState('telegraph');
          this.strikeDir.subVectors(pl.pos, this.pos).add(_u.set(0, 1, 0)).normalize();
        }
        if (dp === null && this.st > 6) this.setState('return');
        if (this.st > 40) this.setState('return');
        if (tide >= 2) this.setState('withdraw');
        break;
      }
      case 'telegraph': {
        // sudden stillness, head aligned, the tail bent and held
        jawT = 0.3;
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
        this.pos.addScaledVector(this.vel, dt);
        _v.copy(this.strikeDir);
        this.yaw = damp(this.yaw, Math.atan2(-_v.x, -_v.z), 5, dt);
        this.q.setFromEuler(_e.set(Math.asin(clamp(_v.y, -1, 1)) * 0.8, this.yaw, 0, 'YXZ'));
        if (this.st > 1.3) {
          this.setState('strike');
          this.vel.copy(this.strikeDir).multiplyScalar(2);
          this.game.audio.thud(undefined, 0.5, 30);
        }
        break;
      }
      case 'strike': {
        // one straight tail-driven burst: no homing, limited turning
        jawT = 1;
        this.vel.addScaledVector(this.strikeDir, dt * 40).clampLength(0, 11);
        this.pos.addScaledVector(this.vel, dt);
        const floor = this.f.host.terrainY(this.pos.x, this.pos.z) + 0.6;
        if (this.pos.y < floor) {
          this.pos.y = floor;
          this.setState('recover'); // struck the rock
        }
        if (this.cooldown <= 0 && pl.pos.distanceTo(this.pos) < 1.6 * this.size + 0.6 && this.f.host.playerOnFoot()) {
          this.cooldown = 30;
          _v.copy(this.strikeDir).multiplyScalar(6);
          this.f.hurtPlayer(0.12, { cause: 'an Abyssal Stalker', knock: _v, shake: 1, crack: [0.5, 0.45] });
          this.game.notify('Something huge hit you out of the dark — get clear of its ledge.', 'alert', 4);
          eco.note('abyssstalker', 'strike', 'Crowded at its ledge, it went still, then struck in one straight burst and veered away.');
        }
        if (this.st > 1.1) this.setState('recover');
        break;
      }
      case 'recover': {
        // decelerate, turn away, tired
        this.energy = Math.max(0, this.energy - 0.4);
        this.cooldown = Math.max(this.cooldown, 25);
        this.crowdT = 0;
        this.setState('return');
        break;
      }
      case 'return': {
        if (this.swimTo(this.ledge, 0.9, 0.6, dt, 0.6) < 2) this.setState('ambush');
        this.face(dt);
        if (tide >= 2) this.setState('withdraw');
        break;
      }
      case 'withdraw': {
        // down into the basin, away from the surge
        this.swimTo(_v.set(B.basin.x, -120, B.basin.z), 1.4, 0.4, dt, 0.6);
        this.face(dt);
        if (tide === 0 && this.st > 20) this.setState('return');
        break;
      }
    }
    this.jaw = damp(this.jaw, jawT, 8, dt);
    if (near) {
      const r = this.rig;
      r.reset();
      const tense = this.state === 'telegraph' ? 1 : 0;
      if (tense) for (let i = 1; i <= 10; i++) r.rot(`sp${i}`, AX.y, 0.06 * (i / 10));
      else this.undulate('sp', 10, this.state === 'ambush' ? 0.05 : 0.14);
      r.rot('jaw', AX.x, 0.5 * this.jaw);
      for (const s of ['L', 'R']) r.rot(`fin${s}`, AX.z, (s === 'L' ? 1 : -1) * 0.15 * Math.sin(this.t * 0.8));
    }
    this.placeSw();
  }
}

// ================================================================================================ Chorus Hunters (a pod)
class ChorusHunter extends Swimmer {
  readonly species = 'chorus';
  pod!: ChorusPod;
  index = 0;
  juvenile = false;
  readonly target = new THREE.Vector3();

  constructor(f: FaunaManager, eco: Eco) {
    super(f, eco);
    this.view = 90;
    this.nearR = 60;
    this.clear = 1.5;
  }

  update(dt: number, near: boolean) {
    const p = this.pod;
    // flocking: toward the pod's goal, apart from close neighbours, roughly with the others' heading
    _v.copy(p.goal).add(_u.set(Math.cos(this.index * 2.4 + this.t * 0.2) * p.spread, Math.sin(this.index * 1.7) * 2, Math.sin(this.index * 2.4 + this.t * 0.2) * p.spread));
    for (const o of p.members) {
      if (o === this) continue;
      const d = o.pos.distanceTo(this.pos);
      if (d < 3.5) _v.addScaledVector(_w.subVectors(this.pos, o.pos).normalize(), (3.5 - d) * 3);
    }
    this.target.copy(_v);
    const speed = p.speed * (this.juvenile ? 0.95 : 1) * (0.9 + 0.1 * Math.sin(this.t + this.index));
    this.swimTo(this.target, speed, this.juvenile ? 0.8 : 1.1, dt, 1.5);
    this.face(dt);
    if (near) {
      const r = this.rig;
      r.reset();
      this.undulate('sp', 6, 0.2);
      for (const s of ['L', 'R']) r.rot(`fin${s}`, AX.z, (s === 'L' ? 1 : -1) * 0.1 * Math.sin(this.swim * 0.5));
    }
    this.placeSw();
  }
}

/** The pod's shared intent (model-less): where they go, how tight, clicks and calls, a hunt on the prey school. */
class ChorusPod extends Creature {
  readonly species = 'chorus_pod';
  members: ChorusHunter[] = [];
  readonly goal = new THREE.Vector3();
  spread = 6;
  speed = 1.4;
  private clickT = 0;
  private school: PreySwarm;
  private threats: THREE.Vector3[] = [];
  private schoolP: Float32Array;
  private schoolC = new THREE.Vector3();
  private schoolN = 40;

  constructor(f: FaunaManager, readonly eco: Eco) {
    super(f);
    this.view = 1e9;
    this.nearR = 1e9;
    this.schoolP = new Float32Array(40 * 3);
    // a school of dart fish
    this.school = new PreySwarm(f, 'fauna_prey_dart', this.schoolP, 1, { amp: 0.12, freq: 14, len: 0.12 });
    this.school.build().catch(() => undefined);
    this.schoolC.set(B.basin.x + 60, -30, B.basin.z - 40);
    for (let i = 0; i < 40; i++) this.schoolP.set([this.schoolC.x + (Math.random() - 0.5) * 6, this.schoolC.y + (Math.random() - 0.5) * 3, this.schoolC.z + (Math.random() - 0.5) * 6], i * 3);
  }

  update(dt: number) {
    const eco = this.eco;
    const pl = this.game.player;
    const lead = this.members[0];
    if (!lead) return;
    this.pos.copy(lead.pos);
    const tide = eco.tideState(lead.pos.x, lead.pos.z);
    const dp = perceive(lead, 30);
    // the prey school drifts slowly round the basin
    this.schoolC.add(_v.set(Math.sin(this.t * 0.05), 0, Math.cos(this.t * 0.04)).multiplyScalar(0.4 * dt));
    let click = 3.5;
    switch (this.state) {
      case 'idle':
      case 'roam': {
        if (this.st > 30 || this.goal.lengthSq() === 0) {
          const a = Math.random() * TAU, d = Math.random() * B.basin.r * 0.5;
          this.goal.set(B.basin.x + Math.cos(a) * d, -25 - Math.random() * 20, B.basin.z + Math.sin(a) * d);
          this.st = 0;
        }
        this.spread = 7;
        this.speed = 1.4;
        if (dp !== null) this.setState('investigate');
        else if (this.cooldown <= 0 && this.schoolN > 8 && Math.random() < dt * 0.02) this.setState('hunt');
        if (tide >= 2) this.setState('regroup');
        break;
      }
      case 'investigate': {
        // a powered suit is not their prey: they look, click at it, and move on
        this.goal.copy(pl.pos).add(_v.set(10, 2, 0).applyAxisAngle(AX.y, this.t * 0.3));
        this.spread = 5;
        this.speed = 1.6;
        click = 0.6;
        if (eco.watching(lead.pos, 28, 0.5)) eco.note('chorus', 'sighting', 'Several long animals circled at a distance, clicking — the clicks came faster as they looked me over.');
        if (this.st > 18) {
          this.cooldown = 40;
          this.setState('roam');
          this.goal.set(B.basin.x - 80, -35, B.basin.z + 60);
        }
        if (tide >= 2) this.setState('regroup');
        break;
      }
      case 'hunt': {
        // flank the school, then one dives in and the others take what scatters
        this.goal.copy(this.schoolC);
        this.spread = this.st < 6 ? 9 : 2;
        this.speed = this.st < 6 ? 1.8 : 3.4;
        click = this.st < 6 ? 0.8 : 0.25;
        if (this.st > 6) {
          for (let i = 0; i < this.schoolP.length; i += 3) {
            if (this.schoolP[i + 1] < -500) continue;
            for (const m of this.members) {
              if (Math.hypot(this.schoolP[i] - m.pos.x, this.schoolP[i + 1] - m.pos.y, this.schoolP[i + 2] - m.pos.z) < 1.2 && Math.random() < 0.3) {
                this.schoolP[i + 1] = -1000;
                this.schoolN--;
              }
            }
          }
        }
        if (eco.watching(this.schoolC, 30, 0.6) && this.st > 6) eco.note('chorus', 'hunt', 'They spread round a school of small swimmers, the clicks became dense, then one dived in and the others followed.');
        if (this.st > 14) {
          this.cooldown = 120;
          this.setState('roam');
        }
        break;
      }
      case 'regroup': {
        // contact calls, tight together, down to the deep corridor
        this.goal.set(B.basin.x, -55, B.basin.z);
        this.spread = 2.5;
        this.speed = 2;
        click = 0.5;
        if (tide === 0 && this.st > 15) this.setState('roam');
        if (eco.watching(lead.pos, 28, 0.5) && tide >= 2) eco.note('chorus', 'tide', 'Before the crest their calls quickened and they drew together and went deep.');
        break;
      }
    }
    // clicks: each animal its own pattern; the pod's rhythm tells what it is doing
    this.clickT -= dt;
    if (this.clickT < 0) {
      this.clickT = click * (0.7 + Math.random() * 0.6);
      const m = this.members[Math.floor(Math.random() * this.members.length)];
      if (m.pos.distanceTo(pl.pos) < 90) this.f.voice.clicks(m.pos, 3 + (m.index % 3) * 2, 0.15);
    }
    // the school itself
    const sp = this.schoolP;
    for (let i = 0; i < sp.length; i += 3) {
      if (sp[i + 1] < -500) {
        if (Math.random() < dt * 0.01) {
          sp.set([this.schoolC.x, this.schoolC.y, this.schoolC.z], i);
          this.schoolN++;
        }
        continue;
      }
    }
    // schooling: tight round the centre, scattering from the hunters and from a diver
    const seen = this.schoolC.distanceTo(pl.pos) < 60;
    if (seen) {
      this.threats.length = 0;
      for (const m of this.members) this.threats.push(m.pos);
      this.threats.push(pl.pos);
      this.school.flock(dt, this.schoolC, 2.2, this.threats, this.state === 'hunt' ? 4 : 2.5, this.state === 'hunt' ? 2.6 : 1.2);
    }
    this.school.update(dt, seen);
  }

  dispose() {
    super.dispose();
    this.school.dispose();
  }
}

// ================================================================================================ Abyssal Cathedral
class Cathedral extends Swimmer {
  readonly species = 'cathedral';
  private goal = new THREE.Vector3();
  private bloom = new THREE.Vector3();
  private mouth = 0;
  private krill: PreySwarm;
  private krillP: Float32Array;
  private bloomPrev = new THREE.Vector3();
  private eaten = 0;

  constructor(f: FaunaManager, eco: Eco) {
    super(f, eco);
    this.view = 200;
    this.nearR = 140;
    this.clear = 0.5;
    // a plankton bloom: a dense swarm of krill it seeks out and filters
    this.bloom.set(B.basin.x - 40, -38, B.basin.z + 30);
    this.bloomPrev.copy(this.bloom);
    const N = f.count(420);
    this.krillP = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) this.krillP.set([this.bloom.x + (Math.random() - 0.5) * 30, this.bloom.y + (Math.random() - 0.5) * 10, this.bloom.z + (Math.random() - 0.5) * 30], i * 3);
    this.krill = new PreySwarm(f, 'fauna_prey_krill', this.krillP, 1, { amp: 0.15, freq: 22, len: 0.02 });
    this.krill.build().catch(() => undefined);
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player;
    const tide = eco.tideState(this.pos.x, this.pos.z);
    this.bloom.add(_v.set(Math.cos(this.t * 0.02), 0, Math.sin(this.t * 0.03)).multiplyScalar(0.3 * dt));
    // the swarm drifts with its bloom; krill inside the open mouth are filtered out, the bloom slowly refills
    const kp = this.krillP;
    _w.subVectors(this.bloom, this.bloomPrev);
    this.bloomPrev.copy(this.bloom);
    const seenK = this.bloom.distanceTo(pl.pos) < 90;
    if (seenK) {
      for (let i = 0; i < kp.length; i += 3) {
        if (kp[i + 1] < -500) {
          if (Math.random() < dt * 0.02) kp.set([this.bloom.x + (Math.random() - 0.5) * 30, this.bloom.y + (Math.random() - 0.5) * 10, this.bloom.z + (Math.random() - 0.5) * 30], i);
          continue;
        }
        kp[i] += _w.x;
        kp[i + 1] += _w.y;
        kp[i + 2] += _w.z;
      }
      this.krill.drift(dt, this.bloom, _u.set(15, 5, 15), 0.25);
      if (this.mouth > 0.4) {
        const mx = this.pos.x, my = this.pos.y, mz = this.pos.z;
        const f3 = this.fwd3(_u);
        const cx = mx + f3.x * 6 * this.size, cy = my + f3.y * 6 * this.size - 0.6 * this.size, cz = mz + f3.z * 6 * this.size;
        const r2 = (2.6 * this.size) ** 2;
        for (let i = 0; i < kp.length; i += 3) {
          const dx = kp[i] - cx, dy = kp[i + 1] - cy, dz = kp[i + 2] - cz;
          if (dx * dx + dy * dy + dz * dz < r2) {
            kp[i + 1] = -1000;
            this.eaten++;
          }
        }
        if (this.eaten > 25 && eco.watching(this.pos, 45, 0.6)) eco.note('cathedral', 'filtering', 'Where it passed the krill swarm thinned: whole clouds of them vanished into the open mouth.');
      }
    }
    this.krill.update(dt, seenK);
    let mouthT = 0;
    switch (this.state) {
      case 'idle':
      case 'cruise': {
        // wide, slow circuits; turning takes room
        if (this.st > 50 || this.goal.lengthSq() === 0) {
          const a = Math.random() * TAU, d = B.basin.r * (0.2 + 0.35 * Math.random());
          this.goal.set(B.basin.x + Math.cos(a) * d, -30 - Math.random() * 18, B.basin.z + Math.sin(a) * d);
          this.st = 0;
        }
        this.swimTo(this.bloom.distanceTo(this.pos) < 120 && Math.random() < 0.5 ? this.bloom : this.goal, 1.6, 0.12, dt, 0.2);
        if (this.bloom.distanceTo(this.pos) < 60) this.setState('feed');
        if (tide >= 2) this.setState('deep');
        break;
      }
      case 'feed': {
        // slow passes through the bloom, mouth open
        mouthT = 1;
        const a = this.t * 0.05;
        this.swimTo(_v.copy(this.bloom).add(_u.set(Math.cos(a) * 15, 0, Math.sin(a) * 15)), 1.1, 0.1, dt, 0.2);
        if (eco.watching(this.pos, 45, 0.6)) eco.note('cathedral', 'feeding', 'It passed slowly through the drifting plankton with its mouth wide, filter plates spread.');
        if (this.st > 60) this.setState('cruise');
        if (tide >= 2) this.setState('deep');
        break;
      }
      case 'deep': {
        // away from the shoals into the deep basin; at this size every turn is slow
        this.swimTo(_v.set(B.basin.x, -100, B.basin.z), 2, 0.1, dt, 0.25);
        if (tide === 0 && this.st > 30) this.setState('cruise');
        break;
      }
    }
    this.face(dt);
    this.mouth = damp(this.mouth, mouthT, 0.8, dt);
    // its wake: a diver too close is pushed and spun about (mass × speed, not malice)
    const dpl = pl.pos.distanceTo(this.pos);
    if (dpl < 9 * this.size && this.f.host.playerOnFoot() && this.cooldown <= 0) {
      this.cooldown = 5;
      _v.copy(this.vel).multiplyScalar(1.5);
      this.f.shove.add(_v);
      this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 0.6);
      eco.note('cathedral', 'wake', 'Its wake alone threw me sideways — a collision risk, not an attack.');
    }
    this.setGlow(2.2 + 1.2 * Math.sin(this.t * 0.4));
    if (near) {
      const r = this.rig;
      r.reset();
      const beat = Math.sin(this.swim * 0.25);
      r.roll('wingL1', 0.22 * beat);
      r.roll('wingR1', -0.22 * beat);
      r.roll('wingL2', 0.18 * Math.sin(this.swim * 0.25 - 0.8));
      r.roll('wingR2', -0.18 * Math.sin(this.swim * 0.25 - 0.8));
      r.rot('jaw', AX.x, 0.25 * this.mouth);
      for (let i = 1; i <= 3; i++) r.rot(`tail${i}`, AX.x, 0.06 * Math.sin(this.swim * 0.25 - i));
    }
    this.placeSw();
    if (eco.watching(this.pos, 50, 0.5)) eco.note('cathedral', 'sighting', 'A moving wall with faint glowing lines — then the whole animal: wings wider than the rift is deep.');
  }

  dispose() {
    super.dispose();
    this.krill.dispose();
  }
}

// a calf: keeps station under one of the adult's wings, beating faster to keep up
class CathedralCalf extends Swimmer {
  readonly species = 'cathedralcalf';
  mother!: Cathedral;
  private side = -1;

  constructor(f: FaunaManager, eco: Eco) {
    super(f, eco);
    this.view = 200;
    this.nearR = 120;
    this.clear = 0.5;
  }

  update(dt: number, near: boolean) {
    const m = this.mother;
    if (!m) return;
    // the station: under and behind a wing root, swapping sides now and then
    if (this.st > 90) {
      this.side = -this.side;
      this.st = 0;
    }
    _w.set(this.side * 6.5, -2.6, 5.5).multiplyScalar(m.size).applyQuaternion(m.q).add(m.pos);
    const d = this.pos.distanceTo(_w);
    this.swimTo(_w, clamp(m.vel.length() + d * 0.35, 0.4, 4), 0.6, dt, 1);
    this.face(dt);
    if (near) {
      const r = this.rig;
      r.reset();
      const beat = Math.sin(this.swim * 0.5);
      r.roll('wingL1', 0.3 * beat);
      r.roll('wingR1', -0.3 * beat);
      r.roll('wingL2', 0.22 * Math.sin(this.swim * 0.5 - 0.8));
      r.roll('wingR2', -0.22 * Math.sin(this.swim * 0.5 - 0.8));
      for (let i = 1; i <= 3; i++) r.rot(`tail${i}`, AX.x, 0.08 * Math.sin(this.swim * 0.5 - i));
    }
    this.placeSw();
    if (this.eco.watching(this.pos, 45, 0.5)) this.eco.note('cathedral', 'calf', 'A calf a fraction of its size kept station under the adult’s wing, beating twice as fast to keep up.');
  }
}

// ================================================================================================ Gargantuan Crown
class Crown extends Swimmer {
  readonly species = 'crown';
  private goal = new THREE.Vector3();
  private pressT = 0;
  private jaw = 0;
  private pulseT = 20;
  private strikeDir = new THREE.Vector3();

  constructor(f: FaunaManager, eco: Eco) {
    super(f, eco);
    this.view = 160;
    this.nearR = 110;
    this.clear = 1;
  }

  update(dt: number, near: boolean) {
    const eco = this.eco;
    const pl = this.game.player;
    const tide = eco.tideState(this.pos.x, this.pos.z);
    const dp = perceive(this, 24);
    let jawT = 0;
    const lamp = (this.game.zone as unknown as { headlampOn?: boolean }).headlampOn;
    // rare deep pulses: heard long before it is seen
    this.pulseT -= dt;
    if (this.pulseT < 0) {
      this.pulseT = 25 + Math.random() * 30;
      if (pl.pos.distanceTo(this.pos) < 260) this.f.voice.growl(this.pos, 2.5, 0.35);
    }
    switch (this.state) {
      case 'idle':
      case 'patrol': {
        // below the suit's reach most of the time; now and then rising along the basin wall
        if (this.st > 70 || this.goal.lengthSq() === 0) {
          const a = Math.random() * TAU, d = B.basin.r * (0.25 + 0.3 * Math.random());
          const rise = Math.random() < 0.35;
          this.goal.set(B.basin.x + Math.cos(a) * d, rise ? -42 - Math.random() * 10 : -85 - Math.random() * 40, B.basin.z + Math.sin(a) * d);
          this.st = 0;
        }
        this.swimTo(this.goal, 1.4, 0.15, dt, 0.25);
        this.face(dt);
        if (dp !== null && this.cooldown <= 0) this.setState('interest');
        if (tide >= 2) this.setState('deep');
        break;
      }
      case 'interest': {
        // a slow pass round the light, then usually away
        const a = this.t * 0.12;
        this.swimTo(_v.copy(pl.pos).add(_u.set(Math.cos(a) * 22, -6, Math.sin(a) * 22)), 1.8, 0.2, dt, 0.3);
        this.face(dt);
        if (eco.watching(this.pos, 40, 0.5)) eco.note('crown', 'sighting', 'A shadow too large crossed below. A head crowned with ridges turned toward the lamp — and went on.');
        // pressed: the diver closing in with the lamp on it
        this.pressT = dp !== null && dp < 15 && lamp ? this.pressT + dt : Math.max(0, this.pressT - dt * 0.5);
        if (this.pressT > 5 && this.f.hostility > 0) this.setState('display');
        if (this.st > 35) {
          this.cooldown = 200;
          this.setState('patrol');
        }
        if (tide >= 2) this.setState('deep');
        break;
      }
      case 'display': {
        // turn broadside, jaw open, ridges forward: a warning with time to back off
        jawT = 0.8;
        this.vel.multiplyScalar(Math.max(0, 1 - dt));
        this.pos.addScaledVector(this.vel, dt);
        _v.subVectors(pl.pos, this.pos);
        this.yaw = damp(this.yaw, Math.atan2(-_v.x, -_v.z), 1.5, dt);
        this.q.setFromEuler(_e.set(0, this.yaw, 0.15 * Math.sin(this.t), 'YXZ'));
        if (this.st < dt * 1.5) this.f.voice.growl(this.pos, 3, 0.6);
        if (eco.watching(this.pos, 30, 0.6)) eco.note('crown', 'display', 'It stopped, opened its jaws and turned its crown toward me. I backed away.');
        if (this.st > 4) {
          if (dp !== null && dp < 13 && this.f.hostility > 0) {
            this.strikeDir.subVectors(pl.pos, this.pos).normalize();
            this.setState('burst');
          } else {
            this.cooldown = 200;
            this.setState('patrol');
          }
        }
        break;
      }
      case 'burst': {
        // a short, heavy acceleration with a wide turning circle
        jawT = 1;
        this.vel.addScaledVector(this.strikeDir, dt * 20).clampLength(0, 9);
        this.pos.addScaledVector(this.vel, dt);
        if (this.cooldown <= 0 && pl.pos.distanceTo(this.pos) < 2.5 * this.size + 0.8 && this.f.host.playerOnFoot()) {
          this.cooldown = 200;
          _v.copy(this.strikeDir).multiplyScalar(9);
          this.f.hurtPlayer(0.35, { cause: 'the Gargantuan Crown', knock: _v, shake: 1, crack: [0.5, 0.5] });
          eco.note('crown', 'strike', 'Pressed with the lamp, it struck — one heavy burst, then it turned away into the deep.');
        }
        if (this.st > 1.6) {
          this.cooldown = Math.max(this.cooldown, 200);
          this.setState('deep');
        }
        break;
      }
      case 'deep': {
        this.swimTo(_v.set(B.basin.x, -125, B.basin.z), 1.8, 0.15, dt, 0.3);
        this.face(dt);
        if (tide === 0 && this.st > 40) this.setState('patrol');
        break;
      }
    }
    this.jaw = damp(this.jaw, jawT, 4, dt);
    if (near) {
      const r = this.rig;
      r.reset();
      this.undulate('sp', 6, this.state === 'burst' ? 0.18 : 0.09);
      r.rot('jaw', AX.x, 0.45 * this.jaw);
      for (const s of ['L', 'R']) r.rot(`fin${s}`, AX.z, (s === 'L' ? 1 : -1) * 0.12 * Math.sin(this.swim * 0.4));
    }
    this.placeSw();
  }
}

// ================================================================================================ population
export const DEEP_SPECIES: Record<string, { name: string; latin: string; size: string; habitat: string; diet: string; senses: string; tide: string; threat: string }> = {
  breaker: {
    name: 'Breaker Shield', latin: 'Thalassotitan loricatus', size: '2–4 m (game estimate)', habitat: 'Sheltered rocky flats in the lee of the reef; nesting crevices',
    diet: 'Grazes biofilms, sessile animals, carrion', senses: 'Flow and vibration, chemical fringe at the mouth, small protected eyes',
    tide: 'Presses flat over its nest in the reef’s lee', threat: 'Shoves or rams if crowded at its nest; it cannot leap',
  },
  architect: {
    name: 'Rift Architect', latin: 'Lithoarchitectus profundus', size: '0.8–1.8 m (game estimate)', habitat: 'Mineral-rich ledges by the rift’s vents',
    diet: 'Small benthic animals, microbial mats, scavenged organics (not rock)', senses: 'Eight small eyes, tactile/chemical tendrils, manipulator tips',
    tide: 'Shelters over its eggs; repairs the knocked-down wall after the crest', threat: 'Swipes only to defend its eggs',
  },
  siren: {
    name: 'Luminous Siren', latin: 'Photomimus tenebris', size: '0.6–1.5 m (game estimate)', habitat: 'Dark rock walls and overhangs of the rift',
    diet: 'Small phototactic animals drawn to its lure', senses: 'Low-light eyes, flow sensors in head and fins',
    tide: 'Dims the lure and presses into the wall', threat: 'Harmless at a distance; a defensive nip if handled',
  },
  abyssstalker: {
    name: 'Abyssal Stalker', latin: 'Tenebrovenator milleri', size: '5–8 m (game estimate)', habitat: 'Basin rim ledges and canyon constrictions',
    diet: 'Medium swimmers, juveniles of larger species, carrion', senses: 'Water-movement first, then sight, smell, short-range electric sense',
    tide: 'Withdraws from its ledge into the deep basin', threat: 'One telegraphed burst strike if crowded at its ledge',
  },
  chorus: {
    name: 'Chorus Hunters', latin: 'Sociovenator resonans', size: '2–3.5 m, pods of 3–8 (game estimate)', habitat: 'The basin’s open water and channels',
    diet: 'Schools of small swimmers, hunted together', senses: 'Click echolocation, contact calls, small eyes',
    tide: 'Calls quicken; the pod tightens and goes deep', threat: 'Investigate divers and move on',
  },
  cathedral: {
    name: 'Abyssal Cathedral', latin: 'Pelagocrypta colossalis', size: '12–18 m (game estimate)', habitat: 'Open basin with plankton blooms',
    diet: 'Plankton and small drifting animals, filtered', senses: 'Flow, low light; faint luminous lines for others of its kind',
    tide: 'Leaves the shoals for the deep basin, slowly', threat: 'Not predatory: collision and wake only',
  },
  crown: {
    name: 'Gargantuan Crown', latin: 'Apexvenator gargantuae', size: '8–11 m (game estimate)', habitat: 'The deep basin, mostly below suit depth; rare',
    diet: 'Large swimmers, opportunistically; carrion', senses: 'Flow, smell, low acoustic pulses; small sheltered eyes',
    tide: 'Abandons a hunt and goes deep', threat: 'Display first; a heavy burst only if pressed',
  },
};

export async function populateMillerDeep(f: FaunaManager, eco: Eco) {
  const host = f.host;
  const R = rnd(9191);
  const jobs: Promise<unknown>[] = [];
  const floor = (x: number, z: number) => host.terrainY(x, z);
  // Breaker Shield: a nest in the reef's lee (west), on a wet shelf
  const bs = new BreakerShield(f, eco);
  bs.nest.set(B.reef.x - 40, 0, B.reef.z - 18);
  bs.nest.y = floor(bs.nest.x, bs.nest.z);
  bs.pos.copy(bs.nest).add(new THREE.Vector3(2, 0, 1));
  bs.pos.y = floor(bs.pos.x, bs.pos.z);
  bs.size = 0.9 + R() * 0.2;
  bs.setState('browse');
  jobs.push(f.add(bs, 'fauna_breaker').then(() => bs.buildNest()));
  for (let i = 0; i < f.count(3); i++) {
    const h = new BreakerHatchling(f, eco, i);
    h.parent = bs;
    h.pos.set(bs.nest.x + Math.cos(i * 2.1) * 1.2, 0, bs.nest.z + Math.sin(i * 2.1) * 1.2);
    h.pos.y = floor(h.pos.x, h.pos.z);
    h.setState('wander');
    jobs.push(f.add(h, 'fauna_breaker_juv'));
  }
  // Rift Architect by the vents
  const ra = new RiftArchitect(f, eco);
  ra.den.set(B.vents[0][0] + 6, 0, B.vents[0][1] - 4);
  ra.den.y = floor(ra.den.x, ra.den.z);
  ra.pos.copy(ra.den).add(new THREE.Vector3(1.5, 0, 0.5));
  ra.pos.y = floor(ra.pos.x, ra.pos.z);
  ra.setState('build');
  jobs.push(f.add(ra, 'fauna_architect').then(() => ra.buildSite()));
  // Luminous Sirens by the rift walls
  for (let i = 0; i < 2; i++) {
    const s = new LuminousSiren(f, eco);
    const sp = millerSpots().siren[i];
    s.perch.set(sp.at[0], 0, sp.at[1]);
    s.perch.y = floor(s.perch.x, s.perch.z) + 2.2;
    s.pos.copy(s.perch);
    s.size = 0.9 + R() * 0.4;
    s.setState('hover');
    jobs.push(f.add(s, 'fauna_siren', ['siren_lure']));
  }
  // Abyssal Stalkers: on the basin's rim ledges near the rift's mouth
  for (let i = 0; i < 2; i++) {
    const s = new AbyssalStalker(f, eco);
    const sp = millerSpots().stalker[i];
    s.ledge.set(sp.at[0], 0, sp.at[1]);
    s.ledge.y = floor(s.ledge.x, s.ledge.z) + 2.5;
    s.pos.copy(s.ledge);
    s.size = i ? 0.62 : 1; // a young one: its own build (shorter snout, bigger eyes, finer teeth)
    s.setState('ambush');
    jobs.push(f.add(s, i ? 'fauna_abyssstalker_juv' : 'fauna_abyssstalker'));
  }
  // a Chorus Hunter pod
  const pod = new ChorusPod(f, eco);
  f.creatures.push(pod);
  const n = f.count(5);
  for (let i = 0; i < n; i++) {
    const c = new ChorusHunter(f, eco);
    c.pod = pod;
    c.index = i;
    c.juvenile = i === n - 1;
    c.size = c.juvenile ? 0.65 : 0.9 + R() * 0.2;
    c.pos.set(B.basin.x + 30 + i * 4, -30 - R() * 6, B.basin.z - 20 + i * 3);
    pod.members.push(c);
    jobs.push(f.add(c, c.juvenile ? 'fauna_chorus_juv' : 'fauna_chorus'));
  }
  pod.setState('roam');
  // the Cathedral
  const cat = new Cathedral(f, eco);
  cat.pos.set(B.basin.x - 60, -40, B.basin.z + 20);
  cat.size = 0.9 + R() * 0.2;
  cat.setState('cruise');
  jobs.push(f.add(cat, 'fauna_cathedral', ['cath_glow']));
  const calf = new CathedralCalf(f, eco);
  calf.mother = cat;
  calf.size = 0.32;
  calf.pos.copy(cat.pos).add(new THREE.Vector3(-6, -3, 6));
  calf.setState('follow');
  jobs.push(f.add(calf, 'fauna_cathedral_calf', ['cath_glow']));
  // the Crown: one, deep
  const cr = new Crown(f, eco);
  cr.pos.set(B.basin.x + 40, -110, B.basin.z + 40);
  cr.size = 0.95;
  cr.setState('patrol');
  jobs.push(f.add(cr, 'fauna_crown'));
  await Promise.all(jobs);
}
