import * as THREE from 'three';
import { assets } from '../render/Assets';
import { Creature, hashRand, type Habitat } from './Creature';
import { BRAINS, type Brain } from './brains';
import { SPECIES, type SpeciesDef } from './species';

/** a persistent individual: exists whether or not it is loaded near the player */
export interface Individual {
  id: string;
  species: string;
  /** social group (members share it) */
  group: string;
  size: number;
  home: THREE.Vector3;
  den: THREE.Vector3 | null;
  pos: THREE.Vector3;
  heading: number;
  energy: number;
  injury: number;
  failures: number;
  alive: boolean;
  /** memory of the player and vehicles (contact id -> valence) */
  memory: Record<string, number>;
}

export interface LifeWorld {
  planet: string;
  habitat: Habitat;
  /** candidate home positions for a habitat tag (deterministic) */
  spots(tag: string, n: number, seed: number): { pos: THREE.Vector3; den?: THREE.Vector3; heading?: number }[];
  /** species present in this world under the current science mode */
  species(): SpeciesDef[];
}

/** how far from the camera a species is simulated in full and drawn (by body size) */
function activeRadius(def: SpeciesDef) {
  // in open air sight lines are long: flyers are simulated and drawn further out
  if (def.medium === 'air') return Math.min(900, Math.max(250, def.size[1] * 45));
  const L = def.size[1];
  if (L < 0.5) return 22;
  if (L < 3) return 90;
  if (L < 12) return 260;
  return 700;
}

/**
 * The living population of one world. Individuals are created once from fixed seeds (same animals on every visit),
 * keep their state, and are instantiated as full 3D creatures only near the player; far away they idle on a coarse
 * schedule (drift home, recover energy). Rare animals are never duplicated or respawned.
 */
export class Ecosystem {
  inds: Individual[] = [];
  live = new Map<string, Creature>();
  private loading = new Set<string>();
  group = new THREE.Group();
  private farT = 0;
  /** brains by species archetype, overridable per species */
  brains: Record<string, Brain> = { ...BRAINS };
  disposed = false;
  /** world hooks: a creature instantiated near the player / unloaded again */
  onSpawn: ((c: Creature) => void) | null = null;
  onDespawn: ((c: Creature) => void) | null = null;

  constructor(public world: LifeWorld, parent: THREE.Object3D, saved?: any) {
    this.group.name = `life:${world.planet}`;
    parent.add(this.group);
    this.populate();
    if (saved) this.deserialize(saved);
  }

  private populate() {
    for (const def of this.world.species()) {
      const n = def.population;
      const g = def.group ?? [1, 1];
      let made = 0, gi = 0;
      while (made < n) {
        const gs = Math.min(n - made, Math.round(g[0] + (g[1] - g[0]) * hashRand(def.id, 100 + gi)));
        const tag = def.habitat.tags[gi % def.habitat.tags.length];
        const homes = this.world.spots(tag, 1, gi * 31 + def.id.length);
        if (!homes.length) break;
        const h = homes[0];
        for (let k = 0; k < gs; k++) {
          const id = `${def.id}_${made}`;
          const size = def.size[0] + (def.size[1] - def.size[0]) * (0.35 + 0.65 * hashRand(id, 9));
          const jitter = (def.group ? Math.max(0.4, size * 3) : 0);
          const p = h.pos.clone().add(new THREE.Vector3((hashRand(id, 11) - 0.5) * jitter, 0, (hashRand(id, 12) - 0.5) * jitter));
          this.inds.push({ id, species: def.id, group: `${def.id}_g${gi}`, size, home: p.clone(), den: h.den?.clone() ?? null, pos: p.clone(), heading: h.heading ?? hashRand(id, 13) * Math.PI * 2, energy: 0.6, injury: 0, failures: 0, alive: true, memory: {} });
          made++;
        }
        gi++;
      }
    }
  }

  brainFor(def: SpeciesDef) { return this.brains[def.archetype] ?? BRAINS.grazer; }

