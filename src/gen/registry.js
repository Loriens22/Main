// Entity registry: owns every generated entity, wires it into its world
// (scene graph, colliders, lights, terrain footprint, vegetation clearing),
// resolves references like "that", "the red car" or "all trees", supports
// undo/delete with full GPU resource cleanup, and serialises the world.

import * as THREE from 'three';
import { G } from '../core/context.js';
import { disposeObject } from '../core/jobs.js';

let ENTITY_ID = 1;

export class Entity {
  constructor(data) { initEntity(this, data); }
  get position() { return this.root.position; }
  worldBox() { return new THREE.Box3().setFromObject(this.root); }
  headPos(out = new THREE.Vector3()) {
    if (this.humanoid && this.humanoid.bones) { this.humanoid.bones[5].getWorldPosition(out); return out.add(new THREE.Vector3(0, 0.15 * this.scale, 0)); }
    return out.copy(this.root.position).add(new THREE.Vector3(0, (this.height || 1.5) * this.scale, 0));
  }
}

// Turn a generator result object into an Entity *in place*. Generators hand
// out closures (update, interact, NPC brains...) that capture their data
// object, so the entity must be that same object for those closures to see
// runtime fields such as worldId, colliders and scale.
export function makeEntity(data, extra = {}) {
  Object.setPrototypeOf(data, Entity.prototype);
  return initEntity(data, { ...data, ...extra });
}

function initEntity(e, data) {
  Object.assign(e, data);
  e.id = data.id || ENTITY_ID++;
  ENTITY_ID = Math.max(ENTITY_ID, e.id + 1);
  e.colliders = [];
  e.lightReqs = [];
  e.scale = e.scale || 1;
  e.createdAt = performance.now();
  if (e.root) e.root.userData.entity = e;
  return e;
}

export class Registry {
  constructor() {
    this.entities = new Map();
    this.order = [];
    this.lastBatch = [];
    this.listeners = new Set();
  }

  on(fn) { this.listeners.add(fn); }
  _emit(type, e) { for (const fn of this.listeners) fn(type, e); }

  list() { return [...this.entities.values()].sort((a, b) => b.id - a.id); }
  get(id) { return this.entities.get(id); }

  add(entity, world, opts = {}) {
    const e = entity instanceof Entity ? entity : new Entity(entity);
    e.worldId = world.id;
    this.entities.set(e.id, e);
    this.order.push(e.id);
    world.entities.add(e);
    world.scene.add(e.root);
    e.root.updateMatrixWorld(true);
    this._applyFootprint(e, world, opts);
    this._applyColliders(e, world);
    // Lights.
    if (e.lights && world.lightPool) {
      for (const L of e.lights) {
        const local = new THREE.Vector3().fromArray(L.pos || [0, 1, 0]);
        const req = {
          getPosition: (out) => { const obj = L.object || e.root; return out.copy(local).applyMatrix4(obj.matrixWorld); },
          color: L.color, intensity: L.intensity, distance: (L.distance || 10) * e.scale, nightOnly: L.nightOnly, flicker: L.flicker, enabled: true,
        };
        e.lightReqs.push(req);
        world.lightPool.add(req);
      }
    }
    G.materials.retainTree(e.root);
    if (!opts.silent && G.materializer) G.materializer.start(e.root, world.scene);
    if (e.onAdded) e.onAdded(world);
    this._emit('add', e);
    return e;
  }

