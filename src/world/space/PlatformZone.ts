import * as THREE from 'three';
import { Zone } from '../Zone';
import { assets, Model } from '../../render/Assets';
import { LightPool } from '../../render/LightPool';
import { GROUP, groups, RAPIER } from '../../physics/Physics';
import { Soundscape } from '../../audio/Audio';
import { NPC, NPCManager } from '../../npc/NPC';
import type { DialogueDef } from '../../npc/Dialogue';
import type { OrbitZone } from './OrbitZone';
import type { Flight } from '../../vehicles/Flight';
import type { Interactable } from '../../player/Interaction';
import { Building, SlideDoor } from '../Building';
import { WarpShip } from '../../space/WarpShip';
import { HalcyonScreens } from './HalcyonScreens';
import { CryoBay } from './Hypersleep';
import { bus } from '../../core/events';
import { clamp } from '../../core/math';
import { ui } from '../../ui/store';
import { mission } from '../../mission/Mission';
import { story } from '../../core/Story';

/** Blender (x, y, z) -> zone (three.js) coordinates */
const B = (x: number, y: number, z: number, out = new THREE.Vector3()) => out.set(x, z, -y);
const blenderDir = (d: number[]) => new THREE.Vector3(d[0], d[2], -d[1]);
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

// layout (Blender metres, the ship's frame; see blender/assets/meridian.py)
const KX = 90, Z0 = 20, PZ = 21.45;
/** weightless: the berthed Ranger, the berth tunnel and the vestibule */
const ZG_BOX = { x0: 86.6, x1: 93.4, y0: -77.5, y1: -54.5, z0: 17.0, z1: 25.0 };
/** weightless: the gangway shaft (and a column above the well, so a floater can come up out of it) */
const ZG_SHAFT = { x: 0, y: -32, r: 1.37, z0: 8.0, z1: 21.6 };
/** weightless: the Halcyon's dorsal airlock shaft and the well under it in the airlock hall */
const ZG_WELL = { x: 0, y: -32, r: 1.12, z0: -0.6, z1: 10.2 };
const RAMP = 0.6;
const LOCK = { y0: -54.4, y1: -50.4, hw: 1.8 };

function discCollider(radius: number, halfH: number) {
  const pts: number[] = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; for (const y of [halfH, -halfH]) pts.push(Math.cos(a) * radius, y, Math.sin(a) * radius); }
  return RAPIER.ColliderDesc.convexHull(new Float32Array(pts))!;
}

interface Slide { node: THREE.Object3D; base: THREE.Vector3; dir: THREE.Vector3; travel: number; t: number; target: number; speed: number; delay: number }

/** Airlock 1: two interlocked pressure doors; the chamber equalises toward the side the occupant wants to leave by. */
class Airlock {
  /** the side the chamber is at pressure with (its door may open) */
  side: 'out' | 'in' = 'out';
  cycling = 0;
  private lamps: Record<'out' | 'in', THREE.MeshStandardMaterial> = {} as any;
  private flash = 0;

  constructor(private zone: PlatformZone, public outer: SlideDoor, public inner: SlideDoor) {
    // short sensors: standing at one door the occupant is out of the other door's hold range (4 m chamber)
    outer.auto = inner.auto = 1.15;
    const geo = new THREE.SphereGeometry(0.07, 12, 8);
    for (const id of ['out', 'in'] as const) {
      const m = zone.int.marker('lamp', `lock_${id}`);
      const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2010, emissiveIntensity: 3, roughness: 0.4 });
      this.lamps[id] = mat;
      if (m) { const s = new THREE.Mesh(geo, mat); m.node.add(s); s.position.set(0, -0.08, 0); }
    }
  }

  /** the occupant's position in the chamber: null outside, else which door is nearer */
  private where(p: THREE.Vector3) {
    const by = -p.z, bx = p.x;
    if (Math.abs(bx - KX) > LOCK.hw || by < LOCK.y0 + 0.15 || by > LOCK.y1 - 0.15 || p.y < Z0 - 0.5 || p.y > Z0 + 3) return null;
    return by > (LOCK.y0 + LOCK.y1) / 2 ? 'in' : 'out';
  }

  cycle(reason = 'Airlock 1 cycling · equalising pressure') {
    if (this.cycling > 0) return;
    this.cycling = 3.2;
    bus.emit('sfx', { id: 'airlock', node: this.outer.node, gain: 0.8 });
    ui.toast(reason, 'info', 3);
  }

  update(dt: number) {
    const pl = this.zone.game.player.pos;
    const at = this.where(pl);
    if (this.cycling > 0) {
      this.cycling -= dt;
      if (this.cycling <= 0) {
        this.side = this.side === 'out' ? 'in' : 'out';
        bus.emit('sfx', { id: 'clamp', node: this.inner.node, gain: 0.6 });
        ui.toast(`Pressure equal · ${this.side === 'in' ? 'inner door to the station' : 'outer door to the berth'} unlocked`, 'info', 3);
      }
    } else if (at && at !== this.side && this.outer.t === 0 && this.inner.t === 0) this.cycle();
    this.outer.enabled = this.side === 'out' && this.cycling <= 0;
    this.inner.enabled = this.side === 'in' && this.cycling <= 0;
    this.flash += dt;
    const blink = (this.flash % 0.6) < 0.3;
    for (const id of ['out', 'in'] as const) {
      const m = this.lamps[id];
      if (this.cycling > 0) m.emissive.setRGB(1, 0.55, 0.05).multiplyScalar(blink ? 1 : 0.15);
      else if (this.side === id) m.emissive.setRGB(0.1, 1, 0.25);
      else m.emissive.setRGB(1, 0.08, 0.04);
    }
  }
}

/**
 * NASA's Meridian orbital platform, walked through in its own (non-rotating) frame, which is also the warp ship's:
 * Ranger 1 on berth 1 (its cabin walkable, its seats hand the player back to flight), the berth vestibule and the
 * Ranger weightless, airlock 1 with interlocked doors, the station corridor, the operations junction with its
 * engineers, the access arm with the glazed inspection gallery between the field rings, the gangway head and the
 * zero-g gangway shaft down to the Halcyon's dorsal hatch. Deck plating gives walking weight on the decks.
 * The Earth, the Sun and the Endurance (1.6 km aft) are where they really are.
 */
