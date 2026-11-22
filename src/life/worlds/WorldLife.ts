import * as THREE from 'three';
import type { SurfaceZone } from '../../world/space/SurfaceZone';
import type { Model } from '../../render/Assets';
import { W } from '../../render/patch';
import type { Fixture } from '../../render/LightPool';
import { Ecosystem, type LifeWorld } from '../Ecosystem';
import { Creature, type Contact, type Habitat } from '../Creature';
import type { SpeciesDef } from '../species';
import { codex } from '../Codex';
import { Submersible } from '../../vehicles/Submersible';
import type { Schools, SchoolStimulus } from './Schools';
import type { Underwater } from './Underwater';
import { ui } from '../../ui/store';
import { bus } from '../../core/events';
import { clamp } from '../../core/math';
import { GROUP, groups, type RAPIER } from '../../physics/Physics';
import { mission } from '../../mission/Mission';
import type { Flight } from '../../vehicles/Flight';
import type { Interactable } from '../../player/Interaction';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const _tint = new THREE.Color();
export const UP = new THREE.Vector3(0, 1, 0);

export interface Spot { pos: THREE.Vector3; den?: THREE.Vector3; heading?: number }
/** water optics: extinction along a sight line (1/m), downwelling attenuation with depth (1/m), in-scattered colour */
export interface WaterOptics { ext: number; att: number; col: [number, number, number] }
/** where the view meets water: the level at the camera, and the horizontal extent (x, z, radius; radius 0 = everywhere) */
export interface WaterView { level: number; region: [number, number, number]; curve: number }

/**
 * The shared machinery of a living world, between its animals and the crew: what the animals can sense of each
 * other and of the crew (contacts), what follows from contact (strikes, feeding), what the crew can see of them
 * (light, water clarity, line of sight) and record in the field codex (sightings, sonar, scans), the submersible or
 * ROV, and the view under water. Each world supplies its physical environment: ground, water, light, currents,
 * hazards and refuges, and its habitats.
 */
export abstract class WorldLife implements LifeWorld {
  abstract planet: string;
  habitat: Habitat;
  eco!: Ecosystem;
  root = new THREE.Group();
  sub: Submersible | null = null;
  /** the camera is under water, how deep, and the exposure the eye adapts to there */
  underwater = false;
  camDepth = 0;
  exposureGain = 1;
  protected time = 0;
  protected frame = 0;
  private cFrame = -1;
  private cList: Contact[] = [];
  private cPlayer: Contact = { id: 'player', kind: 'player', pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1.8, light: 0, noise: 0.2 };
  private cSub: Contact = { id: 'sub', kind: 'sub', pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 4, light: 1, noise: 0.3 };
  private cRanger: Contact = { id: 'ranger', kind: 'object', pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 12, light: 0.2, noise: 0 };
  protected cCreature = new Map<string, Contact>();
  protected tags = new Map<string, Spot[]>();
  private tagNext = new Map<string, number>();
  protected colliders: RAPIER.Collider[] = [];
  protected colliderSet = new Set<number>();
  protected schools: Schools | null = null;
  protected water: Underwater | null = null;
  protected interacts: Interactable[] = [];
  protected lure: Fixture | null = null;
  protected subModel: Model | null = null;
  /** the vehicle is an ROV flown from where the crew member stands (no cabin), rather than a crewed submersible */
  protected remoteSub = false;
  protected ready = false;
  protected disposed = false;
  protected optics: WaterOptics = { ext: 0.05, att: 0.03, col: [0.012, 0.058, 0.07] };
  private sightT = 0;
  private sonarT = 0;
  private sonarN = 0;
  private lastSight = new Map<string, number>();
  protected scanning: { c: Creature; t: number } | null = null;
  private stirs = [0, 1, 2, 3].map(() => new THREE.Vector4());
  /** work that needs new colliders in the physics queries (they are indexed by the next step): run two steps on */
  private afterSteps: { n: number; fn: () => void }[] = [];

  constructor(public zone: SurfaceZone, name: string) {
    this.root.name = name;
    zone.root.add(this.root);
    this.habitat = this.makeHabitat();
    zone.sites.cabin = () => !!this.sub?.piloted && !this.remoteSub;
  }

