import * as THREE from 'three';
import { assets, Model } from '../../render/Assets';
import { Building } from '../Building';
import { NavGraph } from '../../npc/Nav';
import { GROUP, groups } from '../../physics/Physics';
import { NASA, SILO_ALONG } from './EarthMap';
import { bus } from '../../core/events';
import { clamp, damp } from '../../core/math';
import { RAPIER } from '../../physics/Physics';
import type { PhysicsWorld } from '../../physics/Physics';
import type { Game } from '../../core/Game';
import { NasaStaff } from './NasaStaff';
import { NasaScreens } from './NasaScreens';
import { mission } from '../../mission/Mission';
import { ui } from '../../ui/store';
import type { EarthZone } from './EarthZone';
import { LaunchStack } from '../../mission/LaunchStack';
import { FlightEnv, RANGER_SPEC, Spacecraft } from '../../vehicles/Spacecraft';
import { airDensity } from '../../space/Earth';

const BIG = new Set(['tunnel', 'bay', 'corridor', 'hall', 'cavern', 'cavern_fx', 'tower']);

interface Section { name: string; nodes: THREE.Object3D[]; box: THREE.Box3; margin: number }

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** Room footprints in facility-local coordinates (lat = right of the tunnel axis, along = into the mountain). */
const AREAS: [name: string, lat0: number, lat1: number, along0: number, along1: number][] = [
  ['Entrance Tunnel', -6, 6, 2, 70.3],
  ['Vehicle Bay', -18.5, 18.5, 70.3, 110],
  ['Security Office', -12, -2.7, 110.8, 121.2],
  ['Crew Briefing Room', -16, -2.7, 121.2, 137.2],
  ['Mission Control', -23, -2.7, 137.2, 166.2],
  ['Computer Center', -16, -2.7, 166.2, 180.2],
  ['Observation & Astrophysics', -17, -2.7, 180.2, 198.2],
  ['Utilities Plant', -11, -2.7, 198.2, 232],
  ['Equipment Storage', 2.7, 15, 110.8, 124.2],
  ['Engineering Workshop', 2.7, 17, 124.2, 144.2],
  ['Pathology Laboratory', 2.7, 16, 144.2, 162.2],
  ['Experimental Greenhouse', 2.7, 19, 162.2, 190.2],
  ['Life Support', 2.7, 16, 190.2, 208.2],
  ['Crew Preparation', 2.7, 16, 208.2, 232],
  ['Research Complex', -2.7, 2.7, 110, 232.2],
  ['Assembly Hall', -24, 24, 232.2, 281],
  ['Launch Complex', -34, 30, 281, 340],
];

/** Height of the first-stage base above the facility floor (the vehicle stands in the pit). */
export const ROCKET_BASE = -40;
/** silo shaft radius (blender/assets/nasa.py SHAFT_R) */
const SHAFT_R = 15.0;

/** The perimeter gate sits on the approach road this far in front of the portal (GPS arrival point). */
export const GATE_ALONG = -112;

/** Cargo lift: a kinematic platform that carries whoever stands on it between the service levels. */
export class Lift {
  levels: number[];
  y: number;
  target: number;
  speed: number;
  private body: RAPIER.RigidBody;
  private w: number; private d: number;
  private pos = new THREE.Vector3();
  moving = false;

