// Crosshair targeting and the "use" action: talk to characters, sit on
// seats, open doors, drive vehicles, pick up / carry / throw props, pet
// animals, enter portals. Also deletes the looked-at object on request.

import * as THREE from 'three';
import { G } from '../core/context.js';

const MAX_DIST = 7;

export class Interaction {
  constructor() {
    this.ray = new THREE.Raycaster();
    this.ray.far = 60;
    this.target = null;     // { entity, object, point, distance, action }
    this.lookedAt = null;   // entity under the crosshair (any distance up to 60 m)
    this.timer = 0;
    this._center = new THREE.Vector2(0, 0);
  }

  // Raycast against nearby entities (skipping helpers/particles/the player).
  pick(maxDist = 60) {
    const world = G.world;
    const cam = G.camera;
    const origin = cam.position;
    const candidates = [];
    for (const e of world.entities) {
      if (!e.root.visible) continue;
      const r = (e.footprint ? e.footprint.radius : 1) * (e.scale || 1) + (e.height || 2) * (e.scale || 1);
      if (e.root.position.distanceTo(origin) - r > maxDist) continue;
      candidates.push(e);
    }
    if (!candidates.length) return null;
    this.ray.setFromCamera(this._center, cam);
    this.ray.far = maxDist;
    let best = null;
    const box = new THREE.Box3(), hitP = new THREE.Vector3();
    for (const e of candidates) {
      const hits = [];
      if (e.isCharacter) {
        // Cheap proxy for skinned characters (triangle tests on skinned meshes are slow).
        const s = e.scale || 1, r = (e.body ? e.body.r : 0.35) * 1.2 * s, hgt = (e.height || 1.8) * s;
        const p = e.root.position;
        box.min.set(p.x - r, p.y, p.z - r); box.max.set(p.x + r, p.y + hgt, p.z + r);
        if (this.ray.ray.intersectBox(box, hitP)) hits.push({ distance: hitP.distanceTo(origin), point: hitP.clone(), object: e.root });
      } else raycastTree(this.ray, e.root, hits);
      for (const h of hits) if (!best || h.distance < best.distance) best = { ...h, entity: e };
    }
    // Terrain/colliders in front of the hit block it.
    if (best) {
      const dir = this.ray.ray.direction;
      const wallHit = world.colliders.raycast(origin, dir, best.distance, (c) => c.owner !== best.entity.id && !c.disabled);
      if (wallHit && wallHit.distance < best.distance - 0.3) return null;
    }
    return best;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.1;
    const P = G.player;
    if (P.vehicle) { G.ui.setInteractHint(P.vehicle.exitLabel || 'Get out'); this.target = null; return; }
    if (P.sitting) { G.ui.setInteractHint('Stand up'); this.target = null; return; }
    if (P.held) { G.ui.setInteractHint(G.isTouch ? `Drop ${P.held.entity.name}` : `Click: throw · E: drop ${P.held.entity.name}`); this.target = null; return; }
    const hit = this.pick(60);
    this.lookedAt = hit ? hit.entity : null;
    this.target = null;
    if (hit && hit.distance < MAX_DIST * Math.max(1, Math.sqrt(hit.entity.scale || 1))) {
      const act = this.actionFor(hit);
      if (act) this.target = { ...hit, action: act };
    }
    G.ui.setInteractHint(this.target ? this.target.action.label : null);
  }

  actionFor(hit) {
    // Object-level interactions (light switches, doors, TVs...) win over entity-level ones.
    let o = hit.object;
    while (o) {
      if (o.userData.interact) return resolveAction(o.userData.interact, hit.entity);
      if (o === hit.entity.root) break;
      o = o.parent;
    }
    const e = hit.entity;
    if (e.interact) return resolveAction(e.interact, e);
    if (e.pickup) return { label: `Pick up ${e.name}`, run: () => this.pickUp(e) };
    return null;
  }

  use() {
    const P = G.player;
    if (P.vehicle) { P.vehicle.exit(P); return; }
    if (P.sitting) { P.standUp(); return; }
    if (P.held) { this.drop(); return; }
    if (this.timer > 0.05) { this.timer = 0; this.update(0); }
    if (this.target) { this.target.action.run(); if (G.audio) G.audio.play('click'); }
  }

  pickUp(e) {
    const P = G.player;
    if (P.held) return;
    P.held = { entity: e, object: e.root, holdDist: Math.max(0, (e.footprint ? e.footprint.radius : 0.3) - 0.2) };
    if (e.body) e.body.held = true;
    for (const c of e.colliders) c.disabled = true;
    if (e.onPickup) e.onPickup();
    if (G.audio) G.audio.play('pickup');
  }

  drop(silent = false) {
    const P = G.player;
    if (!P.held) return;
    const e = P.held.entity;
    P.held = null;
    if (e.body) { e.body.held = false; e.body.vx = P.velocity.x; e.body.vy = 0; e.body.vz = P.velocity.z; e.body.sleeping = false; }
    for (const c of e.colliders) c.disabled = false;
    if (e.onDrop) e.onDrop();
    if (!e.body) {
      const g = G.world.colliders.groundHeight(e.root.position.x, e.root.position.z, 0.2, e.root.position.y, 5);
      e.root.position.y = g;
      G.registry.refresh(e);
    }
    if (!silent && G.audio) G.audio.play('bounce');
  }

  throw() {
    const P = G.player;
    if (!P.held) return false;
    const e = P.held.entity;
    this.drop(true);
    const dir = P.lookDir(new THREE.Vector3());
    if (e.body) {
      const mass = e.body.mass || 1;
      const sp = 14 / Math.sqrt(Math.max(0.3, mass));
      e.body.vx = dir.x * sp + P.velocity.x; e.body.vy = dir.y * sp + 3; e.body.vz = dir.z * sp + P.velocity.z;
      e.body.spin = (Math.random() - 0.5) * 12;
    }
    if (G.audio) G.audio.play('throw');
    return true;
  }
}

function resolveAction(interact, e) {
  const label = typeof interact.label === 'function' ? interact.label() : interact.label;
  if (!label) return null;
  return { label, run: () => interact.action(e, G.player) };
}

// Recursive raycast that honours userData.noRaycast and skips sprites/points/lines.
function raycastTree(ray, obj, out) {
  if (!obj.visible || obj.userData.noRaycast) return;
  if ((obj.isMesh || obj.isInstancedMesh) && !obj.isSprite) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const invisible = mats.every((m) => !m || m.visible === false || (m.transparent && m.opacity < 0.05) || m.blending === THREE.AdditiveBlending);
    if (!invisible) obj.raycast(ray, out);
  }
  for (const c of obj.children) raycastTree(ray, c, out);
}
