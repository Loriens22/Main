import * as THREE from 'three';
import type { Game } from '../core/Game';
import { bus } from '../core/events';
import { clamp, damp } from '../core/math';
import { assets, Model } from '../render/Assets';
import { GROUP, groups, PhysicsWorld, RAPIER } from '../physics/Physics';
import type { Interactable } from '../player/Interaction';
import { ui } from '../ui/store';
import { Appearance, Humanoid, PoseName } from './Humanoid';
import type { NavGraph } from './Nav';
import type { BT } from './bt';
import type { DialogueDef } from './Dialogue';

export type Emotion = 'calm' | 'tired' | 'worried' | 'afraid' | 'hopeful' | 'grieving' | 'angry' | 'focused' | 'relieved' | 'deceptive';

/** Everything about a character that persists across saves and zone changes. */
export interface NPCState {
  location: string;
  task: string;
  destination: string;
  health: number;
  emotion: Emotion;
  role: string;
  knowledge: string[];
  /** -100..100 standing with the player */
  relationship: number;
  access: string[];
  conversation: string | null;
  equipment: string[];
  /** dialogue memory: how many times each topic/line family has been delivered */
  said: Record<string, number>;
  flags: Record<string, number | string | boolean>;
}

export interface NPCDef {
  id: string;
  name: string;
  role: string;
  model: 'char_civilian' | 'char_astronaut';
  look?: Appearance;
  dialogue?: DialogueDef;
  state?: Partial<NPCState>;
  walkSpeed?: number;
}

/** What an agent needs to know about the place it is standing in. */
export interface NPCEnv {
  game: Game;
  phys: PhysicsWorld;
  parent: THREE.Object3D;
  /** analytic ground height (terrain); used when no floor is found by ray cast and for distant agents */
  ground?(x: number, z: number): number | null;
  /** local "up" at a point (rotating habitats); default world +Y */
  up?(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  nav?: NavGraph;
  /** weightless environment: agents drift along straight lines between handholds instead of walking */
  weightless?(): boolean;
  /** moving hazards agents should step away from (vehicles) */
  hazards?(): { pos: THREE.Vector3; vel: THREE.Vector3; radius: number }[];
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const WORLD_RAY = groups(0xffff, GROUP.WORLD);
const BLOCK_RAY = groups(0xffff, GROUP.WORLD | GROUP.VEHICLE);

export class NPC {
  id: string;
  name: string;
  root = new THREE.Group();
  human: Humanoid;
  state: NPCState;
  dialogue: DialogueDef | null;
  /** feet position, zone space */
  pos = new THREE.Vector3();
  /** unit facing direction, perpendicular to up */
  fwd = new THREE.Vector3(0, 0, -1);
  up = new THREE.Vector3(0, 1, 0);
  vel = new THREE.Vector3();
  walkSpeed: number;
  brain: BT<NPC> | null = null;
  /** seconds since the brain last ran */
  private thinkT = Math.random() * 0.3;
  private path: THREE.Vector3[] = [];
  private goalRadius = 0.35;
  private moveSpeed = 1.3;
  moving = false;
  /** true when the last move ended because no route could be found or the agent was stuck */
  blocked = false;
  private stuckT = 0;
  private avoidT = 0;
  private avoidSide = 0;
  /** hold this pose when not walking */
  idlePose: PoseName = 'stand';
  /** face this point when idle (null = keep heading) */
  faceTarget: THREE.Vector3 | null = null;
  /** the agent is parented to a seat/bunk and does not move by itself */
  attached: THREE.Object3D | null = null;
  talking = false;
  /** walk on even when the player stands in the way (someone running away) */
  ignorePlayer = false;
  private body: RAPIER.RigidBody | null = null;
  private collider: RAPIER.Collider | null = null;
  private interact: Interactable | null = null;
  private lod = 0;
  private frame = 0;
  private headPos = new THREE.Vector3();
  private barkT = 0;
  distToPlayer = 1e9;

  constructor(public def: NPCDef, model: Model, public env: NPCEnv) {
    this.id = def.id;
    this.name = def.name;
    this.walkSpeed = def.walkSpeed ?? 1.35;
    this.dialogue = def.dialogue ?? null;
    this.human = new Humanoid(model, def.look);
    this.root.name = `npc:${def.id}`;
    this.root.add(model.root);
    this.state = {
      location: '', task: 'idle', destination: '', health: 100, emotion: 'calm', role: def.role, knowledge: [], relationship: 0,
      access: [], conversation: null, equipment: [], said: {}, flags: {}, ...def.state,
    };
    env.parent.add(this.root);
    this.createBody();
  }

  private createBody() {
    const w = this.env.phys.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y + 0.9, this.pos.z));
    this.collider = w.createCollider(
      RAPIER.ColliderDesc.capsule(0.58, 0.3).setCollisionGroups(groups(GROUP.NPC, GROUP.PLAYER | GROUP.VEHICLE | GROUP.DYNAMIC)).setFriction(0.2),
      this.body,
    );
  }

