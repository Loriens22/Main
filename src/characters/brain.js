// NPC behaviour: a small hierarchical state machine (idle, wander, follow,
// go-to, stay, sit, dance, talk, flee) with grid A* pathfinding over the
// collision world, steering, separation, ground snapping and look-at.
// Shared by humans, animals and robots (they differ in speed, gait and
// what they say).

import * as THREE from 'three';
import { G } from '../core/context.js';

// ---------------- Grid A* ----------------
export function findPath(world, from, to, radius = 0.35, maxCells = 110) {
  const cell = 1.0;
  const cx = Math.floor((from.x + to.x) / 2), cz = Math.floor((from.z + to.z) / 2);
  const span = Math.min(maxCells, Math.max(24, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z)) / cell) + 24));
  const half = Math.floor(span / 2);
  const ox = cx - half, oz = cz - half;
  const N = span;
  const blocked = new Uint8Array(N * N);
  const C = world.colliders;
  const tmp = [];
  const baseY = from.y;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = ox + i + 0.5, z = oz + j + 0.5;
      const g = C.groundHeight(x, z, radius, baseY + 1.5, 0.5);
      let b = 0;
      if (g - baseY > 1.6 || g - baseY < -3) b = 1;
      if (world.waterLevel > -1e8 && g < world.waterLevel - 0.6) b = 1;
      if (!b) {
        for (const c of C.query(x, z, radius, tmp)) {
          if (!c.solid) continue;
          if (c.y1 <= g + 0.45 || c.y0 >= g + 1.7) continue;
          if (C.overlaps(c, x, z, radius)) { b = 1; break; }
        }
      }
      blocked[i + j * N] = b;
    }
  }
  const idx = (x, z) => { const i = Math.floor(x - ox), j = Math.floor(z - oz); return i < 0 || j < 0 || i >= N || j >= N ? -1 : i + j * N; };
  const s = idx(from.x, from.z), t = idx(to.x, to.z);
  if (s < 0 || t < 0) return null;
  blocked[s] = 0;
  if (blocked[t]) {
    // Nearest free cell to the goal.
    let best = -1, bd = Infinity;
    for (let k = 0; k < N * N; k++) if (!blocked[k]) { const d = Math.hypot((k % N) - (t % N), Math.floor(k / N) - Math.floor(t / N)); if (d < bd) { bd = d; best = k; } }
    if (best < 0 || bd > 6) return null;
  }
  const goal = blocked[t] ? null : t;
  const target = goal ?? t;
  const gScore = new Float32Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const open = [s];
  const inOpen = new Uint8Array(N * N);
  inOpen[s] = 1;
  gScore[s] = 0;
  const h = (k) => Math.hypot((k % N) - (target % N), Math.floor(k / N) - Math.floor(target / N));
  const f = new Float32Array(N * N).fill(Infinity);
  f[s] = h(s);
  let iter = 0;
  while (open.length && iter++ < 6000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop(); inOpen[cur] = 0;
    if (cur === target || (!goal && h(cur) < 1.5)) {
      const path = [];
      let k = cur;
      while (k >= 0) { path.push(new THREE.Vector3(ox + (k % N) + 0.5, 0, oz + Math.floor(k / N) + 0.5)); k = came[k]; }
      path.reverse();
      return smoothPath(world, path, radius);
    }
    const ci = cur % N, cj = Math.floor(cur / N);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = ni + nj * N;
      if (blocked[nk]) continue;
      if (di && dj && (blocked[ci + di + cj * N] || blocked[ci + (cj + dj) * N])) continue; // no corner cutting
      const ng = gScore[cur] + (di && dj ? 1.414 : 1);
      if (ng < gScore[nk]) {
        gScore[nk] = ng; came[nk] = cur; f[nk] = ng + h(nk);
        if (!inOpen[nk]) { open.push(nk); inOpen[nk] = 1; }
      }
    }
  }
  return null;
}

