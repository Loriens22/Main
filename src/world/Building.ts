import * as THREE from 'three';
import { Model } from '../render/Assets';
import { Fixture, LightPool } from '../render/LightPool';
import { GROUP, groups, PhysicsWorld, RAPIER } from '../physics/Physics';
import { Interactable, Interactions } from '../player/Interaction';
import { bus } from '../core/events';
import { damp } from '../core/math';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Vector3();

/** A hinged door leaf authored in Blender (userData: angle, w, h, t, label, locked). */
export class Door {
  open = false;
  t = 0;
  locked = false;
  private q0 = new THREE.Quaternion();
  private body: RAPIER.RigidBody | null = null;
  private w: number; private h: number; private th: number;
  angle: number;
  label: string;
  interactable: Interactable;
  speed = 2.4;

  constructor(public id: string, public node: THREE.Object3D, private phys: PhysicsWorld | null, interactions: Interactions) {
    const u = node.userData;
    this.angle = ((u.angle ?? 90) * Math.PI) / 180;
    this.w = u.w ?? 0.85; this.h = u.h ?? 2.0; this.th = u.t ?? 0.05;
    this.label = u.label ?? 'Door';
    this.locked = !!u.locked;
    this.q0.copy(node.quaternion);
    if (phys) {
      this.body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      phys.world.createCollider(RAPIER.ColliderDesc.cuboid(this.w / 2, this.h / 2, this.th / 2 + 0.015).setCollisionGroups(groups(GROUP.WORLD, 0xffff)), this.body);
      this.syncBody(true);
    }
    this.interactable = interactions.add({
      position: (out) => { out.set(this.w / 2, this.h * 0.48, 0); return this.node.localToWorld(out); },
      radius: 0.55,
      range: 2.4,
      label: () => (this.locked ? `${this.label} (locked)` : `${this.open ? 'Close' : 'Open'} ${this.label.toLowerCase()}`),
      use: () => this.toggle(),
    });
  }

  toggle() {
    if (this.locked) { bus.emit('sfx', { id: 'door_locked', node: this.node }); return; }
    this.setOpen(!this.open);
  }

  setOpen(v: boolean) {
    if (v === this.open) return;
    this.open = v;
    bus.emit('sfx', { id: v ? 'door_open' : 'door_close', node: this.node });
  }

  private syncBody(now = false) {
    if (!this.body) return;
    this.node.updateWorldMatrix(true, false);
    this.node.matrixWorld.decompose(_p, _q, _s);
    _c.set(this.w / 2, this.h / 2, 0).applyMatrix4(this.node.matrixWorld);
    if (now) { this.body.setTranslation(_c, true); this.body.setRotation(_q, true); }
    else { this.body.setNextKinematicTranslation(_c); this.body.setNextKinematicRotation(_q); }
  }

  update(dt: number) {
    const target = this.open ? 1 : 0;
    if (this.t === target) return;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * this.speed);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.node.quaternion.copy(this.q0).multiply(_q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.angle * e));
    this.syncBody();
    if (this.t === 0) bus.emit('sfx', { id: 'door_latch', node: this.node });
  }
}

/** Sliding sash (userData.travel metres along local +Y). */
export class Sash {
  open = false;
  t = 0;
  private y0: number;
  private travel: number;
  constructor(public id: string, public node: THREE.Object3D, interactions: Interactions) {
    this.y0 = node.position.y;
    this.travel = node.userData.travel ?? 0.6;
    interactions.add({
      position: (out) => { out.set(0, 0.35, 0); return node.localToWorld(out); },
      radius: 0.42,
      range: 2.0,
      label: () => (this.open ? 'Close window' : 'Open window'),
      use: () => { this.open = !this.open; bus.emit('sfx', { id: 'window', node }); bus.emit('window', { id, open: this.open }); },
    });
  }
  update(dt: number) {
    const target = this.open ? 1 : 0;
    if (this.t === target) return;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 1.6);
    // sashes are upright, so their own up axis is the parent's +Y
    this.node.position.y = this.y0 + this.travel * this.t;
  }
}

