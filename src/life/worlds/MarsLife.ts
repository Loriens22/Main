import * as THREE from 'three';
import type { SurfaceZone } from '../../world/space/SurfaceZone';
import { assets, type Model } from '../../render/Assets';
import { hashRand, type Creature } from '../Creature';
import { MARS_SPECIES } from '../species';
import { MARS_CAVE } from '../../world/terrain/sites';
import { floatGeometry } from './Schools';
import { Underwater } from './Underwater';
import { UP, WorldLife, type WaterView } from './WorldLife';
import { ui } from '../../ui/store';
import { clamp } from '../../core/math';
import { GROUP, groups } from '../../physics/Physics';
import { mission } from '../../mission/Mission';
import type { Flight } from '../../vehicles/Flight';
import { story } from '../../core/Story';

const _v = new THREE.Vector3();

/** what stays of Mars' life between visits */
const SAVED: { eco?: any; rov?: { p: number[]; yaw: number; hull: number } | null; nests?: number[] } = {};

// the cave model's frame (blender/assets/mars_cave.py): x east, y along the trench (+y its surface end), z up
const LEVEL = -42.0, STREAM = -41.0;
const HALL = { c: [30, -145, -32], r: [28, 36, 16] };
const LAKE = { c: [30, -155], r: [20, 28] };
const BASIN = { c: [30, -210, -48], r: [30, 24, 38] };
const POOL = { c: [112, -130, -38], r: [10, 10, 6] };
const GALLERY: [number, number, number][] = [[0, -16, -24.2], [0, -30, -25.0], [2, -46, -26.5], [8, -62, -28.0], [16, -78, -30.0], [20, -89, -31.0], [21, -95, -31.4],
  [22, -100, -32.0], [24, -106, -33.6], [26, -116, -35.0]];
const CHANNEL: [number, number, number][] = [[48, -140, -39.6], [60, -134, -40.0], [76, -127, -40.3], [92, -124, -40.6], [104, -127, -40.8]];
const TUNNEL: [number, number, number][] = [[30, -164, -46.5], [30, -172, -48.5], [30, -182, -52.0], [30, -192, -56.0]];

interface Nest { owner: string; centre: THREE.Vector3; pile: THREE.Vector3; stones: number; max: number; mesh?: THREE.InstancedMesh }

/** nearest point of a polyline (model x, y): distance, interpolated z and the segment direction */
function nearPath(path: [number, number, number][], x: number, y: number) {
  let best = 1e9, bz = 0, dx = 0, dy = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay, az] = path[i], [bx, by, bz_] = path[i + 1];
    const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey;
    const t = clamp(((x - ax) * ex + (y - ay) * ey) / L2, 0, 1);
    const d = Math.hypot(x - (ax + ex * t), y - (ay + ey * t));
    if (d < best) { best = d; bz = az + (bz_ - az) * t; const l = Math.sqrt(L2); dx = ex / l; dy = ey / l; }
  }
  return { d: best, z: bz, dx, dy };
}

/**
 * The life of Mars in the speculative-evolution mode: a cave system under the crater plain (a game alternate-history
 * extension) reached by a collapse trench, with its sub-ice phototrophs, mineral colonies, brine fauna, a geothermal
 * channel and a subglacial basin; and on the surface, by the trench, the rare hermits. Light falls off from the open
 * trench into darkness; the crew brings lamps, and a survey ROV for the water.
 */
export class MarsLife extends WorldLife {
  planet = 'mars';
  private h0 = 0;
  private yaw = MARS_CAVE.yaw;
  private cos = Math.cos(MARS_CAVE.yaw);
  private sin = Math.sin(MARS_CAVE.yaw);
  private cave: Model | null = null;
  /** cave floor heights (model z) on a 1 m grid of the model frame, NaN outside the cave */
  private floor: Float32Array | null = null;
  private fx0 = -20; private fy0 = -240; private fnx = 150; private fny = 275;
  private nests: Nest[] = [];
  private guided = false;
  private enteredCave = false;
  private conservative: boolean;

