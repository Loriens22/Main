import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Frame } from './Frame';
import type { ModelInstance } from '../render/Assets';
import type { LightPool, LampSource } from '../render/LightPool';
import type { Interactable } from '../interact/Interaction';

export interface DoorRt {
  id: string;
  node: THREE.Object3D;
  kind: 'hinge' | 'roll' | 'slide';
  baseQ: THREE.Quaternion;
  basePos: THREE.Vector3;
  angle: number; // open angle (rad) or travel (m)
  open: boolean;
  t: number; // 0 closed .. 1 open
  speed: number;
  sound: 'wood' | 'hatch' | 'blast' | 'airlock' | 'car' | 'elevator';
  locked?: () => string | null; // returns reason when locked
  onChange?: (open: boolean) => void;
}

export interface LightGroup {
  name: string;
  on: boolean;
  sources: LampSource[];
  meshes: THREE.Mesh[];
  material: THREE.MeshStandardMaterial | null;
}

export interface SiteOptions {
  name: string;
  frame: Frame;
  parent: THREE.Object3D; // render parent: object whose space == frame local space
  placement: THREE.Matrix4; // model root → frame local
  lightPool?: LightPool;
  doorSound?: DoorRt['sound'];
  groupsOn?: string[]; // light groups initially on
  /** interaction handlers by interact type; return null to skip */
  handlers?: Record<string, (node: THREE.Object3D, site: Site) => Interactable | null>;
  colliders?: 'interior' | 'exterior' | 'all' | 'none';
}

/**
 * A placed interactive model (farmhouse, NASA complex, ship cabin, research base…):
 * colliders, animated doors, light groups & switches, rooms and generic interactables from GLB conventions.
 */
export class Site {
  readonly root: THREE.Object3D;
  readonly doors = new Map<string, DoorRt>();
  readonly groups = new Map<string, LightGroup>();
  readonly rooms: { name: string; box: THREE.Box3 }[] = [];
  readonly interactables: Interactable[] = [];
  private inv = new THREE.Matrix4();

  constructor(readonly game: Game, readonly inst: ModelInstance, readonly opts: SiteOptions) {
    this.root = inst.root;
    this.root.matrixAutoUpdate = true;
    opts.placement.decompose(this.root.position, this.root.quaternion, this.root.scale);
    opts.parent.add(this.root);
    this.root.updateMatrixWorld(true);
    this.inv.copy(opts.placement).invert();
    this.setup();
  }

  node(name: string) {
    return this.inst.nodes.get(name) ?? null;
  }

  /** frame-local matrix of a node */
  local(node: THREE.Object3D, out = new THREE.Matrix4()) {
    this.root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    return out.copy(this.opts.placement).multiply(rootInv.multiply(node.matrixWorld));
  }

  localPos(node: THREE.Object3D, out = new THREE.Vector3()) {
    const m = this.local(node);
    return out.setFromMatrixPosition(m);
  }

