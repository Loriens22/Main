// Lightweight rigid-body behaviour for small props: gravity, bouncing on
// terrain/furniture/building floors, sliding friction, rolling (balls),
// wall push-out, being kicked by the player, carried and thrown.

import * as THREE from 'three';
import { G } from '../../core/context.js';

const _q = new THREE.Quaternion();

// opts: { mass, radius, restitution, friction, roll, height, kick }
export function attachPhysics(data, opts = {}) {
  const r = opts.radius || (data.footprint ? data.footprint.radius : 0.3);
  data.pickup = opts.pickup !== false;
  data.body = {
    x: 0, y: 0, z: 0, r, noPush: true, mass: opts.mass || 1,
    vx: 0, vy: 0, vz: 0, spin: 0, held: false, sleeping: true, sleepT: 0,
    restitution: opts.restitution ?? 0.3, friction: opts.friction ?? 4, roll: !!opts.roll, height: opts.height || data.height || 0.5, kick: opts.kick ?? (opts.roll ? 1 : 0.35),
  };
  const body = data.body;
  const tmp = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const prevUpdate = data.update;
  data.update = function (dt, t, dist) {
    if (prevUpdate) prevUpdate.call(this, dt, t, dist);
    const e = this;
    const root = e.root;
    const world = G.worlds.get(e.worldId);
    if (!world) return;
    if (body.held) { body.x = root.position.x; body.y = root.position.y; body.z = root.position.z; return; }
    const P = G.player;
    const sc = e.scale || 1;
    // Kicks: the player walking into the prop.
    if (G.world === world && body.kick > 0) {
      const dx = root.position.x - P.position.x, dz = root.position.z - P.position.z;
      const d = Math.hypot(dx, dz);
      const minD = body.r * sc + P.radius;
      if (d < minD && d > 1e-3 && Math.abs(P.position.y - root.position.y) < 1.2) {
        const push = (minD - d);
        root.position.x += (dx / d) * push; root.position.z += (dz / d) * push;
        const pv = Math.hypot(P.velocity.x, P.velocity.z);
        const k = body.kick * Math.max(1.5, pv * 1.3) / Math.sqrt(body.mass);
        body.vx += (dx / d) * k; body.vz += (dz / d) * k;
        if (body.roll && pv > 3) body.vy += pv * 0.25;
        body.sleeping = false;
        if (G.audio && pv > 1 && (body._kickT || 0) < t) { G.audio.play('bounce', root.position, { v: pv }); body._kickT = t + 0.3; }
      }
    }
    if (body.sleeping) { body.x = root.position.x; body.y = root.position.y; body.z = root.position.z; return; }
    const g = world.rules.gravity ?? 9.81;
    const sub = Math.min(4, Math.ceil(dt / 0.02));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      body.vy -= g * h;
      root.position.x += body.vx * h;
      root.position.y += body.vy * h;
      root.position.z += body.vz * h;
      // Walls.
      tmp.copy(root.position);
      world.colliders.resolve(tmp, body.r * sc * 0.9, body.height * sc, 0.25, e.id, 2);
      const px = tmp.x - root.position.x, pz = tmp.z - root.position.z;
      if (Math.abs(px) + Math.abs(pz) > 1e-5) {
        const l = Math.hypot(px, pz), nx = px / l, nz = pz / l;
        const vn = body.vx * nx + body.vz * nz;
        if (vn < 0) { body.vx -= (1 + body.restitution) * vn * nx; body.vz -= (1 + body.restitution) * vn * nz; }
        root.position.x = tmp.x; root.position.z = tmp.z;
      }
      // Ground (terrain, floors, tables...).
      const ground = world.colliders.groundHeight(root.position.x, root.position.z, body.r * sc * 0.5, root.position.y + 0.3, 0.3, e.id);
      const water = world.waterLevel;
      if (water > -1e8 && root.position.y < water && body.mass < 6) {
        // Floaty props bob on water.
        body.vy += (water - root.position.y) * 30 * h;
        body.vy *= Math.exp(-h * 3); body.vx *= Math.exp(-h * 1.5); body.vz *= Math.exp(-h * 1.5);
      }
      if (root.position.y <= ground) {
        root.position.y = ground;
        if (body.vy < -1.2) {
          if (G.audio && body.vy < -2.5) G.audio.play('bounce', root.position, { v: -body.vy });
          body.vy = -body.vy * body.restitution;
        } else body.vy = 0;
        const f = Math.exp(-h * (body.roll ? body.friction * 0.25 : body.friction));
        body.vx *= f; body.vz *= f;
      }
    }
    // Orientation: rolling balls rotate about the axis perpendicular to motion; others spin while airborne.
    const hs = Math.hypot(body.vx, body.vz);
    if (body.roll && hs > 1e-3) {
      axis.set(body.vz, 0, -body.vx).normalize();
      const obj = e.rollObject || root;
      if (obj !== root) { obj.parent.getWorldQuaternion(_q); axis.applyQuaternion(_q.invert()); }
      obj.rotateOnWorldAxis(axis, (hs * dt) / Math.max(0.05, body.r * sc));
    } else if (Math.abs(body.vy) > 0.5 || hs > 0.5) root.rotation.y += body.spin * dt;
    body.spin *= Math.exp(-dt * 2);
    const speed = Math.hypot(hs, body.vy);
    if (speed < 0.05) { body.sleepT += dt; if (body.sleepT > 0.6) { body.sleeping = true; body.vx = body.vy = body.vz = 0; G.registry.refresh(e); } }
    else body.sleepT = 0;
    body.x = root.position.x; body.y = root.position.y; body.z = root.position.z;
    if (root.position.y < (world.rules.fallRespawn ?? -80)) { root.position.copy(world.spawn.pos).add(new THREE.Vector3(1, 2, 1)); }
  };
  const prevAdded = data.onAdded;
  data.onAdded = function (world) { if (prevAdded) prevAdded.call(this, world); body.x = this.root.position.x; body.y = this.root.position.y; body.z = this.root.position.z; if (opts.dropOnSpawn) { this.root.position.y += opts.dropOnSpawn; body.sleeping = false; } };
  data.onDrop = function () { body.sleeping = false; };
  return data;
}