  /** Move to another physics world / scene parent (boarding a ship, changing zone). */
  transfer(env: NPCEnv) {
    this.dispose(false);
    this.env = env;
    env.parent.add(this.root);
    this.createBody();
    this.registerInteraction();
  }

  dispose(removeVisual = true) {
    if (this.body && this.env.phys.world.bodies.contains(this.body.handle)) this.env.phys.world.removeRigidBody(this.body);
    this.body = null; this.collider = null;
    if (this.interact) this.env.game.interactions.remove(this.interact);
    this.interact = null;
    if (removeVisual) this.root.removeFromParent();
  }

  registerInteraction() {
    const I = this.env.game.interactions;
    if (this.interact) I.remove(this.interact);
    this.interact = I.add({
      position: (out) => out.copy(this.headPos),
      radius: 0.5, range: 3.2,
      label: () => (this.dialogue && !this.talking ? `Talk to ${this.name}` : ''),
      use: () => bus.emit('npc:talk', this),
      enabled: () => this.root.visible && !!this.dialogue,
    });
  }

  // ------------------------------------------------------------------------------------------- placement
  place(p: THREE.Vector3Like, yaw = 0) {
    this.detach();
    this.pos.set(p.x, p.y, p.z);
    this.env.up?.(this.pos, this.up);
    this.fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.orthoFwd();
    this.stop();
    this.syncVisual(1);
    return this;
  }