export function lineClear(world, a, b, radius = 0.3) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(d / 0.6);
  const tmp = [];
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const g = world.colliders.groundHeight(x, z, radius, a.y + 1.2, 0.5);
    if (g - a.y > 1.2) return false;
    for (const c of world.colliders.query(x, z, radius, tmp)) {
      if (!c.solid || c.y1 <= g + 0.45 || c.y0 >= g + 1.6) continue;
      if (world.colliders.overlaps(c, x, z, radius)) return false;
    }
  }
  return true;
}

function smoothPath(world, path, r) {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !lineClear(world, path[i], path[j], r)) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

// ---------------- Brain ----------------
export class Brain {
  constructor(entity, opts = {}) {
    this.e = entity;
    this.walkSpeed = opts.walkSpeed || 1.35;
    this.runSpeed = opts.runSpeed || 4.5;
    this.turnSpeed = opts.turnSpeed || 5;
    this.radius = opts.radius || 0.3;
    this.animal = !!opts.animal;
    this.flying = !!opts.flying;
    this.state = 'idle';
    this.timer = 1 + Math.random() * 3;
    this.home = entity.root.position.clone();
    this.target = null;
    this.path = null;
    this.pathTimer = 0;
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.lookTarget = null;
    this.greeted = false;
    this.talkUntil = 0;
    this.remarkTimer = 8 + Math.random() * 20;
    this.followDist = opts.followDist || 2.2;
    this.wanderRadius = opts.wanderRadius ?? 8;
    this.lazy = opts.lazy || false;
    this.yawRate = 0;
    this.stuck = 0;
  }

  command(action) {
    const e = this.e;
    switch (action) {
      case 'follow': this.state = 'follow'; this.path = null; break;
      case 'stay': case 'stop': case 'wait': this.state = 'stay'; this.home.copy(e.root.position); this.path = null; if (e.humanoid) e.humanoid.setPose(null); break;
      case 'come': this.state = 'goto'; this.target = G.player.position.clone(); this.path = null; this.arriveDist = 1.6; break;
      case 'goaway': case 'scatter': {
        const away = e.root.position.clone().sub(G.player.position).setY(0).normalize().multiplyScalar(12);
        this.state = 'goto'; this.target = e.root.position.clone().add(away); this.path = null; this.arriveDist = 1; this.afterGoto = 'wander';
        this.home.copy(this.target);
        break;
      }
      case 'dance': this.state = 'dance'; this.timer = 12; if (e.humanoid) e.humanoid.gesture('dance', 12); break;
      case 'sit': this.state = 'sit'; if (e.humanoid) { const seat = this._findSeat(); if (seat) { this.state = 'goto'; this.target = seat.feet.clone(); this.arriveDist = 0.4; this.afterGoto = 'sit'; this.seat = seat; } else { e.humanoid.setPose('sit', { seatHeight: 0.02 }); } } if (e.onSit) e.onSit(); break;
      case 'wave': if (e.humanoid) e.humanoid.gesture('wave', 2.2); if (e.onGesture) e.onGesture('wave'); break;
      case 'jump': if (e.humanoid) { e.humanoid.triggerJump(); this.hop = 0.5; } if (e.onGesture) e.onGesture('jump'); break;
      case 'cheer': if (e.humanoid) e.humanoid.gesture('cheer', 3); break;
      case 'clap': if (e.humanoid) e.humanoid.gesture('clap', 3); break;
      default: break;
    }
  }

  _findSeat() {
    const world = G.worlds.get(this.e.worldId);
    let best = null, bd = 18;
    for (const o of world.entities) {
      if (!o.seats) continue;
      for (const s of o.seats) {
        const sw = o.seatWorld(s);
        const d = sw.feet.distanceTo(this.e.root.position);
        if (d < bd && !s.occupied) { bd = d; best = sw; best.src = s; }
      }
    }
    return best;
  }

  talkWith(seconds = 8) { this.talkUntil = G.time + seconds; }