  /** create the population (after the habitats are laid out, since individuals are given homes from them) */
  protected startEcosystem(saved?: any) {
    this.eco = new Ecosystem(this, this.root, saved);
    this.eco.onSpawn = (c) => this.spawned(c);
    this.eco.onDespawn = (c) => this.cCreature.delete(c.id);
  }

  get game() { return this.zone.game; }

  abstract species(): SpeciesDef[];
  /** the ground (terrain and other solid floor) */
  protected abstract ground(x: number, z: number): number;
  /** the water surface at a point, or null where there is no water */
  abstract surface(x: number, z: number): number | null;
  /** daylight (or other ambient light) at a point, 0..1 */
  abstract lightAt(p: THREE.Vector3): number;
  protected abstract current(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  protected abstract hazard(p: THREE.Vector3): { state: number; cue: number };
  protected abstract refuge(c: Creature): THREE.Vector3 | null;
  /** the floor animals stand on (the ground unless the world adds rock on top) */
  protected floorAt(x: number, z: number) { return this.ground(x, z); }
  protected nestOf(_c: Creature): { stones: number; max: number; pile: THREE.Vector3 } | null { return null; }
  protected placeStoneFor(_c: Creature) {}
  protected bloomNear(_c: Creature): THREE.Vector3 | null { return null; }
  /** the water the camera may be in (null: none here) */
  protected waterView(_cam: THREE.Vector3): WaterView | null { return null; }
  /** how much daylight reaches the camera (caves: little), 0..1 */
  protected daylight(_cam: THREE.Vector3) { return 1; }
  /** the scanner's reach (m) */
  protected scanRange(): number { return this.sub?.piloted ? 34 : 15; }
  /** how far animals can be made out in open air, relative to the default (clear thin air or haze) */
  protected sightScale(): number { return 1; }

  // ============================================================================================ habitats
  protected addSpot(tag: string, s: Spot) { if (!this.tags.has(tag)) this.tags.set(tag, []); this.tags.get(tag)!.push(s); }

  spots(tag: string, n: number, _seed: number) {
    const list = this.tags.get(tag) ?? [];
    const out: Spot[] = [];
    if (!list.length) return out;
    for (let i = 0; i < n; i++) {
      const k = this.tagNext.get(tag) ?? 0;
      this.tagNext.set(tag, k + 1);
      const s = list[k % list.length];
      out.push({ pos: s.pos.clone(), den: s.den?.clone(), heading: s.heading });
    }
    return out;
  }

  /** a model placed in the world, with its collision */
  protected put(m: Model, pos: THREE.Vector3, yaw: number, scale = 1, collide = true) {
    m.root.position.copy(pos);
    m.root.rotation.set(0, yaw, 0);
    m.root.scale.setScalar(scale);
    m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.root.add(m.root);
    m.root.updateMatrixWorld(true);
    if (collide) for (const c of this.zone.phys.addTrimesh(m.colliders)) { this.colliders.push(c); this.colliderSet.add(c.handle); }
    return m;
  }

  private spawned(c: Creature) {
    this.cCreature.set(c.id, { id: c.id, kind: 'creature', pos: c.pos, vel: c.vel, size: c.length, light: 0, noise: 0.1, ref: c, species: c.def.id });
  }

  // ============================================================================================ the physical world
  private makeHabitat(): Habitat {
    const self = this;
    return {
      get time() { return self.time; },
      floor: (x, z) => this.floorAt(x, z),
      surface: (x, z) => this.surface(x, z),
      ray: (o, d, max) => {
        const n = Math.max(4, Math.min(24, Math.ceil(max / 2)));
        for (let i = 1; i <= n; i++) {
          const t = (max * i) / n;
          const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
          if (y < this.ground(x, z)) return t;
        }
        const hit = this.zone.phys.raycast(o, d, max, groups(0xffff, GROUP.WORLD));
        return hit ? hit.dist : null;
      },
      light: (p) => this.lightAt(p),
      current: (p, out) => this.current(p, out),
      hazard: (p) => this.hazard(p),
      refuge: (c) => this.refuge(c),
      contacts: () => this.contacts(),
      strike: (c, t, sev) => this.strike(c, t, sev),
      feed: (c, t) => this.feed(c, t),
      observe: (c, what) => { if (this.time - c.seenT < 1.5) codex.observe(c.def.id, what); },
      nest: (c) => this.nestOf(c),
      placeStone: (c) => this.placeStoneFor(c),
      group: (c) => this.eco.members(c.groupId).filter((m) => m !== c),
      bloom: (c) => this.bloomNear(c),
    };
  }

  // ============================================================================================ contacts and their consequences
  protected contacts(): Contact[] {
    if (this.cFrame === this.frame) return this.cList;
    this.cFrame = this.frame;
    const L = this.cList;
    L.length = 0;
    const g = this.game, flight = g.services.flight as Flight;
    const sub = this.sub;
    if (g.zone === this.zone && !flight.craft && !(sub?.piloted && !this.remoteSub)) {
      const p = this.cPlayer;
      p.pos.copy(g.player.pos).addScaledVector(UP, 0.9);
      p.vel.copy(g.player.vel);
      const sp = Math.hypot(p.vel.x, p.vel.z);
      const s = this.surface(p.pos.x, p.pos.z);
      p.noise = clamp(sp / 5, 0.05, 1) * (s !== null && s > g.player.pos.y ? 1 : 0.6);
      p.light = this.zone.helmetOn ? 0.8 : 0;
      L.push(p);
    }
    if (sub) {
      const s = this.cSub;
      s.pos.copy(sub.pos).addScaledVector(UP, 1.1 * sub.scale);
      s.vel.copy(sub.vel);
      s.size = 4 * sub.scale;
      s.light = sub.lights ? 1 : 0;
      s.noise = 0.12 + sub.thrust * 0.88;
      s.ref = sub;
      L.push(s);
    }
    const r = this.cRanger;
    r.pos.copy(this.zone.ranger.root.position);
    L.push(r);
    for (const c of this.cCreature.values()) {
      const cr = c.ref as Creature;
      c.light = cr.def.archetype === 'lure' ? cr.display : 0;
      c.noise = 0.08 + 0.5 * Math.min(1, cr.speed / Math.max(0.1, cr.def.speed.burst));
      c.size = cr.length * (1 - cr.hidden * 0.5);
      L.push(c);
    }
    if (this.schools) for (const s of this.schools.list) if (this.schools.alive(s) > 0) L.push(s.contact);
    return L;
  }

  protected strike(c: Creature, t: Contact, sev: number) {
    const g = this.game;
    const near = c.pos.distanceTo(g.renderer.camera.position) < 60;
    if (near) bus.emit('sfx', { id: 'thud', ui: true, gain: clamp(sev * 1.5, 0.2, 1) });
    const known = codex.level(c.def.id) >= 2;
    switch (t.kind) {
      case 'player': {
        _v.copy(g.player.pos).sub(c.pos).setY(0);
        if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0);
        g.player.carry(_v.normalize().multiplyScalar(1.2));
        g.renderer.shake = 0.02;
        const name = known ? `The ${c.def.name.toLowerCase()}` : 'Something';
        if (g.settings.creative.damageProtection) ui.toast(`${name} lunges at you · Creative Mode: no injury`, 'warn', 4);
        else if (sev >= 0.35) this.zone.sites.harm(`${name} strikes you: your visor cracks.`);
        else ui.toast(`${name} strikes your leg and lets go.`, 'warn', 4);
        mission.note(`Struck by ${known ? c.def.name : 'an unidentified animal'} on ${this.zone.body.name}.`);
        break;
      }
      case 'sub':
        this.sub?.impact(1.4 + sev * 7, known ? c.def.name.toLowerCase() : 'an animal');
        break;
      case 'creature': {
        const o = t.ref as Creature;
        o.injury = Math.min(1, o.injury + sev);
        o.stress = 1;
        o.learn(c.id, -0.6, this.habitat);
        break;
      }
    }
  }

