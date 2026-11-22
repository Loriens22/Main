import * as THREE from 'three';
import { Rig } from './Rig';
import type { SpeciesDef } from './species';
import type { Model } from '../render/Assets';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(),
  _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _ROCK = new THREE.Color(0.075, 0.08, 0.085), _WARN = new THREE.Color(0.95, 0.55, 0.18);

/** something a creature may sense: the player, a vehicle, another creature, a prey school */
export interface Contact {
  id: string;
  kind: 'player' | 'sub' | 'creature' | 'prey' | 'object';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** body length (m) */
  size: number;
  /** emitted light (0..1: lamps) and noise (0..1: thrusters, footsteps) */
  light: number;
  noise: number;
  ref?: any;
  species?: string;
}

/** what the world tells its creatures: the physical environment and the things in it */
export interface Habitat {
  time: number;
  /** ground or sea floor height */
  floor(x: number, z: number): number;
  /** water surface height (null where there is no water) */
  surface(x: number, z: number): number | null;
  /** distance to the first solid thing along a ray (null: none within max) */
  ray(o: THREE.Vector3, d: THREE.Vector3, max: number): number | null;
  /** ambient light 0..1 at a point (sunlight through water, cave darkness) */
  light(p: THREE.Vector3): number;
  /** water or air current at a point (m/s) */
  current(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  /** tidal / weather hazard state 0..4 and what a creature can sense of its precursors here (0..1) */
  hazard(p: THREE.Vector3): { state: number; cue: number };
  /** a refuge for this kind of animal near p */
  refuge(c: Creature): THREE.Vector3 | null;
  contacts(): Contact[];
  /** a creature made physical contact: apply harm to the target (the world decides what that means) */
  strike(c: Creature, target: Contact, severity: number): void;
  /** a creature fed (prey taken from a school, a plankton patch filtered): energy gained */
  feed(c: Creature, target: Contact | null): number;
  /** a notable behaviour seen by the player (codex observations) */
  observe(c: Creature, what: string): void;
  /** builders: the state of this animal's nest (stones laid of the wall it wants) and where it gathers stones */
  nest?(c: Creature): { stones: number; max: number; pile: THREE.Vector3 } | null;
  placeStone?(c: Creature): void;
  /** social species: the live members of this animal's group */
  group?(c: Creature): Creature[];
  /** food patches for filter feeders (plankton blooms) */
  bloom?(c: Creature): THREE.Vector3 | null;
}

export type CState = 'idle' | 'forage' | 'patrol' | 'investigate' | 'stalk' | 'warn' | 'attack' | 'recover' | 'flee' | 'shelter' | 'rest' | 'feed' | 'nest' | 'hide' | 'display';

/** stable per-individual random numbers */
export function hashRand(id: string, k: number) {
  let h = 2166136261 ^ k;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

interface Foot { prefix: string; rest: THREE.Vector3; at: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; t: number; group: number }

/**
 * One animal. Decisions come from what it senses (ranges, light, line of sight) and what it needs (energy, stress,
 * fatigue, injury, nest), never from knowing where the player is. Movement is limited by its own acceleration, turn
 * rate and the medium; the rig is posed from the movement (a tail beat that follows speed, a body that bends into
 * turns, feet that plant on the ground).
 */
export class Creature {
  root = new THREE.Group();
  rig: Rig;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  /** heading: forward unit vector (the model's -Z) */
  fwd = new THREE.Vector3(0, 0, -1);
  up = new THREE.Vector3(0, 1, 0);
  scale = 1;
  length: number;
  state: CState = 'idle';
  stateT = 0;
  /** needs 0..1 */
  energy: number; stress = 0; fatigue = 0; injury = 0;
  /** temperament: 0 timid .. 1 bold */
  bold: number;
  home = new THREE.Vector3();
  den: THREE.Vector3 | null = null;
  /** what it remembers: contacts by id -> valence (-1 threat .. +1 interesting), and when last sensed */
  memory = new Map<string, { val: number; t: number; pos: THREE.Vector3 }>();
  failures = 0;
  target: Contact | null = null;
  goal = new THREE.Vector3();
  speedWant = 0;
  phase = 0;
  jaw = 0;
  /** buried / hidden (burrowers, camouflage), 0..1 */
  hidden = 0;
  /** chromatic display (camouflage 0 .. warning 1), for species that change colour */
  display = 0;
  private decideT = 0;
  private feet: Foot[] = [];
  private turnRate = 0;
  private lastYaw = 0;
  /** sensed contacts this decision cycle */
  sensed: { c: Contact; d: number; conf: number }[] = [];
  /** debugging / codex: what it is doing in words */
  doing = '';
  /** group membership (social species) */
  groupId = '';
  /** carrying a stone (builders) */
  carrying = false;
  /** seen by the player just now (set by the world) and when it was last seen (s) */
  seenT = -1e9;
  /** visual depth of burial (smoothed from `hidden`, burrowers) */
  private bury = 0;
  /** per-individual materials for colour change and light organs */
  private skins: { m: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color; ei: number; lure: boolean }[] = [];

  constructor(public id: string, public def: SpeciesDef, public model: Model, size: number) {
    this.scale = size / def.built;
    this.length = size;
    this.root.add(model.root);
    this.root.scale.setScalar(this.scale);
    this.root.name = `creature:${id}`;
    this.rig = new Rig(model.root);
    // animals that change colour (camouflage, warning) or carry a light organ get their own copies of their materials
    if (def.archetype === 'clever' || def.archetype === 'lure') {
      const done = new Map<THREE.Material, THREE.Material>();
      model.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const one = (m: THREE.Material) => {
          let c = done.get(m);
          if (!c) {
            c = m.clone();
            // keep the shared shader patch (clone does not carry onBeforeCompile)
            c.onBeforeCompile = m.onBeforeCompile;
            c.customProgramCacheKey = m.customProgramCacheKey;
            done.set(m, c);
            const sm = c as THREE.MeshStandardMaterial;
            const lure = /lure/.test(m.name);
            if (sm.color && (def.archetype === 'clever' || lure)) this.skins.push({ m: sm, color: sm.color.clone(), emissive: sm.emissive?.clone() ?? new THREE.Color(), ei: sm.emissiveIntensity ?? 1, lure });
          }
          return c;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(one) : one(mesh.material);
      });
    }
    this.energy = 0.55 + 0.35 * hashRand(id, 1);
    this.bold = hashRand(id, 2);
    this.phase = hashRand(id, 3) * 10;
    // feet: rest positions of every leg chain's tip, in the body frame
    const legs = def.motion.legs;
    if (legs) {
      model.root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(model.root.matrixWorld).invert();
      for (const [prefix, chain] of this.rig.chainsLike(legs.prefix)) {
        const tip = this.rig.bones.get(prefix + 'e')?.bone ?? chain[chain.length - 1].bone;
        const rest = tip.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        const m = /(\d+)_$/.exec(prefix);
        const idx = m ? Number(m[1]) : 0;
        const left = prefix.includes('L');
        const group = legs.gait === 'tripod' ? ((idx + (left ? 1 : 0)) % 2) : (idx * 2 + (left ? 1 : 0)) % 4;
        this.feet.push({ prefix, rest, at: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, group });
      }
    }
  }

  get speed() { return this.vel.length(); }

  place(p: THREE.Vector3, heading: number, H: Habitat) {
    this.pos.copy(p);
    this.home.copy(p);
    this.fwd.set(-Math.sin(heading), 0, -Math.cos(heading));
    this.vel.set(0, 0, 0);
    this.syncRoot(H, 1);
    for (const f of this.feet) { this.footWorld(f.rest, f.at); f.at.y = H.floor(f.at.x, f.at.z); f.from.copy(f.at); f.to.copy(f.at); f.t = 1; }
  }

  private footWorld(local: THREE.Vector3, out: THREE.Vector3) { return out.copy(local).multiplyScalar(this.scale).applyQuaternion(this.root.quaternion).add(this.root.position); }

  // ============================================================================================ senses
  /** what it can sense now: each contact within a sense's range and conditions, with a confidence */
  perceive(H: Habitat) {
    const s = this.def.senses;
    const k = Math.max(0.4, Math.sqrt(this.scale));
    const lightHere = H.light(this.pos);
    this.sensed.length = 0;
    for (const c of H.contacts()) {
      if (c.ref === this) continue;
      const d = c.pos.distanceTo(this.pos);
      let conf = 0;
      const moving = c.vel.length();
      if (s.touch && d < s.touch * k + c.size * 0.5) conf = Math.max(conf, 1);
      if (s.flow && d < s.flow * k && moving > 0.15) conf = Math.max(conf, 0.9 * (1 - d / (s.flow * k)) + 0.1);
      if (s.electric && d < s.electric * k) conf = Math.max(conf, 0.8);
      if (s.sound && d < s.sound * (0.2 + c.noise)) conf = Math.max(conf, 0.6 * (1 - d / (s.sound * (0.2 + c.noise))));
      if (s.chem && d < s.chem) conf = Math.max(conf, 0.25);
      if (s.thermal && d < s.thermal && c.kind !== 'prey') conf = Math.max(conf, 0.5);
      if (s.vision) {
        // seeing needs light: ambient where the target is, or its own lamps (which also make it conspicuous)
        const lit = Math.max(H.light(c.pos), lightHere * 0.5, c.light);
        const range = s.vision * k * lit + c.size * 2 * lit;
        if (d < range) {
          _v.copy(c.pos).sub(this.pos);
          const dist = _v.length();
          _v.divideScalar(Math.max(1e-6, dist));
          const blocked = H.ray(this.pos, _v, dist - c.size * 0.5);
          if (blocked === null) conf = Math.max(conf, 0.95 * (1 - d / range) + 0.05);
        }
      }
      if (conf > 0.05) this.sensed.push({ c, d, conf });
      if (conf > 0.3 && c.kind !== 'prey') {
        const m = this.memory.get(c.id);
        if (m) { m.t = H.time; m.pos.copy(c.pos); } else this.memory.set(c.id, { val: 0, t: H.time, pos: c.pos.clone() });
      }
    }
    this.sensed.sort((a, b) => a.d - b.d);
  }

  /** remember an encounter as good or bad: future reactions to that contact shift */
  learn(id: string, delta: number, H: Habitat) {
    const m = this.memory.get(id) ?? { val: 0, t: H.time, pos: this.pos.clone() };
    m.val = Math.max(-1, Math.min(1, m.val + delta));
    this.memory.set(id, m);
  }

  setState(s: CState, doing: string) {
    if (this.state !== s) { this.state = s; this.stateT = 0; }
    this.doing = doing;
  }

  // ============================================================================================ update
  /** brain(H) decides; this integrates movement and poses the rig */
  update(dt: number, H: Habitat, brain: (c: Creature, H: Habitat) => void, full: boolean) {
    this.stateT += dt;
    this.decideT -= dt;
    // metabolism: activity costs energy, rest restores the body
    const effort = Math.min(1, this.speed / Math.max(0.01, this.def.speed.burst));
    this.energy = Math.max(0, this.energy - dt * (0.0006 + effort * effort * 0.004));
    this.fatigue = Math.max(0, Math.min(1, this.fatigue + dt * (effort > 0.6 ? 0.08 : -0.02)));
    this.stress = Math.max(0, this.stress - dt * 0.02);
    this.injury = Math.max(0, this.injury - dt * 0.0005);
    if (this.decideT <= 0) {
      this.decideT = full ? 0.25 : 1.0;
      if (full) this.perceive(H); else this.sensed.length = 0;
      brain(this, H);
    }
    this.move(dt, H);
    this.syncRoot(H, dt);
    if (full) this.animate(dt, H);
  }

  // ============================================================================================ movement
  private move(dt: number, H: Habitat) {
    const d = this.def, sp = d.speed;
    const medium = d.medium;
    if (medium === 'sessile') { this.vel.set(0, 0, 0); return; }
    const want = Math.min(this.speedWant, sp.burst * (1 - this.fatigue * 0.5) * (1 - this.injury * 0.5));
    // steering toward the goal, turn rate limited (larger animals turn wider; burst speed tightens nothing)
    _v.copy(this.goal).sub(this.pos);
    if (medium === 'ground') _v.y = 0;
    const dist = _v.length();
    if (dist > 1e-3) _v.divideScalar(dist); else _v.copy(this.fwd);
    // obstacle avoidance: feel ahead along the heading
    if (medium === 'water' || medium === 'air') {
      const look = Math.max(this.length * 1.5, this.speed * 2.5);
      const hit = H.ray(this.pos, this.fwd, look);
      if (hit !== null) {
        // steer up and to the side the goal lies on
        _u.crossVectors(this.fwd, UP).normalize();
        const side = _u.dot(_v) >= 0 ? 1 : -1;
        _v.addScaledVector(_u, side * 1.5 * (1 - hit / look)).addScaledVector(UP, 0.6 * (1 - hit / look)).normalize();
      }
    }
    const turn = sp.turn * (medium === 'ground' ? 1.5 : 0.6 + 0.6 * Math.min(1, this.speed / Math.max(0.1, sp.cruise)));
    const ang = this.fwd.angleTo(_v);
    if (ang > 1e-4) {
      const k = Math.min(1, (turn * dt) / ang);
      this.fwd.lerp(_v, k).normalize();
    }
    if (medium === 'ground') { this.fwd.y = 0; this.fwd.normalize(); }
    // speed along the heading: accelerate / brake toward `want`, slowing for the final approach
    const stopping = Math.min(1, dist / Math.max(0.3, this.length * 0.6));
    const target = want * (this.state === 'attack' ? 1 : stopping) * Math.max(0.2, Math.cos(Math.min(ang, Math.PI / 2)));
    const along = this.vel.dot(this.fwd);
    const acc = sp.accel * (target > along ? 1 : 1.6);
    const nv = along + Math.max(-acc * dt, Math.min(acc * dt, target - along));
    // water and air: the body carries momentum sideways only briefly (drag); currents move it
    if (medium === 'water' || medium === 'air') {
      H.current(this.pos, _w);
      this.vel.copy(this.fwd).multiplyScalar(nv).addScaledVector(_w, Math.min(1, 0.5 + 0.5 * (1 - this.length / 20)));
    } else this.vel.copy(this.fwd).multiplyScalar(nv);
    this.pos.addScaledVector(this.vel, dt);
    // stay within the medium: off the floor, below the surface, clear of a hull's own height
    const floor = H.floor(this.pos.x, this.pos.z);
    if (medium === 'water') {
      const surf = H.surface(this.pos.x, this.pos.z);
      const clear = this.length * 0.12 + 0.05;
      const lo = floor + clear, hi = (surf ?? 1e9) - clear;
      if (hi < lo) { this.pos.y = (lo + hi) / 2; }
      else this.pos.y = Math.max(lo, Math.min(hi, this.pos.y));
      if (this.pos.y <= lo + 1e-3 && this.fwd.y < 0) this.fwd.y *= 0.5;
    } else if (medium === 'ground') {
      this.pos.y = floor;
    } else if (medium === 'air' && d.habitat.alt) {
      // a flyer's survivable corridor: it cannot climb above or sink below it
      const [lo, hi] = d.habitat.alt;
      this.pos.y = Math.max(lo, Math.min(hi, this.pos.y));
      if ((this.pos.y <= lo + 1e-3 && this.fwd.y < 0) || (this.pos.y >= hi - 1e-3 && this.fwd.y > 0)) this.fwd.y *= 0.5;
    }
    // the rate of turning feeds the body bend
    const yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    let dy = yaw - this.lastYaw;
    if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
    this.turnRate += (dy / Math.max(dt, 1e-4) - this.turnRate) * Math.min(1, dt * 4);
    this.lastYaw = yaw;
  }

  /** orientation from heading (and, on the ground, the floor's slope under the body) */
  private syncRoot(H: Habitat, dt: number) {
    if (this.def.medium === 'ground' || this.def.medium === 'sessile') {
      const L = this.length * 0.5;
      const x = this.pos.x, z = this.pos.z;
      _f.copy(this.fwd).setY(0).normalize();
      _r.crossVectors(_f, UP).normalize();
      const hf = H.floor(x + _f.x * L, z + _f.z * L), hb = H.floor(x - _f.x * L, z - _f.z * L);
      const hr = H.floor(x + _r.x * L * 0.6, z + _r.z * L * 0.6), hl = H.floor(x - _r.x * L * 0.6, z - _r.z * L * 0.6);
      _n.set(0, 1, 0);
      const fvec = _f.clone().multiplyScalar(2 * L).setY(hf - hb);
      const rvec = _r.clone().multiplyScalar(1.2 * L).setY(hr - hl);
      _n.crossVectors(rvec, fvec).normalize();
      if (_n.y < 0) _n.negate();
      this.up.lerp(_n, Math.min(1, dt * 6)).normalize();
    } else {
      this.up.lerp(UP, Math.min(1, dt * 2)).normalize();
      // bank into turns
      _r.crossVectors(this.fwd, UP).normalize();
      this.up.addScaledVector(_r, -this.turnRate * 0.25 * Math.min(1, this.speed / 2)).normalize();
    }
    _f.copy(this.fwd);
    _r.crossVectors(_f, this.up).normalize();
    _u.crossVectors(_r, _f).normalize();
    _m.makeBasis(_r, _u, _w.copy(_f).negate());
    _q.setFromRotationMatrix(_m);
    this.root.quaternion.copy(_q);
    this.root.position.copy(this.pos);
    if (this.def.locomotion === 'burrow') {
      // buried to the mouth rim; out of the sediment in a strike
      const want = this.state === 'attack' ? 0 : this.hidden;
      this.bury += (want - this.bury) * Math.min(1, dt * (want < this.bury ? 9 : 0.8));
      this.root.position.addScaledVector(this.up, -this.bury * this.length * 0.16);
    }
  }

  // ============================================================================================ animation
  private animate(dt: number, H: Habitat) {
    const m = this.def.motion, rig = this.rig;
    rig.reset();
    const spd = this.speed;
    const rel = Math.min(1.5, spd / Math.max(0.05, this.def.speed.cruise));
    // tail beat frequency rises with speed (a body wave travelling faster than the animal moves)
    if (m.wave) {
      const f = m.wave.freq * (0.35 + 0.9 * rel);
      this.phase += dt * f * Math.PI * 2;
      const amp = m.wave.amp * (0.3 + 0.7 * Math.min(1, rel)) * (this.state === 'rest' || this.state === 'hide' ? 0.35 : 1);
      rig.wave(this.phase, amp, { axis: m.wave.axis, waves: m.wave.waves, tail: m.wave.tail, curve: -this.turnRate * 1.2, headFix: m.wave.headFix });
    } else this.phase += dt * 2;
    if (m.fins) for (const fn of m.fins) {
      const ph = this.phase * (fn.freq / Math.max(0.05, m.wave?.freq ?? fn.freq)) + (fn.ph0 ?? 0);
      const amp = fn.amp * (fn.scull ? 0.4 + 0.6 * Math.min(1, rel) : 1);
      rig.flap(fn.l, ph, amp, fn.axis, { lag: fn.lag, bias: fn.bias });
      rig.flap(fn.r, ph, amp, fn.axis, { lag: fn.lag, bias: fn.bias, mirror: true });
      // pectoral braking/turning: fins tilt opposite to the turn
      if (fn.scull) { rig.turn(rig.chains.get(fn.l)?.[0], 'right', this.turnRate * 0.3); rig.turn(rig.chains.get(fn.r)?.[0], 'right', -this.turnRate * 0.3); }
    }
    if (m.chains) for (const ch of m.chains) {
      for (const [prefix] of rig.chainsLike(ch.prefix)) {
        const seed = prefix.length * 1.7 + prefix.charCodeAt(prefix.length - 2);
        rig.curl(prefix, ch.bend + (ch.jaw ?? 0) * this.jaw + (ch.disp ?? 0) * this.display, this.phase * ch.freq + seed, ch.wave, ch.axis ?? 'right', 0.8, 'up', ch.side ?? 0);
      }
    }
    if (m.jaw) {
      const want = this.state === 'attack' || this.state === 'feed' ? m.jaw.open : this.state === 'warn' || this.state === 'display' ? m.jaw.open * 0.6 : m.jaw.idle * (1 + 0.5 * Math.sin(this.phase * 0.3));
      this.jaw += (want - this.jaw) * Math.min(1, dt * (want > this.jaw ? 10 : 3));
      rig.openJaw(this.jaw);
    }
    if (m.legs) this.walk(dt, H, m.legs);
    // curled up: the legs drawn in under the body
    if (m.tuck && this.hidden > 0.05) for (const [prefix] of rig.chainsLike(m.legs?.prefix ?? 'leg')) rig.curl(prefix, m.tuck * this.hidden, 0, 0, 'right', 0.8, 'up', 0);
    // membranes opening and closing (display), breathing slowly
    if (m.swell) {
      const k = 1 + m.swell.amp * (this.display - 0.5) + 0.03 * Math.sin(H.time * m.swell.freq * Math.PI * 2 + this.phase);
      for (const [, chain] of rig.chainsLike(m.swell.prefix)) chain[0].bone.scale.setScalar(k);
    }
    if (this.skins.length) this.skin(H);
  }

  /** colour change (camouflage toward the rock, a rippling high-contrast warning) and the light organ's glow */
  private skin(H: Habitat) {
    const camo = this.hidden, warn = this.display;
    for (const s of this.skins) {
      if (s.lure) {
        s.m.emissiveIntensity = s.ei * (0.04 + 0.96 * warn) * (0.85 + 0.15 * Math.sin(H.time * 1.7 + this.phase));
        continue;
      }
      s.m.color.copy(s.color).lerp(_ROCK, camo * 0.75);
      const ripple = 0.5 + 0.5 * Math.sin(H.time * 7 + this.phase * 3);
      s.m.emissive.copy(s.emissive).lerp(_WARN, warn * 0.8);
      s.m.emissiveIntensity = s.ei + warn * 0.9 * ripple;
    }
  }

  /** feet: plant, and step when the body has moved on; small animals swing legs without full IK */
  private walk(dt: number, H: Habitat, L: NonNullable<SpeciesDef['motion']['legs']>) {
    const rig = this.rig;
    const spd = this.speed;
    const cyc = (L.hz * Math.min(1.5, spd / Math.max(0.01, this.def.speed.cruise)) + 0.05) * dt;
    if (this.length < 0.5) {
      // grazers: a metachronal ripple of leg swings, its rate following speed
      this.phase += cyc * Math.PI * 2;
      for (const f of this.feet) {
        const side = f.prefix.includes('L') ? 1 : -1;
        const ph = this.phase - f.group * 1.5 - Number(/(\d+)_$/.exec(f.prefix)?.[1] ?? 0) * 0.7;
        const c = rig.chains.get(f.prefix);
        if (!c) continue;
        const k = Math.min(1, spd / Math.max(0.005, this.def.speed.cruise));
        rig.turn(c[0], 'up', 0.35 * k * Math.sin(ph) * side);
        rig.turn(c[0], 'fwd', 0.25 * k * Math.max(0, Math.cos(ph)) * side);
      }
      return;
    }
    this.root.updateMatrixWorld(true);
    const stride = L.stride * this.scale;
    const ngroups = L.gait === 'tripod' ? 2 : 4;
    const active = Math.floor((H.time * L.hz * Math.max(0.3, Math.min(1.5, spd / Math.max(0.01, this.def.speed.cruise)))) % ngroups);
    for (const f of this.feet) {
      // where the foot would rest, a little ahead in the direction of travel
      this.footWorld(f.rest, _v);
      _v.addScaledVector(this.vel, stride / Math.max(0.05, spd + 0.05) * 0.35);
      _v.y = H.floor(_v.x, _v.z);
      if (f.t >= 1) {
        if (f.group === active && f.at.distanceTo(_v) > stride * 0.5) { f.from.copy(f.at); f.to.copy(_v); f.t = 0; }
      } else {
        f.to.lerp(_v, 0.2);
        f.t = Math.min(1, f.t + dt * L.hz * ngroups * 0.9);
        const e = f.t * f.t * (3 - 2 * f.t);
        f.at.lerpVectors(f.from, f.to, e);
        f.at.y += Math.sin(Math.PI * f.t) * L.lift * this.scale;
      }
      if (f.at.distanceTo(_v) > stride * 3) { f.at.copy(_v); f.from.copy(_v); f.to.copy(_v); f.t = 1; }
      rig.reach(f.prefix, f.at, 3);
    }
  }

  dispose() { this.root.removeFromParent(); }
}