  _applyFootprint(e, world, opts = {}) {
    // Terrain footprint: flatten under buildings, suppress grass, clear trees.
    if (world.terrain && e.footprint && !e.floating && !opts.noTerrain) {
      const fp = e.footprint;
      const x = e.root.position.x, z = e.root.position.z;
      if (e.flattenTerrain) {
        const rect = fp.rect ? { hw: fp.rect.hw * e.scale + 0.5, hd: fp.rect.hd * e.scale + 0.5, yaw: e.root.rotation.y } : null;
        const op = rect
          ? { type: 'flatten', shape: 'rect', x, z, hw: rect.hw, hd: rect.hd, yaw: rect.yaw, radius: Math.hypot(rect.hw, rect.hd), height: e.root.position.y - 0.02, falloff: e.flattenFalloff ?? 6, owner: e.id }
          : { type: 'flatten', x, z, radius: fp.radius * e.scale, height: e.root.position.y - 0.02, falloff: e.flattenFalloff ?? 5, owner: e.id };
        world.terrain.applyEdit(op);
        // Extra local terrain operations (pool pits, ponds, moats...).
        for (const t of e.terrainOps || []) {
          const lp = new THREE.Vector3(t.x || 0, 0, t.z || 0).applyMatrix4(e.root.matrixWorld);
          world.terrain.applyEdit({ ...t, x: lp.x, z: lp.z, yaw: (t.yaw || 0) + e.root.rotation.y, hw: t.hw !== undefined ? t.hw * e.scale : undefined, hd: t.hd !== undefined ? t.hd * e.scale : undefined, radius: (t.radius || 1) * e.scale, height: t.heightRel !== undefined ? e.root.position.y + t.heightRel * e.scale : t.height, owner: e.id });
        }
        if (world.vegetation) world.vegetation.reseat(x, z, op.radius + op.falloff + 2);
      }
      if (e.suppressGrass !== false && (e.flattenTerrain || fp.radius > 1.2)) {
        const pr = fp.rect
          ? { type: 'paint', shape: 'rect', x, z, hw: fp.rect.hw * e.scale * (e.grassPad ?? 0.95), hd: fp.rect.hd * e.scale * (e.grassPad ?? 0.95), yaw: e.root.rotation.y, radius: Math.hypot(fp.rect.hw, fp.rect.hd) * e.scale, channel: 3, value: 255, falloff: 0.5, owner: e.id }
          : { type: 'paint', x, z, radius: fp.radius * e.scale * 0.8, channel: 3, value: 255, falloff: 0.5, owner: e.id };
        world.terrain.applyEdit(pr);
      }
      for (const pg of e.paintGround || []) {
        const lp = new THREE.Vector3(pg.x || 0, 0, pg.z || 0).applyMatrix4(e.root.matrixWorld);
        world.terrain.applyEdit({ ...pg, owner: e.id, type: 'paint', x: lp.x, z: lp.z, yaw: (pg.yaw || 0) + e.root.rotation.y, points: pg.points ? pg.points.map(([px, pz]) => { const v = new THREE.Vector3(px, 0, pz).applyMatrix4(e.root.matrixWorld); return [v.x, v.z]; }) : undefined });
      }
    }
    if (world.vegetation && e.footprint && !e.floating && !opts.noClear && !e.keepVegetation) {
      const fp = e.footprint;
      if (fp.rect) world.vegetation.clearArea(e.root.position.x, e.root.position.z, 0, { hw: fp.rect.hw * e.scale + 1.5, hd: fp.rect.hd * e.scale + 1.5, yaw: e.root.rotation.y });
      else if (fp.radius > 0.8) world.vegetation.clearArea(e.root.position.x, e.root.position.z, fp.radius * e.scale + 0.5);
    }
  }

  _applyColliders(e, world) {
    for (const c of e.colliders) world.colliders.remove(c);
    e.colliders = [];
    if (!e.colliderDefs) return;
    const m = e.root.matrixWorld;
    const s = e.root.scale.x; // generators build at unit scale; user scaling lives on root.scale
    const yaw = e.root.rotation.y;
    for (const d of e.colliderDefs) {
      const p = new THREE.Vector3(d.x || 0, d.y0 || 0, d.z || 0).applyMatrix4(m);
      const h = ((d.y1 ?? 1) - (d.y0 ?? 0)) * s;
      if (d.type === 'cyl') e.colliders.push(world.colliders.cyl(p.x, p.z, p.y, p.y + h, d.r * s, { owner: e.id, walkable: d.walkable !== false, solid: d.solid !== false, tag: d.tag }));
      else e.colliders.push(world.colliders.add({ type: 'box', x: p.x, z: p.z, y0: p.y, y1: p.y + h, hx: d.hx * s, hz: d.hz * s, yaw: yaw + (d.yaw || 0), owner: e.id, walkable: d.walkable !== false, solid: d.solid !== false, tag: d.tag, door: d.door }));
    }
  }

  // Re-apply transform-dependent state after a move/rotate/scale.
  refresh(e, opts = {}) {
    const world = G.worlds.get(e.worldId);
    e.root.updateMatrixWorld(true);
    if (opts.terrain && world.terrain && (e.flattenTerrain || e.paintGround || e.suppressGrass !== false)) {
      world.terrain.revertOwner(e.id);
      this._applyFootprint(e, world, { noClear: false });
    }
    this._applyColliders(e, world);
    if (e.body) { e.body.x = e.root.position.x; e.body.z = e.root.position.z; e.body.y = e.root.position.y; }
    if (e.brain) e.brain.home.copy(e.root.position);
  }