  update(dt, world) {
    const e = this.e;
    const P = G.player.position;
    const pos = e.root.position;
    const dist = Math.hypot(P.x - pos.x, P.z - pos.z);
    const talking = G.time < this.talkUntil;
    let desired = null;
    let speed = 0;
    this.timer -= dt;
    // Look at the player when close or talking.
    this.lookTarget = (dist < 7 || talking) && G.world === world ? G.player.eyePos : null;
    // Greeting & idle remarks.
    if (!this.greeted && dist < 4.5 && G.world === world && !this.animal) {
      this.greeted = true;
      if (e.say && e.personality) e.say(e.personality.greet(e.dialogueCtx()), 3.5);
      if (e.humanoid && !e.personality.traits.includes('silent')) e.humanoid.gesture('wave', 1.8);
    }
    if (dist > 12) this.greeted = this.greeted && dist < 30;
    this.remarkTimer -= dt;
    if (this.remarkTimer <= 0) {
      this.remarkTimer = 20 + Math.random() * 35;
      if (dist < 9 && !talking && e.say && e.personality && G.world === world) e.say(e.personality.idleRemark(e.dialogueCtx()), 3.5);
    }
    switch (this.state) {
      case 'idle':
        if (talking) break;
        if (this.timer <= 0) {
          if (this.wanderRadius > 0 && Math.random() < (this.lazy ? 0.3 : 0.7)) {
            const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * this.wanderRadius;
            this.target = this.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
            this.state = 'wander'; this.path = null; this.arriveDist = 0.6;
          } else if (e.humanoid && Math.random() < 0.3) e.humanoid.gesture('idleLook', 3);
          this.timer = 3 + Math.random() * 6;
        }
        break;
      case 'wander':
      case 'goto': {
        if (talking && this.state === 'wander') { this.state = 'idle'; break; }
        const tgt = this.target;
        if (!tgt) { this.state = 'idle'; break; }
        const d = Math.hypot(tgt.x - pos.x, tgt.z - pos.z);
        if (d < (this.arriveDist || 0.6) || this.timer < -25) {
          this.state = this.afterGoto || 'idle'; this.afterGoto = null; this.timer = 2 + Math.random() * 5;
          if (this.state === 'sit' && e.humanoid) {
            const s = this.seat;
            if (s) { pos.copy(s.feet); e.root.rotation.y = s.yaw; e.humanoid.setPose('sit', { seatHeight: s.height }); s.src.occupied = true; this.sitSeat = s.src; }
            else e.humanoid.setPose('sit', { seatHeight: 0.02 });
          }
          break;
        }
        desired = this._steer(world, tgt, dt);
        speed = this.state === 'goto' && d > 8 ? this.runSpeed * 0.8 : this.walkSpeed;
        break;
      }
      case 'follow': {
        if (G.world !== world) break;
        const d = dist;
        if (d > this.followDist) {
          desired = this._steer(world, P, dt);
          speed = d > 7 ? this.runSpeed : d > 3.5 ? this.walkSpeed * 1.4 : this.walkSpeed;
        }
        break;
      }
      case 'stay': break;
      case 'dance': if (this.timer <= 0) { this.state = 'idle'; } break;
      case 'sit':
        if (this.timer <= -40 && !talking) { this.state = 'idle'; if (e.humanoid) e.humanoid.setPose(null); if (this.sitSeat) this.sitSeat.occupied = false; }
        break;
      default: break;
    }
    if (this.state !== 'sit' && e.humanoid && e.humanoid.animator && e.humanoid.animator.pose === 'sit' && this.state !== 'goto') {
      e.humanoid.setPose(null); if (this.sitSeat) { this.sitSeat.occupied = false; this.sitSeat = null; }
    }
    // Movement integration.
    const vel = this.velocity;
    if (desired && speed > 0) {
      vel.x += (desired.x * speed - vel.x) * Math.min(1, dt * 5);
      vel.z += (desired.z * speed - vel.z) * Math.min(1, dt * 5);
    } else {
      vel.x *= Math.exp(-dt * 8); vel.z *= Math.exp(-dt * 8);
    }
    // Separation from the player & other characters.
    const sep = this._separation(world);
    const nx = pos.x + (vel.x + sep.x) * dt, nz = pos.z + (vel.z + sep.z) * dt;
    const tp = new THREE.Vector3(nx, pos.y, nz);
    if (!this.flying) world.colliders.resolve(tp, this.radius, 1.6 * (e.scale || 1), 0.45);
    const moved = Math.hypot(tp.x - pos.x, tp.z - pos.z);
    this.stuck = speed > 0 && moved < speed * dt * 0.2 ? this.stuck + dt : 0;
    if (this.stuck > 1.2) { this.path = null; this.stuck = 0; if (this.state === 'wander') { this.state = 'idle'; this.timer = 1; } }
    pos.x = tp.x; pos.z = tp.z;
    if (!this.flying) {
      const g = world.colliders.groundHeight(pos.x, pos.z, this.radius * 0.6, pos.y + 0.6, 0.6);
      if (Number.isFinite(g) && g > -1e5) {
        if (this.hop > 0) { this.hop -= dt; pos.y = g + Math.sin((0.5 - this.hop) / 0.5 * Math.PI) * 0.4; }
        else pos.y += (g - pos.y) * Math.min(1, dt * 12);
      }
    }
    this.speed = Math.hypot(vel.x, vel.z);
    // Face the movement direction, or the player when talking/idle nearby.
    let wantYaw = null;
    if (this.speed > 0.25) wantYaw = Math.atan2(vel.x, vel.z);
    else if (talking || (dist < 3.5 && this.state !== 'sit')) wantYaw = Math.atan2(P.x - pos.x, P.z - pos.z);
    if (wantYaw !== null && this.state !== 'sit') {
      let dy = wantYaw - e.root.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      const step = dy * Math.min(1, dt * this.turnSpeed);
      e.root.rotation.y += step;
      this.yawRate = step / Math.max(dt, 1e-3);
    } else this.yawRate = 0;
    if (e.body) { e.body.x = pos.x; e.body.z = pos.z; e.body.y = pos.y; }
  }