  constructor(public node: THREE.Object3D, phys: PhysicsWorld, private game: Game) {
    const u = node.userData;
    this.levels = String(u.levels).split(',').map(Number);
    this.speed = u.speed ?? 2.5;
    this.w = u.w ?? 3.9; this.d = u.d ?? 3.4;
    this.y = this.target = node.position.y;
    this.body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const g = groups(GROUP.WORLD, 0xffff);
    const add = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
      phys.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(g), this.body);
    // glTF axes: Blender (x, y, z) -> (x, z, -y); the car is open toward +x
    add(this.w / 2, 0.08, this.d / 2, 0, -0.08, 0);
    add(this.w / 2, 0.55, 0.04, 0, 0.55, -this.d / 2);
    add(this.w / 2, 0.55, 0.04, 0, 0.55, this.d / 2);
    add(0.04, 0.55, this.d / 2, -this.w / 2, 0.55, 0);
    this.sync(true);
  }

  private sync(now = false) {
    this.node.updateWorldMatrix(true, false);
    this.node.matrixWorld.decompose(this.pos, _q, _s);
    if (now) { this.body.setTranslation(this.pos, true); this.body.setRotation(_q, true); }
    else { this.body.setNextKinematicTranslation(this.pos); this.body.setNextKinematicRotation(_q); }
  }

  goTo(level: number) {
    if (Math.abs(level - this.target) < 0.01) return;
    this.target = level;
    bus.emit('sfx', { id: 'toggle', node: this.node });
  }

  /** Next stop above / below the current position. */
  next(dir: 1 | -1) {
    const cur = this.moving ? this.target : this.y;
    const l = dir > 0 ? this.levels.find((v) => v > cur + 0.1) : [...this.levels].reverse().find((v) => v < cur - 0.1);
    if (l !== undefined) this.goTo(l);
  }

  contains(p: THREE.Vector3) {
    _v.copy(p);
    this.node.worldToLocal(_v);
    return Math.abs(_v.x) < this.w / 2 && Math.abs(_v.z) < this.d / 2 && _v.y > -0.3 && _v.y < 2.4;
  }

  fixedUpdate(dt: number) {
    const dy = clamp(this.target - this.y, -this.speed * dt, this.speed * dt);
    const was = this.moving;
    this.moving = Math.abs(dy) > 1e-5;
    if (was && !this.moving) bus.emit('sfx', { id: 'thud', node: this.node, gain: 0.6 });
    if (!this.moving) return;
    const pl = this.game.player;
    const riding = pl.mode === 'walk' && this.contains(pl.pos);
    this.y += dy;
    this.node.position.y = this.y;
    this.sync();
    if (riding) pl.pos.y += dy;
  }
}

const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _qw = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v2 = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1);

/**
 * The concealed facility in the mountain: places the Blender-built complex on the tunnel axis, wires its
 * doors, lights and navigation, and tells the rest of the game when the player is underground.
 */
export class NasaSite {
  id = 'nasa';
  root = new THREE.Group();
  complex!: Model;
  building!: Building;
  launch!: Model;
  launchB!: Building;
  gate!: Model;
  gateB!: Building;
  private booms: { node: THREE.Object3D; q0: THREE.Quaternion; angle: number; auto: number; t: number }[] = [];
  rocket!: Model;
  lift: Lift | null = null;
  /** 0 closed .. 1 open */
  siloOpen = 0;
  siloTarget = 0;
  armsRetract = 0;
  armsTarget = 0;
  private silo: { node: THREE.Object3D; x0: number; travel: number }[] = [];
  /** colliders of the shut silo cap (off while it is open or moving) */
  private siloCols: RAPIER.Collider[] = [];
  private arms: { node: THREE.Object3D; q0: THREE.Quaternion; angle: number }[] = [];
  private orbiters: { pivot: THREE.Object3D; a0: number; a1: number; period: number; base: number }[] = [];
  private liftLoop = 0;
  nav = new NavGraph();
  private sections: Section[] = [];
  private cullT = 0;
  private actorList: THREE.Vector3[] = [];
  /** extra door-opening actors (staff, crew) */
  actors: (() => THREE.Vector3[])[] = [];
  private inv = new THREE.Matrix4();

  constructor(private zone: EarthZone) {}