  private orthoFwd() {
    this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up));
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(1, 0, 0).addScaledVector(this.up, -this.up.x);
    this.fwd.normalize();
  }

  get yaw() { return Math.atan2(-this.fwd.x, -this.fwd.z); }

  /** Sit / lie on a seat or bunk node: the agent rides with it (vehicles, spacecraft, cryo pods). */
  attach(node: THREE.Object3D, pose: PoseName = 'sit', offset = new THREE.Vector3(0, 0, 0)) {
    this.stop();
    this.attached = node;
    node.add(this.root);
    this.root.position.copy(offset);
    this.root.quaternion.identity();
    this.idlePose = pose;
    this.human.pose = pose;
    if (this.collider) this.collider.setEnabled(false);
  }

  detach(at?: THREE.Vector3Like, yaw?: number) {
    if (!this.attached) return;
    this.root.getWorldPosition(_a);
    this.env.parent.worldToLocal(_a);
    this.attached = null;
    this.env.parent.add(this.root);
    this.idlePose = 'stand';
    if (this.collider) this.collider.setEnabled(true);
    if (at) this.place(at, yaw ?? 0); else this.place(_a, yaw ?? 0);
  }

  // ------------------------------------------------------------------------------------------- movement
  /** Walk (or drift) to a point. Returns false when no route exists. */
  moveTo(target: THREE.Vector3Like, opts: { speed?: number; radius?: number; direct?: boolean } = {}) {
    if (this.attached) this.detach();
    this.goalRadius = opts.radius ?? 0.35;
    this.moveSpeed = opts.speed ?? this.walkSpeed;
    this.blocked = false;
    const nav = this.env.nav;
    const t = new THREE.Vector3(target.x, target.y, target.z);
    this.path = [];
    if (nav && !opts.direct && nav.nearest(this.pos, 9) >= 0 && nav.nearest(t, 16) >= 0) {
      const p = nav.path(this.pos, t);
      if (!p) { this.blocked = true; this.moving = false; return false; }
      for (const n of p) this.path.push(n.clone());
      // the last graph node is replaced by the exact target when they are close together
      if (this.path.length && this.path[this.path.length - 1].distanceTo(t) < 0.05) this.path.pop();
    }
    this.path.push(t);
    this.moving = true;
    this.stuckT = 0;
    return true;
  }

  stop() { this.path.length = 0; this.moving = false; this.vel.set(0, 0, 0); }

  get arrived() { return !this.moving && !this.blocked; }

  distanceTo(p: THREE.Vector3Like) { return Math.hypot(this.pos.x - p.x, this.pos.y - p.y, this.pos.z - p.z); }

  /** Turn to face a point (idle only). */
  face(p: THREE.Vector3Like | null) {
    this.faceTarget = p ? (this.faceTarget ?? new THREE.Vector3()).set(p.x, p.y, p.z) : null;
  }

  private turnToward(dir: THREE.Vector3, rate: number, dt: number) {
    // rotate fwd toward dir about up
    const cross = _c.crossVectors(this.fwd, dir).dot(this.up);
    const dot = clamp(this.fwd.dot(dir), -1, 1);
    const ang = Math.atan2(cross, dot);
    const step = clamp(ang, -rate * dt, rate * dt);
    this.fwd.applyAxisAngle(this.up, step);
    this.orthoFwd();
    return Math.abs(ang);
  }

  fixedUpdate(dt: number, playerPos: THREE.Vector3) {
    if (this.attached) return;
    this.frame++;
    this.distToPlayer = this.pos.distanceTo(playerPos);
    this.lod = this.distToPlayer < 70 ? 0 : this.distToPlayer < 260 ? 1 : 2;
    // distant agents advance in coarse steps
    const every = this.lod === 0 ? 1 : this.lod === 1 ? 4 : 12;
    if (this.frame % every !== 0) return;
    const h = dt * every;
    const env = this.env;
    if (env.up) env.up(this.pos, this.up); else this.up.set(0, 1, 0);
    const floating = env.weightless?.() ?? false;
    // far from the player an agent without analytic ground simply follows its route in 3D (stairs, decks)
    const weightless = floating || (this.lod > 0 && !env.ground);

    let speed = 0;
    if (this.moving && this.path.length && !this.talking) {
      const wp = this.path[0];
      _a.copy(wp).sub(this.pos);
      const vert = _a.dot(this.up);
      if (!weightless) _a.addScaledVector(this.up, -vert);
      const dist = _a.length();
      const last = this.path.length === 1;
      if (dist < (last ? this.goalRadius : 0.45) && (weightless || Math.abs(vert) < 1.6)) {
        this.path.shift();
        if (!this.path.length) this.moving = false;
      } else {
        _a.multiplyScalar(1 / Math.max(dist, 1e-4));
        // hazards: step aside from vehicles bearing down on us
        const hz = this.lod === 0 ? env.hazards?.() : undefined;
        let dodge = false;
        if (hz) for (const z of hz) {
          _b.copy(this.pos).sub(z.pos);
          const sp = z.vel.length();
          if (sp < 0.8) continue;
          const along = _b.dot(z.vel) / sp;
          if (along < -1 || along > sp * 2.5 + z.radius) continue;
          _c.copy(z.vel).multiplyScalar(along / sp);
          _b.sub(_c);
          const lat = _b.length();
          if (lat < z.radius + 1.6) {
            if (lat < 1e-3) _b.crossVectors(this.up, z.vel);
            _a.copy(_b).addScaledVector(this.up, -_b.dot(this.up)).normalize();
            dodge = true;
            break;
          }
        }
        // obstacle avoidance: probe ahead at waist height
        if (!dodge && this.lod === 0 && !weightless) {
          this.avoidT -= h;
          _b.copy(this.pos).addScaledVector(this.up, 0.75);
          const probe = (dir: THREE.Vector3) => env.phys.raycast(_b, dir, 1.15, BLOCK_RAY);
          if (this.avoidT > 0) {
            _c.copy(_a).applyAxisAngle(this.up, this.avoidSide * 1.15);
            if (!probe(_c)) _a.copy(_c); else { _c.copy(_a).applyAxisAngle(this.up, this.avoidSide * 1.9); _a.copy(_c); }
          } else if (probe(_a)) {
            let found = false;
            for (const ang of [0.7, -0.7, 1.3, -1.3, 1.9, -1.9]) {
              _c.copy(_a).applyAxisAngle(this.up, ang);
              if (!probe(_c)) { this.avoidSide = Math.sign(ang); this.avoidT = 0.9; _a.copy(_c); found = true; break; }
            }
            if (!found) { this.stuckT += h * 3; }
          }
        }
        // do not walk into the player
        _b.copy(playerPos).sub(this.pos);
        const pd = _b.length();
        const facingPlayer = !this.ignorePlayer && pd < 1.0 && _b.dot(_a) > 0.5 * pd;
        speed = facingPlayer ? 0 : (dodge ? this.walkSpeed * 2.2 : this.moveSpeed) * (last ? clamp(dist / 0.6, 0.35, 1) : 1);
        const off = this.turnToward(_a, weightless ? 2.2 : 5.5, h);
        if (off > 1.2) speed *= 0.25;
        const before = _c.copy(this.pos);
        if (weightless) this.pos.addScaledVector(_a, speed * h);
        else this.pos.addScaledVector(this.fwd, speed * h);
        // progress watchdog
        if (speed > 0.1 && this.pos.distanceTo(before) < speed * h * 0.2) this.stuckT += h; else this.stuckT = Math.max(0, this.stuckT - h * 0.5);
        if (this.stuckT > 6) { this.blocked = true; this.stop(); }
      }
    } else if (!this.moving && (this.faceTarget || this.talking) && this.lod < 2) {
      _a.copy(this.talking ? playerPos : this.faceTarget!).sub(this.pos);
      _a.addScaledVector(this.up, -_a.dot(this.up));
      if (_a.lengthSq() > 0.01) this.turnToward(_a.normalize(), 3.2, h);
    }
    this.vel.copy(this.fwd).multiplyScalar(speed);

    // keep feet on the floor
    if (!floating && this.lod === 0 || !weightless) {
      let y: number | null = null;
      if (this.lod === 0) {
        _b.copy(this.pos).addScaledVector(this.up, 0.95);
        _up.copy(this.up).negate();
        const hit = env.phys.raycast(_b, _up, 2.6, WORLD_RAY);
        if (hit) { _b.addScaledVector(_up, hit.dist); y = 0; this.pos.lerp(_b, 1 - Math.exp(-18 * h)); }
      }
      if (y === null && env.ground && !env.up) {
        const g = env.ground(this.pos.x, this.pos.z);
        if (g !== null) this.pos.y = damp(this.pos.y, g, 14, h);
      }
    }
    if (this.body) {
      _b.copy(this.pos).addScaledVector(this.up, 0.9);
      this.body.setNextKinematicTranslation(_b);
      if (env.up) { _q.setFromUnitVectors(_up.set(0, 1, 0), this.up); this.body.setNextKinematicRotation(_q); }
    }
  }

  private syncVisual(k: number) {
    if (this.attached) return;
    this.root.position.lerp(this.pos, k);
    _a.crossVectors(this.fwd, this.up).normalize();
    _b.copy(this.fwd).negate();
    _m.makeBasis(_a, this.up, _b);
    _q.setFromRotationMatrix(_m);
    this.root.quaternion.slerp(_q, k);
  }

  update(dt: number, camPos: THREE.Vector3, playerEye: THREE.Vector3) {
    // visibility / animation level of detail
    const d = this.attached ? this.root.getWorldPosition(_a).distanceTo(camPos) : this.pos.distanceTo(camPos);
    this.root.visible = d < 420;
    if (!this.root.visible) return;
    this.syncVisual(this.lod === 0 ? 1 - Math.exp(-22 * dt) : 1);
    const sp = this.vel.length();
    const h = this.human;
    const weightless = this.env.weightless?.() ?? false;
    if (this.attached) h.pose = this.idlePose;
    else if (weightless) h.pose = 'float';
    else if (sp > 0.12) { h.pose = 'walk'; h.speed = sp; }
    else h.pose = this.talking ? 'talk' : this.idlePose;
    h.lookAt = d < 9 && (this.talking || d < 4.5) ? playerEye : null;
    if (d < 140) h.update(dt);
    h.bonePos('head', this.headPos);
    // interaction anchor is in world space; zone roots are at the origin so this is zone space as well
    this.barkT -= dt;
  }

  // ------------------------------------------------------------------------------------------- brain / voice
  think(dt: number) {
    if (!this.brain || this.talking) return;
    this.thinkT += dt;
    const period = this.lod === 0 ? 0.2 : this.lod === 1 ? 0.6 : 1.5;
    if (this.thinkT < period) return;
    this.brain.tick(this, this.thinkT);
    this.thinkT = 0;
  }

  /** Speak aloud: a subtitle when the player is close enough to hear. Returns the duration in seconds. */
  say(text: string, force = false) {
    if (!force && this.distToPlayer > 16) return 0;
    bus.emit('npc:say', { npc: this, text });
    return ui.say(this.name, text);
  }

  /** Ambient remark with a cooldown so agents do not chatter over each other. */
  bark(lines: string[], key: string, cooldown = 40) {
    if (this.barkT > 0 || this.distToPlayer > 9 || this.talking || ui.get().subtitle || ui.get().panel) return false;
    const n = this.state.said[key] ?? 0;
    this.state.said[key] = n + 1;
    this.say(lines[n % lines.length]);
    this.barkT = cooldown;
    return true;
  }

  knows(fact: string) { return this.state.knowledge.includes(fact); }
  learn(fact: string) { if (!this.knows(fact)) this.state.knowledge.push(fact); }

  serialize() {
    return { pos: this.pos.toArray(), yaw: this.yaw, state: this.state, idlePose: this.idlePose };
  }

  deserialize(d: any) {
    if (!d) return;
    this.state = { ...this.state, ...d.state, conversation: null };
    if (!this.attached && d.pos) { this.place(new THREE.Vector3().fromArray(d.pos), d.yaw ?? 0); this.idlePose = d.idlePose ?? 'stand'; }
    this.brain?.reset();
  }
}

