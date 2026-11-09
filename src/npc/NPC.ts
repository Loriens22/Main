import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { NpcState } from '../core/State';
import { CHARACTERS, type CharacterDef } from '../data/characters';
import { Humanoid } from './Humanoid';
import type { Frame } from '../world/Frame';

export type Anim = 'idle' | 'walk' | 'run' | 'sit' | 'type' | 'climb' | 'float' | 'talk' | 'wave';

export interface Waypoint {
  id: string;
  p: THREE.Vector3; // frame-local
  links: string[];
}

/** Waypoint graph + A* for NPC navigation inside a site/zone. */
export class NavGraph {
  readonly nodes = new Map<string, Waypoint>();

  add(id: string, p: THREE.Vector3, links: string[] = []) {
    const w = { id, p: p.clone(), links: [...links] };
    this.nodes.set(id, w);
    for (const l of links) this.nodes.get(l)?.links.push(id);
    return w;
  }

  link(a: string, b: string) {
    this.nodes.get(a)?.links.push(b);
    this.nodes.get(b)?.links.push(a);
  }

  nearest(p: THREE.Vector3): Waypoint | null {
    let best: Waypoint | null = null, bd = Infinity;
    for (const w of this.nodes.values()) {
      const d = w.p.distanceToSquared(p);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }

  path(from: THREE.Vector3, toId: string): THREE.Vector3[] {
    const start = this.nearest(from);
    const goal = this.nodes.get(toId);
    if (!start || !goal) return goal ? [goal.p.clone()] : [];
    const open = new Set([start.id]);
    const came = new Map<string, string>();
    const g = new Map<string, number>([[start.id, 0]]);
    const f = new Map<string, number>([[start.id, start.p.distanceTo(goal.p)]]);
    while (open.size) {
      let cur = '';
      let cf = Infinity;
      for (const id of open) if ((f.get(id) ?? Infinity) < cf) { cf = f.get(id)!; cur = id; }
      if (cur === goal.id) {
        const out: THREE.Vector3[] = [];
        let c: string | undefined = cur;
        while (c) {
          out.unshift(this.nodes.get(c)!.p.clone());
          c = came.get(c);
        }
        return out;
      }
      open.delete(cur);
      const cn = this.nodes.get(cur)!;
      for (const nb of cn.links) {
        const nn = this.nodes.get(nb);
        if (!nn) continue;
        const tg = (g.get(cur) ?? Infinity) + cn.p.distanceTo(nn.p);
        if (tg < (g.get(nb) ?? Infinity)) {
          came.set(nb, cur);
          g.set(nb, tg);
          f.set(nb, tg + nn.p.distanceTo(goal.p));
          open.add(nb);
        }
      }
    }
    return [goal.p.clone()];
  }
}

/**
 * An NPC: animated body + simple steering along paths, behaviour driven by its owner (zone/director).
 * Positions are frame-local; ground height is resolved with a ray in the frame's physics world.
 */
export class NPC {
  readonly def: CharacterDef;
  body!: Humanoid;
  frame: Frame;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  path: THREE.Vector3[] = [];
  speed = 1.35;
  arriveRadius = 0.5;
  pose: Anim = 'idle';
  forcedAnim: Anim | null = null;
  sitting: { pos: THREE.Vector3; yaw: number; anim: Anim } | null = null;
  talking = 0;
  visible = true;
  groundMode: 'ray' | 'fixed' | 'fn' = 'ray';
  groundFn: ((p: THREE.Vector3) => number) | null = null;
  floatMode = false;
  onArrive: (() => void) | null = null;
  stuckT = 0;
  private lastPos = new THREE.Vector3();
  private stepT = 0;
  /** brain hook (set by director) */
  think: ((npc: NPC, dt: number) => void) | null = null;

  constructor(readonly game: Game, readonly state: NpcState, frame: Frame) {
    this.def = CHARACTERS[state.id] ?? CHARACTERS.capcom;
    this.frame = frame;
    this.pos.set(...state.pos);
    this.yaw = state.yaw;
  }

  async init(outfit?: string) {
    this.body = await Humanoid.create(this.game.assets, this.def, outfit);
    this.frame.anchor.add(this.body.root);
    this.sync();
    return this;
  }

  setFrame(f: Frame, pos: THREE.Vector3, yaw = this.yaw) {
    this.frame = f;
    f.anchor.add(this.body.root);
    this.pos.copy(pos);
    this.yaw = yaw;
    this.path = [];
    this.state.frame = f.id;
    this.sync();
  }