  protected feed(c: Creature, t: Contact | null) {
    if (!t) return 0.2;
    if (t.kind === 'prey' && this.schools) return this.schools.take(t.ref) ? 0.35 : 0;
    if (t.kind === 'creature') {
      const o = t.ref as Creature;
      // small, numerous animals are taken outright; anything else is wounded and gets away
      if (o.length < c.length * 0.35 && o.def.population >= 12) { this.eco.kill(o.id); return 0.5; }
      o.injury = Math.min(1, o.injury + 0.3);
      o.stress = 1;
      return 0.1;
    }
    return 0;
  }

  // ============================================================================================ the submersible / ROV
  protected addInteract(i: Interactable) {
    (i as any).__scope = 'surface';
    this.game.interactions.add(i);
    (i as any).__scope = 'surface';
    this.interacts.push(i);
    return i;
  }

  protected deploy(p: THREE.Vector3, yaw: number, hull: number, scale = 1) {
    if (!this.subModel || this.sub) return;
    const W_ = {
      floor: (x: number, z: number) => this.floorAt(x, z),
      surface: (x: number, z: number) => this.surface(x, z) ?? -1e6,
      current: (q: THREE.Vector3, out: THREE.Vector3) => this.current(q, out),
    };
    this.sub = new Submersible(this.game, this.subModel, this.zone.phys, this.zone.lights, W_, { scale, remote: this.remoteSub });
    this.sub.hull = hull;
    this.root.add(this.sub.root);
    this.sub.place(p, yaw);
    this.sub.setLights(false);
  }