  _steer(world, target, dt) {
    const pos = this.e.root.position;
    this.pathTimer -= dt;
    const direct = lineClear(world, pos, target, this.radius);
    let aim = target;
    if (!direct) {
      if (!this.path || this.pathTimer <= 0) {
        this.path = findPath(world, pos, target, this.radius + 0.05);
        this.pathTimer = 1.5;
        this.pathIdx = 1;
      }
      if (this.path && this.path.length > 1) {
        while (this.pathIdx < this.path.length - 1 && Math.hypot(this.path[this.pathIdx].x - pos.x, this.path[this.pathIdx].z - pos.z) < 0.8) this.pathIdx++;
        aim = this.path[Math.min(this.pathIdx, this.path.length - 1)];
      }
    } else this.path = null;
    const d = new THREE.Vector3(aim.x - pos.x, 0, aim.z - pos.z);
    const l = d.length();
    return l > 1e-3 ? d.multiplyScalar(1 / l) : null;
  }

  _separation(world) {
    const pos = this.e.root.position;
    const out = new THREE.Vector3();
    const P = G.player.position;
    const pd = Math.hypot(pos.x - P.x, pos.z - P.z);
    const minP = this.radius + 0.55;
    if (pd < minP && pd > 1e-3 && G.world === world) out.add(new THREE.Vector3(pos.x - P.x, 0, pos.z - P.z).multiplyScalar((minP - pd) / pd * 4));
    for (const o of world.entities) {
      if (o === this.e || !o.body) continue;
      const dx = pos.x - o.body.x, dz = pos.z - o.body.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.body.r;
      if (d < min && d > 1e-3) out.add(new THREE.Vector3(dx, 0, dz).multiplyScalar((min - d) / d * 3));
    }
    return out;
  }

  save() { return { state: this.state === 'follow' || this.state === 'stay' ? this.state : 'idle', home: this.home.toArray() }; }
  load(s) { if (!s) return; this.state = s.state || 'idle'; if (s.home) this.home.fromArray(s.home); }
}
