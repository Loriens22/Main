import * as THREE from 'three';
import { Zone } from '../Zone';
import { assets, Model } from '../../render/Assets';
import { materials } from '../../render/Materials';
import { LightPool } from '../../render/LightPool';
import { GROUP, groups, RAPIER } from '../../physics/Physics';
import { Soundscape } from '../../audio/Audio';
import { NPC, NPCManager } from '../../npc/NPC';
import { R_EARTH } from '../../space/Earth';
import type { OrbitZone } from './OrbitZone';
import type { Flight } from '../../vehicles/Flight';
import type { Interactable } from '../../player/Interaction';
import { bus } from '../../core/events';
import { clamp } from '../../core/math';
import { ui } from '../../ui/store';
import { mission } from '../../mission/Mission';
import { story } from '../../core/Story';
import { EnduranceScreens } from './EnduranceScreens';

const blenderDir = (d: number[]) => new THREE.Vector3(d[0], d[2], -d[1]);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m2 = new THREE.Matrix4();

/** Thin disc along local Y as a 16-sided convex prism (exact normals: the character controller can stick on cylinders). */
function discCollider(radius: number, halfH: number) {
  const pts: number[] = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; for (const y of [halfH, -halfH]) pts.push(Math.cos(a) * radius, y, Math.sin(a) * radius); }
  return RAPIER.ColliderDesc.convexHull(new Float32Array(pts))!;
}

/** Turn a geometry inside out (winding and normals), for the inner face of a thin curved panel. */
function flipGeometry(g: THREE.BufferGeometry) {
  const idx = g.index!.array as Uint16Array | Uint32Array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const n = g.attributes.normal.array as Float32Array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}

/** Module names by clock position (the same order as the Blender model). */
const MODULES = ['Habitat A · crew quarters', 'Landing pod 1 · EVA suits', 'Engine 1', 'Habitat B · mess and life support', 'Engine 2',
  'Landing pod 2 · stores', 'Cryo-lab and sick bay', 'Landing pod 3 · laboratory', 'Engine 3', 'Command module', 'Engine 4', 'Landing pod 4 · stores'];

interface Slide { node: THREE.Object3D; base: THREE.Vector3; dir: THREE.Vector3; travel: number; t: number; target: number; speed: number; delay: number }
interface PortGroup { id: string; craft: 'r1' | 'r2'; slides: Slide[]; open: boolean; blockers: RAPIER.Collider[] }
interface Section { name: string; nodes: THREE.Object3D[]; box: THREE.Box3; margin: number }

/**
 * Lift car in the spoke: carries crew between the hub (near weightless) and the corridor deck of Habitat B (about
 * 0.8 g). It travels along the spoke's radial axis; whoever stands in the car rides with it.
 */
class SpokeLift {
  r: number;
  target: number;
  speed: number;
  v = 0;
  private body: RAPIER.RigidBody;
  private base = new THREE.Vector3();
  private up = new THREE.Vector3();
  private rest: number;
  private floor!: RAPIER.Collider;
  moving = false;
  /** shaft gates: the iris across the shaft mouth in the hub floor, and the landing door on the corridor deck */
  private gates: { leaves: { mesh: THREE.Mesh; base: THREE.Vector3; dir: THREE.Vector3; travel: number; turn?: THREE.Object3D }[]; col: RAPIER.Collider; t: number; open: () => boolean }[] = [];