  /** out through the hatch (at the surface), or the ROV's controls put down */
  protected leaveSub() {
    const sub = this.sub!;
    const g = this.game;
    sub.leave((p) => {
      p.y = this.floorAt(p.x, p.z) + 0.05;
      g.player.stand(p, sub.yaw);
    });
  }

  /** run once the physics world has stepped past the colliders just added (ray queries then see them) */
  protected afterPhysics(fn: () => void) { this.afterSteps.push({ n: 2, fn }); }

  // ============================================================================================ update
  fixedUpdate(dt: number) {
    for (const a of this.afterSteps) if (--a.n === 0) a.fn();
    this.afterSteps = this.afterSteps.filter((a) => a.n > 0);
    if (!this.ready) return;
    const g = this.game, sub = this.sub;
    if (sub) {
      sub.fixedUpdate(dt);
      if (sub.piloted && g.input.pressed('interact') && !g.uiFocus) this.leaveSub();
    }
    this.time += dt;
  }

  update(dt: number) {
    this.frame++;
    if (!this.ready) return;
    const g = this.game, cam = g.renderer.camera;
    const camP = cam.getWorldPosition(new THREE.Vector3());
    this.eco.update(dt, camP);
    if (this.schools) {
      const stim: SchoolStimulus[] = [];
      for (const c of this.contacts()) {
        if (c.kind === 'prey' || c.kind === 'object') continue;
        const cr = c.ref as Creature | undefined;
        const predator = c.kind !== 'creature' || (cr && cr.length > 0.5 && cr.def.archetype !== 'filter' && cr.def.archetype !== 'grazer');
        stim.push({ pos: c.pos, light: c.light, threat: predator && (c.vel.length() > 0.3 || c.kind === 'creature') ? 1 : 0, size: c.size });
      }
      this.schools.update(dt, this.habitat, camP, stim);
    }
    this.updateView(dt, camP);
    this.updateLure(camP);
    this.sightings(camP, dt);
    this.updateScan(dt, camP);
    if (this.sub?.piloted) {
      this.sonarT -= dt;
      if (this.sonarT <= 0) { this.sonarT = 3; this.sonar(); }
      ui.set({ gauges: this.sub.hud() });
    }
  }