/**
 * Sliding door or blast door leaf (userData: travel along local +X, w, h, t, auto radius, time, sound).
 * With `auto` it opens for anyone who comes near; otherwise it is operated by hand.
 */
export class SlideDoor {
  open = false;
  t = 0;
  private p0 = new THREE.Vector3();
  private axis = new THREE.Vector3(1, 0, 0);
  private centre = new THREE.Vector3();
  private body: RAPIER.RigidBody | null = null;
  private w: number; private h: number; private th: number;
  private travel: number; private time: number; auto: number; private sound: string;
  private hold = 0;
  label: string;
  /** set false to keep the door shut regardless of who is near (lock-down) */
  enabled = true;

  constructor(public id: string, public node: THREE.Object3D, phys: PhysicsWorld | null, interactions: Interactions, private actors: (() => THREE.Vector3[]) | null) {
    const u = node.userData;
    this.w = u.w ?? 1; this.h = u.h ?? 2.2; this.th = u.t ?? 0.08;
    this.travel = u.travel ?? this.w; this.time = u.time ?? 1.2; this.auto = u.auto ?? 0; this.sound = u.sound ?? 'door_slide';
    this.label = u.label ?? 'Door';
    this.p0.copy(node.position);
    this.axis.applyQuaternion(node.quaternion);
    node.updateWorldMatrix(true, false);
    this.centre.set(0, this.h / 2, 0).applyMatrix4(node.matrixWorld);
    if (phys) {
      this.body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      phys.world.createCollider(RAPIER.ColliderDesc.cuboid(this.w / 2, this.h / 2, this.th / 2 + 0.02).setCollisionGroups(groups(GROUP.WORLD, 0xffff)), this.body);
      this.sync(true);
    }
    if (!this.auto) {
      interactions.add({
        position: (out) => out.copy(this.centre), radius: 0.8, range: 3,
        label: () => `${this.open ? 'Close' : 'Open'} ${this.label.toLowerCase()}`,
        use: () => this.setOpen(!this.open),
      });
    }
  }

  setOpen(v: boolean) {
    if (v === this.open) return;
    this.open = v;
    bus.emit('sfx', { id: this.sound, pos: this.centre, gain: this.sound === 'blast' ? 1 : 0.7 });
  }

  private sync(now = false) {
    if (!this.body) return;
    this.node.updateWorldMatrix(true, false);
    this.node.matrixWorld.decompose(_p, _q, _s);
    _c.set(0, this.h / 2, 0).applyMatrix4(this.node.matrixWorld);
    if (now) { this.body.setTranslation(_c, true); this.body.setRotation(_q, true); }
    else { this.body.setNextKinematicTranslation(_c); this.body.setNextKinematicRotation(_q); }
  }

  update(dt: number) {
    if (this.auto && this.actors) {
      let near = false;
      if (this.enabled) for (const a of this.actors()) {
        const dx = a.x - this.centre.x, dy = a.y - this.centre.y, dz = a.z - this.centre.z;
        const r = this.open ? this.auto + 1.2 : this.auto;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < this.h + 2) { near = true; break; }
      }
      if (near) { this.hold = 1.2; this.setOpen(true); }
      else { this.hold -= dt; if (this.hold <= 0) this.setOpen(false); }
    }
    const target = this.open ? 1 : 0;
    if (this.t === target) return;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt / this.time);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.node.position.copy(this.p0).addScaledVector(this.axis, this.travel * e);
    this.sync();
  }
}

/**
 * Brings a Blender-authored building to life: doors, sash windows, light switches and fixtures, ceiling fans.
 * Everything is discovered from the custom properties exported with the model.
 */
export class Building {
  doors = new Map<string, Door>();
  slides = new Map<string, SlideDoor>();
  sashes = new Map<string, Sash>();
  fixtures: Fixture[] = [];
  private spinners: { node: THREE.Object3D; speed: number; cur: number; on: boolean; axis: THREE.Vector3 }[] = [];
  private glowGeo = new THREE.SphereGeometry(0.045, 10, 8);