  async load() {
    const z = this.zone, g = z.game;
    this.root.name = 'nasa';
    this.root.position.set(NASA.portal.x, z.map.nasaY, NASA.portal.z);
    this.root.rotation.y = Math.atan2(-NASA.dir.x, -NASA.dir.z);
    z.root.add(this.root);
    this.complex = await assets.load('nasa_complex');
    this.root.add(this.complex.root);
    this.root.updateMatrixWorld(true);
    this.inv.copy(this.root.matrixWorld).invert();
    z.phys.addTrimesh(this.complex.colliders);
    this.building = new Building('nasa', this.complex, z.phys, g.interactions, z.lights, { lightsOn: true, actors: () => this.doorActors() });
    this.collectSections(this.complex);

    // ---- perimeter: checkpoint on the approach road and the fence line across the forecourt
    this.gate = await assets.load('nasa_gate');
    const gw = this.toWorld(0, 0, GATE_ALONG);
    this.gate.root.position.set(gw.x, z.map.height(gw.x, gw.z) + 0.02, gw.z);
    this.gate.root.rotation.y = this.root.rotation.y;
    const panel = this.gate.part('fence_panel')!;
    panel.removeFromParent();
    panel.position.set(0, 0, 0);
    z.root.add(this.gate.root);
    this.gate.root.updateMatrixWorld(true);
    z.phys.addTrimesh(this.gate.colliders);
    this.gateB = new Building('gate', this.gate, z.phys, g.interactions, z.lights, { lightsOn: true, actors: () => this.doorActors() });
    for (const m of this.gate.ofKind('boom')) this.booms.push({ node: m.node, q0: m.node.quaternion.clone(), angle: (m.data.angle * Math.PI) / 180, auto: m.data.auto, t: 0 });
    const items: [number, number, number][] = [];
    for (const side of [-1, 1]) {
      const line: [number, number][] = [[4.4 * side, GATE_ALONG], [46 * side, GATE_ALONG], [60 * side, -58], [54 * side, -6]];
      for (let i = 0; i < line.length - 1; i++) {
        const a = this.toWorld(line[i][0], 0, line[i][1], new THREE.Vector3()), b = this.toWorld(line[i + 1][0], 0, line[i + 1][1], new THREE.Vector3());
        const n = Math.max(1, Math.round(a.distanceTo(b) / 3));
        // a panel runs along its local +X; keep the barbed-wire outriggers on the outside of the compound
        const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
        for (let k = 0; k < n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n, zz = a.z + ((b.z - a.z) * k) / n;
          items.push(side > 0 ? [x, zz, yaw] : [x + (b.x - a.x) / n, zz + (b.z - a.z) / n, yaw + Math.PI]);
        }
      }
    }
    z.instanceProp(panel, items);

    // ---- launch complex and the vehicle standing in the silo
    this.launch = await assets.load('nasa_launch');
    this.root.add(this.launch.root);
    this.rocket = await assets.load('launch_vehicle');
    this.stack = new LaunchStack(this.rocket, z.lights);
    this.stack.root.position.set(0, ROCKET_BASE, -SILO_ALONG);
    this.root.add(this.stack.root);
    this.root.updateMatrixWorld(true);
    this.stackBase.copy(this.stack.root.position);
    z.phys.addTrimesh(this.launch.colliders);
    this.rocketColliders = z.phys.addTrimesh(this.rocket.colliders);
    // the silo mouth is an opening in the mountain top (the cap doors close it, not the ground)
    const mouth = this.toWorld(0, 0, SILO_ALONG, new THREE.Vector3());
    z.terrain.hole.set(mouth.x, mouth.z, 15.0, mouth.y + 40);
    // Ranger 1 stands on the payload adapter, rear docking face down, top toward the crew access arm
    const rm = await assets.load('ranger');
    this.ranger = new Spacecraft('ranger1', RANGER_SPEC, rm, z.phys, z.lights);
    z.root.add(this.ranger.root);
    this.stack.mount(this.ranger);
    this.ranger.setGear(false);
    this.ranger.gearT = 0;
    // solid for the crew walking the access arm to its top hatch (gear stowed inside the hull)
    this.ranger.setSolidForPeople(true, false);
    this.launchB = new Building('launch', this.launch, z.phys, g.interactions, z.lights, { lightsOn: true, actors: () => this.doorActors() });
    this.collectSections(this.launch);
    const I = g.interactions;
    for (const m of this.launch.markers) {
      const n = m.node, u = m.data;
      if (m.kind === 'lift') {
        this.lift = new Lift(n, z.phys, g);
        const lift = this.lift;
        for (const [dir, dy, word] of [[1, 1.45, 'up'], [-1, 1.12, 'down']] as [1 | -1, number, string][]) {
          I.add({
            position: (out) => out.set(-1.75, dy, -1.2).applyMatrix4(n.matrixWorld), radius: 0.16, range: 2.6,
            label: () => `Cargo lift — ${word}`, use: () => lift.next(dir),
          });
        }
      } else if (m.kind === 'liftcall') {
        I.node(n, 0.3, 'Call the cargo lift', () => this.lift?.goTo(Number(u.level)), { range: 2.6 });
      } else if (m.kind === 'silodoor') {
        this.silo.push({ node: n, x0: n.position.x, travel: u.travel });
      } else if (m.kind === 'swing') {
        this.arms.push({ node: n, q0: n.quaternion.clone(), angle: (u.angle * Math.PI) / 180 });
      } else if (m.kind === 'orbit') {
        const pivot = new THREE.Object3D();
        pivot.position.set(0, n.position.y, -SILO_ALONG);
        n.parent!.add(pivot);
        pivot.updateMatrixWorld(true);
        pivot.attach(n);
        this.orbiters.push({ pivot, a0: u.a0, a1: u.a1, period: u.period, base: 60 });
      } else if (m.kind === 'board') {
        I.node(n, 0.9, () => String(u.label ?? 'Board'), () => bus.emit('nasa:board', u), { range: 3.2 });
      }
    }
    // the silo cap is ground to walk on while it is shut (camouflaged doors with earth on top), and the concrete
    // collar round the opening is solid out to where the mountain top begins: without these, walking over the
    // mountain top dropped people 70 m down the shaft, or through slivers between the collar and the terrain
    for (const d of this.silo) {
      const meshes: THREE.Mesh[] = [];
      d.node.updateWorldMatrix(true, true);
      d.node.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      this.siloCols.push(...z.phys.addTrimesh(meshes));
    }
    if (this.silo.length) {
      const axis = this.silo[0].node.getWorldPosition(new THREE.Vector3());
      const ring = new THREE.Mesh(new THREE.RingGeometry(SHAFT_R, 18.6, 72, 1).rotateX(-Math.PI / 2));
      ring.position.set(axis.x, axis.y - 0.07, axis.z);
      ring.updateMatrixWorld(true);
      z.phys.addTrimesh([ring]);
    }
    const audio = g.services.audio;
    audio?.loop('pump', () => ({ level: this.lift?.moving && g.zone === z ? 0.5 : 0 }), () => this.lift?.node.getWorldPosition(_a) ?? null, { ref: 4 });
    this.buildNav(this.complex, this.launch);

    // ---- terminals, displays, people
    const TAB: Record<string, string> = { mission_decision: 'decision', mission: 'countdown', astro: 'wormhole', lab: 'environment', crew: 'crew', launch: 'countdown' };
    for (const m of [this.complex, this.launch]) for (const t of m.ofKind('terminal')) {
      I.node(t.node, 0.5, () => String(t.data.label ?? 'Terminal'), () => g.openPanel('mission', { tab: TAB[t.id] ?? 'countdown' }), { range: 2.8 });
    }
    this.screens = new NasaScreens(z, this);
    this.screens.build(this.complex, this.launch, this.gate);
    this.staff = new NasaStaff(z, this);
    await this.staff.load();
    z.nasaStaff = this.staff;
    bus.on('nasa:board', () => {
      if (mission.choice !== 'endurance') { ui.toast('Ranger 1 is sealed until the mission is authorised (briefing room, or ask Director Hale).', 'warn', 6); return; }
      bus.emit('launch:board');
    });
  }