  /** being in the water, or out of daylight: the light at the camera, the eye adapting, the water round the view */
  private updateView(dt: number, cam: THREE.Vector3) {
    const z = this.zone, sky = z.sky;
    const wv = this.waterView(cam);
    const o = this.optics;
    if (wv) {
      W.uWater.value.set(1, wv.level, o.ext, o.att);
      W.uWaterCol.value.setRGB(...o.col);
      W.uWaterReg.value.set(wv.region[0], wv.region[1], wv.region[2], wv.curve);
      const inReg = wv.region[2] <= 0 || Math.hypot(cam.x - wv.region[0], cam.z - wv.region[1]) < wv.region[2];
      this.camDepth = inReg ? wv.level - (cam.x * cam.x + cam.z * cam.z) * wv.curve - cam.y : -1;
    } else {
      W.uWater.value.x = 0;
      this.camDepth = -1;
    }
    this.underwater = this.camDepth > 0.02;
    const d = Math.max(0, this.camDepth);
    const k = Math.exp(-d * o.att);
    const day = this.daylight(cam);
    if (this.underwater) sky.sun.color.multiply(_tint.setRGB(Math.exp(-d * o.att * 1.2), 1, Math.min(1.4, Math.exp(d * o.att * 0.25))));
    if (this.underwater || day < 1) {
      // sunlight dimmed by the water over the camera, or shut out by rock overhead
      const f = (this.underwater ? k : 1) * day;
      sky.sun.intensity *= f;
      sky.fill.intensity *= f;
      z.game.renderer.scene.environmentIntensity *= 0.03 + 0.97 * (this.underwater ? 0.15 + 0.85 * k : 1) * day;
    }
    const lit = (this.underwater ? k : 1) * Math.max(day, 0.002);
    const want = lit < 0.999 ? clamp(1 / Math.sqrt(Math.max(lit, 0.04)), 1, 4) : 1;
    this.exposureGain += (want - this.exposureGain) * Math.min(1, dt * 0.8);
    if (!this.water) return;
    const r = this.game.renderer;
    const px = r.height / (2 * Math.tan(((r.camera as THREE.PerspectiveCamera).fov * Math.PI) / 360));
    const sub = this.sub;
    let lamp = null;
    if (sub) {
      sub.forward(_u);
      lamp = { pos: sub.pos.clone().addScaledVector(UP, 0.45 * sub.scale).addScaledVector(_u, 1.85 * sub.scale), dir: _u.clone().addScaledVector(UP, -0.14).normalize(), on: sub.lights };
    }
    // what stirs the water: the sub's thrusters, the fastest animals near the camera
    let n = 0;
    if (sub && sub.thrust > 0.05) this.stirs[n++].set(sub.pos.x, sub.pos.y + 1, sub.pos.z, sub.thrust * 1.5);
    for (const c of this.eco.live.values()) {
      if (n >= 4) break;
      if (c.speed > c.def.speed.cruise * 1.5 && c.pos.distanceTo(cam) < 50) this.stirs[n++].set(c.pos.x, c.pos.y, c.pos.z, Math.min(2, c.speed / 3));
    }
    for (let i = n; i < 4; i++) this.stirs[i].set(0, -1e5, 0, 0);
    this.water.update(dt, cam, this.underwater, this.camDepth, this.lightAt(cam), px, lamp, this.stirs);
  }

  /** the brightest lure near the camera lights the rock round it */
  private updateLure(cam: THREE.Vector3) {
    const f = this.lure;
    if (!f) return;
    let best: Creature | null = null, bd = 60;
    for (const c of this.eco.live.values()) {
      if (c.def.archetype !== 'lure' || c.display < 0.2) continue;
      const d = c.pos.distanceTo(cam);
      if (d < bd) { bd = d; best = c; }
    }
    f.on = !!best;
    if (best) {
      f.node = best.rig.bones.get('luree')?.bone ?? best.root;
      f.level = best.display;
    }
  }

  /** what the crew can see of the animals (light, water clarity, line of sight), and the codex records it makes */
  private sightings(cam: THREE.Vector3, dt: number) {
    this.sightT -= dt;
    if (this.sightT > 0) return;
    this.sightT = 0.25;
    const g = this.game, camO = g.renderer.camera;
    const dir = camO.getWorldDirection(new THREE.Vector3());
    const sub = this.sub;
    const lampOn = !!sub?.lights && !!sub?.piloted;
    const helmet = this.zone.helmetOn && !sub?.piloted;
    if (sub) sub.forward(_u);
    for (const c of this.eco.live.values()) {
      _v.copy(c.pos).sub(cam);
      const d = _v.length();
      if (d > 160 * this.sightScale()) continue;
      if (d > c.length && _v.dot(dir) / d < 0.64) continue;
      const amb = this.lightAt(c.pos);
      const s = this.surface(c.pos.x, c.pos.z);
      const below = s === null ? 0 : Math.max(0, s - c.pos.y);
      let R: number;
      if (this.underwater) R = 6 + 48 * amb;
      else R = below > 1.2 ? 5 + 18 * amb : 6 + 134 * amb;
      if (lampOn) {
        _w.copy(c.pos).sub(sub!.pos);
        const ld = _w.length();
        if (ld < 40 * sub!.scale + 8 && _w.dot(_u) / ld > 0.82) R = Math.max(R, 40 * sub!.scale + 8);
      }
      if (helmet && _v.dot(dir) / d > 0.9) R = Math.max(R, 28);
      if (c.def.archetype === 'lure') R = Math.max(R, 30 * c.display);
      R *= clamp(0.55 + 0.3 * Math.sqrt(c.length), 0.5, 2.2) * (1 - 0.7 * c.hidden) * (this.underwater ? 1 : this.sightScale());
      if (d > R) continue;
      _v.divideScalar(d);
      if (this.habitat.ray(cam, _v, Math.max(0, d - c.length * 0.6)) !== null) continue;
      c.seenT = this.time;
      const last = this.lastSight.get(c.id) ?? -1e9;
      if (this.time - last > 20 && d < R * 0.75) {
        this.lastSight.set(c.id, this.time);
        codex.sight(c.def.id, c.id, c.length);
      }
    }
  }