  constructor(public node: THREE.Object3D, private zone: EnduranceZone, public rTop: number, public rBottom: number, speed: number) {
    this.r = this.target = rBottom;
    this.rest = rBottom;
    this.speed = speed;
    this.base.copy(node.position);
    this.up.set(0, 1, 0).applyQuaternion(node.quaternion);
    const w = zone.phys.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const g = groups(GROUP.WORLD, 0xffff);
    const rc = 1.08;
    // floor: a 16-sided prism (exact face normals; the character controller sticks on Rapier's rounded cylinder)
    // floor 12 mm under the deck surface; parked at the bottom the deck carries the rider and the floor is switched
    // off (a kinematic floor flush with the deck snags the character controller at its rim)
    this.floor = w.createCollider(discCollider(rc, 0.04).setTranslation(0, -0.052, 0).setCollisionGroups(g), this.body);
    for (let k = 0; k < 12; k++) {
      const a = (k + 0.5) * (Math.PI * 2 / 12);
      const deg = (a * 180) / Math.PI;
      // the cage is open toward the car's local +Z (its door: Blender +Y), i.e. angles round 90 deg in Blender terms
      if (deg > 50 && deg < 130) continue;
      // Blender (cos a, sin a) -> engine (x, -z): the door faces engine -Z
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 1.15, 0.03).setTranslation(Math.cos(a) * rc, 1.15, -Math.sin(a) * rc)
        .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI / 2)).setCollisionGroups(g), this.body);
    }
    this.sync(true);
    this.buildGates(rc);
  }

  /**
   * Nobody falls down an empty shaft: the hub mouth is closed by a two-leaf iris unless the car is parked at the top,
   * and the landing door on the corridor deck stays shut unless the car is at the bottom.
   */
  private buildGates(rc: number) {
    const w = this.zone.phys.world;
    const parent = this.node.parent!;
    // rest frame of the car (at the bottom landing), in the parent's space
    const R = new THREE.Matrix4().compose(this.base, this.node.quaternion, new THREE.Vector3(1, 1, 1));
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(this.node.quaternion);
    const g = groups(GROUP.WORLD, 0xffff);
    const steel = materials.get('metal_steel'), yellow = materials.get('paint_yellow'), blue = materials.get('paint_blue');
    const toWorld = (v: THREE.Vector3) => parent.localToWorld(v.clone());
    const qWorld = parent.getWorldQuaternion(new THREE.Quaternion()).multiply(this.node.quaternion);
    // hub iris: two half discs in the plane of the hub wall
    {
      const h = this.rest - (2.35 + 0.04);               // from the bottom landing up to just outside the hub wall
      const c = new THREE.Vector3(0, h, 0).applyMatrix4(R);
      const leaves = [-1, 1].map((s) => {
        const geo = new THREE.CylinderGeometry(rc + 0.16, rc + 0.16, 0.05, 28, 1, false, s > 0 ? 0 : Math.PI, Math.PI);
        const mesh = new THREE.Mesh(geo, s > 0 ? steel : yellow);
        mesh.quaternion.copy(this.node.quaternion);
        mesh.position.copy(c);
        mesh.castShadow = mesh.receiveShadow = true;
        parent.add(mesh);
        // three's cylinder puts theta 0..PI on the local +X half (x = r sin theta): each leaf slides out along X
        return { mesh, base: c.clone(), dir: ax.clone().multiplyScalar(s > 0 ? 1 : -1), travel: rc + 0.25 };
      });
      const cw = toWorld(c);
      const col = w.createCollider(discCollider(rc + 0.12, 0.04).setTranslation(cw.x, cw.y, cw.z).setRotation(qWorld).setCollisionGroups(g));
      this.gates.push({ leaves, col, t: 0, open: () => !this.moving && Math.abs(this.r - this.rTop) < 0.03 });
    }
    // corridor-deck landing door: a curved leaf between the enclosure's two shells that turns round the shaft axis
    // to open (the doorway spans 55..125 deg in the model's frame, i.e. three.js theta 145..215 deg about the car axis)
    {
      const rD = rc + 0.27, hD = 2.12;
      const span = (74 * Math.PI) / 180, th0 = (143 * Math.PI) / 180;
      const pivot = new THREE.Group();
      pivot.position.copy(this.base);
      pivot.quaternion.copy(this.node.quaternion);
      parent.add(pivot);
      const spin = new THREE.Group();                    // turns about the car axis (the pivot's local Y)
      pivot.add(spin);
      const outer = new THREE.CylinderGeometry(rD + 0.012, rD + 0.012, hD, 18, 1, true, th0, span).translate(0, hD / 2, 0);
      const inner = flipGeometry(new THREE.CylinderGeometry(rD - 0.012, rD - 0.012, hD, 18, 1, true, th0, span).translate(0, hD / 2, 0));
      const band = new THREE.CylinderGeometry(rD + 0.016, rD + 0.016, 0.08, 18, 1, true, th0, span).translate(0, 0.36, 0);
      for (const [geo, mat] of [[outer, blue], [inner, blue], [band, yellow]] as [THREE.BufferGeometry, THREE.Material][]) {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = m.receiveShadow = true;
        spin.add(m);
      }
      const leaf = spin.children[0] as THREE.Mesh;
      const c = new THREE.Vector3(0, hD / 2, -(rc + 0.13)).applyMatrix4(R);
      const cw = toWorld(c);
      const col = w.createCollider(RAPIER.ColliderDesc.cuboid(0.8, hD / 2, 0.16).setTranslation(cw.x, cw.y, cw.z).setRotation(qWorld).setCollisionGroups(g));
      this.gates.push({ leaves: [{ mesh: leaf, base: new THREE.Vector3(), dir: new THREE.Vector3(), travel: 0, turn: spin }], col, t: 0,
        open: () => !this.moving && Math.abs(this.r - this.rBottom) < 0.03 });
    }
  }

  /** animate the gates (render rate) */
  updateGates(dt: number) {
    for (const gt of this.gates) {
      const want = gt.open() ? 1 : 0;
      if (gt.t === want) continue;
      const was = gt.t;
      gt.t = clamp(gt.t + Math.sign(want - gt.t) * dt / 1.1, 0, 1);
      if (was === 0 || gt.t === want) bus.emit('sfx', { id: gt.t === want ? 'clamp' : 'door_slide', node: gt.leaves[0].mesh, gain: 0.45 });
      const e = gt.t * gt.t * (3 - 2 * gt.t);
      for (const l of gt.leaves) {
        if (l.turn) l.turn.rotation.y = e * 1.4;        // swing the curved leaf round behind the shell
        else l.mesh.position.copy(l.base).addScaledVector(l.dir, l.travel * e);
      }
      gt.col.setEnabled(gt.t < 0.85);
    }
  }

  /** radius of the car floor -> node position */
  private sync(now = false) {
    this.node.position.copy(this.base).addScaledVector(this.up, this.rest - this.r);
    this.node.updateWorldMatrix(true, false);
    const p = this.node.getWorldPosition(_v), q = this.node.getWorldQuaternion(_q);
    if (now) { this.body.setTranslation(p, true); this.body.setRotation(q, true); }
    else { this.body.setNextKinematicTranslation(p); this.body.setNextKinematicRotation(q); }
  }

  goTo(r: number) {
    if (Math.abs(r - this.target) < 0.01) return;
    this.target = r;
    bus.emit('sfx', { id: 'button', node: this.node, gain: 0.7 });
  }

  toggle() { this.goTo(this.target > (this.rTop + this.rBottom) / 2 ? this.rTop : this.rBottom); }

  contains(p: THREE.Vector3) {
    _w.copy(p);
    this.node.worldToLocal(_w);
    return Math.hypot(_w.x, _w.z) < 1.1 && _w.y > -0.4 && _w.y < 2.6;
  }

  fixedUpdate(dt: number) {
    const d = this.target - this.r;
    const was = this.moving;
    // trapezoidal speed profile
    const want = Math.sign(d) * Math.min(this.speed, Math.sqrt(2 * 0.8 * Math.abs(d)));
    this.v += clamp(want - this.v, -1.2 * dt, 1.2 * dt);
    if (Math.abs(d) < 0.005 && Math.abs(this.v) < 0.05) { this.v = 0; this.r = this.target; }
    this.moving = Math.abs(this.v) > 1e-4;
    this.floor.setEnabled(this.moving || Math.abs(this.r - this.rBottom) > 0.02);
    if (was && !this.moving) bus.emit('sfx', { id: 'thud', node: this.node, gain: 0.5 });
    if (!this.moving) return;
    const dr = this.v * dt;
    const pl = this.zone.game.player;
    const riding = pl.mode !== 'seated' && this.contains(pl.pos);
    this.r += dr;
    this.sync();
    // the car moves "up" (toward the axis) when r decreases
    if (riding) pl.carry(_w.copy(this.up).multiplyScalar(-dr));
  }
}