  constructor(zone: SurfaceZone) {
    super(zone, 'mars-life');
    this.conservative = zone.game.settings.creative.science === 'conservative';
    this.h0 = zone.terrain!.source.height(MARS_CAVE.x, MARS_CAVE.z);
    // the opening in the rendered ground (the cells wholly inside are already left out of the mesh)
    zone.terrain!.hole.set(MARS_CAVE.x, MARS_CAVE.z, MARS_CAVE.r, -1e9);
    // no daylight reaches the lake: what the water scatters back is the crew's own lamplight, next to nothing
    this.optics = { ext: 0.07, att: 0.0, col: [0.0006, 0.0024, 0.003] };
    this.remoteSub = true;
    this.layout();
    this.water = new Underwater([]);
    this.root.add(this.water.group);
    this.dark.renderOrder = -6;
    this.dark.frustumCulled = false;
    this.dark.visible = false;
    this.root.add(this.dark);
    this.startEcosystem(SAVED.eco);
    void this.load();
  }

  species() { return this.conservative ? [] : MARS_SPECIES; }

  // ============================================================================================ frames
  /** a point of the cave model (Blender axes) in the zone */
  M(x: number, y: number, z: number, out = new THREE.Vector3()) {
    // Blender (x, y, z) -> three (x, z, -y), turned by the yaw, from the opening's centre on the ground
    const lx = x, lz = -y;
    return out.set(MARS_CAVE.x + lx * this.cos + lz * this.sin, this.h0 + z, MARS_CAVE.z - lx * this.sin + lz * this.cos);
  }

  /** a zone point into the cave model's frame: x, y (Blender) and z above the opening's ground */
  local(p: { x: number; y: number; z: number }) {
    const dx = p.x - MARS_CAVE.x, dz = p.z - MARS_CAVE.z;
    const lx = dx * this.cos - dz * this.sin, lz = dx * this.sin + dz * this.cos;
    return { x: lx, y: -lz, z: p.y - this.h0 };
  }

  private caveFloor(x: number, z: number) {
    const f = this.floor;
    if (!f) return NaN;
    const l = this.local({ x, y: 0, z });
    const i = Math.floor(l.x - this.fx0), j = Math.floor(l.y - this.fy0);
    if (i < 0 || j < 0 || i >= this.fnx || j >= this.fny) return NaN;
    return f[i * this.fny + j];
  }

  // ============================================================================================ habitats
  private layout() {
    const sp = (tag: string, a: [number, number, number], d?: [number, number, number], heading = 0) =>
      this.addSpot(tag, { pos: this.M(...a), den: d ? this.M(...d) : undefined, heading: heading + this.yaw });
    // sub-ice phototrophs in the niche behind the ice window
    sp('icewindow', [-9.6, -7.2, -15.0], undefined, 0.4);
    sp('icewindow', [-10.3, -5.2, -14.95], undefined, 2.0);
    sp('icewindow', [-8.9, -4.4, -15.0], undefined, 4.1);
    // mineral colonies on the seep terraces of the west shore (heights from the floor once loaded)
    for (const [x, y] of [[10, -140], [12, -128], [9, -152], [14, -162], [17, -120], [11, -134]] as const) sp('seep', [x, y, -38]);
    // glass ribbons in the shallows beside them
    for (const [x, y] of [[14, -146], [15, -156], [16, -137], [17, -165]] as const) sp('shallows', [x, y, LEVEL - 0.7], [x - 2.5, y, LEVEL - 1.5]);
    // prism architects' nests on the north and east shores
    const shore: [number, number][] = [[40, -119], [47, -128], [21, -121]];
    shore.forEach(([x, y], i) => {
      const c = this.M(x, y, -36);
      const pile = this.M(x + 4 * Math.cos(i * 2.1), y + 4 * Math.sin(i * 2.1), -36);
      this.nests.push({ owner: `prism_${i}`, centre: c, pile, stones: 0, max: 18 });
      sp('shore', [x + 1.2, y - 1.2, -36], [x, y, -36]);
    });
    // ghosts over the lake, at depth
    sp('lake', [30, -150, LEVEL - 4]); sp('lake', [24, -160, LEVEL - 5]); sp('lake', [36, -140, LEVEL - 3]);
    // basalt mimics in crevices by the shore path
    sp('crevice', [52, -150, -36], [53.5, -151, -36]);
    sp('crevice', [9, -170, -36], [7.6, -171, -36]);
    // the hermits' two cracks on the ground by the rim
    sp('surface', [8.6, 12.0, 0], [-9.4, -15.0, 0]);
    sp('surface', [-9.4, -15.0, 0], [8.6, 12.0, 0]);
    // the serpent in its warm pool, the monarch in the basin
    sp('channel', [110, -130, STREAM - 2.5], [113, -131, STREAM - 3.5]);
    sp('basin', [30, -210, -62], [26, -218, -70]);
  }