export class PlatformZone extends Zone {
  ext!: Model;
  int!: Model;
  r1!: Model;
  ship!: WarpShip;
  endu: Model | null = null;
  lights!: LightPool;
  npcs!: NPCManager;
  bld!: Building;
  airlock: Airlock | null = null;
  hatches: { slides: Slide[]; open: boolean; blockers: RAPIER.Collider[] } = { slides: [], open: false, blockers: [] };
  /** the Halcyon's interior (the same frame: the ship sits in the platform's cradle) */
  hal!: Model;
  halB!: Building;
  screens!: HalcyonScreens;
  cryo!: CryoBay;
  /** the dorsal airlock: the outer hatch under the gangway and the inner one in the airlock hall's ceiling */
  dorsal: { slides: Slide[]; open: boolean; blockers: RAPIER.Collider[]; busy: number; want: boolean | null; reblock: number } = { slides: [], open: false, blockers: [], busy: 0, want: null, reblock: 0 };
  private sections: { name: string; nodes: THREE.Object3D[]; box: THREE.Box3 }[] = [];
  private cullT = 0;
  private sitting: THREE.Object3D | null = null;
  private q = new THREE.Quaternion();
  private qi = new THREE.Quaternion();
  private where = '';
  private hudT = 0;
  private radioT = 25;
  private radioK = 0;

  private get orbit() { return this.game.zones.get('orbit') as OrbitZone; }
  private get flight() { return this.game.services.flight as Flight; }
  private addI(i: Interactable) { this.game.interactions.add(i); (i as any).__scope = this.id; return i; }

  async load(progress?: (f: number, label: string) => void) {
    const g = this.game;
    await g.preload('orbit');
    progress?.(0.15, 'Meridian platform');
    this.ext = await assets.load('platform');
    this.int = await assets.load('platform_int');
    this.root.add(this.ext.root, this.int.root);
    this.root.updateMatrixWorld(true);
    this.phys.addTrimesh(this.int.colliders);
    this.lights = new LightPool(this.root, 10, 2);
    progress?.(0.4, 'WSV-1 Halcyon');
    this.ship = await new WarpShip(this.phys, false).load();
    this.root.add(this.ship.root);
    // seen from inside, the windows show the real rooms: the exterior-only backdrops go
    this.ship.model.root.traverse((o) => { if (o.userData.extonly) o.visible = false; });
    progress?.(0.48, 'Halcyon interior');
    this.hal = await assets.load('halcyon_int');
    this.root.add(this.hal.root);
    this.root.updateMatrixWorld(true);
    this.phys.addTrimesh(this.hal.colliders);
    progress?.(0.55, 'Ranger 1');
    this.r1 = await assets.load('ranger');
    this.root.add(this.r1.root);
    this.dockModel(this.r1);
    const cabin: THREE.Mesh[] = [];
    this.r1.root.traverse((o) => {
      let part: string | undefined;
      for (let a: THREE.Object3D | null = o; a && a !== this.r1.root && part === undefined; a = a.parent) part = a.userData.part;
      if ((o as THREE.Mesh).isMesh && (part === 'cabin' || part === 'cabin_detail' || part === 'canopy')) cabin.push(o as THREE.Mesh);
    });
    this.phys.addTrimesh(cabin);
    for (const l of this.r1.ofKind('light')) if (l.data.group === 'ranger_cabin') this.lights.addFromMarker(l.node, l.data, true);
    progress?.(0.65, 'Endurance');
    this.endu = await assets.load('endurance');
    this.root.add(this.endu.root);
    this.npcs = new NPCManager({ game: g, phys: this.phys, parent: this.root, weightless: () => false });
    this.bld = new Building('meridian', this.int, this.phys, g.interactions, this.lights, { lightsOn: true, actors: () => this.actors() });
    // (loaded ahead of time while another zone is active: its door handles belong to this zone)
    for (const d of this.bld.doors.values()) (d.interactable as any).__scope = this.id;
    // the walls carry their light baked in; the live fixtures mostly light the people, so they run a little hotter
    for (const f of this.bld.fixtures) f.power *= 1.6;
    this.halB = new Building('halcyon', this.hal, this.phys, g.interactions, this.lights, { lightsOn: true, actors: () => this.actors() });
    for (const d of this.halB.doors.values()) (d.interactable as any).__scope = this.id;
    for (const f of this.halB.fixtures) f.power *= 1.6;
    const lo = this.bld.slides.get('lock_out'), li = this.bld.slides.get('lock_in');
    if (lo && li) this.airlock = new Airlock(this, lo, li);
    this.collectSections(this.int);
    this.collectSections(this.hal);
    this.buildHatches();
    this.buildDorsal();
    this.terminals();
    this.shipTerminals();
    progress?.(0.72, 'Hibernation capsules');
    this.cryo = new CryoBay(g, this.root, this.phys, () => this.npcs, this.lights);
    await this.cryo.load(this.hal.ofKind('cryo'), (o, at) => { this.sections.find((sc) => sc.box.containsPoint(at))?.nodes.push(o); }, 'halcyon_pod');
    for (const [k] of this.cryo.pods.entries()) {
      this.addI({ position: (out) => this.cryo.usePoint(k, out), radius: 0.7, range: 2.8, label: () => 'Hibernation capsule',
        enabled: () => this.cryo.state === 'idle', use: () => this.game.openPanel('cryo', { pod: k }) });
    }
    bus.on('cryo:sleep', (e: { pod?: number; until: number | null }) => { if (this.game.zone === this) this.cryo.sleep(e.pod ?? 0, e.until); });
    this.screens = new HalcyonScreens(this);
    this.screens.build(this.int, this.hal);
    progress?.(0.8, 'Crew');
    await this.engineers();
    await this.shipCrew();
    progress?.(1, 'Ready');
  }