/**
 * Inside the Endurance. The zone frame turns with the ship, so the ship is still and everything outside wheels round
 * it at the spin rate: gravity here is the centrifugal acceleration w^2 r away from the spin axis (about 1 g on the
 * main decks at 5.25 rpm, a fraction of that on the corridor decks, nearly nothing in the hub), and it changes the
 * moment the ring is spun up or down. The docked Rangers are part of the place: their cabins are walkable and their
 * seats hand the player back to flight.
 */
export class EnduranceZone extends Zone {
  ext!: Model;
  int!: Model;
  r1!: Model;
  r2!: Model;
  lights!: LightPool;
  npcs!: NPCManager;
  lift: SpokeLift | null = null;
  screens!: EnduranceScreens;
  ports: PortGroup[] = [];
  private sections: Section[] = [];
  private cullT = 0;
  private hudT = 0;
  private shipQ = new THREE.Quaternion();
  private shipQi = new THREE.Quaternion();
  private where = '';
  private sitting: THREE.Object3D | null = null;
  private crewPosted = false;

  private get orbit() { return this.game.zones.get('orbit') as OrbitZone; }
  private get flight() { return this.game.services.flight as Flight; }

  /** spin rate (rad/s) of the real ship */
  get omega() { return this.orbit?.endurance?.rate ?? 0; }