  constructor(public name: string, public model: Model, phys: PhysicsWorld | null, private interactions: Interactions, private lights: LightPool, opts: { lightsOn?: boolean; actors?: () => THREE.Vector3[] } = {}) {
    for (const m of model.markers) {
      const n = m.node;
      if (m.kind === 'door') this.doors.set(m.id, new Door(m.id, n, phys, interactions));
      else if (m.kind === 'slide') this.slides.set(m.id, new SlideDoor(m.id, n, phys, interactions, opts.actors ?? null));
      else if (m.kind === 'window') this.sashes.set(m.id, new Sash(m.id, n, interactions));
      else if (m.kind === 'light') {
        const f = lights.addFromMarker(n, m.data, opts.lightsOn ?? false);
        f.group = f.group ?? name;
        // fixtures with baked light carry their own emissive geometry
        if (!f.spot && m.data.bake === undefined) {
          const mat = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: f.color.clone(), emissiveIntensity: 0, roughness: 0.4 });
          const g = new THREE.Mesh(this.glowGeo, mat);
          n.add(g);
          f.glow = g;
        }
        this.fixtures.push(f);
      } else if (m.kind === 'switch') {
        const room = m.data.room as string;
        interactions.add({
          position: (out) => n.getWorldPosition(out),
          radius: 0.2,
          range: 2.0,
          label: () => `${m.data.label ?? 'Lights'} — ${lights.roomOn(room, name) ? 'off' : 'on'}`,
          use: () => {
            const on = !lights.roomOn(room, name);
            lights.setRoom(room, on, name);
            bus.emit('sfx', { id: 'switch', node: n });
            bus.emit('lights', { building: name, room, on });
          },
        });
      } else if (m.kind === 'fan') {
        const sp = { node: n, speed: 5.5, cur: 0, on: false, axis: new THREE.Vector3(0, 1, 0) };
        this.spinners.push(sp);
        interactions.add({
          position: (out) => n.getWorldPosition(out),
          radius: 0.5,
          range: 3.0,
          label: () => (sp.on ? 'Stop ceiling fan' : 'Start ceiling fan'),
          use: () => { sp.on = !sp.on; bus.emit('sfx', { id: 'switch', node: n }); },
        });
      }
    }
  }

  door(id: string) { return this.doors.get(id); }

  update(dt: number) {
    for (const d of this.doors.values()) d.update(dt);
    for (const d of this.slides.values()) d.update(dt);
    for (const s of this.sashes.values()) s.update(dt);
    for (const sp of this.spinners) {
      sp.cur = damp(sp.cur, sp.on ? sp.speed : 0, 0.8, dt);
      if (sp.cur > 0.001) sp.node.rotateOnAxis(sp.axis, sp.cur * dt);
    }
  }

  /** True if any window sash is open (dust gets in during storms). */
  anyWindowOpen() { for (const s of this.sashes.values()) if (s.open) return true; return false; }

  serialize() {
    const rooms: Record<string, boolean> = {};
    for (const f of this.fixtures) if (f.room) rooms[f.room] = f.on;
    return {
      doors: Object.fromEntries([...this.doors].map(([k, d]) => [k, d.open])),
      sashes: Object.fromEntries([...this.sashes].map(([k, s]) => [k, s.open])),
      rooms,
      fans: this.spinners.map((s) => s.on),
    };
  }

  deserialize(d: any) {
    if (!d) return;
    for (const [k, v] of Object.entries(d.doors || {})) { const door = this.doors.get(k); if (door) { door.open = !!v; door.t = v ? 0.999 : 0.001; } }
    for (const [k, v] of Object.entries(d.sashes || {})) { const s = this.sashes.get(k); if (s) { s.open = !!v; s.t = v ? 0.999 : 0.001; } }
    for (const [room, on] of Object.entries(d.rooms || {})) this.lights.setRoom(room, !!on, this.name);
    (d.fans || []).forEach((on: boolean, i: number) => { if (this.spinners[i]) this.spinners[i].on = on; });
  }
}