  screens!: NasaScreens;
  staff!: NasaStaff;

  rocketColliders: RAPIER.Collider[] = [];
  stack!: LaunchStack;
  ranger!: Spacecraft;
  /** set once the stack has left the pad */
  flying = false;
  /** stack base position in the facility frame before lift-off */
  stackBase = new THREE.Vector3();
  rangerEnv: FlightEnv = {
    gravity: (_p, out) => out.set(0, -9.81, 0),
    density: (p) => airDensity(Math.max(0, p.y)),
    altitude: (p) => p.y - this.zone.map.nasaY,
  };

  /**
   * Fly the stack: height of the base above its pad position (m), downrange distance east (m), tilt from vertical
   * toward the east (rad) and the roll program (0..1: crew side turned from the access arm to face up-range).
   */
  placeStack(h: number, downrange: number, tilt: number, roll: number) {
    const yaw0 = this.root.rotation.y;
    _qw.setFromAxisAngle(_Z, -tilt).multiply(_q2.setFromAxisAngle(_Y, -yaw0 * roll)).multiply(this.root.quaternion);
    const base = this.toWorld(this.stackBase.x, this.stackBase.y, -this.stackBase.z, _v2);
    base.y += h;
    base.x += downrange;
    this.root.updateMatrixWorld(true);
    this.stack.root.position.copy(this.root.worldToLocal(base));
    this.stack.root.quaternion.copy(this.root.quaternion).invert().multiply(_qw);
    this.stack.root.updateMatrixWorld(true);
  }