  private addI(i: Interactable) { this.game.interactions.add(i); (i as any).__scope = this.id; return i; }

  async load(progress?: (f: number, label: string) => void) {
    const g = this.game;
    await g.preload('orbit');
    progress?.(0.15, 'Endurance');
    this.ext = await assets.load('endurance');
    progress?.(0.35, 'Endurance interior');
    this.int = await assets.load('endurance_int');
    this.root.add(this.ext.root, this.int.root);
    this.root.updateMatrixWorld(true);
    this.phys.addTrimesh(this.int.colliders);
    this.lights = new LightPool(this.root, 10, 2);
    for (const m of this.int.ofKind('light')) { const f = this.lights.addFromMarker(m.node, m.data, true); f.room = m.data.room; }
    progress?.(0.6, 'Rangers');
    this.r1 = await assets.load('ranger');
    this.r2 = await assets.load('ranger');
    for (const [m, port] of [[this.r1, 'axial_fwd'], [this.r2, 'axial_aft']] as [Model, string][]) {
      this.root.add(m.root);
      this.dockModel(m, port);
      const cabin: THREE.Mesh[] = [];
      m.root.traverse((o) => {
        // (a node's mesh can sit a level or two below the node carrying the tag: material primitives under a mesh group)
        let part: string | undefined;
        for (let a: THREE.Object3D | null = o; a && a !== m.root && part === undefined; a = a.parent) part = a.userData.part;
        if ((o as THREE.Mesh).isMesh && (part === 'cabin' || part === 'cabin_detail' || part === 'canopy')) cabin.push(o as THREE.Mesh);
      });
      this.phys.addTrimesh(cabin);
      for (const l of m.ofKind('light')) if (l.data.group === 'ranger_cabin') this.lights.addFromMarker(l.node, l.data, true);
    }
    this.buildPorts();
    const car = this.int.part('lift_car');
    const cm = this.int.marker('rlift', 'spoke');
    if (car && cm) {
      this.lift = new SpokeLift(car, this, Number(cm.data.r_top), Number(cm.data.r_bottom), Number(cm.data.speed ?? 2.4));
      this.addI({ position: (out) => out.set(-0.95, 1.3, 0).applyMatrix4(car.matrixWorld), radius: 0.18, range: 2.4,
        label: () => (this.lift!.target < 10 ? 'Spoke lift — down to the ring' : 'Spoke lift — up to the hub'), use: () => this.lift!.toggle() });
    }
    for (const m of this.int.ofKind('liftcall')) {
      const top = m.data.level === 'top';
      this.addI({ position: (out) => m.node.getWorldPosition(out), radius: 0.35, range: 3.0, label: () => String(m.data.label ?? 'Call the lift'),
        use: () => this.lift?.goTo(top ? this.lift.rTop : this.lift.rBottom) });
    }
    this.collectSections();
    this.terminals();
    this.screens = new EnduranceScreens(this);
    this.screens.build(this.int);
    this.npcs = new NPCManager({ game: g, phys: this.phys, parent: this.root, up: (p, out) => this.upAt(p, out), weightless: () => this.omega < 0.05 });
    progress?.(1, 'Ready');
  }

