import * as THREE from 'three';
import type { SurfaceZone } from '../../world/space/SurfaceZone';
import { assets, type Model } from '../../render/Assets';
import { hashRand, type Creature } from '../Creature';
import { MILLER_SPECIES } from '../species';
import { MILLER_BASIN, MILLER_RIFT, MILLER_ROCKS, MILLER_SANDS, riftQuery } from '../../world/terrain/sites';
import { curvatureDrop, MILLER_SEA_FLOOR } from '../../world/terrain/worlds';
import { MillerWave } from '../../render/MillerWave';
import type { Submersible } from '../../vehicles/Submersible';
import { floatGeometry, Schools } from './Schools';
import { Underwater } from './Underwater';
import { UP, WorldLife, type WaterView } from './WorldLife';
import { ui } from '../../ui/store';
import { bus } from '../../core/events';
import { clamp } from '../../core/math';
import { GROUP, groups } from '../../physics/Physics';
import { mission } from '../../mission/Mission';
import type { Flight } from '../../vehicles/Flight';
import type { Interactable } from '../../player/Interaction';

const _v = new THREE.Vector3(), _u = new THREE.Vector3();

/** what stays of Miller's life between visits (the same animals, the sub where it was left, the nest walls) */
const SAVED: { eco?: any; sub?: { p: number[]; yaw: number; hull: number } | null; nests?: number[] } = {};

/** water optics of Miller's sea: extinction along a sight line (1/m), downwelling attenuation with depth (1/m) */
const ATT = 0.03;

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
 * refuges), the research submersible unloaded from Ranger 1, and the sea's water optics.
 */
export class MillerLife extends WorldLife {
  planet = 'miller';
  private outcrops: Placed[] = [];
  private overhangs: Placed[] = [];
  private vents: Placed[] = [];
  private nests: Nest[] = [];
  private rasters: Raster[] = [];
  private bloomC: { c: THREE.Vector3; a: number; r: number; o: THREE.Vector3 }[] = [];
  private warnT = 0;
  private sweptCycle = -1;
  private cum: number[] = [];
  private total = 0;

  constructor(zone: SurfaceZone) {
    super(zone, 'miller-life');
    this.optics = { ext: 0.05, att: ATT, col: [0.012, 0.058, 0.07] };
    this.measureRift();
    this.layout();
    this.water = new Underwater(this.bloomC.map((b) => b.c));
    this.root.add(this.water.group);
    this.startEcosystem(SAVED.eco);
    void this.load();
  }

  species() { return MILLER_SPECIES; }

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
  protected ground(x: number, z: number) { return this.zone.terrain ? this.zone.terrain.source.height(x, z) : MILLER_SEA_FLOOR; }

  /** ground animals walk on the outcrops' blocks as well */
  protected override floorAt(x: number, z: number) { const g = this.ground(x, z); const r = this.rasterAt(x, z); return r > g ? r : g; }

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

  private async load() {
    const [outcrop, overhang, vents, clutch, stone, darter, sub] = await Promise.all(
      ['miller_outcrop', 'rift_overhang', 'rift_vents', 'egg_clutch', 'nest_stone', 'rift_darter', 'minisub'].map((n) => assets.load(n)));
    if (this.disposed) return;
    const put = (p: Placed, m: Model) => { p.model = m; this.put(m, p.pos, p.yaw, p.scale); };
    // every placement gets its own instance of the model
    const inst = async (name: string) => assets.load(name);
    put(this.outcrops[0], outcrop);
    for (let i = 1; i < this.outcrops.length; i++) put(this.outcrops[i], await inst('miller_outcrop'));
    put(this.overhangs[0], overhang);
    for (let i = 1; i < this.overhangs.length; i++) put(this.overhangs[i], await inst('rift_overhang'));
    put(this.vents[0], vents);
    for (let i = 1; i < this.vents.length; i++) put(this.vents[i], await inst('rift_vents'));
    if (this.disposed) return;
    this.afterPhysics(() => { for (const o of this.outcrops) this.rasters.push(this.raster(o)); });
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
    this.water!.setPlumes(plumes);
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

  /** the sea surface (the wave where it is passing), following the planet's curve */
  surface(x: number, z: number) {
    const w = this.zone.wave;
    return (w ? w.at(x, z).h : 0) - curvatureDrop('miller', x, z);
  }

  /** daylight left at a point: falling off with depth, and nearly nothing under an overhang's roof */
  lightAt(p: THREE.Vector3) {
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
  protected current(p: THREE.Vector3, out: THREE.Vector3) {
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
  protected hazard(p: THREE.Vector3) {
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
  protected refuge(c: Creature) {
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

  protected override nestOf(c: Creature) { const n = this.nests.find((x) => x.owner === c.id); return n ? { stones: n.stones, max: n.max, pile: n.pile } : null; }

  protected override placeStoneFor(c: Creature) {
    const n = this.nests.find((x) => x.owner === c.id);
    if (!n || n.stones >= n.max) return;
    n.stones++;
    if (n.mesh) n.mesh.count = n.stones;
  }

  protected override bloomNear(c: Creature) {
    let best: THREE.Vector3 | null = null, bd = 500;
    for (const b of this.bloomC) { const d = b.c.distanceTo(c.pos); if (d < bd) { bd = d; best = b.c; } }
    return best;
  }

  protected override waterView(cam: THREE.Vector3): WaterView {
    const w = this.zone.wave;
    return { level: w ? w.at(cam.x, cam.z).h : 0, region: [0, 0, 0], curve: 1 / (2 * this.zone.body.R) };
  }

  private addInteractions() {
    const g = this.game;
    const add = (i: Interactable) => this.addInteract(i);
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

  override fixedUpdate(dt: number) {
    super.fixedUpdate(dt);
    if (!this.ready) return;
    const g = this.game, sub = this.sub;
    if (sub) this.waveOverSub(sub);
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

  override update(dt: number) {
    super.update(dt);
    if (!this.ready) return;
    // plankton blooms drift slowly round their centres
    for (const [i, b] of this.bloomC.entries()) {
      b.a += dt * 0.002;
      b.c.set(b.o.x + Math.cos(b.a) * b.r, b.o.y, b.o.z + Math.sin(b.a) * b.r);
      this.water!.moveBloom(i, b.c);
    }
    this.nestDamage();
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
  override hud() {
    const out = super.hud();
    const w = this.zone.wave;
    if (this.sub?.piloted && w) {
      const eta = w.eta(this.sub.pos.x * w.dir.x + this.sub.pos.z * w.dir.z);
      if (eta > 0 && eta < 1500) out.push({ label: 'WAVE', value: `${Math.floor(eta / 60)}:${String(Math.floor(eta % 60)).padStart(2, '0')}`, warn: eta < 300 });
    }
    return out;
  }

  protected save() {
    SAVED.eco = this.eco.serialize();
    SAVED.nests = this.nests.map((n) => n.stones);
    if (this.sub) SAVED.sub = { p: this.sub.pos.toArray(), yaw: this.sub.yaw, hull: this.sub.hull };
  }
}