  private setup() {
    const { frame, lightPool } = this.opts;
    if ((this.opts.colliders ?? 'all') !== 'none') frame.physics.addModelColliders(this.inst, this.opts.placement, this.opts.colliders === undefined ? 'all' : (this.opts.colliders as any), { site: this.opts.name });
    // hide helper volumes
    this.root.traverse((o) => {
      if (o.name.startsWith('ROOM_') || o.name.endsWith('_hit') || o.name.startsWith('COL_')) {
        o.visible = false;
        o.castShadow = false;
      }
    });
    // rooms
    for (const [name, n] of this.inst.nodes) {
      if (!name.startsWith('ROOM_')) continue;
      const mesh = n as THREE.Mesh;
      if (!mesh.geometry) continue;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox!.clone().applyMatrix4(this.local(n));
      this.rooms.push({ name: n.userData.room ?? name.slice(5), box: b });
    }
    // light groups
    const on = new Set(this.opts.groupsOn ?? []);
    for (const [name, n] of this.inst.nodes) {
      if (n.userData.light && name.startsWith('light_')) {
        const g = this.group(n.userData.group ?? 'default', on);
        const color = new THREE.Color(n.userData.light === 'cool' ? 0xdfe8ff : n.userData.light === 'red' ? 0xff3020 : 0xffd9a8);
        const src: LampSource = {
          pos: () => n.getWorldPosition(new THREE.Vector3()),
          color,
          intensity: n.userData.intensity ?? 3,
          distance: n.userData.distance ?? 8,
          on: () => g.on,
        };
        g.sources.push(src);
        lightPool?.add(src);
      }
      if (n.userData.lampmesh) {
        const g = this.group(n.userData.group ?? 'default', on);
        n.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            if (!g.material) g.material = (m.material as THREE.MeshStandardMaterial).clone();
            m.material = g.material;
            g.meshes.push(m);
          }
        });
      }
    }
    for (const g of this.groups.values()) this.applyGroup(g);
    // interactables
    for (const n of this.inst.interactables) {
      const type = n.userData.interact as string;
      const custom = this.opts.handlers?.[type];
      if (custom) {
        const it = custom(n, this);
        if (it) this.register(it);
        continue;
      }
      if (type === 'door' || type === 'hatch' || type === 'rolldoor') this.registerDoor(n, type);
      else if (type === 'switch') this.registerSwitch(n);
    }
  }

  private group(name: string, on: Set<string>): LightGroup {
    let g = this.groups.get(name);
    if (!g) {
      g = { name, on: on.has(name) || on.has('*'), sources: [], meshes: [], material: null };
      this.groups.set(name, g);
    }
    return g;
  }

  private applyGroup(g: LightGroup) {
    if (g.material) {
      g.material.emissiveIntensity = g.on ? 6 : 0.02;
      g.material.color.setScalar(g.on ? 1 : 0.6);
    }
  }

  setGroup(name: string, on: boolean) {
    const g = this.groups.get(name);
    if (!g) return;
    g.on = on;
    this.applyGroup(g);
  }

  register(it: Interactable) {
    this.interactables.push(it);
    this.game.interaction.add(it);
    return it;
  }

  registerDoor(n: THREE.Object3D, type: string, opts: Partial<DoorRt> = {}) {
    const id = n.userData.iid ?? n.name;
    const d: DoorRt = {
      id,
      node: n,
      kind: type === 'rolldoor' ? 'roll' : opts.kind ?? 'hinge',
      baseQ: n.quaternion.clone(),
      basePos: n.position.clone(),
      angle: type === 'rolldoor' ? 3.9 : (n.userData.openAngle ?? 1.6),
      open: false,
      t: 0,
      speed: type === 'rolldoor' ? 0.35 : type === 'hatch' ? 0.6 : 1.4,
      sound: type === 'hatch' ? 'hatch' : type === 'rolldoor' ? 'blast' : this.opts.doorSound ?? 'wood',
      ...opts,
    };
    this.doors.set(id, d);
    this.register({
      id: `${this.opts.name}:${id}`,
      targets: [n],
      label: () => {
        const lk = d.locked?.();
        if (lk) return lk;
        return d.open ? 'Close' : type === 'hatch' ? 'Open hatch' : 'Open';
      },
      use: () => this.toggleDoor(id),
    });
    return d;
  }

  registerSwitch(n: THREE.Object3D) {
    const group = n.userData.group ?? (n.userData.iid ?? '').replace('light_', '');
    this.register({
      id: `${this.opts.name}:sw:${n.name}`,
      targets: [n],
      label: () => (this.groups.get(group)?.on ? 'Lights off' : 'Lights on'),
      use: () => {
        const g = this.groups.get(group);
        if (!g) return;
        this.setGroup(group, !g.on);
        this.game.audio.clank({ base: 900, gain: 0.05, decay: 0.05 });
      },
    });
  }

  toggleDoor(id: string, open?: boolean) {
    const d = this.doors.get(id);
    if (!d) return;
    const lk = d.locked?.();
    if (lk && !d.open) {
      this.game.notify(lk, 'warn', 2.5);
      return;
    }
    d.open = open ?? !d.open;
    const wp = d.node.getWorldPosition(new THREE.Vector3());
    this.game.audio.door(d.sound, wp);
    if (d.open) this.opts.frame.physics.setDoorOpen(id, true);
    d.onChange?.(d.open);
  }

  update(dt: number) {
    for (const d of this.doors.values()) {
      const target = d.open ? 1 : 0;
      if (d.t === target) continue;
      d.t = THREE.MathUtils.clamp(d.t + Math.sign(target - d.t) * d.speed * dt, 0, 1);
      const e = d.t * d.t * (3 - 2 * d.t);
      if (d.kind === 'hinge') {
        d.node.quaternion.copy(d.baseQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.angle * e));
      } else if (d.kind === 'roll' || d.kind === 'slide') {
        const axis = d.kind === 'roll' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        d.node.position.copy(d.basePos).add(axis.applyQuaternion(d.baseQ).multiplyScalar(d.angle * e));
      }
      if (!d.open && d.t === 0) this.opts.frame.physics.setDoorOpen(d.id, false);
    }
  }

  roomAt(local: THREE.Vector3): string | null {
    for (const r of this.rooms) if (r.box.containsPoint(local)) return r.name;
    return null;
  }

  dispose() {
    for (const it of this.interactables) this.game.interaction.remove(it.id);
    for (const g of this.groups.values()) for (const s of g.sources) this.opts.lightPool?.remove(s);
    this.root.removeFromParent();
  }
}
