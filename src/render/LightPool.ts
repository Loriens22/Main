import * as THREE from 'three';
import { damp } from '../core/math';

/** Conversion from authored fixture power (roughly candela) to renderer intensity under this game's exposure scale. */
export const LIGHT_SCALE = 0.12;

export interface Fixture {
  /** world-space position; if `node` is set it is refreshed from the node every frame */
  pos: THREE.Vector3;
  node?: THREE.Object3D;
  color: THREE.Color;
  /** authored power */
  power: number;
  dist: number;
  on: boolean;
  room?: string;
  group?: string;
  spot?: boolean;
  /** for spots: world direction (refreshed from the node's authored light axis if a node is set) */
  dir?: THREE.Vector3;
  angle?: number;
  /** optional emissive mesh that glows while the fixture is on */
  glow?: THREE.Mesh;
  /** multiplier applied on top (flicker, dimming) */
  level: number;
  _light?: THREE.PointLight | THREE.SpotLight;
  _fade?: number;
}

/**
 * Many authored light fixtures, few real lights: a fixed pool of point and spot lights is assigned every
 * frame to the fixtures that matter most to the camera. The pool size never changes, so shaders are
 * compiled once, and assignments fade to avoid popping.
 */
export class LightPool {
  private fixtures = new Set<Fixture>();
  private points: THREE.PointLight[] = [];
  private spots: THREE.SpotLight[] = [];
  private owner = new Map<THREE.Light, Fixture | null>();
  group = new THREE.Group();

  constructor(parent: THREE.Object3D, nPoint = 8, nSpot = 3) {
    this.group.name = 'light-pool';
    for (let i = 0; i < nPoint; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      this.points.push(l);
      this.owner.set(l, null);
      this.group.add(l);
    }
    for (let i = 0; i < nSpot; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 60, 0.5, 0.6, 2);
      l.castShadow = false;
      this.spots.push(l);
      this.owner.set(l, null);
      this.group.add(l, l.target);
    }
    parent.add(this.group);
  }

  add(f: Partial<Fixture> & { power: number }): Fixture {
    const fx: Fixture = { pos: new THREE.Vector3(), color: new THREE.Color(1, 0.9, 0.75), dist: 8, on: true, level: 1, ...f } as Fixture;
    this.fixtures.add(fx);
    return fx;
  }

  remove(f: Fixture) {
    this.fixtures.delete(f);
    for (const [l, o] of this.owner) if (o === f) { this.owner.set(l, null); l.intensity = 0; }
  }

  /** Fixtures created from a model's light markers (see bl.light / marker('light', ...)). */
  addFromMarker(node: THREE.Object3D, data: Record<string, any>, on = true): Fixture {
    const c = data.color as number[] | undefined;
    return this.add({
      node, power: data.power ?? 40, dist: data.dist ?? 8, on, room: data.room, group: data.group,
      spot: data.light === 'spot', angle: data.angle ?? 0.55, dir: new THREE.Vector3(0, 0, -1),
      color: c ? new THREE.Color(c[0], c[1], c[2]) : new THREE.Color(1, 0.9, 0.75),
    });
  }

  setRoom(room: string, on: boolean, group?: string) {
    for (const f of this.fixtures) if (f.room === room && (!group || f.group === group)) f.on = on;
  }

  roomOn(room: string, group?: string) {
    for (const f of this.fixtures) if (f.room === room && (!group || f.group === group)) return f.on;
    return false;
  }

  byRoom(room: string) { return [...this.fixtures].filter((f) => f.room === room); }
  all() { return this.fixtures; }

  private assign(lights: THREE.Light[], wanted: Fixture[]) {
    const want = new Set(wanted);
    // release lights whose fixture is no longer wanted (after it has faded out)
    for (const l of lights) {
      const o = this.owner.get(l);
      if (o && !want.has(o) && (o._fade ?? 0) <= 0.01) { o._light = undefined; this.owner.set(l, null); }
    }
    for (const f of wanted) {
      if (f._light) continue;
      const free = lights.find((l) => !this.owner.get(l));
      if (!free) break;
      this.owner.set(free, f);
      f._light = free as any;
      f._fade = 0;
    }
  }

  update(cam: THREE.Vector3, dt: number) {
    const pts: Fixture[] = [], sps: Fixture[] = [];
    for (const f of this.fixtures) {
      if (f.node) {
        f.node.getWorldPosition(f.pos);
        // spots are authored as Blender lights (shining along local -Z); after the glTF Y-up conversion that
        // axis is the node's local -Y
        if (f.spot && f.dir) f.dir.set(0, -1, 0).transformDirection(f.node.matrixWorld);
      }
      if (f.glow) {
        const m = f.glow.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = damp(m.emissiveIntensity, f.on ? 7 * f.level : 0, 14, dt);
      }
      if (!f.on) continue;
      const d = f.pos.distanceTo(cam);
      if (d > f.dist * 4 + 40) continue;
      (f as any)._score = d / (f.dist * Math.sqrt(f.power));
      (f.spot ? sps : pts).push(f);
    }
    pts.sort((a, b) => (a as any)._score - (b as any)._score);
    sps.sort((a, b) => (a as any)._score - (b as any)._score);
    this.assign(this.points, pts.slice(0, this.points.length));
    this.assign(this.spots, sps.slice(0, this.spots.length));
    const wantP = new Set(pts.slice(0, this.points.length)), wantS = new Set(sps.slice(0, this.spots.length));
    for (const [l, f] of this.owner) {
      if (!f) { l.intensity = 0; continue; }
      const active = f.on && (wantP.has(f) || wantS.has(f));
      f._fade = damp(f._fade ?? 0, active ? 1 : 0, active ? 7 : 10, dt);
      l.position.copy(f.pos);
      l.color.copy(f.color);
      l.intensity = f.power * LIGHT_SCALE * f.level * f._fade * ((l as THREE.SpotLight).isSpotLight ? 2.2 : 1);
      (l as THREE.PointLight).distance = f.dist;
      if ((l as THREE.SpotLight).isSpotLight && f.dir) {
        const s = l as THREE.SpotLight;
        s.angle = f.angle ?? 0.55;
        s.target.position.copy(f.pos).addScaledVector(f.dir, 10);
        s.target.updateMatrixWorld();
      }
    }
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.fixtures.clear();
  }
}
