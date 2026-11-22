import * as THREE from 'three';
import type { SurfaceZone } from '../../world/space/SurfaceZone';
import { assets, type Model } from '../../render/Assets';
import { W } from '../../render/patch';
import type { Fixture } from '../../render/LightPool';
import { Ecosystem, type LifeWorld } from '../Ecosystem';
import { Creature, hashRand, type Contact, type Habitat } from '../Creature';
import { MILLER_SPECIES } from '../species';
import { codex } from '../Codex';
import { MILLER_BASIN, MILLER_RIFT, MILLER_ROCKS, MILLER_SANDS, riftQuery } from '../../world/terrain/sites';
import { curvatureDrop, MILLER_SEA_FLOOR } from '../../world/terrain/worlds';
import { MillerWave } from '../../render/MillerWave';
import { Submersible } from '../../vehicles/Submersible';
import { floatGeometry, Schools, type SchoolStimulus } from './Schools';
import { Underwater } from './Underwater';
import { ui } from '../../ui/store';
import { bus } from '../../core/events';
import { clamp } from '../../core/math';
import { GROUP, groups, type RAPIER } from '../../physics/Physics';
import { mission } from '../../mission/Mission';
import type { Flight } from '../../vehicles/Flight';
import type { Interactable } from '../../player/Interaction';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _tint = new THREE.Color();

/** what stays of Miller's life between visits (the same animals, the sub where it was left, the nest walls) */
const SAVED: { eco?: any; sub?: { p: number[]; yaw: number; hull: number } | null; nests?: number[] } = {};

/** water optics of Miller's sea: extinction along a sight line (1/m), downwelling attenuation with depth (1/m) */
const EXT = 0.05, ATT = 0.03;

interface Spot { pos: THREE.Vector3; den?: THREE.Vector3; heading?: number }
interface Placed { name: string; pos: THREE.Vector3; yaw: number; scale: number; model?: Model }
interface Nest { owner: string; centre: THREE.Vector3; pile: THREE.Vector3; stones: number; max: number; mesh?: THREE.InstancedMesh; waveCycle: number }
/** the tops of an outcrop's blocks on a grid (ground animals walk on them) */
interface Raster { x0: number; z0: number; n: number; step: number; h: Float32Array }

// marker positions authored in Blender (x, z, -y in three's frame; see blender/assets/miller_env.py)
const DEN_MOUTH = new THREE.Vector3(0, 1.6, 1.0);
const NOTCH = new THREE.Vector3(0.2, 0, 1.8);

/**
 * The life of Miller's planet (original speculative worldbuilding for the game): the habitats of the rift and the
 * flats, the physical world its animals sense (the tide's precursors, the surge, light falling off with depth,
 * refuges), what they can sense of each other and of the crew, and what follows from contact. Also the crew's side:
 * the research submersible, sightings, scans and sonar contacts for the field codex, and the view under water.
 */
export class MillerLife implements LifeWorld {
  planet = 'miller';
  habitat: Habitat;
  eco: Ecosystem;
  root = new THREE.Group();
  sub: Submersible | null = null;
  /** the camera is under water, how deep, and the exposure the eye adapts to there */
  underwater = false;
  camDepth = 0;
  exposureGain = 1;
  private time = 0;
  private frame = 0;
  private cFrame = -1;
  private cList: Contact[] = [];
  private cPlayer: Contact = { id: 'player', kind: 'player', pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1.8, light: 0, noise: 0.2 };
  private cSub: Contact = { id: 'sub', kind: 'sub', pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 4, light: 1, noise: 0.3 };
  private cRanger: Contact = { id: 'ranger', kind: 'object', pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 12, light: 0.2, noise: 0 };
  private cCreature = new Map<string, Contact>();
  private tags = new Map<string, Spot[]>();
  private tagNext = new Map<string, number>();
  private outcrops: Placed[] = [];
  private overhangs: Placed[] = [];
  private vents: Placed[] = [];
  private nests: Nest[] = [];
  private rasters: Raster[] = [];
  private colliders: RAPIER.Collider[] = [];
  private schools: Schools | null = null;
  private water: Underwater;
  private bloomC: { c: THREE.Vector3; a: number; r: number; o: THREE.Vector3 }[] = [];
  private interacts: Interactable[] = [];
  private lure: Fixture | null = null;
  private subModel: Model | null = null;
  private colliderSet = new Set<number>();
  private ready = false;
  private disposed = false;
  private sightT = 0;
  private sonarT = 0;
  private sonarN = 0;
  private lastSight = new Map<string, number>();
  private scanning: { c: Creature; t: number } | null = null;
  private warnT = 0;
  private sweptCycle = -1;
  private stirs = [0, 1, 2, 3].map(() => new THREE.Vector4());
  private cum: number[] = [];
  private total = 0;

  constructor(public zone: SurfaceZone) {
    this.root.name = 'miller-life';
    zone.root.add(this.root);
    this.habitat = this.makeHabitat();
    this.measureRift();
    this.layout();
    this.water = new Underwater(this.bloomC.map((b) => b.c));
    this.root.add(this.water.group);
    this.eco = new Ecosystem(this, this.root, SAVED.eco);
    this.eco.onSpawn = (c) => this.spawned(c);
    this.eco.onDespawn = (c) => this.cCreature.delete(c.id);
    zone.sites.cabin = () => !!this.sub?.piloted;
    void this.load();
  }

  get game() { return this.zone.game; }

  species() { return MILLER_SPECIES; }

  // ============================================================================================ the rift's geometry
  private measureRift() {
    this.cum = [0];
    for (let i = 0; i < MILLER_RIFT.length - 1; i++) this.cum.push(this.cum[i] + Math.hypot(MILLER_RIFT[i + 1].x - MILLER_RIFT[i].x, MILLER_RIFT[i + 1].z - MILLER_RIFT[i].z));
    this.total = this.cum[this.cum.length - 1];
  }