  goTo(target: THREE.Vector3 | THREE.Vector3[], speed = 1.35, onArrive: (() => void) | null = null) {
    this.sitting = null;
    this.path = Array.isArray(target) ? target.map((t) => t.clone()) : [target.clone()];
    this.speed = speed;
    this.onArrive = onArrive;
    this.stuckT = 0;
  }

  stop() {
    this.path = [];
  }

  sit(pos: THREE.Vector3, yaw: number, anim: Anim = 'sit') {
    this.path = [];
    this.sitting = { pos: pos.clone(), yaw, anim };
    this.pos.copy(pos);
    this.yaw = yaw;
  }

  stand() {
    if (!this.sitting) return;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.pos.addScaledVector(fwd, 0.6);
    this.sitting = null;
  }

  faceTo(p: THREE.Vector3) {
    const d = p.clone().sub(this.pos);
    this.yaw = Math.atan2(-d.x, -d.z);
  }

  /** Distance to the player if in the same frame, else Infinity. */
  distToPlayer() {
    const pl = this.game.player;
    if (pl.frame !== this.frame) return Infinity;
    return pl.pos.distanceTo(this.pos);
  }

  private ground(p: THREE.Vector3): number | null {
    if (this.groundMode === 'fn' && this.groundFn) return this.groundFn(p);
    if (this.groundMode === 'fixed') return p.y;
    const hit = this.frame.physics.raycast(new THREE.Vector3(p.x, p.y + 1.2, p.z), new THREE.Vector3(0, -1, 0), 4);
    return hit ? hit.point.y : null;
  }

  update(dt: number) {
    this.think?.(this, dt);
    let moving = false;
    if (this.sitting) {
      this.pos.copy(this.sitting.pos);
      this.yaw = this.sitting.yaw;
      this.pose = this.sitting.anim;
    } else if (this.path.length) {
      const tgt = this.path[0];
      const d = new THREE.Vector3(tgt.x - this.pos.x, 0, tgt.z - this.pos.z);
      const dist = d.length();
      if (dist < this.arriveRadius) {
        this.path.shift();
        if (!this.path.length) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        d.normalize();
        // simple avoidance of the player
        const pl = this.game.player;
        if (pl.frame === this.frame) {
          const toP = pl.pos.clone().sub(this.pos);
          toP.y = 0;
          if (toP.length() < 1.1 && toP.dot(d) > 0) d.add(new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.8)).normalize();
        }
        const step = Math.min(dist, this.speed * dt);
        this.pos.addScaledVector(d, step);
        const targetYaw = Math.atan2(-d.x, -d.z);
        let dy = targetYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * Math.min(1, dt * 8);
        moving = true;
        this.pose = this.speed > 2.5 ? 'run' : 'walk';
      }
      if (moving) {
        const g = this.ground(this.pos);
        if (g !== null) this.pos.y = THREE.MathUtils.damp(this.pos.y, g, 12, dt);
        else if (this.groundMode === 'ray') this.pos.y = tgt.y;
        // stuck detection
        if (this.lastPos.distanceTo(this.pos) < this.speed * dt * 0.2) this.stuckT += dt;
        else this.stuckT = 0;
        if (this.stuckT > 3) {
          this.pos.copy(tgt);
          this.stuckT = 0;
        }
        this.stepT += dt * this.speed;
        if (this.stepT > 0.75 && this.distToPlayer() < 25) {
          this.stepT = 0;
          this.game.audio.footstep(this.frame.surfaceFn(this.pos), this.frame.localToWorld(this.pos, new THREE.Vector3()), 0.45);
        }
      }
    } else {
      this.pose = this.floatMode ? 'float' : this.talking > 0 ? 'talk' : 'idle';
    }
    this.lastPos.copy(this.pos);
    if (this.talking > 0) this.talking -= dt;
    // look at the player when near
    const dp = this.distToPlayer();
    this.body.lookTarget = dp < 6 && !moving ? this.game.camera.position : null;
    this.body.play(this.forcedAnim ?? this.pose, 0.35, this.pose === 'walk' ? this.speed / 1.35 : 1);
    this.body.update(dt);
    this.sync();
  }

  sync() {
    if (!this.body) return;
    const r = this.body.root;
    r.position.copy(this.pos);
    r.rotation.set(0, this.yaw, 0);
    r.visible = this.visible;
    this.state.pos = [this.pos.x, this.pos.y, this.pos.z];
    this.state.yaw = this.yaw;
  }

  dispose() {
    this.body?.dispose();
  }
}