/** Owns the agents of one environment. */
export class NPCManager {
  list: NPC[] = [];
  private eye = new THREE.Vector3();
  private cam = new THREE.Vector3();

  constructor(public env: NPCEnv) {}

  async spawn(def: NPCDef, pos: THREE.Vector3Like, yaw = 0): Promise<NPC> {
    const model = await assets.load(def.model);
    const n = new NPC(def, model, this.env);
    n.place(pos, yaw);
    n.registerInteraction();
    this.list.push(n);
    return n;
  }

  adopt(n: NPC) { if (!this.list.includes(n)) this.list.push(n); n.transfer(this.env); return n; }
  release(n: NPC) { const i = this.list.indexOf(n); if (i >= 0) this.list.splice(i, 1); n.dispose(); }
  get(id: string) { return this.list.find((n) => n.id === id) ?? null; }

  /** Interactions are cleared on every zone change. */
  rebind() { for (const n of this.list) n.registerInteraction(); }

  fixedUpdate(dt: number) {
    const p = this.env.game.player.pos;
    for (const n of this.list) { n.think(dt); n.fixedUpdate(dt, p); }
  }

  update(dt: number) {
    const g = this.env.game;
    g.renderer.camera.getWorldPosition(this.cam);
    g.player.eyePosition(this.eye);
    for (const n of this.list) n.update(dt, this.cam, this.eye);
  }

  serialize() { const o: Record<string, any> = {}; for (const n of this.list) o[n.id] = n.serialize(); return o; }
  deserialize(d: any) { if (d) for (const n of this.list) n.deserialize(d[n.id]); }
}