  remove(id, opts = {}) {
    const e = this.entities.get(id);
    if (!e) return false;
    const world = G.worlds.get(e.worldId);
    if (G.materializer) G.materializer.cancel(e.root);
    if (e.onRemove) { try { e.onRemove(world); } catch (err) { console.warn(err); } }
    if (world) {
      world.scene.remove(e.root);
      if (world.terrain && !opts.keepTerrain && world.terrain.revertOwner(e.id) && world.vegetation) {
        world.vegetation.reseat(e.root.position.x, e.root.position.z, (e.footprint ? e.footprint.radius * e.scale : 5) + 10);
      }
      for (const c of e.colliders) world.colliders.remove(c);
      world.colliders.removeOwner(e.id);
      for (const r of e.lightReqs) world.lightPool && world.lightPool.remove(r);
      world.entities.delete(e);
    }
    if (e.dispose) { try { e.dispose(); } catch (err) { console.warn(err); } }
    G.materials.releaseTree(e.root);
    disposeObject(e.root);
    this.entities.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this._emit('remove', e);
    return true;
  }

  undo() {
    const id = this.order[this.order.length - 1];
    if (id === undefined) return null;
    const e = this.entities.get(id);
    this.remove(id);
    return e;
  }

  clear(worldId = null) {
    for (const e of [...this.entities.values()]) if (worldId === null || e.worldId === worldId) this.remove(e.id);
  }

  // Resolve a parsed reference to entities in the current world.
  findRef(ref, ctx) {
    const world = ctx.world;
    const inWorld = [...this.entities.values()].filter((e) => e.worldId === world.id);
    if (!ref) return [];
    if (ref.pronoun === 'it') {
      if (ctx.lookedAt) return [ctx.lookedAt];
      const last = this.order.slice().reverse().map((id) => this.entities.get(id)).find((e) => e && e.worldId === world.id);
      return last ? [last] : [];
    }
    if (ref.pronoun === 'prev') return ctx.prev ? [ctx.prev] : inWorld.length ? [inWorld.sort((a, b) => b.id - a.id)[0]] : [];
    if (ref.pronoun === 'them') return this.lastBatch.filter((e) => this.entities.has(e.id));
    if (ref.all && !ref.concept && !ref.name) return inWorld;
    let matches = inWorld.filter((e) => {
      if (ref.name && e.name && e.name.toLowerCase() === ref.name) return true;
      if (ref.concept && (e.concept === ref.concept || (e.gen === ref.gen && ref.gen !== 'human' && ref.gen !== 'creature'))) return true;
      if (ref.concept && e.gen === 'human' && ref.gen === 'human') return true;
      if (ref.concept && e.gen === 'creature' && ref.concept === e.concept) return true;
      if (ref.text && e.name && e.name.toLowerCase().includes(ref.text)) return true;
      return false;
    });
    if (ref.color) {
      const colored = matches.filter((e) => e.colorWord === ref.color);
      if (colored.length) matches = colored;
    }
    if (!matches.length) return [];
    if (ref.all) return matches;
    if (ctx.lookedAt && matches.includes(ctx.lookedAt)) return [ctx.lookedAt];
    const pp = ctx.player.position;
    matches.sort((a, b) => a.root.position.distanceTo(pp) - b.root.position.distanceTo(pp));
    return [matches[0]];
  }

  update(dt, camPos) {
    for (const e of this.entities.values()) {
      if (e.worldId !== G.world.id) continue;
      const anim = e.root.userData.animated;
      if (anim && anim.length && e.root.position.distanceTo(camPos) < 80) for (const fn of anim) fn(G.time, dt);
      if (e.update) {
        const d = e.root.position.distanceTo(camPos);
        e._updAcc = (e._updAcc || 0) + dt;
        // Far entities update at a lower rate.
        const interval = d < 40 ? 0 : d < 120 ? 0.1 : 0.4;
        if (e._updAcc >= interval) { e.update(e._updAcc, G.time, d); e._updAcc = 0; }
      }
      if (e.lod) {
        e._lodT = (e._lodT || 0) - dt;
        if (e._lodT <= 0) {
          e._lodT = 0.3;
          const d = e.root.position.distanceTo(camPos) / (e.scale || 1);
          for (const l of e.lod) l.object.visible = d <= l.maxDist;
        }
      }
    }
  }

  serialize() {
    return this.list().reverse().map((e) => ({
      id: e.id, worldId: e.worldId, item: e.item, seed: e.seed, copyIndex: e.copyIndex || 0, name: e.name,
      pos: e.root.position.toArray().map((v) => Math.round(v * 1000) / 1000), yaw: e.root.rotation.y, scale: e.scale,
      state: e.saveState ? e.saveState() : null, colorOverride: e.colorOverride || null, materialOverride: e.materialOverride || null,
    }));
  }
}