  /** Pose a Ranger model at a port exactly as the docking mechanism holds it (same maths as DockingSystem). */
  private dockModel(m: Model, portId: string) {
    m.root.position.set(0, 0, 0);
    m.root.quaternion.identity();
    m.root.updateMatrixWorld(true);
    const ring = m.marker('dock', 'rear')!;
    const rp = ring.node.getWorldPosition(new THREE.Vector3());
    const rd = blenderDir(ring.data.dir ?? [0, -1, 0]).normalize(), ru = blenderDir(ring.data.up ?? [0, 0, 1]).normalize();
    const port = this.ext.marker('dock', portId)!;
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

  /** The hatch sets between each Ranger and the hub: Ranger cabin hatch, Ranger docking hatch, hub port hatch. */
  private buildPorts() {
    const slide = (node: THREE.Object3D | undefined, axisB: number[], travel: number, delay: number, speed = 1.2): Slide | null => {
      if (!node) return null;
      return { node, base: node.position.clone(), dir: blenderDir(axisB).normalize(), travel, t: 0, target: 0, speed, delay };
    };
    for (const [id, craft, model] of [['axial_fwd', 'r1', this.r1], ['axial_aft', 'r2', this.r2]] as [string, 'r1' | 'r2', Model][]) {
      const slides = [
        slide(model.part('hatch_inner'), [1, 0, 0], 1.1, 0.0),
        slide(model.part('hatch_outer'), [1, 0, 0], 1.25, 0.5),
        slide(this.ext.part(`hatch_${id}`), [0, 0, 1], 1.9, 1.0, 1.0),
      ].filter(Boolean) as Slide[];
      // collision while shut: a disc in the hub port and one at the cabin end of the Ranger's tunnel
      const blockers: RAPIER.Collider[] = [];
      const pm = this.ext.marker('dock', id)!;
      const pp = pm.node.getWorldPosition(new THREE.Vector3());
      const hubDisc = discCollider(0.98, 0.05).setTranslation(pp.x, pp.y, pp.z - Math.sign(pp.z) * 0.3)
        .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)).setCollisionGroups(groups(GROUP.WORLD, 0xffff));
      blockers.push(this.phys.world.createCollider(hubDisc));
      const hi = model.part('hatch_inner');
      if (hi) {
        const p = hi.getWorldPosition(new THREE.Vector3());
        const ax = new THREE.Vector3(0, 0, 1).applyQuaternion(model.root.quaternion);
        const d = discCollider(0.6, 0.04).setTranslation(p.x, p.y, p.z)
          .setRotation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax)).setCollisionGroups(groups(GROUP.WORLD, 0xffff));
        blockers.push(this.phys.world.createCollider(d));
      }
      const pg: PortGroup = { id, craft, slides, open: false, blockers };
      this.ports.push(pg);
      const label = () => `${pg.open ? 'Close' : 'Open'} the docking hatches (${craft === 'r1' ? 'Ranger 1' : 'Ranger 2'})`;
      const ctl = this.int.marker('hatch_ctl', id);
      if (ctl) this.addI({ position: (out) => ctl.node.getWorldPosition(out), radius: 0.5, range: 3.4, label, use: () => this.setHatches(pg, !pg.open) });
      const inner = model.marker('hatch', 'rear_inner');
      if (inner) this.addI({ position: (out) => inner.node.getWorldPosition(out), radius: 0.55, range: 2.8, label, use: () => this.setHatches(pg, !pg.open) });
      for (const seat of model.ofKind('seat')) {
        const pilot = seat.id.startsWith('pilot');
        this.addI({ position: (out) => seat.node.getWorldPosition(out).addScaledVector(_v.set(0, 1, 0).applyQuaternion(model.root.quaternion), 0.4),
          radius: 0.45, range: 2.6, label: () => `${pilot ? 'Take the pilot seat' : 'Sit down'} · ${craft === 'r1' ? 'Ranger 1' : 'Ranger 2'}`,
          use: () => this.toFlight(craft, seat.id) });
      }
    }
  }

  setHatches(pg: PortGroup, open: boolean) {
    if (pg.open === open) return;
    pg.open = open;
    const n = pg.slides.length;
    pg.slides.forEach((s, k) => { s.target = open ? 1 : 0; s.delay = (open ? k : n - 1 - k) * 0.55; });
    bus.emit('sfx', { id: 'airlock', node: pg.slides[0]?.node, gain: 0.6 });
    if (open) {
      for (const b of pg.blockers) b.setEnabled(false);
      ui.toast('Pressure equal on both sides · hatches opening', 'info', 3);
      if (pg.craft === 'r1' && !story.has('entered_endurance')) mission.note('Docking hatches open between Ranger 1 and the Endurance.');
    } else setTimeout(() => { if (!pg.open) for (const b of pg.blockers) b.setEnabled(true); }, 2600);
  }

  private collectSections() {
    const map = new Map<string, Section>();
    this.int.root.traverse((o) => {
      const s = o.userData.section as string | undefined;
      if (!s || !((o as THREE.Mesh).isMesh || o.children.length)) return;
      if (o.parent && o.parent.userData.section === s) return;
      let sec = map.get(s);
      if (!sec) { sec = { name: s, nodes: [], box: new THREE.Box3(), margin: s === 'spoke' ? 30 : s.startsWith('n') ? 16 : 22 }; map.set(s, sec); this.sections.push(sec); }
      sec.nodes.push(o);
      sec.box.expandByObject(o);
    });
  }

  /** Ship terminals: rotation control, vehicles, crew, cryo, engines, life support. */
  private terminals() {
    const TAB: Record<string, string> = { rotation: 'rotation', docking: 'vehicles', nav: 'navigation', crew: 'crew', cryo: 'crew', lifesupport: 'systems', lab: 'systems', eva: 'vehicles', hab0: 'crew' };
    for (const t of this.int.ofKind('terminal')) {
      const tab = TAB[t.id] ?? (t.id.startsWith('eng') ? 'systems' : 'rotation');
      this.addI({ position: (out) => t.node.getWorldPosition(out), radius: 0.45, range: 2.6, label: () => String(t.data.label ?? 'Terminal'), use: () => this.game.openPanel('ship', { tab }) });
    }
    for (const s of this.int.ofKind('seat')) {
      this.addI({ position: (out) => s.node.getWorldPosition(out), radius: 0.4, range: 2.4, label: () => String(s.data.label ?? 'Sit down'),
        use: () => {
          const pl = this.game.player;
          pl.sit({ node: s.node, eye: s.data.eye ?? 0.72, yawLimit: 1.9 });
          this.sitting = s.node;
          ui.set({ mode: 'seat', hints: ['F  stand up'] });
        } });
    }
    for (const c of this.int.ofKind('cryo')) {
      this.addI({ position: (out) => c.node.getWorldPosition(out), radius: 0.6, range: 2.4, label: () => (this.orbit.mode === 'cruise' ? 'Hibernate' : String(c.data.label ?? 'Hibernation pod')),
        use: () => this.game.openPanel('cryo') });
    }
    for (const b of this.int.ofKind('bed')) {
      this.addI({ position: (out) => b.node.getWorldPosition(out), radius: 0.5, range: 2.4, label: () => String(b.data.label ?? 'Bunk'),
        use: () => ui.toast('Crew rest is scheduled by the mission clock (cryo and sleep cycles come with the voyage).', 'info', 4) });
    }
  }

  // ------------------------------------------------------------------------------------------- crew
  /**
   * The crew follows the commander out of the Ranger and goes to work: by the time the commander is down in the ring
   * (out of sight of the docked Ranger) each of them is at a post that fits the job.
   */
  private postCrew() {
    this.crewPosted = true;
    const POSTS: Record<string, { kind: 'seat' | 'terminal'; id: string; where: string }> = {
      reyes: { kind: 'seat', id: 'cmd_r', where: 'Command module · right seat' },
      hartmann: { kind: 'terminal', id: 'cryo', where: 'Cryo-lab and sick bay' },
      okoye: { kind: 'terminal', id: 'lab', where: 'Landing pod 3 · laboratory' },
    };
    let moved = 0;
    for (const n of this.npcs.list) {
      const post = POSTS[n.id];
      const m = post && this.int.marker(post.kind, post.id);
      if (!post || !m) continue;
      n.brain = null;
      (n as any).post = post.where;
      n.state.location = 'Endurance';
      moved++;
      if (post.kind === 'seat') { n.attach(m.node, 'sit', new THREE.Vector3(0, -0.5, 0.02)); continue; }
      // standing on the deck in front of the console, facing it
      const at = m.node.getWorldPosition(new THREE.Vector3());
      const up = this.upAt(at, new THREE.Vector3());
      const hit = this.phys.raycast(at, _x.copy(up).negate(), 3, groups(0xffff, GROUP.WORLD));
      const feet = at.clone().addScaledVector(up, -(hit ? hit.dist : 1.2) + 0.03);
      n.place(feet, 0);
      n.face(at.clone().addScaledVector(up, -0.3));
    }
    if (moved) mission.note('The crew has gone to their stations: Reyes in the command module, Hartmann in the cryo-lab, Okoye in the laboratory.');
  }

  // ------------------------------------------------------------------------------------------- arrival and departure
  /** Ship rotation (orbital frame <- ship frame) at the angle being drawn now. */
  shipRotation(out: THREE.Quaternion) {
    const e = this.orbit.endurance;
    return out.copy(e.root.quaternion).multiply(e.spinNode.quaternion);
  }

  /** Arrive from the orbital zone without a cut: same camera pose, now in the ship's own frame. */
  arrive(pos: THREE.Vector3, quat: THREE.Quaternion, craft: 'r1' | 'r2') {
    const pl = this.game.player;
    pl.stand();
    pl.basis.copy(quat);
    pl.up.set(0, 1, 0).applyQuaternion(quat);
    pl.yaw = 0; pl.pitch = 0;
    // the eyes where the seat had them, whatever the body's posture (weightless at the hub: tucked up); if the body
    // then overlaps the seat or the console, the player controller moves it to the nearest free spot in the cabin
    pl.teleportEye(pos);
    // the cabin aisle beside the seats, nearest first: where the commander floats out if the seat holds the body
    const cabin = craft === 'r1' ? this.r1 : this.r2;
    pl.exitHints = cabin.ofKind('nav').filter((m) => m.id.startsWith('aisle'))
      .map((m) => m.node.getWorldPosition(new THREE.Vector3()).addScaledVector(pl.up, 0.08))
      .sort((a, b) => a.distanceToSquared(pos) - b.distanceToSquared(pos));
    pl.lookEnabled = true;
    ui.set({ mode: 'foot', hints: [] });
    const pg = this.ports.find((p) => p.craft === craft);
    if (pg && !pg.open) setTimeout(() => ui.toast('The docking hatch is at the back of the cabin: float to it and Use it to open the way into the Endurance', 'info', 6), 700);
    const o = this.orbit;
    // the crew climbs out with the commander
    const mdl = craft === 'r1' ? this.r1 : this.r2;
    for (const n of o.npcs.list.slice()) {
      const seat = n.attached ? String(n.attached.userData.id ?? '') : '';
      o.npcs.list.splice(o.npcs.list.indexOf(n), 1);
      this.npcs.adopt(n);
      const node = seat ? mdl.node('seat', seat) : null;
      if (node) n.attach(node, 'sit', new THREE.Vector3(0, -0.5, 0.02));
    }
    if (!story.has('entered_endurance')) {
      story.set('entered_endurance');
      mission.setPhase('docked');
      setTimeout(() => ui.say('Reyes', 'Hatch is yours, Commander. Mind the hub — almost no weight up there.', 4), 1200);
    }
  }

  private toFlight(craft: 'r1' | 'r2', seatId: string) {
    const o = this.orbit;
    const c = craft === 'r1' ? o.ranger : o.ranger2;
    if (!c) return;
    void this.game.gotoZone('orbit', {
      fade: false,
      onEnter: () => {
        const f = this.flight;
        if (f.craft) f.leave(true);
        f.enter(c, o.env, seatId);
        ui.toast('Docked · Y opens the flight computer (undock, rendezvous, docking)', 'info', 4);
      },
    });
  }

  // ------------------------------------------------------------------------------------------- zone
  override enter() {
    super.enter();
    const g = this.game, o = this.orbit;
    g.renderer.spaceScene.add(o.stars.group, o.view.group);
    if (o.body.id === 'earth') g.renderer.spaceScene.add(o.globe.mesh);
    if (o.lens) g.renderer.spaceScene.add(o.lens.mesh);
    o.sky.setVisible(true);
    o.sky.setFog(0, 0);
    g.renderer.preRender.push(o.place);
    g.renderer.setLook({ exposure: 1.3, saturation: 1.1, contrast: 1.18, bloom: 0.5, aoIntensity: 2.0, aoRadius: 1.0 }, true);
    o.adaptLook = false;
    g.interactions.occlusion = (or, d, max) => { const h = this.phys.raycast(or, d, max, groups(0xffff, GROUP.WORLD)); return h ? h.dist : null; };
    this.npcs.rebind();
    o.sky.invalidate();
  }

  override leave() {
    super.leave();
    const g = this.game, o = this.orbit;
    g.renderer.spaceScene.remove(o.stars.group, o.globe.mesh, o.view.group);
    if (o.lens) g.renderer.spaceScene.remove(o.lens.mesh);
    o.sky.setVisible(false);
    o.skyRotation = null;
    o.sky.lightRotation = null;
    o.adaptLook = true;
    g.renderer.preRender = g.renderer.preRender.filter((f) => f !== o.place);
    g.interactions.occlusion = null;
  }

  /** centrifugal acceleration away from the spin axis (engine Z) */
  override gravityAt(p: THREE.Vector3, out: THREE.Vector3) {
    const w2 = this.omega * this.omega;
    return out.set(p.x * w2, p.y * w2, 0);
  }

  upAt(p: THREE.Vector3, out: THREE.Vector3) {
    const r = Math.hypot(p.x, p.y);
    return r > 1e-3 ? out.set(-p.x / r, -p.y / r, 0) : out.set(0, 1, 0);
  }

  override fixedUpdate(dt: number) {
    const o = this.orbit;
    // the ship keeps flying while we are inside it (time compression, the voyage, a wormhole passage)
    o.advance(dt);
    if (o.traverse) o.traverseStep(dt);
    o.endurance.fixedUpdate(dt);
    this.lift?.fixedUpdate(dt);
    this.npcs.fixedUpdate(dt);
  }

  override update(dt: number) {
    const g = this.game, o = this.orbit;
    o.endurance.update(dt, g.alpha);
    // the universe seen from the spinning ship
    this.shipRotation(this.shipQ);
    this.shipQi.copy(this.shipQ).invert();
    o.skyRotation = this.shipQi;
    o.updateSky();
    const cam = g.renderer.camera;
    cam.getWorldPosition(_v);
    o.sky.shadowFocus.copy(g.player.pos);
    o.sky.shadowRange = 12;
    o.sky.update(dt, _v, o.rE - o.body.R);
    for (const pg of this.ports) {
      for (const s of pg.slides) {
        if (s.t === s.target) continue;
        if (s.delay > 0) { s.delay -= dt; continue; }
        const was = s.t;
        s.t = clamp(s.t + Math.sign(s.target - s.t) * dt / (s.travel / s.speed), 0, 1);
        if ((was === 0 && s.t > 0) || (s.t === s.target)) bus.emit('sfx', { id: s.t === s.target ? 'clamp' : 'door_slide', node: s.node, gain: 0.6 });
        const e = s.t * s.t * (3 - 2 * s.t);
        s.node.position.copy(s.base).addScaledVector(s.dir, s.travel * e);
      }
    }
    // standing up from a ship's seat
    if (this.sitting && g.player.mode === 'seated' && g.input.pressed('exit')) {
      const p = this.sitting.getWorldPosition(new THREE.Vector3());
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.sitting.getWorldQuaternion(_q));
      this.upAt(p, _w);
      g.player.stand(p.addScaledVector(fwd, 0.7).addScaledVector(_w, -0.4));
      this.sitting = null;
      ui.set({ mode: 'foot', hints: [] });
    }
    this.lift?.updateGates(dt);
    this.screens.update(dt);
    if (!this.crewPosted && Math.hypot(g.player.pos.x, g.player.pos.y) > 18) this.postCrew();
    this.npcs.update(dt);
    this.lights.update(_v, dt);
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.25;
      for (const s of this.sections) {
        const vis = s.box.distanceToPoint(_v) < s.margin;
        for (const n of s.nodes) n.visible = vis;
      }
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.2;
      const gm = this.gravityAt(g.player.pos, _w).length();
      ui.set({ clocks: [...o.missionClocks(), { label: 'SPIN', value: `${o.endurance.rpm.toFixed(2)} rpm` }, { label: 'GRAVITY', value: `${(gm / 9.81).toFixed(2)} g` }] });
      this.where = this.locate(g.player.pos);
    }
  }

  /** Where in the ship a point is. */
  locate(p: THREE.Vector3) {
    const r = Math.hypot(p.x, p.y);
    if (Math.abs(p.z) > 5.3 && r < 3.2) return p.z < 0 ? 'Ranger 1 · docked forward' : 'Ranger 2 · docked aft';
    if (r < 2.7) return 'Endurance · central hub';
    const th = ((Math.atan2(-p.x, p.y) * 180) / Math.PI + 360) % 360;
    const k = Math.round(th / 30) % 12;
    if (r < 22 && Math.abs(th - 90) < 8) return 'Endurance · spoke';
    const offset = Math.abs(th - k * 30);
    if (offset > 10 && r < 26.2) return 'Endurance · ring tunnel';
    return `Endurance · ${MODULES[k]}${r < 25.3 ? ' · corridor deck' : ''}`;
  }

  override locationName() { return this.where || 'Endurance'; }

  override soundscape(o: Soundscape) {
    o.wind = 0; o.dust = 0; o.rustle = 0; o.water = 0;
    o.indoors = 1; o.vacuum = 0; o.helmet = 0;
    o.hum = 0.55; o.air = 0.6;
    o.rumble = clamp(this.omega / 0.55, 0, 1) * 0.12;
    const tr = this.orbit.traverse;
    // through the wormhole the whole structure hums and shudders, hardest in the throat
    if (tr) o.rumble = Math.max(o.rumble, 0.35 + 0.65 * Math.exp(-((tr.l / (3 * this.orbit.body.R)) ** 2)));
    o.reverb = 'ship';
    o.music = 'ship';
    o.intensity = 0.3;
    return o;
  }

  seatCrewIn(crew: NPC[]) { for (const n of crew) this.npcs.adopt(n); }
}