  // ============================================================================================ loading
  private async load() {
    const [cave, rov, stone] = await Promise.all(['mars_cave', 'mars_rov', 'nest_stone'].map((n) => assets.load(n)));
    if (this.disposed) return;
    this.cave = cave;
    // the ice (window, seal curtain, shelf) is solid to walk against but not a screen to the scanners' sight lines
    const ice: THREE.Mesh[] = [];
    cave.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && /ice/.test(((m.material as THREE.Material).name ?? '') + (m.parent?.name ?? '') + m.name)) ice.push(m);
    });
    this.put(cave, this.M(0, 0, 0), this.yaw);
    for (const c of this.zone.phys.addTrimesh(ice, { group: GROUP.DYNAMIC })) this.colliders.push(c);
    this.afterPhysics(() => {
      this.rasterFloor();
      // spots and individuals were placed before the floor was known: settle them on it
      for (const tag of ['seep', 'shore', 'crevice']) for (const s of this.tags.get(tag) ?? []) {
        const f = this.caveFloor(s.pos.x, s.pos.z);
        if (!Number.isNaN(f)) s.pos.y = this.h0 + f;
        if (s.den) { const g = this.caveFloor(s.den.x, s.den.z); if (!Number.isNaN(g)) s.den.y = this.h0 + g; }
      }
      for (const n of this.nests) {
        n.centre.y = this.ground(n.centre.x, n.centre.z);
        n.pile.y = this.ground(n.pile.x, n.pile.z);
      }
      for (const ind of this.eco.inds) {
        const def = MARS_SPECIES.find((s) => s.id === ind.species);
        if (!def || def.medium === 'water') continue;
        ind.pos.y = this.ground(ind.pos.x, ind.pos.z); ind.home.y = this.ground(ind.home.x, ind.home.z);
        if (ind.den) ind.den.y = this.ground(ind.den.x, ind.den.z);
        const c = this.eco.live.get(ind.id);
        if (c) { c.pos.y = ind.pos.y; c.home.copy(ind.home); c.den = ind.den; }
      }
      this.buildNests(this.stoneModel!);
      this.addDaylightFixtures();
      this.ready = true;
    });
    this.stoneModel = stone;
    this.subModel = rov;
    if (SAVED.rov) this.deploy(new THREE.Vector3().fromArray(SAVED.rov.p), SAVED.rov.yaw, SAVED.rov.hull, 0.42);
    this.addInteract({
      position: (out) => this.M(24, -118, -35.2, out).add(_v.set(0, 1.0, 0)),
      radius: 2.5, range: 6,
      label: () => (!this.sub && !(this.game.services.flight as Flight).craft ? 'Deploy the survey ROV into the lake' : this.sub && !this.sub.piloted ? 'Take the ROV\'s controls' : ''),
      use: () => {
        if (!this.sub) {
          const p = this.M(26, -127, LEVEL - 1.0);
          this.deploy(p, this.yaw + Math.PI, 1, 0.42);
          mission.note('A tethered survey ROV goes into the brine lake under Mars (game alternate-history extension).');
          ui.toast('ROV in the water. Its lamps and sonar see what your helmet lamp cannot.', 'info', 6);
        }
        this.sub?.board();
      },
    });
  }

  private stoneModel: Model | null = null;
  private dark = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, depthWrite: false }));
  /** daylight bounced off the sunlit trench floor, and transmitted through the ice window onto the iceblooms */
  private bounce: { f: import('../../render/LightPool').Fixture; power: number }[] = [];

  private addDaylightFixtures() {
    const L = this.zone.lights;
    const add = (p: THREE.Vector3, color: [number, number, number], power: number, dist: number) => {
      const f = L.add({ pos: p, color: new THREE.Color(...color), power, dist, on: true });
      this.bounce.push({ f, power });
    };
    // soft and high in the trench, so the light is spread over the walls rather than pooled on the floor
    add(this.M(0, 14, -2.5), [1.0, 0.72, 0.52], 26, 30);
    add(this.M(0, 0, -6), [1.0, 0.72, 0.52], 26, 30);
    add(this.M(0, -14, -12), [1.0, 0.7, 0.5], 22, 26);
    add(this.M(-9.4, -6, -12.6), [1.0, 0.82, 0.86], 14, 6);
  }

  /** the cave floors under every 1 m cell of the model frame (rays down from inside each passage) */
  private rasterFloor() {
    const f = new Float32Array(this.fnx * this.fny).fill(NaN);
    const filt = groups(0xffff, GROUP.WORLD);
    const own = this.colliderSet;
    for (let i = 0; i < this.fnx; i++) for (let j = 0; j < this.fny; j++) {
      const x = this.fx0 + i + 0.5, y = this.fy0 + j + 0.5;
      const start = this.startHeight(x, y);
      if (start === null) continue;
      const o = this.M(x, y, start);
      const hit = this.zone.phys.raycast(o, { x: 0, y: -1, z: 0 }, 60, filt);
      if (hit && hit.collider && own.has(hit.collider.handle)) f[i * this.fny + j] = start - hit.dist;
    }
    this.floor = f;
  }

  /** where to start looking down for the floor in each part of the cave (model z), or null outside it */
  private startHeight(x: number, y: number): number | null {
    if (Math.abs(x) < 7.5 && y > -24.5 && y < 24.5) return Math.max(-24, Math.min(0, (y - 24) * 24 / 46)) + 3;
    if (x < -6 && x > -12 && y > -9 && y < -3) return -12;
    const g = nearPath(GALLERY, x, y);
    if (g.d < 6.5 && y > -118) return g.z + 2.5;
    const hu = (x - HALL.c[0]) / HALL.r[0], hv = (y - HALL.c[1]) / HALL.r[1];
    if (hu * hu + hv * hv < 1) return -29;
    const c = nearPath(CHANNEL, x, y);
    if (c.d < 4) return c.z + 3;
    if (Math.hypot(x - POOL.c[0], y - POOL.c[1]) < POOL.r[0]) return -36;
    const t = nearPath(TUNNEL, x, y);
    if (t.d < 4.5) return t.z + 3;
    const bu = (x - BASIN.c[0]) / BASIN.r[0], bv = (y - BASIN.c[1]) / BASIN.r[1];
    if (bu * bu + bv * bv < 1) return -44;
    return null;
  }

  private buildNests(stone: Model) {
    let sgeo: THREE.BufferGeometry | null = null, smat: THREE.Material | null = null;
    stone.root.updateMatrixWorld(true);
    stone.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !sgeo) { sgeo = floatGeometry(m.geometry).applyMatrix4(m.matrixWorld); smat = m.material as THREE.Material; } });
    if (!sgeo || !smat) return;
    for (const [i, n] of this.nests.entries()) {
      n.stones = SAVED.nests?.[i] ?? Math.round(9 + 7 * hashRand('pstones', i));
      const im = new THREE.InstancedMesh(sgeo, smat, n.max);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      for (let k = 0; k < n.max; k++) {
        // fragments sorted by shape: a low oval wall, the flattest pieces laid as a sealed floor inside
        const a = (k / n.max) * Math.PI * 2 + hashRand('pst', i * 40 + k) * 0.2;
        const p = new THREE.Vector3(n.centre.x + Math.cos(a) * 0.75, 0, n.centre.z + Math.sin(a) * 0.55);
        p.y = this.ground(p.x, p.z) + 0.05 + (k % 2) * 0.1;
        q.setFromEuler(new THREE.Euler(0.15, -a + Math.PI / 2, 1.2 + 0.2 * hashRand('pq', k), 'YXZ'));
        s.setScalar(0.8 + 0.5 * hashRand('ps', i * 40 + k));
        im.setMatrixAt(k, m.compose(p, q, s));
      }
      im.count = n.stones;
      im.castShadow = true;
      n.mesh = im;
      this.root.add(im);
    }
  }

  // ============================================================================================ the physical world
  protected ground(x: number, z: number) {
    const f = this.caveFloor(x, z);
    if (!Number.isNaN(f)) return this.h0 + f;
    return this.zone.terrain ? this.zone.terrain.source.height(x, z) : this.h0;
  }

  /** the brine: the lake and the basin under its ice shelf, the warm channel and its pool */
  surface(x: number, z: number): number | null {
    const l = this.local({ x, y: 0, z });
    const lu = (l.x - LAKE.c[0]) / LAKE.r[0], lv = (l.y - LAKE.c[1]) / LAKE.r[1];
    const bu = (l.x - BASIN.c[0]) / BASIN.r[0], bv = (l.y - BASIN.c[1]) / BASIN.r[1];
    if (lu * lu + lv * lv < 1.05 || bu * bu + bv * bv < 1 || nearPath(TUNNEL, l.x, l.y).d < 5) return this.h0 + LEVEL;
    if (Math.hypot(l.x - POOL.c[0], l.y - POOL.c[1]) < POOL.r[0] || nearPath(CHANNEL, l.x, l.y).d < 1.8) return this.h0 + STREAM;
    return null;
  }

  /** daylight at a point: full on the plain, falling off down the trench, a little through the ice window, none beyond */
  lightAt(p: THREE.Vector3) {
    const sun = clamp(this.zone.sky.sunDir.y * 3 + 0.15, 0, 1);
    return sun * this.skyView(p);
  }

  /** how much of the sky a point sees from inside the cave (1 in the open) */
  private skyView(p: { x: number; y: number; z: number }) {
    const l = this.local(p);
    if (l.z > -1.5) return 1;
    if (Math.abs(l.x) < 7.6 && l.y > -24.5 && l.y < 24.5) return clamp(1 - (-l.z) / 34, 0.25, 1);
    if (l.x < -6.5 && l.x > -12 && l.y > -9 && l.y < -3) return 0.3;
    const g = nearPath(GALLERY, l.x, l.y);
    if (g.d < 7 && l.y > -60) return 0.25 * Math.exp(-Math.max(0, -18 - l.y) / 7);
    return 0;
  }

  protected override daylight(cam: THREE.Vector3) {
    // the eye's adaptation and the scene's sunlight follow what the camera's place sees of the sky
    const v = this.skyView(cam);
    return v >= 1 ? 1 : Math.max(0.002, v);
  }

  protected override waterView(_cam: THREE.Vector3): WaterView {
    const c = this.M(30, -175, 0);
    return { level: this.h0 + LEVEL, region: [c.x, c.z, 68], curve: 0 };
  }

  protected current(p: THREE.Vector3, out: THREE.Vector3) {
    out.set(0, 0, 0);
    const l = this.local(p);
    const c = nearPath(CHANNEL, l.x, l.y);
    if (c.d < 2.5 && l.z < STREAM + 0.3) {
      // the warm stream runs back down to the lake (against the path's order)
      const a = this.M(0, 0, 0), b = this.M(-c.dx, -c.dy, 0);
      out.set(b.x - a.x, 0, b.z - a.z).normalize().multiplyScalar(0.35);
    }
    return out;
  }

  /** on the plain the hermits' hours: strong sun or night cold are hazards; underground there are none */
  protected hazard(p: THREE.Vector3) {
    const l = this.local(p);
    if (l.z < -2) return { state: 0, cue: 0 };
    const s = this.zone.sky.sunDir.y;
    const bad = s > 0.55 || s < -0.05;
    return { state: bad ? 2 : 0, cue: bad ? 1 : 0 };
  }

  protected refuge(c: Creature) {
    if (c.def.id === 'hermit') return c.pos.distanceTo(c.home) < c.pos.distanceTo(c.den ?? c.home) ? c.home : (c.den ?? c.home);
    return c.den ?? c.home;
  }

  protected override nestOf(c: Creature) { const n = this.nests.find((x) => x.owner === c.id); return n ? { stones: n.stones, max: n.max, pile: n.pile } : null; }

  protected override placeStoneFor(c: Creature) {
    const n = this.nests.find((x) => x.owner === c.id);
    if (!n || n.stones >= n.max) return;
    n.stones++;
    if (n.mesh) n.mesh.count = n.stones;
  }

  // ============================================================================================ update
  override update(dt: number) {
    super.update(dt);
    if (!this.ready) return;
    const sun = clamp(this.zone.sky.sunDir.y * 3 + 0.1, 0, 1);
    for (const b of this.bounce) { b.f.level = sun; b.f.on = sun > 0.02; }
    // deep in the cave nothing of the sky can be seen: the dark of the rock closes any seam in the passages
    const cam = this.game.renderer.camera.getWorldPosition(_v);
    const lc = this.local(cam);
    this.dark.visible = lc.y < -44 && lc.z < -18 && !this.underwater;
    this.dark.position.copy(cam);
    const g = this.game;
    const flight = g.services.flight as Flight;
    const onFoot = g.zone === this.zone && !flight.craft && !this.sub?.piloted;
    const l = this.local(g.player.pos);
    // the way to the opening, until the crew is underground
    if (onFoot && l.z > -3 && !this.enteredCave) {
      const d = Math.hypot(l.x, l.y - 20);
      ui.set({ gps: { name: 'Radar void · collapse trench', dist: d } });
      if (!this.guided) {
        this.guided = true;
        if (!story.has('mars_void')) {
          story.set('mars_void');
          mission.note('Orbital radar and seismic soundings show voids under the plain 200 m from the pad; a collapse trench opens into them (game alternate-history extension).');
          ui.toast('Radar void 200 m from the pad: a collapse trench leads down. Helmet lamp: L.', 'info', 7);
        }
      }
    } else if (onFoot && l.z < -3 && !this.enteredCave) {
      this.enteredCave = true;
      ui.set({ gps: null });
      if (!this.zone.helmetOn) ui.toast('Dark ahead: switch on the helmet lamp (L).', 'info', 5);
    }
    if (this.enteredCave && l.z > -1 && onFoot) this.enteredCave = false;
  }

  override hud() {
    const out = super.hud();
    const g = this.game;
    const l = this.local(g.player.pos);
    if (l.z < -3 && !(g.services.flight as Flight).craft) {
      // the cave air: thin CO2 down the trench and gallery, a sealed denser pocket beyond the ice curtain (fictional)
      const sealed = l.y < -96;
      out.push({ label: 'CAVE AIR', value: sealed ? '310 mbar · CO₂ N₂ · 4 °C' : '7 mbar · CO₂ · −55 °C' });
      out.push({ label: 'DEPTH', value: `${Math.max(0, -l.z).toFixed(0)} m below the plain` });
    }
    return out;
  }

  protected save() {
    SAVED.eco = this.eco.serialize();
    SAVED.nests = this.nests.map((n) => n.stones);
    if (this.sub) SAVED.rov = { p: this.sub.pos.toArray(), yaw: this.sub.yaw, hull: this.sub.hull };
  }

  override dispose() {
    for (const b of this.bounce) this.zone.lights.remove(b.f);
    super.dispose();
    ui.set({ gps: null });
  }
}

export const MARS_UP = UP;