  private actors() {
    const out = [this.game.player.pos];
    for (const n of this.npcs.list) if (!n.attached) out.push(n.pos);
    return out;
  }

  /** the Ranger model held on berth 1 exactly as the docking mechanism holds it */
  private dockModel(m: Model) {
    m.root.position.set(0, 0, 0);
    m.root.quaternion.identity();
    m.root.updateMatrixWorld(true);
    const ring = m.marker('dock', 'rear')!;
    const rp = ring.node.getWorldPosition(new THREE.Vector3());
    const rd = blenderDir(ring.data.dir ?? [0, -1, 0]).normalize(), ru = blenderDir(ring.data.up ?? [0, 0, 1]).normalize();
    const port = this.ext.marker('dock', 'berth')!;
    port.node.updateWorldMatrix(true, false);
    const pp = port.node.getWorldPosition(new THREE.Vector3());
    const pq = port.node.getWorldQuaternion(new THREE.Quaternion());
    const pd = blenderDir(port.data.dir).applyQuaternion(pq).normalize(), pu = blenderDir(port.data.up).applyQuaternion(pq).normalize();
    _z.copy(rd); _y.copy(ru); _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z);
    _z.copy(pd).negate(); _y.copy(pu).addScaledVector(_z, -pu.dot(_z)).normalize(); _x.crossVectors(_y, _z);
    _m2.makeBasis(_x, _y, _z).multiply(_m.transpose());
    m.root.quaternion.setFromRotationMatrix(_m2);
    m.root.position.copy(rp).applyQuaternion(m.root.quaternion).negate().add(pp);
    m.root.updateMatrixWorld(true);
  }

  /** the three hatches between the Ranger cabin and the vestibule, opened and shut together */
  private buildHatches() {
    const slide = (node: THREE.Object3D | undefined, axisB: number[], travel: number, delay: number, speed = 1.2): Slide | null =>
      node ? { node, base: node.position.clone(), dir: blenderDir(axisB).normalize(), travel, t: 0, target: 0, speed, delay } : null;
    const hb = this.int.part('hatch_berth');
    this.hatches.slides = [
      slide(this.r1.part('hatch_inner'), [1, 0, 0], 1.1, 0),
      slide(this.r1.part('hatch_outer'), [1, 0, 0], 1.25, 0.5),
      slide(hb, (hb?.userData.axis as number[]) ?? [1, 0, 0], Number(hb?.userData.travel ?? 2.1), 1.0, 1.0),
    ].filter(Boolean) as Slide[];
    const g = groups(GROUP.WORLD, 0xffff);
    const p = B(KX, -57.85, PZ);
    this.hatches.blockers.push(this.phys.world.createCollider(discCollider(1.0, 0.05).setTranslation(p.x, p.y, p.z)
      .setRotation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))).setCollisionGroups(g)));
    const hi = this.r1.part('hatch_inner');
    if (hi) {
      const hp = hi.getWorldPosition(new THREE.Vector3());
      const ax = new THREE.Vector3(0, 0, 1).applyQuaternion(this.r1.root.quaternion);
      this.hatches.blockers.push(this.phys.world.createCollider(discCollider(0.6, 0.04).setTranslation(hp.x, hp.y, hp.z)
        .setRotation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax)).setCollisionGroups(g)));
    }
    const label = () => `${this.hatches.open ? 'Close' : 'Open'} the berth hatches (Ranger 1 ↔ Meridian)`;
    const ctl = this.int.marker('hatch_ctl', 'berth');
    if (ctl) this.addI({ position: (out) => ctl.node.getWorldPosition(out), radius: 0.5, range: 3.4, label, use: () => this.setHatches(!this.hatches.open) });
    const inner = this.r1.marker('hatch', 'rear_inner');
    if (inner) this.addI({ position: (out) => inner.node.getWorldPosition(out), radius: 0.55, range: 2.8, label, use: () => this.setHatches(!this.hatches.open) });
    for (const seat of this.r1.ofKind('seat')) {
      const pilot = seat.id.startsWith('pilot');
      this.addI({ position: (out) => seat.node.getWorldPosition(out).addScaledVector(_v.set(0, 1, 0).applyQuaternion(this.r1.root.quaternion), 0.4),
        radius: 0.45, range: 2.6, label: () => `${pilot ? 'Take the pilot seat' : 'Sit down'} · Ranger 1`, use: () => this.toFlight(seat.id) });
    }
  }

  setHatches(open: boolean) {
    const h = this.hatches;
    if (h.open === open) return;
    h.open = open;
    const n = h.slides.length;
    h.slides.forEach((s, k) => { s.target = open ? 1 : 0; s.delay = (open ? k : n - 1 - k) * 0.55; });
    bus.emit('sfx', { id: 'airlock', node: h.slides[0]?.node, gain: 0.6 });
    if (open) {
      for (const b of h.blockers) b.setEnabled(false);
      ui.toast('Pressure equal on both sides · berth hatches opening', 'info', 3);
    } else setTimeout(() => { if (!h.open) for (const b of h.blockers) b.setEnabled(true); }, 2600);
  }

  private terminals() {
    const T = (id: string) => this.int.marker('terminal', id);
    const add = (id: string, use: () => void) => {
      const m = T(id);
      if (m) this.addI({ position: (out) => m.node.getWorldPosition(out), radius: 0.5, range: 2.6, label: () => String(m.data.label ?? 'Terminal'), use });
    };
    add('ops', () => this.game.openPanel('platform', { tab: 'halcyon' }));
    add('traffic', () => this.game.openPanel('platform', { tab: 'traffic' }));
    add('gangway', () => this.game.openPanel('platform', { tab: 'gangway' }));
    add('gallery', () => this.game.openPanel('platform', { tab: 'halcyon' }));
    add('airlock', () => {
      const a = this.airlock;
      if (!a) return;
      if (a.cycling > 0) { ui.toast('Airlock 1 is cycling', 'info', 2); return; }
      a.cycle('Airlock 1 cycling on request · equalising pressure');
    });
    const sh = this.int.marker('shiphatch', 'dorsal');
    if (sh) this.addI({ position: (out) => sh.node.getWorldPosition(out), radius: 0.9, range: 2.6, label: () => 'WSV-1 Halcyon · dorsal hatch',
      use: () => bus.emit('platform:shiphatch') });
  }

  // ------------------------------------------------------------------------------------------- the Halcyon
  /** room groups for culling (Fac exports detail / emissive / glass per section) */
  private collectSections(m: Model) {
    const map = new Map<string, { name: string; nodes: THREE.Object3D[]; box: THREE.Box3 }>();
    m.root.updateMatrixWorld(true);
    m.root.traverse((o) => {
      const sec = o.userData.section as string | undefined;
      if (!sec || !((o as THREE.Mesh).isMesh || o.children.length)) return;
      if (o.parent && o.parent.userData.section === sec) return;
      const key = `${m.name}:${sec}`;
      let e = map.get(key);
      if (!e) { e = { name: key, nodes: [], box: new THREE.Box3() }; map.set(key, e); this.sections.push(e); }
      e.nodes.push(o);
      e.box.expandByObject(o);
    });
  }

  /** the dorsal airlock: outer hatch (on the ship's collar, under the gangway) and inner hatch (hall ceiling) */
  private buildDorsal() {
    const slide = (node: THREE.Object3D | undefined, delay: number): Slide | null =>
      node ? { node, base: node.position.clone(), dir: blenderDir((node.userData.axis as number[]) ?? [1, 0, 0]).normalize(), travel: Number(node.userData.travel ?? 2.6), t: 0, target: 0, speed: 1.1, delay } : null;
    this.dorsal.slides = [slide(this.ship.model.part('hatch_dorsal'), 0), slide(this.hal.part('hatch_inner'), 0.6)].filter(Boolean) as Slide[];
    const g = groups(GROUP.WORLD, 0xffff);
    for (const z of [9.9, 2.95]) {
      const p = B(0, -32, z);
      this.dorsal.blockers.push(this.phys.world.createCollider(discCollider(1.4, 0.06).setTranslation(p.x, p.y, p.z).setCollisionGroups(g)));
    }
    this.addI({ position: (out) => B(0, -32, 3.3, out), radius: 0.9, range: 3.2, label: () => `${this.dorsal.open ? 'Close' : 'Open'} the dorsal airlock (to the Meridian gangway)`,
      use: () => this.setDorsal(!this.dorsal.open) });
  }

  /** open or shut the dorsal airlock: 1.5 s of pressure equalisation, then the hatches move */
  setDorsal(open: boolean) {
    const d = this.dorsal;
    if (d.open === open || d.want !== null) return;
    d.want = open;
    d.busy = 1.5;
    bus.emit('sfx', { id: 'airlock', pos: B(0, -32, 9.0), gain: 0.8 });
    ui.toast(open ? 'Dorsal airlock: equalising with the gangway · hatches opening' : 'Dorsal airlock: hatches closing', 'info', 3);
  }

  private updateDorsal(dt: number) {
    const d = this.dorsal;
    if (d.want !== null) {
      d.busy -= dt;
      if (d.busy <= 0) {
        const open = d.want;
        d.want = null;
        d.open = open;
        d.slides.forEach((s, k) => { s.target = open ? 1 : 0; s.delay = (open ? k : d.slides.length - 1 - k) * 0.6; });
        if (open) { for (const b of d.blockers) b.setEnabled(false); d.reblock = 0; } else d.reblock = 3.2;
        if (open && !story.has('entered_halcyon')) {
          story.set('entered_halcyon');
          mission.note('The Halcyon\'s dorsal airlock is open: float down the shaft into the ship. Bridge forward (through the saucer), engineering aft, hibernation and the pod bay amidships.');
        }
      }
    }
    if (d.reblock > 0) { d.reblock -= dt; if (d.reblock <= 0 && !d.open) for (const b of d.blockers) b.setEnabled(true); }
    for (const s of d.slides) {
      if (s.t === s.target) continue;
      if (s.delay > 0) { s.delay -= dt; continue; }
      const was = s.t;
      s.t = clamp(s.t + Math.sign(s.target - s.t) * dt / (s.travel / s.speed), 0, 1);
      if ((was === 0 && s.t > 0) || s.t === s.target) bus.emit('sfx', { id: s.t === s.target ? 'clamp' : 'door_slide', node: s.node, gain: 0.6 });
      const e = s.t * s.t * (3 - 2 * s.t);
      s.node.position.copy(s.base).addScaledVector(s.dir, s.travel * e);
    }
  }

  /** the Halcyon's terminals and seats */
  private shipTerminals() {
    const T: Record<string, (() => void) | string> = {
      bridge: () => this.game.openPanel('platform', { tab: 'ship' }),
      astrometry: () => this.game.openPanel('platform', { tab: 'astro' }),
      warpops: () => this.game.openPanel('platform', { tab: 'ship' }),
      warpops_b: () => this.game.openPanel('platform', { tab: 'ship' }),
      engineering: () => this.game.openPanel('platform', { tab: 'ship' }),
      rings: () => this.game.openPanel('platform', { tab: 'ship' }),
      dorsal: () => this.setDorsal(!this.dorsal.open),
      cryo: () => this.game.openPanel('cryo', { pod: 0 }),
      medical: 'Medical terminal: all crew vitals nominal · pharmacy stocked · bio-isolation booth sealed and ready.',
      lifesupport: 'Life support: O₂ 21.1 kPa · CO₂ 0.28 kPa · water recovery 94 % · hydroponic trays on a 14-hour light cycle.',
      mess: 'Water dispenser: 0.3 L of recycled water — it tastes like recycled water.',
      laba: 'Lab A sample registry: no samples logged yet. Sealed containment for any biological material from the surface.',
      labb: 'Remote sensing: spectrometer and atmospheric-chemistry bench ready; target list loaded for the Asterion worlds.',
      pods: 'Pod launch control: PODS 01–04 secured in their bays, umbilicals connected. (Pod dispatch is run from here once the ship is in orbit at Asterion.)',
      ringlift: 'Ring B strut lift: restricted — field-ring maintenance crew only, with the field fully down.',
      estop: 'EMERGENCY FIELD SHUTDOWN: guarded. The field core is cold; nothing to shut down.',
    };
    for (const t of this.hal.ofKind('terminal')) {
      const act = T[t.id] ?? (/^pod\d$/.test(t.id) ? `${String(t.data.label)}: pod secured, propellant 100 %, gear stowed, restraints open, bay pressurised.` : null);
      if (!act) continue;
      this.addI({ position: (out) => t.node.getWorldPosition(out), radius: 0.45, range: 2.6, label: () => String(t.data.label ?? 'Terminal'),
        use: () => (typeof act === 'string' ? ui.toast(act, 'info', 6) : act()) });
    }
    for (const sm of this.hal.ofKind('seat')) {
      this.addI({ position: (out) => sm.node.getWorldPosition(out), radius: 0.4, range: 2.4, label: () => String(sm.data.label ?? 'Sit down'),
        enabled: () => !this.occupied.has(sm.id),
        use: () => {
          const pl = this.game.player;
          pl.sit({ node: sm.node, eye: sm.data.eye ?? 0.74, yawLimit: 1.9 });
          this.sitting = sm.node;
          const helm = /pilot|captain/.test(sm.id);
          ui.set({ mode: 'seat', hints: helm ? ['F  stand up', 'Y  ship computer'] : ['F  stand up'] });
          if (helm) ui.toast('WSV-1 Halcyon · flight controls are cold while she is berthed (the ship computer, Y, has her status and the route)', 'info', 5);
        } });
    }
    for (const b of this.hal.ofKind('bed')) {
      this.addI({ position: (out) => b.node.getWorldPosition(out), radius: 0.5, range: 2.4, label: () => String(b.data.label ?? 'Bunk'),
        use: () => ui.toast('For the long sleep use a hibernation capsule (amidships, port side).', 'info', 4) });
    }
  }

  /** the Halcyon's own people, at their posts */
  private async shipCrew() {
    const talk = (greet: string, topics: [string, string, string][]): DialogueDef => ({ greet: () => greet, topics: topics.map(([id, label, say]) => ({ id, label, say: [say] })) });
    const crew: [string, string, string, string, any, DialogueDef][] = [
      ['officer', 'sato', 'Lt. Cmdr. Emi Sato', 'First Officer · Pilot', { shirt: 'cloth_navy', pants: 'cloth_navy', hair: 'hair_black', scale: 0.97, width: 0.94 }, talk(
        'Captain on the bridge. She is quiet now — wait until the rings come up.',
        [['bridge', 'Walk me through the bridge.', 'Dais behind us: your chair, the volumetric display. Down here the flight deck — pilot and co-pilot under the band, navigation to port, engineering to starboard. Everything we need to fly her conventionally works from here.'],
         ['go', 'When do we leave?', 'When engineering reports the core warm and the platform releases the cradle. Until then the helm stays cold and warp is inhibited — we are berthed, with a hatch open to the gangway.']])],
      ['engineer', 'okafor', 'Chidi Okafor', 'Chief Engineer', { shirt: 'suit_orange', pants: 'suit_orange', hair: 'hair_black', skin: 'skin_dark', scale: 1.03 }, talk(
        'Engineering. Mind the red mushroom — it does exactly what it says.',
        [['core', 'How is the field core?', 'Cold standby, on platform power through the umbilical. The reactor gallery is aft of this bulkhead — we keep it sealed until start-up checks.'],
         ['rings', 'And the rings?', 'Standby charge, symmetry within a few hundredths of a percent. Warp ops in the saucer watches them more closely than I do.']])],
      ['fieldtech', 'ruiz', 'Ana Ruiz', 'Warp-Field Specialist', { shirt: 'cloth_white', pants: 'cloth_navy', hair: 'hair_brown', scale: 0.95, width: 0.93 }, talk(
        'Warp ops. Both rings green.',
        [['how', 'How does the field work?', 'The honest answer: it is a speculative model. The rings shape a region where space ahead contracts and space behind expands, and the ship rides inside at rest. Nobody has proven that can be built — we fly the best version of the idea.'],
         ['safe', 'Is it safe?', 'The stabilisers watch symmetry a thousand times a second. If anything drifts, the field drops and we are back in ordinary flight. The ship never warps berthed, with a pod out, or with a hatch open.']])],
      ['navigator', 'haldane', 'Dr. Isaac Haldane', 'Navigator · Astrometrist', { shirt: 'cloth_khaki', pants: 'cloth_navy', hair: 'hair_gray', scale: 1.0 }, talk(
        'Astrometry. Four point two four light-years, give or take a comet.',
        [['target', 'Tell me about Asterion.', 'Two red dwarfs on a six-day orbit round each other, four planets round the pair. Lyravia is the one with life — six species confirmed by the probes. Cindervale, Verdantis and Nivalith have none that we know of.'],
         ['route', 'Our route?', 'Staging two thousand kilometres above Earth, clear of traffic; the field carries us the rest; we drop out short of the system and fly a conventional insertion into Lyravia orbit.']])],
      ['medic', 'brandt', 'Dr. Sofia Brandt', 'Medical Officer', { shirt: 'cloth_white', pants: 'cloth_white', hair: 'hair_blond', scale: 0.96, width: 0.93 }, talk(
        'Medical. Sit, breathe, let the arch take a look at you.',
        [['sleep', 'Hibernation?', 'Four capsules amidships. Climb in, the canopy closes, the scanner reads you, and you wake when we arrive. You will feel cold for an hour. Everyone does.']])],
    ];
    for (const [post, id, name, role, look, dialogue] of crew) {
      const m = this.hal.marker('post', post);
      if (!m) continue;
      const p = m.node.getWorldPosition(new THREE.Vector3());
      const face = blenderDir(m.data.face ?? [0, 1, 0]);
      const n = await this.npcs.spawn({ id, name, role, model: 'char_civilian', look, dialogue,
        state: { location: 'WSV-1 Halcyon', emotion: 'focused', knowledge: ['halcyon'], access: ['all'], equipment: ['tablet'] } }, p, Math.atan2(-face.x, -face.z));
      const seatNode = m.data.seat ? this.hal.node('seat', String(m.data.seat)) : null;
      if (seatNode) { n.attach(seatNode, 'sit', new THREE.Vector3(0, -0.5, 0.02)); this.occupied.add(String(m.data.seat)); continue; }
      n.face(p.clone().addScaledVector(face, 2).setY(p.y + 1.4));
    }
  }

  /** seats taken by the crew */
  private occupied = new Set<string>();

  // ------------------------------------------------------------------------------------------- people
  private async engineers() {
    const talk = (lines: { greet: string; topics: [string, string, string[]][] }): DialogueDef => ({
      greet: () => lines.greet,
      topics: lines.topics.map(([id, label, say]) => ({ id, label, say })),
    });
    const posts: [string, string, string, string, any, DialogueDef][] = [
      ['eng_ops', 'aoki', 'Kenji Aoki', 'Platform Operations Lead', { shirt: 'cloth_white', pants: 'cloth_navy', hair: 'hair_black', scale: 1.0 }, talk({
        greet: 'Commander. Welcome to Meridian. The Halcyon has been waiting on you.',
        topics: [
          ['ready', 'Is the ship ready?', ['Hull, cradle and gangway are green. Both field rings are in standby, the reactor is in cold standby — her own crew brings it up from the bridge. Everything we can check from out here checks out.']],
          ['route', 'How do I get aboard?', ['Through the arm, the glazed gallery between the rings. At the end there is the gangway head: the well drops straight onto her dorsal hatch. No deck plating in the shaft — you float down. Hold the rail.']],
          ['endurance', 'And the Endurance?', ['Sixteen hundred metres aft of us, same orbit. You can see her ring from the gallery\'s aft windows. Your Ranger can take you back across any time — traffic will clear you.']],
        ],
      })],
      ['eng_trf', 'vargas', 'Lucía Vargas', 'Traffic Controller', { shirt: 'cloth_white', pants: 'cloth_navy', hair: 'hair_brown', scale: 0.96, width: 0.94 }, talk({
        greet: 'Traffic. Berth one is yours as long as you need it.',
        topics: [
          ['berth', 'Berth status?', ['Ranger 1 on berth one: hard dock, four restraints closed, deck shoes under the gear, the boom ready if you need propellant.']],
          ['leave', 'How do I leave?', ['Back in the pilot seat, open the flight computer: transfer to the Endurance, or anywhere else you are cleared for. The restraints release with the latches.']],
        ],
      })],
      ['eng_gal', 'mensah', 'Kofi Mensah', 'Field-Ring Engineer', { shirt: 'suit_orange', pants: 'suit_orange', hair: 'hair_black', skin: 'skin_dark', scale: 1.02 }, talk({
        greet: 'Look at them. Sixty metres of radius each and not a gram out of true.',
        topics: [
          ['rings', 'What do the rings do?', ['In theory they shape the field — contract space ahead of the bubble, expand it behind. In practice, today, they hold a standby charge and keep me employed. It is speculative physics, Commander. We built the best version of the speculation we could.']],
          ['light', 'Why do they glow?', ['Coil channels on the inner faces. In standby they breathe like that. Bring the field up and they burn steady — you will not want to look straight at them then.']],
        ],
      })],
      ['eng_gw', 'lindqvist', 'Mara Lindqvist', 'Gangway Technician', { shirt: 'suit_white', pants: 'cloth_khaki', hair: 'hair_blond', scale: 0.97, width: 0.93 }, talk({
        greet: 'Gangway is pressurised and sealed to her collar.',
        topics: [
          ['down', 'How do I get down?', ['Step to the gap in the rail and push off down the well. Ten metres. The handholds and the ladder are on the far wall. Her hatch is at the bottom.']],
          ['inside', 'What is inside?', ['Her own world: bridge forward, engineering aft, the pods in the keel. Watch the transition at the hatch — she has her own deck gravity once you are through.']],
        ],
      })],
    ];
    for (const [post, id, name, role, look, dialogue] of posts) {
      const m = this.int.marker('post', post);
      if (!m) continue;
      const p = m.node.getWorldPosition(new THREE.Vector3());
      const face = blenderDir(m.data.face ?? [0, 1, 0]);
      const n = await this.npcs.spawn({ id, name, role, model: 'char_civilian', look, dialogue,
        state: { location: 'Meridian platform', emotion: 'focused', knowledge: ['halcyon'], access: ['all'], equipment: ['tablet'] } }, p, Math.atan2(-face.x, -face.z));
      n.face(p.clone().addScaledVector(face, 2).setY(p.y + 1.4));
    }
  }

  private static RADIO = [
    ['Meridian Control', 'All stations, Meridian. Halcyon readiness review at the top of the hour. Field ring A coil temperatures nominal, standby charge holding.'],
    ['Halcyon Yard', 'Cradle A and B clamp pressures nominal. Gangway sealed to the dorsal collar, pressure two-zero-niner kilopascal... correction, one-zero-one point three. Coffee is not a pressure unit, Mensah.'],
    ['Meridian Control', 'Field ring B, standby charge stable. Reactor remains in cold standby; start-up authority rests with the Halcyon\'s bridge.'],
    ['Halcyon Yard', 'Pod bays one through four: pods secured, umbilicals connected, doors closed. Ventral clearance zone is cold.'],
    ['Meridian Control', 'Traffic, Meridian. Endurance is sixteen hundred metres aft, holding. No other traffic in the control zone.'],
    ['Halcyon Yard', 'Inspection gantry two to the aft ring for the outer-face survey. Tether up, crew.'],
  ] as const;

  private radio(dt: number) {
    this.radioT -= dt;
    if (this.radioT > 0 || ui.get().panel === 'dialogue') return;
    this.radioT = 50 + Math.random() * 30;
    const [who, line] = PlatformZone.RADIO[this.radioK++ % PlatformZone.RADIO.length];
    ui.say(who, line, 7);
  }

  // ------------------------------------------------------------------------------------------- arrival and departure
  /** Arrive from the orbital zone without a cut: same camera pose, now in the platform's frame. */
  arrive(pos: THREE.Vector3, quat: THREE.Quaternion) {
    const pl = this.game.player;
    pl.stand();
    pl.basis.copy(quat);
    pl.up.set(0, 1, 0).applyQuaternion(quat);
    pl.yaw = 0; pl.pitch = 0;
    pl.teleportEye(pos);
    pl.exitHints = this.r1.ofKind('nav').filter((m) => m.id.startsWith('aisle'))
      .map((m) => m.node.getWorldPosition(new THREE.Vector3()).addScaledVector(pl.up, 0.08))
      .sort((a, b) => a.distanceToSquared(pos) - b.distanceToSquared(pos));
    pl.lookEnabled = true;
    ui.set({ mode: 'foot', hints: [] });
    if (!this.hatches.open) setTimeout(() => ui.toast('The hatch is at the back of the cabin: float to it and Use it to open the way onto the platform', 'info', 6), 700);
    // the crew climbs out with the commander (they stay aboard the Ranger, in their seats)
    const o = this.orbit;
    for (const n of o.npcs.list.slice()) {
      const seat = n.attached ? String(n.attached.userData.id ?? '') : '';
      o.npcs.list.splice(o.npcs.list.indexOf(n), 1);
      this.npcs.adopt(n);
      const node = seat ? this.r1.node('seat', seat) : null;
      if (node) n.attach(node, 'sit', new THREE.Vector3(0, -0.5, 0.02));
    }
    if (!story.has('entered_meridian')) {
      story.set('entered_meridian');
      mission.note('Aboard the Meridian platform. Route to the warp ship: berth vestibule, airlock 1, the station corridor, operations, the access arm and inspection gallery, the gangway head, then down the gangway to the Halcyon\'s dorsal hatch.');
      setTimeout(() => ui.say('Reyes', 'We will keep the Ranger warm, Commander. Go and see your ship.', 4), 1200);
    }
  }

  private toFlight(seatId: string) {
    const o = this.orbit;
    const c = o.ranger;
    if (!c) return;
    // the crew goes back with the Ranger
    const crew = this.npcs.list.filter((n) => n.attached && this.r1.ofKind('seat').some((s) => s.node === n.attached));
    void this.game.gotoZone('orbit', {
      fade: false,
      onEnter: () => {
        const f = this.flight;
        if (f.craft) f.leave(true);
        f.enter(c, o.env, seatId);
        const pairs: [string, string][] = [];
        for (const n of crew) {
          const sid = String(n.attached!.userData.id ?? '');
          this.npcs.list.splice(this.npcs.list.indexOf(n), 1);
          pairs.push([n.id, sid]);
        }
        if (crew.length) o.seatCrew(crew, pairs);
        ui.toast('Berthed · Y opens the flight computer (transfer, undock)', 'info', 4);
      },
    });
  }

  // ------------------------------------------------------------------------------------------- zone
  override enter() {
    super.enter();
    const g = this.game, o = this.orbit;
    g.renderer.spaceScene.add(o.stars.group, o.view.group);
    if (o.body.id === 'earth') g.renderer.spaceScene.add(o.globe.mesh);
    o.sky.setVisible(true);
    o.sky.setFog(0, 0);
    g.renderer.preRender.push(o.place);
    g.renderer.setLook({ exposure: 1.25, saturation: 1.08, contrast: 1.16, bloom: 0.5, aoIntensity: 2.0, aoRadius: 1.0 }, true);
    o.adaptLook = false;
    g.interactions.occlusion = (or, d, max) => { const h = this.phys.raycast(or, d, max, groups(0xffff, GROUP.WORLD)); return h ? h.dist : null; };
    this.npcs.rebind();
    o.sky.invalidate();
    bus.on('platform:shiphatch', this.onShipHatch);
  }

  override leave() {
    this.cryo?.abort();
    super.leave();
    const g = this.game, o = this.orbit;
    g.renderer.spaceScene.remove(o.stars.group, o.globe.mesh, o.view.group);
    o.sky.setVisible(false);
    o.skyRotation = null;
    o.sky.lightRotation = null;
    o.adaptLook = true;
    g.renderer.preRender = g.renderer.preRender.filter((f) => f !== o.place);
    g.interactions.occlusion = null;
    bus.off('platform:shiphatch', this.onShipHatch);
  }

  private onShipHatch = () => { this.setDorsal(!this.dorsal.open); };

  /** deck plating everywhere on the decks; weightless in the Ranger / vestibule and in the gangway shaft */
  override gravityAt(p: THREE.Vector3, out: THREE.Vector3) {
    return out.set(0, -9.81 * this.weight(p), 0);
  }

  /** 0 (weightless) .. 1 (full deck plating) at a point */
  weight(p: THREE.Vector3) {
    const bx = p.x, by = -p.z, bz = p.y;
    const b = ZG_BOX;
    const dx = Math.max(b.x0 - bx, 0, bx - b.x1), dy = Math.max(b.y0 - by, 0, by - b.y1), dz = Math.max(b.z0 - bz, 0, bz - b.z1);
    const d1 = Math.hypot(dx, dy, dz);
    const col = (s: { x: number; y: number; r: number; z0: number; z1: number }) => {
      const dr = Math.max(0, Math.hypot(bx - s.x, by - s.y) - s.r), dh = Math.max(s.z0 - bz, 0, bz - s.z1);
      return Math.hypot(dr, dh);
    };
    const k = clamp(Math.min(d1, col(ZG_SHAFT), col(ZG_WELL)) / RAMP, 0, 1);
    return k * k * (3 - 2 * k);
  }

  override fixedUpdate(dt: number) {
    const o = this.orbit;
    o.advance(dt);
    o.endurance.fixedUpdate(dt);
    this.npcs.fixedUpdate(dt);
  }

  /** the platform's attitude in the orbital zone, and the Endurance where it really is */
  private placeOutside() {
    const o = this.orbit, pf = o.platform;
    if (!pf) return;
    this.q.copy(pf.root.quaternion);
    this.qi.copy(this.q).invert();
    if (this.endu) {
      const er = o.endurance.root;
      this.endu.root.position.copy(er.position).sub(pf.root.position).applyQuaternion(this.qi);
      this.endu.root.quaternion.copy(this.qi).multiply(er.quaternion).multiply(o.endurance.spinNode.quaternion);
      this.endu.root.visible = o.body.id === 'earth';
    }
  }

  override update(dt: number) {
    const g = this.game, o = this.orbit;
    o.endurance.update(dt, g.alpha);
    this.placeOutside();
    o.skyRotation = this.qi;
    o.updateSky();
    const cam = g.renderer.camera;
    cam.getWorldPosition(_v);
    o.sky.shadowFocus.copy(g.player.pos);
    o.sky.shadowRange = 14;
    o.sky.update(dt, _v, o.rE - o.body.R);
    // berth hatches
    for (const s of this.hatches.slides) {
      if (s.t === s.target) continue;
      if (s.delay > 0) { s.delay -= dt; continue; }
      const was = s.t;
      s.t = clamp(s.t + Math.sign(s.target - s.t) * dt / (s.travel / s.speed), 0, 1);
      if ((was === 0 && s.t > 0) || (s.t === s.target)) bus.emit('sfx', { id: s.t === s.target ? 'clamp' : 'door_slide', node: s.node, gain: 0.6 });
      const e = s.t * s.t * (3 - 2 * s.t);
      s.node.position.copy(s.base).addScaledVector(s.dir, s.travel * e);
    }
    this.airlock?.update(dt);
    this.bld.update(dt);
    this.halB.update(dt);
    this.ship.update(dt);
    this.updateDorsal(dt);
    this.screens.update(dt);
    this.cryo.update(dt);
    // standing up from a seat
    if (this.sitting && g.player.mode === 'seated' && g.input.pressed('exit')) {
      const p = this.sitting.getWorldPosition(new THREE.Vector3());
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.sitting.getWorldQuaternion(new THREE.Quaternion()));
      fwd.y = 0;
      g.player.stand(p.addScaledVector(fwd.normalize(), 0.75).add(new THREE.Vector3(0, -0.35, 0)));
      this.sitting = null;
      ui.set({ mode: 'foot', hints: [] });
    }
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.25;
      for (const sc of this.sections) {
        const vis = sc.box.distanceToPoint(_v) < 24;
        for (const n of sc.nodes) n.visible = vis;
      }
    }
    this.npcs.update(dt);
    this.lights.update(_v, dt);
    this.radio(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.2;
      const w = this.weight(g.player.pos);
      ui.set({ clocks: [...o.missionClocks(), { label: 'GRAVITY', value: w < 0.1 ? 'WEIGHTLESS' : `DECK ${w.toFixed(2)} g` }] });
      this.where = this.locate(g.player.pos);
    }
  }

  /** where on the platform a point is */
  locate(p: THREE.Vector3) {
    const bx = p.x, by = -p.z, bz = p.y;
    if (Math.abs(bx) < 17 && by > -47 && by < 72 && bz < 12 && !(bz > 9.95 && Math.hypot(bx, by + 32) < 1.6)) {
      const H = 'WSV-1 Halcyon · ';
      if (Math.hypot(bx, by + 32) < 1.4 && bz > 2.9) return H + 'dorsal airlock shaft';
      if (bz > 5.6 && by > 44) return H + 'bridge';
      if (bz < -0.6) return H + 'pod launch and recovery bay';
      if (by > 56) return H + 'astrometry centre';
      if (by > 38.5) return H + (bx < -6 ? 'warp-field operations' : bx > 6 ? 'science lab B' : 'central hall');
      if (by > 21.5) return H + 'forward passage';
      const side = bx < -1.25 ? -1 : bx > 1.25 ? 1 : 0;
      if (by > 12) return H + (side < 0 ? 'medical bay' : side > 0 ? 'life support · hydroponics' : 'spine corridor');
      if (by > 0) return H + (side < 0 ? 'crew cabins' : side > 0 ? (by > 4 ? 'mess · galley' : 'hygiene') : 'spine corridor');
      if (by > -12.5) return H + (side < 0 ? 'cryogenic hibernation' : side > 0 ? 'storage · cargo' : 'spine corridor');
      if (by > -26.5) return H + (side < 0 ? 'science lab A' : side > 0 ? 'pod-bay access' : 'spine corridor');
      if (by > -36) return H + (side < 0 ? 'field-ring access B' : 'dorsal airlock hall');
      return H + 'engineering';
    }
    if (bx > 84 && by < -58.6) return 'Ranger 1 · berth 1, Meridian platform';
    if (bx > 84 && by < -54.4) return 'Meridian · berth vestibule';
    if (bx > 84 && by < -50.4) return 'Meridian · airlock 1';
    if (bx > 86 && by < -32.8) return 'Meridian · station corridor';
    if (bx > 85) return 'Meridian · operations';
    if (bz < 19.5) return 'Meridian · gangway to the Halcyon';
    if (bx > 62) return 'Meridian · access arm';
    if (bx > 6) return 'Meridian · inspection gallery';
    return 'Meridian · gangway head';
  }

  override locationName() { return this.where || 'Meridian platform'; }

  override soundscape(o: Soundscape) {
    o.wind = 0; o.dust = 0; o.rustle = 0; o.water = 0;
    o.indoors = 1; o.vacuum = 0; o.helmet = 0;
    o.hum = 0.5; o.air = 0.65;
    o.rumble = 0.05;
    o.reverb = 'ship';
    o.music = 'ship';
    o.intensity = 0.25;
    return o;
  }

  seatCrewIn(crew: NPC[]) { for (const n of crew) this.npcs.adopt(n); }
}