  update(dt: number, cam: THREE.Vector3) {
    if (this.disposed) return;
    const H = this.world.habitat;
    // activation by distance
    for (const ind of this.inds) {
      if (!ind.alive) continue;
      const def = SPECIES[ind.species];
      const R = activeRadius(def);
      const live = this.live.get(ind.id);
      const d = (live ? live.pos : ind.pos).distanceTo(cam);
      if (!live && d < R && !this.loading.has(ind.id)) void this.spawn(ind, def);
      else if (live && d > R * 1.3) this.despawn(ind, live);
    }
    // full simulation near the player, coarse at the edge of the active range
    for (const c of this.live.values()) {
      const d = c.pos.distanceTo(cam);
      const full = d < activeRadius(c.def) * 0.8;
      c.update(dt, H, this.brainFor(c.def), full);
      c.root.visible = d < activeRadius(c.def) * 1.25;
    }
    // far individuals: drift home slowly, recover
    this.farT -= dt;
    if (this.farT <= 0) {
      this.farT = 2;
      for (const ind of this.inds) {
        if (this.live.has(ind.id) || !ind.alive) continue;
        ind.pos.lerp(ind.home, 0.05);
        ind.energy = Math.min(1, ind.energy + 0.002);
      }
    }
  }

  private async spawn(ind: Individual, def: SpeciesDef) {
    this.loading.add(ind.id);
    try {
      const m = await assets.load(def.model);
      if (this.disposed) return;
      const c = new Creature(ind.id, def, m, ind.size);
      c.energy = ind.energy; c.injury = ind.injury; c.failures = ind.failures;
      c.den = ind.den;
      c.groupId = ind.group;
      for (const [k, v] of Object.entries(ind.memory)) c.memory.set(k, { val: v, t: -1e9, pos: new THREE.Vector3() });
      this.group.add(c.root);
      c.place(ind.pos, ind.heading, this.world.habitat);
      c.home.copy(ind.home);
      c.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = def.size[1] > 0.5; o.frustumCulled = false; } });
      this.live.set(ind.id, c);
      this.onSpawn?.(c);
    } finally {
      this.loading.delete(ind.id);
    }
  }

  private despawn(ind: Individual, c: Creature) {
    this.store(ind, c);
    this.onDespawn?.(c);
    c.dispose();
    this.live.delete(ind.id);
  }

  private store(ind: Individual, c: Creature) {
    ind.pos.copy(c.pos);
    ind.heading = Math.atan2(-c.fwd.x, -c.fwd.z);
    ind.energy = c.energy; ind.injury = c.injury; ind.failures = c.failures;
    ind.memory = {};
    for (const [k, v] of c.memory) if (Math.abs(v.val) > 0.05) ind.memory[k] = v.val;
  }

  /** an animal dies (taken by a predator): it is gone for good */
  kill(id: string) {
    const ind = this.inds.find((i) => i.id === id);
    if (!ind) return;
    ind.alive = false;
    const c = this.live.get(id);
    if (c) { this.onDespawn?.(c); c.dispose(); this.live.delete(id); }
  }

  /** the live members of a group */
  members(group: string) {
    const out: Creature[] = [];
    for (const c of this.live.values()) if (c.groupId === group) out.push(c);
    return out;
  }

  /** every individual of a species, live or not (for the codex / tracking) */
  of(species: string) { return this.inds.filter((i) => i.species === species); }

  serialize() {
    for (const ind of this.inds) { const c = this.live.get(ind.id); if (c) this.store(ind, c); }
    return this.inds.map((i) => ({ id: i.id, p: i.pos.toArray().map((x) => Math.round(x * 100) / 100), h: i.heading, e: i.energy, j: i.injury, f: i.failures, a: i.alive, m: i.memory }));
  }

  deserialize(d: any[]) {
    if (!Array.isArray(d)) return;
    const by = new Map(this.inds.map((i) => [i.id, i]));
    for (const r of d) {
      const i = by.get(r.id);
      if (!i) continue;
      i.pos.fromArray(r.p); i.heading = r.h; i.energy = r.e; i.injury = r.j ?? 0; i.failures = r.f ?? 0; i.alive = r.a !== false; i.memory = r.m ?? {};
    }
  }

  dispose() {
    this.disposed = true;
    for (const c of this.live.values()) { this.onDespawn?.(c); c.dispose(); }
    this.live.clear();
    this.group.removeFromParent();
  }
}