  /** a point on the rift's centre line at fraction t of its length, its tangent and nominal half-width */
  private rift(t: number) {
    const s = clamp(t, 0, 1) * this.total;
    let i = 0;
    while (i < MILLER_RIFT.length - 2 && this.cum[i + 1] < s) i++;
    const a = MILLER_RIFT[i], b = MILLER_RIFT[i + 1];
    const L = this.cum[i + 1] - this.cum[i], f = (s - this.cum[i]) / L;
    const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, tx, tz, w: a.w + (b.w - a.w) * f };
  }

  /** the ground (terrain only) */
  private ground(x: number, z: number) { return this.zone.terrain ? this.zone.terrain.source.height(x, z) : MILLER_SEA_FLOOR; }

  /** the foot of the canyon wall on one side at t: where the floor starts to climb steeply */
  private wallFoot(t: number, side: number) {
    const r = this.rift(t);
    const nx = -r.tz * side, nz = r.tx * side;
    for (let d = r.w * 0.55; d < r.w * 3; d += 1) {
      const h0 = this.ground(r.x + nx * (d - 1), r.z + nz * (d - 1)), h1 = this.ground(r.x + nx * (d + 1), r.z + nz * (d + 1));
      if ((h1 - h0) / 2 > 0.8) {
        const x = r.x + nx * (d - 2.5), z = r.z + nz * (d - 2.5);
        return { x, z, y: this.ground(x, z), toCentre: new THREE.Vector3(-nx, 0, -nz) };
      }
    }
    const x = r.x + nx * r.w * 0.7, z = r.z + nz * r.w * 0.7;
    return { x, z, y: this.ground(x, z), toCentre: new THREE.Vector3(-nx, 0, -nz) };
  }

  /** the flattest low spot of the canyon floor near t (for the vent fields) */
  private flatFloor(t: number) {
    const r = this.rift(t);
    let best = { x: r.x, z: r.z, score: 1e9 };
    for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) {
      const x = r.x + r.tx * i * 8 - r.tz * j * r.w * 0.15, z = r.z + r.tz * i * 8 + r.tx * j * r.w * 0.15;
      const h = this.ground(x, z);
      const sl = Math.abs(this.ground(x + 4, z) - this.ground(x - 4, z)) + Math.abs(this.ground(x, z + 4) - this.ground(x, z - 4));
      const score = sl * 4 + h * 0.2;
      if (score < best.score) best = { x, z, score };
    }
    return new THREE.Vector3(best.x, this.ground(best.x, best.z), best.z);
  }

  // ============================================================================================ habitats
  private addSpot(tag: string, s: Spot) { if (!this.tags.has(tag)) this.tags.set(tag, []); this.tags.get(tag)!.push(s); }

  private layout() {
    const wy = (x: number, z: number) => -curvatureDrop('miller', x, z);
    // ---- outcrops on the flats: grazers on their flanks, the shield-backs' nests in their notches
    for (const [k, r] of MILLER_ROCKS.entries()) {
      const scale = r.r / 14, yaw = hashRand('outcrop', k) * Math.PI * 2;
      const pos = new THREE.Vector3(r.x, this.ground(r.x, r.z) - 0.45 * scale, r.z);
      this.outcrops.push({ name: 'miller_outcrop', pos, yaw, scale });
      const notch = NOTCH.clone().multiplyScalar(scale).applyAxisAngle(UP, yaw).add(pos);
      notch.y = this.ground(notch.x, notch.z);
      const out = _v.set(Math.sin(yaw), 0, Math.cos(yaw));
      const home = notch.clone().addScaledVector(out, 3.5 * scale);
      home.y = this.ground(home.x, home.z);
      this.addSpot('shelf', { pos: home, den: notch, heading: yaw + Math.PI });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + k;
        // at the waterline round the outcrop's base, where the wet rock film grows
        const p = new THREE.Vector3(r.x + Math.cos(a) * r.r * 0.9, 0, r.z + Math.sin(a) * r.r * 0.9);
        p.y = this.ground(p.x, p.z);
        this.addSpot('rocks', { pos: p, den: p.clone(), heading: a });
      }
    }
    // ---- overhangs at the foot of the canyon walls: dens for the stalkers, caves for the sirens
    const ts = [0.14, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.9];
    ts.forEach((t, k) => {
      const f = this.wallFoot(t, k % 2 ? 1 : -1);
      const yaw = Math.atan2(f.toCentre.x, f.toCentre.z);
      const scale = 1.0 + 0.5 * t;
      const pos = new THREE.Vector3(f.x, f.y - 0.4, f.z);
      this.overhangs.push({ name: 'rift_overhang', pos, yaw, scale });
      const mouth = DEN_MOUTH.clone().multiplyScalar(scale).applyAxisAngle(UP, yaw).add(pos);
      const front = mouth.clone().addScaledVector(f.toCentre, 4 * scale);
      front.y += 1.5;
      if (k % 2 === 0) this.addSpot('ledge', { pos: front, den: mouth, heading: yaw + Math.PI });
      else this.addSpot('cave', { pos: mouth.clone().addScaledVector(f.toCentre, 0.8), den: mouth.clone().addScaledVector(f.toCentre, -0.3), heading: yaw });
    });
    // two more caves deeper in the canyon for the sirens (the wall foot on the far side)
    for (const t of [0.47, 0.77]) {
      const f = this.wallFoot(t, t < 0.6 ? -1 : 1);
      const yaw = Math.atan2(f.toCentre.x, f.toCentre.z), scale = 1.2;
      const pos = new THREE.Vector3(f.x, f.y - 0.4, f.z);
      this.overhangs.push({ name: 'rift_overhang', pos, yaw, scale });
      const mouth = DEN_MOUTH.clone().multiplyScalar(scale).applyAxisAngle(UP, yaw).add(pos);
      this.addSpot('cave', { pos: mouth.clone().addScaledVector(f.toCentre, 0.8), den: mouth.clone().addScaledVector(f.toCentre, -0.3), heading: yaw });
    }
    // ---- the open canyon: mid-water points along the centre line (the pack's middle reach listed last)
    for (const t of [0.35, 0.8, 0.56]) {
      const r = this.rift(t);
      const fl = this.ground(r.x, r.z), su = wy(r.x, r.z);
      const den = this.denNear(new THREE.Vector3(r.x, fl, r.z));
      this.addSpot('canyon', { pos: new THREE.Vector3(r.x, fl + (su - fl) * 0.4, r.z), den, heading: Math.atan2(-r.tx, -r.tz) });
    }
    // ---- vent fields on the canyon floor; two builders' nests at each, a stone pile between
    for (const [k, t] of [0.44, 0.7].entries()) {
      const c = this.flatFloor(t);
      const yaw = hashRand('vents', k) * Math.PI * 2;
      this.vents.push({ name: 'rift_vents', pos: c.clone().setY(c.y - 0.15), yaw, scale: 1 });
      // the flattest low ground round the field: two nest sites and a stone pile
      const cand: { p: THREE.Vector3; score: number }[] = [];
      for (let a = 0; a < 16; a++) for (const rr of [8, 11, 14]) {
        const x = c.x + Math.cos((a / 16) * Math.PI * 2) * rr, z = c.z + Math.sin((a / 16) * Math.PI * 2) * rr;
        const h = this.ground(x, z);
        const sl = Math.abs(this.ground(x + 1.5, z) - this.ground(x - 1.5, z)) + Math.abs(this.ground(x, z + 1.5) - this.ground(x, z - 1.5));
        cand.push({ p: new THREE.Vector3(x, h, z), score: sl * 3 + Math.max(0, h - c.y) });
      }
      cand.sort((a, b) => a.score - b.score);
      const picks: THREE.Vector3[] = [];
      for (const q of cand) { if (picks.every((p) => p.distanceTo(q.p) > 9)) picks.push(q.p); if (picks.length === 3) break; }
      const pile = picks[2] ?? c.clone().add(new THREE.Vector3(10, 0, 0));
      for (const n of picks.slice(0, 2)) {
        const i = this.nests.length;
        this.nests.push({ owner: `architect_${i}`, centre: n, pile, stones: 0, max: 22, waveCycle: -1 });
        const home = n.clone().lerp(pile, 0.15);
        home.y = this.ground(home.x, home.z);
        this.addSpot('vent', { pos: home, den: n, heading: hashRand('nest', i) * 6.28 });
      }
    }
    this.nests.forEach((n, i) => { n.stones = SAVED.nests?.[i] ?? Math.round(14 + 8 * hashRand('stones', i)); });
    // ---- the maze of rock spines on the canyon floor: low spots against a spine
    for (const t of [0.3, 0.4, 0.55]) {
      const r = this.rift(t);
      let best: THREE.Vector3 | null = null, bs = -1;
      for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
        const x = r.x + i * 4, z = r.z + j * 4;
        if (riftQuery(x, z).d > r.w * 0.6) continue;
        const h = this.ground(x, z);
        const rise = Math.max(this.ground(x + 3, z), this.ground(x - 3, z), this.ground(x, z + 3), this.ground(x, z - 3)) - h;
        if (rise > bs) { bs = rise; best = new THREE.Vector3(x, h, z); }
      }
      if (best) this.addSpot('maze', { pos: best, den: best.clone(), heading: t * 10 });
    }
    // ---- the sandy hollow
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39996, r = MILLER_SANDS.r * 0.7 * Math.sqrt((i + 0.5) / 7);
      const p = new THREE.Vector3(MILLER_SANDS.x + Math.cos(a) * r, 0, MILLER_SANDS.z + Math.sin(a) * r);
      p.y = this.ground(p.x, p.z);
      this.addSpot('sand', { pos: p, den: p.clone(), heading: hashRand('maw', i) * 6.28 });
    }
    // ---- the basin: mid-water for the filter feeders, deep for the apex animal
    const B = MILLER_BASIN;
    for (const [k, o] of [[-70, 40, 0.45], [60, -50, 0.45], [20, 30, 0.15], [-30, -60, 0.3]].entries()) {
      const x = B.x + o[0], z = B.z + o[1];
      const fl = this.ground(x, z), su = wy(x, z);
      this.addSpot('basin', { pos: new THREE.Vector3(x, fl + (su - fl) * o[2], z), heading: k * 1.7 });
    }
    // ---- plankton blooms: two in the basin, one in the lower canyon (they drift slowly round their centres)
    for (const [x, z, r] of [[B.x - 60, B.z + 20, 70], [B.x + 80, B.z - 70, 60], [this.rift(0.88).x, this.rift(0.88).z, 25]]) {
      const fl = this.ground(x, z);
      const y = Math.max(fl + 12, -60);
      this.bloomC.push({ c: new THREE.Vector3(x, y, z), a: hashRand('bloom', x) * 6.28, r, o: new THREE.Vector3(x, y, z) });
    }
  }

  private denNear(p: THREE.Vector3) {
    let best: THREE.Vector3 | null = null, bd = 1e9;
    for (const o of this.overhangs) {
      const m = DEN_MOUTH.clone().multiplyScalar(o.scale).applyAxisAngle(UP, o.yaw).add(o.pos);
      const d = m.distanceTo(p);
      if (d < bd) { bd = d; best = m; }
    }
    return best ?? p.clone();
  }

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

  // ============================================================================================ loading
  private async load() {
    const [outcrop, overhang, vents, clutch, stone, darter, sub] = await Promise.all(
      ['miller_outcrop', 'rift_overhang', 'rift_vents', 'egg_clutch', 'nest_stone', 'rift_darter', 'minisub'].map((n) => assets.load(n)));
    if (this.disposed) return;
    const phys = this.zone.phys;
    const put = (p: Placed, m: Model) => {
      p.model = m;
      m.root.position.copy(p.pos);
      m.root.rotation.set(0, p.yaw, 0);
      m.root.scale.setScalar(p.scale);
      m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.root.add(m.root);
      m.root.updateMatrixWorld(true);
      for (const c of phys.addTrimesh(m.colliders)) { this.colliders.push(c); this.colliderSet.add(c.handle); }
    };
    // every placement gets its own instance of the model
    const inst = async (name: string) => assets.load(name);
    put(this.outcrops[0], outcrop);
    for (let i = 1; i < this.outcrops.length; i++) put(this.outcrops[i], await inst('miller_outcrop'));
    put(this.overhangs[0], overhang);
    for (let i = 1; i < this.overhangs.length; i++) put(this.overhangs[i], await inst('rift_overhang'));
    put(this.vents[0], vents);
    for (let i = 1; i < this.vents.length; i++) put(this.vents[i], await inst('rift_vents'));
    if (this.disposed) return;
    for (const o of this.outcrops) this.rasters.push(this.raster(o));
    // eggs: in each outcrop notch (shield-backs) and inside each builder's wall
    const eggAt = async (p: THREE.Vector3, s: number, first: boolean) => {
      const m = first ? clutch : await inst('egg_clutch');
      m.root.position.copy(p);
      m.root.scale.setScalar(s);
      m.root.rotation.y = hashRand('egg', p.x) * 6.28;
      this.root.add(m.root);
    };
    let first = true;
    for (const s of this.tags.get('shelf') ?? []) { await eggAt(s.den!, 1.7, first); first = false; }
    for (const n of this.nests) await eggAt(n.centre, 1.0, false);
    // the nest walls: one instanced stone mesh per nest, as many drawn as the builder has laid
    let sgeo: THREE.BufferGeometry | null = null, smat: THREE.Material | null = null;
    stone.root.updateMatrixWorld(true);
    stone.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !sgeo) { sgeo = floatGeometry(m.geometry).applyMatrix4(m.matrixWorld); smat = m.material as THREE.Material; } });
    if (sgeo && smat) for (const [i, n] of this.nests.entries()) {
      const im = new THREE.InstancedMesh(sgeo, smat, n.max);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      for (let k = 0; k < n.max; k++) {
        // two courses round a ring 1.2 m across, each stone set on edge, leaning in
        const course = k < 14 ? 0 : 1, j = course ? k - 14 : k, cnt = course ? 8 : 14;
        const a = (j / cnt) * Math.PI * 2 + course * 0.2 + hashRand('st', i * 40 + k) * 0.15;
        const R = course ? 1.05 : 1.2;
        const p = new THREE.Vector3(n.centre.x + Math.cos(a) * R, 0, n.centre.z + Math.sin(a) * R);
        p.y = this.ground(p.x, p.z) + 0.06 + course * 0.17;
        q.setFromEuler(new THREE.Euler(0.25 + 0.2 * hashRand('st', k), -a + Math.PI / 2, 1.35, 'YXZ'));
        s.setScalar(0.9 + 0.5 * hashRand('ss', i * 40 + k));
        im.setMatrixAt(k, m.compose(p, q, s));
      }
      im.count = n.stones;
      im.castShadow = true;
      im.receiveShadow = true;
      n.mesh = im;
      this.root.add(im);
    }
    // vent plumes from each chimney mouth
    const plumes: { pos: THREE.Vector3; power: number }[] = [];
    for (const v of this.vents) for (const mk of v.model!.ofKind('plume')) plumes.push({ pos: mk.node.getWorldPosition(new THREE.Vector3()), power: Number(mk.data.power ?? 1) });
    this.water.setPlumes(plumes);
    // the darter schools, one per reach of the canyon and the basin edge
    const homes = [0.2, 0.38, 0.55, 0.72, 0.9].map((t) => {
      const r = this.rift(t), fl = this.ground(r.x, r.z);
      return { pos: new THREE.Vector3(r.x, fl + Math.min(10, -fl * 0.4), r.z), range: r.w * 1.6 };
    });
    this.schools = new Schools(darter, homes);
    this.root.add(this.schools.group);
    // the submersible: where it was left, or still stowed aboard the Ranger
    this.subModel = sub;
    if (SAVED.sub) this.deploy(new THREE.Vector3().fromArray(SAVED.sub.p), SAVED.sub.yaw, SAVED.sub.hull);
    this.lure = this.zone.lights.add({ pos: new THREE.Vector3(), color: new THREE.Color(0.3, 0.95, 1.0), power: 40, dist: 9, on: false });
    this.addInteractions();
    this.ready = true;
  }

  /** the tops of an outcrop's blocks: rays straight down onto its collision mesh (the sheltered notch left open) */
  private raster(o: Placed): Raster {
    const step = 0.5, half = 9 * o.scale, n = Math.ceil((half * 2) / step);
    const h = new Float32Array(n * n).fill(NaN);
    const x0 = o.pos.x - half, z0 = o.pos.z - half;
    const filt = groups(0xffff, GROUP.WORLD);
    const inv = new THREE.Matrix4().copy(o.model!.root.matrixWorld).invert();
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = x0 + (i + 0.5) * step, z = z0 + (j + 0.5) * step;
      const l = _v.set(x, o.pos.y + 1, z).applyMatrix4(inv);
      if (l.x > -1.4 && l.x < 1.8 && l.z > 0.6 && l.z < 2.8) continue;
      const top = o.pos.y + 14 * o.scale;
      const hit = this.zone.phys.raycast({ x, y: top, z }, { x: 0, y: -1, z: 0 }, 20 * o.scale, filt);
      if (hit && hit.collider && this.colliderSet.has(hit.collider.handle)) h[i * n + j] = top - hit.dist;
    }
    return { x0, z0, n, step, h };
  }

  /** the outcrop block top under (x, z), or NaN */
  private rasterAt(x: number, z: number) {
    for (const r of this.rasters) {
      const i = Math.floor((x - r.x0) / r.step), j = Math.floor((z - r.z0) / r.step);
      if (i < 0 || j < 0 || i >= r.n || j >= r.n) continue;
      return r.h[i * r.n + j];
    }
    return NaN;
  }

  private spawned(c: Creature) {
    this.cCreature.set(c.id, { id: c.id, kind: 'creature', pos: c.pos, vel: c.vel, size: c.length, light: 0, noise: 0.1, ref: c, species: c.def.id });
  }

  // ============================================================================================ the physical world
  private makeHabitat(): Habitat {
    const self = this;
    return {
      get time() { return self.time; },
      floor: (x, z) => { const g = this.ground(x, z); const r = this.rasterAt(x, z); return r > g ? r : g; },
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
      nest: (c) => { const n = this.nests.find((x) => x.owner === c.id); return n ? { stones: n.stones, max: n.max, pile: n.pile } : null; },
      placeStone: (c) => {
        const n = this.nests.find((x) => x.owner === c.id);
        if (!n || n.stones >= n.max) return;
        n.stones++;
        if (n.mesh) n.mesh.count = n.stones;
      },
      group: (c) => this.eco.members(c.groupId).filter((m) => m !== c),
      bloom: (c) => {
        let best: THREE.Vector3 | null = null, bd = 500;
        for (const b of this.bloomC) { const d = b.c.distanceTo(c.pos); if (d < bd) { bd = d; best = b.c; } }
        return best;
      },
    };
  }

  /** the sea surface (the wave where it is passing), following the planet's curve */
  surface(x: number, z: number) {
    const w = this.zone.wave;
    return (w ? w.at(x, z).h : 0) - curvatureDrop('miller', x, z);
  }

  /** daylight left at a point: falling off with depth, and nearly nothing under an overhang's roof */
  private lightAt(p: THREE.Vector3) {
    const sun = clamp(this.zone.sky.sunDir.y * 3 + 0.25, 0.03, 1);
    const depth = Math.max(0, this.surface(p.x, p.z) - p.y);
    let L = sun * Math.exp(-depth * ATT);
    if (this.sheltered(p)) L *= 0.12;
    return L;
  }

  /** under an overhang's roof */
  private sheltered(p: THREE.Vector3) {
    for (const o of this.overhangs) {
      _u.copy(p).sub(o.pos).applyAxisAngle(UP, -o.yaw).divideScalar(o.scale);
      if (Math.abs(_u.x) < 5.5 && _u.z > -0.5 && _u.z < 4.4 && _u.y < 4.2 && _u.y > -1) return true;
    }
    return false;
  }

  /**
   * Water movement. Before the wave the water is drawn back toward it (the trough ahead of the crest); as the crest
   * passes there is a violent surge along its course that weakens with depth; overhangs break the flow.
   */
  private current(p: THREE.Vector3, out: THREE.Vector3) {
    out.set(0, 0, 0);
    const w = this.zone.wave;
    if (w) {
      const u = p.x * w.dir.x + p.z * w.dir.z - w.s;
      const draw = u > 0 ? -0.55 * Math.exp(-u / 2500) : 0;
      const surge = u < 500 && u > -9000 ? 5.5 * Math.exp(-(((u + 900) / 1700) ** 2)) : 0;
      const depth = Math.max(0, this.surface(p.x, p.z) - p.y);
      out.addScaledVector(w.dir, (draw + surge) * (0.3 + 0.7 * Math.exp(-depth / 70)));
    }
    // a slight outflow down the canyon toward the basin
    const q = riftQuery(p.x, p.z);
    if (q.d < q.w * 1.5) out.x += 0.04;
    if (this.sheltered(p)) out.multiplyScalar(0.2);
    return out;
  }

  /** the tidal hazard at a point: 0 calm, 1 precursors, 2 warning, 3 the wave, 4 aftermath; and what is felt of it */
  private hazard(p: THREE.Vector3) {
    const w = this.zone.wave;
    if (!w) return { state: 0, cue: 0 };
    const eta = (p.x * w.dir.x + p.z * w.dir.z - w.s) / MillerWave.SPEED;
    let state = 0;
    if (eta > 0) state = eta < 60 ? 3 : eta < 300 ? 2 : eta < 900 ? 1 : 0;
    else state = eta > -120 ? 3 : eta > -600 ? 4 : 0;
    const cue = eta > 0 ? clamp((1000 - eta) / 800, 0, 1) : eta > -120 ? 1 : clamp(1 + (eta + 120) / 480, 0, 1);
    return { state, cue };
  }

  /** where an animal shelters: its den, the outcrop's fissures for the grazers, else the nearest overhang or the floor */
  private refuge(c: Creature) {
    if (c.def.id === 'ferracaris') {
      let best: Placed | null = null, bd = 1e9;
      for (const o of this.outcrops) { const d = Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z); if (d < bd) { bd = d; best = o; } }
      if (best) {
        _v.set(c.pos.x - best.pos.x, 0, c.pos.z - best.pos.z).normalize().multiplyScalar(5 * best.scale).add(best.pos);
        _v.y = this.habitat.floor(_v.x, _v.z);
        return _v.clone();
      }
    }
    if (c.den) return c.den;
    if (c.def.medium === 'water') {
      const d = this.denNear(c.pos);
      if (d.distanceTo(c.pos) < 200) return d;
      return new THREE.Vector3(c.pos.x, this.ground(c.pos.x, c.pos.z) + c.length * 0.5, c.pos.z);
    }
    return null;
  }

  // ============================================================================================ contacts and their consequences
  private contacts(): Contact[] {
    if (this.cFrame === this.frame) return this.cList;
    this.cFrame = this.frame;
    const L = this.cList;
    L.length = 0;
    const g = this.game, flight = g.services.flight as Flight;
    const sub = this.sub;
    if (g.zone === this.zone && !flight.craft && !sub?.piloted) {
      const p = this.cPlayer;
      p.pos.copy(g.player.pos).addScaledVector(UP, 0.9);
      p.vel.copy(g.player.vel);
      const sp = Math.hypot(p.vel.x, p.vel.z);
      // wading splashes
      p.noise = clamp(sp / 5, 0.05, 1) * (this.surface(p.pos.x, p.pos.z) > g.player.pos.y ? 1 : 0.6);
      L.push(p);
    }
    if (sub) {
      const s = this.cSub;
      s.pos.copy(sub.pos).addScaledVector(UP, 1.1);
      s.vel.copy(sub.vel);
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

  private strike(c: Creature, t: Contact, sev: number) {
    const g = this.game;
    const near = c.pos.distanceTo(g.renderer.camera.position) < 60;
    if (near) bus.emit('sfx', { id: 'thud', ui: true, gain: clamp(sev * 1.5, 0.2, 1) });
    switch (t.kind) {
      case 'player': {
        _v.copy(g.player.pos).sub(c.pos).setY(0);
        if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0);
        g.player.carry(_v.normalize().multiplyScalar(1.2));
        g.renderer.shake = 0.02;
        const name = codex.level(c.def.id) >= 2 ? `The ${c.def.name.toLowerCase()}` : 'Something in the water';
        if (g.settings.creative.damageProtection) ui.toast(`${name} lunges at you · Creative Mode: no injury`, 'warn', 4);
        else if (sev >= 0.35) this.zone.sites.harm(`${name} strikes you: your visor cracks.`);
        else ui.toast(`${name} strikes your leg and lets go.`, 'warn', 4);
        mission.note(`Struck by ${codex.level(c.def.id) >= 2 ? c.def.name : 'an unidentified animal'} on Miller's planet.`);
        break;
      }
      case 'sub':
        this.sub?.impact(1.4 + sev * 7, codex.level(c.def.id) >= 2 ? c.def.name.toLowerCase() : 'an animal');
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

  private feed(c: Creature, t: Contact | null) {
    if (!t) return 0.2;
    if (t.kind === 'prey' && this.schools) return this.schools.take(t.ref) ? 0.35 : 0;
    if (t.kind === 'creature') {
      const o = t.ref as Creature;
      // small, numerous animals are taken outright; anything else is wounded and gets away
      if (o.length < c.length * 0.35 && o.def.population >= 20) { this.eco.kill(o.id); return 0.5; }
      o.injury = Math.min(1, o.injury + 0.3);
      o.stress = 1;
      return 0.1;
    }
    return 0;
  }

  // ============================================================================================ the submersible
  private addInteractions() {
    const g = this.game;
    const add = (i: Interactable) => { (i as any).__scope = 'surface'; g.interactions.add(i); (i as any).__scope = 'surface'; this.interacts.push(i); };
    add({
      position: (out) => {
        const r = this.zone.ranger.root;
        return out.set(-3.2, 1.2, 1.5).applyQuaternion(r.quaternion).add(r.position);
      },
      radius: 2.2, range: 6,
      label: () => (!this.sub && this.zone.landed && !(g.services.flight as Flight).craft ? 'Unload the submersible' : ''),
      use: () => {
        const r = this.zone.ranger.root;
        const p = new THREE.Vector3(-9, 0, 2).applyQuaternion(r.quaternion).add(r.position);
        p.y = this.habitat.floor(p.x, p.z);
        this.deploy(p, Math.atan2(-(p.x - r.position.x), -(p.z - r.position.z)) + Math.PI / 2, 1);
        mission.note('The research submersible is unloaded from Ranger 1\'s cargo bay onto the flats.');
        ui.toast('Submersible unloaded: on the flats it crawls on its tracked skids; it floats where the water is deeper than 2.5 m.', 'info', 7);
      },
    });
    add({
      position: (out) => (this.sub ? out.copy(this.sub.pos).addScaledVector(UP, 1.6) : out.set(0, -1e6, 0)),
      radius: 2.0, range: 5,
      label: () => (this.sub && !this.sub.piloted ? 'Board the submersible' : ''),
      use: () => this.sub?.board(),
    });
  }

  private deploy(p: THREE.Vector3, yaw: number, hull: number) {
    if (!this.subModel || this.sub) return;
    const W_ = { floor: (x: number, z: number) => this.habitat.floor(x, z), surface: (x: number, z: number) => this.surface(x, z), current: (q: THREE.Vector3, out: THREE.Vector3) => this.current(q, out) };
    this.sub = new Submersible(this.game, this.subModel, this.zone.phys, this.zone.lights, W_);
    this.sub.hull = hull;
    this.root.add(this.sub.root);
    this.sub.place(p, yaw);
    this.sub.setLights(false);
  }

  /** out through the hatch (at the surface, or on the flats) */
  private leaveSub() {
    const sub = this.sub!;
    const g = this.game;
    sub.leave((p) => {
      p.y = this.habitat.floor(p.x, p.z) + 0.05;
      g.player.stand(p, sub.yaw);
    });
  }

  // ============================================================================================ update
  fixedUpdate(dt: number) {
    if (!this.ready) return;
    const g = this.game, sub = this.sub;
    if (sub) {
      sub.fixedUpdate(dt);
      if (sub.piloted && g.input.pressed('interact') && !g.uiFocus) this.leaveSub();
      this.waveOverSub(sub);
    }
    // nobody wades deeper than about chest height in a pressure suit: the ground slopes you back
    const flight = g.services.flight as Flight;
    if (g.zone === this.zone && !flight.craft && !sub?.piloted && g.player.mode === 'walk') {
      const p = g.player.pos;
      const depth = this.surface(p.x, p.z) - this.ground(p.x, p.z);
      if (depth > 1.25) {
        _v.set(this.ground(p.x + 1, p.z) - this.ground(p.x - 1, p.z), 0, this.ground(p.x, p.z + 1) - this.ground(p.x, p.z - 1));
        if (_v.lengthSq() < 1e-6) _v.set(-p.x, 0, -p.z);
        g.player.carry(_v.normalize().multiplyScalar(Math.min(0.12, (depth - 1.25) * 0.25 + 0.02)));
        this.warnT -= dt;
        if (this.warnT <= 0) {
          this.warnT = 12;
          ui.toast(this.sub ? 'Too deep to wade in a pressure suit: take the submersible down.' : 'Too deep to wade in a pressure suit. Ranger 1 carries a submersible: unload it at the cargo bay.', 'warn', 5);
        }
      }
    }
    this.time += dt;
  }

  /** the wave over the submersible: deep down it is a surge; in shallow water it tumbles it and throws it down-sea */
  private waveOverSub(sub: Submersible) {
    const w = this.zone.wave;
    if (!w) return;
    const cycle = Math.floor(this.zone.orbit.met / MillerWave.PERIOD);
    const h = w.at(sub.pos.x, sub.pos.z).h;
    const col = -curvatureDrop('miller', sub.pos.x, sub.pos.z) - this.ground(sub.pos.x, sub.pos.z);
    if (h > 3 && col < 14 && this.sweptCycle !== cycle) {
      this.sweptCycle = cycle;
      const g = this.game;
      const dmg = g.settings.creative.damageProtection ? 0 : 0.35;
      sub.hull = Math.max(0.05, sub.hull - dmg);
      const p = sub.pos.clone().addScaledVector(w.dir, 260 + 120 * Math.random());
      p.y = this.habitat.floor(p.x, p.z);
      sub.place(p, sub.yaw + 1.3);
      g.renderer.shake = 0.03;
      bus.emit('sfx', { id: 'thud', ui: true, gain: 1 });
      ui.toast(`The wave tumbled the submersible and threw it down-sea · hull ${(sub.hull * 100).toFixed(0)} %`, 'warn', 6);
      mission.note('Caught in shallow water by the wave: the submersible was tumbled and carried a few hundred metres.');
    }
  }

  update(dt: number) {
    this.frame++;
    if (!this.ready) return;
    const g = this.game, cam = g.renderer.camera;
    const camP = cam.getWorldPosition(new THREE.Vector3());
    const H = this.habitat;
    this.eco.update(dt, camP);
    // plankton blooms drift slowly round their centres
    for (const [i, b] of this.bloomC.entries()) {
      b.a += dt * 0.002;
      b.c.set(b.o.x + Math.cos(b.a) * b.r, b.o.y, b.o.z + Math.sin(b.a) * b.r);
      this.water.moveBloom(i, b.c);
    }
    // the fish: threats and lights
    if (this.schools) {
      const stim: SchoolStimulus[] = [];
      for (const c of this.contacts()) {
        if (c.kind === 'prey' || c.kind === 'object') continue;
        const cr = c.ref as Creature | undefined;
        const predator = c.kind !== 'creature' || (cr && cr.length > 0.5 && cr.def.archetype !== 'filter' && cr.def.archetype !== 'grazer');
        stim.push({ pos: c.pos, light: c.light, threat: predator && (c.vel.length() > 0.3 || c.kind === 'creature') ? 1 : 0, size: c.size });
      }
      this.schools.update(dt, H, camP, stim);
    }
    this.updateView(dt, camP);
    this.updateLure(camP);
    this.sightings(dt, camP);
    this.updateScan(dt, camP);
    this.nestDamage();
    if (this.sub?.piloted) {
      this.sonarT -= dt;
      if (this.sonarT <= 0) { this.sonarT = 3; this.sonar(); }
      ui.set({ gauges: this.sub.hud() });
    }
  }

  /** being in the water: what the light is like at the camera, the eye adapting, the water round the view */
  private updateView(dt: number, cam: THREE.Vector3) {
    const z = this.zone, sky = z.sky;
    const w = z.wave;
    const surfHere = w ? w.at(cam.x, cam.z).h : 0;
    this.camDepth = this.surface(cam.x, cam.z) - cam.y;
    this.underwater = this.camDepth > 0.02;
    W.uWater.value.set(1, surfHere, EXT, ATT);
    W.uWaterCol.value.setRGB(0.012, 0.058, 0.07);
    W.uWaterReg.value.set(0, 0, 0, 1 / (2 * z.body.R));
    const d = Math.max(0, this.camDepth);
    const k = Math.exp(-d * ATT);
    if (this.underwater) {
      // sunlight dimmed and turned blue-green by the water over the camera
      sky.sun.intensity *= k;
      sky.sun.color.multiply(_tint.setRGB(Math.exp(-d * ATT * 1.2), 1, Math.min(1.4, Math.exp(d * ATT * 0.25))));
      sky.fill.intensity *= k;
      (g_scene(z)).environmentIntensity *= 0.15 + 0.85 * k;
    }
    const want = this.underwater ? clamp(1 / Math.sqrt(Math.max(k, 0.04)), 1, 4) : 1;
    this.exposureGain += (want - this.exposureGain) * Math.min(1, dt * 0.8);
    const r = this.game.renderer;
    const px = r.height / (2 * Math.tan(((r.camera as THREE.PerspectiveCamera).fov * Math.PI) / 360));
    const sub = this.sub;
    let lamp = null;
    if (sub) {
      sub.forward(_u);
      lamp = { pos: sub.pos.clone().addScaledVector(UP, 0.45).addScaledVector(_u, 1.85), dir: _u.clone().addScaledVector(UP, -0.14).normalize(), on: sub.lights };
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

  /** the brightest siren lure near the camera lights the rock round it */
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
      const tip = best.rig.bones.get('luree')?.bone ?? best.root;
      f.node = tip;
      f.level = best.display;
    }
  }

  /** what the crew can see of the animals (light, water clarity, line of sight), and the codex records it makes */
  private sightings(dt: number, cam: THREE.Vector3) {
    this.sightT -= dt;
    if (this.sightT > 0) return;
    this.sightT = 0.25;
    const g = this.game, camO = g.renderer.camera;
    const dir = camO.getWorldDirection(new THREE.Vector3());
    const sub = this.sub;
    const lampOn = !!sub?.lights && !!sub?.piloted;
    if (sub) sub.forward(_u);
    for (const c of this.eco.live.values()) {
      _v.copy(c.pos).sub(cam);
      const d = _v.length();
      if (d > 160) continue;
      if (d > c.length && _v.dot(dir) / d < 0.64) continue;
      const amb = this.lightAt(c.pos);
      const sub_ = Math.max(0, this.surface(c.pos.x, c.pos.z) - c.pos.y);
      let R: number;
      if (this.underwater) {
        R = 6 + 48 * amb;
        if (lampOn) {
          _w.copy(c.pos).sub(sub!.pos);
          const ld = _w.length();
          if (ld < 40 && _w.dot(_u) / ld > 0.82) R = Math.max(R, 40);
        }
      } else R = sub_ > 1.2 ? 5 + 18 * amb : 140;
      if (c.def.archetype === 'lure') R = Math.max(R, 30 * c.display);
      R *= clamp(0.55 + 0.3 * Math.sqrt(c.length), 0.5, 2.2) * (1 - 0.7 * c.hidden);
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

  /** the submersible's sonar: echoes of anything large enough in range, whether seen or not */
  private sonar() {
    const sub = this.sub!;
    if (!sub.submerged) { this.sonarN = 0; return; }
    let n = 0;
    for (const c of this.eco.live.values()) {
      if (c.def.medium !== 'water' || c.pos.distanceTo(sub.pos) > 160 || c.length < 0.5) continue;
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
    const range = this.sub?.piloted ? 34 : 15;
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

  /** the wave knocks stones out of the builders' walls (they rebuild) */
  private nestDamage() {
    const w = this.zone.wave;
    if (!w) return;
    const cycle = Math.floor(this.zone.orbit.met / MillerWave.PERIOD);
    for (const [i, n] of this.nests.entries()) {
      if (n.waveCycle === cycle) continue;
      const hz = this.hazard(n.centre);
      if (hz.state === 3) {
        n.waveCycle = cycle;
        n.stones = Math.max(4, n.stones - Math.round(4 + 7 * hashRand('wave', cycle * 7 + i)));
        if (n.mesh) n.mesh.count = n.stones;
      }
    }
  }

  /** HUD lines: the scan in progress, sonar contacts, the wave as seen from the sub */
  hud(): { label: string; value: string; warn?: boolean }[] {
    const out: { label: string; value: string; warn?: boolean }[] = [];
    if (this.scanning) out.push({ label: 'SCAN', value: `${Math.min(99, Math.round((this.scanning.t / 2.5) * 100))} %` });
    if (this.sub?.piloted) {
      out.push({ label: 'SONAR', value: this.sonarN ? `${this.sonarN} contact${this.sonarN > 1 ? 's' : ''} within 160 m` : 'clear' });
      const w = this.zone.wave;
      if (w) {
        const eta = w.eta(this.sub.pos.x * w.dir.x + this.sub.pos.z * w.dir.z);
        if (eta > 0 && eta < 1500) out.push({ label: 'WAVE', value: `${Math.floor(eta / 60)}:${String(Math.floor(eta % 60)).padStart(2, '0')}`, warn: eta < 300 });
      }
    }
    return out;
  }

  dispose() {
    this.disposed = true;
    SAVED.eco = this.eco.serialize();
    SAVED.nests = this.nests.map((n) => n.stones);
    if (this.sub) SAVED.sub = { p: this.sub.pos.toArray(), yaw: this.sub.yaw, hull: this.sub.hull };
    if (this.sub?.piloted) this.leaveSub();
    this.eco.dispose();
    this.sub?.dispose();
    this.schools?.dispose();
    this.water.dispose();
    if (this.lure) this.zone.lights.remove(this.lure);
    for (const i of this.interacts) this.game.interactions.remove(i);
    this.zone.phys.remove(this.colliders);
    this.zone.sites.cabin = null;
    W.uWater.value.x = 0;
    this.root.removeFromParent();
  }
}

function g_scene(z: SurfaceZone) { return z.game.renderer.scene; }