  /** remove the vehicle's static collision once it starts to move */
  releaseStackColliders() { this.zone.phys.remove(this.rocketColliders); this.rocketColliders = []; }

  private doorActors() {
    const z = this.zone, L = this.actorList;
    L.length = 0;
    L.push(z.driving.vehicle ? z.driving.vehicle.position : z.game.player.pos);
    for (const f of this.actors) for (const p of f()) L.push(p);
    return L;
  }

  private collectSections(m: Model) {
    const map = new Map<string, Section>();
    m.root.traverse((o) => {
      const s = o.userData.section as string | undefined;
      if (!s || !(o as THREE.Mesh).isMesh && !o.children.length) return;
      if (o.parent && o.parent.userData.section === s) return; // primitives of a multi-material node
      let sec = map.get(s);
      if (!sec) { sec = { name: s, nodes: [], box: new THREE.Box3(), margin: BIG.has(s) ? 150 : 26 }; map.set(s, sec); this.sections.push(sec); }
      sec.nodes.push(o);
      sec.box.expandByObject(o);
    });
  }

  private buildNav(...models: Model[]) {
    const nav = this.nav;
    const pend: [string, string][] = [];
    for (const m of models) for (const mk of m.ofKind('nav')) {
      nav.add(mk.id, mk.node.getWorldPosition(new THREE.Vector3()));
      const links = mk.data.links as string | undefined;
      if (links) for (const l of links.split(',')) pend.push([mk.id, l.trim()]);
    }
    for (const [a, b] of pend) nav.link(a, b);
    // everything else in line of sight (doors are movable and do not block the test)
    const phys = this.zone.phys;
    nav.autoLink(11, (a, b) => {
      if (Math.abs(a.y - b.y) > 1.2) return false;
      _a.copy(a).setY(a.y + 1.1); _b.copy(b).setY(b.y + 1.1).sub(_a);
      const d = _b.length();
      const hit = phys.raycast(_a, _b.multiplyScalar(1 / d), d, groups(0xffff, GROUP.WORLD));
      return !hit;
    });
  }