  /** the vehicle's sonar: echoes of anything large enough in range, whether seen or not */
  private sonar() {
    const sub = this.sub!;
    if (!sub.submerged) { this.sonarN = 0; return; }
    let n = 0;
    for (const c of this.eco.live.values()) {
      if (c.def.medium !== 'water' || c.pos.distanceTo(sub.pos) > 160 || c.length < 0.4) continue;
      n++;
      if (this.time - c.seenT > 10) codex.contact(c.def.id);
    }
    if (n && !this.sonarN) bus.emit('sfx', { id: 'beep', ui: true, gain: 0.4 });
    this.sonarN = n;
  }

  /** R: scan the animal at the centre of view (range and light limited); it has to stay in view for the scan */
  private updateScan(dt: number, cam: THREE.Vector3) {
    const g = this.game;
    const flight = g.services.flight as Flight;
    const dir = g.renderer.camera.getWorldDirection(new THREE.Vector3());
    const range = this.scanRange();
    const aim = (c: Creature) => {
      _v.copy(c.pos).sub(cam);
      const d = _v.length();
      return d < range + c.length * 0.5 && this.time - c.seenT < 0.6 ? Math.acos(clamp(_v.dot(dir) / d, -1, 1)) : 9;
    };
    if (g.input.pressed('scan') && !g.uiFocus && g.zone === this.zone && !flight.craft) {
      let best: Creature | null = null, ba = 0.28;
      for (const c of this.eco.live.values()) { const a = aim(c); if (a < ba) { ba = a; best = c; } }
      if (best) { this.scanning = { c: best, t: 0 }; bus.emit('sfx', { id: 'beep', ui: true, gain: 0.5 }); }
      else { ui.toast(`Nothing to scan in view (range ${range} m; it has to be seen clearly)`, 'info', 3); bus.emit('sfx', { id: 'ui_deny', ui: true }); }
    }
    const s = this.scanning;
    if (!s) return;
    if (!this.eco.live.has(s.c.id) || aim(s.c) > 0.45) {
      this.scanning = null;
      ui.toast('Scan interrupted: keep the animal in view', 'warn', 3);
      return;
    }
    s.t += dt;
    if (s.t >= 2.5) {
      this.scanning = null;
      const c = s.c;
      codex.scan(c.def.id, c.id, c.length);
      const name = codex.level(c.def.id) >= 2 ? c.def.name : 'Unidentified';
      ui.toast(`Scan complete · ${name} · ${c.length.toFixed(c.length < 1 ? 2 : 1)} m · ${c.doing}`, 'good', 5);
      bus.emit('sfx', { id: 'chime', ui: true });
    }
  }

  /** HUD lines: the scan in progress, sonar contacts */
  hud(): { label: string; value: string; warn?: boolean }[] {
    const out: { label: string; value: string; warn?: boolean }[] = [];
    if (this.scanning) out.push({ label: 'SCAN', value: `${Math.min(99, Math.round((this.scanning.t / 2.5) * 100))} %` });
    if (this.sub?.piloted) out.push({ label: 'SONAR', value: this.sonarN ? `${this.sonarN} contact${this.sonarN > 1 ? 's' : ''} within 160 m` : 'clear' });
    return out;
  }

  /** what the world keeps for the next visit */
  protected abstract save(): void;

  dispose() {
    this.disposed = true;
    if (this.eco) this.save();
    if (this.sub?.piloted) this.leaveSub();
    this.eco?.dispose();
    this.sub?.dispose();
    this.schools?.dispose();
    this.water?.dispose();
    if (this.lure) this.zone.lights.remove(this.lure);
    for (const i of this.interacts) this.game.interactions.remove(i);
    this.zone.phys.remove(this.colliders);
    this.zone.sites.cabin = null;
    W.uWater.value.x = 0;
    this.root.removeFromParent();
  }
}