  /** Facility-local coordinates of a world point: x = right of the axis, y = height above the floor, z = -along. */
  toLocal(p: THREE.Vector3Like, out = new THREE.Vector3()) { return out.set(p.x, p.y, p.z).applyMatrix4(this.inv); }
  /** World position of a facility-local point given as (lat, height, along). */
  toWorld(lat: number, h: number, along: number, out = new THREE.Vector3()) { return out.set(lat, h, -along).applyMatrix4(this.root.matrixWorld); }

  /** Name of the room the point is in, or null outside the facility. */
  area(p: THREE.Vector3Like): string | null {
    const l = this.toLocal(p, _v);
    const along = -l.z;
    if (l.y < -60 || l.y > 80) return null;
    for (const [name, x0, x1, a0, a1] of AREAS) if (l.x >= x0 && l.x <= x1 && along >= a0 && along <= a1) return name;
    return null;
  }

  fixedUpdate(dt: number) {
    this.lift?.fixedUpdate(dt);
    this.staff?.fixedUpdate(dt);
    // while the stack flies, the launch director places it and carries the Ranger itself (same step, no lag)
    if (!this.flying && this.ranger?.carried && this.stack.ranger === this.ranger) this.stack.carryRanger();
    this.ranger?.fixedUpdate(dt, this.rangerEnv);
  }

  update(dt: number) {
    this.building.update(dt);
    this.launchB.update(dt);
    this.stack.update(dt);
    this.ranger.update(dt, this.zone.game.alpha, Math.exp(-Math.max(0, this.ranger.root.position.y - this.zone.map.nasaY) / 7400));
    // silo cap, umbilical arms, the inspection arm on its wall rail
    if (this.siloOpen !== this.siloTarget) {
      this.siloOpen = clamp(this.siloOpen + Math.sign(this.siloTarget - this.siloOpen) * dt / 14, 0, 1);
      const e = this.siloOpen * this.siloOpen * (3 - 2 * this.siloOpen);
      for (const d of this.silo) d.node.position.x = d.x0 + d.travel * e;
      const shut = this.siloOpen < 0.01;
      for (const c of this.siloCols) if (c.isEnabled() !== shut) c.setEnabled(shut);
    }
    this.armsRetract = damp(this.armsRetract, this.armsTarget, 1.2, dt);
    for (const a of this.arms) a.node.quaternion.copy(a.q0).multiply(_q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a.angle * this.armsRetract));
    this.gateB.update(dt);
    this.staff?.update(dt);
    this.screens?.update(dt);
    for (const b of this.booms) {
      b.node.getWorldPosition(_a);
      let near = false;
      for (const p of this.doorActors()) if (Math.hypot(p.x - _a.x, p.z - _a.z) < b.auto) near = true;
      const t0 = b.t;
      b.t = clamp(b.t + (near ? dt : -dt) / 2.2, 0, 1);
      if (b.t !== t0) b.node.quaternion.copy(b.q0).multiply(_q.setFromAxisAngle(_s.set(0, 0, 1), b.angle * b.t * b.t * (3 - 2 * b.t)));
    }
    const t = this.zone.game.time;
    for (const o of this.orbiters) {
      const k = 0.5 - 0.5 * Math.cos((t / o.period) * Math.PI * 2);
      o.pivot.rotation.y = ((o.a0 + (o.a1 - o.a0) * k - o.base) * Math.PI) / 180;
    }
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.25;
      this.zone.game.renderer.camera.getWorldPosition(_v);
      for (const s of this.sections) {
        const vis = s.box.distanceToPoint(_v) < s.margin;
        for (const n of s.nodes) n.visible = vis;
      }
    }
  }

  serialize() { return { building: this.building.serialize(), lift: this.lift?.y ?? 0, staff: this.staff?.serialize() }; }
  deserialize(d: any) {
    this.building.deserialize(d?.building);
    this.staff?.deserialize(d?.staff);
    if (this.lift && typeof d?.lift === 'number') { this.lift.y = this.lift.target = d.lift; this.lift.node.position.y = d.lift; }
  }
}
